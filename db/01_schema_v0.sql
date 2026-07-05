-- =====================================================================
-- QUIZ RUSH — Schema ร่าง v0 (Supabase / Postgres)
-- สนามแข่งตอบคำถาม: self-paced, ชนะด้วยเวลา, พลังส่งผลกับคะแนน
-- ตำแหน่งอวตารบนสนาม = คะแนน (front-end map score -> track position)
--
-- วิธีใช้: วางทั้งไฟล์ใน Supabase > SQL Editor แล้ว Run
-- หมายเหตุ: ฟังก์ชัน (RPC) เป็นเวอร์ชันร่าง จะ refine ตอนสร้างจริง
-- =====================================================================

-- ---------- ENUMS ----------
create type game_status as enum ('lobby', 'running', 'finished');

-- ---------- TABLE: games (1 แถว = 1 ห้องแข่ง) ----------
create table games (
  id            uuid primary key default gen_random_uuid(),
  room_code     text unique not null,            -- รหัสห้อง 6 หลัก สำหรับ QR
  host_id       uuid,                            -- ครู (auth.uid) ผู้สร้างห้อง
  status        game_status not null default 'lobby',
  duration_min  int not null default 5,          -- ครูกำหนดเวลาแข่ง (นาที)
  started_at    timestamptz,
  ends_at       timestamptz,                     -- started_at + duration_min
  settings      jsonb not null default
                '{"base_points":100,"speed_bonus_max":50,"speed_bonus_on":true,"track_max_score":3000}',
  created_at    timestamptz not null default now()
);

-- ---------- TABLE: questions (คลังคำถามของห้องนั้น) ----------
-- choices เก็บเป็น jsonb: [{"text":"...","image_url":null}, ... 4 ตัว]
-- correct_index = ตำแหน่งคำตอบที่ถูก (0-3) -- ห้ามส่งไปมือถือ!
create table questions (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  body          text not null,
  image_url     text,
  choices       jsonb not null,
  correct_index int  not null check (correct_index between 0 and 3),
  created_at    timestamptz not null default now()
);
create index on questions(game_id);

-- ---------- TABLE: players (ผู้เล่นในห้อง สูงสุด ~40) ----------
create table players (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references games(id) on delete cascade,
  nickname        text not null,
  avatar_color    text not null default '#22d3ee',
  avatar_model    text default 'runner_a',       -- เผื่อเลือกตัวละคร 3D ได้หลายแบบ
  score           int  not null default 0,
  correct_count   int  not null default 0,
  answered_count  int  not null default 0,
  multiplier_next numeric not null default 1,     -- พลัง "คูณสอง" ตั้งค่าตรงนี้
  shield          boolean not null default false, -- พลัง "โล่" กันโดนขโมย
  sabotaged       boolean not null default false, -- โดน "กับดัก": ตอบถูกครั้งหน้าได้ครึ่ง
  pending_power   text,                            -- พลังโจมตีที่รอกดยืนยัน (steal/sabotage)
  pending_target  uuid,                            -- เป้าหมายที่ "สุ่มล็อก" ไว้ — เลือกเองไม่ได้
  is_connected    boolean not null default true,
  joined_at       timestamptz not null default now(),
  last_seen       timestamptz not null default now()
);
create index on players(game_id);
create index on players(game_id, score desc);

-- ---------- TABLE: answers (log ทุกการตอบ) ----------
create table answers (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references games(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  question_id    uuid not null references questions(id) on delete cascade,
  selected_index int  not null,
  is_correct     boolean not null,
  points_awarded int  not null default 0,
  time_taken_ms  int,
  answered_at    timestamptz not null default now()
);
create index on answers(player_id);
create index on answers(player_id, question_id);

-- ---------- TABLE: powerups (แคตตาล็อกพลัง + น้ำหนักสุ่ม) ----------
create table powerups (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,    -- boost / double / steal / shield / jackpot / sabotage
  name_th     text not null,
  desc_th     text not null,
  effect_type text not null,
  effect_val  int  not null default 0,
  weight      int  not null default 10,
  icon        text
);

insert into powerups (code, name_th, desc_th, effect_type, effect_val, weight, icon) values
  ('boost',    'เร่งสปีด',   'บวกคะแนนทันที',                    'add_score',     150, 25, '🚀'),
  ('double',   'คูณสอง',     'ตอบถูกข้อถัดไปได้คะแนน 2 เท่า',     'mult_next',       2, 22, '✨'),
  ('steal',    'ขโมยแต้ม',   'สุ่มคู่แข่ง 1 คน แล้วกดขโมย 100 แต้ม',   'steal_random',  100, 16, '🧲'),
  ('shield',   'โล่',        'กันการโดนขโมย 1 ครั้ง',            'shield',          0, 16, '🛡️'),
  ('jackpot',  'แจ็กพ็อต',   'สุ่มคะแนน +50 ถึง +400 เสี่ยงดวง',  'jackpot',         0, 11, '🎰'),
  ('sabotage', 'กับดัก',     'สุ่มคู่แข่ง 1 คน วางกับดัก ตอบถูกหน้าได้ครึ่ง','sabotage_random', 0, 10, '🍌');

-- ---------- TABLE: player_powerups (log พลังที่เปิดได้) ----------
create table player_powerups (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  powerup_id  uuid not null references powerups(id),
  source_answer_id uuid references answers(id),
  opened_at   timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- หลักการ: นักเรียนแตะตารางตรง ๆ ไม่ได้ ต้องผ่าน RPC (security definer)
-- เฉพาะ players / games (อ่านสนาม) เปิดอ่านสาธารณะได้ ส่วน questions ปิด
-- =====================================================================
alter table games           enable row level security;
alter table questions       enable row level security;
alter table players         enable row level security;
alter table answers         enable row level security;
alter table powerups        enable row level security;
alter table player_powerups enable row level security;

-- จอครู + จอนักเรียน อ่านสถานะห้อง/ผู้เล่น (สำหรับ Realtime แสดงสนาม)
create policy read_games   on games   for select using (true);
create policy read_players on players for select using (true);
create policy read_powerups on powerups for select using (true);

-- questions / answers / player_powerups: ไม่มี policy = นักเรียนอ่านตรงไม่ได้
-- (เฉลยอยู่ใน questions.correct_index จึงต้องล็อกแน่น เข้าผ่าน RPC เท่านั้น)

-- =====================================================================
-- RPCs (security definer) — หัวใจกันโกง
-- =====================================================================

-- เข้าห้อง: สแกน QR -> ใส่ชื่อ/สี -> ได้ player_id
create or replace function join_game(p_room_code text, p_nickname text, p_color text default '#22d3ee')
returns players language plpgsql security definer as $$
declare g games; p players;
begin
  select * into g from games where room_code = p_room_code and status <> 'finished';
  if g.id is null then raise exception 'ไม่พบห้อง หรือเกมจบแล้ว'; end if;
  if (select count(*) from players where game_id = g.id) >= 40 then
    raise exception 'ห้องเต็ม (40 คน)';
  end if;
  insert into players (game_id, nickname, avatar_color)
    values (g.id, p_nickname, p_color) returning * into p;
  return p;
end $$;

-- ดึงคำถามถัดไป (ไม่ส่ง correct_index) — วนคำถามที่ตอบน้อยสุดก่อน
create or replace function get_next_question(p_player_id uuid)
returns table(question_id uuid, body text, image_url text, choices jsonb)
language plpgsql security definer as $$
declare v_game uuid;
begin
  select game_id into v_game from players where id = p_player_id;
  return query
    select q.id, q.body, q.image_url, q.choices
    from questions q
    left join answers a on a.question_id = q.id and a.player_id = p_player_id
    where q.game_id = v_game
    group by q.id
    order by count(a.id) asc, random()   -- ตอบครบแล้ววนใหม่อัตโนมัติ
    limit 1;
end $$;

-- ส่งคำตอบ: ตรวจ + ให้คะแนน + คืนว่าได้เปิดกล่องไหม
create or replace function submit_answer(p_player_id uuid, p_question_id uuid, p_selected int, p_time_ms int default null)
returns jsonb language plpgsql security definer as $$
declare
  q questions; pl players; g games;
  v_correct boolean; v_points int := 0; v_ans uuid; v_speed int := 0;
begin
  select * into q from questions where id = p_question_id;
  select * into pl from players where id = p_player_id;
  select * into g from games where id = pl.game_id;
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
    multiplier_next= 1,                       -- ใช้ตัวคูณแล้วรีเซ็ต
    sabotaged      = false,                   -- ใช้ผลกับดักแล้วเคลียร์
    last_seen      = now()
  where id = p_player_id;

  return jsonb_build_object(
    'is_correct', v_correct,
    'points', v_points,
    'box_offered', v_correct,                 -- ตอบถูกถึงเปิดกล่อง
    'source_answer_id', v_ans
  );
end $$;

-- เปิดกล่อง 1 ใน 3: สุ่มพลังถ่วงน้ำหนัก
--  - พลังทั่วไป (บูสต์ / คูณสอง / แจ็กพ็อต / โล่) มีผลทันที
--  - พลังโจมตี (ขโมย / กับดัก) จะ "สุ่มเป้าหมาย 1 คน" ล็อกไว้ แล้วคืนให้ UI
--    ผู้เล่นกดยืนยันอย่างเดียว เลือกคนเองไม่ได้ (กันแกล้งเจาะจง)
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
    select * into v_target from players
      where game_id = v_game and id <> pl.id and is_connected
      order by random() limit 1;          -- สุ่มคู่แข่ง 1 คน — ไม่เลือกเอง

    if v_target.id is null then
      return jsonb_build_object('code', pw.code, 'name_th', pw.name_th, 'icon', pw.icon,
        'kind', 'attack', 'target', null, 'message', 'ยังไม่มีคู่แข่งให้เล่นงาน');
    end if;

    update players set pending_power = pw.effect_type, pending_target = v_target.id
      where id = pl.id;                    -- ล็อกเป้าหมาย เปลี่ยนไม่ได้

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

-- ลงมือกับเป้าหมายที่สุ่มล็อกไว้ (ผู้เล่นกดยืนยัน) — ใช้กับ ขโมย / กับดัก
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
    update players set sabotaged = true where id = v_target.id;
    v_msg := 'วางกับดักใส่ ' || v_target.nickname || ' สำเร็จ';

  elsif v_kind = 'steal_random' then
    if v_target.shield then
      update players set shield = false where id = v_target.id;   -- โล่กันได้ 1 ครั้ง
      v_msg := v_target.nickname || ' มีโล่ ป้องกันไว้ได้';
    else
      v_gain := least(100, v_target.score);                      -- ขโมย 100 (ไม่ติดลบ)
      update players set score = score - v_gain where id = v_target.id;
      update players set score = score + v_gain where id = pl.id;
      v_msg := 'ขโมย ' || v_gain || ' แต้มจาก ' || v_target.nickname;
    end if;
  end if;

  update players set pending_power = null, pending_target = null where id = pl.id;

  return jsonb_build_object('kind', v_kind, 'gain', v_gain, 'message', v_msg,
    'new_score', (select score from players where id = pl.id));
end $$;

-- =====================================================================
-- REALTIME: เปิด publication ให้จอครูรับตำแหน่ง/คะแนนสด
--   (ฝั่ง front-end subscribe ตาราง players ของ game_id นั้น
--    แล้ว map score -> ตำแหน่งบนสนาม 3D, throttle อัปเดต ~0.5-1s)
-- =====================================================================
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table games;
