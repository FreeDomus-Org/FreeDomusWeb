'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function selectWorkspaceAction(workspaceId: string) {
  const cookieStore = await cookies()
  cookieStore.set('workspace_id', workspaceId, { path: '/', maxAge: 60 * 60 * 24 * 30 })
  redirect('/dashboard')
}

export async function clearWorkspaceAction() {
  const cookieStore = await cookies()
  cookieStore.delete('workspace_id')
  redirect('/select')
}
