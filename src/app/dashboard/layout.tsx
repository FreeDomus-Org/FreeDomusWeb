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
    <div className="flex h-dvh gap-4 overflow-hidden bg-canvas p-0 lg:p-4">
      <Sidebar user={user} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-4 px-4 pt-[calc(4.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-0 lg:pt-0 lg:pb-2">
          {children}
        </div>
      </main>
    </div>
  )
}
