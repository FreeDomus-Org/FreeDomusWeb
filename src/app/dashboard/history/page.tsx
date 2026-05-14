'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchHistory, fetchTopRated, createHistoryEntry, updateHistoryEntry, deleteHistoryEntry } from '@/lib/services/history'
import { fetchRecipes } from '@/lib/services/recipes'
import type { CookingHistory, CookingHistoryCreate, Recipe } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Star, Trash2, Edit2, X, Loader2, TrendingUp, ChevronDown } from 'lucide-react'

function StarDisplay({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground">Sin valorar</span>
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`h-3 w-3 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
      ))}
    </div>
  )
}

const EMPTY_FORM = {
  recipe_id: '',
  cooked_at: new Date().toISOString().split('T')[0],
  servings: 2,
  rating: null as number | null,
  feedback: '',
  actual_time_minutes: null as number | null,
}

export default function HistoryPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [history, setHistory] = useState<CookingHistory[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'top'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CookingHistory | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (uid: string, mode: 'all' | 'top' = 'all') => {
    setLoading(true)
    try {
      const [histData, recipeData] = await Promise.all([
        mode === 'top' ? fetchTopRated(uid) : fetchHistory(uid),
        fetchRecipes(uid),
      ])
      setHistory(histData)
      setRecipes(recipeData)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (uid) { setUserId(uid); load(uid) }
    })
  }, [load])

  const filtered = history.filter(h => {
    const name = h.recipe?.name ?? ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  // Stats
  const rated = history.filter(h => h.rating != null)
  const avgRating = rated.length > 0 ? rated.reduce((s, h) => s + (h.rating ?? 0), 0) / rated.length : null
  const counts: Record<string, number> = {}
  history.forEach(h => { if (h.recipe_id) counts[h.recipe_id] = (counts[h.recipe_id] ?? 0) + 1 })
  const topRecipeId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const topRecipe = history.find(h => h.recipe_id === topRecipeId)

  function openAdd() {
    setEditing(null); setForm(EMPTY_FORM); setShowForm(true)
  }

  function openEdit(h: CookingHistory) {
    setEditing(h)
    setForm({
      recipe_id: h.recipe_id,
      cooked_at: h.cooked_at.split('T')[0],
      servings: h.servings ?? 2,
      rating: h.rating,
      feedback: h.feedback ?? '',
      actual_time_minutes: h.actual_time_minutes,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!userId || !form.recipe_id) return
    setSaving(true)
    try {
      const payload: CookingHistoryCreate = {
        user_id: userId,
        workspace_id: null,
        recipe_id: form.recipe_id,
        cooked_at: new Date(form.cooked_at).toISOString(),
        servings: form.servings,
        rating: form.rating,
        feedback: form.feedback || null,
        actual_time_minutes: form.actual_time_minutes,
      }
      if (editing) await updateHistoryEntry(editing.id, payload)
      else await createHistoryEntry(payload)
      await load(userId, filter)
      setShowForm(false)
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!userId || !confirm('¿Eliminar este registro?')) return
    await deleteHistoryEntry(id)
    setHistory(prev => prev.filter(h => h.id !== id))
  }

  async function switchFilter(f: 'all' | 'top') {
    setFilter(f)
    if (userId) load(userId, f)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historial de cocina</h1>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Registrar</Button>
      </div>

      {/* Stats */}
      {history.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <Star className="h-5 w-5 text-amber-400 fill-amber-400 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Valoración media</p>
              <p className="font-bold">{avgRating != null ? avgRating.toFixed(1) : '—'}</p>
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-green-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Más cocinada</p>
              <p className="font-bold truncate">{topRecipe?.recipe?.name ?? '—'}</p>
            </div>
          </CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'top'] as const).map(f => (
          <button key={f} onClick={() => switchFilter(f)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {f === 'all' ? 'Todas' : '⭐ Top valoradas'}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por receta..."
          className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm" />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><p className="text-4xl mb-2">🍳</p><p>No hay registros aún.</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <Card key={entry.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="font-semibold truncate">{entry.recipe?.name ?? '—'}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{new Date(entry.cooked_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {entry.servings && <span>{entry.servings} porciones</span>}
                    {entry.actual_time_minutes && <span>{entry.actual_time_minutes} min</span>}
                  </div>
                  <StarDisplay rating={entry.rating} />
                  {entry.feedback && <p className="text-xs text-muted-foreground italic">&ldquo;{entry.feedback}&rdquo;</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(entry)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(entry.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
          <div className="w-full max-w-md bg-background h-full overflow-y-auto shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
              <h2 className="font-semibold text-lg">{editing ? 'Editar registro' : 'Registrar cocción'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <div className="space-y-1">
                <Label>Receta *</Label>
                <div className="relative">
                  <select value={form.recipe_id} onChange={e => setForm(f => ({ ...f, recipe_id: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8">
                    <option value="">— Selecciona una receta —</option>
                    {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fecha cocinada</Label>
                  <Input type="date" value={form.cooked_at} onChange={e => setForm(f => ({ ...f, cooked_at: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Porciones</Label>
                  <Input type="number" min={1} value={form.servings} onChange={e => setForm(f => ({ ...f, servings: +e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Tiempo real (min)</Label>
                <Input type="number" min={0} value={form.actual_time_minutes ?? ''} onChange={e => setForm(f => ({ ...f, actual_time_minutes: +e.target.value || null }))} placeholder="Opcional" />
              </div>

              <div className="space-y-2">
                <Label>Valoración</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setForm(f => ({ ...f, rating: f.rating === n ? null : n }))}>
                      <Star className={`h-7 w-7 ${(form.rating ?? 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Comentarios</Label>
                <textarea value={form.feedback} onChange={e => setForm(f => ({ ...f, feedback: e.target.value }))}
                  placeholder="¿Cómo salió? ¿Algo que cambiarías?"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none" />
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 sticky bottom-0 bg-background">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !form.recipe_id}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editing ? 'Guardar cambios' : 'Registrar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}