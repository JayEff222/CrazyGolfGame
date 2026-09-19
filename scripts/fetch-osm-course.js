#!/usr/bin/env node
/**
 * Re-pulls a course's geometry from OpenStreetMap via the Overpass API.
 *
 * OSM gives us green and tee polygons for free, but it does NOT tell us which
 * polygon belongs to which hole - nobody has tagged them. This script fetches
 * the raw shapes and computes a centroid for each; assigning them to holes is
 * done by a human in the admin course mapper (task T-1.5).
 *
 * Usage: node scripts/fetch-osm-course.js [courseId]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const COURSES = {
  trangie: { lat: -32.0394, lon: 147.9733, radius: 3000, name: 'Trangie Golf Course' },
}

const courseId = process.argv[2] ?? 'trangie'
const course = COURSES[courseId]
if (!course) {
  console.error(`Unknown course "${courseId}". Known: ${Object.keys(COURSES).join(', ')}`)
  process.exit(1)
}

const query = `
[out:json][timeout:90];
(
  way["leisure"="golf_course"](around:${course.radius},${course.lat},${course.lon});
  way["golf"](around:${course.radius},${course.lat},${course.lon});
  node["golf"](around:${course.radius},${course.lat},${course.lon});
);
out tags geom;
`

/** Centroid of a closed way. Good enough for a green - they are small and convex. */
const centroid = (geometry) => ({
  lat: geometry.reduce((s, p) => s + p.lat, 0) / geometry.length,
  lng: geometry.reduce((s, p) => s + p.lon, 0) / geometry.length,
})

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'CrazyGolfGame/0.1 (personal project)',
  },
  body: new URLSearchParams({ data: query }),
})

if (!res.ok) {
  console.error(`Overpass returned ${res.status} ${res.statusText}`)
  process.exit(1)
}

const raw = await res.json()
const outDir = join(here, '..', 'data', 'courses', courseId)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'osm-raw.json'), JSON.stringify(raw, null, 2))

const features = raw.elements
  .filter((el) => el.tags?.golf && el.geometry?.length)
  .map((el) => ({
    osmId: `${el.type}/${el.id}`,
    kind: el.tags.golf,
    center: centroid(el.geometry),
    polygon: el.geometry.map((p) => ({ lat: p.lat, lng: p.lon })),
    hole: null, // assigned by a human in the admin course mapper
  }))

writeFileSync(
  join(outDir, 'geometry.json'),
  JSON.stringify(
    {
      $comment:
        'Green and tee shapes from OpenStreetMap (ODbL). "hole" is null until assigned in the admin course mapper - OSM carries no hole numbering for this course.',
      courseId,
      name: course.name,
      fetchedAt: new Date().toISOString(),
      source: 'OpenStreetMap contributors via Overpass API',
      licence: 'ODbL',
      features,
    },
    null,
    2,
  ),
)

const counts = features.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {})
console.log(`${course.name}:`)
for (const [kind, n] of Object.entries(counts)) console.log(`  ${kind}: ${n}`)
console.log(`\nWrote ${features.length} features to data/courses/${courseId}/geometry.json`)
