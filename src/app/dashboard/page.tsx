import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { Users } from 'lucide-react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/freedomus'
import { clearWorkspaceAction } from '@/app/actions/workspace'
import TodayPlanner from '@/components/dashboard/TodayPlanner'
import HomeInsights from '@/components/dashboard/HomeInsights'

export default async function DashboardPage() {
  const supabase = await createClient()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('workspace_id')?.value

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId!)
    .single()

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader title={wsData?.name ?? 'Mi hogar'}>
        <Link href="/dashboard/workspace" className={buttonVariants({ variant: 'secondary' })}>
          <Users />
          Miembros
        </Link>
        <form action={clearWorkspaceAction}>
          <Button type="submit" className="text-white">
            Cambiar espacio de trabajo
          </Button>
        </form>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-[minmax(170px,auto)] lg:grid-cols-4">
        <div className="sm:col-span-2 lg:row-span-2">
          <TodayPlanner />
        </div>

        <HomeInsights />
      </div>
    </div>
  )
}
