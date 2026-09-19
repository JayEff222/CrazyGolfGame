import { describe, it, expect } from 'vitest'
import {
  friendUids,
  incomingRequests,
  matchPlayers,
  otherMember,
  pairId,
  pairMembers,
  relationshipWith,
  type Friendship,
} from '../../src/lib/friends'

/*
 * The friendship maths.
 *
 * All of it rests on one property: a pair of players always maps to the same
 * document, whoever asked first. Lose that and you get two documents for one
 * friendship, sitting "friends" one way and "pending" the other, which is the
 * classic way this feature rots.
 */

const JF = 'uid-jf'
const DAVE = 'uid-dave'
const BAZ = 'uid-zaz'

const friendship = (a: string, b: string, overrides: Partial<Friendship> = {}): Friendship => ({
  id: pairId(a, b),
  members: pairMembers(a, b),
  requestedBy: a,
  status: 'pending',
  at: 1000,
  ...overrides,
})

describe('pairId', () => {
  it('is the same document whoever asked first', () => {
    // The whole feature depends on this one line.
    expect(pairId(JF, DAVE)).toBe(pairId(DAVE, JF))
  })

  it('sorts the two uids, so the id is predictable', () => {
    expect(pairId('b', 'a')).toBe('a_b')
    expect(pairId('a', 'b')).toBe('a_b')
  })

  it('agrees with the members array it is built from', () => {
    const members = pairMembers(DAVE, JF)
    expect(pairId(DAVE, JF)).toBe(`${members[0]}_${members[1]}`)
    // The security rules check exactly this, so the two must not drift apart.
    expect(members[0] < members[1]).toBe(true)
  })
})

describe('relationshipWith', () => {
  it('offers nothing when there is no connection', () => {
    expect(relationshipWith([], JF, DAVE)).toEqual({ kind: 'none' })
  })

  it('never offers to befriend yourself', () => {
    expect(relationshipWith([], JF, JF)).toEqual({ kind: 'self' })
  })

  it('knows when you are waiting on them', () => {
    const asked = friendship(JF, DAVE, { requestedBy: JF })
    expect(relationshipWith([asked], JF, DAVE)).toEqual({ kind: 'requested' })
  })

  it('knows when they are waiting on you', () => {
    const asked = friendship(JF, DAVE, { requestedBy: DAVE })
    expect(relationshipWith([asked], JF, DAVE)).toEqual({ kind: 'incoming' })
  })

  it('reads the same from either side of the pair', () => {
    const asked = friendship(JF, DAVE, { requestedBy: JF })
    expect(relationshipWith([asked], JF, DAVE)).toEqual({ kind: 'requested' })
    expect(relationshipWith([asked], DAVE, JF)).toEqual({ kind: 'incoming' })
  })

  it('reports an accepted friendship', () => {
    const friends = friendship(JF, DAVE, { status: 'accepted' })
    expect(relationshipWith([friends], JF, DAVE)).toEqual({ kind: 'friends' })
    expect(relationshipWith([friends], DAVE, JF)).toEqual({ kind: 'friends' })
  })

  it('does not confuse one friendship with another', () => {
    const withDave = friendship(JF, DAVE, { status: 'accepted' })
    expect(relationshipWith([withDave], JF, BAZ)).toEqual({ kind: 'none' })
  })
})

describe('otherMember', () => {
  it('finds the other half from either side', () => {
    const pair = friendship(JF, DAVE)
    expect(otherMember(pair, JF)).toBe(DAVE)
    expect(otherMember(pair, DAVE)).toBe(JF)
  })
})

describe('friendUids', () => {
  it('lists only accepted friendships', () => {
    const friendships = [
      friendship(JF, DAVE, { status: 'accepted' }),
      friendship(JF, BAZ, { status: 'pending' }),
    ]
    expect(friendUids(friendships, JF)).toEqual([DAVE])
  })

  it('is empty for somebody with no friends yet', () => {
    expect(friendUids([], JF)).toEqual([])
  })
})

describe('incomingRequests', () => {
  it('shows only requests waiting on you to answer', () => {
    const friendships = [
      friendship(JF, DAVE, { requestedBy: DAVE }), // waiting on JF
      friendship(JF, BAZ, { requestedBy: JF }), // waiting on Baz
      friendship(JF, 'uid-other', { requestedBy: 'uid-other', status: 'accepted' }),
    ]
    const incoming = incomingRequests(friendships, JF)
    expect(incoming).toHaveLength(1)
    expect(incoming[0]!.requestedBy).toBe(DAVE)
  })
})

describe('matchPlayers', () => {
  const players = [
    { username: 'jayeff', displayName: 'JF' },
    { username: 'dave', displayName: 'Big Dave' },
    { username: 'steve', displayName: 'Stevo' },
  ]

  it('lists everyone when nothing has been typed', () => {
    // Explicitly asked for: an empty box is not a filter.
    expect(matchPlayers(players, '')).toHaveLength(3)
    expect(matchPlayers(players, '   ')).toHaveLength(3)
  })

  it('matches anywhere in the username, not just the start', () => {
    // Firestore can only do prefix ranges, which is why this happens in memory.
    expect(matchPlayers(players, 'eff').map((p) => p.username)).toEqual(['jayeff'])
    expect(matchPlayers(players, 'ave').map((p) => p.username)).toEqual(['dave'])
  })

  it('ignores case, because nobody types their mate’s name carefully', () => {
    expect(matchPlayers(players, 'JAYEFF').map((p) => p.username)).toEqual(['jayeff'])
  })

  it('matches the display name too', () => {
    expect(matchPlayers(players, 'Big').map((p) => p.username)).toEqual(['dave'])
  })

  it('returns nobody when nothing matches, rather than everybody', () => {
    expect(matchPlayers(players, 'zzz')).toEqual([])
  })

  it('can match more than one player', () => {
    expect(matchPlayers(players, 'e')).toHaveLength(3)
  })
})
