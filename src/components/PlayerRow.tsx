import type { ReactNode } from 'react'

/*
 * A player: their photo, their name, and whatever you can do about them.
 *
 * Shared by the friends list and the round invite panel, which show the same
 * row with different buttons on the end. The lobby and the admin user list have
 * their own older versions carrying badges specific to those screens; they are
 * left alone deliberately rather than bent into this shape, since rewriting two
 * working screens to save a div is how regressions get in.
 */

export interface PlayerRowProps {
  readonly displayName: string
  readonly username: string
  /** A small data URI, or undefined for the initials fallback. */
  readonly avatar?: string
  /** Draws attention to a row that is waiting on the player to do something. */
  readonly highlight?: boolean
  /** The actions for this row, usually one or two buttons. */
  readonly children?: ReactNode
}

export function PlayerRow({
  displayName,
  username,
  avatar,
  highlight = false,
  children,
}: PlayerRowProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
        highlight ? 'bg-flag-400/20 ring-2 ring-flag-500' : 'bg-white ring-1 ring-fairway-200'
      }`}
    >
      {avatar === undefined ? (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-fairway-200 font-display text-base font-bold text-fairway-800"
        >
          {(displayName || username).slice(0, 2).toUpperCase()}
        </span>
      ) : (
        <img src={avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-display text-lg font-bold text-fairway-900">
          {displayName}
        </span>
        <span className="truncate text-sm text-fairway-700">{username}</span>
      </div>

      <div className="flex shrink-0 gap-2">{children}</div>
    </div>
  )
}
