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
- [~] **T-0.4** Firebase project, Firestore security rules, emulator suite wired into tests
  - [x] Firebase project `crazygolfgame` created (Spark plan), web app registered, client wired up in `src/lib/firebase.ts` with offline persistence
  - [ ] Enable Email/Password auth in the console — **JF**
  - [ ] Create the Firestore database, Sydney `australia-southeast1`, production mode — **JF**
  - [x] `firestore.rules` written, 23 emulator tests passing in CI
  - [ ] Deploy the rules to the live project — **JF** (`npx firebase login` then `npm run deploy:rules`)

---

## Phase 1 — Course data

- [x] **T-1.1** `Course` / `Hole` / `Tee` TypeScript types + runtime schema validation + tests
- [x] **T-1.2** Overpass fetch script → `geometry.json` with computed centroids *(done early — needed to size the data gap)*
- [x] **T-1.3** Haversine distance util, unit tested against known coordinate pairs
- [ ] **T-1.4** Seed script: push `scorecard.json` + `geometry.json` into Firestore
- [ ] **T-1.5** **Admin course mapper** — satellite map, tap greens in playing order, assign hole numbers, edit par/SI/metres, save
  - The one task that unblocks GPS. See gaps G-1/G-2/G-3 in `course-data-trangie.md`
- [ ] **T-1.6** `check-hole-geometry.js` — verify each assigned tee→green distance against the scorecard metres (±25 m), flag mis-assignments
- [ ] **T-1.7** Course picker screen (built for many, ships with one)

## Phase 2 — Auth & profiles

- [ ] **T-2.1** Username+password signup/login with the internal-domain alias; uniqueness and error states
- [ ] **T-2.2** Auth context, protected routes, session restore
- [ ] **T-2.3** Profile screen — display name, avatar with client-side resize to base64 WebP
- [ ] **T-2.4** Admin user list + "reset password to 1234" action, and the change-password prompt on next login

## Phase 3 — Round lifecycle

- [ ] **T-3.1** Create round — course, game type, card settings
- [ ] **T-3.2** Join by room code, 2–4 player cap
- [ ] **T-3.3** Lobby — player list, ready state, admin controls
- [ ] **T-3.4** Start round — deal cards, everyone lands on hole 1
- [ ] **T-3.5** Rejoin an in-progress round after a dead phone

## Phase 4 — Scoring & leaderboard

- [ ] **T-4.1** Score entry control — large, thumb-reachable, one-handed
- [ ] **T-4.2** Write own score; live sync to the whole group
- [ ] **T-4.3** Edit any previously played hole
- [ ] **T-4.4** Live leaderboard
- [ ] **T-4.5** Hole switcher, 1–18

## Phase 5 — GPS & map

- [ ] **T-5.1** Geolocation hook — `watchPosition`, permission states, accuracy readout
- [ ] **T-5.2** Distance-to-green-centre in metres
- [ ] **T-5.3** Hole map — satellite tiles, player marked, green marked
- [ ] **T-5.4** Auto-detect current hole from GPS with manual override
- [ ] **T-5.5** GPS scoped to the distance screen + screen wake lock

## Phase 6 — Card catalogue

- [ ] **T-6.1** Card model + schema — title, effect, timing, targeting, active
- [ ] **T-6.2** In-app card editor (add / edit / deactivate from a phone)
- [ ] **T-6.3** Card browser / deck view
- [ ] **T-6.4** Seed the starter deck

## Phase 7 — Cards in play

- [ ] **T-7.1** Deal engine — even split / fixed-per-player / everyone-same; extras discarded. Heavy unit tests
- [ ] **T-7.2** Secret vs open hands, set at round setup
- [ ] **T-7.3** Play a card → marked used, still visible, disabled
- [ ] **T-7.4** Target another player + notify them
- [ ] **T-7.5** Event feed
- [ ] **T-7.6** Unplayed cards persist to the end of the round

## Phase 8 — Offline hardening

- [ ] **T-8.1** Firestore IndexedDB persistence + online/offline indicator
- [ ] **T-8.2** Playwright tests that drop the network mid-round and assert sync on reconnect
- [ ] **T-8.3** Cache course data and satellite tiles for the round

## Phase 9 — History & polish

- [ ] **T-9.1** Round history + per-round scorecard view
- [ ] **T-9.2** Player stats
- [ ] **T-9.3** Visual pass — PGA green, sunlight contrast, one-handed layout
- [ ] **T-9.4** Hole-screen polish: distance + your score + everyone's scores, no scrolling

---

## Deferred

Group-edits-anyone's-score · putts and club UI · Stableford and match play · season
ladder · extra leaderboard columns · more courses.

**Never:** betting or money, weather.
