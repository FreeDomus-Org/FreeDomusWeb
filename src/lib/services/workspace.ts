import { createClient } from '@/lib/supabase/client'
import type { Workspace, WorkspaceCreate, WorkspaceMember, WorkspaceRole } from '@/types'

export async function fetchMyWorkspaces(userId: string): Promise<Workspace[]> {
  const { data, error } = await createClient()
    .from('workspace_members')
    .select('workspace:workspaces(*)')
    .eq('user_id', userId)

  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data?.map((d: any) => d.workspace) ?? []) as Workspace[]
}

export async function createWorkspace(ws: WorkspaceCreate & { owner_id: string }): Promise<Workspace> {
  const supabase = createClient()
  const { data, error } = await supabase.from('workspaces').insert(ws).select().single()
  if (error) throw error

  await supabase.from('workspace_members').insert({
    workspace_id: data.id,
    user_id: ws.owner_id,
    role: 'owner',
  })

  return data
}

export async function updateWorkspace(id: string, updates: Partial<WorkspaceCreate>): Promise<Workspace> {
  const { data, error } = await createClient().from('workspaces').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteWorkspace(id: string): Promise<void> {
  const { error } = await createClient().from('workspaces').delete().eq('id', id)
  if (error) throw error
}

export async function fetchMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await createClient()
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', workspaceId)

  if (error) throw error
  return data ?? []
}

export async function updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
  const { error } = await createClient()
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const { error } = await createClient()
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function inviteMember(workspaceId: string, invitedEmail: string, role: WorkspaceRole): Promise<void> {
  const { error } = await createClient().functions.invoke('invite-member', {
    body: { workspace_id: workspaceId, invited_email: invitedEmail, role },
  })
  if (error) throw error
}

export async function acceptInvitation(token: string): Promise<{ workspace_id: string; role: string }> {
  const { data, error } = await createClient().functions.invoke('accept-invitation', {
    body: { token },
  })
  if (error) throw error
  return data
}
