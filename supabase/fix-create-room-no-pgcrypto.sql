create or replace function public.balance_create_room(p_share_origin text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
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

grant execute on function public.balance_create_room(text) to anon, authenticated;

select public.balance_create_room('https://0ddroom.github.io/balance-game') as smoke_test;
