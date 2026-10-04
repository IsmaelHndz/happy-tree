-- ==============================================================================
-- AGREGAR CAMPOS DE SEGUNDO NOMBRE Y APELLIDO MATERNO A PERSONS
-- Estructura para nombres completos de cultura hispana / latinoamericana
-- ==============================================================================

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS maternal_last_name TEXT;

COMMENT ON COLUMN public.persons.first_name IS 'Primer nombre de pila';
COMMENT ON COLUMN public.persons.middle_name IS 'Segundo nombre de pila (opcional)';
COMMENT ON COLUMN public.persons.last_name IS 'Primer apellido / Apellido paterno';
COMMENT ON COLUMN public.persons.maternal_last_name IS 'Segundo apellido / Apellido materno (opcional)';
