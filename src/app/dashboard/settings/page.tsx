'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CURRENCIES } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ChevronDown, LogOut, User } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [currency, setCurrency] = useState('EUR')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUser(data.user))
    const stored = localStorage.getItem('appCurrencyCode')
    if (stored) setCurrency(stored)
  }, [])

  function handleCurrencyChange(code: string) {
    setCurrency(code)
    setSaved(false)
  }

  function handleSave() {
    setSaving(true)
    localStorage.setItem('appCurrencyCode', currency)
    setTimeout(() => { setSaving(false); setSaved(true) }, 400)
  }

  async function handleLogout() {
    await createClient().auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const selectedCurrency = CURRENCIES.find(c => c.code === currency)

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Configuración</h1>

      {/* Account */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" /> Cuenta</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Email</p>
            <p className="font-medium">{user?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Rol</p>
            <p className="text-sm">Usuario registrado</p>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader><CardTitle className="text-base">Preferencias</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Moneda</Label>
            <div className="relative max-w-xs">
              <select
                value={currency}
                onChange={e => handleCurrencyChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8"
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            {selectedCurrency && (
              <p className="text-xs text-muted-foreground">Símbolo: {selectedCurrency.symbol}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? 'Guardando...' : 'Guardar preferencias'}
            </Button>
            {saved && <span className="text-sm text-green-600">✓ Guardado</span>}
          </div>
        </CardContent>
      </Card>

      {/* App info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Aplicación</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>FreeDomus v1.0</p>
          <p>Plataforma: Web</p>
        </CardContent>
      </Card>

      {/* Session */}
      <Card>
        <CardHeader><CardTitle className="text-base">Sesión</CardTitle></CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleLogout} className="flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}