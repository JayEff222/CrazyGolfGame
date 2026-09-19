#!/usr/bin/env node
/**
 * Pushes the starter deck into Firestore.
 *
 * Cards are admin-only to write, so this signs in as a real admin with the client
 * SDK and writes through the same security rules the app uses - no service account,
 * no privileged bypass.
 *
 * Safe to re-run: it writes each card by id, so re-seeding updates the catalogue
 * rather than duplicating it. It does NOT delete cards that have been added in the
 * app, because losing a card someone wrote on a tee box would be worse than
 * leaving a stale one behind.
 *
 * Usage: node scripts/seed-cards.js
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, writeBatch, deleteField, serverTimestamp } from 'firebase/firestore'

const here = dirname(fileURLToPath(import.meta.url))

const firebaseConfig = {
  apiKey: 'AIzaSyCIA_H3jxAtrVMRk8T6UdfTiNybT8jcFhA',
  authDomain: 'crazygolfgame.firebaseapp.com',
  projectId: 'crazygolfgame',
  storageBucket: 'crazygolfgame.firebasestorage.app',
  messagingSenderId: '1011466376798',
  appId: '1:1011466376798:web:f8704dd194b9ce238d06cf',
}

const USERNAME_DOMAIN = 'crazygolf.invalid'

function ask(question, { hidden = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise((resolve) => {
    if (hidden) {
      const onData = (char) => {
        if (['\n', '\r', ''].includes(char.toString())) process.stdin.removeListener('data', onData)
        else process.stdout.write('[2K[200D' + question + '*'.repeat(rl.line.length))
      }
      process.stdin.on('data', onData)
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

const deck = JSON.parse(readFileSync(join(here, '..', 'data', 'cards', 'starter-deck.json'), 'utf8'))

const username = process.env.CGG_USERNAME ?? (await ask('Admin username: '))
const password = process.env.CGG_PASSWORD ?? (await ask('Password: ', { hidden: true }))

const app = initializeApp(firebaseConfig)
try {
  await signInWithEmailAndPassword(
    getAuth(app),
    `${username.toLowerCase()}@${USERNAME_DOMAIN}`,
    password,
  )
} catch (error) {
  console.error(`Sign-in failed: ${error.code ?? error.message}`)
  process.exit(1)
}

const db = getFirestore(app)
const batch = writeBatch(db)

for (const card of deck.cards) {
  batch.set(
    doc(db, 'cards', card.id),
    {
      title: card.title,
      effect: card.effect,
      category: card.category,
      timing: card.timing,
      target: card.target,
      active: card.active,
      // Never null: zod's .optional() rejects null, so a null here made the card
      // unreadable and it vanished from the app. Absent means absent.
      notes: card.notes ?? deleteField(),
      deckVersion: deck.version,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

console.log(`\nWriting ${deck.cards.length} cards (deck v${deck.version})...`)
try {
  await batch.commit()
} catch (error) {
  if (String(error.code).includes('permission-denied')) {
    console.error('\nPermission denied. That account is not in the `admins` collection.')
  } else {
    console.error(`Write failed: ${error.code ?? error.message}`)
  }
  process.exit(1)
}

const byCategory = deck.cards.reduce((acc, c) => ({ ...acc, [c.category]: (acc[c.category] ?? 0) + 1 }), {})
console.log('\nDone.')
for (const [category, count] of Object.entries(byCategory)) console.log(`  ${category}: ${count}`)
process.exit(0)
