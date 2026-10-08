# Phase M - ships that really move (plan written with Fable)

**Owner decisions:**
- **Real world positions:** yes.
- **Camera:** one shared TV camera that zooms out to fit every airship, with a zoom cap and edge arrows.
- **Turning round:** only on the helmsman's command (hold the stick hard astern for ~1 s, or a COME ABOUT lever). It takes a few seconds.
- **Architecture:** **Option B** (one simulation that understands many ships). Fable's first draft below recommended a hybrid (two instances + a shared pose model). The B-specific section is being added. The movement work M.0-M.5 is needed for either route.

## Today
- The ship is nailed to the middle and the world strip is pulled past her: world = ship + `course.dist`, `y - state.ship.alt`.
- Every flying thing slides back by `scrollSpeed`. The counts:
  - 67 `+course.dist`;
  - 247 `±alt`;
  - 23 `scrollSpeed`.
- She can already reverse a little (`SHIP.REVERSE`) but cannot face the other way.
- The enemy gunship already has her own offset and velocity, a facing `m=±1` and a timed flip (`gunship.js:274`, `gunshipArt.js:1416`). That is the precedent for our ship.

## Target model
- **`pose.js`:**
  - `state.ship.pose = { x, y, vx, vy, f (+1/-1 facing), pitch, turn }`.
  - `toWorld` / `toShip` / `aimToWorld` convert.
  - Ship space is NEVER mirrored, so crew, nav, jobs, bots, fires, modules, balance and bags are unchanged.
  - Facing only matters at the boundary: rock samples, hit tests, guns, lamps, the camera and the art.
  - With `f = +1` the maths is exactly today's.
- **Physics:**
  - Body-frame forward speed, world `vx` from engines + wind + sails.
  - `vy` from gas, trim and balance.
  - Pitch from torques (`forces.js` from S.5h returns `{ fwd, up, torque }`).
- **Come about:**
  - `config.SHIP.TURN { HOLD 1.0, TIME 2.6, MAX_SPEED 0.35, COOLDOWN 4 }`.
  - Commanded by holding astern (with a ring on phone and TV) or the COME ABOUT lever; bots can command it too.
  - She brakes; at the midpoint `f` flips and `u` flips, so world velocity stays continuous; the TV shouts "COMING ABOUT!"; no firing during the turn.
  - The art is drawn under `scale(f, 1)` with a squash animation, using one bake blitted mirrored; text stays upright via `uprightText`.
  - Refused if too fast, or if the mirrored hull would be in rock.
- **Phones:** screen-relative sticks (`jx * f` at the one input point), and the helm swaps its AHEAD/ASTERN labels.
- **Camera:** generalise `pvp/arenaCamera.js` to fit every airship's pose + bounds (ours, rivals, a near gunship), with look-ahead, a zoom cap, edge arrows, and zoom locked during a turn.
- **World entities:**
  - Shells, planes, bats, mines, rockets, bombs, puffs and markers are stored in map coordinates.
  - The `scrollSpeed` terms and `±alt` conversions go away.

## Migration with gates

**First:** store golden numbers: voyagesim win rates and minutes, botsim stats, the capability table, cave contact counts. Then add `buildsim --check-golden`.

| Stage | What | Gate |
|---|---|---|
| M.0 | `pose.js` as getters, `f = +1`; a lint banning new `+course.dist` / `-alt`; `botsim --trace`; `--check-golden` | byte-identical |
| M.1 | World-frame entities + world camera + world render (the big one) | **re-snapshot #1**: frame-equivalence trace, golden, re-freeze baseline |
| M.2 | Pose owns position; `f` factor in every "ahead" | byte-identical to the new baseline |
| M.3 | Come about: command, manoeuvre, mirrored art, upright text, screen-relative sticks, bots, HUD facing pennant; `--check-turn` | identical when nobody turns |
| M.4 | `forces.js` drives the pose (with S.5h) | **re-snapshot #2**: capability within ±10%, golden |
| M.5 | Facing-aware pilot/director/spawns, route turns, camera polish | golden + a turns-per-mission stat |
| M.6 | Multi-ship (Option B) + the gunship on `pose.js` + boarding between moving ships | arena check, mirror match 45-55% |

## Multi-ship architecture rules (B0/M.0, in force for ALL new code)
The owner wants more airships to always be addable (Option B: one simulation, many ships). M.0 lays the foundations without changing behaviour:
- **`public/modules/host/ships.js`:** `state.ships = [ship0]`. `ship0 = { id: 'player', team, layout, state, world, pose }` wraps today's singletons BY REFERENCE (`ship0.state === state.ship`, `ship0.layout === SHIP_LAYOUT`). Accessors: `mainShip(state)`, `shipOf(state, player)` (`player.ship` id; none = main ship), `eachShip(state, fn)`.
- **`public/modules/host/pose.js`:** `createPose(ship)` / `poseOf(ship)` give `{ x, y, vx, vy, f, pitch, turn }` as getters/setters over `course.dist`, `-state.ship.alt`, `scrollSpeed`, `state.ship.pitch` (`f` fixed +1). Converters take a ship handle: `toWorld`, `toShip` (and `...X` / `...Y` forms), `aimToWorld`, `aimToShip`. With `f = +1` the arithmetic is exactly the old inline arithmetic.
- **`shipLayout.js` helpers** (`all one kindOf is nearest hasKind deckIndex reviveSpot isNestDeck nestTier isNestStation`) take an optional LAYOUT as the last argument (default: the global). Never pass them bare to `.map()` (the index would be read as the layout).

**The rules:**
1. No new module-level captures of per-ship data. Build tables in a factory that takes the ship, or recompute in a function.
2. New code takes a ship handle (or uses `shipOf` / `mainShip`). It does not add `import { SHIP_LAYOUT }`.
3. World <-> ship conversions only through `pose.js`. No new `x + course.dist`, `y - state.ship.alt`, `scrollSpeed`. Ship space is never mirrored; only the boundary (rock tests, hits, guns, lamps, camera, art) uses `f`.
4. Per-ship things (layout, modules, bags, balance, GUNS, fires/holes, nav tables, art bake) live under a ship object as they are migrated (B1+).
5. Keep the update order and `Math.random` order when routing something through these.

**Enforced by** `node tools/buildsim.mjs --lint` (its `--lint-pose` half): per-file counts of the spellings above are compared with `tools/fixtures/pose-lint-allow.json`, so they can only go down. After converting call sites, lower the list with `--snapshot-pose-lint --force`.

**B.1 (per-ship Layout and Nav) is in:**
- `shipLayout.js` `createLayout(parts)` makes a Layout INSTANCE with its own arrays, objects, `version`, listeners and `balance`. The station-kind helpers are methods of it (`layout.one('helm')`, `layout.deckIndex('main')`, `layout.nearest(...)`, `layout.hasKind(...)` ...), plus `layout.applyBuild(parts)` (in place, fires only this layout's listeners) and `layout.onChange(fn)`. The methods and `balance` are non-enumerable, so the layout stays pure data. `SHIP_LAYOUT` / `SHIP_BALANCE` / `onLayoutChange` / `applyBuild` and the helpers' default argument are compatibility forwards to ship 0's layout (`ships[0].layout === SHIP_LAYOUT`).
- `layoutTables(build)` is the replacement for the old `let X; rebuildShipTables(); onLayoutChange(rebuildShipTables)` captures: `const tables = layoutTables((layout) => ({ MAIN: layout.deckIndex('main'), ... }))`, then `tables(layout).MAIN` (no argument = ship 0). One table per layout, rebuilt when that layout's version changes.
- `nav.js` `createNav(layout)` is the factory (route tables, lift speeds `connScale`, `plan`, `travelTime`, `moveWalker`, `fall`, `platformBelow`, `detach`, `direction`, `steerTo` ...). The module-level exports are forwards to ship 0's nav (`mainNav`, attached as `ships[0].nav`). Walkers still use the module functions; B.2 routes them per ship.
- Converted to read their own ship's layout (a factory takes `mainShip(state).layout`; module functions take it from their `state`): `bots`, `gunship` (`shipGeom(layout)`; the exported `GS` / `BOW` / `MAIN_X1` stay as ship 0's figures for `bots` / `gunshipArt` / `simulation`), `escort`, `searchlight` (`lightNames(layout)`, `isSearchlight(name, layout)`), `raiders`, `links`, `goingDown`, `envDeep`, `jobs`, `course` (`SHIP_SAMPLES` / `REF` / `AIM` aliases gone), `maps` (`makeMap(..., layout)`, `shipBox(layout)`), `camera`, `environments`, `envStormSea`, `squadrons`, `threats`, `specials`, `hijack`, `coil`.
- **B.1b (the rest of the per-ship layout reads) is in.** Every system now takes its ship's layout from the ship it was created for, and nothing is captured at import:
  - Factories take the ship / state: `createModules(ship)` (its layout, its nav gets the lift speed), `createShipArt({ ctx, state, sprites, ship })` (the bake is keyed on THAT layout's version and lives in the closure, one set of canvases per ship), `createBalance`, `createEngines`, `createSails`, `createHookshot`, `createAirborne`, `createRenderer` (and the art factories it makes: `envArt`, `envArtStormSea`, `envDeepArt`, `linkArt`, `searchlightArt`, `threatArt`) read `mainShip(state).layout` once; `gasBags.js` (`installBags`, `syncBags`, `liveLiftX`), `weather`, `mates`, `spotter`, `goingDownArt`, `buildStats`, `course` read it from their `state` argument.
  - `simulation.js` (call sites only; B.2 splits it properly): inside `createSimulation` `const layout = mainShip(state).layout` and the station-kind helpers are destructured from it (`const { one, all, kindOf, ... } = layout`); the module-level hit queries became `shipQueries(layout)` (`hitsShip`, `onGasbag`, `gasHoleAt`, `roomPlatformAt`); `state.GUNS` and `state.ventOpen` are filled right after `state.ships` exists (same key order); `isSearchlight` / `isEscortStation` get the layout.
  - The legacy ship-0 figures `GS` / `BOW` / `MAIN_X1` are gone from `gunship.js` (everyone reads `shipGeom(layout)`; the gunship's stern is `X0` of `gunshipBlueprint.js`); `generateBlueprint(seed, { shipLayout })` takes the layout of the ship she hunts; `isEscortStation(name, layout)` has no default.
  - Already pure (no global): `shipBuild`, `buildCheck`, `buildEdit`, `buildSlots`, `blueprintArt`, `fireModel`, `forces` (the per-ship state is `state.balance`).
  - **The only `SHIP_LAYOUT` imports left (pose lint `layoutImport` 31 -> 2):** `ships.js` (ship 0 wiring: `ship0.layout = SHIP_LAYOUT`) and `nav.js` (`mainNav = createNav(SHIP_LAYOUT)`, ship 0's nav and its module-level forwards that walkers still use). `shipLayout.js` itself keeps the compatibility forwards (`SHIP_LAYOUT`, `SHIP_BALANCE`, `onLayoutChange`, `applyBuild`, the helpers' default argument). `main.js`, `buildTest.js` and `pvpTest.js` still call the `applyBuild` forward: a dev / test build has to be applied to ship 0's layout BEFORE a simulation is created from it.
  - Gate: `--check-layouts` now also builds three more whole ship contexts (the four-bag, the two-boiler and the tiny sail ship: own Layout, Nav, modules, balance, forces, bags, sails, engines, airborne surfaces and art bake on a stub canvas) next to a real ship 0 and proves nothing crosses (masses, pivots, bag counts, module names, lift speeds, bake sizes, ship 0's frame hash and bake untouched, a new build re-bakes only that ship's art, no game error logged).
  - Left for B.2: walkers still use the module-level `nav.js` forwards; `simulation.js` itself is still one closure around ship 0.
- Gate: `node tools/buildsim.mjs --check-layouts` (also part of `--check-pose`): five Layout instances (the classic ship, a copy of it, the four-bag ship, the two-boiler ship, the tiny two-deck ship) answer helpers, derived tables and navigation each on their own, with no cross-talk, and `applyBuild` / `onChange` on one never touch another.

**M.1 (world-frame entities, world render, all-ships camera) is in. Re-snapshot #1 (botsim baseline, frames, golden, pose-lint allow-list).**
- **What moved to world (map) coordinates, with world velocities:** shells, enemy bullets / flak, rockets (always were), our bombs and the enemy bombs, planes (fighter, dogfighters, bombers, the boss, escorts, hijacked planes and their trails), bats, imps, saws, snipers, tugs and their harpoons, mines, wrecks and chutes, paratroopers, puffs / flashes / rings / popups, the supply balloon, the beams, the weather bolt, the turrets and outposts (they already were, map x), **crew in the air** (`p.fly`: `p.x / p.y` are world; `air.startFlight` takes a place on the ship and a velocity relative to her, landing / ladders / overboard convert back with `toShip`) and **hookshot hooks and ropes** (the anchor's `pos()` is world; a rock anchor simply stays). What stays in ship coordinates: the layout, crew on a deck, fires, breaches, modules, raiders (boarders), latched bats' `lx / ls` (their `x / y` are mirrored to the world each frame), `hitsShip` / `impact` / `gasHoleAt`, the overboard tumble (`p.fall`), and the gunship (still an offset `g.dx / g.dy` from our ship: it converts through `pose.js` where it meets the sky: its rock tests, shots, paratroopers, puffs and the shells that hit her).
- **The rules the conversion follows** (read them before adding an enemy): launch from the ship with `toWorld`; hit-test against the ship with `hitsShip(toShipX(ship, x), toShipY(ship, y))` (every caller converts); `inRock / groundAt / ceilAt / keepClear` take WORLD x (`course.dist` is no longer added inside them). A shot leaves at its old speed relative to her and keeps her speed at that moment (`vx = dir * speed + pose.vx`); things that steer by their speed relative to the ship (bats, imps, saws, paratroopers) add `pose.vx` to what they want, things that keep station on her (sniper, tug, the boss, bats still waiting to set off, a bat crawling over the hull) are carried by `pose.vx * dt`, a plane that holds station against her (a bomber, `noScroll`) is carried too. **`pose.vx` is the speed she REALLY moved at in the last step** (`state.shipVx`, measured in `simulation.js update`; a ship pressed against the rock or hanging in a calm has about 0 even with the lever forward); what her engines ask is still `course.js scrollSpeed` (the pilot, the lookahead and `course.advance` use that).
- **Ordering:** `course.advance(dt)` moves her FIRST in every step (not at the end of `course.update`), so everything that happens in the step (her guns firing, enemies reaching her, the shield, hit tests) sees her where she ends the step: the same geometry as the old fixed-ship frame, where a thing's screen position and the ship never moved against each other inside a step. Rock tests are done where the thing is (exact; the old frame tested one frame behind).
- **Render:** the world transform is in map coordinates (`view.cx / cy` are map coordinates; there is no `view.scroll` any more): sky, terrain and markers are drawn once, in the world; each ship's art is drawn under `translate(pose.x + shake, pose.y + bob) scale(pose.f, 1) rotate(pitch)` through `eachShip` (one art bake and crew list per ship comes with B.2: only ship 0 has them now); world effects (coil, shield band, fighter aim line, lookout arrows, searchlight beams) convert ship points with `toWorld`; crew in the air and hookshot ropes are drawn in the world after the ship (`drawAirborne`); layers that slide slower than the world (clouds, ridges, birds, snow, spores, gulls, the cave pillars) follow `view.cx`.
- **Camera:** `camera.js createWorldCamera` (`createCamera` is its old name) frames every ship it is given (`[{ pose, bounds }]`: `state.ships`; `opts.ships` overrides), the near threats and a gunship alongside; the smoothing is done relative to the ships' middle, so one ship reproduces the old framing exactly (SHIP_SCREEN_FRACTION, lead, SHIP_KEEP_IN); zoom cap `baseZoom / MAX_ZOOM_OUT`, `view.minZoom` and `view.clipped` (the ships themselves do not fit: the edge arrows' cue). `pvp/arenaCamera.js` takes `pose` instead of `alt` and `scroll`.
- **PvP bridge:** both copies share ONE sky (the same map, the same coordinates), so a shell or a bomb of one ship reaches the other's coordinates with one `toShip`; the bridge needs no `dx / dy` for the world (the rival mirror keeps them for the ship-to-ship offset; `state.rival.mid` is still in OUR ship coordinates). `pvpTest.js` (two independent sims) shifts B's world into A's with `worldOffset`.
- **Gates:** `--check-botsim`, `--check-frames` and `--check-golden` were re-captured (see botsim-baseline.txt for how the old and new frames compare: with the ship held still they play the same game step for step; a moving ship plays out differently by chaos, kills / hull within noise). Pose lint `dist 45 -> 0`, `alt 233 -> 23` (the ship's own altitude arithmetic), `scroll 21 -> 10`. `tools/dare.mjs` places its planes through the pose. Left for M.2: the pose still reads `course.dist` / `state.ship.alt` by reference and the ship's own motion (`state.ship.alt += ...`, the rock pushes, wind) still writes them.

**Gates added in B0:** `botsim --trace FILE` (per-step dump), `buildsim --check-golden` (behaviour bands against `tools/fixtures/golden.json`; re-capture with `--snapshot-golden --force` whenever a planned change legitimately moves the numbers), `buildsim --check-frames`, `buildsim --check-pose`.

## Riskiest pieces
- **`course.js` scroll assumptions:** `altBounds`, `warnAhead`, `collide` "ahead", `mapCollide`, reset. Each gets an explicit `f` factor.
- **Enemy spawning relative to the ship** (~48 lines): spawn at `toWorld(ahead)`, choosing sides by world velocity.
- **Cave collision:** samples via `toWorld`; refuse a turn into rock; gate on seeded contact counts.
- **Camera pumping:** keep-in, zoom lock, pan cap, arrows.
- **Phones flipped:** screen-relative input; a cold-player test on a flipped ship.
- **Crew while turning:** glued to the deck (ship space).
- **Airborne players:** world objects that land via `toShip`, which also works on a moving rival.

## Work packages
- **M.0:** S, can run now.
- **M.1:** L, runs alone (simulation + render together), after S.5f/g land, with the `forces.js` interface agreed with S.5h first.
- **M.2:** M, after M.1.
- **M.3:** M, after M.2.
- **M.4:** M, after S.5h and M.2.
- **M.5:** with M.4.
- **M.6:** after M.3. V.3 bot AI should be written against `state.rival.pose` from day one.

## Risks
- **Performance:** one mirror scale, same bake.
- **Motion sickness:** the camera never rotates; pan cap; zoom lock in turns; a 2.6 s telegraphed turn; a bow pennant.
- **Party controls:** screen-relative sticks; the turn is always deliberate.
- **Scope:** M.0-M.3 deliver the ask without waiting for `forces.js`.
- **Regression:** goldens first; only two planned re-snapshots.

---

# Option B: N ships in ONE simulation (the owner's choice; this REPLACES the M.0-M.6 staging above)

## The design
- **World and Ship.** `state` splits into:
  - a **World**: map, weather, enemies, bullets/shells, all phones, tempo, phase, voyage;
  - any number of **Ships**: hull, gas, guns, bags, fires, modules, crew list, art bake, pose.

  Each Ship carries its own `ship.state` that looks exactly like today's `state`:
  - its own ship fields;
  - delegating getters for world fields;
  - `players` = this ship's crew (`p.ship === id`).

  So most existing files keep working unchanged.
- **Layout per ship.** `createLayout(parts)` instances with the helpers as methods: `all`, `one`, `kindOf`, `deckIndex`, `reviveSpot`, `hasKind`, `nearest`, `isNestDeck`, `nestTier`, `balance`.
  - `SHIP_LAYOUT` / `SHIP_BALANCE` stay as aliases to ship 0 until B7.
  - The 32 module-level captures move into their factories, refreshed by `layout.onChange`.
  - `nav.js` becomes `createNav(layout)`.
- **Course / map:** world-scoped. `pilotPlan`, `keepClear` etc. take `(world, ship)`, and `course.dist` disappears (map coords are world coords).
- **Render:**
  - background and terrain are drawn once;
  - each ship's art is drawn under its pose transform (`translate`, `scale(f,1)`, `rotate(pitch)`), with one bake per ship mirrored for free;
  - ship-layer text goes through a counter-flip `label()` helper.
- **Input:** `world.players[id]` handles input for the player's `ship`. Boarding is simply `player.ship = other.id` plus a landing.
- **Enemy gunship as a Ship (end state).** Its blueprint becomes a parts list, `createShip(world, { team: 'enemy', ai: 'captain' })`, with a bot crew and captain personality. It gets a pose early (B4).
- **bridge.js / instances / `/b`:** kept only as the temporary arena harness until B7, then retired in one commit. Nothing new is built on them.
- **Rules for all new code from now on:**
  - take a ship handle (`shipOf`, `mainShip`, `eachShip`);
  - no new module-level per-ship captures;
  - world-ship conversions only via `pose.js`;
  - the lint fails new `SHIP_LAYOUT` imports and new `+ course.dist` / `- state.ship.alt`.

## Stages
**B0.** `pose.js`, layout-param helpers, lint, `--check-frames` harness, behaviour bands recorded.
- Gate: byte-identical.
- This is the M.0 work, already running.

**B1.** Layout per ship (`createLayout`, aliases into factories, `createNav`).
- Gate: byte-identical; classic deep-equal.

**B2.** World/Ship split (`createWorld` + `createShip`), per-ship renderer and bake.
- Gate: byte-identical.
- `simulation.js` is alone in its batch; keep the update order and `Math.random` order unchanged.

**B3.** World-frame entities, map-coordinate render, N-ship camera.
- Removes the `scrollSpeed` and `±alt` conversions.
- **Re-baseline #1** via `--check-frames`.

**B4.** Pose owns position; every "ahead" gets an `f` factor; the gunship gets a pose.
- Gate: identical to #1.

**B5.** COME ABOUT (helm hold-button + stick hold; bots decide; mirror draw; label counter-flip; screen-relative input; gun aim mirror; HUD bow pennant).
- Gate: identical to #1 when nobody turns.
- New `--check-turn`.

**B6.** `forces.js` flight (S.5h provides `forcesOf(ship) -> { fwd, up, torque }` in body frame).
- **Re-baseline #2**; capability table re-recorded.

**B7.** Two Ships in one World:
- rival with team + bot crew;
- cross-ship hits via `toShip` + `hitsShip`;
- enemies may target any ship;
- boarding = `player.ship` change;
- `pvp/match.js`;
- camera + HUD halves;
- retire bridge / instances / `/b`.

Gates:
- co-op identical to #2;
- `--check-arena`;
- mirror match 45-55%.

**B8.** Gunship as a Ship (parts list, captain AI, bot crew; rope / tug / boarding ported). **Re-baseline #3** via voyagesim bands.

**Order:**
1. B0
2. B1
3. B2
4. B3
5. B4
6. B5
7. B6 alongside B7
8. B8

## Gates once the identical-text gate is retired
- **`--check-frames`:** old vs new per-step world x/y, hull, kills. Tolerance grows from 1e-6 at t=0 to 2% at 3 min. Summary noise bands measured over 5 extra seeds.
- **voyagesim** Normal: victory and median minutes within bands recorded before B1.
- **Cave collision replays.**
- **`--check-minimum`** within 10% until B6.
- **A person-run visual checklist.**
- **`--check-turn`** (B5) and **`--check-arena`** (B7).

## Clashes
- **B1** touches `shipArt.js` / `modules.js`: land S.5f/g first.
- **B2** blocks other `simulation.js` work: schedule after S.5f/S.5h merge.
- **B5** shares the controller `ui.js` with Phase C.
- **V.3 PvP bot AI:** must read the rival only through one accessor `{ pose, layout, guns, bags, crew }` in WORLD coordinates, so B7 just repoints it.
- **Ship cap:** 3 ships for now (performance).

## Option B refinement (Fable, second pass): the "context view" technique and the interleaved order

**Ship object.** `ship.js` `createShip(world, { id, parts, team, ai, pose })` holds everything that belongs to one ship:
- the ship's own layout (methods `all`, `one`, `kindOf`, `applyBuild` firing this ship's listeners);
- `balanceStatic`;
- `pose`;
- `body` (today's `state.ship`);
- GUNS, bags, holes, breaches, fires, bombBay, valves, steamParts, shield, links, searchlights, escorts, rig, sailPush;
- `contact` (the per-ship course fields);
- subsystem instances (modules, balance, sails, goingDown, raiders, `createNav(layout)`, jobs, forces, art with its own bake);
- `crew()`, the players with `player.ship === id`. `state.players` stays the global registry; membership changes only via `transfer()`.

**Context view.** `ship.ctx = Object.create(state)`, with the ship-scoped keys as own properties:
- `ctx.ship = body`, `ctx.GUNS`, ...;
- `ctx.players` = this ship's crew;
- `ctx.course` = a view with the ship's contact fields.

Any subsystem handed `ctx` instead of `state` reads its own ship and falls through to the world for shared things. This lets the ~589 `state.ship` reads and ~40 factories migrate one file at a time, byte-identically.

**Shims during migration:**
- `SHIP_LAYOUT` = the same object as `ships[0].layout`.
- `onLayoutChange` forwards to ship 0.
- `S(state)` = ship 0.

The lint stops new uses; the shims are deleted at the end.

**New gate `--check-two-ships`:** classic + Sparrow in one sim, 6 bots each, 2 min, 0 errors. Asserts the two ships never cross-talk (hull, gas, fires, holes, steam), which catches reads that fell through to the wrong ship.

**Gunship as a Ship.** `gunshipBuild.js` translates her blueprint into parts.
- `addShip(..., { team: 'enemy', ai: personality })` with a bot crew; the personality drives the helm (`wantM` logic -> `commandTurn`).
- The rope becomes a grapple force in `forces.js`.
- `config.GUNSHIP.AS_SHIP` flag; parity gate; then delete gunship.js / gunshipArt.js.

**Versus:**
- `pvp/match.js` operates on `ships[]`;
- `state.rival` becomes an accessor over other-team ships;
- boarding = airborne in world space, landing on any ship's platform via its `toShip`, then `transfer()`;
- towing = a rope force between two poses;
- thrown ballast = a world projectile that becomes a live load on the ship it hits.

**Interleaved order (supersedes the stage list above where they differ):**
1. **B.0:** ship.js + context view + `shipOf` / `S()` + lint + pose on the ship. Absorbs M.0.
2. **B.1:** per-ship Layout + the 32 captures as functions/factories + `createNav`. Shared S.5f/g files go last.
3. **M.1:** world-frame entities, world render, all-ships camera. **Re-snapshot #1.**
4. **B.2:** thread `ctx` through every factory/system; the world loops over ships for hits; `interaction(ctx)`; input routed by `player.ship`; `transfer()`. Gate: `--check-two-ships`.
5. **M.2 + M.3 and B.3, in parallel:**
   - M.2 + M.3: pose owns position, plus COME ABOUT.
   - B.3: per-ship art/bake, per-ship HUD, N-pose camera, team trims.
6. **B.4:** Versus on `ships[]`, `--check-match`; retire bridge / instances / `/b`.
7. **M.4 / M.5:** `forces.js` drives every pose. **Re-snapshot #2.**
8. **B.5:** gunship as a Ship.
9. **B.6:** boarding actions, towing, ballast throws across ships.

**Honest cost:** about 3x the work of the hybrid, and it touches nearly every file once. The gain is one rulebook for every airship.
