import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { joinGame, saveSession, loadSession } from '../lib/api'
import { ColorPicker } from '../components/Pieces'
import { AVATAR_COLORS } from '../lib/constants'

export default function JoinPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const roomFromQR = (params.get('room') || '').replace(/\D/g, '').slice(0, 6)

  // จำชื่อ/สีจากเกมก่อน เพื่อไม่ต้องกรอกใหม่ทุกรอบ (รหัสห้องต้องกรอกใหม่เสมอ)
  const prev = loadSession()

  const [code, setCode] = useState(roomFromQR)
  const [nickname, setNickname] = useState(prev?.nickname || '')
  const [color, setColor] = useState(prev?.color || AVATAR_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const lockedCode = roomFromQR.length === 6

  async function onJoin() {
    setErr('')
    if (code.length !== 6) return setErr('กรอกรหัสห้อง 6 หลัก')
    if (!nickname.trim()) return setErr('ใส่ชื่อเล่นก่อนนะ')
    setBusy(true)
    try {
      const player = await joinGame(code, nickname.trim(), color)
      saveSession({
        playerId: player.id,
        gameId: player.game_id,
        nickname: player.nickname,
        color: player.avatar_color,
      })
      nav(`/lobby/${player.game_id}`)
    } catch (e) {
      setErr(e.message || 'เข้าห้องไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="wrap" style={{ maxWidth: 440 }}>
        <div className="center">
          <div className="brand">QUIZ RUSH</div>
          <div className="brand-sub">เข้าสนามแข่ง</div>
        </div>
        <div className="spacer" />
        <div className="card">
          {!lockedCode && (
            <>
              <label>รหัสห้อง</label>
              <input
                className="input code"
                inputMode="numeric"
                placeholder="------"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <div className="spacer" />
            </>
          )}

          <label>ชื่อเล่น</label>
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

          <button className="btn btn-primary" disabled={busy} onClick={onJoin}>
            {busy ? 'กำลังเข้า…' : '🎮 เข้าสนาม'}
          </button>
          {err && <div className="err">{err}</div>}
        </div>
      </div>
    </div>
  )
}
