import { createClient } from '@/lib/supabase/client'
import type { Product, ProductCreate } from '@/types'
import { currentWorkspaceId, workspaceScope } from '@/lib/workspace'

export async function fetchProducts(userId: string, workspaceId: string | null = currentWorkspaceId()): Promise<Product[]> {
  const supabase = createClient()
  let query = supabase.from('products').select('*').order('name')

  if (workspaceId) {
    query = query.or(workspaceScope(userId, workspaceId))
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function searchProducts(userId: string, term: string): Promise<Product[]> {
  const workspaceId = currentWorkspaceId()
  let query = createClient().from('products').select('*')
  query = workspaceId ? query.or(workspaceScope(userId, workspaceId)) : query.eq('user_id', userId)
  const { data, error } = await query
    .ilike('name', `%${term}%`)
    .order('name')
    .limit(20)

  if (error) throw error
  return data ?? []
}

// Se crea en el espacio de trabajo actual salvo que se indique otro
export async function createProduct(product: ProductCreate): Promise<Product> {
  const row = { ...product, workspace_id: product.workspace_id ?? currentWorkspaceId() }
  const { data, error } = await createClient().from('products').insert(row).select().single()
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
