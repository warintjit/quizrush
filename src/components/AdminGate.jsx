import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// รหัสผ่านผู้ดูแล (client-side gate กันคนทั่วไป ไม่ใช่ auth จริง)
const ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD || 'admin'
const UNLOCK_KEY = 'quizrush_admin_ok'

// ครอบเนื้อหาไว้หลังด่านรหัสผ่าน — ปลดล็อกครั้งเดียวใช้ได้ทั้ง /admin และ /host
// ในเซสชันเดียวกัน (ใช้รหัสตัวเดียวกันทั้งสองหน้า)
export default function AdminGate({ children, subtitle = 'หน้าผู้ดูแล (Admin)' }) {
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem(UNLOCK_KEY) === '1')
  if (unlocked) return children
  return <Gate subtitle={subtitle} onUnlock={() => setUnlocked(true)} />
}

function Gate({ subtitle, onUnlock }) {
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  function submit() {
    if (pw === ADMIN_PW) {
      sessionStorage.setItem(UNLOCK_KEY, '1')
      onUnlock()
    } else {
      setErr('รหัสไม่ถูกต้อง')
    }
  }
  return (
    <div className="app">
      <div className="wrap" style={{ maxWidth: 420 }}>
        <div className="center">
          <div className="brand">QUIZ RUSH</div>
          <div className="brand-sub">{subtitle}</div>
        </div>
        <div className="spacer" />
        <div className="card">
          <label>รหัสผ่านผู้ดูแล</label>
          <input
            className="input"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="••••••"
            autoFocus
          />
          <div className="spacer" />
          <button className="btn btn-primary" onClick={submit}>เข้าสู่ระบบ</button>
          {err && <div className="err">{err}</div>}
          <div className="spacer" />
          <button className="link" onClick={() => nav('/')}>← กลับหน้าแรก</button>
        </div>
      </div>
    </div>
  )
}
