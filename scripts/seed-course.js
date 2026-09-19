#!/usr/bin/env node
/**
 * Pushes a course from the repo's JSON into Firestore.
 *
 * Course documents are admin-only to write, and there is no service-account key in
 * this repo by design, so the script signs in as a real admin user with the client
 * SDK and writes as them. That means it is subject to exactly the same security
 * rules as the app - if the seed works, the rules genuinely permit it, rather than
 * a privileged key having quietly bypassed them.
 *
 * Usage:
 *   node scripts/seed-course.js [courseId]
 *
 * Credentials come from CGG_USERNAME / CGG_PASSWORD if set, otherwise it prompts.
 * Never hard-code them here.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, writeBatch, serverTimestamp } from 'firebase/firestore'

const here = dirname(fileURLToPath(import.meta.url))
const courseId = process.argv[2] ?? 'trangie'
const dataDir = join(here, '..', 'data', 'courses', courseId)

const firebaseConfig = {
  apiKey: 'AIzaSyCIA_H3jxAtrVMRk8T6UdfTiNybT8jcFhA',
  authDomain: 'crazygolfgame.firebaseapp.com',
  projectId: 'crazygolfgame',
  storageBucket: 'crazygolfgame.firebasestorage.app',
  messagingSenderId: '1011466376798',
  appId: '1:1011466376798:web:f8704dd194b9ce238d06cf',
}

const USERNAME_DOMAIN = 'crazygolf.invalid'

/** Prompts on the terminal, hiding the answer when it is a password. */
function ask(question, { hidden = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise((resolve) => {
    if (hidden) {
      // Suppress echo so a password is not left sitting in the scrollback.
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

const scorecard = JSON.parse(readFileSync(join(dataDir, 'scorecard.json'), 'utf8'))
const geometry = JSON.parse(readFileSync(join(dataDir, 'geometry.json'), 'utf8'))

const username = process.env.CGG_USERNAME ?? (await ask('Admin username: '))
const password = process.env.CGG_PASSWORD ?? (await ask('Password: ', { hidden: true }))

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

console.log(`\nSigning in as ${username}...`)
try {
  await signInWithEmailAndPassword(auth, `${username.toLowerCase()}@${USERNAME_DOMAIN}`, password)
} catch (error) {
  console.error(`Sign-in failed: ${error.code ?? error.message}`)
  process.exit(1)
}
console.log('Signed in.')

// Index the geometry by hole so each hole document carries its own shapes.
const byHole = new Map()
for (const feature of geometry.features) {
  if (feature.hole === null || feature.hole === undefined) continue
  const existing = byHole.get(feature.hole) ?? {}
  existing[feature.kind] = { center: feature.center, polygon: feature.polygon }
  byHole.set(feature.hole, existing)
}

const batch = writeBatch(db)

batch.set(doc(db, 'courses', courseId), {
  courseId,
  name: scorecard.name,
  club: scorecard.club ?? null,
  holeCount: scorecard.holeCount,
  units: scorecard.units,
  tees: scorecard.tees,
  ratings: scorecard.ratings ?? null,
  geometrySource: geometry.source,
  geometryLicence: geometry.licence,
  updatedAt: serverTimestamp(),
})

for (const hole of scorecard.holes) {
  const shapes = byHole.get(hole.number) ?? {}
  batch.set(doc(db, 'courses', courseId, 'holes', String(hole.number)), {
    number: hole.number,
    mens: hole.mens,
    ladies: hole.ladies,
    matchIndex: hole.matchIndex,
    // Null where OSM has no shape for this hole. Two of Trangie's greens are
    // unmapped; the course mapper fills them in.
    green: shapes.green ?? null,
    tee: shapes.tee ?? null,
    updatedAt: serverTimestamp(),
  })
}

console.log(`Writing ${scorecard.name}: 1 course + ${scorecard.holes.length} holes...`)
try {
  await batch.commit()
} catch (error) {
  if (String(error.code).includes('permission-denied')) {
    console.error('\nPermission denied. That account is not in the `admins` collection.')
    console.error('Add a document to `admins` whose ID is your user ID, then retry.')
  } else {
    console.error(`Write failed: ${error.code ?? error.message}`)
  }
  process.exit(1)
}

const mapped = scorecard.holes.filter((h) => byHole.get(h.number)?.green).length
console.log(`\nDone. ${mapped} of ${scorecard.holes.length} holes have a mapped green.`)
if (mapped < scorecard.holes.length) {
  console.log('The rest need the admin course mapper (T-1.5) before they can show a yardage.')
}
process.exit(0)
