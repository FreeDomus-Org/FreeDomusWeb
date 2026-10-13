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
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-[28px] bg-card p-8 text-center shadow-panel">
        {error ? (
          <>
            <AlertCircle className="size-10 text-danger" />
            <h1 className="font-display text-2xl font-extrabold">No se pudo unir</h1>
            <p className="text-sm text-ink-5">{error}</p>
            <Button size="lg" onClick={() => router.push('/select')}>Ir a mis espacios de trabajo</Button>
          </>
        ) : (
          <>
            <Loader2 className="size-10 animate-spin text-leaf" />
            <h1 className="font-display text-2xl font-extrabold">Uniéndote al espacio de trabajo…</h1>
          </>
        )}
      </div>
    </div>
  )
}
