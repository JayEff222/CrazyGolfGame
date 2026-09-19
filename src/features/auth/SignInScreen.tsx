import { useState, type FormEvent } from 'react'
import { useAuth } from './useAuth'
import { describeAuthError } from '../../lib/users'
import { PASSWORD_MIN_LENGTH } from '../../lib/username'

type Mode = 'sign-in' | 'sign-up'

/**
 * The first screen, and one that gets used standing in a car park in bright sun.
 *
 * Large controls, high contrast, and no dark theme by design - dark backgrounds
 * are harder to read outdoors, not easier (REQUIREMENTS.md §5).
 */
export function SignInScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'sign-in') {
        await signIn(username, password)
      } else {
        await signUp(username, password)
      }
    } catch (caught) {
      // A thrown Error carries our own validation message; anything else is from
      // Firebase and needs translating out of error-code speak.
      setError(caught instanceof Error && !('code' in caught) ? caught.message : describeAuthError(caught))
      setBusy(false)
    }
  }

  const switchTo = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-8 px-5 py-10">
      <header className="text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight text-fairway-700">
          CrazyGolfGame
        </h1>
        <p className="mt-2 text-base text-fairway-800">Golf scoring with a side of chaos.</p>
      </header>

      <div
        className="flex rounded-xl bg-fairway-100 p-1"
        role="tablist"
        aria-label="Sign in or create an account"
      >
        {(['sign-in', 'sign-up'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => switchTo(option)}
            className={`tap-target flex-1 rounded-lg px-4 text-base font-semibold transition ${
              mode === option
                ? 'bg-white text-fairway-800 shadow-sm'
                : 'text-fairway-700'
            }`}
          >
            {option === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="username" className="text-base font-semibold text-fairway-900">
            Username
          </label>
          <input
            id="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="tap-target rounded-xl border-2 border-fairway-200 bg-white px-4 text-fairway-900 outline-none focus:border-fairway-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-base font-semibold text-fairway-900">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            required
            className="tap-target rounded-xl border-2 border-fairway-200 bg-white px-4 text-fairway-900 outline-none focus:border-fairway-500"
          />
          {mode === 'sign-up' && (
            <p className="text-sm text-fairway-600">
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          )}
        </div>

        {error !== null && (
          <p
            role="alert"
            className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="tap-target rounded-xl bg-fairway-700 px-6 text-lg font-bold text-white transition active:bg-fairway-800 disabled:opacity-60"
        >
          {busy ? 'Just a moment…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      {/* No self-service reset exists and none can be built on the client - see
          REQUIREMENTS.md §3 - so this must not promise one. */}
      <p className="text-center text-sm text-fairway-600">
        No email needed. Your password cannot be recovered, so pick one you will remember.
      </p>
    </main>
  )
}
