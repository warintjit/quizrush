-- =====================================================================
-- QUIZ RUSH — 07 หักคะแนนตอบผิด + พลังใหม่ "โล่สะท้อน" (reflect)
-- รันหลัง 01-06
--
-- สรุปการเปลี่ยนแปลง:
--  1) ตอบผิด → หักคะแนน (settings.wrong_penalty, ดีฟอลต์ 50) ไม่ต่ำกว่า 0 — กันตอบมั่ว
--  2) พลังใหม่ "โล่สะท้อน" (reflect): โดนขโมย/กับดัก แล้วสะท้อนกลับใส่คนโจมตี (1 ครั้ง)
--  3) create_game ใส่ wrong_penalty ลง settings ให้ห้องใหม่
-- =====================================================================

-- ---------- 1) คอลัมน์ reflect บน players ----------
alter table players add column if not exists reflect boolean not null default false;

-- ---------- 2) พลังใหม่ในแคตตาล็อก: โล่สะท้อน ----------
insert into powerups (code, name_th, desc_th, effect_type, effect_val, weight, icon) values
  ('reflect', 'โล่สะท้อน', 'โดนขโมย/กับดัก แล้วเด้งกลับใส่คนโจมตี 1 ครั้ง', 'reflect', 0, 12, '🪞')
on conflict (code) do update
  set name_th = excluded.name_th, desc_th = excluded.desc_th,
      effect_type = excluded.effect_type, weight = excluded.weight, icon = excluded.icon;

-- ---------- 3) create_game: เพิ่ม wrong_penalty ลง settings ----------
create or replace function create_game(p_duration_min int default 5, p_track_max int default 3000)
returns games language plpgsql security definer as $$
declare g games; v_code text;
begin
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (
      select 1 from games where room_code = v_code and status <> 'finished'
    );
  end loop;

  insert into games (room_code, duration_min, host_id, settings)
    values (
      v_code,
      greatest(1, least(p_duration_min, 60)),
      auth.uid(),
      jsonb_build_object(
        'base_points', 100,
        'speed_bonus_max', 50,
        'speed_bonus_on', true,
        'wrong_penalty', 50,                                      -- หักเมื่อตอบผิด
        'track_max_score', greatest(500, least(p_track_max, 20000))
      )
    )
    returning * into g;
  return g;
end $$;

-- ---------- 4) submit_answer: ตอบผิดหักคะแนน (ไม่ต่ำกว่า 0) ----------
-- คงกติกาตอบถูกเดิมทุกอย่าง เพิ่มเฉพาะกรณีตอบผิด
create or replace function submit_answer(p_player_id uuid, p_question_id uuid, p_selected int, p_time_ms int default null)
returns jsonb language plpgsql security definer as $$
declare
  q questions; pl players; g games;
  v_correct boolean; v_points int := 0; v_ans uuid; v_speed int := 0;
  v_penalty int;
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
  else
    -- ตอบผิด: หักคะแนน (กันตอบมั่ว) — คะแนนจริงจะถูก clamp ไม่ให้ต่ำกว่า 0 ตอน update
    v_penalty := coalesce((g.settings->>'wrong_penalty')::int, 50);
    v_points  := -1 * v_penalty;
  end if;

  insert into answers (game_id, player_id, question_id, selected_index, is_correct, points_awarded, time_taken_ms)
    values (pl.game_id, p_player_id, p_question_id, p_selected, v_correct, v_points, p_time_ms)
    returning id into v_ans;

  update players set
    score          = greatest(0, score + v_points),   -- ไม่ให้ต่ำกว่า 0
    answered_count = answered_count + 1,
    correct_count  = correct_count + (case when v_correct then 1 else 0 end),
    multiplier_next= 1,                                -- ใช้ตัวคูณแล้วรีเซ็ต
    sabotaged      = false,                            -- ใช้ผลกับดักแล้วเคลียร์
    last_seen      = now()
  where id = p_player_id;

  return jsonb_build_object(
    'is_correct', v_correct,
    'points', v_points,                                -- ถูก = บวก, ผิด = ลบ
    'box_offered', v_correct,                          -- ตอบถูกถึงเปิดกล่อง
    'source_answer_id', v_ans
  );
end $$;

-- ---------- 5) open_box: รองรับพลัง reflect (มีผลทันที ตั้งธงกันไว้) ----------
create or replace function open_box(p_player_id uuid, p_source_answer_id uuid default null)
returns jsonb language plpgsql security definer as $$
declare
  pl players; pw powerups; v_game uuid; v_target players; v_gain int := 0;
begin
  select * into pl from players where id = p_player_id;
  v_game := pl.game_id;

  select p.* into pw from powerups p
    order by random() * (1.0 / p.weight) asc limit 1;

  insert into player_powerups (player_id, powerup_id, source_answer_id)
    values (pl.id, pw.id, p_source_answer_id);

  -- ---- พลังโจมตี: สุ่มเป้าหมายแล้วรอผู้เล่นกดยืนยัน ----
  if pw.effect_type in ('steal_random', 'sabotage_random') then
    -- สุ่มเป้าหมายจาก "ผู้เล่นคนอื่นทุกคนในห้อง" เท่า ๆ กัน
    -- ไม่กรองคะแนน (สุ่มได้ทั้งคนนำและคนตาม) และไม่กรอง is_connected
    select * into v_target from players
      where game_id = v_game and id <> pl.id
      order by random() limit 1;

    if v_target.id is null then
      return jsonb_build_object('code', pw.code, 'name_th', pw.name_th, 'icon', pw.icon,
        'kind', 'attack', 'target', null, 'message', 'ยังไม่มีคู่แข่งให้เล่นงาน');
    end if;

    update players set pending_power = pw.effect_type, pending_target = v_target.id
      where id = pl.id;

    return jsonb_build_object('code', pw.code, 'name_th', pw.name_th, 'icon', pw.icon,
      'kind', 'attack',
      'target', jsonb_build_object('id', v_target.id, 'nickname', v_target.nickname,
                                   'color', v_target.avatar_color),
      'message', pw.desc_th);
  end if;

  -- ---- พลังมีผลทันที ----
  if pw.effect_type = 'add_score' then
    v_gain := pw.effect_val;
  elsif pw.effect_type = 'mult_next' then
    update players set multiplier_next = pw.effect_val where id = pl.id;
  elsif pw.effect_type = 'jackpot' then
    v_gain := (floor(random() * 8) + 1) * 50;   -- +50..+400
  elsif pw.effect_type = 'shield' then
    update players set shield = true where id = pl.id;
  elsif pw.effect_type = 'reflect' then
    update players set reflect = true where id = pl.id;   -- โล่สะท้อน 1 ครั้ง
  end if;

  if v_gain <> 0 then
    update players set score = score + v_gain where id = pl.id;
  end if;

  return jsonb_build_object(
    'code', pw.code, 'name_th', pw.name_th, 'icon', pw.icon,
    'kind', 'instant', 'gain', v_gain, 'message', pw.desc_th,
    'new_score', (select score from players where id = pl.id)
  );
end $$;

-- ---------- 6) execute_targeted_power: reflect สะท้อนกลับใส่คนโจมตี ----------
-- ลำดับการกัน: โล่สะท้อน (reflect) มาก่อน > โล่ธรรมดา (shield, กันขโมยเฉย ๆ)
create or replace function execute_targeted_power(p_player_id uuid)
returns jsonb language plpgsql security definer as $$
declare pl players; v_target players; v_gain int := 0; v_msg text; v_kind text;
begin
  select * into pl from players where id = p_player_id;
  if pl.pending_power is null or pl.pending_target is null then
    raise exception 'ไม่มีพลังโจมตีค้างอยู่';
  end if;
  v_kind := pl.pending_power;
  select * into v_target from players where id = pl.pending_target;

  if v_kind = 'sabotage_random' then
    if v_target.reflect then
      -- สะท้อน: คนโจมตีโดนกับดักเอง
      update players set reflect = false where id = v_target.id;
      update players set sabotaged = true where id = pl.id;
      v_msg := v_target.nickname || ' มีโล่สะท้อน! กับดักเด้งกลับใส่คุณเอง';
    else
      update players set sabotaged = true where id = v_target.id;
      v_msg := 'วางกับดักใส่ ' || v_target.nickname || ' สำเร็จ';
    end if;

  elsif v_kind = 'steal_random' then
    if v_target.reflect then
      -- สะท้อน: เป้าขโมยกลับจากคนโจมตี
      update players set reflect = false where id = v_target.id;
      v_gain := least(100, pl.score);
      update players set score = greatest(0, score - v_gain) where id = pl.id;
      update players set score = score + v_gain where id = v_target.id;
      v_msg := v_target.nickname || ' มีโล่สะท้อน! โดนขโมยกลับ ' || v_gain || ' แต้ม';
      v_gain := 0;                                     -- คนโจมตีไม่ได้แต้ม (ที่จริงเสีย)
    elsif v_target.shield then
      update players set shield = false where id = v_target.id;   -- โล่กันขโมยได้ 1 ครั้ง
      v_msg := v_target.nickname || ' มีโล่ ป้องกันไว้ได้';
    else
      v_gain := least(100, v_target.score);
      update players set score = greatest(0, score - v_gain) where id = v_target.id;
      update players set score = score + v_gain where id = pl.id;
      v_msg := 'ขโมย ' || v_gain || ' แต้มจาก ' || v_target.nickname;
    end if;
  end if;

  update players set pending_power = null, pending_target = null where id = pl.id;

  return jsonb_build_object('kind', v_kind, 'gain', v_gain, 'message', v_msg,
    'new_score', (select score from players where id = pl.id));
end $$;
