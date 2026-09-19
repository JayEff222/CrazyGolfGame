import { useEffect, useState } from 'react'
import type { Round, RoundPlayer } from '../../lib/rounds'
import { subscribePlayers } from '../../lib/rounds'
import { loadHoles, type StoredHole } from '../../lib/courseData'
import { RoundScoring, toHolePars } from '../scoring'
import { HandScreen, EventFeed } from '../cards'

type Tab = 'play' | 'cards' | 'feed'

const TABS: { id: Tab; label: string }[] = [
  { id: 'play', label: 'Score' },
  { id: 'cards', label: 'Cards' },
  { id: 'feed', label: 'Feed' },
]

/**
 * The playing view, once a round has started.
 *
 * Scoring, your hand and the feed are tabs rather than one long scroll: the hole
 * screen has to work without scrolling (REQUIREMENTS §5), and stacking a card
 * hand underneath the scorecard would break that on the first phone it met.
 *
 * The current hole lives here rather than inside either tab, so playing a card is
 * recorded against the hole you are actually on — switching to the Cards tab must
 * not lose your place.
 */
export function InProgressRound({ round, selfUid }: { round: Round; selfUid: string }) {
  const [holes, setHoles] = useState<StoredHole[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('play')
  const [currentHole, setCurrentHole] = useState(1)
  const [roster, setRoster] = useState<{ roundId: string; players: readonly RoundPlayer[] } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // Fetched once, not subscribed: course data does not change mid-round, and
        // a live listener out on a course is a wasted radio wake-up every few seconds.
        const loaded = await loadHoles(round.courseId)
        if (!cancelled) setHoles(loaded)
      } catch {
        if (!cancelled) setError('Could not load the course. Check your signal.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [round.courseId])

  useEffect(
    () => subscribePlayers(round.id, (players) => setRoster({ roundId: round.id, players })),
    [round.id],
  )

  const players = roster !== null && roster.roundId === round.id ? roster.players : []

  if (error !== null) {
    return (
      <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-chaos-600">
        {error}
      </p>
    )
  }

  if (holes === null) {
    return <p className="px-1 py-3 text-base text-fairway-700">Loading the course…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-xl bg-fairway-100 p-1" role="tablist" aria-label="Round">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`tap-target flex-1 rounded-lg px-3 text-base font-semibold ${
              tab === option.id ? 'bg-white text-fairway-800 shadow-sm' : 'text-fairway-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'play' && (
        <RoundScoring
          roundId={round.id}
          selfUid={selfUid}
          holes={toHolePars(holes, round.teeId)}
          currentHole={currentHole}
          onHoleChange={setCurrentHole}
        />
      )}

      {tab === 'cards' && (
        <HandScreen
          roundId={round.id}
          selfUid={selfUid}
          holeNumber={currentHole}
          visibility={round.settings.cardVisibility}
        />
      )}

      {tab === 'feed' && <EventFeed roundId={round.id} players={players} />}
    </div>
  )
}
