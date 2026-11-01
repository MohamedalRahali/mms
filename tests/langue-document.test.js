import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Langue du document : arabe par défaut (était « fr »), puis celle choisie dans l'application */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('index.html : langue du document en arabe', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  assert.match(html, /<html lang="ar">/)
})

test('App.tsx : la langue du document suit la langue choisie', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')
  assert.match(app, /document\.documentElement\.lang = lang/)
})
