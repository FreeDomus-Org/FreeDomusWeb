// Empareja productos conocidos (los de la lista de compras) con los renglones leídos de una factura.
// Primero por código de barras; si no, por nombre, aguantando las abreviaturas de la tirilla
// ("LECHE ENT ALQUERIA 1100ML", "MANTQLLA") y sin tildes ni mayúsculas.
import type { Product } from '@/types'
import type { ScannedItem } from './parse'

// Palabras con letras de 3 o más caracteres: fuera tamaños ("1100ml"), números y conectores cortos
function words(text: string): string[] {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && /[a-z]/.test(w) && !/^\d+[a-z]{1,2}$/.test(w))
}

// "mntqlla" ⊂ "mantequilla": mismas letras en orden, empezando igual
function isAbbreviation(short: string, long: string): boolean {
  if (short.length < 4 || short[0] !== long[0]) return false
  let i = 0
  for (const ch of long) if (ch === short[i]) i++
  return i === short.length
}

function wordMatches(name: string, receipt: string): boolean {
  return receipt.startsWith(name) || name.startsWith(receipt) || isAbbreviation(receipt, name)
}

// 0..1 según cuántas palabras del producto aparecen en el renglón; 2 si coincide el código de barras
function score(product: Product, item: ScannedItem): number {
  if (product.barcode && item.code === product.barcode) return 2
  const nameWords = words(product.name)
  const receiptWords = words(item.description)
  if (nameWords.length === 0 || receiptWords.length === 0) return 0
  const hits = nameWords.filter(w => receiptWords.some(r => wordMatches(w, r))).length
  return hits / nameWords.length
}

const MIN_SCORE = 0.5

/** Índice del producto → índice del renglón de la factura. Cada renglón se usa una sola vez. */
export function matchProducts(products: Product[], items: ScannedItem[]): Map<number, number> {
  const pairs: { p: number; i: number; s: number }[] = []
  products.forEach((product, p) => items.forEach((item, i) => {
    const s = score(product, item)
    if (s >= MIN_SCORE) pairs.push({ p, i, s })
  }))
  pairs.sort((a, b) => b.s - a.s)

  const result = new Map<number, number>()
  const usedItems = new Set<number>()
  for (const { p, i } of pairs) {
    if (result.has(p) || usedItems.has(i)) continue
    result.set(p, i)
    usedItems.add(i)
  }
  return result
}
