import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchSets,
  fetchBankQuestions,
  createSet,
  deleteSet,
  renameSet,
  addBankQuestion,
  updateBankQuestion,
  importBankQuestions,
  deleteBankQuestion,
} from '../lib/api'
import { CSV_TEMPLATE, parseQuestionsCsv } from '../lib/csv'
import AdminGate from '../components/AdminGate'

export default function Admin() {
  return (
    <AdminGate>
      <AdminPanel />
    </AdminGate>
  )
}

// ---------- แผงจัดการคลังข้อสอบ ----------
function AdminPanel() {
  const nav = useNavigate()
  const [sets, setSets] = useState([])
  const [activeSet, setActiveSet] = useState(null)
  const [questions, setQuestions] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingQ, setEditingQ] = useState(null) // ข้อที่กำลังแก้ไข (null = เพิ่มใหม่)

  async function loadSets() {
    try {
      const s = await fetchSets()
      setSets(s)
      if (s.length && !activeSet) setActiveSet(s[0])
      if (activeSet && !s.find((x) => x.id === activeSet.id)) setActiveSet(s[0] || null)
    } catch (e) {
      setErr(e.message)
    }
  }

  async function loadQuestions(setId) {
    if (!setId) return setQuestions([])
    try {
      setQuestions(await fetchBankQuestions(setId))
    } catch (e) {
      setErr(e.message)
    }
  }

  useEffect(() => {
    loadSets()
  }, [])
  useEffect(() => {
    loadQuestions(activeSet?.id)
    setEditingQ(null) // ออกจากโหมดแก้ไขเมื่อสลับชุด
  }, [activeSet])

  async function onCreateSet() {
    const title = prompt('ชื่อชุดข้อสอบใหม่:')
    if (!title || !title.trim()) return
    setBusy(true)
    setErr('')
    try {
      const s = await createSet(title.trim(), null)
      await loadSets()
      setActiveSet(s)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteSet(s) {
    if (!confirm(`ลบชุด "${s.title}" และข้อสอบทั้งหมดในชุด?`)) return
    setBusy(true)
    try {
      await deleteSet(s.id)
      await loadSets()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function onRenameSet(s) {
    const title = prompt('เปลี่ยนชื่อชุด:', s.title)
    if (!title || !title.trim() || title.trim() === s.title) return
    setBusy(true)
    try {
      await renameSet(s.id, title.trim())
      const updated = await fetchSets()
      setSets(updated)
      setActiveSet(updated.find((x) => x.id === s.id) || null)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="row">
          <div>
            <div className="brand" style={{ fontSize: '1.5rem' }}>คลังข้อสอบ</div>
            <div className="brand-sub">จัดการชุดข้อสอบ · เพิ่มทีละข้อ · นำเข้า CSV</div>
          </div>
          <button className="btn btn-ghost" style={{ width: 'auto', padding: '10px 18px' }} onClick={() => nav('/')}>
            กลับหน้าแรก
          </button>
        </div>

        {err && <div className="err">{err}</div>}
        <div className="spacer" />

        {/* แถบเลือกชุด */}
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <label style={{ margin: 0 }}>ชุดข้อสอบ</label>
            <button className="btn btn-lime" style={{ width: 'auto', padding: '8px 16px' }} disabled={busy} onClick={onCreateSet}>
              + ชุดใหม่
            </button>
          </div>
          {sets.length === 0 ? (
            <div className="muted">ยังไม่มีชุดข้อสอบ — กด “+ ชุดใหม่”</div>
          ) : (
            <div className="set-tabs">
              {sets.map((s) => (
                <div
                  key={s.id}
                  className={'set-tab' + (activeSet?.id === s.id ? ' active' : '')}
                  onClick={() => setActiveSet(s)}
                >
                  <span>{s.title}</span>
                  {activeSet?.id === s.id && (
                    <button
                      className="set-del"
                      title="เปลี่ยนชื่อชุด"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRenameSet(s)
                      }}
                    >
                      ✎
                    </button>
                  )}
                  <button
                    className="set-del"
                    title="ลบชุด"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSet(s)
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeSet && (
          <>
            <div className="spacer" />
            <QuestionForm
              setId={activeSet.id}
              editing={editingQ}
              onDone={() => {
                setEditingQ(null)
                loadQuestions(activeSet.id)
              }}
              onCancel={() => setEditingQ(null)}
              onError={setErr}
            />
            <div className="spacer" />
            <CsvImport
              setId={activeSet.id}
              onImported={() => loadQuestions(activeSet.id)}
              onError={setErr}
            />
            <div className="spacer" />
            <QuestionList
              questions={questions}
              editingId={editingQ?.id}
              onEdit={(q) => {
                setEditingQ(q)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              onDelete={async (id) => {
                try {
                  await deleteBankQuestion(id)
                  if (editingQ?.id === id) setEditingQ(null)
                  loadQuestions(activeSet.id)
                } catch (e) {
                  setErr(e.message)
                }
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}

// ---------- ฟอร์มเพิ่ม/แก้ไขข้อสอบ ----------
function QuestionForm({ setId, editing, onDone, onCancel, onError }) {
  const [qtype, setQtype] = useState('mc')
  const [body, setBody] = useState('')
  const [choices, setChoices] = useState(['', '', '', ''])
  const [correct, setCorrect] = useState(0)
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const isEdit = !!editing

  // sync ฟอร์มเมื่อเข้าโหมดแก้ไข / ออกจากโหมดแก้ไข
  useEffect(() => {
    if (editing) {
      setQtype(editing.qtype)
      setBody(editing.body)
      setImageUrl(editing.image_url || '')
      setCorrect(editing.correct_index)
      if (editing.qtype === 'mc') {
        const cs = editing.choices.map((c) => c.text)
        while (cs.length < 4) cs.push('')
        setChoices(cs.slice(0, 4))
      } else {
        setChoices(['', '', '', ''])
      }
    } else {
      setQtype('mc')
      setBody('')
      setChoices(['', '', '', ''])
      setCorrect(0)
      setImageUrl('')
    }
  }, [editing])

  async function submit() {
    onError('')
    if (!body.trim()) return onError('กรุณากรอกโจทย์')
    let payloadChoices, ci
    if (qtype === 'tf') {
      payloadChoices = [{ text: 'ถูก' }, { text: 'ผิด' }]
      ci = correct > 1 ? 1 : correct
    } else {
      if (choices.some((c) => !c.trim())) return onError('กรุณากรอกตัวเลือกให้ครบ 4 ข้อ')
      payloadChoices = choices.map((t) => ({ text: t.trim() }))
      ci = correct
    }
    setBusy(true)
    try {
      if (isEdit) {
        await updateBankQuestion(editing.id, qtype, body.trim(), payloadChoices, ci, imageUrl)
      } else {
        await addBankQuestion(setId, qtype, body.trim(), payloadChoices, ci, imageUrl)
      }
      onDone()
    } catch (e) {
      onError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={'card' + (isEdit ? ' editing-card' : '')}>
      <div className="row" style={{ marginBottom: 10 }}>
        <label style={{ margin: 0 }}>{isEdit ? '✎ แก้ไขข้อสอบ' : 'เพิ่มข้อสอบทีละข้อ'}</label>
        {isEdit && <button className="link" onClick={onCancel}>ยกเลิก</button>}
      </div>

      <div className="seg">
        <button className={'seg-btn' + (qtype === 'mc' ? ' on' : '')} onClick={() => { setQtype('mc'); setCorrect(0) }}>
          ปรนัย (4 ตัวเลือก)
        </button>
        <button className={'seg-btn' + (qtype === 'tf' ? ' on' : '')} onClick={() => { setQtype('tf'); setCorrect(0) }}>
          ถูก / ผิด
        </button>
      </div>
      <div className="spacer" />

      <input
        className="input"
        placeholder="พิมพ์โจทย์ที่นี่"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="spacer" />

      <input
        className="input"
        placeholder="URL รูปประกอบ (ไม่บังคับ) เช่น https://..."
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />
      {imageUrl.trim() && (
        <img className="q-image-preview" src={imageUrl} alt="" onError={(e) => (e.target.style.display = 'none')} onLoad={(e) => (e.target.style.display = '')} />
      )}
      <div className="spacer" />

      {qtype === 'mc' ? (
        <div className="choice-edit">
          {choices.map((c, i) => (
            <label key={i} className="choice-edit-row">
              <input
                type="radio"
                name="correct"
                checked={correct === i}
                onChange={() => setCorrect(i)}
                title="ตั้งเป็นคำตอบถูก"
              />
              <input
                className="input"
                placeholder={`ตัวเลือก ${i + 1}`}
                value={c}
                onChange={(e) => {
                  const next = [...choices]
                  next[i] = e.target.value
                  setChoices(next)
                }}
              />
            </label>
          ))}
          <div className="muted" style={{ fontSize: '.82rem' }}>● ติ๊กวงกลมหน้าตัวเลือกที่เป็นคำตอบถูก</div>
        </div>
      ) : (
        <div className="seg">
          <button className={'seg-btn' + (correct === 0 ? ' on' : '')} onClick={() => setCorrect(0)}>
            เฉลย: ถูก ✓
          </button>
          <button className={'seg-btn' + (correct === 1 ? ' on' : '')} onClick={() => setCorrect(1)}>
            เฉลย: ผิด ✗
          </button>
        </div>
      )}

      <div className="spacer" />
      <button className="btn btn-primary" disabled={busy} onClick={submit}>
        {busy ? 'กำลังบันทึก…' : isEdit ? '💾 บันทึกการแก้ไข' : '+ เพิ่มเข้าคลัง'}
      </button>
    </div>
  )
}

// ---------- นำเข้า CSV ----------
function CsvImport({ setId, onImported, onError }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null) // { items, errors }
  const [busy, setBusy] = useState(false)
  const fileRef = useRef()

  function doParse(t) {
    const res = parseQuestionsCsv(t)
    setPreview(res)
  }

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const t = String(reader.result || '')
      setText(t)
      doParse(t)
    }
    reader.readAsText(file, 'utf-8')
  }

  function downloadTemplate() {
    const blob = new Blob(['﻿' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quizrush_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function doImport() {
    if (!preview || preview.items.length === 0) return
    setBusy(true)
    onError('')
    try {
      const n = await importBankQuestions(setId, preview.items)
      setText('')
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      onImported()
      alert(`นำเข้าสำเร็จ ${n} ข้อ`)
    } catch (e) {
      onError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <label style={{ margin: 0 }}>นำเข้าจาก CSV</label>
        <button className="link" onClick={downloadTemplate}>ดาวน์โหลดไฟล์ตัวอย่าง</button>
      </div>

      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="file-input" />
      <div className="muted" style={{ fontSize: '.82rem', margin: '8px 0' }}>
        หรือวางข้อความ CSV ด้านล่าง (คอลัมน์: type, question, choice1-4, correct)
      </div>
      <textarea
        className="input"
        style={{ minHeight: 96, fontFamily: 'monospace', fontSize: '.85rem' }}
        placeholder="type,question,choice1,choice2,choice3,choice4,correct"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (e.target.value.trim()) doParse(e.target.value)
          else setPreview(null)
        }}
      />

      {preview && (
        <div className="csv-preview">
          <div className="row" style={{ marginTop: 10 }}>
            <span className="count-pill">พร้อมนำเข้า <b>{preview.items.length}</b> ข้อ</span>
            <button className="btn btn-lime" style={{ width: 'auto', padding: '8px 18px' }}
              disabled={busy || preview.items.length === 0} onClick={doImport}>
              {busy ? 'กำลังนำเข้า…' : `นำเข้า ${preview.items.length} ข้อ`}
            </button>
          </div>
          {preview.errors.length > 0 && (
            <div className="err" style={{ marginTop: 10 }}>
              <b>ข้ามไป {preview.errors.length} บรรทัด:</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {preview.errors.slice(0, 6).map((er, i) => (
                  <li key={i} style={{ fontSize: '.85rem' }}>{er}</li>
                ))}
                {preview.errors.length > 6 && <li style={{ fontSize: '.85rem' }}>…และอีก {preview.errors.length - 6}</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- รายการข้อสอบในชุด ----------
function QuestionList({ questions, onDelete, onEdit, editingId }) {
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <label style={{ margin: 0 }}>ข้อสอบในชุด</label>
        <span className="count-pill"><b>{questions.length}</b> ข้อ</span>
      </div>
      {questions.length === 0 ? (
        <div className="muted">ยังไม่มีข้อสอบในชุดนี้</div>
      ) : (
        <div className="q-list">
          {questions.map((q, i) => (
            <div key={q.id} className={'q-item' + (q.id === editingId ? ' q-item-editing' : '')}>
              {q.image_url && <img className="q-thumb" src={q.image_url} alt="" />}
              <div className="q-item-main">
                <div className="q-item-top">
                  <span className={'q-tag ' + (q.qtype === 'tf' ? 'tag-tf' : 'tag-mc')}>
                    {q.qtype === 'tf' ? 'ถูก/ผิด' : 'ปรนัย'}
                  </span>
                  <span className="q-item-body">{i + 1}. {q.body}</span>
                </div>
                <div className="q-item-choices">
                  {q.choices.map((c, ci) => (
                    <span key={ci} className={'q-choice' + (ci === q.correct_index ? ' correct' : '')}>
                      {ci === q.correct_index ? '✓ ' : ''}{c.text}
                    </span>
                  ))}
                </div>
              </div>
              <div className="q-item-actions">
                <button className="set-del" title="แก้ไขข้อนี้" onClick={() => onEdit(q)}>✎</button>
                <button className="set-del" title="ลบข้อนี้" onClick={() => onDelete(q.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
