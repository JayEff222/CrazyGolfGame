import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { ProfileScreen } from '../../src/features/profile/ProfileScreen'
import { AuthContext, type AuthState } from '../../src/features/auth/AuthContext'
import type { PlayerProfile } from '../../src/lib/users'
import * as users from '../../src/lib/users'
import * as avatar from '../../src/lib/avatar'

/*
 * T-2.3 - the profile screen.
 *
 * The three sections save independently, which is the behaviour most worth
 * pinning down: a failed password change must not throw away a photo that
 * already saved, and each has a different failure mode.
 */

vi.mock('../../src/lib/firebase', () => ({ app: {}, auth: {}, db: {} }))

vi.mock('../../src/lib/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/users')>()
  return { ...actual, updateProfile: vi.fn() }
})

vi.mock('../../src/lib/avatar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/avatar')>()
  return { ...actual, resizeToAvatar: vi.fn() }
})

const testProfile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  uid: 'uid-jf',
  username: 'jf',
  displayName: 'JF',
  ...overrides,
})

function renderProfile(profile: PlayerProfile | null = testProfile()) {
  const changePassword = vi.fn().mockResolvedValue(undefined)
  const refresh = vi.fn().mockResolvedValue(undefined)
  const state: AuthState = {
    status: profile === null ? 'signed-out' : 'signed-in',
    profile,
    isAdmin: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    changePassword,
    refresh,
  }
  const ui: ReactElement = (
    <AuthContext.Provider value={state}>
      <ProfileScreen />
    </AuthContext.Provider>
  )
  return { ...render(ui), changePassword, refresh }
}

beforeEach(() => {
  vi.mocked(users.updateProfile).mockReset().mockResolvedValue(undefined)
  vi.mocked(avatar.resizeToAvatar).mockReset()
})

describe('ProfileScreen', () => {
  it('asks a signed-out visitor to sign in rather than rendering an empty form', () => {
    renderProfile(null)
    expect(screen.getByText(/sign in to see your profile/i)).toBeInTheDocument()
  })

  it('saves a new display name, trimmed', async () => {
    const { refresh } = renderProfile()

    const field = screen.getByLabelText(/what the others see/i)
    await userEvent.clear(field)
    await userEvent.type(field, '  Big Deal  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))

    expect(users.updateProfile).toHaveBeenCalledWith('uid-jf', { displayName: 'Big Deal' })
    expect(refresh).toHaveBeenCalled()
    expect(await screen.findByText('Name saved.')).toBeInTheDocument()
  })

  it('refuses a blank name instead of wiping it on the leaderboard', async () => {
    renderProfile()

    await userEvent.clear(screen.getByLabelText(/what the others see/i))
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot be blank/i)
    expect(users.updateProfile).not.toHaveBeenCalled()
  })

  it('shrinks a chosen photo before storing it', async () => {
    vi.mocked(avatar.resizeToAvatar).mockResolvedValue({
      ok: true,
      dataUri: 'data:image/webp;base64,SMALL',
    })
    renderProfile()

    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText(/choose a profile photo/i), file)

    expect(avatar.resizeToAvatar).toHaveBeenCalledWith(file)
    expect(users.updateProfile).toHaveBeenCalledWith('uid-jf', {
      avatar: 'data:image/webp;base64,SMALL',
    })
  })

  it('reports why a photo was rejected and stores nothing', async () => {
    // The input carries accept="image/*", so the picker already filters out a
    // text file. What still gets through is a file that claims to be an image
    // and will not decode - a truncated download, or a HEIC the browser refuses.
    vi.mocked(avatar.resizeToAvatar).mockResolvedValue({
      ok: false,
      reason: 'That image could not be read. Try another one.',
    })
    renderProfile()

    const file = new File(['not really a jpeg'], 'broken.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText(/choose a profile photo/i), file)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be read/i)
    expect(users.updateProfile).not.toHaveBeenCalled()
  })

  it('changes the password when both fields agree', async () => {
    const { changePassword } = renderProfile()

    await userEvent.type(screen.getByLabelText('New password'), 'longenough')
    await userEvent.type(screen.getByLabelText('Type it again'), 'longenough')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(changePassword).toHaveBeenCalledWith('longenough')
    expect(await screen.findByText('Password changed.')).toBeInTheDocument()
  })

  it('refuses a mistyped confirmation without calling Firebase', async () => {
    const { changePassword } = renderProfile()

    await userEvent.type(screen.getByLabelText('New password'), 'longenough')
    await userEvent.type(screen.getByLabelText('Type it again'), 'longenaugh')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i)
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('surfaces the Firebase reason when a password change is refused', async () => {
    const { changePassword } = renderProfile()
    // Someone who signed in days ago has to sign in again before Firebase will
    // let them set a new password. That has to read as an instruction, not a code.
    changePassword.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'auth/too-many-requests' }),
    )

    await userEvent.type(screen.getByLabelText('New password'), 'longenough')
    await userEvent.type(screen.getByLabelText('Type it again'), 'longenough')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i)
  })

  it('prompts for a new password when one was reset for them', () => {
    renderProfile(testProfile({ mustChangePassword: true }))
    expect(screen.getByRole('status')).toHaveTextContent(/password was reset for you/i)
  })

  it('does not nag a player whose password is their own', () => {
    renderProfile()
    expect(screen.queryByText(/password was reset for you/i)).not.toBeInTheDocument()
  })

  it('shows the stored photo when there is one', () => {
    renderProfile(testProfile({ avatar: 'data:image/webp;base64,ME' }))
    expect(screen.getByAltText(/your profile photo/i)).toHaveAttribute(
      'src',
      'data:image/webp;base64,ME',
    )
  })
})
