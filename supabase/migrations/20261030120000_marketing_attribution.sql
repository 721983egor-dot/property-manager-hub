-- Additive: preview and production share the database. Existing records remain unmodified.
alter table public.leads add column if not exists attribution jsonb;
alter table public.leads add column if not exists submission_id uuid;
create unique index if not exists leads_submission_id_unique on public.leads(submission_id) where submission_id is not null;
alter table public.chat_threads add column if not exists attribution jsonb;
alter table public.chat_messages add column if not exists attribution jsonb;
create table if not exists public.site_marketing_events (
  id uuid primary key,
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('page_view', 'phone_click', 'telegram_click', 'whatsapp_click')),
  visitor_id uuid not null,
  attribution jsonb not null
);
create index if not exists site_marketing_events_created on public.site_marketing_events(created_at desc);
create index if not exists site_marketing_events_visitor on public.site_marketing_events(visitor_id, created_at desc);
alter table public.site_marketing_events enable row level security;
drop policy if exists site_marketing_events_admin_read on public.site_marketing_events;
create policy site_marketing_events_admin_read on public.site_marketing_events for select to authenticated using (public.has_role(auth.uid(), 'admin'));
revoke all on public.site_marketing_events from anon;
grant select on public.site_marketing_events to authenticated;
grant all on public.site_marketing_events to service_role;

notify pgrst, 'reload schema';
