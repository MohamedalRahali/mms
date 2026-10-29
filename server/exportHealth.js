import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { uniqueItems } from './dedupe.js'

/**
 * صحة التصدير : surveille les téléchargements (PDF et Word) pour qu'aucun fichier vide ne parte.
 *
 * - Chaque export réel fait dans le navigateur remonte son résultat : type, format, nombre de pages, pages blanches
 *   retirées, taille du fichier, erreur éventuelle. Jamais le contenu du fichier.
 * - Toutes les 6 heures, le serveur vérifie ce dont les exports ont besoin : actualités des 7 derniers jours à exporter
 *   (avec titres), contrôle des pages blanches présent dans l'application installée, logo du client lisible.
 * - En cas d'échec (contrôle programmé, ou export vide chez un utilisateur), un e-mail part à l'adresse du support
 *   technique, une fois par 6 heures au plus. Le Super Admin voit tout dans la carte « صحة التصدير ».
 *
 * Le PDF est dessiné par le navigateur : le serveur n'a pas de navigateur pour le refaire lui-même (il faudrait en
 * installer un sur le VPS) ; d'où ce double contrôle, sur les exports réels et sur leurs ingrédients.
 */

const MAX_EVENTS = 500
const SIX_HOURS = 6 * 3_600_000
let file = ''
let state = { events: [], checks: [], alertedAt: '' }
let deps = { getItems: () => ({ items: [] }), distDir: '', brand: () => ({}), alert: async () => {} }

export function initExportHealth(dataDir, d) {
  file = path.join(dataDir, 'export-health.json')
  deps = { ...deps, ...d }
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'))
    state = { events: s.events || [], checks: s.checks || [], alertedAt: s.alertedAt || '' }
  } catch {
    state = { events: [], checks: [], alertedAt: '' }
  }
}

const save = () => {
  if (!file) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ ...state, events: state.events.slice(-MAX_EVENTS), checks: state.checks.slice(-60) }))
  fs.renameSync(tmp, file)
}

const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)))

/** Résultat d'un export envoyé par le navigateur, réduit aux chiffres (aucun contenu) */
export function cleanEvent(body, user) {
  const format = body?.format === 'docx' ? 'docx' : 'pdf'
  const pages = num(body?.pages, 5000)
  const blank = num(body?.blank, 5000)
  const bytes = num(body?.bytes, 500_000_000)
  const error = String(body?.error || '').replace(/[^\w-]/g, '').slice(0, 40)
  // Un fichier est jugé vide s'il n'a aucune page utile ou s'il est minuscule
  const ok = !error && bytes >= 1500 && (format === 'docx' || pages - blank > 0)
  return {
    at: new Date().toISOString(),
    kind: String(body?.kind || '').replace(/[^\w-]/g, '').slice(0, 40) || 'other',
    format,
    pages,
    blank,
    bytes,
    error,
    ok,
    by: String(user?.email || '').slice(0, 160),
  }
}

/** Contrôle programmé : les ingrédients des exports sont-ils là ? */
export function runCheck(now = Date.now()) {
  const tests = []
  const add = (id, ok, detail) => tests.push({ id, ok, detail })
  try {
    const { items } = deps.getItems()
    const week = uniqueItems((items || []).filter((it) => now - Date.parse(it.date) < 7 * 86_400_000))
    const titled = week.filter((it) => String(it.title || '').trim()).length
    add('data', week.length > 0 && titled / Math.max(week.length, 1) > 0.9, `${week.length} خبر في 7 أيام، ${titled} بعنوان`)
  } catch (err) {
    add('data', false, String(err.message).slice(0, 120))
  }
  try {
    const assets = path.join(deps.distDir, 'assets')
    const guarded = fs.readdirSync(assets).some((f) => f.endsWith('.js') && fs.readFileSync(path.join(assets, f), 'utf8').includes('EMPTY_PDF'))
    add('guard', guarded, guarded ? 'فحص الصفحات الفارغة موجود في التطبيق المثبّت' : 'فحص الصفحات الفارغة غير موجود في التطبيق المثبّت')
  } catch {
    add('guard', false, 'التطبيق غير مبني (dist)')
  }
  const logo = deps.brand()?.logo || ''
  add('logo', !logo || /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]{100,}$/.test(logo), logo ? 'شعار الجهة مقروء' : 'لا يوجد شعار (اختياري)')
  const day = state.events.filter((e) => now - Date.parse(e.at) < 86_400_000)
  const bad = day.filter((e) => !e.ok)
  add('real', bad.length === 0, `${day.length} تصدير خلال 24 ساعة، ${bad.length} فارغ أو فاشل`)
  const check = { at: new Date(now).toISOString(), ok: tests.every((t) => t.ok), tests }
  state.checks.push(check)
  save()
  return check
}

async function alertIfNeeded(reason, now = Date.now()) {
  if (state.alertedAt && now - Date.parse(state.alertedAt) < SIX_HOURS) return false
  state.alertedAt = new Date(now).toISOString()
  save()
  try {
    await deps.alert(reason)
  } catch (err) {
    console.error('صحة التصدير : alerte non envoyée :', err.message)
  }
  return true
}

export function exportHealth(now = Date.now()) {
  const day = state.events.filter((e) => now - Date.parse(e.at) < 86_400_000)
  return {
    last: state.checks[state.checks.length - 1] || null,
    day: { total: day.length, failed: day.filter((e) => !e.ok).length },
    events: [...state.events].reverse().slice(0, 100),
    alertedAt: state.alertedAt,
  }
}

const alertText = (lines) => ({
  subject: 'MMS · صحة التصدير · تنبيه',
  text: lines.join('\n'),
  html: `<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Tahoma,Arial,sans-serif"><h3>تنبيه: صحة التصدير</h3><ul>${lines.map((l) => `<li>${String(l).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</li>`).join('')}</ul><p>التفاصيل في Super Admin › المصادر › صحة التصدير.</p></body></html>`,
})

export function mountExportHealth(app) {
  // Tout utilisateur connecté qui télécharge un fichier : quelques chiffres seulement
  app.post('/api/exports/check', express.json({ limit: '2kb' }), (req, res) => {
    const e = cleanEvent(req.body, req.user)
    state.events.push(e)
    save()
    if (!e.ok) alertIfNeeded(alertText([`تصدير ${e.format.toUpperCase()} فارغ أو فاشل (${e.kind}) لدى ${e.by}`, `الصفحات: ${e.pages}، الفارغة: ${e.blank}، الحجم: ${e.bytes} بايت، الخطأ: ${e.error || '—'}`]))
    res.status(204).end()
  })
}

export function startExportHealth() {
  const tick = () => {
    const c = runCheck()
    if (!c.ok) alertIfNeeded(alertText(c.tests.filter((t) => !t.ok).map((t) => `${t.id} : ${t.detail}`)))
  }
  setTimeout(tick, 60_000).unref?.()
  setInterval(tick, SIX_HOURS).unref?.()
}
