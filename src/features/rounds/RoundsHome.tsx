import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { loadRound, type Round } from '../../lib/rounds'
import { forgetActiveRound, recallActiveRound } from './activeRound'
import { CreateRoundScreen } from './CreateRoundScreen'
import { JoinRoundScreen } from './JoinRoundScreen'
import { LobbyScreen } from './LobbyScreen'
import { RoundInvites } from '../friends'

type View =
  | { readonly name: 'home' }
  | { readonly name: 'create' }
  | { readonly name: 'join' }
  | { readonly name: 'round'; readonly roundId: string }

/**
 * The one entry point for the round lifecycle (T-3.1 to T-3.5).
 *
 * Screen choice is local state rather than a router. A round is a single sitting
 * on one device, and the only link anyone shares is the room code - read aloud,
 * not tapped - so there is nothing here that needs a URL yet.
 */
export function RoundsHome() {
  const { status, profile } = useAuth()
  const uid = profile?.uid ?? ''
  const [view, setView] = useState<View>({ name: 'home' })
  const [resumable, setResumable] = useState<Round | null>(null)

  const atHome = view.name === 'home'

  /*
   * T-3.5 - the dead phone.
   *
   * The device remembers the last round this player was in; the round itself is
   * re-read from Firestore before it is offered, so a round that finished while
   * the phone was flat does not come back as a stale invitation.
   */
  useEffect(() => {
    if (uid === '' || !atHome) return
    const roundId = recallActiveRound(uid)

    let live = true
    // Nothing remembered still resolves, so the "no round to rejoin" answer takes
    // the same path as a round that has since finished.
    void (roundId === null ? Promise.resolve(null) : loadRound(roundId))
      .then((round) => {
        if (!live) return
        if (round === null || round.status === 'complete') {
          if (roundId !== null) forgetActiveRound(uid)
          setResumable(null)
          return
        }
        setResumable(round)
      })
      .catch(() => {
        // Offline with nothing cached. The room code still works.
        if (live) setResumable(null)
      })
    return () => {
      live = false
    }
  }, [uid, atHome])

  const goHome = useCallback(() => setView({ name: 'home' }), [])

  if (status === 'loading') {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <p className="text-lg font-semibold text-fairway-700">Loading…</p>
      </main>
    )
  }

  if (profile === null) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
        <p className="text-lg font-semibold text-fairway-900">Sign in to start a round.</p>
      </main>
    )
  }

  if (view.name === 'create') {
    return (
      <CreateRoundScreen
        onCreated={(roundId) => setView({ name: 'round', roundId })}
        onCancel={goHome}
      />
    )
  }

  if (view.name === 'join') {
    return (
      <JoinRoundScreen
        onJoined={(roundId) => setView({ name: 'round', roundId })}
        onCancel={goHome}
      />
    )
  }

  if (view.name === 'round') {
    return <LobbyScreen roundId={view.roundId} onExit={goHome} />
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-fairway-700">Rounds</h1>
        <p className="text-base text-fairway-800">
          Set one up, or join the group with their room code.
        </p>
      </header>

      {/* Above the buttons: an invitation is somebody waiting on you, and it
          saves typing a room code that is being read out across a car park. */}
      <RoundInvites onJoined={(roundId) => setView({ name: 'round', roundId })} />

      {resumable !== null && (
        <section className="flex flex-col gap-3 rounded-2xl bg-flag-400/20 p-4 ring-2 ring-flag-500">
          <h2 className="font-display text-xl font-bold text-fairway-900">
            {resumable.status === 'in-progress' ? 'Your round is still going' : 'You are in a lobby'}
          </h2>
          <p className="text-base text-fairway-800">
            Room code <span className="font-display font-bold">{resumable.roomCode}</span>
          </p>
          <button
            type="button"
            onClick={() => setView({ name: 'round', roundId: resumable.id })}
            className="tap-target rounded-xl bg-fairway-700 px-6 text-lg font-bold text-white active:bg-fairway-800"
          >
            Rejoin round
          </button>
          <button
            type="button"
            onClick={() => {
              forgetActiveRound(uid)
              setResumable(null)
            }}
            className="tap-target text-base font-semibold text-fairway-700"
          >
            Not this one
          </button>
        </section>
      )}

      <button
        type="button"
        onClick={() => setView({ name: 'create' })}
        className="tap-target rounded-2xl bg-fairway-700 px-6 py-5 text-xl font-bold text-white active:bg-fairway-800"
      >
        Start a round
      </button>
      <button
        type="button"
        onClick={() => setView({ name: 'join' })}
        className="tap-target rounded-2xl border-2 border-fairway-300 bg-white px-6 py-5 text-xl font-bold text-fairway-800"
      >
        Join a round
      </button>
    </main>
  )
}
