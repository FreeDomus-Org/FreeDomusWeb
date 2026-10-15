import { createClient } from '@/lib/supabase/client'
import type { Inventory, InventoryCreate, Product, StockLevel } from '@/types'
import { currentWorkspaceId, workspaceScope } from '@/lib/workspace'
import { ensureOnShoppingList } from '@/lib/services/shoppingList'

// Inventario del espacio de trabajo (compartido) más lo personal que quede del usuario
export async function fetchInventory(userId: string, workspaceId: string | null = currentWorkspaceId()): Promise<Inventory[]> {
  const supabase = createClient()
  let query = supabase.from('inventory').select('*, product:products(*)').order('updated_at', { ascending: false })

  if (workspaceId) {
    query = query.or(workspaceScope(userId, workspaceId))
  } else {
    query = query.eq('user_id', userId).is('workspace_id', null)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Inventory[]
}

export async function fetchInventoryByLocation(userId: string, location: string): Promise<Inventory[]> {
  const workspaceId = currentWorkspaceId()
  let query = createClient().from('inventory').select('*, product:products(*)')
  query = workspaceId ? query.or(workspaceScope(userId, workspaceId)) : query.eq('user_id', userId)
  const { data, error } = await query
    .eq('location', location)
    .order('expiration_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as Inventory[]
}

export async function fetchExpiringItems(userId: string, daysAhead = 7): Promise<Inventory[]> {
  const limit = new Date()
  limit.setDate(limit.getDate() + daysAhead)

  const { data, error } = await createClient()
    .from('inventory')
    .select('*, product:products(*)')
    .eq('user_id', userId)
    .not('expiration_date', 'is', null)
    .lte('expiration_date', limit.toISOString())
    .order('expiration_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as Inventory[]
}

// Se crea en el espacio de trabajo actual salvo que se indique otro
export async function createInventoryItem(item: InventoryCreate): Promise<Inventory> {
  const { data, error } = await createClient()
    .from('inventory')
    .insert({ ...item, workspace_id: item.workspace_id ?? currentWorkspaceId() })
    .select('*, product:products(*)')
    .single()
  if (error) throw error
  await clearDepleted([item])
  return data as Inventory
}

// Alta en bloque (importación de una factura escaneada)
export async function createInventoryItems(items: InventoryCreate[]): Promise<void> {
  const workspaceId = currentWorkspaceId()
  const { error } = await createClient()
    .from('inventory')
    .insert(items.map(item => ({ ...item, workspace_id: item.workspace_id ?? workspaceId })))
  if (error) throw error
  await clearDepleted(items)
}

// Al reponer un producto a ojo sobra la fila "agotado" que lo tenía en "Por reponer"
async function clearDepleted(items: InventoryCreate[]): Promise<void> {
  const productIds = [...new Set(items.filter(i => i.stock_level && i.stock_level !== 'agotado').map(i => i.product_id))]
  if (productIds.length === 0) return
  const { error } = await createClient()
    .from('inventory')
    .delete()
    .in('product_id', productIds)
    .eq('stock_level', 'agotado')
  if (error) throw error
}

// Nivel de un producto a ojo. Si se acaba un envase pero quedan otros, ese envase se borra;
// si era el último se queda como "agotado" para que salga en "Por reponer" y se apunta en la lista de compras.
export async function setStockLevel(userId: string, item: Inventory, level: StockLevel, othersInStock: number): Promise<Inventory | null> {
  if (level === 'agotado' && othersInStock > 0) {
    await deleteInventoryItem(item.id)
    return null
  }
  const updated = await updateInventoryItem(item.id, { stock_level: level })
  if (level === 'agotado') await ensureOnShoppingList(userId, { id: item.product_id, unit: item.unit ?? 'ud' })
  return updated
}

// "Se acabó": se quita todo lo que hay del producto y se apunta en la lista de compras.
// Si es a ojo se deja una fila "agotado" para que salga en "Por reponer".
export async function markProductOut(userId: string, product: Product, workspaceId: string | null = currentWorkspaceId()): Promise<void> {
  const supabase = createClient()
  let query = supabase.from('inventory').select('id').eq('product_id', product.id)
  query = workspaceId ? query.or(workspaceScope(userId, workspaceId)) : query.eq('user_id', userId).is('workspace_id', null)
  const { data, error } = await query
  if (error) throw error

  const ids = (data ?? []).map(row => row.id as string)
  const keep = product.tracking === 'pantry' ? ids.shift() : undefined
  if (keep) {
    const { error: updateError } = await supabase.from('inventory').update({ stock_level: 'agotado' }).eq('id', keep)
    if (updateError) throw updateError
  }
  if (ids.length) {
    const { error: deleteError } = await supabase.from('inventory').delete().in('id', ids)
    if (deleteError) throw deleteError
  }
  await ensureOnShoppingList(userId, product, workspaceId)
}

export async function updateInventoryItem(id: string, updates: Partial<InventoryCreate>): Promise<Inventory> {
  const { data, error } = await createClient()
    .from('inventory')
    .update(updates)
    .eq('id', id)
    .select('*, product:products(*)')
    .single()
  if (error) throw error
  return data as Inventory
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await createClient().from('inventory').delete().eq('id', id)
  if (error) throw error
}

// Removes a damaged quantity from stock; deletes the row when nothing is left
export async function reportDamagedItem(item: Inventory, damagedQuantity: number): Promise<Inventory | null> {
  const remaining = Math.round((item.quantity - damagedQuantity) * 1000) / 1000
  if (remaining <= 0) {
    await deleteInventoryItem(item.id)
    return null
  }
  return updateInventoryItem(item.id, { quantity: remaining })
}
