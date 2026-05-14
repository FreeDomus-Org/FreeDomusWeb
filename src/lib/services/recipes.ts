import { createClient } from '@/lib/supabase/client'
import type { Recipe, RecipeCreate } from '@/types'

export async function fetchRecipes(userId: string, workspaceId?: string | null): Promise<Recipe[]> {
  const supabase = createClient()
  let query = supabase.from('recipes').select('*').order('created_at', { ascending: false })

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId)
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createRecipe(recipe: RecipeCreate): Promise<Recipe> {
  const { data, error } = await createClient().from('recipes').insert(recipe).select().single()
  if (error) throw error
  return data
}

export async function updateRecipe(id: string, updates: Partial<RecipeCreate>): Promise<Recipe> {
  const { data, error } = await createClient().from('recipes').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await createClient().from('recipes').delete().eq('id', id)
  if (error) throw error
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
  const { error } = await createClient().from('recipes').update({ is_favorite: isFavorite }).eq('id', id)
  if (error) throw error
}
