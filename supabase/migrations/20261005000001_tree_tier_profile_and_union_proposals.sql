-- ==============================================================================
-- Migración: nivel de acceso "solo ficha" y propuestas para hacer formal un noviazgo
--
-- 1. tree_permission_tier gana el valor 'profile': el amigo ve únicamente tu ficha,
--    sin ningún familiar (pensado para exparejas y conocidos).
-- 2. social_connections guarda la propuesta de pasar a unión libre o casados, para que
--    la otra persona (si ya tiene cuenta) la acepte o rechace antes de crear la unión.
-- Se puede ejecutar más de una vez sin riesgo.
-- ==============================================================================

ALTER TYPE tree_permission_tier ADD VALUE IF NOT EXISTS 'profile' BEFORE 'basic';

ALTER TABLE public.social_connections
    ADD COLUMN IF NOT EXISTS proposed_union_type TEXT
        CHECK (proposed_union_type IN ('partner', 'married')),
    ADD COLUMN IF NOT EXISTS proposed_by_user_id UUID
        REFERENCES auth.users(id) ON DELETE SET NULL;
