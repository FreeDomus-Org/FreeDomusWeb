import { createClient } from '@/lib/supabase/client'
import type { RecipeIngredient, Inventory } from '@/types'

// ─── Sistema de unidades ───────────────────────────────────────────────────────
// Cada unidad pertenece a una dimensión y tiene un factor hacia la unidad base.
// Base: g (peso), ml (volumen), ud (conteo)
// Solo se comparan unidades de la misma dimensión.

type Dimension = 'weight' | 'volume' | 'count'

const UNIT_MAP: Record<string, { dimension: Dimension; toBase: number }> = {
  // Peso → base: g
  g:   { dimension: 'weight', toBase: 1 },
  kg:  { dimension: 'weight', toBase: 1000 },
  // Volumen → base: ml
  ml:   { dimension: 'volume', toBase: 1 },
  l:    { dimension: 'volume', toBase: 1000 },
  cda:  { dimension: 'volume', toBase: 15 },
  cdta: { dimension: 'volume', toBase: 5 },
  taza: { dimension: 'volume', toBase: 240 },
  // Conteo → base: ud
  ud:       { dimension: 'count', toBase: 1 },
  pizca:    { dimension: 'count', toBase: 1 },
  rebanada: { dimension: 'count', toBase: 1 },
}

function toBase(qty: number, unit: string): number {
  return qty * (UNIT_MAP[unit]?.toBase ?? 1)
}

function dimension(unit: string): Dimension {
  return UNIT_MAP[unit]?.dimension ?? 'count'
}

function fromBase(base: number, unit: string): number {
  const factor = UNIT_MAP[unit]?.toBase ?? 1
  return Math.round((base / factor) * 1000) / 1000
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface IngredientStatus {
  ingredient: RecipeIngredient
  inventoryItems: Inventory[]
  available: number      // en unidad base de la dimensión
  needed: number         // en unidad base de la dimensión
  availableDisplay: string  // legible para el usuario
  neededDisplay: string
  missingDisplay: string
  status: 'ok' | 'partial' | 'missing' | 'incompatible'
}

function humanize(base: number, unit: string): string {
  const dim = dimension(unit)
  if (dim === 'weight') {
    return base >= 1000 ? `${Math.round(base / 10) / 100} kg` : `${Math.round(base)} g`
  }
  if (dim === 'volume') {
    return base >= 1000 ? `${Math.round(base / 10) / 100} l` : `${Math.round(base)} ml`
  }
  return `${Math.round(base * 100) / 100} ${unit}`
}

// ─── Verificar disponibilidad ─────────────────────────────────────────────────

export async function checkIngredients(
  recipeId: string,
  userId: string,
  workspaceId: string | null
): Promise<IngredientStatus[]> {
  const supabase = createClient()

  const { data: ings } = await supabase
    .from('recipe_ingredients')
    .select('*, product:products(*)')
    .eq('recipe_id', recipeId)

  if (!ings || ings.length === 0) return []

  let invQuery = supabase.from('inventory').select('*, product:products(*)')
  if (workspaceId) {
    invQuery = invQuery.eq('workspace_id', workspaceId)
  } else {
    invQuery = invQuery.eq('user_id', userId).is('workspace_id', null)
  }
  const { data: inventory } = await invQuery

  return (ings as RecipeIngredient[]).map(ing => {
    const ingDim = dimension(ing.unit)
    const matching = ((inventory ?? []) as Inventory[]).filter(
      item => item.product_id === ing.product_id
    )

    const needed = toBase(ing.quantity, ing.unit)
    const neededDisplay = humanize(needed, ing.unit)

    // Verificar que las unidades del inventario son compatibles
    const compatible = matching.filter(item => dimension(item.unit ?? ing.unit) === ingDim)
    const incompatible = matching.length > 0 && compatible.length === 0

    if (incompatible) {
      return {
        ingredient: ing, inventoryItems: matching,
        available: 0, needed,
        availableDisplay: 'unidades incompatibles',
        neededDisplay, missingDisplay: neededDisplay,
        status: 'incompatible' as const,
      }
    }

    const available = compatible.reduce(
      (sum, item) => sum + toBase(item.quantity, item.unit ?? ing.unit),
      0
    )
    const availableDisplay = humanize(available, ing.unit)
    const missing = Math.max(0, needed - available)
    const missingDisplay = humanize(missing, ing.unit)

    const status = available === 0 ? 'missing' : available < needed ? 'partial' : 'ok'
    return { ingredient: ing, inventoryItems: compatible, available, needed, availableDisplay, neededDisplay, missingDisplay, status }
  })
}

// ─── Terminar receta: descontar del inventario ────────────────────────────────

export async function finishRecipe(
  recipeId: string,
  userId: string,
  workspaceId: string | null
): Promise<void> {
  const supabase = createClient()

  const { data: ings } = await supabase
    .from('recipe_ingredients')
    .select('*')
    .eq('recipe_id', recipeId)

  if (!ings || ings.length === 0) return

  let invQuery = supabase.from('inventory').select('*')
  if (workspaceId) {
    invQuery = invQuery.eq('workspace_id', workspaceId)
  } else {
    invQuery = invQuery.eq('user_id', userId).is('workspace_id', null)
  }
  const { data: inventory } = await invQuery
  if (!inventory) return

  for (const ing of ings as RecipeIngredient[]) {
    const ingDim = dimension(ing.unit)
    let remaining = toBase(ing.quantity, ing.unit)

    // Solo descontar items compatibles en dimensión, ordenar por fecha de caducidad
    const items = ((inventory as Inventory[])
      .filter(i => i.product_id === ing.product_id && dimension(i.unit ?? ing.unit) === ingDim))
      .sort((a, b) => {
        if (a.expiration_date && b.expiration_date) return a.expiration_date.localeCompare(b.expiration_date)
        if (a.expiration_date) return -1
        if (b.expiration_date) return 1
        return 0
      })

    for (const item of items) {
      if (remaining <= 0) break
      const itemUnit = item.unit ?? ing.unit
      const itemBase = toBase(item.quantity, itemUnit)

      if (itemBase <= remaining) {
        await supabase.from('inventory').delete().eq('id', item.id)
        remaining -= itemBase
      } else {
        const newQty = fromBase(itemBase - remaining, itemUnit)
        await supabase.from('inventory').update({ quantity: newQty }).eq('id', item.id)
        remaining = 0
      }
    }
  }

  await supabase.from('cooking_history').insert({
    user_id: userId,
    workspace_id: workspaceId,
    recipe_id: recipeId,
    cooked_at: new Date().toISOString(),
  })
}
