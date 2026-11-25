create table public.ai_support_playbook (
  id boolean primary key default true check (id),
  value jsonb not null,
  revision text not null
);
alter table public.ai_support_playbook enable row level security;
revoke all on public.ai_support_playbook from public, anon, authenticated;
grant select, insert, update on public.ai_support_playbook to service_role;

create function public.save_ai_support_playbook(p_actor uuid, p_revision text, p_value jsonb)
returns void language plpgsql set search_path = ''
as $$
declare current_revision text;
begin
  if not exists (select 1 from public.user_roles where user_id = p_actor and role = 'admin') then
    raise exception 'Памятка доступна администратору';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_support_playbook'));
  select revision into current_revision from public.ai_support_playbook where id;
  if p_revision <> coalesce(current_revision, 'initial') then
    raise exception 'Памятка изменилась. Обновите страницу.';
  end if;
  insert into public.ai_support_playbook(id, value, revision)
    values (true, p_value, gen_random_uuid()::text)
  on conflict (id) do update set value = excluded.value, revision = excluded.revision;
  insert into public.activity_log(table_name, actor_id, action, source, summary)
    values ('ai_support_playbook', p_actor, 'save_playbook', 'crm', 'Обновлена памятка Александра');
end
$$;
revoke all on function public.save_ai_support_playbook(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_ai_support_playbook(uuid,text,jsonb) to service_role;
