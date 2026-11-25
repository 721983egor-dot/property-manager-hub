create table public.marina_learning_approver (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade
);

create table public.marina_showing_rules (
  rule_key text primary key check (rule_key in ('answer_showing', 'offer_windows')),
  rule_text text not null check (length(trim(rule_text)) between 20 and 400),
  showing_id uuid references public.rental_journey_events(id) on delete set null,
  status text not null check (status in ('approved', 'dismissed')),
  decided_by uuid not null,
  decided_at timestamptz not null default now()
);

alter table public.marina_learning_approver enable row level security;
alter table public.marina_showing_rules enable row level security;
revoke all on public.marina_learning_approver, public.marina_showing_rules
  from public, anon, authenticated;
grant select on public.marina_learning_approver, public.marina_showing_rules to service_role;

create index marina_completed_showings_time on public.rental_journey_events (occurred_at desc, id)
  where kind = 'showing_done' and voided_at is null;

-- Return signals and CRM identifiers only. Message text stays inside the database.
create function public.marina_showing_evidence()
returns table(rule_key text, showing_id uuid, deal_id uuid, shown_at timestamptz)
language sql stable set search_path = ''
as $$
  with recent as (
    select e.id, e.deal_id, e.property_id, e.occurred_at
    from public.rental_journey_events e
    join public.deals d on d.id = e.deal_id and d.pipeline = 'rental'
    where e.kind = 'showing_done' and e.voided_at is null and e.occurred_at <= now()
      and e.occurred_at >= now() - interval '180 days'
    order by e.occurred_at desc, e.id
    limit 120
  ),
  paired as (
    select e.id, e.deal_id, e.occurred_at, thread_signals.offered_windows
    from recent e
    cross join lateral (
      select coalesce(max(a.occurred_at), e.occurred_at) as cutoff
      from public.rental_journey_events a
      where a.deal_id = e.deal_id and a.kind = 'showing_agreed' and a.voided_at is null
        and a.occurred_at <= e.occurred_at
        and (e.property_id is null or a.property_id = e.property_id)
    ) time_bound
    cross join lateral (
      select bool_or(reply.body ~ '[0-2]?[0-9]:[0-5][0-9].{1,40}[0-2]?[0-9]:[0-5][0-9]') as offered_windows
      from public.chat_threads t
      cross join lateral (
        select m.body, m.created_at
        from public.chat_messages m
        where m.thread_id = t.id and m.direction = 'in'
          and m.created_at <= time_bound.cutoff
          and m.created_at >= time_bound.cutoff - interval '14 days'
          and m.body ~* '(можно.{0,30}посмотр|когда.{0,30}посмотр|(хоч|хот).{0,30}посмотр|на просмотр|на показ)'
        order by m.created_at desc, m.id
        limit 1
      ) question
      cross join lateral (
        select m.body
        from public.chat_messages m
        where m.thread_id = t.id and m.direction = 'out'
          and m.created_at > question.created_at and m.created_at <= time_bound.cutoff
        order by m.created_at, m.id
        limit 1
      ) reply
      where t.deal_id = e.deal_id
        and (e.property_id is null or t.property_id is null or t.property_id = e.property_id)
        and reply.body ~* '(посмотр|просмотр|показ)'
      having count(*) > 0
    ) thread_signals
  ),
  signals as (
    select 'answer_showing'::text as key, id, paired.deal_id, occurred_at from paired
    union all
    select 'offer_windows'::text, id, paired.deal_id, occurred_at from paired where offered_windows
  )
  select distinct on (s.key, s.deal_id) s.key, s.id, s.deal_id, s.occurred_at
  from signals s
  order by s.key, s.deal_id, s.occurred_at desc, s.id;
$$;

create function public.decide_marina_showing_rule(
  p_key text, p_showing uuid, p_text text, p_decision text, p_actor uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.marina_learning_approver where user_id = p_actor)
     or not exists (select 1 from public.user_roles where user_id = p_actor and role = 'admin') then
    raise exception 'Требуется назначенный администратор';
  end if;
  if p_decision = 'revoke' then
    update public.marina_showing_rules
      set status = 'dismissed', decided_by = p_actor, decided_at = clock_timestamp()
      where rule_key = p_key and status = 'approved'
        and showing_id is not distinct from p_showing and rule_text = p_text;
  else
    if p_decision not in ('approved', 'dismissed') or p_text is null
       or length(trim(p_text)) not between 20 and 400 then
      raise exception 'Проверьте правило и решение';
    end if;
    perform 1 from public.rental_journey_events
      where id = p_showing and kind = 'showing_done' and voided_at is null for share;
    if not found then return false; end if;
    if not exists (select 1 from public.marina_showing_evidence() e
                   where e.rule_key = p_key and e.showing_id = p_showing) then
      return false;
    end if;
    insert into public.marina_showing_rules(rule_key, rule_text, showing_id, status, decided_by)
      values (p_key, trim(p_text), p_showing, p_decision, p_actor)
      on conflict (rule_key) do nothing;
  end if;
  if not found then return false; end if;
  insert into public.activity_log(table_name, actor_id, action, source, summary, changes)
    values ('marina_showing_rules', p_actor, p_decision, 'crm', 'Решение по правилу Марины',
            jsonb_build_object('rule_key', p_key, 'showing_id', p_showing));
  return true;
end;
$$;

revoke all on function public.marina_showing_evidence() from public, anon, authenticated;
revoke all on function public.decide_marina_showing_rule(text,uuid,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.marina_showing_evidence(),
  public.decide_marina_showing_rule(text,uuid,text,text,uuid) to service_role;

notify pgrst, 'reload schema';
