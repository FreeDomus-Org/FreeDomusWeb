// Reduce una foto antes de subirla: lado máximo 1280px y WebP, para ahorrar espacio en Storage.
const MAX_SIDE = 1280
const QUALITY = 0.78

export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', QUALITY))
  if (!blob) throw new Error('No se pudo procesar la imagen')
  return blob
}
