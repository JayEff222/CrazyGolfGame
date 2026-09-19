/**
 * The room code, sized to be read across a table.
 *
 * This is the one thing on the lobby screen someone squints at from a metre away
 * in full sun, so it gets display type, wide letter spacing and nothing near it.
 * The characters are already chosen to avoid O/0 and I/1 confusion (see
 * `ROOM_CODE_ALPHABET` in src/lib/rounds.ts).
 */
export function RoomCode({ code, compact = false }: { code: string; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-fairway-100 px-4 py-4">
      <p className="text-sm font-semibold tracking-wide text-fairway-700 uppercase">Room code</p>
      <p
        // Spelled out for a screen reader, which would otherwise read a code like
        // "QF7K" as a word.
        aria-label={`Room code ${code.split('').join(' ')}`}
        className={`font-display font-bold text-fairway-900 tabular-nums ${
          compact ? 'text-3xl tracking-[0.25em]' : 'text-6xl tracking-[0.3em]'
        }`}
      >
        {code}
      </p>
      {!compact && (
        <p className="text-sm text-fairway-700">Read it out — the others type this to join.</p>
      )}
    </div>
  )
}
