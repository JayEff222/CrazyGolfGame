import { describe, it, expect } from 'vitest'
import {
  chooseEncoded,
  dataUriMimeType,
  fitDimensions,
  withinBudget,
  MAX_AVATAR_CHARS,
  MAX_AVATAR_DIMENSION,
} from '../../src/lib/avatar'

describe('fitDimensions', () => {
  it('leaves an image that already fits alone', () => {
    expect(fitDimensions({ width: 64, height: 48 })).toEqual({ width: 64, height: 48 })
  })

  it('shrinks a landscape photo to the cap on its long edge', () => {
    expect(fitDimensions({ width: 4000, height: 3000 })).toEqual({
      width: MAX_AVATAR_DIMENSION,
      height: 96,
    })
  })

  it('shrinks a portrait photo on its long edge, not its width', () => {
    expect(fitDimensions({ width: 3000, height: 4000 })).toEqual({
      width: 96,
      height: MAX_AVATAR_DIMENSION,
    })
  })

  it('keeps the aspect ratio of a square', () => {
    const fitted = fitDimensions({ width: 2000, height: 2000 })
    expect(fitted).toEqual({ width: MAX_AVATAR_DIMENSION, height: MAX_AVATAR_DIMENSION })
  })

  it('never upscales — a tiny avatar stays tiny rather than gaining blur', () => {
    expect(fitDimensions({ width: 12, height: 8 })).toEqual({ width: 12, height: 8 })
  })

  it('keeps at least one pixel on the short edge of an extreme panorama', () => {
    // 4000x3 scaled by 128/4000 puts the height at 0.096, which rounds to zero -
    // and a zero-height canvas throws rather than producing a silly avatar.
    const fitted = fitDimensions({ width: 4000, height: 3 })
    expect(fitted.width).toBe(MAX_AVATAR_DIMENSION)
    expect(fitted.height).toBe(1)
  })

  it('treats a zero-sized image as having nothing to draw', () => {
    expect(fitDimensions({ width: 0, height: 100 })).toEqual({ width: 0, height: 0 })
    expect(fitDimensions({ width: -10, height: -10 })).toEqual({ width: 0, height: 0 })
  })

  it('honours a caller-supplied cap', () => {
    expect(fitDimensions({ width: 800, height: 400 }, 40)).toEqual({ width: 40, height: 20 })
  })
})

describe('dataUriMimeType', () => {
  it('reads the type out of a base64 data URI', () => {
    expect(dataUriMimeType('data:image/webp;base64,AAAA')).toBe('image/webp')
  })

  it('reads the type when there are no parameters', () => {
    expect(dataUriMimeType('data:image/png,AAAA')).toBe('image/png')
  })

  it('lower-cases, so a browser shouting the type still matches', () => {
    expect(dataUriMimeType('data:IMAGE/WEBP;base64,AAAA')).toBe('image/webp')
  })

  it('returns null for anything that is not a data URI', () => {
    expect(dataUriMimeType('https://example.test/a.png')).toBeNull()
    expect(dataUriMimeType('')).toBeNull()
  })
})

describe('withinBudget', () => {
  it('accepts a realistic small avatar', () => {
    expect(withinBudget(`data:image/webp;base64,${'A'.repeat(4000)}`)).toBe(true)
  })

  it('rejects one that would eat the user document', () => {
    expect(withinBudget('A'.repeat(MAX_AVATAR_CHARS + 1))).toBe(false)
  })

  it('accepts exactly the budget', () => {
    expect(withinBudget('A'.repeat(MAX_AVATAR_CHARS))).toBe(true)
  })
})

describe('chooseEncoded', () => {
  const small = `data:image/webp;base64,${'A'.repeat(100)}`
  const medium = `data:image/jpeg;base64,${'A'.repeat(500)}`
  const huge = `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_CHARS)}`

  it('takes the first candidate that fits, preserving the preference order', () => {
    expect(chooseEncoded([small, medium])).toBe(small)
  })

  it('skips an encoding the browser refused, marked as an empty string', () => {
    // This is the WebP-unsupported case: toDataURL quietly returned a PNG, the
    // caller discarded it, and JPEG has to carry the day.
    expect(chooseEncoded(['', medium])).toBe(medium)
  })

  it('falls back to the smallest when nothing fits, so the caller can report a size', () => {
    const bigger = `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_CHARS + 500)}`
    expect(chooseEncoded([bigger, huge])).toBe(huge)
  })

  it('returns null when every encoding was refused', () => {
    expect(chooseEncoded(['', '', ''])).toBeNull()
    expect(chooseEncoded([])).toBeNull()
  })
})
