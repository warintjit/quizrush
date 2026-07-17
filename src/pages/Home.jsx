import { useNavigate } from 'react-router-dom'

export default function Home() {
  const nav = useNavigate()
  return (
    <div className="app">
      <div className="wrap center">
        <div className="brand">QUIZ RUSH</div>
        <div className="brand-sub">สนามแข่งตอบคำถาม — ตอบถูกได้เปิดกล่องพลัง</div>
        <div className="spacer" />
        <div className="spacer" />
        <div className="card" style={{ width: '100%', maxWidth: 420 }}>
          <button className="btn btn-gold" onClick={() => nav('/host')}>
            🏁 สร้างห้องแข่ง (สำหรับครู)
          </button>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={() => nav('/join')}>
            🎮 เข้าร่วม (นักเรียน)
          </button>
          <div className="spacer" />
          <button className="btn btn-violet" onClick={() => nav('/practice')}>
            🧠 ฝึกทำข้อสอบคนเดียว
          </button>
        </div>
        <div className="spacer" />
        <button className="link" onClick={() => nav('/admin')}>⚙ คลังข้อสอบ (ผู้ดูแล)</button>
      </div>
    </div>
  )
}
