// Espacio de trabajo seleccionado (cookie que fija la pantalla /select). Solo en el navegador.
export function currentWorkspaceId(): string | null {
  if (typeof document === 'undefined') return null
  return document.cookie.match(/workspace_id=([^;]+)/)?.[1] ?? null
}

// Filtro PostgREST: filas del espacio de trabajo más las personales del usuario
export function workspaceScope(userId: string, workspaceId: string): string {
  return `workspace_id.eq.${workspaceId},and(user_id.eq.${userId},workspace_id.is.null)`
}
