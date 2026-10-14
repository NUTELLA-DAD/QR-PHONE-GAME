# The core loop: scrap, build, climb

Fable's game-design study (read-only), 2026-10-10. The owner asked: "Game loop is important. the crew should be ship building as they go from scraps and levels should be more and more complicated". Lead's notes are marked **Lead:**.

**Lead:** waiting for the owner's OK. The 3D level mechanics (orbit finale and others) follow in a separate Fable answer.

**G1 status (scrap, flotsam and the hold): built on branch `worktree-agent-a61e948826c7cd386`, not merged. `config.SCRAP.ENABLED` is on by default; `NO_SCRAP=1` in any tool (or `ENABLED: false`, or Versus) is the old game byte for byte.**
- **Files:** `modules/host/scrap.js` (new: the hold, the flotsam system, the helm's plan), `scrapArt.js` (new: bundle, chute, ring, hulk, bin), `cargo.js` (the `scrap` item, chute physics, stow / pick up / take off a hulk / dump), `hookshot.js` (a bundle is a light anchor), `towing.js` + `aim.js` (the harpoon hooks a hulk), `goingDown.js` (DUMP THE SCRAP), `balance.js` / `structure.js` (the hold weighs), `jobs.js` / `bots.js` (STOW, hulk, the helm steers under flotsam, the hookshot stunt), `render.js` / `shipArt.js` / `view3d` (rings, chutes, bin), `spotter.js` + phone radar (gold blips), `logWriter.js` (four new moments), `tools/scrap-check.mjs` (`buildsim.mjs --check-scrap`).
- **How scrap flows:** a kill is noticed (a plane gone from its list with 0 hp, the zeppelin, a creature dying or losing a limb, a gunship sinking), `flotsam.drop` makes bundles that fall on chutes as `world.thrown` items (`chute: true`), drift with the wind and land on any deck as LOADS (weight counted); the helm bot slows under them in a calm, a hookshot reels one to the thrower's feet, a harpoon hauls a gunship's HULK alongside and crew take its bundles from the rail; Action picks one up, Action at the hold bin (derived from the Hold room: no new part) stows it; the supply balloon is a crate of 2; GRAB at the bin takes one out again; while she falls, hold Action at the bin dumps the lot. `holdSpend(state, n)` / `holdAdd(state, n)` in scrap.js are the purse for G2 and G4.
- **Gates:** `--check-scrap` (new); `--check-botsim`, `--check-golden`, `--check-frames` and `--check-creature` run with `NO_SCRAP=1` until G7 re-snapshots them (`NO_STRUCTURE` is gone: FUN.md F11 re-snapshotted the structure game; `--check-log` is green again). `--check-log` pins `SCRAP.ENABLED = false` in its scenes (its gunship scene leaves before the hunt once the helm detours), and fails 3 checks of its own on this branch with or without scrap (holes patched, going-down-saved, the run end: the Book was cut before STRUCTURE).
- **Income (`voyagesim.mjs`, Normal, 8 bots, 24 seeds, its `scrap:` line):** the classic ship catches 5.1 bundles a stop (median 4.8, runs 2.4-17.5; target 5-8) and stows 3.0; 7.6 a stop fall (supply crates 3.6, boss 1.6, creatures 1.2, fighters 0.8, gunships 0.2, squadrons and bombers 0.2) and 5.5 are lost (given up, dumped while falling). The Sparrow catches 4.3. Hulks are rarely stripped by bots (no harpoon gun aboard: the helm has to fly alongside).
- **The cost:** the hold is heavy and nothing spends scrap yet. With `BUNDLE_W` 4 the classic ship's bots win about half as often (48 seeds, 101-148: 11 victories against 27 with NO_SCRAP=1; 16 at weight 2, 17 at 1, 23 at 0). The weight is the whole cost: the helm detours, the hookshot stunt and the stowing are free (steering and hooking off at weight 0: 25). The Sparrow's bots already die at stop 3 and do not change (0/24 and 2/24). G7 re-tunes (`SCRAP.BUNDLE_W`, `HOLD_CAP`), and G2 spending the hold at the dock should take most of it back.
- **Balance pass (2026-10-11):** the hold now weighs `(held - HOLD_FREE) x BUNDLE_W` with `BUNDLE_W` 1 and `HOLD_FREE` 2 (a full hold of 8 weighs 6 points, was 16; `scrap.js holdWeight`); the bots stop going after flotsam (the helm's detour, hulks, the hookshot stunt) once the hold holds `SCRAP.BOTS.HOLD_SOFT` (5); DUMP THE SCRAP is the first dump a falling crew makes (after 1 s, `GOING_DOWN.EARLY.SCRAP`). Under the structure rule (STRUCTURE.md, balance pass) the scrap was most of the ~20 points of weight the bot ships carried over neutral (hold 5.5 bundles + 3 lying on the decks at weight 2) and the bot helm did not know about it (`gasFor` now adds `structDeficit`); with that fixed the weight stops being a trap, and the sims can no longer tell weight 1 from weight 2 inside their noise (96 seeds each, 5-15 victories either way). `--check-scrap` follows the new numbers. G2 prices in scrap should still re-tune `BUNDLE_W` / `HOLD_FREE`.
- **For G2 (prices):** the purse is `holdCount(state)` / `holdSpend(state, n)` / `holdAdd(state, n)` (scrap.js) on a ship's context (`state.scrapHold.count`; ship 0's forwards to the world); the dock already shows it (`render.js drawVote`, `yardArt.js`). `run.scrap` and `run.scrapStowed` carry the stats; a derelict leg that pays scrap calls `holdAdd`. A price that takes more than the hold cap is never payable.
- **G2 + the scrap patch (2026-10-13, FUN.md F7 un-paused; branch worktree-agent-a4db37fa85a453806, not merged):** scrap is back ON in the browser and now builds things. `SCRAP.ENABLED` is on in the browser; in a Node tool it stays off unless `SCRAP_ON=1` (`NO_SCRAP=1` always pins it off), so every baseline gate is still the game without scrap.
- **The Yard's prices (`config.SCRAP.PRICE`, `simulation.js priceInScrap / settleScrap`):** a Yard part or a fitting is paid half in cash and half in BUNDLES from the hold. Bundles = old price / `PART_PER` 30 (parts: 90 -> 3, 130 -> 4, 170 -> 6; later parts cost more of both) or / `FITTING_PER` 40 (fittings 2-3), cash = `CASH_SHARE` 0.5 of the old price. A bundle the hold cannot cover is paid in cash at the other half of the price shared over the bundles, so a crew with no scrap pays exactly the old price (the safety valve; the dock never locks). MEND HER, REBUILD, trophies and a derelict's free part are not priced in scrap. Cards say `Salvage 65 + 3 scrap` (TV, phone `o.price`), the TV's 3-card dock draws one gold bundle for each the card asks (bright = the hold covers it), and the header already shows the hold. `holdSpend` takes the bundles when the vote buys; bots vote for a part card the hold pays in bundles at `PRICE.BOT_BUY` 0.9. The vote flow and the 12 s / 35 s dock are untouched.
- **The scrap patch (`config.SCRAP.PATCH`, `structure.js patchNear / patchWork`, `shipSim.js` action `scrappatch`):** carrying a bundle at a segment of the frame under `PATCH.AT` 0.6 soundness (the FRAME-job segments), hold Action `PATCH.TIME` 2 s: +`PATCH.HP` 0.3 soundness, a plate (`g.plates`, up to 3, kept across re-cuts of the frame) that takes `PLATE_SHIELD` 0.08 of every blow on its segment each; a segment held at 0 that is saved is the Book moment `scrap-patch`. It needs no hammer, comes before the hold bin and the rail, and a patch let go half way starts over (`DECAY`). GRAB at the hold bin takes a bundle out for it (`cargo.unstowAction`). Phone: big button `PATCH <SEGMENT> (scrap)`, role verb PATCH; gold arrows `jobs.js` kinds `scrapgrab` (to the bin: TAKE SCRAP OUT OF THE HOLD - <SEGMENT> IS FAILING) then `scrappatch`, urgency x `PATCH.URGENT` 1.8 for a critical segment. Bots (`bots.js` job `scrappatch`, `unstow` for bots only on that job): a critical segment ahead of the hammer jobs, the rest with them. 2D look: `scrapArt.js drawRivetPlate`, `shipArt.js livePlates` (iron plates with rivets on the deck's edge). **For the lead: the plates are not in the 3D view yet** (the 2D layer draws only the HUD over it); the hook is `state.frames[i].plates` (a count 0-3, `x`, `y`, `d`) for `view3d`.
- **Book moments:** `scrap-patch` (weight 7: a held segment saved by a bundle) and `scrap-built` (weight 4: a part or fitting paid with bundles, naming the voters); sentences in `logWriter.js` (SENT and the short LEADER lines only).
- **Balance:** the drop rates are unchanged (FLOTSAM 0.35 / 1 / 2 / 2 / 4 / 6 / 8): the bots already stow 3.0-3.5 a stop (17 a voyage) against 1.9-2.8 a voyage dumped (G1: 71 dumped per voyage, then 5), and the prices now ask about 9 a voyage at the docks plus 1-2 patches, so the rest stays in the hold (average hold 2.5 of 8, was 5.4: it weighs `(held - 2) x 1` on the LIFT gauge, so spending it also lightens her). I tried 0.5 / 3 / 3 for fighters / squadrons / gunships: income 4.5 caught a stop but nothing more was spent, so it went back.
- **Voyagesim (Sparrow, Normal, bot profile, 48 seeds 1-48; classic 24 seeds; scrap on vs `NO_SCRAP=1`):** Sparrow wins 9/48 off, 14/48 on (first 24 on, final code: 9/24 against 7/24 off), timeouts 31 off, 28 on (12/24 on in the final 24 against 15/24 off), parts bought by the Flagship 3.9 -> 3.7-3.9 (flat: the dock offers one part card and the bots already took it most docks; what changed is what it costs: 9 bundles a voyage at the docks, about 2.5 cards a voyage paid with them, and the cash saved goes to MEND HER); classic wins 4/24 -> 4/24, timeouts 16 -> 13, parts 4.6 -> 4.1 (noise level). G1's scrap on (before G2): Sparrow 8/24, classic 1/24. Bundles stowed 17 a voyage against 1.9 dumped (Sparrow), patches 1.7 a voyage (0-2 held segments saved in 24 voyages), carrying 0.5% of crew time (0.3% before: bots stow only in idle moments; a bundle is about 12 s of carrying, so a human crew catching 4-5 a stop carries about 1-2% of the time). 24 runs say "not worse", not "better": the win count is inside the noise.
- **Gates:** `--check-scrap` (now 13 sections: the patch and the dock's prices), `--check-botsim` / golden / frames byte-identical (pinned with `NO_SCRAP`), `--check-structure`, `--check-steamfix`, `--check-treasure`, `--check-stop-shape`, `--check-yard`, `--check-log`, `--check-hygiene`, `--lint` all green. `tools/scrap-shots.mjs` (a real Chrome, shots `../3d-screenshots/scrap_2d_*.png`: the gold arrow, GRAB at the bin, PATCH on the phone, the bar, one and two plates, the dock with a full and an empty hold and with a fitting).
- **Not done:** derelict legs paying scrap (the derelict's free part stays free), selling scrap for cash, the 3D look of the plates, `view3d` price badges, G7's final tune.
- **G4 status (frames: the in-flight build crew job, 2026-10-13, branch worktree-agent-a4557eac8d3f86f04, not merged; `config.FRAMES`, `NO_FRAMES=1` = the game without them, scrap off = no frames either):** a small Yard part can be bought as a FRAME and the crew BUILD it in flight from carried scrap. `host/buildFrames.js` (new), `simulation.js frameCard / placeFrame / finishFrame`, `shipSim.js growPart`.
  - **At the dock:** a part card for one of the small parts (`FRAMES.PARTS`: guns of every type, a lamp, armour, ballast, a bunker, a sail, a ladder, a pole, a lift, a hatch; never an engine, a bag, a boiler, the bomb bay, a deck or a nest) gets a twin card right after it, "Gun mount (FRAME)": the same part and places (the A / B / C vote is unchanged), `CASH_SHARE` 0.4 of the old price in salvage, no bundles at the dock, "Salvage 40, carry 3 scrap" (`need` = price / `PER` 30, 2 to 6). The dock is now [MEND HER, part, frame, Cast off] (TV 2 x 2, phone `dock4`: three cards in a row and Cast off); the 12 s / 35 s votes are untouched. One frame at a time (`MAX_PENDING`); a free derelict part and the trophies have no frame card. Buying it takes the salvage and no bundles, sells the plain card too, and puts the frame on its Yard place (`state.run.frames[]`).
  - **In flight:** a crewman carrying a bundle (GRAB at the hold bin, or one off the deck or a hulk) at the frame's work spot (the deck point nearest the place, `frameSpot`, `REACH` 70 px) holds Action `TIME` 2.5 s: one bundle in, the frame is n/m (a bundle let go half way starts over, `DECAY`). The phone's big button says `BUILD GUN MOUNT (1/3)` with the gold arrows `buildgrab` (TAKE SCRAP OUT OF THE HOLD - TO BUILD THE GUN MOUNT, then the frame, `jobs.js`) and the role verb BUILD; GRAB at the bin feeds it; a failing segment under his feet is still patched first (the scrap patch); the arrows show only in a calm (`FRAMES.ARROWS`: tempo build / calm / escape and no fall, raiders, fire, gunship or live creature: `buildFrames.calmFor`), so a person is never sent off a gun or the boiler in a crisis (he can still build any time). The last bundle makes the part come alive: `shipSim.growPart` replaces the layout in the air (the mirror of `breakOff`: `snapshotOld` + `reshape`, nobody thrown, guns and lamps made again with their shells, the frame re-cut), `run.build` / `run.parts` / the save grow, power is re-worked, the TV says NEW: GUN MOUNT. Parts broken off and waiting for a REBUILD do not stop it (the part is added to each `lost[].before` too, so the REBUILD cards bring it back); a place that is really gone says "No room for this frame now" and the next dock pays the frame back.
  - **Provenance:** `run.parts[i] = { id, name, names, frame: true, by: [builders] }` (also in `save.build.log`), the Book moment `frame-built` (weight 6, "The gun mount went up on her deck one bundle at a time, built by Ann and Bo.") and the Log, `stat framed`, `run.scrap.framed / framesBuilt`.
  - **Bots:** `bots.js scrapJobs / frameJob`, job `buildframe` (carry a bundle in, or take one out of the bin and carry it), `CAP` 2 at once, only in a calm (`calmFor(state, FRAMES.BOTS.ALLOW)`: tempo calm or escape, no fall, raiders, fire, gunship or live creature; a set piece or a fire makes a bot drop the job and stow the bundle); in the dock they vote for the frame card only when they cannot pay for the plain card (`BOTS.BUY` 0.8). `BOTS.PREFER` (0 by default) is the chance they pick the frame even when they can buy the plain card.
  - **2D look:** `scrapArt.drawFrameScaffold` (timber poles and braces round the part's place, iron plates rising as bundles go in, a bundle slot for each, a gold "BUILD n/m" plate, a gold ring on the deck where the crew stand), drawn by `shipArt.js liveFrames`; the dock's blueprint stamp says FRAME. **For the lead / R4 (3D):** the scaffold is not in the 3D view yet (view3d untouched); the clean state is `state.run.frames` (`world.run`, ship 0's), each `{ id, entry, name, need, fill, prog (0..1 of the bundle in hand), x, y (ship coords of the part's place), ghost: { x0, y0, x1, y1 } (its box, ship coords), where, letter, ok, done, by }`, and `buildFrames.frameSpot(ship, f) -> { d, x }` (where the crew stand). Until R4 the HUD layer over the 3D picture draws a gold "BUILD GUN MOUNT 1/3" tag over that spot (`render.js drawOver3D`).
  - **Gates:** `--check-frames-build` (new, `tools/frames-build-check.mjs`, 70-odd checks: the card, buying, the work, the part coming alive, the Log, arrows, bots in a calm only, a ship that changed under it, two ships, the switches, 6 eight-bot voyages with 0 errors), `--check-scrap` (G2's dock scenes pin `FRAMES.ENABLED = false`), `--check-botsim` / golden / frames (trace) byte-identical (scrap is off in them), structure, yard, stop-shape, book, log, hygiene, lint, role-cards, steamfix, treasure green. `tools/frames-shots.mjs` (a real Chrome, `../3d-screenshots/frames_2d_*.png` and `frames_3d_*`: the dock's two cards, the places vote, the arrows, the phone's BUILD button, the scaffold at 0/3, 1/3, 2/3, the part alive, the Book).
  - **Voyagesim (Normal, 8 bots, scrap on, `NO_FRAMES=1` against frames on, 72 Sparrow seeds and 24 classic):** Sparrow wins 23/72 off, 22/72 on; timeouts 37 / 39; mean stops 5.5 / 5.4; parts 4.0 / 4.0; classic wins 4/24 / 4/24, timeouts 13 / 14, stops 4.9 / 5.0 (not worse; inside the noise). The bots hardly buy frames under the shipped rule (0.1 a voyage, 0.1 built; classic about 0): they can nearly always pay for the plain card, and **a bot crew that swaps a part it can buy now for a frame loses wins** (`BOTS.PREFER` 0.8: 0.9 frames bought and 0.7 built a voyage, parts 3.7, Sparrow wins 15/72, timeouts 46, stops 5.0): the part arrives a stop late and the bots carry only in a calm. So whether frames beat the plain card is a question for people, not for the bots. Carrying scrap 0.5% of crew time (Sparrow) / 0.3% (classic), idle seat time 21.6% / 21.2% (off: 21.7% over the same 72 seeds, classic 21.1%), 8.2 bundles a voyage paid at the docks (8.2 off). A first version that let bots take the frame whenever the hold could not cover the card (and blocked a frame while parts were lost) played 17/72 wins and 45 timeouts: the lost-parts rule and the bots' cannibalising were the cause, both fixed above.
  - **Not done:** the 3D scaffold (R4), a human crew's numbers (how many frames they buy and finish is unmeasured), derelict legs paying frames, frames for the big parts, a second frame at once, G7's tune of `CASH_SHARE` / `PER`.
- **R4 status (3D ghosts of Yard places and frames, 2026-10-13, branch worktree-agent-ac6d3972a98400ed0, not merged; `config.FRAMES3D`):** the G4 frame has a real 3D look. View only (`view3d/frames3d.js` + `framesKit.js`, `index.js`, `config.js`; `render.js` drops one duplicate popup; no sim file touched, `--check-botsim` byte-identical). A scaffold of pale timber poles, beams and braces stands at the frame's place with a translucent blueprint-blue ghost of the part inside it (volume, bright edges with a dark line under them, a line for each bundle still to carry, a cross) and a gold pennant; every bundle in adds a slab of riveted steel from the bottom up; while a bundle goes in (`prog`) a gold HDR band rises through the next layer (10 steps a bundle) and gold sparks fly; a pulsing gold ring lies on the deck where the crew stand. When the last bundle is in, `growPart` bumps `layout.version`, `index.js modelFor` builds the ship's model again with the new part (checked: 3 -> 4 gun parts, `frames-shots --view 3d`) and a BUILT moment plays for 6 keys (a gold shell swelling round the part's box, sparks, dust, a flash, a ring). 3 draw calls at most (solid with its ink, ghost, glow), all on the ship's own `content`. **Yard places:** the dock's A / B / C vote is a full-screen 2D blueprint overlay (no 3D ship under it), so there are no 3D place ghosts (skipped on purpose). **HUD:** the sim's floating "2/3" pop (`shipSim.js` buildframe) sat on the "BUILD 2/3" tag; `render.js` no longer draws a popup that reads `n/m` (2D and 3D); the tag and the bar stay. Screenshots `3d-screenshots/r4_*.png` (`node tools/frames-shots.mjs --view 3d [--r4zoom 2]`: empty, a bundle going in, half built, nearly full, built moment x2, finished; each also with the builder stepped aside as `_clear`). **Known:** a gun's ghost box is the deck station's place and the gun itself comes alive on its sponson about 90 px along (G4's Yard data, not changed); the builder stands in front of the scaffold, so most of it is hidden while he works.
- **For G4 (frames):** a bundle in the hands is `player.carry === 'scrap'` (GRAB at the bin takes one out, `cargo.unstow`), a frame can take it with its own Action the way the bin does (`cargo.stowAction` is the pattern, `type: 'stow'`); bundles lying on a deck are LOADS (`kind: 'scrap'`); `cargo.place('scrap', d, x)` puts one there; the phone's job arrows are `jobs.js` kind `stow` (gold) and bots' `scrapJobs` (bots.js).

## Decisions in plain words
1. **Scrap is a thing you carry, not a number.**
   - Where it comes from: it falls out of the sky (on little parachutes) when you shoot something down, sits in chests at outposts, and comes off derelicts and captured gunships.
   - Getting it aboard: someone catches it, with the helm getting under it or a hookshot pulling it in, and carries it to the HOLD.
   - The hold is heavy: a full hold shows on the LIFT/WEIGHT gauge, so build it in or dump it.
2. **"Money mends, scrap builds."** Salvage money pays for repairs, gas, coal, shells and REBUILD. Parts cost scrap.
3. **Small parts in flight, big parts at the dock.**
   - In flight the crew plant a FRAME at a ghost spot, feed it scrap and hammer it: ladders, poles, lamps, a gun, armour, ballast, bunkers, a sail, a hatch, and scrap patches on failing structure.
   - Hull bays, decks, gasbags, engines, boilers, the bomb bay and nests stay at the Shipwright's Yard, priced in scrap.
4. **Building is a crew job.** One phone plants the frame, everyone else gets arrows ("BRING SCRAP", "HAMMER THE FRAME"), and two hammers work twice as fast. The TV shows one dashed frame with a filling ring. There's no crafting-station menu.
5. **The voyage teaches on purpose.** A curriculum decides what comes when, instead of random stops.
6. **No death spiral, real stretch goals.**
   - A struggling crew is offered a SALVAGE RUN branch (rich in scrap, light on enemies).
   - A strong crew is offered a pirate nest or a lair for double scrap.
7. **The Book remembers the ship.** Every part records where it came from and who hammered it: "the aft gun came off the Iron Widow at Frost Peaks; Kenny and Mia bolted it on". Scrap patches stay on the hull as riveted plates.

## Why (from the code)
- **Building is only a dock menu today.** The measured truth (SHIP_BUILDING b8) is that **bots buying parts barely changes the outcome**: the parts are decoration, not the loop.
- **Every stop's sky and kind are random,** so there is no teaching order.
- **The foundations exist:**
  - cargo items that have weight and are carried, thrown, dumped and landed on any deck (`cargo.js`);
  - hookshot anchors;
  - in-flight parts-list replacement (break-off, run in the adding direction);
  - Yard offers with validated places;
  - wrecks that already fall from shot-down bombers.

## The ramp (Normal, 7-8 stops)
| Stop | Sky and kind | New for the crew | Scrap lesson |
|---|---|---|---|
| 1 | Sky Isles cave run | fire, holes, coal, guns on bats and one fighter (no gunship); mooring drill | first flotsam: "get under it" |
| 2 | Sky Isles or a pass | planes; the first gunship | hookshot the flotsam; first Yard part |
| 3 | Frost or Ember raid | relentless boarders, bomb runs, treasure chests | chests; the first field frame |
| 4 | the other of those | gas management (ice or thermals), squadrons | structure patches with scrap |
| 5 | Storm, Sea or Fungal | darkness, searchlights, weather; the Nemesis returns | strip the prize |
| 6 | lair or storm crossing | the creature; splits now possible | lair debris, a big part |
| 7 | multi-part objective | everything at once | top up |
| 8 | the Aether, the Flagship | lift in thin air | - |

**Modes:**
- **QUICK (4 stops):** teach, a gunship and chests, a new sky with a Nemesis or lair, then the Flagship.
- **CAMPAIGN:** voyage 2 starts at column 3.

**Inside a stop:** maps grow, outposts increase, set pieces are gated by column, and objectives become multi-part from column 6.

**New objectives:**
- **SALVAGE RUN:** the catch-up stop.
- **HEIST:** board a courier gunship and take its chest (part of the treasure package).
- **DEFEND:** hold a friendly outpost against waves.

**Pace:**
- Income of 5-8 scrap a stop.
- Prices: 1-3 scrap for small parts, up to 8 for a great engine.
- 7-9 parts by the Flagship (today: 3.8). The Sparrow reaches the classic ship's power around stop 6.
- The danger already follows the ship's power.

**Across evenings:**
- The Book keeps the ship and the roster.
- One victory unlocks the classic ship as a "VETERAN START".
- Skies and creatures unlock in order.
- A lost ship gets a black-bordered page and a fresh Sparrow.

## The loop
```
MINUTE   stations and chaos + catch scrap + carry it to the hold + feed and hammer a frame in a lull
STOP     fly -> objective -> scorecard -> DOCK (mend with money, build with scrap, 3 cards, under 60 s) -> pick a route
EVENING  teaching ramp -> one new thing a stop -> lair -> Nemesis -> Flagship; the ship grows from a scrap raft to a warship
WEEK     the Book remembers the ship, titles and the Nemesis; unlocks; a harder voyage next time
```

## A first evening (crew of 5)
- **Lobby:** the drill, then they christen her "The Dented Kipper". She's a gasbag, three short decks, two engines, three guns and an empty hold.
- **Stop 1 (Sky Isles):** a shot-down fighter's crate drifts down; the helm catches it and Ann stows it. Scrap: 1.
- **Stop 2 (a pass):** a gunship is shot down and leaves a hulk with scrap; Kenny hookshots a crate. Scrap: 5. At the dock they buy a gun mount on the fore sponson.
- **Stop 3 (Frost Peaks raid):**
  - Mia hookshots down for a treasure chest.
  - Raiders board relentlessly.
  - "STRUCTURE FAILING - MAIN DECK AFT": Bob shores it up, then patches it with scrap (a riveted plate stays on the hull).
  - Their first frame, a searchlight, is built by Ann, Kenny and Bob.
- **Stop 4 (Ember Forge):**
  - The coal catches fire.
  - They strip a derelict, which earns a named card: "the Grey Heron's aft gun".
  - A courier gunship flees and becomes the Nemesis.
  - At the dock they buy a second gasbag.
- **Stop 5 (Storm Front):**
  - Their own searchlight is the only way to see.
  - "THE IRON WIDOW RETURNS": they board her and take her helm.
  - They strip her mortar.
  - At the dock they buy a bomb bay.
- **Stop 6 (Kraken lair):** the Kraken's chunks are worth 8 scrap and they win the beak trophy. A grip rips the aft outrigger off (REBUILD).
- **Stop 7 (the Aether, the Flagship):** victory. The run-end page lists her parts with their stories. About 75 minutes in all.

## Keep, change, cut
**Stays:**
- the Yard and its slot vote;
- the 27-part catalogue, frozen (field parts are a flag on existing parts);
- the validator, REBUILD, power relief, salvage money, cargo, the hookshot, the pacing director, lairs, limp home, the modes.

**Changes:**
- parts are priced in scrap;
- a Yard card at every dock;
- derelicts give scrap;
- the supply balloon becomes a scrap crate;
- the shop is 3 cards (MEND HER, the Yard part, one fitting) plus Cast off;
- scrap can be sold or bought as a safety valve.

**Goes:** the old stat upgrades that parts now cover. Six stay as money "fittings".

**Ships:**
- **Sparrow:** the start.
- **Classic:** the veteran start, and still the test baseline.

**Versus:** untouched.

## Balance targets
- **Ship power by column:** 0.45 rising to 1.0, against skulls 1, 1, 2, 2, 3, 3, 3.
- **Win rates (8 bots):**

| Difficulty | Win rate |
|---|---|
| Easy | 85-95% |
| Normal | 50-60% |
| Veteran | 35-45% |
| Hard | 10-25% |

- **The gate that matters:** bot crews that build must reach at least one more stop than crews that don't (`--no-build`).
- **Fun metrics:**
  - 6 or more moments per 10 minutes;
  - idle time under 15%;
  - scrap carrying 5-12% of crew time;
  - 60% or more of players touch a frame;
  - the dock under 60 seconds.

## Combined roadmap (with STRUCTURE WP, SHIP'S BOOK L, raiders R, treasure T)
| # | Package | Size |
|---|---|---|
| G0 | Curriculum: tiered skies, column gates, lairs from 0.6 of the route, mode shapes, the catch-up branch | S |
| G1 | Scrap and flotsam: item, hold, flotsam from kills, land/hook/harpoon, stow, weight, bots stow and steer under | M |
| G2 | Yard in scrap: prices, sell/buy, derelict legs give scrap, upgrades trimmed, shop of 3 cards (FUN.md F6 already made the 3-card dock and the six fittings with `SHOP.V2`; G2 is the scrap prices on top) | S/M |
| T | Treasure chests at outposts, HEIST | M |
| G4 | Frames (the in-flight build crew job, the phone BUILD card, scrap patches, provenance) | L |
| G5 | Derelicts and stripping, named part cards | M |
| G6 | Objectives: SALVAGE RUN, DEFEND | M |
| G7 | Bosun bot, `--no-build`, one combined re-tune and re-snapshot with STRUCTURE WP6 | M |
| G8 | Campaign across evenings (veteran start, unlocks) | S/M |

**G0 status: DONE (2026-10-11, branch worktree-agent-a9ecba2a5b5b13d24).**
- **What exists:** `config.VOYAGE.CURRICULUM` (tier A/B skies, a table per mode, the power curve, the salvage run, tags) and a `generateCurriculum` in `voyage.js`; `ENABLED: false` is byte-identical to the old routes.
- **Director gates and catch-up:** the pacing director takes its set pieces from the stop's `gates` (no gunship, bombers or strafers in column 1); `startRoute` offers a SALVAGE RUN when `run.power` is under the curve.
- **Route map:** shows "NEW: ..." tags and SALVAGE.
- **Gate and tools:** `buildsim --check-curriculum` (`tools/curriculum-check.mjs`); `voyagesim` prints the power-vs-skulls curve and lairs/salvage offered and taken.
- **For later packages:**
  - The salvage run is flown on a pass map for now (an outpost raid needs a bomb bay, which the Sparrow lacks); G6 gives it a real objective.
  - `ring` and `multi` are flags only (R0, G6).
  - Drake lairs now only appear in QUICK (Ember Forge is tier A, lairs start at 60% of the route).
  - Today's Sparrow is under the power curve at every column, so it is offered a salvage run almost every time.
  - `botsim` forces the curriculum off (its baselines are single missions).

**R0 status: DONE (2026-10-11, branch worktree-agent-a6532dc52adcee83f).**
- **What exists:** the ring map in the 2D sim. `maps.js buildRingMap` (kind `ring`, variants tower / fortress / citadel: an approach of hills, then a strip C = 2 pi R long with a platform under every face, floor islands, spires and cornices; `map.ring = { xRing, R, C, axisY, faces, spires, rev }`), `ring.js` (the rules: faces as outposts, the shutter window, cores, specials, the gallery and its charge, revolving turrets, victory, the crown, the citadel's mooring), `ringArt.js` (the flat 2D castle faces with a shutter, the gallery ledge, moorings, zip-lines, and the RING DIAL under the minimap), `config.RING` (every number).
- **What a ring stop plays like:** fly the approach (a gun or two), reach the castle, shoot a face's guns down (bombs help); the moment the last gun falls the shutter opens for 6 s: shells and bombs now hurt the core (14 to 18 points; a bomb is 6), then it shuts for 24 s and opens again. A shut shutter only chips the KEEP's pool (slow and safe). Each face has one special: bats from a hangar, a flak battery, a mortar, or a boarding gallery (hook or fly onto the ledge, walk to the keep door, hold Action 4 s: the charge goes off 6 s later and breaches the face; raiders zip-line to the ship from it). Revolving guns ride a rail round the ring. Every core down (or the keep's pool, or on the citadel the Flagship sunk) and the crown falls in slow motion; the stop completes and the Ship's Book has who breached each gate and who planted the charge.
- **The citadel** moors the Flagship to its two faces (`squadrons.js` spawnBoss / moorStep): each breached face cuts a mooring, with both cut she falls; her hit points still sink her the old way.
- **Curriculum:** stops flagged `ring` fly the ring map (`voyage.js curriculumRings`; the Flagship's stop too); `config.RING.ENABLED = false` gives back the outpost raid.
- **Gates and tools:** `buildsim --check-ring` (`tools/ring-check.mjs`), `botsim --map ring --variant tower|fortress|citadel` (RING_FORCE_BOARD=1 puts a bot on the gallery to plant the charge), `tools/ring-trace.mjs` (a second-by-second look at a ring fight), `host.html?kind=ring&variant=fortress` for the browser; `--check-botsim` is byte-identical (no ring in the fixtures).
- **For R1 (the bend and camera):** the ring is the strip from `map.ring.xRing` for `C` px; a world x on it is the angle `(x - xRing) / R` (ring.js `ringAngle`); `axisY` is the lane the ship flies (about 1400 px above the platforms); everything on the ring (faces, turrets, specials, revolving guns, the Flagship's moor point, the gallery ledge) is in plain map px, so the bend is a pure view transform. Revolving turrets wrap at the ring's end (`t.mx` jumps back by C: invisible once bent). The core box, shutter, gallery ledge and keep door are in `course.ring.faces[i]` (`core`, `open` seconds left, `gal`). The sim has no depth: shells and the hookshot are flat.
- **For R2 (castle art):** the keep wall is drawn 880 x 760 px at each face with the core alcove (300 x 340) at its foot; the shutter is `f.open > 0`; the gallery is `gal = { x0, x1, y, door }` (800 px long, 560 px above the platform); specials stand 950 px to the side; the Flagship hangs `MOOR.UP` (2500) above the platforms with a rope to the top of each face; `ringArt.js` is the placeholder to replace.
- **Not done in R0:** the helm bot does not try to out-run the revolving guns (it flies the route like any other); the gallery's raiders ride a simple zip-line, not the gunship's spring rope.
- **F12 (FUN.md "small ships crack castles"), 2026-10-12, branch worktree-agent-ae935c0b09628e50c, not merged:** `config.RING.FAIR` (`NO_RINGFAIR=1` = the old ring): a ship with no bomb bay has her guns' magazines filled each time a shutter opens (the bay's refill is the classic ship's), the bots send a hand to the one gun that can reach the core as a window opens, the gates a crew had breached stay breached across a limp home, and the old citadel's Flagship is no longer carried over to the new castle (it hung on the old mooring and made the stop unwinnable after one wreck). `botsim --map ring` Sparrow fortress 1/4 -> 4/4 falls in 8 minutes (median 273 s), citadel 2/4 -> 4/4, tower 150 -> 98 s; the classic ship is byte-identical. In voyages the Sparrow wins 1 -> 4 of 24 and castle stops fall 9 -> 13, but the timeouts stay 18 (the castle still wrecks her; see FUN.md F12 for the numbers and what is left).

**R1 status: DONE (2026-10-11, branch worktree-agent-a9d2b2d11ad14ef11).**
- **What exists:** the ring in 3D. `view3d/ringBend.js` wraps the flat strip round the castle in the vertex shaders (every built-in material through patched Three.js chunks; the custom shaders of the particles, lines, contact shadow and beams by hand); `view3d/ringCastle.js` is the placeholder castle; `config.RING3D` has every number. The simulation, the physics (Rapier stays flat) and every other 3D module are untouched in the flat frame: nothing in `view3d/` had to learn about the ring except where it stands in the way.
- **How the camera works (a deliberate change from "the camera circles the ring"):** the 2D camera still decides { cx, cy, zoom } and the 3D camera is the plain gameplay lens, never rolled. The ring is wrapped round the castle RELATIVE TO THE LOOK-AT POINT: the world is rotated about the castle instead of the camera. The picture is the same as a camera standing at R + D and yawing by the ring angle, but the sky, the clouds, the culling, the cinematics (COME ABOUT, kick, cast off ...) and the HUD keep working with no change, and the plane at the ship is the flat plane of today: the HUD is exact. The strip is perfectly flat within `RING3D.FLAT` (the ship's half length + a pad) of the look-at point and eases into the true circle over `BLEND` px, so the ship is rigid and not bent like a banana.
- **On screen:** on the ring the keep (a stone tower with a cone roof, the placeholder) always stands straight behind the ship in the middle of the picture, the faces and rock curve away to both sides and turn as she flies; on the approach the keep swings in from the right and settles behind her at the ring's start. The approach's last 0.8 R eases into the circle (an arc of half the ring's curvature), so there is no corner where the approach meets the ring.
- **The HUD:** `V.hud3d.project` bends the point first; `V.hudView` hands the 2D HUD `view.scr(x, y, w, h)` on a ring map, and the lookout and spotter arrows and the lit-target brackets use it (far markers); `V.alignError` is measured over the flat zone (`alignError(view, w, h, 1)` = the whole screen, which grows toward the edges: the ring curving away). Measured round all three rings, the approach and a COME ABOUT: 0.0000 px at the ship's anchors and on the grid, no roll.
- **Gates and tools:** `node tools/buildsim.mjs --check-ring3d` (`tools/ring3d-check.mjs`: 8 bots live on each ring with the Medium budgets, the shader against the HUD's maths, the circle, the come about with the cinematics off and on, tier Low, the spyglass, the 2D view, screenshots with `--shots DIR`); `cine3d-check --only ring`; a `ring` scene in `--check-3d` with its fixture; `--check-botsim` is byte-identical.
- **For R2 (the castle art):** replace `ringCastle.js` (same `createRingCastle({ parent, state })` / `update({ on, map, t, dt })` shape). A face is drawn in the FLAT map frame (the shaders bend it with the strip, ~900 px wide is fine); the keep is NOT on the strip: stand it at `RB.axis()` (the axis in the camera frame) with materials that have `defines: { RING_SKIP: '' }` (the bend leaves them alone). Read `course.ring.faces[i]` (`open` shutter seconds, `down`, `hp`, `special.dead`, `gal`, `charge`), `course.ring.moor`, `course.ring.crown` for the slow-motion fall. The placeholder redraws its stone only when a face falls, a special is wrecked or a shutter moves a step.
- **Not done in R1:** no endless wrap (one lap, as planned); the terrain streams about +-7200 px round the look-at point, so the far side of the ring is not built (the keep and the sky hide it); wreckage bodies stay in the flat frame (they fall on the flat rock, which is drawn bent, so it still matches); the ring dial and the face list stay 2D.

**R3 status: BUILT (2026-10-13, branch worktree-agent-aba71b6fadf746b4b, not merged; `config.DEPTH3D`, `?look=nodepth`).** Parallax landmarks and arrivals from depth. View only (`view3d/depth3d.js`, `landmarks3d.js`, `landmarkArt.js`, `farKit.js`, plus small edits in `world.js`, `flyers.js`, `index.js`; no simulation file and nothing in `host/` touched, `--check-botsim` byte-identical).
- **Landmarks:** every environment has its own far things at real 3D depth (Sky Isles: floating islands with a castle, a windmill, a lighthouse, an arch; Ember: spires, a volcano with a glowing crater, a floating foundry, wrecks, chimneys; Frost: ice spires, a glacier, ice isles; Sea: sea stacks and lighthouses; Aether: crystals and ruined arches; Storm: black spires with a blinking rod lamp, floating ruins; Fungal: giant mushrooms), laid along the map by a seeded generator and fixed to the world, so the ship's flight drifts them past at the parallax of their depth. Two draw calls (a far band and a near band, between the painted strips); none in caves, on ring maps or at tier Low.
- **The destination on the horizon:** one more call: the next outpost on an open raid (a fort with three towers), or a lair's backdrop (the Drake's volcano, the Thunderbird's storm crown, the Kraken's sea stacks) shows from 14000 px away, GROWS and slides in as the ship comes near (a function of the distance), and dissolves where the real outpost stands up.
- **Arrivals from depth:** the sim has no early hint (the pacing director picks the set piece at the moment it spawns it), so the "approach ghost" is the real model drawn far back in the depth while it is outside the picture, exactly at the edge of the picture, and brought forward as the sim brings it in (squadrons, bombers, bosses, bat swarms, the gunship; the supply balloon, which appears in view, flies in from the depth over 2.2 s). Never for friends, in caves, on ring maps or in Versus.
- **Gate and tools:** `node tools/depth3d-check.mjs [--quick] [--shots DIR]` (own server, headless Chrome; the landmarks of six environments, the arrival, the destination at three distances, tiers and the kill-switch, and the draw calls the depth adds: +1 to +3 in open scenes, +4 with a lair's giant, on Medium). Screenshots `3d-screenshots/depth_landmarks_*.png`, `depth_arrive_1-3.png`, `depth_dest_1-3.png`. Notes in 3D.md section 37.
- **Not done:** no landmarks inside caves or on the ring; the landmarks' height is a share of the screen (no parallax when the ship climbs); no ink on far things (they are painted like the strips).

**R5 status: BUILT (2026-10-13, same branch, same switch).** Weather fronts from depth, the fortress porthole and creature depth. View only again (`fronts3d.js`, `fortressPorthole.js`, `farCreature.js`).
- **Weather fronts:** a shelf-cloud wall (one call, painted in code; the storm's has a rain curtain under its flat base) rolls in from the horizon before the weather arrives and rolls away after. A storm front is driven by the ROUTE (the sim's own storm zones with a lead of 0.07 of the route before the zone and a tail after, eased over a few seconds); a blizzard (Frost) and the Ember smoke bank by the sim's own number (they have no earlier hint).
- **The fortress porthole:** on a ring map a gate whose shutter is open while its face is off screen gets a round window at the edge of the picture (the gatehouse and the open core from a camera of its own, a red and brass rim, a plate "GATE 2 - CORE OPEN 9s"), fading in and out in four held shades. Its rim and plate are drawn in 3D (the HUD layer for the other portholes lives in `host/`). Medium and High.
- **Creature depth:** before a lair fight the lair's giant circles far away on a table of 8 fps positions (the Drake over the Ember Forge, the Thunderbird in the storm, the Kraken's arms and eyes at the sea's edge): one call, gone when the real creature spawns.
- **Gate and tools:** `tools/depth3d-check.mjs --only front,fortress,creature`. Screenshots `3d-screenshots/depth_front_1-3.png`, `depth_front_blizzard.png`, `depth_front_smoke.png`, `depth_fortress.png`, `depth_creature_*.png`. Notes in 3D.md section 37.
- **Not done:** no lightning inside the wall (the whole-sky flash is as before); no front on the Storm Front mission itself (the whole sky is the storm); the fortress window shows one face at a time; no host-side plan for it (so the 2D view has no such window).

**G3 / T status (treasure at outposts, the HEIST): BUILT (2026-10-13, branch worktree-agent-a1554d3203c59cb50, not merged), as CASTLE.md package A2 (the owner's "at outposts can we also make a mechanic for our crew to grab treasure and collect it back to the ship").** `host/treasure.js`, `config.AWAY.TREASURE`, on with the away team (3 or more crew; `NO_AWAY=1` turns it off). When an outpost on an open-sky raid falls its vault opens on the ground with 1 to 3 treasure CHESTS (by the stop's danger) and sometimes a sack of gold; the away team grabs a chest (hold Action), carries it (heavy: half speed, a second man makes it 85%) to the rope ladder and up, and STOWS it in the hold bin (or hooks it up with the hookshot); each chest in the hold or in your arms weighs `CHEST.W` 6 on the LIFT / WEIGHT gauge (`scrap.js holdWeight` now adds the chests, so balance, structure and going down feel it - "weight affects lift"; scrap itself stays off by default); each pays 9 salvage on the scorecard's "treasure" row when the stop ends (or at the dock for a ship that limped home). A vault guard squad shoots at a man who carries; a chest lifted during F6's ESCAPE calm and got aboard is a HEIST (+4 each, a Book moment, the scorecard waits for a man still on the ground: A0's STRANDED rule). Treasure is a bonus and never required. Numbers: voyagesim 24 Sparrow runs, treasure on with no trips vs `NO_AWAY=1`: identical (8 / 24 victories, 12 timeouts, 0 errors, every seed's line the same) because nothing happens until a person lifts a chest; botsim open-map output identical too. Gates and details: CASTLE.md A2 status; `--check-treasure`. Not done: the outposts' surviving guns do not shoot carriers (only the squad), GOING DOWN's emergency dump does not throw chests, no 3D models (A3: the HUD layer stands in), G7 tunes `CHEST.PAY` / `HEIST.BONUS` / `GUARDS` with the rest.

**Order:**
1. G0, L0 and WP0 (all small, in parallel).
2. WP1, G1 and L1. Merge WP1 first. **Playtest with real people here.**
3. G2, T, R, L2, WP2 and WP3.
4. G4, WP4, WP5, L3 and L4.
5. G5, G6, L5, L6 and WP6.
6. G7, together with WP6's re-tune: a single re-snapshot.
7. G8, L7, L8 and WP7.

**Changes to the Ship's Book order:**
- L8's shop trim moves into G2, and its derelict event into G5.
- Save v3 (L2) includes the hold and part provenance.
- The Nemesis carries a strippable part.
- Orders gain scrap tasks.

## Risks
| Risk | How it's handled |
|---|---|
| Too complex for a party crowd | one item that works like a crate; arrows instead of menus; one frame at a time; one new thing a stop |
| Death spirals | money mends automatically; salvage runs; limp home keeps the hold |
| Building still useless for bots | the bosun bot plus the `--no-build` gate; tune the parts before anything else |
| Balance swings | `SCRAP.ENABLED` off keeps the game byte-identical; one combined re-tune |
| Hoarding | hold cap, weight, a poor sell rate |
| Two currencies | the one sentence plus icons on every card |

## The 3D add-on: the orbit finale and other 3D mechanics (Fable's second answer)
**The orbit finale is a real "ring" map in the 2D simulation, bent into a circle by the 3D view.**
- **Why in the sim:** the castle's faces must be shootable, boardable and bombable; view-only faces would mean "I'm shooting it and nothing happens".
- **How it works:** a ring is a straight strip whose end is glued into a circle only in the picture. One lap is about 28000 px, a normal map's width.
- **v1 has no endless wrap:** one full circle is the finale, and COME ABOUT still works.

**The map (`maps.js` kind `ring`):**
- an approach (the castle grows on the horizon), then the ring;
- floor islands, ceiling cornices, and spires from the castle;
- FACES are outposts at angles, each with turrets, a core behind a SHUTTER (it opens for 6 s after its turrets fall), and one special: a bat hangar, flak, a mortar, or a BOARDING GALLERY (hookshot on and plant a charge; raiders zip-line to you);
- revolving turrets;
- victory: all cores down, or the keep's pool; the crown falls in slow motion.

**The view:**
- every drawn thing passes through a `bend(x, y, z)`; terrain is bent once at build time;
- the camera stays tangent to the ring (no roll), so the HUD stays exact at the ship, and the castle is always behind the ship in the middle of the picture;
- the stick and phones are unchanged; guns aim as today (shells look like they curve inward);
- a small ring dial on the HUD;
- the 2D fallback plays the same level flat.

**Where it appears:**

| Ring | Where | Size |
|---|---|---|
| TOWER | stop 3 | one face, three turrets |
| FORTRESS | stop 6, when there's no lair | four faces, a gallery, revolving guns |
| CITADEL | the Flagship's mooring at the end of every mode | - |

Later, the Island Titan can circle a ring, and DEFEND can be a ring round your own outpost.

**Other 3D mechanics, ranked by fun per effort:**
1. **The ring and orbit finale:** build (M + M + M).
2. **Parallax destination:** a castle or beacon grows on the horizon for the whole level. Build (S).
3. **3D ghosts of parts on the real ship:** for Yard places and in-flight frames. Build (S/M).
4. **Arrivals from depth:** squadrons, creatures and gunships swoop in along the depth axis during their untouchable moment. Build (S).
5. **Bent routes:** a level that turns corners. Later (M).
6. **Weather fronts sweeping in from depth:** a telegraph. Build (S).
7. **More look-down in shafts and canyons:** S.
8. **A porthole onto the fortress's open face:** S.
9. **Creatures circling in 3D:** only while untouchable. S.
10. **Depth lanes and near/far broadsides: DO NOT BUILD.** Hits are 2D, so a plane you can see but can't hit breaks the game for the party and for the bots. Depth is for staging only.

**Rule:** the 2D sim is authoritative. Things move in depth only while they can't be hit, and the HUD stays within a pixel at the ship.

**Ring packages:**

| # | Package | Size |
|---|---|---|
| R0 | the ring map in the sim (faces, shutters, revolving turrets, gallery, the keep), `botsim --map ring`, a flat 2D fallback with the dial | M |
| R1 | the bend and the ring camera; HUD within 1 px through a whole circle | M |
| R2 | the castle kit and art, the ring dial, the slow-motion crown fall | M (the castle art is BUILT, see CASTLE.md R2 and 3D.md section 29; the dial and the crown fall are D3) |
| R3 | parallax landmarks and arrivals from depth | S |
| R4 | 3D ghosts of Yard places and frames (with G4) | S/M |
| R5 | weather fronts from depth, the fortress porthole, creature depth | S |
| R6 | bent routes | M (later) |

**Updated combined order:**
1. G0, L0 and WP0.
2. WP1, G1, L1 and **R0**. **Playtest here.**
3. G2, G3, L2, WP2, WP3, the raiders and **R1**.
4. G4 with **R4**, L3, L4, WP4, WP5 and **R2** (the first orbit finale reaches players).
5. G5, G6, L5, L6, WP6 and **R3**.
6. G7 with WP6: one balance pass.
7. G8, L7, L8, WP7 and **R5**.

R6 comes later.
