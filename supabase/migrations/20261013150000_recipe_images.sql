-- Fotos de receta: bucket de Storage + bandera pública/privada (para publicar por perfil más adelante).
begin;

alter table public.recipes
  add column if not exists is_public boolean not null default false;

-- Bucket con lectura por URL. Las imágenes ya llegan comprimidas (webp ~1280px), el límite es una red de seguridad.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Ruta: <workspace_id | user_id>/<uuid>.webp  → cualquier miembro del espacio (o el dueño, si es personal) sube y borra.
create or replace function public.can_manage_recipe_image(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (storage.foldername(p_object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (storage.foldername(p_object_name))[1] = auth.uid()::text
        or is_workspace_member(((storage.foldername(p_object_name))[1])::uuid)
    else false
  end;
$$;
revoke all on function public.can_manage_recipe_image(text) from public, anon;
grant execute on function public.can_manage_recipe_image(text) to authenticated;

drop policy if exists recipe_images_read on storage.objects;
drop policy if exists recipe_images_insert on storage.objects;
drop policy if exists recipe_images_update on storage.objects;
drop policy if exists recipe_images_delete on storage.objects;
create policy recipe_images_read on storage.objects for select
  using (bucket_id = 'recipe-images');
create policy recipe_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-images' and public.can_manage_recipe_image(name));
create policy recipe_images_update on storage.objects for update to authenticated
  using (bucket_id = 'recipe-images' and public.can_manage_recipe_image(name))
  with check (bucket_id = 'recipe-images' and public.can_manage_recipe_image(name));
create policy recipe_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-images' and public.can_manage_recipe_image(name));

-- Cambiar la foto / visibilidad lo puede hacer cualquier miembro del espacio,
-- aunque la política de recipes solo deje editar el resto de campos al dueño o admin.
create or replace function public.set_recipe_image(p_recipe_id uuid, p_image_url text, p_is_public boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recipes r
     set image_url = p_image_url, is_public = p_is_public, updated_at = now()
   where r.id = p_recipe_id
     and ((r.workspace_id is null and r.user_id = auth.uid()) or is_workspace_member(r.workspace_id));
  if not found then
    raise exception 'No puedes cambiar la foto de esta receta' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.set_recipe_image(uuid, text, boolean) from public, anon;
grant execute on function public.set_recipe_image(uuid, text, boolean) to authenticated;

commit;
