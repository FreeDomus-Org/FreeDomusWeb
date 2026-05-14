'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchWeekPlanner, upsertPlannerEntry, deletePlannerEntry, getWeekStart, formatWeekStart } from '@/lib/services/planner'
import { fetchRecipes } from '@/lib/services/recipes'
import type { WeeklyPlanner, Recipe } from '@/types'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MEAL_TYPES = [
  { key: 'desayuno', label: 'Desayuno', emoji: '🌅', color: 'text-orange-500' },
  { key: 'almuerzo', label: 'Almuerzo', emoji: '🍽️', color: 'text-green-500' },
  { key: 'cena', label: 'Cena', emoji: '🌙', color: 'text-indigo-500' },
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
        fetchRecipes(uid),
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

  const filteredRecipes = recipes.filter(r => r.name.toLowerCase().includes(pickerSearch.toLowerCase()))
  const kcal = totalCalories(plan)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Planificador semanal</h1>
        <div className="flex items-center gap-3">
          {kcal > 0 && (
            <span className="text-sm bg-amber-100 text-amber-700 px-3 py-1 rounded-full">🔥 {kcal} kcal / semana</span>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-md hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-medium min-w-36 text-center">
              {formatShortDate(weekStart)} – {formatShortDate(addDays(weekStart, 6))}
            </span>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-md hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {DAYS.map((dayName, dayIdx) => {
            const date = addDays(weekStart, dayIdx)
            const isToday = formatShortDate(date) === formatShortDate(new Date())
            return (
              <div key={dayIdx} className={`rounded-xl border p-3 space-y-2 ${isToday ? 'border-primary bg-primary/5' : 'bg-card'}`}>
                <div className="text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{dayName.slice(0, 3)}</p>
                  <p className={`text-lg font-bold ${isToday ? 'text-primary' : ''}`}>{date.getDate()}</p>
                </div>

                <div className="space-y-1.5">
                  {MEAL_TYPES.map(({ key, label, emoji, color }) => {
                    const entry = getEntry(dayIdx, key)
                    return (
                      <div key={key} className="rounded-lg border bg-background p-2 min-h-[60px] relative group">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xs">{emoji}</span>
                          <span className={`text-xs font-medium ${color}`}>{label}</span>
                        </div>
                        {entry ? (
                          <div className="flex items-start justify-between gap-1">
                            <button
                              className="text-xs text-left leading-tight hover:text-primary transition-colors flex-1"
                              onClick={() => openPicker(dayIdx, key)}
                            >
                              {entry.recipe?.name ?? '...'}
                            </button>
                            <button onClick={() => handleRemove(entry)} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => openPicker(dayIdx, key)}
                            className="w-full text-xs text-muted-foreground hover:text-primary transition-colors text-left"
                          >
                            + Añadir
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recipe Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="font-semibold">Elegir receta</h2>
                <p className="text-xs text-muted-foreground">{DAYS[pickerDay]} · {MEAL_TYPES.find(m => m.key === pickerMeal)?.label}</p>
              </div>
              <button onClick={() => setShowPicker(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-3 border-b">
              <input
                type="text"
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Buscar receta..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredRecipes.length === 0 ? (
                <p className="text-center py-8 text-sm text-muted-foreground">No hay recetas disponibles.</p>
              ) : (
                filteredRecipes.map(recipe => (
                  <button key={recipe.id} disabled={saving}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted transition-colors flex items-center justify-between gap-3"
                    onClick={() => handleSelectRecipe(recipe)}>
                    <div>
                      <p className="text-sm font-medium">{recipe.name}</p>
                      <p className="text-xs text-muted-foreground">{recipe.meal_type} · {recipe.difficulty ?? '—'}</p>
                    </div>
                    {recipe.total_calories && <span className="text-xs text-muted-foreground shrink-0">{recipe.total_calories} kcal</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}