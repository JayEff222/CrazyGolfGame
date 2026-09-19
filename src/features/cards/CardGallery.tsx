import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { CARD_CATEGORY_LABEL, type Card, type CardCategory } from '../../lib/cards'
import { loadCatalogue } from '../../lib/cardsData'
import {
  applyVote,
  castVote,
  loadVoteTallies,
  nextVote,
  EMPTY_TALLY,
  type Vote,
  type VoteTally,
} from '../../lib/cardVotes'
import { listMySuggestions, suggestCard, type CardSuggestion } from '../../lib/cardSuggestions'
import { CardTile } from './CardTile'
import { SuggestCardForm } from './SuggestCardForm'
import { markDecisionSeen, readSeenDecisions, unseenDecisions } from './seenDecisions'

/*
 * The deck, as every player sees it.
 *
 * Two jobs. First, it is the only place the rules are readable outside a round -
 * a card is honour-system, so knowing what is in the deck before you are stood
 * on a tee arguing about it is most of the game. Second, it collects thumbs
 * up and down, which is how open question Q-3 ("which of these cards actually
 * work") gets answered without anyone having to remember an opinion until the
 * drive home.
 *
 * Votes update on tap rather than after a round trip. Out on a course the round
 * trip may not come for a while, and a thumb that does not visibly move gets
 * tapped again - which would read as un-voting.
 */

const CATEGORY_ORDER: CardCategory[] = ['boost', 'attack', 'defence', 'group']

interface Loaded {
  readonly cards: readonly Card[]
  readonly skipped: readonly { readonly id: string; readonly reason: string }[]
  readonly suggestions: readonly CardSuggestion[]
}

function VoteButton({
  tone,
  label,
  count,
  pressed,
  onClick,
}: {
  tone: 'up' | 'down'
  label: string
  count: number
  pressed: boolean
  onClick: () => void
}) {
  const active =
    tone === 'up' ? 'bg-fairway-700 text-white' : 'bg-chaos-500 text-white'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={`tap-target flex flex-1 items-center justify-center gap-2 rounded-xl px-4 text-base font-bold ${
        pressed ? active : 'border-2 border-fairway-300 text-fairway-800'
      }`}
    >
      <span aria-hidden="true">{tone === 'up' ? '👍' : '👎'}</span>
      {count}
    </button>
  )
}

export function CardGallery({ onReviewSuggestions }: { onReviewSuggestions?: () => void }) {
  const { profile, isAdmin } = useAuth()
  const uid = profile?.uid ?? ''

  const [loaded, setLoaded] = useState<{ uid: string; data: Loaded } | null>(null)
  const [tallies, setTallies] = useState<Map<string, VoteTally>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [sent, setSent] = useState(false)
  const [seen, setSeen] = useState<readonly string[]>([])
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (uid === '') return
    let live = true

    void (async () => {
      try {
        const [catalogue, voteTallies, suggestions] = await Promise.all([
          loadCatalogue(),
          loadVoteTallies(uid),
          // A player with no suggestions still resolves; a failure here should
          // not cost them the deck, which is the main point of the screen.
          listMySuggestions(uid).catch(() => [] as CardSuggestion[]),
        ])
        if (!live) return
        setLoaded({ uid, data: { cards: catalogue.cards, skipped: catalogue.skipped, suggestions } })
        setTallies(voteTallies)
        setSeen(readSeenDecisions(uid))
        setError(null)
      } catch {
        if (live) setError('Could not load the deck. Check your signal and try again.')
      }
    })()

    return () => {
      live = false
    }
  }, [uid, reloadToken])

  if (profile === null) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
        <p className="text-lg font-semibold text-fairway-900">Sign in to see the deck.</p>
      </main>
    )
  }

  // Data belonging to a different account is the previous player's.
  const data = loaded !== null && loaded.uid === uid ? loaded.data : null

  const vote = (cardId: string, tapped: Vote) => {
    const current = tallies.get(cardId) ?? EMPTY_TALLY
    const wanted = nextVote(current.mine, tapped)

    // Optimistic: the thumb moves now, the write catches up. Firestore queues it
    // offline, so the only thing lost on a failure is the tally being one out
    // until the next load - never the vote itself.
    setTallies((previous) => {
      const existing = previous.get(cardId) ?? EMPTY_TALLY
      return new Map(previous).set(cardId, applyVote(existing, wanted))
    })
    void castVote(cardId, uid, wanted).catch(() => {
      setError('That vote did not save. It will retry when you have signal.')
    })
  }

  if (suggesting) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-6">
        <h1 className="font-display text-2xl font-bold text-fairway-700">Suggest a card</h1>
        <p className="text-base text-fairway-800">
          Write it, send it, and JF decides whether it joins the deck. You will see the
          answer here.
        </p>
        <SuggestCardForm
          existingIds={(data?.cards ?? []).map((card) => card.id)}
          onSubmit={async (card) => {
            await suggestCard(card, uid, profile.displayName)
            setSuggesting(false)
            setSent(true)
            setReloadToken((token) => token + 1)
          }}
          onCancel={() => setSuggesting(false)}
        />
      </main>
    )
  }

  const decisions = data === null ? [] : unseenDecisions(data.suggestions, seen)
  const pendingMine = (data?.suggestions ?? []).filter((s) => s.status === 'pending')
  const active = (data?.cards ?? []).filter((card) => card.active)

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-fairway-700">The deck</h1>
        <p className="text-base text-fairway-800">
          {data === null ? 'Loading…' : `${active.length} cards in play. Rate them.`}
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600">
          {error}
        </p>
      )}

      {/* A card that will not parse is reported, never silently dropped — that
          silence is exactly what hid the notes bug for a whole phase. */}
      {data !== null && data.skipped.length > 0 && (
        <p role="alert" className="rounded-xl bg-flag-400/25 px-4 py-3 text-base text-fairway-900">
          {data.skipped.length} card{data.skipped.length === 1 ? '' : 's'} could not be read:{' '}
          {data.skipped.map((s) => s.id).join(', ')}.
        </p>
      )}

      {decisions.map((suggestion) => (
        <div
          key={suggestion.id}
          role="status"
          className={`flex flex-col gap-2 rounded-xl px-4 py-3 ${
            suggestion.status === 'accepted'
              ? 'bg-fairway-100 text-fairway-900 ring-2 ring-fairway-500'
              : 'bg-chaos-500/10 text-chaos-600 ring-2 ring-chaos-500'
          }`}
        >
          <p className="text-base font-semibold">
            {suggestion.status === 'accepted'
              ? `“${suggestion.card.title}” is in the deck.`
              : `“${suggestion.card.title}” was not taken up.`}
          </p>
          {suggestion.reason !== undefined && (
            <p className="text-base">{suggestion.reason}</p>
          )}
          <button
            type="button"
            onClick={() => {
              markDecisionSeen(uid, suggestion.id)
              setSeen(readSeenDecisions(uid))
            }}
            className="tap-target self-start rounded-lg px-3 text-base font-semibold underline"
          >
            Got it
          </button>
        </div>
      ))}

      {sent && (
        <p role="status" className="rounded-xl bg-fairway-100 px-4 py-3 text-base font-medium text-fairway-800">
          Sent. JF will have a look at it.
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setSent(false)
          setSuggesting(true)
        }}
        className="tap-target rounded-xl bg-fairway-700 px-6 py-4 text-lg font-bold text-white active:bg-fairway-800"
      >
        Suggest a card
      </button>

      {pendingMine.length > 0 && (
        <p className="text-sm text-fairway-700">
          {pendingMine.length} of your card{pendingMine.length === 1 ? '' : 's'} waiting on a
          decision.
        </p>
      )}

      {isAdmin && onReviewSuggestions !== undefined && (
        <button
          type="button"
          onClick={onReviewSuggestions}
          className="tap-target rounded-xl border-2 border-fairway-600 px-6 text-base font-bold text-fairway-800"
        >
          Review suggestions
        </button>
      )}

      {CATEGORY_ORDER.map((category) => {
        const inCategory = active.filter((card) => card.category === category)
        if (inCategory.length === 0) return null

        return (
          <section key={category} className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-bold text-fairway-900">
              {CARD_CATEGORY_LABEL[category]}
            </h2>
            {inCategory.map((card) => {
              const tally = tallies.get(card.id) ?? EMPTY_TALLY
              return (
                <CardTile key={card.id} card={card} cardId={card.id}>
                  <div className="mt-2 flex gap-2">
                    <VoteButton
                      tone="up"
                      label={`Thumbs up for ${card.title}`}
                      count={tally.up}
                      pressed={tally.mine === 'up'}
                      onClick={() => vote(card.id, 'up')}
                    />
                    <VoteButton
                      tone="down"
                      label={`Thumbs down for ${card.title}`}
                      count={tally.down}
                      pressed={tally.mine === 'down'}
                      onClick={() => vote(card.id, 'down')}
                    />
                  </div>
                </CardTile>
              )
            })}
          </section>
        )
      })}
    </main>
  )
}
