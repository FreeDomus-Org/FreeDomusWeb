'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff, Loader2, Check, X } from 'lucide-react'

interface PasswordRule {
  label: string
  test: (v: string) => boolean
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'Mínimo 8 caracteres', test: (v) => v.length >= 8 },
  { label: 'Una mayúscula', test: (v) => /[A-Z]/.test(v) },
  { label: 'Un número', test: (v) => /\d/.test(v) },
  { label: 'Un carácter especial', test: (v) => /[!@#$%^&*(),.?":{}|<>]/.test(v) },
]

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordValid = PASSWORD_RULES.every((r) => r.test(password))
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!passwordValid) return setError('La contraseña no cumple los requisitos.')
    if (!passwordsMatch) return setError('Las contraseñas no coinciden.')

    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Vuelve al enlace de invitación si venía de uno; solo rutas internas
    const next = new URLSearchParams(window.location.search).get('next')
    router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard')
    router.refresh()
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-4">
      <div className="stripes pointer-events-none absolute -top-24 -right-24 size-80 rounded-full opacity-90" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 size-64 rounded-full bg-lime/60" />
      <Card className="relative w-full max-w-md rounded-[28px] py-7 shadow-panel">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-lime">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#17251c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          </div>
          <CardTitle className="font-display text-[32px] font-extrabold tracking-[-0.02em]">FreeDomus</CardTitle>
          <CardDescription>Crea tu cuenta y empieza a gestionar tu hogar</CardDescription>
        </CardHeader>

        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {password.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {PASSWORD_RULES.map((rule) => {
                    const ok = rule.test(password)
                    return (
                      <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-leaf' : 'text-muted-foreground'}`}>
                        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {rule.label}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <div className="relative">
                <Input
                  id="confirm"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-danger">Las contraseñas no coinciden</p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 border-0 bg-transparent">
            <Button type="submit" size="lg" className="w-full" disabled={loading || !passwordValid || !passwordsMatch}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear cuenta
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              ¿Ya tienes cuenta?{' '}
              <Link href="/auth/login" onClick={e => { e.preventDefault(); router.push(`/auth/login${window.location.search}`) }} className="font-semibold text-leaf hover:underline">
                Inicia sesión
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
