import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Text, Billboard, Sparkles } from '@react-three/drei'
import * as THREE from 'three'

// ---------- ค่าคงที่สนามวงรอบ (วงรี) ----------
const RX = 30                    // รัศมีกลางถนน แกน X (สนามใหญ่ขึ้น)
const RZ = 20                    // รัศมีกลางถนน แกน Z
const ROAD_W = 8                 // ความกว้างถนน
const LAPS_AT_MAX = 2            // เมื่อถึง track_max_score จะวิ่งครบ ~กี่รอบ (มากขึ้น = ช้าลง)
const LERP_SPEED = 1.7           // ความเร็ว interpolate ตำแหน่ง (ต่ำลง = ไหลนุ่มช้าลง)
const FONT = '/fonts/Sarabun-Bold.ttf' // ฟอนต์ไทย (drei Text ไม่รองรับไทยโดยปริยาย)

// สีสันงานรื่นเริง ใช้กับธงราว/ลูกโป่ง/คอนเฟตตี
const FEST_COLORS = ['#ff6b5e', '#ffc94d', '#9ae65c', '#22d3ee', '#a78bfa', '#f472b6']

// คะแนน -> มุมรอบวง (ต่อเนื่อง ไม่ wrap; cos/sin จัดการวนเอง)
// perLap = คะแนนต่อ 1 รอบ (อิง track_max_score เพื่อให้สมดุลกับเวลาเกม)
function scoreToTheta(score, perLap) {
  return (score / perLap) * Math.PI * 2
}

// =====================================================================
// อวตารนักวิ่งบนแทร็กวงรอบ — หันหน้าตามทิศโค้ง + แขนขาแกว่ง + เอียง + ฝุ่น
// =====================================================================
function Runner({ player, rxi, rzi, scorePerLap, rank }) {
  const root = useRef()       // ตำแหน่งบนวง (x,z)
  const heading = useRef()    // หันหน้าตามทิศวิ่ง (rotation.y)
  const lean = useRef()       // เอียงไปข้างหน้าตอนพุ่ง (rotation.z)
  const bodyBob = useRef()    // เด้งขึ้นลง
  const armL = useRef()
  const armR = useRef()
  const legL = useRef()
  const legR = useRef()
  const crown = useRef()
  const dust = useRef()

  const prog = useRef(null)   // มุมปัจจุบัน (ต่อเนื่อง)
  const phase = useRef(Math.random() * Math.PI * 2)
  const speedSmooth = useRef(0)
  const avgR = (rxi + rzi) / 2
  const isLeader = rank === 0

  const darker = useMemo(() => {
    const c = new THREE.Color(player.avatar_color)
    c.multiplyScalar(0.6)
    return `#${c.getHexString()}`
  }, [player.avatar_color])

  useFrame((_, dRaw) => {
    const delta = Math.min(dRaw, 0.05)
    if (!root.current) return

    const targetTh = scoreToTheta(player.score, scorePerLap)
    if (prog.current === null) prog.current = targetTh // เริ่มที่ตำแหน่งจริง ไม่พุ่งรอบแรก
    const prevTh = prog.current
    const th = THREE.MathUtils.lerp(prevTh, targetTh, Math.min(1, delta * LERP_SPEED))
    prog.current = th

    // วางตำแหน่งบนวงรี
    root.current.position.x = rxi * Math.cos(th)
    root.current.position.z = rzi * Math.sin(th)

    // หันหน้าตามทิศวิ่ง (tangent ของวงรี)
    if (heading.current) {
      heading.current.rotation.y = Math.atan2(-RZ * Math.cos(th), -RX * Math.sin(th))
    }

    // ความเร็วจริงโดยประมาณ (world units/วินาที)
    const worldSpd = delta > 0 ? (Math.abs(th - prevTh) * avgR) / delta : 0
    speedSmooth.current = THREE.MathUtils.lerp(speedSmooth.current, worldSpd, 0.15)
    const moving = Math.min(1, speedSmooth.current / 5)

    // เด้ง
    phase.current += delta * (6 + moving * 8)
    if (bodyBob.current) bodyBob.current.position.y = Math.abs(Math.sin(phase.current)) * (0.1 + moving * 0.14)

    // เอียงไปข้างหน้า
    if (lean.current) lean.current.rotation.z = THREE.MathUtils.lerp(lean.current.rotation.z, -moving * 0.28, 0.1)

    // แขนขาแกว่ง
    const swing = Math.sin(phase.current) * (0.5 + moving * 0.5)
    if (armL.current) armL.current.rotation.z = swing
    if (armR.current) armR.current.rotation.z = -swing
    if (legL.current) legL.current.rotation.z = -swing * 0.8
    if (legR.current) legR.current.rotation.z = swing * 0.8

    // มงกุฎหมุน
    if (crown.current) crown.current.rotation.y += delta * 1.5

    // ฝุ่นด้านหลัง (local -x = ด้านหลังเพราะ +x คือทิศวิ่ง)
    if (dust.current) {
      dust.current.children.forEach((puff, i) => {
        const t = (phase.current * 0.5 + i) % 1
        puff.scale.setScalar((0.15 + t * 0.5) * moving)
        puff.position.x = -0.5 - t * 1.2
        if (puff.material) puff.material.opacity = (1 - t) * 0.5 * moving
      })
    }
  })

  const lap = Math.floor(player.score / scorePerLap)

  return (
    <group ref={root}>
      {/* ส่วนที่หันตามทิศวิ่ง */}
      <group ref={heading}>
        {/* เงาวงกลม */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.42, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.28} />
        </mesh>

        {/* ฝุ่นด้านหลัง */}
        <group ref={dust}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[-0.6, 0.25, (i - 1) * 0.18]}>
              <sphereGeometry args={[0.2, 8, 8]} />
              <meshBasicMaterial color="#cfd8e6" transparent opacity={0} depthWrite={false} />
            </mesh>
          ))}
        </group>

        {/* เอียงตอนพุ่ง */}
        <group ref={lean}>
          <group ref={bodyBob}>
            {/* ลำตัว */}
            <mesh position={[0, 0.55, 0]}>
              <capsuleGeometry args={[0.33, 0.34, 6, 14]} />
              <meshStandardMaterial color={player.avatar_color} roughness={0.45} />
            </mesh>
            {/* หัว */}
            <mesh position={[0, 1.18, 0]}>
              <sphereGeometry args={[0.34, 20, 20]} />
              <meshStandardMaterial color={player.avatar_color} roughness={0.4} />
            </mesh>
            {/* ตา (หันหน้า +x = ทิศวิ่ง) */}
            {[-0.15, 0.15].map((z) => (
              <group key={z} position={[0.27, 1.22, z]}>
                <mesh>
                  <sphereGeometry args={[0.09, 12, 12]} />
                  <meshStandardMaterial color="#ffffff" roughness={0.3} />
                </mesh>
                <mesh position={[0.06, 0, 0]}>
                  <sphereGeometry args={[0.045, 10, 10]} />
                  <meshStandardMaterial color="#10151f" />
                </mesh>
              </group>
            ))}
            {/* หมวกแก๊ป */}
            <mesh position={[0, 1.46, 0]}>
              <sphereGeometry args={[0.345, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
              <meshStandardMaterial color={darker} roughness={0.5} />
            </mesh>
            <mesh position={[0.28, 1.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.2, 16, 0, Math.PI]} />
              <meshStandardMaterial color={darker} side={THREE.DoubleSide} roughness={0.5} />
            </mesh>
            {/* แขน */}
            <group ref={armL} position={[0, 0.78, 0.36]}>
              <mesh position={[0, -0.18, 0]}>
                <capsuleGeometry args={[0.09, 0.26, 4, 8]} />
                <meshStandardMaterial color={darker} roughness={0.5} />
              </mesh>
            </group>
            <group ref={armR} position={[0, 0.78, -0.36]}>
              <mesh position={[0, -0.18, 0]}>
                <capsuleGeometry args={[0.09, 0.26, 4, 8]} />
                <meshStandardMaterial color={darker} roughness={0.5} />
              </mesh>
            </group>
            {/* ขา */}
            <group ref={legL} position={[0, 0.32, 0.15]}>
              <mesh position={[0, -0.16, 0]}>
                <capsuleGeometry args={[0.1, 0.2, 4, 8]} />
                <meshStandardMaterial color={darker} roughness={0.55} />
              </mesh>
            </group>
            <group ref={legR} position={[0, 0.32, -0.15]}>
              <mesh position={[0, -0.16, 0]}>
                <capsuleGeometry args={[0.1, 0.2, 4, 8]} />
                <meshStandardMaterial color={darker} roughness={0.55} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* มงกุฎ + ประกาย ผู้นำ (ไม่หมุนตามทิศวิ่ง) */}
      {isLeader && (
        <>
          <group ref={crown} position={[0, 1.82, 0]}>
            <mesh>
              <cylinderGeometry args={[0.2, 0.22, 0.12, 12]} />
              <meshStandardMaterial color="#ffd24d" metalness={0.35} roughness={0.3} />
            </mesh>
            {[0, 1, 2, 3, 4].map((i) => {
              const a = (i / 5) * Math.PI * 2
              return (
                <mesh key={i} position={[Math.cos(a) * 0.18, 0.13, Math.sin(a) * 0.18]}>
                  <coneGeometry args={[0.055, 0.18, 6]} />
                  <meshStandardMaterial color="#ffd24d" metalness={0.35} roughness={0.3} />
                </mesh>
              )
            })}
          </group>
          <Sparkles count={18} scale={[1.4, 2, 1.4]} size={3} speed={0.4} color="#ffc94d" position={[0, 1, 0]} />
        </>
      )}

      {/* ป้ายชื่อ/อันดับ/คะแนน — หันเข้ากล้องเสมอ */}
      <Billboard position={[0, 2.35, 0]}>
        <Text font={FONT} position={[0, 0.32, 0]} fontSize={0.3} color="#ffffff"
          anchorX="center" anchorY="middle" outlineWidth={0.022} outlineColor="#0e1420">
          {`#${rank + 1}  ${player.nickname}`}
        </Text>
        <Text font={FONT} position={[0, 0, 0]} fontSize={0.26} color="#ffc94d"
          anchorX="center" anchorY="middle" outlineWidth={0.018} outlineColor="#0e1420">
          {`${player.score}  ·  รอบ ${lap}`}
        </Text>
      </Billboard>
    </group>
  )
}

// =====================================================================
// พื้นสนามวงรี: หญ้า + ถนนวงแหวน + เส้นขอบ + เส้นสตาร์ท/ชัยลายธง
// =====================================================================
function Ground() {
  // ถนนวงแหวนวงรี (ShapeGeometry มีรูตรงกลาง)
  const roadGeo = useMemo(() => {
    const s = new THREE.Shape()
    s.absellipse(0, 0, RX + ROAD_W / 2, RZ + ROAD_W / 2, 0, Math.PI * 2, false, 0)
    const h = new THREE.Path()
    h.absellipse(0, 0, RX - ROAD_W / 2, RZ - ROAD_W / 2, 0, Math.PI * 2, true, 0)
    s.holes.push(h)
    return new THREE.ShapeGeometry(s, 90)
  }, [])

  // เส้นขอบขาว (วงแหวนบาง) ที่ขอบใน/นอก
  const makeEdge = (rx, rz) => {
    const w = 0.18
    const s = new THREE.Shape()
    s.absellipse(0, 0, rx + w, rz + w, 0, Math.PI * 2, false, 0)
    const h = new THREE.Path()
    h.absellipse(0, 0, rx - w, rz - w, 0, Math.PI * 2, true, 0)
    s.holes.push(h)
    return new THREE.ShapeGeometry(s, 90)
  }
  const outerEdge = useMemo(() => makeEdge(RX + ROAD_W / 2, RZ + ROAD_W / 2), [])
  const innerEdge = useMemo(() => makeEdge(RX - ROAD_W / 2, RZ - ROAD_W / 2), [])

  // เส้นสตาร์ท/ชัย ลายธง พาดขวางถนนที่ θ=0 (ฝั่ง x บวก)
  const checkers = useMemo(() => {
    const cells = []
    const rows = Math.max(4, Math.round(ROAD_W / 0.6))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 2; c++) {
        cells.push({
          x: RX - ROAD_W / 2 + 0.3 + r * (ROAD_W / rows),
          z: (c - 0.5) * 0.6,
          on: (r + c) % 2 === 0,
        })
      }
    }
    return cells
  }, [])

  return (
    <group>
      {/* หญ้า (พื้นใหญ่ใต้ทุกอย่าง — ตรงกลางวงเห็นเป็นสนามหญ้า) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[160, 130]} />
        <meshStandardMaterial color="#4cbf65" roughness={1} />
      </mesh>

      {/* ถนน */}
      <mesh geometry={roadGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#3a4658" roughness={0.9} />
      </mesh>

      {/* เส้นขอบ */}
      <mesh geometry={outerEdge} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <meshStandardMaterial color="#f3f0e7" />
      </mesh>
      <mesh geometry={innerEdge} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <meshStandardMaterial color="#f3f0e7" />
      </mesh>

      {/* เส้นสตาร์ท/ชัย ลายธง */}
      {checkers.map((c, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[c.x, 0.015, c.z]}>
          <planeGeometry args={[ROAD_W / Math.max(4, Math.round(ROAD_W / 0.6)), 0.6]} />
          <meshStandardMaterial color={c.on ? '#f3f0e7' : '#1b2433'} />
        </mesh>
      ))}
    </group>
  )
}

// =====================================================================
// ตกแต่งรอบสนาม: โคนขอบใน/นอก + ต้นไม้รอบนอก (เรียงตามมุมรอบวง)
// =====================================================================
function Roadside() {
  const cones = useMemo(() => {
    const arr = []
    const N = 38
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2
      arr.push([(RX + ROAD_W / 2 + 0.6) * Math.cos(a), (RZ + ROAD_W / 2 + 0.6) * Math.sin(a)])
      arr.push([(RX - ROAD_W / 2 - 0.6) * Math.cos(a), (RZ - ROAD_W / 2 - 0.6) * Math.sin(a)])
    }
    return arr
  }, [])

  const trees = useMemo(() => {
    const arr = []
    const N = 16
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + 0.2
      const rr = 1 + ((k % 3) * 0.12)
      arr.push([(RX + ROAD_W / 2 + 4 + (k % 4)) * Math.cos(a), (RZ + ROAD_W / 2 + 4 + (k % 4)) * Math.sin(a), rr])
    }
    return arr
  }, [])

  return (
    <group>
      {/* โคนจราจร */}
      {cones.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.25, z]}>
          <coneGeometry args={[0.22, 0.5, 12]} />
          <meshStandardMaterial color="#ff7a3c" roughness={0.6} />
        </mesh>
      ))}
      {/* ต้นไม้ */}
      {trees.map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} scale={s}>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.14, 0.18, 0.7, 8]} />
            <meshStandardMaterial color="#6b4a2b" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.3, 0]}>
            <coneGeometry args={[0.7, 1.4, 8]} />
            <meshStandardMaterial color="#3fae5a" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// =====================================================================
// ท้องฟ้าไล่เฉด (โดมครอบทั้งฉาก) — ฟ้าสดใสด้านบน อุ่นละมุนที่ขอบฟ้า
// =====================================================================
function SkyDome() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 256
    const ctx = c.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0.0, '#4db6ff')   // ยอดฟ้า
    g.addColorStop(0.5, '#9fdcff')
    g.addColorStop(0.82, '#dff2ff')
    g.addColorStop(1.0, '#ffe7c2')   // ขอบฟ้าอุ่น
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 8, 256)
    const t = new THREE.CanvasTexture(c)
    t.needsUpdate = true
    return t
  }, [])
  return (
    <mesh>
      <sphereGeometry args={[220, 32, 16]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  )
}

// เมฆก้อนนุ่ม (สเฟียร์ซ้อน) ลอยหมุนช้า ๆ รอบสนาม
function CloudPuff({ scale }) {
  const puffs = [
    [0, 0, 0, 1.4],
    [1.3, -0.1, 0.2, 1.0],
    [-1.3, -0.1, -0.2, 1.0],
    [0.5, 0.45, 0.3, 0.9],
    [-0.6, 0.35, -0.3, 0.8],
  ]
  return (
    <group scale={scale}>
      {puffs.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 10, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={1} emissive="#eaf3ff" emissiveIntensity={0.2} />
        </mesh>
      ))}
    </group>
  )
}

function Clouds() {
  const grp = useRef()
  const clouds = useMemo(() => {
    const arr = []
    const N = 8
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.3
      const r = 68 + (i % 3) * 14
      arr.push({ x: Math.cos(a) * r, y: 30 + (i % 4) * 5, z: Math.sin(a) * r, s: 2.2 + (i % 3) * 0.7 })
    }
    return arr
  }, [])
  useFrame((s) => {
    if (grp.current) grp.current.rotation.y = s.clock.elapsedTime * 0.008
  })
  return (
    <group ref={grp}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          <CloudPuff scale={c.s} />
        </group>
      ))}
    </group>
  )
}

// ธงราวหลากสี บนเสาโดยรอบสนาม (ธงสามเหลี่ยมห้อยเป็นระย้า)
function Bunting() {
  const rx = RX + ROAD_W / 2 + 2.4
  const rz = RZ + ROAD_W / 2 + 2.4
  const N = 14
  const per = 4

  const poles = useMemo(() => {
    const arr = []
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2
      arr.push([rx * Math.cos(a), rz * Math.sin(a)])
    }
    return arr
  }, [])

  const flags = useMemo(() => {
    const arr = []
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2
      const a1 = ((k + 1) / N) * Math.PI * 2
      for (let j = 0; j < per; j++) {
        const tt = (j + 0.5) / per
        const a = a0 + (a1 - a0) * tt
        const sag = Math.sin(tt * Math.PI) * 0.55
        arr.push({
          x: rx * Math.cos(a),
          z: rz * Math.sin(a),
          y: 3.0 - sag,
          a,
          color: FEST_COLORS[(k * per + j) % FEST_COLORS.length],
        })
      }
    }
    return arr
  }, [])

  return (
    <group>
      {poles.map(([x, z], i) => (
        <mesh key={i} position={[x, 1.6, z]}>
          <cylinderGeometry args={[0.06, 0.07, 3.2, 6]} />
          <meshStandardMaterial color="#eef2f8" roughness={0.6} />
        </mesh>
      ))}
      {flags.map((f, i) => (
        <mesh key={i} position={[f.x, f.y, f.z]} rotation={[Math.PI, -f.a, 0]}>
          <coneGeometry args={[0.17, 0.42, 3]} />
          <meshStandardMaterial color={f.color} roughness={0.55} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

// ลูกโป่งหลากสี ลอยอยู่กลางสนาม เด้งขึ้นลงเบา ๆ
function Balloons() {
  const grp = useRef()
  const items = useMemo(() => {
    const arr = []
    const N = 11
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.15
      const rr = RX * (0.32 + (i % 3) * 0.14)
      arr.push({
        x: Math.cos(a) * rr,
        z: Math.sin(a) * (rr * RZ) / RX,
        y: 6 + (i % 4) * 1.4,
        color: FEST_COLORS[i % FEST_COLORS.length],
        ph: Math.random() * Math.PI * 2,
      })
    }
    return arr
  }, [])
  useFrame((s) => {
    if (!grp.current) return
    const t = s.clock.elapsedTime
    grp.current.children.forEach((b, i) => {
      b.position.y = items[i].y + Math.sin(t * 0.6 + items[i].ph) * 0.45
      b.rotation.z = Math.sin(t * 0.5 + items[i].ph) * 0.12
    })
  })
  return (
    <group ref={grp}>
      {items.map((b, i) => (
        <group key={i} position={[b.x, b.y, b.z]}>
          <mesh scale={[1, 1.2, 1]}>
            <sphereGeometry args={[0.6, 16, 16]} />
            <meshStandardMaterial color={b.color} roughness={0.3} />
          </mesh>
          <mesh position={[0, -0.72, 0]}>
            <coneGeometry args={[0.1, 0.2, 8]} />
            <meshStandardMaterial color={b.color} roughness={0.4} />
          </mesh>
          <mesh position={[0, -1.5, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 1.5, 4]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// กล้องมองวงรอบจากมุมสูงเฉียง + ส่ายช้า ๆ (ถอยให้เห็นสนามใหญ่ทั้งวง)
function CameraRig() {
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const cam = state.camera
    cam.position.x = Math.sin(t * 0.1) * 8
    cam.position.y = 34 + Math.sin(t * 0.16) * 1.5
    cam.position.z = 46
    cam.lookAt(0, 0, 0)
  })
  return null
}

function Scene({ players, maxScore }) {
  const ranked = useMemo(() => {
    const order = [...players].sort((a, b) => b.score - a.score)
    const rankMap = new Map(order.map((p, i) => [p.id, i]))
    return players.map((p) => ({ ...p, _rank: rankMap.get(p.id) }))
  }, [players])

  const n = players.length
  // คะแนนต่อรอบ อิง track_max_score ให้สมดุลเวลา (มากขึ้น = วิ่งช้าลง)
  const scorePerLap = (maxScore || 3000) / LAPS_AT_MAX

  return (
    <>
      <CameraRig />
      <fog attach="fog" args={['#cfeeff', 95, 205]} />
      <SkyDome />
      <Clouds />

      {/* แสงแดดกลางวันอุ่น ๆ สดใส */}
      <hemisphereLight args={['#bfe6ff', '#4cbf65', 1.0]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[24, 34, 16]} intensity={1.35} color="#fff2d6" />

      {/* คอนเฟตตีระยิบเหนือสนาม */}
      <Sparkles count={70} scale={[95, 24, 66]} position={[0, 13, 0]} size={4} speed={0.35} color="#ffd24d" />
      <Sparkles count={45} scale={[95, 22, 66]} position={[0, 11, 0]} size={3} speed={0.28} color="#ff6b5e" />
      <Sparkles count={45} scale={[95, 22, 66]} position={[0, 12, 0]} size={3} speed={0.3} color="#22d3ee" />

      <Ground />
      <Roadside />
      <Bunting />
      <Balloons />
      {ranked.map((p, i) => {
        // กระจายเลนในแนวรัศมี ให้อยู่บนถนนและไม่ทับกัน
        const span = ROAD_W - 1.4
        const off = n > 1 ? -span / 2 + span * (i / (n - 1)) : 0
        return (
          <Runner
            key={p.id}
            player={p}
            rxi={RX + off}
            rzi={RZ + off}
            scorePerLap={scorePerLap}
            rank={p._rank}
          />
        )
      })}
    </>
  )
}

export default function RaceField({ players, maxScore = 3000 }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 34, 46], fov: 50 }}
      style={{ width: '100%', height: '100%', background: '#9fdcff' }}
    >
      <Suspense fallback={null}>
        <Scene players={players} maxScore={maxScore} />
      </Suspense>
    </Canvas>
  )
}
