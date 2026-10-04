-- ==============================================================================
-- Migración: Permisos flexibles de red familiar, quórum inicial adaptativo y RLS
-- Permite que los miembros con ficha activa colaboren y editen fichas no reclamadas,
-- asignen parentescos (progenitores/uniones) y respalden familiares directamente.
-- ==============================================================================

-- 1. Actualizar check_user_can_invite (Quórum Inicial y Respaldo Directo)
CREATE OR REPLACE FUNCTION public.check_user_can_invite(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile RECORD;
    v_user_zero_profile RECORD;
    v_active_users_count INT;
    v_endorsement_count INT;
    v_has_user_zero_endorsement BOOLEAN := false;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('can_invite', false, 'reason', 'Perfil no encontrado', 'endorsements', 0);
    END IF;

    -- El Usuario Cero siempre tiene permiso total
    IF v_profile.is_user_zero THEN
        RETURN jsonb_build_object('can_invite', true, 'is_user_zero', true, 'endorsements', 999);
    END IF;

    -- Contar usuarios activos en la red
    SELECT COUNT(*) INTO v_active_users_count FROM public.persons WHERE is_claimed = true;

    -- Durante la fase inicial (si hay 3 o menos usuarios activos), cualquier usuario reclamado puede invitar
    IF v_active_users_count <= 3 THEN
        RETURN jsonb_build_object(
            'can_invite', true, 
            'is_user_zero', false, 
            'endorsements', 1,
            'reason', 'Modo inicial familiar activo'
        );
    END IF;

    -- Verificar si el Usuario Cero lo ha respaldado
    SELECT id, person_id INTO v_user_zero_profile FROM public.profiles WHERE is_user_zero = true LIMIT 1;
    IF v_user_zero_profile.person_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.endorsements 
            WHERE endorser_id = v_user_zero_profile.person_id 
              AND endorsed_id = v_profile.person_id
        ) INTO v_has_user_zero_endorsement;

        IF v_has_user_zero_endorsement THEN
            RETURN jsonb_build_object(
                'can_invite', true, 
                'is_user_zero', false, 
                'endorsements', 999,
                'reason', 'Respaldado por el Administrador Familiar'
            );
        END IF;
    END IF;

    -- Contar reconocimientos recibidos
    SELECT COUNT(*) INTO v_endorsement_count 
    FROM public.endorsements 
    WHERE endorsed_id = v_profile.person_id;

    IF v_endorsement_count >= 2 THEN
        RETURN jsonb_build_object('can_invite', true, 'is_user_zero', false, 'endorsements', v_endorsement_count);
    ELSE
        RETURN jsonb_build_object(
            'can_invite', false, 
            'is_user_zero', false, 
            'endorsements', v_endorsement_count,
            'needed', 2 - v_endorsement_count
        );
    END IF;
END;
$$;

-- 2. Función RPC para respaldar a un familiar de forma segura
CREATE OR REPLACE FUNCTION public.endorse_family_member(p_endorsed_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
    END IF;

    SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
    IF v_profile.person_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No tienes una ficha genealógica activa');
    END IF;

    IF v_profile.person_id = p_endorsed_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'No puedes respaldarte a ti mismo');
    END IF;

    INSERT INTO public.endorsements (endorser_id, endorsed_id, notes)
    VALUES (v_profile.person_id, p_endorsed_id, COALESCE(p_notes, 'Respaldo de confianza familiar'))
    ON CONFLICT (endorser_id, endorsed_id) DO NOTHING;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Políticas RLS en public.endorsements
DROP POLICY IF EXISTS "Miembros autenticados pueden registrar reconocimientos" ON public.endorsements;
CREATE POLICY "Miembros autenticados pueden registrar reconocimientos"
ON public.endorsements FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.person_id = endorser_id
    )
);

-- 4. Políticas RLS en public.persons
-- Permitir que cualquier usuario activo con ficha o el creador o Usuario Cero edite fichas no reclamadas
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar fichas que crearon o su propia ficha" ON public.persons;
DROP POLICY IF EXISTS "Miembros autenticados pueden actualizar fichas no reclamadas o su propia ficha" ON public.persons;

CREATE POLICY "Miembros autenticados pueden actualizar fichas no reclamadas o su propia ficha"
ON public.persons FOR UPDATE
TO authenticated
USING (
    (is_claimed = true AND auth.uid() = claimed_by_user_id)
    OR auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
)
WITH CHECK (
    (is_claimed = true AND auth.uid() = claimed_by_user_id)
    OR auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
);

DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar personas no reclamadas" ON public.persons;
DROP POLICY IF EXISTS "Miembros autenticados pueden eliminar fichas no reclamadas" ON public.persons;

CREATE POLICY "Miembros autenticados pueden eliminar fichas no reclamadas"
ON public.persons FOR DELETE
TO authenticated
USING (
    (is_claimed = false AND (
        auth.uid() = created_by_user_id 
        OR EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
        )
    ))
);

-- 5. Políticas RLS en public.parent_child_edges
DROP POLICY IF EXISTS "Usuarios autenticados pueden registrar filiaciones verticales" ON public.parent_child_edges;
CREATE POLICY "Miembros autenticados pueden registrar filiaciones verticales"
ON public.parent_child_edges FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
);

DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar filiaciones verticales creadas o que les conciernen" ON public.parent_child_edges;
DROP POLICY IF EXISTS "Miembros autenticados pueden gestionar filiaciones verticales" ON public.parent_child_edges;

CREATE POLICY "Miembros autenticados pueden gestionar filiaciones verticales"
ON public.parent_child_edges FOR UPDATE
TO authenticated
USING (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
)
WITH CHECK (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
);

DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar vínculos verticales" ON public.parent_child_edges;
DROP POLICY IF EXISTS "Miembros autenticados pueden eliminar filiaciones verticales" ON public.parent_child_edges;

CREATE POLICY "Miembros autenticados pueden eliminar filiaciones verticales"
ON public.parent_child_edges FOR DELETE
TO authenticated
USING (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
);

-- 6. Políticas RLS en public.union_edges
DROP POLICY IF EXISTS "Usuarios autenticados pueden registrar vínculos conyugales" ON public.union_edges;
CREATE POLICY "Miembros autenticados pueden registrar vínculos conyugales"
ON public.union_edges FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
);

DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar vínculos conyugales" ON public.union_edges;
DROP POLICY IF EXISTS "Miembros autenticados pueden gestionar vínculos conyugales" ON public.union_edges;

CREATE POLICY "Miembros autenticados pueden gestionar vínculos conyugales"
ON public.union_edges FOR UPDATE
TO authenticated
USING (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
)
WITH CHECK (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
);

DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar vínculos conyugales" ON public.union_edges;
DROP POLICY IF EXISTS "Miembros autenticados pueden eliminar vínculos conyugales" ON public.union_edges;

CREATE POLICY "Miembros autenticados pueden eliminar vínculos conyugales"
ON public.union_edges FOR DELETE
TO authenticated
USING (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
    )
);
