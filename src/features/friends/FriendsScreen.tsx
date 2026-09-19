import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { listPlayers, type PlayerSummary } from '../../lib/users'
import {
  acceptFriendRequest,
  incomingRequests,
  loadFriendships,
  matchPlayers,
  relationshipWith,
  removeFriendship,
  sendFriendRequest,
  type Friendship,
} from '../../lib/friends'
import { PlayerRow } from '../../components/PlayerRow'

/*
 * Finding people and befriending them.
 *
 * Searching happens over the loaded list rather than in Firestore, because the
 * requirement is "anyone containing that username" and Firestore only does
 * prefix ranges. That is a deliberate trade for an app with a handful of
 * accounts - see matchPlayers in lib/friends.ts. It also makes the empty box
 * behave as asked: no filter means everybody.
 *
 * Requests waiting on this player sit above the search, because answering one is
 * the only thing on this screen that somebody else is blocked on.
 */

interface Loaded {
  readonly players: readonly PlayerSummary[]
  readonly friendships: readonly Friendship[]
}

export function FriendsScreen() {
  const { profile } = useAuth()
  const uid = profile?.uid ?? ''

  const [loaded, setLoaded] = useState<{ uid: string; data: Loaded } | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (uid === '') return
    let live = true

    void (async () => {
      try {
        const [players, friendships] = await Promise.all([listPlayers(), loadFriendships(uid)])
        if (!live) return
        setLoaded({ uid, data: { players, friendships } })
        setError(null)
      } catch {
        if (live) setError('Could not load the players. Check your signal and try again.')
      }
    })()

    return () => {
      live = false
    }
  }, [uid, reloadToken])

  if (profile === null) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
        <p className="text-lg font-semibold text-fairway-900">Sign in to find your mates.</p>
      </main>
    )
  }

  // Data belonging to a different account is the previous player's.
  const data = loaded !== null && loaded.uid === uid ? loaded.data : null
  const friendships = data?.friendships ?? []
  const byUid = new Map((data?.players ?? []).map((player) => [player.uid, player]))

  const act = async (otherUid: string, action: () => Promise<void>) => {
    setBusyUid(otherUid)
    setError(null)
    try {
      await action()
      setReloadToken((token) => token + 1)
    } catch {
      setError('That did not save. Check your signal and try again.')
    } finally {
      setBusyUid(null)
    }
  }

  const incoming = incomingRequests(friendships, uid)
  // Yourself is never a search result - there is nothing to do with you.
  const results = matchPlayers(data?.players ?? [], search).filter((p) => p.uid !== uid)

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-fairway-700">Mates</h1>
        <p className="text-base text-fairway-800">
          Find people, add them, then invite them to a round.
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600">
          {error}
        </p>
      )}

      {incoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold text-fairway-900">
            Waiting on you ({incoming.length})
          </h2>
          {incoming.map((request) => {
            const otherUid = request.requestedBy
            const player = byUid.get(otherUid)
            return (
              <PlayerRow
                key={request.id}
                displayName={player?.displayName ?? 'Someone'}
                username={player?.username ?? otherUid}
                avatar={player?.avatar}
                highlight
              >
                <button
                  type="button"
                  disabled={busyUid === otherUid}
                  onClick={() => void act(otherUid, () => acceptFriendRequest(uid, otherUid))}
                  className="tap-target rounded-xl bg-fairway-700 px-4 text-base font-bold text-white active:bg-fairway-800 disabled:opacity-60"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={busyUid === otherUid}
                  onClick={() => void act(otherUid, () => removeFriendship(uid, otherUid))}
                  className="tap-target rounded-xl border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-800 disabled:opacity-60"
                >
                  Ignore
                </button>
              </PlayerRow>
            )
          })}
        </section>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="friend-search" className="text-base font-semibold text-fairway-900">
          Search
        </label>
        <input
          id="friend-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Leave blank to see everyone"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="tap-target rounded-xl border-2 border-fairway-200 bg-white px-4 text-fairway-900 outline-none focus:border-fairway-500"
        />
      </div>

      {data === null && error === null && (
        <p className="text-base text-fairway-700">Looking up the players…</p>
      )}

      {data !== null && results.length === 0 && (
        <p className="rounded-xl bg-fairway-100 px-4 py-4 text-base text-fairway-800">
          {search.trim() === ''
            ? 'Nobody else has an account yet.'
            : `Nobody matching “${search.trim()}”.`}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {results.map((player) => {
          const relationship = relationshipWith(friendships, uid, player.uid)
          const busy = busyUid === player.uid

          return (
            <li key={player.uid}>
              <PlayerRow
                displayName={player.displayName}
                username={player.username}
                avatar={player.avatar}
              >
                {relationship.kind === 'none' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(player.uid, () => sendFriendRequest(uid, player.uid))}
                    className="tap-target rounded-xl bg-fairway-700 px-4 text-base font-bold text-white active:bg-fairway-800 disabled:opacity-60"
                  >
                    Add
                  </button>
                )}

                {relationship.kind === 'requested' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(player.uid, () => removeFriendship(uid, player.uid))}
                    className="tap-target rounded-xl border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-700 disabled:opacity-60"
                  >
                    Asked — cancel
                  </button>
                )}

                {relationship.kind === 'incoming' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(player.uid, () => acceptFriendRequest(uid, player.uid))}
                    className="tap-target rounded-xl bg-flag-500 px-4 text-base font-bold text-fairway-900 disabled:opacity-60"
                  >
                    Accept
                  </button>
                )}

                {relationship.kind === 'friends' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(player.uid, () => removeFriendship(uid, player.uid))}
                    className="tap-target rounded-xl border-2 border-fairway-600 px-4 text-base font-bold text-fairway-800 disabled:opacity-60"
                  >
                    Mates ✓
                  </button>
                )}
              </PlayerRow>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
