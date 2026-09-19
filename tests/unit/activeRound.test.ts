import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  forgetActiveRound,
  recallActiveRound,
  rememberActiveRound,
} from '../../src/features/rounds/activeRound'
import { hostileStorage, memoryStorage } from './support/memoryStorage'

/*
 * What the device remembers so a flat battery is not the end of a round. It is a
 * convenience, so every one of these has to fail quietly rather than take the app
 * down with it.
 */

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('activeRound', () => {
  it('remembers and gives back a round', () => {
    rememberActiveRound('uid-jf', 'round-1')
    expect(recallActiveRound('uid-jf')).toBe('round-1')
  })

  it('keeps each player’s round separate on a shared phone', () => {
    rememberActiveRound('uid-jf', 'round-1')
    expect(recallActiveRound('uid-dave')).toBeNull()
  })

  it('forgets on request', () => {
    rememberActiveRound('uid-jf', 'round-1')
    forgetActiveRound('uid-jf')
    expect(recallActiveRound('uid-jf')).toBeNull()
  })

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', hostileStorage())

    expect(() => rememberActiveRound('uid-jf', 'round-1')).not.toThrow()
    expect(() => forgetActiveRound('uid-jf')).not.toThrow()
    expect(recallActiveRound('uid-jf')).toBeNull()
  })
})
