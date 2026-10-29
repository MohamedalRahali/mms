import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanEvent, exportHealth, initExportHealth, runCheck } from '../server/exportHealth.js'

test('صحة التصدير : un export vide ou minuscule est signalé, jamais de contenu gardé', () => {
  assert.equal(cleanEvent({ format: 'pdf', pages: 28, blank: 28, bytes: 0, error: 'EMPTY_PDF' }, { email: 'a@x.test' }).ok, false)
  assert.equal(cleanEvent({ format: 'pdf', pages: 88, blank: 0, bytes: 900_000 }).ok, true)
  assert.equal(cleanEvent({ format: 'docx', bytes: 200 }).ok, false)
  const e = cleanEvent({ format: 'pdf', pages: 3, bytes: 5000, kind: 'news<script>', text: 'contenu secret' })
  assert.equal(e.kind, 'newsscript')
  assert.ok(!JSON.stringify(e).includes('contenu secret'))
})

test('contrôle programmé : données, contrôle des pages blanches, logo et exports réels', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exh-'))
  const dist = path.join(dir, 'dist')
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(dist, 'assets', 'a.js'), 'x')
  const now = Date.now()
  const items = [{ id: '1', title: 'خبر', url: 'https://a/1', date: new Date(now - 3600e3).toISOString() }]
  initExportHealth(dir, { getItems: () => ({ items }), distDir: dist, brand: () => ({ logo: '' }) })
  let c = runCheck(now)
  assert.equal(c.tests.find((t) => t.id === 'data').ok, true)
  assert.equal(c.tests.find((t) => t.id === 'guard').ok, false)
  assert.equal(c.ok, false)
  fs.writeFileSync(path.join(dist, 'assets', 'b.js'), "throw new Error('EMPTY_PDF')")
  c = runCheck(now)
  assert.equal(c.ok, true)
  assert.equal(exportHealth(now).last.ok, true)
  // Aucune actualité récente : l'export serait vide
  initExportHealth(fs.mkdtempSync(path.join(os.tmpdir(), 'exh-')), { getItems: () => ({ items: [] }), distDir: dist, brand: () => ({}) })
  assert.equal(runCheck(now).tests.find((t) => t.id === 'data').ok, false)
})
