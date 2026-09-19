import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_LENGTH,
  normaliseRoomCode,
  type CardVisibility,
  type DealMode,
  type Round,
  type RoundPlayer,
  type RoundSettings,
} from '../../lib/rounds'
import type { TeeId } from '../../lib/course'

/*
 * The decisions the round screens have to make, kept out of the components.
 *
 * Every one of these is a rule a player will argue with on a fairway - "it said
 * the round was full", "why can't I start it" - so they are plain functions with
 * exact answers rather than conditions buried in JSX.
 */

// ---------------------------------------------------------------------------
// Room codes
// ---------------------------------------------------------------------------

export type CodeCheck =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly message: string }

/**
 * Cleans up whatever was typed and says whether it could be a room code.
 *
 * Only the shape is checked here. Whether the code exists is a question for
 * Firestore, and the answer to a wrong character and an unused code is the same
 * message anyway.
 */
export function checkRoomCode(input: string): CodeCheck {
  const code = normaliseRoomCode(input)
  if (code.length === 0) {
    return { ok: false, message: `Enter the ${ROOM_CODE_LENGTH}-character room code.` }
  }
  if (code.length !== ROOM_CODE_LENGTH) {
    return { ok: false, message: `Room codes are ${ROOM_CODE_LENGTH} characters.` }
  }
  return { ok: true, code }
}

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------

export type JoinDecision =
  /** A new player, and there is room. */
  | { readonly kind: 'join' }
  /** Already on the team sheet - this is the dead-phone case (REQUIREMENTS.md §3). */
  | { readonly kind: 'rejoin' }
  | { readonly kind: 'blocked'; readonly message: string }

export function decideJoin(
  round: Round | null,
  players: readonly RoundPlayer[],
  uid: string,
): JoinDecision {
  if (round === null) {
    return {
      kind: 'blocked',
      message: `No round with that code. Codes are ${ROOM_CODE_LENGTH} characters — check with whoever set it up.`,
    }
  }

  // Being on the team sheet outranks everything except a finished round: a player
  // whose phone died has to get back into a round that has already started.
  const alreadyIn = players.some((player) => player.uid === uid)

  if (round.status === 'complete') {
    return { kind: 'blocked', message: 'That round is already finished.' }
  }
  if (alreadyIn) {
    return { kind: 'rejoin' }
  }
  if (round.status === 'in-progress') {
    return {
      kind: 'blocked',
      message: 'That round has already started. The group will need to start a new one.',
    }
  }
  if (players.length >= MAX_PLAYERS) {
    return { kind: 'blocked', message: `That round is full — ${MAX_PLAYERS} players is the limit.` }
  }
  return { kind: 'join' }
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

export type StartDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

/**
 * Whether this player may start this round right now.
 *
 * The round's creator is its admin. Anyone can *read* a round, and the rules let
 * any player update it, so "only the person who set it up starts it" is a decision
 * that has to be made here as well as being shown in the UI.
 */
export function decideStart(
  round: Round,
  players: readonly RoundPlayer[],
  uid: string,
): StartDecision {
  if (round.status !== 'lobby') {
    return { ok: false, reason: 'This round has already started.' }
  }
  if (round.createdBy !== uid) {
    return { ok: false, reason: 'Only the player who set this round up can start it.' }
  }
  if (players.length < MIN_PLAYERS) {
    return {
      ok: false,
      reason: `Waiting for players — ${players.length} in, ${MIN_PLAYERS} needed.`,
    }
  }
  if (players.length > MAX_PLAYERS) {
    return { ok: false, reason: `Too many players — ${MAX_PLAYERS} is the limit.` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Card settings (REQUIREMENTS.md §4.4)
// ---------------------------------------------------------------------------

export const MIN_CARDS_PER_PLAYER = 1
/**
 * A soft ceiling until the deck exists. The real limit is how many cards are in
 * the selected deck, which Phase 6 knows and this screen does not.
 */
export const MAX_CARDS_PER_PLAYER = 10
export const DEFAULT_CARDS_PER_PLAYER = 3

export interface SettingsDraft {
  readonly cardVisibility: CardVisibility
  readonly dealMode: DealMode
  readonly cardsPerPlayer: number
  /** Cards chosen for this round. Empty means a straight round with no cards. */
  readonly selectedCardIds?: readonly string[]
}

export const DEFAULT_SETTINGS_DRAFT: SettingsDraft = {
  cardVisibility: 'secret',
  dealMode: 'even',
  cardsPerPlayer: DEFAULT_CARDS_PER_PLAYER,
}

export function clampCardsPerPlayer(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CARDS_PER_PLAYER
  return Math.min(MAX_CARDS_PER_PLAYER, Math.max(MIN_CARDS_PER_PLAYER, Math.round(value)))
}

/**
 * Turns the form state into the stored settings.
 *
 * `cardsPerPlayer` is deliberately null for every mode but 'fixed' - a leftover
 * number from a mode the admin changed their mind about would be read back as
 * gospel by the dealer in Phase 7.
 *
 * `selectedCardIds` is empty because choosing the deck is Phase 6. An empty deck
 * means "deal nothing", which is the honest state of a round set up today.
 */
export function buildSettings(draft: SettingsDraft): RoundSettings {
  return {
    cardVisibility: draft.cardVisibility,
    dealMode: draft.dealMode,
    cardsPerPlayer: draft.dealMode === 'fixed' ? clampCardsPerPlayer(draft.cardsPerPlayer) : null,
    selectedCardIds: [...(draft.selectedCardIds ?? [])],
  }
}

export const VISIBILITY_CHOICES: ReadonlyArray<{
  readonly value: CardVisibility
  readonly label: string
  readonly blurb: string
}> = [
  { value: 'secret', label: 'Secret hands', blurb: 'Only you see your own cards.' },
  { value: 'open', label: 'Open hands', blurb: 'Everyone sees everyone’s cards.' },
]

export const DEAL_MODE_CHOICES: ReadonlyArray<{
  readonly value: DealMode
  readonly label: string
  readonly blurb: string
}> = [
  { value: 'even', label: 'Even split', blurb: 'Deal the deck out evenly. Leftovers are discarded.' },
  { value: 'fixed', label: 'Fixed number each', blurb: 'Everyone draws the same number, at random.' },
  { value: 'same', label: 'Everyone the same', blurb: 'Every player gets an identical hand.' },
]

export const TEE_CHOICES: ReadonlyArray<{ readonly value: TeeId; readonly label: string }> = [
  { value: 'mens', label: 'Men’s tees' },
  { value: 'ladies', label: 'Ladies’ tees' },
]

export function describeSettings(settings: RoundSettings): string[] {
  const visibility = VISIBILITY_CHOICES.find((c) => c.value === settings.cardVisibility)
  const deal = DEAL_MODE_CHOICES.find((c) => c.value === settings.dealMode)
  return [
    visibility?.label ?? settings.cardVisibility,
    settings.dealMode === 'fixed' && settings.cardsPerPlayer !== null
      ? `${settings.cardsPerPlayer} cards each`
      : (deal?.label ?? settings.dealMode),
  ]
}

export function describeTee(teeId: TeeId): string {
  return TEE_CHOICES.find((choice) => choice.value === teeId)?.label ?? teeId
}
