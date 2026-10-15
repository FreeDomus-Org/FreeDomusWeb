'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CenterModal } from '@/components/ui/freedomus'
import { cn } from '@/lib/utils'
import { setStockLevel } from '@/lib/services/inventory'
import type { PantryUse } from '@/lib/services/cookRecipe'
import type { StockLevel } from '@/types'

const CHOICES: { key: 'same' | StockLevel; label: string; tone: string }[] = [
  { key: 'same', label: 'Igual', tone: 'bg-lime text-lime-ink' },
  { key: 'poco', label: 'Queda poco', tone: 'bg-peach text-peach-ink' },
  { key: 'agotado', label: 'Se acabó', tone: 'bg-danger-soft text-danger' },
]

// Después de cocinar: lo que se echó a ojo no se descuenta, se pregunta cómo quedó
export function PantryCheckModal({ userId, uses, onClose }: { userId: string; uses: PantryUse[]; onClose: () => void }) {
  const [choices, setChoices] = useState<Record<string, 'same' | StockLevel>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      for (const use of uses) {
        const choice = choices[use.product.id]
        if (choice && choice !== 'same' && choice !== use.item.stock_level) {
          await setStockLevel(userId, use.item, choice, use.others)
        }
      }
      onClose()
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally { setSaving(false) }
  }

  return (
    <CenterModal
      eyebrow="Despensa"
      title="¿Cómo quedaron?"
      subtitle="Lo que se echa a ojo no se descuenta. Marca solo lo que cambió."
      onClose={onClose}
      footer={<>
        <Button variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={saving}>Saltar</Button>
        <Button size="lg" className="flex-[1.2]" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} Guardar
        </Button>
      </>}
    >
      <div className="flex flex-col gap-3">
        {uses.map(({ product, item }) => {
          const current = choices[product.id] ?? 'same'
          return (
            <div key={product.id} className="flex flex-col gap-2 rounded-2xl bg-canvas p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold">{product.name}</p>
                {item.stock_level === 'poco' && <span className="shrink-0 text-xs text-ink-5">ya quedaba poco</span>}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {CHOICES.map(({ key, label, tone }) => (
                  <button key={key} type="button" disabled={saving}
                    onClick={() => setChoices(prev => ({ ...prev, [product.id]: key }))}
                    className={cn('h-9 cursor-pointer rounded-full text-[12.5px] font-semibold transition-colors',
                      current === key ? tone : 'bg-card text-ink-3 hover:bg-sage')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </CenterModal>
  )
}
