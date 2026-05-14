'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchProducts, searchProducts, createProduct, updateProduct, deleteProduct } from '@/lib/services/products'
import type { Product, ProductCreate } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Search, Trash2, Edit2, X, ChevronDown, Loader2 } from 'lucide-react'

const PRODUCT_CATEGORIES = ['Frutas', 'Verduras', 'Carnes', 'Lácteos', 'Granos', 'Bebidas', 'Salsas', 'Especias', 'Otros']
const ALLERGEN_LIST = ['Gluten', 'Lácteos', 'Huevos', 'Frutos secos', 'Mariscos', 'Pescado', 'Soja', 'Sésamo']
const UNITS = ['g', 'kg', 'ml', 'l', 'ud']

const CATEGORY_COLORS: Record<string, string> = {
  Frutas: 'bg-green-100 text-green-700',
  Verduras: 'bg-emerald-100 text-emerald-700',
  Carnes: 'bg-red-100 text-red-700',
  Lácteos: 'bg-blue-100 text-blue-700',
  Granos: 'bg-amber-100 text-amber-700',
  Bebidas: 'bg-cyan-100 text-cyan-700',
  Salsas: 'bg-orange-100 text-orange-700',
  Especias: 'bg-yellow-100 text-yellow-700',
  Otros: 'bg-gray-100 text-gray-700',
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productos</h1>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo producto</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', ...PRODUCT_CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${categoryFilter === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {cat === 'all' ? 'Todos' : cat}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar productos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><p className="text-4xl mb-2">🛍️</p><p>No hay productos.</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(product => (
            <Card key={product.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{product.name}</h3>
                    {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${CATEGORY_COLORS[product.category] ?? CATEGORY_COLORS.Otros}`}>{product.category}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{product.unit}</span>
                  {product.calories != null && <span>· {product.calories} kcal</span>}
                  {product.protein != null && <span>· P:{product.protein}g</span>}
                  {product.carbs != null && <span>· C:{product.carbs}g</span>}
                  {product.fat != null && <span>· G:{product.fat}g</span>}
                </div>
                {product.allergens.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.allergens.map(a => <Badge key={a} variant="outline" className="text-xs text-orange-600 border-orange-300">{a}</Badge>)}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(product)}><Edit2 className="h-3 w-3 mr-1" /> Editar</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(product.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
          <div className="w-full max-w-md bg-background h-full overflow-y-auto shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
              <h2 className="font-semibold text-lg">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <div className="space-y-1">
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre del producto" />
              </div>
              <div className="space-y-1">
                <Label>Marca</Label>
                <Input value={form.brand ?? ''} onChange={e => setForm(f => ({ ...f, brand: e.target.value || null }))} placeholder="Marca (opcional)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <div className="relative">
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8">
                      {PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Unidad</Label>
                  <div className="relative">
                    <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8">
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Información nutricional</Label>
                <div className="grid grid-cols-2 gap-3">
                  {([['calories', 'Calorías'], ['protein', 'Proteínas (g)'], ['carbs', 'Carbohidratos (g)'], ['fat', 'Grasas (g)']] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input type="number" min={0} value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: +e.target.value || null }))} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Alérgenos</Label>
                <div className="flex flex-wrap gap-2">
                  {ALLERGEN_LIST.map(a => (
                    <button key={a} type="button" onClick={() => toggleAllergen(a)}
                      className={`px-2 py-1 rounded-md text-xs border transition-colors ${form.allergens.includes(a) ? 'bg-orange-100 text-orange-700 border-orange-300' : 'border-input hover:bg-muted'}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 sticky bottom-0 bg-background">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {editing ? 'Guardar cambios' : 'Crear producto'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}