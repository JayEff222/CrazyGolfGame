import { useState } from 'react'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/useAuth'
import { SignInScreen } from '../features/auth/SignInScreen'

function Loading() {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <p className="text-lg font-semibold text-fairway-700">Loading…</p>
    </main>
  )
}

/**
 * Placeholder for the signed-in app. Replaced in Phase 3 by the round lifecycle.
 */
/**
 * Shows the player's user ID with a copy button.
 *
 * Firebase IDs mix O/0, I/l/1 and are 28 characters long, so transcribing one by
 * eye is a coin flip. A wrong character fails silently - the admin document simply
 * never matches - so the ID must be copyable, never typed.
 */
function UserIdCard({ uid }: { uid: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uid)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused (insecure context, permissions). The ID is
      // still selectable on screen, so this is a convenience, not the only route.
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-fairway-100 px-4 py-4">
      <p className="text-sm font-semibold text-fairway-800">Your user ID</p>
      <code className="font-mono text-sm break-all text-fairway-900 select-all">{uid}</code>
      <button
        type="button"
        onClick={() => void copy()}
        className="tap-target rounded-lg bg-fairway-700 px-4 text-base font-semibold text-white active:bg-fairway-800"
      >
        {copied ? 'Copied' : 'Copy user ID'}
      </button>
      <p className="text-sm text-fairway-700">
        Don&apos;t retype this — it mixes characters that look alike. Copy it.
      </p>
    </div>
  )
}

function Clubhouse() {
  const { profile, signOut } = useAuth()

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 py-10">
      <h1 className="font-display text-3xl font-bold text-fairway-700">
        G&apos;day, {profile?.displayName ?? 'golfer'}
      </h1>
      <p className="text-fairway-800">
        You&apos;re signed in. Rounds, scoring and cards land in the next phases.
      </p>
      {profile !== null && <UserIdCard uid={profile.uid} />}
      <button
        type="button"
        onClick={() => void signOut()}
        className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
      >
        Sign out
      </button>
    </main>
  )
}

function Gate() {
  const { status } = useAuth()

  if (status === 'loading') return <Loading />
  if (status === 'signed-out') return <SignInScreen />
  return <Clubhouse />
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
