create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.balance_rooms (
  id text primary key,
  host_key text not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'closed', 'ended')),
  current_question_id uuid null,
  share_origin text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balance_questions (
  id uuid primary key default extensions.gen_random_uuid(),
  room_id text not null references public.balance_rooms(id) on delete cascade,
  round_number integer not null,
  text text not null,
  option_a text not null,
  option_b text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  unique (room_id, round_number)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'balance_rooms_current_question_id_fkey'
  ) then
    alter table public.balance_rooms
      add constraint balance_rooms_current_question_id_fkey
      foreign key (current_question_id)
      references public.balance_questions(id)
      on delete set null;
  end if;
end;
$$;

create table if not exists public.balance_participants (
  room_id text not null references public.balance_rooms(id) on delete cascade,
  client_id uuid not null,
  nickname text not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, client_id)
);

create table if not exists public.balance_responses (
  room_id text not null references public.balance_rooms(id) on delete cascade,
  question_id uuid not null references public.balance_questions(id) on delete cascade,
  client_id uuid not null,
  nickname text not null,
  choice text not null check (choice in ('A', 'B')),
  reason text not null default '',
  submitted_at timestamptz not null default now(),
  primary key (question_id, client_id)
);

create index if not exists balance_questions_room_started_idx
  on public.balance_questions(room_id, started_at desc);

create index if not exists balance_responses_room_question_idx
  on public.balance_responses(room_id, question_id);

alter table public.balance_rooms enable row level security;
alter table public.balance_questions enable row level security;
alter table public.balance_participants enable row level security;
alter table public.balance_responses enable row level security;

revoke all on public.balance_rooms from anon, authenticated;
revoke all on public.balance_questions from anon, authenticated;
revoke all on public.balance_participants from anon, authenticated;
revoke all on public.balance_responses from anon, authenticated;

create or replace function public.balance_random_room_id()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;

  return result;
end;
$$;

create or replace function public.balance_results_json(p_question_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with question as (
    select option_a, option_b
    from public.balance_questions
    where id = p_question_id
  ),
  counts as (
    select
      count(*) filter (where choice = 'A')::integer as a_count,
      count(*) filter (where choice = 'B')::integer as b_count
    from public.balance_responses
    where question_id = p_question_id
  ),
  totals as (
    select
      q.option_a,
      q.option_b,
      c.a_count,
      c.b_count,
      (c.a_count + c.b_count)::integer as total
    from question q
    cross join counts c
  )
  select coalesce(
    jsonb_build_object(
      'total', total,
      'options', jsonb_build_array(
        jsonb_build_object(
          'key', 'A',
          'label', option_a,
          'count', a_count,
          'percent', case when total > 0 then round((a_count::numeric / total::numeric) * 1000) / 10 else 0 end
        ),
        jsonb_build_object(
          'key', 'B',
          'label', option_b,
          'count', b_count,
          'percent', case when total > 0 then round((b_count::numeric / total::numeric) * 1000) / 10 else 0 end
        )
      )
    ),
    jsonb_build_object('total', 0, 'options', '[]'::jsonb)
  )
  from totals;
$$;

create or replace function public.balance_question_json(p_question_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', id,
    'text', text,
    'optionA', option_a,
    'optionB', option_b,
    'startedAt', extract(epoch from started_at) * 1000,
    'endedAt', case when ended_at is null then null else extract(epoch from ended_at) * 1000 end
  )
  from public.balance_questions
  where id = p_question_id;
$$;

create or replace function public.balance_create_room(p_share_origin text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room_id text;
  v_host_key text := left(
    md5(clock_timestamp()::text || random()::text || coalesce(p_share_origin, '')) ||
    md5(random()::text || clock_timestamp()::text),
    48
  );
begin
  loop
    v_room_id := public.balance_random_room_id();
    exit when not exists (select 1 from public.balance_rooms where id = v_room_id);
  end loop;

  insert into public.balance_rooms (id, host_key, share_origin)
  values (v_room_id, v_host_key, coalesce(p_share_origin, ''));

  return jsonb_build_object(
    'roomId', v_room_id,
    'hostKey', v_host_key,
    'shareOrigin', coalesce(p_share_origin, '')
  );
end;
$$;

create or replace function public.balance_join_room(
  p_room_id text,
  p_client_id uuid,
  p_nickname text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.balance_rooms where id = upper(p_room_id)) then
    raise exception '방을 찾을 수 없습니다.';
  end if;

  insert into public.balance_participants (room_id, client_id, nickname, last_seen_at)
  values (upper(p_room_id), p_client_id, left(coalesce(nullif(trim(p_nickname), ''), '익명'), 24), now())
  on conflict (room_id, client_id)
  do update set
    nickname = excluded.nickname,
    last_seen_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.balance_start_question(
  p_room_id text,
  p_host_key text,
  p_question text,
  p_option_a text,
  p_option_b text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.balance_rooms%rowtype;
  v_question_id uuid;
  v_round integer;
begin
  select * into v_room
  from public.balance_rooms
  where id = upper(p_room_id);

  if not found or v_room.host_key <> p_host_key then
    raise exception '진행자 권한이 필요합니다.';
  end if;

  if trim(coalesce(p_question, '')) = '' or trim(coalesce(p_option_a, '')) = '' or trim(coalesce(p_option_b, '')) = '' then
    raise exception '질문과 두 선택지를 모두 입력해 주세요.';
  end if;

  select coalesce(max(round_number), 0) + 1 into v_round
  from public.balance_questions
  where room_id = v_room.id;

  insert into public.balance_questions (room_id, round_number, text, option_a, option_b)
  values (v_room.id, v_round, left(trim(p_question), 160), left(trim(p_option_a), 80), left(trim(p_option_b), 80))
  returning id into v_question_id;

  update public.balance_rooms
  set status = 'active',
      current_question_id = v_question_id,
      updated_at = now()
  where id = v_room.id;

  return jsonb_build_object('ok', true, 'questionId', v_question_id);
end;
$$;

create or replace function public.balance_respond(
  p_room_id text,
  p_client_id uuid,
  p_choice text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.balance_rooms%rowtype;
  v_nickname text;
begin
  select * into v_room
  from public.balance_rooms
  where id = upper(p_room_id);

  if not found or v_room.status <> 'active' or v_room.current_question_id is null then
    raise exception '현재 응답 가능한 문항이 없습니다.';
  end if;

  select nickname into v_nickname
  from public.balance_participants
  where room_id = v_room.id and client_id = p_client_id;

  if v_nickname is null then
    raise exception '먼저 닉네임으로 참여해 주세요.';
  end if;

  if p_choice not in ('A', 'B') then
    raise exception 'A 또는 B 중 하나를 선택해 주세요.';
  end if;

  insert into public.balance_responses (room_id, question_id, client_id, nickname, choice, reason, submitted_at)
  values (v_room.id, v_room.current_question_id, p_client_id, v_nickname, p_choice, left(coalesce(trim(p_reason), ''), 400), now())
  on conflict (question_id, client_id)
  do update set
    nickname = excluded.nickname,
    choice = excluded.choice,
    reason = excluded.reason,
    submitted_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.balance_close_question(
  p_room_id text,
  p_host_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.balance_rooms%rowtype;
begin
  select * into v_room
  from public.balance_rooms
  where id = upper(p_room_id);

  if not found or v_room.host_key <> p_host_key then
    raise exception '진행자 권한이 필요합니다.';
  end if;

  update public.balance_questions
  set ended_at = now()
  where id = v_room.current_question_id and ended_at is null;

  update public.balance_rooms
  set status = 'closed',
      updated_at = now()
  where id = v_room.id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.balance_prepare_next(
  p_room_id text,
  p_host_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.balance_rooms%rowtype;
begin
  select * into v_room
  from public.balance_rooms
  where id = upper(p_room_id);

  if not found or v_room.host_key <> p_host_key then
    raise exception '진행자 권한이 필요합니다.';
  end if;

  update public.balance_rooms
  set status = 'waiting',
      current_question_id = null,
      updated_at = now()
  where id = v_room.id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.balance_end_game(
  p_room_id text,
  p_host_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.balance_rooms%rowtype;
begin
  select * into v_room
  from public.balance_rooms
  where id = upper(p_room_id);

  if not found or v_room.host_key <> p_host_key then
    raise exception '진행자 권한이 필요합니다.';
  end if;

  if v_room.current_question_id is not null then
    update public.balance_questions
    set ended_at = coalesce(ended_at, now())
    where id = v_room.current_question_id;
  end if;

  update public.balance_rooms
  set status = 'ended',
      current_question_id = null,
      updated_at = now()
  where id = v_room.id;

  return jsonb_build_object('ok', true, 'status', 'ended');
end;
$$;

create or replace function public.balance_room_state(
  p_room_id text,
  p_client_id uuid default null,
  p_host_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_room public.balance_rooms%rowtype;
  v_question jsonb := null;
  v_results jsonb := null;
  v_last_question public.balance_questions%rowtype;
  v_last_round jsonb := null;
  v_response public.balance_responses%rowtype;
  v_total_participants integer := 0;
  v_responded integer := 0;
  v_is_host boolean := false;
begin
  select * into v_room
  from public.balance_rooms
  where id = upper(p_room_id);

  if not found then
    raise exception '방을 찾을 수 없습니다.';
  end if;

  v_is_host := coalesce(p_host_key, '') = v_room.host_key;

  if v_room.current_question_id is not null then
    v_question := public.balance_question_json(v_room.current_question_id);
    v_responded := (
      select count(*)::integer
      from public.balance_responses
      where question_id = v_room.current_question_id
    );

    if v_room.status = 'closed' then
      v_results := public.balance_results_json(v_room.current_question_id);
    end if;

    if p_client_id is not null then
      select * into v_response
      from public.balance_responses
      where question_id = v_room.current_question_id and client_id = p_client_id;
    end if;
  end if;

  select * into v_last_question
  from public.balance_questions
  where room_id = v_room.id and ended_at is not null
  order by ended_at desc
  limit 1;

  if found then
    v_last_round := jsonb_build_object(
      'question', public.balance_question_json(v_last_question.id),
      'results', public.balance_results_json(v_last_question.id),
      'rowCount', (
        select count(*)::integer
        from public.balance_responses
        where question_id = v_last_question.id
      ),
      'endedAt', extract(epoch from v_last_question.ended_at) * 1000
    );
  end if;

  select count(*)::integer into v_total_participants
  from public.balance_participants
  where room_id = v_room.id;

  return jsonb_build_object(
    'roomId', v_room.id,
    'status', v_room.status,
    'question', v_question,
    'counts', jsonb_build_object(
      'connected', v_total_participants,
      'totalParticipants', v_total_participants,
      'responded', v_responded,
      'writing', greatest(v_total_participants - v_responded, 0)
    ),
    'results', v_results,
    'lastRound', v_last_round,
    'userResponse', case
      when v_response.question_id is null then null
      else jsonb_build_object(
        'questionId', v_response.question_id,
        'choice', v_response.choice,
        'submittedAt', extract(epoch from v_response.submitted_at) * 1000
      )
    end,
    'host', case
      when v_is_host then jsonb_build_object(
        'participantCount', v_total_participants,
        'responseCount', v_responded,
        'shareOrigin', v_room.share_origin
      )
      else null
    end,
    'updatedAt', extract(epoch from now()) * 1000
  );
end;
$$;

create or replace function public.balance_room_details(
  p_room_id text,
  p_host_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_room public.balance_rooms%rowtype;
  v_question public.balance_questions%rowtype;
  v_is_host boolean := false;
begin
  select * into v_room
  from public.balance_rooms
  where id = upper(p_room_id);

  if not found then
    raise exception '방을 찾을 수 없습니다.';
  end if;

  v_is_host := coalesce(p_host_key, '') = v_room.host_key;

  if v_is_host and v_room.current_question_id is not null then
    select * into v_question
    from public.balance_questions
    where id = v_room.current_question_id;
  else
    select * into v_question
    from public.balance_questions
    where room_id = v_room.id and ended_at is not null
    order by ended_at desc
    limit 1;
  end if;

  if v_question.id is null then
    return jsonb_build_object('question', null, 'rows', '[]'::jsonb);
  end if;

  if not v_is_host and v_room.status = 'active' then
    raise exception '진행자 권한이 필요합니다.';
  end if;

  return jsonb_build_object(
    'question', public.balance_question_json(v_question.id),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'nickname', nickname,
          'choice', choice,
          'choiceLabel', case when choice = 'A' then v_question.option_a else v_question.option_b end,
          'reason', reason,
          'submittedAt', extract(epoch from submitted_at) * 1000
        )
        order by submitted_at
      )
      from public.balance_responses
      where question_id = v_question.id
    ), '[]'::jsonb)
  );
end;
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.balance_create_room(text) to anon, authenticated;
grant execute on function public.balance_join_room(text, uuid, text) to anon, authenticated;
grant execute on function public.balance_start_question(text, text, text, text, text) to anon, authenticated;
grant execute on function public.balance_respond(text, uuid, text, text) to anon, authenticated;
grant execute on function public.balance_close_question(text, text) to anon, authenticated;
grant execute on function public.balance_prepare_next(text, text) to anon, authenticated;
grant execute on function public.balance_end_game(text, text) to anon, authenticated;
grant execute on function public.balance_room_state(text, uuid, text) to anon, authenticated;
grant execute on function public.balance_room_details(text, text) to anon, authenticated;
