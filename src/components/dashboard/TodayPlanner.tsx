'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { fetchWeekPlannerRaw, visibleEntries, withEntry, upsertPlannerEntry, setPlannerDrink, deletePlannerEntry, getWeekStart, formatWeekStart } from '@/lib/services/planner'
import { finishRecipe, finishDrink, defaultPortions, pantryAfterCooking, takeDrink, type PantryUse } from '@/lib/services/cookRecipe'
import { fetchCookedToday, fetchLeftovers, eatPlannedLeftovers, startEating, type CookedToday } from '@/lib/services/history'
import { fetchRecipes } from '@/lib/services/recipes'
import { fetchMembers } from '@/lib/services/workspace'
import type { CookingHistory, Product, Recipe, WeeklyPlanner, WorkspaceMember } from '@/types'
import { Button } from '@/components/ui/button'
import { CenterModal, SearchField, LoadingState } from '@/components/ui/freedomus'
import { ScopeToggle, type PlannerScope } from '@/components/planner/ScopeToggle'
import { DrinkPicker } from '@/components/planner/DrinkPicker'
import { LeftoverOptions } from '@/components/planner/LeftoverOptions'
import { PantryCheckModal } from '@/components/inventory/PantryCheckModal'
import { FinishCookingModal } from '@/components/recipes/FinishCookingModal'
import { currentWorkspaceId, memberLabel } from '@/lib/workspace'
import { formatDuration } from '@/lib/utils'
import { Check, CupSoda, Loader2, Pencil, Play, Refrigerator, Square, Trash2, Utensils } from 'lucide-react'

const MEALS = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'almuerzo', label: 'Comida' },
  { key: 'cena', label: 'Cena' },
]

const TIMER_KEY = 'freedomus_cooking_timer'
const DRINK_TIMER_KEY = 'freedomus_drink_timer'

interface Timer { entryId: string; recipeId: string; startedAt: number }
// Bebida suelta (p. ej. un café), fuera de las comidas: va con su propio cronómetro
interface DrinkTimer { productId: string; name: string; startedAt: number }

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  } catch { return null }
}

function writeStored(key: string, value: object | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value))
    else localStorage.removeItem(key)
  } catch { /* storage unavailable: timer just won't survive a reload */ }
}

const readTimer = () => readStored<Timer>(TIMER_KEY)
const writeTimer = (t: Timer | null) => writeStored(TIMER_KEY, t)
const readDrinkTimer = () => readStored<DrinkTimer>(DRINK_TIMER_KEY)
const writeDrinkTimer = (t: DrinkTimer | null) => writeStored(DRINK_TIMER_KEY, t)

const nowMs = () => Date.now()

function tomorrowDate() {
  const d = new Date(); d.setDate(d.getDate() + 1); return d
}

const tomorrowIndex = () => (tomorrowDate().getDay() + 6) % 7 // 0 = Mon … 6 = Sun

type PlanDay = 'today' | 'tomorrow'
const planDate = (day: PlanDay) => day === 'today' ? new Date() : tomorrowDate()

const workspaceCookie = () => document.cookie.match(/workspace_id=([^;]+)/)?.[1] ?? null

// Una comida cuenta como planificada si tiene receta o, al menos, bebida
const isPlanned = (e: WeeklyPlanner) => !!(e.recipe_id || e.drink_product_id)

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
  const [cookedToday, setCookedToday] = useState<CookedToday[]>([])
  const [loading, setLoading] = useState(true)
  const [timer, setTimer] = useState<Timer | null>(readTimer)
  const [now, setNow] = useState(nowMs)
  const [saving, setSaving] = useState(false)
  const [eating, setEating] = useState<string | null>(null) // plato en el que se está registrando "a la mesa"
  const [error, setError] = useState<string | null>(null)
  // Selector de receta y, después, de bebida (sin entryId en el paso de bebida = comida de solo bebida)
  const [picker, setPicker] = useState<{ day: PlanDay; meal: string; step: 'recipe' | 'drink'; entryId?: string } | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [planning, setPlanning] = useState(false)
  const [scope, setScope] = useState<PlannerScope>('all')
  const [pantryUses, setPantryUses] = useState<PantryUse[]>([]) // "¿Cómo quedaron?" tras cocinar
  const [drinkTimer, setDrinkTimer] = useState<DrinkTimer | null>(readDrinkTimer)
  const [choosingDrink, setChoosingDrink] = useState(false)
  const [savingDrink, setSavingDrink] = useState(false)
  const [lastDrink, setLastDrink] = useState<{ name: string; seconds: number } | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [leftovers, setLeftovers] = useState<CookingHistory[]>([])
  const [finishing, setFinishing] = useState<{ minutes: number } | null>(null) // formulario de porciones al terminar

  const load = useCallback(async (uid: string) => {
    try {
      const dayIndex = (new Date().getDay() + 6) % 7 // 0 = Mon … 6 = Sun
      const thisWeek = formatWeekStart(getWeekStart())
      const nextWeek = formatWeekStart(getWeekStart(tomorrowDate()))
      const ws = workspaceCookie()
      const [week, cooked, tomorrowWeek, memberList, leftoverList] = await Promise.all([
        fetchWeekPlannerRaw(uid, thisWeek),
        fetchCookedToday(uid),
        // On Sunday, tomorrow belongs to next week's plan
        nextWeek === thisWeek ? null : fetchWeekPlannerRaw(uid, nextWeek),
        // Sin miembros o sin sobras solo se pierden los nombres y la lista de la nevera
        ws ? fetchMembers(ws).catch(() => []) : [],
        fetchLeftovers(uid, ws).catch(() => []),
      ])
      setToday(week.filter(e => e.day_of_week === dayIndex))
      setTomorrow((tomorrowWeek ?? week).filter(e => e.day_of_week === tomorrowIndex()))
      setCookedToday(cooked)
      setMembers(memberList)
      setLeftovers(leftoverList)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (uid) { setUserId(uid); load(uid) } else setLoading(false)
    })
  }, [load])

  const ticking = !!timer || !!drinkTimer
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(nowMs()), 1000)
    return () => clearInterval(id)
  }, [ticking])

  function start(entry: WeeklyPlanner) {
    if (!entry.recipe_id) return
    const t = { entryId: entry.id, recipeId: entry.recipe_id, startedAt: nowMs() }
    writeTimer(t); setNow(t.startedAt); setTimer(t); setError(null)
  }

  function cancel() {
    writeTimer(null); setTimer(null)
  }

  // Personas que comen un plato: todos los miembros si es "para todos", si no solo uno
  const peopleFor = (entry: WeeklyPlanner | undefined) => entry?.for_user_id ? 1 : Math.max(1, members.length)

  // "Terminar" para el cronómetro y pregunta cuántas porciones salieron y cuántas se guardan
  function stop() {
    if (!timer) return
    setError(null)
    setFinishing({ minutes: Math.max(1, Math.round((nowMs() - timer.startedAt) / 60000)) })
  }

  async function confirmFinish({ servings, leftovers: kept }: { servings: number; leftovers: number }) {
    if (!timer || !finishing || !userId) return
    setSaving(true); setError(null)
    try {
      const entry = today.find(e => e.id === timer.entryId)
      const mealType = entry && (['desayuno', 'almuerzo', 'cena'] as const).find(m => m === entry.meal_type)
      const historyId = await finishRecipe(entry?.recipe ?? { id: timer.recipeId, servings: null }, userId, workspaceCookie(), {
        servings,
        leftovers: kept,
        actualMinutes: finishing.minutes,
        meal: mealType ? { mealType, plannerEntryId: timer.entryId } : undefined,
      })
      setCookedToday(prev => [...prev, { id: historyId, user_id: userId, recipe_id: timer.recipeId, planner_entry_id: mealType ? timer.entryId : null, diners: [] }])
      writeTimer(null); setTimer(null); setFinishing(null)
      if (kept > 0) fetchLeftovers(userId, workspaceCookie()).then(setLeftovers).catch(() => {})
      // Si falla solo se pierde la pregunta; la receta ya quedó en el historial
      pantryAfterCooking(timer.recipeId, userId, workspaceCookie()).then(setPantryUses).catch(() => {})
    } catch {
      setError('No se pudo guardar en el historial. Inténtalo de nuevo.')
    } finally { setSaving(false) }
  }

  function startDrink(drink: Product | null) {
    if (!drink) return
    const t = { productId: drink.id, name: drink.name, startedAt: nowMs() }
    writeDrinkTimer(t); setNow(t.startedAt); setDrinkTimer(t)
    setChoosingDrink(false); setLastDrink(null); setError(null)
  }

  function cancelDrink() {
    writeDrinkTimer(null); setDrinkTimer(null)
  }

  async function stopDrink() {
    if (!drinkTimer || !userId) return
    setSavingDrink(true); setError(null)
    try {
      const seconds = Math.round((nowMs() - drinkTimer.startedAt) / 1000)
      await finishDrink(drinkTimer.productId, userId, workspaceCookie(), seconds)
      setLastDrink({ name: drinkTimer.name, seconds })
      writeDrinkTimer(null); setDrinkTimer(null)
    } catch {
      setError('No se pudo guardar la bebida. Inténtalo de nuevo.')
    } finally { setSavingDrink(false) }
  }

  // "Empezar a comer" (o "Tomar" si la comida es solo bebida, o "Comer" si son sobras):
  // se apunta como comensal, se come su porción de sobras y se toma su bebida
  async function eat(entry: WeeklyPlanner, history: CookedToday | undefined) {
    if (!userId) return
    setEating(entry.id); setError(null)
    try {
      if (entry.leftover_history_id && !entry.leftovers_eaten_by.includes(userId)) {
        await eatPlannedLeftovers(entry.id)
        const leftoverId = entry.leftover_history_id
        setToday(prev => prev.map(e => e.id === entry.id ? {
          ...e,
          leftovers_eaten_by: [...e.leftovers_eaten_by, userId],
          leftover: e.leftover && { ...e.leftover, leftover_servings: Math.max(0, e.leftover.leftover_servings! - 1) },
        } : e))
        setLeftovers(prev => prev
          .map(h => h.id === leftoverId ? { ...h, leftover_servings: (h.leftover_servings ?? 0) - 1 } : h)
          .filter(h => (h.leftover_servings ?? 0) > 0))
      }
      if (history) {
        await startEating(history.id, userId)
        setCookedToday(prev => prev.map(h => h.id === history.id && !h.diners.some(d => d.user_id === userId)
          ? { ...h, diners: [...h.diners, { user_id: userId, ate_at: new Date().toISOString() }] }
          : h))
      }
      if (entry.drink_product_id && !entry.drink_taken_by.includes(userId)) {
        await takeDrink(entry, userId, workspaceCookie())
        setToday(prev => prev.map(e => e.id === entry.id ? { ...e, drink_taken_by: [...e.drink_taken_by, userId] } : e))
      }
    } catch {
      setError('No se pudo registrar. Inténtalo de nuevo.')
    } finally { setEating(null) }
  }

  async function openPicker(day: PlanDay, meal: string) {
    setPicker({ day, meal, step: 'recipe' }); setPickerSearch(''); setError(null)
    const current = (day === 'today' ? visibleToday : visibleTomorrow).find(e => e.meal_type === meal && isPlanned(e))
    setScope(current?.for_user_id ? 'me' : 'all')
    if (recipes || !userId) return
    try {
      setRecipes(await fetchRecipes(userId, workspaceCookie()))
    } catch {
      setRecipes([]); setError('No se pudieron cargar las recetas.')
    }
  }

  function openDrinkPicker(day: PlanDay, meal: string, entryId?: string) {
    setPicker({ day, meal, step: 'drink', entryId }); setError(null)
  }

  const setDay = (day: PlanDay) => day === 'today' ? setToday : setTomorrow
  const visibleToday = userId ? visibleEntries(today, userId) : today
  const visibleTomorrow = userId ? visibleEntries(tomorrow, userId) : tomorrow

  function slotFor(day: PlanDay, meal: string) {
    const date = planDate(day)
    return {
      week_start_date: formatWeekStart(getWeekStart(date)),
      day_of_week: (date.getDay() + 6) % 7,
      meal_type: meal,
    }
  }

  async function planMeal(recipe: Recipe) {
    if (!userId || !picker) return
    const { day, meal } = picker
    setPlanning(true)
    try {
      const entry = await upsertPlannerEntry({
        user_id: userId,
        workspace_id: null,
        for_user_id: scope === 'me' ? userId : null,
        ...slotFor(day, meal),
        recipe_id: recipe.id,
        notes: null,
      })
      setDay(day)(prev => withEntry(prev, { ...entry, recipe }))
      openDrinkPicker(day, meal, entry.id) // segundo paso: la bebida va aparte de la receta
    } catch {
      setError('No se pudo guardar en el planificador. Inténtalo de nuevo.')
    } finally { setPlanning(false) }
  }

  // Comida de sobras: no se cocina, cada uno se come una porción de lo guardado
  async function planLeftover(leftover: CookingHistory) {
    if (!userId || !picker) return
    const { day, meal } = picker
    setPlanning(true)
    try {
      const entry = await upsertPlannerEntry({
        user_id: userId,
        workspace_id: null,
        for_user_id: scope === 'me' ? userId : null,
        ...slotFor(day, meal),
        recipe_id: leftover.recipe_id,
        leftover_history_id: leftover.id,
        notes: null,
      })
      setDay(day)(prev => withEntry(prev, { ...entry, recipe: leftover.recipe }))
      openDrinkPicker(day, meal, entry.id)
    } catch {
      setError('No se pudo guardar en el planificador. Inténtalo de nuevo.')
    } finally { setPlanning(false) }
  }

  async function planDrink(drink: Product | null) {
    if (!userId || !picker) return
    const { day, meal, entryId } = picker
    const entry = entryId ? [...today, ...tomorrow].find(e => e.id === entryId) : undefined
    setPlanning(true); setError(null)
    try {
      if (!entryId) {
        // Comida de solo bebida (p. ej. un café)
        if (drink) {
          const created = await upsertPlannerEntry({
            user_id: userId,
            workspace_id: null,
            for_user_id: scope === 'me' ? userId : null,
            ...slotFor(day, meal),
            recipe_id: null,
            drink_product_id: drink.id,
            notes: null,
          })
          setDay(day)(prev => withEntry(prev, created))
        }
      } else if (!drink && !entry?.recipe_id) {
        // Sin receta y sin bebida no queda nada que planificar
        await deletePlannerEntry(entryId)
        setDay(day)(prev => prev.filter(e => e.id !== entryId))
      } else {
        const updated = await setPlannerDrink(entryId, drink?.id ?? null)
        setDay(day)(prev => prev.map(e => e.id === entryId ? { ...e, drink_product_id: updated.drink_product_id, drink: updated.drink } : e))
      }
      setPicker(null)
    } catch {
      setError('No se pudo guardar la bebida. Inténtalo de nuevo.')
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
    ? (picker.day === 'today' ? visibleToday : visibleTomorrow).find(e => e.meal_type === picker.meal && isPlanned(e))
    : undefined
  const pickerRecipes = (recipes ?? []).filter(r => r.name.toLowerCase().includes(pickerSearch.toLowerCase()))
  const drinkEntry = picker?.entryId ? [...today, ...tomorrow].find(e => e.id === picker.entryId) : undefined
  const pickerSubtitle = picker
    ? `${planDate(picker.day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })} · ${MEALS.find(m => m.key === picker.meal)?.label}`
    : ''

  // Lo cocinado hoy de cada plato: primero por el vínculo con el plan; los registros sin vínculo
  // (antiguos o cocinados desde la receta) marcan un plato con esa receta, en orden de comidas
  const historyByEntry = new Map<string, CookedToday>()
  const usedHistory = new Set<string>()
  visibleToday.forEach(e => {
    const h = cookedToday.find(h => h.planner_entry_id === e.id)
    if (h) { historyByEntry.set(e.id, h); usedHistory.add(h.id) }
  })
  MEALS.forEach(({ key }) => {
    const entry = visibleToday.find(e => e.meal_type === key && e.recipe_id && !e.leftover_history_id)
    if (!entry || historyByEntry.has(entry.id)) return
    const h = cookedToday.find(h => !h.planner_entry_id && !usedHistory.has(h.id) && h.recipe_id === entry.recipe_id)
    if (h) { historyByEntry.set(entry.id, h); usedHistory.add(h.id) }
  })

  const pill = 'flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-lime'
  const limeButton = 'flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-lime px-4 text-[13px] font-semibold text-forest disabled:opacity-40'

  return (
    <section className="relative flex h-full flex-col justify-between gap-5 overflow-hidden rounded-[28px] bg-forest p-7 text-[#f3f7ec]">
      <div className="stripes pointer-events-none absolute -top-10 -right-10 size-65 rounded-full" />
      <div className="relative flex flex-col gap-4">
        <p className="font-mono text-xs tracking-[0.08em] text-lime">PLANIFICADOR · HOY</p>

        {!loading && (
          <div className="flex max-w-sm flex-col gap-1 rounded-[20px] bg-white/5 p-3 backdrop-blur-[2px]">
            <div className="flex items-center justify-between gap-3 px-1.5 pb-1">
              <p className="font-mono text-[11px] tracking-[0.08em] text-white/55 uppercase">
                Mañana · {tomorrowDate().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}
              </p>
              <Link href="/dashboard/planner" className="shrink-0 text-[11px] text-white/55 hover:text-lime">Ver semana →</Link>
            </div>
            {MEALS.map(({ key, label }) => {
              const planned = visibleTomorrow.find(e => e.meal_type === key && isPlanned(e))
              const recipeName = planned?.recipe && (planned.leftover_history_id ? `Sobras · ${planned.recipe.name}` : planned.recipe.name)
              const name = recipeName ?? planned?.drink?.name
              const drinkName = planned?.recipe && planned.drink?.name
              return (
                <button key={key} type="button" onClick={() => openPicker('tomorrow', key)}
                  className="group flex cursor-pointer items-center gap-3 rounded-xl px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-white/[0.07]">
                  <span className="w-18 shrink-0 text-xs text-white/55">{label}</span>
                  {name
                    ? <span className="min-w-0 flex-1 truncate font-medium">
                        {name}
                        {drinkName && <span className="font-normal text-white/45"> · {drinkName}</span>}
                      </span>
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
          const entry = visibleToday.find(e => e.meal_type === key && isPlanned(e))

          if (!entry) {
            return (
              <button key={key} type="button" onClick={() => openPicker('today', key)}
                className="flex cursor-pointer items-center justify-between rounded-2xl bg-white/[0.07] px-4 py-3.25 text-left text-[15px] transition-colors hover:bg-white/12">
                <span>{label}</span>
                <span className="text-[13px] text-lime">Añadir +</span>
              </button>
            )
          }

          const drinkOnly = !entry.recipe_id
          const leftoverMeal = !!entry.leftover_history_id
          const history = historyByEntry.get(entry.id)
          const running = !drinkOnly && timer?.entryId === entry.id
          const ate = !!history?.diners.some(d => d.user_id === userId)
          const ateLeftovers = !!userId && entry.leftovers_eaten_by.includes(userId)
          const drank = !!userId && entry.drink_taken_by.includes(userId)
          const diners = history?.diners.length ?? 0
          const busy = eating === entry.id
          const remaining = entry.leftover?.leftover_servings
          const status = [
            label,
            leftoverMeal && (remaining != null ? `Sobras · quedan ${remaining}` : 'Sobras'),
            history && `Cocinado por ${memberLabel(members, history.user_id, userId)}`,
            diners > 0 && `${diners} a la mesa`,
          ].filter(Boolean).join(' · ')

          const editButton = (
            <button type="button" onClick={() => openPicker('today', key)} aria-label="Cambiar" title="Cambiar"
              className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-white/10 text-lime transition-colors hover:bg-white/20">
              <Pencil className="size-4" />
            </button>
          )

          return (
            <div key={key} className="rounded-2xl bg-white/[0.07] px-4 py-3.25">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-white/55">{status}</p>
                  {drinkOnly ? (
                    <p className="flex items-center gap-1.5 font-medium">
                      <CupSoda className="size-4 shrink-0 text-white/55" />
                      <span className="truncate">{entry.drink?.name ?? '—'}</span>
                    </p>
                  ) : (
                    <>
                      <p className="truncate font-medium">{entry.recipe?.name ?? '—'}</p>
                      {drank ? (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/70">
                          <CupSoda className="size-3.5 shrink-0" />
                          <span className="truncate">{entry.drink?.name}</span>
                          <Check className="size-3 shrink-0 stroke-[2.6] text-lime" />
                        </p>
                      ) : (
                        <button type="button" onClick={() => openDrinkPicker('today', key, entry.id)}
                          className={`mt-0.5 flex max-w-full cursor-pointer items-center gap-1.5 text-xs transition-colors hover:text-lime ${entry.drink ? 'text-white/70' : 'text-white/45'}`}>
                          <CupSoda className="size-3.5 shrink-0" />
                          <span className="truncate">{entry.drink?.name ?? 'Añadir bebida'}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                {running ? (
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-lg tabular-nums text-lime">{formatElapsed(now - timer!.startedAt)}</span>
                    <button onClick={stop} disabled={saving}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-[13px] font-semibold text-forest disabled:opacity-60">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-current" />}
                      Terminar
                    </button>
                  </div>
                ) : drinkOnly ? (
                  drank ? (
                    <span className={pill}><Check className="h-4 w-4 stroke-[2.6]" /> Tomado</span>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      {editButton}
                      <button onClick={() => eat(entry, undefined)} disabled={busy} className={limeButton}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CupSoda className="h-4 w-4" />} Tomar
                      </button>
                    </div>
                  )
                ) : leftoverMeal ? (
                  ateLeftovers ? (
                    <span className={pill}><Check className="h-4 w-4 stroke-[2.6]" /> ¡Buen provecho!</span>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      {editButton}
                      <button onClick={() => eat(entry, undefined)} disabled={busy} className={limeButton}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Refrigerator className="h-4 w-4" />} Comer
                      </button>
                    </div>
                  )
                ) : history ? (
                  ate ? (
                    <span className={pill}><Check className="h-4 w-4 stroke-[2.6]" /> ¡Buen provecho!</span>
                  ) : (
                    <button onClick={() => eat(entry, history)} disabled={busy} className={limeButton}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Utensils className="h-4 w-4" />} Empezar a comer
                    </button>
                  )
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    {editButton}
                    <button onClick={() => start(entry)} disabled={!!timer} className={limeButton}>
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

        {/* Bebida suelta, fuera de las comidas: se cronometra lo que se tarda en prepararla */}
        {!loading && (drinkTimer ? (
          <div className="rounded-2xl bg-white/[0.07] px-4 py-3.25">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-white/55">Preparando bebida</p>
                <p className="flex items-center gap-1.5 font-medium">
                  <CupSoda className="size-4 shrink-0 text-white/55" />
                  <span className="truncate">{drinkTimer.name}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-lg tabular-nums text-lime">{formatElapsed(now - drinkTimer.startedAt)}</span>
                <button onClick={stopDrink} disabled={savingDrink}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-[13px] font-semibold text-forest disabled:opacity-60">
                  {savingDrink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-current" />}
                  Terminar
                </button>
              </div>
            </div>
            <button onClick={cancelDrink} disabled={savingDrink} className="mt-2 text-xs text-white/60 underline hover:text-white">
              Cancelar sin guardar
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => { setChoosingDrink(true); setError(null) }}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-white/20 px-4 py-3 text-left transition-colors hover:bg-white/[0.07]">
            <span className="flex min-w-0 items-center gap-2.5">
              <CupSoda className="size-4 shrink-0 text-white/55" />
              <span className="min-w-0">
                <span className="block text-[15px]">Preparar una bebida</span>
                {lastDrink && (
                  <span className="flex items-center gap-1 text-xs text-white/55">
                    <Check className="size-3 shrink-0 stroke-[2.6] text-lime" />
                    <span className="truncate">{lastDrink.name} listo en {formatDuration(lastDrink.seconds)}</span>
                  </span>
                )}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[13px] text-lime"><Play className="size-3.5 fill-current" /> Cronometrar</span>
          </button>
        ))}
        {!loading && leftovers.length > 0 && (
          <Link href="/dashboard/inventory" className="flex items-center gap-2 px-1 text-xs text-white/60 transition-colors hover:text-lime">
            <Refrigerator className="size-3.5 shrink-0" />
            <span className="truncate">En la nevera: {leftovers.map(h => `${h.recipe?.name ?? 'Receta'} (${h.leftover_servings})`).join(' · ')}</span>
          </Link>
        )}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>

      {picker?.step === 'recipe' && (
        <CenterModal
          eyebrow={picker.day === 'today' ? 'Hoy' : 'Mañana'}
          title={pickerEntry?.recipe_id ? 'Cambiar receta' : 'Elegir receta'}
          subtitle={pickerSubtitle}
          onClose={() => setPicker(null)}
          footer={pickerEntry ? <>
            <Button variant="outline" className="flex-1" disabled={planning} onClick={() => openDrinkPicker(picker.day, picker.meal, pickerEntry.id)}>
              <CupSoda /> {pickerEntry.drink ? 'Cambiar bebida' : 'Elegir bebida'}
            </Button>
            <Button variant="destructive" className="flex-1" disabled={planning} onClick={() => unplanMeal(pickerEntry)}>
              <Trash2 /> Quitar del plan
            </Button>
          </> : (
            <Button variant="outline" className="w-full" disabled={planning} onClick={() => openDrinkPicker(picker.day, picker.meal)}>
              <CupSoda /> Solo bebida
            </Button>
          )}
        >
          {currentWorkspaceId() && <ScopeToggle value={scope} onChange={setScope} />}
          <SearchField tone="soft" className="h-11 max-w-none" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Buscar receta..." autoFocus />
          {!pickerSearch && <LeftoverOptions leftovers={leftovers} currentId={pickerEntry?.leftover_history_id ?? null} disabled={planning} onPick={planLeftover} />}
          {recipes === null ? (
            <LoadingState className="py-8" />
          ) : (
            <div className="-mx-2 flex flex-col">
              {pickerRecipes.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-5">No hay recetas disponibles.</p>
              ) : pickerRecipes.map(recipe => {
                const current = pickerEntry?.recipe_id === recipe.id && !pickerEntry.leftover_history_id
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

      {picker?.step === 'drink' && userId && (
        <DrinkPicker
          userId={userId}
          eyebrow={picker.day === 'today' ? 'Hoy' : 'Mañana'}
          subtitle={[pickerSubtitle, drinkEntry?.recipe?.name].filter(Boolean).join(' · ')}
          currentDrinkId={drinkEntry?.drink_product_id ?? null}
          saving={planning}
          error={error}
          onPick={planDrink}
          onClose={() => setPicker(null)}
        />
      )}

      {choosingDrink && userId && (
        <DrinkPicker
          userId={userId}
          eyebrow="Ahora"
          title="¿Qué vas a preparar?"
          subtitle="Se cronometra lo que tardas y se descuenta una ración del inventario"
          allowNone={false}
          currentDrinkId={null}
          saving={false}
          onPick={startDrink}
          onClose={() => setChoosingDrink(false)}
        />
      )}

      {finishing && timer && (() => {
        const entry = today.find(e => e.id === timer.entryId)
        return (
          <FinishCookingModal
            recipeName={entry?.recipe?.name ?? 'Receta'}
            recipeServings={entry?.recipe?.servings ?? null}
            defaults={defaultPortions(entry?.recipe?.servings ?? null, peopleFor(entry))}
            minutes={finishing.minutes}
            saving={saving}
            error={error}
            onConfirm={confirmFinish}
            onClose={() => setFinishing(null)}
          />
        )
      })()}

      {pantryUses.length > 0 && userId && <PantryCheckModal userId={userId} uses={pantryUses} onClose={() => setPantryUses([])} />}
    </section>
  )
}
