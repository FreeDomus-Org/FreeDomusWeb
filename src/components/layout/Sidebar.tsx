'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
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
  Menu,
  X,
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
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-6 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <span className="font-bold text-lg">FreeDomus</span>
        </div>
        <button className="md:hidden" onClick={() => setOpen(false)}>
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
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
          onClick={() => setOpen(false)}
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
    </>
  )

  return (
    <>
      {/* Botón hamburguesa — solo mobile */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 bg-card border rounded-lg p-2 shadow-sm"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay — solo mobile cuando está abierto */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 border-r bg-card flex-col h-full shrink-0">
        {sidebarContent}
      </aside>

      {/* Sidebar mobile (drawer) */}
      <aside
        className={cn(
          'md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-card flex flex-col h-full transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
