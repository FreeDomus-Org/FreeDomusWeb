'use client'

import { useEffect, useState } from 'react'
import { fetchProducts, createProduct } from '@/lib/services/products'
import type { Product } from '@/types'
import { CenterModal, SearchField, LoadingState } from '@/components/ui/freedomus'
import { Check, Loader2, Plus } from 'lucide-react'

export const DRINK_CATEGORY = 'Bebidas'

// Segundo paso al planificar una comida: la bebida va aparte de la receta (producto de la categoría Bebidas)
export function DrinkPicker({ userId, eyebrow, subtitle, currentDrinkId, saving, error, onPick, onClose }: {
  userId: string
  eyebrow: string
  subtitle?: string
  currentDrinkId: string | null
  saving: boolean
  error?: string | null
  onPick: (drink: Product | null) => void
  onClose: () => void
}) {
  const [drinks, setDrinks] = useState<Product[] | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts(userId)
      .then(products => setDrinks(products.filter(p => p.category === DRINK_CATEGORY)))
      .catch(() => { setDrinks([]); setLocalError('No se pudieron cargar las bebidas.') })
  }, [userId])

  // Alta rápida en el catálogo cuando la bebida aún no existe
  async function createAndPick(name: string) {
    setCreating(true); setLocalError(null)
    try {
      const drink = await createProduct({ user_id: userId, workspace_id: null, name, brand: null, barcode: null, category: DRINK_CATEGORY, unit: 'ml', calories: null, protein: null, carbs: null, fat: null, allergens: [], is_custom: true })
      setDrinks(prev => [...(prev ?? []), drink].sort((a, b) => a.name.localeCompare(b.name)))
      onPick(drink)
    } catch {
      setLocalError('No se pudo crear la bebida. Inténtalo de nuevo.')
    } finally { setCreating(false) }
  }

  const term = search.trim()
  const results = (drinks ?? []).filter(d => d.name.toLowerCase().includes(term.toLowerCase()))
  const busy = saving || creating
  const row = (current: boolean) =>
    `flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${current ? 'bg-lime/40' : 'hover:bg-sage'}`

  return (
    <CenterModal eyebrow={eyebrow} title={currentDrinkId ? 'Cambiar bebida' : '¿Y para beber?'} subtitle={subtitle} onClose={onClose}>
      <SearchField tone="soft" className="h-11 max-w-none" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar bebida..." autoFocus />
      {drinks === null ? (
        <LoadingState className="py-8" />
      ) : (
        <div className="-mx-2 flex flex-col">
          {!term && (
            <button disabled={busy} onClick={() => onPick(null)} className={row(!currentDrinkId)}>
              <p className="font-display text-[15px] font-bold">Sin bebida</p>
              {!currentDrinkId && <Check className="size-4 shrink-0 stroke-[2.6] text-lime-ink" />}
            </button>
          )}
          {results.map(drink => {
            const current = currentDrinkId === drink.id
            return (
              <button key={drink.id} disabled={busy} onClick={() => onPick(drink)} className={row(current)}>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-bold">{drink.name}</p>
                  {drink.brand && <p className="truncate text-xs text-ink-5">{drink.brand}</p>}
                </div>
                {current && <Check className="size-4 shrink-0 stroke-[2.6] text-lime-ink" />}
              </button>
            )
          })}
          {term && results.length === 0 && (
            <button disabled={busy} onClick={() => createAndPick(term)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-leaf transition-colors hover:bg-sage disabled:opacity-50">
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4 stroke-[2.4]" />}
              Crear &ldquo;{term}&rdquo;
            </button>
          )}
          {!term && drinks.length === 0 && (
            <p className="px-3 pt-2 text-xs text-ink-5">Aún no tienes bebidas en el catálogo. Escribe una (por ejemplo, Agua) para crearla.</p>
          )}
        </div>
      )}
      {(localError || error) && <p className="text-sm text-danger">{localError || error}</p>}
    </CenterModal>
  )
}
