import { createClient } from '@/lib/supabase/client'
import type { Product, ShoppingListItem, ShoppingListItemCreate } from '@/types'
import { currentWorkspaceId, workspaceScope } from '@/lib/workspace'

const SELECT = '*, product:products(*)'

// Lista del espacio de trabajo (compartida) más lo personal que quede del usuario, en el orden en que se apuntó
export async function fetchShoppingList(userId: string, workspaceId: string | null = currentWorkspaceId()): Promise<ShoppingListItem[]> {
  let query = createClient().from('shopping_list_items').select(SELECT).order('created_at')
  query = workspaceId ? query.or(workspaceScope(userId, workspaceId)) : query.eq('user_id', userId).is('workspace_id', null)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ShoppingListItem[]
}

// Se apunta en el espacio de trabajo actual salvo que se indique otro
export async function addShoppingListItem(item: ShoppingListItemCreate): Promise<ShoppingListItem> {
  const { data, error } = await createClient()
    .from('shopping_list_items')
    .insert({ ...item, workspace_id: item.workspace_id ?? currentWorkspaceId() })
    .select(SELECT)
    .single()
  if (error) throw error
  return data as ShoppingListItem
}

// Apunta un producto que se acabó; si ya estaba en la lista se deja como está
export async function ensureOnShoppingList(userId: string, product: Pick<Product, 'id' | 'unit'>, workspaceId: string | null = currentWorkspaceId()): Promise<void> {
  const { error } = await createClient()
    .from('shopping_list_items')
    .insert({ user_id: userId, workspace_id: workspaceId, product_id: product.id, quantity: null, unit: product.unit })
  if (error && error.code !== '23505') throw error // 23505: ya está en la lista
}

export async function updateShoppingListItem(id: string, updates: Partial<Pick<ShoppingListItem, 'quantity' | 'unit' | 'checked'>>): Promise<ShoppingListItem> {
  const { data, error } = await createClient()
    .from('shopping_list_items')
    .update(updates)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return data as ShoppingListItem
}

export async function setShoppingListChecked(ids: string[], checked: boolean): Promise<void> {
  if (ids.length === 0) return
  const { error } = await createClient().from('shopping_list_items').update({ checked }).in('id', ids)
  if (error) throw error
}

export async function deleteShoppingListItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await createClient().from('shopping_list_items').delete().in('id', ids)
  if (error) throw error
}
