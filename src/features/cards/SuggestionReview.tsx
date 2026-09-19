import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  acceptSuggestion,
  listPendingSuggestions,
  rejectSuggestion,
  type CardSuggestion,
} from '../../lib/cardSuggestions'
import { CardTile } from './CardTile'

/*
 * The admin's queue of cards other players have written.
 *
 * Accepting writes the card into the catalogue and marks the suggestion, in that
 * order - a suggestion marked accepted whose card never landed is the worse of
 * the two half-failures, because nobody would ever go looking for it again.
 *
 * Rejecting asks for a reason, and the reason is shown to whoever wrote the
 * card. A card turned down with no explanation reads as the app losing it, and
 * the point of the whole feature is that people keep writing them.
 */

export function SuggestionReview({ onDone }: { onDone?: () => void }) {
  const { profile, isAdmin } = useAuth()
  const uid = profile?.uid ?? ''

  const [pending, setPending] = useState<readonly CardSuggestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!isAdmin) return
    let live = true
    void listPendingSuggestions()
      .then((loaded) => {
        if (live) {
          setPending(loaded)
          setError(null)
        }
      })
      .catch(() => {
        if (live) setError('Could not load the suggestions. Check your signal.')
      })
    return () => {
      live = false
    }
  }, [isAdmin, reloadToken])

  if (!isAdmin) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
        <p className="text-lg font-semibold text-fairway-900">This screen is for the admin.</p>
      </main>
    )
  }

  const decide = async (action: () => Promise<void>, suggestionId: string) => {
    setBusyId(suggestionId)
    setError(null)
    try {
      await action()
      setRejecting(null)
      setReason('')
      setReloadToken((token) => token + 1)
    } catch {
      setError('That did not save. Check your signal and try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-fairway-700">Suggested cards</h1>
        <p className="text-base text-fairway-800">
          {pending === null
            ? 'Loading…'
            : pending.length === 0
              ? 'Nothing waiting.'
              : `${pending.length} waiting on you.`}
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600">
          {error}
        </p>
      )}

      {(pending ?? []).map((suggestion) => (
        <section key={suggestion.id} className="flex flex-col gap-2">
          <CardTile
            card={suggestion.card}
            cardId={suggestion.card.id}
            footer={
              <span className="text-sm text-fairway-700">From {suggestion.suggestedByName}</span>
            }
          >
            {rejecting === suggestion.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <label
                  htmlFor={`reason-${suggestion.id}`}
                  className="text-base font-semibold text-fairway-900"
                >
                  Why not? They will see this.
                </label>
                <textarea
                  id={`reason-${suggestion.id}`}
                  value={reason}
                  rows={2}
                  maxLength={300}
                  onChange={(event) => setReason(event.target.value)}
                  className="w-full rounded-xl border-2 border-fairway-200 bg-white px-4 py-3 text-base text-fairway-900 outline-none focus:border-fairway-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === suggestion.id}
                    onClick={() =>
                      void decide(
                        () => rejectSuggestion(suggestion.id, uid, reason),
                        suggestion.id,
                      )
                    }
                    className="tap-target flex-1 rounded-xl bg-chaos-500 px-4 text-base font-bold text-white disabled:opacity-60"
                  >
                    Send it back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejecting(null)
                      setReason('')
                    }}
                    className="tap-target flex-1 rounded-xl border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busyId === suggestion.id}
                  onClick={() => void decide(() => acceptSuggestion(suggestion, uid), suggestion.id)}
                  className="tap-target flex-1 rounded-xl bg-fairway-700 px-4 text-base font-bold text-white active:bg-fairway-800 disabled:opacity-60"
                >
                  {busyId === suggestion.id ? 'Saving…' : 'Add to the deck'}
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(suggestion.id)}
                  className="tap-target flex-1 rounded-xl border-2 border-chaos-500 px-4 text-base font-bold text-chaos-600"
                >
                  Reject
                </button>
              </div>
            )}
          </CardTile>
        </section>
      ))}

      {onDone !== undefined && (
        <button
          type="button"
          onClick={onDone}
          className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
        >
          Done
        </button>
      )}
    </main>
  )
}
