/*
 * Profile photos, resized on the phone that took them.
 *
 * REQUIREMENTS.md §6: Cloud Storage needs the paid Blaze plan, so an avatar is
 * stored as a data URI inside the user document. That makes the size budget a
 * hard correctness concern rather than a nicety - a Firestore document is capped
 * at 1 MiB, and a modern phone camera produces a 4 MB JPEG. Anything that reaches
 * Firestore has to be shrunk first, and shrunk here, on the client.
 *
 * The maths is separated from the canvas work so the awkward part - what a
 * portrait photo becomes, what an already-small image becomes - can be proved
 * without a DOM.
 */

/** Avatars render at 40-64 px; 128 covers that on a 2x screen with nothing spare. */
export const MAX_AVATAR_DIMENSION = 128

/**
 * Ceiling for the stored data URI, in characters.
 *
 * A 128 px WebP lands around 3-5 KB. 48 KB is roughly ten times that, so it is
 * generous for an awkward image while still leaving the 1 MiB document almost
 * entirely to the rest of the profile.
 */
export const MAX_AVATAR_CHARS = 48_000

export interface Dimensions {
  readonly width: number
  readonly height: number
}

/**
 * Scales an image to fit a square box without distorting it.
 *
 * Only ever shrinks. Upscaling a small avatar would cost bytes to add blur, and a
 * 32 px photo that stays 32 px is fine on screen.
 */
export function fitDimensions(
  source: Dimensions,
  max: number = MAX_AVATAR_DIMENSION,
): Dimensions {
  const { width, height } = source
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }

  const longest = Math.max(width, height)
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) }

  const scale = max / longest
  // At least 1 px on the short edge: a 4000x3 panorama must not round to zero,
  // which would make the canvas throw rather than produce a silly-looking avatar.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Whether a produced data URI is small enough to put in the user document. */
export function withinBudget(dataUri: string, max: number = MAX_AVATAR_CHARS): boolean {
  return dataUri.length <= max
}

/** The image format a data URI actually came back as, or null if it isn't one. */
export function dataUriMimeType(dataUri: string): string | null {
  const match = /^data:([^;,]+)[;,]/.exec(dataUri)
  return match === null ? null : match[1]!.toLowerCase()
}

/*
 * Encoding order.
 *
 * WebP is roughly a third the size of JPEG at the same quality, so it is tried
 * first. But canvas.toDataURL does not report an unsupported type - it silently
 * returns a PNG instead, which for a photograph is far larger than either. So the
 * result is checked against the type that was asked for, and JPEG is the fallback
 * rather than whatever the browser felt like handing back.
 */
const ENCODINGS: readonly { readonly type: string; readonly quality: number }[] = [
  { type: 'image/webp', quality: 0.8 },
  { type: 'image/jpeg', quality: 0.8 },
  { type: 'image/jpeg', quality: 0.6 },
]

/**
 * Picks the first encoding that came back as the format requested and fits the
 * budget, falling back to the smallest thing produced.
 *
 * Exported for testing: the selection rule is the part worth proving, and it can
 * be exercised with plain strings instead of a canvas.
 */
export function chooseEncoded(candidates: readonly string[]): string | null {
  const usable = candidates.filter((uri) => uri.length > 0)
  if (usable.length === 0) return null

  for (const uri of usable) {
    if (withinBudget(uri)) return uri
  }
  // Nothing fit. Hand back the smallest so the caller can report a real size
  // rather than a vague failure.
  return usable.reduce((best, uri) => (uri.length < best.length ? uri : best))
}

export type AvatarResult =
  | { readonly ok: true; readonly dataUri: string }
  | { readonly ok: false; readonly reason: string }

/**
 * Turns a chosen file into a small square-ish data URI ready to store.
 *
 * Draws to a canvas rather than trusting CSS to scale on display: the point is to
 * shrink the bytes that reach Firestore, not just the pixels that reach the eye.
 */
export async function resizeToAvatar(file: Blob): Promise<AvatarResult> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, reason: 'That file is not an image.' }
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, reason: 'That image could not be read. Try another one.' }
  }

  try {
    const size = fitDimensions({ width: bitmap.width, height: bitmap.height })
    if (size.width === 0 || size.height === 0) {
      return { ok: false, reason: 'That image has no size to it.' }
    }

    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height

    const context = canvas.getContext('2d')
    if (context === null) {
      return { ok: false, reason: 'This browser could not resize the image.' }
    }
    context.drawImage(bitmap, 0, 0, size.width, size.height)

    const candidates = ENCODINGS.map(({ type, quality }) => {
      const uri = canvas.toDataURL(type, quality)
      // Silent PNG fallback: discard it, the next encoding is a better bet.
      return dataUriMimeType(uri) === type ? uri : ''
    })

    const chosen = chooseEncoded(candidates)
    if (chosen === null) {
      return { ok: false, reason: 'This browser could not resize the image.' }
    }
    if (!withinBudget(chosen)) {
      return { ok: false, reason: 'That photo is too detailed to store. Try a simpler one.' }
    }
    return { ok: true, dataUri: chosen }
  } finally {
    // Frees the decoded frame immediately rather than waiting for a GC that may
    // not come before the next photo is picked.
    bitmap.close()
  }
}
