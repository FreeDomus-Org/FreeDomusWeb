-- Miembros de un workspace con su email y nombre (viven en auth.users, que el cliente no puede leer).
-- SECURITY DEFINER, pero solo devuelve filas si quien llama es miembro del workspace.
create or replace function public.workspace_members_with_email(p_workspace_id uuid)
returns table (
  id uuid,
  workspace_id uuid,
  user_id uuid,
  role text,
  joined_at timestamptz,
  email text,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.workspace_id, m.user_id, m.role::text, m.joined_at,
         u.email::text,
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from workspace_members m
  join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace_id
    and is_workspace_member(p_workspace_id)
  order by m.joined_at;
$$;

revoke all on function public.workspace_members_with_email(uuid) from public, anon;
grant execute on function public.workspace_members_with_email(uuid) to authenticated;
