import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

/** Étape du code 2FA : le bouton « رجوع » de la carte claire était écrit en clair sur clair (contraste ≈ 1:1) */

test('carte de connexion : bouton secondaire lisible (couleur d’encre de la carte)', () => {
  const css = fs.readFileSync(new URL('../src/brand.css', import.meta.url), 'utf8')
  assert.match(css, /\.mms-login__card \.news-btn--ghost \{\s*color: var\(--p-ink-l\);/)
})
