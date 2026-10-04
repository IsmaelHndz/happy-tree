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
4. **SVG Orthogonal Bus Bars**: Sibling groups share a horizontal bus bar spanning `[min(child.x) + 110, max(child.x) + 110]`. Parents connect to this bar with a single vertical drop line. Spouses display a heart icon (`<3`) centered between their nodes.
5. **Claimed Profile Protection**: When `persons.is_claimed = true`, only the owner (`claimed_by_user_id === user.id`) can edit their personal data or add relations directly to their personal anchor.
6. **Parental Lineage Integrity & Explicit Unions**:
   - Sibling registration must explicitly declare shared parentage (`'both' | 'maternal' | 'paternal'`). A sibling must ONLY be linked to the designated biological parent(s).
   - Registering a second parent must NEVER automatically forge a marital union with existing parents; couple unions must be explicitly opt-in (`create_union === true`).
   - Synthetic married unions between co-parents without database entries are strictly prohibited in `get-family-graph.ts`.
7. **Descendant Generational Alignment (`gen > 0`)**:
   - Descendant generations must NOT be centered across `x = 0`. Each sibling cluster must align directly underneath the horizontal midpoint of their parent unit in `gen - 1`: `targetCenterX = (P1.x + P2.x + NODE_WIDTH) / 2`.
   - Multi-cluster rows must resolve spacing collisions using 1D least-squares block merging with `GAP_X = 50px`, maintaining parental vertical drop symmetry without overlapping.

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
│   │   │   └── kinship-inference.ts # Deduce exact kinship labels + getConnectedFamilyIds
│   │   └── components/
│   │       ├── tree-canvas.tsx         # Pan/Zoom SVG canvas, orthogonal bus bars, node rendering
│   │       ├── tree-selector.tsx       # Dropdown: My Tree vs. Approved Friend Trees
│   │       ├── tree-search-modal.tsx   # Cmd+K quick person search modal
│   │       ├── family-directory.tsx    # Table/grid list of family members with status badges
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
- `relationship_type` (`'biological' | 'adoptive' | 'step'`).
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
- `tier` (`'basic' | 'intermediate' | 'advanced'`):
  - `'basic'`: Immediate home family only (Parents, Siblings, Spouse, Children).
  - `'intermediate'`: Home family + Grandparents, Uncles, Aunts, Cousins, Nephews/Nieces, Grandchildren.
  - `'advanced'`: Full genealogical graph without restrictions.
- `status` (`'pending' | 'approved' | 'rejected'`).

### 4.6. Dynamic Relationship Payloads (`childConnections` & `parentConnections`)
To allow editing and reassigning roles without mutating database schemas:
- `parentConnections`: `{ edgeId: string; parentId: string; parentName: string; relationshipType: string }[]`
- `childConnections`: `{ edgeId: string; childId: string; childName: string; relationshipType: string }[]`
Exposed on `FamilyMemberItem`, `EditableMemberData`, and `TreeNodeData`. Used by `EditMemberModal` to list and unlink individual children or convert roles.

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
const NODE_WIDTH = 220;
const NODE_HEIGHT = 130;
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
   - `busStartX = Math.min(...siblings.map(n => n.x)) + 110` (center of leftmost sibling).
   - `busEndX = Math.max(...siblings.map(n => n.x)) + 110` (center of rightmost sibling).
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
  3. One-click role conversion (`convertParentToSiblingAction`) and individual child unlinking (`unlinkParentChildAction`) in `EditMemberModal`.
  4. Removal of synthetic married co-parent unions in `get-family-graph.ts`.

### ⚠️ Pitfall 6: Global Centering of Descendant Generations (`gen > 0`)
- **The Bug**: Centering every generation at `x = 0` via `startX = -totalWidth / 2` caused children to be placed far from their parents when the parents were off-center (e.g. Jorge Andrés & Rubi on the left, but their children Ismael & Jorge Jr. placed under maternal uncles Luis & Ivan in the center). This caused awkward 400px horizontal detours on parent-child drop lines.
- **The Solution**: For all descendant generations (`gen > 0`), group children into sibling clusters by parent unit in `gen - 1`, align each cluster directly under the parents' midpoint `(p1.x + p2.x + NODE_WIDTH) / 2`, and apply 1D block-merging with least-squares relaxation to prevent collisions.

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
5. The server action creates the record in `persons` and the corresponding edges in `parent_child_edges` or `union_edges`.
6. Call `revalidatePath('/tree')` and `revalidatePath('/')`.

### Unlinking an accidental child from a parent node
1. Call `unlinkParentChildAction` in `src/features/genealogy/actions.ts`.
2. Pass `parent_id` and `child_id`.
3. The server action removes the specific row from `parent_child_edges` without deleting either person record.
4. Used in `EditMemberModal` under the "Descendencia (Hijos Registrados)" section.

### Role Conversion: Converting a misassigned parent into a sibling
1. Call `convertParentToSiblingAction` in `src/features/genealogy/actions.ts`.
2. Pass `misassigned_person_id` and `anchor_child_id` (the sibling who was mistakenly linked as their child).
3. The server action:
   - Identifies the anchor's actual parents.
   - Dissolves any synthetic or erroneous `union_edges` between `misassigned_person_id` and the anchor's parents.
   - Removes accidental `parent_child_edges` between `misassigned_person_id` and the anchor (and anchor's siblings).
   - Links `misassigned_person_id` as a child to the anchor's parents with `relationship_type = 'biological'`.
4. Used in `EditMemberModal` under "Asistente Genealógico: Reasignar Rol".

### Adding a new access tier for friend sharing
1. Update `TreePermissionTier` union in `src/features/genealogy/types.ts`.
2. Update the tier filter in `get-family-graph.ts` (section 8).
3. Update the tier selector in `friends-manager-modal.tsx` and badge in `tree-selector.tsx`.

### Verifying graph integrity locally
Run tests with node pointing to the local package:
```bash
npm run build
```
Ensure `next build` passes with 0 TypeScript errors.

---
*Maintained for Antigravity AI Agents & Deepmind Coding Systems.*

