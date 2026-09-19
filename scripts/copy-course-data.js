#!/usr/bin/env node
/**
 * Copies course geometry into public/ so the app can fetch it at runtime.
 *
 * The polygons are only needed by the admin course mapper, so they are served as a
 * static file rather than bundled into every player's JavaScript or stored in
 * Firestore. `data/` stays the source of truth; `public/` is generated.
 */
import { readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dataRoot = join(here, '..', 'data', 'courses')
const publicRoot = join(here, '..', 'public', 'courses')

for (const courseId of readdirSync(dataRoot)) {
  const source = join(dataRoot, courseId, 'geometry.json')
  if (!existsSync(source)) continue
  const destDir = join(publicRoot, courseId)
  mkdirSync(destDir, { recursive: true })
  copyFileSync(source, join(destDir, 'geometry.json'))
  console.log(`copied ${courseId}/geometry.json -> public/courses/${courseId}/`)
}
