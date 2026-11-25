create table public.ai_employee_skill_usage (
  scenario text primary key check (scenario in ('marinaViewing','marinaFollowUp','alexanderInternet','alexanderOwner')),
  run_id uuid not null,
  run_by uuid not null,
  last_run_at timestamptz not null default clock_timestamp(),
  approved_at timestamptz,
  approved_by uuid
);
alter table public.ai_employee_skill_usage enable row level security;
revoke all on public.ai_employee_skill_usage from public, anon, authenticated;
grant select, insert, update on public.ai_employee_skill_usage to service_role;

create function public.approve_ai_employee_skill(p_scenario text, p_run uuid, p_actor uuid)
returns boolean language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'admin') then
    raise exception 'Требуется администратор';
  end if;
  update public.ai_employee_skill_usage
  set approved_at = clock_timestamp(), approved_by = p_actor
  where scenario = p_scenario and run_id = p_run and run_by = p_actor
    and approved_at is null and last_run_at > clock_timestamp() - interval '1 day';
  if not found then return false; end if;
  insert into public.activity_log(table_name, actor_id, action, source, summary, changes)
  values ('ai_employee_skill_usage', p_actor, 'approve_skill', 'crm', 'Подтверждено правило ИИ-сотрудника',
          jsonb_build_object('scenario', p_scenario, 'run_id', p_run));
  return true;
end
$$;
revoke all on function public.approve_ai_employee_skill(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.approve_ai_employee_skill(text,uuid,uuid) to service_role;
