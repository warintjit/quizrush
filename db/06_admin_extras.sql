-- =====================================================================
-- QUIZ RUSH — 06 ส่วนเสริม Admin: แก้ไขข้อสอบ/เปลี่ยนชื่อชุด/รูปภาพ
--                + ครูปรับ track_max_score ตอนสร้างห้อง
-- รันหลัง 01-05
-- =====================================================================

-- ---------- create_game: รับ track_max ด้วย (ปรับว่าวิ่งกี่รอบ) ----------
-- เปลี่ยน signature (เพิ่ม param) จึง DROP ตัวเดิมก่อน
drop function if exists create_game(int);
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
        'track_max_score', greatest(500, least(p_track_max, 20000))
      )
    )
    returning * into g;
  return g;
end $$;

-- ---------- add_bank_question: รองรับ image_url ----------
drop function if exists add_bank_question(uuid, text, text, jsonb, int);
create or replace function add_bank_question(
  p_set_id uuid, p_qtype text, p_body text, p_choices jsonb, p_correct_index int,
  p_image_url text default null
) returns bank_questions language plpgsql security definer as $$
declare q bank_questions;
begin
  if p_qtype not in ('mc', 'tf') then raise exception 'ชนิดข้อไม่ถูกต้อง (mc/tf)'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'กรุณากรอกโจทย์'; end if;
  insert into bank_questions (set_id, qtype, body, choices, correct_index, image_url)
    values (p_set_id, p_qtype, trim(p_body), p_choices, p_correct_index, nullif(trim(p_image_url), ''))
    returning * into q;
  return q;
end $$;

-- ---------- update_bank_question: แก้ไขข้อที่มีอยู่ ----------
create or replace function update_bank_question(
  p_id uuid, p_qtype text, p_body text, p_choices jsonb, p_correct_index int,
  p_image_url text default null
) returns bank_questions language plpgsql security definer as $$
declare q bank_questions;
begin
  if p_qtype not in ('mc', 'tf') then raise exception 'ชนิดข้อไม่ถูกต้อง (mc/tf)'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'กรุณากรอกโจทย์'; end if;
  update bank_questions set
    qtype = p_qtype,
    body = trim(p_body),
    choices = p_choices,
    correct_index = p_correct_index,
    image_url = nullif(trim(p_image_url), '')
  where id = p_id
  returning * into q;
  return q;
end $$;

-- ---------- rename_question_set ----------
create or replace function rename_question_set(p_set_id uuid, p_title text)
returns question_sets language plpgsql security definer as $$
declare s question_sets;
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'กรุณาตั้งชื่อชุด'; end if;
  update question_sets set title = trim(p_title) where id = p_set_id returning * into s;
  return s;
end $$;

-- ---------- import_bank_questions: รองรับ image_url ใน items ----------
create or replace function import_bank_questions(p_set_id uuid, p_items jsonb)
returns int language plpgsql security definer as $$
declare v_count int;
begin
  insert into bank_questions (set_id, qtype, body, choices, correct_index, image_url)
  select
    p_set_id,
    coalesce(x->>'qtype', 'mc'),
    x->>'body',
    x->'choices',
    (x->>'correct_index')::int,
    nullif(trim(x->>'image_url'), '')
  from jsonb_array_elements(p_items) x
  where coalesce(trim(x->>'body'), '') <> '';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
