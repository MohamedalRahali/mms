import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Rapport exécutif sans canal (ni SMTP avec destinataires, ni Telegram) : refus immédiat, sans rédaction par l'IA */

test('rapport exécutif : NO_CHANNEL tout de suite quand aucun canal n’est prêt', async () => {
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
  const { setBriefingConf, startBriefing, sendBriefing } = await import('../server/briefing.js')
  startBriefing(fs.mkdtempSync(path.join(os.tmpdir(), 'mms-brief-canal-')))
  setBriefingConf({ enabled: false, weekday: 7, hour: 7, days: 7, recipients: 'direction@example.org' })
  const t0 = Date.now()
  await assert.rejects(sendBriefing(), (err) => err.code === 'NO_CHANNEL')
  assert.ok(Date.now() - t0 < 2000, 'refus sans attendre le moteur d’IA')
})

test('rapport exécutif : le canal est vérifié avant la rédaction par l’IA', () => {
  const src = fs.readFileSync(new URL('../server/briefing.js', import.meta.url), 'utf8')
  const body = src.slice(src.indexOf('export async function sendBriefing'))
  assert.ok(body.indexOf("code: 'NO_CHANNEL'") < body.indexOf('briefingWithSummary('))
})
