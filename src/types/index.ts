// ─── Recipe ───────────────────────────────────────────────────────────────────
export interface Recipe {
  id: string
  user_id: string
  workspace_id: string | null
  name: string
  meal_type: string
  category: string[]
  ingredients_summary: string | null
  preparation_steps: string | null
  time_minutes: number | null
  difficulty: string | null
  servings: number | null
  total_calories: number | null
  total_price: number | null
  rating: number | null
  allergens: string[]
  image_url: string | null
  is_public: boolean // para publicar por perfil más adelante
  is_favorite: boolean
  created_at: string | null
  updated_at: string | null
}

export type RecipeCreate = Omit<Recipe, 'id' | 'created_at' | 'updated_at'>

export const MEAL_TYPES = ['Desayuno', 'Almuerzo', 'Cena'] as const
export const DIFFICULTIES = ['Fácil', 'Media', 'Difícil'] as const
export const DEFAULT_CATEGORIES = ['Pasta', 'Casera', 'Dieta', 'Frío', 'Ensalada', 'Vegetariana', 'Rápida']
export const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'l', 'ud', 'cda', 'cdta', 'taza', 'pizca', 'rebanada', 'al gusto']
// Unidades que se echan a ojo: nunca se descuentan del inventario
export const LOOSE_UNITS = ['pizca', 'al gusto']

// ─── Product ──────────────────────────────────────────────────────────────────
// exact: se cuenta o se pesa · pantry: se echa a ojo (sal, especias, salsas...) y se lleva por nivel
export type ProductTracking = 'exact' | 'pantry'
export const PANTRY_CATEGORIES = ['Salsas', 'Especias', 'Azúcares']

export interface Product {
  id: string
  user_id: string
  workspace_id: string | null
  name: string
  brand: string | null
  barcode: string | null
  category: string
  unit: string
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  allergens: string[]
  is_custom: boolean
  tracking: ProductTracking
  created_at: string
}

export type ProductCreate = Omit<Product, 'id' | 'created_at' | 'tracking'> & { tracking?: ProductTracking }

// ─── Inventory ────────────────────────────────────────────────────────────────
export interface Inventory {
  id: string
  user_id: string
  workspace_id: string | null
  product_id: string
  quantity: number
  unit: string | null
  location: string | null
  expiration_date: string | null
  purchase_date: string | null
  purchase_price: number | null
  stock_level: StockLevel | null // solo productos 'pantry'
  updated_at: string | null
  product?: Product
}

export type InventoryCreate = Omit<Inventory, 'id' | 'updated_at' | 'product' | 'stock_level'> & { stock_level?: StockLevel | null }

export const LOCATIONS = ['Nevera', 'Despensa', 'Congelador'] as const

export type StockLevel = 'lleno' | 'medio' | 'poco' | 'agotado'
export const STOCK_LEVELS: { key: StockLevel; label: string }[] = [
  { key: 'lleno', label: 'Lleno' },
  { key: 'medio', label: 'A la mitad' },
  { key: 'poco', label: 'Queda poco' },
  { key: 'agotado', label: 'Agotado' },
]

// ─── Shopping List ────────────────────────────────────────────────────────────
export interface ShoppingListItem {
  id: string
  user_id: string
  workspace_id: string | null
  product_id: string
  quantity: number | null // null = sin cantidad
  unit: string | null
  checked: boolean // ya va en el carrito
  created_at: string
  product?: Product
}

export type ShoppingListItemCreate = Omit<ShoppingListItem, 'id' | 'created_at' | 'product' | 'checked'>

export const PRODUCT_CATEGORIES = ['Frutas', 'Verduras', 'Carnes', 'Lácteos', 'Granos', 'Bebidas', 'Salsas', 'Especias', 'Azúcares', 'Harinas', 'Otros']
export const PRODUCT_UNITS = ['g', 'kg', 'ml', 'l', 'ud']

// ─── Weekly Planner ───────────────────────────────────────────────────────────
export interface WeeklyPlanner {
  id: string
  user_id: string
  workspace_id: string | null
  week_start_date: string
  day_of_week: number // 0=Mon … 6=Sun
  meal_type: string   // 'desayuno' | 'almuerzo' | 'cena'
  recipe_id: string | null
  notes: string | null
  for_user_id: string | null // null = plato para todo el espacio de trabajo
  drink_product_id: string | null // bebida de la comida (producto del catálogo)
  drink_taken_by: string[] // usuarios que ya se la tomaron (una ración del inventario cada uno)
  leftover_history_id: string | null // comida de sobras: el registro del historial del que salen
  leftovers_eaten_by: string[] // usuarios que ya se comieron su porción de las sobras
  created_at: string
  recipe?: Recipe
  drink?: Product | null
  leftover?: Pick<CookingHistory, 'id' | 'leftover_servings' | 'cooked_at'> | null
}

export type WeeklyPlannerCreate = Omit<WeeklyPlanner, 'id' | 'created_at' | 'recipe' | 'drink' | 'leftover' | 'for_user_id' | 'drink_product_id' | 'drink_taken_by' | 'leftover_history_id' | 'leftovers_eaten_by'> & { for_user_id?: string | null; drink_product_id?: string | null; leftover_history_id?: string | null }

// ─── Cooking History ──────────────────────────────────────────────────────────
export interface CookingHistory {
  id: string
  user_id: string
  workspace_id: string | null
  recipe_id: string
  cooked_at: string
  servings: number | null // porciones preparadas
  leftover_servings?: number // porciones guardadas que aún no se han comido (sobras)
  rating: number | null
  feedback: string | null
  actual_time_minutes: number | null
  meal_type?: 'desayuno' | 'almuerzo' | 'cena' | null // comida en la que se cocinó (null en registros antiguos)
  planner_entry_id?: string | null
  created_at: string
  recipe?: Recipe
}

export type CookingHistoryCreate = Omit<CookingHistory, 'id' | 'created_at' | 'recipe'>

// ─── Drink History ────────────────────────────────────────────────────────────
// Bebida preparada fuera de una comida (p. ej. un café), con lo que se tardó
export interface DrinkHistory {
  id: string
  user_id: string
  workspace_id: string | null
  product_id: string
  prepared_at: string
  duration_seconds: number | null
  created_at: string
  product?: Product
}

// ─── Recipe Ingredient ────────────────────────────────────────────────────────
export interface RecipeIngredient {
  id: string
  recipe_id: string
  product_id: string
  quantity: number
  unit: string
  notes: string | null
  product?: Product
}

export type RecipeIngredientCreate = Omit<RecipeIngredient, 'id' | 'product'>

// ─── Household Task ───────────────────────────────────────────────────────────
export type TaskPriority = 'baja' | 'media' | 'alta'
export type TaskStatus = 'pendiente' | 'en_progreso' | 'completada'
export type TaskCategory = 'limpieza' | 'cocina' | 'compras' | 'mantenimiento' | 'jardineria' | 'otro'

export interface HouseholdTask {
  id: string
  user_id: string
  workspace_id: string | null
  title: string
  description: string | null
  category: TaskCategory
  priority: TaskPriority
  status: TaskStatus
  assigned_to: string | null
  due_date: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  estimated_minutes: number | null
  created_at: string
  updated_at: string
}

export type HouseholdTaskCreate = Omit<HouseholdTask, 'id' | 'created_at' | 'updated_at'>

// ─── Workspace ────────────────────────────────────────────────────────────────
export type WorkspaceRole = 'owner' | 'admin' | 'member'
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired'

export interface Workspace {
  id: string
  owner_id: string
  name: string
  slug: string
  icon: string | null
  created_at: string
  updated_at: string
}

export type WorkspaceCreate = Pick<Workspace, 'name' | 'slug' | 'icon'>

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  joined_at: string
  email?: string
  full_name?: string
}

export interface WorkspaceInvitation {
  id: string
  workspace_id: string
  invited_by: string
  invited_email: string
  role: WorkspaceRole
  token: string
  status: InvitationStatus
  expires_at: string
  created_at: string
}

// ─── App Currency ─────────────────────────────────────────────────────────────
export const CURRENCIES = [
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'Dólar estadounidense' },
  { code: 'GBP', symbol: '£', name: 'Libra esterlina' },
  { code: 'COP', symbol: '$', name: 'Peso colombiano' },
  { code: 'MXN', symbol: '$', name: 'Peso mexicano' },
  { code: 'ARS', symbol: '$', name: 'Peso argentino' },
  { code: 'CLP', symbol: '$', name: 'Peso chileno' },
  { code: 'PEN', symbol: 'S/', name: 'Sol peruano' },
  { code: 'BRL', symbol: 'R$', name: 'Real brasileño' },
  { code: 'CHF', symbol: 'CHF', name: 'Franco suizo' },
  { code: 'JPY', symbol: '¥', name: 'Yen japonés' },
] as const

export function currencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code
}
