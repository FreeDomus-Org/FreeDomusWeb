import { createClient } from '@/lib/supabase/client'
import type { WeeklyPlanner, WeeklyPlannerCreate } from '@/types'

// day_of_week is stored as text in the DB, so PostgREST returns "1" instead of 1
const normalize = (e: WeeklyPlanner): WeeklyPlanner => ({ ...e, day_of_week: Number(e.day_of_week) })

export async function fetchWeekPlanner(userId: string, weekStartDate: string, workspaceId?: string | null): Promise<WeeklyPlanner[]> {
  const supabase = createClient()
  let query = supabase.from('weekly_planner').select('*, recipe:recipes!weekly_planner_recipe_id_fkey(*)').eq('week_start_date', weekStartDate)

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId)
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as WeeklyPlanner[]).map(normalize)
}

export async function upsertPlannerEntry(entry: WeeklyPlannerCreate): Promise<WeeklyPlanner> {
  const { data, error } = await createClient()
    .from('weekly_planner')
    .upsert(entry, { onConflict: 'user_id,week_start_date,day_of_week,meal_type' })
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
