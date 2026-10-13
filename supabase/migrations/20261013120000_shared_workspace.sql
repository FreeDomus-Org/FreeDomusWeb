-- ════════════════════════════════════════════════════════════════════════════
-- FreeDomus · Espacios de trabajo compartidos (fase 1)
--
-- 1. Pasa los datos personales (plan, inventario, productos, recetas, historial)
--    al espacio de trabajo del que el usuario es dueño, si tiene exactamente uno.
-- 2. Planificador: un plato "para todos" o "solo para una persona" por comida.
-- 3. Historial: queda preparado como evento de cocina (comida, estado, inicio)
--    con una tabla de comensales para "Empezar a comer".
-- 4. Permisos (RLS): cualquier miembro puede planificar, cocinar y usar el
--    inventario; borrar productos/historial ajeno sigue siendo de owner/admin.
--
-- Todo va en una transacción: si algo falla, no se aplica nada.
-- Requiere Postgres 15+ (UNIQUE NULLS NOT DISTINCT), que es lo que usa Supabase.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Datos personales → espacio de trabajo propio ────────────────────────

create temporary table _owner_ws on commit drop as
  select owner_id as user_id, (array_agg(id))[1] as workspace_id
  from public.workspaces
  group by owner_id
  having count(*) = 1;

update public.weekly_planner t set workspace_id = o.workspace_id
  from _owner_ws o where t.workspace_id is null and t.user_id = o.user_id;
update public.inventory t set workspace_id = o.workspace_id
  from _owner_ws o where t.workspace_id is null and t.user_id = o.user_id;
update public.products t set workspace_id = o.workspace_id
  from _owner_ws o where t.workspace_id is null and t.user_id = o.user_id;
update public.recipes t set workspace_id = o.workspace_id
  from _owner_ws o where t.workspace_id is null and t.user_id = o.user_id;
update public.cooking_history t set workspace_id = o.workspace_id
  from _owner_ws o where t.workspace_id is null and t.user_id = o.user_id;

-- ─── 2. Planificador: platos para todos o para una persona ─────────────────

alter table public.weekly_planner
  add column if not exists for_user_id uuid references auth.users(id) on delete cascade;

-- Lo que siga siendo personal (sin espacio de trabajo) queda como "solo para mí"
update public.weekly_planner set for_user_id = user_id where workspace_id is null;

-- Antes: un plato por (usuario, semana, día, comida).
-- Ahora: por (espacio, semana, día, comida, destinatario) → un plato compartido
-- y, si alguien quiere otra cosa, uno personal en la misma comida.
alter table public.weekly_planner
  drop constraint if exists weekly_planner_user_id_week_start_date_day_of_week_meal_type_ke;
alter table public.weekly_planner
  add constraint weekly_planner_slot_key
  unique nulls not distinct (workspace_id, week_start_date, day_of_week, meal_type, for_user_id);

-- ─── 3. Historial como evento de cocina + comensales ───────────────────────

alter table public.cooking_history
  add column if not exists started_at timestamptz,
  add column if not exists status text not null default 'done',
  add column if not exists planner_entry_id uuid references public.weekly_planner(id) on delete set null;

alter table public.cooking_history drop constraint if exists cooking_history_status_check;
alter table public.cooking_history
  add constraint cooking_history_status_check check (status in ('cooking', 'done'));

-- Solo una cocción en curso por plato planificado (evita que dos personas empiecen a la vez)
create unique index if not exists cooking_history_one_active_per_entry
  on public.cooking_history (planner_entry_id) where status = 'cooking';

create table if not exists public.cooking_history_diners (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.cooking_history(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ate_at timestamptz not null default now(),
  created_at timestamptz default now(),
  unique (history_id, user_id)
);

-- ─── 4. Permisos (RLS) ──────────────────────────────────────────────────────
-- Las políticas de lectura existentes ya permiten a los miembros leer; se
-- rehacen las de escritura y se quitan las "ALL" que solo miraban user_id
-- (también dejaban insertar filas en espacios de trabajo ajenos).

-- weekly_planner: cualquier miembro planifica y quita platos
drop policy if exists "Users manage own planner" on public.weekly_planner;
drop policy if exists weekly_planner_insert on public.weekly_planner;
drop policy if exists weekly_planner_update on public.weekly_planner;
drop policy if exists weekly_planner_delete on public.weekly_planner;
create policy weekly_planner_insert on public.weekly_planner for insert
  with check (auth.uid() = user_id and (workspace_id is null or is_workspace_member(workspace_id)));
create policy weekly_planner_update on public.weekly_planner for update
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id))
  with check ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));
create policy weekly_planner_delete on public.weekly_planner for delete
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));

-- inventory: cualquier miembro añade, edita y descuenta (cocinar borra lo que se acaba)
drop policy if exists "Users manage own inventory" on public.inventory;
drop policy if exists inventory_insert on public.inventory;
drop policy if exists inventory_update on public.inventory;
drop policy if exists inventory_delete on public.inventory;
create policy inventory_insert on public.inventory for insert
  with check (auth.uid() = user_id and (workspace_id is null or is_workspace_member(workspace_id)));
create policy inventory_update on public.inventory for update
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id))
  with check ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));
create policy inventory_delete on public.inventory for delete
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));

-- products: cualquier miembro añade y edita; borrar, el creador u owner/admin
drop policy if exists "Users manage own products" on public.products;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
create policy products_insert on public.products for insert
  with check (auth.uid() = user_id and (workspace_id is null or is_workspace_member(workspace_id)));
create policy products_update on public.products for update
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id))
  with check ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));
create policy products_delete on public.products for delete
  using (auth.uid() = user_id or is_workspace_admin(workspace_id));

-- cooking_history: cualquier miembro registra y termina cocciones (aunque las
-- haya empezado otro); borrar, el creador u owner/admin
drop policy if exists "Users manage own history" on public.cooking_history;
drop policy if exists cooking_history_insert on public.cooking_history;
drop policy if exists cooking_history_update on public.cooking_history;
drop policy if exists cooking_history_delete on public.cooking_history;
create policy cooking_history_insert on public.cooking_history for insert
  with check (auth.uid() = user_id and (workspace_id is null or is_workspace_member(workspace_id)));
create policy cooking_history_update on public.cooking_history for update
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id))
  with check ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));
create policy cooking_history_delete on public.cooking_history for delete
  using (auth.uid() = user_id or is_workspace_admin(workspace_id));

-- cooking_history_diners: todos los miembros ven quién comió; cada uno marca lo suyo
alter table public.cooking_history_diners enable row level security;
drop policy if exists cooking_history_diners_read on public.cooking_history_diners;
drop policy if exists cooking_history_diners_insert on public.cooking_history_diners;
drop policy if exists cooking_history_diners_update on public.cooking_history_diners;
drop policy if exists cooking_history_diners_delete on public.cooking_history_diners;
create policy cooking_history_diners_read on public.cooking_history_diners for select
  using (exists (
    select 1 from public.cooking_history h
    where h.id = history_id
      and ((h.workspace_id is null and h.user_id = auth.uid()) or is_workspace_member(h.workspace_id))
  ));
create policy cooking_history_diners_insert on public.cooking_history_diners for insert
  with check (auth.uid() = user_id and exists (
    select 1 from public.cooking_history h
    where h.id = history_id
      and ((h.workspace_id is null and h.user_id = auth.uid()) or is_workspace_member(h.workspace_id))
  ));
create policy cooking_history_diners_update on public.cooking_history_diners for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cooking_history_diners_delete on public.cooking_history_diners for delete
  using (auth.uid() = user_id);

-- recipe_ingredients: se leen si se puede leer la receta; se editan si la receta
-- es tuya o eres owner/admin de su espacio (igual que recipes_update).
-- Se reemplazan las políticas que hubiera, sean cuales sean.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'recipe_ingredients' loop
    execute format('drop policy %I on public.recipe_ingredients', p.policyname);
  end loop;
end $$;
alter table public.recipe_ingredients enable row level security;
create policy recipe_ingredients_read on public.recipe_ingredients for select
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id
      and ((r.workspace_id is null and r.user_id = auth.uid()) or is_workspace_member(r.workspace_id))
  ));
create policy recipe_ingredients_write on public.recipe_ingredients for all
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and (r.user_id = auth.uid() or is_workspace_admin(r.workspace_id))
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and (r.user_id = auth.uid() or is_workspace_admin(r.workspace_id))
  ));

commit;

-- Comprobación rápida (opcional, después del commit):
-- select 'planner' t, count(*) filter (where workspace_id is null) personales, count(*) total from public.weekly_planner
-- union all select 'inventory', count(*) filter (where workspace_id is null), count(*) from public.inventory
-- union all select 'products',  count(*) filter (where workspace_id is null), count(*) from public.products
-- union all select 'recipes',   count(*) filter (where workspace_id is null), count(*) from public.recipes
-- union all select 'history',   count(*) filter (where workspace_id is null), count(*) from public.cooking_history;
