import { vi } from 'vitest'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { AuthContext, type AuthState } from '../../../src/features/auth/AuthContext'
import type { PlayerProfile } from '../../../src/lib/users'

/*
 * The round screens all read the signed-in player out of the auth context. They
 * are rendered against a stub of it rather than a live Firebase session - what is
 * under test is what the player sees and what gets written, not the sign-in.
 */

export const testProfile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  uid: 'uid-jf',
  username: 'jf',
  displayName: 'JF',
  ...overrides,
})

export const stubAuth = (profile: PlayerProfile | null): AuthState => ({
  status: profile === null ? 'signed-out' : 'signed-in',
  profile,
  isAdmin: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  changePassword: vi.fn(),
  refresh: vi.fn(),
})

export function renderWithAuth(
  ui: ReactElement,
  profile: PlayerProfile | null = testProfile(),
): RenderResult {
  return render(<AuthContext.Provider value={stubAuth(profile)}>{ui}</AuthContext.Provider>)
}
