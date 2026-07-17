import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  copySetToGame,
  createGame,
  fetchSets,
  joinGame,
  loadSession,
  saveSession,
  startGame,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import { ColorPicker } from '../components/Pieces'
import { AVATAR_COLORS } from '../lib/constants'

export default function Practice() {
  const nav = useNavigate()
  const previous = loadSession()

  const [sets, setSets] = useState([])
  const [setId, setSetId] = useState('')
  const [nickname, setNickname] = useState(previous?.nickname || '')
  const [color, setColor] = useState(previous?.color || AVATAR_COLORS[0])
  const [duration, setDuration] = useState(10)
  const [loadingSets, setLoadingSets] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    fetchSets()
      .then((items) => {
        if (!alive) return
        setSets(items)
        if (items.length) setSetId(items[0].id)
      })
      .catch((e) => alive && setErr(e.message || 'โหลดชุดข้อสอบไม่สำเร็จ'))
      .finally(() => alive && setLoadingSets(false))
    return () => {
      alive = false
    }
  }, [])

  async function onStartPractice() {
    setErr('')
    if (!nickname.trim()) return setErr('ใส่ชื่อเล่นก่อนนะ')
    if (!setId && sets.length > 0) return setErr('เลือกชุดข้อสอบก่อน')

    setBusy(true)
    try {
      const game = await createGame(duration, 3000)
      let copied = 0
      if (setId) copied = await copySetToGame(setId, game.id)
      if (!copied) {
        const { error } = await supabase.rpc('seed_demo_questions', { p_game_id: game.id })
        if (error) throw error
      }

      const player = await joinGame(game.room_code, nickname.trim(), color)
      await startGame(game.id)
      saveSession({
        playerId: player.id,
        gameId: player.game_id,
        nickname: player.nickname,
        color: player.avatar_color,
        mode: 'practice',
      })
      nav(`/play/${game.id}?mode=practice`)
    } catch (e) {
      setErr(e.message || 'เริ่มโหมดฝึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="wrap" style={{ maxWidth: 480 }}>
        <div className="center">
          <div className="brand">QUIZ RUSH</div>
          <div className="practice-heading">🧠 โหมดฝึกคนเดียว</div>
          <div className="brand-sub">เลือกชุดข้อสอบ แล้วฝึกทำตามจังหวะของตัวเอง</div>
        </div>

        <div className="spacer" />
        <div className="card practice-card">
          <label>ชุดข้อสอบ</label>
          {loadingSets ? (
            <div className="muted waiting">กำลังโหลดชุดข้อสอบ…</div>
          ) : sets.length > 0 ? (
            <select className="input" value={setId} onChange={(e) => setSetId(e.target.value)}>
              {sets.map((set) => (
                <option key={set.id} value={set.id}>{set.title}</option>
              ))}
            </select>
          ) : (
            <div className="practice-note">
              ยังไม่มีชุดข้อสอบในคลัง ระบบจะใช้คำถามตัวอย่างให้ก่อน
            </div>
          )}

          <div className="spacer" />
          <label>ชื่อผู้ฝึก</label>
          <input
            className="input"
            maxLength={16}
            placeholder="เช่น ก้อง"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />

          <div className="spacer" />
          <label>เลือกสีอวตาร</label>
          <ColorPicker colors={AVATAR_COLORS} value={color} onChange={setColor} />

          <div className="spacer" />
          <label>เวลาฝึก (นาที)</label>
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
          <div className="practice-note">
            ตอบครบทุกข้อแล้ว ระบบจะวนข้อที่ฝึกน้อยที่สุดให้โดยอัตโนมัติ
          </div>

          <div className="spacer" />
          <button
            className="btn btn-violet"
            disabled={busy || loadingSets}
            onClick={onStartPractice}
          >
            {busy ? 'กำลังเตรียมแบบฝึก…' : '▶ เริ่มฝึก'}
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
