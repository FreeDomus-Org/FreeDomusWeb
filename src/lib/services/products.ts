import { createClient } from '@/lib/supabase/client'
import type { Product, ProductCreate } from '@/types'

export async function fetchProducts(userId: string, workspaceId?: string | null): Promise<Product[]> {
  const supabase = createClient()
  let query = supabase.from('products').select('*').order('name')

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId)
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function searchProducts(userId: string, term: string): Promise<Product[]> {
  const { data, error } = await createClient()
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', `%${term}%`)
    .order('name')
    .limit(20)

  if (error) throw error
  return data ?? []
}

export async function createProduct(product: ProductCreate): Promise<Product> {
  const { data, error } = await createClient().from('products').insert(product).select().single()
  if (error) throw error
  return data
}

export async function updateProduct(id: string, updates: Partial<ProductCreate>): Promise<Product> {
  const { data, error } = await createClient().from('products').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await createClient().from('products').delete().eq('id', id)
  if (error) throw error
}
