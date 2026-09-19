import { useState } from 'react'
import { CARD_TIMING_LABEL, type Card } from '../../lib/cards'
import type { RoundPlayer } from '../../lib/rounds'
import { CardTile } from './CardTile'

/*
 * The step between tapping a card and spending it.
 *
 * A card cannot be un-played — REQUIREMENTS §4.4 says not even the admin can void
 * one — so a mis-tap in a pocket would cost a player a card for the round. Hence
 * a confirmation, with the rule text on it so the last thing you read before
 * spending it is what it actually does.
 *
 * Two things this screen deliberately does NOT do:
 *
 * 1. It never blocks a play on timing. §4.4 allows retroactive play on purpose -
 *    playing a card on someone as they walk off the tee pleased with themselves
 *    is the best moment in the game. The timing is shown as information and the
 *    play button is live regardless of hole, shot or stated window.
 * 2. It never changes a score. It records a play; the group enforces it.
 */

export interface PlayCardDialogProps {
  readonly card: Card
  /** The hole the play is recorded against. */
  readonly holeNumber: number
  /** Everyone in the round except the player holding the card. */
  readonly opponents: readonly RoundPlayer[]
  readonly onConfirm: (targetUid: string | undefined) => void
  readonly onCancel: () => void
}

export function PlayCardDialog({
  card,
  holeNumber,
  opponents,
  onConfirm,
  onCancel,
}: PlayCardDialogProps) {
  const [targetUid, setTargetUid] = useState<string | undefined>(undefined)

  const needsTarget = card.target === 'opponent'
  const nobodyToTarget = needsTarget && opponents.length === 0
  const blocked = needsTarget && targetUid === undefined

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-fairway-900/50 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="play-card-heading"
        className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
      >
        <h2 id="play-card-heading" className="font-display text-xl font-bold text-fairway-900">
          Play {card.title}?
        </h2>

        <CardTile card={card} cardId={card.id} />

        <p className="rounded-xl bg-fairway-100 px-3 py-2 text-sm text-fairway-800">
          <span className="font-semibold">Stated timing: {CARD_TIMING_LABEL[card.timing]}.</span>{' '}
          That is the card&apos;s own rule for the group to keep — the app does not enforce it. You
          can play this now, later, or after the shot has been hit.
        </p>

        {needsTarget ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1 text-base font-semibold text-fairway-900">
              Who are you playing it on?
            </legend>
            {nobodyToTarget ? (
              <p role="status" className="text-sm text-fairway-700">
                There is nobody else in this round to play it on.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {opponents.map((player) => {
                  const chosen = player.uid === targetUid
                  return (
                    <li key={player.uid}>
                      <button
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => setTargetUid(player.uid)}
                        className={`tap-target flex w-full items-center gap-2 rounded-xl border-2 px-4 text-left text-base font-semibold ${
                          chosen
                            ? 'border-fairway-700 bg-fairway-100 text-fairway-900'
                            : 'border-fairway-300 bg-white text-fairway-800'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                            chosen
                              ? 'border-fairway-700 bg-fairway-700 text-white'
                              : 'border-fairway-300 text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                        {player.displayName}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </fieldset>
        ) : (
          <p className="text-base text-fairway-800">
            {card.target === 'everyone'
              ? 'This one lands on the whole group.'
              : 'This one is on you — no target needed.'}
          </p>
        )}

        <p className="rounded-xl bg-flag-400/25 px-3 py-2 text-sm font-semibold text-fairway-900">
          Playing it spends it. A played card cannot be taken back, not even by the admin.
        </p>

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={blocked || nobodyToTarget}
            onClick={() => onConfirm(targetUid)}
            className="tap-target rounded-xl bg-fairway-700 px-4 text-base font-bold text-white disabled:bg-fairway-200 disabled:text-fairway-600"
          >
            Play it on hole {holeNumber}
          </button>
          {blocked && !nobodyToTarget && (
            <p role="status" className="text-center text-sm text-fairway-700">
              Pick who it lands on first.
            </p>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="tap-target rounded-xl border-2 border-fairway-300 px-4 text-base font-semibold text-fairway-800"
          >
            Keep it
          </button>
        </div>
      </div>
    </div>
  )
}
