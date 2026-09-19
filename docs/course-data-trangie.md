# Trangie Golf Course — data status

**Course ID:** `trangie`
**Club:** Trangie Golf Club Co-op Ltd, Trangie NSW 2823
**Last updated:** 2026-09-19

---

## What we have

### Scorecard — COMPLETE and VERIFIED
`data/courses/trangie/scorecard.json`

Transcribed from a photo of the physical card. 18 holes, mens and ladies tees,
par, metres, stroke index, match index, A.C.R 69 / A.L.C.R 71.

**Verification performed:**
- All Out / In / Total sums reconcile arithmetically (10 checks, all pass).
- All three stroke-index columns are valid 1–18 permutations (3 checks, all pass).
- Par and handicap cross-checked against the in-app hole screenshots for holes
  1, 7, 13, 14 and 18 — all five matched exactly.

Run `node scripts/validate-scorecard.js` to re-verify.

### Hole imagery — COMPLETE
`assets/courses/trangie/holes/hole-01.jpg` … `hole-18.jpg`

18 screenshots from a third-party golf app, one per hole. Each carries a burnt-in
label showing hole number, par and handicap, which is how the ordering was verified
(files were named from download timestamps, then confirmed against their labels).

> **KNOWN DEFECT — holes 1 and 7.** JF has confirmed the source app renders the
> wrong terrain for these two holes: the picture on the hole 1 screen is actually
> hole 7's layout, and vice versa. **The par and handicap shown on both are correct.**
> Only the imagery is swapped. These are reference material only — the app renders
> its hole maps from OSM geometry over satellite tiles, not from these screenshots —
> so this does not affect the product. Do not "fix" it by renaming the files; the
> filenames match the labels, which match the scorecard.

### OSM geometry — PARTIAL
`data/courses/trangie/osm-raw.json`

Pulled from the Overpass API on 2026-09-19. Trangie Golf Course is OSM way
`1203377715`.

| Feature | Count | Notes |
|---|---|---|
| `golf=green` polygons | 16 | 20 nodes each; traced, centroids compute cleanly |
| `golf=tee` polygons | 17 | 5-node rectangles |
| `golf=clubhouse` | 1 | way `1203377716` |
| `golf=hole` centrelines | 0 | none exist |
| Fairways / bunkers / hazards | 0 | none — the course genuinely has no bunkers |

Re-pull with `node scripts/fetch-osm-course.js trangie`.

### Player-drawn hole map — REFERENCE
JF has produced an annotated satellite image with all 18 tees numbered and an
arrow from each tee to its green. This is the authoritative source for resolving
which OSM polygon belongs to which hole.

---

## What is missing

| # | Gap | Impact | How it gets filled |
|---|---|---|---|
| G-1 | **No hole numbers on the OSM polygons.** 16 greens and 17 tees exist as anonymous shapes. | Blocks GPS distance-to-green. This is the only thing standing between us and a working yardage screen. | Admin course mapper (T-1.5) — tap greens in playing order using JF's annotated map as the guide |
| G-2 | **16 green polygons for 18 holes.** Two greens are unmapped, or two holes share a green. | Two holes will have no green coordinate until resolved | Identify the two during T-1.5 and drop pins manually on the satellite view |
| G-3 | **17 tee polygons for 18 holes.** | One hole will fall back to the green-only distance | Same as G-2 |
| ~~G-4~~ | ~~Source images not in the repo~~ | — | **RESOLVED 2026-09-19** — `scorecard.jpg` and `hole-map-annotated.jpg` are now in `assets/courses/trangie/reference/` |

### Cross-check available during mapping

Once greens and tees are assigned to holes, each pair's haversine distance should
land within roughly ±25 m of the scorecard metres for that hole. Any hole outside
that band is almost certainly a mis-assignment. `scripts/check-hole-geometry.js`
will run this check automatically — it turns G-1 from a trust exercise into a
verifiable one.

---

## Sources

- Scorecard: photograph of the physical card, supplied by JF 2026-09-19
- Hole imagery: third-party golf app screenshots, supplied by JF 2026-09-19
- Geometry: OpenStreetMap via Overpass API (ODbL — attribution required in-app)
- Course facts: [Golf NSW](https://www.golfnsw.org.au/golf-clubs/trangie-golf-club/) — 18 holes, par 71, sand/black-soil greens, established 1911
