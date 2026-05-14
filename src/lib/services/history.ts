import { createClient } from '@/lib/supabase/client'
import type { CookingHistory, CookingHistoryCreate } from '@/types'

export async function fetchHistory(userId: string, workspaceId?: string | null): Promise<CookingHistory[]> {
  const supabase = createClient()
  let query = supabase.from('cooking_history').select('*, recipe:recipes(*)').order('cooked_at', { ascending: false })

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId)
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CookingHistory[]
}

export async function fetchTopRated(userId: string, limit = 10): Promise<CookingHistory[]> {
  const { data, error } = await createClient()
    .from('cooking_history')
    .select('*, recipe:recipes(*)')
    .eq('user_id', userId)
    .not('rating', 'is', null)
    .order('rating', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as CookingHistory[]
}

export async function createHistoryEntry(entry: CookingHistoryCreate): Promise<CookingHistory> {
  const { data, error } = await createClient()
    .from('cooking_history')
    .insert(entry)
    .select('*, recipe:recipes(*)')
    .single()
  if (error) throw error
  return data as CookingHistory
}

export async function updateHistoryEntry(id: string, updates: Partial<CookingHistoryCreate>): Promise<CookingHistory> {
  const { data, error } = await createClient()
    .from('cooking_history')
    .update(updates)
    .eq('id', id)
    .select('*, recipe:recipes(*)')
    .single()
  if (error) throw error
  return data as CookingHistory
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const { error } = await createClient().from('cooking_history').delete().eq('id', id)
  if (error) throw error
}
