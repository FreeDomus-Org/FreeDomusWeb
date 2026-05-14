import { createClient } from '@/lib/supabase/server'
import { BookOpen, ShoppingBag, Archive, Calendar, Clock, CheckSquare } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Bienvenido 👋</h1>
        <p className="text-muted-foreground mt-1">{user?.email}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map(({ href, label, icon: Icon, color, bg, description }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-2">
                <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-2`}>
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
