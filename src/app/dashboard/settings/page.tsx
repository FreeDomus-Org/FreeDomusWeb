'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CURRENCIES } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, Field, NativeSelect } from '@/components/ui/freedomus'
import { LogOut, User, SlidersHorizontal, Info, KeyRound } from 'lucide-react'
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
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Configuración" />

      {/* Account */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2.5"><User className="size-[18px]" /> Cuenta</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-3.5">
          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-forest font-display text-lg font-bold text-lime">
            {(user?.email ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{user?.email ?? '—'}</p>
            <p className="text-[13px] text-ink-5">Usuario registrado</p>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2.5"><SlidersHorizontal className="size-[18px]" /> Preferencias</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Moneda" hint={selectedCurrency && `Símbolo: ${selectedCurrency.symbol}`} className="max-w-xs">
            <NativeSelect value={currency} onChange={e => handleCurrencyChange(e.target.value)}>
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar preferencias'}
            </Button>
            {saved && <span className="text-sm font-medium text-leaf">✓ Guardado</span>}
          </div>
        </CardContent>
      </Card>

      {/* App info */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2.5"><Info className="size-[18px]" /> Aplicación</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-ink-5">
          <p>FreeDomus v1.0</p>
          <p>Plataforma: Web</p>
        </CardContent>
      </Card>

      {/* Session */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2.5"><KeyRound className="size-[18px]" /> Sesión</CardTitle></CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleLogout}>
            <LogOut /> Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}