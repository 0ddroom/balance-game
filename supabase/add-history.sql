create or replace function public.balance_room_history(
  p_room_id text,
  p_host_key text
)
returns jsonb
language plpgsql
stable
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

  return jsonb_build_object(
    'roomId', v_room.id,
    'status', v_room.status,
    'rounds', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'roundNumber', q.round_number,
          'question', public.balance_question_json(q.id),
          'results', public.balance_results_json(q.id),
          'rows', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'nickname', r.nickname,
                'choice', r.choice,
                'choiceLabel', case when r.choice = 'A' then q.option_a else q.option_b end,
                'reason', r.reason,
                'submittedAt', extract(epoch from r.submitted_at) * 1000
              )
              order by r.submitted_at
            )
            from public.balance_responses r
            where r.question_id = q.id
          ), '[]'::jsonb),
          'startedAt', extract(epoch from q.started_at) * 1000,
          'endedAt', case when q.ended_at is null then null else extract(epoch from q.ended_at) * 1000 end
        )
        order by q.round_number
      )
      from public.balance_questions q
      where q.room_id = v_room.id
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.balance_room_history(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
