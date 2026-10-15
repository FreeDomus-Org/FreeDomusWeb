-- Bebidas preparadas fuera de una comida (p. ej. un café a media tarde), con lo que se tardó en prepararlas.
-- Van aparte de cooking_history para no contar como comidas en las estadísticas del inicio.
begin;

create table if not exists public.drink_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  prepared_at timestamptz not null default now(),
  duration_seconds integer constraint drink_history_duration_check check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create index if not exists drink_history_workspace_prepared_idx on public.drink_history (workspace_id, prepared_at desc);
create index if not exists drink_history_user_prepared_idx on public.drink_history (user_id, prepared_at desc);

-- Permisos: como cooking_history, cualquier miembro ve y gestiona las del hogar
alter table public.drink_history enable row level security;
drop policy if exists drink_history_read on public.drink_history;
drop policy if exists drink_history_insert on public.drink_history;
drop policy if exists drink_history_update on public.drink_history;
drop policy if exists drink_history_delete on public.drink_history;
create policy drink_history_read on public.drink_history for select
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));
create policy drink_history_insert on public.drink_history for insert
  with check (auth.uid() = user_id and (workspace_id is null or is_workspace_member(workspace_id)));
create policy drink_history_update on public.drink_history for update
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id))
  with check ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));
create policy drink_history_delete on public.drink_history for delete
  using ((workspace_id is null and auth.uid() = user_id) or is_workspace_member(workspace_id));

commit;
