-- Porciones y sobras.
-- 1. Las cantidades de una receta son para sus porciones (por defecto 1). Al terminar de cocinar se indica
--    cuántas porciones se prepararon y se descuenta en proporción.
-- 2. Lo que no se come se guarda como sobras (porciones) en el registro del historial.
-- 3. Las sobras se pueden planificar para otra comida: cada persona que se las come gasta una porción,
--    sin volver a descontar ingredientes.
begin;

alter table public.recipes alter column servings set default 1;

alter table public.cooking_history
  add column if not exists leftover_servings integer not null default 0
  constraint cooking_history_leftover_servings_check check (leftover_servings >= 0);

create index if not exists cooking_history_leftovers_idx
  on public.cooking_history (workspace_id, cooked_at desc) where leftover_servings > 0;

alter table public.weekly_planner
  add column if not exists leftover_history_id uuid
  constraint weekly_planner_leftover_history_id_fkey references public.cooking_history(id) on delete set null;

-- Quién ya se comió su porción de las sobras planificadas
alter table public.weekly_planner
  add column if not exists leftovers_eaten_by uuid[] not null default '{}';

-- Comer o tirar porciones de unas sobras sin bajar de 0. Devuelve las que quedan (null si ya no quedaba ninguna).
-- security invoker: se aplican las políticas RLS de cooking_history (cualquier miembro puede actualizar).
create or replace function public.take_leftovers(p_history_id uuid, p_servings integer)
returns integer
language sql
security invoker
set search_path = public
as $$
  update public.cooking_history
     set leftover_servings = greatest(leftover_servings - greatest(p_servings, 0), 0)
   where id = p_history_id
     and leftover_servings > 0
  returning leftover_servings;
$$;

-- Marca las sobras planificadas como comidas por el usuario actual y gasta una porción.
-- Devuelve false si ya se las había comido, así no se gasta dos veces aunque se pulse dos veces.
create or replace function public.eat_planned_leftovers(p_entry_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_history_id uuid;
begin
  update public.weekly_planner
     set leftovers_eaten_by = array_append(leftovers_eaten_by, auth.uid())
   where id = p_entry_id
     and leftover_history_id is not null
     and not (auth.uid() = any (leftovers_eaten_by))
  returning leftover_history_id into v_history_id;

  if v_history_id is null then
    return false;
  end if;

  update public.cooking_history
     set leftover_servings = greatest(leftover_servings - 1, 0)
   where id = v_history_id;
  return true;
end;
$$;

grant execute on function public.take_leftovers(uuid, integer) to authenticated;
grant execute on function public.eat_planned_leftovers(uuid) to authenticated;

commit;
