# Exportación de Conversación: Happy Tree - Diagnóstico y Corrección Genealógica

**ID de Conversación:** `2ee9ef06-42b2-496b-a144-f566d61ad276`  
**Fecha:** 2026-10-04  

---

## 👤 Usuario

<USER_REQUEST>
Tengo serios problemas con este proyecto de arbol genealogico porque el algoritmo no está trabajando bien con los parientes
Quise añadir a un hermano de mi mamá y me lo puso como esposo de mi abuelita pero eso no es así siendo que ella es su madre biologica
Es un poco complicado y enredoso pero ese es precisamente el problema que busco resolver con este proyecto
Muchas familias suelen estar mezcladas por personas con hijos de diferentes parejas, ya sea una mujer que tiene hijos con varios hombres a lo largo de su vida, o parejas que tienen hijos y después se separan y tienen hijos con otras personas
El circulo familiar o el árbol familiar puede volverse muy complejo y eso es lo que quiero resolver aqui
Especialmente en mi familia es complicado este tema y luego no sé quién es quién
Apenas voy por la parte de mi mamá y ve los problemas
Mi hermano y yo no aparecemos como sus hijos ni salimos debajo de donde se supone que deberíamos
No está bien distribuido y algo en nuestra lógica falla, ayúdame a resolver eso
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-04T12:03:22-06:00.

The user's current state is as follows:
Active Document: /Users/ismael/Developer/happy-tree/AGENTS.md (LANGUAGE_MARKDOWN)
Cursor is on line: 1
Other open documents:
- /Users/ismael/Developer/happy-tree/AGENTS.md (LANGUAGE_MARKDOWN)
</ADDITIONAL_METADATA>
<USER_SETTINGS_CHANGE>
The user changed setting `Model Selection` from None to Claude Opus 5.5 (High). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.
</USER_SETTINGS_CHANGE>

---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:03:31-06:00
Completed At: 2026-10-04T12:03:31-06:00
{"name":"actions.ts","sizeBytes":"52168"}
{"name":"components","isDir":true}
{"name":"friends-actions.ts","sizeBytes":"12398"}
{"name":"services","isDir":true}
{"name":"types","isDir":true}
{"name":"types.ts","sizeBytes":"4892"}
{"name":"utils","isDir":true}

Summary: This directory contains 4 subdirectories and 3 files.

---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `list_dir`, `list_dir`

Voy a revisar primero el código del motor de layout y las acciones para entender dónde falla la lógica.

---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:03:31-06:00
Completed At: 2026-10-04T12:03:31-06:00
{"name":"knowledge.lock"}

Summary: This directory contains 0 subdirectories and 1 files.

---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:03:35-06:00
Completed At: 2026-10-04T12:03:35-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/services/get-family-graph.ts`
Total Lines: 1061
Total Bytes: 36863
Showing lines 1 to 800
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
1: import { createClient } from "@/lib/supabase/server";
2: import type { FamilyGraphData, TreeNodeData, TreeEdgeData, AccessibleTreeOption } from "../types/graph.types";
3: import type { Gender } from "@/types/database.types";
4: import type { TreePermissionTier } from "../types";
5: import { inferKinship, getConnectedFamilyIds } from "../utils/kinship-inference";
6: 
7: /**
8:  * Consulta la base de datos y calcula la distribución espacial por generaciones del árbol familiar,
9:  * centrándolo en focusPersonId (o en el usuario actual si no se especifica).
10:  *
11:  * Si se especifica `targetUserId` y es distinto al usuario actual:
12:  * - Se comprueba si el usuario actual tiene acceso concedido mediante `tree_access_shares`.
13:  * - Se activa el modo visitante / guest (`isViewerGuest: true`).
14:  * - Se aplica el filtro estricto según el nivel de permisos concedido:
15:  *   - 'basic': solo familia de casa (padres, hijos, hermanos, pareja).
16:  *   - 'intermediate': familia de casa + extendida (abuelos, tíos, primos, sobrinos, nietos).
17:  *   - 'advanced': árbol genealógico completo a libertad.
18:  */
19: export async function getFamilyGraph(
20:   focusPersonId?: string,
21:   targetUserId?: string
22: ): Promise<FamilyGraphData> {
23:   const supabase = await createClient();
24:   const {
25:     data: { user },
26:   } = await supabase.auth.getUser();
27: 
28:   const emptyResult: FamilyGraphData = {
29:     nodes: [],
30:     edges: [],
31:     focusPerson: {
32:       id: "",
33:       firstName: "",
34:       lastName: "",
35:       gender: "unknown",
36:       relationshipLabel: "",
37:       isSelf: true,
38:     },
39:     availableMembers: [],
40:     isUserZero: false,
41:     accessibleTrees: [],
42:   };
43: 
44:   if (!user) return emptyResult;
45: 
46:   // 1. Obtener la ficha y rol del usuario actual
47:   const { data: profile } = await supabase
48:     .from("profiles")
49:     .select("person_id, is_user_zero")
50:     .eq("id", user.id)
51:     .single();
52: 
53:   if (!profile?.person_id) return emptyResult;
54:   const userPersonId = profile.person_id;
55:   const isUserZero = profile.is_user_zero;
56: 
57:   // 2. Consultar árboles de amigos autorizados para el selector rápido
58:   let accessibleTrees: AccessibleTreeOption[] = [];
59:   try {
60:     const { data: shares } = await supabase
61:       .from("tree_access_shares")
62:       .select("granter_user_id, granter_person_id, tier")
63:       .eq("requester_user_id", user.id)
64:       .eq("status", "approved");
65: 
66:     if (shares && shares.length > 0) {
67:       const gPersonIds = shares.map((s) => s.granter_person_id);
68:       const { data: gPersons } = await supabase
69:         .from("persons")
70:         .select("id, first_name, middle_name, last_name, maternal_last_name")
71:         .in("id", gPersonIds);
72: 
73:       const nameMap = new Map<string, string>();
74:       gPersons?.forEach((gp) => {
75:         nameMap.set(
76:           gp.id,
77:           [gp.first_name, gp.middle_name, gp.last_name, gp.maternal_last_name]
78:             .filter(Boolean)
79:             .join(" ")
80:         );
81:       });
82: 
83:       accessibleTrees = shares.map((s) => ({
84:         targetUserId: s.granter_user_id,
85:         targetPersonId: s.granter_person_id,
86:         ownerName: nameMap.get(s.granter_person_id) || "Amigo / Familiar",
87:         tier: s.tier as TreePermissionTier,
88:       }));
89:     }
90:   } catch {
91:     // Si la tabla aún no se crea en la base de datos remota
92:     accessibleTrees = [];
93:   }
94: 
95:   // 3. Determinar si estamos en Modo Visitante (viendo el árbol de un amigo externo)
96:   let isViewerGuest = false;
97:   let viewerTier: TreePermissionTier = "advanced";
98:   let treeOwnerName: string | undefined = undefined;
99:   let defaultFriendPersonId: string | null = null;
100: 
101:   if (targetUserId && targetUserId !== user.id) {
102:     // Validar autorización de acceso
103:     const { data: shareData } = await supabase
104:       .from("tree_access_shares")
105:       .select("tier, status, granter_person_id")
106:       .eq("granter_user_id", targetUserId)
107:       .eq("requester_user_id", user.id)
108:       .eq("status", "approved")
109:       .maybeSingle();
110: 
111:     if (!shareData && !isUserZero) {
112:       // Sin autorización para ver este árbol
113:       return {
114:         ...emptyResult,
115:         accessibleTrees,
116:       };
117:     }
118: 
119:     isViewerGuest = true;
120:     viewerTier = (shareData?.tier as TreePermissionTier) || (isUserZero ? "advanced" : "basic");
121:     defaultFriendPersonId = shareData?.granter_person_id || null;
122: 
123:     // Obtener nombre del titular
124:     if (defaultFriendPersonId) {
125:       const { data: ownerPerson } = await supabase
126:         .from("persons")
127:         .select("first_name, middle_name, last_name, maternal_last_name")
128:         .eq("id", defaultFriendPersonId)
129:         .maybeSingle();
130: 
131:       if (ownerPerson) {
132:         treeOwnerName = [
133:           ownerPerson.first_name,
134:           ownerPerson.middle_name,
135:           ownerPerson.last_name,
136:           ownerPerson.maternal_last_name,
137:         ]
138:           .filter(Boolean)
139:           .join(" ");
140:       }
141:     }
142:   }
143: 
144:   // 4. Consultar todas las aristas verticales (padres e hijos) y uniones conyugales
145:   const { data: allParentEdges } = await supabase
146:     .from("parent_child_edges")
147:     .select("id, parent_id, child_id, relationship_type");
148: 
149:   const { data: allUnions } = await supabase
150:     .from("union_edges")
151:     .select("id, person_a_id, person_b_id, union_type, status");
152: 
153:   // Helper para verificar si dos personas comparten hijos registrados
154:   const hasSharedChildren = (personA: string, personB: string): boolean => {
155:     const kidsA = allParentEdges?.filter((e) => e.parent_id === personA).map((e) => e.child_id) ?? [];
156:     const kidsB = allParentEdges?.filter((e) => e.parent_id === personB).map((e) => e.child_id) ?? [];
157:     return kidsA.some((id) => kidsB.includes(id));
158:   };
159: 
160:   // Filtrar uniones que deben mostrarse en el árbol genealógico
161:   const isUnionVisibleInTree = (u: {
162:     person_a_id: string;
163:     person_b_id: string;
164:     union_type: string;
165:     status?: string | null;
166:   }): boolean => {
167:     if (u.status === "rejected") return false;
168:     const isEx = u.union_type === "separated" || u.union_type === "divorced";
169:     if (isEx) {
170:       return hasSharedChildren(u.person_a_id, u.person_b_id);
171:     }
172:     return true;
173:   };
174: 
175:   const treeVisibleUnions = allUnions?.filter(isUnionVisibleInTree) ?? [];
176: 
177:   // Red familiar propia del usuario activo (componente conectado)
178:   const userFamilyIds = getConnectedFamilyIds(
179:     userPersonId,
180:     allParentEdges ?? [],
181:     treeVisibleUnions
182:   );
183: 
184:   // 5. Determinar el nodo central del árbol (Focus Person) y validar autorización estricta
185:   let centerPersonId = userPersonId;
186: 
187:   if (isViewerGuest && defaultFriendPersonId) {
188:     centerPersonId =
189:       focusPersonId && focusPersonId.trim().length > 0
190:         ? focusPersonId.trim()
191:         : defaultFriendPersonId;
192:   } else if (focusPersonId && focusPersonId.trim().length > 0) {
193:     const reqFocus = focusPersonId.trim();
194: 
195:     if (isUserZero) {
196:       // Usuario Cero (Administrador) puede auditar cualquier persona de la plataforma
197:       centerPersonId = reqFocus;
198:     } else if (userFamilyIds.has(reqFocus)) {
199:       // Usuario regular navegando por un familiar dentro de su propio árbol
200:       centerPersonId = reqFocus;
201:     } else {
202:       // Si la persona solicitada pertenece a un árbol de amigos compartido aprobado
203:       const matchingShare = accessibleTrees.find(
204:         (t) => t.targetPersonId === reqFocus || t.targetUserId === reqFocus
205:       );
206: 
207:       if (matchingShare) {
208:         isViewerGuest = true;
209:         viewerTier = matchingShare.tier;
210:         treeOwnerName = matchingShare.ownerName;
211:         centerPersonId = reqFocus;
212:       } else {
213:         // ACCESO DENEGADO A ÁRBOL AJENO SIN PERMISO:
214:         // Evitar que usuarios externos vean árboles a los que no tienen autorización concedida
215:         centerPersonId = userPersonId;
216:       }
217:     }
218:   }
219: 
220:   let { data: centerPerson } = await supabase
221:     .from("persons")
222:     .select("id, first_name, last_name, gender, birth_date, is_living, is_claimed")
223:     .eq("id", centerPersonId)
224:     .maybeSingle();
225: 
226:   if (!centerPerson) {
227:     centerPersonId = isViewerGuest && defaultFriendPersonId ? defaultFriendPersonId : userPersonId;
228:     const { data: fallbackPerson } = await supabase
229:       .from("persons")
230:       .select("id, first_name, last_name, gender, birth_date, is_living, is_claimed")
231:       .eq("id", centerPersonId)
232:       .single();
233:     centerPerson = fallbackPerson;
234:   }
235: 
236:   if (!centerPerson) {
237:     return {
238:       ...emptyResult,
239:       accessibleTrees,
240:     };
241:   }
242: 
243:   // 7. Identificar relaciones directas respecto al nodo central (centerPersonId)
244:   const parentIds = allParentEdges?.filter((e) => e.child_id === centerPersonId).map((e) => e.parent_id) ?? [];
245:   const childIds = allParentEdges?.filter((e) => e.parent_id === centerPersonId).map((e) => e.child_id) ?? [];
246: 
247:   const spouseIds = [
248:     ...treeVisibleUnions.filter((u) => u.person_a_id === centerPersonId).map((u) => u.person_b_id),
249:     ...treeVisibleUnions.filter((u) => u.person_b_id === centerPersonId).map((u) => u.person_a_id),
250:   ];
251: 
252:   // Hermanos (hijos de los padres del nodo central que no sean el nodo central)
253:   let siblingIds: string[] = [];
254:   if (parentIds.length > 0) {
255:     siblingIds = Array.from(
256:       new Set(
257:         allParentEdges
258:           ?.filter((e) => parentIds.includes(e.parent_id) && e.child_id !== centerPersonId)
259:           .map((e) => e.child_id) ?? []
260:       )
261:     );
262:   }
263: 
264:   // Abuelos (padres de los padres)
265:   const grandParentIds: string[] = [];
266:   if (parentIds.length > 0) {
267:     const gps = allParentEdges?.filter((e) => parentIds.includes(e.child_id)).map((e) => e.parent_id) ?? [];
268:     grandParentIds.push(...gps);
269:   }
270: 
271:   // Parejas de hermanos
272:   const siblingSpouseIds: string[] = [];
273:   siblingIds.forEach((sibId) => {
274:     const sSpouses = [
275:       ...treeVisibleUnions.filter((u) => u.person_a_id === sibId).map((u) => u.person_b_id),
276:       ...treeVisibleUnions.filter((u) => u.person_b_id === sibId).map((u) => u.person_a_id),
277:     ];
278:     siblingSpouseIds.push(...sSpouses);
279:   });
280: 
281:   // Nietos (hijos de los hijos)
282:   let grandChildIds: string[] = [];
283:   if (childIds.length > 0) {
284:     grandChildIds = allParentEdges?.filter((e) => childIds.includes(e.parent_id)).map((e) => e.child_id) ?? [];
285:   }
286: 
287:   // Tíos (hermanos de los padres)
288:   let uncleAuntIds: string[] = [];
289:   if (grandParentIds.length > 0) {
290:     uncleAuntIds = Array.from(
291:       new Set(
292:         allParentEdges
293:           ?.filter((e) => grandParentIds.includes(e.parent_id) && !parentIds.includes(e.child_id))
294:           .map((e) => e.child_id) ?? []
295:       )
296:     );
297:   }
298: 
299:   // Parejas de tíos (por ejemplo la tía política / esposa del tío)
300:   const uncleSpouseIds: string[] = [];
301:   uncleAuntIds.forEach((uId) => {
302:     const uSpouses = [
303:       ...treeVisibleUnions.filter((u) => u.person_a_id === uId).map((u) => u.person_b_id),
304:       ...treeVisibleUnions.filter((u) => u.person_b_id === uId).map((u) => u.person_a_id),
305:     ];
306:     uncleSpouseIds.push(...uSpouses);
307:   });
308: 
309:   // Primos hermanos (hijos de tíos)
310:   let cousinIds: string[] = [];
311:   if (uncleAuntIds.length > 0) {
312:     cousinIds = Array.from(
313:       new Set(
314:         allParentEdges
315:           ?.filter((e) => uncleAuntIds.includes(e.parent_id))
316:           .map((e) => e.child_id) ?? []
317:       )
318:     );
319:   }
320: 
321:   // Sobrinos (hijos de los hermanos)
322:   let nephewNieceIds: string[] = [];
323:   if (siblingIds.length > 0) {
324:     nephewNieceIds = Array.from(
325:       new Set(
326:         allParentEdges
327:           ?.filter((e) => siblingIds.includes(e.parent_id))
328:           .map((e) => e.child_id) ?? []
329:       )
330:     );
331:   }
332: 
333:   // 8. FILTRADO POR NIVELES DE PERMISOS:
334:   let allowedNodeIds: string[] = [];
335: 
336:   if (isViewerGuest && viewerTier === "basic") {
337:     // Nivel Básico: Únicamente familia de casa (Padres, Hermanos, Cónyuge, Hijos)
338:     allowedNodeIds = [
339:       centerPersonId,
340:       ...parentIds,
341:       ...childIds,
342:       ...spouseIds,
343:       ...siblingIds,
344:     ];
345:   } else if (isViewerGuest && viewerTier === "intermediate") {
346:     // Nivel Intermedio: Familia de casa + extendida (Abuelos, Tíos, Primos, Sobrinos, Nietos, Parejas de tíos)
347:     allowedNodeIds = [
348:       centerPersonId,
349:       ...parentIds,
350:       ...childIds,
351:       ...spouseIds,
352:       ...siblingIds,
353:       ...grandParentIds,
354:       ...siblingSpouseIds,
355:       ...grandChildIds,
356:       ...uncleAuntIds,
357:       ...uncleSpouseIds,
358:       ...cousinIds,
359:       ...nephewNieceIds,
360:     ];
361:   } else {
362:     // Nivel Avanzado o visualización de árbol propio: Grafo completo
363:     allowedNodeIds = [
364:       centerPersonId,
365:       ...parentIds,
366:       ...grandParentIds,
367:       ...childIds,
368:       ...spouseIds,
369:       ...siblingIds,
370:       ...siblingSpouseIds,
371:       ...grandChildIds,
372:       ...uncleAuntIds,
373:       ...uncleSpouseIds,
374:       ...cousinIds,
375:       ...nephewNieceIds,
376:     ];
377:   }
378: 
379:   const nodeIds = Array.from(new Set(allowedNodeIds));
380: 
381:   // 9. Consultar los datos de todas las personas autorizadas en el grafo
382:   type PersonQueryResult = {
383:     id: string;
384:     first_name: string;
385:     middle_name?: string | null;
386:     last_name: string;
387:     maternal_last_name?: string | null;
388:     maiden_name: string | null;
389:     gender: Gender;
390:     birth_date: string | null;
391:     death_date: string | null;
392:     is_living: boolean;
393:     birth_place: string | null;
394:     bio: string | null;
395:     is_claimed: boolean;
396:     created_by_user_id: string | null;
397:   };
398: 
399:   let persons: PersonQueryResult[] | null = null;
400: 
401:   const { data: personsWithNewCols, error: personsError } = await supabase
402:     .from("persons")
403:     .select("id, first_name, middle_name, last_name, maternal_last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
404:     .in("id", nodeIds);
405: 
406:   if (personsError || !personsWithNewCols) {
407:     const { data: fallbackPersons } = await supabase
408:       .from("persons")
409:       .select("id, first_name, last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
410:       .in("id", nodeIds);
411: 
412:     persons = (fallbackPersons || []).map((p) => ({
413:       ...p,
414:       middle_name: null,
415:       maternal_last_name: null,
416:       gender: p.gender as Gender,
417:     }));
418:   } else {
419:     persons = (personsWithNewCols || []).map((p) => ({
420:       ...p,
421:       gender: p.gender as Gender,
422:     }));
423:   }
424: 
425:   if (!persons || persons.length === 0) {
426:     return {
427:       ...emptyResult,
428:       accessibleTrees,
429:     };
430:   }
431: 
432:   // 10. Consultar tokens de invitación (solo si es el dueño del árbol)
433:   let tokens: { token: string; person_id: string; status: string; expires_at: string; invited_email: string | null }[] | null = null;
434:   if (!isViewerGuest) {
435:     const { data: dbTokens } = await supabase
436:       .from("invitation_tokens")
437:       .select("token, person_id, status, expires_at, invited_email")
438:       .in("person_id", nodeIds)
439:       .order("created_at", { ascending: false });
440:     tokens = dbTokens;
441:   }
442: 
443:   // 11. Consultar validaciones acumuladas por persona
444:   const { data: endorsements } = await supabase
445:     .from("endorsements")
446:     .select("endorsed_id");
447: 
448:   const { count: activeUsersCount } = await supabase
449:     .from("persons")
450:     .select("id", { count: "exact", head: true })
451:     .eq("is_claimed", true);
452: 
453:   const quorumThreshold = Math.min(3, Math.max(1, activeUsersCount ?? 1));
454: 
455:   // Mapa de personas para inferencia de parentesco
456:   const personsMap = new Map<string, { id: string; firstName: string; middleName?: string | null; lastName: string; maternalLastName?: string | null; gender: Gender }>(
457:     persons.map((p) => [
458:       p.id,
459:       {
460:         id: p.id,
461:         firstName: p.first_name,
462:         middleName: p.middle_name,
463:         lastName: p.last_name,
464:         maternalLastName: p.maternal_last_name,
465:         gender: p.gender as Gender,
466:       },
467:     ])
468:   );
469: 
470:   // 12. Motor Topológico de Generaciones por BFS a partir del nodo central (centerPersonId = 0)
471:   const parentsOf = new Map<string, string[]>();
472:   const childrenOf = new Map<string, string[]>();
473:   const spousesOf = new Map<string, string[]>();
474: 
475:   allParentEdges?.forEach((e) => {
476:     const cList = childrenOf.get(e.parent_id) || [];
477:     if (!cList.includes(e.child_id)) cList.push(e.child_id);
478:     childrenOf.set(e.parent_id, cList);
479: 
480:     const pList = parentsOf.get(e.child_id) || [];
481:     if (!pList.includes(e.parent_id)) pList.push(e.parent_id);
482:     parentsOf.set(e.child_id, pList);
483:   });
484: 
485:   treeVisibleUnions.forEach((u) => {
486:     const aSpouses = spousesOf.get(u.person_a_id) || [];
487:     if (!aSpouses.includes(u.person_b_id)) aSpouses.push(u.person_b_id);
488:     spousesOf.set(u.person_a_id, aSpouses);
489: 
490:     const bSpouses = spousesOf.get(u.person_b_id) || [];
491:     if (!bSpouses.includes(u.person_a_id)) bSpouses.push(u.person_a_id);
492:     spousesOf.set(u.person_b_id, bSpouses);
493:   });
494: 
495:   const genMap = new Map<string, number>();
496:   genMap.set(centerPersonId, 0);
497: 
498:   const bfsQueue: string[] = [centerPersonId];
499:   const visited = new Set<string>([centerPersonId]);
500: 
501:   while (bfsQueue.length > 0) {
502:     const currId = bfsQueue.shift()!;
503:     const currGen = genMap.get(currId) ?? 0;
504: 
505:     // Progenitores (un nivel arriba: -1)
506:     const pList = parentsOf.get(currId) || [];
507:     pList.forEach((pId) => {
508:       if (!visited.has(pId)) {
509:         visited.add(pId);
510:         genMap.set(pId, currGen - 1);
511:         bfsQueue.push(pId);
512:       }
513:     });
514: 
515:     // Hijos (un nivel abajo: +1)
516:     const cList = childrenOf.get(currId) || [];
517:     cList.forEach((cId) => {
518:       if (!visited.has(cId)) {
519:         visited.add(cId);
520:         genMap.set(cId, currGen + 1);
521:         bfsQueue.push(cId);
522:       }
523:     });
524: 
525:     // Parejas / Cónyuges (mismo nivel generacional: 0)
526:     const sList = spousesOf.get(currId) || [];
527:     sList.forEach((sId) => {
528:       if (!visited.has(sId)) {
529:         visited.add(sId);
530:         genMap.set(sId, currGen);
531:         bfsQueue.push(sId);
532:       }
533:     });
534:   }
535: 
536:   // 13. Construir nodos con cálculo generacional exacto y afinidades
537:   const rawNodes: TreeNodeData[] = persons.map((p) => {
538:     const generation = genMap.get(p.id) ?? 0;
539: 
540:     const matchedUnion = allUnions?.find(
541:       (u) =>
542:         u.status !== "rejected" &&
543:         (u.person_a_id === p.id || u.person_b_id === p.id) &&
544:         (u.person_a_id === centerPersonId || u.person_b_id === centerPersonId || p.id !== centerPersonId)
545:     );
546: 
547:     const partnerId = matchedUnion
548:       ? matchedUnion.person_a_id === p.id
549:         ? matchedUnion.person_b_id
550:         : matchedUnion.person_a_id
551:       : null;
552: 
553:     const unionInfo = matchedUnion && partnerId
554:       ? {
555:           id: matchedUnion.id,
556:           unionType: matchedUnion.union_type,
557:           partnerId,
558:         }
559:       : null;
560: 
561:     const kinship = inferKinship({
562:       rootPersonId: centerPersonId,
563:       targetPersonId: p.id,
564:       targetGender: p.gender as Gender,
565:       parentEdges: allParentEdges ?? [],
566:       unions: allUnions ?? [],
567:       personsMap,
568:     });
569: 
570:     let relationshipLabel = kinship.relationshipLabel;
571:     let relationshipCategory = kinship.relationshipCategory;
572:     let relationshipExplanation = kinship.explanation;
573: 
574:     if (p.id === centerPersonId) {
575:       relationshipLabel = isViewerGuest ? "Persona Foco" : (centerPersonId === userPersonId ? "Tú" : "Persona Central");
576:       relationshipCategory = "self";
577:       relationshipExplanation = isViewerGuest ? `Árbol de ${treeOwnerName || "Amigo"}` : "Foco principal del árbol";
578:     } else if (parentIds.includes(p.id)) {
579:       relationshipCategory = "parent";
580:     } else if (grandParentIds.includes(p.id)) {
581:       // Abuelos no deben ser considerados 'parent' inmediato para no contaminar filtros de padres del usuario
582:       relationshipCategory = "other";
583:     } else if (childIds.includes(p.id)) {
584:       relationshipCategory = "child";
585:     } else if (spouseIds.includes(p.id)) {
586:       relationshipCategory = "spouse";
587:       if (matchedUnion?.union_type === "divorced") {
588:         relationshipLabel = "Ex-pareja (Divorciados)";
589:       } else if (matchedUnion?.union_type === "separated") {
590:         relationshipLabel = "Ex-pareja (Separados)";
591:       } else if (matchedUnion?.union_type === "partner" || matchedUnion?.union_type === "civil_union") {
592:         relationshipLabel = "Pareja (Unión Libre)";
593:       } else {
594:         relationshipLabel = "Cónyuge / Pareja";
595:       }
596:     } else if (siblingIds.includes(p.id)) {
597:       relationshipCategory = "sibling";
598:     } else if (siblingSpouseIds.includes(p.id)) {
599:       relationshipLabel = p.gender === "female" ? "Cuñada" : "Cuñado";
600:       relationshipCategory = "spouse";
601:       relationshipExplanation = "Pareja de hermano/a";
602:     } else if (uncleAuntIds.includes(p.id)) {
603:       relationshipCategory = "other";
604:     } else if (uncleSpouseIds.includes(p.id)) {
605:       relationshipLabel = p.gender === "female" ? "Tía política" : "Tío político";
606:       relationshipCategory = "other";
607:       relationshipExplanation = "Pareja de tío/a";
608:     } else if (nephewNieceIds.includes(p.id)) {
609:       relationshipCategory = "other";
610:     }
611: 
612:     const token = tokens?.find((t) => t.person_id === p.id);
613:     const personValidations = endorsements?.filter((e) => e.endorsed_id === p.id).length ?? 0;
614: 
615:     const personParents = allParentEdges?.filter((e) => e.child_id === p.id) ?? [];
616:     const parentConnections = personParents.map((e) => {
617:       const parentObj = personsMap.get(e.parent_id);
618:       return {
619:         id: e.id,
620:         parentId: e.parent_id,
621:         parentName: parentObj ? `${parentObj.firstName} ${parentObj.lastName}` : "Progenitor",
622:         relationshipType: e.relationship_type || "biological",
623:       };
624:     });
625: 
626:     const personChildren = allParentEdges?.filter((e) => e.parent_id === p.id) ?? [];
627:     const childConnections = personChildren.map((e) => {
628:       const childObj = personsMap.get(e.child_id);
629:       return {
630:         id: e.id,
631:         childId: e.child_id,
632:         childName: childObj ? `${childObj.firstName} ${childObj.lastName}` : "Descendiente",
633:         relationshipType: e.relationship_type || "biological",
634:       };
635:     });
636: 
637:     return {
638:       id: p.id,
639:       firstName: p.first_name,
640:       middleName: p.middle_name,
641:       lastName: p.last_name,
642:       maternalLastName: p.maternal_last_name,
643:       maidenName: p.maiden_name,
644:       gender: p.gender as Gender,
645:       birthDate: p.birth_date,
646:       deathDate: p.death_date,
647:       isLiving: p.is_living,
648:       birthPlace: p.birth_place,
649:       bio: p.bio,
650:       isClaimed: p.is_claimed,
651:       createdByUserId: p.created_by_user_id,
652:       generation,
653:       relationshipLabel,
654:       relationshipCategory,
655:       relationshipExplanation,
656:       accountEmail: isViewerGuest ? null : ((token?.invited_email && token.invited_email.trim() !== "") ? token.invited_email.trim() : null),
657:       parentConnections,
658:       childConnections,
659:       invitationStatus: isViewerGuest ? null : (token?.status ?? null),
660:       invitationToken: isViewerGuest ? null : (token?.token ?? null),
661:       unionInfo,
662:       validationsCount: personValidations,
663:       validationsNeeded: quorumThreshold,
664:       isReadyForInvite: !isViewerGuest && (personValidations >= quorumThreshold || isUserZero),
665:     };
666:   });
667: 
668:   // 14. Construir las aristas relevantes
669:   const edges: TreeEdgeData[] = [];
670: 
671:   allParentEdges?.forEach((e) => {
672:     if (nodeIds.includes(e.parent_id) && nodeIds.includes(e.child_id)) {
673:       edges.push({
674:         id: `pc-${e.id}`,
675:         sourceId: e.parent_id,
676:         targetId: e.child_id,
677:         type: "parent-child",
678:       });
679:     }
680:   });
681: 
682:   // Únicamente uniones conyugales explícitas registradas en base de datos
683:   treeVisibleUnions.forEach((u) => {
684:     if (nodeIds.includes(u.person_a_id) && nodeIds.includes(u.person_b_id)) {
685:       edges.push({
686:         id: `union-${u.id}`,
687:         sourceId: u.person_a_id,
688:         targetId: u.person_b_id,
689:         type: "union",
690:         unionType: u.union_type,
691:       });
692:     }
693:   });
694: 
695:   // 15. Cálculo de Posiciones Dinámicas por Generación con Distribución Bilateral Simétrica (Rama Materna vs Rama Paterna)
696:   const NODE_WIDTH = 220;
697:   const NODE_HEIGHT = 130;
698:   const GAP_X = 50;
699:   const GAP_Y = 150;
700: 
701:   // Identificar progenitores del foco para separación simétrica de ramas
702:   const motherPerson =
703:     rawNodes.find(
704:       (n) => parentIds.includes(n.id) && (n.gender === "female" || ((n.relationshipLabel || "").toLowerCase().includes("madre")))
705:     ) || (parentIds.length > 0 ? rawNodes.find((n) => n.id === parentIds[0]) : null);
706: 
707:   const fatherPerson =
708:     rawNodes.find(
709:       (n) => parentIds.includes(n.id) && n.id !== motherPerson?.id && (n.gender === "male" || ((n.relationshipLabel || "").toLowerCase().includes("padre")))
710:     ) || (parentIds.length > 1 ? rawNodes.find((n) => n.id === parentIds[1]) : null);
711: 
712:   const motherId = motherPerson?.id;
713:   const fatherId = fatherPerson?.id;
714:   const motherParents = motherId ? (parentsOf.get(motherId) || []) : [];
715:   const fatherParents = fatherId ? (parentsOf.get(fatherId) || []) : [];
716: 
717:   // Precalcular conjuntos planos sin recursión (evita stack overflow)
718:   const maternalIds = new Set<string>();
719:   if (motherId) maternalIds.add(motherId);
720:   motherParents.forEach((id) => maternalIds.add(id));
721: 
722:   const paternalIds = new Set<string>();
723:   if (fatherId) paternalIds.add(fatherId);
724:   fatherParents.forEach((id) => paternalIds.add(id));
725: 
726:   rawNodes.forEach((n) => {
727:     if (n.id === fatherId || n.id === motherId) return;
728: 
729:     const nParents = parentsOf.get(n.id) || [];
730:     const label = (n.relationshipLabel || "").toLowerCase();
731:     const explanation = (n.relationshipExplanation || "").toLowerCase();
732: 
733:     if (motherParents.length > 0 && nParents.some((p) => motherParents.includes(p))) {
734:       maternalIds.add(n.id);
735:     } else if (label.includes("matern") || explanation.includes("madre")) {
736:       maternalIds.add(n.id);
737:     }
738: 
739:     if (fatherParents.length > 0 && nParents.some((p) => fatherParents.includes(p))) {
740:       paternalIds.add(n.id);
741:     } else if (label.includes("patern") || explanation.includes("padre")) {
742:       paternalIds.add(n.id);
743:     }
744:   });
745: 
746:   // Parejas de tíos o cónyuges (un solo paso plano sin llamadas recursivas, sin cruzar unión de los padres)
747:   rawNodes.forEach((n) => {
748:     if (n.id === motherId || n.id === fatherId) return;
749:     const partnerId = n.unionInfo?.partnerId;
750:     if (partnerId) {
751:       if (partnerId === motherId || partnerId === fatherId) return;
752:       if (maternalIds.has(partnerId)) maternalIds.add(n.id);
753:       if (paternalIds.has(partnerId)) paternalIds.add(n.id);
754:     }
755:   });
756: 
757:   if (fatherId) maternalIds.delete(fatherId);
758:   if (motherId) paternalIds.delete(motherId);
759: 
760:   const allGens = Array.from(new Set(rawNodes.map((n) => n.generation))).sort((a, b) => a - b);
761:   const minGen = Math.min(...allGens, 0);
762:   const positionedNodes: TreeNodeData[] = [];
763: 
764:   allGens.forEach((gen) => {
765:     const genNodes = rawNodes.filter((n) => n.generation === gen);
766:     const count = genNodes.length;
767:     if (count === 0) return;
768: 
769:     // Ordenamiento inteligente en cada fila para asegurar cohesión visual y distribución por ramas familiares:
770:     genNodes.sort((a, b) => {
771:       if (gen === 0) {
772:         const getRank = (n: typeof rawNodes[0]) => {
773:           if (n.id === centerPersonId) return 20;
774:           if (spouseIds.includes(n.id)) return 10;
775:           if (siblingIds.includes(n.id)) {
776:             const isMat = maternalIds.has(n.id);
777:             const isPat = paternalIds.has(n.id);
778:             if (isMat && !isPat) return 15; // Medio hermano materno hacia la izquierda
779:             if (isPat && !isMat) return 25; // Medio hermano paterno hacia la derecha
780:             return 22; // Hermano de ambos progenitores
781:           }
782:           if (siblingSpouseIds.includes(n.id)) return 30;
783:           if (maternalIds.has(n.id)) return 5;
784:           if (paternalIds.has(n.id)) return 35;
785:           return 20;
786:         };
787:         return getRank(a) - getRank(b);
788:       } else if (gen === -1) {
789:         // Generación de Progenitores y Tíos:
790:         // Rama materna a la izquierda (pareja de tío materno -> tío materno -> madre)
791:         // Rama paterna a la derecha (padre -> tío paterno -> pareja de tío paterno)
792:         const getRank = (n: typeof rawNodes[0]) => {
793:           // Progenitores directos del foco (prioridad canónica fija)
794:           if (n.id === motherId) return 30;             // Madre (Rubi, centro-izquierda)
795:           if (n.id === fatherId) return 40;             // Padre (Jorge Andrés, centro-derecha)
796: 
797:           const mat = maternalIds.has(n.id);
798:           const pat = paternalIds.has(n.id);
799: 
800:           if (mat && !pat) {
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:03:38-06:00
Completed At: 2026-10-04T12:03:39-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/services/get-family-graph.ts`
Total Lines: 1061
Total Bytes: 36863
Showing lines 800 to 1061
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
800:           if (mat && !pat) {
801:             if (uncleSpouseIds.includes(n.id)) return 10; // Eva Godoy (extremo izquierdo)
802:             if (uncleAuntIds.includes(n.id)) return 20;   // Luis Rodriguez (al lado de su hermana Rubi)
803:             return 25;
804:           }
805: 
806:           if (pat && !mat) {
807:             if (uncleAuntIds.includes(n.id)) return 50;   // Tío paterno (al lado de papá)
808:             if (uncleSpouseIds.includes(n.id)) return 60; // Pareja de tío paterno (extremo derecho)
809:             return 45;
810:           }
811: 
812:           if (uncleSpouseIds.includes(n.id)) return 10;
813:           if (uncleAuntIds.includes(n.id)) return 20;
814:           return 25;
815:         };
816:         return getRank(a) - getRank(b);
817:       } else if (gen < -1) {
818:         // Abuelos / Bisabuelos:
819:         // Abuelos maternos a la izquierda, abuelos paternos a la derecha
820:         const getRank = (n: typeof rawNodes[0]) => {
821:           if (maternalIds.has(n.id)) return 10;
822:           if (paternalIds.has(n.id)) return 30;
823:           return 20;
824:         };
825:         return getRank(a) - getRank(b);
826:       } else {
827:         // Hijos directos al centro, sobrinos hacia la rama de su padre/madre
828:         const getRank = (n: typeof rawNodes[0]) => {
829:           if (childIds.includes(n.id)) return 20;
830:           if (nephewNieceIds.includes(n.id)) {
831:             if (maternalIds.has(n.id)) return 10;
832:             return 30;
833:           }
834:           if (grandChildIds.includes(n.id)) return 25;
835:           return 20;
836:         };
837:         return getRank(a) - getRank(b);
838:       }
839:     });
840: 
841:     const y = (gen - minGen) * (NODE_HEIGHT + GAP_Y);
842: 
843:     if (gen > 0) {
844:       // Posicionamiento de descendientes agrupados directamente bajo su rama parental (padres / tíos)
845:       const positionedMap = new Map(positionedNodes.map((n) => [n.id, n]));
846:       const clusterMap = new Map<
847:         string,
848:         {
849:           parentKey: string;
850:           targetCenterX: number;
851:           nodes: TreeNodeData[];
852:         }
853:       >();
854:       const assignedNodeIds = new Set<string>();
855: 
856:       // Fase 1: Agrupar hijos por unidad parental ya posicionada en generaciones superiores
857:       genNodes.forEach((node) => {
858:         const pIds = (parentsOf.get(node.id) || []).filter((pId) => positionedMap.has(pId));
859:         if (pIds.length > 0) {
860:           const pNodes = pIds.map((id) => positionedMap.get(id)!);
861:           const parentKey = pNodes.map((p) => p.id).sort().join("_");
862:           let targetCenterX = 0;
863: 
864:           if (pNodes.length >= 2) {
865:             targetCenterX = (pNodes[0].x! + pNodes[1].x! + NODE_WIDTH) / 2;
866:           } else {
867:             targetCenterX = pNodes[0].x! + NODE_WIDTH / 2;
868:           }
869: 
870:           if (!clusterMap.has(parentKey)) {
871:             clusterMap.set(parentKey, {
872:               parentKey,
873:               targetCenterX,
874:               nodes: [],
875:             });
876:           }
877:           clusterMap.get(parentKey)!.nodes.push(node);
878:           assignedNodeIds.add(node.id);
879:         }
880:       });
881: 
882:       // Fase 2: Cónyuges/parejas de miembros ya agrupados (colocar contiguos a su pareja)
883:       genNodes.forEach((node) => {
884:         if (assignedNodeIds.has(node.id)) return;
885:         const partnerId = node.unionInfo?.partnerId;
886:         if (partnerId) {
887:           for (const cluster of clusterMap.values()) {
888:             const partnerIdx = cluster.nodes.findIndex((n) => n.id === partnerId);
889:             if (partnerIdx !== -1) {
890:               cluster.nodes.splice(partnerIdx + 1, 0, node);
891:               assignedNodeIds.add(node.id);
892:               break;
893:             }
894:           }
895:         }
896:       });
897: 
898:       // Fase 3: Nodos sin progenitores ni parejas identificados en el árbol
899:       genNodes.forEach((node) => {
900:         if (assignedNodeIds.has(node.id)) return;
901:         const key = `orphan_${node.id}`;
902:         let targetCenterX = 0;
903:         if (maternalIds.has(node.id)) targetCenterX = -300;
904:         else if (paternalIds.has(node.id)) targetCenterX = 300;
905: 
906:         clusterMap.set(key, {
907:           parentKey: key,
908:           targetCenterX,
909:           nodes: [node],
910:         });
911:         assignedNodeIds.add(node.id);
912:       });
913: 
914:       const clusters = Array.from(clusterMap.values()).map((c) => {
915:         const k = c.nodes.length;
916:         const width = k * NODE_WIDTH + (k - 1) * GAP_X;
917:         return {
918:           ...c,
919:           width,
920:         };
921:       });
922: 
923:       // Ordenar grupos de descendientes de izquierda a derecha según el centro X de sus progenitores
924:       clusters.sort((a, b) => a.targetCenterX - b.targetCenterX);
925: 
926:       // Algoritmo de relajación por mínimos cuadrados y evasión de colisiones por bloques contiguos
927:       let blocks = clusters.map((c) => ({
928:         clusters: [c],
929:         offsets: [0],
930:       }));
931: 
932:       const computeBlockPositions = (block: typeof blocks[0]) => {
933:         const k = block.clusters.length;
934:         let sum = 0;
935:         for (let j = 0; j < k; j++) {
936:           sum += block.clusters[j].targetCenterX - block.offsets[j];
937:         }
938:         const c0Center = sum / k;
939:         const startX = c0Center - block.clusters[0].width / 2;
940:         const lastClusterIdx = k - 1;
941:         const lastCenter = c0Center + block.offsets[lastClusterIdx];
942:         const endX = lastCenter + block.clusters[lastClusterIdx].width / 2;
943:         const totalSpan = endX - startX;
944:         return { c0Center, startX, endX, totalSpan };
945:       };
946: 
947:       let merged = true;
948:       while (merged && blocks.length > 1) {
949:         merged = false;
950:         const newBlocks: typeof blocks = [];
951:         let i = 0;
952:         while (i < blocks.length) {
953:           let curr = blocks[i];
954:           let currPos = computeBlockPositions(curr);
955: 
956:           while (i + 1 < blocks.length) {
957:             const next = blocks[i + 1];
958:             const nextPos = computeBlockPositions(next);
959: 
960:             if (currPos.endX + GAP_X > nextPos.startX) {
961:               const lastClusterIdx = curr.clusters.length - 1;
962:               const lastCluster = curr.clusters[lastClusterIdx];
963:               const nextFirstCluster = next.clusters[0];
964: 
965:               const bridgeGap =
966:                 lastCluster.width / 2 + GAP_X + nextFirstCluster.width / 2;
967:               const baseOffset = curr.offsets[lastClusterIdx] + bridgeGap;
968: 
969:               const combinedClusters = [...curr.clusters, ...next.clusters];
970:               const combinedOffsets = [
971:                 ...curr.offsets,
972:                 ...next.offsets.map((o) => baseOffset + o),
973:               ];
974: 
975:               curr = {
976:                 clusters: combinedClusters,
977:                 offsets: combinedOffsets,
978:               };
979:               currPos = computeBlockPositions(curr);
980:               merged = true;
981:               i++;
982:             } else {
983:               break;
984:             }
985:           }
986:           newBlocks.push(curr);
987:           i++;
988:         }
989:         blocks = newBlocks;
990:       }
991: 
992:       blocks.forEach((block) => {
993:         const { c0Center } = computeBlockPositions(block);
994:         block.clusters.forEach((cluster, j) => {
995:           const clusterCenter = c0Center + block.offsets[j];
996:           const clusterStartX = clusterCenter - cluster.width / 2;
997:           cluster.nodes.forEach((node, nodeIdx) => {
998:             const x = clusterStartX + nodeIdx * (NODE_WIDTH + GAP_X);
999:             positionedNodes.push({
1000:               ...node,
1001:               x,
1002:               y,
1003:             });
1004:           });
1005:         });
1006:       });
1007:     } else {
1008:       // Para gen <= 0 (foco y ancestros), centrado bilateral simétrico regular
1009:       const totalWidth = count * NODE_WIDTH + (count - 1) * GAP_X;
1010:       const startX = -totalWidth / 2;
1011: 
1012:       genNodes.forEach((node, index) => {
1013:         const x = startX + index * (NODE_WIDTH + GAP_X);
1014:         positionedNodes.push({
1015:           ...node,
1016:           x,
1017:           y,
1018:         });
1019:       });
1020:     }
1021:   });
1022: 
1023:   const availableMembers = Array.from(
1024:     new Map(
1025:       positionedNodes.map((n) => [
1026:         n.id,
1027:         {
1028:           id: n.id,
1029:           firstName: n.firstName,
1030:           lastName: n.lastName,
1031:           gender: n.gender,
1032:           relationshipLabel: n.relationshipLabel || "Familiar",
1033:         },
1034:       ])
1035:     ).values()
1036:   );
1037: 
1038:   return {
1039:     nodes: positionedNodes,
1040:     edges,
1041:     focusPerson: {
1042:       id: centerPerson.id,
1043:       firstName: centerPerson.first_name,
1044:       lastName: centerPerson.last_name,
1045:       gender: centerPerson.gender as Gender,
1046:       relationshipLabel: isViewerGuest
1047:         ? `Titular (${treeOwnerName || "Amigo"})`
1048:         : centerPersonId === userPersonId
1049:         ? "Tú"
1050:         : "Familiar Seleccionado",
1051:       isSelf: !isViewerGuest && centerPersonId === userPersonId,
1052:     },
1053:     availableMembers,
1054:     isUserZero,
1055:     viewerTier,
1056:     isViewerGuest,
1057:     treeOwnerName,
1058:     accessibleTrees,
1059:   };
1060: }
1061: 
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`, `view_file`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:03:38-06:00
Completed At: 2026-10-04T12:03:39-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/utils/kinship-inference.ts`
Total Lines: 421
Total Bytes: 14491
Showing lines 1 to 421
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
1: import type { Gender } from "@/types/database.types";
2: 
3: export interface KinshipPersonMeta {
4:   id: string;
5:   firstName: string;
6:   middleName?: string | null;
7:   lastName: string;
8:   maternalLastName?: string | null;
9:   gender: Gender;
10: }
11: 
12: export interface ParentChildEdgeMeta {
13:   parent_id: string;
14:   child_id: string;
15:   relationship_type?: string;
16: }
17: 
18: export interface UnionEdgeMeta {
19:   id?: string;
20:   person_a_id: string;
21:   person_b_id: string;
22:   union_type: string;
23:   status?: string | null;
24: }
25: 
26: export interface InferredKinship {
27:   relationshipLabel: string;
28:   relationshipCategory: "self" | "parent" | "child" | "sibling" | "spouse" | "other";
29:   explanation?: string;
30:   degree?: number;
31:   isSuggestion?: boolean;
32: }
33: 
34: /**
35:  * Motor de Inferencia Inteligente de Parentescos (Kinship Inference Engine)
36:  * Deduce las relaciones genealógicas y familiares entre una persona raíz y cualquier otra persona en la red.
37:  */
38: export function inferKinship({
39:   rootPersonId,
40:   targetPersonId,
41:   targetGender,
42:   parentEdges,
43:   unions,
44:   personsMap,
45: }: {
46:   rootPersonId: string;
47:   targetPersonId: string;
48:   targetGender: Gender;
49:   parentEdges: ParentChildEdgeMeta[];
50:   unions: UnionEdgeMeta[];
51:   personsMap?: Map<string, KinshipPersonMeta>;
52: }): InferredKinship {
53:   const isFemale = targetGender === "female";
54:   const isMale = targetGender === "male";
55: 
56:   // 1. Identidad propia
57:   if (rootPersonId === targetPersonId) {
58:     return {
59:       relationshipLabel: "Tú",
60:       relationshipCategory: "self",
61:       explanation: "Nodo personal activo",
62:       degree: 0,
63:     };
64:   }
65: 
66:   // 2. Padres e Hijos directos
67:   const isParent = parentEdges.some(
68:     (e) => e.parent_id === targetPersonId && e.child_id === rootPersonId
69:   );
70:   if (isParent) {
71:     return {
72:       relationshipLabel: isFemale ? "Madre" : isMale ? "Padre" : "Progenitor",
73:       relationshipCategory: "parent",
74:       explanation: "Progenitor directo",
75:       degree: 1,
76:     };
77:   }
78: 
79:   const isChild = parentEdges.some(
80:     (e) => e.parent_id === rootPersonId && e.child_id === targetPersonId
81:   );
82:   if (isChild) {
83:     return {
84:       relationshipLabel: isFemale ? "Hija" : isMale ? "Hijo" : "Descendiente",
85:       relationshipCategory: "child",
86:       explanation: "Hijo/a directo",
87:       degree: 1,
88:     };
89:   }
90: 
91:   // 3. Cónyuge o Pareja directa
92:   const directUnion = unions.find(
93:     (u) =>
94:       u.status !== "rejected" &&
95:       ((u.person_a_id === rootPersonId && u.person_b_id === targetPersonId) ||
96:         (u.person_b_id === rootPersonId && u.person_a_id === targetPersonId))
97:   );
98: 
99:   if (directUnion) {
100:     let label = "Cónyuge / Pareja";
101:     if (directUnion.union_type === "divorced") label = "Ex-pareja (Divorciados)";
102:     else if (directUnion.union_type === "separated") label = "Ex-pareja (Separados)";
103:     else if (directUnion.union_type === "partner" || directUnion.union_type === "civil_union")
104:       label = "Pareja (Unión Libre)";
105:     else if (directUnion.union_type === "married")
106:       label = isFemale ? "Esposa" : isMale ? "Esposo" : "Cónyuge";
107: 
108:     return {
109:       relationshipLabel: label,
110:       relationshipCategory: "spouse",
111:       explanation: "Vínculo conyugal registrado",
112:       degree: 1,
113:     };
114:   }
115: 
116:   // Progenitores de la raíz y del objetivo
117:   const rootParentIds = parentEdges
118:     .filter((e) => e.child_id === rootPersonId)
119:     .map((e) => e.parent_id);
120: 
121:   const targetParentIds = parentEdges
122:     .filter((e) => e.child_id === targetPersonId)
123:     .map((e) => e.parent_id);
124: 
125:   // 3.1 Padrastro / Madrastra (Cónyuge o Pareja de un progenitor de la raíz que no es progenitor biológico de la raíz)
126:   if (rootParentIds.length > 0 && !rootParentIds.includes(targetPersonId)) {
127:     const stepParentUnion = unions.find(
128:       (u) =>
129:         u.status !== "rejected" &&
130:         ((rootParentIds.includes(u.person_a_id) && u.person_b_id === targetPersonId) ||
131:          (rootParentIds.includes(u.person_b_id) && u.person_a_id === targetPersonId))
132:     );
133: 
134:     if (stepParentUnion) {
135:       const connectedParentId = rootParentIds.includes(stepParentUnion.person_a_id)
136:         ? stepParentUnion.person_a_id
137:         : stepParentUnion.person_b_id;
138:       const connectedParent = personsMap?.get(connectedParentId);
139:       const isMaternal = connectedParent?.gender === "female";
140:       const parentName = connectedParent ? connectedParent.firstName : "";
141: 
142:       const rootMeta = personsMap?.get(rootPersonId);
143:       const targetMeta = personsMap?.get(targetPersonId);
144:       const surnameDivergence =
145:         rootMeta?.lastName && targetMeta?.lastName &&
146:         rootMeta.lastName.trim().toLowerCase() !== targetMeta.lastName.trim().toLowerCase();
147: 
148:       return {
149:         relationshipLabel: isFemale ? "Madrastra" : isMale ? "Padrastro" : "Padrastro/Madrastra",
150:         relationshipCategory: "parent",
151:         explanation: `Cónyuge/pareja de tu ${isMaternal ? "madre" : "padre"} ${parentName}${
152:           surnameDivergence ? ` (apellidos distintos: ${targetMeta?.lastName ?? ""})` : ""
153:         }`.trim(),
154:         degree: 1,
155:       };
156:     }
157:   }
158: 
159:   // 3.2 Hijastro / Hijastra (Hijo/a de la pareja de la raíz que no es hijo biológico de la raíz)
160:   const rootSpouses = unions
161:     .filter((u) => u.status !== "rejected")
162:     .map((u) => (u.person_a_id === rootPersonId ? u.person_b_id : u.person_b_id === rootPersonId ? u.person_a_id : null))
163:     .filter(Boolean) as string[];
164: 
165:   const rootChildIds = parentEdges
166:     .filter((e) => e.parent_id === rootPersonId)
167:     .map((e) => e.child_id);
168: 
169:   if (rootSpouses.length > 0 && !rootChildIds.includes(targetPersonId)) {
170:     const isChildOfSpouse = rootSpouses.some((spId) => targetParentIds.includes(spId));
171:     if (isChildOfSpouse) {
172:       const spouseId = rootSpouses.find((spId) => targetParentIds.includes(spId))!;
173:       const spouseObj = personsMap?.get(spouseId);
174:       return {
175:         relationshipLabel: isFemale ? "Hijastra" : isMale ? "Hijastro" : "Hijastro/a",
176:         relationshipCategory: "child",
177:         explanation: `Hijo/a de tu pareja ${spouseObj?.firstName ?? ""}`.trim(),
178:         degree: 1,
179:       };
180:     }
181:   }
182: 
183:   const sharedParentIds = rootParentIds.filter((pId) => targetParentIds.includes(pId));
184: 
185:   // 4. Hermanos o Medios Hermanos
186:   if (sharedParentIds.length > 0) {
187:     const rootMeta = personsMap?.get(rootPersonId);
188:     const targetMeta = personsMap?.get(targetPersonId);
189: 
190:     const differentPaternal = Boolean(
191:       rootMeta?.lastName &&
192:       targetMeta?.lastName &&
193:       rootMeta.lastName.trim().toLowerCase() !== targetMeta.lastName.trim().toLowerCase()
194:     );
195: 
196:     // Son hermanos completos si comparten 2 progenitores O si tienen un solo progenitor registrado pero sus apellidos coinciden plenamente
197:     const isFullSibling =
198:       sharedParentIds.length >= 2 ||
199:       (rootParentIds.length === 1 && targetParentIds.length === 1 && !differentPaternal);
200: 
201:     if (isFullSibling) {
202:       return {
203:         relationshipLabel: isFemale ? "Hermana" : isMale ? "Hermano" : "Hermano/a",
204:         relationshipCategory: "sibling",
205:         explanation: "Comparte tus mismos progenitores",
206:         degree: 2,
207:       };
208:     } else {
209:       const commonParent = personsMap?.get(sharedParentIds[0]);
210:       const isMaternal = commonParent?.gender === "female";
211:       const parentName = commonParent ? `por parte de tu ${isMaternal ? "madre" : "padre"} ${commonParent.firstName}` : "";
212:       const surnameNote = differentPaternal ? "(diferente apellido paterno)" : "";
213: 
214:       return {
215:         relationshipLabel: isFemale ? "Media hermana" : isMale ? "Medio hermano" : "Medio hermano/a",
216:         relationshipCategory: "sibling",
217:         explanation: `Medio/a hermano/a ${parentName} ${surnameNote}`.trim(),
218:         degree: 2,
219:       };
220:     }
221:   }
222: 
223:   // 5. Abuelos (padres de los progenitores)
224:   if (rootParentIds.length > 0) {
225:     const connectingParentId = rootParentIds.find((pId) =>
226:       parentEdges.some((e) => e.parent_id === targetPersonId && e.child_id === pId)
227:     );
228: 
229:     if (connectingParentId) {
230:       const parentObj = personsMap?.get(connectingParentId);
231:       const isMaternal = parentObj?.gender === "female";
232:       const parentName = parentObj ? `madre/padre de tu ${parentObj.gender === "female" ? "madre" : "padre"} ${parentObj.firstName}` : "";
233: 
234:       return {
235:         relationshipLabel: isFemale
236:           ? `Abuela ${isMaternal ? "materna" : "paterna"}`
237:           : isMale
238:           ? `Abuelo ${isMaternal ? "materno" : "paterno"}`
239:           : "Abuelo/a",
240:         relationshipCategory: "parent",
241:         explanation: `Progenitor/a ${parentName}`,
242:         degree: 2,
243:       };
244:     }
245:   }
246: 
247:   // 6. Nietos (hijos de los hijos)
248:   if (rootChildIds.length > 0) {
249:     const connectingChildId = rootChildIds.find((cId) =>
250:       parentEdges.some((e) => e.parent_id === cId && e.child_id === targetPersonId)
251:     );
252: 
253:     if (connectingChildId) {
254:       const childObj = personsMap?.get(connectingChildId);
255:       const childName = childObj ? `hijo/a de tu ${childObj.gender === "female" ? "hija" : "hijo"} ${childObj.firstName}` : "";
256: 
257:       return {
258:         relationshipLabel: isFemale ? "Nieta" : isMale ? "Nieto" : "Nieto/a",
259:         relationshipCategory: "child",
260:         explanation: `Descendiente directo: ${childName}`,
261:         degree: 2,
262:       };
263:     }
264:   }
265: 
266:   // 7. Tíos / Tías (hermanos de los progenitores de la raíz)
267:   if (rootParentIds.length > 0) {
268:     for (const parentId of rootParentIds) {
269:       const grandParentIdsOfParent = parentEdges
270:         .filter((e) => e.child_id === parentId)
271:         .map((e) => e.parent_id);
272: 
273:       // Si target comparte padres con este parentId
274:       const targetIsSiblingOfParent =
275:         grandParentIdsOfParent.length > 0 &&
276:         targetParentIds.some((tpId) => grandParentIdsOfParent.includes(tpId)) &&
277:         targetPersonId !== parentId;
278: 
279:       if (targetIsSiblingOfParent) {
280:         const parentObj = personsMap?.get(parentId);
281:         const isMaternal = parentObj?.gender === "female";
282:         return {
283:           relationshipLabel: isFemale
284:             ? isMaternal
285:               ? "Tía materna"
286:               : "Tía paterna"
287:             : isMale
288:             ? isMaternal
289:               ? "Tío materno"
290:               : "Tío paterno"
291:             : "Tío/a",
292:           relationshipCategory: "other",
293:           explanation: `Hermano/a de tu ${isMaternal ? "madre" : "padre"} ${parentObj ? parentObj.firstName : ""}`.trim(),
294:           degree: 3,
295:           isSuggestion: true,
296:         };
297:       }
298:     }
299:   }
300: 
301:   // 8. Sobrinos / Sobrinas (hijos de los hermanos de la raíz)
302:   if (rootParentIds.length > 0 && targetParentIds.length > 0) {
303:     // Buscar si alguno de los padres de target es hermano de la raíz
304:     for (const tpId of targetParentIds) {
305:       const tpParentIds = parentEdges
306:         .filter((e) => e.child_id === tpId)
307:         .map((e) => e.parent_id);
308: 
309:       const isSiblingOfRoot =
310:         tpParentIds.some((pId) => rootParentIds.includes(pId)) && tpId !== rootPersonId;
311: 
312:       if (isSiblingOfRoot) {
313:         const siblingObj = personsMap?.get(tpId);
314:         return {
315:           relationshipLabel: isFemale ? "Sobrina" : isMale ? "Sobrino" : "Sobrino/a",
316:           relationshipCategory: "other",
317:           explanation: `Hijo/a de tu ${siblingObj?.gender === "female" ? "hermana" : "hermano"} ${siblingObj ? siblingObj.firstName : ""}`.trim(),
318:           degree: 3,
319:           isSuggestion: true,
320:         };
321:       }
322:     }
323:   }
324: 
325:   // 9. Primos Hermanos (hijos de los tíos)
326:   if (rootParentIds.length > 0 && targetParentIds.length > 0) {
327:     // Abuelos de la raíz
328:     const grandParentIdsOfRoot = parentEdges
329:       .filter((e) => rootParentIds.includes(e.child_id))
330:       .map((e) => e.parent_id);
331: 
332:     // Abuelos del target
333:     const grandParentIdsOfTarget = parentEdges
334:       .filter((e) => targetParentIds.includes(e.child_id))
335:       .map((e) => e.parent_id);
336: 
337:     const shareGrandparents = grandParentIdsOfRoot.some((gpId) =>
338:       grandParentIdsOfTarget.includes(gpId)
339:     );
340: 
341:     if (shareGrandparents) {
342:       return {
343:         relationshipLabel: isFemale ? "Prima hermana" : isMale ? "Primo hermano" : "Primo/a hermano/a",
344:         relationshipCategory: "other",
345:         explanation: "Comparte abuelos en común con tu familia",
346:         degree: 4,
347:         isSuggestion: true,
348:       };
349:     }
350:   }
351: 
352:   // 10. Familia Política (Familiares por Unión Conyugal)
353:   // Cuñado/a (hermano de cónyuge o cónyuge de hermano)
354:   // 10.1 Hermano de tu cónyuge -> Cuñado/a
355:   for (const spId of rootSpouses) {
356:     const spParentIds = parentEdges.filter((e) => e.child_id === spId).map((e) => e.parent_id);
357:     if (spParentIds.length > 0 && targetParentIds.some((tpId) => spParentIds.includes(tpId)) && targetPersonId !== spId) {
358:       return {
359:         relationshipLabel: isFemale ? "Cuñada" : isMale ? "Cuñado" : "Cuñado/a",
360:         relationshipCategory: "spouse",
361:         explanation: "Hermano/a de tu cónyuge",
362:         degree: 2,
363:       };
364:     }
365: 
366:     // 10.2 Progenitor de tu cónyuge -> Suegro/a
367:     if (spParentIds.includes(targetPersonId)) {
368:       return {
369:         relationshipLabel: isFemale ? "Suegra" : isMale ? "Suegro" : "Suegro/a",
370:         relationshipCategory: "parent",
371:         explanation: "Progenitor/a de tu cónyuge",
372:         degree: 2,
373:       };
374:     }
375:   }
376: 
377:   // Fallback por defecto
378:   return {
379:     relationshipLabel: isFemale ? "Familiar (Femenino)" : isMale ? "Familiar (Masculino)" : "Familiar",
380:     relationshipCategory: "other",
381:     explanation: "Familiar de la red genealógica",
382:   };
383: }
384: 
385: /**
386:  * Obtiene los identificadores de todas las personas conectadas a la red familiar de startPersonId
387:  * a través de relaciones verticales (padres-hijos) y uniones visibles.
388:  */
389: export function getConnectedFamilyIds(
390:   startPersonId: string,
391:   parentEdges: { parent_id: string; child_id: string }[],
392:   unions: { person_a_id: string; person_b_id: string }[]
393: ): Set<string> {
394:   const adj = new Map<string, Set<string>>();
395:   const addEdge = (a: string, b: string) => {
396:     if (!adj.has(a)) adj.set(a, new Set());
397:     if (!adj.has(b)) adj.set(b, new Set());
398:     adj.get(a)!.add(b);
399:     adj.get(b)!.add(a);
400:   };
401: 
402:   parentEdges.forEach((e) => addEdge(e.parent_id, e.child_id));
403:   unions.forEach((u) => addEdge(u.person_a_id, u.person_b_id));
404: 
405:   const visited = new Set<string>([startPersonId]);
406:   const queue = [startPersonId];
407:   while (queue.length > 0) {
408:     const curr = queue.shift()!;
409:     const neighbors = adj.get(curr);
410:     if (neighbors) {
411:       for (const n of neighbors) {
412:         if (!visited.has(n)) {
413:           visited.add(n);
414:           queue.push(n);
415:         }
416:       }
417:     }
418:   }
419:   return visited;
420: }
421: 
The above content shows the entire, complete file contents of the requested file.


---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `grep_search`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:03:44-06:00
Completed At: 2026-10-04T12:03:44-06:00
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":24,"LineContent":"export async function getFamilyMembers(perspectivePersonId?: string): Promise\u003cFamilyMemberItem[]\u003e {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":251,"LineContent":"export async function createFamilyMemberAction(formData: FormData) {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":575,"LineContent":"export async function updateFamilyMemberAction(formData: FormData) {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":699,"LineContent":"export async function deleteFamilyMemberAction(personId: string) {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":761,"LineContent":"export async function updateUnionStatusAction({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":828,"LineContent":"export async function dissolveUnionAction({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":967,"LineContent":"export async function getAvailableAnchors(): Promise\u003c{ id: string; name: string }[]\u003e {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":997,"LineContent":"export async function searchPersonsAction("}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":1144,"LineContent":"export async function resetPersonClaimAction(personId: string) {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":1246,"LineContent":"export async function updatePersonParentsAction({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":1334,"LineContent":"export async function unlinkParentChildAction({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":1369,"LineContent":"export async function convertParentToSiblingAction({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":1459,"LineContent":"export async function endorseFamilyMemberAction(endorsedPersonId: string) {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":1525,"LineContent":"export async function getEndorsementManagementDataAction(): Promise\u003c{"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":1599,"LineContent":"export async function removeEndorsementAction(endorsedPersonId: string) {"}

---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:03:48-06:00
Completed At: 2026-10-04T12:03:48-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts`
Total Lines: 1629
Total Bytes: 52168
Showing lines 251 to 575
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
251: export async function createFamilyMemberAction(formData: FormData) {
252:   const supabase = await createClient();
253:   const {
254:     data: { user },
255:   } = await supabase.auth.getUser();
256: 
257:   if (!user) {
258:     return { error: "Debes estar autenticado para registrar familiares." };
259:   }
260: 
261:   // Obtener person_id del usuario y permisos
262:   const { data: profile } = await supabase
263:     .from("profiles")
264:     .select("person_id, is_user_zero")
265:     .eq("id", user.id)
266:     .single();
267: 
268:   if (!profile?.person_id) {
269:     return { error: "No tienes una ficha genealógica activa." };
270:   }
271: 
272:   // Familiar de Referencia (Anchor): permite al usuario construir ramas familiares
273:   const requestedAnchorId = (formData.get("anchor_person_id") as string)?.trim();
274:   const currentPersonId = requestedAnchorId || profile.person_id;
275: 
276:   // REGLA ESTRICTA DE PRIVACIDAD Y SEGURIDAD:
277:   // Si se solicita anclar a un perfil distinto al del usuario actual, verificar que no sea una ficha reclamada por otro usuario.
278:   if (requestedAnchorId && requestedAnchorId !== profile.person_id) {
279:     const { data: anchorPerson } = await supabase
280:       .from("persons")
281:       .select("id, is_claimed, first_name, last_name")
282:       .eq("id", requestedAnchorId)
283:       .maybeSingle();
284: 
285:     if (anchorPerson?.is_claimed) {
286:       return {
287:         error: `No tienes autorización para agregar familiares al perfil verificado de ${anchorPerson.first_name} ${anchorPerson.last_name}. Solo el propio titular puede agregar parientes respecto a su ficha personal.`,
288:       };
289:     }
290:   }
291: 
292:   const firstName = (formData.get("first_name") as string)?.trim();
293:   const middleName = (formData.get("middle_name") as string)?.trim() || null;
294:   const lastName = (formData.get("last_name") as string)?.trim();
295:   const maternalLastName = (formData.get("maternal_last_name") as string)?.trim() || null;
296:   const gender = (formData.get("gender") as Gender) || "unknown";
297:   const birthDate = (formData.get("birth_date") as string) || null;
298:   const isLiving = formData.get("is_living") === "true";
299:   const relationship = (formData.get("relationship") as FamilyRelationshipType) || "father";
300:   const siblingType = (formData.get("sibling_type") as "both" | "maternal" | "paternal") || "both";
301:   const createUnion = formData.get("create_union") === "true";
302:   const inviteEmail = (formData.get("invite_email") as string)?.trim() || null;
303: 
304:   if (!firstName || !lastName) {
305:     return { error: "El primer nombre y el apellido paterno son obligatorios." };
306:   }
307: 
308:   // 1. Crear el nuevo nodo en persons (is_claimed = false)
309:   let newPerson: { id: string } | null = null;
310:   let personError: { message: string } | null = null;
311: 
312:   const insertWithNewFields = await supabase
313:     .from("persons")
314:     .insert({
315:       first_name: firstName,
316:       middle_name: middleName,
317:       last_name: lastName,
318:       maternal_last_name: maternalLastName,
319:       gender,
320:       birth_date: birthDate,
321:       is_living: isLiving,
322:       is_claimed: false,
323:       created_by_user_id: user.id,
324:     })
325:     .select("id")
326:     .single();
327: 
328:   if (insertWithNewFields.error) {
329:     // Reintentar sin columnas nuevas si la migración aún no se ejecuta en la BD
330:     const fallbackInsert = await supabase
331:       .from("persons")
332:       .insert({
333:         first_name: firstName,
334:         last_name: lastName,
335:         gender,
336:         birth_date: birthDate,
337:         is_living: isLiving,
338:         is_claimed: false,
339:         created_by_user_id: user.id,
340:       })
341:       .select("id")
342:       .single();
343: 
344:     newPerson = fallbackInsert.data;
345:     personError = fallbackInsert.error;
346:   } else {
347:     newPerson = insertWithNewFields.data;
348:   }
349: 
350:   if (personError || !newPerson) {
351:     return { error: `Error creando ficha familiar: ${personError?.message}` };
352:   }
353: 
354:   const newPersonId = newPerson.id;
355: 
356:   // 2. Crear las aristas (Edges) según la relación
357:   if (relationship === "father" || relationship === "mother") {
358:     // 2.1 Vincular el nuevo padre/madre con la persona de referencia (anchor)
359:     await supabase.from("parent_child_edges").insert({
360:       parent_id: newPersonId,
361:       child_id: currentPersonId,
362:       relationship_type: "biological",
363:       status: "confirmed",
364:       created_by_user_id: user.id,
365:     });
366: 
367:     // 2.2 ÚNICAMENTE si el usuario confirmó explícitamente crear la unión matrimonial/pareja con el otro progenitor
368:     if (createUnion) {
369:       const { data: existingParents } = await supabase
370:         .from("parent_child_edges")
371:         .select("parent_id")
372:         .eq("child_id", currentPersonId);
373: 
374:       if (existingParents && existingParents.length > 0) {
375:         for (const ep of existingParents) {
376:           if (ep.parent_id !== newPersonId) {
377:             // Verificar si ya existe alguna unión entre ambos
378:             const { data: existingUnion } = await supabase
379:               .from("union_edges")
380:               .select("id")
381:               .or(`and(person_a_id.eq.${ep.parent_id},person_b_id.eq.${newPersonId}),and(person_a_id.eq.${newPersonId},person_b_id.eq.${ep.parent_id})`)
382:               .maybeSingle();
383: 
384:             if (!existingUnion) {
385:               await supabase.from("union_edges").insert({
386:                 person_a_id: ep.parent_id,
387:                 person_b_id: newPersonId,
388:                 union_type: "married",
389:                 status: "confirmed",
390:                 created_by_user_id: user.id,
391:               });
392:             }
393:           }
394:         }
395:       }
396:     }
397:   } else if (relationship === "son" || relationship === "daughter") {
398:     // 2.4 Vincular el hijo con la persona de referencia
399:     await supabase.from("parent_child_edges").insert({
400:       parent_id: currentPersonId,
401:       child_id: newPersonId,
402:       relationship_type: "biological",
403:       status: "confirmed",
404:       created_by_user_id: user.id,
405:     });
406: 
407:     // Si la persona de referencia tiene cónyuge/pareja actual, vincular al hijo también con la pareja
408:     const { data: spousesA } = await supabase
409:       .from("union_edges")
410:       .select("person_b_id, union_type")
411:       .eq("person_a_id", currentPersonId)
412:       .not("union_type", "in", '("divorced","separated")');
413: 
414:     const { data: spousesB } = await supabase
415:       .from("union_edges")
416:       .select("person_a_id, union_type")
417:       .eq("person_b_id", currentPersonId)
418:       .not("union_type", "in", '("divorced","separated")');
419: 
420:     const spouseIds = [
421:       ...(spousesA?.map((s) => s.person_b_id) ?? []),
422:       ...(spousesB?.map((s) => s.person_a_id) ?? []),
423:     ];
424: 
425:     for (const spId of spouseIds) {
426:       await supabase.from("parent_child_edges").insert({
427:         parent_id: spId,
428:         child_id: newPersonId,
429:         relationship_type: "biological",
430:         status: "confirmed",
431:         created_by_user_id: user.id,
432:       });
433:     }
434:   } else if (relationship === "spouse" || relationship === "partner") {
435:     await supabase.from("union_edges").insert({
436:       person_a_id: currentPersonId,
437:       person_b_id: newPersonId,
438:       union_type: relationship === "spouse" ? "married" : "partner",
439:       status: "confirmed",
440:       created_by_user_id: user.id,
441:     });
442:   } else if (relationship === "brother" || relationship === "sister") {
443:     // Buscar los padres de la persona ancla junto con su género para afinar el tipo de hermandad
444:     const { data: parentsData } = await supabase
445:       .from("parent_child_edges")
446:       .select("parent_id, persons:parent_id(id, gender)")
447:       .eq("child_id", currentPersonId);
448: 
449:     if (parentsData && parentsData.length > 0) {
450:       let targetParentsToLink: string[] = [];
451: 
452:       if (siblingType === "maternal") {
453:         const motherEdge = parentsData.find((pe) => {
454:           const p = Array.isArray(pe.persons) ? pe.persons[0] : pe.persons;
455:           return (p as { gender?: string } | null)?.gender === "female";
456:         });
457:         if (motherEdge) {
458:           targetParentsToLink.push(motherEdge.parent_id);
459:         } else {
460:           targetParentsToLink.push(parentsData[0].parent_id);
461:         }
462:       } else if (siblingType === "paternal") {
463:         const fatherEdge = parentsData.find((pe) => {
464:           const p = Array.isArray(pe.persons) ? pe.persons[0] : pe.persons;
465:           return (p as { gender?: string } | null)?.gender === "male";
466:         });
467:         if (fatherEdge) {
468:           targetParentsToLink.push(fatherEdge.parent_id);
469:         } else {
470:           targetParentsToLink.push(parentsData[parentsData.length - 1].parent_id);
471:         }
472:       } else {
473:         // "both" (hermano completo)
474:         targetParentsToLink = parentsData.map((pe) => pe.parent_id);
475:       }
476: 
477:       for (const parentId of targetParentsToLink) {
478:         await supabase.from("parent_child_edges").insert({
479:           parent_id: parentId,
480:           child_id: newPersonId,
481:           relationship_type: "biological",
482:           status: "confirmed",
483:           created_by_user_id: user.id,
484:         });
485:       }
486:     } else {
487:       // Si la persona de referencia no tiene padres registrados aún:
488:       // Creamos un nodo de linaje/progenitor común para que ambos hermanos queden conectados en el árbol
489:       let anchorPerson: { first_name: string; last_name: string; maternal_last_name?: string | null } | null = null;
490:       const { data: anchorData, error: anchorErr } = await supabase
491:         .from("persons")
492:         .select("first_name, last_name, maternal_last_name")
493:         .eq("id", currentPersonId)
494:         .maybeSingle();
495: 
496:       if (anchorErr || !anchorData) {
497:         const { data: fallbackAnchor } = await supabase
498:           .from("persons")
499:           .select("first_name, last_name")
500:           .eq("id", currentPersonId)
501:           .maybeSingle();
502:         anchorPerson = fallbackAnchor;
503:       } else {
504:         anchorPerson = anchorData;
505:       }
506: 
507:       const lineageLastName = anchorPerson?.last_name || lastName || "Linaje Familiar";
508:       const { data: sharedParent } = await supabase
509:         .from("persons")
510:         .insert({
511:           first_name: "Progenitor/a",
512:           last_name: lineageLastName,
513:           gender: "unknown",
514:           is_living: true,
515:           is_claimed: false,
516:           bio: `Nodo de linaje ancestral común creado para conectar a ${anchorPerson?.first_name ?? "familiar"} con su hermano/a ${firstName}. Puedes editar este nodo para registrar el nombre real de tu abuelo/a.`,
517:           created_by_user_id: user.id,
518:         })
519:         .select("id")
520:         .single();
521: 
522:       if (sharedParent) {
523:         await supabase.from("parent_child_edges").insert([
524:           {
525:             parent_id: sharedParent.id,
526:             child_id: currentPersonId,
527:             relationship_type: "biological",
528:             status: "confirmed",
529:             created_by_user_id: user.id,
530:           },
531:           {
532:             parent_id: sharedParent.id,
533:             child_id: newPersonId,
534:             relationship_type: "biological",
535:             status: "confirmed",
536:             created_by_user_id: user.id,
537:           },
538:         ]);
539:       }
540:     }
541:   }
542: 
543:   // 3. Si se proporcionó un correo y la persona está viva, generar token de invitación inmediatamente
544:   let generatedToken: string | null = null;
545:   if (isLiving && inviteEmail) {
546:     const rawToken = crypto.randomBytes(32).toString("hex");
547:     const { data: tokenData } = await supabase
548:       .from("invitation_tokens")
549:       .insert({
550:         token: rawToken,
551:         person_id: newPersonId,
552:         invited_by_user_id: user.id,
553:         invited_email: inviteEmail,
554:         proposed_relationship: RELATIONSHIP_LABELS[relationship],
555:       })
556:       .select("token")
557:       .single();
558: 
559:     generatedToken = tokenData?.token ?? null;
560:   }
561: 
562:   revalidatePath("/");
563:   revalidatePath("/tree");
564: 
565:   return {
566:     success: true,
567:     personId: newPersonId,
568:     invitationToken: generatedToken,
569:   };
570: }
571: 
572: /**
573:  * Server Action: Actualizar la información de una ficha familiar existente.
574:  */
575: export async function updateFamilyMemberAction(formData: FormData) {
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `run_command`

Necesito ver los datos reales para entender exactamente qué aristas se crearon. Voy a revisar la configuración de Supabase disponible.

---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:03:52-06:00
Completed At: 2026-10-04T12:03:53-06:00

				The command exited with code 1.
				Output:
				.			README.md		postcss.config.mjs
..			docs			public
.env.local.example	eslint.config.mjs	src
.git			next-env.d.ts		supabase
.gitignore		next.config.ts		tsconfig.json
.next			node_modules		tsconfig.tsbuildinfo
AGENTS.md		package-lock.json
CLAUDE.md		package.json
migrations



---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `list_dir`

No hay `.env.local` local, así que analizaré con el código y la captura. Reviso el modal de alta y el lienzo.

---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:04:19-06:00
Completed At: 2026-10-04T12:04:19-06:00
{"name":"add-member-modal.tsx","sizeBytes":"23710"}
{"name":"edit-member-modal.tsx","sizeBytes":"58147"}
{"name":"endorsements-manager-modal.tsx","sizeBytes":"11739"}
{"name":"family-directory.tsx","sizeBytes":"16619"}
{"name":"friends-manager-modal.tsx","sizeBytes":"32641"}
{"name":"tree-canvas.tsx","sizeBytes":"35413"}
{"name":"tree-search-modal.tsx","sizeBytes":"15115"}
{"name":"tree-selector.tsx","sizeBytes":"5904"}

Summary: This directory contains 0 subdirectories and 8 files.

---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:04:22-06:00
Completed At: 2026-10-04T12:04:22-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/components/add-member-modal.tsx`
Total Lines: 483
Total Bytes: 23710
Showing lines 1 to 483
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
1: "use client";
2: 
3: import { useState } from "react";
4: import { createFamilyMemberAction } from "@/features/genealogy/actions";
5: import { UserPlus, X, Heart, Users, Mail, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
6: import type { FamilyRelationshipType } from "../types";
7: 
8: export interface AddMemberModalProps {
9:   defaultAnchorId?: string;
10:   defaultAnchorName?: string;
11:   availableAnchors?: { id: string; name: string }[];
12:   triggerButton?: React.ReactNode;
13:   isOpen?: boolean;
14:   onClose?: () => void;
15: }
16: 
17: export function AddMemberModal({
18:   defaultAnchorId,
19:   defaultAnchorName,
20:   availableAnchors,
21:   triggerButton,
22:   isOpen: externalIsOpen,
23:   onClose: externalOnClose,
24: }: AddMemberModalProps) {
25:   const [internalIsOpen, setInternalIsOpen] = useState(false);
26:   const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
27: 
28:   const setIsOpen = (val: boolean) => {
29:     setInternalIsOpen(val);
30:     if (!val && externalOnClose) {
31:       externalOnClose();
32:     }
33:   };
34: 
35:   const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
36:   const [prevDefaultAnchorId, setPrevDefaultAnchorId] = useState(defaultAnchorId);
37: 
38:   if (defaultAnchorId !== prevDefaultAnchorId) {
39:     setPrevDefaultAnchorId(defaultAnchorId);
40:     setSelectedAnchorId(null);
41:   }
42: 
43:   const anchorId = selectedAnchorId ?? (defaultAnchorId || "");
44:   const setAnchorId = (val: string) => setSelectedAnchorId(val);
45: 
46:   const [isLiving, setIsLiving] = useState(true);
47:   const [relationship, setRelationship] = useState<FamilyRelationshipType>("brother");
48:   const [siblingType, setSiblingType] = useState<"both" | "maternal" | "paternal">("both");
49:   const [createUnion, setCreateUnion] = useState(false);
50:   const [isPending, setIsPending] = useState(false);
51:   const [error, setError] = useState<string | null>(null);
52:   const [successToken, setSuccessToken] = useState<string | null>(null);
53: 
54:   const selectedAnchor = availableAnchors?.find((a) => a.id === (anchorId || defaultAnchorId));
55:   const activeAnchorName = selectedAnchor?.name || defaultAnchorName || "ti";
56: 
57:   const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
58:     e.preventDefault();
59:     setIsPending(true);
60:     setError(null);
61: 
62:     const form = e.currentTarget;
63:     const formData = new FormData(form);
64:     formData.set("is_living", String(isLiving));
65:     formData.set("relationship", relationship);
66:     if (relationship === "brother" || relationship === "sister") {
67:       formData.set("sibling_type", siblingType);
68:     }
69:     if (relationship === "father" || relationship === "mother") {
70:       formData.set("create_union", String(createUnion));
71:     }
72:     if (anchorId || defaultAnchorId) {
73:       formData.set("anchor_person_id", anchorId || defaultAnchorId || "");
74:     }
75: 
76:     const result = await createFamilyMemberAction(formData);
77: 
78:     setIsPending(false);
79:     if (result.error) {
80:       setError(result.error);
81:     } else {
82:       if (result.invitationToken) {
83:         setSuccessToken(result.invitationToken);
84:       } else {
85:         setIsOpen(false);
86:         form.reset();
87:       }
88:     }
89:   };
90: 
91:   const handleClose = () => {
92:     setIsOpen(false);
93:     setError(null);
94:     setSuccessToken(null);
95:     if (externalOnClose) {
96:       externalOnClose();
97:     }
98:   };
99: 
100:   const origin = typeof window !== "undefined" ? window.location.origin : "";
101:   const inviteUrl = successToken ? `${origin}/invite/${successToken}` : "";
102: 
103:   return (
104:     <>
105:       {triggerButton ? (
106:         <div onClick={() => setIsOpen(true)}>{triggerButton}</div>
107:       ) : (
108:         <button
109:           onClick={() => setIsOpen(true)}
110:           className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-700/20 transition hover:scale-[1.02]"
111:         >
112:           <UserPlus className="w-4 h-4" />
113:           <span>Agregar Familiar</span>
114:         </button>
115:       )}
116: 
117:       {isOpen && (
118:         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
119:           <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
120:             {/* Cerrar */}
121:             <button
122:               onClick={handleClose}
123:               className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition"
124:             >
125:               <X className="w-4 h-4" />
126:             </button>
127: 
128:             {/* Encabezado */}
129:             <div className="flex items-center gap-3 mb-6">
130:               <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
131:                 <Users className="w-5 h-5" />
132:               </div>
133:               <div>
134:                 <h2 className="text-lg font-bold text-white">
135:                   Registrar Familiar en el Árbol
136:                 </h2>
137:                 <p className="text-xs text-neutral-400">
138:                   Crea una ficha genealógica conectada a la red familiar.
139:                 </p>
140:               </div>
141:             </div>
142: 
143:             {error && (
144:               <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-start gap-2">
145:                 <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
146:                 <span>{error}</span>
147:               </div>
148:             )}
149: 
150:             {successToken ? (
151:               /* Mensaje tras crear con token generado */
152:               <div className="space-y-4 text-center py-4">
153:                 <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto mb-2">
154:                   <CheckCircle2 className="w-6 h-6" />
155:                 </div>
156:                 <h3 className="font-bold text-base text-white">¡Familiar Registrado con Éxito!</h3>
157:                 <p className="text-xs text-neutral-400">
158:                   Se generó un token criptográfico único para que tu familiar reclame esta ficha personal.
159:                 </p>
160: 
161:                 <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-left">
162:                   <label className="block text-[11px] font-mono text-neutral-400 mb-1">
163:                     Enlace de Reclamación Exclusivo
164:                   </label>
165:                   <div className="flex items-center gap-2">
166:                     <input
167:                       type="text"
168:                       readOnly
169:                       value={inviteUrl}
170:                       className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-mono select-all focus:outline-none"
171:                     />
172:                     <button
173:                       type="button"
174:                       onClick={() => navigator.clipboard.writeText(inviteUrl)}
175:                       className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap transition"
176:                     >
177:                       Copiar
178:                     </button>
179:                   </div>
180:                 </div>
181: 
182:                 <div className="pt-2">
183:                   <button
184:                     onClick={handleClose}
185:                     className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition"
186:                   >
187:                     Aceptar y Volver al Árbol
188:                   </button>
189:                 </div>
190:               </div>
191:             ) : (
192:               <form onSubmit={handleSubmit} className="space-y-4">
193:                 {/* Selector de Familiar de Referencia (Anchor) */}
194:                 {availableAnchors && availableAnchors.length > 0 && (
195:                   <div className="p-3.5 bg-neutral-950/70 border border-neutral-800 rounded-2xl">
196:                     <label className="block text-xs font-semibold text-neutral-200 mb-1 flex items-center justify-between">
197:                       <span>Familiar de Referencia (Punto de anclaje)</span>
198:                       <span className="text-[10px] text-emerald-400 font-mono">Modo Administrador</span>
199:                     </label>
200:                     <select
201:                       value={anchorId || defaultAnchorId || availableAnchors[0]?.id}
202:                       onChange={(e) => setAnchorId(e.target.value)}
203:                       className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 transition"
204:                     >
205:                       {availableAnchors.map((a) => (
206:                         <option key={a.id} value={a.id}>
207:                           {a.name} {a.id === defaultAnchorId ? "(Seleccionado)" : ""}
208:                         </option>
209:                       ))}
210:                     </select>
211:                     <p className="text-[11px] text-neutral-400 mt-1.5">
212:                       El parentesco se registrará en relación a: <strong className="text-white">{activeAnchorName}</strong>
213:                     </p>
214:                   </div>
215:                 )}
216: 
217:                 {/* Parentesco respecto al anchor */}
218:                 <div>
219:                   <label className="block text-xs font-medium text-neutral-300 mb-1.5">
220:                     ¿Qué parentesco tiene con <span className="text-emerald-400 font-semibold">{activeAnchorName}</span>?
221:                   </label>
222:                   <select
223:                     value={relationship}
224:                     onChange={(e) => setRelationship(e.target.value as FamilyRelationshipType)}
225:                     className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
226:                   >
227:                     <option value="father">Padre de {activeAnchorName}</option>
228:                     <option value="mother">Madre de {activeAnchorName}</option>
229:                     <option value="son">Hijo de {activeAnchorName}</option>
230:                     <option value="daughter">Hija de {activeAnchorName}</option>
231:                     <option value="spouse">Cónyuge / Esposo(a) de {activeAnchorName}</option>
232:                     <option value="partner">Pareja / Unión Libre de {activeAnchorName}</option>
233:                     <option value="brother">Hermano de {activeAnchorName}</option>
234:                     <option value="sister">Hermana de {activeAnchorName}</option>
235:                   </select>
236: 
237:                   {/* Selector contextual de Hermandad (Evita asunciones erróneas de progenitores) */}
238:                   {(relationship === "brother" || relationship === "sister") && (
239:                     <div className="mt-3 p-3.5 bg-neutral-900/80 border border-emerald-900/40 rounded-2xl space-y-2 animate-in fade-in">
240:                       <span className="block text-xs font-semibold text-emerald-300">
241:                         ¿Qué vínculo de hermandad comparten con {activeAnchorName}?
242:                       </span>
243:                       <div className="space-y-2 pt-1 text-xs">
244:                         <label className="flex items-start gap-2.5 cursor-pointer text-neutral-200">
245:                           <input
246:                             type="radio"
247:                             name="sibling_type_ui"
248:                             value="both"
249:                             checked={siblingType === "both"}
250:                             onChange={() => setSiblingType("both")}
251:                             className="mt-0.5 text-emerald-500 focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
252:                           />
253:                           <div>
254:                             <span className="font-medium text-white">Hermano/a completo</span>
255:                             <span className="block text-[11px] text-neutral-400">Comparte ambos progenitores (padre y madre biológicos).</span>
256:                           </div>
257:                         </label>
258:                         <label className="flex items-start gap-2.5 cursor-pointer text-neutral-200">
259:                           <input
260:                             type="radio"
261:                             name="sibling_type_ui"
262:                             value="maternal"
263:                             checked={siblingType === "maternal"}
264:                             onChange={() => setSiblingType("maternal")}
265:                             className="mt-0.5 text-emerald-500 focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
266:                           />
267:                           <div>
268:                             <span className="font-medium text-white">Medio hermano/a materno</span>
269:                             <span className="block text-[11px] text-neutral-400">Solo comparte la madre biológica (diferente padre).</span>
270:                           </div>
271:                         </label>
272:                         <label className="flex items-start gap-2.5 cursor-pointer text-neutral-200">
273:                           <input
274:                             type="radio"
275:                             name="sibling_type_ui"
276:                             value="paternal"
277:                             checked={siblingType === "paternal"}
278:                             onChange={() => setSiblingType("paternal")}
279:                             className="mt-0.5 text-emerald-500 focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
280:                           />
281:                           <div>
282:                             <span className="font-medium text-white">Medio hermano/a paterno</span>
283:                             <span className="block text-[11px] text-neutral-400">Solo comparte el padre biológico (diferente madre).</span>
284:                           </div>
285:                         </label>
286:                       </div>
287:                     </div>
288:                   )}
289: 
290:                   {/* Confirmación opcional de unión marital para Progenitores */}
291:                   {(relationship === "father" || relationship === "mother") && (
292:                     <div className="mt-3 p-3 bg-neutral-900/60 border border-neutral-800 rounded-2xl animate-in fade-in">
293:                       <label className="flex items-start gap-2.5 cursor-pointer text-xs">
294:                         <input
295:                           type="checkbox"
296:                           checked={createUnion}
297:                           onChange={(e) => setCreateUnion(e.target.checked)}
298:                           className="mt-0.5 text-emerald-500 rounded focus:ring-emerald-500 bg-neutral-950 border-neutral-700"
299:                         />
300:                         <div>
301:                           <span className="font-medium text-neutral-200">
302:                             Vincular como pareja/cónyuge del otro progenitor existente
303:                           </span>
304:                           <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
305:                             Si se deja desmarcado, se registrará únicamente como progenitor biológico sin forzar un matrimonio ni unión conyugal.
306:                           </p>
307:                         </div>
308:                       </label>
309:                     </div>
310:                   )}
311:                 </div>
312: 
313:                 {/* Nombres y Apellidos Separados */}
314:                 <div className="space-y-3">
315:                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
316:                     <div>
317:                       <label className="block text-xs font-medium text-neutral-300 mb-1.5">
318:                         Primer Nombre <span className="text-emerald-400">*</span>
319:                       </label>
320:                       <input
321:                         name="first_name"
322:                         type="text"
323:                         required
324:                         placeholder="Ej. Jorge"
325:                         className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
326:                       />
327:                     </div>
328:                     <div>
329:                       <label className="block text-xs font-medium text-neutral-300 mb-1.5">
330:                         Segundo Nombre <span className="text-neutral-500">(Opcional)</span>
331:                       </label>
332:                       <input
333:                         name="middle_name"
334:                         type="text"
335:                         placeholder="Ej. Luis"
336:                         className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
337:                       />
338:                     </div>
339:                   </div>
340: 
341:                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
342:                     <div>
343:                       <label className="block text-xs font-medium text-neutral-300 mb-1.5">
344:                         Apellido Paterno <span className="text-emerald-400">*</span>
345:                       </label>
346:                       <input
347:                         name="last_name"
348:                         type="text"
349:                         required
350:                         placeholder="Ej. Hernández"
351:                         className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
352:                       />
353:                     </div>
354:                     <div>
355:                       <label className="block text-xs font-medium text-neutral-300 mb-1.5">
356:                         Apellido Materno <span className="text-neutral-500">(Opcional)</span>
357:                       </label>
358:                       <input
359:                         name="maternal_last_name"
360:                         type="text"
361:                         placeholder="Ej. García"
362:                         className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
363:                       />
364:                     </div>
365:                   </div>
366:                 </div>
367: 
368:                 {/* Género y Fecha de Nacimiento */}
369:                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
370:                   <div>
371:                     <label className="block text-xs font-medium text-neutral-300 mb-1.5">
372:                       Género
373:                     </label>
374:                     <select
375:                       name="gender"
376:                       defaultValue={
377:                         relationship === "mother" || relationship === "daughter" || relationship === "sister"
378:                           ? "female"
379:                           : relationship === "father" || relationship === "son" || relationship === "brother"
380:                           ? "male"
381:                           : "unknown"
382:                       }
383:                       className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
384:                     >
385:                       <option value="male">Masculino (♂ Azul)</option>
386:                       <option value="female">Femenino (♀ Rosa)</option>
387:                       <option value="other">Otro</option>
388:                       <option value="unknown">Desconocido</option>
389:                     </select>
390:                   </div>
391:                   <div>
392:                     <label className="block text-xs font-medium text-neutral-300 mb-1.5">
393:                       Fecha de Nacimiento
394:                     </label>
395:                     <input
396:                       name="birth_date"
397:                       type="date"
398:                       className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
399:                     />
400:                   </div>
401:                 </div>
402: 
403:                 {/* ¿Vive actualmente? */}
404:                 <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-xl flex items-center justify-between">
405:                   <div>
406:                     <div className="text-xs font-medium text-neutral-200">¿Vive actualmente?</div>
407:                     <div className="text-[11px] text-neutral-500">
408:                       {isLiving ? "Se podrá emitir invitación para reclamar ficha" : "Se registrará como ancestro/fallecido"}
409:                     </div>
410:                   </div>
411:                   <div className="flex items-center gap-2">
412:                     <button
413:                       type="button"
414:                       onClick={() => setIsLiving(true)}
415:                       className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${
416:                         isLiving
417:                           ? "bg-emerald-600 text-white"
418:                           : "bg-neutral-800 text-neutral-400 hover:text-white"
419:                       }`}
420:                     >
421:                       Sí
422:                     </button>
423:                     <button
424:                       type="button"
425:                       onClick={() => setIsLiving(false)}
426:                       className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${
427:                         !isLiving
428:                           ? "bg-neutral-700 text-white"
429:                           : "bg-neutral-800 text-neutral-400 hover:text-white"
430:                       }`}
431:                     >
432:                       No
433:                     </button>
434:                   </div>
435:                 </div>
436: 
437:                 {/* Invitar inmediatamente si vive */}
438:                 {isLiving && (
439:                   <div>
440:                     <label className="block text-xs font-medium text-neutral-300 mb-1.5">
441:                       Correo para invitar ahora mismo <span className="text-neutral-500 font-normal">(Opcional)</span>
442:                     </label>
443:                     <div className="relative">
444:                       <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
445:                       <input
446:                         name="invite_email"
447:                         type="email"
448:                         placeholder="familiar@ejemplo.com"
449:                         className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
450:                       />
451:                     </div>
452:                   </div>
453:                 )}
454: 
455:                 {/* Botón de Enviar */}
456:                 <div className="pt-2">
457:                   <button
458:                     type="submit"
459:                     disabled={isPending}
460:                     className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs transition shadow-lg shadow-emerald-700/20 disabled:opacity-60"
461:                   >
462:                     {isPending ? (
463:                       <>
464:                         <Loader2 className="w-4 h-4 animate-spin" />
465:                         <span>Guardando en el Grafo...</span>
466:                       </>
467:                     ) : (
468:                       <>
469:                         <Heart className="w-4 h-4" />
470:                         <span>Guardar en Árbol Familiar</span>
471:                       </>
472:                     )}
473:                   </button>
474:                 </div>
475:               </form>
476:             )}
477:           </div>
478:         </div>
479:       )}
480:     </>
481:   );
482: }
483: 
The above content shows the entire, complete file contents of the requested file.


---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:04:27-06:00
Completed At: 2026-10-04T12:04:27-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/components/tree-canvas.tsx`
Total Lines: 849
Total Bytes: 35413
Showing lines 1 to 420
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
1: "use client";
2: 
3: import { useState, useRef, useEffect, useCallback } from "react";
4: import type { FamilyGraphData, TreeNodeData } from "../types/graph.types";
5: import { formatFullName } from "../types";
6: import { InviteModal } from "@/features/invitations/components/invite-modal";
7: import { EditMemberModal } from "@/features/genealogy/components/edit-member-modal";
8: import { AddMemberModal } from "@/features/genealogy/components/add-member-modal";
9: import { TreeSearchModal } from "./tree-search-modal";
10: import Link from "next/link";
11: import { useRouter } from "next/navigation";
12: import {
13:   ZoomIn,
14:   ZoomOut,
15:   ShieldCheck,
16:   Clock,
17:   KeyRound,
18:   CheckCircle,
19:   Pencil,
20:   Compass,
21:   ArrowLeft,
22:   UserPlus,
23:   Eye,
24:   EyeOff,
25:   Search,
26:   Sparkles,
27: } from "lucide-react";
28: 
29: interface TreeCanvasProps {
30:   graph: FamilyGraphData;
31: }
32: 
33: export function TreeCanvas({ graph }: TreeCanvasProps) {
34:   const router = useRouter();
35:   const [scale, setScale] = useState(1);
36:   const [position, setPosition] = useState({ x: 0, y: 0 });
37:   const [isDragging, setIsDragging] = useState(false);
38:   const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
39: 
40:   const [activeInviteMember, setActiveInviteMember] = useState<TreeNodeData | null>(null);
41:   const [activeEditMember, setActiveEditMember] = useState<TreeNodeData | null>(null);
42:   const [activeAddAnchor, setActiveAddAnchor] = useState<TreeNodeData | null>(null);
43: 
44:   // Modal de búsqueda / explorador de árboles (Cmd+K)
45:   const [isSearchOpen, setIsSearchOpen] = useState(false);
46: 
47:   // Toggle de control de complejidad: Ocultar parejas de hermanos por defecto
48:   const [hideSiblingSpouses, setHideSiblingSpouses] = useState(true);
49: 
50:   // Atajo de teclado global Cmd+K / Ctrl+K
51:   useEffect(() => {
52:     const handleKeyDown = (e: KeyboardEvent) => {
53:       if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
54:         e.preventDefault();
55:         setIsSearchOpen((prev) => !prev);
56:       }
57:     };
58:     window.addEventListener("keydown", handleKeyDown);
59:     return () => window.removeEventListener("keydown", handleKeyDown);
60:   }, []);
61: 
62:   const containerRef = useRef<HTMLDivElement>(null);
63: 
64:   const NODE_WIDTH = 220;
65:   const NODE_HEIGHT = 120;
66: 
67:   // Centrar el grafo en la pantalla al montar
68:   useEffect(() => {
69:     if (containerRef.current) {
70:       const rect = containerRef.current.getBoundingClientRect();
71:       setPosition({
72:         x: rect.width / 2,
73:         y: rect.height / 3.5,
74:       });
75:     }
76:   }, []);
77: 
78:   // Eventos de arrastre del lienzo (Pan)
79:   const handleMouseDown = (e: React.MouseEvent) => {
80:     if (
81:       (e.target as HTMLElement).closest(".tree-node-card") ||
82:       (e.target as HTMLElement).closest(".tree-controls") ||
83:       (e.target as HTMLElement).closest("button") ||
84:       (e.target as HTMLElement).closest("select") ||
85:       (e.target as HTMLElement).closest("a")
86:     ) {
87:       return;
88:     }
89:     setIsDragging(true);
90:     setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
91:   };
92: 
93:   const handleMouseMove = useCallback(
94:     (e: React.MouseEvent) => {
95:       if (!isDragging) return;
96:       setPosition({
97:         x: e.clientX - dragStart.x,
98:         y: e.clientY - dragStart.y,
99:       });
100:     },
101:     [isDragging, dragStart]
102:   );
103: 
104:   const handleMouseUp = () => {
105:     setIsDragging(false);
106:   };
107: 
108:   // Zoom con la rueda del ratón
109:   const handleWheel = (e: React.WheelEvent) => {
110:     e.preventDefault();
111:     const zoomFactor = 1.1;
112:     const newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
113:     if (newScale >= 0.4 && newScale <= 2.5) {
114:       setScale(newScale);
115:     }
116:   };
117: 
118:   const handleReset = () => {
119:     if (containerRef.current) {
120:       const rect = containerRef.current.getBoundingClientRect();
121:       setScale(1);
122:       setPosition({
123:         x: rect.width / 2,
124:         y: rect.height / 3.5,
125:       });
126:     }
127:   };
128: 
129:   // Filtrado de nodos según el toggle de parejas de hermanos
130:   const filteredNodes = graph.nodes.filter((node) => {
131:     if (!hideSiblingSpouses) return true;
132:     // Si es pareja de un hermano y no es la pareja de la persona central, ocultar para despejar
133:     if (node.relationshipCategory === "spouse" && node.id !== graph.focusPerson.id) {
134:       const isDirectSpouseOfFocus = graph.edges.some(
135:         (e) =>
136:           e.type === "union" &&
137:           ((e.sourceId === graph.focusPerson.id && e.targetId === node.id) ||
138:             (e.targetId === graph.focusPerson.id && e.sourceId === node.id))
139:       );
140:       if (!isDirectSpouseOfFocus) return false;
141:     }
142:     return true;
143:   });
144: 
145:   const nodeMap = new Map<string, TreeNodeData>();
146:   filteredNodes.forEach((n) => nodeMap.set(n.id, n));
147: 
148:   // =========================================================================
149:   // AGRUPACIÓN PARA HORQUILLA GENEALÓGICA ENTRE HERMANOS (Pedigree Bus Bar)
150:   // =========================================================================
151:   const childToParentsMap = new Map<string, string[]>();
152:   graph.edges
153:     .filter((e) => e.type === "parent-child")
154:     .forEach((e) => {
155:       if (nodeMap.has(e.targetId) && nodeMap.has(e.sourceId)) {
156:         const pList = childToParentsMap.get(e.targetId) || [];
157:         if (!pList.includes(e.sourceId)) pList.push(e.sourceId);
158:         childToParentsMap.set(e.targetId, pList);
159:       }
160:     });
161: 
162:   const parentGroupToChildrenMap = new Map<string, string[]>();
163:   childToParentsMap.forEach((parents, childId) => {
164:     const parentKey = parents.sort().join("_");
165:     const cList = parentGroupToChildrenMap.get(parentKey) || [];
166:     if (!cList.includes(childId)) cList.push(childId);
167:     parentGroupToChildrenMap.set(parentKey, cList);
168:   });
169: 
170:   const availableAnchors = graph.availableMembers
171:     .filter((m) => {
172:       const node = nodeMap.get(m.id);
173:       if (!node) return true;
174:       const isSelfNode = node.id === graph.focusPerson.id || node.relationshipCategory === "self";
175:       return !node.isClaimed || isSelfNode;
176:     })
177:     .map((m) => ({
178:       id: m.id,
179:       name: formatFullName(m),
180:     }));
181: 
182:   return (
183:     <div
184:       ref={containerRef}
185:       onMouseDown={handleMouseDown}
186:       onMouseMove={handleMouseMove}
187:       onMouseUp={handleMouseUp}
188:       onMouseLeave={handleMouseUp}
189:       onWheel={handleWheel}
190:       className={`relative w-full h-[780px] bg-neutral-950/90 border border-neutral-800 rounded-3xl overflow-hidden select-none cursor-grab active:cursor-grabbing ${
191:         isDragging ? "cursor-grabbing" : ""
192:       }`}
193:     >
194:       {/* Patrón de fondo (grilla de puntos sutiles) */}
195:       <div
196:         className="absolute inset-0 pointer-events-none opacity-20"
197:         style={{
198:           backgroundImage: "radial-gradient(#10b981 0.75px, transparent 0.75px)",
199:           backgroundSize: "24px 24px",
200:           backgroundPosition: `${position.x}px ${position.y}px`,
201:         }}
202:       />
203: 
204:       {/* Barra Superior: Perspectiva Activa & Modo Administrador */}
205:       <div className="tree-controls absolute top-4 left-4 right-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-900/90 border border-neutral-800 p-3 sm:px-5 sm:py-2.5 rounded-2xl shadow-xl backdrop-blur-md z-20">
206:         <div className="flex items-center gap-3">
207:           <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
208:             <Compass className="w-4 h-4" />
209:           </div>
210:           <div>
211:             <div className="flex items-center gap-2">
212:               <span className="text-xs text-neutral-400">Perspectiva:</span>
213:               <span className="text-xs font-bold text-white">
214:                 {graph.focusPerson.firstName} {graph.focusPerson.lastName}
215:               </span>
216:               {graph.focusPerson.isSelf ? (
217:                 <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300">
218:                   Tú (Nodo Raíz)
219:                 </span>
220:               ) : (
221:                 <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300">
222:                   Explorando Familiar
223:                 </span>
224:               )}
225:             </div>
226:             {graph.isUserZero && (
227:               <span className="text-[10px] text-neutral-500 block">
228:                 Modo Administrador: Puedes moverte entre árboles y editar las ramas de cualquiera
229:               </span>
230:             )}
231:           </div>
232:         </div>
233: 
234:         <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
235:           {/* Volver a mi propio árbol si estamos en otra perspectiva */}
236:           {!graph.focusPerson.isSelf && (
237:             <Link
238:               href="/tree"
239:               className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
240:             >
241:               <ArrowLeft className="w-3.5 h-3.5" />
242:               <span>Volver a mi árbol</span>
243:             </Link>
244:           )}
245: 
246:           {/* Botón de Explorador de Árboles y Búsqueda por Nombre o ID */}
247:           <button
248:             type="button"
249:             onClick={() => setIsSearchOpen(true)}
250:             title="Buscar familiar por nombre o ID exacto (Cmd+K)"
251:             className="flex items-center gap-2 bg-neutral-950 hover:bg-neutral-800 border border-neutral-700/80 hover:border-emerald-500/60 rounded-xl px-3 py-1.5 text-xs text-neutral-200 transition shadow-sm group"
252:           >
253:             <Search className="w-3.5 h-3.5 text-neutral-400 group-hover:text-emerald-400 transition" />
254:             <span>Explorar árbol...</span>
255:             <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-neutral-900 border border-neutral-700 rounded text-neutral-400">
256:               ⌘K
257:             </kbd>
258:           </button>
259:         </div>
260:       </div>
261: 
262:       {/* Estado vacío si no hay nodos */}
263:       {graph.nodes.length === 0 && (
264:         <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
265:           <div className="p-6 rounded-3xl bg-neutral-900/90 border border-neutral-800 text-neutral-400 max-w-md shadow-2xl backdrop-blur-md pointer-events-auto">
266:             <h3 className="text-base font-bold text-white mb-2">
267:               Árbol Familiar en Espera
268:             </h3>
269:             <p className="text-xs text-neutral-400 mb-5 leading-relaxed">
270:               No se encontraron registros genealógicos asociados a tu perfil. Puedes volver al directorio para consultar tus fichas o agregar a tus primeros parientes.
271:             </p>
272:             <Link
273:               href="/"
274:               className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
275:             >
276:               <ArrowLeft className="w-3.5 h-3.5" />
277:               <span>Volver al Directorio</span>
278:             </Link>
279:           </div>
280:         </div>
281:       )}
282: 
283:       {/* Contenedor Transformable (Pan & Zoom) */}
284:       <div
285:         style={{
286:           transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
287:           transformOrigin: "0 0",
288:           transition: isDragging ? "none" : "transform 0.1s ease-out",
289:         }}
290:         className="absolute top-0 left-0"
291:       >
292:         {/* Capa de Aristas SVG */}
293:         <svg className="overflow-visible pointer-events-none absolute top-0 left-0">
294:           <defs>
295:             <linearGradient id="unionGrad" x1="0%" y1="0%" x2="100%" y2="0%">
296:               <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
297:               <stop offset="100%" stopColor="#f472b6" stopOpacity="0.8" />
298:             </linearGradient>
299:           </defs>
300: 
301:           {/* Renderizado de Horquillas Genealógicas (Padres -> Hermanos) */}
302:           {Array.from(parentGroupToChildrenMap.entries()).map(([parentKey, childIds]) => {
303:             const parents = parentKey
304:               .split("_")
305:               .map((pId) => nodeMap.get(pId))
306:               .filter(Boolean) as TreeNodeData[];
307:             const children = childIds
308:               .map((cId) => nodeMap.get(cId))
309:               .filter(Boolean) as TreeNodeData[];
310: 
311:             if (parents.length === 0 || children.length === 0) return null;
312: 
313:             // Punto de salida de los padres
314:             let parentMidX = 0;
315:             let parentMaxY = 0;
316:             if (parents.length >= 2) {
317:               parentMidX = (parents[0].x! + parents[1].x! + NODE_WIDTH) / 2;
318:               parentMaxY = Math.max(parents[0].y!, parents[1].y!) + NODE_HEIGHT;
319:             } else {
320:               parentMidX = parents[0].x! + NODE_WIDTH / 2;
321:               parentMaxY = parents[0].y! + NODE_HEIGHT;
322:             }
323: 
324:             const firstChild = children[0];
325:             const busY =
326:               firstChild.y! > parentMaxY
327:                 ? parentMaxY + (firstChild.y! - parentMaxY) / 2
328:                 : parentMaxY + 30;
329: 
330:             const childXs = children.map((c) => c.x! + NODE_WIDTH / 2);
331:             const minChildX = Math.min(...childXs);
332:             const maxChildX = Math.max(...childXs);
333:             const busStartX = Math.min(minChildX, parentMidX);
334:             const busEndX = Math.max(maxChildX, parentMidX);
335: 
336:             if (children.length === 1) {
337:               const childX = firstChild.x! + NODE_WIDTH / 2;
338:               const childY = firstChild.y!;
339: 
340:               if (Math.abs(parentMidX - childX) < 2) {
341:                 // Perfectamente alineados: línea recta vertical continua
342:                 return (
343:                   <line
344:                     key={`pc-single-${parentKey}`}
345:                     x1={parentMidX}
346:                     y1={parentMaxY}
347:                     x2={childX}
348:                     y2={childY}
349:                     stroke="#10b981"
350:                     strokeWidth="2.5"
351:                     strokeLinecap="round"
352:                   />
353:                 );
354:               }
355: 
356:               // Conexión ortogonal limpia e ininterrumpida
357:               return (
358:                 <g key={`pc-single-${parentKey}`}>
359:                   <line
360:                     x1={parentMidX}
361:                     y1={parentMaxY}
362:                     x2={parentMidX}
363:                     y2={busY}
364:                     stroke="#10b981"
365:                     strokeWidth="2.5"
366:                     strokeLinecap="round"
367:                   />
368:                   <circle cx={parentMidX} cy={busY} r="3" fill="#10b981" />
369:                   <line
370:                     x1={busStartX}
371:                     y1={busY}
372:                     x2={busEndX}
373:                     y2={busY}
374:                     stroke="#10b981"
375:                     strokeWidth="2.5"
376:                     strokeLinecap="round"
377:                   />
378:                   <line
379:                     x1={childX}
380:                     y1={busY}
381:                     x2={childX}
382:                     y2={childY}
383:                     stroke="#10b981"
384:                     strokeWidth="2.5"
385:                     strokeLinecap="round"
386:                   />
387:                   <circle cx={childX} cy={busY} r="2.5" fill="#10b981" />
388:                 </g>
389:               );
390:             }
391: 
392:             // Dos o más hijos (HERMANOS): Horquilla clásica con bus bar horizontal continuo
393:             return (
394:               <g key={`pc-group-${parentKey}`}>
395:                 {/* Bajada vertical desde los padres hacia la barra de hermanos */}
396:                 <line
397:                   x1={parentMidX}
398:                   y1={parentMaxY}
399:                   x2={parentMidX}
400:                   y2={busY}
401:                   stroke="#10b981"
402:                   strokeWidth="2.5"
403:                   strokeLinecap="round"
404:                 />
405:                 <circle cx={parentMidX} cy={busY} r="3" fill="#10b981" />
406: 
407:                 {/* Barra horizontal continua que abarca el punto de bajada de los padres y a todos los hermanos */}
408:                 <line
409:                   x1={busStartX}
410:                   y1={busY}
411:                   x2={busEndX}
412:                   y2={busY}
413:                   stroke="#10b981"
414:                   strokeWidth="2.5"
415:                   strokeLinecap="round"
416:                 />
417: 
418:                 {/* Trazos verticales hacia cada hermano */}
419:                 {children.map((child) => {
420:                   const cX = child.x! + NODE_WIDTH / 2;
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:04:30-06:00
Completed At: 2026-10-04T12:04:30-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/components/tree-canvas.tsx`
Total Lines: 849
Total Bytes: 35413
Showing lines 420 to 560
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
420:                   const cX = child.x! + NODE_WIDTH / 2;
421:                   const cY = child.y!;
422:                   return (
423:                     <g key={`stub-${child.id}`}>
424:                       <line
425:                         x1={cX}
426:                         y1={busY}
427:                         x2={cX}
428:                         y2={cY}
429:                         stroke="#10b981"
430:                         strokeWidth="2.5"
431:                         strokeLinecap="round"
432:                       />
433:                       <circle cx={cX} cy={busY} r="2.5" fill="#10b981" />
434:                     </g>
435:                   );
436:                 })}
437:               </g>
438:             );
439:           })}
440: 
441:           {/* Renderizado de Aristas de Unión Conyugal */}
442:           {graph.edges
443:             .filter((e) => e.type === "union")
444:             .map((edge) => {
445:               const source = nodeMap.get(edge.sourceId);
446:               const target = nodeMap.get(edge.targetId);
447: 
448:               if (!source || !target || source.x === undefined || target.x === undefined) {
449:                 return null;
450:               }
451: 
452:               const isLeft = source.x < target.x;
453:               const x1 = isLeft ? source.x + NODE_WIDTH : source.x;
454:               const y1 = source.y! + NODE_HEIGHT / 2;
455:               const x2 = isLeft ? target.x : target.x + NODE_WIDTH;
456:               const y2 = target.y! + NODE_HEIGHT / 2;
457:               const midX = (x1 + x2) / 2;
458: 
459:               const isSeparatedOrDivorced = edge.unionType === "divorced" || edge.unionType === "separated";
460: 
461:               if (isSeparatedOrDivorced) {
462:                 // Vínculo conyugal disuelto o separado
463:                 return (
464:                   <g key={edge.id}>
465:                     <line
466:                       x1={x1}
467:                       y1={y1}
468:                       x2={x2}
469:                       y2={y2}
470:                       stroke="#71717a"
471:                       strokeWidth="2"
472:                       strokeDasharray="4 4"
473:                     />
474:                     <circle cx={midX} cy={y1} r="9" fill="#18181b" stroke="#71717a" strokeWidth="1.5" />
475:                     <text
476:                       x={midX}
477:                       y={y1 + 4}
478:                       textAnchor="middle"
479:                       fill="#ef4444"
480:                       fontSize="12"
481:                       fontWeight="bold"
482:                     >
483:                       ≠
484:                     </text>
485:                   </g>
486:                 );
487:               }
488: 
489:               return (
490:                 <g key={edge.id}>
491:                   <line
492:                     x1={x1}
493:                     y1={y1}
494:                     x2={x2}
495:                     y2={y2}
496:                     stroke="url(#unionGrad)"
497:                     strokeWidth="2"
498:                     strokeDasharray="4 4"
499:                   />
500:                   <circle cx={midX} cy={y1} r="9" fill="#0f172a" stroke="#ec4899" strokeWidth="1.5" />
501:                   <path
502:                     d={`M ${midX - 3.5} ${y1 - 1.5} a 2 2 0 0 1 3.5 -1.5 a 2 2 0 0 1 3.5 1.5 c 0 2 -3.5 4 -3.5 4 s -3.5 -2 -3.5 -4 z`}
503:                     fill="#ec4899"
504:                   />
505:                 </g>
506:               );
507:             })}
508:         </svg>
509: 
510:         {/* Capa de Nodos HTML */}
511:         {filteredNodes.map((node) => {
512:           if (node.x === undefined || node.y === undefined) return null;
513: 
514:           const isCenter = node.id === graph.focusPerson.id;
515:           const isFemale = node.gender === "female";
516:           const isMale = node.gender === "male";
517:           const initials = `${node.firstName[0] || ""}${node.lastName[0] || ""}`.toUpperCase();
518: 
519:           return (
520:             <div
521:               key={node.id}
522:               style={{
523:                 position: "absolute",
524:                 left: `${node.x}px`,
525:                 top: `${node.y}px`,
526:                 width: `${NODE_WIDTH}px`,
527:                 height: `${NODE_HEIGHT}px`,
528:               }}
529:               className={`tree-node-card group p-3 rounded-2xl border transition-all shadow-xl backdrop-blur-md flex flex-col justify-between cursor-default ${
530:                 isCenter
531:                   ? "bg-gradient-to-br from-emerald-950/90 to-neutral-900 border-emerald-500/80 shadow-emerald-950/50 ring-2 ring-emerald-500/30"
532:                   : isFemale
533:                   ? "bg-neutral-900/90 border-neutral-800 hover:border-pink-500/50"
534:                   : isMale
535:                   ? "bg-neutral-900/90 border-neutral-800 hover:border-blue-500/50"
536:                   : "bg-neutral-900/90 border-neutral-800 hover:border-neutral-700"
537:               }`}
538:             >
539:               {/* Encabezado del Nodo */}
540:               <div className="flex items-start justify-between gap-1.5">
541:                 <div className="flex items-center gap-2 overflow-hidden">
542:                   <div
543:                     className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 border relative ${
544:                       isFemale
545:                         ? "bg-gradient-to-tr from-pink-950 via-rose-900 to-pink-800 border-pink-500/50 text-pink-200"
546:                         : isMale
547:                         ? "bg-gradient-to-tr from-blue-950 via-indigo-900 to-blue-800 border-blue-500/50 text-blue-200"
548:                         : "bg-neutral-800 border-neutral-700 text-neutral-300"
549:                     }`}
550:                   >
551:                     {initials}
552:                   </div>
553: 
554:                   <div className="overflow-hidden">
555:                     <div className="flex items-center gap-1 truncate">
556:                       <h4
557:                         className="text-xs font-bold text-white truncate leading-tight"
558:                         title={formatFullName(node)}
559:                       >
560:                         {formatFullName(node)}
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:04:45-06:00
Completed At: 2026-10-04T12:04:46-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts`
Total Lines: 1629
Total Bytes: 52168
Showing lines 575 to 970
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
575: export async function updateFamilyMemberAction(formData: FormData) {
576:   const supabase = await createClient();
577:   const {
578:     data: { user },
579:   } = await supabase.auth.getUser();
580: 
581:   if (!user) {
582:     return { error: "Debes estar autenticado para actualizar fichas familiares." };
583:   }
584: 
585:   const personId = (formData.get("person_id") as string)?.trim();
586:   const firstName = (formData.get("first_name") as string)?.trim();
587:   const middleName = (formData.get("middle_name") as string)?.trim() || null;
588:   const lastName = (formData.get("last_name") as string)?.trim();
589:   const maternalLastName = (formData.get("maternal_last_name") as string)?.trim() || null;
590:   const maidenName = (formData.get("maiden_name") as string)?.trim() || null;
591:   const gender = (formData.get("gender") as Gender) || "unknown";
592:   const birthDate = (formData.get("birth_date") as string) || null;
593:   const isLiving = formData.get("is_living") === "true";
594:   const deathDate = isLiving ? null : (formData.get("death_date") as string) || null;
595:   const birthPlace = (formData.get("birth_place") as string)?.trim() || null;
596:   const bio = (formData.get("bio") as string)?.trim() || null;
597: 
598:   if (!personId) {
599:     return { error: "El identificador de la persona es obligatorio." };
600:   }
601: 
602:   if (!firstName || !lastName) {
603:     return { error: "El primer nombre y el apellido paterno son obligatorios." };
604:   }
605: 
606:   // Validación de coherencia en fechas
607:   if (!isLiving && deathDate && birthDate && deathDate < birthDate) {
608:     return { error: "La fecha de defunción no puede ser anterior a la fecha de nacimiento." };
609:   }
610: 
611:   // Consultar perfil del usuario y estado del nodo
612:   const { data: profile } = await supabase
613:     .from("profiles")
614:     .select("is_user_zero, person_id")
615:     .eq("id", user.id)
616:     .single();
617: 
618:   const { data: targetPerson, error: fetchError } = await supabase
619:     .from("persons")
620:     .select("id, is_claimed, claimed_by_user_id, created_by_user_id")
621:     .eq("id", personId)
622:     .single();
623: 
624:   if (fetchError || !targetPerson) {
625:     return { error: "No se encontró la ficha genealógica especificada." };
626:   }
627: 
628:   // Control de permisos estricto:
629:   // 1. Si la ficha está reclamada, ÚNICAMENTE su titular puede modificar su información personal.
630:   // 2. Si la ficha NO está reclamada, cualquier miembro activo de la red familiar o el creador puede editarla.
631:   const isUserZero = profile?.is_user_zero ?? false;
632:   const isClaimedOwner = targetPerson.is_claimed && targetPerson.claimed_by_user_id === user.id;
633:   const isClaimedMember = Boolean(profile?.person_id);
634:   const isUnclaimed = !targetPerson.is_claimed;
635: 
636:   if (targetPerson.is_claimed && !isClaimedOwner) {
637:     return {
638:       error: "Esta ficha pertenece a la cuenta personal de otro familiar y solo su titular puede modificarla.",
639:     };
640:   }
641: 
642:   if (isUnclaimed && !isUserZero && !isClaimedMember && targetPerson.created_by_user_id !== user.id) {
643:     return {
644:       error: "No tienes permisos para editar esta ficha familiar.",
645:     };
646:   }
647: 
648:   // Ejecutar actualización
649:   const { error: updateError } = await supabase
650:     .from("persons")
651:     .update({
652:       first_name: firstName,
653:       middle_name: middleName,
654:       last_name: lastName,
655:       maternal_last_name: maternalLastName,
656:       maiden_name: maidenName,
657:       gender,
658:       birth_date: birthDate,
659:       death_date: deathDate,
660:       is_living: isLiving,
661:       birth_place: birthPlace,
662:       bio,
663:       updated_at: new Date().toISOString(),
664:     })
665:     .eq("id", personId);
666: 
667:   if (updateError) {
668:     // Si falló por falta de columnas nuevas en la base de datos, reintentar con las columnas estándar
669:     const { error: fallbackError } = await supabase
670:       .from("persons")
671:       .update({
672:         first_name: firstName,
673:         last_name: lastName,
674:         maiden_name: maidenName,
675:         gender,
676:         birth_date: birthDate,
677:         death_date: deathDate,
678:         is_living: isLiving,
679:         birth_place: birthPlace,
680:         bio,
681:         updated_at: new Date().toISOString(),
682:       })
683:       .eq("id", personId);
684: 
685:     if (fallbackError) {
686:       return { error: `Error al actualizar la ficha: ${fallbackError.message}` };
687:     }
688:   }
689: 
690:   revalidatePath("/");
691:   revalidatePath("/tree");
692: 
693:   return { success: true };
694: }
695: 
696: /**
697:  * Server Action: Eliminar una ficha familiar (solo si aún no ha sido reclamada).
698:  */
699: export async function deleteFamilyMemberAction(personId: string) {
700:   const supabase = await createClient();
701:   const {
702:     data: { user },
703:   } = await supabase.auth.getUser();
704: 
705:   if (!user) {
706:     return { error: "Debes estar autenticado para realizar esta acción." };
707:   }
708: 
709:   const { data: profile } = await supabase
710:     .from("profiles")
711:     .select("is_user_zero, person_id")
712:     .eq("id", user.id)
713:     .single();
714: 
715:   if (profile?.person_id === personId) {
716:     return { error: "No puedes eliminar tu propia ficha genealógica principal." };
717:   }
718: 
719:   const { data: targetPerson, error: fetchError } = await supabase
720:     .from("persons")
721:     .select("id, is_claimed, created_by_user_id")
722:     .eq("id", personId)
723:     .single();
724: 
725:   if (fetchError || !targetPerson) {
726:     return { error: "No se encontró la ficha familiar a eliminar." };
727:   }
728: 
729:   if (targetPerson.is_claimed) {
730:     return {
731:       error: "No se puede eliminar una ficha que ya fue reclamada por un usuario registrado.",
732:     };
733:   }
734: 
735:   const isUserZero = profile?.is_user_zero ?? false;
736:   const isCreator = targetPerson.created_by_user_id === user.id;
737:   const isClaimedMember = Boolean(profile?.person_id);
738: 
739:   if (!isUserZero && !isCreator && !isClaimedMember) {
740:     return { error: "No tienes permiso para eliminar esta ficha familiar." };
741:   }
742: 
743:   const { error: deleteError } = await supabase
744:     .from("persons")
745:     .delete()
746:     .eq("id", personId);
747: 
748:   if (deleteError) {
749:     return { error: `Error al eliminar la ficha: ${deleteError.message}` };
750:   }
751: 
752:   revalidatePath("/");
753:   revalidatePath("/tree");
754: 
755:   return { success: true };
756: }
757: 
758: /**
759:  * Server Action: Actualizar el estado conyugal de una pareja (Casados, Separados, Divorciados, etc.).
760:  */
761: export async function updateUnionStatusAction({
762:   personAId,
763:   personBId,
764:   unionType,
765: }: {
766:   personAId: string;
767:   personBId: string;
768:   unionType: "married" | "civil_union" | "divorced" | "separated" | "partner";
769: }) {
770:   const supabase = await createClient();
771:   const {
772:     data: { user },
773:   } = await supabase.auth.getUser();
774: 
775:   if (!user) {
776:     return { error: "Debes estar autenticado para modificar vínculos conyugales." };
777:   }
778: 
779:   const { data: profile } = await supabase
780:     .from("profiles")
781:     .select("is_user_zero, person_id")
782:     .eq("id", user.id)
783:     .single();
784: 
785:   const isUserZero = profile?.is_user_zero ?? false;
786:   const isDirectParty = profile?.person_id === personAId || profile?.person_id === personBId;
787: 
788:   if (!isUserZero && !isDirectParty) {
789:     return { error: "No tienes permisos para modificar este vínculo conyugal." };
790:   }
791: 
792:   // Buscar el registro de la unión
793:   const { data: unionRecord, error: fetchError } = await supabase
794:     .from("union_edges")
795:     .select("id")
796:     .or(
797:       `and(person_a_id.eq.${personAId},person_b_id.eq.${personBId}),and(person_a_id.eq.${personBId},person_b_id.eq.${personAId})`
798:     )
799:     .maybeSingle();
800: 
801:   if (fetchError || !unionRecord) {
802:     return { error: "No se encontró el vínculo conyugal entre estas dos personas." };
803:   }
804: 
805:   const { error: updateError } = await supabase
806:     .from("union_edges")
807:     .update({
808:       union_type: unionType,
809:       updated_at: new Date().toISOString(),
810:     })
811:     .eq("id", unionRecord.id);
812: 
813:   if (updateError) {
814:     return { error: `Error actualizando estado conyugal: ${updateError.message}` };
815:   }
816: 
817:   revalidatePath("/");
818:   revalidatePath("/tree");
819: 
820:   return { success: true };
821: }
822: 
823: /**
824:  * Server Action: Disolver o eliminar un vínculo de pareja.
825:  * Si no tienen hijos en común, se elimina completamente la relación.
826:  * Si tienen hijos en común, se actualiza a 'separated' o 'divorced' para preservar la filiación de los hijos.
827:  */
828: export async function dissolveUnionAction({
829:   personAId,
830:   personBId,
831:   deletePersonId,
832: }: {
833:   personAId: string;
834:   personBId: string;
835:   deletePersonId?: string;
836: }) {
837:   const supabase = await createClient();
838:   const {
839:     data: { user },
840:   } = await supabase.auth.getUser();
841: 
842:   if (!user) {
843:     return { error: "Debes estar autenticado para realizar esta acción." };
844:   }
845: 
846:   const { data: profile } = await supabase
847:     .from("profiles")
848:     .select("is_user_zero, person_id")
849:     .eq("id", user.id)
850:     .single();
851: 
852:   const isUserZero = profile?.is_user_zero ?? false;
853:   const isDirectParty = profile?.person_id === personAId || profile?.person_id === personBId;
854: 
855:   if (!isUserZero && !isDirectParty) {
856:     return { error: "No tienes permisos para disolver este vínculo conyugal." };
857:   }
858: 
859:   // 1. Verificar si comparten hijos en común
860:   const { data: childrenA } = await supabase
861:     .from("parent_child_edges")
862:     .select("child_id")
863:     .eq("parent_id", personAId);
864: 
865:   const { data: childrenB } = await supabase
866:     .from("parent_child_edges")
867:     .select("child_id")
868:     .eq("parent_id", personBId);
869: 
870:   const childIdsA = new Set(childrenA?.map((c) => c.child_id) ?? []);
871:   const sharedChildren = (childrenB?.map((c) => c.child_id) ?? []).filter((id) => childIdsA.has(id));
872: 
873:   // 2. Buscar el registro de la unión
874:   const { data: unionRecord } = await supabase
875:     .from("union_edges")
876:     .select("id")
877:     .or(
878:       `and(person_a_id.eq.${personAId},person_b_id.eq.${personBId}),and(person_a_id.eq.${personBId},person_b_id.eq.${personAId})`
879:     )
880:     .maybeSingle();
881: 
882:   if (!unionRecord) {
883:     return { error: "No se encontró el vínculo de pareja a disolver." };
884:   }
885: 
886:   if (sharedChildren.length > 0) {
887:     // Si tienen hijos, marcamos como separados para conservar la filiación de los hijos en el árbol
888:     await supabase
889:       .from("union_edges")
890:       .update({
891:         union_type: "separated",
892:         status: "confirmed",
893:         updated_at: new Date().toISOString(),
894:       })
895:       .eq("id", unionRecord.id);
896: 
897:     revalidatePath("/");
898:     revalidatePath("/tree");
899: 
900:     return {
901:       success: true,
902:       hasSharedChildren: true,
903:       message: "Tienen hijos en común: la relación se actualizó a 'Separados' para preservar la filiación familiar.",
904:     };
905:   }
906: 
907:   // Si no tienen hijos en común:
908:   // Intentar eliminar físicamente el registro de la unión
909:   const { error: deleteError } = await supabase
910:     .from("union_edges")
911:     .delete()
912:     .eq("id", unionRecord.id);
913: 
914:   // Fallback si la política DELETE en Supabase remoto aún no estuviera aplicada
915:   if (deleteError) {
916:     await supabase
917:       .from("union_edges")
918:       .update({
919:         union_type: "divorced",
920:         status: "rejected",
921:         updated_at: new Date().toISOString(),
922:       })
923:       .eq("id", unionRecord.id);
924:   }
925: 
926:   // Si se solicitó eliminar también la ficha (por ser innecesaria tras la ruptura)
927:   let personDeleted = false;
928:   if (deletePersonId) {
929:     const { data: targetPerson } = await supabase
930:       .from("persons")
931:       .select("id, is_claimed, created_by_user_id")
932:       .eq("id", deletePersonId)
933:       .single();
934: 
935:     if (
936:       targetPerson &&
937:       !targetPerson.is_claimed &&
938:       (isUserZero || targetPerson.created_by_user_id === user.id)
939:     ) {
940:       const { error: personDelError } = await supabase
941:         .from("persons")
942:         .delete()
943:         .eq("id", deletePersonId);
944: 
945:       if (!personDelError) {
946:         personDeleted = true;
947:       }
948:     }
949:   }
950: 
951:   revalidatePath("/");
952:   revalidatePath("/tree");
953: 
954:   return {
955:     success: true,
956:     hasSharedChildren: false,
957:     personDeleted,
958:     message: personDeleted
959:       ? "Ficha y vínculo eliminados por completo."
960:       : "Vínculo de pareja disuelto. Ya no aparecerá en tu árbol.",
961:   };
962: }
963: 
964: /**
965:  * Consulta la lista de todas las personas registradas para usarlas como familiares de referencia (Anchors).
966:  */
967: export async function getAvailableAnchors(): Promise<{ id: string; name: string }[]> {
968:   const supabase = await createClient();
969:   const {
970:     data: { user },
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`, `view_file`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:04:46-06:00
Completed At: 2026-10-04T12:04:46-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts`
Total Lines: 1629
Total Bytes: 52168
Showing lines 1240 to 1460
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
1240:   };
1241: }
1242: 
1243: /**
1244:  * Server Action: Actualizar o reasignar los progenitores de una persona (corrección de parentesco).
1245:  */
1246: export async function updatePersonParentsAction({
1247:   personId,
1248:   parentIds,
1249:   relationshipType = "biological",
1250: }: {
1251:   personId: string;
1252:   parentIds: string[];
1253:   relationshipType?: "biological" | "adopted" | "foster" | "step";
1254: }) {
1255:   const supabase = await createClient();
1256:   const {
1257:     data: { user },
1258:   } = await supabase.auth.getUser();
1259: 
1260:   if (!user) {
1261:     return { error: "Debes estar autenticado para realizar esta acción." };
1262:   }
1263: 
1264:   const { data: profile } = await supabase
1265:     .from("profiles")
1266:     .select("is_user_zero, person_id")
1267:     .eq("id", user.id)
1268:     .single();
1269: 
1270:   const isUserZero = profile?.is_user_zero ?? false;
1271: 
1272:   // Consultar ficha
1273:   const { data: targetPerson } = await supabase
1274:     .from("persons")
1275:     .select("id, is_claimed, created_by_user_id")
1276:     .eq("id", personId)
1277:     .single();
1278: 
1279:   if (!targetPerson) {
1280:     return { error: "No se encontró la persona." };
1281:   }
1282: 
1283:   const isClaimedMember = Boolean(profile?.person_id);
1284:   const isSelf = profile?.person_id === personId;
1285: 
1286:   // Si la persona objetivo ya reclamó su ficha:
1287:   // ÚNICAMENTE esa misma persona (isSelf) puede modificar sus propios progenitores.
1288:   if (targetPerson.is_claimed && !isSelf) {
1289:     return { error: "No puedes modificar los progenitores de un familiar que ya reclamó su cuenta personal." };
1290:   }
1291: 
1292:   // Si la ficha no está reclamada, cualquier miembro activo o creador o Usuario Cero puede colaborar:
1293:   if (!targetPerson.is_claimed && !isUserZero && !isClaimedMember && targetPerson.created_by_user_id !== user.id) {
1294:     return { error: "No tienes permisos para modificar los parentescos de esta persona." };
1295:   }
1296: 
1297:   // 1. Consultar filiaciones actuales
1298:   const { data: currentEdges } = await supabase
1299:     .from("parent_child_edges")
1300:     .select("id, parent_id")
1301:     .eq("child_id", personId);
1302: 
1303:   const currentParentIds = currentEdges?.map((e) => e.parent_id) ?? [];
1304: 
1305:   // 2. Eliminar progenitores que fueron quitados
1306:   const parentsToRemove = currentEdges?.filter((e) => !parentIds.includes(e.parent_id)) ?? [];
1307:   for (const edge of parentsToRemove) {
1308:     await supabase.from("parent_child_edges").delete().eq("id", edge.id);
1309:   }
1310: 
1311:   // 3. Añadir o actualizar nuevos progenitores
1312:   const parentsToAdd = parentIds.filter((pId) => !currentParentIds.includes(pId));
1313:   for (const parentId of parentsToAdd) {
1314:     if (parentId && parentId !== personId) {
1315:       await supabase.from("parent_child_edges").insert({
1316:         parent_id: parentId,
1317:         child_id: personId,
1318:         relationship_type: relationshipType,
1319:         status: "confirmed",
1320:         created_by_user_id: user.id,
1321:       });
1322:     }
1323:   }
1324: 
1325:   revalidatePath("/");
1326:   revalidatePath("/tree");
1327: 
1328:   return { success: true, message: "Parentescos actualizados exitosamente." };
1329: }
1330: 
1331: /**
1332:  * Server Action: Desvincular una relación vertical específica entre un progenitor y un hijo.
1333:  */
1334: export async function unlinkParentChildAction({
1335:   parentId,
1336:   childId,
1337: }: {
1338:   parentId: string;
1339:   childId: string;
1340: }) {
1341:   const supabase = await createClient();
1342:   const {
1343:     data: { user },
1344:   } = await supabase.auth.getUser();
1345: 
1346:   if (!user) {
1347:     return { error: "Debes estar autenticado para realizar esta acción." };
1348:   }
1349: 
1350:   const { error } = await supabase
1351:     .from("parent_child_edges")
1352:     .delete()
1353:     .eq("parent_id", parentId)
1354:     .eq("child_id", childId);
1355: 
1356:   if (error) {
1357:     return { error: `Error desvinculando filiación: ${error.message}` };
1358:   }
1359: 
1360:   revalidatePath("/");
1361:   revalidatePath("/tree");
1362: 
1363:   return { success: true, message: "Filiación desvinculada exitosamente." };
1364: }
1365: 
1366: /**
1367:  * Server Action: Reasignar un familiar que fue registrado erróneamente como progenitor/padre para convertirlo en hermano/a de la familia.
1368:  */
1369: export async function convertParentToSiblingAction({
1370:   personId,
1371:   anchorPersonId,
1372:   siblingType = "both",
1373: }: {
1374:   personId: string;
1375:   anchorPersonId: string;
1376:   siblingType?: "both" | "maternal" | "paternal";
1377: }) {
1378:   const supabase = await createClient();
1379:   const {
1380:     data: { user },
1381:   } = await supabase.auth.getUser();
1382: 
1383:   if (!user) {
1384:     return { error: "Debes estar autenticado para realizar esta acción." };
1385:   }
1386: 
1387:   // 1. Desvincular a personId como padre/progenitor de anchorPersonId y de cualquier hijo que comparta
1388:   await supabase
1389:     .from("parent_child_edges")
1390:     .delete()
1391:     .eq("parent_id", personId);
1392: 
1393:   // 2. Consultar los progenitores reales de la persona ancla (anchorPersonId)
1394:   const { data: anchorParents } = await supabase
1395:     .from("parent_child_edges")
1396:     .select("parent_id, persons:parent_id(id, gender)")
1397:     .eq("child_id", anchorPersonId);
1398: 
1399:   if (anchorParents && anchorParents.length > 0) {
1400:     // 3. Eliminar cualquier unión conyugal artificial entre personId y los progenitores de anchorPersonId
1401:     const parentIds = anchorParents.map((ap) => ap.parent_id);
1402:     for (const pId of parentIds) {
1403:       await supabase
1404:         .from("union_edges")
1405:         .delete()
1406:         .or(`and(person_a_id.eq.${personId},person_b_id.eq.${pId}),and(person_a_id.eq.${pId},person_b_id.eq.${personId})`);
1407:     }
1408: 
1409:     // 4. Vincular a personId como HIJO de los progenitores de anchorPersonId según siblingType
1410:     let targetParentIds: string[] = [];
1411:     if (siblingType === "maternal") {
1412:       const mother = anchorParents.find((ap) => {
1413:         const p = Array.isArray(ap.persons) ? ap.persons[0] : ap.persons;
1414:         return (p as { gender?: string } | null)?.gender === "female";
1415:       });
1416:       if (mother) targetParentIds.push(mother.parent_id);
1417:       else targetParentIds.push(anchorParents[0].parent_id);
1418:     } else if (siblingType === "paternal") {
1419:       const father = anchorParents.find((ap) => {
1420:         const p = Array.isArray(ap.persons) ? ap.persons[0] : ap.persons;
1421:         return (p as { gender?: string } | null)?.gender === "male";
1422:       });
1423:       if (father) targetParentIds.push(father.parent_id);
1424:       else targetParentIds.push(anchorParents[anchorParents.length - 1].parent_id);
1425:     } else {
1426:       // "both": enlazar a todos los progenitores de anchorPersonId
1427:       targetParentIds = anchorParents.map((ap) => ap.parent_id);
1428:     }
1429: 
1430:     for (const pId of targetParentIds) {
1431:       const { data: existingEdge } = await supabase
1432:         .from("parent_child_edges")
1433:         .select("id")
1434:         .eq("parent_id", pId)
1435:         .eq("child_id", personId)
1436:         .maybeSingle();
1437: 
1438:       if (!existingEdge) {
1439:         await supabase.from("parent_child_edges").insert({
1440:           parent_id: pId,
1441:           child_id: personId,
1442:           relationship_type: "biological",
1443:           status: "confirmed",
1444:           created_by_user_id: user.id,
1445:         });
1446:       }
1447:     }
1448:   }
1449: 
1450:   revalidatePath("/");
1451:   revalidatePath("/tree");
1452: 
1453:   return { success: true, message: "Rol reasignado exitosamente como hermano/a." };
1454: }
1455: 
1456: /**
1457:  * Server Action: Respaldar o endosar a un familiar reclamado (Permisos de Administrador / Invitador)
1458:  */
1459: export async function endorseFamilyMemberAction(endorsedPersonId: string) {
1460:   const supabase = await createClient();
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `run_command`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:04:53-06:00
Completed At: 2026-10-04T12:04:53-06:00

				The command exited with code 0.
				Output:
				supabase:
migrations

supabase/migrations:
20260927000000_initial_schema.sql
20260927000001_phase2_auth_and_claiming.sql
20260927000002_phase3_family_and_invitations.sql
20261003000000_allow_deletions.sql
20261003000001_reset_person_claim.sql
20261003000002_add_middle_and_maternal_names.sql
20261003000003_make_invited_email_optional.sql
20261003000004_flexible_permissions_and_bootstrap_quorum.sql
20261004000000_tree_access_shares.sql
grep: migrations: No such file or directory
supabase/migrations/20261003000000_allow_deletions.sql:8:ON public.union_edges FOR DELETE
supabase/migrations/20261003000000_allow_deletions.sql:20:ON public.parent_child_edges FOR DELETE
supabase/migrations/20260927000002_phase3_family_and_invitations.sql:19:ON public.parent_child_edges FOR INSERT
supabase/migrations/20260927000002_phase3_family_and_invitations.sql:24:ON public.parent_child_edges FOR UPDATE
supabase/migrations/20260927000002_phase3_family_and_invitations.sql:31:ON public.union_edges FOR INSERT
supabase/migrations/20260927000002_phase3_family_and_invitations.sql:36:ON public.union_edges FOR UPDATE
supabase/migrations/20260927000000_initial_schema.sql:115:ON public.union_edges (LEAST(person_a_id, person_b_id), GREATEST(person_a_id, person_b_id));
supabase/migrations/20260927000000_initial_schema.sql:139:CREATE INDEX IF NOT EXISTS idx_parent_child_parent ON public.parent_child_edges(parent_id);
supabase/migrations/20260927000000_initial_schema.sql:140:CREATE INDEX IF NOT EXISTS idx_parent_child_child ON public.parent_child_edges(child_id);
supabase/migrations/20260927000000_initial_schema.sql:168:ON public.parent_child_edges FOR SELECT 
supabase/migrations/20260927000000_initial_schema.sql:173:ON public.parent_child_edges FOR SELECT
supabase/migrations/20260927000000_initial_schema.sql:178:ON public.union_edges FOR SELECT 
supabase/migrations/20260927000000_initial_schema.sql:183:ON public.union_edges FOR SELECT
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:168:DROP POLICY IF EXISTS "Usuarios autenticados pueden registrar filiaciones verticales" ON public.parent_child_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:170:ON public.parent_child_edges FOR INSERT
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:180:DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar filiaciones verticales creadas o que les conciernen" ON public.parent_child_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:181:DROP POLICY IF EXISTS "Miembros autenticados pueden gestionar filiaciones verticales" ON public.parent_child_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:184:ON public.parent_child_edges FOR UPDATE
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:201:DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar vínculos verticales" ON public.parent_child_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:202:DROP POLICY IF EXISTS "Miembros autenticados pueden eliminar filiaciones verticales" ON public.parent_child_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:205:ON public.parent_child_edges FOR DELETE
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:216:DROP POLICY IF EXISTS "Usuarios autenticados pueden registrar vínculos conyugales" ON public.union_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:218:ON public.union_edges FOR INSERT
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:228:DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar vínculos conyugales" ON public.union_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:229:DROP POLICY IF EXISTS "Miembros autenticados pueden gestionar vínculos conyugales" ON public.union_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:232:ON public.union_edges FOR UPDATE
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:249:DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar vínculos conyugales" ON public.union_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:250:DROP POLICY IF EXISTS "Miembros autenticados pueden eliminar vínculos conyugales" ON public.union_edges;
supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql:253:ON public.union_edges FOR DELETE



---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:05:14-06:00
Completed At: 2026-10-04T12:05:14-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/supabase/migrations/20261003000004_flexible_permissions_and_bootstrap_quorum.sql`
Total Lines: 262
Total Bytes: 10034
Showing lines 160 to 262
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
160:         OR EXISTS (
161:             SELECT 1 FROM public.profiles 
162:             WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
163:         )
164:     ))
165: );
166: 
167: -- 5. Políticas RLS en public.parent_child_edges
168: DROP POLICY IF EXISTS "Usuarios autenticados pueden registrar filiaciones verticales" ON public.parent_child_edges;
169: CREATE POLICY "Miembros autenticados pueden registrar filiaciones verticales"
170: ON public.parent_child_edges FOR INSERT
171: TO authenticated
172: WITH CHECK (
173:     auth.uid() = created_by_user_id
174:     OR EXISTS (
175:         SELECT 1 FROM public.profiles 
176:         WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
177:     )
178: );
179: 
180: DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar filiaciones verticales creadas o que les conciernen" ON public.parent_child_edges;
181: DROP POLICY IF EXISTS "Miembros autenticados pueden gestionar filiaciones verticales" ON public.parent_child_edges;
182: 
183: CREATE POLICY "Miembros autenticados pueden gestionar filiaciones verticales"
184: ON public.parent_child_edges FOR UPDATE
185: TO authenticated
186: USING (
187:     auth.uid() = created_by_user_id
188:     OR EXISTS (
189:         SELECT 1 FROM public.profiles 
190:         WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
191:     )
192: )
193: WITH CHECK (
194:     auth.uid() = created_by_user_id
195:     OR EXISTS (
196:         SELECT 1 FROM public.profiles 
197:         WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
198:     )
199: );
200: 
201: DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar vínculos verticales" ON public.parent_child_edges;
202: DROP POLICY IF EXISTS "Miembros autenticados pueden eliminar filiaciones verticales" ON public.parent_child_edges;
203: 
204: CREATE POLICY "Miembros autenticados pueden eliminar filiaciones verticales"
205: ON public.parent_child_edges FOR DELETE
206: TO authenticated
207: USING (
208:     auth.uid() = created_by_user_id
209:     OR EXISTS (
210:         SELECT 1 FROM public.profiles 
211:         WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
212:     )
213: );
214: 
215: -- 6. Políticas RLS en public.union_edges
216: DROP POLICY IF EXISTS "Usuarios autenticados pueden registrar vínculos conyugales" ON public.union_edges;
217: CREATE POLICY "Miembros autenticados pueden registrar vínculos conyugales"
218: ON public.union_edges FOR INSERT
219: TO authenticated
220: WITH CHECK (
221:     auth.uid() = created_by_user_id
222:     OR EXISTS (
223:         SELECT 1 FROM public.profiles 
224:         WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
225:     )
226: );
227: 
228: DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar vínculos conyugales" ON public.union_edges;
229: DROP POLICY IF EXISTS "Miembros autenticados pueden gestionar vínculos conyugales" ON public.union_edges;
230: 
231: CREATE POLICY "Miembros autenticados pueden gestionar vínculos conyugales"
232: ON public.union_edges FOR UPDATE
233: TO authenticated
234: USING (
235:     auth.uid() = created_by_user_id
236:     OR EXISTS (
237:         SELECT 1 FROM public.profiles 
238:         WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
239:     )
240: )
241: WITH CHECK (
242:     auth.uid() = created_by_user_id
243:     OR EXISTS (
244:         SELECT 1 FROM public.profiles 
245:         WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
246:     )
247: );
248: 
249: DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar vínculos conyugales" ON public.union_edges;
250: DROP POLICY IF EXISTS "Miembros autenticados pueden eliminar vínculos conyugales" ON public.union_edges;
251: 
252: CREATE POLICY "Miembros autenticados pueden eliminar vínculos conyugales"
253: ON public.union_edges FOR DELETE
254: TO authenticated
255: USING (
256:     auth.uid() = created_by_user_id
257:     OR EXISTS (
258:         SELECT 1 FROM public.profiles 
259:         WHERE profiles.id = auth.uid() AND (profiles.is_user_zero = true OR profiles.person_id IS NOT NULL)
260:     )
261: );
262: 
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:05:19-06:00
Completed At: 2026-10-04T12:05:20-06:00
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/services/get-family-graph.ts","LineNumber":150,"LineContent":"    .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":69,"LineContent":"    .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":74,"LineContent":"    .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":379,"LineContent":"              .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":385,"LineContent":"              await supabase.from(\"union_edges\").insert({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":409,"LineContent":"      .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":415,"LineContent":"      .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":435,"LineContent":"    await supabase.from(\"union_edges\").insert({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":794,"LineContent":"    .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":806,"LineContent":"    .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":875,"LineContent":"    .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":889,"LineContent":"      .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":910,"LineContent":"    .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":917,"LineContent":"      .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":1030,"LineContent":"      .from(\"union_edges\")"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":1404,"LineContent":"        .from(\"union_edges\")"}

---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `grep_search`, `run_command`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:05:20-06:00
Completed At: 2026-10-04T12:05:20-06:00

				The command exited with code 0.
				Output:
				4672bdc (HEAD -> main, origin/main, origin/HEAD) docs(agents): update architectural reference with invariants 6-7, dynamic child payloads, and lineage repair workflows
e027897 fix(genealogy): fix sibling parent assignment, opt-in unions, child unlinking, and parent-aligned descendant layout
e49d78a docs: add AI agent architectural and technical reference manual in AGENTS.md and docs/
c8483bb fix(security): isolate family trees and restrict unauthorized tree access, perspective switching, and search for non-admin users
1aba2ad fix(genealogy): enforce canonical mother/father ranks and isolate partner branch propagation
6cdf853 fix(genealogy): eliminate recursion in maternal/paternal side resolution preventing call stack overflow
41f058b fix(genealogy): bilateral branch-aware layout grouping maternal and paternal uncles to their respective parent side
51ceb29 fix(genealogy): topological BFS generational layout, connected bus bars, claimed profile protection, and couple management UX
c8a3baa feat: separate endorsements into dedicated manager modal, add directory perspective switcher, and enable quick add directly from tree canvas nodes
06ca61c (feature/friends-and-tree-access-levels) feat(friends): implement tiered tree access (basic, intermediate, advanced), request/approval flows, tree switcher, and visitor mode
220e788 (feature/protect-claimed-profiles-and-plan-social-graph) fix(security): prevent editing claimed profiles by other users and hide edit actions
6965397 (origin/feature/claimed-member-permissions-and-sibling-linking, feature/claimed-member-permissions-and-sibling-linking) feat(genealogy): permitir edicion colaborativa de fichas, enlace directo de hermanos y respaldo de administrador
365eace (origin/feature/fix-code-redirect-to-callback, feature/fix-code-redirect-to-callback) fix(auth): redirigir codigo de recuperacion a callback para persistencia segura de cookies y sesion
426f3cb (origin/feature/handle-root-recovery-code, feature/handle-root-recovery-code) feat(auth): intercambiar codigo de recuperacion en ruta raiz y callback
764fcd4 (origin/feature/password-reset-flow, feature/password-reset-flow) feat(auth): flujo completo de recuperacion y restablecimiento de contraseña con soporte para hash y callback



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:08:24-06:00
Completed At: 2026-10-04T12:08:25-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts`
Total Lines: 1629
Total Bytes: 52168
Showing lines 1 to 250
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
1: "use server";
2: 
3: import { createClient } from "@/lib/supabase/server";
4: import { revalidatePath } from "next/cache";
5: import { formatFullName, type FamilyMemberItem, type FamilyRelationshipType } from "./types";
6: import type { Gender } from "@/types/database.types";
7: import { inferKinship, getConnectedFamilyIds } from "./utils/kinship-inference";
8: import crypto from "crypto";
9: 
10: const RELATIONSHIP_LABELS: Record<FamilyRelationshipType, string> = {
11:   father: "Padre",
12:   mother: "Madre",
13:   son: "Hijo",
14:   daughter: "Hija",
15:   spouse: "Cónyuge / Esposo(a)",
16:   partner: "Pareja",
17:   brother: "Hermano",
18:   sister: "Hermana",
19: };
20: 
21: /**
22:  * Obtiene la lista de familiares conectados al usuario actual y su estado de reclamación/invitación.
23:  */
24: export async function getFamilyMembers(perspectivePersonId?: string): Promise<FamilyMemberItem[]> {
25:   const supabase = await createClient();
26:   const {
27:     data: { user },
28:   } = await supabase.auth.getUser();
29: 
30:   if (!user) return [];
31: 
32:   // 1. Obtener person_id del usuario
33:   const { data: profile } = await supabase
34:     .from("profiles")
35:     .select("person_id, is_user_zero")
36:     .eq("id", user.id)
37:     .single();
38: 
39:   if (!profile?.person_id) return [];
40: 
41:   // Solo Usuario Cero (Administrador) puede consultar el directorio desde la perspectiva de otra persona
42:   let currentPersonId = profile.person_id;
43:   if (profile.is_user_zero && perspectivePersonId && perspectivePersonId.trim().length > 0) {
44:     currentPersonId = perspectivePersonId.trim();
45:   }
46: 
47:   // 2. Consultar relaciones verticales (padres e hijos)
48:   const { data: allParentEdges } = await supabase
49:     .from("parent_child_edges")
50:     .select("id, parent_id, child_id, relationship_type");
51: 
52:   const parentIds = allParentEdges?.filter((e) => e.child_id === currentPersonId).map((e) => e.parent_id) ?? [];
53:   const childIds = allParentEdges?.filter((e) => e.parent_id === currentPersonId).map((e) => e.child_id) ?? [];
54: 
55:   // Hermanos: hijos de los mismos padres distintos al usuario
56:   let siblingIds: string[] = [];
57:   if (parentIds.length > 0) {
58:     siblingIds = Array.from(
59:       new Set(
60:         allParentEdges
61:           ?.filter((e) => parentIds.includes(e.parent_id) && e.child_id !== currentPersonId)
62:           .map((e) => e.child_id) ?? []
63:       )
64:     );
65:   }
66: 
67:   // 3. Consultar parejas / uniones
68:   const { data: unionsAsA } = await supabase
69:     .from("union_edges")
70:     .select("id, person_a_id, person_b_id, union_type, status")
71:     .eq("person_a_id", currentPersonId);
72: 
73:   const { data: unionsAsB } = await supabase
74:     .from("union_edges")
75:     .select("id, person_a_id, person_b_id, union_type, status")
76:     .eq("person_b_id", currentPersonId);
77: 
78:   const allUserUnions = [...(unionsAsA ?? []), ...(unionsAsB ?? [])].filter(
79:     (u) => u.status !== "rejected"
80:   );
81: 
82:   const spouseIds = [
83:     ...(unionsAsA?.filter((u) => u.status !== "rejected").map((u) => u.person_b_id) ?? []),
84:     ...(unionsAsB?.filter((u) => u.status !== "rejected").map((u) => u.person_a_id) ?? []),
85:   ];
86: 
87:   // 4. Personas creadas por el usuario (para no perder ninguna)
88:   const { data: createdPersons } = await supabase
89:     .from("persons")
90:     .select("id")
91:     .eq("created_by_user_id", user.id)
92:     .neq("id", currentPersonId);
93: 
94:   const createdIds = createdPersons?.map((p) => p.id) ?? [];
95: 
96:   // Unificar IDs de familiares
97:   const allFamilyIds = Array.from(
98:     new Set([...parentIds, ...childIds, ...siblingIds, ...spouseIds, ...createdIds])
99:   );
100: 
101:   if (allFamilyIds.length === 0) return [];
102: 
103:   // 5. Consultar los datos de las personas
104:   type PersonQueryResult = {
105:     id: string;
106:     first_name: string;
107:     middle_name?: string | null;
108:     last_name: string;
109:     maternal_last_name?: string | null;
110:     maiden_name: string | null;
111:     gender: Gender;
112:     birth_date: string | null;
113:     death_date: string | null;
114:     is_living: boolean;
115:     birth_place: string | null;
116:     bio: string | null;
117:     is_claimed: boolean;
118:     created_by_user_id: string | null;
119:   };
120: 
121:   let persons: PersonQueryResult[] | null = null;
122: 
123:   const { data: personsWithNewCols, error: personsError } = await supabase
124:     .from("persons")
125:     .select("id, first_name, middle_name, last_name, maternal_last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
126:     .in("id", allFamilyIds);
127: 
128:   if (personsError || !personsWithNewCols) {
129:     const { data: fallbackPersons } = await supabase
130:       .from("persons")
131:       .select("id, first_name, last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
132:       .in("id", allFamilyIds);
133: 
134:     persons = (fallbackPersons || []).map((p) => ({
135:       ...p,
136:       middle_name: null,
137:       maternal_last_name: null,
138:       gender: p.gender as Gender,
139:     }));
140:   } else {
141:     persons = (personsWithNewCols || []).map((p) => ({
142:       ...p,
143:       gender: p.gender as Gender,
144:     }));
145:   }
146: 
147:   if (!persons || persons.length === 0) return [];
148: 
149:   // 6. Consultar tokens de invitación activos
150:   const { data: tokens } = await supabase
151:     .from("invitation_tokens")
152:     .select("token, person_id, status, expires_at, invited_email")
153:     .in("person_id", allFamilyIds)
154:     .order("created_at", { ascending: false });
155: 
156:   const personsMap = new Map<string, { id: string; firstName: string; middleName?: string | null; lastName: string; maternalLastName?: string | null; gender: Gender }>(
157:     persons.map((p) => [
158:       p.id,
159:       {
160:         id: p.id,
161:         firstName: p.first_name,
162:         middleName: p.middle_name,
163:         lastName: p.last_name,
164:         maternalLastName: p.maternal_last_name,
165:         gender: p.gender as Gender,
166:       },
167:     ])
168:   );
169: 
170:   // Mapear resultado con inferencia inteligente de parentesco relativa al usuario
171:   return persons.map((p) => {
172:     const matchedUnion = allUserUnions.find(
173:       (u) => (u.person_a_id === currentPersonId && u.person_b_id === p.id) ||
174:              (u.person_b_id === currentPersonId && u.person_a_id === p.id)
175:     );
176: 
177:     const unionInfo = matchedUnion
178:       ? {
179:           id: matchedUnion.id,
180:           unionType: matchedUnion.union_type,
181:           partnerId: currentPersonId,
182:         }
183:       : null;
184: 
185:     const kinship = inferKinship({
186:       rootPersonId: currentPersonId,
187:       targetPersonId: p.id,
188:       targetGender: p.gender as Gender,
189:       parentEdges: allParentEdges || [],
190:       unions: allUserUnions,
191:       personsMap,
192:     });
193: 
194:     const personParents = allParentEdges?.filter((e) => e.child_id === p.id) || [];
195:     const parentConnections = personParents.map((e) => {
196:       const parentObj = personsMap.get(e.parent_id);
197:       return {
198:         id: e.id,
199:         parentId: e.parent_id,
200:         parentName: parentObj ? `${parentObj.firstName} ${parentObj.lastName}` : "Progenitor",
201:         relationshipType: e.relationship_type || "biological",
202:       };
203:     });
204: 
205:     const personChildren = allParentEdges?.filter((e) => e.parent_id === p.id) || [];
206:     const childConnections = personChildren.map((e) => {
207:       const childObj = personsMap.get(e.child_id);
208:       return {
209:         id: e.id,
210:         childId: e.child_id,
211:         childName: childObj ? `${childObj.firstName} ${childObj.lastName}` : "Descendiente",
212:         relationshipType: e.relationship_type || "biological",
213:       };
214:     });
215: 
216:     const inviteToken = tokens?.find((t) => t.person_id === p.id);
217: 
218:     return {
219:       id: p.id,
220:       firstName: p.first_name,
221:       middleName: p.middle_name,
222:       lastName: p.last_name,
223:       maternalLastName: p.maternal_last_name,
224:       maidenName: p.maiden_name,
225:       gender: p.gender,
226:       birthDate: p.birth_date,
227:       deathDate: p.death_date,
228:       isLiving: p.is_living,
229:       birthPlace: p.birth_place,
230:       bio: p.bio,
231:       isClaimed: p.is_claimed,
232:       createdByUserId: p.created_by_user_id,
233:       relationshipLabel: kinship.relationshipLabel,
234:       relationshipCategory: kinship.relationshipCategory,
235:       relationshipExplanation: kinship.explanation,
236:       invitationStatus: inviteToken?.status ?? null,
237:       invitationToken: inviteToken?.token ?? null,
238:       invitationExpiresAt: inviteToken?.expires_at ?? null,
239:       invitedEmail: (inviteToken?.invited_email && inviteToken.invited_email.trim() !== "") ? inviteToken.invited_email.trim() : null,
240:       accountEmail: (inviteToken?.invited_email && inviteToken.invited_email.trim() !== "") ? inviteToken.invited_email.trim() : null,
241:       parentConnections,
242:       childConnections,
243:       unionInfo,
244:     };
245:   });
246: }
247: 
248: /**
249:  * Server Action: Registrar un nuevo familiar y enlazarlo con el nodo del usuario.
250:  */
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`, `view_file`

Encontré varias causas. Antes de escribir, reviso el resto de piezas que tocan uniones y parentescos.

---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:08:25-06:00
Completed At: 2026-10-04T12:08:26-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/types/graph.types.ts`
Total Lines: 94
Total Bytes: 2382
Showing lines 1 to 94
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
1: import type { Gender } from "@/types/database.types";
2: 
3: export interface TreeNodeData {
4:   id: string;
5:   firstName: string;
6:   middleName?: string | null;
7:   lastName: string;
8:   maternalLastName?: string | null;
9:   maidenName?: string | null;
10:   gender: Gender;
11:   birthDate: string | null;
12:   deathDate?: string | null;
13:   isLiving: boolean;
14:   birthPlace?: string | null;
15:   bio?: string | null;
16:   isClaimed: boolean;
17:   createdByUserId?: string | null;
18:   generation: number; // -1: padres/ancestros, 0: usuario/pareja/hermanos, 1: hijos
19:   relationshipLabel: string;
20:   relationshipCategory: "self" | "parent" | "child" | "spouse" | "sibling" | "other";
21:   relationshipExplanation?: string;
22:   accountEmail?: string | null;
23:   parentConnections?: {
24:     id: string;
25:     parentId: string;
26:     parentName: string;
27:     relationshipType: string;
28:   }[];
29:   childConnections?: {
30:     id: string;
31:     childId: string;
32:     childName: string;
33:     relationshipType: string;
34:   }[];
35:   invitationStatus?: string | null;
36:   invitationToken?: string | null;
37:   unionInfo?: {
38:     id: string;
39:     unionType: "married" | "civil_union" | "divorced" | "separated" | "partner";
40:     partnerId: string;
41:   } | null;
42:   // Métricas de validación/quórum
43:   validationsCount: number;
44:   validationsNeeded: number;
45:   isReadyForInvite: boolean;
46:   // Posiciones calculadas para el renderizado
47:   x?: number;
48:   y?: number;
49: }
50: 
51: export interface TreeEdgeData {
52:   id: string;
53:   sourceId: string;
54:   targetId: string;
55:   type: "parent-child" | "union";
56:   unionType?: "married" | "civil_union" | "divorced" | "separated" | "partner";
57: }
58: 
59: export interface FocusPersonInfo {
60:   id: string;
61:   firstName: string;
62:   lastName: string;
63:   gender: Gender;
64:   relationshipLabel: string;
65:   isSelf: boolean;
66: }
67: 
68: export interface AvailableMemberOption {
69:   id: string;
70:   firstName: string;
71:   lastName: string;
72:   gender: Gender;
73:   relationshipLabel: string;
74: }
75: 
76: export interface AccessibleTreeOption {
77:   targetUserId: string;
78:   targetPersonId: string;
79:   ownerName: string;
80:   tier: "basic" | "intermediate" | "advanced";
81: }
82: 
83: export interface FamilyGraphData {
84:   nodes: TreeNodeData[];
85:   edges: TreeEdgeData[];
86:   focusPerson: FocusPersonInfo;
87:   availableMembers: AvailableMemberOption[];
88:   isUserZero: boolean;
89:   viewerTier?: "basic" | "intermediate" | "advanced";
90:   isViewerGuest?: boolean;
91:   treeOwnerName?: string;
92:   accessibleTrees?: AccessibleTreeOption[];
93: }
94: 
The above content shows the entire, complete file contents of the requested file.


---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:08:38-06:00
Completed At: 2026-10-04T12:08:39-06:00
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":9,"LineContent":"  dissolveUnionAction,"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":11,"LineContent":"  updatePersonParentsAction,"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":12,"LineContent":"  unlinkParentChildAction,"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":13,"LineContent":"  convertParentToSiblingAction,"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":152,"LineContent":"    const res = await unlinkParentChildAction({ parentId: member.id, childId });"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":167,"LineContent":"    const res = await convertParentToSiblingAction({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":190,"LineContent":"    const res = await updatePersonParentsAction({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":242,"LineContent":"      const parentsResult = await updatePersonParentsAction({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":293,"LineContent":"    const res = await dissolveUnionAction({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx","LineNumber":378,"LineContent":"    const res = await updatePersonParentsAction({"}

---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `grep_search`, `run_command`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:08:39-06:00
Completed At: 2026-10-04T12:08:39-06:00

				The command exited with code 0.
				Output:
				01-app		02-pages	03-architecture	04-community	index.md
01-getting-started
02-guides
03-api-reference
04-glossary.md
index.md
node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md
node_modules/next/dist/docs/01-app/02-guides/authentication.md
node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md
node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md



---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `run_command`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:08:44-06:00
Completed At: 2026-10-04T12:08:44-06:00

				The command exited with code 0.
				Output:
				9:    - app/api-reference/functions/revalidatePath
10:    - app/api-reference/functions/revalidateTag
38:A Server Function can be defined by using the [`use server`](https://react.dev/reference/rsc/use-server) directive. You can place the directive at the top of an **asynchronous** function to mark the function as a Server Function, or at the top of a separate file to mark all exports of that file.
44:  'use server'
58:  'use server'
76:  'use server'
90:  'use server'
106:Server Functions can be inlined in Server Components by adding the `"use server"` directive to the top of the function body:
112:    'use server'
124:    'use server'
136:It's not possible to define Server Functions in Client Components. However, you can invoke them in Client Components by importing them from a file that has the `"use server"` directive at the top of it:
139:'use server'
145:'use server'
170:> **Good to know:** In Client Components, forms invoking Server Actions will queue submissions if JavaScript isn't loaded yet, and will be prioritized for hydration. After hydration, the browser does not refresh on form submission.



---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `view_file`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:08:49-06:00
Completed At: 2026-10-04T12:08:49-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/components/edit-member-modal.tsx`
Total Lines: 1324
Total Bytes: 58147
Showing lines 140 to 400
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
140:   const [children, setChildren] = useState(member.childConnections || []);
141:   const [isUnlinkingChildId, setIsUnlinkingChildId] = useState<string | null>(null);
142:   const [childSuccessMessage, setChildSuccessMessage] = useState<string | null>(null);
143: 
144:   // Estado para reasignación de rol (Convertir en Hermano/a)
145:   const [isConvertingRole, setIsConvertingRole] = useState(false);
146:   const [convertSuccessMessage, setConvertSuccessMessage] = useState<string | null>(null);
147: 
148:   const handleUnlinkChild = async (childId: string) => {
149:     setIsUnlinkingChildId(childId);
150:     setError(null);
151:     setChildSuccessMessage(null);
152:     const res = await unlinkParentChildAction({ parentId: member.id, childId });
153:     setIsUnlinkingChildId(null);
154:     if (res.error) {
155:       setError(res.error);
156:     } else {
157:       setChildren((prev) => prev.filter((c) => c.childId !== childId));
158:       setChildSuccessMessage("Filiación eliminada con éxito.");
159:       router.refresh();
160:     }
161:   };
162: 
163:   const handleConvertToSibling = async (anchorChildId: string) => {
164:     setIsConvertingRole(true);
165:     setError(null);
166:     setConvertSuccessMessage(null);
167:     const res = await convertParentToSiblingAction({
168:       personId: member.id,
169:       anchorPersonId: anchorChildId,
170:       siblingType: "both",
171:     });
172:     setIsConvertingRole(false);
173:     if (res.error) {
174:       setError(res.error);
175:     } else {
176:       setConvertSuccessMessage("¡Rol reasignado exitosamente como hermano/a de la familia!");
177:       setChildren([]);
178:       router.refresh();
179:     }
180:   };
181: 
182:   const handleAssignViewerParents = async () => {
183:     if (!viewerParents || viewerParents.length === 0) return;
184:     const newIds = viewerParents.map((p) => p.id);
185:     setParentIds(newIds);
186:     setIsUpdatingParents(true);
187:     setError(null);
188:     setParentSuccessMessage(null);
189: 
190:     const res = await updatePersonParentsAction({
191:       personId: member.id,
192:       parentIds: newIds,
193:       relationshipType: "biological",
194:     });
195: 
196:     setIsUpdatingParents(false);
197:     if (res.error) {
198:       setError(res.error);
199:     } else {
200:       setParentSuccessMessage(
201:         `¡Vinculado/a como hermano/a exitosamente! Se asignaron a tus progenitores (${viewerParents.map((p) => p.name).join(" y ")}).`
202:       );
203:       router.refresh();
204:     }
205:   };
206: 
207:   const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
208:     e.preventDefault();
209:     setIsPending(true);
210:     setError(null);
211: 
212:     const formData = new FormData();
213:     formData.set("person_id", member.id);
214:     formData.set("first_name", firstName);
215:     formData.set("middle_name", middleName);
216:     formData.set("last_name", lastName);
217:     formData.set("maternal_last_name", maternalLastName);
218:     formData.set("maiden_name", maidenName);
219:     formData.set("gender", gender);
220:     formData.set("is_living", String(isLiving));
221:     formData.set("birth_date", birthDate);
222:     formData.set("death_date", isLiving ? "" : deathDate);
223:     formData.set("birth_place", birthPlace);
224:     formData.set("bio", bio);
225: 
226:     const result = await updateFamilyMemberAction(formData);
227: 
228:     if (result.error) {
229:       setIsPending(false);
230:       setError(result.error);
231:       return;
232:     }
233: 
234:     // Si los progenitores cambiaron respecto a los iniciales, guardarlos también automáticamente
235:     const initialParentIds = (member.parentConnections?.map((p) => p.parentId) || []).sort();
236:     const currentParentIds = [...parentIds].sort();
237:     const parentsChanged =
238:       initialParentIds.length !== currentParentIds.length ||
239:       initialParentIds.some((id, idx) => id !== currentParentIds[idx]);
240: 
241:     if (parentsChanged) {
242:       const parentsResult = await updatePersonParentsAction({
243:         personId: member.id,
244:         parentIds,
245:         relationshipType,
246:       });
247: 
248:       if (parentsResult.error) {
249:         setIsPending(false);
250:         setError(parentsResult.error);
251:         return;
252:       }
253:     }
254: 
255:     setIsPending(false);
256:     router.refresh();
257:     setSuccess(true);
258:     setTimeout(() => {
259:       onClose();
260:     }, 700);
261:   };
262: 
263:   const handleUpdateUnionStatus = async () => {
264:     if (!member.unionInfo) return;
265:     setIsUpdatingUnion(true);
266:     setError(null);
267:     setUnionSuccessMessage(null);
268: 
269:     const res = await updateUnionStatusAction({
270:       personAId: member.id,
271:       personBId: member.unionInfo.partnerId,
272:       unionType,
273:     });
274: 
275:     setIsUpdatingUnion(false);
276:     setConfirmUpdateUnion(false);
277:     if (res.error) {
278:       setError(res.error);
279:     } else {
280:       router.refresh();
281:       setUnionSuccessMessage("Estado de pareja actualizado correctamente.");
282:       setTimeout(() => setUnionSuccessMessage(null), 3000);
283:     }
284:   };
285: 
286:   const handleDissolveUnion = async (deletePersonEntirely = false) => {
287:     if (!member.unionInfo) return;
288: 
289:     setIsDissolvingUnion(true);
290:     setError(null);
291:     setUnionSuccessMessage(null);
292: 
293:     const res = await dissolveUnionAction({
294:       personAId: member.id,
295:       personBId: member.unionInfo.partnerId,
296:       deletePersonId: deletePersonEntirely ? member.id : undefined,
297:     });
298: 
299:     setIsDissolvingUnion(false);
300:     setConfirmDissolve(false);
301: 
302:     if (res.error) {
303:       setError(res.error);
304:     } else {
305:       router.refresh();
306:       if (res.hasSharedChildren) {
307:         setUnionType("separated");
308:         setUnionSuccessMessage(res.message);
309:       } else {
310:         setUnionSuccessMessage(res.message || "Vínculo de pareja disuelto.");
311:         setTimeout(() => {
312:           onClose();
313:         }, 700);
314:       }
315:     }
316:   };
317: 
318:   const handleDelete = async () => {
319:     if (!confirmDelete) {
320:       setConfirmDelete(true);
321:       return;
322:     }
323: 
324:     setIsDeleting(true);
325:     setError(null);
326: 
327:     const result = await deleteFamilyMemberAction(member.id);
328: 
329:     setIsDeleting(false);
330:     if (result.error) {
331:       setError(result.error);
332:       setConfirmDelete(false);
333:     } else {
334:       router.refresh();
335:       onClose();
336:     }
337:   };
338: 
339:   const handleResetClaim = async () => {
340:     setIsResettingClaim(true);
341:     setError(null);
342:     setResetSuccessMessage(null);
343: 
344:     const res = await resetPersonClaimAction(member.id);
345:     setIsResettingClaim(false);
346:     setConfirmResetClaim(false);
347: 
348:     if (res.error) {
349:       setError(res.error);
350:     } else {
351:       setResetSuccessMessage(res.message || "Ficha liberada exitosamente.");
352:       router.refresh();
353:       setTimeout(() => {
354:         onClose();
355:       }, 1500);
356:     }
357:   };
358: 
359:   const handleAddParent = () => {
360:     if (!selectedNewParentId || parentIds.includes(selectedNewParentId)) return;
361:     if (parentIds.length >= 2) {
362:       setError("Un familiar suele tener un máximo de 2 progenitores registrados en el árbol.");
363:       return;
364:     }
365:     setParentIds([...parentIds, selectedNewParentId]);
366:     setSelectedNewParentId("");
367:   };
368: 
369:   const handleRemoveParent = (idToRemove: string) => {
370:     setParentIds(parentIds.filter((id) => id !== idToRemove));
371:   };
372: 
373:   const handleSaveParents = async () => {
374:     setIsUpdatingParents(true);
375:     setError(null);
376:     setParentSuccessMessage(null);
377: 
378:     const res = await updatePersonParentsAction({
379:       personId: member.id,
380:       parentIds,
381:       relationshipType,
382:     });
383: 
384:     setIsUpdatingParents(false);
385:     if (res.error) {
386:       setError(res.error);
387:     } else {
388:       setParentSuccessMessage("Filiación y progenitores actualizados.");
389:       router.refresh();
390:       setTimeout(() => setParentSuccessMessage(null), 3000);
391:     }
392:   };
393: 
394:   if (!isOpen) return null;
395: 
396:   return (
397:     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
398:       <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
399:         {/* Botón Cerrar */}
400:         <button
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:09:16-06:00
Completed At: 2026-10-04T12:09:17-06:00
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/services/get-family-graph.ts","LineNumber":19,"LineContent":"export async function getFamilyGraph("}
{"File":"/Users/ismael/Developer/happy-tree/src/app/page.tsx","LineNumber":6,"LineContent":"import { AddMemberModal } from \"@/features/genealogy/components/add-member-modal\";"}
{"File":"/Users/ismael/Developer/happy-tree/src/app/page.tsx","LineNumber":253,"LineContent":"                  \u003cAddMemberModal availableAnchors={availableAnchors} /\u003e"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/actions.ts","LineNumber":251,"LineContent":"export async function createFamilyMemberAction(formData: FormData) {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/family-directory.tsx","LineNumber":9,"LineContent":"import { AddMemberModal } from \"@/features/genealogy/components/add-member-modal\";"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/family-directory.tsx","LineNumber":300,"LineContent":"        \u003cAddMemberModal"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/add-member-modal.tsx","LineNumber":4,"LineContent":"import { createFamilyMemberAction } from \"@/features/genealogy/actions\";"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/add-member-modal.tsx","LineNumber":8,"LineContent":"export interface AddMemberModalProps {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/add-member-modal.tsx","LineNumber":17,"LineContent":"export function AddMemberModal({"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/add-member-modal.tsx","LineNumber":24,"LineContent":"}: AddMemberModalProps) {"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/add-member-modal.tsx","LineNumber":76,"LineContent":"    const result = await createFamilyMemberAction(formData);"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/tree-canvas.tsx","LineNumber":8,"LineContent":"import { AddMemberModal } from \"@/features/genealogy/components/add-member-modal\";"}
{"File":"/Users/ismael/Developer/happy-tree/src/features/genealogy/components/tree-canvas.tsx","LineNumber":818,"LineContent":"        \u003cAddMemberModal"}
{"File":"/Users/ismael/Developer/happy-tree/src/app/tree/page.tsx","LineNumber":4,"LineContent":"import { AddMemberModal } from \"@/features/genealogy/components/add-member-modal\";"}
{"File":"/Users/ismael/Developer/happy-tree/src/app/tree/page.tsx","LineNumber":40,"LineContent":"  const graph = await getFamilyGraph(focus, friendId);"}
{"File":"/Users/ismael/Developer/happy-tree/src/app/tree/page.tsx","LineNumber":95,"LineContent":"            \u003cAddMemberModal"}
{"File":"/Users/ismael/Developer/happy-tree/src/app/tree/page.tsx","LineNumber":162,"LineContent":"        \u003cTreeCanvas graph={graph} /\u003e"}

---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `grep_search`, `view_file`

Ya tengo el diagnóstico completo. Reviso dos detalles más antes de implementar.

---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:09:17-06:00
Completed At: 2026-10-04T12:09:17-06:00
File Path: `file:///Users/ismael/Developer/happy-tree/src/features/genealogy/components/tree-canvas.tsx`
Total Lines: 849
Total Bytes: 35413
Showing lines 560 to 849
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
560:                         {formatFullName(node)}
561:                       </h4>
562:                       {isFemale && (
563:                         <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-pink-500/20 text-pink-400 font-bold text-[9px] shrink-0">
564:                           ♀
565:                         </span>
566:                       )}
567:                       {isMale && (
568:                         <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-blue-500/20 text-blue-400 font-bold text-[9px] shrink-0">
569:                           ♂
570:                         </span>
571:                       )}
572:                     </div>
573:                     <div className="flex items-center gap-1">
574:                       <span
575:                         className={`text-[10px] font-medium truncate block ${
576:                           isFemale ? "text-pink-400" : isMale ? "text-blue-400" : "text-emerald-400"
577:                         }`}
578:                         title={node.relationshipExplanation || node.relationshipLabel}
579:                       >
580:                         {node.relationshipLabel}
581:                       </span>
582:                       {node.relationshipExplanation && !isCenter && (
583:                         <span
584:                           title={`Parentesco inferido: ${node.relationshipExplanation}`}
585:                           className="cursor-help text-amber-400/80 hover:text-amber-300"
586:                         >
587:                           <Sparkles className="w-2.5 h-2.5" />
588:                         </span>
589:                       )}
590:                     </div>
591:                   </div>
592:                 </div>
593: 
594:                 <div className="flex items-center gap-1 shrink-0">
595:                   {isCenter && (
596:                     <span className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
597:                       Centro
598:                     </span>
599:                   )}
600:                   {/* Botón rápido para agregar pariente anclado a este nodo (Bloqueado para fichas de otros usuarios verificados) */}
601:                   {!graph.isViewerGuest && (() => {
602:                     const isSelfNode = node.id === graph.focusPerson.id || node.relationshipCategory === "self";
603:                     if (node.isClaimed && !isSelfNode) return null;
604:                     return (
605:                       <button
606:                         onClick={(e) => {
607:                           e.stopPropagation();
608:                           setActiveAddAnchor(node);
609:                         }}
610:                         title={`Añadir pariente anclado a ${node.firstName}`}
611:                         className="p-1 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 rounded-lg transition"
612:                       >
613:                         <UserPlus className="w-3 h-3" />
614:                       </button>
615:                     );
616:                   })()}
617: 
618:                   {/* Solo se puede editar si es su propia ficha personal (isSelf) O si es una ficha no reclamada */}
619:                   {(() => {
620:                     if (graph.isViewerGuest) return null;
621:                     const isSelfNode = node.id === graph.focusPerson.id || node.relationshipCategory === "self";
622:                     if (!isSelfNode && node.isClaimed) return null;
623:                     return (
624:                       <button
625:                         onClick={(e) => {
626:                           e.stopPropagation();
627:                           setActiveEditMember(node);
628:                         }}
629:                         title={isSelfNode ? "Editar mi perfil" : "Editar ficha familiar"}
630:                         className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition"
631:                       >
632:                         <Pencil className="w-3 h-3" />
633:                       </button>
634:                     );
635:                   })()}
636:                 </div>
637:               </div>
638: 
639:               {/* Estado y Quorum */}
640:               <div className="my-auto pt-0.5">
641:                 {node.isClaimed ? (
642:                   <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
643:                     <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
644:                     <span>Reclamado</span>
645:                   </span>
646:                 ) : !node.isLiving ? (
647:                   <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-400 bg-neutral-950 border border-neutral-800 px-2 py-0.5 rounded-full">
648:                     <span>Fallecido</span>
649:                   </span>
650:                 ) : node.invitationStatus === "pending" ? (
651:                   <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full">
652:                     <Clock className="w-2.5 h-2.5 text-amber-400" />
653:                     <span>Invitado</span>
654:                   </span>
655:                 ) : (
656:                   <span className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-300 bg-teal-950/60 border border-teal-800/40 px-2 py-0.5 rounded-full">
657:                     <CheckCircle className="w-2.5 h-2.5 text-teal-400" />
658:                     <span>Ficha Preliminar</span>
659:                   </span>
660:                 )}
661:               </div>
662: 
663:               {/* Botones de Acción inferior */}
664:               <div className="pt-1.5 border-t border-neutral-800/60 flex items-center justify-between">
665:                 <span className="text-[10px] text-neutral-500 font-mono">
666:                   {node.birthDate ? node.birthDate.substring(0, 4) : "—"}
667:                 </span>
668: 
669:                 <div className="flex items-center gap-1">
670:                   {/* Si no es el centro, botón para centrar y explorar su propio árbol */}
671:                   {!isCenter && (
672:                     <button
673:                       onClick={() => {
674:                         router.push(`/tree?focus=${node.id}`);
675:                       }}
676:                       title="Explorar árbol desde este familiar"
677:                       className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white transition border border-neutral-700/60"
678:                     >
679:                       <Compass className="w-2.5 h-2.5 text-emerald-400" />
680:                       <span>Ver árbol</span>
681:                     </button>
682:                   )}
683: 
684:                   {/* Botón para añadirle parientes directamente a este nodo */}
685:                   <button
686:                     onClick={() => setActiveAddAnchor(node)}
687:                     title={`Añadir pariente a ${node.firstName}`}
688:                     className="p-1 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 rounded transition"
689:                   >
690:                     <UserPlus className="w-3 h-3" />
691:                   </button>
692: 
693:                   {/* Invitar si está viva y sin reclamar */}
694:                   {node.isLiving && !node.isClaimed && (
695:                     <button
696:                       onClick={() => setActiveInviteMember(node)}
697:                       title="Generar invitación criptográfica"
698:                       className="p-1 text-neutral-400 hover:text-teal-400 hover:bg-neutral-800 rounded transition"
699:                     >
700:                       <KeyRound className="w-3 h-3" />
701:                     </button>
702:                   )}
703:                 </div>
704:               </div>
705:             </div>
706:           );
707:         })}
708:       </div>
709: 
710:       {/* Controles Flotantes de Navegación y Visualización */}
711:       <div className="tree-controls absolute bottom-6 right-6 flex items-center gap-1 bg-neutral-900/90 border border-neutral-800 p-1.5 rounded-2xl shadow-xl backdrop-blur-md z-10">
712:         {/* Botón para añadir familiar desde el lienzo */}
713:         {!graph.isViewerGuest && (
714:           <>
715:             <button
716:               onClick={() => setActiveAddAnchor(graph.nodes.find((n) => n.id === graph.focusPerson.id) || null)}
717:               title="Añadir familiar al árbol genealógico"
718:               className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md transition"
719:             >
720:               <UserPlus className="w-3.5 h-3.5" />
721:               <span className="hidden sm:inline">Añadir Pariente</span>
722:             </button>
723:             <div className="w-[1px] h-5 bg-neutral-800 mx-1" />
724:           </>
725:         )}
726: 
727:         {/* Toggle para ocultar parejas de hermanos */}
728:         <button
729:           onClick={() => setHideSiblingSpouses(!hideSiblingSpouses)}
730:           title={
731:             hideSiblingSpouses
732:               ? "Mostrar parejas de hermanos/colaterales"
733:               : "Ocultar parejas de hermanos (Modo Troncal)"
734:           }
735:           className={`p-2 rounded-xl transition ${
736:             !hideSiblingSpouses
737:               ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
738:               : "text-neutral-400 hover:text-white hover:bg-neutral-800"
739:           }`}
740:         >
741:           {hideSiblingSpouses ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
742:         </button>
743: 
744:         <div className="w-[1px] h-5 bg-neutral-800 mx-1" />
745: 
746:         <button
747:           onClick={() => setScale((s) => Math.min(s * 1.2, 2.5))}
748:           title="Acercar (Zoom In)"
749:           className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
750:         >
751:           <ZoomIn className="w-4 h-4" />
752:         </button>
753:         <button
754:           onClick={() => setScale((s) => Math.max(s / 1.2, 0.4))}
755:           title="Alejar (Zoom Out)"
756:           className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
757:         >
758:           <ZoomOut className="w-4 h-4" />
759:         </button>
760:         <button
761:           onClick={handleReset}
762:           title="Centrar Árbol"
763:           className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
764:         >
765:           <Compass className="w-4 h-4" />
766:         </button>
767:       </div>
768: 
769:       {/* Leyenda en pie de lienzo */}
770:       <div className="tree-controls absolute bottom-6 left-6 hidden md:flex items-center gap-4 bg-neutral-900/80 border border-neutral-800 px-4 py-2 rounded-2xl text-xs text-neutral-400 backdrop-blur-sm z-10">
771:         <div className="flex items-center gap-1.5">
772:           <span className="w-3.5 h-3.5 rounded-full bg-pink-500/20 text-pink-400 font-bold text-[10px] flex items-center justify-center">
773:             ♀
774:           </span>
775:           <span>Mujer</span>
776:         </div>
777:         <div className="flex items-center gap-1.5">
778:           <span className="w-3.5 h-3.5 rounded-full bg-blue-500/20 text-blue-400 font-bold text-[10px] flex items-center justify-center">
779:             ♂
780:           </span>
781:           <span>Hombre</span>
782:         </div>
783:         <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3">
784:           <span className="w-2.5 h-1 bg-emerald-400 inline-block rounded" />
785:           <span>Horquilla de Hermanos</span>
786:         </div>
787:         <div className="flex items-center gap-1.5">
788:           <span className="text-red-400 font-bold">≠</span>
789:           <span>Separados / Divorciados</span>
790:         </div>
791:       </div>
792: 
793:       {/* Modal de Edición */}
794:       {activeEditMember && (
795:         <EditMemberModal
796:           member={activeEditMember}
797:           availableFamilyMembers={graph.nodes.map((n) => ({
798:             id: n.id,
799:             name: formatFullName(n),
800:           }))}
801:           viewerParents={(() => {
802:             const viewerParentIds = graph.edges
803:               .filter((e) => e.type === "parent-child" && e.targetId === graph.focusPerson.id)
804:               .map((e) => e.sourceId);
805:             return graph.nodes
806:               .filter((n) => viewerParentIds.includes(n.id))
807:               .map((n) => ({ id: n.id, name: formatFullName(n) }));
808:           })()}
809:           isUserZero={graph.isUserZero}
810:           isSelf={activeEditMember?.id === graph.focusPerson.id}
811:           isOpen={Boolean(activeEditMember)}
812:           onClose={() => setActiveEditMember(null)}
813:         />
814:       )}
815: 
816:       {/* Modal de Añadir Pariente Contextual (Anclado al nodo seleccionado) */}
817:       {activeAddAnchor && (
818:         <AddMemberModal
819:           defaultAnchorId={activeAddAnchor.id}
820:           defaultAnchorName={formatFullName(activeAddAnchor)}
821:           availableAnchors={availableAnchors}
822:           isOpen={Boolean(activeAddAnchor)}
823:           onClose={() => setActiveAddAnchor(null)}
824:         />
825:       )}
826: 
827:       {/* Modal de Invitación */}
828:       {activeInviteMember && (
829:         <InviteModal
830:           personId={activeInviteMember.id}
831:           personName={formatFullName(activeInviteMember)}
832:           relationshipLabel={activeInviteMember.relationshipLabel}
833:           existingToken={activeInviteMember.invitationToken}
834:           isOpen={Boolean(activeInviteMember)}
835:           onClose={() => setActiveInviteMember(null)}
836:         />
837:       )}
838: 
839:       {/* Modal de Búsqueda y Explorador de Árboles (Cmd+K) */}
840:       <TreeSearchModal
841:         isOpen={isSearchOpen}
842:         onClose={() => setIsSearchOpen(false)}
843:         currentPersonId={graph.focusPerson.id}
844:         quickMembers={graph.availableMembers}
845:       />
846:     </div>
847:   );
848: }
849: 
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.


---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `write_to_file`

Diagnóstico listo. Ahora implemento. Primero, un módulo puro de **integridad del grafo** que detecta vínculos imposibles (p. ej. una unión entre madre e hijo):

---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:09:39-06:00
Completed At: 2026-10-04T12:09:41-06:00
Created file file:///Users/ismael/Developer/happy-tree/src/features/genealogy/utils/graph-integrity.ts with requested content.
If relevant, proactively run terminal commands to execute this code for the USER. Don't ask for permission.

---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `write_to_file`

Ahora el núcleo: un **motor de layout puro y reutilizable** (servidor y cliente) basado en unidades familiares, que mantiene parejas contiguas y centra a cada familia bajo sus padres reales:

---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:11:51-06:00
Completed At: 2026-10-04T12:11:52-06:00
Created file file:///Users/ismael/Developer/happy-tree/src/features/genealogy/utils/tree-layout.ts with requested content.
If relevant, proactively run terminal commands to execute this code for the USER. Don't ask for permission.

---

## 👤 Usuario

<USER_REQUEST>
Por que no puedo exportar esta conversacion?
Ayudame a exportar esto para que lo siga trabajando otro agente
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-04T12:29:58-06:00.

The user's current state is as follows:
Active Document: /Users/ismael/Developer/happy-tree/AGENTS.md (LANGUAGE_MARKDOWN)
Cursor is on line: 1
Other open documents:
- /Users/ismael/Developer/happy-tree/AGENTS.md (LANGUAGE_MARKDOWN)
Browser State:
  Page 7F549BCADA5FE63CA58153F9D59EBFF8 (Sign in to your account) - https://login.microsoftonline.com/b41b72d0-4e9f-4c26-8a69-f949f367c91d/oauth2/v2... [ACTIVE]
    Viewport: 1200x818, Page Height: 818
</ADDITIONAL_METADATA>
<USER_SETTINGS_CHANGE>
The user changed setting `Model Selection` from Claude Opus 5.5 (High) to Gemini 3.8 Flash (Medium). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.
</USER_SETTINGS_CHANGE>

---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `run_command`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:30:03-06:00
Completed At: 2026-10-04T12:30:03-06:00

				The command exited with code 0.
				Output:
				total 0
drwxr-xr-x@ 5 ismael  staff  160 Oct  4 12:03 .
drwxr-xr-x@ 9 ismael  staff  288 Oct  4 12:21 ..
drwxr-xr-x@ 3 ismael  staff   96 Oct  4 12:03 .system_generated
drwxr-xr-x@ 3 ismael  staff   96 Oct  4 12:03 .user_uploaded
drwxr-xr-x@ 2 ismael  staff   64 Oct  4 12:03 scratch



---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `run_command`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:30:11-06:00
Completed At: 2026-10-04T12:30:11-06:00

				The command exited with code 0.
				Output:
				total 920
drwxr-xr-x@ 4 ismael  staff     128 Oct  4 12:03 .
drwxr-xr-x@ 3 ismael  staff      96 Oct  4 12:03 ..
-rw-r--r--@ 1 ismael  staff  128591 Oct  4 12:30 transcript.jsonl
-rw-r--r--@ 1 ismael  staff  313615 Oct  4 12:30 transcript_full.jsonl



---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `run_command`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:30:15-06:00
Completed At: 2026-10-04T12:30:15-06:00

				The command exited with code 0.
				Output:
				?? src/features/genealogy/utils/graph-integrity.ts
?? src/features/genealogy/utils/tree-layout.ts



---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `run_command`



---

## 🤖 Asistente (AI)

Created At: 2026-10-04T12:30:20-06:00
Completed At: 2026-10-04T12:30:20-06:00

				The command exited with code 1.
				Output:
				  File "<string>", line 26
    tc_names = [f"`{tc.get(\"name\", \"tool\")}`" for tc in tool_calls]
                                                  ^
SyntaxError: f-string expression part cannot include a backslash



---

## 🤖 Asistente (AI)

*Herramientas ejecutadas:* `run_command`



---

