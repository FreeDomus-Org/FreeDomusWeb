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
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 pt-16 md:pt-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
