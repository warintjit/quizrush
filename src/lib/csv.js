// ตัวช่วยแปลง CSV <-> ข้อสอบ (ไม่พึ่ง lib ภายนอก)
//
// รูปแบบ CSV (มี header บรรทัดแรก):
//   type,question,choice1,choice2,choice3,choice4,correct
// - type: mc (ปรนัย) หรือ tf (ถูก/ผิด)
// - question: โจทย์
// - choice1..4: ตัวเลือก (ปรนัยใส่ครบ 4 / ถูกผิดเว้นว่างได้ ระบบเติม "ถูก","ผิด" ให้)
// - correct: เลขคำตอบถูกแบบ 1-based
//     ปรนัย = 1-4, ถูกผิด = 1 (ถูก) หรือ 2 (ผิด)
// - image: (ไม่บังคับ) URL รูปประกอบโจทย์

export const CSV_HEADER = 'type,question,choice1,choice2,choice3,choice4,correct,image'

export const CSV_TEMPLATE = [
  CSV_HEADER,
  'mc,เมืองหลวงของไทยคือ?,กรุงเทพมหานคร,เชียงใหม่,ภูเก็ต,ขอนแก่น,1,',
  'mc,2 x 3 เท่ากับเท่าไร?,5,6,7,8,2,',
  'tf,โลกหมุนรอบดวงอาทิตย์,,,,,1,',
  'tf,ปลาหายใจด้วยปอด,,,,,2,',
].join('\n')

// แยกหนึ่งบรรทัด CSV เป็น array ของฟิลด์ (รองรับ "..." คร่อมที่มี , ข้างใน)
function parseLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

// แปลงข้อความ CSV ทั้งก้อน -> { items: [...], errors: [...] }
// items แต่ละตัว: { qtype, body, choices, correct_index } พร้อม insert
export function parseQuestionsCsv(text) {
  const items = []
  const errors = []
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const lines = rawLines.filter((l) => l.trim() !== '')
  if (lines.length === 0) return { items, errors: ['ไฟล์ว่างเปล่า'] }

  // ข้าม header ถ้าบรรทัดแรกดูเป็นหัวตาราง
  let start = 0
  const first = parseLine(lines[0]).map((s) => s.toLowerCase())
  if (first[0] === 'type' || first[1] === 'question') start = 1

  for (let i = start; i < lines.length; i++) {
    const rowNo = i + 1
    const f = parseLine(lines[i])
    const type = (f[0] || '').toLowerCase()
    const body = f[1] || ''
    const correctRaw = f[6]
    const imageUrl = (f[7] || '').trim()

    if (!body) {
      errors.push(`บรรทัด ${rowNo}: ไม่มีโจทย์`)
      continue
    }
    if (type !== 'mc' && type !== 'tf') {
      errors.push(`บรรทัด ${rowNo}: ชนิดข้อต้องเป็น mc หรือ tf`)
      continue
    }

    const correct = parseInt(correctRaw, 10)

    if (type === 'tf') {
      if (correct !== 1 && correct !== 2) {
        errors.push(`บรรทัด ${rowNo}: ถูก/ผิด ต้องระบุ correct = 1 (ถูก) หรือ 2 (ผิด)`)
        continue
      }
      items.push({
        qtype: 'tf',
        body,
        choices: [{ text: 'ถูก' }, { text: 'ผิด' }],
        correct_index: correct - 1,
        image_url: imageUrl,
      })
    } else {
      const choices = [f[2], f[3], f[4], f[5]].map((t) => (t || '').trim())
      if (choices.some((c) => c === '')) {
        errors.push(`บรรทัด ${rowNo}: ปรนัยต้องมีครบ 4 ตัวเลือก`)
        continue
      }
      if (!(correct >= 1 && correct <= 4)) {
        errors.push(`บรรทัด ${rowNo}: ปรนัยต้องระบุ correct = 1 ถึง 4`)
        continue
      }
      items.push({
        qtype: 'mc',
        body,
        choices: choices.map((text) => ({ text })),
        correct_index: correct - 1,
        image_url: imageUrl,
      })
    }
  }

  return { items, errors }
}
