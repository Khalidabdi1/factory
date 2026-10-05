<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Factory Yard: project guide

A live isometric seaside town drawn with three.js/WebGL in the hairline style of [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill). Goods go factory → warehouse → shop along the main road of a small town, with hills behind and the sea in front. A day passes in 6 minutes. There is no dashboard: you click anything and a card shows its live details. The README describes what the user sees; this file covers how the code works.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Installs dependencies. Needs Node 20 or later; Node 22 is used. |
| `npm run dev` | Dev server on <http://localhost:3000>. On the owner's machine port 3000 is often taken by another app, so use `npm run dev -- --port 3100`. |
| `npm run build` | Type check and static export to `out/`, because `next.config.ts` sets `output: 'export'`. There is no server and there are no API routes. |
| `npm run preview` | Serves `out/`. |

There is no test runner. Verify in a real browser; see "Checking changes" below.

## Stack

Next 16 (App Router, Turbopack), React 19, TypeScript, and `three@0.186.1` from npm. DM Mono is self-hosted with `next/font/google`. Read `node_modules/next/dist/docs/` before using a Next API you haven't used here.

## Layout

| Path | Role |
| --- | --- |
| `app/layout.tsx` | Sets up the font, the `--font-dm-mono` variable, and an inline pre-paint script that restores the remembered ◐ theme from `localStorage['factory-yard-theme']`. |
| `app/globals.css` | Colour tokens. The theme tokens (`--bg`, `--line`, `--body`…) are read by the map. The `--page-*` tokens are for the HTML chrome only: they follow the theme by day and turn dark at night via `:root.after-dark`. |
| `components/YardFigure.tsx` | `'use client'`. Renders the plate's HTML once and calls `import('@/yard')` in an effect. |
| `yard/index.ts` | The entry, which runs once per page load. It creates the renderer, builds prototypes and the town, spawns everything in a fixed order, defines `sim.step`, warms up, then calls `initView()`. |
| `yard/view.ts` | `initView()`: camera and OrbitControls, hit-testing, selection, tags, card, reticle, route, look-inside, frame loop, keys, and `window.yard` under `?debug`. |
| `yard/shared.ts` | `$` (getElementById), `stage`, `canvas`, `scene`, `gfx`, and `hooks`, which lets the sim call into the view without importing it. |
| `yard/kernel/` | `iso.ts` (projection), `part.ts` (geometry builder), `path.ts` (`Path`: a filleted polyline walked by arc length), `graph.ts` (`Site` corridor graph with Dijkstra, `keepSide`), `math.ts` (seeded `rng`, `rand`, `pick`, `clamp`, `ease`). |
| `yard/theme.ts` | Token → material mapping, the `NIGHT` palette, `applyTheme()`, and `shade(n)`, the day/night blend. |
| `yard/layout.ts` | World constants and the coordinate table (where everything is), plus `ROADS` / `BLOCKS`, `onRoad`, `zAt`. |
| `yard/models/`, `yard/world/` | Builders for moving models and for the static town. |
| `yard/sim/` | `core` (clock, stats, `Pallet`, conveyor), `roads` (road rules), `cars`, `trucks` (holds), `forklifts`, `person`, `people` (shop, staff, shoppers, gate guard, walkers, bus riders), `police`, `boats`. |

The React component and the engine share a contract: the engine finds the plate's elements **by id**: `clock`, `stage`, `view`, `card`, `cardRows`, `note`, `readout`, `tagSel`, and the rest. React never re-renders the plate. Per-frame UI updates are imperative.

## Coordinates and drawing

- **Coordinates.** Scene code uses the skill's frame: +x east (down-right on screen), +y south toward the sea (down-left), +z up. `W(x, y, z)` maps that to three.js's y-up world. The orthographic camera looks down (-1,-1,-1), so only south faces (`FRONT`) and east faces (`SIDE`) are seen. Put doors, signs and windows that matter on those faces.
- **Sizes.** 1 unit = 1 m. The world is x 0–440 and y −84–336. The hills are at y < −4, the main road (Riverside Rd) at y 124–138, Market St at y 198–212, Coast Rd at y 260–274, the beach at y 279–296 and the sea from y 296. The full table is at the top of `yard/layout.ts`.
- **The `Part` builder.** It collects faces and lines into a few draw calls. Shapes: `box(x,y,z,w,d,h,tone)`, `extrude`, `cylZ`, `cylY`, `geo`. Flat detail: `draw(M, segs)`, `rect2`, `fill2` and `text`, drawn in a face's local 2D units through `TOP`, `FRONT`, `SIDE` or `plane()`. Finish with `build(name)`.
- **Tones.** `n` is the normal body/deck. `k` is two-tone, for goods and uniforms. `l` (lamps) and `w` (windows) light up at night by themselves. `g` is glass, `gs` grass, `s` sand.
- **Lines.** Every line is a 1 CSS px `LineSegments2`. Faces are flat, unlit and opaque.
- **Colour.** Never hard-code colours in scene code; use tokens. `--live` is reserved for live state: the selection, the route, busy lamps, beacons, police lights, alarms and the lighthouse beam. `glow(group, on)` swaps a part's faces to the live fill.
- **Draw calls.** Keep the default view at or below about 1.5k (`renderer.info.render.calls`; it was about 1,000–1,140 after the port). Merge static things into one `Part`. Give moving pieces their own group only when they animate. Far zoom (`TINY`) swaps people for a one-part "lite" model.

## Simulation rules

- **Determinism.** The fixed step is `STEP = 1/60`. All randomness goes through `rng()`, seeded by `?seed=`, so never use `Math.random()`. Builders call `rand()` while constructing, so the order of construction in `yard/index.ts` changes what the town looks like. Add new things after existing ones unless you mean to change the town.
- **Time.** `hourAt(t)` maps sim time to the clock. The skip button eases `shift.h` toward `shift.goal`. `night()` is 0 by day, 1 by night, and eases through dusk (18:30–20:30) and dawn (05:00–07:00).
- **Entities.** Anything clickable has `kind`, `id`, `groups` (three.js groups with `userData.entity = this`), `pick` (a local anchor) and `info()`, which returns `{ kind, title, status, rows:[[k,v]…], bar?:{v,max,label} }`. They also have `readout()`, and optionally `route()` for the dashed route. Kinds in `STILL` (`view.ts`) can't be followed. When something leaves the scene, call `hooks.forget(this)`.
- **Look-inside buildings.** `group.userData.peek = { shell, cut, inside?, box:[x0,x1,y0,y1] }`, registered in `PEEK` in `view.ts`. The cut, a section drawing (walls cut low and hatched, roof as an outline), replaces the shell while the building, or anything whose bounds centre lies in `box`, is selected.
- **Vehicles.** `Car` follows a `Path` with `stops` (arrive/release/left) and `yields`. `Truck` loops are a `Path` plus `holds` built with `holdOn(path, x, y, {…})`. Collision avoidance is `clearAhead`, and anything stuck for 25–30 s "ghosts" past.
- **People.** `Person` runs a step queue (`walk`, `go` (pavement walk that waits at kerbs), `wait`, `face`, `then`). Walkers route over the `PED` pavement graph between `portal()`s, chosen by `nextPortal()`.
  - Looks and outfits live in `OUTFITS` (`yard/models/people.ts`), and `PROTO.person[look][variant]` holds the built models.
  - `lookOf(look, id)` picks the variant and height from the id, so the same name always looks the same and no `rng()` is spent.
  - People use the single-fill tones `nb` / `kb`, which keeps them to about 12 draw calls each.
  - Limbs are the `legL`, `legR`, `armL` and `armR` groups. `sitOn(seat)` and `standUp()` handle seating, using `SEATS` in `sim/people.ts`.
- **Forklifts.** `dispatch()` picks a task, and `pickup()` / `dropAt()` turn it into steps. Slots come from `slotAt`, and the approach geometry from `LOC.*`.

## Code style

- Match the surrounding code: dense, terse, short names, and comments that say *why*, written as prose in the town's voice.
- Modules ported from the old single file start with `// @ts-nocheck`, because they were moved verbatim. New modules should be typed.
- The README is written for people, not agents: what you see, the controls, the places. Update it when behaviour changes.

## Checking changes

1. Run `npm run dev -- --port 3100` and open `http://localhost:3100/?debug=1` in Chrome. `window.yard` gives you:
   - `step(s)`, `skip(h)`, `select(id)`, `selected()`, `find(id)`, `all()`;
   - `look(x, y, zoomK)`, `view(i)`, `screenOf(id)`;
   - `sim`, `renderer`, `camera`, `controls`, `incident`, `bank`, `shop`, `whGate`, `RACK`, `SHELF`, `SPOTS`, `BUS_STOPS`.
2. To compare runs, pause (click `#pause`), then step `sim.step(1/60)` until `sim.t` reaches a target. The same seed always gives the same state.
3. Check the console for errors, and check draw calls and that nothing gets stuck after a long `step()`. Test both themes, day and night (`skip(12)`), and a 390 px wide window.
4. Run `npm run build` before committing.

## Git

- Work happens on `claude/adoring-goodall-e4y42o`. GitHub's `main` is kept in step with `git push origin HEAD:main`, which is a fast-forward. Push only when the owner asks.
- Write one commit per feature, with prose messages that say what changed for the viewer.

## Roadmap (agreed October 2026, in order)

Done:
- Phase 0: Next.js port with exact parity.
- Phase 1: night page frame, theme memory, WebGL context-loss handling.
- Phase 2: people redesign, with outfits, swinging arms and seated poses.

Next:
3. Orchard Lane: new houses on the wooded plot behind Corner Market, plus interiors and residents for every house and villa.
4. A realistic Warehouse 01: 48-slot racking on 3 levels, shelving, pickers.
5. Courier PKG-1 with online orders from Corner Market and order tracking (Track button, the main camera follows).
6. A bank siege you can see inside: four officers surround the bank, arrest inside or a back-door chase.
7. Sunset Pier amusement pier: Ferris wheel, carousel, coaster.
8. Fishing boat Kestrel and a pier angler.
9. Weather: rain and sea fog.
10. Fire station and ENG-1, with chimney fires.
11. Freight train FRT-7 collecting pallets from Plant 01.
12. README, debug hooks, push to `main`.

The full plan is in the owner's `~/.claude/plans/` file for this work. A shared road router (`ROADNET`), card `actions`, and a peek helper are planned infrastructure for phases 3–10.
