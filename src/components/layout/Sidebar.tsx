'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Home,
  BookOpen,
  ShoppingBag,
  Archive,
  Calendar,
  Clock,
  CheckSquare,
  Settings,
  LogOut,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: Home },
  { href: '/dashboard/recipes', label: 'Recetas', icon: BookOpen },
  { href: '/dashboard/products', label: 'Productos', icon: ShoppingBag },
  { href: '/dashboard/inventory', label: 'Inventario', icon: Archive },
  { href: '/dashboard/planner', label: 'Planificador', icon: Calendar },
  { href: '/dashboard/history', label: 'Historial', icon: Clock },
  { href: '/dashboard/tasks', label: 'Tareas', icon: CheckSquare },
  { href: '/dashboard/workspace', label: 'Workspace', icon: Users },
]

interface SidebarProps {
  user: User
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside className="w-64 border-r bg-card flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="p-6 border-b">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <span className="font-bold text-lg">FreeDomus</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t space-y-2">
        <Link
          href="/dashboard/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            pathname.startsWith('/dashboard/settings')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
          Configuración
        </Link>
        <div className="px-3 py-1 text-xs text-muted-foreground truncate">{user.email}</div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-muted-foreground" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  )
}
