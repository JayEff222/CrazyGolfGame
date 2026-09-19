import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, getDoc, setDoc, deleteDoc, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

/*
 * Rules are the only thing actually protecting this data, so they get tested like
 * code. Everything here runs against the Firestore emulator - no real project is
 * touched.
 *
 * Requires Java (the emulator is a JVM process). Run via `npm run test:rules`,
 * which starts the emulator for you. CI runs this on every push.
 */

let testEnv: RulesTestEnvironment

const ADMIN = 'admin-uid'
const ALICE = 'alice-uid'
const BOB = 'bob-uid'
const ROUND = 'round-1'

/** A signed-in user's database handle. */
const as = (uid: string): Firestore =>
  testEnv.authenticatedContext(uid).firestore() as unknown as Firestore

const anon = (): Firestore => testEnv.unauthenticatedContext().firestore() as unknown as Firestore

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'crazygolfgame-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  // Seed the fixtures that rules depend on, bypassing rules to set them up.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'admins', ADMIN), { note: 'JF' })
    await setDoc(doc(db, 'rounds', ROUND), {
      courseId: 'trangie',
      settings: { cardVisibility: 'secret' },
    })
    await setDoc(doc(db, 'rounds', ROUND, 'players', ALICE), { displayName: 'Alice' })
    await setDoc(doc(db, 'rounds', ROUND, 'players', BOB), { displayName: 'Bob' })
    await setDoc(doc(db, 'rounds', ROUND, 'hands', ALICE), { cards: ['mulligan'] })
    await setDoc(doc(db, 'courses', 'trangie'), { name: 'Trangie Golf Course' })
  })
})

describe('signed-out users', () => {
  it('cannot read a course', async () => {
    await assertFails(getDoc(doc(anon(), 'courses', 'trangie')))
  })

  it('cannot read a round', async () => {
    await assertFails(getDoc(doc(anon(), 'rounds', ROUND)))
  })

  it('cannot write anything', async () => {
    await assertFails(setDoc(doc(anon(), 'users', ALICE), { displayName: 'hacker' }))
  })
})

describe('course data', () => {
  it('is readable by any signed-in player', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'courses', 'trangie')))
  })

  it('cannot be edited by a player - no moving the green closer to your ball', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'courses', 'trangie'), { name: 'Alice Links' }))
  })

  it('can be edited by an admin', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'courses', 'trangie'), { name: 'Trangie' }))
  })
})

describe('profiles', () => {
  it('can be written by their owner', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), 'users', ALICE), { displayName: 'Alice' }))
  })

  it('cannot be written by someone else', async () => {
    await assertFails(setDoc(doc(as(BOB), 'users', ALICE), { displayName: 'Bob was here' }))
  })

  it('can be written by an admin, for the password reset flow', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'users', ALICE), { mustChangePassword: true }))
  })

  it('are readable by playing partners, for the leaderboard', async () => {
    await assertSucceeds(getDoc(doc(as(BOB), 'users', ALICE)))
  })
})

describe('scores', () => {
  it('can be written by the player they belong to', async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), 'rounds', ROUND, 'scores', `${ALICE}_1`), {
        uid: ALICE,
        hole: 1,
        strokes: 4,
      }),
    )
  })

  it("cannot be written on another player's behalf", async () => {
    await assertFails(
      setDoc(doc(as(BOB), 'rounds', ROUND, 'scores', `${ALICE}_1`), {
        uid: ALICE,
        hole: 1,
        strokes: 12,
      }),
    )
  })

  it('cannot be written by someone who is not in the round', async () => {
    await assertFails(
      setDoc(doc(as('stranger-uid'), 'rounds', ROUND, 'scores', 'stranger-uid_1'), {
        uid: 'stranger-uid',
        hole: 1,
        strokes: 3,
      }),
    )
  })
})

describe('hands', () => {
  it('are readable by their owner', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'rounds', ROUND, 'hands', ALICE)))
  })

  it('are NOT readable by a rival when the round is set to secret', async () => {
    await assertFails(getDoc(doc(as(BOB), 'rounds', ROUND, 'hands', ALICE)))
  })

  it('ARE readable by a rival when the round is set to open', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'rounds', ROUND), {
        courseId: 'trangie',
        settings: { cardVisibility: 'open' },
      })
    })
    await assertSucceeds(getDoc(doc(as(BOB), 'rounds', ROUND, 'hands', ALICE)))
  })

  it("cannot be modified by a rival", async () => {
    await assertFails(
      setDoc(doc(as(BOB), 'rounds', ROUND, 'hands', ALICE), { cards: [] }),
    )
  })
})

describe('the event feed', () => {
  it('accepts an entry from a player speaking as themselves', async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), 'rounds', ROUND, 'events', 'e1'), {
        type: 'card_played',
        actorUid: ALICE,
        holeNumber: 7,
      }),
    )
  })

  it('rejects an entry that impersonates another player', async () => {
    await assertFails(
      setDoc(doc(as(BOB), 'rounds', ROUND, 'events', 'e2'), {
        type: 'card_played',
        actorUid: ALICE,
        holeNumber: 7,
      }),
    )
  })

  it('is append-only - an entry cannot be rewritten', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'rounds', ROUND, 'events', 'e3'), {
        type: 'card_played',
        actorUid: ALICE,
      })
    })
    await assertFails(
      setDoc(doc(as(ALICE), 'rounds', ROUND, 'events', 'e3'), {
        type: 'card_played',
        actorUid: ALICE,
        strokes: 1,
      }),
    )
  })

  it('is append-only - an entry cannot be deleted', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'rounds', ROUND, 'events', 'e4'), {
        type: 'card_played',
        actorUid: ALICE,
      })
    })
    await assertFails(deleteDoc(doc(as(ALICE), 'rounds', ROUND, 'events', 'e4')))
  })
})

describe('the admin roster', () => {
  it('cannot be written from the app, even by an admin', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'admins', BOB), { note: 'promote me' }))
  })

  it('cannot be self-assigned by a player', async () => {
    await assertFails(setDoc(doc(as(BOB), 'admins', BOB), { note: 'I am admin now' }))
  })
})
