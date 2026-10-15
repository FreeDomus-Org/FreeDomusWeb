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
  ShoppingCart,
  Calendar,
  Clock,
  // CheckSquare, // Tareas oculto temporalmente
  Settings,
  LogOut,
  Users,
  Menu,
  X,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: Home },
  { href: '/dashboard/recipes', label: 'Recetas', icon: BookOpen },
  { href: '/dashboard/products', label: 'Productos', icon: ShoppingBag },
  { href: '/dashboard/inventory', label: 'Inventario', icon: Archive },
  { href: '/dashboard/shopping', label: 'Lista de compras', icon: ShoppingCart },
  { href: '/dashboard/planner', label: 'Planificador', icon: Calendar },
  { href: '/dashboard/history', label: 'Historial', icon: Clock },
  // Tareas oculto temporalmente: falta la tabla household_tasks en Supabase
  // { href: '/dashboard/tasks', label: 'Tareas', icon: CheckSquare },
  { href: '/dashboard/workspace', label: 'Espacio de trabajo', icon: Users },
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

  const initial = (user.email ?? '?').charAt(0).toUpperCase()
  const settingsActive = pathname.startsWith('/dashboard/settings')

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2.5 font-display text-[21px] font-extrabold">
          <div className="grid size-8.5 place-items-center rounded-full bg-lime">
            <Home className="size-4.5 stroke-[2.2] text-forest" />
          </div>
          FreeDomus
        </div>
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú">
          <X className="h-5 w-5 text-ink-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-[14px] px-3 py-3 text-[14.5px] font-medium transition-colors',
                active ? 'bg-forest text-lime' : 'text-ink-3 hover:bg-sage hover:text-forest'
              )}
            >
              <Icon className="size-4.5 shrink-0 stroke-[1.9]" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className={cn('flex items-center gap-2.5 rounded-2xl p-3', settingsActive ? 'bg-forest text-lime' : 'bg-sage')}>
        <Link href="/dashboard/settings" onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className={cn('grid size-8.5 shrink-0 place-items-center rounded-full font-bold', settingsActive ? 'bg-lime text-forest' : 'bg-forest text-lime')}>
            {initial}
          </div>
          <div className="min-w-0 text-xs leading-[1.35]">
            <p className="flex items-center gap-1 font-semibold"><Settings className="size-3" /> Configuración</p>
            <p className={cn('truncate', settingsActive ? 'text-lime/70' : 'text-ink-5')}>{user.email}</p>
          </div>
        </Link>
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className={cn('grid size-8 shrink-0 cursor-pointer place-items-center rounded-full transition-colors', settingsActive ? 'hover:bg-white/10' : 'text-ink-3 hover:bg-danger-soft hover:text-danger')}
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Barra superior — mobile y tablet vertical */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 bg-canvas/90 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 backdrop-blur sm:px-6 lg:hidden">
        <button
          className="grid size-11 place-items-center rounded-full bg-card shadow-panel"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 font-display text-lg font-extrabold">
          <div className="grid size-8 place-items-center rounded-full bg-lime">
            <Home className="size-4 stroke-[2.2] text-forest" />
          </div>
          FreeDomus
        </div>
      </div>

      {/* Overlay — solo mobile cuando está abierto */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-forest/45 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar desktop */}
      <aside className="hidden w-58 shrink-0 flex-col gap-5.5 overflow-hidden rounded-3xl bg-card px-3.5 py-5.5 shadow-panel lg:flex">
        {sidebarContent}
      </aside>

      {/* Sidebar mobile (drawer) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-col gap-5.5 rounded-r-3xl bg-card px-3.5 pt-[calc(1.375rem+env(safe-area-inset-top))] pb-[calc(1.375rem+env(safe-area-inset-bottom))] shadow-panel transition-transform duration-300 lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
