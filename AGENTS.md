<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HAPPY TREE — AI AGENT ARCHITECTURAL & SYSTEM REFERENCE MANUAL
> **Audience**: AI Agents, LLM Pair Programmers, Autonomous Coding Assistants.  
> **Purpose**: Single-source-of-truth technical blueprint. Read this file to understand the architecture, data flow, layout algorithms, security boundaries, and known edge-case gotchas without crawling the whole codebase.
> **Full standalone mirror**: [docs/AI_ARCHITECTURE_REFERENCE.md](file:///Users/ismael/Developer/happy-tree/docs/AI_ARCHITECTURE_REFERENCE.md)

---

## 1. Executive Summary & Core Invariants

**Happy Tree** is a collaborative, real-time genealogical graph platform built with Next.js 16 (Turbopack, App Router, Server Actions) and Supabase (PostgreSQL, Auth, RLS).

### Core Invariants (MUST NEVER BE BROKEN):
1. **Multi-Family Isolation**: Each family is an independent connected component in the graph. A regular user belongs to their own family and MUST NOT see, search, or edit nodes in external families unless an explicit access grant (`tree_access_shares` with status `approved`) exists.
2. **User Zero (Superadmin)**: The initial user is flagged with `profiles.is_user_zero = true` (Ismael). Only User Zero has global audit permissions across all trees and directories. Regular users are strictly scoped to their own family and approved friends.
3. **Bilateral Symmetrical Layout**: In the tree canvas, Generation -1 (parents and uncles) must be sorted bilaterally:
   - **Maternal Branch (Left)**: Maternal uncle spouse (outer left) $\rightarrow$ Maternal uncle $\rightarrow$ Mother (center-left).
   - **Paternal Branch (Right)**: Father (center-right) $\rightarrow$ Paternal uncle $\rightarrow$ Paternal uncle spouse (outer right).
   - Maternal and paternal branches MUST NOT cross or interleave. The mother and father are the central axis of Generation -1.
4. **SVG Orthogonal Bus Bars**: Sibling groups share a horizontal bus bar spanning `[min(child.x) + NODE_WIDTH / 2, max(child.x) + NODE_WIDTH / 2]`. Parents connect to this bar with a single vertical drop line. Spouses display a heart icon (`<3`) centered between their nodes.
5. **Claimed Profile Protection**: When `persons.is_claimed = true`, only the owner (`claimed_by_user_id === user.id`) can edit their personal data or add relations directly to their personal anchor. **Exception**: User Zero can edit data and relations of claimed profiles (support during development); deleting a claimed profile still requires "Liberar ficha" first.
6. **Parental Lineage Integrity & Explicit Unions**:
   - Sibling registration must explicitly declare shared parentage (`'both' | 'maternal' | 'paternal'`). A sibling must ONLY be linked to the designated biological parent(s).
   - Registering a second parent must NEVER automatically forge a marital union with existing parents; couple unions must be explicitly opt-in (`create_union === true`).
   - Synthetic married unions between co-parents without database entries are strictly prohibited in `get-family-graph.ts`.
7. **Children Centered Under Their Parents (every generation)**:
   - No row is centered independently across `x = 0`, including the focus row and the parents row. Each sibling cluster must align directly underneath the horizontal midpoint of their parent unit in `gen - 1`: `targetCenterX = (P1.x + P2.x + NODE_WIDTH) / 2`. `tree-layout.ts` alternates up/down passes (partners move apart when their children need room) and always ends with a top-down pass; the whole tree is then shifted so the focus sits at `x = 0`.
   - A person's partner is attached outside their full-sibling group, never between siblings.
   - Multi-cluster rows must resolve spacing collisions using 1D least-squares block merging with `GAP_X = 50px`, maintaining parental vertical drop symmetry without overlapping.
8. **Biological Union Sanity & Non-Contradiction**:
   - Marital / partner unions (`union_edges`) MUST NEVER exist between individuals who share direct biological parent-child, ancestor-descendant, or full/half sibling relationships.
   - `partitionUnionsByIntegrity` in `graph-integrity.ts` automatically partitions and purges invalid unions in $O(V+E)$ before BFS traversal or layout calculation, preventing corrupt historical data from breaking tree hierarchy.
   - Database triggers (`assert_union_integrity` and `assert_parent_edge_integrity`) prevent invalid unions and parent cycles at the persistence layer.
9. **Blended Families & Multi-Partner Barycentric Layout**:
   - An individual with multiple partners (ex-spouses, current partner, co-parents) is placed contiguously as a generational axis: `[Partner A] [Person] [Partner B]`.
   - Each sibling group aligns under the horizontal midpoint of their biological parents' union (`resolveChildAnchor`).
   - Adding a child in `createFamilyMemberAction` only auto-links to a spouse if exactly ONE active spouse exists, or if `co_parent_id` is explicitly passed.
10. **Friends & Dating Are Not Kinship**:
   - Friends and dating partners live in `social_connections` (`kind: 'friend' | 'dating'`), NEVER in `union_edges`. They are not drawn on the canvas, never feed `getConnectedFamilyIds`, and never merge two families.
   - `getFamilyMembers` drops social-only people (`socialOnlyPersonIds`) from the family directory; they appear only in the "Amigos" tab (`/?view=amigos`).
   - Friends see your tree only through `tree_access_shares`, which applies once they have an account.

---

## 2. Technology Stack & Key Conventions

| Layer | Technology | Key Nuances / Versions |
|---|---|---|
| **Framework** | Next.js 16.3.6 (Turbopack) | `searchParams` is a Promise (`await searchParams`). `cookies()` is async (`await cookies()`). Middleware uses `@supabase/ssr`. |
| **Database & Auth** | Supabase (PostgreSQL 15+) | Row Level Security (RLS) enabled. Server client at `src/lib/supabase/server.ts`, Browser client at `src/lib/supabase/client.ts`. |
| **Styling & UI** | Tailwind CSS + Lucide React | Dark-mode native theme (`bg-neutral-950`, emerald accents). Fully custom SVG tree renderer with pan & zoom canvas. |
| **Language** | TypeScript 5.x (Strict) | All API routes, actions, and server components strictly typed. Null safety on all database joins. |

---

## 3. Directory & File Blueprint

```text
src/
├── app/
│   ├── (auth)/                  # Auth flows: login, reset-password, invite/[token], setup-zero
│   ├── auth/callback/route.ts   # OAuth & Password reset code-exchange route handler
│   ├── auth/signout/route.ts    # POST route for session termination
│   ├── tree/page.tsx            # Tree Canvas Server Component (/tree?focus=...&friendId=...)
│   ├── page.tsx                 # Family Directory Server Component (perspective switcher)
│   ├── test-db/page.tsx         # Diagnostic page for Supabase connectivity and schema health
│   ├── globals.css              # Global tokens and animations
│   └── layout.tsx               # Root layout with font definitions and session providers
│
├── features/
│   ├── auth/                    # Auth server actions (login, reset, setup User Zero)
│   ├── genealogy/
│   │   ├── actions.ts           # Core server actions: CRUD members, search, endorsements, claims
│   │   ├── friends-actions.ts   # Tree sharing actions: send request, approve/reject, set tiers
│   │   ├── types.ts             # Member, Kinship, Permission tier type definitions
│   │   ├── types/
│   │   │   └── graph.types.ts   # TreeNodeData, TreeEdgeData, FamilyGraphData interfaces
│   │   ├── services/
│   │   │   └── get-family-graph.ts # GENERATIONAL BFS ENGINE & BILATERAL LAYOUT (CORE)
│   │   ├── utils/
│   │   │   ├── kinship-inference.ts # Deduce exact kinship labels + getConnectedFamilyIds
│   │   │   ├── graph-integrity.ts   # Pure O(V+E) union integrity validator & partitioner
│   │   │   ├── tree-layout.ts       # Pure coordinate layout engine & collision resolver
│   │   │   ├── layout-crossings.ts  # Counts parent→child crossings between rows; local search (flip couples, swap sibling blocks) to reduce them
│   │   │   ├── tree-scene.ts        # What the canvas draws (cards, buses, unions, colors, highlight); shared by canvas and PDF
│   │   │   ├── tree-svg.ts          # Scene → standalone SVG for the PDF (WinAnsi-safe text; icons drawn as paths)
│   │   │   ├── viewport.ts          # Pan/zoom math: zoom at a point, pinch, fit to bounds
│   │   │   └── social-connections.ts # Friends/dating helpers (socialOnlyPersonIds)
│   │   └── components/
│   │       ├── tree-canvas.tsx         # Pan/Zoom SVG canvas, orthogonal bus bars, node rendering
│   │       ├── export-pdf-modal.tsx    # PDF export: light/dark preview of the current scene, one page sized to the tree (jsPDF + svg2pdf, lazy-loaded)
│   │       ├── person-card.tsx         # Portrait card (tree + directory): avatar, name, kinship, age; no actions
│   │       ├── person-details-panel.tsx # Side panel: dates, notes, family, and every action (permission-gated)
│   │       ├── tree-selector.tsx       # Dropdown: My Tree vs. Approved Friend Trees
│   │       ├── tree-search-modal.tsx   # Cmd+K quick person search modal
│   │       ├── family-directory.tsx    # Table/grid list of family members with status badges
│   │       ├── friends-directory.tsx   # "Amigos" tab: friends/dating, invitations, tree access tiers
│   │       ├── add-member-modal.tsx    # Modal to add relative connected to an anchor
│   │       ├── edit-member-modal.tsx   # Modal to edit person, parental edges, and unions
│   │       ├── friends-manager-modal.tsx # Manage friend requests and granted tree access tiers
│   │       └── endorsements-manager-modal.tsx # Quorum validations to unlock invitations
│   └── invitations/             # Token-based email invitation flows
│
└── lib/
    └── supabase/
        ├── client.ts            # Client-side Supabase instance
        ├── server.ts            # Server-side Supabase client using cookies()
        └── middleware.ts        # Session refresh and auth route protection
```

---

## 4. Database Schema & Data Models

### 4.1. `profiles`
Maps Supabase `auth.users` to a genealogical identity.
- `id` (UUID, PK): Matches `auth.users.id`.
- `person_id` (UUID, FK $\rightarrow$ `persons.id`, nullable): The person node claimed by this account.
- `is_user_zero` (BOOLEAN): `true` for root administrator (Ismael). Grants system-wide bypass.

### 4.2. `persons`
Core genealogical entity.
- `id` (UUID, PK).
- `first_name`, `middle_name`, `last_name`, `maternal_last_name`, `maiden_name` (TEXT).
- `gender` (`'male' | 'female' | 'unknown'`).
- `birth_date`, `death_date` (DATE/TEXT).
- `is_living` (BOOLEAN).
- `is_claimed` (BOOLEAN): `true` if an authenticated account owns this node.
- `claimed_by_user_id` (UUID, nullable).
- `created_by_user_id` (UUID): Creator of the record.

### 4.3. `parent_child_edges`
Vertical genealogical relations.
- `id` (UUID, PK).
- `parent_id` (UUID, FK $\rightarrow$ `persons.id`).
- `child_id` (UUID, FK $\rightarrow$ `persons.id`).
- `relationship_type` (`'biological' | 'adopted' | 'foster' | 'step'`).
- `status` (`'confirmed' | 'pending' | 'rejected'`).

### 4.4. `union_edges`
Horizontal / marital relations.
- `id` (UUID, PK).
- `person_a_id`, `person_b_id` (UUID, FK $\rightarrow$ `persons.id`).
- `union_type` (`'married' | 'partner' | 'civil_union' | 'separated' | 'divorced'`).
- `status` (`'confirmed' | 'pending' | 'rejected'`).
> **CRITICAL RULE**: `separated` and `divorced` unions ONLY appear in the visual graph if the couple shares at least one child in `parent_child_edges` (`hasSharedChildren === true`). If they do not share children, the union is considered inactive and is excluded from `treeVisibleUnions`.

### 4.5. `tree_access_shares`
Access control table for sharing trees with external friends.
- `id` (UUID, PK).
- `requester_user_id` (UUID, FK $\rightarrow$ `profiles.id`).
- `granter_user_id` (UUID, FK $\rightarrow$ `profiles.id`).
- `granter_person_id` (UUID, FK $\rightarrow$ `persons.id`).
- `tier` (`'profile' | 'basic' | 'intermediate' | 'advanced'`):
  - `'profile'`: Only the granter's own card, no relatives at all (for exes and acquaintances).
  - `'basic'`: Immediate home family only (Parents, Siblings, Spouse, Children).
  - `'intermediate'`: Home family + Grandparents, Uncles, Aunts, Cousins, Nephews/Nieces, Grandchildren.
  - `'advanced'`: Intermediate + the rest of the connected component (great-grandparents, distant relatives).
  - The owner's own view (`owner`) is intermediate + blended-family completion + the whole direct line (all ancestors and descendants, e.g. great-grandparents), labeled `Bisabuelo/a`, `Tatarabuelo/a`, `Bisnieto/a`… in `inferKinship` (6.1).
  - The owner picks how much of their own tree to see (`utils/tree-scope.ts`, selector "Cercana / Extendida / Completa" in the canvas controls, saved in cookie `ht_tree_scope`, overridable with `?alcance=`): `close` → `basic`, `extended` (default) → `owner`, `full` → `advanced` (great-uncles `Tío abuelo`, `Tío segundo`, `Primo segundo`: `inferKinship` 9.1). Guests never use it; they stay clamped to their granted tier.
  - Guests are clamped server-side: `get-family-graph.ts` builds `grantedNodeIds` from the granter's person and tier; `?focus=` outside that set falls back to the granter, and loaded nodes are intersected with it.
- `status` (`'pending' | 'approved' | 'rejected'`).

### 4.6. Dynamic Relationship Payloads (`childConnections` & `parentConnections`)
To allow editing and reassigning roles without mutating database schemas:
- `parentConnections`: `{ edgeId: string; parentId: string; parentName: string; relationshipType: string }[]`
- `childConnections`: `{ edgeId: string; childId: string; childName: string; relationshipType: string }[]`
Exposed on `FamilyMemberItem`, `EditableMemberData`, and `TreeNodeData`. The edit modal now loads relations fresh via `getMemberRelationsAction` instead.

### 4.7. `social_connections`
Friends and dating relationships, kept outside the genealogical graph (migration `20261005000000_social_connections.sql`).
- `person_a_id`, `person_b_id` (UUID, FK $\rightarrow$ `persons.id`): one row per pair, order-independent (unique on `LEAST/GREATEST`).
- `kind` (`'friend' | 'dating'`).
- `created_by_user_id` (UUID).
- `proposed_union_type` (`'partner' | 'married' | null`) and `proposed_by_user_id`: pending proposal to make a dating relationship formal (migration `20261005000001`).
- RLS: visible/editable by the creator, the owners of either person, and User Zero.
- RPC `grant_tree_access(p_requester_user_id, p_tier)`: the owner grants or changes access to their tree directly (approved share), without a prior request.

---

## 5. Core Architectural Engines

### 5.1. Generational BFS Layout Engine (`get-family-graph.ts`)

#### Phase 1: Topological Generational Assignment
A breadth-first search (BFS) runs starting at `centerPersonId` (Generation 0):
- Parents of current node: `gen = currentGen - 1`.
- Children of current node: `gen = currentGen + 1`.
- Spouses/partners of current node: `gen = currentGen` (same generation).

#### Phase 2: Non-Recursive Branch Partitioning
To group relatives bilaterally without stack overflow:
1. `motherPerson` and `fatherPerson` are identified from `parentIds` of `centerPersonId`.
2. `maternalIds` and `paternalIds` sets are populated in linear time:
   - `motherId` and her parents $\rightarrow$ `maternalIds`.
   - `fatherId` and his parents $\rightarrow$ `paternalIds`.
   - Siblings of mother $\rightarrow$ `maternalIds`. Siblings of father $\rightarrow$ `paternalIds`.
   - Spouses of maternal uncles/aunts $\rightarrow$ `maternalIds`.
   - Spouses of paternal uncles/aunts $\rightarrow$ `paternalIds`.
3. **ISOLATION BOUNDARY**: Partner propagation MUST NEVER propagate across the primary parents union (`motherId <-> fatherId`), and `motherId` must never be added to `paternalIds`, nor `fatherId` to `maternalIds`.

#### Phase 3: Row Sorting Table

| Generation | Node Type | Canonical Sorting Rank | Horizontal Position |
|---|---|---|---|
| **Gen -1** | Maternal Uncle Spouse (e.g. Eva Godoy) | `10` | Far Left |
| **Gen -1** | Maternal Uncle/Aunt (e.g. Luis Rodriguez) | `20` | Left (beside mother) |
| **Gen -1** | **Mother (`motherId`, e.g. Rubi)** | `30` | **Center-Left** |
| **Gen -1** | **Father (`fatherId`, e.g. Jorge Andrés)** | `40` | **Center-Right** |
| **Gen -1** | Paternal Uncle/Aunt | `50` | Right (beside father) |
| **Gen -1** | Paternal Uncle Spouse | `60` | Far Right |
| **Gen 0** | Maternal Cousins / Maternal Half-Siblings | `5 - 15` | Left of center |
| **Gen 0** | **Focus Person (`centerPersonId`)** | `20` | Center |
| **Gen 0** | Full Siblings / Center Spouses | `22 - 25` | Center-Right |
| **Gen 0** | Paternal Half-Siblings / Paternal Cousins | `30 - 35` | Right of center |
| **Gen -2** | Maternal Grandparents | `10` | Left |
| **Gen -2** | Paternal Grandparents | `30` | Right |

#### Phase 4: Coordinate Mapping & Descendant Clustering
```typescript
const NODE_WIDTH = 168;  // TREE_LAYOUT: portrait PersonCard
const NODE_HEIGHT = 176;
const GAP_X = 50;
const GAP_Y = 150;
const y = (gen - minGen) * (NODE_HEIGHT + GAP_Y);

// For gen <= 0 (Ancestors & Focus Generation): Bilateral symmetrical centering
const totalWidth = count * NODE_WIDTH + (count - 1) * GAP_X;
const startX = -totalWidth / 2;
const x = startX + index * (NODE_WIDTH + GAP_X);

// For gen > 0 (Descendant Generations): Parent-Aligned Sibling Clusters
// 1. Group children by parent unit in gen - 1.
// 2. targetCenterX = parents.length >= 2 ? (p1.x + p2.x + NODE_WIDTH) / 2 : p1.x + NODE_WIDTH / 2.
// 3. Spouses of descendants are grouped adjacent to their partner.
// 4. Sort clusters left-to-right by targetCenterX.
// 5. Block-merging with least-squares relaxation avoids overlaps with exact GAP_X spacing.
```

---

### 5.2. Family Network Traversal (`getConnectedFamilyIds`)
Located in `src/features/genealogy/utils/kinship-inference.ts`.
Calculates the connected component of a user's family using an adjacency graph over `parent_child_edges` and `treeVisibleUnions`.

```typescript
export function getConnectedFamilyIds(
  startPersonId: string,
  parentEdges: { parent_id: string; child_id: string }[],
  unions: { person_a_id: string; person_b_id: string }[]
): Set<string>
```
Used to strictly verify if a requested `?focus=<personId>` is inside the user's family. If `userFamilyIds.has(requestedFocus) === false` and no approved friend share exists, the system automatically forces `centerPersonId = userPersonId`.

---

### 5.3. SVG Canvas Orthogonal Interconnects (`tree-canvas.tsx`)

1. **Sibling Bus Bars**:
   - `busStartX = Math.min(...siblings.map(n => n.x)) + NODE_WIDTH / 2` (center of leftmost sibling).
   - `busEndX = Math.max(...siblings.map(n => n.x)) + NODE_WIDTH / 2` (center of rightmost sibling).
   - `busY = siblings[0].y - 45`.
   - Single vertical trunk descends from parents to `busY`.
   - Vertical drop lines branch from `busY` directly into each sibling's top anchor `(node.x + 110, node.y)`.
2. **Couples (Marital Links)**:
   - Drawn as a subtle curved or horizontal link between `(nodeA.x + 110, nodeA.y + 65)` and `(nodeB.x + 110, nodeB.y + 65)`.
   - A heart badge (`<3`) is rendered at the exact midpoint `((nodeA.x + nodeB.x)/2 + 110, (nodeA.y + nodeB.y)/2 + 65)`.

---

## 6. Critical Pitfalls & Known Bugs (DO NOT REPEAT)

### ⚠️ Pitfall 1: Mutual Recursion Across Spouse Pairs (Stack Overflow)
- **The Bug**: Calling `isMaternal(node)` which calls `isMaternal(partnerNode)` which in turn calls `isMaternal(node)` caused `RangeError: Maximum call stack size exceeded` (Vercel Server Error 500).
- **The Solution**: NEVER use mutual recursion to resolve relatives. Precompute flat `Set<string>` collections (`maternalIds` and `paternalIds`) in linear time $O(V + E)$.

### ⚠️ Pitfall 2: Cross-Contamination Across Parents Union
- **The Bug**: Adding the spouse of a maternal node to `maternalIds` caused the father (`Jorge Andrés`) to be added to `maternalIds` because he is married to the mother (`Rubi`). This inverted the order of parents, putting the father between the mother and her brother.
- **The Solution**: Explicitly isolate the mother and father union:
  ```typescript
  rawNodes.forEach((n) => {
    if (n.id === motherId || n.id === fatherId) return;
    const partnerId = n.unionInfo?.partnerId;
    if (partnerId) {
      if (partnerId === motherId || partnerId === fatherId) return;
      if (maternalIds.has(partnerId)) maternalIds.add(n.id);
      if (paternalIds.has(partnerId)) paternalIds.add(n.id);
    }
  });
  if (fatherId) maternalIds.delete(fatherId);
  if (motherId) paternalIds.delete(motherId);
  ```

### ⚠️ Pitfall 3: URL Parameter Injection (`?focus=<foreign_uuid>`)
- **The Bug**: Accepting `?focus=<personId>` without verifying that the caller has permissions to view that person allowed external users (e.g. Lyndsay) to view any private family tree.
- **The Solution**: In `getFamilyGraph`, verify `isUserZero || userFamilyIds.has(reqFocus) || hasApprovedShare`. If unauthorized, silently fallback to `centerPersonId = userPersonId`.

### ⚠️ Pitfall 4: Global Search Leaking Private Families
- **The Bug**: `searchPersonsAction` queried the entire `persons` table globally.
- **The Solution**: For non-User Zero users, scope the search using `.in("id", allowedPersonIds)`.

### ⚠️ Pitfall 5: Blind Parent Co-Marriage & Sibling Parent Propagation
- **The Bug**: Adding a father/mother automatically created a marriage union with existing parents of the anchor, and previously propagated the new parent to other siblings. When adding a sibling, the system assumed all parents of the anchor were shared without asking if they were maternal or paternal half-siblings.
- **The Solution**:
  1. Explicit `sibling_type` ('both' | 'maternal' | 'paternal') in `createFamilyMemberAction` and `AddMemberModal`.
  2. Opt-in co-marriage (`create_union`) when registering a second parent (no automatic marriages).
  3. Mistakes are fixed in `EditMemberModal` → Familia (Quitar) and with the validated link tool (`linkPersonsAction`). `convertParentToSiblingAction` was removed.
  4. Removal of synthetic married co-parent unions in `get-family-graph.ts`.

### ⚠️ Pitfall 6: Global Centering of Descendant Generations (`gen > 0`)
- **The Bug**: Centering every generation at `x = 0` via `startX = -totalWidth / 2` caused children to be placed far from their parents when the parents were off-center (e.g. Jorge Andrés & Rubi on the left, but their children Ismael & Jorge Jr. placed under maternal uncles Luis & Ivan in the center). This caused awkward 400px horizontal detours on parent-child drop lines.
- **The Solution**: For all descendant generations (`gen > 0`), group children into sibling clusters by parent unit in `gen - 1`, align each cluster directly under the parents' midpoint `(p1.x + p2.x + NODE_WIDTH) / 2`, and apply 1D block-merging with least-squares relaxation to prevent collisions.

### ⚠️ Pitfall 7: Spurious Union Distorting Generational BFS
- **The Bug**: If a spurious union existed between a parent and child (e.g. uncle linked as spouse to grandmother Audelia), BFS propagation along `spousesOf` placed the uncle at generation -2 (same generation as grandmother). This caused the uncle to be treated as a grandparent, and his children/nephews to be displaced across the canvas.
- **The Solution**: Sanitize `allUnions` immediately upon load using `partitionUnionsByIntegrity(rawTreeVisibleUnions, biologicalParentEdges)`. All downstream BFS, `spousesOf`, `matchedUnion`, `unionInfo`, and layout calculation MUST ONLY use `validUnions`.

### ⚠️ Pitfall 8: Global `.delete().eq('parent_id', personId)` Orphaning Legitimate Children
- **The Bug**: In `convertParentToSiblingAction`, running `delete().eq('parent_id', personId)` wiped out ALL child edges of `personId`, including any legitimate children that person had with their real partner.
- **The Solution**: Only delete parent edges where `child_id in [anchorPersonId, ...siblingIds]`. Never wipe out children indiscriminately. Also purge any erroneous `union_edges` between `personId` and the anchor's parents.

### ⚠️ Pitfall 9: Indiscriminate Spouse-Linking on Child Creation
- **The Bug**: When creating a child in `createFamilyMemberAction`, the system queried all partners of the anchor and linked the new child to ALL of them. If the anchor had previous marriages or blended family partners, the child was falsely assigned to multiple co-parents.
- **The Solution**: Only link automatically to a second parent if the anchor has exactly ONE confirmed active partner. If multiple partners exist or none exist, require `co_parent_id` or leave as a single-parent link until explicitly specified.

### ⚠️ Pitfall 10: Silent Fallbacks Dropping Middle Names & Ghost Records
- **The Bug**: `createFamilyMemberAction` / `updateFamilyMemberAction` retried any failed write *without* `middle_name` / `maternal_last_name`, so second names were silently lost. Edge inserts (`parent_child_edges`, `union_edges`) were not error-checked, leaving "ghost" persons that exist in `persons` but never render.
- **The Solution**: Never retry writes without the name columns. `isMissingColumnError` (`utils/db-errors.ts`) returns a clear message pointing to migration `20261003000002`. Every edge insert is checked; on failure the new person is deleted (`rollback`) and the error is shown in the modal. `focusPerson`, `availableMembers` and search results carry `middleName`/`maternalLastName`; search matches each word against all four name columns.

### ⚠️ Pitfall 11: Blended-Family Members Missing From the Canvas
- **The Bug**: `allowedNodeIds` was a fixed list of categories, so step-parents, the other parent of a half-sibling, children's spouses and grandparents' new partners never appeared.
- **The Solution**: For owner and `intermediate`/`advanced` views, `get-family-graph.ts` adds (8.1) the parents of every visible sibling/child/grandchild/nephew/cousin and the partners of every visible person. `tree-layout.ts` treats co-parents without a union as layout-only partners so they sit contiguous and their children hang between them (no heart is drawn). `inferKinship` labels them (`Padrastro`, `Expareja de tu madre`, `Padre de tu medio hermano/a`, `Yerno/Nuera`, `Pareja de tu abuela`).

---

## 7. How to Implement Common Tasks

### Adding a new node relation
1. Call `createFamilyMemberAction` in `src/features/genealogy/actions.ts`.
2. Pass `anchor_person_id` and `relationship` (father, mother, child, spouse, sibling).
3. If `relationship === 'sibling'`, supply `sibling_type` (`'both' | 'maternal' | 'paternal'`).
   - `'both'`: Links the new sibling to all biological parents of the anchor.
   - `'maternal'`: Links the new sibling strictly to the anchor's mother (maternal half-sibling).
   - `'paternal'`: Links the new sibling strictly to the anchor's father (paternal half-sibling).
4. If adding a father/mother and the other parent already exists, pass `create_union: boolean` (defaults to `false`). Only create a union if explicitly checked by the user.
   - If adding a son/daughter, `AddMemberModal` always sends `co_parent_id` (a person id, or `"none"` to skip auto-linking). Options come from `getAnchorContextAction(anchorId)` (anchor's parents, current/ex partners and other parents of their children).
5. The server action creates the record in `persons` and the corresponding edges in `parent_child_edges` or `union_edges`.
6. Call `revalidatePath('/tree')` and `revalidatePath('/')`.

### Linking two existing people (manual, validated link-by-link)
1. UI: `LinkMembersModal` ("Vincular familiares") in `/tree` and `/` headers. The user picks Person A, a relation ("A es ___ de B": parent, child, sibling_both/maternal/paternal, married, partner, divorced, separated) and Person B.
2. `previewLinkAction` runs the pure planner `planLink` (`utils/link-planner.ts`) and returns `{ errors, warnings, steps, replaceOptions }` without writing anything. Errors block: cycles, unions between blood relatives, duplicate links, claimed profiles of other users.
3. `replaceOptions` lists the child's current parents; `parentsToReplace` (`utils/parent-replacement.ts`) pre-checks same-gender or unknown-gender parents (e.g. a father wrongly assigned when a sibling was registered as "both"). Nothing is removed unless checked.
4. `linkPersonsAction` re-validates on the server and applies the plan. Use this instead of creating duplicate people.

### Registering a step-child
In `AddMemberModal` → Hijo/Hija → "¿De quién es hijo/a?": `with:<id>` (anchor + partner), `solo` (anchor only, `co_parent_id = "none"`), or `step:<id>` (only the partner's child: sent with `anchor_person_id = <partner>`). The graph (8.1) shows children of in-law partners, labeled `Hijastro/a de X` / `Hermanastro/a`.

### Editing a person (`EditMemberModal`)
Two tabs, nothing else:
- **Datos**: name fields, sex (Hombre/Mujer/No sé), birth date, living + death date, birth place, notes; "otro apellido" (`maiden_name`) only on demand. Dates are validated live and on the server (no future dates, death ≥ birth).
- **Familia**: `getMemberRelationsAction(personId)` returns ALL parents, partners (every union, including exes) and children. Each row has "Quitar" with inline confirmation (`unlinkParentChildAction`, `dissolveUnionAction`) and partners have a union-type select (`updateUnionStatusAction`). "Vincular … ya registrado" embeds `LinkComposer` (same validated planner as "Vincular familiares").
- Do NOT reintroduce role-conversion or "¿Es tu hermano?" suggestion banners: they pushed users into wrong edits. Fix mistakes with Quitar + Vincular.

### Permissions for relationship changes
`checkCanEditRelations(supabase, personIds)` in `actions.ts` is the single rule: User Zero, or every person is in the user's family (`getUserFamilyScope`) and none is claimed by another account. Editing/deleting a person's data is limited to User Zero, the record's creator, or members of the same family.

### Friends and dating (`/?view=amigos`)
1. "Agregar amigo" calls `createFriendAction` in `friends-actions.ts`: links an existing account (`existingPersonId`, found via `searchUsersForSharingAction`) or creates an unclaimed `persons` row plus the `social_connections` row (rolled back if the link fails). The invite reuses `InviteModal` with relationship `Amigo/Amiga/Novio/Novia`.
2. "Terminamos · quedamos como amigos" calls `updateFriendKindAction(id, 'friend')`. "Quitar" calls `removeFriendAction`, which also deletes the person if it is unclaimed, was created by the user and has no other links.
3. Once the friend has an account, "Qué ve de tu árbol" calls `setFriendTreeAccessAction(personId, tier | 'none')`.
4. "Empezamos a salir" lives in the card's ⋯ menu and is hidden (as is "Noviazgo" in the add-friend form) while the user is in a relationship: any `dating` connection or an active union (not separated/divorced), returned as `inRelationship` by `getFriendsAction`. UI-only rule, no DB constraint. It calls `updateFriendKindAction(id, 'dating')`.
   "Empezamos a salir" (`updateFriendKindAction(id, 'dating')`) and "Hacerlo formal · unión libre o casados" (`convertSocialToUnionAction`): the latter creates the `union_edges` row (validated with `classifyUnionIssue`), deletes the social row and thereby merges both families. Either person (or User Zero) can do it; if the other person has an account, `convertSocialToUnionAction` stores a proposal (`proposed_union_type`) instead and `respondUnionProposalAction` lets them accept (creates the union) or reject; the proposer can cancel. Unclaimed friends and User Zero (always, even as a party) apply immediately.
5. A dating relationship that was registered as a union (shows up as "Ex-pareja (Separados)"): the directory card offers "¿Fue un noviazgo? Pasar a amistad" → `convertUnionToSocialAction`. Only the two people or User Zero can do it. The union is deleted unless they share children.

### Adding a new access tier for friend sharing
1. Update `TreePermissionTier` union in `src/features/genealogy/types.ts`.
2. Update the tier filter in `get-family-graph.ts` (section 8).
3. Update the tier selector in `friends-manager-modal.tsx` and badge in `tree-selector.tsx`.

### Crossing reduction in the layout
After rows are ordered (and couples placed on their own family's side), `computeTreeLayout` runs `reduceCrossings` (`layout-crossings.ts`): it counts parent→child crossings between adjacent rows from the row orders alone and tries single moves (flip a couple, swap two adjacent sibling blocks), then pairs of moves when stuck, keeping the first that lowers the count. It never separates adjacent partners, never puts the father before the mother, and keeps maternal relatives left of the mother and paternal right of the father. Bounded to 400 people (pairs only up to 150) and 120ms. Remaining unavoidable crossings are drawn as bridges (`SceneBus.gaps`).

### Tree canvas on touch devices
`tree-canvas.tsx` handles mouse, touch and pen with pointer events on the stage (`touch-action: none`): one pointer pans after a 6px threshold (the browser's click is then suppressed so a drag never opens or highlights a card), two pointers pinch-zoom around their midpoint, and the wheel zooms at the cursor through a native non-passive listener. Below 640px the tree opens fitted to the screen; below 768px secondary controls move to the "⋯" menu. Keep all drawing in `buildTreeScene` so the PDF export stays identical to the screen.

### Verifying graph logic locally
```bash
npm test        # vitest: integrity, generations, visibility, kinship labels, layout, link planner
npm run build   # must pass with 0 TypeScript errors
```
Pure logic lives in `src/features/genealogy/utils/` (`visible-nodes.ts`, `tree-layout.ts`, `kinship-inference.ts`, `graph-integrity.ts`, `link-planner.ts`). The shared fixture `utils/__tests__/fixtures.ts` models a blended family with corrupt data; add a case there for every new bug before fixing it.

---
*Maintained for Antigravity AI Agents & Deepmind Coding Systems.*

