'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchMyWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace, fetchMembers, removeMember, inviteMember } from '@/lib/services/workspace'
import type { Workspace, WorkspaceMember } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Edit2, X, Users, Crown, UserMinus, Loader2, Mail } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = { owner: 'Propietario', admin: 'Admin', member: 'Miembro' }
const ROLE_COLORS: Record<string, string> = { owner: 'bg-amber-100 text-amber-700', admin: 'bg-blue-100 text-blue-700', member: 'bg-gray-100 text-gray-700' }
const ICONS = ['🏠', '🍳', '🌿', '⭐', '🦁', '🌈', '🔑', '🏡', '🍀', '🎯']

export default function WorkspacePage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selected, setSelected] = useState<Workspace | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editing, setEditing] = useState<Workspace | null>(null)
  const [wsName, setWsName] = useState('')
  const [wsIcon, setWsIcon] = useState('🏠')
  const [saving, setSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    try { setWorkspaces(await fetchMyWorkspaces(uid)) } finally { setLoading(false) }
  }, [])

  const loadMembers = useCallback(async (wsId: string) => {
    setMembersLoading(true)
    try { setMembers(await fetchMembers(wsId)) } finally { setMembersLoading(false) }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (uid) { setUserId(uid); load(uid) }
    })
  }, [load])

  useEffect(() => {
    if (selected) loadMembers(selected.id)
  }, [selected, loadMembers])

  function openCreate() {
    setEditing(null); setWsName(''); setWsIcon('🏠'); setShowCreateForm(true)
  }

  function openEdit(ws: Workspace) {
    setEditing(ws); setWsName(ws.name); setWsIcon(ws.icon ?? '🏠'); setShowCreateForm(true)
  }

  async function handleSaveWorkspace() {
    if (!wsName.trim() || !userId) return
    setSaving(true)
    try {
      if (editing) {
        const updated = await updateWorkspace(editing.id, { name: wsName.trim(), icon: wsIcon })
        setWorkspaces(prev => prev.map(w => w.id === editing.id ? { ...w, ...updated } : w))
        if (selected?.id === editing.id) setSelected(prev => prev ? { ...prev, name: wsName.trim(), icon: wsIcon } : null)
      } else {
        const slug = wsName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        const ws = await createWorkspace({ name: wsName.trim(), slug, icon: wsIcon, owner_id: userId })
        setWorkspaces(prev => [...prev, ws])
      }
      setShowCreateForm(false)
    } finally { setSaving(false) }
  }

  async function handleDeleteWorkspace(ws: Workspace) {
    if (!confirm(`¿Eliminar el workspace "${ws.name}"? Se perderán todos los datos asociados.`)) return
    await deleteWorkspace(ws.id)
    setWorkspaces(prev => prev.filter(w => w.id !== ws.id))
    if (selected?.id === ws.id) setSelected(null)
  }

  async function handleRemoveMember(member: WorkspaceMember) {
    if (!selected || !confirm('¿Eliminar este miembro del workspace?')) return
    await removeMember(selected.id, member.user_id)
    setMembers(prev => prev.filter(m => m.id !== member.id))
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !inviteEmail.trim()) return
    setInviting(true); setInviteError(null); setInviteSuccess(false)
    try {
      await inviteMember(selected.id, inviteEmail.trim(), 'member')
      setInviteSuccess(true); setInviteEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Error al enviar la invitación')
    } finally { setInviting(false) }
  }

  const isOwner = userId && selected && workspaces.find(w => w.id === selected.id)?.owner_id === userId

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workspace</h1>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo workspace</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : workspaces.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-2">🏠</p>
          <p>No tienes ningún workspace aún.</p>
          <Button className="mt-4" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Crear workspace</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workspace list */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Mis workspaces</h2>
            {workspaces.map(ws => (
              <button key={ws.id} onClick={() => setSelected(ws)}
                className={`w-full text-left rounded-xl border p-4 transition-all ${selected?.id === ws.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl">{ws.icon ?? '🏠'}</span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{ws.name}</p>
                      <p className="text-xs text-muted-foreground">{ws.owner_id === userId ? 'Propietario' : 'Miembro'}</p>
                    </div>
                  </div>
                  {ws.owner_id === userId && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={e => { e.stopPropagation(); openEdit(ws) }} className="p-1 rounded hover:bg-muted"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={e => { e.stopPropagation(); handleDeleteWorkspace(ws) }} className="p-1 rounded hover:bg-muted text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Members panel */}
          {selected && (
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4" />
                    Miembros de {selected.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {membersLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : members.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin miembros cargados.</p>
                  ) : (
                    members.map(member => (
                      <div key={member.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                            {(member.email ?? member.user_id).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{member.full_name ?? member.email ?? member.user_id}</p>
                            {member.email && member.full_name && <p className="text-xs text-muted-foreground truncate">{member.email}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role]}`}>
                            {member.role === 'owner' && <Crown className="h-3 w-3 inline mr-0.5" />}
                            {ROLE_LABELS[member.role]}
                          </span>
                          {isOwner && member.user_id !== userId && (
                            <button onClick={() => handleRemoveMember(member)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Invite */}
              {isOwner && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Invitar miembro</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleInvite} className="flex gap-2">
                      <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@ejemplo.com" className="flex-1" />
                      <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                        {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Invitar'}
                      </Button>
                    </form>
                    {inviteError && <p className="text-sm text-destructive mt-2">{inviteError}</p>}
                    {inviteSuccess && <p className="text-sm text-green-600 mt-2">Invitación enviada correctamente.</p>}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Workspace Form */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">{editing ? 'Editar workspace' : 'Nuevo workspace'}</h2>
              <button onClick={() => setShowCreateForm(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <Label>Nombre *</Label>
                <Input value={wsName} onChange={e => setWsName(e.target.value)} placeholder="Mi hogar" autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Icono</Label>
                <div className="flex flex-wrap gap-2">
                  {ICONS.map(icon => (
                    <button key={icon} type="button" onClick={() => setWsIcon(icon)}
                      className={`text-2xl p-1.5 rounded-lg border-2 transition-colors ${wsIcon === icon ? 'border-primary bg-primary/10' : 'border-transparent hover:border-muted'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSaveWorkspace} disabled={saving || !wsName.trim()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editing ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}