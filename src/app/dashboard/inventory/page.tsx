'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchInventory, fetchInventoryByLocation, createInventoryItem, updateInventoryItem, deleteInventoryItem, reportDamagedItem } from '@/lib/services/inventory'
import { searchProducts, createProduct } from '@/lib/services/products'
import type { Inventory, InventoryCreate, Product } from '@/types'
import { LOCATIONS, INGREDIENT_UNITS } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, Chip, ChipRow, SearchField, Field, NativeSelect, IconAction, SidePanel, CenterModal, EmptyState, LoadingState, StatTile } from '@/components/ui/freedomus'
import { Plus, Trash2, Edit2, Loader2, AlertTriangle, PackageX, ScanLine } from 'lucide-react'
import { ScanReceiptModal } from '@/components/inventory/ScanReceiptModal'

const LOCATION_COLORS: Record<string, string> = {
  Nevera: 'bg-sky text-sky-ink',
  Despensa: 'bg-butter text-butter-ink',
  Congelador: 'bg-mint text-mint-ink',
}

// DB dates come as "YYYY-MM-DD" or a full timestamp; keep only the day so the timezone can't shift it
function toDateInput(dateStr: string | null): string {
  return dateStr ? dateStr.slice(0, 10) : ''
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = parseLocalDate(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / 86400000)
}

function ExpiryBadge({ dateStr }: { dateStr: string | null }) {
  const days = daysUntilExpiry(dateStr)
  const base = 'rounded-full px-2.5 py-0.5 font-semibold'
  if (days === null) return <span className={`${base} bg-sage text-ink-2`}>—</span>
  if (days < 0) return <span className={`${base} bg-danger-soft text-danger`}>Caducado</span>
  if (days <= 7) return <span className={`${base} bg-danger-soft text-danger`}>{days}d</span>
  if (days <= 14) return <span className={`${base} bg-peach text-peach-ink`}>{days}d</span>
  return <span className={`${base} bg-sage text-ink-2`}>{days}d</span>
}

const EMPTY_FORM = {
  product_id: '',
  quantity: '' as string | number,
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
  const [damaged, setDamaged] = useState<Inventory | null>(null)
  const [damagedQty, setDamagedQty] = useState<string | number>('')
  const [reportingDamage, setReportingDamage] = useState(false)
  const [showScan, setShowScan] = useState(false)

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

  const expiringCount = items.filter(i => { const d = daysUntilExpiry(i.expiration_date); return d !== null && d <= 7 }).length

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
      expiration_date: toDateInput(item.expiration_date),
      purchase_date: toDateInput(item.purchase_date),
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
        // Al editar se conserva quién lo creó y su espacio de trabajo; al crear, el servicio usa el actual
        user_id: editing?.user_id ?? userId,
        workspace_id: editing?.workspace_id ?? null,
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

  function openDamaged(item: Inventory) {
    setDamaged(item); setDamagedQty(item.quantity)
  }

  async function handleReportDamaged() {
    const qty = Number(damagedQty)
    if (!damaged || !(qty > 0)) return
    setReportingDamage(true)
    try {
      const updated = await reportDamagedItem(damaged, Math.min(qty, damaged.quantity))
      setItems(prev => updated
        ? prev.map(i => i.id === updated.id ? updated : i)
        : prev.filter(i => i.id !== damaged.id))
      setDamaged(null)
    } finally { setReportingDamage(false) }
  }

  async function handleCreateAndSelectProduct(name: string) {
    if (!userId) return
    const p = await createProduct({ user_id: userId, workspace_id: null, name, brand: null, barcode: null, category: 'Otros', unit: 'g', calories: null, protein: null, carbs: null, fat: null, allergens: [], is_custom: true })
    setSelectedProduct(p); setForm(f => ({ ...f, product_id: p.id })); setProductSearch(p.name); setShowProductDropdown(false)
  }

  return (
    <div className="flex flex-1 flex-col gap-4.5">
      <PageHeader title="Inventario">
        <Button onClick={() => setShowScan(true)} size="sm" variant="outline"><ScanLine className="stroke-[2.4]" /> Escanear compra</Button>
        <Button onClick={openAdd} size="sm"><Plus className="stroke-[2.4]" /> Añadir item</Button>
      </PageHeader>

      <div className="grid max-w-140 grid-cols-3 gap-3">
        <StatTile value={items.length} label="Items" />
        <StatTile value={expiringCount} label="Caducan pronto" tone="danger" />
        <StatTile value={items.length - expiringCount} label="En buen estado" tone="lime" />
      </div>

      <ChipRow>
        {['all', ...LOCATIONS].map(loc => (
          <Chip key={loc} active={locationFilter === loc} onClick={() => setLocationFilter(loc)}>
            {loc === 'all' ? 'Todo' : loc}
          </Chip>
        ))}
      </ChipRow>

      <SearchField placeholder="Buscar por producto..." value={search} onChange={e => setSearch(e.target.value)} />

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState>El inventario está vacío.</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] content-start gap-3.5">
          {filtered.map(item => {
            const days = daysUntilExpiry(item.expiration_date)
            const expiring = days !== null && days <= 7
            return (
              <div key={item.id} className="flex flex-col gap-3.5 rounded-3xl bg-card p-4.5 shadow-card">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-display text-[19px] font-bold">
                      {expiring && <AlertTriangle className="size-4.5 shrink-0 text-danger" />}
                      <h3 className="truncate">{item.product?.name ?? '—'}</h3>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-5">{item.quantity} {item.unit}</p>
                  </div>
                  {item.location && (
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${LOCATION_COLORS[item.location] ?? 'bg-stone text-stone-ink'}`}>{item.location}</span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
                  <ExpiryBadge dateStr={item.expiration_date} />
                  {item.expiration_date ? `Caduca ${parseLocalDate(item.expiration_date).toLocaleDateString('es-ES')}` : 'Sin caducidad'}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => openEdit(item)}><Edit2 /> Editar</Button>
                  <Button size="sm" variant="outline" className="h-9" title="Marcar como dañado" onClick={() => openDamaged(item)}><PackageX /> Dañado</Button>
                  <IconAction tone="danger" onClick={() => handleDelete(item.id)} aria-label="Eliminar"><Trash2 /></IconAction>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showScan && userId && (
        <ScanReceiptModal
          userId={userId}
          onClose={() => setShowScan(false)}
          onImported={() => { setShowScan(false); setLocationFilter('all'); load(userId) }}
        />
      )}

      {damaged && (
        <CenterModal
          eyebrow="Inventario"
          title="Producto dañado"
          onClose={() => setDamaged(null)}
          footer={<>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setDamaged(null)}>Cancelar</Button>
            <Button variant="destructive" size="lg" className="flex-1" onClick={handleReportDamaged} disabled={reportingDamage || !(Number(damagedQty) > 0)}>
              {reportingDamage && <Loader2 className="animate-spin" />}
              Confirmar
            </Button>
          </>}
        >
          <p className="text-sm text-ink-5">
            ¿Cuánto de <span className="font-semibold text-foreground">{damaged.product?.name ?? '—'}</span> se dañó? Se descontará del inventario (tienes {damaged.quantity} {damaged.unit}).
          </p>
          <Field label={`Cantidad dañada (${damaged.unit})`}>
            <Input type="number" min={0} max={damaged.quantity} step="0.1" value={damagedQty} onChange={e => setDamagedQty(e.target.value)} />
          </Field>
        </CenterModal>
      )}

      {showForm && (
        <SidePanel
          eyebrow="Inventario"
          title={editing ? 'Editar item' : 'Añadir al inventario'}
          onClose={() => setShowForm(false)}
          footer={<>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="lg" className="flex-[1.2]" onClick={handleSave} disabled={saving || (!form.product_id && !selectedProduct) || !(Number(form.quantity) > 0)}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? 'Guardar cambios' : 'Añadir'}
            </Button>
          </>}
        >
          {/* Product picker */}
          <div className="relative flex flex-col gap-1.5">
            <Label>Producto *</Label>
            <Input
              value={productSearch}
              onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); setForm(f => ({ ...f, product_id: '' })); setSelectedProduct(null) }}
              onFocus={() => setShowProductDropdown(true)}
              placeholder="Buscar producto..."
            />
            {showProductDropdown && productSearch.trim().length >= 2 && (
              <div className="absolute top-full right-0 left-0 z-20 mt-1.5 max-h-48 overflow-y-auto rounded-2xl bg-card p-1.5 shadow-tile ring-1 ring-canvas">
                {productResults.map(p => (
                  <button key={p.id} className="w-full cursor-pointer rounded-xl px-3 py-2 text-left text-sm hover:bg-sage"
                    onClick={() => { setSelectedProduct(p); setForm(f => ({ ...f, product_id: p.id, unit: p.unit })); setProductSearch(p.name); setShowProductDropdown(false) }}>
                    {p.name} {p.brand ? <span className="text-ink-5">({p.brand})</span> : ''}
                  </button>
                ))}
                {productResults.length === 0 && (
                  <button className="w-full cursor-pointer rounded-xl px-3 py-2 text-left text-sm font-semibold text-leaf hover:bg-sage"
                    onClick={() => handleCreateAndSelectProduct(productSearch.trim())}>
                    + Crear &ldquo;{productSearch.trim()}&rdquo;
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cantidad">
              <Input type="number" min={0} step="0.1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" />
            </Field>
            <Field label="Unidad">
              <NativeSelect value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {INGREDIENT_UNITS.map(u => <option key={u}>{u}</option>)}
              </NativeSelect>
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Ubicación</Label>
            <div className="grid grid-cols-3 gap-2">
              {LOCATIONS.map(loc => (
                <button key={loc} type="button" onClick={() => setForm(f => ({ ...f, location: loc }))}
                  className={`h-11 cursor-pointer rounded-full text-[13.5px] font-semibold transition-colors ${form.location === loc ? 'bg-forest text-lime' : 'bg-sage text-ink-3 hover:bg-sage-deep'}`}>
                  {loc}
                </button>
              ))}
            </div>
          </div>

          <Field label="Fecha de compra">
            <Input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
          </Field>
          <Field label="Fecha de caducidad">
            <Input type="date" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))} />
          </Field>
          <Field label="Precio de compra">
            <Input type="number" min={0} step="0.01" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" />
          </Field>
        </SidePanel>
      )}
    </div>
  )
}
