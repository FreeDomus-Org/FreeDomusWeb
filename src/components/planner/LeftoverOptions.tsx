'use client'

import type { CookingHistory } from '@/types'
import { portionsLabel } from '@/components/recipes/FinishCookingModal'
import { Check, Refrigerator } from 'lucide-react'

export const cookedAgo = (cookedAt: string) => {
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(cookedAt).setHours(0, 0, 0, 0)) / 86400000)
  return days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`
}

// Sobras disponibles como opción al elegir qué se come en una comida (no se vuelven a descontar ingredientes)
export function LeftoverOptions({ leftovers, currentId, disabled, onPick }: {
  leftovers: CookingHistory[]
  currentId: string | null
  disabled?: boolean
  onPick: (leftover: CookingHistory) => void
}) {
  if (leftovers.length === 0) return null
  return (
    <div className="-mx-2 flex flex-col">
      <p className="px-3 pb-1 font-mono text-[11px] tracking-[0.08em] text-leaf uppercase">Sobras</p>
      {leftovers.map(h => {
        const current = currentId === h.id
        return (
          <button key={h.id} disabled={disabled} onClick={() => onPick(h)}
            className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${current ? 'bg-lime/40' : 'hover:bg-sage'}`}>
            <div className="flex min-w-0 items-center gap-2.5">
              <Refrigerator className="size-4 shrink-0 text-leaf" />
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold">{h.recipe?.name ?? 'Receta'}</p>
                <p className="text-xs text-ink-5">{portionsLabel(h.leftover_servings ?? 0)} · cocinado {cookedAgo(h.cooked_at)}</p>
              </div>
            </div>
            {current && <Check className="size-4 shrink-0 stroke-[2.6] text-lime-ink" />}
          </button>
        )
      })}
    </div>
  )
}
