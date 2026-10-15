import type { WorkspaceMember } from '@/types'

// Espacio de trabajo seleccionado (cookie que fija la pantalla /select). Solo en el navegador.
export function currentWorkspaceId(): string | null {
  if (typeof document === 'undefined') return null
  return document.cookie.match(/workspace_id=([^;]+)/)?.[1] ?? null
}

// Filtro PostgREST: filas del espacio de trabajo más las personales del usuario
export function workspaceScope(userId: string, workspaceId: string): string {
  return `workspace_id.eq.${workspaceId},and(user_id.eq.${userId},workspace_id.is.null)`
}

// Nombre corto de un miembro para "Cocinado por …" ("ti" si es el usuario actual)
export function memberLabel(members: WorkspaceMember[], userId: string, me: string | null): string {
  if (userId === me) return 'ti'
  const m = members.find(m => m.user_id === userId)
  return m?.full_name || m?.email?.split('@')[0] || 'otro miembro'
}
