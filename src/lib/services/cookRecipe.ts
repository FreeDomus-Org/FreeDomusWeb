import { createClient } from '@/lib/supabase/client'
import type { RecipeIngredient, Inventory, CookingHistory, WeeklyPlanner, Product, StockLevel } from '@/types'
import { LOOSE_UNITS, STOCK_LEVELS } from '@/types'
import { workspaceScope } from '@/lib/workspace'

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
  status: 'ok' | 'low' | 'partial' | 'missing' | 'incompatible'
  loose: boolean         // se echa a ojo: solo se mira si hay, no cuánto
}

// ─── Ingredientes a ojo ───────────────────────────────────────────────────────
// Productos 'pantry' (sal, especias, salsas...) o cantidades tipo "pizca" / "al gusto":
// no se comparan cantidades ni se descuentan, se llevan por nivel en el inventario.

export function isLooseIngredient(ing: Pick<RecipeIngredient, 'unit'> & { product?: Pick<Product, 'tracking'> | null }): boolean {
  return ing.product?.tracking === 'pantry' || LOOSE_UNITS.includes(ing.unit)
}

const LEVEL_RANK: Record<StockLevel, number> = { agotado: 0, poco: 1, medio: 2, lleno: 3 }

// Sin nivel (producto que se cuenta o pesa) cuenta como lleno si queda algo
function levelOf(item: Inventory): StockLevel {
  if (item.stock_level) return item.stock_level
  return item.quantity > 0 ? 'lleno' : 'agotado'
}

const levelLabel = (level: StockLevel) => STOCK_LEVELS.find(l => l.key === level)!.label

function looseStatus(ing: RecipeIngredient, matching: Inventory[]): IngredientStatus {
  const inStock = matching.filter(i => levelOf(i) !== 'agotado')
  const best = inStock.reduce<StockLevel>((acc, i) => LEVEL_RANK[levelOf(i)] > LEVEL_RANK[acc] ? levelOf(i) : acc, 'agotado')
  const neededDisplay = ing.unit === 'al gusto' ? 'al gusto' : `${ing.quantity} ${ing.unit}`
  return {
    ingredient: ing, inventoryItems: inStock,
    available: inStock.length, needed: 1,
    availableDisplay: levelLabel(best).toLowerCase(),
    neededDisplay, missingDisplay: 'reponer',
    status: best === 'agotado' ? 'missing' : best === 'poco' ? 'low' : 'ok',
    loose: true,
  }
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
    invQuery = invQuery.or(workspaceScope(userId, workspaceId))
  } else {
    invQuery = invQuery.eq('user_id', userId).is('workspace_id', null)
  }
  const { data: inventory } = await invQuery

  return (ings as RecipeIngredient[]).map(ing => {
    const ingDim = dimension(ing.unit)
    const matching = ((inventory ?? []) as Inventory[]).filter(
      item => item.product_id === ing.product_id
    )
    if (isLooseIngredient(ing)) return looseStatus(ing, matching)

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
        loose: false,
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
    return { ingredient: ing, inventoryItems: compatible, available, needed, availableDisplay, neededDisplay, missingDisplay, status, loose: false }
  })
}

// ─── Terminar receta: descontar del inventario ────────────────────────────────

export async function finishRecipe(
  recipeId: string,
  userId: string,
  workspaceId: string | null,
  actualMinutes: number | null = null,
  // Desde "¿Qué cocinamos hoy?" se sabe la comida y el plato planificado
  meal?: { mealType: NonNullable<CookingHistory['meal_type']>; plannerEntryId: string },
): Promise<string> {
  await deductFromInventory(recipeId, userId, workspaceId)

  const { data, error } = await createClient().from('cooking_history').insert({
    user_id: userId,
    workspace_id: workspaceId,
    recipe_id: recipeId,
    cooked_at: new Date().toISOString(),
    actual_time_minutes: actualMinutes,
    meal_type: meal?.mealType ?? null,
    planner_entry_id: meal?.plannerEntryId ?? null,
  }).select('id').single()
  if (error) throw error
  return data.id as string
}

// ─── Bebida de una comida planificada ─────────────────────────────────────────
// Una ración por persona: 1 ud si en el inventario se guarda por unidades, un vaso (250 ml) si es por volumen.
// Por peso no se descuenta (no hay una ración razonable).

const DRINK_SERVING: Partial<Record<Dimension, { quantity: number; unit: string }>> = {
  count: { quantity: 1, unit: 'ud' },
  volume: { quantity: 250, unit: 'ml' },
}

export async function takeDrink(
  entry: WeeklyPlanner,
  userId: string,
  workspaceId: string | null
): Promise<boolean> {
  if (!entry.drink_product_id) return false
  const supabase = createClient()
  // Marca primero: si ya la había tomado no se vuelve a descontar
  const { data: marked, error } = await supabase.rpc('take_planner_drink', { p_entry_id: entry.id })
  if (error) throw error
  if (!marked) return false

  const inventory = await fetchScopedInventory(userId, workspaceId)
  const stock = sortByExpiry(inventory.filter(i => i.product_id === entry.drink_product_id))
  const serving = stock.length ? DRINK_SERVING[dimension(stock[0].unit ?? 'ud')] : undefined
  if (serving) await deductItems([{ product_id: entry.drink_product_id, ...serving }], inventory)
  return true
}

async function deductFromInventory(
  recipeId: string,
  userId: string,
  workspaceId: string | null
): Promise<void> {
  const supabase = createClient()

  const { data: ings } = await supabase
    .from('recipe_ingredients')
    .select('*, product:products(tracking)')
    .eq('recipe_id', recipeId)

  // Lo que se echa a ojo no se descuenta: después de cocinar se pregunta cómo quedó (pantryAfterCooking)
  const exact = ((ings ?? []) as RecipeIngredient[]).filter(ing => !isLooseIngredient(ing))
  if (exact.length === 0) return

  await deductItems(exact, await fetchScopedInventory(userId, workspaceId))
}

// ─── Después de cocinar: ¿cómo quedaron los productos a ojo? ──────────────────

export interface PantryUse {
  product: Product
  item: Inventory   // envase en uso: el más gastado
  others: number    // otros envases del mismo producto que aún quedan
}

export async function pantryAfterCooking(
  recipeId: string,
  userId: string,
  workspaceId: string | null
): Promise<PantryUse[]> {
  const { data: ings } = await createClient()
    .from('recipe_ingredients')
    .select('*, product:products(*)')
    .eq('recipe_id', recipeId)

  const products = new Map<string, Product>()
  for (const ing of (ings ?? []) as RecipeIngredient[]) {
    if (ing.product?.tracking === 'pantry') products.set(ing.product_id, ing.product)
  }
  if (products.size === 0) return []

  const inventory = await fetchScopedInventory(userId, workspaceId)
  const uses: PantryUse[] = []
  for (const [productId, product] of products) {
    const rows = sortByExpiry(inventory.filter(i => i.product_id === productId && levelOf(i) !== 'agotado'))
      .sort((a, b) => LEVEL_RANK[levelOf(a)] - LEVEL_RANK[levelOf(b)])
    if (rows.length) uses.push({ product, item: rows[0], others: rows.length - 1 })
  }
  return uses
}

async function fetchScopedInventory(userId: string, workspaceId: string | null): Promise<Inventory[]> {
  let invQuery = createClient().from('inventory').select('*')
  if (workspaceId) {
    invQuery = invQuery.or(workspaceScope(userId, workspaceId))
  } else {
    invQuery = invQuery.eq('user_id', userId).is('workspace_id', null)
  }
  const { data } = await invQuery
  return (data ?? []) as Inventory[]
}

function sortByExpiry(items: Inventory[]): Inventory[] {
  return [...items].sort((a, b) => {
    if (a.expiration_date && b.expiration_date) return a.expiration_date.localeCompare(b.expiration_date)
    if (a.expiration_date) return -1
    if (b.expiration_date) return 1
    return 0
  })
}

// Descuenta cada cantidad de los items compatibles en dimensión, empezando por los que caducan antes
async function deductItems(
  needs: { product_id: string; quantity: number; unit: string }[],
  inventory: Inventory[]
): Promise<void> {
  const supabase = createClient()

  for (const ing of needs) {
    const ingDim = dimension(ing.unit)
    let remaining = toBase(ing.quantity, ing.unit)

    const items = sortByExpiry(inventory
      .filter(i => i.product_id === ing.product_id && dimension(i.unit ?? ing.unit) === ingDim))

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
}
