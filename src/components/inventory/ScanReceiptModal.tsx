'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ImageUp, Loader2, AlertTriangle, CheckCircle2, Trash2, Plus, Check, Eye, EyeOff, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CenterModal, Field, NativeSelect, IconAction } from '@/components/ui/freedomus'
import { cn } from '@/lib/utils'
import { scanReceipt } from '@/lib/receipt/scan'
import { isValidBarcode, type ItemField, type ScannedItem } from '@/lib/receipt/parse'
import { matchProducts } from '@/lib/receipt/match'
import { fetchProductsByBarcodes, createProduct, updateProduct } from '@/lib/services/products'
import { createInventoryItems } from '@/lib/services/inventory'
import { LOCATIONS, INGREDIENT_UNITS } from '@/types'
import type { Product, ShoppingListItem } from '@/types'

interface Row {
  id: number
  description: string
  code: string
  quantity: string
  unit: string
  location: string
  total: string
  /** Producto del catálogo con el mismo código de barras (o el de la lista de compras) */
  product: Product | null
  /** Campos que el OCR no leyó con seguridad; se limpian al editarlos */
  doubtful: ItemField[]
  /** Renglón que viene de la lista de compras */
  listItemId: string | null
  /** Iba en el carrito pero no se encontró en la factura */
  missing: boolean
}

const ISSUE_TEXT: Record<ItemField, string> = {
  description: 'No se leyó el nombre',
  code: 'Código de barras ilegible',
  quantity: 'Revisa la cantidad',
  price: 'Revisa el precio',
}

// Problemas de un renglón: lo que el OCR marcó como dudoso + lo que no es válido
function rowProblems(row: Row): { fields: Set<ItemField>; messages: string[] } {
  const fields = new Set<ItemField>(row.doubtful)
  const messages = row.doubtful.map(f => f === 'price' && row.missing ? 'No aparece en la factura: pon el precio o pulsa Está bien' : ISSUE_TEXT[f])
  const add = (field: ItemField, message: string) => { if (!fields.has(field)) { fields.add(field); messages.push(message) } }
  if (!row.product && !row.description.trim()) add('description', 'Falta el nombre')
  if (row.code && !isValidBarcode(row.code)) add('code', 'Código de barras inválido (bórralo si no lo tienes)')
  if (!(Number(row.quantity) > 0)) add('quantity', 'Cantidad inválida')
  if (row.total !== '' && !(Number(row.total) >= 0)) add('price', 'Precio inválido')
  return { fields, messages }
}

let nextId = 1
const emptyRow = (): Row => ({ id: nextId++, description: '', code: '', quantity: '1', unit: 'ud', location: 'Despensa', total: '', product: null, doubtful: [], listItemId: null, missing: false })

const COLD_CATEGORIES = ['Lácteos', 'Carnes']
const defaultLocation = (product: Product | null) => product && COLD_CATEGORIES.includes(product.category) ? 'Nevera' : 'Despensa'

// Renglón de algo que iba en el carrito; si se leyó la factura, con el precio de su renglón
function listRow(entry: ShoppingListItem, item: ScannedItem | undefined, scanned: boolean): Row {
  const product = entry.product!
  const unit = entry.unit ?? product.unit
  // La cantidad de la factura solo vale si viene en la misma unidad que la lista
  const receiptQuantity = item?.quantity != null && item.unit === unit
  return {
    id: nextId++,
    description: product.name,
    code: product.barcode ?? (item?.code && isValidBarcode(item.code) ? item.code : ''),
    quantity: receiptQuantity ? String(item!.quantity) : String(entry.quantity ?? 1),
    unit,
    location: defaultLocation(product),
    total: item?.total == null ? '' : String(item.total),
    product,
    doubtful: item ? item.doubtful.filter(f => f === 'price' || (receiptQuantity && f === 'quantity')) : scanned ? ['price'] : [],
    listItemId: entry.id,
    missing: scanned && !item,
  }
}

function Cell({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[11px] font-semibold text-ink-5 md:hidden">{label}</span>
      {children}
    </label>
  )
}

const compact = 'h-9 rounded-[10px] px-3 text-sm'
const bad = 'ring-2 ring-danger focus-visible:ring-danger'

// Sin shoppingItems: escanea una compra y la pasa al inventario.
// Con shoppingItems (lo que iba en el carrito): termina la compra de la lista; la foto es opcional y solo pone precios.
export function ScanReceiptModal({ userId, shoppingItems, onClose, onImported }: {
  userId: string
  shoppingItems?: ShoppingListItem[]
  onClose: () => void
  /** listItemIds: renglones de la lista que pasaron al inventario */
  onImported: (count: number, listItemIds: string[]) => void
}) {
  const [step, setStep] = useState<'pick' | 'scanning' | 'review'>('pick')
  const [progress, setProgress] = useState({ status: '', value: 0 })
  const [error, setError] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [showPhoto, setShowPhoto] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [purchaseDate, setPurchaseDate] = useState('')
  const [saving, setSaving] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('El archivo debe ser una imagen (foto o pantallazo).'); return }
    setError(null)
    setPhotoUrl(URL.createObjectURL(file))
    setStep('scanning')
    try {
      const receipt = await scanReceipt(file, (status, value) => setProgress({ status, value }))
      if (receipt.items.length === 0) {
        setError('No encontré productos en la imagen. Prueba con una foto más nítida, con buena luz y el papel estirado.')
        setStep('pick')
        return
      }
      // Los códigos que ya están en tu catálogo se enlazan solos
      const codes = receipt.items.map(i => i.code).filter((c): c is string => !!c && isValidBarcode(c))
      const known = new Map((await fetchProductsByBarcodes(userId, codes)).map(p => [p.barcode, p]))
      const scannedRows = receipt.items.map((item): Row => {
        const product = (item.code && known.get(item.code)) || null
        return {
          id: nextId++,
          description: item.description,
          code: item.code ?? '',
          quantity: item.quantity === null ? '' : String(item.quantity),
          unit: product?.unit ?? item.unit,
          location: defaultLocation(product),
          total: item.total === null ? '' : String(item.total),
          product,
          doubtful: product ? item.doubtful.filter(f => f !== 'description') : item.doubtful,
          listItemId: null,
          missing: false,
        }
      })
      if (shoppingItems) {
        const matches = matchProducts(shoppingItems.map(e => e.product!), receipt.items)
        const used = new Set(matches.values())
        setRows([
          ...shoppingItems.map((entry, i) => listRow(entry, matches.has(i) ? receipt.items[matches.get(i)!] : undefined, true)),
          // Lo que se compró sin estar en la lista también entra al inventario
          ...scannedRows.filter((_, i) => !used.has(i)),
        ])
      } else {
        setRows(scannedRows)
      }
      setPurchaseDate(receipt.date ?? new Date().toISOString().slice(0, 10))
      setStep('review')
    } catch (e) {
      console.error(e)
      setError('No se pudo leer la imagen. Revisa tu conexión (la primera vez se descarga el lector) e inténtalo de nuevo.')
      setStep('pick')
    }
  }

  function skipPhoto() {
    setRows(shoppingItems!.map(entry => listRow(entry, undefined, false)))
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setError(null)
    setStep('review')
  }

  function updateRow(id: number, field: ItemField | null, changes: Partial<Row>) {
    setRows(prev => prev.map(r => r.id !== id ? r : {
      ...r,
      ...changes,
      // Al cambiar el código se pierde el enlace al producto del catálogo (salvo lo de la lista, que ya es ese producto)
      product: 'code' in changes && !r.listItemId ? null : r.product,
      doubtful: changes.doubtful ?? (field ? r.doubtful.filter(f => f !== field) : r.doubtful),
    }))
  }

  const problems = new Map(rows.map(r => [r.id, rowProblems(r)]))
  const badRows = rows.filter(r => problems.get(r.id)!.messages.length > 0).length

  async function handleImport() {
    if (badRows > 0 || rows.length === 0) return
    setSaving(true)
    try {
      // Productos nuevos: uno por código (o por renglón si no tiene código)
      const created = new Map<string, Product>()
      const items = []
      for (const row of rows) {
        let product = row.product ?? (row.code ? created.get(row.code) : undefined)
        if (!product) {
          product = await createProduct({
            user_id: userId, workspace_id: null, name: row.description.trim(), brand: null, barcode: row.code || null,
            category: 'Otros', unit: row.unit, calories: null, protein: null, carbs: null, fat: null, allergens: [], is_custom: true,
          })
          if (row.code) created.set(row.code, product)
        }
        items.push({
          user_id: userId,
          workspace_id: null,
          product_id: product.id,
          quantity: Number(row.quantity),
          unit: row.unit,
          location: row.location,
          expiration_date: null,
          purchase_date: purchaseDate || null,
          purchase_price: row.total !== '' ? Number(row.total) : null,
          // Lo que se echa a ojo entra lleno; al cocinar se lleva por nivel
          stock_level: product.tracking === 'pantry' ? 'lleno' as const : null,
        })
      }
      await createInventoryItems(items)
      // Lo de la lista que no tenía código se queda con el de la factura: la próxima vez se enlaza solo
      await Promise.allSettled(rows.filter(r => r.listItemId && r.product && !r.product.barcode && r.code)
        .map(r => updateProduct(r.product!.id, { barcode: r.code })))
      onImported(items.length, rows.flatMap(r => r.listItemId ? [r.listItemId] : []))
    } catch (e) {
      console.error(e)
      setError('No se pudieron guardar los productos. Inténtalo de nuevo.')
    } finally { setSaving(false) }
  }

  function restart() {
    setRows([]); setError(null); setShowPhoto(false); setPhotoUrl(null); setStep('pick')
  }

  const total = rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0)

  return (
    <CenterModal
      eyebrow={shoppingItems ? 'Lista de compras' : 'Inventario'}
      title={shoppingItems ? 'Terminar compra' : 'Escanear compra'}
      subtitle={step === 'review' ? `${rows.length} productos · Total $${total.toLocaleString('es-CO')}` : shoppingItems ? '¿Le tomas foto a la factura para poner los precios?' : 'Foto de la tirilla o pantallazo de la factura electrónica'}
      onClose={saving ? () => {} : onClose}
      className={step === 'review' ? 'max-w-5xl' : 'max-w-lg'}
      footer={step === 'review' ? <>
        <Button variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button size="lg" className="flex-[1.4]" onClick={handleImport} disabled={saving || badRows > 0 || rows.length === 0}>
          {saving && <Loader2 className="animate-spin" />}
          {badRows > 0 ? `Corrige ${badRows} ${badRows === 1 ? 'línea' : 'líneas'} en rojo` : `Agregar ${rows.length} al inventario`}
        </Button>
      </> : undefined}
    >
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />

      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      )}

      {step === 'pick' && <>
        {shoppingItems && (
          <p className="text-sm text-ink-3">
            Llevas <b>{shoppingItems.length} {shoppingItems.length === 1 ? 'producto' : 'productos'}</b> en el carrito.
            Con la foto les pongo el precio y agrego lo que compraste por fuera de la lista. Sin foto puedes poner los precios a mano o dejarlos vacíos.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => cameraInput.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-3xl bg-forest px-4 py-6 text-lime transition-colors hover:bg-forest/90">
            <Camera className="size-7" />
            <span className="text-sm font-semibold">Tomar foto</span>
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-3xl bg-sage px-4 py-6 text-forest transition-colors hover:bg-sage-deep">
            <ImageUp className="size-7" />
            <span className="text-sm font-semibold">Subir imagen</span>
          </button>
        </div>
        {shoppingItems && (
          <Button variant="outline" size="lg" onClick={skipPhoto}>Seguir sin foto</Button>
        )}
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-5">
          <li>Pon la tirilla estirada sobre una superficie lisa y con buena luz.</li>
          <li>Que se vea completa la parte de los productos, sin sombras encima.</li>
          <li>También sirve el pantallazo de la factura electrónica de la DIAN.</li>
          <li>Todo se procesa en tu celular: la imagen no se sube a ningún servidor.</li>
        </ul>
      </>}

      {step === 'scanning' && (
        <div className="flex flex-col items-center gap-4 py-4">
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="Factura" className="max-h-56 rounded-2xl object-contain opacity-80" />
          )}
          <div className="w-full">
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-2 font-semibold"><Loader2 className="size-4 animate-spin text-leaf" /> {progress.status}…</span>
              <span className="text-ink-5">{Math.round(progress.value * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sage">
              <div className="h-full rounded-full bg-leaf transition-[width] duration-300" style={{ width: `${progress.value * 100}%` }} />
            </div>
          </div>
          <p className="text-center text-xs text-ink-5">Puede tardar unos segundos. La primera vez descarga el lector de texto.</p>
        </div>
      )}

      {step === 'review' && <>
        {badRows > 0 ? (
          <div className="flex items-start gap-2.5 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>No pude leer bien {badRows} {badRows === 1 ? 'línea' : 'líneas'}. Están marcadas en rojo: corrígelas, o pulsa <b>Está bien</b> si el dato ya es correcto, para poder subir la compra.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-2xl bg-mint px-4 py-3 text-sm text-mint-ink">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>Todo listo. Revisa los productos, ajusta la ubicación y agrégalos al inventario.</span>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Fecha de compra" className="w-44">
            <Input type="date" className={compact} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
          </Field>
          {photoUrl && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => setShowPhoto(v => !v)}>
              {showPhoto ? <EyeOff /> : <Eye />} {showPhoto ? 'Ocultar foto' : 'Ver foto'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={restart}>
            {photoUrl ? <><RotateCcw /> Escanear otra</> : <><Camera /> Escanear factura</>}
          </Button>
        </div>

        {showPhoto && photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Factura escaneada" className="max-h-[50dvh] w-full rounded-2xl bg-sage object-contain" />
        )}

        <div className="flex flex-col gap-2">
          <div className="hidden gap-2 px-3 text-[11.5px] font-semibold tracking-wide text-ink-5 uppercase md:grid md:grid-cols-[minmax(0,1fr)_150px_72px_84px_120px_100px_36px]">
            <span>Producto</span><span>Código</span><span>Cant.</span><span>Unidad</span><span>Ubicación</span><span>Precio</span><span />
          </div>

          {rows.map(row => {
            const { fields, messages } = problems.get(row.id)!
            const hasProblems = messages.length > 0
            return (
              <div key={row.id} className={cn('flex flex-col gap-2 rounded-2xl p-3', hasProblems ? 'bg-danger-soft ring-1 ring-danger/30' : 'bg-sage/60')}>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_150px_72px_84px_120px_100px_36px] md:items-center">
                  <Cell label="Producto" className="col-span-2 md:col-span-1">
                    {row.product ? (
                      <div className="flex h-9 items-center gap-2 px-1 text-sm font-semibold">
                        <span className="truncate">{row.product.name}</span>
                        {row.listItemId
                          ? <span className="shrink-0 rounded-full bg-lime px-2 py-0.5 text-[10.5px] font-semibold text-lime-ink">De tu lista</span>
                          : <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 text-[10.5px] font-semibold text-mint-ink">En tu catálogo</span>}
                      </div>
                    ) : (
                      <Input className={cn(compact, fields.has('description') && bad)} value={row.description} placeholder="Nombre del producto"
                        onChange={e => updateRow(row.id, 'description', { description: e.target.value })} />
                    )}
                  </Cell>
                  <Cell label="Código de barras" className="col-span-2 md:col-span-1">
                    <Input className={cn(compact, 'font-mono', fields.has('code') && bad)} value={row.code} inputMode="numeric" placeholder="Opcional"
                      onChange={e => updateRow(row.id, 'code', { code: e.target.value.replace(/\D/g, '') })} />
                  </Cell>
                  <Cell label="Cantidad">
                    <Input type="number" min={0} step="any" className={cn(compact, fields.has('quantity') && bad)} value={row.quantity}
                      onChange={e => updateRow(row.id, 'quantity', { quantity: e.target.value })} />
                  </Cell>
                  <Cell label="Unidad">
                    <NativeSelect className={cn(compact, 'pr-8')} value={row.unit} onChange={e => updateRow(row.id, null, { unit: e.target.value })}>
                      {INGREDIENT_UNITS.map(u => <option key={u}>{u}</option>)}
                    </NativeSelect>
                  </Cell>
                  <Cell label="Ubicación">
                    <NativeSelect className={cn(compact, 'pr-8')} value={row.location} onChange={e => updateRow(row.id, null, { location: e.target.value })}>
                      {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                    </NativeSelect>
                  </Cell>
                  <Cell label="Precio">
                    <Input type="number" min={0} step="any" className={cn(compact, fields.has('price') && bad)} value={row.total} placeholder="$"
                      onChange={e => updateRow(row.id, 'price', { total: e.target.value })} />
                  </Cell>
                  <div className="col-span-2 flex justify-end md:col-span-1">
                    <IconAction tone="danger" size="sm" aria-label="Quitar renglón" onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))}><Trash2 /></IconAction>
                  </div>
                </div>

                {hasProblems && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-danger">
                    <span className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-3.5 shrink-0" /> {messages.join(' · ')}</span>
                    {row.doubtful.length > 0 && (
                      <button type="button" className="flex cursor-pointer items-center gap-1 rounded-full bg-card px-2.5 py-1 font-semibold text-forest hover:bg-card/70"
                        onClick={() => updateRow(row.id, null, { doubtful: [] })}>
                        <Check className="size-3.5" /> Está bien
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <Button variant="outline" size="sm" className="h-9 self-start" onClick={() => setRows(prev => [...prev, emptyRow()])}>
            <Plus /> Agregar renglón
          </Button>
        </div>
      </>}
    </CenterModal>
  )
}
