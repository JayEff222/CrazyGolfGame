# CrazyGolfGame — rules for agents working in this repo

## What this is

A private golf scoring app with a "Crazy Cards" side game, for JF, his family and
close friends. 2–4 players, one group at a time. Not commercial. Must cost $0 to run.

Read [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) before changing anything. It is the
source of truth. If the code and that document disagree, the document wins — and if
the document is actually wrong, update it in the same change.

## Stack

React 19 · TypeScript 6 · Vite 8 · Tailwind 4 · Firebase (Firestore + Auth, Spark plan)
· Leaflet + Esri World Imagery · Vitest + Playwright

## Hard constraints — do not violate these

1. **Stay on the Firebase Spark plan.** No Cloud Storage (it requires the paid Blaze
   plan). Profile photos are resized client-side and stored as base64 in the user
   document. Never add a dependency that requires a credit card.
2. **No paid APIs, ever.** Course data lives in our own Firestore. Never introduce a
   golf-data subscription.
3. **Cards are honour-system.** The app records what was played, by whom, against whom,
   on which hole, and when. It **never** alters a score because of a card.
   Only an admin writes to the `cards` catalogue. Player-written cards go to
   `cardSuggestions` and reach the deck only when the admin accepts them.
4. **Offline must keep working.** Any write path must survive being offline and sync on
   reconnect. Do not bypass Firestore's offline queue with raw `fetch`.
5. **Sunlight-first UI.** Light theme, high contrast, minimum 3rem tap targets, reachable
   one-handed. Do not add a dark theme.
6. **No money features.** No betting, wagering, or payments. Requested explicitly.

## Task workflow

1. Pick a task from [docs/TASKS.md](docs/TASKS.md). Work one task per branch.
2. Branch name: `task/T-1.3-haversine-util`.
3. Write the test first where the task has a testable core (deal engine, distance
   maths, score totals). These have exact right answers — prove them.
4. `npm run verify` must pass before you are done. CI runs the same checks plus e2e.
5. Tick the task in `docs/TASKS.md` in the same commit.
6. If you discover a requirement that isn't captured, add it to `docs/REQUIREMENTS.md`
   in the same commit. Undocumented decisions are how this project rots.

## Conventions

- `@/` maps to `src/`.
- Feature-first layout: `src/features/<feature>/`. Shared primitives in `src/components/`,
  pure logic in `src/lib/`.
- Pure logic goes in `src/lib/` and is unit tested directly — do not bury maths in a
  component where it can only be reached through a render.
- Metres everywhere. Never yards. The scorecard is metric and the players are Australian.
- **Never write `null` for an absent optional field.** Firestore cannot store
  `undefined`, so `notes: value ?? null` looks right — but zod's `.optional()` means
  "may be undefined" and rejects `null`. That one character hid 8 of the 20 cards for
  a whole phase. Use `deleteField()` to clear, and normalise `null` → `undefined` when
  reading. And never drop a document that fails validation silently: report it.
- Comments explain *why*, not *what*. Match the density of the surrounding code.

## Course data

`data/courses/trangie/` holds `scorecard.json` (hand-transcribed, verified) and
`geometry.json` (OpenStreetMap, ODbL). See [docs/course-data-trangie.md](docs/course-data-trangie.md)
for what is known and what is missing.

```bash
node scripts/validate-scorecard.js    # re-verify a scorecard transcription
node scripts/fetch-osm-course.js      # re-pull geometry from OSM
node scripts/generate-icons.js        # regenerate PWA icons
npm run seed                          # push a course into Firestore
npm run seed:cards                    # push the card deck into Firestore
npm run course:status                 # check mapped distances against the scorecard
```

**Do not hand-edit `geometry.json`'s coordinates.** It is generated. Hole assignment is
done through the admin course mapper so the change is auditable and verifiable against
the scorecard distances.


## Running the Firebase CLI on a locked-down machine

JF's work laptop runs ThreatLocker, which blocks the `.cmd` shim that `npx firebase`
and `npm` generate. `node` itself is approved, so every Firebase script in
`package.json` invokes the CLI through its JS entry point directly:

```
node node_modules/firebase-tools/lib/bin/firebase.js <command>
```

Use `npm run fb -- <command>` for anything ad hoc. Do not "simplify" these scripts
back to `firebase <command>` or `npx firebase` - it will be blocked on his machine.

Login uses `--no-localhost` (a paste-the-code flow) rather than a localhost callback
server, which is also less likely to trip endpoint restrictions.

If the CLI is unavailable entirely, rules can be published by pasting
`firestore.rules` into the Firebase console under Firestore Database > Rules.

### Checking `firestore.rules` without Java and without deploying

The rules unit tests need the Firestore emulator, which needs Java, which is not on
this machine — so they only run in CI. But rules **compilation** is done server-side
and can be checked any time without releasing anything:

```bash
npm run fb -- deploy --only firestore:rules --dry-run
```

Use this after every rules change. It catches syntax and type errors (list indexing,
string comparison, `+` concatenation, unknown fields) in a couple of seconds, instead
of finding them in a failed deploy. It proves the rules *compile*, not that they
*behave* — the emulator tests in CI are still what prove behaviour.

### Playwright browsers will not launch locally

ThreatLocker refuses to execute the browsers Playwright downloads into
`%LOCALAPPDATA%\ms-playwright` — they fail with `spawn EPERM`. `npm run test:e2e`
therefore only runs in CI, the same as the Firestore rules tests.

To check an e2e change locally, point Playwright at the system Edge instead, which
is allowed. Write a throwaway config with
`projects: [{ name: 'edge', use: { ...devices['Pixel 7'], channel: 'msedge' } }]`,
run `npx playwright test --config=<that file>`, and delete it afterwards. Do not
commit that config — CI has real browsers and should use them.

## Attribution required

OpenStreetMap contributors (ODbL) for course geometry, and Esri for satellite imagery.
Both must appear in the app's UI.
