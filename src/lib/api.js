import { supabase } from './supabase'

// ---------- RPCs ----------
export async function createGame(durationMin, trackMax) {
  const { data, error } = await supabase.rpc('create_game', {
    p_duration_min: durationMin,
    p_track_max: trackMax,
  })
  if (error) throw error
  return data
}

export async function startGame(gameId) {
  const { data, error } = await supabase.rpc('start_game', { p_game_id: gameId })
  if (error) throw error
  return data
}

export async function endGame(gameId) {
  const { data, error } = await supabase.rpc('end_game', { p_game_id: gameId })
  if (error) throw error
  return data
}

export async function joinGame(roomCode, nickname, color) {
  const { data, error } = await supabase.rpc('join_game', {
    p_room_code: roomCode,
    p_nickname: nickname,
    p_color: color,
  })
  if (error) throw error
  return data
}

export async function getNextQuestion(playerId) {
  const { data, error } = await supabase.rpc('get_next_question', { p_player_id: playerId })
  if (error) throw error
  return data && data[0] ? data[0] : null
}

export async function submitAnswer(playerId, questionId, selectedIndex, timeMs) {
  const { data, error } = await supabase.rpc('submit_answer', {
    p_player_id: playerId,
    p_question_id: questionId,
    p_selected: selectedIndex,
    p_time_ms: timeMs,
  })
  if (error) throw error
  return data
}

export async function openBox(playerId, sourceAnswerId) {
  const { data, error } = await supabase.rpc('open_box', {
    p_player_id: playerId,
    p_source_answer_id: sourceAnswerId,
  })
  if (error) throw error
  return data
}

export async function executeTargetedPower(playerId) {
  const { data, error } = await supabase.rpc('execute_targeted_power', { p_player_id: playerId })
  if (error) throw error
  return data
}

// ---------- question bank (admin) ----------
export async function fetchSets() {
  const { data, error } = await supabase
    .from('question_sets')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function fetchBankQuestions(setId) {
  const { data, error } = await supabase
    .from('bank_questions')
    .select('*')
    .eq('set_id', setId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createSet(title, description) {
  const { data, error } = await supabase.rpc('create_question_set', {
    p_title: title,
    p_description: description,
  })
  if (error) throw error
  return data
}

export async function deleteSet(setId) {
  const { error } = await supabase.rpc('delete_question_set', { p_set_id: setId })
  if (error) throw error
}

export async function addBankQuestion(setId, qtype, body, choices, correctIndex, imageUrl) {
  const { data, error } = await supabase.rpc('add_bank_question', {
    p_set_id: setId,
    p_qtype: qtype,
    p_body: body,
    p_choices: choices,
    p_correct_index: correctIndex,
    p_image_url: imageUrl || null,
  })
  if (error) throw error
  return data
}

export async function updateBankQuestion(id, qtype, body, choices, correctIndex, imageUrl) {
  const { data, error } = await supabase.rpc('update_bank_question', {
    p_id: id,
    p_qtype: qtype,
    p_body: body,
    p_choices: choices,
    p_correct_index: correctIndex,
    p_image_url: imageUrl || null,
  })
  if (error) throw error
  return data
}

export async function renameSet(setId, title) {
  const { data, error } = await supabase.rpc('rename_question_set', {
    p_set_id: setId,
    p_title: title,
  })
  if (error) throw error
  return data
}

export async function importBankQuestions(setId, items) {
  const { data, error } = await supabase.rpc('import_bank_questions', {
    p_set_id: setId,
    p_items: items,
  })
  if (error) throw error
  return data // จำนวนข้อที่นำเข้า
}

export async function deleteBankQuestion(id) {
  const { error } = await supabase.rpc('delete_bank_question', { p_id: id })
  if (error) throw error
}

export async function copySetToGame(setId, gameId) {
  const { data, error } = await supabase.rpc('copy_set_to_game', {
    p_set_id: setId,
    p_game_id: gameId,
  })
  if (error) throw error
  return data // จำนวนข้อที่คัดลอกเข้าห้อง
}

// ---------- reads ----------
export async function fetchGame(gameId) {
  const { data, error } = await supabase.from('games').select('*').eq('id', gameId).single()
  if (error) throw error
  return data
}

export async function fetchPlayers(gameId) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', gameId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return data
}

export async function fetchPlayer(playerId) {
  const { data, error } = await supabase.from('players').select('*').eq('id', playerId).single()
  if (error) throw error
  return data
}

// ---------- realtime ----------
export function subscribePlayers(gameId, onChange) {
  const ch = supabase
    .channel(`players-${gameId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
      onChange
    )
    .subscribe()
  return () => supabase.removeChannel(ch)
}

export function subscribePlayer(playerId, onChange) {
  const ch = supabase
    .channel(`player-${playerId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${playerId}` },
      onChange
    )
    .subscribe()
  return () => supabase.removeChannel(ch)
}

export function subscribeGame(gameId, onChange) {
  const ch = supabase
    .channel(`game-${gameId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      onChange
    )
    .subscribe()
  return () => supabase.removeChannel(ch)
}

// ---------- session (จำตัวผู้เล่นข้ามหน้า/รีเฟรช) ----------
const KEY = 'quizrush_player'
export function saveSession(s) {
  sessionStorage.setItem(KEY, JSON.stringify(s))
}
export function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY))
  } catch {
    return null
  }
}
export function clearSession() {
  sessionStorage.removeItem(KEY)
}
