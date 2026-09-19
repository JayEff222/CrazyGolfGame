import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { createRound, joinRound, MAX_PLAYERS } from '../../lib/rounds'
import type { TeeId } from '../../lib/course'
import type { StoredCourse } from '../../lib/courseData'
import { listCourses, loadTeeLengths, type TeeLengths } from './roundsData'
import { rememberActiveRound } from './activeRound'
import { CardPicker } from '../cards'
import { loadCatalogue } from '../../lib/cardsData'
import type { Card } from '../../lib/cards'
import { ChoiceGroup, type Choice } from './ChoiceGroup'
import { GAME_TYPES, PLANNED_GAME_TYPES } from './gameTypes'
import {
  DEAL_MODE_CHOICES,
  DEFAULT_SETTINGS_DRAFT,
  MAX_CARDS_PER_PLAYER,
  MIN_CARDS_PER_PLAYER,
  TEE_CHOICES,
  VISIBILITY_CHOICES,
  buildSettings,
  clampCardsPerPlayer,
  type SettingsDraft,
} from './roundRules'

interface CreateRoundScreenProps {
  readonly onCreated: (roundId: string) => void
  readonly onCancel: () => void
}

/**
 * T-3.1 — setting up a round.
 *
 * Everything here is chosen once, standing on the first tee, usually one-handed
 * while someone else is hitting. Every control is a 3rem row and the whole form
 * is one column so it can be thumbed through without hunting.
 */
export function CreateRoundScreen({ onCreated, onCancel }: CreateRoundScreenProps) {
  const { profile } = useAuth()

  const [courses, setCourses] = useState<StoredCourse[] | null>(null)
  const [coursesFailed, setCoursesFailed] = useState(false)
  const [courseId, setCourseId] = useState<string>('')
  const [teeId, setTeeId] = useState<TeeId>('mens')
  const [teeLengths, setTeeLengths] = useState<TeeLengths>({})
  const [gameType, setGameType] = useState(GAME_TYPES[0]?.value ?? 'stroke')
  const [draft, setDraft] = useState<SettingsDraft>(DEFAULT_SETTINGS_DRAFT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    listCourses()
      .then((loaded) => {
        if (!live) return
        setCourses(loaded)
        setCourseId((current) => current || (loaded[0]?.courseId ?? ''))
      })
      .catch(() => {
        if (live) setCoursesFailed(true)
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (courseId === '') return
    let live = true
    void loadTeeLengths(courseId).then((lengths) => {
      if (live) setTeeLengths(lengths)
    })
    return () => {
      live = false
    }
  }, [courseId])

  const [catalogue, setCatalogue] = useState<Card[]>([])
  /*
   * Cards the catalogue could not read. Surfaced rather than discarded: this
   * screen counts "N cards in play", and a card that silently failed to parse
   * makes that number quietly wrong with nothing on screen to explain it. That
   * is exactly how the notes bug hid - see lib/cardsData.ts.
   */
  const [unreadable, setUnreadable] = useState<readonly string[]>([])
  useEffect(() => {
    let live = true
    loadCatalogue()
      .then((loaded) => {
        if (!live) return
        setCatalogue([...loaded.cards])
        setUnreadable(loaded.skipped.map((s) => s.id))
      })
      .catch(() => {
        // An empty catalogue is a valid round - you just play straight golf.
      })
    return () => {
      live = false
    }
  }, [])

  const setCardsPerPlayer = (next: number) =>
    setDraft((current) => ({ ...current, cardsPerPlayer: clampCardsPerPlayer(next) }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (profile === null) return
    if (courseId === '') {
      setError('Pick a course first.')
      return
    }

    setError(null)
    setBusy(true)
    try {
      const round = await createRound({
        courseId,
        teeId,
        createdBy: profile.uid,
        settings: buildSettings(draft),
      })
      // The person who set the round up is a player in it, not a spectator - and
      // the rules only let a player write events, so this has to happen before
      // they can start it.
      await joinRound(round.id, {
        uid: profile.uid,
        displayName: profile.displayName,
        avatar: profile.avatar,
      })
      rememberActiveRound(profile.uid, round.id)
      onCreated(round.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the round. Try again.')
      setBusy(false)
    }
  }

  const courseChoices: Choice<string>[] = (courses ?? []).map((course) => ({
    value: course.courseId,
    label: course.name,
    blurb: `${course.holeCount} holes`,
  }))

  const teeChoices: Choice<TeeId>[] = TEE_CHOICES.map((choice) => {
    const metres = teeLengths[choice.value]
    return {
      value: choice.value,
      label: choice.label,
      blurb: metres === undefined || metres === 0 ? undefined : `${metres.toLocaleString()} m`,
    }
  })

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-7 px-5 py-8">
      <header className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="tap-target self-start text-base font-semibold text-fairway-700"
        >
          ‹ Back
        </button>
        <h1 className="font-display text-3xl font-bold text-fairway-700">New round</h1>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-7">
        {courses === null && !coursesFailed && <p className="text-fairway-700">Loading courses…</p>}
        {coursesFailed && (
          <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base text-chaos-600">
            Could not load the courses. Check your signal and try again.
          </p>
        )}
        {courses !== null && courses.length === 0 && (
          <p role="alert" className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base text-chaos-600">
            No courses have been set up yet.
          </p>
        )}
        {courseChoices.length > 0 && (
          <ChoiceGroup legend="Course" value={courseId} choices={courseChoices} onChange={setCourseId} />
        )}

        <ChoiceGroup legend="Tees" value={teeId} choices={teeChoices} onChange={setTeeId} />

        <ChoiceGroup
          legend="Game"
          value={gameType}
          choices={GAME_TYPES.map((option) => ({
            value: option.value,
            label: option.label,
            blurb: option.blurb,
          }))}
          onChange={setGameType}
          planned={PLANNED_GAME_TYPES}
        />

        <section className="flex flex-col gap-5 rounded-2xl bg-white p-4 ring-2 ring-fairway-100">
          <h2 className="font-display text-xl font-bold text-fairway-800">Crazy Cards</h2>

          <ChoiceGroup
            legend="Hands"
            value={draft.cardVisibility}
            choices={VISIBILITY_CHOICES}
            onChange={(cardVisibility) => setDraft((current) => ({ ...current, cardVisibility }))}
          />

          <ChoiceGroup
            legend="Dealing"
            value={draft.dealMode}
            choices={DEAL_MODE_CHOICES}
            onChange={(dealMode) => setDraft((current) => ({ ...current, dealMode }))}
          />

          {draft.dealMode === 'fixed' && (
            <div className="flex flex-col gap-2">
              <p id="cards-per-player-label" className="text-base font-semibold text-fairway-900">
                Cards per player
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  aria-label="Fewer cards"
                  disabled={draft.cardsPerPlayer <= MIN_CARDS_PER_PLAYER}
                  onClick={() => setCardsPerPlayer(draft.cardsPerPlayer - 1)}
                  className="tap-target rounded-xl border-2 border-fairway-300 px-5 text-2xl font-bold text-fairway-800 disabled:opacity-40"
                >
                  −
                </button>
                <output
                  aria-labelledby="cards-per-player-label"
                  className="font-display min-w-12 text-center text-3xl font-bold text-fairway-900"
                >
                  {draft.cardsPerPlayer}
                </output>
                <button
                  type="button"
                  aria-label="More cards"
                  disabled={draft.cardsPerPlayer >= MAX_CARDS_PER_PLAYER}
                  onClick={() => setCardsPerPlayer(draft.cardsPerPlayer + 1)}
                  className="tap-target rounded-xl border-2 border-fairway-300 px-5 text-2xl font-bold text-fairway-800 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t-2 border-fairway-100 pt-4">
            {unreadable.length > 0 && (
              <p
                role="alert"
                className="rounded-xl bg-flag-400/25 px-4 py-3 text-sm text-fairway-900"
              >
                {unreadable.length} card{unreadable.length === 1 ? '' : 's'} could not be read and
                will not be dealt: {unreadable.join(', ')}.
              </p>
            )}

            <div>
              <h3 className="text-base font-semibold text-fairway-900">Which cards are in play</h3>
              <p className="text-sm text-fairway-700">
                Tap to include or exclude. The full rule is on each card.
              </p>
            </div>
            <CardPicker
              cards={catalogue}
              selectedIds={draft.selectedCardIds ?? []}
              onChange={(selectedCardIds) =>
                setDraft((current) => ({ ...current, selectedCardIds }))
              }
              minimumWanted={
                draft.dealMode === 'fixed' ? draft.cardsPerPlayer * MAX_PLAYERS : undefined
              }
            />
          </div>
        </section>

        {error !== null && (
          <p
            role="alert"
            className="rounded-xl bg-chaos-500/10 px-4 py-3 text-base font-medium text-chaos-600"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || courseId === ''}
          className="tap-target rounded-xl bg-fairway-700 px-6 text-lg font-bold text-white transition active:bg-fairway-800 disabled:opacity-60"
        >
          {busy ? 'Setting up…' : 'Create round'}
        </button>
      </form>
    </main>
  )
}
