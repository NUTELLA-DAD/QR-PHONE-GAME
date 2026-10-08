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
