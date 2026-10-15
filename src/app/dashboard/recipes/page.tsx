'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchRecipes, createRecipe, updateRecipe, deleteRecipe, toggleFavorite } from '@/lib/services/recipes'
import { fetchRecipeIngredients, setRecipeIngredients } from '@/lib/services/recipeIngredients'
import { fetchProducts, createProduct } from '@/lib/services/products'
import { uploadRecipeImage, removeRecipeImage, setRecipeImage } from '@/lib/services/recipeImages'
import RecipeDetailPanel from '@/components/recipes/RecipeDetailPanel'
import type { Recipe, RecipeCreate, Product } from '@/types'
import { MEAL_TYPES, DIFFICULTIES, DEFAULT_CATEGORIES, INGREDIENT_UNITS } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, Chip, ChipRow, SearchField, Field, NativeSelect, IconAction, SidePanel, EmptyState, LoadingState, Stars } from '@/components/ui/freedomus'
import {
  Plus, Search, Star, Heart, Trash2, Edit2, Clock, Users, Flame, X, Loader2, Eye, Camera, ImagePlus, Globe, Lock,
} from 'lucide-react'

type FilterMode = 'all' | 'Desayuno' | 'Almuerzo' | 'Cena' | 'favorites' | 'easy'

const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'Todas', Desayuno: 'Desayuno', Almuerzo: 'Almuerzo',
  Cena: 'Cena', favorites: 'Favoritas', easy: 'Fáciles',
}
const DIFFICULTY_TONE: Record<string, string> = {
  Fácil: 'bg-lime text-lime-ink',
  Media: 'bg-peach text-peach-ink',
  Difícil: 'bg-coral text-coral-ink',
}

const TO_TASTE = 'al gusto'

// "al gusto" no lleva cantidad (se guarda 1 solo para cumplir con la columna)
const amountLabel = (i: { quantity: number; unit: string }) => i.unit === TO_TASTE ? TO_TASTE : `${i.quantity} ${i.unit}`

interface LinkedIngredient {
  product: Product
  quantity: number
  unit: string
  notes: string
}

const EMPTY_FORM: RecipeCreate = {
  user_id: '', workspace_id: null, name: '', meal_type: 'Almuerzo', category: [],
  ingredients_summary: '', preparation_steps: '', time_minutes: 30, difficulty: 'Fácil',
  servings: 1, total_calories: null, total_price: null, rating: null, allergens: [],
  image_url: null, is_public: false, is_favorite: false,
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
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(localStorage.getItem('recipeCategories') ?? '[]')
    } catch {
      return []
    }
  })
  const [newCat, setNewCat] = useState('')
  // Foto elegida en el formulario (se sube al guardar) o marcada para quitar
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null)

  // Ingredientes vinculados a productos
  const [linkedIngredients, setLinkedIngredients] = useState<LinkedIngredient[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [ingQty, setIngQty] = useState('')
  const [ingUnit, setIngUnit] = useState('g')
  const [ingNotes, setIngNotes] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [creatingProduct, setCreatingProduct] = useState(false)
  const [productError, setProductError] = useState<string | null>(null)
  // false mientras se cargan los ingredientes guardados de la receta en edición (o si falló la carga)
  const [ingredientsLoaded, setIngredientsLoaded] = useState(true)
  const editingIdRef = useRef<string | null>(null)

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
      try {
        // Same scope as the Productos page (personal catalog), regardless of the workspace cookie
        setProducts(await fetchProducts(uid))
      } catch (err) {
        console.error('fetchProducts failed', err)
      }
    })
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
  const productResults = useMemo(() => {
    if (!productSearch.trim()) return []
    const term = productSearch.toLowerCase()
    return products.filter(p => p.name.toLowerCase().includes(term)).slice(0, 6)
  }, [productSearch, products])

  function openAdd() {
    editingIdRef.current = null
    setEditing(null); setForm({ ...EMPTY_FORM, user_id: userId ?? '', workspace_id: workspaceId })
    resetPhotoDraft()
    setSteps([]); setLinkedIngredients([]); setIngredientsLoaded(true); setShowForm(true)
  }

  function resetPhotoDraft() {
    setPendingImage(prev => { if (prev) URL.revokeObjectURL(prev.preview); return null })
    setRemoveImage(false)
  }

  function pickPhoto(file: File | undefined) {
    if (!file) return
    setPendingImage(prev => { if (prev) URL.revokeObjectURL(prev.preview); return { file, preview: URL.createObjectURL(file) } })
    setRemoveImage(false)
  }

  // Sube la foto nueva (o quita la actual) y la deja aplicada en la receta; borra del Storage la anterior
  async function applyPhoto(recipe: Recipe, file: File | null, remove: boolean, isPublic: boolean) {
    const scopeId = recipe.workspace_id ?? recipe.user_id
    const newUrl = file ? await uploadRecipeImage(file, scopeId) : remove ? null : recipe.image_url
    try {
      await setRecipeImage(recipe.id, newUrl, isPublic)
    } catch (err) {
      if (file) await removeRecipeImage(newUrl) // no dejar huérfana la subida
      throw err
    }
    if (recipe.image_url && newUrl !== recipe.image_url) await removeRecipeImage(recipe.image_url)
    return newUrl
  }

  // Botón rápido de la tarjeta: cambiar o quitar la foto sin abrir el formulario
  async function quickPhoto(recipe: Recipe, file: File | null, remove: boolean) {
    setPhotoBusyId(recipe.id); setPhotoError(null)
    try {
      const url = await applyPhoto(recipe, file, remove, recipe.is_public)
      setRecipes(prev => prev.map(x => x.id === recipe.id ? { ...x, image_url: url } : x))
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'No se pudo guardar la foto')
    } finally { setPhotoBusyId(null) }
  }

  async function loadLinkedIngredients(recipeId: string) {
    editingIdRef.current = recipeId
    setLinkedIngredients([]); setIngredientsLoaded(false)
    try {
      const ings = await fetchRecipeIngredients(recipeId)
      if (editingIdRef.current !== recipeId) return // se abrió otra receta mientras tanto
      setLinkedIngredients(ings
        .filter(i => i.product)
        .map(i => ({ product: i.product!, quantity: i.quantity, unit: i.unit, notes: i.notes ?? '' })))
      setIngredientsLoaded(true)
    } catch (err) {
      console.error('fetchRecipeIngredients failed', err)
    }
  }

  function openEdit(r: Recipe) {
    setEditing(r)
    resetPhotoDraft()
    setForm({
      user_id: r.user_id, workspace_id: r.workspace_id, name: r.name, meal_type: r.meal_type,
      category: r.category, ingredients_summary: r.ingredients_summary ?? '',
      preparation_steps: r.preparation_steps ?? '', time_minutes: r.time_minutes ?? 30,
      difficulty: r.difficulty ?? 'Fácil', servings: r.servings ?? 1,
      total_calories: r.total_calories, total_price: r.total_price, rating: r.rating,
      allergens: r.allergens, image_url: r.image_url, is_public: r.is_public, is_favorite: r.is_favorite,
    })
    const parsedSteps = r.preparation_steps?.split('\n').map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean) ?? []
    setSteps(parsedSteps)
    loadLinkedIngredients(r.id)
    setShowForm(true)
  }

  const toTaste = ingUnit === TO_TASTE

  function addLinkedIngredient() {
    if (!selectedProduct || (!ingQty && !toTaste)) return
    setLinkedIngredients(prev => [...prev, { product: selectedProduct, quantity: toTaste ? 1 : +ingQty, unit: ingUnit, notes: ingNotes }])
    setSelectedProduct(null); setProductSearch(''); setIngQty(''); setIngNotes('')
  }

  // Alta rápida en el catálogo cuando el ingrediente aún no existe; luego se completa en Productos
  async function handleCreateAndSelectProduct(name: string) {
    if (!userId || !name) return
    setCreatingProduct(true); setProductError(null)
    try {
      const p = await createProduct({ user_id: userId, workspace_id: null, name, brand: null, barcode: null, category: 'Otros', unit: 'g', calories: null, protein: null, carbs: null, fat: null, allergens: [], is_custom: true })
      setProducts(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedProduct(p); setIngUnit(p.unit); setProductSearch('')
    } catch (err) {
      setProductError(err instanceof Error ? err.message : 'No se pudo crear el producto')
    } finally { setCreatingProduct(false) }
  }

  function removeLinkedIngredient(idx: number) {
    setLinkedIngredients(prev => prev.filter((_, i) => i !== idx))
  }

  function buildSummary() {
    return linkedIngredients.map(i => i.unit === TO_TASTE ? `${i.product.name} ${TO_TASTE}` : `${amountLabel(i)} ${i.product.name}`).join('\n')
  }

  function buildStepsText() {
    return steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
  }

  async function handleSave() {
    if (!form.name.trim() || !userId) return
    setSaving(true)
    try {
      // La foto y la visibilidad se guardan aparte (set_recipe_image), así cualquier miembro puede cambiarlas
      const payload: RecipeCreate = {
        ...form,
        image_url: editing?.image_url ?? null,
        is_public: editing?.is_public ?? false,
        ingredients_summary: buildSummary(),
        preparation_steps: buildStepsText(),
      }
      const saved = editing ? await updateRecipe(editing.id, payload) : await createRecipe(payload)
      const recipeId = saved.id
      if (pendingImage || removeImage || form.is_public !== saved.is_public) {
        await applyPhoto(saved, pendingImage?.file ?? null, removeImage, form.is_public)
      }
      // Al editar se reescriben siempre (así quitar ingredientes también se guarda),
      // pero solo si los existentes llegaron a cargarse, para no borrarlos por error
      if (editing ? ingredientsLoaded : linkedIngredients.length > 0) {
        await setRecipeIngredients(recipeId, linkedIngredients.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit: i.unit,
          notes: i.notes || null,
        })))
      }
      await load(userId, workspaceId)
      resetPhotoDraft()
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!userId || !confirm('¿Eliminar esta receta?')) return
    const recipe = recipes.find(r => r.id === id)
    await deleteRecipe(id)
    removeRecipeImage(recipe?.image_url ?? null).catch(() => { /* la receta ya se borró; la foto queda huérfana */ })
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
    <div className="flex flex-1 flex-col gap-4.5">
      <PageHeader title="Recetas">
        <Button onClick={openAdd} size="sm"><Plus className="stroke-[2.4]" /> Nueva receta</Button>
      </PageHeader>

      <ChipRow>
        {(Object.keys(FILTER_LABELS) as FilterMode[]).map(f => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{FILTER_LABELS[f]}</Chip>
        ))}
      </ChipRow>

      <SearchField placeholder="Buscar recetas..." value={search} onChange={e => setSearch(e.target.value)} />
      {photoError && <p className="text-sm text-danger">{photoError}</p>}

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState>No hay recetas{search ? ' con ese nombre' : ''}.</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] content-start gap-3.5">
          {filtered.map(recipe => (
            <div key={recipe.id} className="flex flex-col gap-3.5 rounded-3xl bg-card p-3 shadow-card">
              <div className="stripes-light relative grid h-30 place-items-center overflow-hidden rounded-2xl font-mono text-[11px] tracking-[0.06em] text-ink-5">
                {recipe.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URLs externas arbitrarias
                  <img src={recipe.image_url} alt={recipe.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : 'FOTO DE RECETA'}
                <div className="absolute top-2 left-2 flex gap-1.5">
                  <label aria-label={recipe.image_url ? 'Cambiar foto' : 'Subir foto'} title={recipe.image_url ? 'Cambiar foto' : 'Subir foto'}
                    className="grid size-8.5 cursor-pointer place-items-center rounded-full bg-card text-ink-3 hover:text-ink-2">
                    {photoBusyId === recipe.id ? <Loader2 className="size-4.25 animate-spin" /> : <Camera className="size-4.25" />}
                    <input type="file" accept="image/*" className="sr-only" disabled={photoBusyId === recipe.id}
                      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) quickPhoto(recipe, f, false) }} />
                  </label>
                  {recipe.image_url && (
                    <button type="button" aria-label="Quitar foto" title="Quitar foto" disabled={photoBusyId === recipe.id}
                      onClick={() => quickPhoto(recipe, null, true)}
                      className="grid size-8.5 cursor-pointer place-items-center rounded-full bg-card text-ink-3 hover:text-danger">
                      <X className="size-4.25" />
                    </button>
                  )}
                </div>
                <button onClick={() => handleToggleFavorite(recipe)} aria-label="Favorita"
                  className={`absolute top-2 right-2 grid size-8.5 cursor-pointer place-items-center rounded-full bg-card ${recipe.is_favorite ? 'text-peach-ink' : 'text-ink-3'}`}>
                  <Heart className={`size-4.25 ${recipe.is_favorite ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div className="flex flex-col gap-2.5 px-1.5">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-[19px] font-bold">{recipe.name}</h3>
                  <p className="mt-0.5 text-[12.5px] text-ink-5">{recipe.meal_type}</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {recipe.difficulty && <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${DIFFICULTY_TONE[recipe.difficulty] ?? 'bg-sage text-ink-2'}`}>{recipe.difficulty}</span>}
                  {recipe.category.slice(0, 3).map(c => <span key={c} className="rounded-full bg-butter px-2.5 py-0.5 text-[11.5px] font-semibold text-butter-ink">{c}</span>)}
                </div>

                <div className="flex flex-wrap items-center gap-3.5 text-[12.5px] text-ink-2">
                  {recipe.time_minutes && <span className="flex items-center gap-1.5"><Clock className="size-3.5" />{recipe.time_minutes}m</span>}
                  {recipe.servings && <span className="flex items-center gap-1.5"><Users className="size-3.5" />{recipe.servings}</span>}
                  {recipe.total_calories && <span className="flex items-center gap-1.5"><Flame className="size-3.5" />{recipe.total_calories} kcal</span>}
                  {recipe.rating && <span className="flex items-center gap-1.5"><Star className="size-3.5 fill-star text-star" />{recipe.rating}</span>}
                </div>
              </div>

              <div className="mt-auto flex items-center gap-2 px-0.5 pb-0.5">
                <Button className="h-9.5 flex-1 text-[13.5px]" onClick={() => setViewingRecipe(recipe)}>
                  <Eye /> Ver receta
                </Button>
                <IconAction size="lg" onClick={() => openEdit(recipe)} aria-label="Editar"><Edit2 /></IconAction>
                <IconAction size="lg" tone="danger" onClick={() => handleDelete(recipe.id)} aria-label="Eliminar"><Trash2 /></IconAction>
              </div>
            </div>
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
        <SidePanel
          wide
          eyebrow="Recetas"
          title={editing ? 'Editar receta' : 'Nueva receta'}
          onClose={() => setShowForm(false)}
          footer={<>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="lg" className="flex-[1.2]" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              {editing ? 'Guardar cambios' : 'Crear receta'}
            </Button>
          </>}
        >
          {/* Name */}
          <Field label="Nombre *">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre de la receta" />
          </Field>

          {/* Foto */}
          <div className="flex flex-col gap-2.5">
            <Label>Foto</Label>
            {(() => {
              const shown = pendingImage?.preview ?? (removeImage ? null : form.image_url)
              return (
                <div className="stripes-light relative grid h-40 place-items-center overflow-hidden rounded-2xl font-mono text-[11px] tracking-[0.06em] text-ink-5">
                  {shown
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) o URL de Storage
                    ? <img src={shown} alt="Foto de la receta" className="absolute inset-0 h-full w-full object-cover" />
                    : 'SIN FOTO'}
                </div>
              )
            })()}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-sage px-4 text-[13.5px] font-semibold text-ink-2 hover:bg-sage-deep">
                <ImagePlus className="size-4" /> {pendingImage || (form.image_url && !removeImage) ? 'Cambiar foto' : 'Subir foto'}
                <input type="file" accept="image/*" className="sr-only" onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {(pendingImage || (form.image_url && !removeImage)) && (
                <button type="button" className="h-10 cursor-pointer rounded-full px-4 text-[13.5px] font-semibold text-danger hover:bg-danger-soft"
                  onClick={() => { setPendingImage(prev => { if (prev) URL.revokeObjectURL(prev.preview); return null }); setRemoveImage(!!form.image_url) }}>
                  Quitar
                </button>
              )}
              <button type="button" onClick={() => setForm(f => ({ ...f, is_public: !f.is_public }))}
                className={`ml-auto flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition-colors ${form.is_public ? 'bg-lime text-lime-ink' : 'bg-sage text-ink-3 hover:bg-sage-deep'}`}>
                {form.is_public ? <Globe className="size-4" /> : <Lock className="size-4" />}
                {form.is_public ? 'Pública' : 'Privada'}
              </button>
            </div>
            <p className="text-xs text-ink-4">La foto se reduce automáticamente antes de subirla. Pública servirá para publicar la receta en tu perfil más adelante.</p>
          </div>

          {/* Meal type + Favorite */}
          <div className="flex items-end gap-3">
            <Field label="Tipo de comida" className="flex-1">
              <NativeSelect value={form.meal_type} onChange={e => setForm(f => ({ ...f, meal_type: e.target.value }))}>
                {MEAL_TYPES.map(t => <option key={t}>{t}</option>)}
              </NativeSelect>
            </Field>
            <button type="button" onClick={() => setForm(f => ({ ...f, is_favorite: !f.is_favorite }))}
              className={`flex h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition-colors ${form.is_favorite ? 'bg-danger-soft text-danger' : 'bg-sage text-ink-3 hover:bg-sage-deep'}`}>
              <Heart className={`size-4 ${form.is_favorite ? 'fill-current' : ''}`} /> Favorita
            </button>
          </div>

          {/* Categories */}
          <div className="flex flex-col gap-2.5">
            <Label>Categorías</Label>
            <div className="flex flex-wrap gap-2">
              {allCategories.map(cat => (
                <Chip key={cat} tone="soft" active={form.category.includes(cat)} onClick={() => toggleCategory(cat)}>{cat}</Chip>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nueva categoría..." className="flex-1" />
              <Button type="button" className="h-11 px-5" onClick={addCustomCategory}>Añadir</Button>
            </div>
          </div>

          {/* Ingredientes vinculados al inventario */}
          <div className="flex flex-col gap-3 rounded-[20px] bg-canvas p-4">
            <div className="flex items-baseline gap-2">
              <p className="font-display text-base font-bold">Ingredientes</p>
              <p className="text-xs text-ink-4">vinculados al inventario</p>
            </div>

            {!ingredientsLoaded && (
              <p className="flex items-center gap-2 px-1 text-xs text-ink-4"><Loader2 className="size-3.5 animate-spin" /> Cargando ingredientes...</p>
            )}
            {linkedIngredients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {linkedIngredients.map((ing, i) => (
                  <button key={i} type="button" onClick={() => removeLinkedIngredient(i)}
                    className="flex cursor-pointer items-center gap-2 rounded-full bg-forest px-3 py-1.5 text-[13px] font-semibold text-lime">
                    {amountLabel(ing)} — {ing.product.name}
                    <X className="size-3 stroke-[2.6]" />
                  </button>
                ))}
              </div>
            )}

            {/* Buscador de producto */}
            <div className="flex h-10 items-center gap-2.5 rounded-xl bg-card px-3.5">
              <Search className="size-4.25 shrink-0 text-ink-4" />
              <input
                value={selectedProduct ? selectedProduct.name : productSearch}
                onChange={e => { setProductSearch(e.target.value); setSelectedProduct(null); setProductError(null) }}
                placeholder="Buscar producto del catálogo..."
                className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-ink-5"
              />
            </div>
            {productResults.length > 0 && !selectedProduct && (
              <div className="flex flex-wrap gap-1.5">
                {productResults.map(p => (
                  <button key={p.id} type="button"
                    onClick={() => { setSelectedProduct(p); if (p.tracking === 'pantry') setIngUnit(TO_TASTE); else if (INGREDIENT_UNITS.includes(p.unit)) setIngUnit(p.unit); setProductSearch('') }}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-sage">
                    <Plus className="size-3 stroke-[2.4]" />{p.name}
                    <span className="text-xs text-ink-5">{p.unit}</span>
                  </button>
                ))}
              </div>
            )}
            {productSearch.trim() && productResults.length === 0 && !selectedProduct && (
              <div className="flex flex-wrap items-center gap-2 px-1">
                <p className="text-xs text-ink-4">No hay productos que coincidan con &ldquo;{productSearch.trim()}&rdquo;.</p>
                <button type="button" onClick={() => handleCreateAndSelectProduct(productSearch.trim())} disabled={creatingProduct}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-[13px] font-semibold text-leaf hover:bg-sage disabled:cursor-default disabled:opacity-60">
                  {creatingProduct ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3 stroke-[2.4]" />}
                  Crear &ldquo;{productSearch.trim()}&rdquo;
                </button>
              </div>
            )}
            {productError && <p className="px-1 text-xs text-danger">{productError}</p>}
            {selectedProduct && (
              <div className="flex items-center gap-2">
                {!toTaste && (
                  <Input type="number" min={0} step="any" value={ingQty} onChange={e => setIngQty(e.target.value)}
                    placeholder="Cantidad" className="h-10 w-24 rounded-xl bg-card px-3 text-sm" />
                )}
                <select value={ingUnit} onChange={e => setIngUnit(e.target.value)}
                  className="h-10 w-24 shrink-0 rounded-xl border-0 bg-card pr-8 pl-3 text-sm font-medium outline-none bg-position-[right_10px_center]">
                  {INGREDIENT_UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
                <Input value={ingNotes} onChange={e => setIngNotes(e.target.value)}
                  placeholder="Nota (opcional)" className="h-10 flex-1 rounded-xl bg-card px-3 text-sm" />
                <IconAction tone="dark" size="md" onClick={addLinkedIngredient} disabled={!ingQty && !toTaste} aria-label="Añadir ingrediente"><Plus className="stroke-[2.4]" /></IconAction>
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-2.5">
            <Label>Pasos de preparación</Label>
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 text-sm leading-snug">
                <div className="grid size-6.5 shrink-0 place-items-center rounded-full bg-lime font-display text-xs font-extrabold text-lime-ink">{i + 1}</div>
                <span className="flex-1 pt-0.75">{step}</span>
                <button type="button" className="cursor-pointer pt-1.25 text-danger" onClick={() => setSteps(prev => prev.filter((_, j) => j !== i))} aria-label="Quitar paso">
                  <X className="size-3 stroke-[2.6]" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={stepInput} onChange={e => setStepInput(e.target.value)} placeholder="Describe el paso..."
                className="flex-1" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addStep())} />
              <IconAction tone="dark" className="size-11" onClick={addStep} aria-label="Añadir paso"><Plus className="stroke-[2.4]" /></IconAction>
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tiempo (min)">
              <Input type="number" min={1} value={form.time_minutes ?? ''} onChange={e => setForm(f => ({ ...f, time_minutes: +e.target.value || null }))} />
            </Field>
            <Field label="Porciones" hint="las cantidades son para estas">
              <Input type="number" min={1} value={form.servings ?? ''} onChange={e => setForm(f => ({ ...f, servings: +e.target.value || null }))} />
            </Field>
            <Field label="Dificultad">
              <NativeSelect value={form.difficulty ?? 'Fácil'} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
                {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Calorías">
              <Input type="number" min={0} value={form.total_calories ?? ''} onChange={e => setForm(f => ({ ...f, total_calories: +e.target.value || null }))} />
            </Field>
          </div>

          {/* Rating */}
          <div className="flex flex-col gap-2">
            <Label>Valoración (1–5)</Label>
            <Stars size={30} value={form.rating} onChange={rating => setForm(f => ({ ...f, rating }))} />
          </div>
        </SidePanel>
      )}
    </div>
  )
}
