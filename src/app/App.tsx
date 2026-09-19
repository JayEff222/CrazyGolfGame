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
      <p className="rounded-xl bg-fairway-100 px-4 py-3 text-sm text-fairway-800">
        Your user ID is <code className="font-mono break-all">{profile?.uid}</code>
        <br />
        JF needs this to make you an admin.
      </p>
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
