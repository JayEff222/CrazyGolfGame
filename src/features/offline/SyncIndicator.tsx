import { CONNECTION_LABELS, useConnectionStatus, type ConnectionState } from './useConnectionStatus'

/*
 * The connection state, small enough to sit in a round header all round.
 *
 * Online is deliberately understated - a quiet grey dot - because it is true
 * almost all the time and a green badge shouting "Online" on every screen is
 * noise. Offline is the state that has to be unmissable in sunlight, so it gets
 * the flag colour and the full sentence.
 */

const TONE: Record<ConnectionState, string> = {
  online: 'bg-fairway-100 text-fairway-700',
  syncing: 'bg-fairway-100 text-fairway-800',
  offline: 'bg-flag-400/30 text-fairway-900 ring-1 ring-flag-500',
}

const DOT: Record<ConnectionState, string> = {
  online: 'bg-fairway-500',
  syncing: 'bg-flag-500 animate-pulse',
  offline: 'bg-chaos-500',
}

export function SyncIndicator({ className = '' }: { className?: string }) {
  const state = useConnectionStatus()

  return (
    <p
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 self-start rounded-lg px-3 py-1 text-sm font-semibold ${TONE[state]} ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[state]}`} />
      {CONNECTION_LABELS[state]}
    </p>
  )
}
