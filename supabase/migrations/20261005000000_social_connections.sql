-- ==============================================================================
-- Migración: Vínculos sociales (amigos y noviazgos) separados del árbol genealógico
--
-- Los amigos y novios/as NO son parentesco: no se guardan en union_edges, no se
-- dibujan en el árbol y nunca unen el componente familiar de dos personas.
-- Un amigo puede existir como ficha sin cuenta (persons.is_claimed = false) hasta
-- que acepte su invitación; el acceso a tu árbol se sigue concediendo con
-- tree_access_shares una vez que tiene cuenta.
-- ==============================================================================

-- Requiere 20261004000000_tree_access_shares.sql (tabla tree_access_shares).
-- El tipo de nivel se asegura aquí también para que esta migración no falle si se ejecuta sola.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_connection_kind') THEN
        CREATE TYPE social_connection_kind AS ENUM ('friend', 'dating');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tree_permission_tier') THEN
        CREATE TYPE tree_permission_tier AS ENUM ('basic', 'intermediate', 'advanced');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_a_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    person_b_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    kind social_connection_kind NOT NULL DEFAULT 'friend',
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT social_connection_not_self CHECK (person_a_id <> person_b_id)
);

-- Un solo vínculo por pareja de personas, sin importar el orden
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_connections_pair
    ON public.social_connections (LEAST(person_a_id, person_b_id), GREATEST(person_a_id, person_b_id));
CREATE INDEX IF NOT EXISTS idx_social_connections_a ON public.social_connections (person_a_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_b ON public.social_connections (person_b_id);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

-- Visible y editable para quien lo creó, para los titulares de cualquiera de las dos fichas
-- y para el Usuario Cero.
DROP POLICY IF EXISTS "Participantes pueden ver sus vínculos sociales" ON public.social_connections;
CREATE POLICY "Participantes pueden ver sus vínculos sociales"
ON public.social_connections FOR SELECT
TO authenticated
USING (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND (profiles.is_user_zero = true OR profiles.person_id IN (person_a_id, person_b_id))
    )
);

DROP POLICY IF EXISTS "Participantes pueden crear vínculos sociales" ON public.social_connections;
CREATE POLICY "Participantes pueden crear vínculos sociales"
ON public.social_connections FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = created_by_user_id
    AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND (profiles.is_user_zero = true OR profiles.person_id IN (person_a_id, person_b_id))
    )
);

DROP POLICY IF EXISTS "Participantes pueden actualizar vínculos sociales" ON public.social_connections;
CREATE POLICY "Participantes pueden actualizar vínculos sociales"
ON public.social_connections FOR UPDATE
TO authenticated
USING (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND (profiles.is_user_zero = true OR profiles.person_id IN (person_a_id, person_b_id))
    )
)
WITH CHECK (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND (profiles.is_user_zero = true OR profiles.person_id IN (person_a_id, person_b_id))
    )
);

DROP POLICY IF EXISTS "Participantes pueden eliminar vínculos sociales" ON public.social_connections;
CREATE POLICY "Participantes pueden eliminar vínculos sociales"
ON public.social_connections FOR DELETE
TO authenticated
USING (
    auth.uid() = created_by_user_id
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND (profiles.is_user_zero = true OR profiles.person_id IN (person_a_id, person_b_id))
    )
);

-- ==============================================================================
-- RPC: El titular concede (o cambia) el acceso a su árbol a un amigo con cuenta,
-- sin que el amigo tenga que enviar una solicitud primero.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.grant_tree_access(
    p_requester_user_id UUID,
    p_tier tree_permission_tier DEFAULT 'basic'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_person UUID;
    v_requester_person UUID;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No estás autenticado.');
    END IF;

    IF v_caller_id = p_requester_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'No puedes darte acceso a ti mismo.');
    END IF;

    SELECT person_id INTO v_caller_person FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_person IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debes tener una ficha personal activa.');
    END IF;

    SELECT person_id INTO v_requester_person FROM public.profiles WHERE id = p_requester_user_id;
    IF v_requester_person IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esa persona todavía no tiene una cuenta activa.');
    END IF;

    INSERT INTO public.tree_access_shares (
        granter_user_id, granter_person_id, requester_user_id, requester_person_id,
        tier, status, responded_at
    ) VALUES (
        v_caller_id, v_caller_person, p_requester_user_id, v_requester_person,
        p_tier, 'approved', timezone('utc'::text, now())
    )
    ON CONFLICT (granter_user_id, requester_user_id) DO UPDATE
    SET tier = EXCLUDED.tier,
        status = 'approved',
        responded_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now());

    RETURN jsonb_build_object('success', true, 'message', 'Acceso concedido con nivel: ' || p_tier);
END;
$$;
