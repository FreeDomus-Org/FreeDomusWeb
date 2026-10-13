import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { selectWorkspaceAction } from '@/app/actions/workspace'

interface PendingInvite {
  token: string
  role: string
  workspace_id: string
  workspace_name: string
  workspace_icon: string | null
}

export default async function SelectWorkspacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace:workspaces(*)')
    .eq('user_id', user!.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invitations } = await supabase.rpc('my_pending_invitations')
  const pendingInvites: PendingInvite[] = invitations ?? []

  const workspaces = (memberships?.map((m: any) => m.workspace) ?? []).filter(Boolean)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
      {/* Logo */}
      <div className="mb-12 flex items-center gap-3 font-display text-2xl font-extrabold">
        <div className="grid size-11 place-items-center rounded-full bg-lime">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#17251c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        </div>
        FreeDomus
      </div>

      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="mb-2 font-display text-[32px] font-extrabold tracking-[-0.02em] sm:text-[40px]">¿A qué hogar entras hoy?</h1>
          <p className="text-muted-foreground text-sm">Selecciona un espacio de trabajo para continuar</p>
        </div>

        {pendingInvites.length > 0 && (
          <div className="mb-6 space-y-3">
            <p className="text-sm font-semibold text-ink-5">Invitaciones pendientes</p>
            {pendingInvites.map((inv) => (
              <Link
                key={inv.token}
                href={`/invite?token=${inv.token}`}
                className="group flex w-full items-center gap-4 rounded-3xl border-2 border-lime bg-card p-5 text-left shadow-card transition-all duration-200 hover:bg-forest hover:text-[#f3f7ec]"
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-lime text-3xl">{inv.workspace_icon ?? '🏠'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-xl font-bold">{inv.workspace_name}</p>
                  <Badge variant="secondary" className="mt-1 text-xs">✉️ Te invitaron · Toca para unirte</Badge>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-5 transition-colors group-hover:text-lime" />
              </Link>
            ))}
          </div>
        )}

        {workspaces.length === 0 && pendingInvites.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-[#b9c5b5] py-20 text-center">
            <div className="text-5xl mb-4">🏡</div>
            <h2 className="mb-1 font-display text-xl font-bold">Aún no tienes ningún hogar</h2>
            <p className="text-sm text-muted-foreground mb-6">Crea tu primer espacio de trabajo para empezar</p>
            <Link href="/dashboard/workspace" className={buttonVariants()}>
              <Plus className="h-4 w-4 mr-2" />
              Crear espacio de trabajo
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map((ws: any) => (
              <form key={ws.id} action={selectWorkspaceAction.bind(null, ws.id)}>
                <button
                  type="submit"
                  className="group flex w-full cursor-pointer items-center gap-4 rounded-3xl bg-card p-5 text-left shadow-card transition-all duration-200 hover:bg-forest hover:text-[#f3f7ec]"
                >
                  <span className="grid size-14 shrink-0 place-items-center rounded-full bg-lime text-3xl">{ws.icon ?? '🏠'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-xl font-bold">{ws.name}</p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {ws.owner_id === user!.id ? '👑 Propietario' : '👥 Miembro'}
                    </Badge>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-5 transition-colors group-hover:text-lime" />
                </button>
              </form>
            ))}

            <Link
              href="/dashboard/workspace"
              className="flex items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-[#b9c5b5] p-5 text-ink-5 transition-all duration-200 hover:border-forest hover:text-forest"
            >
              <Plus className="h-5 w-5" />
              <span className="text-sm font-medium">Crear nuevo espacio de trabajo</span>
            </Link>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">{user?.email}</p>
      </div>
    </div>
  )
}
