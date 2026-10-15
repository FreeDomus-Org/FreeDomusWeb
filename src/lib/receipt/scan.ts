// Lee una foto o pantallazo de factura en el navegador con Tesseract.js (gratis, sin servidor).
// Pasos: enderezar → mejorar contraste → OCR → separar renglones → segunda lectura de los códigos dudosos.
import type { Worker } from 'tesseract.js'
import { estimateSkew } from './deskew'
import { parseReceipt, assignDianCodes, mergeReadings, type OcrLine, type ScannedReceipt } from './parse'

export type ScanProgress = (status: string, progress: number) => void

const TARGET_WIDTH = 2400 // ancho al que se amplía la imagen antes del OCR
const SKEW_WIDTH = 800 // ancho reducido para calcular la inclinación (rápido)
const RETRY_ANGLES = [1.5, -1.5]

type OcrWord = { text: string; bbox: OcrLine['bbox'] }
type OcrRow = OcrLine & { words: OcrWord[] }

function toGray(data: Uint8ClampedArray): Uint8Array {
  const gray = new Uint8Array(data.length / 4)
  for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
  return gray
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! }
}

function skewOf(bitmap: ImageBitmap): number {
  const scale = Math.min(1, SKEW_WIDTH / bitmap.width)
  const { ctx } = canvas2d(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
  ctx.drawImage(bitmap, 0, 0, ctx.canvas.width, ctx.canvas.height)
  const { data, width, height } = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
  return estimateSkew(toGray(data), width, height)
}

// Gira (sentido horario), amplía y pasa a grises con el contraste estirado
function prepare(bitmap: ImageBitmap, angle: number): HTMLCanvasElement {
  const scale = Math.max(1, TARGET_WIDTH / bitmap.width)
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  const rad = (angle * Math.PI) / 180
  const outW = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)))
  const outH = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)))
  const { canvas, ctx } = canvas2d(outW, outH)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, outW, outH)
  ctx.translate(outW / 2, outH / 2)
  ctx.rotate(rad)
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)

  const image = ctx.getImageData(0, 0, outW, outH)
  const gray = toGray(image.data)
  const sorted = Uint8Array.from(gray).sort()
  const lo = sorted[Math.floor(sorted.length * 0.01)]
  const hi = sorted[Math.floor(sorted.length * 0.99)]
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < gray.length; i++) {
    const v = Math.max(0, Math.min(255, ((gray[i] - lo) * 255) / range))
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.putImageData(image, 0, 0)
  return canvas
}

function crop(source: HTMLCanvasElement, x: number, y: number, width: number, height: number, zoom: number): HTMLCanvasElement {
  const { canvas, ctx } = canvas2d(Math.round(width * zoom), Math.round(height * zoom))
  ctx.drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function read(worker: Worker, image: HTMLCanvasElement) {
  const { data } = await worker.recognize(image, {}, { blocks: true })
  const lines = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines))
  return lines.map((l): OcrRow => ({ text: l.text.trim(), bbox: l.bbox, words: l.words }))
}

// Formato DIAN: la columna "Código" se recorta, se amplía y se lee solo con dígitos
async function readDianCodes(worker: Worker, page: HTMLCanvasElement, receipt: ScannedReceipt, lines: OcrRow[]) {
  // El encabezado de la tabla (no el "Código Único de Factura" de más arriba)
  const words = lines.find(l => /C[oó]digo/i.test(l.text) && /Descripci/i.test(l.text))?.words ?? []
  const header = words.find(w => /^C[oó]digo$/i.test(w.text))
  if (!header) return
  const nro = words.find(w => /^Nro\.?$/i.test(w.text))
  const gap = nro ? header.bbox.x0 - nro.bbox.x1 : (header.bbox.x1 - header.bbox.x0) * 0.4
  const x0 = Math.max(0, Math.round(nro ? nro.bbox.x1 + gap * 0.25 : header.bbox.x0 - gap))
  const x1 = Math.min(page.width, Math.round(header.bbox.x1 + gap * 0.6))

  const items = receipt.items
  const rowGap = (items.at(-1)!.bbox!.y1 - items[0].bbox!.y0) / items.length
  const y0 = Math.max(0, Math.round(items[0].bbox!.y0 - rowGap / 2))
  const y1 = Math.min(page.height, Math.round(items.at(-1)!.bbox!.y1 + rowGap / 2))

  const zoom = 2
  await worker.setParameters({ tessedit_char_whitelist: '0123456789' })
  try {
    const digits = await read(worker, crop(page, x0, y0, x1 - x0, y1 - y0, zoom))
    // Coordenadas de vuelta a la página para ubicar cada código en su renglón
    assignDianCodes(items, digits.map(l => ({ text: l.text, bbox: { x0: 0, x1: 0, y0: l.bbox.y0 / zoom + y0, y1: l.bbox.y1 / zoom + y0 } })))
  } finally {
    await worker.setParameters({ tessedit_char_whitelist: '' })
  }
}

export async function scanReceipt(file: File, onProgress: ScanProgress): Promise<ScannedReceipt> {
  // Cada fase ocupa un tramo de la barra; el OCR reporta su avance dentro del tramo
  let phase: [string, number, number] = ['Preparando imagen', 0, 0.05]
  const report = (fraction: number) => onProgress(phase[0], phase[1] + (phase[2] - phase[1]) * fraction)
  report(0)

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { createWorker } = await import('tesseract.js')
  phase = ['Cargando el lector de texto', 0.05, 0.25]
  report(0)
  const worker = await createWorker('spa', 1, {
    logger: m => { if (m.status === 'recognizing text') report(m.progress) },
  })

  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' })
    const angle = skewOf(bitmap)
    const page = prepare(bitmap, angle)

    phase = ['Leyendo la factura', 0.25, 0.75]
    const lines = await read(worker, page)
    let receipt = parseReceipt(lines)

    if (receipt.format === 'dian' && receipt.items.length) {
      phase = ['Leyendo códigos de barras', 0.75, 1]
      await readDianCodes(worker, page, receipt, lines)
    } else {
      // Si quedaron renglones dudosos, se lee otra vez con un ángulo vecino y se combinan
      for (const [i, delta] of RETRY_ANGLES.entries()) {
        if (!receipt.items.some(item => item.doubtful.length)) break
        phase = ['Revisando renglones dudosos', 0.75 + i * 0.125, 0.875 + i * 0.125]
        const other = parseReceipt(await read(worker, prepare(bitmap, angle + delta)))
        receipt = { ...receipt, items: mergeReadings(receipt.items, other.items) }
      }
    }
    onProgress('Listo', 1)
    return receipt
  } finally {
    bitmap.close()
    await worker.terminate()
  }
}
