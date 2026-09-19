# CrazyGolfGame — Task breakdown

Each task is sized for one agent on one branch. **Definition of done for every task:**
code + tests + `npm run verify` passing + CI green. No task is complete without tests.

Legend: `[x]` done · `[ ]` not started · `[~]` in progress · `[B]` blocked

---

## Phase 0 — Foundations ✅ COMPLETE

- [x] **T-0.1** Scaffold Vite + React 19 + TS 6 + Tailwind 4, ESLint flat config, folder structure
- [x] **T-0.2** Vitest + RTL configured with a passing unit test; Playwright configured with mobile projects
- [x] **T-0.3** GitHub Actions CI — typecheck, lint, unit tests, course-data validation, e2e
- [x] **T-0.5** PWA manifest, service worker, satellite-tile runtime caching, generated icons
- [x] **T-0.6** Repo `CLAUDE.md` and the agent task contract
- [x] **T-0.4** Firebase project, Firestore security rules, emulator suite wired into tests
  - [x] Firebase project `crazygolfgame` created (Spark plan), web app registered, client wired up in `src/lib/firebase.ts` with offline persistence
  - [x] Email/Password auth enabled (verified via the Identity Toolkit API)
  - [x] Firestore database created — verified `australia-southeast1`, FIRESTORE_NATIVE
  - [x] `firestore.rules` written, 23 emulator tests passing in CI
  - [x] Rules deployed and released to the live project 2026-09-19

---

## Phase 1 — Course data

> **Trangie is mapped and verified (2026-09-19).** All 18 greens and tees assigned.
> Mean difference from the printed card is −4.1 m with a 6.3 m spread; 14 of 18 holes
> measure slightly short. That systematic bias is expected, not error: the card is
> measured from the back tee markers while our centroid is the middle of the tee box,
> and on a dogleg the card follows the playing line while we measure straight. Hole 7
> (−25 m, a 471 m par 5) is the only real outlier and is almost certainly a dogleg.

- [x] **T-1.1** `Course` / `Hole` / `Tee` TypeScript types + runtime schema validation + tests
- [x] **T-1.2** Overpass fetch script → `geometry.json` with computed centroids *(done early — needed to size the data gap)*
- [x] **T-1.3** Haversine distance util, unit tested against known coordinate pairs
- [x] **T-1.4** Seed script: push `scorecard.json` + `geometry.json` into Firestore
  - [x] `scripts/seed-course.js` written (`npm run seed`)
  - [x] Run successfully against the live project 2026-09-19
- [x] **T-1.5** **Admin course mapper** — satellite map, tap greens in playing order, assign hole numbers, save
  - [x] Built and deployed; greens and tees, resumable, with the scorecard cross-check built in
  - [x] Trangie mapped 2026-09-19 — 18/18 greens and tees, every hole within tolerance
  - The one task that unblocks GPS. See gaps G-1/G-2/G-3 in `course-data-trangie.md`
- [x] **T-1.6** Scorecard cross-check — built into the mapper as a live table rather than a separate script, so a mis-tap is visible while mapping
- [ ] **T-1.7** Course picker screen (built for many, ships with one)

## Phase 2 — Auth & profiles

> **Sequencing note (2026-09-19):** Phase 2 now runs BEFORE the rest of Phase 1.
> Course writes are admin-only, admins are listed in a collection nothing can write
> from the app, and an admin entry needs a real user id — which needs signup to exist.
> So auth has to land before the course seed (T-1.4) and the course mapper (T-1.5).

- [x] **T-2.1** Username+password signup/login with the internal-domain alias; uniqueness and error states
- [x] **T-2.2** Auth context, protected routes, session restore
- [x] **T-2.3** Profile screen — display name, avatar with client-side resize to base64 WebP
  - Photo, name and password each save on their own; a failed password change cannot
    discard a photo that already saved
  - WebP first, JPEG fallback: `canvas.toDataURL` silently returns a PNG for an
    unsupported type, so the result is checked against the type that was asked for
- [~] **T-2.4** Admin user list + "reset password to 123456" action
  - [x] Admin user list — every account, newest first, admins marked
  - [ ] **Password reset — not built, and not buildable on the client.** Verified
        2026-09-19 against the Firebase docs: `updatePassword` only ever acts on the
        signed-in user, the API that takes a uid (`projects.accounts:update`) needs a
        project-admin OAuth credential that must never ship in a phone app, and Cloud
        Functions needs the paid Blaze plan. JF decided 2026-09-19 to leave it unbuilt.
        See REQUIREMENTS.md §3

## Phase 3 — Round lifecycle

- [x] **T-3.1** Create round — course, game type, card settings
- [x] **T-3.2** Join by room code, 2–4 player cap
- [x] **T-3.3** Lobby — player list, ready state, admin controls
- [x] **T-3.4** Start round — deal cards, everyone lands on hole 1
  - Status moves to `in-progress` and a `round_started` event is recorded. Dealing
    is Phase 7 and the hole screen is Phase 4; both have a marked seam in
    `LobbyScreen.tsx`.
- [x] **T-3.5** Rejoin an in-progress round after a dead phone
  - Two routes: the device remembers the round and offers it back, and typing the
    room code puts an existing player straight back in even after the start.
    Device-independent rejoin needs a "which rounds is this player in" query that
    `src/lib/rounds.ts` does not have yet.

> **Not wired into the app shell yet.** `RoundsHome` is exported from
> `src/features/rounds/` but `src/app/App.tsx` still renders the Phase 2 clubhouse
> placeholder, and App.tsx was out of scope for this task.

## Phase 4 — Scoring & leaderboard

> **Built 2026-09-19.** Everything lives in `src/features/scoring/`. The four
> presentational pieces (`ScoreStepper`, `HoleSwitcher`, `Leaderboard`,
> `ScorecardScreen`, plus `HoleScorePanel`) take plain props and never fetch, so
> the hole screen can compose them beside the GPS panel. `useRoundScoring` is the
> single Firestore edge and `RoundScoring` is the two wired together. Not yet
> reachable from `App.tsx` — Phase 3 has to create a round first.

- [x] **T-4.1** Score entry control — large, thumb-reachable, one-handed
  - Quick picks cover one under to three over in a single tap; the ± stepper handles
    the rest and seeds from par on an unscored hole
- [x] **T-4.2** Write own score; live sync to the whole group
  - `saveScore` cannot name another player — the uid comes from the hook, matching
    the security rule, and other players' scores render as text, never controls
  - The write is deliberately not awaited: offline, `setDoc` does not settle until
    reconnect, so awaiting it would hang the UI for the rest of the round
- [x] **T-4.3** Edit any previously played hole
  - Tap your own cell on the full scorecard; the stepper retargets to that hole
- [x] **T-4.4** Live leaderboard
  - To-par and "thru N" lead, total strokes is secondary. See REQUIREMENTS §4.2 —
    this supersedes the old "extra leaderboard columns" deferral
- [x] **T-4.5** Hole switcher, 1–18
  - Swipe for ±1, arrows for a gloved hand, tap strip to jump several holes

## Phase 5 — GPS & map

- [x] **T-5.1** Geolocation hook — `watchPosition`, permission states, accuracy readout
- [x] **T-5.2** Distance-to-green-centre in metres
- [x] **T-5.3** Hole map — satellite tiles, player marked, green marked
- [x] **T-5.4** Auto-detect current hole from GPS with manual override
- [x] **T-5.5** GPS scoped to the distance screen + screen wake lock

## Phase 6 — Card catalogue

- [x] **T-6.1** Card model + schema — title, effect, timing, targeting, active
- [x] **T-6.2** In-app card editor (add / edit / deactivate from a phone)
- [x] **T-6.3** Card selection + deck view — the picker shows the full rule text, so it doubles as the way to read the deck
- [x] **T-6.4** Seed the starter deck
  - [x] 20 cards written and validated (`data/cards/starter-deck.json`)
  - [ ] Run `npm run seed:cards` — **JF** (now 40 cards, deck v2)
- [x] **T-6.5** **Bug: only 12 of 20 cards ever appeared.** `notes: x ?? null` in the
      seed and in `saveCard`, against a zod `.optional()` that rejects null — and a
      reader that skipped failures silently. The 8 cards without notes never parsed.
      Reader now normalises null and reports what it could not read
- [x] **T-6.6** 20 more cards from real golf games (Wolf, Skins, Snake, Bingo Bango
      Bongo, Sandie, Barkie, Arnie, Ferret, Stymie, Worst Ball, Shamble, Foursomes…)
- [x] **T-6.7** The deck screen — every player reads the full catalogue and rates
      each card 👍/👎. One vote per player per card, made structural by the
      `{cardId}_{uid}` document id. Feeds Q-3
- [x] **T-6.8** Players suggest cards; admin accepts into the deck or rejects with a
      reason; the suggester is shown the decision
  - Validated through the same `validateDraft` as the admin editor, 20-character
    minimum included — the wording is the mechanism
  - Suggestions live in their own collection until accepted, so nobody writes
    straight into the deck. **Needs the new `firestore.rules` deployed**

## Phase 7 — Cards in play

- [x] **T-7.1** Deal engine — even split / fixed-per-player / everyone-same; extras discarded. Heavy unit tests
- [x] **T-7.2** Secret vs open hands, set at round setup
- [x] **T-7.3** Play a card → marked used, still visible, disabled
- [x] **T-7.4** Target another player + notify them
- [x] **T-7.5** Event feed
- [x] **T-7.6** Unplayed cards persist to the end of the round

## Phase 8 — Offline hardening

- [x] **T-8.1** Firestore IndexedDB persistence + online/offline indicator
  - Three states, not two: "Syncing…" holds until `waitForPendingWrites` resolves,
    because back on the network and everything-actually-saved are different moments
- [ ] **T-8.2** Playwright tests that drop the network mid-round and assert sync on reconnect
- [ ] **T-8.3** Cache course data and satellite tiles for the round

## Phase 9 — History & polish

- [x] **T-9.1** Round history + per-round scorecard view
  - Needed a **Finish round** action first: nothing ever moved a round off
    `in-progress`, so history had no finished golf to show
  - Per-player index at `users/{uid}/rounds/{roundId}`, written on join. Needs the
    matching `firestore.rules` block **deployed**
  - The card is `ScorecardScreen` with `onSetScore` omitted — the read-only mode
    Phase 4 left for exactly this
- [x] **T-9.2** Player stats
  - A round only counts towards an average once it is complete; a nine-hole walk-off
    would otherwise flatter everyone who ever gave up in the rain
- [~] **T-9.3** Visual pass — PGA green, sunlight contrast, one-handed layout
  - [x] Tap-target floor asserted in e2e; clubhouse regrouped with admin actions last
  - [ ] Sunlight contrast still unproven — needs a real screen outdoors at Trangie
- [x] **T-9.4** Hole-screen polish: distance + your score + everyone's scores, no scrolling
  - The real fault was the lobby chrome: room code, player list and card settings
    rendered **above** the scoring stack all round. They now sit below it, collapsed

---

## Deferred

Group-edits-anyone's-score · putts and club UI · Stableford and match play · season
ladder · Stableford/handicap leaderboard columns · more courses.

**Never:** betting or money, weather.
