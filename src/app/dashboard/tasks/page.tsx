'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchTasks, createTask, updateTask, updateTaskStatus, deleteTask } from '@/lib/services/tasks'
import type { HouseholdTask, HouseholdTaskCreate, TaskStatus, TaskCategory, TaskPriority } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, Chip, ChipRow, Field, NativeSelect, TextArea, IconAction, SidePanel, EmptyState, LoadingState, StatTile } from '@/components/ui/freedomus'
import { Plus, Trash2, Edit2, Loader2, Circle, Clock, CheckCircle2, CalendarDays, Timer } from 'lucide-react'

const CATEGORIES: { key: TaskCategory; label: string; color: string }[] = [
  { key: 'limpieza', label: 'Limpieza', color: 'bg-coral text-coral-ink' },
  { key: 'cocina', label: 'Cocina', color: 'bg-peach text-peach-ink' },
  { key: 'compras', label: 'Compras', color: 'bg-sky text-sky-ink' },
  { key: 'mantenimiento', label: 'Mantenimiento', color: 'bg-lilac text-lilac-ink' },
  { key: 'jardineria', label: 'Jardinería', color: 'bg-lime text-lime-ink' },
  { key: 'otro', label: 'Otro', color: 'bg-stone text-stone-ink' },
]

const PRIORITIES: { key: TaskPriority; label: string; color: string }[] = [
  { key: 'baja', label: 'Baja', color: 'bg-mint text-mint-ink' },
  { key: 'media', label: 'Media', color: 'bg-butter text-butter-ink' },
  { key: 'alta', label: 'Alta', color: 'bg-danger-soft text-danger' },
]

const STATUSES: { key: TaskStatus; label: string; Icon: React.ElementType; color: string }[] = [
  { key: 'pendiente', label: 'Pendiente', Icon: Circle, color: 'bg-sage text-ink-5' },
  { key: 'en_progreso', label: 'En progreso', Icon: Clock, color: 'bg-sky text-sky-ink' },
  { key: 'completada', label: 'Completada', Icon: CheckCircle2, color: 'bg-lime text-lime-ink' },
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
    <div className="flex flex-1 flex-col gap-4.5">
      <PageHeader title="Tareas del hogar">
        <Button onClick={openAdd} size="sm"><Plus className="stroke-[2.4]" /> Nueva tarea</Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid max-w-140 grid-cols-3 gap-3">
        <StatTile value={pending} label="Pendientes" />
        <StatTile value={inProgress} label="En progreso" tone="sky" />
        <StatTile value={completed} label="Completadas" tone="lime" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2">
        <ChipRow>
          <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>Todos</Chip>
          {STATUSES.map(({ key, label }) => (
            <Chip key={key} active={statusFilter === key} onClick={() => setStatusFilter(key)}>{label}</Chip>
          ))}
        </ChipRow>
        <ChipRow>
          <Chip className="px-3 py-1 text-xs" active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>Todas</Chip>
          {CATEGORIES.map(({ key, label }) => (
            <Chip key={key} className="px-3 py-1 text-xs" active={categoryFilter === key} onClick={() => setCategoryFilter(key)}>{label}</Chip>
          ))}
        </ChipRow>
      </div>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState>No hay tareas.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(task => {
            const statusInfo = STATUSES.find(s => s.key === task.status)!
            const catInfo = CATEGORIES.find(c => c.key === task.category)!
            const priorityInfo = PRIORITIES.find(p => p.key === task.priority)!
            const done = task.status === 'completada'
            return (
              <div key={task.id} className={`flex items-center gap-4 rounded-3xl bg-card py-4 pr-5 pl-4 shadow-card transition-opacity ${done ? 'opacity-60' : ''}`}>
                <button onClick={() => handleToggleStatus(task)} title={`Estado: ${statusInfo.label}`}
                  className={`grid size-12 shrink-0 cursor-pointer place-items-center rounded-[16px] ${statusInfo.color}`}>
                  <statusInfo.Icon className="size-5" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className={`font-display text-lg font-bold ${done ? 'text-ink-5 line-through' : ''}`}>{task.title}</p>
                  {task.description && <p className="text-[13px] text-ink-5">{task.description}</p>}
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${catInfo.color}`}>{catInfo.label}</span>
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${priorityInfo.color}`}>{priorityInfo.label}</span>
                    {task.due_date && <span className="flex items-center gap-1 rounded-full bg-sage px-2.5 py-0.5 text-ink-2"><CalendarDays className="size-3" />{new Date(task.due_date).toLocaleDateString('es-ES')}</span>}
                    {task.scheduled_date && <span className="flex items-center gap-1 rounded-full bg-sage px-2.5 py-0.5 text-ink-2"><Clock className="size-3" />{new Date(task.scheduled_date).toLocaleDateString('es-ES')}{task.scheduled_time ? ` ${task.scheduled_time}` : ''}</span>}
                    {task.estimated_minutes && <span className="flex items-center gap-1 rounded-full bg-sage px-2.5 py-0.5 text-ink-2"><Timer className="size-3" />{task.estimated_minutes}m</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <IconAction size="lg" onClick={() => openEdit(task)} aria-label="Editar"><Edit2 /></IconAction>
                  <IconAction size="lg" tone="danger" onClick={() => handleDelete(task.id)} aria-label="Eliminar"><Trash2 /></IconAction>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <SidePanel
          eyebrow="Tareas"
          title={editing ? 'Editar tarea' : 'Nueva tarea'}
          onClose={() => setShowForm(false)}
          footer={<>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="lg" className="flex-[1.2]" onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear tarea'}
            </Button>
          </>}
        >
          <Field label="Título *">
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Nombre de la tarea" />
          </Field>
          <Field label="Descripción">
            <TextArea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="min-h-20" placeholder="Opcional" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <NativeSelect value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as TaskCategory }))}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Prioridad">
              <NativeSelect value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}>
                {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </NativeSelect>
            </Field>
          </div>
          {editing && (
            <Field label="Estado">
              <NativeSelect value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))}>
                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </NativeSelect>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha límite">
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </Field>
            <Field label="Fecha programada">
              <Input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
            </Field>
            <Field label="Hora programada">
              <Input type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} />
            </Field>
            <Field label="Duración estimada (min)">
              <Input type="number" min={0} value={form.estimated_minutes ?? ''} onChange={e => setForm(f => ({ ...f, estimated_minutes: +e.target.value || null }))} />
            </Field>
          </div>
        </SidePanel>
      )}
    </div>
  )
}
