import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  loadMyInvites,
  setInviteStatus,
  type RoundInvite,
} from '../../lib/roundInvites'
import { joinRound, loadRound } from '../../lib/rounds'
import { readPlayersOnce } from '../rounds/roundsData'
import { decideJoin } from '../rounds/roundRules'

/*
 * Invitations waiting on this player, on the screen they come to in order to play.
 *
 * Accepting runs `decideJoin` first - the same guards the room-code path uses -
 * rather than a second, subtly different set. An invitation is not a skeleton
 * key: a round that filled up, started, or finished while the invite sat there
 * has to refuse it with the same message anyone else would get.
 *
 * The invite is only marked accepted once the join has actually succeeded.
 * Marking it first would clear it off this screen with nothing to show for it.
 */

export function RoundInvites({ onJoined }: { onJoined: (roundId: string) => void }) {
  const { profile } = useAuth()
  const uid = profile?.uid ?? ''

  const [invites, setInvites] = useState<{ uid: string; list: RoundInvite[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (uid === '') return
    let live = true

    void loadMyInvites(uid)
      .then((list) => {
        if (live) setInvites({ uid, list })
      })
      .catch(() => {
        // An invitation that cannot be loaded is not worth an error on the screen
        // somebody came to in order to start a round. The room code still works.
        if (live) setInvites({ uid, list: [] })
      })

    return () => {
      live = false
    }
  }, [uid, reloadToken])

  const list = invites !== null && invites.uid === uid ? invites.list : []
  if (list.length === 0) return null

  const accept = async (invite: RoundInvite) => {
    setBusyId(invite.id)
    setError(null)
    try {
      const round = await loadRound(invite.roundId)
      const players = round === null ? [] : await readPlayersOnce(invite.roundId)
      const decision = decideJoin(round, players, uid)

      if (decision.kind === 'blocked') {
        setError(decision.message)
        return
      }

      if (decision.kind === 'join') {
        await joinRound(invite.roundId, {
          uid,
          displayName: profile?.displayName ?? 'Player',
          ...(profile?.avatar === undefined ? {} : { avatar: profile.avatar }),
        })
      }

      // Only now that they are genuinely in the round.
      await setInviteStatus(invite.roundId, uid, 'accepted')
      onJoined(invite.roundId)
    } catch {
      setError('Could not join that round. Check your signal and try again.')
    } finally {
      setBusyId(null)
    }
  }

  const decline = async (invite: RoundInvite) => {
    setBusyId(invite.id)
    setError(null)
    try {
      await setInviteStatus(invite.roundId, uid, 'declined')
      setReloadToken((token) => token + 1)
    } catch {
      setError('That did not save. Check your signal and try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-bold text-fairway-900">
        {list.length === 1 ? 'You have been invited' : `${list.length} invitations`}
      </h2>

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600">
          {error}
        </p>
      )}

      {list.map((invite) => (
        <div
          key={invite.id}
          className="flex flex-col gap-3 rounded-2xl bg-flag-400/20 p-4 ring-2 ring-flag-500"
        >
          <p className="text-base text-fairway-900">
            <span className="font-bold">{invite.fromName}</span> wants you in their round.
          </p>
          <p className="text-base text-fairway-800">
            Room code <span className="font-display font-bold">{invite.roomCode}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busyId === invite.id}
              onClick={() => void accept(invite)}
              className="tap-target flex-1 rounded-xl bg-fairway-700 px-4 text-lg font-bold text-white active:bg-fairway-800 disabled:opacity-60"
            >
              {busyId === invite.id ? 'Joining…' : 'Join'}
            </button>
            <button
              type="button"
              disabled={busyId === invite.id}
              onClick={() => void decline(invite)}
              className="tap-target flex-1 rounded-xl border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-800 disabled:opacity-60"
            >
              No thanks
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}
