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
  readonly green: MappedShape | null
  readonly tee: MappedShape | null
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

/**
 * A green or tee that has been tied to a hole.
 *
 * `polygon` is empty for a hand-placed pin. Two of Trangie's greens and one tee are
 * simply absent from OpenStreetMap, so they get a point dropped on the satellite
 * image instead of a traced shape. A centre is all the yardage needs; the polygon
 * only ever made the map prettier.
 */
export interface MappedShape {
  readonly center: LatLng
  readonly polygon: LatLng[]
  readonly osmId: string
  /** True when a human dropped this pin rather than OSM supplying the shape. */
  readonly manual?: boolean
}

export const toMappedShape = (feature: CourseFeature): MappedShape => ({
  center: feature.center,
  polygon: feature.polygon,
  osmId: feature.osmId,
})

/** A hand-dropped pin. The id records where it came from and which hole it is for. */
export const manualShape = (kind: 'green' | 'tee', hole: number, center: LatLng): MappedShape => ({
  center,
  polygon: [],
  osmId: `manual:${kind}:${hole}`,
  manual: true,
})

/** Which shape, if any, has been assigned to each hole. */
export type Assignment = Record<number, { green?: MappedShape; tee?: MappedShape }>

/**
 * Writes assigned green and tee shapes onto the hole documents.
 *
 * Only geometry is touched — par, metres and stroke index come from the scorecard
 * and are never overwritten here, so a mis-tap on the map can't corrupt the card.
 */
export async function saveAssignments(courseId: string, assignment: Assignment): Promise<void> {
  const batch = writeBatch(db)

  const encode = (shape: MappedShape | undefined) =>
    shape
      ? {
          center: shape.center,
          polygon: shape.polygon,
          osmId: shape.osmId,
          manual: shape.manual === true,
        }
      : null

  for (const [holeNumber, shapes] of Object.entries(assignment)) {
    const ref = doc(db, 'courses', courseId, 'holes', holeNumber)
    batch.set(
      ref,
      {
        green: encode(shapes.green),
        tee: encode(shapes.tee),
        geometryUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  await batch.commit()
}
