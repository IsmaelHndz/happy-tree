-- ==============================================================================
-- HAPPY-TREE: FASE 3 - PERMISOS DE GESTIÓN FAMILIAR E INVITACIONES
-- ==============================================================================

-- 1. Políticas de Inserción y Actualización para PERSONS
CREATE POLICY "Usuarios autenticados pueden crear fichas familiares"
ON public.persons FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Usuarios autenticados pueden actualizar fichas que crearon o su propia ficha"
ON public.persons FOR UPDATE
TO authenticated
USING (auth.uid() = created_by_user_id OR auth.uid() = claimed_by_user_id)
WITH CHECK (auth.uid() = created_by_user_id OR auth.uid() = claimed_by_user_id);

-- 2. Políticas de Inserción y Actualización para PARENT_CHILD_EDGES
CREATE POLICY "Usuarios autenticados pueden registrar filiaciones verticales"
ON public.parent_child_edges FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Usuarios autenticados pueden actualizar filiaciones verticales creadas o que les conciernen"
ON public.parent_child_edges FOR UPDATE
TO authenticated
USING (auth.uid() = created_by_user_id)
WITH CHECK (auth.uid() = created_by_user_id);

-- 3. Políticas de Inserción y Actualización para UNION_EDGES
CREATE POLICY "Usuarios autenticados pueden registrar vínculos conyugales"
ON public.union_edges FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Usuarios autenticados pueden actualizar vínculos conyugales"
ON public.union_edges FOR UPDATE
TO authenticated
USING (auth.uid() = created_by_user_id)
WITH CHECK (auth.uid() = created_by_user_id);

-- 4. Políticas para INVITATION_TOKENS
CREATE POLICY "Usuarios autenticados pueden crear tokens de invitacion"
ON public.invitation_tokens FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = invited_by_user_id);

CREATE POLICY "Usuarios autenticados pueden actualizar sus propios tokens (ej. revocar)"
ON public.invitation_tokens FOR UPDATE
TO authenticated
USING (auth.uid() = invited_by_user_id)
WITH CHECK (auth.uid() = invited_by_user_id);

CREATE POLICY "Usuarios autenticados pueden ver los tokens que ellos emitieron"
ON public.invitation_tokens FOR SELECT
TO authenticated
USING (auth.uid() = invited_by_user_id);
