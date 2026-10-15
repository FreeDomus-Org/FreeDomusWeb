'use client'

import { useEffect, useState, useCallback } from 'react'
import { checkIngredients, finishRecipe, defaultPortions, pantryAfterCooking, type IngredientStatus, type PantryUse } from '@/lib/services/cookRecipe'
import { markProductOut } from '@/lib/services/inventory'
import { CheckCircle2, AlertCircle, XCircle, ShoppingCart, ChefHat, Loader2, RefreshCw, PackageMinus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SidePanel, LoadingState } from '@/components/ui/freedomus'
import { PantryCheckModal } from '@/components/inventory/PantryCheckModal'
import { FinishCookingModal } from '@/components/recipes/FinishCookingModal'
import type { Product, Recipe } from '@/types'

interface Props {
  recipe: Recipe
  userId: string
  workspaceId: string | null
  onClose: () => void
  onFinished: () => void
}

const STATUS_CONFIG = {
  ok:           { icon: CheckCircle2, color: 'text-lime-ink',   bg: 'bg-lime/45',      pill: 'bg-lime text-lime-ink',     label: 'Disponible' },
  low:          { icon: AlertCircle,  color: 'text-peach-ink',  bg: 'bg-peach/50',     pill: 'bg-peach text-peach-ink',   label: 'Queda poco' },
  partial:      { icon: AlertCircle,  color: 'text-butter-ink', bg: 'bg-butter/50',    pill: 'bg-butter text-butter-ink', label: 'Insuficiente' },
  missing:      { icon: XCircle,      color: 'text-danger',     bg: 'bg-danger-soft',  pill: 'bg-card text-danger',       label: 'No hay' },
  incompatible: { icon: AlertCircle,  color: 'text-lilac-ink',  bg: 'bg-lilac/60',     pill: 'bg-lilac text-lilac-ink',   label: 'Unidades distintas' },
}

export default function RecipeDetailPanel({ recipe, userId, workspaceId, onClose, onFinished }: Props) {
  const [statuses, setStatuses] = useState<IngredientStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [finishing, setFinishing] = useState(false)
  const [askPortions, setAskPortions] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [pantryUses, setPantryUses] = useState<PantryUse[]>([])
  const [runningOut, setRunningOut] = useState<string | null>(null) // producto que se está marcando como acabado
  const [outError, setOutError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await checkIngredients(recipe.id, userId, workspaceId)
      setStatuses(result)
    } finally {
      setLoading(false)
    }
  }, [recipe.id, userId, workspaceId])

  useEffect(() => { load() }, [load])

  const toShop = statuses.filter(s => s.status !== 'ok')
  const canCook = statuses.length > 0 && statuses.every(s => s.status === 'ok' || s.status === 'low')
  const hasLinkedIngredients = statuses.length > 0

  // Se pregunta cuántas porciones salieron: se descuenta en proporción y lo que se guarda queda en Sobras
  async function handleFinish({ servings, leftovers }: { servings: number; leftovers: number }) {
    setFinishing(true); setFinishError(null)
    try {
      await finishRecipe(recipe, userId, workspaceId, { servings, leftovers })
      setFinished(true); setAskPortions(false)
      onFinished()
      // Si falla solo se pierde la pregunta; la receta ya quedó terminada
      pantryAfterCooking(recipe.id, userId, workspaceId).then(setPantryUses).catch(() => {})
    } catch {
      setFinishError('No se pudo terminar la receta. Inténtalo de nuevo.')
    } finally {
      setFinishing(false)
    }
  }

  // Me di cuenta de que se acabó: sale del inventario y se apunta en la lista de compras
  async function handleRunOut(product: Product) {
    if (!confirm(`¿Se acabó "${product.name}"? Se quitará del inventario y se apuntará en la lista de compras.`)) return
    setRunningOut(product.id); setOutError(null)
    try {
      await markProductOut(userId, product, workspaceId)
      await load()
    } catch {
      setOutError(`No se pudo marcar "${product.name}" como acabado. Inténtalo de nuevo.`)
    } finally { setRunningOut(null) }
  }

  const steps = recipe.preparation_steps
    ?.split('\n')
    .map(s => s.trim())
    .filter(Boolean) ?? []

  const sectionTitle = 'mb-3 flex items-center gap-2 font-mono text-xs tracking-[0.08em] text-leaf uppercase'

  return (
    <>
      <SidePanel
        wide
        eyebrow="Receta"
        title={recipe.name}
        subtitle={[recipe.meal_type, recipe.difficulty].filter(Boolean).join(' · ')}
        onClose={onClose}
        footer={hasLinkedIngredients ? (
          finished ? (
            <div className="flex w-full items-center justify-center gap-2 py-2 font-semibold text-leaf">
              <CheckCircle2 className="h-5 w-5" />
              ¡Receta terminada! Inventario actualizado.
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2">
              {!canCook && (
                <p className="text-center text-xs text-ink-5">
                  Faltan ingredientes, pero igual puedes marcar la receta como terminada.
                </p>
              )}
              <Button size="lg" className="w-full" onClick={() => setAskPortions(true)} disabled={finishing}>
                {finishing
                  ? <><Loader2 className="animate-spin" /> Procesando...</>
                  : <><ChefHat /> Terminar receta</>
                }
              </Button>
            </div>
          )
        ) : undefined}
      >
        {/* Ingredientes con estado de inventario */}
        <section>
          <div className="flex items-center justify-between">
            <h3 className={sectionTitle}>Ingredientes</h3>
            <button onClick={load} className="mb-3 flex cursor-pointer items-center gap-1 rounded-full bg-sage px-3 py-1 text-xs font-semibold text-ink-3 hover:bg-sage-deep">
              <RefreshCw className="h-3 w-3" /> Actualizar
            </button>
          </div>

          {loading ? (
            <LoadingState className="py-8" />
          ) : !hasLinkedIngredients ? (
            <div className="rounded-[20px] border-2 border-dashed border-[#b9c5b5] px-4 py-6 text-center text-sm text-ink-5">
              <p>Esta receta no tiene ingredientes vinculados al inventario.</p>
              <p className="mt-1 text-xs">Edita la receta y selecciona productos del catálogo.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {statuses.map(({ ingredient, availableDisplay, neededDisplay, status }) => {
                const cfg = STATUS_CONFIG[status]
                const Icon = cfg.icon
                return (
                  <div key={ingredient.id} className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 ${cfg.bg}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{ingredient.product?.name ?? 'Producto'}</p>
                        <p className="text-xs text-ink-2">
                          Necesitas: {neededDisplay}
                          {status !== 'ok' && status !== 'missing' && (
                            <span className="ml-1">· Tienes: {availableDisplay}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${cfg.pill}`}>{cfg.label}</span>
                      {ingredient.product && status !== 'missing' && (
                        <button type="button" onClick={() => handleRunOut(ingredient.product!)} disabled={runningOut !== null}
                          className="flex h-6.5 cursor-pointer items-center gap-1 rounded-full bg-card/70 px-2.5 text-[11.5px] font-semibold text-ink-3 hover:bg-card hover:text-danger disabled:cursor-default disabled:opacity-60">
                          {runningOut === ingredient.product_id ? <Loader2 className="size-3 animate-spin" /> : <PackageMinus className="size-3" />}
                          Se acabó
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {outError && <p className="text-xs text-danger">{outError}</p>}
            </div>
          )}
        </section>

        {/* Lista de compras */}
        {toShop.length > 0 && (
          <section>
            <h3 className={sectionTitle}>
              <ShoppingCart className="h-4 w-4" /> Ingredientes a comprar
            </h3>
            <div className="divide-y divide-card rounded-[20px] bg-canvas">
              {toShop.map(({ ingredient, missingDisplay, status }) => (
                <div key={ingredient.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="text-sm font-semibold">{ingredient.product?.name ?? 'Producto'}</p>
                  <span className="shrink-0 text-sm text-ink-2">
                    {status === 'incompatible' ? 'revisar unidades' : status === 'low' ? 'queda poco' : missingDisplay}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pasos */}
        {steps.length > 0 && (
          <section>
            <h3 className={sectionTitle}>Preparación</h3>
            <ol className="flex flex-col gap-2.5">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-snug">
                  <span className="grid size-6.5 shrink-0 place-items-center rounded-full bg-lime font-display text-xs font-extrabold text-lime-ink">{i + 1}</span>
                  <span className="pt-0.75">{step.replace(/^\d+\.\s*/, '')}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </SidePanel>
      {askPortions && (
        <FinishCookingModal
          recipeName={recipe.name}
          recipeServings={recipe.servings}
          defaults={defaultPortions(recipe.servings, 1)}
          saving={finishing}
          error={finishError}
          onConfirm={handleFinish}
          onClose={() => setAskPortions(false)}
        />
      )}
      {pantryUses.length > 0 && <PantryCheckModal userId={userId} uses={pantryUses} onClose={() => setPantryUses([])} />}
    </>
  )
}
