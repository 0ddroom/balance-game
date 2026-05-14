do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.balance_rooms'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';

  if v_constraint_name is not null then
    execute format('alter table public.balance_rooms drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table public.balance_rooms
  add constraint balance_rooms_status_check
  check (status in ('waiting', 'active', 'closed', 'ended'));

create or replace function public.balance_end_game(
  p_room_id text,
  p_host_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

grant execute on function public.balance_end_game(text, text) to anon, authenticated;
