'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchWeekPlannerRaw, visibleEntries, withEntry, upsertPlannerEntry, deletePlannerEntry, getWeekStart, formatWeekStart } from '@/lib/services/planner'
import { finishRecipe } from '@/lib/services/cookRecipe'
import { fetchCookedToday } from '@/lib/services/history'
import { fetchRecipes } from '@/lib/services/recipes'
import type { Recipe, WeeklyPlanner } from '@/types'
import { Button } from '@/components/ui/button'
import { CenterModal, SearchField, LoadingState } from '@/components/ui/freedomus'
import { ScopeToggle, type PlannerScope } from '@/components/planner/ScopeToggle'
import { currentWorkspaceId } from '@/lib/workspace'
import { Check, Loader2, Pencil, Play, Square, Trash2 } from 'lucide-react'

const MEALS = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'almuerzo', label: 'Comida' },
  { key: 'cena', label: 'Cena' },
]

const TIMER_KEY = 'freedomus_cooking_timer'

interface Timer { entryId: string; recipeId: string; startedAt: number }

function readTimer(): Timer | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    return raw ? JSON.parse(raw) as Timer : null
  } catch { return null }
}

function writeTimer(t: Timer | null) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t))
    else localStorage.removeItem(TIMER_KEY)
  } catch { /* storage unavailable: timer just won't survive a reload */ }
}

const nowMs = () => Date.now()

function tomorrowDate() {
  const d = new Date(); d.setDate(d.getDate() + 1); return d
}

const tomorrowIndex = () => (tomorrowDate().getDay() + 6) % 7 // 0 = Mon … 6 = Sun

type PlanDay = 'today' | 'tomorrow'
const planDate = (day: PlanDay) => day === 'today' ? new Date() : tomorrowDate()

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function TodayPlanner() {
  const [userId, setUserId] = useState<string | null>(null)
  const [today, setToday] = useState<WeeklyPlanner[]>([])
  const [tomorrow, setTomorrow] = useState<WeeklyPlanner[]>([])
  const [cookedToday, setCookedToday] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [timer, setTimer] = useState<Timer | null>(readTimer)
  const [now, setNow] = useState(nowMs)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Selector de receta para las comidas de hoy y de mañana
  const [picker, setPicker] = useState<{ day: PlanDay; meal: string } | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [planning, setPlanning] = useState(false)
  const [scope, setScope] = useState<PlannerScope>('all')

  const load = useCallback(async (uid: string) => {
    try {
      const dayIndex = (new Date().getDay() + 6) % 7 // 0 = Mon … 6 = Sun
      const thisWeek = formatWeekStart(getWeekStart())
      const nextWeek = formatWeekStart(getWeekStart(tomorrowDate()))
      const [week, cooked, tomorrowWeek] = await Promise.all([
        fetchWeekPlannerRaw(uid, thisWeek),
        fetchCookedToday(uid),
        // On Sunday, tomorrow belongs to next week's plan
        nextWeek === thisWeek ? null : fetchWeekPlannerRaw(uid, nextWeek),
      ])
      setToday(week.filter(e => e.day_of_week === dayIndex))
      setTomorrow((tomorrowWeek ?? week).filter(e => e.day_of_week === tomorrowIndex()))
      setCookedToday(cooked)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (uid) { setUserId(uid); load(uid) } else setLoading(false)
    })
  }, [load])

  useEffect(() => {
    if (!timer) return
    const id = setInterval(() => setNow(nowMs()), 1000)
    return () => clearInterval(id)
  }, [timer])

  function start(entry: WeeklyPlanner) {
    if (!entry.recipe_id) return
    const t = { entryId: entry.id, recipeId: entry.recipe_id, startedAt: nowMs() }
    writeTimer(t); setNow(t.startedAt); setTimer(t); setError(null)
  }

  function cancel() {
    writeTimer(null); setTimer(null)
  }

  async function stop() {
    if (!timer || !userId) return
    setSaving(true); setError(null)
    try {
      const minutes = Math.max(1, Math.round((nowMs() - timer.startedAt) / 60000))
      const workspaceId = document.cookie.match(/workspace_id=([^;]+)/)?.[1] ?? null
      const entry = today.find(e => e.id === timer.entryId)
      const mealType = entry && (['desayuno', 'almuerzo', 'cena'] as const).find(m => m === entry.meal_type)
      await finishRecipe(timer.recipeId, userId, workspaceId, minutes,
        mealType ? { mealType, plannerEntryId: timer.entryId } : undefined)
      setCookedToday(prev => [...prev, timer.recipeId])
      writeTimer(null); setTimer(null)
    } catch {
      setError('No se pudo guardar en el historial. Inténtalo de nuevo.')
    } finally { setSaving(false) }
  }

  async function openPicker(day: PlanDay, meal: string) {
    setPicker({ day, meal }); setPickerSearch(''); setError(null)
    const current = (day === 'today' ? visibleToday : visibleTomorrow).find(e => e.meal_type === meal && e.recipe_id)
    setScope(current?.for_user_id ? 'me' : 'all')
    if (recipes || !userId) return
    try {
      const workspaceId = document.cookie.match(/workspace_id=([^;]+)/)?.[1] ?? null
      setRecipes(await fetchRecipes(userId, workspaceId))
    } catch {
      setRecipes([]); setError('No se pudieron cargar las recetas.')
    }
  }

  const setDay = (day: PlanDay) => day === 'today' ? setToday : setTomorrow
  const visibleToday = userId ? visibleEntries(today, userId) : today
  const visibleTomorrow = userId ? visibleEntries(tomorrow, userId) : tomorrow

  async function planMeal(recipe: Recipe) {
    if (!userId || !picker) return
    const { day, meal } = picker
    const date = planDate(day)
    setPlanning(true)
    try {
      const entry = await upsertPlannerEntry({
        user_id: userId,
        workspace_id: null,
        for_user_id: scope === 'me' ? userId : null,
        week_start_date: formatWeekStart(getWeekStart(date)),
        day_of_week: (date.getDay() + 6) % 7,
        meal_type: meal,
        recipe_id: recipe.id,
        notes: null,
      })
      setDay(day)(prev => withEntry(prev, { ...entry, recipe }))
      setPicker(null)
    } catch {
      setError('No se pudo guardar en el planificador. Inténtalo de nuevo.')
    } finally { setPlanning(false) }
  }

  async function unplanMeal(entry: WeeklyPlanner) {
    if (!picker) return
    const { day } = picker
    setPlanning(true)
    try {
      await deletePlannerEntry(entry.id)
      setDay(day)(prev => prev.filter(e => e.id !== entry.id))
      setPicker(null)
    } catch {
      setError('No se pudo quitar del planificador. Inténtalo de nuevo.')
    } finally { setPlanning(false) }
  }

  const pickerEntry = picker
    ? (picker.day === 'today' ? visibleToday : visibleTomorrow).find(e => e.meal_type === picker.meal && e.recipe_id)
    : undefined
  const pickerRecipes = (recipes ?? []).filter(r => r.name.toLowerCase().includes(pickerSearch.toLowerCase()))

  // Each history row from today marks one planned meal with that recipe as done, in meal order
  const remaining: Record<string, number> = {}
  cookedToday.forEach(id => { remaining[id] = (remaining[id] ?? 0) + 1 })
  const doneEntries = new Set<string>()
  MEALS.forEach(({ key }) => {
    const entry = visibleToday.find(e => e.meal_type === key && e.recipe_id)
    if (entry?.recipe_id && remaining[entry.recipe_id] > 0) {
      remaining[entry.recipe_id]--
      doneEntries.add(entry.id)
    }
  })

  return (
    <section className="relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-[28px] bg-forest p-7 text-[#f3f7ec]">
      <div className="stripes pointer-events-none absolute -top-10 -right-10 size-[260px] rounded-full" />
      <div className="relative flex flex-col gap-4">
        <p className="font-mono text-xs tracking-[0.08em] text-lime">PLANIFICADOR · HOY</p>

        {!loading && (
          <div className="flex max-w-sm flex-col gap-1 rounded-[20px] bg-white/[0.05] p-3 backdrop-blur-[2px]">
            <div className="flex items-center justify-between gap-3 px-1.5 pb-1">
              <p className="font-mono text-[11px] tracking-[0.08em] text-white/55 uppercase">
                Mañana · {tomorrowDate().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}
              </p>
              <Link href="/dashboard/planner" className="shrink-0 text-[11px] text-white/55 hover:text-lime">Ver semana →</Link>
            </div>
            {MEALS.map(({ key, label }) => {
              const name = visibleTomorrow.find(e => e.meal_type === key && e.recipe_id)?.recipe?.name
              return (
                <button key={key} type="button" onClick={() => openPicker('tomorrow', key)}
                  className="group flex cursor-pointer items-center gap-3 rounded-xl px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-white/[0.07]">
                  <span className="w-[72px] shrink-0 text-xs text-white/55">{label}</span>
                  {name
                    ? <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                    : <span className="flex-1 text-white/35">Sin planificar</span>}
                  {name
                    ? <Pencil className="size-3.5 shrink-0 text-white/40 transition-colors group-hover:text-lime" aria-label="Cambiar" />
                    : <span className="shrink-0 text-xs text-lime">Añadir +</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="relative flex flex-col gap-2.5">
        <h2 className="mb-1.5 font-display text-[30px] font-bold tracking-[-0.01em]">¿Qué cocinamos hoy?</h2>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-lime" /></div>
        ) : MEALS.map(({ key, label }) => {
          const entry = visibleToday.find(e => e.meal_type === key && e.recipe_id)
          const running = !!entry && timer?.entryId === entry.id
          const done = !!entry && doneEntries.has(entry.id) && !running

          if (!entry) {
            return (
              <button key={key} type="button" onClick={() => openPicker('today', key)}
                className="flex cursor-pointer items-center justify-between rounded-2xl bg-white/[0.07] px-4 py-[13px] text-left text-[15px] transition-colors hover:bg-white/[0.12]">
                <span>{label}</span>
                <span className="text-[13px] text-lime">Añadir +</span>
              </button>
            )
          }

          return (
            <div key={key} className="rounded-2xl bg-white/[0.07] px-4 py-[13px]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-white/55">{label}</p>
                  <p className="truncate font-medium">{entry.recipe?.name ?? '—'}</p>
                </div>
                {done ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-lime">
                    <Check className="h-4 w-4 stroke-[2.6]" /> Cocinado
                  </span>
                ) : running ? (
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-lg tabular-nums text-lime">{formatElapsed(now - timer!.startedAt)}</span>
                    <button onClick={stop} disabled={saving}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-[13px] font-semibold text-forest disabled:opacity-60">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-current" />}
                      Terminar
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => openPicker('today', key)} aria-label="Cambiar receta" title="Cambiar receta"
                      className="grid size-9 cursor-pointer place-items-center rounded-full bg-white/10 text-lime transition-colors hover:bg-white/20">
                      <Pencil className="size-4" />
                    </button>
                    <button onClick={() => start(entry)} disabled={!!timer}
                      className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-lime px-4 text-[13px] font-semibold text-forest disabled:opacity-40">
                      <Play className="h-4 w-4 fill-current" /> Cocinar
                    </button>
                  </div>
                )}
              </div>
              {running && (
                <button onClick={cancel} disabled={saving} className="mt-2 text-xs text-white/60 underline hover:text-white">
                  Cancelar sin guardar
                </button>
              )}
            </div>
          )
        })}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>

      {picker && (
        <CenterModal
          eyebrow={picker.day === 'today' ? 'Hoy' : 'Mañana'}
          title={pickerEntry ? 'Cambiar receta' : 'Elegir receta'}
          subtitle={`${planDate(picker.day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })} · ${MEALS.find(m => m.key === picker.meal)?.label}`}
          onClose={() => setPicker(null)}
          footer={pickerEntry && (
            <Button variant="destructive" className="w-full" disabled={planning} onClick={() => unplanMeal(pickerEntry)}>
              <Trash2 /> Quitar {pickerEntry.recipe?.name ?? 'receta'} del plan
            </Button>
          )}
        >
          {currentWorkspaceId() && <ScopeToggle value={scope} onChange={setScope} />}
          <SearchField tone="soft" className="h-11 max-w-none" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Buscar receta..." autoFocus />
          {recipes === null ? (
            <LoadingState className="py-8" />
          ) : (
            <div className="-mx-2 flex flex-col">
              {pickerRecipes.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-5">No hay recetas disponibles.</p>
              ) : pickerRecipes.map(recipe => {
                const current = pickerEntry?.recipe_id === recipe.id
                return (
                  <button key={recipe.id} disabled={planning}
                    className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${current ? 'bg-lime/40' : 'hover:bg-sage'}`}
                    onClick={() => planMeal(recipe)}>
                    <div>
                      <p className="font-display text-[15px] font-bold">{recipe.name}</p>
                      <p className="text-xs text-ink-5">{recipe.meal_type} · {recipe.difficulty ?? '—'}</p>
                    </div>
                    {current
                      ? <Check className="size-4 shrink-0 stroke-[2.6] text-lime-ink" />
                      : recipe.total_calories && <span className="shrink-0 rounded-full bg-sage px-2.5 py-0.5 text-xs text-ink-2">{recipe.total_calories} kcal</span>}
                  </button>
                )
              })}
            </div>
          )}
        </CenterModal>
      )}
    </section>
  )
}
