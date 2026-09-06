grant select, update, delete on public.leads to anon;

create policy "Leads are readable by app users (anon)" on public.leads for select to anon using (true);
create policy "Leads are updatable by app users (anon)" on public.leads for update to anon using (true) with check (true);
create policy "Leads are deletable by app users (anon)" on public.leads for delete to anon using (true);