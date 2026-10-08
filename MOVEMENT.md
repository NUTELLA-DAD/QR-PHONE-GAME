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
