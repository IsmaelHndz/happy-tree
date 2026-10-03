-- ==============================================================================
-- MIGRACIÓN: FUNCIÓN RPC PARA RESETEAR / LIBERAR UNA FICHA GENEALÓGICA (UNCLAIM)
-- Permite al Usuario Cero o creador desvincular una cuenta de acceso errónea
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.reset_person_claim(
    p_person_id UUID,
    p_admin_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_profile RECORD;
    v_target_person RECORD;
    v_previous_user_id UUID;
BEGIN
    -- 1. Validar permisos de administrador o creador
    SELECT * INTO v_admin_profile FROM public.profiles WHERE id = p_admin_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Administrador no encontrado');
    END IF;

    SELECT * INTO v_target_person FROM public.persons WHERE id = p_person_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ficha familiar no encontrada');
    END IF;

    -- Prohibir desvincular la propia ficha del Usuario Cero
    IF v_admin_profile.person_id = p_person_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'No puedes desvincular tu propia ficha de Usuario Cero');
    END IF;

    -- Solo Usuario Cero o el creador de la persona pueden resetear
    IF NOT v_admin_profile.is_user_zero AND v_target_person.created_by_user_id <> p_admin_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'No tienes permisos de administrador para liberar esta ficha');
    END IF;

    v_previous_user_id := v_target_person.claimed_by_user_id;

    -- 2. Si tenía un usuario enlazado en profiles, desvincularlo
    IF v_previous_user_id IS NOT NULL THEN
        UPDATE public.profiles 
        SET person_id = NULL, updated_at = now() 
        WHERE id = v_previous_user_id;
    END IF;

    -- 3. Resetear el estado de la ficha a unclaimed
    UPDATE public.persons
    SET 
        is_claimed = false,
        claimed_by_user_id = NULL,
        claimed_at = NULL,
        updated_at = now()
    WHERE id = p_person_id;

    -- 4. Revocar tokens de invitación previos para evitar accesos con credenciales viejas
    UPDATE public.invitation_tokens
    SET status = 'revoked'
    WHERE person_id = p_person_id AND status IN ('accepted', 'pending');

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Ficha genealógica liberada exitosamente. Ahora puedes invitar a la persona con su correo real.'
    );
END;
$$;
