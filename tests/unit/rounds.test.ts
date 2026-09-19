import { describe, it, expect } from 'vitest'
import {
  byNewestJoin,
  generateRoomCode,
  normaliseRoomCode,
  ROOM_CODE_LENGTH,
  type PlayerRoundRef,
} from '../../src/lib/rounds'

/*
 * The pure parts of the round library. The Firestore wrappers around them are
 * exercised through the screens that use them; what is worth proving directly is
 * the ordering rule behind round history and the room-code alphabet, both of
 * which have exact right answers.
 */

const ref = (overrides: Partial<PlayerRoundRef> = {}): PlayerRoundRef => ({
  roundId: 'round-1',
  courseId: 'trangie',
  teeId: 'mens',
  roomCode: 'PQ4T',
  joinedAt: 1000,
  ...overrides,
})

describe('byNewestJoin', () => {
  it('puts the most recent round at the top of the history', () => {
    const older = ref({ roundId: 'older', joinedAt: 1000 })
    const newer = ref({ roundId: 'newer', joinedAt: 5000 })

    expect([older, newer].sort(byNewestJoin)).toEqual([newer, older])
  })

  it('sorts a round joined seconds ago to the very top', () => {
    // joinedAt is null until the server timestamp settles, which only happens
    // moments after joining - so it is the newest round, not the oldest.
    const settled = ref({ roundId: 'settled', joinedAt: 9_999_999 })
    const joining = ref({ roundId: 'joining', joinedAt: null })

    expect([settled, joining].sort(byNewestJoin)).toEqual([joining, settled])
  })

  it('breaks a tie deterministically so history does not reshuffle itself', () => {
    const bravo = ref({ roundId: 'bravo', joinedAt: 1000 })
    const alpha = ref({ roundId: 'alpha', joinedAt: 1000 })

    expect([bravo, alpha].sort(byNewestJoin)).toEqual([alpha, bravo])
  })
})

describe('room codes', () => {
  it('avoids characters that get misread across a fairway', () => {
    // O/0, I/1/L and S/5 are all out - a room code gets shouted, not typed.
    const codes = Array.from({ length: 200 }, () => generateRoomCode())
    expect(codes.join('')).not.toMatch(/[OIL015S]/)
  })

  it('is always the agreed length', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH)
  })

  it('is deterministic when the randomness is', () => {
    expect(generateRoomCode(() => 0)).toBe('A'.repeat(ROOM_CODE_LENGTH))
  })

  it('forgives however somebody types the code back', () => {
    expect(normaliseRoomCode('  pq4t ')).toBe('PQ4T')
    expect(normaliseRoomCode('p q 4 t')).toBe('PQ4T')
  })
})
