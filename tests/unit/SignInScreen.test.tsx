import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext, type AuthState } from '../../src/features/auth/AuthContext'
import { SignInScreen } from '../../src/features/auth/SignInScreen'

/*
 * The screen is tested against a stubbed context rather than a live Firebase
 * connection. What matters here is the behaviour a player sees: which mode they
 * are in, what gets submitted, and whether a failure is explained in words they
 * can act on. The Firebase calls themselves are covered by the rules tests.
 */

const signIn = vi.fn()
const signUp = vi.fn()

const stubAuth = (overrides: Partial<AuthState> = {}): AuthState => ({
  status: 'signed-out',
  profile: null,
  isAdmin: false,
  signIn,
  signUp,
  signOut: vi.fn(),
  changePassword: vi.fn(),
  refresh: vi.fn(),
  ...overrides,
})

const renderScreen = (auth: AuthState = stubAuth()) =>
  render(
    <AuthContext.Provider value={auth}>
      <SignInScreen />
    </AuthContext.Provider>,
  )

beforeEach(() => {
  signIn.mockReset().mockResolvedValue(undefined)
  signUp.mockReset().mockResolvedValue(undefined)
})

describe('SignInScreen', () => {
  it('starts in sign-in mode', () => {
    renderScreen()
    expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true')
  })

  it('signs in with what was typed', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.type(screen.getByLabelText('Username'), 'jfvanstaden')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(signIn).toHaveBeenCalledWith('jfvanstaden', 'secret123')
    expect(signUp).not.toHaveBeenCalled()
  })

  it('switches to creating an account', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('tab', { name: 'Create account' }))
    await user.type(screen.getByLabelText('Username'), 'dave')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(signUp).toHaveBeenCalledWith('dave', 'secret123')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('shows the password length hint only when creating an account', async () => {
    const user = userEvent.setup()
    renderScreen()

    expect(screen.queryByText(/at least 6 characters/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Create account' }))
    expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument()
  })

  it('explains a failure in plain words rather than an error code', async () => {
    const user = userEvent.setup()
    const firebaseError = Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), {
      code: 'auth/invalid-credential',
    })
    signIn.mockRejectedValue(firebaseError)
    renderScreen()

    await user.type(screen.getByLabelText('Username'), 'jf')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Wrong username or password.')
    expect(alert).not.toHaveTextContent('auth/')
  })

  it('does not reveal whether the username exists', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/user-not-found' }))
    renderScreen()

    await user.type(screen.getByLabelText('Username'), 'nobody')
    await user.type(screen.getByLabelText('Password'), 'whatever123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    // Same wording as a wrong password, so an outsider learns nothing.
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.')
  })

  it('surfaces our own validation message verbatim', async () => {
    const user = userEvent.setup()
    signUp.mockRejectedValue(new Error('Usernames need at least 3 characters.'))
    renderScreen()

    await user.click(screen.getByRole('tab', { name: 'Create account' }))
    await user.type(screen.getByLabelText('Username'), 'jf')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Usernames need at least 3 characters.')
  })

  it('clears an error when switching mode, so it does not linger confusingly', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/invalid-credential' }))
    renderScreen()

    await user.type(screen.getByLabelText('Username'), 'jf')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Create account' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not capitalise or autocorrect the username field', () => {
    renderScreen()
    const field = screen.getByLabelText('Username')
    expect(field).toHaveAttribute('autocapitalize', 'none')
    expect(field).toHaveAttribute('autocorrect', 'off')
  })
})
