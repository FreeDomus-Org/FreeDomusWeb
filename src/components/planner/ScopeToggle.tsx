import { cn } from '@/lib/utils'

export type PlannerScope = 'all' | 'me'

// Elige si el plato lo ven todos los miembros del espacio o solo quien lo añade
export function ScopeToggle({ value, onChange }: { value: PlannerScope; onChange: (v: PlannerScope) => void }) {
  const options: { key: PlannerScope; label: string }[] = [
    { key: 'all', label: 'Para todos' },
    { key: 'me', label: 'Solo para mí' },
  ]
  return (
    <div role="radiogroup" aria-label="Quién ve este plato" className="flex gap-1 rounded-full bg-sage p-1">
      {options.map(o => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={cn('flex-1 cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
            value === o.key ? 'bg-forest text-lime' : 'text-ink-2 hover:bg-white/60')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
