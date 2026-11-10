-- Ejecutar en SQL Editor del proyecto Supabase de TEAM-038.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lumon-media', 'lumon-media', true, 307200, array['image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lumon team 038 insert" on storage.objects;
create policy "lumon team 038 insert"
on storage.objects for insert to anon
with check (
  bucket_id = 'lumon-media'
  and (storage.foldername(name))[1] = 'TEAM-038'
);
