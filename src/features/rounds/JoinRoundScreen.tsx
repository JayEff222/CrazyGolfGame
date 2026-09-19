import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { ROOM_CODE_LENGTH, findRoundByCode, joinRound } from '../../lib/rounds'
import { readPlayersOnce } from './roundsData'
import { rememberActiveRound } from './activeRound'
import { checkRoomCode, decideJoin } from './roundRules'

interface JoinRoundScreenProps {
  readonly onJoined: (roundId: string) => void
  readonly onCancel: () => void
}

/**
 * T-3.2 — joining by room code.
 *
 * The code is read out loud, so it is typed in a hurry and often wrong. Input is
 * upper-cased as you type and every refusal says which of the four things went
 * wrong - full, unknown, started, finished - because "could not join" sends
 * someone hunting for a signal problem that isn't there.
 */
export function JoinRoundScreen({ onJoined, onCancel }: JoinRoundScreenProps) {
  const { profile } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (profile === null) return

    const checked = checkRoomCode(code)
    if (!checked.ok) {
      setError(checked.message)
      return
    }

    setError(null)
    setBusy(true)
    try {
      const round = await findRoundByCode(checked.code)
      const players = round === null ? [] : await readPlayersOnce(round.id)
      const decision = decideJoin(round, players, profile.uid)

      if (decision.kind === 'blocked' || round === null) {
        setError(decision.kind === 'blocked' ? decision.message : 'Could not find that round.')
        setBusy(false)
        return
      }

      // A rejoining player is already on the team sheet; writing again would only
      // reshuffle their playing order.
      if (decision.kind === 'join') {
        await joinRound(round.id, {
          uid: profile.uid,
          displayName: profile.displayName,
          avatar: profile.avatar,
        })
      }

      rememberActiveRound(profile.uid, round.id)
      onJoined(round.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not join that round. Try again.')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-7 px-5 py-8">
      <header className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="tap-target self-start text-base font-semibold text-fairway-700"
        >
          ‹ Back
        </button>
        <h1 className="font-display text-3xl font-bold text-fairway-700">Join a round</h1>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="room-code" className="text-base font-semibold text-fairway-900">
            Room code
          </label>
          <input
            id="room-code"
            name="room-code"
            value={code}
            // Upper-cased here as well as on submit so what is on screen matches
            // what is on the other player's lobby, character for character.
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH + 2}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            required
            className="font-display tap-target rounded-xl border-2 border-fairway-200 bg-white px-4 py-3 text-center text-4xl font-bold tracking-[0.3em] text-fairway-900 uppercase outline-none focus:border-fairway-500"
          />
          <p className="text-sm text-fairway-700">
            {ROOM_CODE_LENGTH} characters. Upper or lower case, it doesn&apos;t matter.
          </p>
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
          {busy ? 'Looking…' : 'Join round'}
        </button>
      </form>
    </main>
  )
}
