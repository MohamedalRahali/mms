import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { makeEngine } from '../server/faceEngine.js'
import * as face from '../server/face.js'

/**
 * Moteur réel (YuNet, SFace, MiniFASNetV2) en Node pur, comme sur le serveur, sur les seules images d'exemple
 * officielles : minivision (images/sample : F = fausse, T = vraie) et la démonstration SFace d'OpenCV Zoo.
 * Aucune image d'utilisateur.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fix = (n) => zlib.gunzipSync(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'face', n)))
const img320 = (n) => ({ w: 320, h: 240, rgb: fix(`${n}_320.rgb.gz`) })
const engine = makeEngine(root)
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

test('moteur : modèles vérifiés par SHA-256 et chargés', async () => {
  const st = await engine.loaded
  assert.deepEqual(st, { ready: true, error: '', missing: [] })
})

test('MiniFASNetV2 : mêmes étiquettes que le dépôt officiel minivision (F1, F2 fausses ; T1 vraie), en 320×240', async () => {
  for (const [n, real] of [['image_F1', false], ['image_F2', false], ['image_T1', true]]) {
    const r = await engine.analyse(img320(n))
    assert.equal(r.faces, 1, n)
    assert.equal(r.live, real, `${n} ${r.liveScore}`)
  }
})

test('SFace : démonstration OpenCV refaite, seule la même personne dépasse 0,363', async () => {
  const full = fix('sface_demo_1024x512.rgb.gz')
  const half = (x0) => {
    const rgb = Buffer.alloc(512 * 512 * 3)
    for (let y = 0; y < 512; y++) full.copy(rgb, y * 512 * 3, (y * 1024 + x0) * 3, (y * 1024 + x0 + 512) * 3)
    return { w: 512, h: 512, rgb }
  }
  const left = half(0)
  const right = half(512)
  const [target] = await engine._detect(left)
  const tv = await engine._embed(left, target)
  const faces = (await engine._detect(right)).filter((f) => f.w >= 20).sort((a, b) => a.x - b.x)
  const scores = []
  for (const f of faces) scores.push(cos(tv, await engine._embed(right, f)))
  // La personne de droite est la même (vert sur l'image publiée) ; les autres non
  assert.ok(scores.at(-1) >= 0.363, String(scores))
  assert.ok(scores.slice(0, -1).every((s) => s < 0.363), String(scores))
})

test('chaîne complète : une photo présentée est refusée (vivacité), une image noire ne compte pas comme visage', async () => {
  face.setFaceEngine(engine)
  const r = await face.analyse([img320('image_F1'), img320('image_F1')], ['center', 'center'])
  assert.equal(r.ok, false)
  assert.ok(['LIVENESS'].includes(r.code), r.code)
  const blank = { w: 320, h: 240, rgb: Buffer.alloc(320 * 240 * 3) }
  assert.equal((await face.analyse([blank, blank], ['center', 'center'])).code, 'NO_FACE')
})

test('modèle modifié : refusé (empreinte SHA-256), moteur non prêt', async () => {
  const tmp = fs.mkdtempSync(path.join(root, 'tests', 'fixtures', 'tmp-'))
  try {
    fs.mkdirSync(path.join(tmp, 'models', 'face'), { recursive: true })
    for (const f of ['face_detection_yunet_2023mar.onnx', 'face_recognition_sface_2021dec.onnx']) fs.copyFileSync(path.join(root, 'models', 'face', f), path.join(tmp, 'models', 'face', f))
    fs.writeFileSync(path.join(tmp, 'models', 'face', 'MiniFASNetV2.onnx'), 'pas un modèle')
    const ort = (await import('onnxruntime-node')).default
    const e = makeEngine(tmp, ort)
    const st = await e.loaded
    assert.equal(st.ready, false)
    assert.match(st.error, /SHA256/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
