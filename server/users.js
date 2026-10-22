import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { hashPassword, initAuth, writeUsers } from './auth.js'
import fs from 'node:fs'

/**
 * Gestion des comptes MMS en ligne de commande (le mot de passe est demandé, jamais passé en argument) :
 *   node server/users.js list
 *   node server/users.js add <email> [nom affiché]
 *   node server/users.js remove <email>
 */

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const file = path.join(dataDir, 'users.json')
initAuth(dataDir)
const users = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).users : []
const [cmd, email, ...rest] = process.argv.slice(2)

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a))))
}

if (cmd === 'list') {
  for (const u of users) console.log(`${u.email}\t${u.name || ''}`)
} else if (cmd === 'add' && email) {
  const password = await ask('Mot de passe : ')
  if (password.length < 8) throw new Error('Mot de passe trop court (8 caractères minimum)')
  const others = users.filter((u) => u.email.toLowerCase() !== email.toLowerCase())
  writeUsers([...others, { email, username: email, name: rest.join(' ') || email, ...hashPassword(password) }])
  console.log(`Compte enregistré : ${email}`)
} else if (cmd === 'remove' && email) {
  writeUsers(users.filter((u) => u.email.toLowerCase() !== email.toLowerCase()))
  console.log(`Compte supprimé : ${email}`)
} else {
  console.log('Usage : node server/users.js list | add <email> [nom] | remove <email>')
}
