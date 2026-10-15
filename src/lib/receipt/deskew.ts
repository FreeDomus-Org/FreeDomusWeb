// Calcula cuántos grados está torcida una foto de texto (perfil de proyección):
// al girar el ángulo correcto, los píxeles de texto quedan concentrados en renglones.
// Devuelve el ángulo que hay que girar la imagen en sentido horario para enderezarla.

const MAX_ANGLE = 8
const STEP = 0.5
const WINDOW = 7 // radio del vecindario que debe ser papel

export function estimateSkew(gray: Uint8Array | Uint8ClampedArray, width: number, height: number): number {
  // Papel = lo más claro de la imagen; texto = oscuro y rodeado de papel (descarta fondos de colores)
  const sorted = Uint8Array.from(gray).sort()
  const paper = sorted[Math.floor(sorted.length * 0.85)]
  const brightLimit = paper * 0.85
  const darkLimit = paper * 0.55

  // Imagen integral de píxeles claros para contar papel alrededor de cada píxel en O(1)
  const integral = new Uint32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x] >= brightLimit ? 1 : 0
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + rowSum
    }
  }

  const xs: number[] = []
  const ys: number[] = []
  for (let y = WINDOW; y < height - WINDOW; y++) {
    for (let x = WINDOW; x < width - WINDOW; x++) {
      if (gray[y * width + x] >= darkLimit) continue
      const x0 = x - WINDOW, x1 = x + WINDOW + 1, y0 = y - WINDOW, y1 = y + WINDOW + 1
      const bright = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0]
      if (bright >= (2 * WINDOW + 1) ** 2 * 0.5) { xs.push(x - width / 2); ys.push(y) }
    }
  }
  if (xs.length === 0) return 0

  let best = 0
  let bestScore = -1
  const bins = new Float64Array(height * 2)
  for (let angle = -MAX_ANGLE; angle <= MAX_ANGLE; angle += STEP) {
    const t = Math.tan((angle * Math.PI) / 180)
    bins.fill(0)
    for (let i = 0; i < xs.length; i++) {
      const row = Math.round(ys[i] + xs[i] * t + height / 2)
      if (row >= 0 && row < bins.length) bins[row]++
    }
    // Renglones nítidos → saltos grandes entre filas vecinas
    let score = 0
    for (let r = 1; r < bins.length; r++) score += (bins[r] - bins[r - 1]) ** 2
    if (score > bestScore) { bestScore = score; best = angle }
  }
  return best
}
