-- ==============================================================================
-- Migración: Acomodo manual del árbol y reportes de acomodo
--
-- layout_preferences: el acomodo que cada persona eligió para SU árbol. Son reglas
--   "A va a la izquierda de B" (ids de persons) que el algoritmo respeta. Quien ve el
--   árbol de otra persona como invitado ve el acomodo del titular.
-- layout_feedback: lo que le llega al Usuario Cero sin preguntar:
--   - manual_adjust: alguien guardó un acomodo en su árbol (se envía solo).
--   - report: alguien pulsó "Reportar acomodo" (con comentario opcional).
--   - change_request: propuesta de acomodo para el árbol de OTRA persona; solo se aplica
--     si el Usuario Cero la aprueba (se copia a layout_preferences del titular).
-- Solo ids y estructura, sin nombres.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.layout_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    -- [{ "left": "<person id>", "right": "<person id>" }, ...]
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.layout_preferences ENABLE ROW LEVEL SECURITY;

-- Cada quien lee y escribe su propio acomodo; el Usuario Cero, todos (para aprobar solicitudes).
-- Leer el de otro titular: quien tiene acceso aprobado a su árbol (invitados) lo necesita para verlo igual.
DROP POLICY IF EXISTS "Ver acomodo propio, compartido o como Usuario Cero" ON public.layout_preferences;
CREATE POLICY "Ver acomodo propio, compartido o como Usuario Cero"
ON public.layout_preferences FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_user_zero = true)
    OR EXISTS (
        SELECT 1 FROM public.tree_access_shares s
        WHERE s.granter_user_id = layout_preferences.user_id
          AND s.requester_user_id = auth.uid()
          AND s.status = 'approved'
    )
);

DROP POLICY IF EXISTS "Guardar acomodo propio o como Usuario Cero" ON public.layout_preferences;
CREATE POLICY "Guardar acomodo propio o como Usuario Cero"
ON public.layout_preferences FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_user_zero = true)
);

DROP POLICY IF EXISTS "Actualizar acomodo propio o como Usuario Cero" ON public.layout_preferences;
CREATE POLICY "Actualizar acomodo propio o como Usuario Cero"
ON public.layout_preferences FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_user_zero = true)
);

DROP POLICY IF EXISTS "Borrar acomodo propio" ON public.layout_preferences;
CREATE POLICY "Borrar acomodo propio"
ON public.layout_preferences FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.layout_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('manual_adjust', 'report', 'change_request')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'approved', 'rejected')),
    -- Árbol que se estaba viendo
    focus_person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
    tree_owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    scope TEXT,
    -- Reglas antes y después del cambio
    base_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    crossings_before INTEGER,
    crossings_after INTEGER,
    algorithm_version TEXT,
    comment TEXT,
    reviewer_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_layout_feedback_created ON public.layout_feedback (created_at DESC);

ALTER TABLE public.layout_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Crear reportes propios" ON public.layout_feedback;
CREATE POLICY "Crear reportes propios"
ON public.layout_feedback FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Ver reportes propios o como Usuario Cero" ON public.layout_feedback;
CREATE POLICY "Ver reportes propios o como Usuario Cero"
ON public.layout_feedback FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_user_zero = true)
);

DROP POLICY IF EXISTS "Revisar reportes como Usuario Cero" ON public.layout_feedback;
CREATE POLICY "Revisar reportes como Usuario Cero"
ON public.layout_feedback FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_user_zero = true));
