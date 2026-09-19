import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  limit,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { TeeId } from './course'

/*
 * The shared round model.
 *
 * Every screen that touches a round - the lobby, the scorecard, the leaderboard,
 * the card feed - reads and writes through this file, so the shape of a round is
 * defined once. Firestore paths live here too; no component should be assembling
 * document paths by hand.
 */

export type GameType = 'stroke'
export type RoundStatus = 'lobby' | 'in-progress' | 'complete'
export type CardVisibility = 'secret' | 'open'
export type DealMode = 'even' | 'fixed' | 'same'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4

export interface RoundSettings {
  readonly cardVisibility: CardVisibility
  readonly dealMode: DealMode
  /** Only meaningful when dealMode is 'fixed'. */
  readonly cardsPerPlayer: number | null
  readonly selectedCardIds: readonly string[]
}

export interface Round {
  readonly id: string
  readonly courseId: string
  readonly teeId: TeeId
  readonly gameType: GameType
  readonly status: RoundStatus
  readonly roomCode: string
  readonly createdBy: string
  readonly settings: RoundSettings
}

export interface RoundPlayer {
  readonly uid: string
  readonly displayName: string
  readonly avatar?: string
  /** Playing order, assigned on join. */
  readonly order: number
}

export interface HoleScore {
  readonly uid: string
  readonly hole: number
  readonly strokes: number
  /** Reserved for a future release; nothing writes these yet. */
  readonly putts?: number
  readonly clubs?: readonly string[]
}

/**
 * Characters a room code can use.
 *
 * Deliberately excludes O, 0, I, 1, L and S/5 - a room code gets read aloud across
 * a fairway or squinted at on a phone in sunlight, and we already learned on the
 * admin user id how expensive an ambiguous character is.
 */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ2346789'
export const ROOM_CODE_LENGTH = 4

export function generateRoomCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)]
  }
  return code
}

/** Normalises whatever a player typed into a comparable room code. */
export function normaliseRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s/g, '')
}

// ---------------------------------------------------------------------------
// Firestore paths — the single place document paths are constructed.
// ---------------------------------------------------------------------------

const roundsRef = () => collection(db, 'rounds')
const roundRef = (roundId: string) => doc(db, 'rounds', roundId)
const playersRef = (roundId: string) => collection(db, 'rounds', roundId, 'players')
const playerRef = (roundId: string, uid: string) => doc(db, 'rounds', roundId, 'players', uid)
const scoresRef = (roundId: string) => collection(db, 'rounds', roundId, 'scores')
const scoreRef = (roundId: string, uid: string, hole: number) =>
  doc(db, 'rounds', roundId, 'scores', `${uid}_${hole}`)
const eventsRef = (roundId: string) => collection(db, 'rounds', roundId, 'events')

const readRound = (id: string, data: Record<string, unknown>): Round => ({
  id,
  courseId: String(data.courseId ?? ''),
  teeId: (data.teeId as TeeId) ?? 'mens',
  gameType: (data.gameType as GameType) ?? 'stroke',
  status: (data.status as RoundStatus) ?? 'lobby',
  roomCode: String(data.roomCode ?? ''),
  createdBy: String(data.createdBy ?? ''),
  settings: (data.settings as RoundSettings) ?? {
    cardVisibility: 'secret',
    dealMode: 'even',
    cardsPerPlayer: null,
    selectedCardIds: [],
  },
})

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateRoundInput {
  readonly courseId: string
  readonly teeId: TeeId
  readonly createdBy: string
  readonly settings: RoundSettings
}

/**
 * Creates a round in the lobby state and returns it.
 *
 * Retries on room-code collision rather than trusting randomness - with a 4
 * character code from a 29 character alphabet a clash is unlikely but not
 * impossible, and joining the wrong group's round would be baffling to debug.
 */
export async function createRound(input: CreateRoundInput): Promise<Round> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode()
    const existing = await findRoundByCode(roomCode)
    if (existing !== null) continue

    const ref = doc(roundsRef())
    await setDoc(ref, {
      courseId: input.courseId,
      teeId: input.teeId,
      gameType: 'stroke' satisfies GameType,
      status: 'lobby' satisfies RoundStatus,
      roomCode,
      createdBy: input.createdBy,
      settings: input.settings,
      createdAt: serverTimestamp(),
    })
    return {
      id: ref.id,
      courseId: input.courseId,
      teeId: input.teeId,
      gameType: 'stroke',
      status: 'lobby',
      roomCode,
      createdBy: input.createdBy,
      settings: input.settings,
    }
  }
  throw new Error('Could not allocate a room code. Try again.')
}

export async function findRoundByCode(roomCode: string): Promise<Round | null> {
  const snapshot = await getDocs(
    query(roundsRef(), where('roomCode', '==', normaliseRoomCode(roomCode)), limit(1)),
  )
  const first = snapshot.docs[0]
  return first ? readRound(first.id, first.data()) : null
}

export async function loadRound(roundId: string): Promise<Round | null> {
  const snapshot = await getDoc(roundRef(roundId))
  return snapshot.exists() ? readRound(snapshot.id, snapshot.data()) : null
}

/** Adds the signed-in player to a round. A player only ever adds themselves. */
export async function joinRound(
  roundId: string,
  player: Omit<RoundPlayer, 'order'> & { order?: number },
): Promise<void> {
  const existing = await getDocs(playersRef(roundId))
  await setDoc(
    playerRef(roundId, player.uid),
    {
      uid: player.uid,
      displayName: player.displayName,
      avatar: player.avatar ?? null,
      order: player.order ?? existing.size,
      joinedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function leaveRound(roundId: string, uid: string): Promise<void> {
  await setDoc(playerRef(roundId, uid), { left: true }, { merge: true })
}

export async function setRoundStatus(roundId: string, status: RoundStatus): Promise<void> {
  await updateDoc(roundRef(roundId), {
    status,
    ...(status === 'in-progress' ? { startedAt: serverTimestamp() } : {}),
    ...(status === 'complete' ? { completedAt: serverTimestamp() } : {}),
  })
}

/**
 * Records a score for one player on one hole.
 *
 * The document id is `{uid}_{hole}`, so two players entering scores at the same
 * moment write to different documents and can never collide, and re-entering a
 * hole overwrites cleanly instead of appending.
 */
export async function setScore(
  roundId: string,
  score: HoleScore,
  actorUid: string,
): Promise<void> {
  await setDoc(
    scoreRef(roundId, score.uid, score.hole),
    {
      uid: score.uid,
      hole: score.hole,
      strokes: score.strokes,
      ...(score.putts === undefined ? {} : { putts: score.putts }),
      ...(score.clubs === undefined ? {} : { clubs: score.clubs }),
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    },
    { merge: true },
  )
}

export interface RoundEvent {
  readonly type: 'card_played' | 'round_started' | 'round_completed'
  readonly actorUid: string
  readonly targetUid?: string
  readonly holeNumber?: number
  readonly cardId?: string
}

/** Appends to the round's audit trail. Rules make these write-once. */
export async function recordEvent(roundId: string, event: RoundEvent): Promise<void> {
  const ref = doc(eventsRef(roundId))
  await setDoc(ref, {
    ...event,
    targetUid: event.targetUid ?? null,
    holeNumber: event.holeNumber ?? null,
    cardId: event.cardId ?? null,
    at: serverTimestamp(),
  })
}

// ---------------------------------------------------------------------------
// Live subscriptions — how every screen stays in sync
// ---------------------------------------------------------------------------

export function subscribeRound(roundId: string, onChange: (round: Round | null) => void): Unsubscribe {
  return onSnapshot(roundRef(roundId), (snapshot) => {
    onChange(snapshot.exists() ? readRound(snapshot.id, snapshot.data()) : null)
  })
}

export function subscribePlayers(
  roundId: string,
  onChange: (players: RoundPlayer[]) => void,
): Unsubscribe {
  return onSnapshot(playersRef(roundId), (snapshot) => {
    const players = snapshot.docs
      .map((d) => d.data())
      .filter((d) => d.left !== true)
      .map((d) => ({
        uid: String(d.uid),
        displayName: String(d.displayName ?? ''),
        avatar: typeof d.avatar === 'string' ? d.avatar : undefined,
        order: Number(d.order ?? 0),
      }))
      .sort((a, b) => a.order - b.order)
    onChange(players)
  })
}

export function subscribeScores(
  roundId: string,
  onChange: (scores: HoleScore[]) => void,
): Unsubscribe {
  return onSnapshot(scoresRef(roundId), (snapshot) => {
    onChange(
      snapshot.docs.map((d) => {
        const data = d.data()
        return {
          uid: String(data.uid),
          hole: Number(data.hole),
          strokes: Number(data.strokes),
          putts: data.putts === undefined ? undefined : Number(data.putts),
          clubs: Array.isArray(data.clubs) ? (data.clubs as string[]) : undefined,
        }
      }),
    )
  })
}
