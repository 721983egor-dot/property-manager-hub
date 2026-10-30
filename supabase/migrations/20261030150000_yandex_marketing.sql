-- Server-only cache, immutable confirmation proposals, and pre-send audit.
create table if not exists public.yandex_marketing_cache (
  key text primary key,
  payload jsonb,
  synced_at timestamptz,
  attempted_at timestamptz,
  error text,
  lease_until timestamptz
);
create table if not exists public.yandex_marketing_actions (
  id uuid primary key,
  actor_id uuid not null,
  connection_revision text not null,
  campaign_id bigint not null,
  expected_hash text not null,
  input jsonb not null,
  summary text not null,
  status text not null default 'proposed' check (status in ('proposed','executing','applied','failed','uncertain','stale')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  result text
);
alter table public.yandex_marketing_cache enable row level security;
alter table public.yandex_marketing_actions enable row level security;
revoke all on public.yandex_marketing_cache, public.yandex_marketing_actions from anon, authenticated;
grant all on public.yandex_marketing_cache, public.yandex_marketing_actions to service_role;

create or replace function public.yandex_marketing_claim(p_key text, p_force boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed text;
begin
  insert into yandex_marketing_cache(key) values(p_key) on conflict do nothing;
  update yandex_marketing_cache set lease_until = now() + interval '5 minutes', attempted_at = now()
  where key = p_key and (lease_until is null or lease_until < now())
    and (attempted_at is null or attempted_at < now() - interval '2 minutes')
    and (p_force or synced_at is null or synced_at < now() - interval '1 hour') returning key into claimed;
  return claimed is not null;
end $$;
revoke all on function public.yandex_marketing_claim(text, boolean) from public, anon, authenticated;
grant execute on function public.yandex_marketing_claim(text, boolean) to service_role;

-- Serialize writes to the same campaign, including separate tabs/proposals/workers.
create or replace function public.yandex_marketing_claim_action(p_id uuid, p_actor uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare campaign bigint; claimed uuid;
begin
  select campaign_id into campaign from yandex_marketing_actions where id=p_id and actor_id=p_actor;
  if campaign is null then return false; end if;
  perform pg_advisory_xact_lock(campaign);
  if exists(select 1 from yandex_marketing_actions where campaign_id=campaign and status='executing') then return false; end if;
  update yandex_marketing_actions set status='executing'
    where id=p_id and actor_id=p_actor and status='proposed' and expires_at > now() returning id into claimed;
  return claimed is not null;
end $$;
revoke all on function public.yandex_marketing_claim_action(uuid, uuid) from public, anon, authenticated;
grant execute on function public.yandex_marketing_claim_action(uuid, uuid) to service_role;
