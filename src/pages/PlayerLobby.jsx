import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchGame, fetchPlayers, subscribePlayers, subscribeGame, loadSession } from '../lib/api'
import { PlayerChip } from '../components/Pieces'

export default function PlayerLobby() {
  const nav = useNavigate()
  const { gameId } = useParams()
  const session = loadSession()
  const [players, setPlayers] = useState([])

  // ไม่มี session = ยังไม่ได้เข้าห้อง -> กลับไปหน้า join
  useEffect(() => {
    if (!session || session.gameId !== gameId) {
      nav(`/join`)
    }
  }, [])

  useEffect(() => {
    if (!gameId) return
    let alive = true
    const reload = () =>
      fetchPlayers(gameId).then((p) => alive && setPlayers(p)).catch(() => {})
    reload()

    // ถ้าครูเริ่มเกมไปแล้วก่อนหน้านี้ ให้เด้งทันที
    fetchGame(gameId)
      .then((g) => {
        if (alive && g.status === 'running') nav(`/play/${gameId}?role=player`)
      })
      .catch(() => {})

    const unsubP = subscribePlayers(gameId, reload)
    const unsubG = subscribeGame(gameId, (payload) => {
      if (payload.new?.status === 'running') nav(`/play/${gameId}?role=player`)
    })
    return () => {
      alive = false
      unsubP()
      unsubG()
    }
  }, [gameId])

  return (
    <div className="app">
      <div className="wrap">
        <div className="center">
          {session && (
            <div className="player-chip" style={{ marginBottom: 14 }}>
              <span className="dot" style={{ background: session.color }} />
              <span className="nm">{session.nickname}</span>
            </div>
          )}
          <div className="brand-sub waiting">⏳ รอครูเริ่มเกม…</div>
          <div className="spacer" />
          <span className="count-pill">
            ในห้องตอนนี้ <b>{players.length}</b> คน
          </span>
        </div>
        <div className="spacer" />
        <div className="card">
          <div className="player-grid">
            {players.map((p) => (
              <PlayerChip key={p.id} player={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
