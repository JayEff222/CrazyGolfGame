import { createContext } from 'react'
import type { PlayerProfile } from '../../lib/users'

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in'

export interface AuthState {
  readonly status: AuthStatus
  readonly profile: PlayerProfile | null
  /** True when this user has a document in the admins collection. */
  readonly isAdmin: boolean
  readonly signIn: (username: string, password: string) => Promise<void>
  readonly signUp: (username: string, password: string) => Promise<void>
  readonly signOut: () => Promise<void>
  readonly changePassword: (newPassword: string) => Promise<void>
  readonly refresh: () => Promise<void>
}

/*
 * The context lives apart from the provider so the provider file exports only a
 * component. React Fast Refresh cannot hot-reload a file that mixes the two, and
 * losing app state on every save while building the scoring screens would be a
 * daily irritation.
 */
export const AuthContext = createContext<AuthState | null>(null)
