# HANDOFF DOCUMENT: REPARACIÓN DEL ALGORITMO GENEALÓGICO Y FAMILIAS ENSAMBLADAS

> **Propósito**: Documento de traspaso técnico para que cualquier agente AI o desarrollador continúe exactamente donde se dejó esta sesión, con todo el diagnóstico, causas raíces, archivos ya creados y los pasos exactos a ejecutar.
> **ID de Conversación Origen**: `2ee9ef06-42b2-496b-a144-f566d61ad276`  
> **Fecha**: 4 de Octubre de 2026

---

## 1. El Problema Reportado por el Usuario
1. **Unión conyugal errónea entre parientes biológicos**: Al agregar a un tío materno (hermano de la mamá), el sistema lo vinculó como **esposo/pareja de la abuela** (`Audelia Huerta`), a pesar de que ella es su madre biológica.
2. **Familias mezcladas y ensambladas (Blended families)**: Familias donde una persona tiene hijos con diferentes parejas en diferentes momentos de su vida (medios hermanos maternos/paternos, exparejas, segundas nupcias).
3. **Desalineación visual en el árbol**: El usuario y su hermano no aparecían correctamente distribuidos como hijos debajo de su madre (`Rubi Hernández Huerta`), saliendo desplazados o fuera de su rama.
4. **Error de sobrecarga intermitente de API**: Durante la generación anterior hubo un error temporal de timeout/overload en el proveedor del modelo, por lo que el usuario requirió exportar la sesión y transferirla.

---

## 2. Diagnóstico de Causas Raíz en el Código

### Causa 1: Uniones Conyugales Fantasmas o Inconsistentes en la Base de Datos
- En `union_edges`, si en algún momento se creó una unión por error (o antes de que existiera el opt-in `create_union`), el motor de `get-family-graph.ts` la cargaba a ciegas.
- No existía un validador que detectara que si `A` es madre/progenitor de `B`, **es imposible biológicamente que exista una unión conyugal entre A y B**.
- **Solución implementada**: Se creó `src/features/genealogy/utils/graph-integrity.ts` con `partitionUnionsByIntegrity` y `classifyUnionIssue`, que filtra y separa uniones biológicamente inválidas en tiempo lineal $O(V + E)$ sin recursión.

### Causa 2: Disolución Incompleta al Reasignar Roles
- En `actions.ts -> convertParentToSiblingAction`:
  - Solo borraba uniones entre la persona y los padres de la persona ancla, pero si la persona tenía una unión directa preexistente con la madre (`Audelia`), esa unión no se disolvía.
  - Al crear hijos de una persona con múltiples parejas en `actions.ts -> createFamilyMemberAction`:
    ```typescript
    // Líneas 408-433 en actions.ts:
    // Si la persona tiene cónyuge actual, vinculaba al nuevo hijo CON TODAS sus parejas!
    ```
    Esto provocaba que si una madre tuvo parejas anteriores, un hijo nuevo se le asignaba automáticamente a la pareja equivocada.

### Causa 3: Layout Generacional Global vs. Grupos Familiares Reales
- En `get-family-graph.ts`:
  - Las posiciones de las generaciones se calculaban con un algoritmo que no manejaba de forma natural múltiples parejas contiguas (por ejemplo: `[Ex-pareja 1] [Madre] [Pareja actual]`).
  - Cuando se ocultaban o filtraban nodos en el cliente (`TreeCanvas`), el cliente no recalculaba el layout, dejando huecos o posiciones estáticas calculadas por el servidor.
- **Solución implementada**: Se creó `src/features/genealogy/utils/tree-layout.ts`, un motor de layout puro y desacoplado:
  - Fila -1: Orden bilateral estricto (tíos maternos a la izquierda, madre, padre, tíos paternos a la derecha).
  - Filas intermedias: Orden baricéntrico basado en los índices de sus progenitores/hijos.
  - Multi-pareja contigua: Mantiene a cada cónyuge o expareja al lado de la persona, permitiendo que los hijos cuelguen exactamente del centro de su pareja biológica real.

---

## 3. Estado de Archivos Modificados / Creados

| Archivo | Estado | Qué hace |
|---|---|---|
| `src/features/genealogy/utils/graph-integrity.ts` | **COMPLETO** | Detección pura de uniones imposibles (progenitor-hijo, ancestro-descendiente, hermanos). Previene ciclos. |
| `src/features/genealogy/utils/tree-layout.ts` | **COMPLETO** | Motor de coordenadas y orden baricéntrico puro para familias ensambladas y multi-parejas. Resuelve colisiones PAVA. |
| `src/features/genealogy/services/get-family-graph.ts` | **INTEGRADO** | Saneamiento de uniones mediante `partitionUnionsByIntegrity` antes de BFS y cálculo de coordenadas con `computeTreeLayout`. |
| `src/features/genealogy/actions.ts` | **ACTUALIZADO** | Corregida la auto-asignación múltiple de cónyuges al crear hijos y blindada la acción `convertParentToSiblingAction` protegiendo hijos legítimos y purgando uniones espurias. |
| `supabase/migrations/20261004000001_genealogy_integrity_and_repair.sql` | **CREADO** | Script SQL para sanear uniones corruptas en la base de datos y triggers `assert_union_integrity` y `assert_parent_edge_integrity`. |
| `CONVERSATION_EXPORT.md` | **CREADO** | Transcripción completa en Markdown de la conversación para respaldo. |

---

## 4. Verificación y Resultados
- Compilación de TypeScript: `npx tsc --noEmit` -> **0 errores**.
- Compilación de producción Next.js 16: `npm run build` -> **Exit 0 (Exitoso con Turbopack)**.
- El árbol genealógico ahora filtra automáticamente cualquier contradicción biológica (como la unión tío-abuela) tanto en la carga del grafo como en la base de datos.
- Las familias ensambladas distribuyen a los hijos exactamente bajo el punto medio de su pareja biológica real y mantienen bilateralidad simétrica en la generación de ancestros.
