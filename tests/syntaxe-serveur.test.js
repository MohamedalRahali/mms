import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Chaque fichier du serveur se lit sans erreur de syntaxe (users.js était cassé par un retour à la ligne dans une chaîne) */

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server')

test('fichiers du serveur : syntaxe valide (node --check)', () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
  assert.ok(files.length > 10)
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', path.join(dir, f)], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${f} : ${r.stderr}`)
  }
})

test('users.js list : la ligne de commande des comptes démarre', () => {
  const r = spawnSync(process.execPath, [path.join(dir, 'users.js'), 'list'], { encoding: 'utf8', env: { ...process.env, MMS_DATA_DIR: fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'mms-users-')) } })
  assert.doesNotMatch(r.stderr, /SyntaxError/)
})
