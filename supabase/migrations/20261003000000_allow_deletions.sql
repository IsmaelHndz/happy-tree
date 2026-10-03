-- ==============================================================================
-- MIGRACIÓN: POLÍTICAS DE ELIMINACIÓN (DELETE) PARA EDGES Y PERSONAS
-- Permite a los usuarios eliminar vínculos creados y a Usuario Cero gestionar el árbol
-- ==============================================================================

-- 1. Permitir eliminación de vínculos conyugales
CREATE POLICY "Usuarios autenticados pueden eliminar vínculos conyugales"
ON public.union_edges FOR DELETE
TO authenticated
USING (
    auth.uid() = created_by_user_id 
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.is_user_zero = true
    )
);

-- 2. Permitir eliminación de vínculos verticales (padre-hijo)
CREATE POLICY "Usuarios autenticados pueden eliminar vínculos verticales"
ON public.parent_child_edges FOR DELETE
TO authenticated
USING (
    auth.uid() = created_by_user_id 
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.is_user_zero = true
    )
);

-- 3. Permitir eliminación de fichas de personas no reclamadas
CREATE POLICY "Usuarios autenticados pueden eliminar personas no reclamadas"
ON public.persons FOR DELETE
TO authenticated
USING (
    (auth.uid() = created_by_user_id AND is_claimed = false)
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.is_user_zero = true AND is_claimed = false
    )
);
