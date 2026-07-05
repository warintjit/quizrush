-- =====================================================================
-- QUIZ RUSH — 08 แก้ปัญหา create_game ซ้อนกันหลายเวอร์ชัน
-- อาการ: "Could not choose the best candidate function between:
--         public.create_game(p_duration_min, p_track_max)
--         public.create_game(p_duration_min, p_track_max, p_per_player)"
-- สาเหตุ: ในฐานข้อมูลมีฟังก์ชัน create_game ค้างอยู่หลายเวอร์ชัน (overload)
--         ที่เรียกด้วย 2 อาร์กิวเมนต์ได้เหมือนกัน → Postgres เลือกไม่ถูก
-- วิธีแก้: ลบ create_game ทุกเวอร์ชันทิ้งให้เกลี้ยง แล้วสร้างตัวเดียวที่ถูกต้อง
-- รันไฟล์นี้ใน Supabase SQL Editor (รันซ้ำได้ปลอดภัย)
-- =====================================================================

-- ---------- ลบ create_game ทุก overload ในสคีมา public ----------
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname = 'create_game'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig::text || ' cascade';
  end loop;
end $$;

-- ---------- สร้าง create_game ตัวเดียวที่ถูกต้อง (2 พารามิเตอร์) ----------
-- เหมือนใน 07: ใส่ base_points / speed bonus / wrong_penalty / track_max_score
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
