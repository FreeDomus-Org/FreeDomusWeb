import { createClient } from '@/lib/supabase/client'
import type { WeeklyPlanner, WeeklyPlannerCreate } from '@/types'
import { currentWorkspaceId } from '@/lib/workspace'

// day_of_week is stored as text in the DB, so PostgREST returns "1" instead of 1
const normalize = (e: WeeklyPlanner): WeeklyPlanner => ({ ...e, day_of_week: Number(e.day_of_week) })

// Lo que ve un usuario: platos del espacio "para todos" o "solo para él", más lo personal que quede.
// Si en una comida hay un plato compartido y uno suyo, gana el suyo.
export async function fetchWeekPlanner(userId: string, weekStartDate: string, workspaceId: string | null = currentWorkspaceId()): Promise<WeeklyPlanner[]> {
  const supabase = createClient()
  let query = supabase.from('weekly_planner').select('*, recipe:recipes!weekly_planner_recipe_id_fkey(*)').eq('week_start_date', weekStartDate)

  if (workspaceId) {
    query = query.or(`and(workspace_id.eq.${workspaceId},or(for_user_id.is.null,for_user_id.eq.${userId})),and(workspace_id.is.null,user_id.eq.${userId})`)
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  const entries = ((data ?? []) as WeeklyPlanner[]).map(normalize)
  return entries.filter(e => e.for_user_id || !entries.some(o =>
    o !== e && o.for_user_id === userId && o.day_of_week === e.day_of_week && o.meal_type === e.meal_type))
}

// Por defecto el plato es para todo el espacio de trabajo actual (for_user_id null)
export async function upsertPlannerEntry(entry: WeeklyPlannerCreate): Promise<WeeklyPlanner> {
  const row = { ...entry, workspace_id: entry.workspace_id ?? currentWorkspaceId(), for_user_id: entry.for_user_id ?? null }
  const { data, error } = await createClient()
    .from('weekly_planner')
    .upsert(row, { onConflict: 'workspace_id,week_start_date,day_of_week,meal_type,for_user_id' })
    .select('*, recipe:recipes!weekly_planner_recipe_id_fkey(*)')
    .single()
  if (error) throw error
  return normalize(data as WeeklyPlanner)
}

export async function deletePlannerEntry(id: string): Promise<void> {
  const { error } = await createClient().from('weekly_planner').delete().eq('id', id)
  if (error) throw error
}

export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatWeekStart(date: Date): string {
  return date.toISOString().split('T')[0]
}
