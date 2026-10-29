import fs from 'node:fs'
import path from 'node:path'

/**
 * Santé des sources (صحة المصادر, console Super Admin) : état de chaque collecteur et enregistreur de la veille,
 * écrit par le collecteur à chaque passage (data/libye-sources-etat.json : dernier passage, dernier succès, erreur,
 * publications, budgets), complété par l'état des chaînes TV et radio (data/libye-diffusion-etat.json).
 *
 * Statut : off (désactivée), never (jamais passée), error (dernier passage en échec), stale (pas de succès depuis
 * trop longtemps pour son rythme), ok.
 */

const HOUR = 3_600_000

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Délai au-delà duquel une source sans succès est « en retard » : chaînes quotidiennes 26 h, sinon 4 rythmes (6 h au moins) */
export function staleAfter(row) {
  if (row.section === 'diffusion') return 26 * HOUR
  const every = Number(row.intervalle_min) || 60
  return Math.max(every * 4 * 60_000, 6 * HOUR)
}

export function healthOf(row, now = Date.now()) {
  if (!row.actif) return 'off'
  if (!row.dernier_passage) return 'never'
  const ok = row.dernier_succes ? Date.parse(row.dernier_succes) : 0
  if (row.erreur && (!ok || Date.parse(row.dernier_passage) > ok)) return 'error'
  if (!ok || now - ok > staleAfter(row)) return 'stale'
  return 'ok'
}

const ORDER = { error: 0, stale: 1, never: 2, ok: 3, off: 4 }

export function sourceHealth(dataDir, now = Date.now()) {
  const state = readJson(path.join(dataDir, 'libye-sources-etat.json'))
  const diffusion = readJson(path.join(dataDir, 'libye-diffusion-etat.json'))
  const channels = new Map((diffusion?.chaines || []).map((c) => [c.id, c]))
  const rows = (state?.sources || []).map((r) => {
    const c = channels.get(r.id)
    return {
      id: r.id,
      name: r.nom || r.id,
      section: r.section || r.type || '',
      active: Boolean(r.actif),
      lastRun: r.dernier_passage || null,
      lastSuccess: r.dernier_succes || null,
      error: r.erreur ? String(r.erreur).slice(0, 300) : '',
      lastCount: r.nb_dernier || 0,
      total: r.nb_total || 0,
      note: r.note || '',
      ...(c ? { lastRecording: c.dernier_enregistrement || null, lastTranscript: c.derniere_transcription || null, slots: c.creneaux || [] } : {}),
      status: healthOf(r, now),
    }
  })
  rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.section.localeCompare(b.section) || a.name.localeCompare(b.name))
  const counts = { ok: 0, error: 0, stale: 0, never: 0, off: 0 }
  for (const r of rows) counts[r.status]++
  return { updatedAt: state?.maj || null, available: Boolean(state), counts, rows, budgets: state?.budgets || {} }
}
