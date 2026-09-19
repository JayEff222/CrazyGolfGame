import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { listPlayers, type PlayerSummary } from '../../lib/users'
import { friendUids, loadFriendships } from '../../lib/friends'
import {
  cancelRoundInvite,
  loadInvitesForRound,
  sendRoundInvite,
  type RoundInvite,
} from '../../lib/roundInvites'
import { MAX_PLAYERS, type Round, type RoundPlayer } from '../../lib/rounds'
import { PlayerRow } from '../../components/PlayerRow'

/*
 * Inviting mates into a round, from the lobby.
 *
 * Only friends are listed. That is a UI decision rather than a rule: anybody
 * holding the four-character room code can already walk in, so enforcing
 * friendship on invitations would be stricter than the front door and would
 * achieve nothing (see lib/roundInvites.ts).
 *
 * Somebody already in the round is shown as in, not invitable - the commonest
 * mistake here would be inviting the player standing next to you who joined by
 * code thirty seconds ago.
 */

interface Loaded {
  readonly friends: readonly PlayerSummary[]
  readonly invites: readonly RoundInvite[]
}

export function InviteFriendsPanel({
  round,
  players,
}: {
  readonly round: Round
  readonly players: readonly RoundPlayer[]
}) {
  const { profile } = useAuth()
  const uid = profile?.uid ?? ''

  const [loaded, setLoaded] = useState<{ roundId: string; data: Loaded } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (uid === '') return
    let live = true

    void (async () => {
      try {
        const [everyone, friendships, invites] = await Promise.all([
          listPlayers(),
          loadFriendships(uid),
          loadInvitesForRound(round.id),
        ])
        if (!live) return
        const mine = new Set(friendUids(friendships, uid))
        setLoaded({
          roundId: round.id,
          data: { friends: everyone.filter((p) => mine.has(p.uid)), invites },
        })
        setError(null)
      } catch {
        if (live) setError('Could not load your mates. Check your signal.')
      }
    })()

    return () => {
      live = false
    }
  }, [uid, round.id, reloadToken])

  const data = loaded !== null && loaded.roundId === round.id ? loaded.data : null

  const act = async (targetUid: string, action: () => Promise<void>) => {
    setBusyUid(targetUid)
    setError(null)
    try {
      await action()
      setReloadToken((token) => token + 1)
    } catch {
      setError('That did not send. Check your signal and try again.')
    } finally {
      setBusyUid(null)
    }
  }

  const inRound = new Set(players.map((player) => player.uid))
  const invitedTo = new Map(
    (data?.invites ?? []).filter((i) => i.status === 'pending').map((i) => [i.toUid, i]),
  )
  const full = players.length >= MAX_PLAYERS

  if (data !== null && data.friends.length === 0) {
    return (
      <p className="text-base text-fairway-700">
        No mates yet. Add some from the clubhouse and they will show up here.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600">
          {error}
        </p>
      )}

      {full && (
        <p className="rounded-xl bg-fairway-100 px-4 py-3 text-base text-fairway-800">
          The round is full at {MAX_PLAYERS}. Somebody has to leave before anyone else joins.
        </p>
      )}

      {data === null && error === null && (
        <p className="text-base text-fairway-700">Looking up your mates…</p>
      )}

      {(data?.friends ?? []).map((friend) => {
        const already = inRound.has(friend.uid)
        const invited = invitedTo.get(friend.uid)
        const busy = busyUid === friend.uid

        return (
          <PlayerRow
            key={friend.uid}
            displayName={friend.displayName}
            username={friend.username}
            avatar={friend.avatar}
          >
            {already ? (
              <span className="rounded-lg bg-fairway-100 px-3 py-2 text-base font-bold text-fairway-800">
                In
              </span>
            ) : invited !== undefined ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(friend.uid, () => cancelRoundInvite(round.id, friend.uid))}
                className="tap-target rounded-xl border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-700 disabled:opacity-60"
              >
                Invited — undo
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || full}
                onClick={() =>
                  void act(friend.uid, () =>
                    sendRoundInvite({
                      roundId: round.id,
                      toUid: friend.uid,
                      fromUid: uid,
                      fromName: profile?.displayName ?? 'Someone',
                      roomCode: round.roomCode,
                      courseId: round.courseId,
                    }),
                  )
                }
                className="tap-target rounded-xl bg-fairway-700 px-4 text-base font-bold text-white active:bg-fairway-800 disabled:opacity-60"
              >
                Invite
              </button>
            )}
          </PlayerRow>
        )
      })}
    </div>
  )
}
