# Quiz Rush — บริบทโปรเจกต์ (อ่านก่อนเริ่มงาน)

## ภาพรวม
เกมแข่งตอบคำถามในห้องเรียน สไตล์ Kahoot ผสม Mario Kart
- นักเรียนสแกน QR เข้าสนาม ตอบคำถาม 4 ตัวเลือก
- ตอบถูก = ได้คะแนน + เปิด 1 ใน 3 กล่อง สุ่มพลัง / ตอบผิด = ไม่เสียคะแนน ไปข้อถัดไป
- **ตำแหน่งอวตารบนสนาม = คะแนน** (พลังที่เพิ่ม/ขโมยคะแนน ทำให้อวตารพุ่ง/แซง)
- ชนะด้วย **เวลา** (ครูตั้งเป็นนาที) ข้อสอบหมดให้สุ่มวนใหม่
- รูปแบบ **self-paced**: แต่ละคนวิ่งลูปคำถามของตัวเอง ไม่รอกัน

## Stack
- React 18 (Vite) + Supabase (Postgres + Realtime) + Netlify
- จอครู: React Three Fiber เรนเดอร์สนาม 3D — **ต้องใช้ R3F v8 + drei v9** (v9/v10 ต้องการ React 19) · โหลดแบบ lazy ไม่กระทบ bundle นักเรียน
- จอนักเรียน: React UI เบา ๆ ไม่มี 3D

## โครงสร้าง
- `src/lib/` — supabase client, api wrappers (RPC + realtime), constants, `csv.js` (parser/template CSV)
- `src/pages/` — Home, HostLobby, JoinPage, PlayerLobby, Playing, **Admin** (คลังข้อสอบ)
- `src/components/Pieces.jsx` — PlayerChip, ColorPicker · `RaceField.jsx` — สนาม 3D
- `db/` — ไฟล์ SQL (รันใน Supabase SQL Editor ตามลำดับเลข)

## ฐานข้อมูล (Supabase)
ตาราง: games, questions, players, answers, powerups, player_powerups, **question_sets, bank_questions** (คลังข้อสอบกลาง)
- รัน SQL ตามลำดับ: `01_schema_v0.sql` → `02_lobby_rpcs.sql` → `03_seed_questions.sql` → `04_question_bank.sql` → `05_end_game.sql` → `06_admin_extras.sql`
- RPC หลัก: create_game (รับ track_max), start_game, **end_game**, join_game, get_next_question, submit_answer, open_box, execute_targeted_power
- RPC คลังข้อสอบ: create_question_set, delete_question_set, rename_question_set, add_bank_question, update_bank_question, import_bank_questions, delete_bank_question, copy_set_to_game (รองรับ image_url)
- `questions.qtype` / `bank_questions.qtype` = `'mc'` (ปรนัย 4 ตัวเลือก) หรือ `'tf'` (ถูก/ผิด, choices=[ถูก,ผิด], correct_index 0=ถูก 1=ผิด)
- เปิด Realtime ให้ตาราง players และ games แล้ว

## กฎสำคัญ (ห้ามพลาด)
1. **เฉลยห้ามหลุดไป client** — `questions.correct_index` เข้าถึงได้ผ่าน RPC (security definer) เท่านั้น การตรวจคำตอบทำฝั่งเซิร์ฟเวอร์เสมอ
2. **พลังโจมตี (ขโมย/กับดัก) สุ่มเป้าหมายให้ เลือกคนเองไม่ได้** — กันแกล้งเจาะจง (ใช้คอลัมน์ pending_power / pending_target)
3. ห้าม commit ไฟล์ `.env` (มีใน .gitignore แล้ว)

## สไตล์การทำงานที่ผู้ใช้ชอบ
- อธิบายเป็น **ภาษาไทย** แบบทีละขั้น เป็นมิตรกับผู้เริ่มต้น
- ส่ง/แก้เป็นไฟล์ที่สมบูรณ์ ไม่ใช่ snippet กระจัดกระจาย
- ก่อนทำขั้นที่สำคัญ (เปลี่ยน schema, เปลี่ยนโครงใหญ่) ให้ถามยืนยันก่อน อันไหนทำได้เลยก็ทำ

## ธีม UI
ฟอนต์ Chakra Petch (หัวข้อ) + Sarabun (เนื้อหา) · พื้นเข้ม asphalt #1b2433 · สีเน้น cyan/coral/gold/lime/violet

## สถานะงาน
- [x] (ก) Lobby + สแกน QR เข้าห้อง — เสร็จแล้ว
- [x] (ข) เครื่องยนต์ควิซบนมือถือ: get_next_question → ตอบ → เปิดกล่อง → ยืนยันพลังโจมตี — เสร็จแล้ว (seed คำถามผ่าน `db/03_seed_questions.sql`, auto-seed ตอนสร้างห้อง)
- [x] (ค) สนามแข่ง 3D บนจอครู: R3F อวตารวิ่งตามคะแนนสด — เสร็จแล้ว (`src/components/RaceField.jsx`)
  - **สนามวงรอบ (วงรี)** ทุกคนวิ่งบนแทร็กเดียวกัน แซงกันได้: คะแนน → มุมรอบวง (คะแนนต่อรอบ = `track_max_score / LAPS_AT_MAX` ให้สมดุลเวลา วนไม่จำกัด), กระจายเลนตามรัศมี
  - อวตาร low-poly น่ารัก (ตา/หมวก/แขนขาแกว่ง) หันหน้าตามทิศโค้ง, เอียงตอนพุ่ง + ฝุ่น, ผู้นำได้มงกุฎ + ประกาย
  - interpolate ด้วย lerp, throttle realtime 0.7s, code-split (lazy) ให้จอนักเรียนไม่ต้องโหลด three.js
  - **ฟอนต์ไทย** `public/fonts/Sarabun-Bold.ttf` สำหรับป้ายชื่อใน `<Text>` (drei ไม่รองรับไทยโดยปริยาย)
  - ปรับขนาดสนาม/ความเร็ววนได้ที่ค่าคงที่หัวไฟล์ `RX, RZ, ROAD_W, LAPS_AT_MAX, LERP_SPEED`
- [x] (ง) หน้า Admin คลังข้อสอบ (`/admin`, `src/pages/Admin.jsx`) — เสร็จแล้ว
  - **คลังกลางใช้ซ้ำได้**: จัดเป็น "ชุด" (question_sets) ตอนครูสร้างห้อง เลือกชุด → `copy_set_to_game` คัดลอกเข้าห้อง
  - เพิ่มข้อทีละข้อ (ปรนัย/ถูกผิด) + นำเข้า CSV (มี template ให้ดาวน์โหลด, parser ที่ `src/lib/csv.js`)
  - gate ด้วยรหัสใน `.env` `VITE_ADMIN_PASSWORD` (ดีฟอลต์ `admin`) — เป็น client-side gate กันคนทั่วไป ไม่ใช่ auth จริง (ระบบยังไม่มี user login)
  - เวลาแข่ง = เวลารวมทั้งเกม ตั้งตอนสร้างห้องใน HostLobby (ไม่ได้ทำเวลาต่อข้อ)
  - **แก้ไขข้อสอบ/เปลี่ยนชื่อชุด/รูปภาพในโจทย์** (image_url) ทำได้ในหน้า admin · ครูปรับ `track_max_score` ตอนสร้างห้องได้
- [x] จบเกม + ประกาศผล (โพเดียม) บนจอครู · leaderboard สด Top 10 ข้างขวา · แจ้งเตือนนักเรียนเมื่อโดนพลังโจมตี (toast) + เสียง/สั่น (`src/lib/sfx.js`)

## คำสั่งที่ใช้บ่อย
- `npm run dev` — รันทดสอบ (localhost:5173)
- `npm run build` — สร้าง dist/ สำหรับลากขึ้น Netlify
