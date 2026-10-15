'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchWeekPlannerRaw, visibleEntries, withEntry, upsertPlannerEntry, setPlannerDrink, deletePlannerEntry, getWeekStart, formatWeekStart } from '@/lib/services/planner'
import { currentWorkspaceId } from '@/lib/workspace'
import { ScopeToggle, type PlannerScope } from '@/components/planner/ScopeToggle'
import { DrinkPicker } from '@/components/planner/DrinkPicker'
import { fetchRecipes } from '@/lib/services/recipes'
import type { WeeklyPlanner, Recipe, Product } from '@/types'
import { Button } from '@/components/ui/button'
import { PageHeader, IconAction, CenterModal, LoadingState, SearchField } from '@/components/ui/freedomus'
import { ChevronLeft, ChevronRight, X, Flame, User, CupSoda } from 'lucide-react'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MEAL_TYPES = [
  { key: 'desayuno', label: 'Desayuno', dot: 'bg-peach-ink', cell: 'bg-peach text-[#8a3a0c]' },
  { key: 'almuerzo', label: 'Almuerzo', dot: 'bg-leaf', cell: 'bg-lime text-lime-ink' },
  { key: 'cena', label: 'Cena', dot: 'bg-lilac-ink', cell: 'bg-lilac text-[#5a3a7d]' },
]

function addDays(date: Date, n: number) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function totalCalories(plan: WeeklyPlanner[]) {
  return plan.reduce((sum, e) => sum + (e.recipe?.total_calories ?? 0), 0)
}

export default function PlannerPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart())
  const [plan, setPlan] = useState<WeeklyPlanner[]>([])
  const [loading, setLoading] = useState(true)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [pickerDay, setPickerDay] = useState<number>(0)
  const [pickerMeal, setPickerMeal] = useState<string>('almuerzo')
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerScope, setPickerScope] = useState<PlannerScope>('all')
  const [saving, setSaving] = useState(false)
  // Paso de bebida tras elegir receta (sin entryId = comida de solo bebida)
  const [drinkFor, setDrinkFor] = useState<{ entryId?: string } | null>(null)
  const [drinkError, setDrinkError] = useState<string | null>(null)

  const load = useCallback(async (uid: string, ws: Date) => {
    setLoading(true)
    try {
      const [planData, recipesData] = await Promise.all([
        fetchWeekPlannerRaw(uid, formatWeekStart(ws)),
        fetchRecipes(uid, document.cookie.match(/workspace_id=([^;]+)/)?.[1] ?? null),
      ])
      setPlan(planData)
      setRecipes(recipesData)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (uid) { setUserId(uid); load(uid, weekStart) }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visiblePlan = userId ? visibleEntries(plan, userId) : plan

  function getEntry(day: number, mealType: string) {
    return visiblePlan.find(e => e.day_of_week === day && e.meal_type === mealType && (e.recipe_id || e.drink_product_id)) ?? null
  }

  async function handleSelectRecipe(recipe: Recipe) {
    if (!userId) return
    setSaving(true)
    try {
      const entry = await upsertPlannerEntry({
        user_id: userId,
        workspace_id: null,
        for_user_id: pickerScope === 'me' ? userId : null,
        week_start_date: formatWeekStart(weekStart),
        day_of_week: pickerDay,
        meal_type: pickerMeal,
        recipe_id: recipe.id,
        notes: null,
      })
      setPlan(prev => withEntry(prev, { ...entry, recipe }))
      setShowPicker(false)
      openDrinkPicker(entry.id) // segundo paso: la bebida va aparte de la receta
    } finally { setSaving(false) }
  }

  function openDrinkPicker(entryId?: string) {
    setShowPicker(false); setDrinkError(null); setDrinkFor({ entryId })
  }

  async function handleSelectDrink(drink: Product | null) {
    if (!userId || !drinkFor) return
    const { entryId } = drinkFor
    const entry = entryId ? plan.find(e => e.id === entryId) : undefined
    setSaving(true); setDrinkError(null)
    try {
      if (!entryId) {
        // Comida de solo bebida (p. ej. un café)
        if (drink) {
          const created = await upsertPlannerEntry({
            user_id: userId,
            workspace_id: null,
            for_user_id: pickerScope === 'me' ? userId : null,
            week_start_date: formatWeekStart(weekStart),
            day_of_week: pickerDay,
            meal_type: pickerMeal,
            recipe_id: null,
            drink_product_id: drink.id,
            notes: null,
          })
          setPlan(prev => withEntry(prev, created))
        }
      } else if (!drink && !entry?.recipe_id) {
        // Sin receta y sin bebida no queda nada que planificar
        await deletePlannerEntry(entryId)
        setPlan(prev => prev.filter(e => e.id !== entryId))
      } else {
        const updated = await setPlannerDrink(entryId, drink?.id ?? null)
        setPlan(prev => prev.map(e => e.id === entryId ? { ...e, drink_product_id: updated.drink_product_id, drink: updated.drink } : e))
      }
      setDrinkFor(null)
    } catch {
      setDrinkError('No se pudo guardar la bebida. Inténtalo de nuevo.')
    } finally { setSaving(false) }
  }

  async function handleRemove(entry: WeeklyPlanner) {
    await deletePlannerEntry(entry.id)
    setPlan(prev => prev.filter(e => e.id !== entry.id))
  }

  function openPicker(day: number, meal: string) {
    setPickerDay(day); setPickerMeal(meal); setPickerSearch('')
    setPickerScope(getEntry(day, meal)?.for_user_id ? 'me' : 'all')
    setShowPicker(true)
  }

  function navigate(dir: number) {
    const newStart = addDays(weekStart, dir * 7)
    setWeekStart(newStart)
    if (userId) load(userId, newStart)
  }

  function goToday() {
    const start = getWeekStart()
    setWeekStart(start)
    if (userId) load(userId, start)
  }

  const pickerEntry = showPicker || drinkFor ? getEntry(pickerDay, pickerMeal) : null
  const drinkEntry = drinkFor?.entryId ? plan.find(e => e.id === drinkFor.entryId) : undefined
  const filteredRecipes = recipes.filter(r => r.name.toLowerCase().includes(pickerSearch.toLowerCase()))
  const kcal = totalCalories(visiblePlan)

  const weekEnd = addDays(weekStart, 6)
  const title = `Semana del ${weekStart.getDate()} de ${weekStart.toLocaleDateString('es-ES', { month: 'long' })}`

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader title={title} subtitle={`${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)} ${weekEnd.getFullYear()}`}>
        {kcal > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-butter px-3.5 py-2 text-[13px] font-semibold text-butter-ink"><Flame className="size-4" /> {kcal} kcal / semana</span>
        )}
        <button onClick={goToday} className="cursor-pointer rounded-full bg-card px-4 py-2.25 text-[13px] font-semibold hover:bg-card/70">Hoy</button>
        <IconAction tone="white" onClick={() => navigate(-1)} aria-label="Semana anterior"><ChevronLeft /></IconAction>
        <IconAction tone="white" onClick={() => navigate(1)} aria-label="Semana siguiente"><ChevronRight /></IconAction>
      </PageHeader>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          <div className="flex min-h-130 min-w-215 flex-col gap-2.5">
            <div className="grid grid-cols-[96px_repeat(7,minmax(0,1fr))] gap-2.5">
              <div />
              {DAYS.map((dayName, dayIdx) => {
                const date = addDays(weekStart, dayIdx)
                const isToday = formatShortDate(date) === formatShortDate(new Date())
                return (
                  <div key={dayIdx} className="flex flex-col items-center gap-1 rounded-[18px] bg-card py-2.5">
                    <p className="text-[11.5px] font-semibold tracking-widest text-ink-5 uppercase">{dayName.slice(0, 3)}</p>
                    <p className={`grid size-8 place-items-center rounded-full font-display text-base font-extrabold ${isToday ? 'bg-forest text-lime' : ''}`}>{date.getDate()}</p>
                  </div>
                )
              })}
            </div>

            {MEAL_TYPES.map(({ key, label, dot, cell }) => (
              <div key={key} className="grid flex-1 grid-cols-[96px_repeat(7,minmax(0,1fr))] gap-2.5">
                <div className="flex items-center gap-2 font-display text-sm font-bold">
                  <span className={`size-2.5 rounded-full ${dot}`} />{label}
                </div>
                {DAYS.map((_, dayIdx) => {
                  const entry = getEntry(dayIdx, key)
                  return entry ? (
                    <div key={dayIdx} className={`group relative flex min-h-24 flex-col gap-1.5 rounded-[20px] p-3 text-[13.5px] leading-tight font-semibold ${cell}`}>
                      <button className="flex-1 cursor-pointer pr-5 text-left hover:underline" onClick={() => openPicker(dayIdx, key)}>
                        {entry.recipe_id
                          ? entry.recipe?.name ?? '...'
                          : <span className="flex items-center gap-1.5"><CupSoda className="size-3.5 shrink-0" />{entry.drink?.name ?? '...'}</span>}
                      </button>
                      {entry.recipe_id && (
                        <button onClick={() => { setPickerDay(dayIdx); setPickerMeal(key); openDrinkPicker(entry.id) }}
                          className={`flex min-w-0 cursor-pointer items-center gap-1 pr-5 text-left text-[11.5px] font-medium hover:underline ${entry.drink ? 'opacity-75' : 'opacity-0 transition-opacity group-hover:opacity-60 pointer-coarse:opacity-60'}`}>
                          <CupSoda className="size-3 shrink-0" />
                          <span className="truncate">{entry.drink?.name ?? 'Bebida'}</span>
                        </button>
                      )}
                      {entry.for_user_id && <User className="absolute right-2 bottom-2 size-3.5 opacity-60" aria-label="Solo para ti" />}
                      <button onClick={() => handleRemove(entry)} aria-label="Quitar"
                        className="absolute top-2 right-2 grid size-6 pointer-coarse:size-8 cursor-pointer place-items-center rounded-full bg-white/70 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 hover:text-danger">
                        <X className="size-3 stroke-[2.6]" />
                      </button>
                    </div>
                  ) : (
                    <button key={dayIdx} onClick={() => openPicker(dayIdx, key)}
                      className="grid min-h-24 cursor-pointer place-items-center rounded-[20px] border-[1.5px] border-dashed border-[#b9c5b5] text-[13.5px] font-medium text-ink-5 transition-colors hover:bg-white/50">
                      + Añadir
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recipe Picker Modal */}
      {showPicker && (
        <CenterModal
          eyebrow="Planificador"
          title={pickerEntry?.recipe_id ? 'Cambiar receta' : 'Elegir receta'}
          subtitle={`${DAYS[pickerDay]} · ${MEAL_TYPES.find(m => m.key === pickerMeal)?.label}`}
          onClose={() => setShowPicker(false)}
          footer={
            <Button variant="outline" className="w-full" disabled={saving} onClick={() => openDrinkPicker(pickerEntry?.id)}>
              <CupSoda /> {pickerEntry ? (pickerEntry.drink ? 'Cambiar bebida' : 'Elegir bebida') : 'Solo bebida'}
            </Button>
          }
        >
          {currentWorkspaceId() && <ScopeToggle value={pickerScope} onChange={setPickerScope} />}
          <SearchField tone="soft" className="h-11 max-w-none" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Buscar receta..." autoFocus />
          <div className="-mx-2 flex flex-col">
            {filteredRecipes.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-5">No hay recetas disponibles.</p>
            ) : (
              filteredRecipes.map(recipe => (
                <button key={recipe.id} disabled={saving}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-sage disabled:opacity-50"
                  onClick={() => handleSelectRecipe(recipe)}>
                  <div>
                    <p className="font-display text-[15px] font-bold">{recipe.name}</p>
                    <p className="text-xs text-ink-5">{recipe.meal_type} · {recipe.difficulty ?? '—'}</p>
                  </div>
                  {recipe.total_calories && <span className="shrink-0 rounded-full bg-sage px-2.5 py-0.5 text-xs text-ink-2">{recipe.total_calories} kcal</span>}
                </button>
              ))
            )}
          </div>
        </CenterModal>
      )}

      {drinkFor && userId && (
        <DrinkPicker
          userId={userId}
          eyebrow="Planificador"
          subtitle={[DAYS[pickerDay], MEAL_TYPES.find(m => m.key === pickerMeal)?.label, drinkEntry?.recipe?.name].filter(Boolean).join(' · ')}
          currentDrinkId={drinkEntry?.drink_product_id ?? null}
          saving={saving}
          error={drinkError}
          onPick={handleSelectDrink}
          onClose={() => setDrinkFor(null)}
        />
      )}
    </div>
  )
}
