-- ==============================================================================
-- Migración: Hacer invited_email opcional en invitation_tokens
-- Permite invitar familiares sin conocer su correo previamente (por ejemplo, vía WhatsApp o enlace directo)
-- El familiar ingresará su correo directamente al reclamar su perfil.
-- ==============================================================================

ALTER TABLE public.invitation_tokens ALTER COLUMN invited_email DROP NOT NULL;

-- Actualizar función claim_person_profile para registrar el email de auth.users si v_invitation.invited_email está vacío
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
    v_user_email TEXT;
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

    -- Obtener email de auth.users si v_invitation.invited_email está vacío
    SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

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

    -- 5. Marcar el token como aceptado y consumido, guardando el email real
    UPDATE public.invitation_tokens
    SET 
        status = 'accepted',
        invited_email = COALESCE(NULLIF(v_invitation.invited_email, ''), v_user_email),
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
        person_id = EXCLUDED.person_id,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'person_id', v_person.id,
        'message', 'Perfil reclamado exitosamente'
    );
END;
$$;
