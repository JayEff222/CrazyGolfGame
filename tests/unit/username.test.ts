import { describe, it, expect } from 'vitest'
import {
  normaliseUsername,
  validateUsername,
  usernameToEmail,
  emailToUsername,
  validatePassword,
  USERNAME_DOMAIN,
  ADMIN_RESET_PASSWORD,
  PASSWORD_MIN_LENGTH,
} from '../../src/lib/username'

describe('normaliseUsername', () => {
  it('lower-cases, so a phone auto-capitalising your name does not lock you out', () => {
    expect(normaliseUsername('JF')).toBe('jf')
    expect(normaliseUsername('JfVanStaden')).toBe('jfvanstaden')
  })

  it('trims surrounding whitespace', () => {
    expect(normaliseUsername('  jf  ')).toBe('jf')
  })

  it('treats differently-cased spellings as the same player', () => {
    expect(normaliseUsername('JF')).toBe(normaliseUsername(' jf '))
  })
})

describe('validateUsername', () => {
  it('accepts a straightforward name', () => {
    expect(validateUsername('jfvanstaden')).toEqual({ ok: true, username: 'jfvanstaden' })
  })

  it('accepts digits, hyphens and underscores', () => {
    expect(validateUsername('jf_van-staden22').ok).toBe(true)
  })

  it('returns the normalised form, not what was typed', () => {
    const result = validateUsername('  JF_Golf  ')
    expect(result).toEqual({ ok: true, username: 'jf_golf' })
  })

  it('rejects an empty entry', () => {
    expect(validateUsername('').ok).toBe(false)
    expect(validateUsername('   ').ok).toBe(false)
  })

  it('rejects something too short', () => {
    expect(validateUsername('jf').ok).toBe(false)
  })

  it('rejects something too long', () => {
    expect(validateUsername('a'.repeat(21)).ok).toBe(false)
  })

  it('accepts the exact boundary lengths', () => {
    expect(validateUsername('abc').ok).toBe(true)
    expect(validateUsername('a'.repeat(20)).ok).toBe(true)
  })

  it('rejects spaces in the middle', () => {
    expect(validateUsername('jf van staden').ok).toBe(false)
  })

  it('rejects a name starting with a hyphen or underscore', () => {
    expect(validateUsername('-jf').ok).toBe(false)
    expect(validateUsername('_jf').ok).toBe(false)
  })

  it('rejects characters that would break the email alias', () => {
    for (const bad of ['jf@golf', 'jf.golf', 'jf+golf', 'jf/golf', 'jf golf']) {
      expect(validateUsername(bad).ok, bad).toBe(false)
    }
  })

  it('gives a reason that can be shown to the player as-is', () => {
    const result = validateUsername('jf')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/at least 3 characters/)
  })
})

describe('usernameToEmail', () => {
  it('maps a username onto the reserved internal domain', () => {
    expect(usernameToEmail('jfvanstaden')).toBe(`jfvanstaden@${USERNAME_DOMAIN}`)
  })

  it('normalises before mapping, so case cannot create a second account', () => {
    expect(usernameToEmail('JF_Golf')).toBe(usernameToEmail('jf_golf'))
  })

  it('throws on an invalid username rather than building a broken address', () => {
    expect(() => usernameToEmail('jf')).toThrow(/Invalid username/)
    expect(() => usernameToEmail('jf@golf')).toThrow(/Invalid username/)
  })

  it('uses a domain reserved by RFC 2606 so it can never reach a real mailbox', () => {
    expect(USERNAME_DOMAIN.endsWith('.invalid')).toBe(true)
  })
})

describe('emailToUsername', () => {
  it('recovers the username from one of our aliases', () => {
    expect(emailToUsername(`jfvanstaden@${USERNAME_DOMAIN}`)).toBe('jfvanstaden')
  })

  it('round-trips with usernameToEmail', () => {
    for (const name of ['jf', 'jfvanstaden', 'dave_22', 'a-b-c']) {
      const validated = validateUsername(name)
      if (!validated.ok) continue
      expect(emailToUsername(usernameToEmail(name))).toBe(validated.username)
    }
  })

  it('returns null for a real email address, so it is never shown as a username', () => {
    expect(emailToUsername('jfvanstaden@gmail.com')).toBeNull()
    expect(emailToUsername('someone@example.org')).toBeNull()
  })

  it('returns null for junk', () => {
    expect(emailToUsername('')).toBeNull()
    expect(emailToUsername('not-an-email')).toBeNull()
    expect(emailToUsername(`@${USERNAME_DOMAIN}`)).toBeNull()
  })
})

describe('validatePassword', () => {
  it('accepts a password at the minimum length', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH)).ok).toBe(true)
  })

  it('rejects anything shorter', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1)).ok).toBe(false)
  })

  it('accepts the admin reset password - otherwise the reset flow breaks itself', () => {
    expect(validatePassword(ADMIN_RESET_PASSWORD).ok).toBe(true)
  })

  it('does not demand less than Firebase Auth does, which would fail server-side', () => {
    // Firebase rejects under 6 characters with WEAK_PASSWORD. Verified against the
    // live project on 2026-09-19.
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(6)
  })
})
