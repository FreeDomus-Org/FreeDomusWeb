// Convierte el texto que devuelve el OCR de una factura en renglones de productos.
// Entiende dos formatos: la tirilla de caja (código EAN completo en cada renglón)
// y la representación gráfica de la DIAN (tabla con el código partido en dos líneas).

export interface OcrLine {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export type ItemField = 'description' | 'code' | 'quantity' | 'price'

export interface ScannedItem {
  description: string
  code: string | null
  quantity: number | null
  unit: string
  /** Precio por unidad, IVA incluido */
  unitPrice: number | null
  /** Lo pagado por el renglón completo, IVA incluido */
  total: number | null
  /** Campos que el OCR no pudo leer con seguridad */
  doubtful: ItemField[]
  /** Renglón de la DIAN que espera su código de la segunda lectura */
  bbox?: OcrLine['bbox']
}

export interface ScannedReceipt {
  format: 'tirilla' | 'dian'
  invoiceNumber: string | null
  date: string | null // YYYY-MM-DD
  items: ScannedItem[]
}

// EAN-8, UPC-A, EAN-13 o GTIN-14: el último dígito es de control
export function isValidBarcode(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false
  const digits = [...code].map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

// "5,300" · "$ 4.453,78" · "2350" → número; null si no parece dinero
export function parseMoney(token: string): number | null {
  const t = token.replace(/^\$/, '')
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''))
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^\d+[.,]\d{2}$/.test(t)) return Number(t.replace(',', '.'))
  if (/^\d{3,7}$/.test(t)) return Number(t)
  return null
}

const UNIT_MAP: Record<string, string> = { UN: 'ud', UND: 'ud', U: 'ud', '94': 'ud', KG: 'kg', KGM: 'kg', GR: 'g', G: 'g', LT: 'l', L: 'l', ML: 'ml' }

function mapUnit(raw: string | undefined): string {
  return UNIT_MAP[(raw ?? '').toUpperCase()] ?? 'ud'
}

// Quita basura del OCR alrededor de la descripción (rayas, palabras en minúscula de columnas vecinas)
function cleanDescription(words: string[]): string {
  const kept = words.filter(w => /[A-ZÁÉÍÓÚÑ0-9]/.test(w) && w === w.toUpperCase())
  return kept.join(' ').replace(/[^A-ZÁÉÍÓÚÑ0-9 .,/%&-]/g, '').replace(/[-.,\s]+$/, '').trim()
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

// La primera fecha del documento es la de emisión (la resolución DIAN aparece al final)
function parseDate(text: string): string | null {
  const ymd = text.match(/(20\d{2})[/-](\d{2})[/-](\d{2})/)
  const dmy = text.match(/(\d{2})\/(\d{2})\/(20\d{2})/)
  if (dmy && (!ymd || dmy.index! < ymd.index!)) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : null
}

function parseInvoiceNumber(text: string): string | null {
  const m = text.match(/N[uú]mero de Factura:?\s*([A-Z0-9]+-?\d+)/i) ?? text.match(/Factura Electr[oó]nica de Venta\s+([A-Z0-9]{2,6}-?\d{4,})/i)
  return m ? m[1].replace('-', '') : null
}

// Recalcula el total y marca como dudoso todo valor que falte
function checked(item: ScannedItem): ScannedItem {
  const doubtful = new Set(item.doubtful)
  if (!item.quantity || item.quantity <= 0) doubtful.add('quantity')
  if (item.unitPrice === null) doubtful.add('price')
  if (!item.description) doubtful.add('description')
  const total = item.unitPrice !== null && item.quantity ? Math.round(item.unitPrice * item.quantity) : null
  return { ...item, total: item.total ?? total, doubtful: [...doubtful] }
}

// ─── Tirilla: "1 1 UN 5,300 7700304002115 JABON LITTLE 5,300 A" ─────────────

const QTY_UNIT = /^([\dTlI|]+(?:[.,]\d+)?)?(UN|UND|U|KG|GR|G|LT|L|ML)$/i

function parseTirillaLine(line: string): ScannedItem | null {
  const words = line.trim().split(/\s+/)
  const codeAt = words.findIndex(w => /^\d{6,}\D{0,2}$/.test(w) || /^\d{8,}/.test(w))
  if (codeAt < 1) return null

  const before = words.slice(0, codeAt)
  const unitPrice = parseMoney(before[before.length - 1])
  const unitAt = before.findIndex(w => QTY_UNIT.test(w))
  if (unitPrice === null && unitAt === -1) return null // números sueltos (NIT, resolución…), no un producto

  const doubtful: ItemField[] = []
  const rawCode = words[codeAt]
  const code = rawCode.replace(/\D/g, '')
  if (!isValidBarcode(code) || code !== rawCode) doubtful.push('code')

  // La descripción va hasta el primer valor en dinero
  const after = words.slice(codeAt + 1)
  const moneyAt = after.findIndex(w => parseMoney(w) !== null)
  const description = cleanDescription(moneyAt === -1 ? after : after.slice(0, moneyAt))
  const lineValue = moneyAt === -1 ? null : parseMoney(after[moneyAt])
  if (!description) doubtful.push('description')

  // Cantidad: "N 1 UN" o "N 1UN"; si solo queda el número de renglón, se deduce de valor ÷ precio
  let quantity: number | null = null
  let unitWord: string | undefined
  if (unitAt !== -1) {
    const m = before[unitAt].match(QTY_UNIT)!
    unitWord = m[2]
    const glued = m[1]?.replace(/[TlI|]/g, '1')
    const prev = before[unitAt - 1]?.replace(/[TlI|]/g, '1')
    if (glued && unitAt >= 1) quantity = Number(glued.replace(',', '.'))
    else if (!glued && unitAt >= 2 && /^\d+([.,]\d+)?$/.test(prev)) quantity = Number(prev.replace(',', '.'))
  }
  const ratio = unitPrice && lineValue ? lineValue / unitPrice : null
  const ratioQty = ratio && Math.abs(ratio - Math.round(ratio)) < 0.01 && Math.round(ratio) >= 1 ? Math.round(ratio) : null
  if (quantity === null) {
    quantity = ratioQty
    if (quantity === null) doubtful.push('quantity')
  } else if (ratio !== null && ratioQty !== quantity) {
    // El valor del renglón no cuadra con precio × cantidad: alguno de los dos se leyó mal
    doubtful.push('quantity', 'price')
  }
  if (unitPrice === null) doubtful.push('price')

  return checked({ description, code: code || null, quantity, unit: mapUnit(unitWord), unitPrice, total: null, doubtful })
}

// ─── DIAN: "1 JABON LITTLE ANGELS 94 1,00 $ 4.453,78 $ 0,00 $ 0,00 $ 846,22 19.00 $ 4.453,78" ──

const DIAN_ROW = /^\s*\d{1,3}\s+(.+?)\s+(\d{2,3}|UN|KGM?)\s+(\d+[.,]\d{2,3})\s+\$\s*(.*)$/i

function parseDianLine(line: OcrLine): ScannedItem | null {
  const m = line.text.match(DIAN_ROW)
  if (!m) return null
  const [, desc, unit, qtyRaw, rest] = m
  // Montos "1.234,56" (el OCR a veces lee el "$" como un 8 pegado): precio unitario,
  // descuento, recargo, IVA (si aplica) y valor de venta
  const amounts = [...rest.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)].map(a => parseMoney(a[0])!)
  const hasIva = /\b\d{1,2}\.00\b/.test(rest)
  const quantity = Number(qtyRaw.replace(',', '.'))
  const doubtful: ItemField[] = ['code'] // el código llega en la segunda lectura
  const [unitPrice = 0, discount = 0, , iva = 0] = hasIva ? amounts : [amounts[0], amounts[1], amounts[2], 0]
  const saleValue = amounts.at(-1)
  // Deben estar todos los montos y el valor de venta debe ser precio × cantidad
  if (amounts.length !== (hasIva ? 5 : 4) || saleValue === undefined || Math.abs(unitPrice * quantity - discount - saleValue) > 1) doubtful.push('price')
  const description = cleanDescription(desc.split(/\s+/))
  if (!description) doubtful.push('description')
  const total = amounts.length ? Math.round(unitPrice * quantity - discount + iva) : null
  return checked({
    description,
    code: null,
    quantity,
    unit: mapUnit(unit),
    unitPrice: total !== null && quantity > 0 ? round(total / quantity) : null,
    total,
    doubtful,
    bbox: line.bbox,
  })
}

export function parseReceipt(lines: OcrLine[]): ScannedReceipt {
  const text = lines.map(l => l.text).join('\n')
  const dian = lines.map(parseDianLine).filter((i): i is ScannedItem => i !== null)
  const tirilla = lines.map(l => parseTirillaLine(l.text)).filter((i): i is ScannedItem => i !== null)
  const useDian = dian.length > tirilla.length
  return {
    format: useDian ? 'dian' : 'tirilla',
    invoiceNumber: parseInvoiceNumber(text),
    date: parseDate(text),
    items: useDian ? dian : tirilla,
  }
}

// La DIAN imprime cada código en dos líneas (8 + 5 dígitos): se juntan las que caen en la franja de cada renglón
export function assignDianCodes(items: ScannedItem[], digitLines: OcrLine[]) {
  const centers = items.map(i => (i.bbox!.y0 + i.bbox!.y1) / 2)
  items.forEach((item, idx) => {
    const top = idx === 0 ? -Infinity : (centers[idx - 1] + centers[idx]) / 2
    const bottom = idx === items.length - 1 ? Infinity : (centers[idx] + centers[idx + 1]) / 2
    const code = digitLines
      .filter(l => { const c = (l.bbox.y0 + l.bbox.y1) / 2; return c >= top && c < bottom })
      .sort((a, b) => a.bbox.y0 - b.bbox.y0)
      .map(l => l.text.replace(/\D/g, ''))
      .join('')
    item.code = code || null
    item.doubtful = item.doubtful.filter(f => f !== 'code')
    if (!isValidBarcode(code)) item.doubtful.push('code')
  })
}

// Completa los renglones dudosos con los de otra lectura (otro ángulo) cuando allí sí salieron bien
export function mergeReadings(base: ScannedItem[], other: ScannedItem[]): ScannedItem[] {
  const sameShape = base.length === other.length
  return base.map((item, idx) => {
    if (item.doubtful.length === 0) return item
    // Mismo renglón en la otra lectura: misma posición y mismo precio o nombre parecido
    const looksSame = (o: ScannedItem) => (o.unitPrice !== null && o.unitPrice === item.unitPrice) || o.description.slice(0, 5) === item.description.slice(0, 5)
    const match = (sameShape && looksSame(other[idx]) ? other[idx] : undefined) ?? other.find(o => o.unitPrice !== null && o.unitPrice === item.unitPrice)
    if (!match) return item
    const merged = { ...item, doubtful: [...item.doubtful] }
    const take = (field: ItemField, apply: () => void) => {
      if (merged.doubtful.includes(field) && !match.doubtful.includes(field)) {
        apply()
        merged.doubtful = merged.doubtful.filter(f => f !== field)
      }
    }
    take('code', () => { merged.code = match.code })
    take('quantity', () => { merged.quantity = match.quantity })
    take('price', () => { merged.unitPrice = match.unitPrice })
    take('description', () => { merged.description = match.description })
    return checked({ ...merged, total: null })
  })
}
