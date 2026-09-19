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

describe('friendships', () => {
  // The id is the two uids sorted, so a pair is always one document. ALICE is
  // 'alice-uid' and BOB is 'bob-uid', so alice sorts first.
  const PAIR = `${ALICE}_${BOB}`
  const request = (requestedBy: string, overrides: Record<string, unknown> = {}) => ({
    members: [ALICE, BOB],
    requestedBy,
    status: 'pending',
    ...overrides,
  })

  it('can be requested by a member of the pair', async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), 'friendships', PAIR), request(ALICE)))
  })

  it('cannot be requested on somebody else’s behalf', async () => {
    await assertFails(setDoc(doc(as(BOB), 'friendships', PAIR), request(ALICE)))
  })

  it('cannot be created between two other people', async () => {
    await assertFails(
      setDoc(doc(as(ADMIN), 'friendships', PAIR), request(ADMIN, { members: [ALICE, BOB] })),
    )
  })

  it('cannot arrive already accepted', async () => {
    await assertFails(
      setDoc(doc(as(ALICE), 'friendships', PAIR), request(ALICE, { status: 'accepted' })),
    )
  })

  it('cannot use an id that disagrees with its members', async () => {
    // Otherwise one pair could hold two documents, friends one way and pending
    // the other, forever.
    await assertFails(setDoc(doc(as(ALICE), 'friendships', 'something-else'), request(ALICE)))
  })

  it('cannot be created with the pair in the wrong order', async () => {
    await assertFails(
      setDoc(doc(as(BOB), 'friendships', `${BOB}_${ALICE}`), {
        members: [BOB, ALICE],
        requestedBy: BOB,
        status: 'pending',
      }),
    )
  })

  it('is accepted by the other person', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'friendships', PAIR), request(ALICE))
    })

    await assertSucceeds(
      setDoc(doc(as(BOB), 'friendships', PAIR), request(ALICE, { status: 'accepted' })),
    )
  })

  it('cannot be accepted by the person who asked', async () => {
    // The whole point of a request.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'friendships', PAIR), request(ALICE))
    })

    await assertFails(
      setDoc(doc(as(ALICE), 'friendships', PAIR), request(ALICE, { status: 'accepted' })),
    )
  })

  it('cannot be read by somebody outside the pair', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'friendships', PAIR), request(ALICE))
    })

    await assertFails(getDoc(doc(as(ADMIN), 'friendships', PAIR)))
  })

  it('can be read by either member', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'friendships', PAIR), request(ALICE))
    })

    await assertSucceeds(getDoc(doc(as(ALICE), 'friendships', PAIR)))
    await assertSucceeds(getDoc(doc(as(BOB), 'friendships', PAIR)))
  })

  it('can be removed by either member — declining and unfriending are the same act', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'friendships', PAIR), request(ALICE))
    })

    await assertSucceeds(deleteDoc(doc(as(BOB), 'friendships', PAIR)))
  })

  it('cannot be removed by an outsider', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'friendships', PAIR), request(ALICE))
    })

    await assertFails(deleteDoc(doc(as(ADMIN), 'friendships', PAIR)))
  })
})

describe('round invitations', () => {
  // ALICE is a player in ROUND; ADMIN is not.
  const invite = (fromUid: string, toUid: string, overrides: Record<string, unknown> = {}) => ({
    roundId: ROUND,
    toUid,
    fromUid,
    fromName: 'Alice',
    roomCode: 'QF7K',
    courseId: 'trangie',
    status: 'pending',
    ...overrides,
  })

  it('can be sent by a player in the round', async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), 'roundInvites', `${ROUND}_${ADMIN}`), invite(ALICE, ADMIN)),
    )
  })

  it('cannot be sent to a round you are not in', async () => {
    // Stops anybody who learns a round id inviting strangers into it.
    await assertFails(
      setDoc(doc(as(ADMIN), 'roundInvites', `${ROUND}_${BOB}`), invite(ADMIN, BOB)),
    )
  })

  it('cannot be sent in somebody else’s name', async () => {
    await assertFails(
      setDoc(doc(as(ALICE), 'roundInvites', `${ROUND}_${ADMIN}`), invite(BOB, ADMIN)),
    )
  })

  it('cannot use an id that disagrees with its round and recipient', async () => {
    await assertFails(
      setDoc(doc(as(ALICE), 'roundInvites', 'made-up-id'), invite(ALICE, ADMIN)),
    )
  })

  it('is readable by the person invited and by the sender, but nobody else', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'roundInvites', `${ROUND}_${BOB}`), invite(ALICE, BOB))
    })

    await assertSucceeds(getDoc(doc(as(BOB), 'roundInvites', `${ROUND}_${BOB}`)))
    await assertSucceeds(getDoc(doc(as(ALICE), 'roundInvites', `${ROUND}_${BOB}`)))
    await assertFails(getDoc(doc(as(ADMIN), 'roundInvites', `${ROUND}_${BOB}`)))
  })

  it('is answered only by the person invited', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'roundInvites', `${ROUND}_${BOB}`), invite(ALICE, BOB))
    })

    await assertSucceeds(
      setDoc(
        doc(as(BOB), 'roundInvites', `${ROUND}_${BOB}`),
        { status: 'accepted' },
        { merge: true },
      ),
    )
  })

  it('cannot be answered by the sender on the invitee’s behalf', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'roundInvites', `${ROUND}_${BOB}`), invite(ALICE, BOB))
    })

    await assertFails(
      setDoc(
        doc(as(ALICE), 'roundInvites', `${ROUND}_${BOB}`),
        { status: 'accepted' },
        { merge: true },
      ),
    )
  })

  it('can be taken back by the sender', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'roundInvites', `${ROUND}_${BOB}`), invite(ALICE, BOB))
    })

    await assertSucceeds(deleteDoc(doc(as(ALICE), 'roundInvites', `${ROUND}_${BOB}`)))
  })
})

describe('card votes', () => {
  // The document id is `{cardId}_{uid}`, which is what makes one vote per player
  // per card structural rather than hopeful. The rules check it matches.
  it('can be cast by a player in their own slot', async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), 'cardVotes', `mulligan_${ALICE}`), {
        cardId: 'mulligan',
        uid: ALICE,
        vote: 'up',
      }),
    )
  })

  it('cannot be written into another player’s slot', async () => {
    await assertFails(
      setDoc(doc(as(BOB), 'cardVotes', `mulligan_${ALICE}`), {
        cardId: 'mulligan',
        uid: ALICE,
        vote: 'up',
      }),
    )
  })

  it('cannot be cast under an id that does not match the voter', async () => {
    // Without the id check a player could hold unlimited votes on one card by
    // inventing new document ids, and the tally everyone sees would be worthless.
    await assertFails(
      setDoc(doc(as(ALICE), 'cardVotes', 'mulligan_extra'), {
        cardId: 'mulligan',
        uid: ALICE,
        vote: 'up',
      }),
    )
  })

  it('is readable by everyone, because the totals are shown to everyone', async () => {
    await assertSucceeds(getDoc(doc(as(BOB), 'cardVotes', `mulligan_${ALICE}`)))
  })

  it('cannot be touched by a signed-out visitor', async () => {
    await assertFails(
      setDoc(doc(anon(), 'cardVotes', `mulligan_${ALICE}`), {
        cardId: 'mulligan',
        uid: ALICE,
        vote: 'up',
      }),
    )
  })
})

describe('card suggestions', () => {
  const suggestion = (suggestedBy: string, overrides: Record<string, unknown> = {}) => ({
    cardId: 'two-club-special',
    title: 'Two Club Special',
    effect: 'Play the whole hole using only two clubs of your own choosing.',
    category: 'attack',
    timing: 'hole-start',
    target: 'opponent',
    active: true,
    suggestedBy,
    suggestedByName: 'Alice',
    status: 'pending',
    ...overrides,
  })

  it('can be created by the player who wrote it', async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), 'cardSuggestions', 'sug-1'), suggestion(ALICE)),
    )
  })

  it('cannot be attributed to somebody else', async () => {
    await assertFails(setDoc(doc(as(BOB), 'cardSuggestions', 'sug-2'), suggestion(ALICE)))
  })

  it('cannot arrive pre-approved', async () => {
    // Otherwise "the admin decides what is in the deck" means nothing.
    await assertFails(
      setDoc(doc(as(ALICE), 'cardSuggestions', 'sug-3'), suggestion(ALICE, { status: 'accepted' })),
    )
  })

  it('is readable by the player who wrote it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'cardSuggestions', 'sug-4'), suggestion(ALICE))
    })
    await assertSucceeds(getDoc(doc(as(ALICE), 'cardSuggestions', 'sug-4')))
  })

  it('is not readable by another player — a rejection is nobody else’s business', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'cardSuggestions', 'sug-5'), suggestion(ALICE))
    })
    await assertFails(getDoc(doc(as(BOB), 'cardSuggestions', 'sug-5')))
  })

  it('is readable by an admin, who has to decide on it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'cardSuggestions', 'sug-6'), suggestion(ALICE))
    })
    await assertSucceeds(getDoc(doc(as(ADMIN), 'cardSuggestions', 'sug-6')))
  })

  it('is decided by the admin alone', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'cardSuggestions', 'sug-7'), suggestion(ALICE))
    })

    await assertSucceeds(
      setDoc(doc(as(ADMIN), 'cardSuggestions', 'sug-7'), { status: 'accepted' }, { merge: true }),
    )
  })

  it('cannot be self-approved by the player who wrote it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'cardSuggestions', 'sug-8'), suggestion(ALICE))
    })

    await assertFails(
      setDoc(doc(as(ALICE), 'cardSuggestions', 'sug-8'), { status: 'accepted' }, { merge: true }),
    )
  })

  it('does not let a player write straight into the card catalogue', async () => {
    // The whole reason suggestions exist as a separate collection.
    await assertFails(
      setDoc(doc(as(ALICE), 'cards', 'two-club-special'), { title: 'Two Club Special' }),
    )
  })
})

describe('a player’s round history', () => {
  it('can be written by the player as they join a round', async () => {
    await assertSucceeds(
      setDoc(doc(as(ALICE), 'users', ALICE, 'rounds', ROUND), { courseId: 'trangie' }),
    )
  })

  it('can be read back by the player it belongs to', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'users', ALICE, 'rounds', ROUND)))
  })

  it('cannot be read by another player — your golf is your business', async () => {
    // Profiles are readable by everyone because the leaderboard needs names.
    // History is not, and rules do not cascade, so this is a separate decision.
    await assertFails(getDoc(doc(as(BOB), 'users', ALICE, 'rounds', ROUND)))
  })

  it('cannot be written by another player', async () => {
    await assertFails(
      setDoc(doc(as(BOB), 'users', ALICE, 'rounds', ROUND), { courseId: 'somewhere-else' }),
    )
  })

  it('cannot be touched by a signed-out visitor', async () => {
    await assertFails(getDoc(doc(anon(), 'users', ALICE, 'rounds', ROUND)))
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
