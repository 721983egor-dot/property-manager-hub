create table if not exists public.platform_secrets (
  name text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

grant all on public.platform_secrets to service_role;

alter table public.platform_secrets enable row level security;