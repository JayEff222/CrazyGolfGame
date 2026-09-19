import { useEffect, useState } from 'react'
import { isAdminUser, listPlayers, type PlayerSummary } from '../../lib/users'

/*
 * T-2.4 (part) - who has an account.
 *
 * Deliberately read-only. The original task paired this list with a one-tap
 * "reset this password to 123456", which cannot be built: a password lives in
 * Firebase Auth, not Firestore, and the only API that sets another user's
 * password needs a project-admin OAuth credential. Shipping that credential in
 * a phone app would hand every player the keys to the project, so Google does
 * not allow it and neither should we. See REQUIREMENTS.md §3.
 *
 * What the list is still worth having for: nothing stops a stranger with the URL
 * creating an account (open question Q-4), and this is the only place that would
 * show one had appeared.
 */

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function joinedLabel(createdAt: number | null): string {
  // Null means the server timestamp has not come back yet, which only happens
  // moments after a signup on this very device.
  return createdAt === null ? 'Just now' : dateFormat.format(new Date(createdAt))
}

interface Loaded {
  readonly players: readonly PlayerSummary[]
  readonly admins: ReadonlySet<string>
}

export function UserListScreen() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  /* Bumping this re-runs the effect. The fetch lives in the effect rather than in
   * a handler both it and the button call, because setState on the synchronous
   * path of an effect trips react-hooks/set-state-in-effect. */
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const players = await listPlayers()
        // Admin status is a document per uid, so it is one read each. Fine for a
        // handful of mates, and it is the only way to mark who holds the keys.
        const flags = await Promise.all(players.map((player) => isAdminUser(player.uid)))
        if (!live) return
        setLoaded({
          players,
          admins: new Set(players.filter((_, index) => flags[index] === true).map((p) => p.uid)),
        })
        setError(null)
      } catch {
        if (live) setError('Could not load the players. Check your signal and try again.')
      }
    })()
    return () => {
      live = false
    }
  }, [reloadToken])

  const players = loaded?.players ?? null
  const admins = loaded?.admins ?? new Set<string>()

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-fairway-700">Players</h1>
        <p className="text-base text-fairway-800">
          {players === null ? 'Loading…' : `${players.length} account${players.length === 1 ? '' : 's'}.`}
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600">
          {error}
        </p>
      )}

      {players !== null && players.length === 0 && (
        <p className="text-base text-fairway-700">Nobody has signed up yet.</p>
      )}

      <ul className="flex flex-col gap-3">
        {(players ?? []).map((player) => (
          <li
            key={player.uid}
            className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-fairway-200"
          >
            {player.avatar === undefined ? (
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-fairway-200 font-display text-base font-bold text-fairway-800"
              >
                {(player.displayName || player.username).slice(0, 2).toUpperCase()}
              </span>
            ) : (
              <img
                src={player.avatar}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            )}

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-display text-lg font-bold text-fairway-900">
                {player.displayName}
              </span>
              <span className="truncate text-sm text-fairway-700">
                {player.username} · joined {joinedLabel(player.createdAt)}
              </span>
            </div>

            {admins.has(player.uid) && (
              <span className="shrink-0 rounded-lg bg-flag-400/30 px-2 py-1 text-sm font-bold text-fairway-900">
                Admin
              </span>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setReloadToken((token) => token + 1)}
        className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
      >
        Refresh
      </button>

      <p className="text-sm text-fairway-600">
        Forgotten passwords cannot be reset from here — see REQUIREMENTS §3.
      </p>
    </main>
  )
}
