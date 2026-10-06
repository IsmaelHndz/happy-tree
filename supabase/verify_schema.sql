-- ==============================================================================
-- Verificación del esquema (solo lectura): pega esto en el SQL Editor de Supabase.
-- Devuelve una fila por comprobación con ✅ / ❌ y el detalle de lo encontrado.
-- No modifica ningún dato.
-- ==============================================================================

WITH checks(orden, comprobacion, ok, detalle) AS (
    -- 1. Tipos enumerados
    SELECT 1, 'Tipo tree_permission_tier',
        EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tree_permission_tier'),
        (SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
           FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'tree_permission_tier')
    UNION ALL
    SELECT 2, 'Tipo tree_access_status',
        EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tree_access_status'),
        (SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
           FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'tree_access_status')
    UNION ALL
    SELECT 3, 'Tipo social_connection_kind',
        EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_connection_kind'),
        (SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
           FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'social_connection_kind')

    -- 2. Tablas con RLS activado
    UNION ALL
    SELECT 10, 'Tabla tree_access_shares (RLS activo)',
        COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.tree_access_shares')), false),
        CASE WHEN to_regclass('public.tree_access_shares') IS NULL THEN 'no existe' ELSE 'existe' END
    UNION ALL
    SELECT 11, 'Tabla social_connections (RLS activo)',
        COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.social_connections')), false),
        CASE WHEN to_regclass('public.social_connections') IS NULL THEN 'no existe' ELSE 'existe' END

    -- 3. Políticas RLS (4 por tabla: select, insert, update, delete)
    UNION ALL
    SELECT 20, 'Políticas de tree_access_shares (4)',
        (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tree_access_shares') = 4,
        (SELECT string_agg(cmd, ', ' ORDER BY cmd) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tree_access_shares')
    UNION ALL
    SELECT 21, 'Políticas de social_connections (4)',
        (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'social_connections') = 4,
        (SELECT string_agg(cmd, ', ' ORDER BY cmd) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'social_connections')

    -- 4. Restricciones e índices que usa el código
    UNION ALL
    SELECT 30, 'Única granter/requester (necesaria para grant_tree_access)',
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_granter_requester'),
        NULL
    UNION ALL
    SELECT 31, 'Índice único de pareja en social_connections',
        to_regclass('public.uq_social_connections_pair') IS NOT NULL,
        NULL
    UNION ALL
    SELECT 32, 'Columnas middle_name y maternal_last_name en persons',
        (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'persons'
            AND column_name IN ('middle_name', 'maternal_last_name')) = 2,
        NULL
    UNION ALL
    SELECT 33, 'invitation_tokens.invited_email acepta vacío',
        (SELECT is_nullable = 'YES' FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'invitation_tokens' AND column_name = 'invited_email'),
        NULL

    UNION ALL
    SELECT 34, 'Nivel "profile" (solo ficha) en tree_permission_tier',
        EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
                 WHERE t.typname = 'tree_permission_tier' AND e.enumlabel = 'profile'),
        NULL
    UNION ALL
    SELECT 35, 'Columnas de propuesta en social_connections',
        (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'social_connections'
            AND column_name IN ('proposed_union_type', 'proposed_by_user_id')) = 2,
        NULL

    -- 5. Funciones RPC (deben ser SECURITY DEFINER)
    UNION ALL
    SELECT 40 + row_number() OVER (ORDER BY f.name), 'Función ' || f.name || ' (security definer)',
        COALESCE((SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = f.name LIMIT 1), false),
        CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                           WHERE n.nspname = 'public' AND p.proname = f.name)
             THEN 'existe' ELSE 'no existe' END
    FROM (VALUES ('grant_tree_access'), ('request_tree_access'), ('respond_tree_access'),
                 ('search_users_for_tree_access'), ('claim_person_profile'), ('check_user_can_invite')) AS f(name)

    -- 6. Triggers de integridad genealógica
    UNION ALL
    SELECT 60, 'Trigger trg_union_integrity en union_edges',
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_union_integrity'
                  AND tgrelid = to_regclass('public.union_edges') AND NOT tgisinternal),
        NULL
    UNION ALL
    SELECT 61, 'Trigger trg_parent_edge_integrity en parent_child_edges',
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_parent_edge_integrity'
                  AND tgrelid = to_regclass('public.parent_child_edges') AND NOT tgisinternal),
        NULL
)
SELECT CASE WHEN ok THEN '✅' ELSE '❌' END AS estado, comprobacion, detalle
FROM checks
ORDER BY orden;
