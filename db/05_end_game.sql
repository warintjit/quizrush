-- =====================================================================
-- QUIZ RUSH — 05 จบเกม (end_game) + กันเล่นต่อหลังเกมจบ
-- รันหลัง 01-04
-- =====================================================================

-- ครูกดจบเกม / หมดเวลา → ตั้งสถานะ finished + ปิดเวลา
-- เรียกซ้ำได้ปลอดภัย (ถ้าจบไปแล้วคืนค่าเดิม ไม่ error)
create or replace function end_game(p_game_id uuid)
returns games language plpgsql security definer as $$
declare g games;
begin
  update games
    set status  = 'finished',
        ends_at = least(coalesce(ends_at, now()), now())
  where id = p_game_id and status <> 'finished'
  returning * into g;

  if g.id is null then
    select * into g from games where id = p_game_id;
  end if;
  return g;
end $$;

-- กันส่งคำตอบหลังเกมจบ (เผื่อนักเรียนค้างหน้าจอ)
create or replace function submit_answer(p_player_id uuid, p_question_id uuid, p_selected int, p_time_ms int default null)
returns jsonb language plpgsql security definer as $$
declare
  q questions; pl players; g games;
  v_correct boolean; v_points int := 0; v_ans uuid; v_speed int := 0;
begin
  select * into q from questions where id = p_question_id;
  select * into pl from players where id = p_player_id;
  select * into g from games where id = pl.game_id;

  -- เกมจบแล้ว ไม่รับคำตอบอีก
  if g.status = 'finished' then
    raise exception 'เกมจบแล้ว';
  end if;

  v_correct := (p_selected = q.correct_index);

  if v_correct then
    v_points := (g.settings->>'base_points')::int;
    if (g.settings->>'speed_bonus_on')::bool and p_time_ms is not null then
      v_speed := greatest(0, (g.settings->>'speed_bonus_max')::int - (p_time_ms / 200));
      v_points := v_points + v_speed;
    end if;
    v_points := round(v_points * pl.multiplier_next);
    if pl.sabotaged then v_points := round(v_points / 2.0); end if;
  end if;

  insert into answers (game_id, player_id, question_id, selected_index, is_correct, points_awarded, time_taken_ms)
    values (pl.game_id, p_player_id, p_question_id, p_selected, v_correct, v_points, p_time_ms)
    returning id into v_ans;

  update players set
    score          = score + v_points,
    answered_count = answered_count + 1,
    correct_count  = correct_count + (case when v_correct then 1 else 0 end),
    multiplier_next= 1,
    sabotaged      = false,
    last_seen      = now()
  where id = p_player_id;

  return jsonb_build_object(
    'is_correct', v_correct,
    'points', v_points,
    'box_offered', v_correct,
    'source_answer_id', v_ans
  );
end $$;
