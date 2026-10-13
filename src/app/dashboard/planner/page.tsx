'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchWeekPlanner, upsertPlannerEntry, deletePlannerEntry, getWeekStart, formatWeekStart } from '@/lib/services/planner'
import { fetchRecipes } from '@/lib/services/recipes'
import type { WeeklyPlanner, Recipe } from '@/types'
import { PageHeader, IconAction, CenterModal, LoadingState, SearchField } from '@/components/ui/freedomus'
import { ChevronLeft, ChevronRight, X, Flame } from 'lucide-react'

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
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (uid: string, ws: Date) => {
    setLoading(true)
    try {
      const [planData, recipesData] = await Promise.all([
        fetchWeekPlanner(uid, formatWeekStart(ws)),
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

  function getEntry(day: number, mealType: string) {
    return plan.find(e => e.day_of_week === day && e.meal_type === mealType) ?? null
  }

  async function handleSelectRecipe(recipe: Recipe) {
    if (!userId) return
    setSaving(true)
    try {
      const entry = await upsertPlannerEntry({
        user_id: userId,
        workspace_id: null,
        week_start_date: formatWeekStart(weekStart),
        day_of_week: pickerDay,
        meal_type: pickerMeal,
        recipe_id: recipe.id,
        notes: null,
      })
      setPlan(prev => {
        const filtered = prev.filter(e => !(e.day_of_week === pickerDay && e.meal_type === pickerMeal))
        return [...filtered, { ...entry, recipe }]
      })
      setShowPicker(false)
    } finally { setSaving(false) }
  }

  async function handleRemove(entry: WeeklyPlanner) {
    await deletePlannerEntry(entry.id)
    setPlan(prev => prev.filter(e => e.id !== entry.id))
  }

  function openPicker(day: number, meal: string) {
    setPickerDay(day); setPickerMeal(meal); setPickerSearch(''); setShowPicker(true)
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

  const filteredRecipes = recipes.filter(r => r.name.toLowerCase().includes(pickerSearch.toLowerCase()))
  const kcal = totalCalories(plan)

  const weekEnd = addDays(weekStart, 6)
  const title = `Semana del ${weekStart.getDate()} de ${weekStart.toLocaleDateString('es-ES', { month: 'long' })}`

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader title={title} subtitle={`${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)} ${weekEnd.getFullYear()}`}>
        {kcal > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-butter px-3.5 py-2 text-[13px] font-semibold text-butter-ink"><Flame className="size-4" /> {kcal} kcal / semana</span>
        )}
        <button onClick={goToday} className="cursor-pointer rounded-full bg-card px-4 py-[9px] text-[13px] font-semibold hover:bg-card/70">Hoy</button>
        <IconAction tone="white" onClick={() => navigate(-1)} aria-label="Semana anterior"><ChevronLeft /></IconAction>
        <IconAction tone="white" onClick={() => navigate(1)} aria-label="Semana siguiente"><ChevronRight /></IconAction>
      </PageHeader>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="flex min-h-[520px] min-w-[860px] flex-col gap-2.5">
            <div className="grid grid-cols-[96px_repeat(7,minmax(0,1fr))] gap-2.5">
              <div />
              {DAYS.map((dayName, dayIdx) => {
                const date = addDays(weekStart, dayIdx)
                const isToday = formatShortDate(date) === formatShortDate(new Date())
                return (
                  <div key={dayIdx} className="flex flex-col items-center gap-1 rounded-[18px] bg-card py-2.5">
                    <p className="text-[11.5px] font-semibold tracking-[0.1em] text-ink-5 uppercase">{dayName.slice(0, 3)}</p>
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
                    <div key={dayIdx} className={`group relative flex min-h-24 rounded-[20px] p-3 text-[13.5px] leading-tight font-semibold ${cell}`}>
                      <button className="flex-1 cursor-pointer text-left hover:underline" onClick={() => openPicker(dayIdx, key)}>
                        {entry.recipe?.name ?? '...'}
                      </button>
                      <button onClick={() => handleRemove(entry)} aria-label="Quitar"
                        className="absolute top-2 right-2 grid size-6 cursor-pointer place-items-center rounded-full bg-white/70 opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger">
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
          title="Elegir receta"
          subtitle={`${DAYS[pickerDay]} · ${MEAL_TYPES.find(m => m.key === pickerMeal)?.label}`}
          onClose={() => setShowPicker(false)}
        >
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
    </div>
  )
}
