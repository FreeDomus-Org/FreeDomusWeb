-- Lista de compras del hogar: productos del catálogo que hacen falta.
-- "checked" = ya va en el carrito. Al terminar la compra se pasan al inventario
-- (con el precio de la factura, si se escanea) y se borran de la lista.
begin;

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric constraint shopping_list_items_quantity_check check (quantity is null or quantity > 0), -- null = sin cantidad
  unit text,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Un producto sale una sola vez en la lista de cada hogar (o en la personal de cada usuario)
create unique index if not exists shopping_list_items_workspace_product_key
  on public.shopping_list_items (workspace_id, product_id) where workspace_id is not null;
create unique index if not exists shopping_list_items_personal_product_key
  on public.shopping_list_items (user_id, product_id) where workspace_id is null;

-- Permisos: cualquier miembro ve, añade, marca y quita (quien hace la compra la termina)
alter table public.shopping_list_items enable row level security;
drop policy if exists shopping_list_items_read on public.shopping_list_items;
drop policy if exists shopping_list_items_insert on public.shopping_list_items;
drop policy if exists shopping_list_items_update on public.shopping_list_items;
drop policy if exists shopping_list_items_delete on public.shopping_list_items;
create policy shopping_list_items_read on public.shopping_list_items for select
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));
create policy shopping_list_items_insert on public.shopping_list_items for insert
  with check (auth.uid() = user_id and (workspace_id is null or is_workspace_member(workspace_id)));
create policy shopping_list_items_update on public.shopping_list_items for update
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id))
  with check ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));
create policy shopping_list_items_delete on public.shopping_list_items for delete
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));

commit;
