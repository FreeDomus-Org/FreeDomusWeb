import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image'

const BUCKET = 'recipe-images'

// scopeId = id del espacio de trabajo (o del usuario si la receta es personal): la política de Storage se apoya en esa carpeta
export async function uploadRecipeImage(file: File, scopeId: string): Promise<string> {
  const blob = await compressImage(file)
  const ext = blob.type === 'image/webp' ? 'webp' : 'png'
  const path = `${scopeId}/${crypto.randomUUID()}.${ext}`
  const storage = createClient().storage.from(BUCKET)
  const { error } = await storage.upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
  if (error) throw error
  return storage.getPublicUrl(path).data.publicUrl
}

// Borra del Storage la foto a la que apunta la URL; ignora URLs externas
export async function removeRecipeImage(url: string | null): Promise<void> {
  const path = url?.split(`/object/public/${BUCKET}/`)[1]
  if (!path) return
  await createClient().storage.from(BUCKET).remove([decodeURIComponent(path)])
}

export async function setRecipeImage(recipeId: string, imageUrl: string | null, isPublic: boolean): Promise<void> {
  const { error } = await createClient().rpc('set_recipe_image', { p_recipe_id: recipeId, p_image_url: imageUrl, p_is_public: isPublic })
  if (error) throw new Error(error.message)
}
