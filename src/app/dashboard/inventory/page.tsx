'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchInventory, fetchInventoryByLocation, createInventoryItem, updateInventoryItem, deleteInventoryItem } from '@/lib/services/inventory'
import { searchProducts, createProduct } from '@/lib/services/products'
import type { Inventory, InventoryCreate, Product } from '@/types'
import { LOCATIONS, INGREDIENT_UNITS } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Search, Trash2, Edit2, X, ChevronDown, Loader2, AlertTriangle } from 'lucide-react'

const LOCATION_COLORS: Record<string, string> = {
  Nevera: 'bg-blue-100 text-blue-700',
  Despensa: 'bg-orange-100 text-orange-700',
  Congelador: 'bg-cyan-100 text-cyan-700',
}

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / 86400000)
}

function ExpiryBadge({ dateStr }: { dateStr: string | null }) {
  const days = daysUntilExpiry(dateStr)
  if (days === null) return null
  if (days < 0) return <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">Caducado</Badge>
  if (days <= 7) return <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">{days}d</Badge>
  if (days <= 14) return <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-xs">{days}d</Badge>
  return <Badge variant="outline" className="text-xs">{days}d</Badge>
}

const EMPTY_FORM = {
  product_id: '',
  quantity: 1,
  unit: 'g' as string,
  location: 'Nevera' as string,
  expiration_date: '',
  purchase_date: '',
  purchase_price: '' as string | number,
}

export default function InventoryPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<Inventory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Inventory | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showProductDropdown, setShowProductDropdown] = useState(false)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    try { setItems(await fetchInventory(uid)) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (uid) { setUserId(uid); load(uid) }
    })
  }, [load])

  useEffect(() => {
    if (!userId) return
    const timer = setTimeout(async () => {
      if (locationFilter !== 'all') setItems(await fetchInventoryByLocation(userId, locationFilter))
      else load(userId)
    }, 0)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, userId])

  useEffect(() => {
    if (!userId || productSearch.trim().length < 2) { setProductResults([]); return }
    const timer = setTimeout(async () => {
      setProductResults(await searchProducts(userId, productSearch.trim()))
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch, userId])

  const filtered = items.filter(i => {
    const name = i.product?.name ?? ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  function openAdd() {
    setEditing(null); setForm(EMPTY_FORM); setSelectedProduct(null); setProductSearch(''); setShowForm(true)
  }

  function openEdit(item: Inventory) {
    setEditing(item)
    setForm({
      product_id: item.product_id,
      quantity: item.quantity,
      unit: item.unit ?? 'g',
      location: item.location ?? 'Nevera',
      expiration_date: item.expiration_date ?? '',
      purchase_date: item.purchase_date ?? '',
      purchase_price: item.purchase_price ?? '',
    })
    setSelectedProduct(item.product ?? null)
    setProductSearch(item.product?.name ?? '')
    setShowForm(true)
  }

  async function handleSave() {
    if (!userId || (!form.product_id && !selectedProduct)) return
    setSaving(true)
    try {
      let productId = form.product_id
      if (!productId && selectedProduct) productId = selectedProduct.id
      if (!productId) return

      const payload: InventoryCreate = {
        user_id: userId,
        workspace_id: null,
        product_id: productId,
        quantity: Number(form.quantity),
        unit: form.unit || null,
        location: form.location || null,
        expiration_date: form.expiration_date || null,
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price !== '' ? Number(form.purchase_price) : null,
      }

      if (editing) await updateInventoryItem(editing.id, payload)
      else await createInventoryItem(payload)
      await load(userId)
      setShowForm(false)
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!userId || !confirm('¿Eliminar este elemento del inventario?')) return
    await deleteInventoryItem(id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function handleCreateAndSelectProduct(name: string) {
    if (!userId) return
    const p = await createProduct({ user_id: userId, workspace_id: null, name, brand: null, barcode: null, category: 'Otros', unit: 'g', calories: null, protein: null, carbs: null, fat: null, allergens: [], is_custom: true })
    setSelectedProduct(p); setForm(f => ({ ...f, product_id: p.id })); setProductSearch(p.name); setShowProductDropdown(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventario</h1>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Añadir item</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', ...LOCATIONS].map(loc => (
          <button key={loc} onClick={() => setLocationFilter(loc)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${locationFilter === loc ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {loc === 'all' ? 'Todo' : loc}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por producto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><p className="text-4xl mb-2">🧊</p><p>El inventario está vacío.</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(item => {
            const days = daysUntilExpiry(item.expiration_date)
            const expiring = days !== null && days <= 7
            return (
              <Card key={item.id} className={`hover:shadow-md transition-shadow ${expiring ? 'border-red-300' : ''}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {expiring && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                        <h3 className="font-semibold truncate">{item.product?.name ?? '—'}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.quantity} {item.unit}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${LOCATION_COLORS[item.location ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>{item.location}</span>
                  </div>
                  {item.expiration_date && (
                    <div className="flex items-center gap-2">
                      <ExpiryBadge dateStr={item.expiration_date} />
                      <span className="text-xs text-muted-foreground">{new Date(item.expiration_date).toLocaleDateString('es-ES')}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(item)}><Edit2 className="h-3 w-3 mr-1" /> Editar</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
          <div className="w-full max-w-md bg-background h-full overflow-y-auto shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
              <h2 className="font-semibold text-lg">{editing ? 'Editar item' : 'Añadir al inventario'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-4 flex-1">
              {/* Product picker */}
              <div className="space-y-1 relative">
                <Label>Producto *</Label>
                <Input
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); setForm(f => ({ ...f, product_id: '' })); setSelectedProduct(null) }}
                  onFocus={() => setShowProductDropdown(true)}
                  placeholder="Buscar producto..."
                />
                {showProductDropdown && productSearch.trim().length >= 2 && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-background border rounded-md shadow-md max-h-48 overflow-y-auto mt-1">
                    {productResults.map(p => (
                      <button key={p.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => { setSelectedProduct(p); setForm(f => ({ ...f, product_id: p.id, unit: p.unit })); setProductSearch(p.name); setShowProductDropdown(false) }}>
                        {p.name} {p.brand ? `(${p.brand})` : ''}
                      </button>
                    ))}
                    {productResults.length === 0 && (
                      <button className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted"
                        onClick={() => handleCreateAndSelectProduct(productSearch.trim())}>
                        + Crear &ldquo;{productSearch.trim()}&rdquo;
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Cantidad</Label>
                  <Input type="number" min={0} step="0.1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: +e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Unidad</Label>
                  <div className="relative">
                    <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8">
                      {INGREDIENT_UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Ubicación</Label>
                <div className="flex gap-2">
                  {LOCATIONS.map(loc => (
                    <button key={loc} type="button" onClick={() => setForm(f => ({ ...f, location: loc }))}
                      className={`flex-1 py-1.5 rounded-md text-sm border transition-colors ${form.location === loc ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}>
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Fecha de caducidad</Label>
                <Input type="date" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))} />
              </div>

              <div className="space-y-1">
                <Label>Fecha de compra</Label>
                <Input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
              </div>

              <div className="space-y-1">
                <Label>Precio de compra</Label>
                <Input type="number" min={0} step="0.01" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 sticky bottom-0 bg-background">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || (!form.product_id && !selectedProduct)}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editing ? 'Guardar cambios' : 'Añadir'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}