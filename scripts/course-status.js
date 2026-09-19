#!/usr/bin/env node
/**
 * Reports what geometry a course actually has, and checks it against the scorecard.
 *
 * The same cross-check the mapper shows on screen, but runnable from a terminal so
 * the state of the data can be confirmed without reading it off a phone. Signs in
 * as a real user, so it sees exactly what the app sees.
 *
 * Usage: node scripts/course-status.js [courseId]
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const here = dirname(fileURLToPath(import.meta.url))
const courseId = process.argv[2] ?? 'trangie'

const firebaseConfig = {
  apiKey: 'AIzaSyCIA_H3jxAtrVMRk8T6UdfTiNybT8jcFhA',
  authDomain: 'crazygolfgame.firebaseapp.com',
  projectId: 'crazygolfgame',
  storageBucket: 'crazygolfgame.firebasestorage.app',
  messagingSenderId: '1011466376798',
  appId: '1:1011466376798:web:f8704dd194b9ce238d06cf',
}

const USERNAME_DOMAIN = 'crazygolf.invalid'
const TOLERANCE_M = 25
const EARTH_RADIUS_M = 6_371_008.8

const toRadians = (d) => (d * Math.PI) / 180
function distanceMetres(a, b) {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat))
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

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

const scorecard = JSON.parse(
  readFileSync(join(here, '..', 'data', 'courses', courseId, 'scorecard.json'), 'utf8'),
)

const username = process.env.CGG_USERNAME ?? (await ask('Username: '))
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
const snapshot = await getDocs(collection(db, 'courses', courseId, 'holes'))
const holes = snapshot.docs.map((d) => d.data()).sort((a, b) => a.number - b.number)

console.log(`\n${scorecard.name} — ${holes.length} holes\n`)
console.log('Hole  Green  Tee   Card    Mapped   Diff   ')
console.log('────  ─────  ────  ──────  ───────  ───────')

const missingGreen = []
const missingTee = []
const suspect = []

for (const hole of holes) {
  const card = hole.mens?.metres ?? scorecard.holes.find((h) => h.number === hole.number)?.mens.metres
  const hasGreen = Boolean(hole.green?.center)
  const hasTee = Boolean(hole.tee?.center)
  if (!hasGreen) missingGreen.push(hole.number)
  if (!hasTee) missingTee.push(hole.number)

  let mapped = null
  let diff = null
  if (hasGreen && hasTee) {
    mapped = Math.round(distanceMetres(hole.tee.center, hole.green.center))
    diff = mapped - card
    if (Math.abs(diff) > TOLERANCE_M) suspect.push({ hole: hole.number, card, mapped, diff })
  }

  const flag = diff !== null && Math.abs(diff) > TOLERANCE_M ? '  <-- CHECK' : ''
  console.log(
    String(hole.number).padStart(4) +
      '  ' + (hasGreen ? ' yes ' : ' NO  ') +
      '  ' + (hasTee ? 'yes ' : 'NO  ') +
      '  ' + String(card ?? '?').padStart(4) + 'm' +
      '  ' + (mapped === null ? '     —' : String(mapped).padStart(5) + 'm') +
      '  ' + (diff === null ? '     —' : (diff > 0 ? '+' : '') + String(diff) + 'm').padStart(7) +
      flag,
  )
}

console.log('')
console.log(`Greens mapped: ${holes.length - missingGreen.length}/${holes.length}` +
  (missingGreen.length ? `  — missing on hole(s) ${missingGreen.join(', ')}` : ''))
console.log(`Tees mapped:   ${holes.length - missingTee.length}/${holes.length}` +
  (missingTee.length ? `  — missing on hole(s) ${missingTee.join(', ')}` : ''))

if (suspect.length > 0) {
  console.log(`\n${suspect.length} hole(s) more than ${TOLERANCE_M} m from the card — likely mis-tapped:`)
  for (const s of suspect) console.log(`  hole ${s.hole}: card ${s.card} m, mapped ${s.mapped} m (${s.diff > 0 ? '+' : ''}${s.diff} m)`)
} else if (missingGreen.length === 0 && missingTee.length === 0) {
  console.log('\nAll holes mapped and every distance agrees with the scorecard.')
}

process.exit(0)
