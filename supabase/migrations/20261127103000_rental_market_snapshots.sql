create table if not exists public.rental_market_snapshots (
  house_key text not null,
  snapshot_day date not null,
  checked_at timestamptz not null,
  active_count integer not null check (active_count >= 0),
  median_price numeric,
  median_days numeric,
  group_ids jsonb not null check (jsonb_typeof(group_ids) = 'array'),
  samples jsonb not null default '[]'::jsonb check (jsonb_typeof(samples) = 'array'),
  listings jsonb not null check (jsonb_typeof(listings) = 'array'),
  primary key (house_key, snapshot_day)
);

create index if not exists rental_market_snapshots_day_idx
  on public.rental_market_snapshots (snapshot_day desc);

alter table public.rental_market_snapshots enable row level security;

grant select on public.rental_market_snapshots to authenticated;
grant all on public.rental_market_snapshots to service_role;

drop policy if exists rental_market_read_admin on public.rental_market_snapshots;
create policy rental_market_read_admin on public.rental_market_snapshots
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

alter table public.rental_market_snapshots
  add column if not exists samples jsonb not null default '[]'::jsonb;

drop function if exists public.rental_market_monthly(date);
create function public.rental_market_monthly(p_since date)
returns table (
  house_key text,
  snapshot_day date,
  checked_at timestamptz,
  active_count integer,
  median_price numeric,
  median_days numeric,
  group_ids jsonb,
  samples jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (s.house_key, date_trunc('month', s.snapshot_day::timestamp))
    s.house_key, s.snapshot_day, s.checked_at, s.active_count,
    s.median_price, s.median_days, s.group_ids, s.samples
  from public.rental_market_snapshots s
  where s.snapshot_day >= p_since
  order by s.house_key, date_trunc('month', s.snapshot_day::timestamp), s.snapshot_day desc;
$$;

revoke execute on function public.rental_market_monthly(date) from public, anon;
grant execute on function public.rental_market_monthly(date) to authenticated, service_role;
