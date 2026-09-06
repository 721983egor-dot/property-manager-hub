create type public.lead_status as enum ('new', 'in_work', 'done', 'rejected');

create table public.leads (
  id uuid not null default gen_random_uuid() primary key,
  name text not null,
  phone text not null default ''::text,
  topic text not null default ''::text,
  message text not null default ''::text,
  source text not null default 'site'::text,
  status public.lead_status not null default 'new'::public.lead_status,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

grant insert on public.leads to anon;
grant select, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;

alter table public.leads enable row level security;

create policy "Anyone can send a lead" on public.leads for insert to anon, authenticated with check (true);
create policy "Leads are readable by app users" on public.leads for select to authenticated using (true);
create policy "Leads are updatable by app users" on public.leads for update to authenticated using (true) with check (true);
create policy "Leads are deletable by app users" on public.leads for delete to authenticated using (true);

create trigger leads_set_updated_at before update on public.leads for each row execute function public.set_updated_at();