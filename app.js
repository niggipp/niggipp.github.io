const svg = document.getElementById("poster")
const NS = "http://www.w3.org/2000/svg"

const VIEW_W = 1000
const VIEW_H = 1300
const STEP = 11.25
const ANGLE_OFFSET = -90

svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`)
svg.setAttribute("preserveAspectRatio", "xMidYMid meet")

const CENTER = { x: VIEW_W * 0.22, y: VIEW_H * 0.83 }

// 전체 컴포지션 이동/스케일
const WHOLE = { x: -20, y: -100, scale: 0.9, rotate: 0 }

// 텍스트 개별 배치
const TEXT = { x: 27, y: 973, scale: 1.5 }

// hover 회전(살짝 비껴나서 멈춤)
const HOVER_MAX_DEG = 11.25
const HOVER_SPEED_DEG = 80.0

const rings = [
  { mid: 74.25,  thick: 2.5,  segs: [[6,11],[20,22]] },
  { mid: 78.6,   thick: 5.0,  segs: [[4,10],[16,21]] },
  { mid: 86.7,   thick: 10.0, segs: [[1,7],[12,27]] },
  { mid: 102.3,  thick: 20.0, segs: [[0,24]] },
  { mid: 132.9,  thick: 40.0, segs: [[4,16],[17,20]] },
  { mid: 193.5,  thick: 80.0, segs: [[31,15]] },
  { mid: 314.1,  thick: 160.0,segs: [[0,24]] }
]

const MAX_R = Math.max(...rings.map(r => r.mid + r.thick * 0.5))

function polar(cx, cy, r, deg){
  const rad = deg * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function ringArcPath(cx, cy, rIn, rOut, a0, a1){
  const p0 = polar(cx, cy, rOut, a0)
  const p1 = polar(cx, cy, rOut, a1)
  const p2 = polar(cx, cy, rIn,  a1)
  const p3 = polar(cx, cy, rIn,  a0)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  return `M ${p0.x} ${p0.y}
          A ${rOut} ${rOut} 0 ${large} 1 ${p1.x} ${p1.y}
          L ${p2.x} ${p2.y}
          A ${rIn} ${rIn} 0 ${large} 0 ${p3.x} ${p3.y}
          Z`
}

function calcBaseScale(){
  const d = Math.max(
    Math.hypot(CENTER.x, CENTER.y),
    Math.hypot(VIEW_W - CENTER.x, CENTER.y),
    Math.hypot(CENTER.x, VIEW_H - CENTER.y),
    Math.hypot(VIEW_W - CENTER.x, VIEW_H - CENTER.y)
  )
  return (d / MAX_R) * 1.42
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)) }

function smootherstep(t){
  t = clamp(t, 0, 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
function mix(a, b, t){ return a + (b - a) * t }

// ================= build once =================
svg.textContent = ""

const root = document.createElementNS(NS, "g")
root.setAttribute("id", "root")
svg.appendChild(root)

const g = document.createElementNS(NS, "g")
root.appendChild(g)

const textG = document.createElementNS(NS, "g")
textG.setAttribute("id", "text")
textG.setAttribute("fill", "#000")
root.appendChild(textG)

function mountVectorTextFromDefs(){
  const src = document.getElementById("typeBlock")
  if (!src) { console.warn("typeBlock not found in HTML defs"); return }
  while (textG.firstChild) textG.removeChild(textG.firstChild)
  const cloned = src.cloneNode(true)
  cloned.removeAttribute("id")
  textG.appendChild(cloned)
}
mountVectorTextFromDefs()

function setGroupTransform(){
  const scale = calcBaseScale()

  const w = WHOLE
  const parts = []
  if (w.x || w.y) parts.push(`translate(${w.x} ${w.y})`)
  if (w.rotate) parts.push(`rotate(${w.rotate})`)
  if (w.scale !== 1) parts.push(`scale(${w.scale})`)
  if (parts.length) root.setAttribute("transform", parts.join(" "))
  else root.removeAttribute("transform")

  const T = `translate(${CENTER.x}, ${CENTER.y}) scale(${scale}) translate(${-CENTER.x}, ${-CENTER.y})`
  g.setAttribute("transform", T)

  textG.setAttribute("transform", `translate(${TEXT.x} ${TEXT.y}) scale(${TEXT.scale})`)
}
setGroupTransform()
window.addEventListener("resize", () => setGroupTransform())

const base = rings.map(r => ({
  rIn0:  r.mid - r.thick * 0.5,
  rOut0: r.mid + r.thick * 0.5,
  thick: r.thick
}))

const gaps = []
for (let i = 0; i < base.length - 1; i++){
  gaps.push(base[i+1].rIn0 - base[i].rOut0)
}
gaps.sort((a,b)=>a-b)
const GAP = gaps.length ? gaps[Math.floor(gaps.length/2)] : 2

const segState = []
const segPaths = rings.map((ring, i) => {
  segState[i] = []
  return ring.segs.map((_, idx) => {
    const p = document.createElementNS(NS, "path")
    p.setAttribute("fill", "#000")
    p.style.pointerEvents = "visiblePainted"
    p.style.cursor = "pointer"

    const dir = ((i + idx) % 2 === 0) ? 1 : -1
    segState[i][idx] = { cur: 0, target: 0, dir }

    p.addEventListener("pointerenter", () => { segState[i][idx].target = dir * HOVER_MAX_DEG })
    p.addEventListener("pointerleave", () => { segState[i][idx].target = 0 })

    g.appendChild(p)
    return p
  })
})

// ================= overlapped wave params =================
const OUT_T  = 0.055
const HOLD_T = 0.080
const BACK_T = 0.055
const RING_DUR = OUT_T + HOLD_T + BACK_T

const BLEND = 0.35
const START_GAP = RING_DUR * 0.50
const TOTAL_DUR = START_GAP * (rings.length - 1) + RING_DUR

const REF_THICK = rings[0].thick
const BASE_N = REF_THICK * 2
const N_CAP  = BASE_N * 4

const pushMaxForRing = rings.map(r => {
  const ratio = r.thick / REF_THICK
  const n = BASE_N * Math.sqrt(ratio)
  return Math.min(n, N_CAP)
})

// ================= state =================
let playing = false
let globalT = 0

function pushAt(localT01, dMax){
  if (localT01 <= 0 || localT01 >= 1) return 0

  const t = localT01 * RING_DUR
  const tOutEnd = OUT_T
  const tHoldEnd = OUT_T + HOLD_T

  let outV = 0
  if (t <= tOutEnd) outV = dMax * smootherstep(t / OUT_T)
  else outV = dMax

  let backV = dMax
  if (t >= tHoldEnd) backV = dMax * (1 - smootherstep((t - tHoldEnd) / BACK_T))

  const blendOut = clamp((t - tOutEnd) / (OUT_T * BLEND), 0, 1)
  const v1 = mix(outV, dMax, smootherstep(blendOut))

  const blendBack = clamp((t - tHoldEnd) / (BACK_T * BLEND), 0, 1)
  const v2 = mix(dMax, backV, smootherstep(blendBack))

  if (t < tHoldEnd) return v1
  return v2
}

function solveRadii(pushArr){
  const N = rings.length
  const rIn = new Array(N)
  const rOut = new Array(N)

  rIn[0] = base[0].rIn0
  for (let i = 0; i < N; i++){
    const thickCur = base[i].thick + (pushArr[i] || 0)
    rOut[i] = rIn[i] + thickCur
    if (i < N - 1) rIn[i+1] = rOut[i] + GAP
  }
  return { rIn, rOut }
}

function drawFrame(pushArr){
  const { rIn, rOut } = solveRadii(pushArr)

  for (let i = 0; i < rings.length; i++){
    const ring = rings[i]
    const paths = segPaths[i]
    const rin = rIn[i]
    const rout = rOut[i]

    ring.segs.forEach(([s, eSeg], idx) => {
      let ss = s
      let ee = eSeg
      if (s > eSeg) ee = eSeg + 32

      const off = segState[i][idx].cur

      const a0 = ss * STEP + ANGLE_OFFSET + off
      const a1 = (ee + 1) * STEP + ANGLE_OFFSET + off
      paths[idx].setAttribute("d", ringArcPath(CENTER.x, CENTER.y, rin, rout, a0, a1))
    })
  }
}

function tick(now){
  const dt = Math.min(0.033, (now - tick.last) / 1000)
  tick.last = now

  // hover 업데이트 (일정 속도)
  for (let i = 0; i < segState.length; i++){
    for (let j = 0; j < segState[i].length; j++){
      const st = segState[i][j]
      const diff = st.target - st.cur
      if (diff === 0) continue
      const step = HOVER_SPEED_DEG * dt
      if (Math.abs(diff) <= step) st.cur = st.target
      else st.cur += Math.sign(diff) * step
    }
  }

  const pushes = new Array(rings.length).fill(0)

  if (playing){
    globalT += dt

    for (let i = 0; i < rings.length; i++){
      const start = i * START_GAP
      const end = start + RING_DUR
      if (globalT >= start && globalT <= end){
        const local01 = (globalT - start) / RING_DUR
        pushes[i] = pushAt(local01, pushMaxForRing[i])
      }
    }

    if (globalT >= TOTAL_DUR){
      playing = false
      globalT = 0
    }
  }

  drawFrame(pushes)
  requestAnimationFrame(tick)
}
tick.last = performance.now()

window.addEventListener("pointerdown", () => {
  if (playing) return
  playing = true
  globalT = 0
})

requestAnimationFrame(tick)
