// เสียงประกอบ + สั่น (haptic) สำหรับจอนักเรียน — สังเคราะห์ด้วย Web Audio
// ไม่ต้องโหลดไฟล์เสียง · เล่นแบบ best-effort (เงียบถ้าเบราว์เซอร์ไม่รองรับ)

let ctx
function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0) {
  const c = ac()
  if (!c) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  const t = c.currentTime + delay
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.03)
}

function vibe(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern)
  } catch {
    /* ไม่รองรับก็ข้าม */
  }
}

export const sfx = {
  correct() {
    tone(660, 0.13, 'triangle', 0.18)
    tone(990, 0.18, 'triangle', 0.18, 0.1)
    vibe(40)
  },
  wrong() {
    tone(196, 0.28, 'sawtooth', 0.12)
    vibe([25, 40, 25])
  },
  box() {
    tone(523, 0.1, 'square', 0.1)
    tone(784, 0.1, 'square', 0.1, 0.08)
    tone(1047, 0.16, 'square', 0.1, 0.16)
    vibe(30)
  },
  hit() {
    tone(140, 0.32, 'sawtooth', 0.16)
    vibe([60, 30, 60])
  },
}
