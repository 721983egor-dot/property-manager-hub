create table public.private_employee_test_dialogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  employee_id text not null check (employee_id in ('marina', 'alexander')),
  version uuid not null default gen_random_uuid(),
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array'),
  pending_rule text check (length(trim(pending_rule)) between 3 and 400),
  updated_at timestamptz not null default now()
);

create index private_employee_test_by_owner
  on public.private_employee_test_dialogs(owner_id, employee_id, updated_at desc);

alter table public.private_employee_test_dialogs enable row level security;
revoke all on public.private_employee_test_dialogs from public, anon, authenticated;
grant select, insert, update on public.private_employee_test_dialogs to service_role;

create function public.approve_private_employee_test_rule(
  p_actor uuid, p_employee text, p_dialog uuid, p_version uuid,
  p_rule text, p_playbook_revision text, p_playbook jsonb
) returns boolean language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.marina_learning_approver a join public.user_roles r
      on r.user_id = a.user_id and r.role = 'admin'
    where a.singleton and a.user_id = p_actor
  ) then
    raise exception 'Доступно только владельцу тестового диалога';
  end if;

  perform 1 from public.private_employee_test_dialogs
    where id = p_dialog and owner_id = p_actor and employee_id = p_employee
      and version = p_version and pending_rule is not null for update;
  if not found then return false; end if;

  if p_rule is null or length(trim(p_rule)) not between 3 and 400
    or coalesce(right(p_playbook->>'instructions', length('Правило из личного теста: ' || p_rule)), '')
      <> ('Правило из личного теста: ' || p_rule)
  then
    raise exception 'Не удалось проверить формулировку правила';
  end if;

  if p_employee = 'marina' then
    perform public.rental_ai_save_settings(p_actor, p_playbook_revision, p_playbook);
  elsif p_employee = 'alexander' then
    perform public.save_ai_support_playbook(p_actor, p_playbook_revision, p_playbook);
  else
    return false;
  end if;

  update public.private_employee_test_dialogs
    set pending_rule = null, version = gen_random_uuid(), updated_at = now()
    where id = p_dialog;
  insert into public.activity_log(table_name, actor_id, action, source, summary, changes)
    values ('private_employee_test_dialogs', p_actor, 'approve_employee_test_rule', 'crm',
      'Подтверждено правило из личного теста ИИ-сотрудника',
      jsonb_build_object('employeeId', p_employee, 'dialogId', p_dialog));
  return true;
end;
$$;
revoke all on function public.approve_private_employee_test_rule(uuid,text,uuid,uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.approve_private_employee_test_rule(uuid,text,uuid,uuid,text,text,jsonb)
  to service_role;
