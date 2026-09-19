# CrazyGolfGame

A private golf scoring app with a "Crazy Cards" side game, for JF, family and close friends.

- **Live scoring** for 2–4 players in one group, syncing in real time
- **GPS distance** to the centre of the green
- **Satellite hole maps** showing you and the flag
- **Crazy Cards** — a deck of chaos dealt at the start of the round

**Live:** https://crazygolfgame.web.app

## Docs

| Document | What's in it |
|---|---|
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | The living spec. Source of truth |
| [docs/course-data-trangie.md](docs/course-data-trangie.md) | What course data we have, what's missing |
| [docs/TASKS.md](docs/TASKS.md) | Phase and task breakdown |
| [CLAUDE.md](CLAUDE.md) | Rules for agents working in this repo |

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run verify` | typecheck + lint + unit tests — run before every commit |

## Course and card data

```bash
node scripts/validate-scorecard.js   # re-verify the Trangie scorecard transcription
node scripts/fetch-osm-course.js     # re-pull course geometry from OpenStreetMap
npm run seed                         # push the course into Firestore (admin sign-in)
npm run seed:cards                   # push the starter card deck into Firestore
npm run course:status                # per-hole check of mapped distances vs the scorecard
```

## Firebase

The CLI is invoked through node rather than the `npx` shim, which ThreatLocker
blocks on JF's machine:

```bash
npm run fb:login                     # sign in (paste-the-code flow)
npm run deploy:rules                 # publish firestore.rules
npm run deploy                       # build and deploy the app
npm run fb -- <command>              # anything else
```

## Attribution

Course geometry from OpenStreetMap contributors, licensed ODbL.
Satellite imagery from Esri World Imagery.
