import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  type User,
} from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { usernameToEmail, validatePassword, validateUsername } from '../../lib/username'
import { createProfile, isAdminUser, loadProfile, updateProfile, type PlayerProfile } from '../../lib/users'
import { AuthContext, type AuthState, type AuthStatus } from './AuthContext'

/**
 * Holds the signed-in player for the whole app.
 *
 * Status starts at 'loading' rather than 'signed-out' so a returning player never
 * sees a flash of the sign-in screen while Firebase restores their session from
 * local storage - which is the common case, since people stay signed in between
 * rounds (REQUIREMENTS.md §3).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const adoptUser = useCallback(async (user: User | null) => {
    if (user === null) {
      setProfile(null)
      setIsAdmin(false)
      setStatus('signed-out')
      return
    }
    const [loaded, admin] = await Promise.all([loadProfile(user.uid), isAdminUser(user.uid)])
    setProfile(loaded)
    setIsAdmin(admin)
    setStatus('signed-in')
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      void adoptUser(user)
    })
  }, [adoptUser])

  const signIn = useCallback(async (username: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, usernameToEmail(username), password)
    await adoptUser(credential.user)
  }, [adoptUser])

  const signUp = useCallback(async (username: string, password: string) => {
    const validated = validateUsername(username)
    if (!validated.ok) throw new Error(validated.reason)

    const passwordCheck = validatePassword(password)
    if (!passwordCheck.ok) throw new Error(passwordCheck.reason)

    const credential = await createUserWithEmailAndPassword(
      auth,
      usernameToEmail(username),
      password,
    )

    // The profile document is what the rest of the app reads - the auth record only
    // holds the alias. Written immediately so a new player is never half-created.
    await createProfile({
      uid: credential.user.uid,
      username: validated.username,
      displayName: validated.username,
    })
    await adoptUser(credential.user)
  }, [adoptUser])

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
  }, [])

  const changePassword = useCallback(async (newPassword: string) => {
    const check = validatePassword(newPassword)
    if (!check.ok) throw new Error(check.reason)

    const user = auth.currentUser
    if (user === null) throw new Error('You are not signed in.')

    await updatePassword(user, newPassword)
    // Clear the prompt set by an admin reset.
    await updateProfile(user.uid, { mustChangePassword: false })
    setProfile((current) => (current ? { ...current, mustChangePassword: false } : current))
  }, [])

  const refresh = useCallback(async () => {
    await adoptUser(auth.currentUser)
  }, [adoptUser])

  const value = useMemo<AuthState>(
    () => ({ status, profile, isAdmin, signIn, signUp, signOut, changePassword, refresh }),
    [status, profile, isAdmin, signIn, signUp, signOut, changePassword, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
