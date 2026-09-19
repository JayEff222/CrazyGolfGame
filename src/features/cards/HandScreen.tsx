import { useEffect, useState } from 'react'
import { subscribePlayers, type CardVisibility, type RoundPlayer } from '../../lib/rounds'
import { HandPanel } from './HandPanel'

/*
 * The hand, wired to the round's player list.
 *
 * HandPanel takes players as a prop so it can be rendered from fixtures, which
 * is how it is tested. This wrapper is the version a round screen drops in: it
 * owns the one subscription the panel needs and nothing else, so adding cards to
 * the playing view is a single line rather than another subscription to thread
 * through the scoring stack.
 */

export interface HandScreenProps {
  readonly roundId: string
  readonly selfUid: string
  /** The hole a card play is recorded against. */
  readonly holeNumber: number
  readonly visibility: CardVisibility
}

export function HandScreen({ roundId, selfUid, holeNumber, visibility }: HandScreenProps) {
  // Tagged with the round it came from, so switching rounds cannot briefly offer
  // the previous round's players as card targets. See EventFeed for the same pattern.
  const [roster, setRoster] = useState<{ roundId: string; players: readonly RoundPlayer[] } | null>(
    null,
  )

  useEffect(
    () => subscribePlayers(roundId, (players) => setRoster({ roundId, players })),
    [roundId],
  )

  const players = roster !== null && roster.roundId === roundId ? roster.players : []

  return (
    <HandPanel
      roundId={roundId}
      selfUid={selfUid}
      holeNumber={holeNumber}
      visibility={visibility}
      players={players}
    />
  )
}
