# Structural damage replaces the hull bar

Planned by Fable (a read-only study). Lead's notes are marked **Lead:**.

**Lead:** the owner asked on 2026-10-10: "remove hull damage, and just make it when the ship is structurally unable to fly, so blimps break it crashes. enough structure falls away and it splits in half". The owner approved; WP0 + WP1 are built (below).

## STATUS: WP0 + WP1 built (the core feel), flag ON by default
Files: `config.js` (STRUCTURE), `modules/host/structure.js` (new), `breakOff.js` (`kind: 'cuts'`, `planSplit`), `shipSim.js` (hits, drains, `splitShip`, `reshape`, pieces), `goingDown.js` (the continuous rule), `jobs.js`, `bots.js`, `mates` (config), `render.js` (HUD), `controller` (two bars), `sfx.js` (creak), `simulation.js`, `ships.js` (`mendHull`, `piece`, SHIP_KEYS), `tools/structure-check.mjs` (`node tools/buildsim.mjs --check-structure`), `tools/botsim.mjs` (`--split`, `--sink`, a `structure:` line).
- **The switch (gone, WP6 / FUN.md F11):** there is no `STRUCTURE.ENABLED` / `NO_STRUCTURE` any more; the structure game is the only rule for the co-op ship and every baseline is a structure-game snapshot. Versus (PVP.ENABLED) and the enemy gunship (`ship.ai`) have no frame (`structure.on()` false) and still play the old hull bar until WP3.
- **WP5 built (2026-10-13, 3D.md section 36; view only, no sim file touched):** the frame in 3D. A hurt segment goes dark and charred as its soundness drops and grows a web of cracks (soot and cracks per segment in rows 2-3 of the ship's damage data texture, no new draw call); a segment under 30% or holding at 0 blinks red edges and glowing cracks on the 8 fps key; while a grace runs a hot jagged SEAM with sparks runs top to bottom through the failing column; the split note makes a flash, sparks, dust and torn planks (Rapier shards) in the gap, grows torn teeth on both cut ends, and the half that falls (`ship.piece`) tips seam end down, drifts away from the seam and trails smoke; when it crashes (`ship.ctx.ship.down` turns positive) it breaks into three Rapier pieces and its big parts plus shards, with dust and rock chips on rock or a splash in the sea. `config.STRUCT3D`, `view3d/structure3d.js`, `tools/structure3d-shots.mjs` (shots `3d-screenshots/wp5_*.png`). What the view needed and the sim does not give: it finds the start of a grace by `frames[i].hold`, the crash by `down` turning positive on a piece ship and reads the pieces' boxes from `state.debris`; a piece's own `frames` start at soundness 1 (a new ship), so the view copies what the whole ship wore (by deck and overlap) for the soot. A split needs EVERY gondola deck at the column to fail (the decks above and below hold her together): the seam is drawn through all of them.
- **Scrap patch (2026-10-13, LOOP.md G2):** `structure.js patchNear / patchWork`: a crewman carrying a bundle of scrap rivets a segment under `SCRAP.PATCH.AT` (+0.3 soundness, 2 s of Action, no hammer); each segment keeps `plates` (0-3), carried across `sync`, and every plate takes `PLATE_SHIELD` of the damage `hurtSeg` applies. `structStats.patched / patchSaves`.
- **WP6 done (2026-10-12, FUN.md F11) and the first half of WP2:** the legacy last stand (`goingDown.js tryStart / spawnHoles / spawnCargo / succeed / fail`, `GOING_DOWN` keys only they read) and `tools/goingdown.mjs` are deleted; `startFall()` is the gates' hook. The creatures (Kraken rip / slap / breach, Drake swoop / lash / lunge / spout / breath, Thunderbird pass) hit the segment under the blow through `structure.js creatureHit`; flame, a flood, bats, the bomb bay and scraping still go through the `damageHull` shim (WP2's second half). `state.ship.structure` is the reading, `state.ship.hull` its mirror; `hullOrStructure(body)` is what the bots, the sound, the dock and the tools read. `botsim-baseline.txt` (new `--snapshot-botsim --force`), `golden.json` and `frames/` re-snapshotted once; `--check-creature` runs the structure game (422 pass). The rival-ship hull-bar drain in `shipSim.js stepUpkeep` stays for the gunship and Versus (now `config.SHIP.DRAIN`) until WP3. Numbers and the before / after tables are in FUN.md F11.
- **What the numbers mean:** a hit costs a segment `HIT_DAMAGE x power x damage scale x HP_PER_HULL` (0.045 of a segment for one shell at scale 1; the scale is the difficulty x crew size x skulls, 0.22 on Normal with eight crew). `state.ship.hull` still exists and is **mirrored from the structure meter** (100 x the lowest critical segment), so every old reader (bots, fleet panels, sound, the captains) keeps working. `hullOrStructure(body)` / `hullLost(ship)` in structure.js give a tool the number it wants.
- **Critical = load-bearing:** a segment of a gondola deck (main, lower, keel, deep) whose middle is further than `SMALL_SHARE` (15%) of the gondola's length from both ends. Its failure leaves a big piece on each side. Everything else (the ends, the pods, the catwalk, the nests) fails as an ordinary break-off.
- **A failure** removes the segment's stretch and works out the pieces (`componentsOf`: gondola segments join along decks and frames, other decks hang on them, the nests go with their bag; a catwalk across the gap does NOT hold her together). Pieces under `SMALL_SHARE` of the deck length are break-offs; two big ones are a SPLIT (planSplit; the half with the most lift, then the helm, then the length, stays); `MIN_SHARE` folds her at the weakest main-deck segment. The split is applied at the end of the world step (`structure.flush`), never in the middle of a ship's stage.
- **Weight:** the physics are unchanged (hover at the neutral fill) but the gas she needs now includes `state.weightDeficit` = torn-away bags (`liftDeficit`) + ragged canvas (`bags[i].hp`, `CANVAS_LOSS`) + loads on her decks (`LOAD_WEIGHT`) - weight dumped. Flooding was already weight (`env.sink`). FALLING (goingDown.js) is TROUBLE only: lift short of weight by MARGIN while she sinks AND (the helm pumps hard and the gas does not come, or the bag is empty, or nobody flies her). A helm that vents and holds the bag low is diving on purpose and the alarm stays quiet.
- **Pieces:** `ship.piece`. Not a target (`targetShip`, enemy bullets), not solid (`shipCollide`), no autopilot; no bag = `FALL_ACCEL` down to `FALL_TERMINAL`; first rock/sea contact (held 0.35 s: a ship on the ground bounces) or `PIECE.LIFE` = `breakPiece` (crew go to the main ship's medbay, debris, `removeShip` after WRECK.TIME). Crew: the ABANDON job, the "ABANDON SHIP - JUMP!" button (a parachute), bots after `BOT_ABANDON` seconds; `pieceDecks` (simulation.js) lets a jumper land on the decks of the ship that flies on.
- **Ledger:** a split is one `run.lost` entry, cause `split`, price `REBUILD.MAX_HALF`; the REBUILD card restores the classic parts. A wreck with a bagless keep half limps with a spare gasbag fitted over what is left (simulation.js finishLimp).

## Balance pass (2026-10-11): the lift rule and the bots that play it
The owner's first playtest was coming, and `voyagesim` (Normal, 8 bots) said the structure game was the main reason the new systems cost so many wins (`--build classic` 5/48 against 18/48 with everything off; no build 23/48 against 33/48). The sims showed that almost nothing was wrong with the *rule*; it was how the bots played it, plus one weight.
- **What was really going on.** (1) The bots' helm did not know the ship was heavy: `gasFor` (course.js) still hovered her at the neutral fill, so a hold of scrap and bundles lying on the decks (18 of the ~20 points of weight the fleet carried over neutral) made her sink all the way to the ground. (2) The bot helm also vented the bags flat to dive to the route's altitude; a flat bag with no steam to pump it up again is how most falls began. (3) The helm was empty a fifth of the time: the helmsman is knocked out at his wheel by raiders, and the next hand then stood beside his body unable to sit down (a body within 65 px takes the Action button for a revive; so did a hammer in the hand, or a hurt module or cracked frame under it); the stand-in was whoever happened to think first, and the guns were manned in front of the wheel. (4) The crash clock ran silently on the ground with no alarm, and every alarm took every gunner off his gun.
- **What changed in the rules (all in `config.STRUCTURE`).** An empty helm alone is no longer trouble (only with a lift deficit of `LIFT.NOHELM_SHORT`); a ship down on the ground is trouble unless it is a GRAZE (`LIFT.GRAZE` short for less than `GRAZE_T` s); the crash clock only runs inside a FALLING alarm (so the crew is always told first), only while she is short by more than `CRASH.SHORT`, and at `CRASH.RECOVER_MUL` while the gas is rising (a working pump buys time). `CRASH.TIME` is now Easy 20, Normal 12, Veteran 9, Hard 7 (it was 14 / 8 / 6 / 5). The emergency ballast (`GAS.BALLAST`) also works while she falls, and lifts her to the level she hovers at plus `OVER`.
- **What changed in the bots (structure on only; the pinned old game is byte for byte).** The nearest free hand takes an empty helm, ahead of every station (`helmDeputy`, goingDown.js); he sets his tool down and stands where no body is in reach; the helm vents only to `STRUCTURE.BOT.DIVE` under the hover level; the helm stops the engines while she falls (`GOING_DOWN.COAST`) and the pump gets the steam; more hands stoke when the steam is low (`STOKE_LOW`) and the firebox is topped up at `BOTS.FUEL_LOW_LIVE`; a falling ship also sends hands to open a shut critical valve, shut a leaking one, repair a broken helm / lift / boiler or pipe, and shut the valve of a ruptured bag; the dumps come early (`GOING_DOWN.EARLY`: scrap after 1 s, bombs 1.5 s, the coal bunker only with fuel in the firebox); a small fall (`GOING_DOWN.ALL_HANDS`) leaves the gunners on their guns.
- **Scrap.** `SCRAP.BUNDLE_W` 2 to 1 and `SCRAP.HOLD_FREE` 2 (the first two bundles in the hold are ballast: a full hold weighs 6 points, not 16); the bots stop chasing flotsam, hulks and hook shots once the hold holds `BOTS.HOLD_SOFT` (5).
- **Three bugs the sims turned up.** (a) A lair never ended when a gun killed its creature: the creature system wrote `bossDownLap` from a ship's context, where it shadowed the world's, so `course.js` never saw the lair slain and the stop ran to the 45-minute cap (`ships.js WORLD_WRITES`; this was a fifth of the "timeouts"). (b) `engines.js`: a bot asked for the engines' nose weights before they were brought up to date after a deck was cut away; the throw ended the whole step before the engines updated, so every tick after threw again (55 thousand errors in one voyage and a ship that no longer flew); `noseWeights` now syncs first. (c) `nav.js plan` threw `nodesOn[d2] is not iterable` for a deck that no longer exists: a REVIVE job for a crewman who was on the half that split off (jobs now only name crew of the bot's own ship), and loads / raiders / bombs / ice left on a deck number after a build was fitted at the dock (`fitBuild` now moves or drops them). `steer()` also drops a job whose deck is gone.
- **Where it stands (voyagesim, Normal, 8 bots, seeds 1-48; victories; the first number is before this pass, the second after).**

  | config | `--build classic` | no build |
  |---|---|---|
  | everything on | 5 -> 4 | 23 -> 20 |
  | everything off (the old game) | 18 -> 18 | 33 -> 36 (the bug fixes below help it too) |
  | only STRUCTURE on | 6 -> 9 | 22 -> 28 |
  | only SCRAP on | 10 -> 13 | 28 -> 30 |
  | STRUCTURE off, the rest on | - -> 7 | - -> 26 |
  | SCRAP off, the rest on | - -> 6 | - -> 19 |
  | neither on (curriculum, ring, squadrons only) | - -> 9 | - -> 30 |
  | SQUADRONS off / CURRICULUM off / RING off | - -> 7 / 7 / 9 | - -> 20 / 20 / 24 |
  | Easy, everything on (24 seeds) | 4 -> 3 | 10 -> 11 |
  | Hard, everything on (24 seeds) | 0 -> 0 (mean stops 2.7 -> 4.0) | 0 -> 4 (mean stops 1.8 -> 4.3) |

  The structure rule alone is now within noise of the old game (28 of 36 without a build); with the curriculum, the ring, the squadrons and the scrap on top the win count does not move (4 and 20, against 9 and 30 with the other three only). Every wreck is still a CRASH: a voyage ends at the fourth, and the bots die about once per stop either way. What changed is when: minutes per wreck 7.3 -> 9.0 on the classic build, so more voyages are still flying at the 45-minute cap (timeouts 8 -> 18 of 48): they survive and run out of clock, not out of lives.
- **What is left is combat, not lift.** In the falls that end in a crash the helm is empty or unpowered, the steam is down and 3+ crewmen are knocked out when the alarm sounds, and no setting of the rule saves her: `CRASH.TIME` 8 / 14 / 24, the hold at weight 2 or 1, the dive limit, the coasting and the ballast each moved the win count by less than the noise (96 seeds: 5 to 17 victories per variant on the classic build). Fires, raiders and a broken helm pipe are what overrun the crew at stops 3-5; the old game absorbed them in the hull bar. To win more the next step is not a lift number but fewer ways to be overrun at once (the bots' fire and boarder defence), or a longer clock for a voyage that now takes longer.
- **Tools.** `voyagesim` now prints a `structure:` line (falls, saves, crashes, splits per voyage and what every wreck was); `botsim --sink` also kills the steam (the bots refill a flat bag in a moment now).

## F13 steam and lift (2026-10-12, FUN.md): the lift rule stays, what feeds it is fairer
The rule is unchanged except `STEAMFIX.GRAZE` 24 / `GRAZE_T` 6 (a dive onto a cave ledge is no longer a fall; it was 16 / 4). The falls came from the steam, and the steam was starved by blowouts (the boiler ran away when idle), burst pipes with their valves open and a bot that never shut a vent: see `config.STEAMFIX`, `host/steamFix.js` and the FUN.md F13 line. A burst pipe shuts its own valve, the boiler has a damper, the pump is served first, a warning ladder (LOW ON COAL, LOW STEAM, SINKING) comes before FALLING. `NO_STEAMFIX=1` is the old game.

## Notes for WP2 to WP6
- **WP2 (move the rest onto segments):** creatures, flame, hydrogen, bats, flooding and the dock repairs still call `damageHull(amount)`, now a SHIM (`structure.shim`: spread over `SHIM_SPREAD` load-bearing segments round-robin). Give each its place with `ship.sim.structure.hit(x, y, amount, { power, kind })` (the call impactBody makes); `kind: 'rock'` lands on the keel. `damageHull`'s amount is still "old hull points": `HP_PER_HULL` turns them into segment soundness. `tools/creature-check.mjs` and `tools/flame-check.mjs` read hull and wait for this.
- **WP3 (enemies and Versus):** `structure.on()` is false for `ship.ai` ships and in Versus. To turn them on, drop those two conditions in structure.js `on()` and give the gunship/match code `structure.meter()` instead of `hull`; `match.js`/`captainAI.js` read `state.hull` (the mirror) today. The captain's target is `structure.segs()` (critical, weakest).
- **WP4 (HUD):** the data is `state.frames` (each `{ sig, id, x0, x1, y0, y1, hp, st: ok|scuffed|damaged|critical, critical, hold }`), `state.ship.structure`, `state.structWorst { name, held, left }`, `state.liftWeight { lift, weight }`, `state.grounded`, `state.crashT`. The TV bar is a plain bar + a tug in `render.js drawHud`; the phone's is `ui.st { s, l, w, f }`.
- **WP5 (3D): DONE (see the status line at the top).** What it was planned from: `state.breakEvents` gets `{ kind: 'split', plan: { split: planSplit result, scars, sigs ... }, origin, lostKeys, lostRects }` BEFORE `applyBuild` (the keep half); the piece is a second ship in `state.ships` with `piece: true` (her model is built like any ship's). A crash is `breakPiece` (a 2D debris burst + `state.ship.down`); a Rapier break-up can hook `ship.piece && ship.state.down > 0`. Soot per segment: `frames[i].hp` / `.hurtT` (not yet written).
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

**Falling:** Going Down becomes continuous. FALLING starts whenever lift is below weight. If she sits grounded with lift still below weight, inside the alarm, for 12 s (Easy 20, Veteran 9, Hard 7; the clock slows while the gas is rising), she has CRASHED. (Balance pass, 2026-10-11: it was 8 / 14 / 6 / 5.)

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
