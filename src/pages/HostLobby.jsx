import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { createGame, startGame, fetchPlayers, subscribePlayers, fetchSets, copySetToGame } from '../lib/api'
import { supabase } from '../lib/supabase'
import { PlayerChip } from '../components/Pieces'
import AdminGate from '../components/AdminGate'

// ครูต้องกรอกรหัสเดียวกับผู้ดูแลก่อนถึงจะสร้างห้องได้
export default function HostLobby() {
  return (
    <AdminGate subtitle="สร้างห้องแข่ง (สำหรับครู)">
      <HostLobbyInner />
    </AdminGate>
  )
}

function HostLobbyInner() {
  const nav = useNavigate()
  const [phase, setPhase] = useState('create') // create | lobby
  const [duration, setDuration] = useState(5)
  const [trackMax, setTrackMax] = useState(3000)
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sets, setSets] = useState([])
  const [setId, setSetId] = useState('')

  // โหลดชุดข้อสอบจากคลังตอนเข้าหน้าตั้งค่า
  useEffect(() => {
    fetchSets()
      .then((s) => {
        setSets(s)
        if (s.length) setSetId(s[0].id)
      })
      .catch(() => {})
  }, [])

  // realtime รายชื่อผู้เล่นเมื่อเข้าสู่ห้องรอ
  useEffect(() => {
    if (!game) return
    let alive = true
    fetchPlayers(game.id).then((p) => alive && setPlayers(p)).catch(() => {})
    const unsub = subscribePlayers(game.id, () => {
      fetchPlayers(game.id).then((p) => alive && setPlayers(p)).catch(() => {})
    })
    return () => {
      alive = false
      unsub()
    }
  }, [game])

  async function onCreate() {
    setBusy(true)
    setErr('')
    try {
      const g = await createGame(duration, trackMax)
      // คัดลอกข้อสอบจากชุดที่เลือกเข้าห้อง — ถ้าไม่มีชุด ใช้คำถามตัวอย่าง
      let copied = 0
      if (setId) {
        copied = await copySetToGame(setId, g.id)
      }
      if (!copied) {
        await supabase.rpc('seed_demo_questions', { p_game_id: g.id })
      }
      setGame(g)
      setPhase('lobby')
    } catch (e) {
      setErr(e.message || 'สร้างห้องไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function onStart() {
    setBusy(true)
    setErr('')
    try {
      await startGame(game.id)
      nav(`/play/${game.id}?role=host`)
    } catch (e) {
      setErr(e.message || 'เริ่มเกมไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'create') {
    return (
      <div className="app">
        <div className="wrap">
          <div className="center">
            <div className="brand">QUIZ RUSH</div>
            <div className="brand-sub">ตั้งค่าห้องแข่ง</div>
          </div>
          <div className="spacer" />
          <div className="card">
            <label>ชุดข้อสอบ</label>
            {sets.length === 0 ? (
              <div className="muted" style={{ fontSize: '.9rem' }}>
                ยังไม่มีชุดข้อสอบในคลัง — จะใช้คำถามตัวอย่างให้ก่อน (สร้างชุดเองได้ที่หน้า
                <button className="link" onClick={() => nav('/admin')} style={{ marginLeft: 4 }}>คลังข้อสอบ</button>)
              </div>
            ) : (
              <select className="input" value={setId} onChange={(e) => setSetId(e.target.value)}>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            )}
            <div className="spacer" />

            <label>เวลาแข่งขัน (นาที)</label>
            <div className="dur-row">
              <input
                type="range"
                min="1"
                max="30"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
              <span className="dur-val">{duration} น.</span>
            </div>
            <div className="spacer" />

            <label>ระยะทางสนาม (คะแนนต่อรอบสุดท้าย)</label>
            <div className="dur-row">
              <input
                type="range"
                min="1000"
                max="6000"
                step="500"
                value={trackMax}
                onChange={(e) => setTrackMax(Number(e.target.value))}
              />
              <span className="dur-val" style={{ fontSize: '1rem' }}>{trackMax}</span>
            </div>
            <div className="muted" style={{ fontSize: '.82rem', marginTop: 4 }}>
              ค่ามาก = อวตารวิ่งช้าลง (วนน้อยรอบ) · ค่าน้อย = วิ่งเร็ว แซงกันสนุก
            </div>
            <div className="spacer" />
            <button className="btn btn-gold" disabled={busy} onClick={onCreate}>
              {busy ? 'กำลังสร้าง…' : '🏁 สร้างห้อง'}
            </button>
            {err && <div className="err">{err}</div>}
          </div>
          <div className="spacer" />
          <div className="center">
            <button className="link" onClick={() => nav('/')}>← กลับหน้าแรก</button>
          </div>
        </div>
      </div>
    )
  }

  // ----- lobby -----
  const joinUrl = `${window.location.origin}/join?room=${game.room_code}`
  return (
    <div className="app">
      <div className="wrap">
        <div className="center">
          <div className="brand-sub">ให้นักเรียนสแกนเพื่อเข้าสนาม</div>
          <div className="spacer" />
          <div className="qr-box">
            <QRCodeCanvas value={joinUrl} size={208} bgColor="#ffffff" fgColor="#1b2433" />
          </div>
          <div className="spacer" />
          <div className="muted">หรือกรอกรหัสห้อง</div>
          <div className="code-badge">{game.room_code}</div>
        </div>

        <div className="spacer" />
        <div className="card">
          <div className="row">
            <span className="count-pill">
              ผู้เล่น <b>{players.length}</b> / 40
            </span>
            <button
              className="btn btn-lime"
              style={{ width: 'auto', padding: '12px 22px' }}
              disabled={busy || players.length === 0}
              onClick={onStart}
            >
              {busy ? 'กำลังเริ่ม…' : '▶ เริ่มเกม'}
            </button>
          </div>
          <div className="spacer" />
          {players.length === 0 ? (
            <div className="muted waiting">กำลังรอผู้เล่นเข้าห้อง…</div>
          ) : (
            <div className="player-grid">
              {players.map((p) => (
                <PlayerChip key={p.id} player={p} />
              ))}
            </div>
          )}
          {err && <div className="err">{err}</div>}
        </div>
      </div>
    </div>
  )
}
