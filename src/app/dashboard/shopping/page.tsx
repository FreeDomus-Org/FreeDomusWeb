'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchShoppingList, addShoppingListItem, updateShoppingListItem, setShoppingListChecked, deleteShoppingListItems } from '@/lib/services/shoppingList'
import { searchProducts, createProduct } from '@/lib/services/products'
import { fetchInventory } from '@/lib/services/inventory'
import type { Product, ShoppingListItem } from '@/types'
import { PRODUCT_CATEGORIES, PRODUCT_UNITS, PANTRY_CATEGORIES, INGREDIENT_UNITS, LOOSE_UNITS } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, Eyebrow, Field, NativeSelect, IconAction, CenterModal, EmptyState, LoadingState } from '@/components/ui/freedomus'
import { ScanReceiptModal } from '@/components/inventory/ScanReceiptModal'
import { cn } from '@/lib/utils'
import { AlertTriangle, Check, CheckCircle2, Loader2, Pencil, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react'

// En la lista no tienen sentido "pizca" ni "al gusto"
const LIST_UNITS = INGREDIENT_UNITS.filter(u => !LOOSE_UNITS.includes(u))

const categoryOrder = (category: string) => {
  const i = PRODUCT_CATEGORIES.indexOf(category)
  return i === -1 ? PRODUCT_CATEGORIES.length : i
}

// Lo pendiente agrupado por categoría (como los pasillos del súper), en el orden del catálogo
function groupByCategory(items: ShoppingListItem[]): [string, ShoppingListItem[]][] {
  const groups = new Map<string, ShoppingListItem[]>()
  for (const item of items) {
    const category = item.product?.category ?? 'Otros'
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  return [...groups.entries()].sort(([a], [b]) => categoryOrder(a) - categoryOrder(b) || a.localeCompare(b))
}

const amountLabel = (item: ShoppingListItem) => item.quantity ? `${item.quantity} ${item.unit ?? ''}`.trim() : null

const EMPTY_PRODUCT = { name: '', brand: '', category: 'Otros', unit: 'ud' }

function ItemRow({ item, onToggle, onEdit, onRemove }: {
  item: ShoppingListItem
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const meta = [amountLabel(item), item.product?.brand].filter(Boolean).join(' · ')
  return (
    <div className={cn('flex items-center gap-1.5 rounded-[18px] pr-2.5 transition-colors', item.checked ? 'bg-lime/45' : 'bg-card shadow-card')}>
      <button type="button" onClick={onToggle} aria-pressed={item.checked}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pl-3.5 text-left">
        <span className={cn('grid size-6.5 shrink-0 place-items-center rounded-full border-2 transition-colors', item.checked ? 'border-forest bg-forest text-lime' : 'border-ink-6')}>
          {item.checked && <Check className="size-3.5 stroke-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px] font-semibold', item.checked && 'text-ink-4 line-through decoration-ink-6')}>{item.product?.name ?? '—'}</span>
          {meta && <span className="block truncate text-xs text-ink-5">{meta}</span>}
        </span>
      </button>
      {!item.checked && <IconAction size="sm" onClick={onEdit} aria-label="Cambiar cantidad"><Pencil /></IconAction>}
      <IconAction size="sm" tone="danger" onClick={onRemove} aria-label="Quitar de la lista"><Trash2 /></IconAction>
    </div>
  )
}

export default function ShoppingListPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [runningLow, setRunningLow] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<{ term: string; products: Product[] } | null>(null)
  const [editing, setEditing] = useState<ShoppingListItem | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editUnit, setEditUnit] = useState('ud')
  const [newProduct, setNewProduct] = useState<typeof EMPTY_PRODUCT | null>(null)
  const [saving, setSaving] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    try {
      const [list, inventory] = await Promise.all([fetchShoppingList(uid), fetchInventory(uid)])
      setItems(list)
      // Lo que se echa a ojo y está en "queda poco" o "agotado" (sin otro envase lleno) se sugiere
      const pantry = new Map<string, { product: Product; stocked: boolean }>()
      for (const row of inventory) {
        if (!row.product || !row.stock_level) continue
        const stocked = row.stock_level === 'lleno' || row.stock_level === 'medio'
        pantry.set(row.product_id, { product: row.product, stocked: stocked || !!pantry.get(row.product_id)?.stocked })
      }
      setRunningLow([...pantry.values()].filter(p => !p.stocked).map(p => p.product))
    } catch (e) {
      console.error(e)
      setError('No se pudo cargar la lista de compras.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (uid) { setUserId(uid); load(uid) }
    })
  }, [load])

  useEffect(() => {
    const term = search.trim()
    if (!userId || term.length < 2) return
    const timer = setTimeout(async () => {
      setFound({ term, products: await searchProducts(userId, term).catch(() => []) })
    }, 250)
    return () => clearTimeout(timer)
  }, [search, userId])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const onList = useMemo(() => new Map(items.map(i => [i.product_id, i])), [items])
  const pending = items.filter(i => !i.checked)
  const inCart = items.filter(i => i.checked)
  const suggestions = runningLow.filter(p => !onList.has(p.id))
  const term = search.trim()
  // Resultados del término actual; mientras llegan, se está buscando
  const searching = term.length >= 2 && found?.term !== term
  const results = found?.term === term ? found.products : []
  const exactMatch = results.some(p => p.name.toLowerCase() === term.toLowerCase())

  function fail(e: unknown, message: string) {
    console.error(e)
    setError(message)
  }

  async function handleAdd(product: Product) {
    if (!userId) return
    setSearch('')
    const existing = onList.get(product.id)
    if (existing) {
      // Ya estaba: si iba en el carrito vuelve a "por comprar"
      if (existing.checked) toggle(existing)
      return
    }
    try {
      const item = await addShoppingListItem({ user_id: userId, workspace_id: null, product_id: product.id, quantity: null, unit: product.unit })
      setItems(prev => [...prev, item])
    } catch (e) {
      // 23505: otra persona del hogar lo apuntó a la vez
      if ((e as { code?: string }).code === '23505') setItems(await fetchShoppingList(userId))
      else fail(e, 'No se pudo añadir a la lista. Revisa tu conexión.')
    }
  }

  async function toggle(item: ShoppingListItem) {
    const checked = !item.checked
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked } : i))
    try {
      await setShoppingListChecked([item.id], checked)
    } catch (e) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: item.checked } : i))
      fail(e, 'No se pudo actualizar. Revisa tu conexión.')
    }
  }

  async function remove(item: ShoppingListItem) {
    setItems(prev => prev.filter(i => i.id !== item.id))
    try {
      await deleteShoppingListItems([item.id])
    } catch (e) {
      setItems(prev => [...prev, item])
      fail(e, 'No se pudo quitar de la lista. Revisa tu conexión.')
    }
  }

  function openEdit(item: ShoppingListItem) {
    setEditing(item)
    setEditQty(item.quantity ? String(item.quantity) : '')
    setEditUnit(item.unit ?? item.product?.unit ?? 'ud')
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    try {
      const updated = await updateShoppingListItem(editing.id, { quantity: Number(editQty) > 0 ? Number(editQty) : null, unit: editUnit })
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
      setEditing(null)
    } catch (e) {
      fail(e, 'No se pudo guardar la cantidad.')
    } finally { setSaving(false) }
  }

  async function createAndAdd() {
    if (!userId || !newProduct?.name.trim()) return
    setSaving(true)
    try {
      const product = await createProduct({
        user_id: userId, workspace_id: null, name: newProduct.name.trim(), brand: newProduct.brand.trim() || null, barcode: null,
        category: newProduct.category, unit: newProduct.unit, calories: null, protein: null, carbs: null, fat: null, allergens: [], is_custom: true,
        tracking: PANTRY_CATEGORIES.includes(newProduct.category) ? 'pantry' : 'exact',
      })
      setNewProduct(null)
      await handleAdd(product)
    } catch (e) {
      fail(e, 'No se pudo crear el producto.')
    } finally { setSaving(false) }
  }

  // Lo comprado sale de la lista; lo que iba en el carrito y se quitó al revisar vuelve a "por comprar"
  async function handleImported(count: number, boughtIds: string[]) {
    if (!userId) return
    setFinishing(false)
    const bought = new Set(boughtIds)
    try {
      await deleteShoppingListItems(boughtIds)
      await setShoppingListChecked(inCart.filter(i => !bought.has(i.id)).map(i => i.id), false)
      setNotice(`Listo: ${count} ${count === 1 ? 'producto pasó' : 'productos pasaron'} al inventario.`)
    } catch (e) {
      fail(e, 'La compra quedó en el inventario, pero no se pudo limpiar la lista. Quita a mano lo que ya compraste.')
    }
    load(userId)
  }

  return (
    <div className="flex flex-1 flex-col gap-4.5">
      <PageHeader title="Lista de compras" subtitle={loading ? undefined : `${pending.length} por comprar · ${inCart.length} en el carrito`} />

      {notice && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-mint px-4 py-3 text-sm text-mint-ink">
          <CheckCircle2 className="size-4 shrink-0" /> <span className="flex-1">{notice}</span>
          <button type="button" className="cursor-pointer" onClick={() => setNotice(null)} aria-label="Cerrar"><X className="size-4" /></button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0" /> <span className="flex-1">{error}</span>
          <button type="button" className="cursor-pointer" onClick={() => setError(null)} aria-label="Cerrar"><X className="size-4" /></button>
        </div>
      )}

      {/* Buscar en el catálogo y apuntar */}
      <div className="relative">
        <div className="flex h-12 items-center gap-2.5 rounded-full bg-card px-4 shadow-field">
          <Search className="size-4.5 shrink-0 text-ink-4" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setSearch('') }}
            placeholder="¿Qué hace falta? Busca un producto…" aria-label="Buscar producto para la lista"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-ink-5" />
          {searching && <Loader2 className="size-4 shrink-0 animate-spin text-leaf" />}
          {search && !searching && (
            <button type="button" className="cursor-pointer text-ink-5" onClick={() => setSearch('')} aria-label="Borrar búsqueda"><X className="size-4" /></button>
          )}
        </div>

        {term.length >= 2 && !searching && (
          <div className="absolute top-full right-0 left-0 z-20 mt-1.5 max-h-80 overflow-y-auto rounded-2xl bg-card p-1.5 shadow-tile ring-1 ring-canvas">
            {results.map(p => {
              const listed = onList.get(p.id)
              return (
                <button key={p.id} type="button" onClick={() => handleAdd(p)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-sage">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-xs text-ink-5">{[p.brand, p.category].filter(Boolean).join(' · ')}</span>
                  </span>
                  {listed
                    ? <span className="shrink-0 rounded-full bg-sage px-2.5 py-0.5 text-[11px] font-semibold text-ink-3">{listed.checked ? 'En el carrito' : 'Ya en la lista'}</span>
                    : <Plus className="size-4 shrink-0 text-leaf" />}
                </button>
              )
            })}
            {!exactMatch && (
              <button type="button" onClick={() => { setNewProduct({ ...EMPTY_PRODUCT, name: term }); setSearch('') }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-leaf hover:bg-sage">
                <Plus className="size-4 shrink-0" /> Crear &ldquo;{term}&rdquo; como producto nuevo
              </button>
            )}
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2 px-1">
          <p className="text-[13px] font-semibold text-ink-3">Se está acabando en casa</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(p => (
              <button key={p.id} type="button" onClick={() => handleAdd(p)}
                className="flex cursor-pointer items-center gap-1 rounded-full bg-card px-3 py-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-card/70">
                <Plus className="size-3.5" /> {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState>Tu lista está vacía. Busca arriba lo que haga falta.</EmptyState>
      ) : <>
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-2 px-1 font-display text-lg font-bold">
            Por comprar <span className="text-sm font-medium text-ink-5">{pending.length}</span>
          </h2>
          {pending.length === 0 ? (
            <p className="px-1 text-sm text-ink-5">Ya tienes todo en el carrito.</p>
          ) : groupByCategory(pending).map(([category, group]) => (
            <div key={category} className="flex flex-col gap-1.5">
              <Eyebrow className="px-1 pt-1">{category}</Eyebrow>
              {group.map(item => (
                <ItemRow key={item.id} item={item} onToggle={() => toggle(item)} onEdit={() => openEdit(item)} onRemove={() => remove(item)} />
              ))}
            </div>
          ))}
        </section>

        {inCart.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h2 className="flex items-baseline gap-2 px-1 font-display text-lg font-bold">
              En el carrito <span className="text-sm font-medium text-ink-5">{inCart.length}</span>
            </h2>
            {inCart.map(item => (
              <ItemRow key={item.id} item={item} onToggle={() => toggle(item)} onEdit={() => openEdit(item)} onRemove={() => remove(item)} />
            ))}
          </section>
        )}
      </>}

      {inCart.length > 0 && (
        <div className="sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-10 mt-auto pt-2">
          <Button size="lg" className="w-full shadow-drawer" onClick={() => setFinishing(true)}>
            <ShoppingCart /> Comprado · {inCart.length} {inCart.length === 1 ? 'producto' : 'productos'}
          </Button>
        </div>
      )}

      {finishing && userId && (
        <ScanReceiptModal
          userId={userId}
          shoppingItems={inCart.filter(i => i.product)}
          onClose={() => setFinishing(false)}
          onImported={handleImported}
        />
      )}

      {editing && (
        <CenterModal
          eyebrow="Lista de compras"
          title={editing.product?.name ?? 'Producto'}
          onClose={() => setEditing(null)}
          footer={<>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="lg" className="flex-1" onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Guardar
            </Button>
          </>}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad" hint="opcional">
              <Input type="number" min={0} step="any" inputMode="decimal" value={editQty} onChange={e => setEditQty(e.target.value)} placeholder="—" autoFocus />
            </Field>
            <Field label="Unidad">
              <NativeSelect value={editUnit} onChange={e => setEditUnit(e.target.value)}>
                {LIST_UNITS.map(u => <option key={u}>{u}</option>)}
              </NativeSelect>
            </Field>
          </div>
        </CenterModal>
      )}

      {newProduct && (
        <CenterModal
          eyebrow="Productos"
          title="Nuevo producto"
          subtitle="Se guarda en tus productos y se apunta en la lista"
          onClose={() => setNewProduct(null)}
          footer={<>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setNewProduct(null)}>Cancelar</Button>
            <Button size="lg" className="flex-[1.3]" onClick={createAndAdd} disabled={saving || !newProduct.name.trim()}>
              {saving && <Loader2 className="animate-spin" />} Crear y añadir
            </Button>
          </>}
        >
          <Field label="Nombre *">
            <Input value={newProduct.name} onChange={e => setNewProduct(p => p && { ...p, name: e.target.value })} placeholder="Nombre del producto" autoFocus />
          </Field>
          <Field label="Marca" hint="opcional">
            <Input value={newProduct.brand} onChange={e => setNewProduct(p => p && { ...p, brand: e.target.value })} placeholder="Marca" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <NativeSelect value={newProduct.category} onChange={e => setNewProduct(p => p && { ...p, category: e.target.value })}>
                {PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Unidad">
              <NativeSelect value={newProduct.unit} onChange={e => setNewProduct(p => p && { ...p, unit: e.target.value })}>
                {PRODUCT_UNITS.map(u => <option key={u}>{u}</option>)}
              </NativeSelect>
            </Field>
          </div>
        </CenterModal>
      )}
    </div>
  )
}
