import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * Moteur de reconnaissance du visage, hébergé sur le serveur MMS (aucun service extérieur, aucune image envoyée
 * hors MMS), exécuté avec onnxruntime-node :
 * - YuNet 2023mar (OpenCV Zoo, MIT) : détection du visage et de 5 points (yeux, nez, coins de la bouche) ;
 * - SFace 2021dec (OpenCV Zoo, Apache 2.0) : vecteur de 128 valeurs du visage aligné (112×112) ;
 * - MiniFASNetV2 (minivision, Apache 2.0 ; conversion ONNX de yakhyo/face-anti-spoofing, Apache 2.0) :
 *   probabilité qu'il s'agisse d'un vrai visage et non d'une photo ou d'un écran (classe 1 = vrai).
 * Chaque fichier est contrôlé par son empreinte SHA-256 avant chargement : un modèle modifié n'est pas utilisé.
 *
 * Entrée : image RGB brute (320×240 envoyée par le navigateur). Sortie de analyse() : nombre de visages, qualité,
 * vivacité passive, pose (center / left / right, vue par la personne) et vecteur normalisé du visage de face.
 */

export const MODELS = {
  detect: { file: 'face_detection_yunet_2023mar.onnx', sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4' },
  embed: { file: 'face_recognition_sface_2021dec.onnx', sha256: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79' },
  spoof: { file: 'MiniFASNetV2.onnx', sha256: 'b32929adc2d9c34b9486f8c4c7bc97c1b69bc0ea9befefc380e4faae4e463907' },
}
export const MODEL_FILES = Object.values(MODELS).map((m) => m.file)

// Réglages : seuils de détection et de qualité. Le seuil de ressemblance est dans face.js (0,363, publié par OpenCV).
export const TUNING = {
  detScore: 0.6, // visage compté au-dessus de ce score
  goodScore: 0.85, // visage net exigé pour l'analyse
  minFace: 70, // largeur minimale du visage, en pixels de l'image 320×240
  lumMin: 50,
  lumMax: 220,
  sharpMin: 15, // variance du laplacien sur le visage (flou en dessous)
  liveMin: 0.6, // probabilité « vrai visage » minimale
  poseCenter: [0.35, 0.65], // position du nez entre les deux yeux : de face entre ces bornes
  timeoutMs: 15000,
}

const DET = 640

/**
 * Visages qui comptent : le principal (le plus sûr), plus tout autre visage net (score ≥ 0,85) et d'au moins 40 % de
 * la largeur du principal. Une photo, une affiche ou un reflet flou en arrière-plan n'empêche donc plus la vérification.
 */
export function countFaces(faces) {
  if (!faces.length) return 0
  const main = faces[0]
  return 1 + faces.slice(1).filter((f) => f.score >= TUNING.goodScore && f.w >= 0.4 * main.w).length
}
const STRIDES = [8, 16, 32]
// Points de référence d'un visage aligné 112×112 (ArcFace, utilisés par OpenCV FaceRecognizerSF::alignCrop)
const REF = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
]

const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('ENGINE_TIMEOUT')), ms).unref?.())])

/** Pixel RGB bilinéaire (x, y en coordonnées de l'image source) */
function sample(img, x, y, out, o) {
  const { w, h, rgb } = img
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) {
    out[o] = out[o + 1] = out[o + 2] = 0
    return
  }
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const fx = x - x0
  const fy = y - y0
  for (let c = 0; c < 3; c++) {
    const a = rgb[(y0 * w + x0) * 3 + c]
    const b = rgb[(y0 * w + x1) * 3 + c]
    const d = rgb[(y1 * w + x0) * 3 + c]
    const e = rgb[(y1 * w + x1) * 3 + c]
    out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy
  }
}

/** Tenseur NCHW float32 ; order 'bgr' ou 'rgb' ; pixel(x, y) → coordonnées source (ou null : noir) */
function tensor(ort, W, H, order, map, img) {
  const data = new Float32Array(3 * W * H)
  const px = [0, 0, 0]
  const plane = W * H
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const src = map(x, y)
      if (src) sample(img, src[0], src[1], px, 0)
      else px[0] = px[1] = px[2] = 0
      const i = y * W + x
      if (order === 'bgr') {
        data[i] = px[2]
        data[plane + i] = px[1]
        data[2 * plane + i] = px[0]
      } else {
        data[i] = px[0]
        data[plane + i] = px[1]
        data[2 * plane + i] = px[2]
      }
    }
  return new ort.Tensor('float32', data, [1, 3, H, W])
}

const iou = (a, b) => {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  return inter / (a.w * a.h + b.w * b.h - inter || 1)
}

/** Similitude (rotation, échelle, translation) qui envoie les 5 points détectés sur REF (méthode d'Umeyama) */
export function similarity(src, dst = REF) {
  const n = src.length
  const ms = [0, 0]
  const md = [0, 0]
  for (let i = 0; i < n; i++) {
    ms[0] += src[i][0] / n
    ms[1] += src[i][1] / n
    md[0] += dst[i][0] / n
    md[1] += dst[i][1] / n
  }
  let a = 0
  let b = 0
  let v = 0
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - ms[0]
    const sy = src[i][1] - ms[1]
    const dx = dst[i][0] - md[0]
    const dy = dst[i][1] - md[1]
    a += sx * dx + sy * dy
    b += sx * dy - sy * dx
    v += sx * sx + sy * sy
  }
  const s = Math.hypot(a, b) / (v || 1)
  const th = Math.atan2(b, a)
  const c = s * Math.cos(th)
  const d = s * Math.sin(th)
  // dst = [c -d; d c] · src + t
  return { c, d, tx: md[0] - (c * ms[0] - d * ms[1]), ty: md[1] - (d * ms[0] + c * ms[1]) }
}

export function makeEngine(root, ortModule = null) {
  const dir = path.join(root, 'models', 'face')
  let state = { ready: false, error: '', missing: [] }
  let ort = null
  const sessions = {}

  const missing = () => {
    const m = MODEL_FILES.filter((f) => !fs.existsSync(path.join(dir, f)))
    try {
      fs.accessSync(path.join(root, 'node_modules', 'onnxruntime-node'))
    } catch {
      if (!ortModule) m.push('onnxruntime-node')
    }
    return m
  }

  async function load() {
    const miss = missing()
    if (miss.length) {
      state = { ready: false, error: '', missing: miss }
      return state
    }
    try {
      ort = ortModule || (await import('onnxruntime-node')).default
      for (const [k, m] of Object.entries(MODELS)) {
        const f = path.join(dir, m.file)
        // Modèle modifié ou corrompu : refusé
        if (sha256(f) !== m.sha256) throw new Error(`SHA256 ${m.file}`)
        sessions[k] = await ort.InferenceSession.create(f, { logSeverityLevel: 3 })
      }
      // Essai à vide : une image noire ne contient aucun visage
      const blank = { w: 320, h: 240, rgb: Buffer.alloc(320 * 240 * 3) }
      if ((await detect(blank)).length) throw new Error('SELFTEST')
      state = { ready: true, error: '', missing: [] }
    } catch (err) {
      state = { ready: false, error: String(err.message).slice(0, 160), missing: [] }
    }
    return state
  }

  /** Visages trouvés (coordonnées de l'image d'origine), du plus sûr au moins sûr, après suppression des doublons */
  async function detect(img) {
    const k = DET / Math.max(img.w, img.h)
    const input = tensor(ort, DET, DET, 'bgr', (x, y) => (x / k < img.w && y / k < img.h ? [x / k, y / k] : null), img)
    const out = await withTimeout(sessions.detect.run({ input }), TUNING.timeoutMs)
    const faces = []
    for (const s of STRIDES) {
      const cols = DET / s
      const cls = out[`cls_${s}`].data
      const obj = out[`obj_${s}`].data
      const box = out[`bbox_${s}`].data
      const kps = out[`kps_${s}`].data
      for (let i = 0; i < cls.length; i++) {
        const score = Math.sqrt(Math.min(Math.max(cls[i], 0), 1) * Math.min(Math.max(obj[i], 0), 1))
        if (score < TUNING.detScore) continue
        const c = i % cols
        const r = Math.floor(i / cols)
        const cx = (c + box[i * 4]) * s
        const cy = (r + box[i * 4 + 1]) * s
        const w = Math.exp(box[i * 4 + 2]) * s
        const h = Math.exp(box[i * 4 + 3]) * s
        const pts = []
        for (let p = 0; p < 5; p++) pts.push([((kps[i * 10 + 2 * p] + c) * s) / k, ((kps[i * 10 + 2 * p + 1] + r) * s) / k])
        faces.push({ score, x: (cx - w / 2) / k, y: (cy - h / 2) / k, w: w / k, h: h / k, pts })
      }
    }
    faces.sort((a, b) => b.score - a.score)
    const kept = []
    for (const f of faces) if (kept.every((g) => iou(f, g) < 0.3)) kept.push(f)
    return kept
  }

  /** Luminosité moyenne et netteté (variance du laplacien) sur le cadre du visage */
  function quality(img, f) {
    const x0 = Math.max(1, Math.floor(f.x))
    const y0 = Math.max(1, Math.floor(f.y))
    const x1 = Math.min(img.w - 2, Math.floor(f.x + f.w))
    const y1 = Math.min(img.h - 2, Math.floor(f.y + f.h))
    const g = (x, y) => {
      const o = (y * img.w + x) * 3
      return 0.299 * img.rgb[o] + 0.587 * img.rgb[o + 1] + 0.114 * img.rgb[o + 2]
    }
    let sum = 0
    let n = 0
    let ls = 0
    let ls2 = 0
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const v = g(x, y)
        sum += v
        const lap = 4 * v - g(x - 1, y) - g(x + 1, y) - g(x, y - 1) - g(x, y + 1)
        ls += lap
        ls2 += lap * lap
        n++
      }
    const lum = n ? sum / n : 0
    const sharp = n ? ls2 / n - (ls / n) ** 2 : 0
    return { lum, sharp }
  }

  /** Probabilité « vrai visage » (MiniFASNetV2 : cadre agrandi 2,7 fois, 80×80, BGR 0–255, classe 1 = vrai) */
  async function liveness(img, f) {
    const scale = Math.min((img.h - 1) / f.h, (img.w - 1) / f.w, 2.7)
    const nw = f.w * scale
    const nh = f.h * scale
    const cx = f.x + f.w / 2
    const cy = f.y + f.h / 2
    const x1 = Math.max(0, Math.floor(cx - nw / 2))
    const y1 = Math.max(0, Math.floor(cy - nh / 2))
    const x2 = Math.min(img.w - 1, Math.floor(cx + nw / 2))
    const y2 = Math.min(img.h - 1, Math.floor(cy + nh / 2))
    const sw = (x2 - x1 + 1) / 80
    const sh = (y2 - y1 + 1) / 80
    const input = tensor(ort, 80, 80, 'bgr', (x, y) => [Math.min(x1 + (x + 0.5) * sw - 0.5, x2), Math.min(y1 + (y + 0.5) * sh - 0.5, y2)], img)
    const out = await withTimeout(sessions.spoof.run({ input }), TUNING.timeoutMs)
    const logits = Array.from(out.output.data)
    const m = Math.max(...logits)
    const e = logits.map((v) => Math.exp(v - m))
    return e[1] / e.reduce((s, v) => s + v, 0)
  }

  /** Vecteur SFace du visage aligné 112×112 (RGB 0–255), normalisé */
  async function embed(img, f) {
    const t = similarity(f.pts)
    // Inverse de la similitude : pixel du visage aligné → pixel de l'image
    const det = t.c * t.c + t.d * t.d
    const inv = (x, y) => {
      const u = x - t.tx
      const v = y - t.ty
      return [(t.c * u + t.d * v) / det, (-t.d * u + t.c * v) / det]
    }
    const out = await withTimeout(sessions.embed.run({ data: tensor(ort, 112, 112, 'rgb', inv, img) }), TUNING.timeoutMs)
    const v = Array.from(out.fc1.data)
    const n = Math.hypot(...v) || 1
    return v.map((x) => x / n)
  }

  /**
   * Pose vue par la personne : position du nez entre les deux yeux dans l'image brute (non inversée), 0 = sur l'œil
   * côté gauche de l'image, 1 = sur l'autre. Nez vers la droite de l'image = tête tournée vers SA gauche (vérifié sur
   * l'image d'exemple F1 de minivision, tête tournée vers sa droite : rapport 0,07).
   */
  function poseRatio(f) {
    const [eyeA, eyeB, nose] = f.pts
    const span = eyeB[0] - eyeA[0]
    return Math.abs(span) < 1 ? null : (nose[0] - eyeA[0]) / span
  }
  function pose(f) {
    const r = poseRatio(f)
    if (r === null) return 'other'
    if (r >= TUNING.poseCenter[0] && r <= TUNING.poseCenter[1]) return 'center'
    return r > TUNING.poseCenter[1] ? 'left' : 'right'
  }

  /** Contrôle rapide pendant le défi (détection et pose seulement), pour guider la personne en direct */
  async function probe(img) {
    if (!state.ready) throw new Error('ENGINE')
    const faces = await detect(img)
    const n = countFaces(faces)
    if (n !== 1) return { faces: n }
    return { faces: 1, pose: pose(faces[0]), ratio: poseRatio(faces[0]) }
  }

  async function analyse(img) {
    if (!state.ready) throw new Error('ENGINE')
    const faces = await detect(img)
    const n = countFaces(faces)
    if (!n) return { faces: 0 }
    if (n > 1) return { faces: n }
    const f = faces[0]
    const q = quality(img, f)
    const good = f.score >= TUNING.goodScore && f.w >= TUNING.minFace && q.lum >= TUNING.lumMin && q.lum <= TUNING.lumMax && q.sharp >= TUNING.sharpMin
    const live = await liveness(img, f)
    const p = pose(f)
    return {
      faces: 1,
      quality: good,
      live: live >= TUNING.liveMin,
      liveScore: live,
      pose: p,
      ratio: poseRatio(f),
      metrics: { score: f.score, width: f.w, lum: q.lum, sharp: q.sharp },
      vector: p === 'center' ? await embed(img, f) : null,
      box: f,
    }
  }

  const ready = load()
  return {
    loaded: ready,
    ready: () => state.ready,
    info: () => ({ ...state }),
    analyse,
    probe,
    // Pour les essais : détection seule et score de vivacité sur une image donnée
    _detect: async (img) => (await ready, detect(img)),
    _liveness: async (img, f) => (await ready, liveness(img, f)),
    _embed: async (img, f) => (await ready, embed(img, f)),
  }
}
