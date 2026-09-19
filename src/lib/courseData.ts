import { collection, doc, getDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { courseGeometrySchema, type CourseGeometry, type CourseFeature } from './course'
import type { LatLng } from './geo'

/**
 * Loads the raw OpenStreetMap shapes for a course.
 *
 * Served as a static file rather than bundled or stored in Firestore: only the
 * admin course mapper needs the full polygons, so there is no reason to put 40 KB
 * of coordinates in every player's JavaScript.
 */
export async function loadGeometry(courseId: string): Promise<CourseGeometry> {
  const response = await fetch(`/courses/${courseId}/geometry.json`)
  if (!response.ok) {
    throw new Error(`No geometry for ${courseId} (HTTP ${response.status})`)
  }
  return courseGeometrySchema.parse(await response.json())
}

/** A hole as stored in Firestore, including whatever geometry has been assigned. */
export interface StoredHole {
  readonly number: number
  readonly mens: { metres: number; par: number; strokeIndex: number }
  readonly ladies: { metres: number; par: number; strokeIndex: number }
  readonly green: { center: LatLng; polygon: LatLng[] } | null
  readonly tee: { center: LatLng; polygon: LatLng[] } | null
}

export interface StoredCourse {
  readonly courseId: string
  readonly name: string
  readonly holeCount: number
}

export async function loadCourse(courseId: string): Promise<StoredCourse | null> {
  const snapshot = await getDoc(doc(db, 'courses', courseId))
  if (!snapshot.exists()) return null
  const data = snapshot.data()
  return {
    courseId,
    name: String(data.name ?? courseId),
    holeCount: Number(data.holeCount ?? 18),
  }
}

export async function loadHoles(courseId: string): Promise<StoredHole[]> {
  const snapshot = await getDocs(collection(db, 'courses', courseId, 'holes'))
  const holes = snapshot.docs.map((d) => d.data() as unknown as StoredHole)
  return holes.sort((a, b) => a.number - b.number)
}

/** Which feature, if any, a player has assigned to each hole. */
export type Assignment = Record<number, { green?: CourseFeature; tee?: CourseFeature }>

/**
 * Writes assigned green and tee shapes onto the hole documents.
 *
 * Only geometry is touched — par, metres and stroke index come from the scorecard
 * and are never overwritten here, so a mis-tap on the map can't corrupt the card.
 */
export async function saveAssignments(courseId: string, assignment: Assignment): Promise<void> {
  const batch = writeBatch(db)

  for (const [holeNumber, shapes] of Object.entries(assignment)) {
    const ref = doc(db, 'courses', courseId, 'holes', holeNumber)
    batch.set(
      ref,
      {
        green: shapes.green
          ? { center: shapes.green.center, polygon: shapes.green.polygon, osmId: shapes.green.osmId }
          : null,
        tee: shapes.tee
          ? { center: shapes.tee.center, polygon: shapes.tee.polygon, osmId: shapes.tee.osmId }
          : null,
        geometryUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  await batch.commit()
}
