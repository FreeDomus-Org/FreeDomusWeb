'use client'

import { useState, useTransition } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createWorkspace } from '@/lib/services/workspace'
import { selectWorkspaceAction } from '@/app/actions/workspace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const ICONS = ['🏠', '🍳', '🌿', '⭐', '🦁', '🌈', '🔑', '🏡', '🍀', '🎯']

// Crea un espacio desde /select (el dashboard exige tener ya un espacio elegido) y entra a él.
export default function CreateWorkspace({ variant }: { variant: 'primary' | 'dashed' }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🏠')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) throw new Error('Sesión no válida')
      const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const ws = await createWorkspace({ name: name.trim(), slug, icon, owner_id: user.id })
      startTransition(() => { selectWorkspaceAction(ws.id) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el espacio de trabajo')
      setSaving(false)
    }
  }

  if (!open) {
    return variant === 'primary' ? (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Crear espacio de trabajo
      </Button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-[#b9c5b5] p-5 text-ink-5 transition-all duration-200 hover:border-forest hover:text-forest"
      >
        <Plus className="h-5 w-5" />
        <span className="text-sm font-medium">Crear nuevo espacio de trabajo</span>
      </button>
    )
  }

  return (
    <form onSubmit={handleCreate} className="w-full max-w-md space-y-4 rounded-3xl bg-card p-5 text-left shadow-card">
      {error && <div className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</div>}
      <Input autoFocus placeholder="Nombre del hogar" value={name} onChange={(e) => setName(e.target.value)} required />
      <div className="flex flex-wrap gap-2">
        {ICONS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIcon(i)}
            className={`grid size-10 place-items-center rounded-full text-xl ${icon === i ? 'bg-lime ring-2 ring-forest' : 'bg-sage'}`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Crear
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
      </div>
    </form>
  )
}
