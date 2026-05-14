import { createClient } from '@/lib/supabase/client'
import type { HouseholdTask, HouseholdTaskCreate, TaskStatus } from '@/types'

export async function fetchTasks(userId: string, workspaceId?: string | null): Promise<HouseholdTask[]> {
  const supabase = createClient()
  let query = supabase.from('household_tasks').select('*').order('due_date', { ascending: true })

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId)
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createTask(task: HouseholdTaskCreate): Promise<HouseholdTask> {
  const { data, error } = await createClient().from('household_tasks').insert(task).select().single()
  if (error) throw error
  return data
}

export async function updateTask(id: string, updates: Partial<HouseholdTaskCreate>): Promise<HouseholdTask> {
  const { data, error } = await createClient().from('household_tasks').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await createClient().from('household_tasks').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await createClient().from('household_tasks').delete().eq('id', id)
  if (error) throw error
}
