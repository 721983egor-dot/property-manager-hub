drop policy if exists "Property photos readable" on storage.objects;
drop policy if exists "Property photos uploadable" on storage.objects;
drop policy if exists "Property photos updatable" on storage.objects;
drop policy if exists "Property photos deletable" on storage.objects;

create policy "Property photos readable" on storage.objects
  for select to anon, authenticated using (bucket_id = 'property-photos');
create policy "Property photos uploadable" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'property-photos');
create policy "Property photos updatable" on storage.objects
  for update to anon, authenticated using (bucket_id = 'property-photos') with check (bucket_id = 'property-photos');
create policy "Property photos deletable" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'property-photos');