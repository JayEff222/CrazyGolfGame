import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { describeAuthError, updateProfile } from '../../lib/users'
import { PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH } from '../../lib/username'
import { resizeToAvatar } from '../../lib/avatar'

/*
 * T-2.3 - the player's own profile.
 *
 * Three independent things live here (photo, display name, password) and each
 * saves on its own. One big Save covering all three would mean a failed password
 * change silently discarding a new photo, and the three have completely different
 * failure modes - one hits the canvas, one hits Firestore, one hits Firebase Auth.
 *
 * Form state is tagged with the uid it was seeded from and staleness is resolved
 * on read. Seeding it from an effect would trip react-hooks/set-state-in-effect,
 * and would also quietly overwrite half-typed input the moment the profile
 * refreshed underneath it.
 */

type Saving = 'idle' | 'photo' | 'name' | 'password'

interface Draft {
  readonly uid: string
  readonly displayName: string
}

export function ProfileScreen({ onDone }: { onDone?: () => void }) {
  const { profile, changePassword, refresh } = useAuth()
  const fileInput = useRef<HTMLInputElement>(null)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState<Saving>('idle')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  if (profile === null) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
        <p className="text-lg font-semibold text-fairway-900">Sign in to see your profile.</p>
      </main>
    )
  }

  // A draft belonging to a different account is somebody else's half-typed name.
  const displayName = draft !== null && draft.uid === profile.uid ? draft.displayName : profile.displayName

  const announce = (message: string) => {
    setSaved(message)
    setError(null)
  }

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Clearing the input means picking the same file twice still fires a change,
    // which matters when the first attempt failed and they are retrying.
    event.target.value = ''
    if (file === undefined) return

    setSaving('photo')
    setError(null)
    setSaved(null)
    try {
      const result = await resizeToAvatar(file)
      if (!result.ok) {
        setError(result.reason)
        return
      }
      await updateProfile(profile.uid, { avatar: result.dataUri })
      await refresh()
      announce('Photo saved.')
    } catch {
      setError('Could not save that photo. Check your signal and try again.')
    } finally {
      setSaving('idle')
    }
  }

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = displayName.trim()
    if (trimmed.length === 0) {
      setError('Your name cannot be blank.')
      return
    }

    setSaving('name')
    setError(null)
    setSaved(null)
    try {
      await updateProfile(profile.uid, { displayName: trimmed })
      await refresh()
      setDraft({ uid: profile.uid, displayName: trimmed })
      announce('Name saved.')
    } catch {
      setError('Could not save your name. Check your signal and try again.')
    } finally {
      setSaving('idle')
    }
  }

  const savePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirmation) {
      setError('Those two passwords do not match.')
      return
    }

    setSaving('password')
    setError(null)
    setSaved(null)
    try {
      await changePassword(password)
      setPassword('')
      setConfirmation('')
      announce('Password changed.')
    } catch (caught) {
      // Our own validation throws a plain Error; Firebase throws one with a code.
      // Notably auth/requires-recent-login, which is a real outcome here: someone
      // signed in days ago has to sign out and back in before Firebase will let
      // them set a new password.
      setError(
        caught instanceof Error && !('code' in caught)
          ? caught.message
          : describeAuthError(caught),
      )
    } finally {
      setSaving('idle')
    }
  }

  const initials = (profile.displayName || profile.username).slice(0, 2).toUpperCase()

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-7 px-5 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-fairway-700">Your profile</h1>
        <p className="text-base text-fairway-800">Signed in as {profile.username}.</p>
      </header>

      {profile.mustChangePassword === true && (
        <p
          role="status"
          className="rounded-xl bg-flag-400/25 px-4 py-3 text-base font-medium text-fairway-900 ring-2 ring-flag-500"
        >
          Your password was reset for you. Pick your own below.
        </p>
      )}

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600">
          {error}
        </p>
      )}
      {saved !== null && (
        <p role="status" className="rounded-xl bg-fairway-100 px-4 py-3 text-base font-medium text-fairway-800">
          {saved}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold text-fairway-900">Photo</h2>
        <div className="flex items-center gap-4">
          {profile.avatar === undefined ? (
            <span
              aria-hidden="true"
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-fairway-200 font-display text-2xl font-bold text-fairway-800"
            >
              {initials}
            </span>
          ) : (
            <img
              src={profile.avatar}
              alt="Your profile photo"
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          )}
          <div className="flex flex-1 flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={saving === 'photo'}
              className="tap-target rounded-xl border-2 border-fairway-600 px-4 text-base font-bold text-fairway-800 disabled:opacity-60"
            >
              {saving === 'photo' ? 'Shrinking…' : profile.avatar === undefined ? 'Add a photo' : 'Change photo'}
            </button>
            <p className="text-sm text-fairway-600">Shrunk on your phone before it is saved.</p>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={(event) => void pickPhoto(event)}
          className="sr-only"
          aria-label="Choose a profile photo"
        />
      </section>

      <form onSubmit={(event) => void saveName(event)} className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold text-fairway-900">Name</h2>
        <label htmlFor="displayName" className="text-base font-semibold text-fairway-900">
          What the others see on the leaderboard
        </label>
        <input
          id="displayName"
          value={displayName}
          maxLength={USERNAME_MAX_LENGTH}
          onChange={(event) => setDraft({ uid: profile.uid, displayName: event.target.value })}
          className="tap-target rounded-xl border-2 border-fairway-200 bg-white px-4 text-fairway-900 outline-none focus:border-fairway-500"
        />
        <button
          type="submit"
          disabled={saving === 'name'}
          className="tap-target rounded-xl bg-fairway-700 px-6 text-base font-bold text-white active:bg-fairway-800 disabled:opacity-60"
        >
          {saving === 'name' ? 'Saving…' : 'Save name'}
        </button>
      </form>

      <form onSubmit={(event) => void savePassword(event)} className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold text-fairway-900">Password</h2>
        <label htmlFor="newPassword" className="text-base font-semibold text-fairway-900">
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="tap-target rounded-xl border-2 border-fairway-200 bg-white px-4 text-fairway-900 outline-none focus:border-fairway-500"
        />
        <label htmlFor="confirmPassword" className="text-base font-semibold text-fairway-900">
          Type it again
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="tap-target rounded-xl border-2 border-fairway-200 bg-white px-4 text-fairway-900 outline-none focus:border-fairway-500"
        />
        <p className="text-sm text-fairway-600">At least {PASSWORD_MIN_LENGTH} characters.</p>
        <button
          type="submit"
          disabled={saving === 'password' || password.length === 0}
          className="tap-target rounded-xl bg-fairway-700 px-6 text-base font-bold text-white active:bg-fairway-800 disabled:opacity-60"
        >
          {saving === 'password' ? 'Changing…' : 'Change password'}
        </button>
      </form>

      {onDone !== undefined && (
        <button
          type="button"
          onClick={onDone}
          className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
        >
          Done
        </button>
      )}
    </main>
  )
}
