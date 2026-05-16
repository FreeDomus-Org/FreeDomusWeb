import { createClient } from '@/lib/supabase/client'
import type { RecipeIngredient, RecipeIngredientCreate } from '@/types'

export async function fetchRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
  const { data, error } = await createClient()
    .from('recipe_ingredients')
    .select('*, product:products(*)')
    .eq('recipe_id', recipeId)
  if (error) throw error
  return (data ?? []) as RecipeIngredient[]
}

export async function setRecipeIngredients(recipeId: string, ingredients: Omit<RecipeIngredientCreate, 'recipe_id'>[]): Promise<void> {
  const supabase = createClient()
  await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId)
  if (ingredients.length === 0) return
  const { error } = await supabase.from('recipe_ingredients').insert(
    ingredients.map(i => ({ ...i, recipe_id: recipeId }))
  )
  if (error) throw error
}
