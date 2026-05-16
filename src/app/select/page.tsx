import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { selectWorkspaceAction } from '@/app/actions/workspace'

export default async function SelectWorkspacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace:workspaces(*)')
    .eq('user_id', user!.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspaces = (memberships?.map((m: any) => m.workspace) ?? []).filter(Boolean)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-12">
        <span className="text-4xl">🏠</span>
        <span className="text-2xl font-bold tracking-tight">FreeDomus</span>
      </div>

      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">¿A qué hogar entras hoy?</h1>
          <p className="text-muted-foreground text-sm">Selecciona un workspace para continuar</p>
        </div>

        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-2xl text-center">
            <div className="text-5xl mb-4">🏡</div>
            <h2 className="text-lg font-semibold mb-1">Aún no tienes ningún hogar</h2>
            <p className="text-sm text-muted-foreground mb-6">Crea tu primer workspace para empezar</p>
            <Link href="/dashboard/workspace" className={buttonVariants()}>
              <Plus className="h-4 w-4 mr-2" />
              Crear workspace
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map((ws: any) => (
              <form key={ws.id} action={selectWorkspaceAction.bind(null, ws.id)}>
                <button
                  type="submit"
                  className="group w-full text-left flex items-center gap-4 rounded-2xl border bg-card hover:border-primary hover:shadow-md transition-all duration-200 p-5"
                >
                  <span className="text-4xl shrink-0">{ws.icon ?? '🏠'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base">{ws.name}</p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {ws.owner_id === user!.id ? '👑 Propietario' : '👥 Miembro'}
                    </Badge>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </button>
              </form>
            ))}

            <Link
              href="/dashboard/workspace"
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-muted-foreground hover:border-primary hover:text-primary transition-all duration-200"
            >
              <Plus className="h-5 w-5" />
              <span className="text-sm font-medium">Crear nuevo workspace</span>
            </Link>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">{user?.email}</p>
      </div>
    </div>
  )
}
