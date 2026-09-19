import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { formatToPar } from '../../lib/leaderboard'
import { summariseRound } from '../../lib/stats'
import { ScorecardScreen } from '../scoring'
import { loadPlayerHistory, type RoundHistoryEntry } from './historyData'
import { StatsPanel } from './StatsPanel'

/*
 * T-9.1 / T-9.2 - what happened, and what it adds up to.
 *
 * One load feeds both tabs. The stats are computed from the same rounds the list
 * shows, so the two can never disagree about how many rounds have been played -
 * which they would if stats had its own query.
 *
 * The per-round card is ScorecardScreen with onSetScore left off. That prop was
 * made optional in Phase 4 for exactly this, so history gets the real scorecard
 * rather than a second, subtly different one that drifts from it.
 */

type Tab = 'rounds' | 'stats'

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function playedLabel(playedAt: number | null): string {
  return playedAt === null ? 'Just now' : dateFormat.format(new Date(playedAt))
}

function RoundRow({
  entry,
  selfUid,
  onOpen,
}: {
  entry: RoundHistoryEntry
  selfUid: string
  onOpen: () => void
}) {
  const result = summariseRound(entry, selfUid)
  const unfinished = entry.round.status !== 'complete'

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="tap-target flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3 text-left ring-1 ring-fairway-200 active:bg-fairway-50"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg font-bold text-fairway-900">
            {playedLabel(entry.playedAt)}
          </span>
          <span className="text-sm text-fairway-700">
            {result.holesPlayed} hole{result.holesPlayed === 1 ? '' : 's'}
            {' · '}
            {entry.players.length} player{entry.players.length === 1 ? '' : 's'}
            {unfinished && ' · still open'}
          </span>
        </div>
        <span className="shrink-0 font-display text-2xl font-bold text-fairway-800">
          {result.holesPlayed === 0 ? '—' : formatToPar(result.toPar)}
        </span>
      </button>
    </li>
  )
}

export function HistoryScreen({ onBack }: { onBack?: () => void }) {
  const { profile } = useAuth()
  const uid = profile?.uid ?? ''

  const [entries, setEntries] = useState<{ uid: string; rounds: RoundHistoryEntry[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('rounds')
  const [openRoundId, setOpenRoundId] = useState<string | null>(null)

  useEffect(() => {
    if (uid === '') return
    let live = true
    void loadPlayerHistory(uid)
      .then((rounds) => {
        if (live) setEntries({ uid, rounds })
      })
      .catch(() => {
        if (live) setError('Could not load your rounds. Check your signal and try again.')
      })
    return () => {
      live = false
    }
  }, [uid])

  // History belonging to a different account is the previous player's golf.
  const rounds = entries !== null && entries.uid === uid ? entries.rounds : null
  const open = rounds?.find((entry) => entry.round.id === openRoundId) ?? null

  if (profile === null) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
        <p className="text-lg font-semibold text-fairway-900">Sign in to see your rounds.</p>
      </main>
    )
  }

  if (open !== null) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-5 py-6">
        <button
          type="button"
          onClick={() => setOpenRoundId(null)}
          className="tap-target self-start text-base font-semibold text-fairway-700"
        >
          &lsaquo; All rounds
        </button>
        <p className="text-base text-fairway-800">{playedLabel(open.playedAt)}</p>
        <ScorecardScreen
          players={open.players}
          scores={open.scores}
          holes={open.scorecardHoles}
          selfUid={uid}
        />
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-fairway-700">Your golf</h1>
      </header>

      <div className="flex gap-1 rounded-xl bg-fairway-100 p-1" role="tablist" aria-label="History">
        {(
          [
            ['rounds', 'Rounds'],
            ['stats', 'Stats'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`tap-target flex-1 rounded-lg px-3 text-base font-semibold ${
              tab === id ? 'bg-white text-fairway-800 shadow-sm' : 'text-fairway-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600">
          {error}
        </p>
      )}

      {rounds === null && error === null && (
        <p className="text-base text-fairway-700">Looking up your rounds…</p>
      )}

      {rounds !== null && rounds.length === 0 && (
        <p className="rounded-xl bg-fairway-100 px-4 py-4 text-base text-fairway-800">
          No rounds yet. Once you play one it shows up here, scorecard and all.
        </p>
      )}

      {rounds !== null && rounds.length > 0 && tab === 'rounds' && (
        <ul className="flex flex-col gap-3">
          {rounds.map((entry) => (
            <RoundRow
              key={entry.round.id}
              entry={entry}
              selfUid={uid}
              onOpen={() => setOpenRoundId(entry.round.id)}
            />
          ))}
        </ul>
      )}

      {rounds !== null && tab === 'stats' && <StatsPanel rounds={rounds} selfUid={uid} />}

      {onBack !== undefined && (
        <button
          type="button"
          onClick={onBack}
          className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
        >
          Back
        </button>
      )}
    </main>
  )
}
