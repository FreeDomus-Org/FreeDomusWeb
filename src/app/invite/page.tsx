'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptInvitation } from '@/lib/services/workspace'
import { Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Destino del enlace del correo de invitación: /invite?token=...
// Sin sesión se manda a iniciar sesión y se vuelve aquí; con sesión se acepta y se entra al espacio.
export default function InvitePage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function run() {
      const token = new URLSearchParams(window.location.search).get('token')
      if (!token) { setError('El enlace de invitación no es válido.'); return }

      const { data: { user } } = await createClient().auth.getUser()
      if (!user) {
        router.replace(`/auth/login?next=${encodeURIComponent(`/invite?token=${token}`)}`)
        return
      }

      try {
        const { workspace_id } = await acceptInvitation(token)
        // Mismo efecto que elegir el espacio en /select (cookie de 30 días)
        document.cookie = `workspace_id=${workspace_id}; path=/; max-age=${60 * 60 * 24 * 30}`
        router.replace('/dashboard')
        router.refresh()
      } catch (err) {
        const body = await (err as { context?: Response }).context?.json?.().catch(() => null)
        setError(body?.error ?? body?.detail ?? 'No se pudo aceptar la invitación. Puede haber expirado o ya se usó.')
      }
    }
    run()
  }, [router])

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-4">
      <div className="stripes pointer-events-none absolute -top-24 -right-24 size-80 rounded-full opacity-90" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 size-64 rounded-full bg-lime/60" />
      <div className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[28px] bg-card p-8 text-center shadow-panel">
        <div className="grid size-14 place-items-center rounded-full bg-lime">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#17251c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        </div>
        <p className="font-display text-[32px] font-extrabold leading-none tracking-[-0.02em]">FreeDomus</p>

        {error ? (
          <>
            <div className="w-full space-y-3 rounded-2xl bg-danger-soft p-5">
              <AlertCircle className="mx-auto size-8 text-danger" />
              <h1 className="font-display text-xl font-extrabold text-danger">No se pudo unir</h1>
              <p className="text-sm text-danger">{error}</p>
            </div>
            <Button size="lg" className="w-full" onClick={() => router.push('/select')}>Ir a mis espacios de trabajo</Button>
          </>
        ) : (
          <div className="w-full space-y-3 rounded-2xl bg-sage p-6">
            <Loader2 className="mx-auto size-8 animate-spin text-leaf" />
            <h1 className="font-display text-xl font-extrabold">Aceptando tu invitación…</h1>
            <p className="text-sm text-ink-5">Un momento, te estamos uniendo al espacio de trabajo.</p>
          </div>
        )}
      </div>
    </div>
  )
}
