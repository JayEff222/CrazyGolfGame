/**
 * Usernames, and the trick that lets us have accounts without email addresses.
 *
 * Firebase Auth requires an email, but nobody here wants to type one to play golf
 * with three mates. So a username is mapped to an address on a domain that can
 * never exist, and Firebase's own uniqueness check on email becomes our uniqueness
 * check on username - no separate registry, no race condition.
 *
 * `.invalid` is reserved by RFC 2606 exactly for this: it is guaranteed never to
 * resolve, so an alias can never accidentally reach a real mailbox. (`.local` also
 * works, but it is reserved for mDNS and could collide on a LAN.)
 *
 * The consequence is no password-reset emails, which is why REQUIREMENTS.md §3
 * has an admin reset instead.
 */

export const USERNAME_DOMAIN = 'crazygolf.invalid'

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20

/** Must start alphanumeric, then letters, digits, underscore or hyphen. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

export type UsernameProblem =
  | { readonly ok: true; readonly username: string }
  | { readonly ok: false; readonly reason: string }

/**
 * Lower-cases and trims, so "JF", "jf" and " Jf " are the same player.
 *
 * Normalising rather than rejecting mixed case means nobody gets locked out for
 * capitalising their own name on a phone keyboard that auto-capitalises.
 */
export function normaliseUsername(input: string): string {
  return input.trim().toLowerCase()
}

/**
 * Validates a username, returning either the normalised form or a message that
 * can be shown to the player as-is.
 */
export function validateUsername(input: string): UsernameProblem {
  const username = normaliseUsername(input)

  if (username.length === 0) {
    return { ok: false, reason: 'Enter a username.' }
  }
  if (username.length < USERNAME_MIN_LENGTH) {
    return { ok: false, reason: `Usernames need at least ${USERNAME_MIN_LENGTH} characters.` }
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return { ok: false, reason: `Usernames can be at most ${USERNAME_MAX_LENGTH} characters.` }
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      reason: 'Use letters and numbers, plus - or _ . Start with a letter or number.',
    }
  }
  return { ok: true, username }
}

/**
 * Maps a username to the internal address Firebase Auth stores.
 *
 * Throws on an invalid username rather than producing a malformed address - a bad
 * alias would fail later with a confusing Firebase error instead of a clear one.
 */
export function usernameToEmail(input: string): string {
  const result = validateUsername(input)
  if (!result.ok) {
    throw new Error(`Invalid username: ${result.reason}`)
  }
  return `${result.username}@${USERNAME_DOMAIN}`
}

/**
 * Recovers the username from an internal address.
 *
 * Returns null for anything that is not one of our aliases, so a stray real email
 * address on an account cannot be silently displayed as a username.
 */
export function emailToUsername(email: string): string | null {
  const suffix = `@${USERNAME_DOMAIN}`
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.endsWith(suffix)) return null

  const username = trimmed.slice(0, -suffix.length)
  const result = validateUsername(username)
  return result.ok ? result.username : null
}

/**
 * The password an admin resets an account to. See REQUIREMENTS.md §3.
 *
 * JF specified "1234". Firebase Auth hard-rejects anything shorter than six
 * characters with WEAK_PASSWORD - verified against the live project, and it is not
 * configurable without upgrading to Identity Platform, which needs the paid plan.
 * So this is the shortest thing that keeps the spirit of the original: a number
 * you can read out over the phone.
 */
export const ADMIN_RESET_PASSWORD = '123456'

/** Firebase Auth's own floor. We cannot go below it. */
export const PASSWORD_MIN_LENGTH = 6
export function validatePassword(password: string): { ok: true } | { ok: false; reason: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: `Passwords need at least ${PASSWORD_MIN_LENGTH} characters.` }
  }
  return { ok: true }
}
