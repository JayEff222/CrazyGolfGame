import { loadCards } from '../../lib/cardsData'
import { dealCards, type DealResult } from '../../lib/deal'
import { hasBeenDealt, writeDeal } from '../../lib/hands'
import type { DealMode, Round, RoundPlayer } from '../../lib/rounds'

/*
 * T-7.1 — the dealing step.
 *
 * `src/lib/deal.ts` decides who gets which cards and is pure and tested on its own.
 * This is the wiring around it: read the catalogue, deal the round's chosen cards
 * to the round's players, write the hands, and say what happened.
 *
 * The one rule that matters here is that a round is dealt **once**. Re-dealing
 * after four people have looked at their hands cannot be undone — everyone now
 * knows cards that are about to be dealt to someone else — so this refuses rather
 * than trusting the caller to only press Start once. The check is a read of the
 * hands collection, so it also covers the case where another phone in the group
 * started the round a second earlier.
 */

export interface DealtHand {
  readonly uid: string
  readonly displayName: string
  readonly count: number
}

export interface DealSummaryData {
  readonly mode: DealMode
  /** In playing order, as the players were given. */
  readonly hands: readonly DealtHand[]
  /** Cards deliberately left out of play (REQUIREMENTS §4.4). */
  readonly discarded: number
  /**
   * How many cards short the deck was of what the deal asked for. Zero on a
   * normal deal. The deal still happened — this is a thing to say out loud on
   * the first tee, not a failure.
   */
  readonly shortfall: number
}

/**
 * Why nothing was dealt, when nothing was.
 *
 * A discriminated result rather than a thrown error: none of these is a fault.
 * A round with no cards is a legitimate round of golf, and a second Start press
 * is the normal way a host finds out the round already started.
 */
export type DealOutcome =
  | { readonly status: 'dealt'; readonly summary: DealSummaryData }
  | { readonly status: 'already-dealt' }
  | { readonly status: 'no-cards' }
  | { readonly status: 'no-players' }

/** What the lobby shows once the cards are out. Pure, so it is tested directly. */
export function summariseDeal(
  result: DealResult,
  players: readonly RoundPlayer[],
  mode: DealMode,
): DealSummaryData {
  return {
    mode,
    hands: players.map((player) => ({
      uid: player.uid,
      // Never the uid — a raw id on screen is worse than an anonymous label.
      displayName: player.displayName === '' ? 'Player' : player.displayName,
      count: result.hands[player.uid]?.length ?? 0,
    })),
    discarded: result.discarded.length,
    shortfall: result.shortfall,
  }
}

/**
 * Deals a round's cards and writes the hands. Safe to call twice.
 *
 * Throws only on a genuine failure to talk to Firestore — including a failure of
 * the already-dealt check itself, which deliberately fails closed. Being unable
 * to prove a round has not been dealt is not a reason to deal it again.
 */
export async function dealRoundCards(
  round: Round,
  players: readonly RoundPlayer[],
): Promise<DealOutcome> {
  if (players.length === 0) return { status: 'no-players' }

  if (await hasBeenDealt(round.id)) return { status: 'already-dealt' }

  const selected = new Set(round.settings.selectedCardIds)
  if (selected.size === 0) return { status: 'no-cards' }

  /*
   * Filtered against the live catalogue rather than dealt straight from the
   * stored ids: cards are edited in-app between rounds (§4.4), so a selected card
   * may since have been deactivated or deleted. Dealing an id that no longer
   * resolves would put a card in someone's hand with no text on it.
   */
  const catalogue = await loadCards()
  const cardIds = catalogue.filter((card) => card.active && selected.has(card.id)).map((c) => c.id)
  if (cardIds.length === 0) return { status: 'no-cards' }

  const result = dealCards({
    cardIds,
    playerUids: players.map((player) => player.uid),
    mode: round.settings.dealMode,
    cardsPerPlayer: round.settings.cardsPerPlayer,
  })

  await writeDeal(round.id, result)

  return { status: 'dealt', summary: summariseDeal(result, players, round.settings.dealMode) }
}
