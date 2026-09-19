import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { InProgressRound } from './InProgressRound'
import { dealRoundCards, DealSummary, type DealSummaryData } from '../cards'
import {
  MAX_PLAYERS,
  completeRound,
  leaveRound,
  recordEvent,
  setRoundStatus,
  subscribePlayers,
  subscribeRound,
  type Round,
  type RoundPlayer,
} from '../../lib/rounds'
import { SyncIndicator } from '../offline/SyncIndicator'
import { InviteFriendsPanel } from '../friends'
import { loadCourse } from '../../lib/courseData'
import { forgetActiveRound, rememberActiveRound } from './activeRound'
import { RoomCode } from './RoomCode'
import { decideStart, describeSettings, describeTee } from './roundRules'
import { GAME_TYPES } from './gameTypes'

interface LobbyScreenProps {
  readonly roundId: string
  readonly onExit: () => void
}

function PlayerRow({
  player,
  isHost,
  isYou,
}: {
  player: RoundPlayer
  isHost: boolean
  isYou: boolean
}) {
  return (
    <li className="tap-target flex items-center gap-3 rounded-xl bg-white px-4 py-2 ring-2 ring-fairway-100">
      {player.avatar === undefined ? (
        <span
          aria-hidden="true"
          className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fairway-200 text-lg font-bold text-fairway-800"
        >
          {player.displayName.slice(0, 1).toUpperCase()}
        </span>
      ) : (
        <img
          src={player.avatar}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      )}
      <span className="flex-1 text-lg font-semibold text-fairway-900">{player.displayName}</span>
      {isYou && (
        <span className="rounded-lg bg-fairway-100 px-2 py-1 text-xs font-bold text-fairway-800 uppercase">
          You
        </span>
      )}
      {isHost && (
        <span className="rounded-lg bg-flag-400 px-2 py-1 text-xs font-bold text-fairway-900 uppercase">
          Host
        </span>
      )}
    </li>
  )
}

/**
 * T-3.3 / T-3.4 — the lobby, and the round once it is under way.
 *
 * Both live off the same two subscriptions, so a player watching the lobby moves
 * to the in-progress view the moment the host starts, without a refresh and
 * without being told to press anything.
 */
export function LobbyScreen({ roundId, onExit }: LobbyScreenProps) {
  const { profile } = useAuth()
  const uid = profile?.uid ?? ''

  const [round, setRound] = useState<Round | null | undefined>(undefined)
  const [players, setPlayers] = useState<RoundPlayer[]>([])
  const [courseName, setCourseName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [deal, setDeal] = useState<DealSummaryData | null>(null)

  useEffect(() => {
    const unsubscribeRound = subscribeRound(roundId, setRound)
    const unsubscribePlayers = subscribePlayers(roundId, setPlayers)
    return () => {
      unsubscribeRound()
      unsubscribePlayers()
    }
  }, [roundId])

  const courseId = round?.courseId
  useEffect(() => {
    if (courseId === undefined || courseId === '') return
    let live = true
    loadCourse(courseId)
      .then((course) => {
        if (live && course !== null) setCourseName(course.name)
      })
      .catch(() => {
        // A missing course name is cosmetic; the round still plays.
      })
    return () => {
      live = false
    }
  }, [courseId])

  // Being here is proof this is the round to come back to after a dead battery.
  useEffect(() => {
    if (uid !== '' && round) rememberActiveRound(uid, roundId)
  }, [uid, roundId, round])

  if (round === undefined) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <p className="text-lg font-semibold text-fairway-700">Loading the round…</p>
      </main>
    )
  }

  if (round === null) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-5 py-10">
        <p role="alert" className="text-lg font-semibold text-fairway-900">
          That round no longer exists.
        </p>
        <button
          type="button"
          onClick={() => {
            if (uid !== '') forgetActiveRound(uid)
            onExit()
          }}
          className="tap-target rounded-xl bg-fairway-700 px-6 text-base font-bold text-white"
        >
          Back to the clubhouse
        </button>
      </main>
    )
  }

  const isHost = round.createdBy === uid
  const startDecision = decideStart(round, players, uid)
  const hostName = players.find((player) => player.uid === round.createdBy)?.displayName ?? 'the host'
  const gameLabel = GAME_TYPES.find((game) => game.value === round.gameType)?.label ?? round.gameType

  const start = async () => {
    if (!startDecision.ok) return
    setError(null)
    setBusy(true)
    try {
      await setRoundStatus(round.id, 'in-progress')
      await recordEvent(round.id, { type: 'round_started', actorUid: uid })

      /*
       * Dealing happens after the status change, not before: if dealing fails the
       * round is still under way and can be played straight, whereas a round stuck
       * in the lobby because the card catalogue hiccuped would be worse.
       *
       * dealRoundCards refuses to deal a round that already has hands, so a double
       * tap on Start cannot re-deal cards people have already seen.
       */
      const outcome = await dealRoundCards(round, players)
      if (outcome.status === 'dealt') setDeal(outcome.summary)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not start the round. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    setError(null)
    setBusy(true)
    try {
      await leaveRound(round.id, uid)
      forgetActiveRound(uid)
      onExit()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not leave the round.')
      setBusy(false)
    }
  }

  /*
   * T-9.1 - somebody has to close the round.
   *
   * Nothing moved a round off 'in-progress' before this, so every round stayed
   * open forever and history had no finished golf in it. The host calls it, the
   * same person who started it, and it is confirmed because scores stay editable
   * right until the round closes.
   */
  const finish = async () => {
    setError(null)
    setBusy(true)
    try {
      await completeRound(round.id, uid)
      forgetActiveRound(uid)
      setConfirmFinish(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not finish the round.')
    } finally {
      setBusy(false)
    }
  }

  const started = round.status !== 'lobby'
  const finished = round.status === 'complete'

  /*
   * T-9.4 - the room code, the player list and the card settings.
   *
   * Vital in the lobby, and dead weight once the round is under way: they used
   * to sit above the scoring stack, which meant scrolling past four sections to
   * reach the score entry on every hole. REQUIREMENTS.md §5 calls the hole screen
   * the critical one and says it must work without scrolling, so once play
   * starts these move below it and collapse.
   */
  const roundDetails = (
    <>
      <RoomCode code={round.roomCode} compact={started} />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fairway-900">
          Players {players.length} of {MAX_PLAYERS}
        </h2>
        <ol className="flex flex-col gap-2">
          {players.map((player) => (
            <PlayerRow
              key={player.uid}
              player={player}
              isHost={player.uid === round.createdBy}
              isYou={player.uid === uid}
            />
          ))}
        </ol>
        {players.length === 0 && <p className="text-fairway-700">Nobody has joined yet.</p>}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-2 ring-fairway-100">
        <h2 className="text-base font-semibold text-fairway-900">Crazy Cards</h2>
        <p className="text-base text-fairway-800">{describeSettings(round.settings).join(' · ')}</p>
        {round.settings.selectedCardIds.length === 0 && (
          <p className="text-sm text-fairway-700">
            No cards picked for this round — you&apos;re playing straight golf.
          </p>
        )}
      </section>
    </>
  )

  return (
    <main
      className={`mx-auto flex min-h-full w-full max-w-md flex-col px-5 ${
        started ? 'gap-3 py-4' : 'gap-6 py-8'
      }`}
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1
            className={`font-display font-bold text-fairway-700 ${
              started ? 'text-xl' : 'text-3xl'
            }`}
          >
            {finished ? 'Round complete' : started ? 'Round in progress' : 'Lobby'}
          </h1>
          {/* T-8.1: the one screen a player is on for four hours is the one that
              has to answer "did that score actually save?" without being asked. */}
          <SyncIndicator />
        </div>
        <p className={started ? 'text-sm text-fairway-700' : 'text-base text-fairway-800'}>
          {courseName ?? round.courseId} · {describeTee(round.teeId)} · {gameLabel}
        </p>
      </header>

      {!started && roundDetails}

      {/* Lobby only. decideJoin refuses a round that has started, so an invitation
          sent after the off is one nobody could act on. */}
      {!started && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-fairway-900">Invite your mates</h2>
          <InviteFriendsPanel round={round} players={players} />
        </section>
      )}

      {error !== null && (
        <p
          role="alert"
          className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600"
        >
          {error}
        </p>
      )}

      {started ? (
        <section className="flex flex-col gap-3">
          {finished && (
            <p
              role="status"
              className="rounded-xl bg-fairway-100 px-4 py-3 text-base font-semibold text-fairway-900"
            >
              Round finished. The card is in your golf history.
            </p>
          )}

          {/* Shown to whoever pressed Start, so the deal is visible rather than silent. */}
          {deal !== null && <DealSummary summary={deal} />}
          <InProgressRound round={round} selfUid={uid} />

          {/* Everything below here is reference, not play. Collapsed by default so
              the scoring stack above it starts at the top of the screen. */}
          <details className="rounded-xl bg-white ring-1 ring-fairway-200">
            <summary className="tap-target flex cursor-pointer items-center px-4 text-base font-semibold text-fairway-800">
              Round details
            </summary>
            <div className="flex flex-col gap-4 px-4 pt-2 pb-4">{roundDetails}</div>
          </details>

          {!finished && (
            <p className="text-sm text-fairway-700">
              Leave this screen and come back any time — you will land straight back in this round.
            </p>
          )}

          {isHost && !finished && (
            confirmFinish ? (
              <div className="flex flex-col gap-2 rounded-xl border-2 border-fairway-600 p-3">
                <p className="text-base font-semibold text-fairway-900">
                  Finish the round for everyone? Scores stop being editable.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void finish()}
                    disabled={busy}
                    className="tap-target flex-1 rounded-xl bg-fairway-700 px-4 text-base font-bold text-white disabled:opacity-60"
                  >
                    {busy ? 'Finishing…' : 'Yes, finish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmFinish(false)}
                    className="tap-target flex-1 rounded-xl border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-800"
                  >
                    Keep playing
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmFinish(true)}
                className="tap-target rounded-xl border-2 border-fairway-600 px-6 text-base font-bold text-fairway-800"
              >
                Finish round
              </button>
            )
          )}

          <button
            type="button"
            onClick={onExit}
            className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
          >
            Back to the clubhouse
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={() => void start()}
                disabled={!startDecision.ok || busy}
                className="tap-target rounded-xl bg-fairway-700 px-6 text-lg font-bold text-white transition active:bg-fairway-800 disabled:opacity-60"
              >
                {busy ? 'Starting…' : 'Start round'}
              </button>
              {!startDecision.ok && (
                <p className="text-base text-fairway-700">{startDecision.reason}</p>
              )}
            </>
          ) : (
            <p className="rounded-xl bg-fairway-100 px-4 py-3 text-base font-medium text-fairway-800">
              Waiting for {hostName} to start the round.
            </p>
          )}

          {confirmLeave ? (
            <div className="flex flex-col gap-2 rounded-xl border-2 border-chaos-500 p-3">
              <p className="text-base font-semibold text-fairway-900">
                Leave this round? You would need a new one to get back in.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void leave()}
                  disabled={busy}
                  className="tap-target flex-1 rounded-xl bg-chaos-500 px-4 text-base font-bold text-white disabled:opacity-60"
                >
                  Yes, leave
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmLeave(false)}
                  className="tap-target flex-1 rounded-xl border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-800"
                >
                  Stay
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
            >
              Leave round
            </button>
          )}
        </section>
      )}
    </main>
  )
}
