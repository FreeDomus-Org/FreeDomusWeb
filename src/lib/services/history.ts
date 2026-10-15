import { createClient } from '@/lib/supabase/client'
import type { CookingHistory, CookingHistoryCreate, DrinkHistory } from '@/types'
import { currentWorkspaceId, workspaceScope } from '@/lib/workspace'

export async function fetchHistory(userId: string, workspaceId?: string | null): Promise<CookingHistory[]> {
  const supabase = createClient()
  let query = supabase.from('cooking_history').select('*, recipe:recipes(*)').order('cooked_at', { ascending: false })

  if (workspaceId) {
    // Workspace entries plus the user's personal ones
    query = query.or(workspaceScope(userId, workspaceId))
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as CookingHistory[]
}

// Household cooking history (whole workspace) since a given moment, oldest first
export async function fetchHistorySince(userId: string, since: Date): Promise<CookingHistory[]> {
  const workspaceId = currentWorkspaceId()
  let query = createClient().from('cooking_history').select('*, recipe:recipes(*)')
  query = workspaceId ? query.or(workspaceScope(userId, workspaceId)) : query.eq('user_id', userId)
  const { data, error } = await query
    .gte('cooked_at', since.toISOString())
    .order('cooked_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CookingHistory[]
}

export interface CookedToday {
  id: string
  recipe_id: string
  planner_entry_id: string | null
  diners: { user_id: string; ate_at: string }[]
}

// What was cooked today (local day) by anyone in the workspace, one per history row, with who already sat down to eat
export async function fetchCookedToday(userId: string): Promise<CookedToday[]> {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  const workspaceId = currentWorkspaceId()
  let query = createClient().from('cooking_history').select('id, recipe_id, planner_entry_id, diners:cooking_history_diners(user_id, ate_at)')
  query = workspaceId ? query.or(workspaceScope(userId, workspaceId)) : query.eq('user_id', userId)
  const { data, error } = await query
    .gte('cooked_at', start.toISOString())
    .lt('cooked_at', end.toISOString())
    .order('cooked_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CookedToday[]
}

// "Empezar a comer": cada comensal se apunta a lo cocinado. Devuelve false si ya estaba apuntado.
export async function startEating(historyId: string, userId: string): Promise<boolean> {
  const { error } = await createClient().from('cooking_history_diners').insert({ history_id: historyId, user_id: userId })
  if (error?.code === '23505') return false // unique (history_id, user_id)
  if (error) throw error
  return true
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

// Se registra en el espacio de trabajo actual salvo que se indique otro
export async function createHistoryEntry(entry: CookingHistoryCreate): Promise<CookingHistory> {
  const { data, error } = await createClient()
    .from('cooking_history')
    .insert({ ...entry, workspace_id: entry.workspace_id ?? currentWorkspaceId() })
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

// ─── Bebidas preparadas fuera de una comida ───────────────────────────────────

export async function fetchDrinkHistory(userId: string, workspaceId?: string | null): Promise<DrinkHistory[]> {
  let query = createClient().from('drink_history').select('*, product:products(*)').order('prepared_at', { ascending: false })
  query = workspaceId ? query.or(workspaceScope(userId, workspaceId)) : query.eq('user_id', userId).is('workspace_id', null)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DrinkHistory[]
}

export async function deleteDrinkHistoryEntry(id: string): Promise<void> {
  const { error } = await createClient().from('drink_history').delete().eq('id', id)
  if (error) throw error
}
