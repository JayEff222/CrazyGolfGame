import type { GameType } from '../../lib/rounds'

/*
 * The formats a round can be played in.
 *
 * Stroke play is the only one that exists (REQUIREMENTS.md §9 defers the rest),
 * but the picker is built from this list rather than hard-coded so adding one is
 * a three-step change with no UI work:
 *
 *   1. add the id to `GameType` in src/lib/rounds.ts
 *   2. add an entry here
 *   3. teach the scoring screens what it means
 *
 * `createRound` currently writes `gameType: 'stroke'` itself, so step 1 also has
 * to widen that write before a second format can actually be stored.
 */
export interface GameTypeOption {
  readonly value: GameType
  readonly label: string
  readonly blurb: string
}

export const GAME_TYPES: readonly GameTypeOption[] = [
  { value: 'stroke', label: 'Stroke play', blurb: 'Count every shot. Lowest total wins.' },
]

/**
 * Formats that are asked for but not built. Shown greyed out so nobody hunts a
 * settings screen for a Stableford option that does not exist yet.
 */
export const PLANNED_GAME_TYPES: readonly string[] = ['Stableford', 'Match play']
