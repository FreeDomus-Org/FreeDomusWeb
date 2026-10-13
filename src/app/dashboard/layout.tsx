import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('workspace_id')?.value

  if (!workspaceId) redirect('/select')

  return (
    <div className="flex h-screen gap-4 overflow-hidden bg-canvas p-0 md:p-4">
      <Sidebar user={user} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-4 px-4 pt-16 pb-6 md:px-0 md:pt-0 md:pb-2">
          {children}
        </div>
      </main>
    </div>
  )
}
