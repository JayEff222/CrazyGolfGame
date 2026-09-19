#!/usr/bin/env node
/**
 * Verifies a transcribed scorecard against itself.
 *
 * A scorecard photo is transcribed by hand, so every number is a chance to
 * fat-finger a digit. The printed Out/In/Total rows are a checksum the club
 * already computed for us - if our per-hole numbers sum to the printed totals
 * and the stroke indexes form clean 1..18 permutations, the transcription is
 * almost certainly right. Run this whenever course data changes.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const courseId = process.argv[2] ?? 'trangie'
const path = join(here, '..', 'data', 'courses', courseId, 'scorecard.json')

const card = JSON.parse(readFileSync(path, 'utf8'))
const holes = card.holes
const sum = (arr, pick) => arr.reduce((acc, h) => acc + pick(h), 0)
const out = holes.slice(0, 9)
const back = holes.slice(9)

let failures = 0
const check = (label, got, want) => {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (expected ${want})`}`)
}

const isPermutation = (values, n) => {
  const seen = [...values].filter((v) => v != null).sort((a, b) => a - b)
  return seen.length === n && seen.every((v, i) => v === i + 1)
}

check('hole count', holes.length, card.holeCount)
check('holes numbered 1..18', isPermutation(holes.map((h) => h.number), card.holeCount), true)

for (const tee of card.tees) {
  const id = tee.id
  check(`${id} OUT metres`, sum(out, (h) => h[id].metres), tee.outMetres)
  check(`${id} IN metres`, sum(back, (h) => h[id].metres), tee.inMetres)
  check(`${id} TOTAL metres`, sum(holes, (h) => h[id].metres), tee.totalMetres)
  check(`${id} TOTAL par`, sum(holes, (h) => h[id].par), tee.totalPar)
  if (tee.outPar != null) check(`${id} OUT par`, sum(out, (h) => h[id].par), tee.outPar)
  if (tee.inPar != null) check(`${id} IN par`, sum(back, (h) => h[id].par), tee.inPar)
  check(
    `${id} stroke index is a 1..${card.holeCount} permutation`,
    isPermutation(holes.map((h) => h[id].strokeIndex), card.holeCount),
    true,
  )
}

check(
  `match index is a 1..${card.holeCount} permutation`,
  isPermutation(holes.map((h) => h.matchIndex), card.holeCount),
  true,
)

console.log(failures === 0 ? `\nOK - ${courseId} scorecard is internally consistent.` : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
