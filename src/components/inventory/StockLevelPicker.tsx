'use client'

import { cn } from '@/lib/utils'
import { STOCK_LEVELS, type StockLevel } from '@/types'

export const STOCK_LEVEL_TONE: Record<StockLevel, string> = {
  lleno: 'bg-lime text-lime-ink',
  medio: 'bg-butter text-butter-ink',
  poco: 'bg-peach text-peach-ink',
  agotado: 'bg-danger-soft text-danger',
}

// Nivel de un producto a ojo: un toque para cambiarlo
export function StockLevelPicker({ value, onChange, disabled, className }: {
  value: StockLevel | null
  onChange: (level: StockLevel) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-4 gap-1 rounded-full bg-sage p-1', className)}>
      {STOCK_LEVELS.map(({ key, label }) => (
        <button key={key} type="button" disabled={disabled} onClick={() => onChange(key)}
          className={cn(
            'h-8 cursor-pointer truncate rounded-full px-1 text-[11.5px] font-semibold transition-colors disabled:cursor-default disabled:opacity-60',
            value === key ? STOCK_LEVEL_TONE[key] : 'text-ink-3 hover:bg-sage-deep',
          )}>
          {label}
        </button>
      ))}
    </div>
  )
}
