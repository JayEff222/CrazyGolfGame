import { describe, it, expect } from 'vitest'
import { applyVote, nextVote, voteId, EMPTY_TALLY } from '../../src/lib/cardVotes'

/*
 * The tally arithmetic behind the thumbs.
 *
 * Worth proving directly because the screen updates on tap rather than after a
 * round trip, so this is what the player actually sees — and switching a vote
 * from up to down has to move two counters, not one.
 */

describe('nextVote', () => {
  it('casts a vote when none is held', () => {
    expect(nextVote(null, 'up')).toBe('up')
    expect(nextVote(null, 'down')).toBe('down')
  })

  it('switches sides when the other thumb is tapped', () => {
    expect(nextVote('up', 'down')).toBe('down')
    expect(nextVote('down', 'up')).toBe('up')
  })

  it('clears the vote when the same thumb is tapped again', () => {
    // Tapping thumbs-up twice almost always means "actually, no opinion" rather
    // than "yes, twice" — and there is nowhere else to put an un-vote.
    expect(nextVote('up', 'up')).toBeNull()
    expect(nextVote('down', 'down')).toBeNull()
  })
})

describe('applyVote', () => {
  it('adds a first vote', () => {
    expect(applyVote({ up: 3, down: 1, mine: null }, 'up')).toEqual({ up: 4, down: 1, mine: 'up' })
  })

  it('moves both counters when a vote switches sides', () => {
    // The bug this guards: incrementing down without decrementing up, which
    // would let one player count twice on a tally everybody can see.
    expect(applyVote({ up: 4, down: 1, mine: 'up' }, 'down')).toEqual({
      up: 3,
      down: 2,
      mine: 'down',
    })
  })

  it('removes the vote when it is cleared', () => {
    expect(applyVote({ up: 4, down: 1, mine: 'up' }, null)).toEqual({
      up: 3,
      down: 1,
      mine: null,
    })
  })

  it('leaves other players’ votes alone', () => {
    const crowded = { up: 9, down: 4, mine: null } as const
    expect(applyVote(crowded, 'down')).toEqual({ up: 9, down: 5, mine: 'down' })
  })

  it('never goes negative from an empty tally', () => {
    expect(applyVote(EMPTY_TALLY, null)).toEqual({ up: 0, down: 0, mine: null })
  })

  it('round-trips: vote, switch, switch back, clear', () => {
    let tally = EMPTY_TALLY
    tally = applyVote(tally, 'up')
    tally = applyVote(tally, 'down')
    tally = applyVote(tally, 'up')
    tally = applyVote(tally, null)
    expect(tally).toEqual({ up: 0, down: 0, mine: null })
  })
})

describe('voteId', () => {
  it('encodes one vote per player per card into the path', () => {
    // The security rules check the document id against the voter, so this shape
    // is what makes "you cannot vote twice, or as someone else" structural.
    expect(voteId('the-string', 'uid-jf')).toBe('the-string_uid-jf')
  })
})
