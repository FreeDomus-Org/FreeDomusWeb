'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchMyWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace, fetchMembers, removeMember, inviteMember, fetchInvitations, deleteInvitation, resendInvitation } from '@/lib/services/workspace'
import type { Workspace, WorkspaceMember, WorkspaceInvitation } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, Eyebrow, Field, IconAction, CenterModal, EmptyState, LoadingState } from '@/components/ui/freedomus'
import { Plus, Trash2, Edit2, Users, Crown, UserMinus, Loader2, Mail, Send } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = { owner: 'Propietario', admin: 'Admin', member: 'Miembro' }
const ROLE_COLORS: Record<string, string> = { owner: 'bg-butter text-butter-ink', admin: 'bg-sky text-sky-ink', member: 'bg-stone text-stone-ink' }

function Panel({ icon: Icon, title, children }: { icon: React.ElementType; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-card p-[22px] shadow-card">
      <h2 className="flex items-center gap-2.5 font-display text-[19px] font-bold"><Icon className="size-[18px] stroke-[1.9]" />{title}</h2>
      {children}
    </section>
  )
}
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
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [invitationsError, setInvitationsError] = useState<string | null>(null)
  const [busyInvitation, setBusyInvitation] = useState<string | null>(null)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    try { setWorkspaces(await fetchMyWorkspaces(uid)) } finally { setLoading(false) }
  }, [])

  const loadMembers = useCallback(async (wsId: string) => {
    setMembersLoading(true)
    try { setMembers(await fetchMembers(wsId)) } finally { setMembersLoading(false) }
  }, [])

  const loadInvitations = useCallback(async (wsId: string) => {
    try {
      setInvitations(await fetchInvitations(wsId))
      setInvitationsError(null)
    } catch (err) {
      console.error('fetchInvitations failed', err)
      setInvitationsError(err instanceof Error ? err.message : 'No se pudieron cargar las invitaciones')
    }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (uid) { setUserId(uid); load(uid) }
    })
  }, [load])

  useEffect(() => {
    if (selected) { loadMembers(selected.id); loadInvitations(selected.id) }
  }, [selected, loadMembers, loadInvitations])

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
    if (!confirm(`¿Eliminar el espacio de trabajo "${ws.name}"? Se perderán todos los datos asociados.`)) return
    await deleteWorkspace(ws.id)
    setWorkspaces(prev => prev.filter(w => w.id !== ws.id))
    if (selected?.id === ws.id) setSelected(null)
  }

  async function handleRemoveMember(member: WorkspaceMember) {
    if (!selected || !confirm('¿Eliminar este miembro del espacio de trabajo?')) return
    await removeMember(selected.id, member.user_id)
    setMembers(prev => prev.filter(m => m.id !== member.id))
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !inviteEmail.trim()) return
    setInviting(true); setInviteError(null); setInviteSuccess(false)
    try {
      const email = inviteEmail.trim()
      const sent = await inviteMember(selected.id, email, 'member')
      setInviteSuccess(true); setInviteEmail('')
      // Show it right away, then sync with the DB
      setInvitations(prev => [{
        id: sent.invitation_id, workspace_id: selected.id, invited_by: userId ?? '', invited_email: email,
        role: 'member', token: '', status: 'pending', expires_at: sent.expires_at, created_at: new Date().toISOString(),
      }, ...prev.filter(i => i.id !== sent.invitation_id)])
      loadInvitations(selected.id)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Error al enviar la invitación')
      loadInvitations(selected.id)
    } finally { setInviting(false) }
  }

  async function handleResendInvitation(inv: WorkspaceInvitation) {
    if (!selected) return
    setBusyInvitation(inv.id); setInviteError(null); setInviteSuccess(false)
    try {
      await resendInvitation(inv)
      setInviteSuccess(true)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Error al reenviar la invitación')
    } finally {
      await loadInvitations(selected.id)
      setBusyInvitation(null)
    }
  }

  async function handleDeleteInvitation(inv: WorkspaceInvitation) {
    if (!confirm(`¿Eliminar la invitación enviada a ${inv.invited_email}?`)) return
    setBusyInvitation(inv.id)
    try {
      await deleteInvitation(inv.id)
      setInvitations(prev => prev.filter(i => i.id !== inv.id))
    } finally { setBusyInvitation(null) }
  }

  const isOwner = userId && selected && workspaces.find(w => w.id === selected.id)?.owner_id === userId

  return (
    <div className="flex flex-1 flex-col gap-[18px]">
      <PageHeader title="Espacio de trabajo">
        <Button onClick={openCreate} size="sm"><Plus className="stroke-[2.4]" /> Nuevo espacio de trabajo</Button>
      </PageHeader>

      {loading ? (
        <LoadingState />
      ) : workspaces.length === 0 ? (
        <EmptyState>
          <p>No tienes ningún espacio de trabajo aún.</p>
          <Button className="mt-4" onClick={openCreate}><Plus /> Crear espacio de trabajo</Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
          {/* Workspace list */}
          <section className="flex flex-col gap-3">
            <Eyebrow className="px-1.5">Mis espacios de trabajo</Eyebrow>
            {workspaces.map(ws => {
              const active = selected?.id === ws.id
              return (
                <div key={ws.id} role="button" tabIndex={0} onClick={() => setSelected(ws)}
                  onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelected(ws) } }}
                  className={`flex cursor-pointer items-center gap-3.5 rounded-3xl p-4 shadow-card transition-colors ${active ? 'bg-forest text-[#f3f7ec]' : 'bg-card hover:bg-white/80'}`}>
                  <div className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-xl">{ws.icon ?? '🏠'}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-bold">{ws.name}</p>
                    <p className="mt-px text-[13px] opacity-70">{ws.owner_id === userId ? 'Propietario' : 'Miembro'}</p>
                  </div>
                  {ws.owner_id === userId && (
                    <div className="flex shrink-0 gap-1.5">
                      <button onClick={e => { e.stopPropagation(); openEdit(ws) }} aria-label="Editar"
                        className="grid size-[34px] cursor-pointer place-items-center rounded-full bg-[rgba(127,150,130,.2)]"><Edit2 className="size-[15px]" /></button>
                      <button onClick={e => { e.stopPropagation(); handleDeleteWorkspace(ws) }} aria-label="Eliminar"
                        className="grid size-[34px] cursor-pointer place-items-center rounded-full bg-danger-soft text-danger"><Trash2 className="size-[15px]" /></button>
                    </div>
                  )}
                </div>
              )
            })}
          </section>

          {/* Members panel */}
          {selected ? (
            <div className="flex flex-col gap-4">
              <Panel icon={Users} title={<>Miembros de {selected.name}</>}>
                {membersLoading ? (
                  <LoadingState className="py-4" />
                ) : members.length === 0 ? (
                  <p className="text-sm text-ink-5">Sin miembros cargados.</p>
                ) : (
                  members.map(member => (
                    <div key={member.id} className="flex items-center gap-3.5">
                      <div className="grid size-[38px] shrink-0 place-items-center rounded-full bg-canvas font-display text-sm font-extrabold">
                        {(member.email ?? member.user_id).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-medium">{member.full_name ?? member.email ?? member.user_id}</p>
                        {member.email && member.full_name && <p className="truncate text-xs text-ink-5">{member.email}</p>}
                      </div>
                      <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold ${ROLE_COLORS[member.role]}`}>
                        {member.role === 'owner' && <Crown className="size-3.5" />}
                        {ROLE_LABELS[member.role]}
                      </span>
                      {isOwner && member.user_id !== userId && (
                        <IconAction tone="danger" onClick={() => handleRemoveMember(member)} aria-label="Quitar miembro"><UserMinus /></IconAction>
                      )}
                    </div>
                  ))
                )}
              </Panel>

              {/* Invite */}
              {isOwner && (
                <Panel icon={Mail} title="Invitar miembro">
                  <form onSubmit={handleInvite} className="flex gap-2.5">
                    <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@ejemplo.com" className="flex-1" />
                    <Button type="submit" className="h-11 px-[22px]" disabled={inviting || !inviteEmail.trim()}>
                      {inviting ? <Loader2 className="animate-spin" /> : 'Invitar'}
                    </Button>
                  </form>
                  {inviteError && <p className="text-sm text-danger">{inviteError}</p>}
                  {inviteSuccess && <p className="text-sm font-medium text-leaf">Invitación enviada correctamente.</p>}
                </Panel>
              )}

              {/* Sent invitations */}
              {isOwner && (
                <Panel icon={Send} title="Invitaciones enviadas">
                  {invitationsError && <p className="text-sm text-danger">{invitationsError}</p>}
                  {invitations.length === 0 && !invitationsError ? (
                    <p className="text-sm text-ink-5">Sin invitaciones pendientes.</p>
                  ) : invitations.map(inv => {
                    const expired = new Date(inv.expires_at) < new Date()
                    const busy = busyInvitation === inv.id
                    return (
                      <div key={inv.id} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold">{inv.invited_email}</p>
                          <p className="mt-0.5 text-[13px] text-ink-5">
                            {expired ? 'Expirada' : 'Expira'} el {new Date(inv.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        {expired && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-danger">Expirada</span>}
                        <Button size="sm" variant="outline" className="h-9 px-4" disabled={busy} onClick={() => handleResendInvitation(inv)}>
                          {busy ? <Loader2 className="animate-spin" /> : 'Reenviar'}
                        </Button>
                        <IconAction tone="danger" disabled={busy} onClick={() => handleDeleteInvitation(inv)} title="Eliminar invitación" aria-label="Eliminar invitación">
                          <Trash2 />
                        </IconAction>
                      </div>
                    )
                  })}
                </Panel>
              )}
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center rounded-3xl border-[1.5px] border-dashed border-[#b9c5b5] p-6 text-center text-[15px] text-ink-5">
              Selecciona un espacio de trabajo para ver sus miembros.
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Workspace Form */}
      {showCreateForm && (
        <CenterModal
          eyebrow="Espacio de trabajo"
          title={editing ? 'Editar espacio de trabajo' : 'Nuevo espacio de trabajo'}
          onClose={() => setShowCreateForm(false)}
          footer={<>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowCreateForm(false)}>Cancelar</Button>
            <Button size="lg" className="flex-[1.2]" onClick={handleSaveWorkspace} disabled={saving || !wsName.trim()}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </>}
        >
          <Field label="Nombre *">
            <Input value={wsName} onChange={e => setWsName(e.target.value)} placeholder="Mi hogar" autoFocus />
          </Field>
          <div className="flex flex-col gap-2">
            <Label>Icono</Label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(icon => (
                <button key={icon} type="button" onClick={() => setWsIcon(icon)}
                  className={`grid size-11 cursor-pointer place-items-center rounded-full text-xl transition-colors ${wsIcon === icon ? 'bg-lime ring-2 ring-forest' : 'bg-sage hover:bg-sage-deep'}`}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </CenterModal>
      )}
    </div>
  )
}
