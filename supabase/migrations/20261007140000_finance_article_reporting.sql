-- Reporting policy is administered through existing article RLS and audit triggers.
alter table public.finance_articles
  add column if not exists cash_flow_type text not null default 'operating'
    check (cash_flow_type in ('operating', 'investing', 'financing')),
  add column if not exists affects_profit boolean not null default true;
update public.finance_articles set cash_flow_type = 'financing', affects_profit = false
where code in ('deposit_in', 'deposit_out');
notify pgrst, 'reload schema';
