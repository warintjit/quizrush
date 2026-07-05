-- =====================================================================
-- QUIZ RUSH — 02 Lobby RPCs (เพิ่มเติมจาก quiz_rush_schema_v0.sql)
-- รันไฟล์นี้หลังรัน quiz_rush_schema_v0.sql แล้ว
-- =====================================================================

-- ครูสร้างห้องแข่ง: สุ่ม room_code 6 หลักไม่ซ้ำ + ตั้งเวลา (นาที)
create or replace function create_game(p_duration_min int default 5)
returns games language plpgsql security definer as $$
declare g games; v_code text;
begin
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (
      select 1 from games where room_code = v_code and status <> 'finished'
    );
  end loop;

  insert into games (room_code, duration_min, host_id)
    values (v_code, greatest(1, least(p_duration_min, 60)), auth.uid())
    returning * into g;
  return g;
end $$;

-- ครูกดเริ่มเกม: เปลี่ยนสถานะเป็น running + ตั้งเวลาเริ่ม/หมด
create or replace function start_game(p_game_id uuid)
returns games language plpgsql security definer as $$
declare g games;
begin
  update games
    set status     = 'running',
        started_at = now(),
        ends_at    = now() + make_interval(mins => duration_min)
  where id = p_game_id and status = 'lobby'
  returning * into g;

  if g.id is null then raise exception 'เริ่มเกมไม่ได้ (ไม่พบห้อง หรือเริ่มไปแล้ว)'; end if;
  return g;
end $$;
