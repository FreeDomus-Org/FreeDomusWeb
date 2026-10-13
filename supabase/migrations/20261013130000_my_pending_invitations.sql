-- Invitaciones pendientes del usuario autenticado (por su email), con datos del workspace.
-- SECURITY DEFINER: el invitado aún no es miembro, así que RLS le ocultaría workspaces e invitaciones.
create or replace function public.my_pending_invitations()
returns table (
  token text,
  role text,
  expires_at timestamptz,
  workspace_id uuid,
  workspace_name text,
  workspace_icon text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.token::text, i.role::text, i.expires_at, w.id, w.name, w.icon
  from workspace_invitations i
  join workspaces w on w.id = i.workspace_id
  where i.status = 'pending'
    and i.expires_at > now()
    and lower(i.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by i.created_at desc;
$$;

revoke all on function public.my_pending_invitations() from public, anon;
grant execute on function public.my_pending_invitations() to authenticated;
