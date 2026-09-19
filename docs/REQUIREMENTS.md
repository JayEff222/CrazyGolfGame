# CrazyGolfGame — Requirements

**Owner:** JF van Staden
**Repo:** https://github.com/JayEff222/CrazyGolfGame
**Status:** Phase 2 — auth complete; course mapper next
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
- **Password reset:** no self-service reset (no email on file). Instead, an
  **admin reset**: JF opens the admin screen, selects a user, and their password
  is set to `123456`. On next login the user is prompted (not forced) to change it
  from their profile page.

  > **Changed from `1234` on 2026-09-19.** Firebase Auth hard-rejects passwords
  > under six characters with `WEAK_PASSWORD` — verified against the live project —
  > and the limit is only configurable by upgrading to Identity Platform, which
  > needs the paid plan. `123456` is the shortest value that keeps the original
  > intent: a number JF can read out over the phone. Open to a different choice,
  > such as a per-reset random code like `golf-4821`.
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
- Each player enters **their own** score per hole.
- Any previously played hole can be edited at any time during the round.
- Live leaderboard visible to all players, updating in real time.
- **Future:** allow the group to edit anyone's score (deferred, schema supports it).
- **Future:** putts and club-used per shot (deferred — fields reserved in the schema now).

### 4.3 GPS and course view
- Distance to **centre of green only**, in metres. ±10 m accuracy is acceptable.
- Hole view shows a satellite image of the hole with **the player marked** and
  **the green marked**.
- Current hole auto-detected from GPS, with a manual override.
- Easy hole switching, 1–18.
- GPS only runs while the distance screen is open, plus a screen wake lock.

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
- A played card is marked used — still visible, but disabled.
- Unplayed cards may be carried to the end of the round; there is no forced use.
- The admin **cannot** void or cancel a card once played.
- An **event feed** shows all card plays to the whole group.
- No rarity tiers.

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
users/{uid}              username, displayName, avatarBase64, mustChangePassword, stats
courses/{courseId}       name, par, holeCount, tees[], location
  holes/{1..18}          par, strokeIndex, metres, green{center,polygon}, tee{center,polygon}
cards/{cardId}           title, effect, timing, targetsOpponent, active
rounds/{roundId}         courseId, gameType, status, settings{...}
  players/{uid}          displayName, avatar, order
  scores/{uid}_{hole}    strokes, putts?, clubs[]?      <- reserved for future use
  hands/{uid}            cards[{cardId, status, playedOnHole, targetUid, at}]
  events/{eventId}       type, actorUid, targetUid, holeNumber, cardId, at
```

Score documents are keyed per player per hole so two people entering scores
simultaneously can never collide. Last-write-wins is acceptable for a group of friends.

---

## 8. Open questions

| # | Question | Status |
|---|---|---|
| Q-1 | Which OSM green polygon belongs to which hole | Open — resolved by the admin course mapper (T-1.5) |
| Q-2 | Retroactive card play — can a card be played after a shot is taken? | Deferred until the card list exists |
| Q-3 | Final card list and per-card timing rules | Deferred — starter deck seeded, edited in-app |

---

## 9. Deferred to future versions

- Group editing of anyone's score
- Putts and club tracking UI
- Stableford, match play, other formats
- Season-long ladder
- Additional leaderboard columns (to-par, thru)
- More courses

Explicitly **never**: betting or money of any kind, weather integration.

---

## 10. Change log

| Date | Change |
|---|---|
| 2026-09-19 | Initial requirements captured from 37-question scoping session |
| 2026-09-19 | Trangie scorecard transcribed and verified; hole imagery imported |
| 2026-09-19 | Backend live: rules deployed, Firestore in australia-southeast1, Email/Password enabled |
| 2026-09-19 | Admin reset password changed `1234` → `123456` (Firebase six-character floor) |
| 2026-09-19 | Username email alias uses `crazygolf.invalid` (RFC 2606 reserved, can never reach a real mailbox) |
