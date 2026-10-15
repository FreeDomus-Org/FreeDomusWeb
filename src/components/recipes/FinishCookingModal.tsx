'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CenterModal, Field } from '@/components/ui/freedomus'
import { ChefHat, Loader2 } from 'lucide-react'

export const portionsLabel = (n: number) => `${n} ${n === 1 ? 'porción' : 'porciones'}`

// Al terminar de cocinar: cuántas porciones salieron (se descuenta en proporción) y cuántas se guardan como sobras
export function FinishCookingModal({ recipeName, recipeServings, defaults, minutes, saving, error, onConfirm, onClose }: {
  recipeName: string
  recipeServings: number | null
  defaults: { servings: number; leftovers: number }
  minutes?: number | null
  saving: boolean
  error?: string | null
  onConfirm: (result: { servings: number; leftovers: number }) => void
  onClose: () => void
}) {
  const [servings, setServings] = useState<string | number>(defaults.servings)
  const [leftovers, setLeftovers] = useState<string | number>(defaults.leftovers)

  const base = recipeServings || 1
  const made = Math.floor(Number(servings)) || 0
  const kept = Math.floor(Number(leftovers)) || 0
  const valid = made >= 1 && kept >= 0 && kept <= made

  return (
    <CenterModal
      eyebrow="Terminar de cocinar"
      title={recipeName}
      subtitle={minutes ? `Cocinado en ${minutes} min` : undefined}
      onClose={onClose}
      footer={<>
        <Button variant="outline" size="lg" className="flex-1" disabled={saving} onClick={onClose}>Volver</Button>
        <Button size="lg" className="flex-[1.2]" disabled={saving || !valid} onClick={() => onConfirm({ servings: made, leftovers: kept })}>
          {saving ? <Loader2 className="animate-spin" /> : <ChefHat />} Guardar
        </Button>
      </>}
    >
      <div className="flex flex-col gap-1.5">
        <Field label="Porciones preparadas">
          <Input type="number" min={1} value={servings} onChange={e => setServings(e.target.value)} />
        </Field>
        <p className="text-xs text-ink-5">
          La receta es para {portionsLabel(base)}.
          {made >= 1 && <> Se descuentan los ingredientes de {portionsLabel(made)}{made !== base && ` (×${Math.round(made / base * 100) / 100})`}.</>}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Field label="Se guardan para otro día">
          <Input type="number" min={0} max={made || undefined} value={leftovers} onChange={e => setLeftovers(e.target.value)} />
        </Field>
        <p className={`text-xs ${valid || made < 1 ? 'text-ink-5' : 'text-danger'}`}>
          {!valid && made >= 1
            ? 'No puedes guardar más de lo que preparaste.'
            : kept > 0
              ? `Se comen ${portionsLabel(made - kept)} ahora y ${portionsLabel(kept)} quedan en Sobras.`
              : 'Se come todo ahora.'}
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </CenterModal>
  )
}
