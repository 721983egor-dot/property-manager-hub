-- Draft-only rental manager. No background sending or platform-policy override.
alter table public.chat_threads add column ai_review_revision bigint not null default 0;
-- Every message mutation serializes with review application on the parent thread.
-- Do not lock the whole message table: an incoming insert could otherwise deadlock.
create function public.rental_ai_message_revision() returns trigger
language plpgsql security definer set search_path=public as $$
declare previous_id uuid; next_id uuid; affected uuid;
begin
  if TG_OP<>'INSERT' then previous_id=old.thread_id; end if;
  if TG_OP<>'DELETE' then next_id=new.thread_id; end if;
  for affected in select id from chat_threads where id in (previous_id,next_id) order by id for update loop
    update chat_threads set ai_review_revision=ai_review_revision+1 where id=affected;
  end loop;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create trigger rental_ai_message_revision before insert or update or delete on public.chat_messages
for each row execute function public.rental_ai_message_revision();
revoke all on function public.rental_ai_message_revision() from public,anon,authenticated;
create table public.rental_ai_settings (
  id boolean primary key default true check(id),
  value jsonb not null,
  revision text not null default 'initial'
);
create table public.rental_ai_reviews (
  id uuid primary key,
  actor_id uuid not null,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  analysis jsonb not null,
  note text not null,
  expected jsonb not null,
  settings_revision text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  applied_at timestamptz,
  applied_stage uuid
);
create index rental_ai_reviews_thread on public.rental_ai_reviews(thread_id,created_at desc);
alter table public.rental_ai_settings enable row level security;
alter table public.rental_ai_reviews enable row level security;
revoke all on public.rental_ai_settings, public.rental_ai_reviews from anon, authenticated;
grant all on public.rental_ai_settings, public.rental_ai_reviews to service_role;

create function public.rental_ai_save_settings(p_actor uuid,p_revision text,p_value jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare current_revision text;
begin
  if not exists(select 1 from user_roles where user_id=p_actor and role='admin') then raise exception 'Требуется администратор'; end if;
  perform pg_advisory_xact_lock(hashtext('rental_ai_settings'));
  select revision into current_revision from rental_ai_settings where id=true;
  if coalesce(current_revision,'initial')<>p_revision then raise exception 'Памятка изменена в другом окне. Обновите страницу'; end if;
  insert into rental_ai_settings(id,value,revision) values(true,p_value,gen_random_uuid()::text)
    on conflict(id) do update set value=excluded.value,revision=excluded.revision;
  insert into activity_log(table_name,actor_id,action,source,summary,changes)
    values('rental_ai_settings',p_actor,'save_playbook','crm','Обновлена памятка ИИ-менеджера',p_value);
end $$;

create function public.rental_ai_apply_review(p_actor uuid,p_review uuid,p_stage uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare r rental_ai_reviews%rowtype; t chat_threads%rowtype; d deals%rowtype;
  messages_now jsonb; thread_now jsonb; deal_now jsonb; settings_now text;
begin
  if not exists(select 1 from user_roles where user_id=p_actor and role='admin') then raise exception 'Требуется администратор'; end if;
  select * into r from rental_ai_reviews where id=p_review and actor_id=p_actor for update;
  if not found then raise exception 'Разбор не найден'; end if;
  if r.applied_at is not null then
    if r.applied_stage is distinct from p_stage then raise exception 'Разбор уже применён с другим этапом'; end if;
    return;
  end if;
  if r.expires_at<now() then raise exception 'Разбор устарел. Повторите'; end if;
  perform pg_advisory_xact_lock(hashtext('rental_ai_settings'));
  select coalesce((select revision from rental_ai_settings where id=true),'initial') into settings_now;
  if settings_now<>r.settings_revision then raise exception 'Памятка изменилась. Повторите разбор'; end if;
  select * into t from chat_threads where id=r.thread_id for update;
  thread_now=jsonb_build_object('id',t.id,'source',t.source,'client_id',t.client_id,'deal_id',t.deal_id,'property_id',t.property_id,'ai_review_revision',t.ai_review_revision);
  if thread_now is distinct from r.expected->'thread' then raise exception 'Привязки чата изменились. Повторите разбор'; end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb) into messages_now
    from (select id,direction,body,created_at from chat_messages where thread_id=t.id order by created_at desc,id desc limit 60) m;
  if messages_now is distinct from r.expected->'messages' then raise exception 'Появились новые сообщения. Повторите разбор'; end if;
  if t.deal_id is null then raise exception 'Сначала создайте или привяжите сделку к чату'; end if;
  select * into d from deals where id=t.deal_id for update;
  if not found then raise exception 'Сделка не найдена'; end if;
  if d.pipeline<>'rental' then raise exception 'Доступна только воронка арендаторов'; end if;
  deal_now=jsonb_build_object('id',d.id,'updated_at',d.updated_at,'stage_id',d.stage_id,'pipeline',d.pipeline,'client_id',d.client_id);
  if deal_now is distinct from r.expected->'deal' then raise exception 'Сделка изменилась. Повторите разбор'; end if;
  if not exists(select 1 from deal_stages where id=d.stage_id and kind='open') then raise exception 'Закрытую сделку менять нельзя'; end if;
  if p_stage is not null and not exists(select 1 from deal_stages where id=p_stage and pipeline=d.pipeline and kind='open') then
    raise exception 'Доступен только открытый этап этой воронки';
  end if;
  update deals set comment=concat_ws(E'\n\n',nullif(comment,''),r.note),stage_id=coalesce(p_stage,stage_id),updated_at=now() where id=d.id;
  update rental_ai_reviews set applied_at=now(),applied_stage=p_stage where id=r.id;
  insert into activity_log(table_name,record_id,actor_id,action,source,summary,changes)
    values('deals',d.id,p_actor,'rental_ai_review','crm','Записан проверенный разбор переписки',
      jsonb_build_object('review_id',r.id,'thread_id',t.id,'analysis',r.analysis,'previous_stage',d.stage_id,'stage_id',coalesce(p_stage,d.stage_id)));
end $$;
revoke all on function public.rental_ai_save_settings(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.rental_ai_apply_review(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rental_ai_save_settings(uuid,text,jsonb) to service_role;
grant execute on function public.rental_ai_apply_review(uuid,uuid,uuid) to service_role;
