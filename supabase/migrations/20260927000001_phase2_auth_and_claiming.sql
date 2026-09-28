-- ==============================================================================
-- HAPPY-TREE: FASE 2 - AUTENTICACIÓN, PERFILES Y CLAIMING ATÓMICO
-- ==============================================================================

-- 1. TABLA: PROFILES
-- Vinculación 1:1 entre cuentas de autenticación (auth.users) y fichas genealógicas (persons)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
    is_user_zero BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT unique_profile_person UNIQUE (person_id)
);

-- 2. TABLA: ENDORSEMENTS (Modelo de Confianza)
-- Reconocimientos cruzados entre familiares para desbloquear permisos de invitación
CREATE TABLE IF NOT EXISTS public.endorsements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endorser_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    endorsed_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    CONSTRAINT check_cannot_endorse_self CHECK (endorser_id <> endorsed_id),
    CONSTRAINT unique_endorsement_pair UNIQUE (endorser_id, endorsed_id)
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_profiles_person ON public.profiles(person_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_endorsed ON public.endorsements(endorsed_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_endorser ON public.endorsements(endorser_id);

-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endorsements ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura
CREATE POLICY "Lectura de perfiles para usuarios autenticados"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Permitir lectura anónima de conteo para saber si existe el Usuario Cero
CREATE POLICY "Permitir verificación anónima de existencia de Usuario Cero"
ON public.profiles FOR SELECT
TO anon
USING (true);

CREATE POLICY "Lectura de reconocimientos para autenticados"
ON public.endorsements FOR SELECT
TO authenticated
USING (true);

-- ==============================================================================
-- 4. FUNCIÓN RPC: BOOTSTRAP DEL USUARIO CERO
-- Permite únicamente al primer usuario del sistema crear su perfil raíz fundador
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_user_zero(
    p_user_id UUID,
    p_first_name TEXT,
    p_last_name TEXT,
    p_gender gender_enum DEFAULT 'unknown',
    p_birth_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_zero_count INT;
    v_person_id UUID;
BEGIN
    -- 1. Validar que no exista ya un Usuario Cero configurado
    SELECT COUNT(*) INTO v_user_zero_count FROM public.profiles WHERE is_user_zero = true;
    IF v_user_zero_count > 0 THEN
        RAISE EXCEPTION 'El Usuario Cero ya ha sido inicializado. No se permiten registros directos adicionales.';
    END IF;

    -- 2. Crear la primera ficha genealógica personal (marcada como reclamada)
    INSERT INTO public.persons (
        first_name,
        last_name,
        gender,
        birth_date,
        is_living,
        is_claimed,
        claimed_by_user_id,
        claimed_at,
        created_by_user_id
    ) VALUES (
        p_first_name,
        p_last_name,
        p_gender,
        p_birth_date,
        true,
        true,
        p_user_id,
        now(),
        p_user_id
    )
    RETURNING id INTO v_person_id;

    -- 3. Crear el perfil de usuario con permisos de Usuario Cero
    INSERT INTO public.profiles (
        id,
        person_id,
        is_user_zero
    ) VALUES (
        p_user_id,
        v_person_id,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        person_id = v_person_id,
        is_user_zero = true,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'person_id', v_person_id,
        'is_user_zero', true,
        'message', 'Usuario Cero inicializado con éxito.'
    );
END;
$$;

-- ==============================================================================
-- 5. FUNCIÓN RPC: RECLAMACIÓN ATÓMICA DE PERFIL (CLAIMING PATTERN)
-- Valida el token de invitación criptográfico, reclama el nodo y quema el token
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.claim_person_profile(
    p_token TEXT,
    p_user_id UUID,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation RECORD;
    v_person RECORD;
    v_inviter_person_id UUID;
BEGIN
    -- 1. Buscar el token de invitación
    SELECT * INTO v_invitation 
    FROM public.invitation_tokens 
    WHERE token = p_token;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El enlace de invitación no es válido o no existe.';
    END IF;

    IF v_invitation.status <> 'pending' THEN
        RAISE EXCEPTION 'Esta invitación ya ha sido utilizada o revocada previamente.';
    END IF;

    IF v_invitation.expires_at < now() THEN
        UPDATE public.invitation_tokens SET status = 'expired' WHERE id = v_invitation.id;
        RAISE EXCEPTION 'Esta invitación ha expirado.';
    END IF;

    -- 2. Verificar que la ficha genealógica no esté ya reclamada
    SELECT * INTO v_person 
    FROM public.persons 
    WHERE id = v_invitation.person_id;

    IF v_person.is_claimed THEN
        RAISE EXCEPTION 'Este perfil familiar ya fue reclamado por otro usuario.';
    END IF;

    -- 3. Verificar que el usuario no tenga ya otro perfil reclamado
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND person_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Tu cuenta ya tiene un perfil genealógico asignado.';
    END IF;

    -- 4. Actualizar la ficha genealógica a estado reclamado
    UPDATE public.persons
    SET 
        first_name = COALESCE(NULLIF(p_first_name, ''), first_name),
        last_name = COALESCE(NULLIF(p_last_name, ''), last_name),
        is_claimed = true,
        claimed_by_user_id = p_user_id,
        claimed_at = now(),
        updated_at = now()
    WHERE id = v_person.id;

    -- 5. Marcar el token como aceptado y consumido
    UPDATE public.invitation_tokens
    SET 
        status = 'accepted',
        used_at = now()
    WHERE id = v_invitation.id;

    -- 6. Crear o actualizar el perfil del usuario autenticado
    INSERT INTO public.profiles (
        id,
        person_id,
        is_user_zero
    ) VALUES (
        p_user_id,
        v_person.id,
        false
    )
    ON CONFLICT (id) DO UPDATE SET
        person_id = v_person.id,
        updated_at = now();

    -- 7. Registrar el primer endoso/reconocimiento mutuo implícito del invitador hacia el invitado
    SELECT person_id INTO v_inviter_person_id 
    FROM public.profiles 
    WHERE id = v_invitation.invited_by_user_id;

    IF v_inviter_person_id IS NOT NULL AND v_inviter_person_id <> v_person.id THEN
        INSERT INTO public.endorsements (
            endorser_id,
            endorsed_id,
            notes
        ) VALUES (
            v_inviter_person_id,
            v_person.id,
            'Reconocimiento inicial por invitación aceptada'
        )
        ON CONFLICT (endorser_id, endorsed_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'person_id', v_person.id,
        'message', 'Perfil reclamado exitosamente.'
    );
END;
$$;

-- ==============================================================================
-- 6. FUNCIÓN DE CONSULTA: VERIFICAR SI UN USUARIO PUEDE INVITAR
-- Un usuario puede invitar si es el Usuario Cero O si tiene al menos 3 reconocimientos
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_user_can_invite(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile RECORD;
    v_endorsement_count INT;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('can_invite', false, 'reason', 'Perfil no encontrado', 'endorsements', 0);
    END IF;

    -- El Usuario Cero siempre tiene permiso para invitar
    IF v_profile.is_user_zero THEN
        RETURN jsonb_build_object('can_invite', true, 'is_user_zero', true, 'endorsements', 999);
    END IF;

    -- Contar reconocimientos recibidos
    SELECT COUNT(*) INTO v_endorsement_count 
    FROM public.endorsements 
    WHERE endorsed_id = v_profile.person_id;

    IF v_endorsement_count >= 3 THEN
        RETURN jsonb_build_object('can_invite', true, 'is_user_zero', false, 'endorsements', v_endorsement_count);
    ELSE
        RETURN jsonb_build_object(
            'can_invite', false, 
            'is_user_zero', false, 
            'endorsements', v_endorsement_count,
            'needed', 3 - v_endorsement_count
        );
    END IF;
END;
$$;
