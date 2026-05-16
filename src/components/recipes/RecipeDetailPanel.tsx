'use client'

import { useEffect, useState, useCallback } from 'react'
import { checkIngredients, finishRecipe, type IngredientStatus } from '@/lib/services/cookRecipe'
import { X, CheckCircle2, AlertCircle, XCircle, ShoppingCart, ChefHat, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Recipe } from '@/types'

interface Props {
  recipe: Recipe
  userId: string
  workspaceId: string | null
  onClose: () => void
  onFinished: () => void
}

const STATUS_CONFIG = {
  ok:           { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200',  label: 'Disponible' },
  partial:      { icon: AlertCircle,  color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200',  label: 'Insuficiente' },
  missing:      { icon: XCircle,      color: 'text-red-600',   bg: 'bg-red-50 border-red-200',      label: 'No hay' },
  incompatible: { icon: AlertCircle,  color: 'text-purple-600',bg: 'bg-purple-50 border-purple-200',label: 'Unidades distintas' },
}

export default function RecipeDetailPanel({ recipe, userId, workspaceId, onClose, onFinished }: Props) {
  const [statuses, setStatuses] = useState<IngredientStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [finishing, setFinishing] = useState(false)
  const [finished, setFinished] = useState(false)

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
  const canCook = statuses.length > 0 && statuses.every(s => s.status === 'ok')
  const hasLinkedIngredients = statuses.length > 0

  async function handleFinish() {
    if (!confirm(`¿Confirmas que terminaste de cocinar "${recipe.name}"? Se descontarán los ingredientes del inventario.`)) return
    setFinishing(true)
    try {
      await finishRecipe(recipe.id, userId, workspaceId)
      setFinished(true)
      onFinished()
    } finally {
      setFinishing(false)
    }
  }

  const steps = recipe.preparation_steps
    ?.split('\n')
    .map(s => s.trim())
    .filter(Boolean) ?? []

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-background h-full overflow-y-auto shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div>
            <h2 className="font-semibold text-lg leading-tight">{recipe.name}</h2>
            <p className="text-xs text-muted-foreground">{recipe.meal_type} · {recipe.difficulty}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 p-4 space-y-6">
          {/* Ingredientes con estado de inventario */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Ingredientes</h3>
              <button onClick={load} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
                <RefreshCw className="h-3 w-3" /> Actualizar
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !hasLinkedIngredients ? (
              <div className="text-center py-6 border-2 border-dashed rounded-xl text-muted-foreground text-sm">
                <p>Esta receta no tiene ingredientes vinculados al inventario.</p>
                <p className="text-xs mt-1">Edita la receta y selecciona productos del catálogo.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {statuses.map(({ ingredient, availableDisplay, neededDisplay, status }) => {
                  const cfg = STATUS_CONFIG[status]
                  const Icon = cfg.icon
                  return (
                    <div key={ingredient.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${cfg.bg}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{ingredient.product?.name ?? 'Producto'}</p>
                          <p className="text-xs text-muted-foreground">
                            Necesitas: {neededDisplay}
                            {status !== 'ok' && status !== 'missing' && (
                              <span className="ml-1">· Tienes: {availableDisplay}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Lista de compras */}
          {toShop.length > 0 && (
            <section>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" /> Ingredientes a comprar
              </h3>
              <div className="rounded-xl border bg-card divide-y">
                {toShop.map(({ ingredient, missingDisplay, status }) => (
                  <div key={ingredient.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                    <p className="text-sm font-medium">{ingredient.product?.name ?? 'Producto'}</p>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {status === 'incompatible' ? 'revisar unidades' : missingDisplay}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pasos */}
          {steps.length > 0 && (
            <section>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Preparación</h3>
              <ol className="space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-muted-foreground font-mono shrink-0 mt-0.5">{i + 1}.</span>
                    <span>{step.replace(/^\d+\.\s*/, '')}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {/* Footer: Terminar receta */}
        {hasLinkedIngredients && (
          <div className="p-4 border-t sticky bottom-0 bg-background">
            {finished ? (
              <div className="flex items-center justify-center gap-2 text-green-600 py-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">¡Receta terminada! Inventario actualizado.</span>
              </div>
            ) : (
              <>
                {!canCook && (
                  <p className="text-xs text-muted-foreground text-center mb-2">
                    Faltan ingredientes, pero igual puedes marcar la receta como terminada.
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={handleFinish}
                  disabled={finishing}
                >
                  {finishing
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Procesando...</>
                    : <><ChefHat className="h-4 w-4 mr-2" /> Terminar receta</>
                  }
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
