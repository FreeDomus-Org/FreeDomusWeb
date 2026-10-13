'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchProducts, searchProducts, createProduct, updateProduct, deleteProduct } from '@/lib/services/products'
import type { Product, ProductCreate } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, Chip, ChipRow, SearchField, Field, NativeSelect, IconAction, SidePanel, EmptyState, LoadingState } from '@/components/ui/freedomus'
import { Plus, Trash2, Edit2, Loader2 } from 'lucide-react'

const PRODUCT_CATEGORIES = ['Frutas', 'Verduras', 'Carnes', 'Lácteos', 'Granos', 'Bebidas', 'Salsas', 'Especias', 'Azúcares', 'Harinas', 'Otros']
const ALLERGEN_LIST = ['Gluten', 'Lácteos', 'Huevos', 'Frutos secos', 'Mariscos', 'Pescado', 'Soja', 'Sésamo']
const UNITS = ['g', 'kg', 'ml', 'l', 'ud']

const CATEGORY_COLORS: Record<string, string> = {
  Frutas: 'bg-peach text-peach-ink',
  Verduras: 'bg-lime text-lime-ink',
  Carnes: 'bg-coral text-coral-ink',
  Lácteos: 'bg-sky text-sky-ink',
  Granos: 'bg-butter text-butter-ink',
  Bebidas: 'bg-mint text-mint-ink',
  Salsas: 'bg-apricot text-apricot-ink',
  Especias: 'bg-lilac text-lilac-ink',
  Azúcares: 'bg-[#fde2ef] text-[#a8326e]',
  Harinas: 'bg-[#f3e8d6] text-[#7a5a2b]',
  Otros: 'bg-stone text-stone-ink',
}

const EMPTY_FORM = {
  workspace_id: null as string | null,
  name: '',
  brand: null as string | null,
  barcode: null as string | null,
  category: 'Otros',
  unit: 'g',
  calories: null as number | null,
  protein: null as number | null,
  carbs: null as number | null,
  fat: null as number | null,
  allergens: [] as string[],
  is_custom: true,
}

export default function ProductsPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    try { setProducts(await fetchProducts(uid)) } finally { setLoading(false) }
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
      if (search.trim().length >= 2) setProducts(await searchProducts(userId, search.trim()))
      else if (search.trim().length === 0) load(userId)
    }, 350)
    return () => clearTimeout(timer)
  }, [search, userId, load])

  const filtered = categoryFilter === 'all' ? products : products.filter(p => p.category === categoryFilter)

  function openAdd() {
    setEditing(null); setForm(EMPTY_FORM); setShowForm(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({ workspace_id: p.workspace_id, name: p.name, brand: p.brand, barcode: p.barcode, category: p.category, unit: p.unit, calories: p.calories, protein: p.protein, carbs: p.carbs, fat: p.fat, allergens: p.allergens, is_custom: p.is_custom })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !userId) return
    setSaving(true)
    try {
      if (editing) await updateProduct(editing.id, form)
      else await createProduct({ ...form, user_id: userId })
      await load(userId)
      setShowForm(false)
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!userId || !confirm('¿Eliminar este producto?')) return
    await deleteProduct(id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  function toggleAllergen(a: string) {
    setForm(f => ({ ...f, allergens: f.allergens.includes(a) ? f.allergens.filter(x => x !== a) : [...f.allergens, a] }))
  }

  return (
    <div className="flex flex-1 flex-col gap-[18px]">
      <PageHeader title="Productos">
        <Button onClick={openAdd} size="sm"><Plus className="stroke-[2.4]" /> Nuevo producto</Button>
      </PageHeader>

      <ChipRow>
        {['all', ...PRODUCT_CATEGORIES].map(cat => (
          <Chip key={cat} active={categoryFilter === cat} onClick={() => setCategoryFilter(cat)}>
            {cat === 'all' ? 'Todos' : cat}
          </Chip>
        ))}
      </ChipRow>

      <SearchField placeholder="Buscar productos..." value={search} onChange={e => setSearch(e.target.value)} />

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState>No hay productos.</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start gap-3">
          {filtered.map(product => {
            const tone = CATEGORY_COLORS[product.category] ?? CATEGORY_COLORS.Otros
            const meta = [
              product.unit,
              product.calories != null && `${product.calories} kcal`,
              product.protein != null && `P:${product.protein}g`,
              product.carbs != null && `C:${product.carbs}g`,
              product.fat != null && `G:${product.fat}g`,
            ].filter(Boolean).join('  ·  ')
            return (
              <div key={product.id} className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-card">
                <div className="flex items-center gap-3">
                  <div className={`grid size-[34px] shrink-0 place-items-center rounded-full font-display text-[15px] font-extrabold ${tone}`}>
                    {product.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-base font-bold">{product.name}</h3>
                    {product.brand && <p className="mt-px truncate text-xs text-ink-5">{product.brand}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>{product.category}</span>
                </div>
                <p className="min-h-4 text-xs whitespace-pre text-ink-2">{meta}</p>
                {product.allergens.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.allergens.map(a => <span key={a} className="rounded-full bg-peach px-2 py-0.5 text-[11px] font-semibold text-peach-ink">{a}</span>)}
                  </div>
                )}
                <div className="mt-auto flex items-center gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(product)}><Edit2 /> Editar</Button>
                  <IconAction tone="danger" size="sm" onClick={() => handleDelete(product.id)} aria-label="Eliminar"><Trash2 /></IconAction>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <SidePanel
          eyebrow="Productos"
          title={editing ? 'Editar producto' : 'Nuevo producto'}
          onClose={() => setShowForm(false)}
          footer={<>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="lg" className="flex-[1.2]" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </>}
        >
          <Field label="Nombre *">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre del producto" />
          </Field>
          <Field label="Marca">
            <Input value={form.brand ?? ''} onChange={e => setForm(f => ({ ...f, brand: e.target.value || null }))} placeholder="Marca (opcional)" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <NativeSelect value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Unidad">
              <NativeSelect value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex flex-col gap-3 rounded-[20px] bg-canvas p-4">
            <p className="font-display text-base font-bold">Información nutricional</p>
            <div className="grid grid-cols-2 gap-2.5">
              {([['calories', 'Calorías'], ['protein', 'Proteínas (g)'], ['carbs', 'Carbohidratos (g)'], ['fat', 'Grasas (g)']] as const).map(([key, label]) => (
                <label key={key} className="flex min-w-0 flex-col gap-1.5 text-xs text-ink-3">
                  {label}
                  <Input type="number" min={0} className="h-10 rounded-xl bg-card px-3 text-sm" value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: +e.target.value || null }))} />
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <Label>Alérgenos</Label>
            <div className="flex flex-wrap gap-2">
              {ALLERGEN_LIST.map(a => (
                <Chip key={a} tone="soft" active={form.allergens.includes(a)} onClick={() => toggleAllergen(a)}>{a}</Chip>
              ))}
            </div>
          </div>
        </SidePanel>
      )}
    </div>
  )
}
