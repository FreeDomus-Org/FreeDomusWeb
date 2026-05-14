'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchTasks, createTask, updateTask, updateTaskStatus, deleteTask } from '@/lib/services/tasks'
import type { HouseholdTask, HouseholdTaskCreate, TaskStatus, TaskCategory, TaskPriority } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Trash2, Edit2, X, ChevronDown, Loader2, Circle, Clock, CheckCircle2 } from 'lucide-react'

const CATEGORIES: { key: TaskCategory; label: string; color: string }[] = [
  { key: 'limpieza', label: 'Limpieza', color: 'text-red-500' },
  { key: 'cocina', label: 'Cocina', color: 'text-orange-500' },
  { key: 'compras', label: 'Compras', color: 'text-blue-500' },
  { key: 'mantenimiento', label: 'Mantenimiento', color: 'text-purple-500' },
  { key: 'jardineria', label: 'Jardinería', color: 'text-green-500' },
  { key: 'otro', label: 'Otro', color: 'text-gray-500' },
]

const PRIORITIES: { key: TaskPriority; label: string; color: string }[] = [
  { key: 'baja', label: 'Baja', color: 'text-green-500' },
  { key: 'media', label: 'Media', color: 'text-amber-500' },
  { key: 'alta', label: 'Alta', color: 'text-red-500' },
]

const STATUSES: { key: TaskStatus; label: string; Icon: React.ElementType; color: string }[] = [
  { key: 'pendiente', label: 'Pendiente', Icon: Circle, color: 'text-muted-foreground' },
  { key: 'en_progreso', label: 'En progreso', Icon: Clock, color: 'text-blue-500' },
  { key: 'completada', label: 'Completada', Icon: CheckCircle2, color: 'text-green-500' },
]

function nextStatus(s: TaskStatus): TaskStatus {
  const order: TaskStatus[] = ['pendiente', 'en_progreso', 'completada']
  return order[(order.indexOf(s) + 1) % order.length]
}

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'otro' as TaskCategory,
  priority: 'media' as TaskPriority,
  status: 'pendiente' as TaskStatus,
  assigned_to: null as string | null,
  due_date: '',
  scheduled_date: '',
  scheduled_time: '',
  estimated_minutes: null as number | null,
}

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<HouseholdTask[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<HouseholdTask | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    try { setTasks(await fetchTasks(uid)) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (uid) { setUserId(uid); load(uid) }
    })
  }, [load])

  const filtered = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    return true
  })

  const pending = tasks.filter(t => t.status === 'pendiente').length
  const inProgress = tasks.filter(t => t.status === 'en_progreso').length
  const completed = tasks.filter(t => t.status === 'completada').length

  function openAdd() {
    setEditing(null); setForm(EMPTY_FORM); setShowForm(true)
  }

  function openEdit(t: HouseholdTask) {
    setEditing(t)
    setForm({
      title: t.title,
      description: t.description ?? '',
      category: t.category,
      priority: t.priority,
      status: t.status,
      assigned_to: t.assigned_to,
      due_date: t.due_date ?? '',
      scheduled_date: t.scheduled_date ?? '',
      scheduled_time: t.scheduled_time ?? '',
      estimated_minutes: t.estimated_minutes,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title.trim() || !userId) return
    setSaving(true)
    try {
      const payload: HouseholdTaskCreate = {
        user_id: userId,
        workspace_id: null,
        title: form.title,
        description: form.description || null,
        category: form.category,
        priority: form.priority,
        status: form.status,
        assigned_to: form.assigned_to,
        due_date: form.due_date || null,
        scheduled_date: form.scheduled_date || null,
        scheduled_time: form.scheduled_time || null,
        estimated_minutes: form.estimated_minutes,
      }
      if (editing) await updateTask(editing.id, payload)
      else await createTask(payload)
      await load(userId)
      setShowForm(false)
    } finally { setSaving(false) }
  }

  async function handleToggleStatus(task: HouseholdTask) {
    const next = nextStatus(task.status)
    await updateTaskStatus(task.id, next)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
  }

  async function handleDelete(id: string) {
    if (!userId || !confirm('¿Eliminar esta tarea?')) return
    await deleteTask(id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tareas del hogar</h1>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva tarea</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pendientes', count: pending, color: 'text-muted-foreground' },
          { label: 'En progreso', count: inProgress, color: 'text-blue-500' },
          { label: 'Completadas', count: completed, color: 'text-green-500' },
        ].map(({ label, count, color }) => (
          <Card key={label}><CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${statusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            Todos
          </button>
          {STATUSES.map(({ key, label }) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${statusFilter === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCategoryFilter('all')}
            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${categoryFilter === 'all' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            Todas
          </button>
          {CATEGORIES.map(({ key, label }) => (
            <button key={key} onClick={() => setCategoryFilter(key)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${categoryFilter === key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><p className="text-4xl mb-2">✅</p><p>No hay tareas.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const statusInfo = STATUSES.find(s => s.key === task.status)!
            const catInfo = CATEGORIES.find(c => c.key === task.category)!
            const priorityInfo = PRIORITIES.find(p => p.key === task.priority)!
            return (
              <Card key={task.id} className={`hover:shadow-sm transition-shadow ${task.status === 'completada' ? 'opacity-60' : ''}`}>
                <CardContent className="p-4 flex items-start gap-3">
                  <button onClick={() => handleToggleStatus(task)} className="mt-0.5 shrink-0">
                    <statusInfo.Icon className={`h-5 w-5 ${statusInfo.color}`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${task.status === 'completada' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                    {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                      <span className={`font-medium ${catInfo.color}`}>{catInfo.label}</span>
                      <span className={`font-medium ${priorityInfo.color}`}>{priorityInfo.label}</span>
                      {task.due_date && <span className="text-muted-foreground">📅 {new Date(task.due_date).toLocaleDateString('es-ES')}</span>}
                      {task.scheduled_date && <span className="text-muted-foreground">🕐 {new Date(task.scheduled_date).toLocaleDateString('es-ES')}{task.scheduled_time ? ` ${task.scheduled_time}` : ''}</span>}
                      {task.estimated_minutes && <span className="text-muted-foreground">⏱ {task.estimated_minutes}m</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(task)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(task.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
          <div className="w-full max-w-md bg-background h-full overflow-y-auto shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
              <h2 className="font-semibold text-lg">{editing ? 'Editar tarea' : 'Nueva tarea'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <div className="space-y-1">
                <Label>Título *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Nombre de la tarea" />
              </div>
              <div className="space-y-1">
                <Label>Descripción</Label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[70px] resize-none" placeholder="Opcional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <div className="relative">
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as TaskCategory }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8">
                      {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Prioridad</Label>
                  <div className="relative">
                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8">
                      {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>
              {editing && (
                <div className="space-y-1">
                  <Label>Estado</Label>
                  <div className="relative">
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8">
                      {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fecha límite</Label>
                  <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Fecha programada</Label>
                  <Input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Hora programada</Label>
                  <Input type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Duración estimada (min)</Label>
                  <Input type="number" min={0} value={form.estimated_minutes ?? ''} onChange={e => setForm(f => ({ ...f, estimated_minutes: +e.target.value || null }))} />
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 sticky bottom-0 bg-background">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !form.title.trim()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editing ? 'Guardar cambios' : 'Crear tarea'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}