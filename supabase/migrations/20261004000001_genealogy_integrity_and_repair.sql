-- =====================================================================
-- HAPPY TREE: Integridad Biológica y Sanitización Genealógica
-- Fecha: 4 de Octubre de 2026
-- =====================================================================

-- 1. Sanitizar uniones conyugales corruptas existentes en la base de datos
-- (Marca como 'rejected' cualquier unión entre ancestro-descendiente o hermanos biológicos)
with recursive closure(ancestor_id, descendant_id) as (
  select parent_id, child_id from public.parent_child_edges
  where status <> 'rejected' and relationship_type in ('biological', 'adoptive')
  union
  select c.ancestor_id, e.child_id
  from closure c join public.parent_child_edges e on e.parent_id = c.descendant_id
  where e.status <> 'rejected' and e.relationship_type in ('biological', 'adoptive')
),
bad as (
  select u.id,
    case
      when u.person_a_id = u.person_b_id then 'self'
      when exists (select 1 from closure c
                   where (c.ancestor_id = u.person_a_id and c.descendant_id = u.person_b_id)
                      or (c.ancestor_id = u.person_b_id and c.descendant_id = u.person_a_id))
        then 'ancestor_or_parent'
      when exists (select 1 from public.parent_child_edges a
                   join public.parent_child_edges b on a.parent_id = b.parent_id
                   where a.child_id = u.person_a_id and b.child_id = u.person_b_id
                     and a.status <> 'rejected' and b.status <> 'rejected'
                     and a.relationship_type in ('biological', 'adoptive')
                     and b.relationship_type in ('biological', 'adoptive'))
        then 'siblings'
    end as reason
  from public.union_edges u
  where u.status <> 'rejected'
)
update public.union_edges
set status = 'rejected'
where id in (select id from bad where reason is not null);

-- 2. Trigger para impedir uniones imposibles en inserción/actualización
create or replace function public.assert_union_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'rejected' then return new; end if;

  if new.person_a_id = new.person_b_id then
    raise exception 'UNION_SELF: Una persona no puede registrar una unión conyugal consigo misma.';
  end if;

  -- Ancestro o descendiente (incluye padre/madre con hijo/hija)
  if exists (
    with recursive anc(id) as (
      select e.parent_id from public.parent_child_edges e
      where e.child_id in (new.person_a_id, new.person_b_id)
        and e.status <> 'rejected' and e.relationship_type in ('biological', 'adoptive')
      union
      select e.parent_id from public.parent_child_edges e join anc on e.child_id = anc.id
      where e.status <> 'rejected' and e.relationship_type in ('biological', 'adoptive')
    ) select 1 from anc where id in (new.person_a_id, new.person_b_id)
  ) then
    raise exception 'UNION_ANCESTOR_DESCENDANT: Contradicción biológica. Existe un vínculo de ancestro o progenitor entre ambas personas.';
  end if;

  -- Hermanos o medios hermanos biológicos
  if exists (
    select 1
    from public.parent_child_edges a
    join public.parent_child_edges b on a.parent_id = b.parent_id
    where a.child_id = new.person_a_id and b.child_id = new.person_b_id
      and a.status <> 'rejected' and b.status <> 'rejected'
      and a.relationship_type in ('biological', 'adoptive')
      and b.relationship_type in ('biological', 'adoptive')
  ) then
    raise exception 'UNION_SIBLINGS: Contradicción biológica. Ambas personas comparten progenitores registrados.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_union_integrity on public.union_edges;
create trigger trg_union_integrity
  before insert or update of person_a_id, person_b_id, status on public.union_edges
  for each row execute function public.assert_union_integrity();

-- 3. Trigger para impedir ciclos o paternidades contradictorias
create or replace function public.assert_parent_edge_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'rejected' or new.relationship_type = 'step' then return new; end if;

  if new.parent_id = new.child_id then
    raise exception 'PARENT_SELF: Una persona no puede ser su propio progenitor.';
  end if;

  -- Ciclo: el hijo ya es ancestro del progenitor
  if exists (
    with recursive anc(id) as (
      select e.parent_id from public.parent_child_edges e
      where e.child_id = new.parent_id and e.status <> 'rejected'
      union
      select e.parent_id from public.parent_child_edges e join anc on e.child_id = anc.id
      where e.status <> 'rejected'
    ) select 1 from anc where id = new.child_id
  ) then
    raise exception 'PARENT_CYCLE: Esta relación crearía un ciclo generacional imposible en el árbol.';
  end if;

  -- Conflicto directo: ya existe una unión conyugal activa entre ambos
  if exists (
    select 1 from public.union_edges u
    where u.status <> 'rejected'
      and least(u.person_a_id, u.person_b_id)    = least(new.parent_id, new.child_id)
      and greatest(u.person_a_id, u.person_b_id) = greatest(new.parent_id, new.child_id)
  ) then
    raise exception 'PARENT_CONFLICTS_WITH_UNION: No se puede registrar paternidad entre dos personas que tienen una unión conyugal activa registrada.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_parent_edge_integrity on public.parent_child_edges;
create trigger trg_parent_edge_integrity
  before insert or update of parent_id, child_id, status, relationship_type on public.parent_child_edges
  for each row execute function public.assert_parent_edge_integrity();
