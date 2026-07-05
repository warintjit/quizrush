# Quiz Rush — ขั้น (ก) Lobby + สแกน QR เข้าห้อง

เกมแข่งตอบคำถามแบบ self-paced (React + Vite + Supabase + Netlify)
ขั้นนี้ทำเฉพาะ **การเข้าห้อง**: ครูสร้างห้อง → ได้ QR/รหัส → นักเรียนสแกนใส่ชื่อเลือกสี → ห้องรอแบบสด → ครูกดเริ่ม

---

## 1) ติดตั้ง

```bash
npm install
```

## 2) ตั้งค่า Supabase

คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่าจาก Supabase → Project Settings → API

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyXXXX...
```

## 3) รัน SQL (ใน Supabase → SQL Editor)

รันตามลำดับ ถ้ายังไม่เคยรัน:
1. `quiz_rush_schema_v0.sql`  (สคีมาหลัก — จากแชตก่อนหน้า)
2. `db/02_lobby_rpcs.sql`     (ฟังก์ชัน create_game / start_game ของขั้นนี้)

> หมายเหตุ: ในสคีมามีการเปิด Realtime ให้ตาราง `players` และ `games` แล้ว
> ถ้า Realtime ไม่ทำงาน ให้เช็คที่ Supabase → Database → Replication ว่าตารางถูกเพิ่มใน publication `supabase_realtime`

## 4) รันทดสอบ

```bash
npm run dev
```

เปิด `http://localhost:5173`
- แท็บที่ 1: เข้า `/host` → สร้างห้อง → จะเห็น QR + รหัส 6 หลัก
- แท็บที่ 2 (หรือหน้าต่างไม่ระบุตัวตน): เข้า `/join` กรอกรหัส ใส่ชื่อ เลือกสี → เข้าห้อง
- กลับไปแท็บครู จะเห็นชื่อผู้เล่นโผล่ขึ้นมาสด ๆ → กด **เริ่มเกม**

> ทดสอบบนมือถือจริงด้วยการสแกน QR ได้หลัง deploy แล้ว (ตอน dev มือถือเข้า localhost ของคอมไม่ได้)

## 5) Deploy ขึ้น Netlify

```bash
npm run build
```

ลากโฟลเดอร์ **`dist/`** ไปวางใน Netlify (drag & drop)
แล้วตั้ง Environment variables ใน Netlify → Site settings → Environment:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (ต้อง build ใหม่หลังตั้งค่า)

ไฟล์ `public/_redirects` จัดการ SPA routing ให้แล้ว (กันหน้า 404 ตอน refresh)

---

## โครงไฟล์

```
src/
  lib/
    supabase.js     เชื่อมต่อ Supabase
    api.js          เรียก RPC + realtime + จำ session
    constants.js    สีอวตาร
  components/
    Pieces.jsx      PlayerChip, ColorPicker
  pages/
    Home.jsx        เลือกบทบาท ครู/นักเรียน
    HostLobby.jsx   ครู: สร้างห้อง, QR, รายชื่อสด, เริ่มเกม
    JoinPage.jsx    นักเรียน: กรอกชื่อ/สี/รหัส เข้าร่วม
    PlayerLobby.jsx นักเรียน: ห้องรอ, เด้งเข้าเกมเมื่อครูเริ่ม
    Playing.jsx     ที่ว่างไว้ต่อขั้น (ข)/(ค)
```

## ต่อไป
- (ข) เครื่องยนต์ควิซบนมือถือ: ดึงคำถาม → ตอบ → เปิดกล่อง → ยืนยันพลังโจมตี
- (ค) สนามแข่ง 3D บนจอครู: React Three Fiber อวตารวิ่งตามคะแนนสด
