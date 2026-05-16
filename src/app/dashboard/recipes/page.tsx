'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchRecipes, createRecipe, updateRecipe, deleteRecipe, toggleFavorite } from '@/lib/services/recipes'
import { setRecipeIngredients } from '@/lib/services/recipeIngredients'
import { fetchProducts } from '@/lib/services/products'
import RecipeDetailPanel from '@/components/recipes/RecipeDetailPanel'
import type { Recipe, RecipeCreate, Product } from '@/types'
import { MEAL_TYPES, DIFFICULTIES, DEFAULT_CATEGORIES, INGREDIENT_UNITS } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Plus, Search, Star, Heart, Trash2, Edit2, Clock, Users, Flame, X, ChevronDown, Loader2, Eye,
} from 'lucide-react'

type FilterMode = 'all' | 'Desayuno' | 'Almuerzo' | 'Cena' | 'favorites' | 'easy'

const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'Todas', Desayuno: 'Desayuno', Almuerzo: 'Almuerzo',
  Cena: 'Cena', favorites: 'Favoritas', easy: 'Fáciles',
}
const MEAL_EMOJI: Record<string, string> = { Desayuno: '🌅', Almuerzo: '🍽️', Cena: '🌙' }

interface LinkedIngredient {
  product: Product
  quantity: number
  unit: string
  notes: string
}

const EMPTY_FORM: RecipeCreate = {
  user_id: '', workspace_id: null, name: '', meal_type: 'Almuerzo', category: [],
  ingredients_summary: '', preparation_steps: '', time_minutes: 30, difficulty: 'Fácil',
  servings: 2, total_calories: null, total_price: null, rating: null, allergens: [],
  image_url: null, is_favorite: false,
}

export default function RecipesPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [form, setForm] = useState<RecipeCreate>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [stepInput, setStepInput] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [newCat, setNewCat] = useState('')
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null)

  // Ingredientes vinculados a productos
  const [linkedIngredients, setLinkedIngredients] = useState<LinkedIngredient[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [ingQty, setIngQty] = useState('')
  const [ingUnit, setIngUnit] = useState('g')
  const [ingNotes, setIngNotes] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const load = useCallback(async (uid: string, wsId: string | null) => {
    setLoading(true)
    try {
      setRecipes(await fetchRecipes(uid, wsId))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      setUserId(uid)
      const wsId = document.cookie.match(/workspace_id=([^;]+)/)?.[1] ?? null
      setWorkspaceId(wsId)
      load(uid, wsId)
      const prods = await fetchProducts(uid, wsId)
      setProducts(prods)
    })
    const saved = localStorage.getItem('recipeCategories')
    if (saved) setCustomCategories(JSON.parse(saved))
  }, [load])

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories]
  const filtered = recipes.filter(r => {
    if (!r.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'favorites') return r.is_favorite
    if (filter === 'easy') return r.difficulty === 'Fácil'
    if (filter !== 'all') return r.meal_type === filter
    return true
  })

  // Búsqueda de productos para añadir al form
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return }
    const term = productSearch.toLowerCase()
    setProductResults(products.filter(p => p.name.toLowerCase().includes(term)).slice(0, 6))
  }, [productSearch, products])

  function openAdd() {
    setEditing(null); setForm({ ...EMPTY_FORM, user_id: userId ?? '' })
    setSteps([]); setLinkedIngredients([]); setShowForm(true)
  }

  function openEdit(r: Recipe) {
    setEditing(r)
    setForm({
      user_id: r.user_id, workspace_id: r.workspace_id, name: r.name, meal_type: r.meal_type,
      category: r.category, ingredients_summary: r.ingredients_summary ?? '',
      preparation_steps: r.preparation_steps ?? '', time_minutes: r.time_minutes ?? 30,
      difficulty: r.difficulty ?? 'Fácil', servings: r.servings ?? 2,
      total_calories: r.total_calories, total_price: r.total_price, rating: r.rating,
      allergens: r.allergens, image_url: r.image_url, is_favorite: r.is_favorite,
    })
    const parsedSteps = r.preparation_steps?.split('\n').map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean) ?? []
    setSteps(parsedSteps)
    setLinkedIngredients([]) // se cargan aparte si necesitas
    setShowForm(true)
  }

  function addLinkedIngredient() {
    if (!selectedProduct || !ingQty) return
    setLinkedIngredients(prev => [...prev, { product: selectedProduct, quantity: +ingQty, unit: ingUnit, notes: ingNotes }])
    setSelectedProduct(null); setProductSearch(''); setProductResults([]); setIngQty(''); setIngNotes('')
  }

  function removeLinkedIngredient(idx: number) {
    setLinkedIngredients(prev => prev.filter((_, i) => i !== idx))
  }

  function buildSummary() {
    return linkedIngredients.map(i => `${i.quantity} ${i.unit} ${i.product.name}`).join('\n')
  }

  function buildStepsText() {
    return steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
  }

  async function handleSave() {
    if (!form.name.trim() || !userId) return
    setSaving(true)
    try {
      const payload: RecipeCreate = {
        ...form,
        ingredients_summary: buildSummary(),
        preparation_steps: buildStepsText(),
      }
      let recipeId: string
      if (editing) {
        const updated = await updateRecipe(editing.id, payload)
        recipeId = updated.id
      } else {
        const created = await createRecipe(payload)
        recipeId = created.id
      }
      if (linkedIngredients.length > 0) {
        await setRecipeIngredients(recipeId, linkedIngredients.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit: i.unit,
          notes: i.notes || null,
        })))
      }
      await load(userId, workspaceId)
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!userId || !confirm('¿Eliminar esta receta?')) return
    await deleteRecipe(id)
    setRecipes(prev => prev.filter(r => r.id !== id))
  }

  async function handleToggleFavorite(r: Recipe) {
    await toggleFavorite(r.id, !r.is_favorite)
    setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, is_favorite: !x.is_favorite } : x))
  }

  function toggleCategory(cat: string) {
    setForm(f => ({ ...f, category: f.category.includes(cat) ? f.category.filter(c => c !== cat) : [...f.category, cat] }))
  }

  function addCustomCategory() {
    const trimmed = newCat.trim()
    if (!trimmed || allCategories.includes(trimmed)) return
    const updated = [...customCategories, trimmed]
    setCustomCategories(updated)
    localStorage.setItem('recipeCategories', JSON.stringify(updated))
    setForm(f => ({ ...f, category: [...f.category, trimmed] }))
    setNewCat('')
  }

  function addStep() {
    if (!stepInput.trim()) return
    setSteps(s => [...s, stepInput.trim()])
    setStepInput('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recetas</h1>
        <Button onClick={openAdd} size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva receta</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as FilterMode[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar recetas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-2">🍽️</p>
          <p>No hay recetas{search ? ' con ese nombre' : ''}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(recipe => (
            <Card key={recipe.id} className="overflow-hidden hover:shadow-md transition-shadow">
              {recipe.image_url && (
                <div className="h-32 overflow-hidden">
                  <img src={recipe.image_url} alt={recipe.name} className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{recipe.name}</h3>
                    <p className="text-sm text-muted-foreground">{MEAL_EMOJI[recipe.meal_type] ?? ''} {recipe.meal_type}</p>
                  </div>
                  <button onClick={() => handleToggleFavorite(recipe)} className="shrink-0 mt-0.5">
                    <Heart className={`h-4 w-4 ${recipe.is_favorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {recipe.category.slice(0, 3).map(c => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
                  {recipe.difficulty && <Badge variant="outline" className="text-xs">{recipe.difficulty}</Badge>}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {recipe.time_minutes && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{recipe.time_minutes}m</span>}
                  {recipe.servings && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{recipe.servings}</span>}
                  {recipe.total_calories && <span className="flex items-center gap-1"><Flame className="h-3 w-3" />{recipe.total_calories} kcal</span>}
                  {recipe.rating && <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{recipe.rating}</span>}
                </div>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1" onClick={() => setViewingRecipe(recipe)}>
                    <Eye className="h-3 w-3 mr-1" /> Ver receta
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(recipe)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(recipe.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Panel detalle receta */}
      {viewingRecipe && userId && (
        <RecipeDetailPanel
          recipe={viewingRecipe}
          userId={userId}
          workspaceId={workspaceId}
          onClose={() => setViewingRecipe(null)}
          onFinished={() => { load(userId, workspaceId); setViewingRecipe(null) }}
        />
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
          <div className="w-full max-w-xl bg-background h-full overflow-y-auto shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
              <h2 className="font-semibold text-lg">{editing ? 'Editar receta' : 'Nueva receta'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button>
            </div>

            <div className="p-4 space-y-5 flex-1">
              {/* Name */}
              <div className="space-y-1">
                <Label>Nombre *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre de la receta" />
              </div>

              {/* Meal type + Favorite */}
              <div className="flex gap-4">
                <div className="flex-1 space-y-1">
                  <Label>Tipo de comida</Label>
                  <div className="relative">
                    <select value={form.meal_type} onChange={e => setForm(f => ({ ...f, meal_type: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8">
                      {MEAL_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.is_favorite} onChange={e => setForm(f => ({ ...f, is_favorite: e.target.checked }))} className="rounded" />
                    <Heart className="h-4 w-4 text-red-500" /> Favorita
                  </label>
                </div>
              </div>

              {/* Categories */}
              <div className="space-y-2">
                <Label>Categorías</Label>
                <div className="flex flex-wrap gap-2">
                  {allCategories.map(cat => (
                    <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                      className={`px-2 py-1 rounded-md text-xs border transition-colors ${form.category.includes(cat) ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nueva categoría..." className="text-sm h-8" />
                  <Button type="button" size="sm" variant="outline" onClick={addCustomCategory}>Añadir</Button>
                </div>
              </div>

              {/* Ingredientes vinculados al inventario */}
              <div className="space-y-2">
                <Label>Ingredientes <span className="text-xs text-muted-foreground font-normal">(vinculados al inventario)</span></Label>

                {linkedIngredients.map((ing, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted rounded-lg px-3 py-1.5">
                    <span className="flex-1">{ing.quantity} {ing.unit} — {ing.product.name}</span>
                    <button onClick={() => removeLinkedIngredient(i)}><X className="h-3 w-3" /></button>
                  </div>
                ))}

                {/* Buscador de producto */}
                <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={selectedProduct ? selectedProduct.name : productSearch}
                      onChange={e => { setProductSearch(e.target.value); setSelectedProduct(null) }}
                      placeholder="Buscar producto del catálogo..."
                      className="pl-8 text-sm h-8"
                    />
                  </div>
                  {productResults.length > 0 && !selectedProduct && (
                    <div className="rounded-md border bg-background shadow-sm max-h-36 overflow-y-auto">
                      {productResults.map(p => (
                        <button key={p.id} type="button"
                          onClick={() => { setSelectedProduct(p); setProductSearch(''); setProductResults([]) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between">
                          <span>{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.unit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedProduct && (
                    <div className="flex gap-2 items-center">
                      <Input type="number" min={0} step="any" value={ingQty} onChange={e => setIngQty(e.target.value)}
                        placeholder="Cantidad" className="w-24 text-sm h-8" />
                      <select value={ingUnit} onChange={e => setIngUnit(e.target.value)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm w-20 h-8">
                        {INGREDIENT_UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                      <Input value={ingNotes} onChange={e => setIngNotes(e.target.value)}
                        placeholder="Nota (opcional)" className="flex-1 text-sm h-8" />
                      <Button type="button" size="sm" variant="outline" onClick={addLinkedIngredient} disabled={!ingQty}>+</Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-2">
                <Label>Pasos de preparación</Label>
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm bg-muted rounded px-2 py-1">
                    <span className="text-muted-foreground shrink-0 font-mono">{i + 1}.</span>
                    <span className="flex-1">{step}</span>
                    <button onClick={() => setSteps(prev => prev.filter((_, j) => j !== i))}><X className="h-3 w-3 mt-0.5" /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input value={stepInput} onChange={e => setStepInput(e.target.value)} placeholder="Describe el paso..."
                    className="flex-1 text-sm h-8" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addStep())} />
                  <Button type="button" size="sm" variant="outline" onClick={addStep}>+</Button>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tiempo (min)</Label>
                  <Input type="number" min={1} value={form.time_minutes ?? ''} onChange={e => setForm(f => ({ ...f, time_minutes: +e.target.value || null }))} />
                </div>
                <div className="space-y-1">
                  <Label>Porciones</Label>
                  <Input type="number" min={1} value={form.servings ?? ''} onChange={e => setForm(f => ({ ...f, servings: +e.target.value || null }))} />
                </div>
                <div className="space-y-1">
                  <Label>Dificultad</Label>
                  <div className="relative">
                    <select value={form.difficulty ?? 'Fácil'} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm appearance-none pr-8">
                      {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Calorías</Label>
                  <Input type="number" min={0} value={form.total_calories ?? ''} onChange={e => setForm(f => ({ ...f, total_calories: +e.target.value || null }))} />
                </div>
              </div>

              {/* Rating */}
              <div className="space-y-1">
                <Label>Valoración (1–5)</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setForm(f => ({ ...f, rating: f.rating === n ? null : n }))}>
                      <Star className={`h-6 w-6 ${(form.rating ?? 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t flex gap-2 sticky bottom-0 bg-background">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editing ? 'Guardar cambios' : 'Crear receta'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
