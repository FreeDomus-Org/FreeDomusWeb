import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { BookOpen, ShoppingBag, Archive, Calendar, Clock, CheckSquare, Users } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { clearWorkspaceAction } from '@/app/actions/workspace'

const modules = [
  { href: '/dashboard/recipes', label: 'Recetas', icon: BookOpen, color: 'text-orange-500', bg: 'bg-orange-50', description: 'Gestiona tus recetas favoritas' },
  { href: '/dashboard/products', label: 'Productos', icon: ShoppingBag, color: 'text-blue-500', bg: 'bg-blue-50', description: 'Catálogo de ingredientes' },
  { href: '/dashboard/inventory', label: 'Inventario', icon: Archive, color: 'text-green-500', bg: 'bg-green-50', description: 'Nevera, despensa y congelador' },
  { href: '/dashboard/planner', label: 'Planificador', icon: Calendar, color: 'text-purple-500', bg: 'bg-purple-50', description: 'Menú semanal' },
  { href: '/dashboard/history', label: 'Historial', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', description: 'Lo que has cocinado' },
  { href: '/dashboard/tasks', label: 'Tareas', icon: CheckSquare, color: 'text-red-500', bg: 'bg-red-50', description: 'Tareas del hogar' },
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('workspace_id')?.value

  const { data: wsData } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId!)
    .single()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {wsData?.icon && <span className="text-3xl">{wsData.icon}</span>}
            <h1 className="text-3xl font-bold">{wsData?.name ?? 'Mi hogar'}</h1>
          </div>
          <p className="text-muted-foreground text-sm">{user?.email}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/dashboard/workspace"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Users className="h-4 w-4 mr-1.5" />
            Miembros
          </Link>
          <form action={clearWorkspaceAction}>
            <Button variant="ghost" size="sm" type="submit">
              Cambiar workspace
            </Button>
          </form>
        </div>
      </div>

      {/* Módulos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map(({ href, label, icon: Icon, color, bg, description }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer h-full group">
              <CardHeader className="pb-2">
                <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-200`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <CardTitle className="text-base">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
