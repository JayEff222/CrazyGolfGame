import { lazy, Suspense, useState, type ReactNode } from 'react'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/useAuth'
import { SignInScreen } from '../features/auth/SignInScreen'
import { SyncIndicator } from '../features/offline/SyncIndicator'

/*
 * Lazily loaded so a player only downloads what they open. The mapper matters
 * most - it pulls in Leaflet and is used by one admin, once per course - but the
 * same applies to the card editor, the user list and the history screen.
 */
const YardageScreen = lazy(() =>
  import('../features/play/YardageScreen').then((m) => ({ default: m.YardageScreen })),
)

const RoundsHome = lazy(() =>
  import('../features/rounds').then((m) => ({ default: m.RoundsHome })),
)

const CardEditor = lazy(() =>
  import('../features/cards').then((m) => ({ default: m.CardEditor })),
)

const CardGallery = lazy(() =>
  import('../features/cards').then((m) => ({ default: m.CardGallery })),
)

const SuggestionReview = lazy(() =>
  import('../features/cards').then((m) => ({ default: m.SuggestionReview })),
)

const CourseMapper = lazy(() =>
  import('../features/admin/CourseMapper').then((m) => ({ default: m.CourseMapper })),
)

const UserListScreen = lazy(() =>
  import('../features/admin/UserListScreen').then((m) => ({ default: m.UserListScreen })),
)

const ProfileScreen = lazy(() =>
  import('../features/profile/ProfileScreen').then((m) => ({ default: m.ProfileScreen })),
)

const HistoryScreen = lazy(() =>
  import('../features/history').then((m) => ({ default: m.HistoryScreen })),
)

function Loading() {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <p className="text-lg font-semibold text-fairway-700">Loading…</p>
    </main>
  )
}

/**
 * Shows the player's user ID with a copy button.
 *
 * Firebase IDs mix O/0, I/l/1 and are 28 characters long, so transcribing one by
 * eye is a coin flip. A wrong character fails silently - the admin document simply
 * never matches - so the ID must be copyable, never typed.
 */
function UserIdCard({ uid }: { uid: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uid)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused (insecure context, permissions). The ID is
      // still selectable on screen, so this is a convenience, not the only route.
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-fairway-100 px-4 py-4">
      <p className="text-sm font-semibold text-fairway-800">Your user ID</p>
      <code className="font-mono text-sm break-all text-fairway-900 select-all">{uid}</code>
      <button
        type="button"
        onClick={() => void copy()}
        className="tap-target rounded-lg bg-fairway-700 px-4 text-base font-semibold text-white active:bg-fairway-800"
      >
        {copied ? 'Copied' : 'Copy user ID'}
      </button>
      <p className="text-sm text-fairway-700">
        Don&apos;t retype this — it mixes characters that look alike. Copy it.
      </p>
    </div>
  )
}

/** A pushed screen: one back button, one lazy boundary, the same on every route. */
function Pushed({
  onBack,
  fallback = 'Loading…',
  children,
}: {
  onBack: () => void
  fallback?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col">
      <button
        type="button"
        onClick={onBack}
        className="tap-target self-start px-5 text-base font-semibold text-fairway-700"
      >
        &lsaquo; Back
      </button>
      <Suspense fallback={<p className="p-6 text-fairway-700">{fallback}</p>}>{children}</Suspense>
    </div>
  )
}

function Clubhouse({ onOpen }: { onOpen: (screen: Screen) => void }) {
  const { profile, isAdmin, signOut } = useAuth()

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold text-fairway-700">
          G&apos;day, {profile?.displayName ?? 'golfer'}
        </h1>
        <SyncIndicator />
      </header>

      <button
        type="button"
        onClick={() => onOpen('rounds')}
        className="tap-target rounded-xl bg-fairway-700 px-6 py-4 text-lg font-bold text-white active:bg-fairway-800"
      >
        Play a round
      </button>

      <button
        type="button"
        onClick={() => onOpen('yardage')}
        className="tap-target rounded-xl border-2 border-fairway-600 px-6 py-4 text-lg font-bold text-fairway-800"
      >
        Yardage to the green
      </button>

      <button
        type="button"
        onClick={() => onOpen('history')}
        className="tap-target rounded-xl border-2 border-fairway-600 px-6 py-4 text-lg font-bold text-fairway-800"
      >
        Your golf
      </button>

      <button
        type="button"
        onClick={() => onOpen('deck')}
        className="tap-target rounded-xl border-2 border-fairway-600 px-6 py-4 text-lg font-bold text-fairway-800"
      >
        The deck
      </button>

      <button
        type="button"
        onClick={() => onOpen('profile')}
        className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
      >
        Your profile
      </button>

      {isAdmin && (
        <>
          <h2 className="mt-2 text-sm font-bold tracking-wide text-fairway-700 uppercase">Admin</h2>
          <button
            type="button"
            onClick={() => onOpen('course-mapper')}
            className="tap-target rounded-xl bg-fairway-700 px-6 text-base font-bold text-white active:bg-fairway-800"
          >
            Course mapper
          </button>
          <button
            type="button"
            onClick={() => onOpen('card-editor')}
            className="tap-target rounded-xl border-2 border-fairway-600 px-6 text-base font-bold text-fairway-800"
          >
            Edit the cards
          </button>
          <button
            type="button"
            onClick={() => onOpen('users')}
            className="tap-target rounded-xl border-2 border-fairway-600 px-6 text-base font-bold text-fairway-800"
          >
            Players
          </button>
        </>
      )}

      {profile !== null && <UserIdCard uid={profile.uid} />}
      <button
        type="button"
        onClick={() => void signOut()}
        className="tap-target rounded-xl border-2 border-fairway-300 px-6 text-base font-semibold text-fairway-800"
      >
        Sign out
      </button>
    </main>
  )
}

/**
 * Screen selection is a bit of state rather than a router.
 * A round is a single sitting on one device and the only thing anyone shares is
 * the room code, read aloud - so there is still nothing here that needs a URL.
 */
type Screen =
  | 'clubhouse'
  | 'course-mapper'
  | 'yardage'
  | 'rounds'
  | 'card-editor'
  | 'users'
  | 'profile'
  | 'history'
  | 'deck'
  | 'suggestions'

/** Screens only an admin may open. Checked here, and again by the rules. */
const ADMIN_ONLY: ReadonlySet<Screen> = new Set<Screen>([
  'course-mapper',
  'card-editor',
  'users',
  'suggestions',
])

function Gate() {
  const { status, isAdmin } = useAuth()
  const [screen, setScreen] = useState<Screen>('clubhouse')

  if (status === 'loading') return <Loading />
  if (status === 'signed-out') return <SignInScreen />

  const home = () => setScreen('clubhouse')
  // An admin screen opened by someone who is no longer an admin falls back to the
  // clubhouse rather than rendering a screen Firestore would refuse to fill.
  const current = ADMIN_ONLY.has(screen) && !isAdmin ? 'clubhouse' : screen

  switch (current) {
    case 'card-editor':
      return (
        <Pushed onBack={home}>
          <CardEditor />
        </Pushed>
      )
    case 'users':
      return (
        <Pushed onBack={home}>
          <UserListScreen />
        </Pushed>
      )
    case 'course-mapper':
      return (
        <Pushed onBack={home} fallback="Loading the map…">
          <CourseMapper />
        </Pushed>
      )
    case 'rounds':
      return (
        <Pushed onBack={home}>
          <RoundsHome />
        </Pushed>
      )
    case 'yardage':
      return (
        <Pushed onBack={home} fallback="Finding you…">
          <YardageScreen />
        </Pushed>
      )
    case 'profile':
      return (
        <Pushed onBack={home}>
          <ProfileScreen onDone={home} />
        </Pushed>
      )
    case 'history':
      return (
        <Pushed onBack={home}>
          <HistoryScreen />
        </Pushed>
      )
    case 'deck':
      return (
        <Pushed onBack={home}>
          <CardGallery
            onReviewSuggestions={isAdmin ? () => setScreen('suggestions') : undefined}
          />
        </Pushed>
      )
    case 'suggestions':
      return (
        <Pushed onBack={() => setScreen('deck')}>
          <SuggestionReview onDone={() => setScreen('deck')} />
        </Pushed>
      )
    default:
      return <Clubhouse onOpen={setScreen} />
  }
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
