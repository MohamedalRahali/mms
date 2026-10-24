import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { hashPassword } from './auth.js'

/**
 * Crée ou remplace le compte Super Admin, sur le serveur uniquement :
 *   cd /opt/mms && sudo -u mms node server/superadmin-setup.js && sudo systemctl restart mms
 * Demande l'identifiant et le mot de passe (jamais affiché), puis écrit dans .env :
 *   SUPERADMIN_USER, SUPERADMIN_PASSWORD_HASH (scrypt, jamais le mot de passe) et une nouvelle SUPERADMIN_TOKEN_KEY.
 * La nouvelle clé ferme toute session Super Admin ouverte.
 */

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')

function ask(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : '')
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(a.trim())
    }),
  )
}

const user = await ask('Identifiant Super Admin : ')
if (!/^[\w.@-]{3,60}$/.test(user)) {
  console.error('Identifiant invalide (3 à 60 caractères : lettres, chiffres, . _ - @)')
  process.exit(1)
}
const password = await ask('Mot de passe (12 caractères minimum) : ', true)
if (password.length < 12) {
  console.error('Mot de passe trop court : 12 caractères minimum')
  process.exit(1)
}
if ((await ask('Retapez le mot de passe : ', true)) !== password) {
  console.error('Les deux mots de passe ne correspondent pas')
  process.exit(1)
}

const { salt, hash } = hashPassword(password)
const values = { SUPERADMIN_USER: user, SUPERADMIN_PASSWORD_HASH: `${salt}:${hash}`, SUPERADMIN_TOKEN_KEY: crypto.randomBytes(32).toString('hex') }
let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : ''
for (const [k, v] of Object.entries(values)) {
  const line = `${k}=${v}`
  text = new RegExp(`^${k}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${k}=.*$`, 'm'), line) : `${text.replace(/\n?$/, '\n')}${line}\n`
}
fs.writeFileSync(envFile, text, { mode: 0o600 })
console.log(`Compte Super Admin enregistré pour « ${user} ». Redémarrez MMS : sudo systemctl restart mms`)
