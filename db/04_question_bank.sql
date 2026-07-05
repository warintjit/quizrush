-- =====================================================================
-- QUIZ RUSH — 04 คลังข้อสอบกลาง (Question Bank) + ชนิดข้อ ปรนัย/ถูกผิด
-- รันหลัง 01, 02, 03
--
-- แนวคิด: เก็บข้อสอบไว้ใน "คลังกลาง" (ไม่ผูกห้อง) จัดเป็น "ชุด" (sets)
-- ตอนครูสร้างห้อง → เลือกชุด → คัดลอกข้อสอบของชุดนั้นเข้าตาราง questions ของห้อง
-- ชนิดข้อ: 'mc' = ปรนัย (4 ตัวเลือก), 'tf' = ถูก/ผิด (2 ตัวเลือก)
-- =====================================================================

-- ---------- เพิ่มคอลัมน์ qtype ให้ตาราง questions (ของห้อง) ----------
alter table questions add column if not exists qtype text not null default 'mc';

-- ---------- ตาราง: ชุดข้อสอบในคลัง ----------
create table if not exists question_sets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- ---------- ตาราง: ข้อสอบในคลัง (ผูกกับชุด) ----------
-- choices: ปรนัย = [{"text":"..."} x4], ถูกผิด = [{"text":"ถูก"},{"text":"ผิด"}]
-- correct_index: ตำแหน่งคำตอบถูก (ปรนัย 0-3, ถูกผิด 0=ถูก 1=ผิด)
create table if not exists bank_questions (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid not null references question_sets(id) on delete cascade,
  qtype         text not null default 'mc' check (qtype in ('mc', 'tf')),
  body          text not null,
  image_url     text,
  choices       jsonb not null,
  correct_index int  not null check (correct_index between 0 and 3),
  created_at    timestamptz not null default now()
);
create index if not exists idx_bank_questions_set on bank_questions(set_id);

-- ---------- RLS: อ่านชุด/ข้อในคลังได้สาธารณะ (เลือกชุดตอนสร้างห้อง) ----------
-- การ "เขียน" คลังทำผ่าน RPC security definer เท่านั้น (กันลบ/แก้ตรง ๆ)
alter table question_sets   enable row level security;
alter table bank_questions  enable row level security;

drop policy if exists read_sets on question_sets;
drop policy if exists read_bank on bank_questions;
create policy read_sets on question_sets  for select using (true);
create policy read_bank  on bank_questions for select using (true);

-- =====================================================================
-- RPCs จัดการคลัง (security definer)
-- =====================================================================

-- สร้างชุดข้อสอบใหม่
create or replace function create_question_set(p_title text, p_description text default null)
returns question_sets language plpgsql security definer as $$
declare s question_sets;
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'กรุณาตั้งชื่อชุดข้อสอบ'; end if;
  insert into question_sets (title, description) values (trim(p_title), p_description)
    returning * into s;
  return s;
end $$;

-- ลบชุด (ลบข้อในชุดทั้งหมดตาม cascade)
create or replace function delete_question_set(p_set_id uuid)
returns void language plpgsql security definer as $$
begin
  delete from question_sets where id = p_set_id;
end $$;

-- เพิ่มข้อสอบ 1 ข้อเข้าชุด
create or replace function add_bank_question(
  p_set_id uuid, p_qtype text, p_body text, p_choices jsonb, p_correct_index int
) returns bank_questions language plpgsql security definer as $$
declare q bank_questions;
begin
  if p_qtype not in ('mc', 'tf') then raise exception 'ชนิดข้อไม่ถูกต้อง (mc/tf)'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'กรุณากรอกโจทย์'; end if;
  insert into bank_questions (set_id, qtype, body, choices, correct_index)
    values (p_set_id, p_qtype, trim(p_body), p_choices, p_correct_index)
    returning * into q;
  return q;
end $$;

-- นำเข้าหลายข้อพร้อมกัน (เช่น จาก CSV) — p_items = jsonb array
-- แต่ละตัว: {"qtype","body","choices","correct_index"}
create or replace function import_bank_questions(p_set_id uuid, p_items jsonb)
returns int language plpgsql security definer as $$
declare v_count int;
begin
  insert into bank_questions (set_id, qtype, body, choices, correct_index)
  select
    p_set_id,
    coalesce(x->>'qtype', 'mc'),
    x->>'body',
    x->'choices',
    (x->>'correct_index')::int
  from jsonb_array_elements(p_items) x
  where coalesce(trim(x->>'body'), '') <> '';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ลบข้อสอบในคลัง
create or replace function delete_bank_question(p_id uuid)
returns void language plpgsql security definer as $$
begin
  delete from bank_questions where id = p_id;
end $$;

-- คัดลอกข้อสอบทั้งชุดเข้าห้อง (เรียกตอนครูสร้างห้อง)
create or replace function copy_set_to_game(p_set_id uuid, p_game_id uuid)
returns int language plpgsql security definer as $$
declare v_count int;
begin
  insert into questions (game_id, body, image_url, choices, correct_index, qtype)
  select p_game_id, body, image_url, choices, correct_index, qtype
  from bank_questions where set_id = p_set_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- =====================================================================
-- แก้ get_next_question ให้ส่ง qtype ด้วย (มือถือจะ render ปุ่มตามชนิด)
-- ต้อง DROP ก่อน เพราะเปลี่ยน return type (เพิ่มคอลัมน์ qtype)
-- =====================================================================
drop function if exists get_next_question(uuid);
create or replace function get_next_question(p_player_id uuid)
returns table(question_id uuid, body text, image_url text, choices jsonb, qtype text)
language plpgsql security definer as $$
declare v_game uuid;
begin
  select game_id into v_game from players where id = p_player_id;
  return query
    select q.id, q.body, q.image_url, q.choices, q.qtype
    from questions q
    left join answers a on a.question_id = q.id and a.player_id = p_player_id
    where q.game_id = v_game
    group by q.id
    order by count(a.id) asc, random()
    limit 1;
end $$;

-- =====================================================================
-- Seed: สร้างชุดตัวอย่าง "ความรู้ทั่วไป" (ปรนัย + ถูก/ผิด) ถ้ายังไม่มี
-- =====================================================================
do $$
declare v_set uuid;
begin
  if not exists (select 1 from question_sets where title = 'ตัวอย่าง: ความรู้ทั่วไป') then
    insert into question_sets (title, description)
      values ('ตัวอย่าง: ความรู้ทั่วไป', 'ชุดสาธิต ผสมปรนัยและถูก/ผิด')
      returning id into v_set;

    insert into bank_questions (set_id, qtype, body, choices, correct_index) values
    (v_set, 'mc', 'เมืองหลวงของประเทศไทยคือ?',
      '[{"text":"กรุงเทพมหานคร"},{"text":"เชียงใหม่"},{"text":"ภูเก็ต"},{"text":"ขอนแก่น"}]', 0),
    (v_set, 'mc', '1 + 1 x 2 มีค่าเท่าไร?',
      '[{"text":"4"},{"text":"3"},{"text":"2"},{"text":"6"}]', 1),
    (v_set, 'mc', 'ดาวเคราะห์ที่อยู่ใกล้ดวงอาทิตย์ที่สุดคือ?',
      '[{"text":"โลก"},{"text":"ดาวอังคาร"},{"text":"ดาวพุธ"},{"text":"ดาวศุกร์"}]', 2),
    (v_set, 'mc', 'ผู้แต่งวรรณคดีเรื่อง "พระอภัยมณี" คือใคร?',
      '[{"text":"สุนทรภู่"},{"text":"รัชกาลที่ 2"},{"text":"ศรีปราชญ์"},{"text":"พระยาตรัง"}]', 0),
    (v_set, 'mc', 'แม่น้ำที่ยาวที่สุดในโลกคือแม่น้ำใด?',
      '[{"text":"แม่น้ำเจ้าพระยา"},{"text":"แม่น้ำไนล์"},{"text":"แม่น้ำอเมซอน"},{"text":"แม่น้ำแยงซี"}]', 1),
    (v_set, 'mc', 'สัตว์เลี้ยงลูกด้วยนมที่ตัวใหญ่ที่สุดในโลกคือ?',
      '[{"text":"ช้างแอฟริกา"},{"text":"ฉลามวาฬ"},{"text":"วาฬสีน้ำเงิน"},{"text":"ยีราฟ"}]', 2),
    (v_set, 'mc', 'กีฬาโอลิมปิกจัดขึ้นทุกกี่ปี?',
      '[{"text":"2 ปี"},{"text":"3 ปี"},{"text":"4 ปี"},{"text":"5 ปี"}]', 2),
    (v_set, 'mc', 'อวัยวะใดทำหน้าที่สูบฉีดเลือดในร่างกาย?',
      '[{"text":"ตับ"},{"text":"หัวใจ"},{"text":"ปอด"},{"text":"ไต"}]', 1),
    (v_set, 'tf', 'ดวงอาทิตย์ขึ้นทางทิศตะวันออก',
      '[{"text":"ถูก"},{"text":"ผิด"}]', 0),
    (v_set, 'tf', 'น้ำเดือดที่อุณหภูมิ 50 องศาเซลเซียส',
      '[{"text":"ถูก"},{"text":"ผิด"}]', 1),
    (v_set, 'tf', 'แมงมุมเป็นแมลง',
      '[{"text":"ถูก"},{"text":"ผิด"}]', 1),
    (v_set, 'tf', 'ประเทศไทยมี 77 จังหวัด',
      '[{"text":"ถูก"},{"text":"ผิด"}]', 0);
  end if;
end $$;
