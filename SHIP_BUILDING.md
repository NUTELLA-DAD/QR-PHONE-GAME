# Phase S - Modular ship building (plan, written with Fable)

**Owner's idea:** start with a basic ship. Between levels, choose what to add (another gasbag, a longer hull, another deck, a middle crow's nest, lift engines), so each voyage you build the ship you want. Prove it works with a **building simulator**.

## 0. In one paragraph

Today the ship is one fixed drawing: every deck, ladder, gun and station is a number in `public/shipLayout.js`, and about 42 code files read those numbers.

The plan turns the ship into **LEGO parts**: a short list of placed parts (hull bays, decks, gasbags, engines, nests, gun mounts...). From that list the game *generates* the deck layout, the art, the walking routes, the collision shape and the camera framing.

The current ship becomes one saved recipe, **"classic"**, so nothing changes for players until we want it to. Then:
1. A **building simulator** checks any recipe automatically: can everyone reach everything, does she float, is there enough steam, can the bots crew her?
2. The crew **buys and places parts at the sky-dock**.

The enemy gunships already work this way (`gunshipBlueprint.js` generates a ship from a seed), so the approach is proven in this codebase.

## 1. Player experience

### The starting ship, "the Sparrow"
- **Shape:** compact, 2 decks and a catwalk, 4 hull bays.
- **Lift and engines:** one gasbag and 2 engines.
- **Stations:** one crow's nest (Lookout and Nest Searchlight), Helm, Boiler, Coal Bunker, Ammo Hold, a Workshop with racks, and a medbay.
- **Guns:** 3 (Nose, Tail, Fore Sponson).
- **Getting around:** 2 ladders and a slide pole.
- **Why it's fun:** walking is short (under 25% of crew time) and everyone is needed.
- **Why it's limited:**
  - few guns;
  - no bomb bay;
  - one bag, so one bad hole sends her into a dive;
  - slow.
- **The classic (current) ship** is roughly what a crew reaches by stop 5-6. It stays the default for tests.

### The build moment at the sky-dock ("Shipwright's Yard")
- It reuses the existing dock vote, and part cards are mixed into the shop. At most **one part per dock**.
- If the part fits in more than one place, a short second vote picks the spot (**A / B / C**). The TV blueprint shows lettered pins.
- There's no drag-and-drop on phones; each vote fits on one phone line.
- Crew-deal rule: a unanimous vote gets 25% off.
- Parts cost 90-180 salvage. A Normal voyage earns about 450-650, so a crew can afford 3-4 parts plus repairs.
- Stops 2 and 5 give a free "derelict" part.

### The blueprint view
- A logbook panel showing the ship drawn in ink only.
- Dashed "ghost" slots with brass pins.
- Three gauges at the bottom: **LIFT, STEAM, HANDS**.

### In flight
- The camera reframes automatically; the slow pull-back at cast-off is the "she grew!" moment.
- A callout appears over the new part, e.g. "NEW: ENGINE POD".

## 2. Part catalogue v1 and the three budgets

### The budgets
- **Lift:** gasbags and lift engines must carry the ship's weight.
  - An overweight ship hovers at a higher gas level, which means more pumping, more steam and more holes to lose.
  - Rule: the hover level must stay between 25 and 70.
- **Steam:** boiler output against everything that uses it (engines, pump, coil, powered stations).
  - Two extra engine pods starve the classic boiler, so you need a second boiler, which needs a second coal bunker.
  - Rule: settled pressure at cruise is at least 55, and at idle at most 95.
- **Hands:** manned stations against crew size.
  - The guide is 1.5-3 stations per player; above 3 the gauge shows red.
  - Station parts get cheaper for big crews; engines, armour and gasbags get cheaper for small crews.

### Parts (v1, 12)

| Part | Where it goes | What it does | The catch |
|---|---|---|---|
| Hull bay | fore or aft of the Hold | adds a room per deck, a ladder, racks, a vent and an extinguisher | heavier, a bigger target; a 2nd extra bay won't fit cave shafts, so she wedges and waits for the tug |
| Extra deck | above main, or below lower | more rooms and 2 ladders | taller, so Storm gusts and lightning hit harder |
| Gasbag (up to 3) | up top | +lift | a bigger target with more gas holes; a taller top hits cave ceilings |
| Engine pod (up to 4) | outrigger | +speed, with diminishing returns | +steam use, +weight, needs a pipe and valve |
| Lift engine | belly | upward thrust while steamed | uses steam; essential in the Aether, good in caves |
| Crow's nest (mid/fore/aft) | on a gasbag | a Lookout plus 2 top mounts (gun, lamp or coil) | only pays if someone mans it |
| Gun mount | deck-end, sponson, dorsal or ventral | one gun each | more ammo hauling |
| Searchlight mount | nest or belly | a lamp | someone has to man it |
| Bomb bay (one) | belly | the existing compartment | weight |
| Second boiler | main-deck bay | more steam | fire risk; needs coal nearby |
| Coal bunker / ammo hold | lower-deck bay | shorter hauling walks | where to put it is the puzzle |
| Ice locker, medbay, armour plating, ladder/pole/steam lift, escort hangar | fittings | walking time is the hidden stat | weight |

**Stat-only upgrades** (twin barrels, big shells and the rest) stay as cheap "fittings" in the shop.

**Rule:** parts are pure data. Every effect is worked out into `state.build`, and `config` is never written to.

## 3. Technical architecture (for builder agents)

### New module `public/modules/host/shipBuild.js`
It's pure and Node-safe, like `gunshipBlueprint.js`, and contains:
- `PARTS`: part definitions (footprint on a 120 px column grid × deck rows, the platforms/rooms/stations/connectors/racks/gunMounts/searchlights/pipes each part emits, art key, mass/lift/steam/hands);
- `BUILDS.classic` and `BUILDS.sparrow`;
- `buildLayout(parts)`, returning the same shape as today's `SHIP_LAYOUT` plus `hullPolygon`, `samples`, `box`, `tiltPivot`, `aimPoint`, `refPoint` and `budgets`;
- `validate(parts)`.

### `shipLayout.js` becomes a live object
- `applyBuild(parts)` replaces the contents **in place**, so the 37 import-time copies such as `const P = SHIP_LAYOUT.platforms` still see fresh arrays. It also bumps `SHIP_LAYOUT.version` and fires `onLayoutChange` listeners.
- Builds change **only at the dock**. `applyBuild` must:
  - reset `player.conn`;
  - put crew back on their feet;
  - clear breaches, fires and holes;
  - recreate `state.GUNS` and `state.escorts`.

### Derived values to migrate to rebuild hooks
- `nav.js` route tables: wrap in `rebuildNav()`.
- `modules.js` module list: `rebuild()`, keeping the hp of surviving modules by name.
- `bots.js`: `MAIN/CATWALK/LOWER`.
- `gunship.js`: `MAIN_X1/BOW`.
- `links.js`: `BOILER/BOILER_Y`.
- `escort.js`: `DOCKS`.
- `searchlight.js`: `LIGHT_NAMES`.
- `gunshipBlueprint.js`: `MAIN_Y`.
- `shipArt.js`: `liftY`.

### Hard-coded numbers that become layout fields
- `course.js`:
  - `SHIP_SAMPLES`, `BOTTOM_Y 975` and `TOP_Y -154` → `layout.samples`;
  - `dist+800`, `500-alt` and `640-alt` → `layout.refPoint` and `layout.aimPoint`.
- `config.SHIP.TILT_PIVOT` → `layout.tiltPivot`.
- `maps.js SHIP_BOX` and `GUNSHIP.SHIP_RECT` → `layout.bounds`.
- `camera.js 2600+gd` and the `bots.js:790` deck-end x positions → platform spans.
- `nav.js fall()` → `layout.spawnPlatform`.
- `shipArt.js` gondola path and bomb-bay/hatch positions → per-part drawers.

### Station identity
- Station names appear 96 times across 16 files.
- Add a `kind` to every station and use `layout.one('boiler')` and `layout.all('engine')`.
- Names stay unique and human, e.g. "Fore Boiler", because phones show them.

### Art
- Turn the shipArt drawers into one drawer per part.
- Split each into a **static** layer, baked once per build and per perf level into an offscreen canvas, and a **live** layer (bag swell, props, doors, holes, labels).
- Expected win: about half the ship's draw time.

## 4. The building simulator

### (a) Validator: `tools/buildsim.mjs --build <name|json>`

| Check | Rule | Result if broken |
|---|---|---|
| Geometry | no overlaps; every slot exists; everything inside its platform | FAIL |
| Connectivity | a route between every platform pair; a spawn platform; 2+ boarder entry points; catwalk and main exist | FAIL |
| Walking | coal → boiler ≤ 9 s, ammo → farthest gun ≤ 14 s, nest → main ≤ 8 s | WARN; FAIL at 1.5× |
| Lift | hover level 25-70 | FAIL; WARN above 62 |
| Steam | cruise ≥ 55, idle ≤ 95 | FAIL / WARN |
| Fit | width ≤ 2700 and height ≤ 1400 (TV readability) | FAIL |
| Cave fit | ship vs cave tunnels and shafts | FAIL for starter builds; for player builds, WARN ("wedges in caves") |
| Required kinds | helm, boiler, coal, ammo, engine, gun, medbay, lookout | FAIL |
| Hands | more than 3 stations per player | WARN |
| Bot run | 3 min botsim on network + open with 6 bots: 0 errors, every station kind manned, coal and ammo hauled, holes patched, hull > 60, ≤ 1 tug | FAIL on errors or a never-manned kind |
| Classic regression | `buildLayout(BUILDS.classic)` deep-equals `tools/fixtures/classic-layout.json` | FAIL (this is the Phase A gate) |

### (b) Dev page: `public/buildtest.html` + `buildTest.js`
- **Parts:** a palette and the list of placed parts. Click a part, then click a slot.
- **The ship:** shown live with 4 bots aboard.
- **Overlay toggles:** nav graph, collision samples, slots, blueprint mode.
- **Readouts:** the three gauges and the validator report.
- **Buttons:** "Run 60 s bot test", plus copy build JSON and load it via `?build=`.

### (b2) Blueprint editor (S.5b) - draw the ship
The owner's idea: "I draw a short line - that's the deck. I draw another - that's the below deck. I erase some, the ship gets smaller. I add some, it gets bigger."
- **Where:** the top half of `buildtest.html`: the ship in ink on cream paper, with the 120 px column grid (numbered) and the **deck rows** (crow's nest, top deck, main, lower, **keel**, **deep**; the last two are new rows under the lower deck).
- **Pencil ("Draw deck"):** drag along a row. It snaps to deck ends and to the column grid; a ghost line shows the column count and what will happen.
  Along an existing deck it makes it longer (rooms, hull and collision outline follow). On an empty stretch it makes a **new deck**: a room for the hull to enclose, plus the minimum connector (a ladder to the nearest deck above, or below, at a free spot).
  Refused with a hint: a stroke inside or above the gasbag, a crow's nest off the end of the bag, a keel deck across the belly blisters (ball turret, bomb bay ...), a deck with no deck it can climb to.
- **Eraser:** drag along a deck. It gets shorter, is cut in two (the far piece becomes its own deck id, e.g. `catwalk2`; the crow's nest cannot be cut in the middle) or goes. Whatever stood on the rubbed-out stretch (stations, guns, engines, racks, vents, ladders, pipes, the medbay ...) goes with it and is listed under the paper as `removed: ...`. **Undo** puts it all back. Erasing something the game needs is allowed: the validator FAILs clearly ("CANNOT FLY" stamp) and the live ship below keeps flying the last build that could.
- **Gasbag:** "Bag -" / "Bag +" (one column of length each) and "Twin bag" (the second envelope; its lift is worked out like the first). The LIFT gauge follows; the validator WARNs when the bag does not cover the decks.
- **Mass and lift:** deck mass is per column (`PARTS.deck`), so a longer or deeper ship hovers higher and wants a longer bag.
- **Code:** the operations are pure functions of a parts list in `modules/host/buildEdit.js` (re-exported from `buildSlots.js`): `drawDeck(parts, row, x0, x1)`, `erase(parts, row, x0, x1)`, `setBag(parts, { grow, twin })`, plus `snapX` and `rowAtY`. Each returns `{ ok, parts, hint, added, removed, ... }` and never touches its input. The hull outline (`hullGeom` in `shipBuild.js`) is shared by the ship art, the blueprint (`blueprintArt.js`) and the collision samples. `node tools/buildsim.mjs --check-edit` is the gate.

### (b3) Build from nothing, ladders, delete, and the seesaw (S.5c)
Owner feedback: "I erased everything and can't build" and "centre of gravity should matter, with cheap ballast; different objects should weigh differently".
- **Start from nothing:** "Clear (start from nothing)" gives a ship that is only its frame (`emptyBuild()`); "Start from a minimal ship" builds a small flyable one with the same tools (`minimalBuild()`, used by the gate too). Erasing every deck and the bag by hand lands in the same place. Every operation, `buildLayout`, `hullGeom`, `budgets`, `validate` and the blueprint work on an empty or half-built ship.
- **Decks:** the first deck anywhere on a row is accepted with no ladder. Later decks get a ladder to the nearest deck above AND below that they overlap (a rope up to the crow's nest); a deck that overlaps nothing is refused. The crow's nest needs the bag under it.
- **Gasbag tool** (`drawBag`): drag along the dashed bag row. From nothing it draws the bag; across the bag it resizes it; elsewhere (S.5d) it adds another bag beside it (the twin envelope is the Twin bag button). The eraser across the bag rubs it out. "Bag +" on a ship with no bag draws one over her decks.
- **Ladder tool** (`placeConnector(parts, x, rowA, rowB, type)`): drag straight down from one deck to another (tick "slide pole" for a one-way pole). Refused with a hint when there is no deck at both ends, a deck lies between, one is already there or a station is in the way.
- **Delete** (`thingAt` / `removeAt(parts, x, y)`): the Delete tool, a right-click in any tool, or a click with the eraser removes the ONE thing under the pointer (ladders and poles drawDeck added too, stations, guns, racks, vents, sandbags ...); its steam pipe, coil or bomb-bay doors, escort hook go with it. The hovered thing is ringed; "removed: ..." and Undo as always.
- **Part placing on an unfinished ship:** a slot is legal when the placement is (on a deck, inside its span, clear, one helm / lift / bomb bay / medbay); it does not have to leave a flyable ship. The palette now has everything a ship needs (helm, boiler, coal, ammo, engine, gun, lookout, medbay, bomb bay, lift, boarding points, the four racks, extinguisher, sandbags). Engines, the helm and the lift get their steam pipe from the boiler automatically (`routePipes`, whichever arrives first). `validate()` returns `needs` / `checklist`: the page shows "Needs: main deck, gasbag, helm ..." as ticked chips, the blueprint stamps "CANNOT FLY yet - needs: ...", and the live pane says the same until she validates, then flies.
- **Weights** (`config.BALANCE.MASS`, gas points): boiler 16, coal bunker 10, bomb bay 10, engine 9, ammo hold 6, helm 5, deflector 5, coil 5, sandbag 5 (cheap and dense), guns 3, ladders and racks light, deck 0.3 per column. The classic ship adds up to about 150, her bag's lift, with her centre of mass 17 px behind the bag's middle: level, so its trim is exactly 0.
- **Centre of mass vs centre of lift:** `balanceOf(parts)` (shipBuild.js): COM = every part's weight at its x (and y), COL = the bag(s) weighted by lift (lift engines count at their place). dx = COM - COL; nose-heavy is positive. Within `LEVEL_PX` she is level (no trim at all); beyond it the trim angle is `DEG_PER_PX` per px up to `CAP_DEG`. The validator WARNs beyond `WARN_PX` ("nose-heavy 2.1 degrees ... add sandbags at the tail") and FAILs beyond `FAIL_PX` ("she will nose-dive"). The BALANCE gauge is a beam on a fulcrum (a faint second beam is the live balance); the blueprint shows a LIFT pennant on the bag and a WEIGHT dot, and sandbags are drawn as sacks.
- **Sandbags** (`ballast` part): on a main / lower / keel / deep deck or hanging from the hull under a lower / keel deck, at most `BALLAST_MAX`. They add weight, so a heavily trimmed ship also wants a longer bag.
- **In flight** (`balance.js`, `SHIP_BALANCE` in shipLayout.js, strengths in `config.BALANCE`): the live COM adds the crew (by x, plus carried coal / ammo), the coal in the firebox, rounds in the guns and bombs in the bay (`LIVE_MASS`; `LIVE: false` counts only the build). The trim angle then (a) rests her tipped by a gentle share of it (`SIM_SHARE`, under the crew-slide limit; guns' arcs and the rock outline follow `state.ship.pitch`), (b) pushes her down (nose-heavy) or up (tail-heavy) by up to `DIVE_ACCEL` px/s^2, which the helm's trim engine counters, (c) costs a tail-heavy ship up to `SLOW_TAIL` of her top speed, (d) makes a nose-heavy bow scrape the hull while she grinds the ground. Past `WARN_DEG` the TV shouts "NOSE-HEAVY! TRIM HER!" and idle crew get a "TRIM" arrow to the light end of the main deck (jobs.js). The TV HUD has a small TRIM seesaw under the gas bar.
- **Baseline:** with the static balance alone the classic ship is exactly level, so with `NO_LIVE=1` (botsim env switch = `BALANCE.LIVE` off) the 9 seeded runs matched the old baseline byte for byte. `tools/fixtures/botsim-baseline.txt` was then re-snapshotted with the live balance ON (crew running about legitimately shifts classic flight a little: 3 seeds x 3 maps stay within noise on hull / kills / wrecks; voyagesim 8 runs: no worse).
- **Gates:** `--check-validator` (nose-heavy WARN, extreme FAIL, tail-heavy WARN, sandbags fix it), `--check-edit` (ladders, delete, erase everything, build from nothing, 2-minute botsim of the ship built from nothing), `--check-balance` (headless sim: nose-heavy rests nose-down and is pushed down, tail-heavy slower, live loads move the balance, classic exactly 0).

### (b4) Drag-and-drop parts and many gasbags (S.5d)
Owner requests: "adding parts should be like drag and drop: ah, a visual of a gun, let me drop it here", and "blimps side by side, e.g. 4 in a row, so if you lose one you've got 3 left; or one big one the players can really get crazy with".
- **The tray** (left of `buildtest.html`): a little picture for every kind of part (`partArt.js`: gun, searchlight, boiler, coal bunker, ammo hold, lookout, helm, medbay, bomb bay, lift, boarding point, the four racks, extinguisher, steam vent, engine pod, ladder, slide pole, sandbags, gasbag), drawn in the ship's own gouache style (same ink, palette and textures; the real sprites where the ship art has one). Press a picture and move: a ghost follows the pointer (mouse, pen or finger: pointer events, `touch-action: none`); over the blueprint everything the part cannot go is dimmed and the legal spots stay bright; the picture snaps to the nearest legal spot (`config.BUILD_EDIT.DROP_SNAP`); over a bad place the note says why ("A gun mount goes on the crow's nest or top deck or lower deck, not the Main Deck."); let go on a spot to place it, anywhere else to cancel (Esc cancels too). A click with no movement picks the part and shows the brass pins, as before.
- **Pure ops** (`buildEdit.js`, slots in `buildSlots.js`): `placePart(parts, type, x, y)` takes the nearest legal slot of that palette type (`pickSlot`, `slotDistance`; a spot must be on the deck row under the drop point) or returns `whyNot(...)`. `drawBag(parts, x0, x1)` now draws a NEW bag on empty row space (kept clear of its neighbours, `BAG_MIN` each way) and resizes a bag the stroke crosses (refused across two); `resizeBag(parts, i, side, x)` moves one end (drag the brass dots with the Gasbag tool); the eraser rubs out the bags under a stroke; `setBag` (Bag -/+, Twin bag) acts on the biggest bag. The twin envelope is now only the Twin bag button (it rides on the biggest bag).
- **The layout**: `layout.gasbags = [{ id: 'bag1'.., x0, x1, cx, cy, rx, ry, lift, twin? }]` tail to nose (always an array; `[]` for no bag). `layout.gasbag` stays: the bag itself when there is one (the classic ship reads exactly what it did), else the envelope spanning all of them (older code that only knows one bag still sees the ship's top). `shipBuild.js` has the helpers `bagList`, `bagAtPoint`, `bagEdgeY`, `bagNearX`, `bagCover`, `bagName`. Each bag's lift is its size (rx x ry / 1560) and its rigging weighs `BALANCE.MASS.bag`; the validator sums them. The crow's nest may sit on any bag, or across a run of touching bags.
- **The validator**: WARN when the bags do not cover the decks, or leave open sky between two bags over a deck (`BUILD_CHECK.BAG_GAP_WARN`); FAIL beyond `BAGS_MAX` bags; a new **Redundancy** INFO line: "4 gasbags. Lose one bag: hover 83.3, she limps (the pump at its limit)" (hover with the biggest bag's lift gone; a ruptured bag keeps its weight).
- **The sim** (`gasBags.js`): `state.bags = [{ gas, w, down }]`, one per layout bag; `state.ship.gas` stays the one number the rest of the game reads: the lift-weighted MEAN of the bags (a getter/setter: writing it sets every bag; shop refills, GOING DOWN!'s "she holds" and the repair offers top each bag up instead, `refillBags`). The pump and the vent act on every bag at once; seepage is per bag and each hole leaks from its own bag (`hole.bag`, chosen by where the hit landed, `gasHoleAt(x, y, bag)`; a bag past the end of the top deck is patched from the deck's end). A bag at `GAS.BAG_DOWN` or less while the rest hold `BAG_REST` more is DEFLATED: it lifts nothing (its gas counts as nothing in the mean), the art droops and crumples it, the TV shouts "FORE BAG DOWN! PATCH IT AND PUMP!" (the HUD has a pip per bag) and the bots patch its holes first. The centre of lift follows each bag's gas (`liveLiftX`, `BALANCE.BAG_COL`), so losing the fore bag tips her nose-down, a tail bag nose-up (balance.js, as for crew running about). Patch the holes and pump and the bag comes back. GOING DOWN!'s leaks are spread over the bags. **One bag reduces to the old single gas value exactly** (`--check-botsim` is byte-identical to the baseline).
- **Gas valves** (owner: "we should be able to place the vents / the valves if 1 blimp is out"): a placeable part, the `gasValve` picture in the tray (`{ part: 'gasValve', p: deck, x, bx }`, `layout.gasValves` only when a build has some, so classic's layout is unchanged; each is linked to the bag over it, `bx` = that bag's middle; the end bags beyond the top deck get the spots nearest them; drop it on the nest, top or main deck). A crewman standing at a valve (`TOOLS.VALVE_REACH`, closer than a rack's reach so it works on a crowded deck) taps Action: "Close fore bag valve" / "Open ...". A SHUT valve cuts its bag off from the helm's pump and vent, and its holes stop bleeding the shared feed (`GAS.HOLE_BLEED` per hole per second out of the feed the open bags share, only while pumping), so the crew shuts a ruptured bag's valve, keeps the rest up, patches, and opens it again. A bag with no valve is always open; any shut valve of a bag shuts it. The TV tags every valve "FORE BAG OPEN 63%" / "SHUT", the HUD pip of a shut bag gets an amber bar, and the bots shut a ruptured bag's valve and reopen it once its holes are patched (`botsim --rupture` reports the turns). **Steam vents** stay placeable on every full deck (catwalk, main, lower, keel, deep); a steam vent lets steam out of a boiler's line, so each is tied to the nearest boiler (`ventBoiler`; the slot label says whose steam line, the validator lists the ties).
- **Art**: each bag is its own envelope (own bake, own swell by its own gas); tail fins on the first bag, smaller mirrored nose fins on the last of a row; the twin envelope per bag (`bag.twin`, or the twin-gasbag upgrade on the biggest). Bag 4 of 4 shot flat sags and crumples while the others stay full.
- **Gates**: `node tools/buildsim.mjs --check-bags` (four small bags validate, one giant bag validates, placePart, rupture in flight: lower, tipped, called out, repaired; both ships botsim 2 min with 0 errors, and a run where the bots repair a shot-flat bag, `botsim --rupture 40`). Test ships: `tools/fixtures/bags-build.mjs`, `giantbag-build.mjs` (`botsim --build bags`). `classic-layout.json` gained the `gasbags` array (nothing else changed).

### (c) Batch mode
- Command: `node tools/buildsim.mjs --random 50 --seed 1 --minutes 4 --envs skyisles,fungal,storm,aether --bots 6`.
- How builds are made: random but legal purchase paths from the Sparrow, using the real salvage pacing. Each build runs a botsim in a child process.
- What it reports per build: mass, lift, steam, hands, validator result, and per environment the kills/min, hull, missions, wrecks, walking % and tug events.
- Dominance summary per part:
  - correlation above +0.25 in every environment = **dominant** (bad);
  - below -0.25 = **trap** (bad);
  - a sign that flips between environments = **situational** (the goal).
- Exit code 1 on any FAIL, so it can gate commits.

## 5. Balance and fun
- **No single best ship.** Each environment favours something different:
  - caves punish long ships;
  - storms punish tall ones;
  - the Aether needs lift;
  - the Sunken Sea needs a low belly, because the lowest belly part sets the keel;
  - Frost puts ice on every bag;
  - Ember brings fires to every boiler.

  The route map shows the next environment, so the dock choice is informed.
- **Pacing:**
  - part prices rise with how many you own;
  - two derelict parts guarantee growth;
  - target: 3-4 parts by the Flagship on Normal, and no part in more than 70% or fewer than 15% of winning builds.
- **Limp home:** the newest part is "shaken loose", so its modules start broken but repairable. No part is lost. A full wreck ends the voyage as now, and the build is recorded in the Captain's Log.
- **Crew scaling** decides which part offers are cheaper. Ship's mates can haul to new bunkers, because jobs are kind-based.

## 6. Roadmap: Phase S

Phase S runs after Phase 1, alongside Phase 2. No package edits `simulation.js` and `render.js` in the same batch.

| # | Package | Size | Success measure |
|---|---|---|---|
| S.0 | Freeze the classic ship snapshot + `buildsim --check-classic` | S | deep-equal passes |
| S.1 | Layout from parts (`shipBuild.js`, in-place `applyBuild`, rebuild hooks) | L | S.0 passes; botsim summaries identical to the baseline (3 seeds × 3 maps); a lint fails on new `= SHIP_LAYOUT.` captures |
| S.2 | Derived geometry (samples/box/rect/tiltPivot/ref/aim points) | M | botsim within noise; seeded cave runs match contact counts |
| S.3 | Station kinds and multiple instances (boilers, engines, lamps, nests) | M | all name lookups go through `one()/all()`; classic botsim identical |
| S.4 | Art per part + static bake | M | ship draw time ≥ 40% faster |
| S.5 | Building simulator (validator, dev page, batch) | M | classic and sparrow pass; 50 random builds run with 0 errors |
| S.5b | Blueprint draw / erase editor on the dev page (pure `drawDeck` / `erase` / `setBag`) | M | `buildsim --check-edit`: new keel deck, +2 main columns, cut top deck: valid, 0-error botsim |
| S.5c | Build from nothing (empty-build editing, gasbag drawing, local-only slot checks, missing-parts checklist); ladder/pole drawing + click-to-delete; centre of gravity (distinct part weights, live loads: crew/coal/ammo/bombs) driving pitch and flight handling, ballast part, BALANCE gauge + TV level indicator | L | --check-edit builds a ship from nothing to flying; nose-heavy WARN, ballast fixes it; balance effect measured before re-baselining |
| S.5d | **Drag-and-drop parts** (owner request): a palette of little part pictures (gun, lamp, boiler...) dragged onto the blueprint, with a ghost and snap; **many gasbags**: any number of bags side by side (e.g. 4 small ones: lose one, 3 keep flying) or one giant bag. Each bag has its own gas, holes and lift in the sim; a ruptured bag deflates and drops its lift; art per bag | L | multi-bag sim gate (lose 1 of 4 bags: she still flies, lower); drag-drop works on the dev page. **Done**, see (b4) |
| S.5e | Minimum ship = a gasbag + a deck (drifts on the wind, no control); helm/boiler+coal/engine optional but very helpful; game tolerates any missing part; SAILS (crew raise/lower, wind speed, tear in gusts); split crow's nest + higher nest tiers | L | --check-minimum table (speed/control improve per added part); classic identical |
| S.5f | **Fire that cares where things are** (owner request): every part has a flammability. The COAL BUNKER is a tinderbox: a fire that reaches it flares into a big blaze that spreads fast. The boiler is an ignition source (blowouts, overheating start fires around it). Fire spreads between neighbouring parts and up/down through ladders and hatches, so placing coal next to the boiler is a real risk and keeping them apart costs walking. The validator warns "coal bunker beside the boiler: fire risk". Extinguishers and sprinklers matter more | M | botsim fire stats per build; a coal-beside-boiler build burns more than a separated one; classic stays within noise |
| S.6a | Catalogue v1 + Sparrow + `state.build` effects + dock offers / slot vote | L | voyagesim Normal no worse than today |
| S.6b | Shipwright UI (TV blueprint, gauges, slot pins, phone cards) | M | the cold-player test passes |
| S.7 | Balance + persistence (environment modifiers, derelict parts, limp damage, Hangar builds after P2.2) | M | no dominant or trap parts; one situational part per environment |
| S.8 | Add buildsim to the after-every-package checklist | S | |

**Order:**
1. S.0
2. S.1
3. S.2 and S.3 (in parallel)
4. S.4 and S.5 (in parallel)
5. S.6a and S.6b
6. S.7
7. S.8

**Clashes with Phase 2:**
- S.1 touches `gunship.js` lines 53-60, so do it before P2.1 (rival captain).
- S.7 comes after P2.2 (Hangar save).

## 7. Risks
- **Stale copies of layout numbers:** in-place updates, the buildsim lint, builds only at the dock, and the classic gate.
- **Hidden coordinates in code:** S.2 includes a grep list of them.
- **Upgrades write to `config` and never reset between voyages (an existing bug):** parts never write config. Fix it separately by cloning a base config at voyage start.
- **The ship shrinking on the TV as it grows:** a hard size cap in the validator.
- **Draw time:** the bake (S.4) lands before the catalogue (S.6).
- **Bots not knowing new parts:** parts reuse existing station kinds only.
- **Party complexity:**
  - one phone line per rule;
  - votes, not drag-and-drop;
  - one part per dock;
  - v1 limits: +2 hull bays, +1 deck, 3 bags, 4 engines.
- **Save data:** a versioned, tolerant schema (`hangar: { v: 1, builds: [] }`).
