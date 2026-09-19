import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  markDecisionSeen,
  readSeenDecisions,
  unseenDecisions,
} from '../../src/features/cards/seenDecisions'
import { memoryStorage, hostileStorage } from './support/memoryStorage'

/*
 * Whether a player has been told what happened to a card they suggested.
 *
 * The failure that matters is silence: somebody writes a card, it is accepted,
 * and they never find out. So a decision has to keep showing until it is
 * dismissed, and a browser that blocks storage must show it again rather than
 * swallow it.
 */

const decided = (id: string, status: string) => ({ id, status })

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

describe('unseenDecisions', () => {
  it('shows a decision nobody has acknowledged', () => {
    const suggestions = [decided('s1', 'accepted'), decided('s2', 'rejected')]
    expect(unseenDecisions(suggestions, []).map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('ignores a suggestion still waiting on a decision', () => {
    // Nothing has happened yet, so there is nothing to announce.
    expect(unseenDecisions([decided('s1', 'pending')], [])).toEqual([])
  })

  it('drops one that has already been acknowledged', () => {
    const suggestions = [decided('s1', 'accepted'), decided('s2', 'rejected')]
    expect(unseenDecisions(suggestions, ['s1']).map((s) => s.id)).toEqual(['s2'])
  })
})

describe('remembering what has been seen', () => {
  it('starts with nothing seen', () => {
    expect(readSeenDecisions('uid-jf')).toEqual([])
  })

  it('remembers a dismissal', () => {
    markDecisionSeen('uid-jf', 's1')
    expect(readSeenDecisions('uid-jf')).toEqual(['s1'])
  })

  it('does not record the same decision twice', () => {
    markDecisionSeen('uid-jf', 's1')
    markDecisionSeen('uid-jf', 's1')
    expect(readSeenDecisions('uid-jf')).toEqual(['s1'])
  })

  it('keeps each player’s dismissals apart on a shared phone', () => {
    markDecisionSeen('uid-jf', 's1')
    markDecisionSeen('uid-dave', 's2')

    expect(readSeenDecisions('uid-jf')).toEqual(['s1'])
    expect(readSeenDecisions('uid-dave')).toEqual(['s2'])
  })

  it('trims the oldest rather than growing for the life of the phone', () => {
    for (let i = 0; i < 120; i++) markDecisionSeen('uid-jf', `s${i}`)

    const seen = readSeenDecisions('uid-jf')
    expect(seen).toHaveLength(100)
    expect(seen).toContain('s119')
    expect(seen).not.toContain('s0')
  })

  it('survives a browser that blocks storage, showing the notice again', () => {
    vi.stubGlobal('localStorage', hostileStorage())

    // Failing towards "tell them again" is the harmless direction. Failing the
    // other way means a player never learns their card was accepted.
    expect(() => markDecisionSeen('uid-jf', 's1')).not.toThrow()
    expect(readSeenDecisions('uid-jf')).toEqual([])
  })

  it('shrugs off corrupted storage rather than crashing the deck screen', () => {
    localStorage.setItem('cgg.seen-decisions.uid-jf', 'not json')
    expect(readSeenDecisions('uid-jf')).toEqual([])
  })
})
