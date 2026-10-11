# Structural damage replaces the hull bar

Planned by Fable (a read-only study). Lead's notes are marked **Lead:**.

**Lead:** the owner asked on 2026-10-10: "remove hull damage, and just make it when the ship is structurally unable to fly, so blimps break it crashes. enough structure falls away and it splits in half". The owner approved; WP0 + WP1 are built (below).

## STATUS: WP0 + WP1 built (the core feel), flag ON by default
Files: `config.js` (STRUCTURE), `modules/host/structure.js` (new), `breakOff.js` (`kind: 'cuts'`, `planSplit`), `shipSim.js` (hits, drains, `splitShip`, `reshape`, pieces), `goingDown.js` (the continuous rule), `jobs.js`, `bots.js`, `mates` (config), `render.js` (HUD), `controller` (two bars), `sfx.js` (creak), `simulation.js`, `ships.js` (`mendHull`, `piece`, SHIP_KEYS), `tools/structure-check.mjs` (`node tools/buildsim.mjs --check-structure`), `tools/botsim.mjs` (`--split`, `--sink`, a `structure:` line).
- **The switch:** `config.STRUCTURE.ENABLED` / `NO_STRUCTURE=1` in any tool = the old hull game, byte for byte (`--check-botsim` is run with it until WP6 re-snapshots the baseline). Versus (PVP.ENABLED) and the enemy gunship (`ship.ai`) still play the old hull bar until WP3.
- **What the numbers mean:** a hit costs a segment `HIT_DAMAGE x power x damage scale x HP_PER_HULL` (0.045 of a segment for one shell at scale 1; the scale is the difficulty x crew size x skulls, 0.22 on Normal with eight crew). `state.ship.hull` still exists and is **mirrored from the structure meter** (100 x the lowest critical segment), so every old reader (bots, fleet panels, sound, the captains) keeps working. `hullOrStructure(body)` / `hullLost(ship)` in structure.js give a tool the number it wants.
- **Critical = load-bearing:** a segment of a gondola deck (main, lower, keel, deep) whose middle is further than `SMALL_SHARE` (15%) of the gondola's length from both ends. Its failure leaves a big piece on each side. Everything else (the ends, the pods, the catwalk, the nests) fails as an ordinary break-off.
- **A failure** removes the segment's stretch and works out the pieces (`componentsOf`: gondola segments join along decks and frames, other decks hang on them, the nests go with their bag; a catwalk across the gap does NOT hold her together). Pieces under `SMALL_SHARE` of the deck length are break-offs; two big ones are a SPLIT (planSplit; the half with the most lift, then the helm, then the length, stays); `MIN_SHARE` folds her at the weakest main-deck segment. The split is applied at the end of the world step (`structure.flush`), never in the middle of a ship's stage.
- **Weight:** the physics are unchanged (hover at the neutral fill) but the gas she needs now includes `state.weightDeficit` = torn-away bags (`liftDeficit`) + ragged canvas (`bags[i].hp`, `CANVAS_LOSS`) + loads on her decks (`LOAD_WEIGHT`) - weight dumped. Flooding was already weight (`env.sink`). FALLING (goingDown.js) is TROUBLE only: lift short of weight by MARGIN while she sinks AND (the helm pumps hard and the gas does not come, or the bag is empty, or nobody flies her). A helm that vents and holds the bag low is diving on purpose and the alarm stays quiet.
- **Pieces:** `ship.piece`. Not a target (`targetShip`, enemy bullets), not solid (`shipCollide`), no autopilot; no bag = `FALL_ACCEL` down to `FALL_TERMINAL`; first rock/sea contact (held 0.35 s: a ship on the ground bounces) or `PIECE.LIFE` = `breakPiece` (crew go to the main ship's medbay, debris, `removeShip` after WRECK.TIME). Crew: the ABANDON job, the "ABANDON SHIP - JUMP!" button (a parachute), bots after `BOT_ABANDON` seconds; `pieceDecks` (simulation.js) lets a jumper land on the decks of the ship that flies on.
- **Ledger:** a split is one `run.lost` entry, cause `split`, price `REBUILD.MAX_HALF`; the REBUILD card restores the classic parts. A wreck with a bagless keep half limps with a spare gasbag fitted over what is left (simulation.js finishLimp).

## Notes for WP2 to WP6
- **WP2 (move the rest onto segments):** creatures, flame, hydrogen, bats, flooding and the dock repairs still call `damageHull(amount)`, now a SHIM (`structure.shim`: spread over `SHIM_SPREAD` load-bearing segments round-robin). Give each its place with `ship.sim.structure.hit(x, y, amount, { power, kind })` (the call impactBody makes); `kind: 'rock'` lands on the keel. `damageHull`'s amount is still "old hull points": `HP_PER_HULL` turns them into segment soundness. `tools/creature-check.mjs` and `tools/flame-check.mjs` read hull and wait for this.
- **WP3 (enemies and Versus):** `structure.on()` is false for `ship.ai` ships and in Versus. To turn them on, drop those two conditions in structure.js `on()` and give the gunship/match code `structure.meter()` instead of `hull`; `match.js`/`captainAI.js` read `state.hull` (the mirror) today. The captain's target is `structure.segs()` (critical, weakest).
- **WP4 (HUD):** the data is `state.frames` (each `{ sig, id, x0, x1, y0, y1, hp, st: ok|scuffed|damaged|critical, critical, hold }`), `state.ship.structure`, `state.structWorst { name, held, left }`, `state.liftWeight { lift, weight }`, `state.grounded`, `state.crashT`. The TV bar is a plain bar + a tug in `render.js drawHud`; the phone's is `ui.st { s, l, w, f }`.
- **WP5 (3D):** `state.breakEvents` gets `{ kind: 'split', plan: { split: planSplit result, scars, sigs ... }, origin, lostKeys, lostRects }` BEFORE `applyBuild` (the keep half); the piece is a second ship in `state.ships` with `piece: true` (her model is built like any ship's). A crash is `breakPiece` (a 2D debris burst + `state.ship.down`); a Rapier break-up can hook `ship.piece && ship.state.down > 0`. Soot per segment: `frames[i].hp` / `.hurtT` (not yet written).
- **WP6 (balance and tests):** re-snapshot `botsim-baseline.txt`, `golden.json`, `frames/` with the flag on; the gates still pinned to the old hull game by `NO_STRUCTURE=1` inside buildsim are listed at the end of this file; delete `damageHull`'s old branch, `GOING_DOWN`'s old last stand and `tools/goingdown.mjs`. Tuning knobs: `HP_PER_HULL`, `BREACH_RATE`, `FIRE_RATE`, `GRACE_SPLIT`, `CANVAS_LOSS`, `LIFT.*`, `CRASH.TIME`.

## In plain words
**Today:** one health bar. Every hit, fire and hole takes a little off it, and at zero she is wrecked whatever state she is really in.

**After:** there is no health bar. The ship is a frame of sections: stretches of each deck with the hull under them, plus the gasbags, engines, guns and stations. Each section has its own soundness.

What damages a section:
- a shell cracks the section it lands on;
- a fire chars it;
- an open breach tears it further until it's planked;
- a ram or a mine smashes the section it hits;
- scraping on rock grinds the keel.

A failing section creaks, shows cracks, and the TV names it: "STRUCTURE FAILING - MAIN DECK AFT". If nobody shores it up with a hammer, it gives:
- **At an end of the ship:** that end **breaks off**, as parts already do.
- **In the middle,** where it carries the weight: **she splits in half**. That makes two pieces, each with its own bags and crew.
  - A piece with no gasbag falls like a stone.
  - The crew on the falling half parachute, hookshot across, or ride it down and wake up in the medbay of the half that flies on.

**Gasbags are the other way down.** Holes and burns let the lift out. When lift drops below weight she sinks, and the LIFT / WEIGHT gauge is always on the TV. The crew patch, pump, dump cargo, bombs and coal, or cut a heavy section away, and she rises again. This can happen any number of times; there is no "one rescue per mission".

**Losing:**
- **She crashes:** she sinks to the ground or sea and sits there for a few seconds without getting her lift back.
- **She comes apart:** she splits, and the half the crew are on has no bag; or she folds when under about a third of her frame is sound.

Either way it's a wreck, as today: limp back to the last stop with a spare, otherwise the voyage ends.

**Versus:** "break her or bring her down". At the time limit, the sounder ship wins.

**Coming back:**
- Hammers shore up sections, plank breaches and patch bags.
- Dock repairs, rewards, supply drops and checkpoints shore up the weakest sections.
- A lost half comes back with a REBUILD card at the next sky-dock.

## Key rules (the technical summary)
**Segments and integrity:**
- Each deck is divided into segments of 240 px (about 20 on the classic). Each segment has hp 0..1, and its state is scuffed, damaged, critical or gone.
- Gasbags get a canvas hp. Modules (stations, guns, engines) keep their hp.
- Hits resolve to a part through `partRects`/`partAt`. A station hit also gives half the hit to the segment under it.
- Armour multiplies the damage on its segment.

**Drains on a segment:**
- breaches;
- fires;
- rock scraping on the keel.

Flooding counts as weight instead of damage.

**The load path:**
- The graph links segments along each deck and between decks through frames. Bags attach to the top decks, and the gondola is the main and lower decks.
- When a segment reaches 0:
  - small orphaned bits become ordinary break-offs;
  - two big pieces mean a **SPLIT**;
  - a frame share under 0.35 means she folds.
- STRUCTURE % = the weakest critical (load-bearing) segment.

**Splitting:**
- The half with the most lift stays the main ship. The other half becomes a temporary "piece" Ship:
  - it falls under its own lift;
  - its crew are moved across to it;
  - enemies ignore it;
  - it breaks up when it hits the ground or sea.
- There's one REBUILD entry for the lost half.

**Grace and telegraphing:**
- A critical segment holds at 2% for 8 s on Normal (14 on Easy, 6 on Veteran, 5 on Hard). A hammer saves it; a big blow (mine, ram, Kraken) skips the grace.
- No two failures within 20 s.
- No splits before stop 2 on Easy.
- Warnings: the warning text, a creak sound, a red flashing segment, crack decals, a phone buzz, and a FRAME job with a hammer.

**Falling:** Going Down becomes continuous. FALLING starts whenever lift is below weight. If she sits grounded with lift still below weight for 8 s (Easy 14, Veteran 6, Hard 5), she has CRASHED.

## TV, phones, Versus
- **TV:** the hull bar becomes a ship silhouette strip (each segment sage, amber, flashing red or gone), with "STRUCTURE 87%" and a LIFT/WEIGHT tug gauge beside it.
- **Phones:** two thin bars, STRUCTURE and LIFT, plus the name of a failing section.
- **Versus:** structure bars. The round ends "broken" or "crashed"; at the time limit, the higher structure wins.

## Knock-on systems
- **Gunship:** destroyed when she splits or crashes. Her guards shore her up.
- **AI captains:** aim at the rival's weakest load-bearing segment.
- **Creatures:**
  - Kraken grips rip sections, and a grip in the middle can split her;
  - the breach smashes keel segments;
  - Drake breath burns segments;
  - Drake perch claws hit the top decks.
- **Rams and mines:** hit the contact segment.
- **Bots** repair in this order: coal fires, gas crisis, falling jobs, critical frames, breaches, damaged frames, broken modules, holes.
- **Scorecard:** a "Shipwright" award for shoring up the most frames.
- **3D:** soot per segment, crack decals, and the split carves the seam. When the falling half crashes, it becomes a huge Rapier break-up.

**Gates (WP1):** `--check-structure` is new. Pinned to the old hull game with `NO_STRUCTURE=1` inside `buildsim.mjs` until WP6 re-snapshots them: `--check-botsim`, `--check-golden`, `--check-frames` (and their `--snapshot-*`), the parity half of `--check-gunship-ship` (the hull it compares is a few hundredths of one segment a run with structure on: noise, until WP3), and `--check-creature` until WP2 moves the creatures onto segments (the Kraken drags her into the sea, where a crash is now a loss: its seeded fights go the other way with structure on). Adapted minimally to read the frame instead of the hull bar (`hullLost(ship)` from structure.js, `ship.sim.wreck(text)` where a test used to drain the hull to 0): `--check-two-ships` (with fleet-check, which also draws a split on a stub canvas), `--check-fire`, `--check-gas`, `--check-yard`. Unchanged and passing with the flag on: breakoff, health, hatch, match, bags, crossship, engines, engine sizes. `tools/goingdown.mjs` (the old last stand) pins `STRUCTURE.ENABLED = false`. `tools/flame-check.mjs` has one failing check ("a bot carries coal to an empty tank") that also fails on the code before this work.

## Roadmap
| # | Package | Size |
|---|---|---|
| WP0 | `structure.js` segments and graph, wired in but read by nothing; a `NO_STRUCTURE` switch keeps the old game byte for byte | S |
| WP1 | **The core feel:** hits on segments, grace, warnings, creak; the FRAME repair job; split into piece ships; continuous falling and the crash rule; wreck causes; a simple STRUCTURE bar and lift tug on TV and phones | L |
| WP2 | Move creatures, flame, hydrogen, flooding, bats, scraping and rewards onto segments | M |
| WP3 | Enemies and Versus rules: the gunship, the match, the captain AI and its rival-frame target | M |
| WP4 | The HUD silhouette strip, fleet panels, Versus HUD, phone polish | M |
| WP5 | 3D: segment soot, cracks, the split seam, the piece crashing into Rapier wreckage | M |
| WP6 | Rewrite the tests, re-tune balance (target Normal classic about 50%), delete the old hull, re-snapshot the baselines | M |
| WP7 | Scorecard, REBUILD pricing, docs | S |

WP2 to WP5 can run in parallel after WP1. The Flagship-as-a-Ship (so it splits too) comes later.

## Risks
| Risk | How it's handled |
|---|---|
| Balance swings | measure the old game first, tune one setting at a time, use the `NO_STRUCTURE` switch until WP6 |
| Sudden-split frustration | grace time, a named warning, creaks, red flashing, a 20 s gap between failures, parachutes, medbay revive |
| Readability | three tones and two words; sofa test |
| Bots | job caps so they don't abandon the guns |
| Bagless "piece" ships | new territory, so the code is guarded and given its own check |
