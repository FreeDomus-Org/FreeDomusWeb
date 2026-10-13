import { createClient } from '@/lib/supabase/client'
import type { CookingHistory, CookingHistoryCreate } from '@/types'

export async function fetchHistory(userId: string, workspaceId?: string | null): Promise<CookingHistory[]> {
  const supabase = createClient()
  let query = supabase.from('cooking_history').select('*, recipe:recipes(*)').order('cooked_at', { ascending: false })

  if (workspaceId) {
    // Workspace entries plus the user's personal ones (the history form saves those)
    query = query.or(`workspace_id.eq.${workspaceId},and(user_id.eq.${userId},workspace_id.is.null)`)
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CookingHistory[]
}

// The user's cooking history since a given moment, oldest first
export async function fetchHistorySince(userId: string, since: Date): Promise<CookingHistory[]> {
  const { data, error } = await createClient()
    .from('cooking_history')
    .select('*, recipe:recipes(*)')
    .eq('user_id', userId)
    .gte('cooked_at', since.toISOString())
    .order('cooked_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CookingHistory[]
}

// Recipe ids the user cooked today (local day), one per history row
export async function fetchCookedToday(userId: string): Promise<string[]> {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  const { data, error } = await createClient()
    .from('cooking_history')
    .select('recipe_id')
    .eq('user_id', userId)
    .gte('cooked_at', start.toISOString())
    .lt('cooked_at', end.toISOString())
  if (error) throw error
  return (data ?? []).map(r => r.recipe_id as string)
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
