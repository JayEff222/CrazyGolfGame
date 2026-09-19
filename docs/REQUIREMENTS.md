# CrazyGolfGame — Requirements

**Owner:** JF van Staden
**Repo:** https://github.com/JayEff222/CrazyGolfGame
**Status:** Phases 0–7 complete and deployed — playable end to end. Offline hardening (Phase 8) and polish (Phase 9) outstanding.
**Last updated:** 2026-09-19

This is the living requirements document. Every decision, clarification and change
gets recorded here as we go. If something in the code contradicts this document,
this document is wrong and must be updated — not the other way around.

---

## 1. Purpose

A golf scoring app for JF, his family and close friends, with a "Crazy Cards"
side-game layered on top of a normal round. Private use only. Not commercial,
no ads, no in-app purchases, no profit motive. It must cost nothing to run.

---

## 2. Scope boundaries

| In scope (v1) | Out of scope |
|---|---|
| Live shared scoring for one group | Multiple simultaneous groups |
| GPS distance to green centre | Distance to hazards, front/back of green |
| Crazy Cards dealing and play tracking | App-enforced card effects (honour system only) |
| Trangie Golf Course | Other courses (structure supports them, data comes later) |
| Stroke play | Stableford, match play, Ambrose (structure supports, UI later) |

---

## 3. Users and access

- **Players:** 2–4 per round. Only ever one group playing at a time.
- **Devices:** must work on any device — iOS, Android, desktop. One codebase.
- **Accounts:** username + password. No email address. Username is unique and is
  the display identity.
- **Password reset: there is none.** Decided 2026-09-19, after the original design
  (an admin screen that sets a password to `123456`) turned out to be impossible to
  build without breaking a hard constraint.

  > **Why it cannot be built.** A password lives in Firebase Auth, not Firestore, so
  > no security rule can grant access to it. The client SDK's `updatePassword` acts
  > only on the currently signed-in user and takes no uid. The admin API that *does*
  > take a uid, `projects.accounts:update`, requires a Google OAuth credential with
  > `cloud-platform` scope and the `firebaseauth.users.update` permission — a
  > project-admin credential which, shipped in a phone app, would hand every player
  > control of the entire project. Running it server-side instead means Cloud
  > Functions, which requires the paid Blaze plan and breaks §5's $0 rule. And
  > `sendPasswordResetEmail` is dead here because accounts are
  > `<username>@crazygolf.invalid`, which by RFC 2606 can never receive mail.
  > All four checked against the Firebase documentation rather than assumed.

  **What exists instead:** an admin **user list** (T-2.4), so JF can at least see who
  has an account — which also covers Q-4, since a stranger signing up would show up
  there. A player who forgets their password has no route back in, and the sign-in
  screen says so plainly rather than promising a reset that cannot happen.

  **Options still open** if this ever bites:
  1. Let a player optionally attach a real email address, enabling Firebase's own
     reset flow — free and serverless, but it changes "no email address" above.
  2. JF deletes the Auth account, freeing the username so they can sign up again.
     Costs them their uid, which detaches their round history.

  The `mustChangePassword` flag and its prompt on the profile screen are built and
  wired, so whichever option is chosen later needs no further UI.
- **Rejoin:** a player whose phone dies can log back in and land straight back in
  the in-progress round as themselves.

---

## 4. Functional requirements

### 4.1 Round lifecycle
- Create a round: pick course, pick game type (stroke play default), set card options.
- Other players join via room code.
- Lobby shows joined players; admin starts the round.
- On start, cards are dealt and everyone lands on hole 1.
- Round history is kept permanently.

### 4.2 Scoring
- Each player enters **their own** score per hole. Enforced in the security rules,
  not only in the UI — the app never renders a control that would write another
  player's score, because Firestore would refuse it anyway.
- Any previously played hole can be edited at any time during the round.
- A score is between **1 and 15 strokes**. Clamped on the way in, so a mis-tap
  cannot put a 150 on the card.
- Live leaderboard visible to all players, updating in real time.
- The leaderboard **ranks on to-par over the holes each player has actually
  played**, not on total strokes. Mid-round, total strokes would rank a player
  thru 3 above one thru 12 regardless of how either is playing, and would put a
  player who has not teed off on top with zero.

  > **Added 2026-09-19 (Phase 4).** §9 previously deferred a to-par column. That
  > was written before it was clear that ranking a *partial* round on raw strokes
  > is simply wrong, so to-par and "thru N" ship as the primary columns and total
  > strokes is the secondary one.
- **Future:** allow the group to edit anyone's score (deferred, schema supports it).
- **Future:** putts and club-used per shot (deferred — fields reserved in the schema now).

### 4.3 GPS and course view
- Distance to **centre of green only**, in metres. ±10 m accuracy is acceptable.
- Hole view shows a satellite image of the hole with **the player marked** and
  **the green marked**.
- Current hole auto-detected from GPS, with a manual override.

  > **Clarified 2026-09-19 while building T-5.4.** Detection takes the nearest
  > mapped **tee or green** — both ends, because greens alone flip you to the next
  > hole as you walk off the last one, and tees alone lose you through the whole
  > approach. Anything beyond **300 m** from every anchor is "not on a hole" rather
  > than a guess; Trangie's longest hole is 512 m, so mid-fairway there is ~256 m
  > from both ends and still detected.
  >
  > **The override is sticky.** One manual tap on a hole switches auto-detect off
  > and it stays off until the player turns it back on. Standing between the 9th
  > green and the 10th tee, detection flips back and forth; if the player has gone
  > looking at another hole's yardage, the screen must not be dragged back under
  > their thumb. Re-enabling auto does not move the hole until the next fix.
- Easy hole switching, 1–18.
- GPS only runs while the distance screen is open, plus a screen wake lock.

  > The wake lock degrades silently. It is absent on older iOS and refused under
  > battery saver, and the browser drops it every time the page is hidden without
  > ever giving it back — so it is re-acquired on `visibilitychange`. A screen that
  > dims is a mild annoyance; an error banner about it mid-round is worse.

### 4.4 Crazy Cards
- **Catalogue:** cards are created and edited **inside the app** by the admin, on
  a phone. No code change or redeploy needed to tweak a card between play tests.
- **Dealing modes**, chosen by the admin at setup:
  1. Even split of the selected cards across players
  2. Admin sets a fixed number of cards per player, drawn at random
  3. Everyone gets an identical set of cards
  Leftover cards after an even split are **discarded**.
- **Hand visibility** is chosen at setup: **secret** (only you see your hand) or
  **open** (everyone sees everyone's hand).
- **Targeting:** a card may target another player. The target is **notified**.
- **Enforcement:** honour system. The app never changes a score because of a card.
  It **does** record what was played, by whom, against whom, on which hole, and when.
- **Timing:** each card declares its own legal timing (anytime / tee only / green
  only / etc.). The card text states the rule; players self-enforce.
- **Retroactive play is allowed.** A card may be played after a shot has been hit.
  The guide is that the window closes when the next player hits — but on the tee,
  anyone may still be made to retake right up until the group leaves the tee box.
  **The app does not enforce any of this.** It shows each card's stated timing and
  records what was played and when; the group settles the rest. Deliberately loose:
  a strict cutoff would kill the best moment in the game, which is playing a card
  on someone just as they walk off the tee pleased with themselves.
- A played card is marked used — still visible, but disabled.
- Unplayed cards may be carried to the end of the round; there is no forced use.
- The admin **cannot** void or cancel a card once played.
- An **event feed** shows all card plays to the whole group.
- No rarity tiers.
- **Every player can read the whole deck** outside a round, not just the cards in
  their hand. A card is honour-system, so knowing what is in the deck before you
  are stood on a tee arguing about it is most of the game.
- **Players rate cards** thumbs up or thumbs down — one vote each per card,
  changeable, and the totals are visible to everyone. Added 2026-09-19 as the way
  Q-3 ("which of these cards actually work") gets answered without anyone having
  to hold an opinion until the drive home.
- **Players can suggest cards.** Anyone writes a card and sends it to the admin,
  who accepts it into the deck or rejects it with a reason. The suggester is shown
  the decision. A suggestion is validated exactly as an admin-written card is,
  including the twenty-character minimum on the rule.

  > Suggestions live in their own collection, never in the catalogue, until they
  > are accepted. The deck is what every round is dealt from; anyone being able to
  > write into it directly would make "the admin edits the cards" meaningless.
  > Accepted cards land **active**, which means selectable at setup — not dealt.
  > The deck for each round is still chosen by hand, so nothing reaches a game
  > unseen.

### 4.5 Profiles
- Display name and a profile photo.
- Photo is resized client-side and stored inline (see §6).

### 4.6 Offline
- Assume signal is available, but the app must keep working without it.
- Scores and card plays entered offline queue locally and sync automatically on reconnect.

---

## 5. Non-functional requirements

- **Cost:** $0/month, permanently. No subscriptions, no credit card.
- **Course data:** stored on our own infrastructure. No dependency on a third-party
  golf data subscription.
- **Sunlight legibility:** high contrast, large tap targets, one-handed reach.
  Light theme (dark mode is worse in direct sun).
- **Style:** PGA-broadcast vibe, fresh green. Expected to evolve.
- **The critical screen** is the hole screen: your distance, your score entry, and
  everyone else's scores, all visible without scrolling.

---

## 6. Technical decisions

| Area | Decision | Rationale |
|---|---|---|
| App shell | React + TypeScript + Vite, installable PWA | One codebase for every device; no app store; instant updates |
| Styling | Tailwind CSS | Fast restyling as the look evolves |
| Backend | Firebase **Spark** (free) — Firestore + Auth | Never pauses; free with no credit card |
| Offline | Firestore IndexedDB persistence | Queues writes and syncs on reconnect — built in |
| Map | Leaflet + Esri World Imagery | Free satellite tiles, no API key, good rural AU coverage |
| Hosting | Firebase Hosting | Free, same project, HTTPS |
| Tests | Vitest + RTL (unit), Playwright (e2e), GitHub Actions CI | Every task ships tested |

**Rejected: Supabase.** Free-tier projects pause after 7 days of inactivity with a
10–30 s cold start. A golf app used fortnightly would be asleep nearly every round.

**Constraint: no Firebase Cloud Storage.** Storage requires the paid Blaze plan for
projects created after Oct 2024. Profile photos are therefore resized client-side
to a small WebP and stored as base64 **inside the Firestore user document**
(~20 KB against a 1 MB document limit). This keeps the project on Spark and free.

**Auth without email.** Firebase Auth requires an email, so the app maps a username
onto `<username>@crazygolf.invalid`. Firebase then enforces username uniqueness for
us, with no separate registry and no race condition. `.invalid` is reserved by
RFC 2606 precisely so it can never resolve to a real mailbox — verified against the
live project before committing to it. Consequence: no password-reset emails, hence
the admin reset described in §3.

---

## 7. Data model (Firestore)

```
users/{uid}              username, displayName, avatar, mustChangePassword, createdAt
  rounds/{roundId}       courseId, teeId, roomCode, joinedAt   <- this player's history
courses/{courseId}       name, par, holeCount, tees[], location
  holes/{1..18}          par, strokeIndex, metres, green{center,polygon}, tee{center,polygon}
cards/{cardId}           title, effect, category, timing, target, active, notes?
cardVotes/{cardId}_{uid} cardId, uid, vote            <- one per player per card
cardSuggestions/{id}     card fields, suggestedBy, status, reason?
rounds/{roundId}         courseId, gameType, status, settings{...}
  players/{uid}          displayName, avatar, order
  scores/{uid}_{hole}    strokes, putts?, clubs[]?      <- reserved for future use
  hands/{uid}            cards[{cardId, status, playedOnHole, targetUid, at}]
  events/{eventId}       type, actorUid, targetUid, holeNumber, cardId, at
```

Score documents are keyed per player per hole so two people entering scores
simultaneously can never collide. Last-write-wins is acceptable for a group of friends.

`cardVotes` is deliberately one flat collection rather than a subcollection under
each card, so the whole tally is a single query instead of forty. The document id
is `{cardId}_{uid}`, which makes "one vote per player per card" a property of the
path — there is no way to hold two — and the rules check the id against the voter
so nobody can write into another player's slot.

**Never store `null` for an absent optional field.** Firestore cannot hold
`undefined`, so the tempting shape is `notes: value ?? null` — but zod's
`.optional()` means "may be undefined" and *rejects* null. Doing this made 8 of the
20 starter cards fail validation and vanish from the app (found 2026-09-19). Use
`deleteField()` when writing and normalise `null` to `undefined` when reading.

`users/{uid}/rounds/{roundId}` is a player's own index of the rounds they have been
in, written as they join (added 2026-09-19 for T-9.1). The rounds collection has no
"which rounds is this player in" query, and the alternative — a collection-group
query across every round's players — would need its own index and would let anyone
enumerate everyone else's golf. Keeping the index under the player's own path means
the query is a plain read of something they own, and the rules can say so in one
line. Unlike the profile document above it, history is **not** readable by other
players: rules do not cascade into subcollections, which is what makes that possible.

---

## 8. Open questions

| # | Question | Status |
|---|---|---|
| ~~Q-1~~ | ~~Which OSM green polygon belongs to which hole~~ | **Resolved 2026-09-19** — Trangie mapped via the course mapper; all 18 holes have a green and a tee, every distance within 25 m of the card |
| ~~Q-2~~ | ~~Retroactive card play~~ | **Resolved 2026-09-19** — yes, allowed. Guide cutoff is the next player hitting, but the tee box stays open until the group leaves. Not enforced in code. See §4.4 |
| Q-3 | Which of the 40 cards actually work | **Open — needs a play test, but now instrumented.** The deck is a researched guess. Suspects: The String (works on the green, likely too strong) and Beat the Clock (punishes the group for one slow player). Players can now thumbs-up/down every card, so after Trangie the answer is a tally rather than a memory. Rewrite the losers in the in-app editor |
| Q-4 | Does signup need an invite code | **Open, but no longer blind.** Anyone with the URL can still create an account; the admin user list (T-2.4) now makes an unexpected signup visible, so this is a detection question rather than a silent one. Still worth deciding before the link is shared around |
| Q-5 | How does a locked-out player get back in | **Open.** §3 records why no reset can be built on the client. Two live options: an optional real email for Firebase's own reset flow, or JF deleting the Auth account so they can sign up again. Nothing needed until somebody actually forgets |

---

## 9. Deferred to future versions

- Group editing of anyone's score
- Putts and club tracking UI
- Stableford, match play, other formats
- Season-long ladder
- Stableford points and handicap-adjusted columns on the leaderboard
  (to-par and thru were deferred here until Phase 4; see §4.2 for why they shipped)
- More courses

Explicitly **never**: betting or money of any kind, weather integration.

---

## 10. Change log

| Date | Change |
|---|---|
| 2026-09-19 | Initial requirements captured from 37-question scoping session |
| 2026-09-19 | Trangie scorecard transcribed and verified; hole imagery imported |
| 2026-09-19 | GPS hole detection pinned down (§4.3): nearest tee **or** green, 300 m range, sticky manual override, silently-degrading wake lock |
| 2026-09-19 | Phase 4 scoring built. Score bounds (1–15) recorded; to-par and "thru" promoted from §9 to the primary leaderboard columns |
| 2026-09-19 | Backend live: rules deployed, Firestore in australia-southeast1, Email/Password enabled |
| 2026-09-19 | Admin reset password changed `1234` → `123456` (Firebase six-character floor) |
| 2026-09-19 | Username email alias uses `crazygolf.invalid` (RFC 2606 reserved, can never reach a real mailbox) |
| 2026-09-19 | **Admin password reset dropped** (§3). Not buildable on the client without a project-admin credential in the bundle or the paid Blaze plan; verified against the Firebase docs. Admin user list shipped in its place; raised as Q-5 |
| 2026-09-19 | Phase 9 built: round history, per-round scorecard, player stats. Needed a **Finish round** action — nothing had ever moved a round off `in-progress` |
| 2026-09-19 | Round history indexed at `users/{uid}/rounds/{roundId}` (§7), readable only by its owner. New `firestore.rules` block — **must be deployed** |
| 2026-09-19 | Online/offline indicator (T-8.1) with a third "Syncing…" state, held until `waitForPendingWrites` resolves |
| 2026-09-19 | Hole screen fixed for §5: the room code, player list and card settings used to render **above** the scoring stack for the whole round, so every hole started with a scroll. They now sit below it, collapsed |
| 2026-09-19 | **Card-loading bug fixed.** `notes: x ?? null` plus zod `.optional()` meant the 8 starter cards without notes failed to parse, and the reader dropped failures silently — only 12 of 20 cards ever reached the app. Reader now normalises null and *reports* what it could not read |
| 2026-09-19 | Deck grown to **40 cards** (v2): 20 more drawn from real golf games — Wolf, Skins, Snake, Bingo Bango Bongo, Sandies, Barkies, Arnies, Ferrets, the pre-1952 Stymie, Worst Ball, Shamble, Foursomes and others |
| 2026-09-19 | Players can read the whole deck and rate every card (§4.4). Totals visible to all; one vote per player per card, enforced by the document id |
| 2026-09-19 | Players can suggest cards; the admin accepts or rejects with a reason, and the suggester is shown the decision (§4.4) |
