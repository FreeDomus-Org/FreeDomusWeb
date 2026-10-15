-- Bebida de cada comida planificada: un producto del catálogo (categoría "Bebidas"), separado de la receta.
-- Una comida puede ser solo bebida (p. ej. un café), sin receta.
begin;

alter table public.weekly_planner
  add column if not exists drink_product_id uuid
  constraint weekly_planner_drink_product_id_fkey references public.products(id) on delete set null;

alter table public.weekly_planner alter column recipe_id drop not null;

-- Quién ya se tomó la bebida de esta comida (se descuenta una ración del inventario por persona)
alter table public.weekly_planner
  add column if not exists drink_taken_by uuid[] not null default '{}';

-- Marca la bebida como tomada por el usuario actual. Devuelve false si ya la había tomado,
-- así el cliente solo descuenta del inventario una vez aunque se pulse dos veces.
-- security invoker: se aplican las políticas RLS de weekly_planner (cualquier miembro puede actualizar).
create or replace function public.take_planner_drink(p_entry_id uuid)
returns boolean
language sql
security invoker
set search_path = public
as $$
  with marked as (
    update public.weekly_planner
       set drink_taken_by = array_append(drink_taken_by, auth.uid())
     where id = p_entry_id
       and drink_product_id is not null
       and not (auth.uid() = any (drink_taken_by))
    returning 1
  )
  select exists (select 1 from marked);
$$;

grant execute on function public.take_planner_drink(uuid) to authenticated;

commit;
