import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
  loadSession,
  fetchGame,
  fetchPlayer,
  fetchPlayers,
  subscribePlayer,
  subscribePlayers,
  subscribeGame,
  endGame,
  getNextQuestion,
  submitAnswer,
  openBox,
  executeTargetedPower,
} from '../lib/api'
import { sfx } from '../lib/sfx'
// โหลด three.js เฉพาะจอครู (นักเรียนไม่ต้องโหลด bundle 3D)
const RaceField = lazy(() => import('../components/RaceField'))

const CHOICE_LETTERS = ['A', 'B', 'C', 'D']
const CHOICE_CLASS = ['choice-a', 'choice-b', 'choice-c', 'choice-d']

export default function Playing() {
  const { gameId } = useParams()
  const [params] = useSearchParams()
  const role = params.get('role') || 'player'
  const nav = useNavigate()

  if (role === 'host') return <HostField gameId={gameId} />
  return <PlayerEngine gameId={gameId} />
}

// ---------- สนามแข่ง 3D บนจอครู (ค) ----------
function HostField({ gameId }) {
  const nav = useNavigate()
  const [players, setPlayers] = useState([])
  const [maxScore, setMaxScore] = useState(3000)
  const [remainingSec, setRemainingSec] = useState(null)
  const [endsAt, setEndsAt] = useState(null)
  const [finished, setFinished] = useState(false)

  // throttle รีเฟรชรายชื่อ/คะแนน ~0.7s กัน re-render ถี่เกินจาก realtime
  const dirtyRef = useRef(false)
  const endedRef = useRef(false) // กันเรียก end_game ซ้ำ

  // เรียกจบเกม (ครูเป็นจุดเดียวที่สั่งจบ) — อัปเดตสถานะใน DB แล้วโชว์ผล
  async function finishGame() {
    if (endedRef.current) return
    endedRef.current = true
    try {
      await endGame(gameId)
      const p = await fetchPlayers(gameId)
      setPlayers(p)
    } catch (e) {
      /* ถ้าพลาดก็ยังโชว์ผลจากข้อมูลล่าสุด */
    }
    setFinished(true)
  }

  useEffect(() => {
    let alive = true
    fetchGame(gameId).then((g) => {
      if (!alive) return
      setMaxScore(g.settings?.track_max_score || 3000)
      setEndsAt(g.ends_at)
      if (g.status === 'finished') {
        endedRef.current = true
        setFinished(true)
      }
    })
    fetchPlayers(gameId).then((p) => alive && setPlayers(p))

    const unsub = subscribePlayers(gameId, () => {
      dirtyRef.current = true
    })
    const id = setInterval(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      fetchPlayers(gameId).then((p) => alive && setPlayers(p)).catch(() => {})
    }, 700)

    return () => {
      alive = false
      unsub()
      clearInterval(id)
    }
  }, [gameId])

  useEffect(() => {
    if (!endsAt) return
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000))
      setRemainingSec(left)
      if (left <= 0) finishGame() // หมดเวลา → จบเกมอัตโนมัติ
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [endsAt])

  const leader = players.length
    ? players.reduce((a, b) => (b.score > a.score ? b : a))
    : null

  if (finished) return <HostResults players={players} onHome={() => nav('/')} />

  return (
    <div className="host-stage">
      <div className="host-topbar">
        <div className="brand" style={{ fontSize: '1.4rem' }}>QUIZ RUSH</div>
        <div className="host-stats">
          {leader && (
            <span className="score-pill">👑 {leader.nickname} · <b>{leader.score}</b></span>
          )}
          <span className="score-pill">👥 <b>{players.length}</b></span>
          {remainingSec !== null && (
            <span className="time-pill">⏱ {fmtTime(remainingSec)}</span>
          )}
          <button
            className="btn btn-coral host-exit"
            onClick={() => {
              if (confirm('จบเกมและประกาศผลเลยหรือไม่?')) finishGame()
            }}
          >
            จบเกม
          </button>
        </div>
      </div>
      <div className="host-body">
        <div className="host-canvas">
          {players.length === 0 ? (
            <div className="center" style={{ height: '100%', justifyContent: 'center' }}>
              <div className="muted waiting">กำลังรอผู้เล่น…</div>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="center" style={{ height: '100%', justifyContent: 'center' }}>
                  <div className="muted waiting">กำลังโหลดสนาม 3D…</div>
                </div>
              }
            >
              <RaceField players={players} maxScore={maxScore} />
            </Suspense>
          )}
        </div>
        <Leaderboard players={players} />
      </div>
    </div>
  )
}

// ---------- Leaderboard สด ข้างขวาจอครู ----------
const MEDALS = ['🥇', '🥈', '🥉']

function Leaderboard({ players }) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)),
    [players]
  )

  // จำอันดับรอบก่อน เพื่อโชว์ลูกศรแซง/ตกอันดับ
  const prevRanks = useRef(new Map())
  const changes = useMemo(() => {
    const m = new Map()
    sorted.forEach((p, i) => {
      const prev = prevRanks.current.get(p.id)
      m.set(p.id, prev === undefined ? 0 : prev - i) // >0 = แซงขึ้น, <0 = ตกลง
    })
    return m
  }, [sorted])
  useEffect(() => {
    const m = new Map()
    sorted.forEach((p, i) => m.set(p.id, i))
    prevRanks.current = m
  }, [sorted])

  return (
    <aside className="host-leaderboard">
      <div className="lb-title">🏆 อันดับสด · Top 10</div>
      <div className="lb-list">
        {sorted.slice(0, 10).map((p, i) => {
          const ch = changes.get(p.id) || 0
          return (
            <div key={p.id} className={'lb-row' + (i < 3 ? ` lb-top lb-${i + 1}` : '')}>
              <span className="lb-rank">{i < 3 ? MEDALS[i] : i + 1}</span>
              <span className="lb-dot" style={{ background: p.avatar_color }} />
              <span className="lb-name">{p.nickname}</span>
              {ch > 0 && <span className="lb-up">▲</span>}
              {ch < 0 && <span className="lb-down">▼</span>}
              <span className="lb-score">{p.score}</span>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

// ---------- หน้าประกาศผลบนจอครู (โพเดียม + อันดับ) ----------
function HostResults({ players, onHome }) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)),
    [players]
  )
  const podium = sorted.slice(0, 3)
  const rest = sorted.slice(3, 10)
  // ลำดับวางแท่น: ที่2(ซ้าย) ที่1(กลาง) ที่3(ขวา)
  const order = [podium[1], podium[0], podium[2]].filter(Boolean)
  const placeOf = (p) => podium.indexOf(p) + 1

  return (
    <div className="app">
      <div className="wrap center" style={{ maxWidth: 720 }}>
        <div className="brand">🏁 จบการแข่งขัน!</div>
        <div className="brand-sub">สรุปผลคะแนน</div>
        <div className="spacer" />

        {podium.length > 0 && (
          <div className="podium">
            {order.map((p) => {
              const place = placeOf(p)
              return (
                <div key={p.id} className={`podium-col podium-${place}`}>
                  <div className="podium-medal">{MEDALS[place - 1]}</div>
                  <span className="lb-dot" style={{ background: p.avatar_color, width: 22, height: 22 }} />
                  <div className="podium-name">{p.nickname}</div>
                  <div className="podium-score">{p.score}</div>
                  <div className="podium-base">{place}</div>
                </div>
              )
            })}
          </div>
        )}

        {rest.length > 0 && (
          <div className="card" style={{ width: '100%', maxWidth: 460 }}>
            {rest.map((p, i) => (
              <div key={p.id} className="lb-row">
                <span className="lb-rank">{i + 4}</span>
                <span className="lb-dot" style={{ background: p.avatar_color }} />
                <span className="lb-name">{p.nickname}</span>
                <span className="lb-score">{p.score}</span>
              </div>
            ))}
          </div>
        )}

        <div className="spacer" />
        <button className="btn btn-gold" style={{ maxWidth: 320 }} onClick={onHome}>
          กลับหน้าแรก
        </button>
      </div>
    </div>
  )
}

// ---------- เครื่องยนต์ควิซบนมือถือ (ข) ----------
function PlayerEngine({ gameId }) {
  const nav = useNavigate()
  const session = loadSession()

  const [game, setGame] = useState(null)
  const [score, setScore] = useState(0)
  const [remainingSec, setRemainingSec] = useState(null)
  const [finished, setFinished] = useState(false)
  const [notices, setNotices] = useState([]) // toast แจ้งเตือนโดนพลังโจมตี

  // จำสถานะก่อนหน้า เพื่อ detect การโดนโจมตีจาก realtime
  const prevScoreRef = useRef(null)
  const prevSabotagedRef = useRef(false)
  const prevShieldRef = useRef(false)
  const prevReflectRef = useRef(false)

  function pushNotice(text, kind) {
    const id = Math.random().toString(36).slice(2)
    setNotices((n) => [...n, { id, text, kind }])
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4000)
  }

  // phase: loading | question | feedback | box | attack | error
  const [phase, setPhase] = useState('loading')
  const [question, setQuestion] = useState(null)
  const [feedback, setFeedback] = useState(null) // { is_correct, points, box_offered, source_answer_id }
  const [box, setBox] = useState(null) // ผลจาก open_box
  const [attackResult, setAttackResult] = useState(null)
  const [err, setErr] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [opening, setOpening] = useState(false) // กันกดกล่องซ้ำ

  const startedAtRef = useRef(0)

  // กันเข้าหน้านี้ตรง ๆ โดยไม่มี session
  useEffect(() => {
    if (!session || session.gameId !== gameId) {
      nav('/join')
    }
  }, [])

  // โหลดข้อมูลห้อง + นับเวลาถอยหลังจากเวลาจบเกม + ฟังสถานะเกม (เผื่อครูจบก่อนเวลา)
  useEffect(() => {
    let alive = true
    fetchGame(gameId).then((g) => {
      if (!alive) return
      setGame(g)
      if (g.status === 'finished') setFinished(true)
    })
    const unsub = subscribeGame(gameId, (payload) => {
      if (alive && payload.new?.status === 'finished') setFinished(true)
    })
    return () => {
      alive = false
      unsub()
    }
  }, [gameId])

  useEffect(() => {
    if (!game?.ends_at) return
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(game.ends_at).getTime() - Date.now()) / 1000))
      setRemainingSec(left)
      if (left <= 0) setFinished(true)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [game])

  // คะแนนของตัวเอง: โหลดครั้งแรก + subscribe realtime + แจ้งเตือนโดนพลังโจมตี
  useEffect(() => {
    if (!session) return
    let alive = true
    fetchPlayer(session.playerId).then((p) => {
      if (!alive) return
      setScore(p.score)
      prevScoreRef.current = p.score
      prevSabotagedRef.current = p.sabotaged
      prevShieldRef.current = p.shield
      prevReflectRef.current = p.reflect
    })
    const unsub = subscribePlayer(session.playerId, (payload) => {
      if (!alive) return
      const np = payload.new
      // คะแนนลดลง = โดนขโมย (ไม่มี action อื่นที่ลดคะแนนตัวเอง)
      if (prevScoreRef.current !== null && np.score < prevScoreRef.current) {
        pushNotice(`โดนขโมย ${prevScoreRef.current - np.score} แต้ม!`, 'steal')
        sfx.hit()
      }
      // sabotaged false -> true = โดนกับดัก
      if (np.sabotaged && !prevSabotagedRef.current) {
        pushNotice('โดนวางกับดัก! ข้อถัดไปได้ครึ่งแต้ม', 'sabotage')
        sfx.hit()
      }
      // shield true -> false = โล่กันการขโมยให้ 1 ครั้ง
      if (!np.shield && prevShieldRef.current) {
        pushNotice('โล่ของคุณกันการขโมยไว้ได้!', 'shield')
      }
      // reflect true -> false = โล่สะท้อนเด้งการโจมตีกลับให้ 1 ครั้ง
      if (!np.reflect && prevReflectRef.current) {
        pushNotice('โล่สะท้อนเด้งการโจมตีกลับใส่คนโจมตี!', 'reflect')
        sfx.box()
      }
      prevScoreRef.current = np.score
      prevSabotagedRef.current = np.sabotaged
      prevShieldRef.current = np.shield
      prevReflectRef.current = np.reflect
      setScore(np.score)
    })
    return () => {
      alive = false
      unsub()
    }
  }, [])

  // โหลดคำถามแรก
  useEffect(() => {
    if (session && !finished) loadQuestion()
  }, [])

  async function loadQuestion() {
    setErr('')
    setPhase('loading')
    try {
      const q = await getNextQuestion(session.playerId)
      if (!q) {
        setErr('ยังไม่มีคำถามในห้องนี้')
        setPhase('error')
        return
      }
      setQuestion(q)
      setFeedback(null)
      setBox(null)
      setAttackResult(null)
      startedAtRef.current = performance.now()
      setPhase('question')
    } catch (e) {
      setErr(e.message || 'โหลดคำถามไม่สำเร็จ')
      setPhase('error')
    }
  }

  async function onSelect(idx) {
    if (selecting) return
    setSelecting(true)
    try {
      const timeMs = Math.round(performance.now() - startedAtRef.current)
      const res = await submitAnswer(session.playerId, question.question_id, idx, timeMs)
      sfx[res.is_correct ? 'correct' : 'wrong']()
      setFeedback({ ...res, selected: idx })
      setPhase('feedback')
    } catch (e) {
      setErr(e.message || 'ส่งคำตอบไม่สำเร็จ')
      setPhase('error')
    } finally {
      setSelecting(false)
    }
  }

  async function onContinueAfterFeedback() {
    if (feedback?.box_offered) {
      setPhase('box')
      return
    }
    loadQuestion()
  }

  // เลือกกล่องไหนก็ได้ — พลังข้างในสุ่มฝั่งเซิร์ฟเวอร์ (กันโกง เดาไม่ได้)
  async function onOpenBox(_boxIndex) {
    if (opening) return
    setOpening(true)
    setErr('')
    try {
      const result = await openBox(session.playerId, feedback.source_answer_id)
      sfx.box()
      setBox(result)
      if (result.kind === 'attack' && result.target) {
        setPhase('attack')
      } else {
        setPhase('box-result')
      }
    } catch (e) {
      setErr(e.message || 'เปิดกล่องไม่สำเร็จ')
      setPhase('error')
    } finally {
      setOpening(false)
    }
  }

  async function onConfirmAttack() {
    setErr('')
    try {
      const result = await executeTargetedPower(session.playerId)
      setAttackResult(result)
      setPhase('box-result')
    } catch (e) {
      setErr(e.message || 'ใช้พลังไม่สำเร็จ')
      setPhase('error')
    }
  }

  if (!session) return null

  if (finished) {
    return (
      <div className="app">
        <div className="wrap center">
          <div className="brand">🏁 หมดเวลา!</div>
          <div className="spacer" />
          <div className="card" style={{ maxWidth: 420 }}>
            <p className="muted" style={{ marginTop: 0 }}>คะแนนสุดท้ายของคุณ</p>
            <div className="final-score">{score}</div>
            <div className="spacer" />
            <button className="btn btn-primary" onClick={() => nav('/join')}>
              🎮 เข้าร่วมเกมใหม่
            </button>
            <div className="spacer" />
            <button className="btn btn-ghost" onClick={() => nav('/')}>
              กลับหน้าแรก
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* toast แจ้งเตือนโดนพลังโจมตี */}
      <div className="toast-wrap">
        {notices.map((nt) => (
          <div key={nt.id} className={`toast toast-${nt.kind}`}>
            {nt.kind === 'steal' && '🧲 '}
            {nt.kind === 'sabotage' && '🍌 '}
            {nt.kind === 'shield' && '🛡️ '}
            {nt.kind === 'reflect' && '🪞 '}
            {nt.text}
          </div>
        ))}
      </div>

      <div className="wrap" style={{ maxWidth: 480 }}>
        <div className="score-hud">
          <span className="score-pill">
            🏆 <b>{score}</b> แต้ม
          </span>
          {remainingSec !== null && (
            <span className="time-pill">⏱ {fmtTime(remainingSec)}</span>
          )}
        </div>
        <div className="spacer" />

        {phase === 'loading' && (
          <div className="card center">
            <div className="muted waiting">กำลังโหลดคำถาม…</div>
          </div>
        )}

        {phase === 'error' && (
          <div className="card center">
            <div className="err" style={{ marginTop: 0 }}>{err}</div>
            <div className="spacer" />
            <button className="btn btn-primary" onClick={loadQuestion}>
              ลองอีกครั้ง
            </button>
          </div>
        )}

        {phase === 'question' && question && (
          <div className="card">
            {question.image_url && (
              <img className="q-image" src={question.image_url} alt="" />
            )}
            <div className="q-body">{question.body}</div>
            <div className="spacer" />
            {question.qtype === 'tf' ? (
              <div className="tf-grid">
                <button className="tf-btn tf-true" disabled={selecting} onClick={() => onSelect(0)}>
                  <span className="tf-mark">✓</span> ถูก
                </button>
                <button className="tf-btn tf-false" disabled={selecting} onClick={() => onSelect(1)}>
                  <span className="tf-mark">✗</span> ผิด
                </button>
              </div>
            ) : (
              <div className="choice-grid">
                {question.choices.map((c, i) => (
                  <button
                    key={i}
                    className={`choice-btn ${CHOICE_CLASS[i]}`}
                    disabled={selecting}
                    onClick={() => onSelect(i)}
                  >
                    <span className="choice-letter">{CHOICE_LETTERS[i]}</span>
                    <span className="choice-text">{c.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'feedback' && feedback && (
          <div className={`card center feedback-card ${feedback.is_correct ? 'feedback-correct' : 'feedback-wrong'}`}>
            <div className="feedback-icon">{feedback.is_correct ? '✅' : '❌'}</div>
            <div className="feedback-title">
              {feedback.is_correct ? 'ตอบถูก!' : 'ตอบผิด'}
            </div>
            {feedback.is_correct ? (
              <div className="feedback-points">+{feedback.points} แต้ม</div>
            ) : (
              feedback.points < 0 && (
                <div className="feedback-points feedback-penalty">{feedback.points} แต้ม</div>
              )
            )}
            <div className="spacer" />
            <button className="btn btn-lime" onClick={onContinueAfterFeedback}>
              {feedback.box_offered ? '🎁 เปิดกล่องพลัง' : 'ข้อต่อไป →'}
            </button>
          </div>
        )}

        {phase === 'box' && (
          <div className="card center">
            <div className="feedback-title">🎁 เลือกกล่องพลัง</div>
            <p className="muted">ตอบถูก! เลือกเปิด 1 ใน 3 กล่อง — ข้างในสุ่มพลัง</p>
            <div className="spacer" />
            <div className="box-grid">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  className="box-choice"
                  disabled={opening}
                  onClick={() => onOpenBox(i)}
                >
                  <span className="box-choice-emoji">🎁</span>
                  <span className="box-choice-label">กล่อง {i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'attack' && box && (
          <div className="card center powerup-card">
            <div className="box-emoji">{box.icon}</div>
            <div className="feedback-title">{box.name_th}</div>
            <p className="muted">{box.message}</p>
            <div className="spacer" />
            <div className="target-badge">
              <span className="dot" style={{ background: box.target.color }} />
              เป้าหมาย: <b>{box.target.nickname}</b>
            </div>
            <p className="muted" style={{ fontSize: '.8rem' }}>
              (สุ่มเป้าหมายให้แล้ว เลือกเองไม่ได้)
            </p>
            <div className="spacer" />
            <button className="btn btn-coral" onClick={onConfirmAttack}>
              ยืนยันใช้พลัง
            </button>
          </div>
        )}

        {phase === 'box-result' && box && (
          <div className="card center powerup-card">
            <div className="box-emoji">{box.icon}</div>
            <div className="feedback-title">{box.name_th}</div>
            <p className="muted">{attackResult ? attackResult.message : box.message}</p>
            {(attackResult?.gain ?? box.gain) > 0 && (
              <div className="feedback-points">+{attackResult?.gain ?? box.gain} แต้ม</div>
            )}
            <div className="spacer" />
            <button className="btn btn-lime" onClick={loadQuestion}>
              ข้อต่อไป →
            </button>
          </div>
        )}

        {err && phase !== 'error' && <div className="err">{err}</div>}
      </div>
    </div>
  )
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
