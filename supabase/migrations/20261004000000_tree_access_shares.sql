-- ==============================================================================
-- Migración: Red de Amigos y Niveles de Permisos Granulares de Árbol
-- Permite que personas ajenas a la familia soliciten acceso al árbol genealógico,
-- y que el propietario conceda niveles: Básico (Casa), Intermedio o Avanzado.
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tree_permission_tier') THEN
        CREATE TYPE tree_permission_tier AS ENUM ('basic', 'intermediate', 'advanced');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tree_access_status') THEN
        CREATE TYPE tree_access_status AS ENUM ('pending', 'approved', 'rejected', 'revoked');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tree_access_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- El usuario titular del árbol que concede el acceso
    granter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    granter_person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    
    -- El amigo o usuario externo que solicita o recibe permiso de visualización
    requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    requester_person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
    
    -- Nivel de acceso otorgado:
    -- 'basic': solo familia de casa (padres, hijos, hermanos, pareja)
    -- 'intermediate': familia extendida (abuelos, tíos, primos, sobrinos, nietos)
    -- 'advanced': árbol total sin restricción generacional
    tier tree_permission_tier NOT NULL DEFAULT 'basic',
    
    -- Estado de la solicitud
    status tree_access_status NOT NULL DEFAULT 'pending',
    
    -- Mensaje de presentación / motivo de la solicitud
    request_message TEXT,
    
    -- Tiempos de auditoría
    requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    
    CONSTRAINT unique_granter_requester UNIQUE (granter_user_id, requester_user_id),
    CONSTRAINT cannot_share_with_self CHECK (granter_user_id <> requester_user_id)
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_tree_shares_granter ON public.tree_access_shares (granter_user_id, status);
CREATE INDEX IF NOT EXISTS idx_tree_shares_requester ON public.tree_access_shares (requester_user_id, status);

-- Habilitar RLS
ALTER TABLE public.tree_access_shares ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "Los usuarios pueden ver sus solicitudes enviadas o recibidas" ON public.tree_access_shares;
CREATE POLICY "Los usuarios pueden ver sus solicitudes enviadas o recibidas"
ON public.tree_access_shares FOR SELECT
TO authenticated
USING (
    auth.uid() = granter_user_id OR auth.uid() = requester_user_id
);

DROP POLICY IF EXISTS "Los usuarios pueden crear solicitudes de acceso" ON public.tree_access_shares;
CREATE POLICY "Los usuarios pueden crear solicitudes de acceso"
ON public.tree_access_shares FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = requester_user_id
);

DROP POLICY IF EXISTS "Los usuarios pueden responder o actualizar solicitudes" ON public.tree_access_shares;
CREATE POLICY "Los usuarios pueden responder o actualizar solicitudes"
ON public.tree_access_shares FOR UPDATE
TO authenticated
USING (
    auth.uid() = granter_user_id OR auth.uid() = requester_user_id
)
WITH CHECK (
    auth.uid() = granter_user_id OR auth.uid() = requester_user_id
);

DROP POLICY IF EXISTS "Los usuarios pueden cancelar o eliminar vínculos de acceso" ON public.tree_access_shares;
CREATE POLICY "Los usuarios pueden cancelar o eliminar vínculos de acceso"
ON public.tree_access_shares FOR DELETE
TO authenticated
USING (
    auth.uid() = granter_user_id OR auth.uid() = requester_user_id
);

-- ==============================================================================
-- RPC: Búsqueda segura de usuarios para solicitar acceso al árbol
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.search_users_for_tree_access(p_search_term TEXT)
RETURNS TABLE (
    user_id UUID,
    person_id UUID,
    full_name TEXT,
    email TEXT,
    already_requested BOOLEAN,
    existing_status TEXT,
    existing_tier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_clean_search TEXT := lower(trim(p_search_term));
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    RETURN QUERY
    SELECT 
        u.id AS user_id,
        pr.person_id,
        concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.maternal_last_name) AS full_name,
        u.email::TEXT AS email,
        (s.id IS NOT NULL) AS already_requested,
        s.status::TEXT AS existing_status,
        s.tier::TEXT AS existing_tier
    FROM auth.users u
    JOIN public.profiles pr ON pr.id = u.id
    JOIN public.persons p ON p.id = pr.person_id
    LEFT JOIN public.tree_access_shares s 
        ON s.granter_user_id = u.id AND s.requester_user_id = v_caller_id
    WHERE u.id <> v_caller_id
      AND (
          v_clean_search = '' 
          OR lower(u.email) LIKE '%' || v_clean_search || '%'
          OR lower(p.first_name) LIKE '%' || v_clean_search || '%'
          OR lower(p.last_name) LIKE '%' || v_clean_search || '%'
          OR lower(concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.maternal_last_name)) LIKE '%' || v_clean_search || '%'
      )
    ORDER BY p.first_name ASC
    LIMIT 20;
END;
$$;

-- ==============================================================================
-- RPC: Enviar o renovar solicitud de acceso a un árbol
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.request_tree_access(
    p_target_user_id UUID,
    p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_profile RECORD;
    v_target_profile RECORD;
    v_existing RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autenticado.');
    END IF;

    IF v_caller_id = p_target_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'No puedes solicitar acceso a tu propio árbol.');
    END IF;

    -- Validar que ambos tengan perfil y ficha activa
    SELECT * INTO v_caller_profile FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_profile.person_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debes tener una ficha personal activa en el sistema.');
    END IF;

    SELECT * INTO v_target_profile FROM public.profiles WHERE id = p_target_user_id;
    IF v_target_profile.person_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El usuario destinatario no tiene un árbol activo.');
    END IF;

    -- Buscar solicitud existente
    SELECT * INTO v_existing FROM public.tree_access_shares
    WHERE granter_user_id = p_target_user_id AND requester_user_id = v_caller_id;

    IF FOUND THEN
        IF v_existing.status = 'approved' THEN
            RETURN jsonb_build_object('success', true, 'message', 'Ya tienes acceso aprobado al árbol de este usuario.', 'tier', v_existing.tier);
        END IF;

        -- Actualizar solicitud existente a 'pending'
        UPDATE public.tree_access_shares
        SET status = 'pending',
            request_message = p_message,
            requested_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        WHERE id = v_existing.id;

        RETURN jsonb_build_object('success', true, 'message', 'Solicitud reenviada correctamente.');
    ELSE
        -- Insertar nueva solicitud
        INSERT INTO public.tree_access_shares (
            granter_user_id,
            granter_person_id,
            requester_user_id,
            requester_person_id,
            tier,
            status,
            request_message
        ) VALUES (
            p_target_user_id,
            v_target_profile.person_id,
            v_caller_id,
            v_caller_profile.person_id,
            'basic',
            'pending',
            p_message
        );

        RETURN jsonb_build_object('success', true, 'message', 'Solicitud enviada con éxito.');
    END IF;
END;
$$;

-- ==============================================================================
-- RPC: Responder a una solicitud de acceso (Aprobar, Rechazar, Revocar, Cambiar Nivel)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.respond_tree_access(
    p_share_id UUID,
    p_action TEXT, -- 'approved', 'rejected', 'revoked', 'update_tier'
    p_tier tree_permission_tier DEFAULT 'basic'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_share RECORD;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autenticado.');
    END IF;

    SELECT * INTO v_share FROM public.tree_access_shares WHERE id = p_share_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada.');
    END IF;

    IF v_share.granter_user_id <> v_caller_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo el propietario del árbol puede autorizar o revocar accesos.');
    END IF;

    IF p_action = 'approved' THEN
        UPDATE public.tree_access_shares
        SET status = 'approved',
            tier = p_tier,
            responded_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        WHERE id = p_share_id;
        RETURN jsonb_build_object('success', true, 'message', 'Acceso concedido con nivel: ' || p_tier);

    ELSIF p_action = 'rejected' THEN
        UPDATE public.tree_access_shares
        SET status = 'rejected',
            responded_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        WHERE id = p_share_id;
        RETURN jsonb_build_object('success', true, 'message', 'Solicitud rechazada.');

    ELSIF p_action = 'revoked' THEN
        UPDATE public.tree_access_shares
        SET status = 'revoked',
            responded_at = timezone('utc'::text, now()),
            updated_at = timezone('utc'::text, now())
        WHERE id = p_share_id;
        RETURN jsonb_build_object('success', true, 'message', 'Acceso revocado.');

    ELSIF p_action = 'update_tier' THEN
        UPDATE public.tree_access_shares
        SET tier = p_tier,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_share_id;
        RETURN jsonb_build_object('success', true, 'message', 'Nivel de acceso actualizado a: ' || p_tier);

    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Acción no válida.');
    END IF;
END;
$$;
