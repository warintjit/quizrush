import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import HostLobby from './pages/HostLobby'
import JoinPage from './pages/JoinPage'
import PlayerLobby from './pages/PlayerLobby'
import Playing from './pages/Playing'
import Admin from './pages/Admin'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<HostLobby />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/lobby/:gameId" element={<PlayerLobby />} />
        <Route path="/play/:gameId" element={<Playing />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}
