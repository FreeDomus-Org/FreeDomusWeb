'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchHistory, fetchTopRated, createHistoryEntry, updateHistoryEntry, deleteHistoryEntry } from '@/lib/services/history'
import { fetchRecipes } from '@/lib/services/recipes'
import type { CookingHistory, CookingHistoryCreate, Recipe } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, Chip, SearchField, Field, NativeSelect, TextArea, IconAction, SidePanel, EmptyState, LoadingState, Stars } from '@/components/ui/freedomus'
import { Plus, Star, Trash2, Edit2, Loader2, TrendingUp, Clock } from 'lucide-react'

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

// Fecha (YYYY-MM-DD) y hora (HH:MM) en hora local, para los inputs date/time
const pad = (n: number) => String(n).padStart(2, '0')
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

const EMPTY_FORM = {
  recipe_id: '',
  cooked_at: '',
  cooked_time: '',
  servings: 2 as string | number,
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
      const wsId = document.cookie.match(/workspace_id=([^;]+)/)?.[1] ?? null
      const [histData, recipeData] = await Promise.all([
        mode === 'top' ? fetchTopRated(uid) : fetchHistory(uid, wsId),
        fetchRecipes(uid, wsId),
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
  const totalMinutes = history.reduce((s, h) => s + (h.actual_time_minutes ?? 0), 0)

  function openAdd() {
    const now = new Date()
    setEditing(null); setForm({ ...EMPTY_FORM, cooked_at: toDateInput(now), cooked_time: toTimeInput(now) }); setShowForm(true)
  }

  function openEdit(h: CookingHistory) {
    setEditing(h)
    setForm({
      recipe_id: h.recipe_id,
      cooked_at: toDateInput(new Date(h.cooked_at)),
      cooked_time: toTimeInput(new Date(h.cooked_at)),
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
        // Fecha + hora locales (sin hora, mediodía) para que la zona horaria no cambie el día
        cooked_at: new Date(`${form.cooked_at}T${form.cooked_time || '12:00'}`).toISOString(),
        servings: Number(form.servings) || null,
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
    <div className="flex flex-1 flex-col gap-[18px]">
      <PageHeader title="Historial de cocina">
        <Button onClick={openAdd} size="sm"><Plus className="stroke-[2.4]" /> Registrar</Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex min-h-[150px] flex-col justify-between gap-[18px] rounded-[28px] bg-lime px-6 py-[22px] text-lime-ink">
          <p className="flex items-center gap-2 font-mono text-xs tracking-[0.08em]"><Star className="size-4 fill-current" />VALORACIÓN MEDIA</p>
          <p className="flex items-baseline gap-2 text-forest">
            <span className="font-display text-[56px] leading-none font-extrabold tracking-[-0.03em]">{avgRating != null ? avgRating.toFixed(1) : '–'}</span>
            <span className="text-sm text-lime-ink">de 5</span>
          </p>
        </div>
        <div className="relative flex min-h-[150px] flex-col justify-between gap-[18px] overflow-hidden rounded-[28px] bg-forest px-6 py-[22px] text-[#f3f7ec]">
          <div className="stripes absolute -top-[30px] -right-[30px] size-[150px] rounded-full" />
          <p className="relative flex items-center gap-2 font-mono text-xs tracking-[0.08em] text-lime"><TrendingUp className="size-4" />MÁS COCINADA</p>
          <p className="relative min-w-0 font-display text-[clamp(22px,2.4vw,32px)] leading-[1.05] font-extrabold tracking-[-0.02em] [overflow-wrap:anywhere]">{topRecipe?.recipe?.name ?? '–'}</p>
        </div>
        <div className="flex min-h-[150px] flex-col justify-between gap-[18px] rounded-[28px] bg-card px-6 py-[22px] shadow-card">
          <p className="flex items-center gap-2 font-mono text-xs tracking-[0.08em] text-leaf"><Clock className="size-4" />VECES COCINADAS</p>
          <p className="flex items-baseline gap-2">
            <span className="font-display text-[56px] leading-none font-extrabold tracking-[-0.03em]">{history.length}</span>
            <span className="text-sm text-ink-5">{totalMinutes} min en total</span>
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex gap-1.5">
          {(['all', 'top'] as const).map(f => (
            <Chip key={f} active={filter === f} onClick={() => switchFilter(f)} className="px-4 py-[7px]">
              {f === 'all' ? 'Todas' : 'Top valoradas'}
            </Chip>
          ))}
        </div>
        <SearchField className="w-[320px]" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por receta..." />
      </div>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState>No hay registros aún.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(entry => {
            const date = new Date(entry.cooked_at)
            return (
              <div key={entry.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl bg-card py-4 pr-5 pl-4 shadow-card">
                <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-[18px] bg-canvas leading-none">
                  <span className="font-display text-2xl font-extrabold">{date.getDate()}</span>
                  <span className="mt-1 text-[11px] font-semibold tracking-[0.1em] text-leaf">{MONTHS[date.getMonth()]}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <h3 className="truncate font-display text-xl font-bold">{entry.recipe?.name ?? '—'}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                    <span className="rounded-full bg-sage px-2.5 py-0.5">{date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="flex items-center gap-1 rounded-full bg-sage px-2.5 py-0.5"><Clock className="size-3" />{toTimeInput(date)}</span>
                    {entry.servings && <span className="rounded-full bg-sage px-2.5 py-0.5">{entry.servings} porciones</span>}
                    {entry.actual_time_minutes && <span className="rounded-full bg-sage px-2.5 py-0.5">{entry.actual_time_minutes} min</span>}
                  </div>
                  {entry.feedback && <p className="text-xs text-ink-5 italic">&ldquo;{entry.feedback}&rdquo;</p>}
                </div>
                {entry.rating ? <Stars value={entry.rating} /> : <span className="text-xs text-ink-5">Sin valorar</span>}
                <div className="flex gap-2">
                  <IconAction size="lg" onClick={() => openEdit(entry)} aria-label="Editar"><Edit2 /></IconAction>
                  <IconAction size="lg" tone="danger" onClick={() => handleDelete(entry.id)} aria-label="Eliminar"><Trash2 /></IconAction>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <SidePanel
          eyebrow="Historial"
          title={editing ? 'Editar registro' : 'Registrar cocción'}
          onClose={() => setShowForm(false)}
          footer={<>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="lg" className="flex-[1.2]" onClick={handleSave} disabled={saving || !form.recipe_id}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? 'Guardar cambios' : 'Registrar'}
            </Button>
          </>}
        >
          <Field label="Receta *">
            <NativeSelect value={form.recipe_id} onChange={e => setForm(f => ({ ...f, recipe_id: e.target.value }))}>
              <option value="">— Selecciona una receta —</option>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </NativeSelect>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha cocinada">
              <Input type="date" value={form.cooked_at} onChange={e => setForm(f => ({ ...f, cooked_at: e.target.value }))} />
            </Field>
            <Field label="Hora">
              <Input type="time" value={form.cooked_time} onChange={e => setForm(f => ({ ...f, cooked_time: e.target.value }))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Porciones">
              <Input type="number" min={1} value={form.servings} onChange={e => setForm(f => ({ ...f, servings: e.target.value }))} placeholder="0" />
            </Field>
            <Field label="Tiempo real (min)">
              <Input type="number" min={0} value={form.actual_time_minutes ?? ''} onChange={e => setForm(f => ({ ...f, actual_time_minutes: +e.target.value || null }))} placeholder="Opcional" />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Valoración</Label>
            <Stars size={30} value={form.rating} onChange={rating => setForm(f => ({ ...f, rating }))} />
          </div>

          <Field label="Comentarios">
            <TextArea value={form.feedback} onChange={e => setForm(f => ({ ...f, feedback: e.target.value }))}
              placeholder="¿Cómo salió? ¿Algo que cambiarías?" />
          </Field>
        </SidePanel>
      )}
    </div>
  )
}
