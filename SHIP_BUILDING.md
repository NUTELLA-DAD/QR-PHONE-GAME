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

### (b5) The minimum ship, wind and sails, two-height nests (S.5e)
Owner: "A bag could have air and drift as a minimum, but no control. Other stuff makes it way easier (almost required but not). The helm steers; the boiler and coal supply the needed flotation up or down. The bag only just floats in the wind. We should also add SAILS for added speed, raised and lowered by the crew." And: "let the crow's nest be cut in the middle, and multiple heights for the crow's nest".
- **Only two needs** (`buildCheck.js`): a gasbag and a deck to stand on (`validate().needs` is just those, plus "ladders between the decks" while decks are cut off). Every other part is optional: a missing one is a strong WARN under the group `Advice` ("No helm: she can't steer...", "No boiler: no steam...", "No engine: wind only", "No guns", "No medbay: crew who fall come round on deck where they fell", "No hammer rack: nobody can patch holes...", "No extinguisher: fires can only burn out", "No lookout", "No sword rack", "Fewer than two boarding points"). The dev page's checklist chips are red (needs), amber (recommended) or dashed (nice to have); `validate().advice` lists the missing ones with a reason. Too much lift for her weight is a WARN ("she rides high"), not a FAIL; too heavy is still a FAIL.
- **The game copes with every missing part.** Roles: `deckIndex('main' | 'lower' | 'catwalk')` (shipLayout.js) lends the nearest deck to a ship that lacks one (a one-deck ship is her own main, lower and top deck; `deckRoles` in shipBuild.js does the same for the geometry), `nest` is exact (-1 without one). `hasKind(kind)`, `isNestDeck`, `nestTier`, `reviveSpot()` (medbay, else the spawn deck at a boarding point). Default boarding points (`auto: true`) sit over the ends of her top deck, and a missing shield band is derived. Guards: modules.js (no bomb bay / lift module, no engines), bots.js (no coal, ammo, bomb bay, boiler jobs), jobs.js (no ammo hold or coal bunker: no hauling arrows), goingDown.js (no boiler or no coal bunker: the lift meter starts full, only the leaks decide it), envDeep.js (no engines to clog, the oxygen tank kept on the deck), envStormSea.js (no bomb bay: no rescue rope; rods and the bilge pump kept on a short deck), render.js (steam gauge and coal read-out give way to a "Wind 22% - nobody steers" line), shipArt.js (a helm placed on a deck gets a pedestal; no hull when there is only a top deck).
- **Flight without controls** (config.WIND, `sails.js`): no helm = nobody steers or trims or works the lever, and the autopilot is off: she goes at the WIND (`WIND.BASE` share of top speed times how windy the environment is, less in rock-walled maps). No boiler = no steam: no pump (the helm lever can only VENT, and its trim engine is a weak hand wheel, `WIND.HAND_TRIM`), no engines. No engine, or no boiler = her speed is capped at the wind (plus her sails), whatever the lever says. A ship that can never pump (no helm or no boiler) seeps gas only `GAS.SEEP_NO_PUMP` per second, so she sinks over many minutes, not seconds. Altitude is bag buoyancy plus environment lift and sink only. A helmless ship stuck on a cave wall is hauled clear by a tug (`course.js`).
- **Sails** (`PARTS.sail`, `sails.js`, config.SAIL): a mast and canvas on the top deck or a nest (`{ part: 'sail', n, p, x }`, a station of kind `sail`, `layout.sails`, weight `BALANCE.MASS.kind.sail`). A crew member at the mast holds Action to HAUL the sail up (`HAUL_TIME`; let go half way and it slips back) and taps Action to LET IT DOWN (`LOWER_TIME`). The phone says "Raise sail" / "Lower sail" with the hold progress; the TV draws a furled roll on the boom or the canvas up the mast, fluttering downwind, and flashes "REEF THE SAIL!" before a gust. A raised sail adds `BONUS` of top speed times the wind (storm and sea more, fungal and caves less; each further sail a little less, `BONUS_DIM`); `state.sailPush` is added to the ship's speed in `scrollSpeed`. In a Storm Front gust (or a Frost blizzard) a raised sail can TEAR (`TEAR_CHANCE`): its module breaks, the canvas falls and a hammer mends it; sails also shove the ship harder in a gust (`GUST_SHOVE`). The bots reef sails when a gust is due and in caves, raise them in open sky when idle; human crew get "RAISE THE SAIL" / "REEF THE SAIL" arrows. A ship with no sail is untouched (the classic botsim baseline is byte-identical).
- **The crow's nest in pieces and tiers**: the eraser can cut a nest in two (each piece keeps its own stations, and gets a rope down if it lost its own; the validator flags it otherwise), and a second tier, the UPPER NEST (`crow2` row, 210 px above the first), stands on a mast above a nest: drawn with the pencil over a nest, climbed to by a rope from it, gun / lamp / lookout can stand on it. Height pays a little (`config.NEST.TIER_BONUS`: a lookout on it sees further ahead, a lamp throws further, a gun shoots further) and costs (mast weight `BALANCE.MASS.mast`, a bigger target, `NEST.GUST_PER_TIER` more shove in a gust). Each nest must sit on a bag.
- **Gates**: `node tools/buildsim.mjs --check-minimum` (the steps 1 deck + bag, + helm, + boiler and coal, + engines, + mast and sail from `tools/fixtures/minimum-lib.mjs` / `botsim --build min1..min5`: each validates, flies 2 minutes on 3 maps x 3 seeds with 0 errors, a capability table (top speed, climb, dive) and a botsim table (net speed, altitude span, progress, time on the rocks); a person raises, lowers and mends a sail; a storm gust tears one left up and a crew reefs it in time), `--check-edit` (cut the nest in two; draw an upper nest, put a gun on it, 2-minute botsim) and the old gates (their expectations for a missing medbay, coal bunker, boarding point and bomb bay changed from FAIL to WARN / fine).

### (b7) Fire that cares where things are, outdoor / covered decks, armour plate (S.5f, S.5g)
- **Flammability** (`config.FIRE.FLAMMABILITY`, pure rules in `fireModel.js`, the live run in `fire.js`): every spot of the ship has one. A covered wooden deck is 1 (medium), an open-air deck 0.85, the coal bunker 4.5 within 130 px (tinder), the bomb bay 3, ammo 1.8, iron housings (boiler, engines, guns) 0.35-0.6, armour plate 0; the gasbag has a RESERVED entry for hydrogen (S.7). A fire spreads (every `SPREAD_EVERY`, faster on tinder, slower on damp ground) to a spot beside it on its deck or through a ladder / pole / rope / stairs end within `LADDER_REACH` (up easier than down), chosen by weight = the target's flammability, and catches with that chance; nothing spreads onto plate. The fire cap scales with deck area (8 on the classic ship, 3 on a one-deck ship, up to 24).
- **The coal flares**: a fire on ground as flammable as the coal becomes a BLAZE: `BLAZE.FIRES` more big fires at once, spreading faster, eating more hull, taking longer to spray out, scorching parts harder, black smoke, bigger flames, a shake and the TV call-out "THE COAL'S ALIGHT!" (a cooldown stops it re-flaring at once). Bots send the whole crew to a fire in the coal first (`BOTS.HOT_FIRE_*`).
- **The boiler is where fires start**: a blowout lights a fire beside it (`BOILER_BLOWOUT_FIRES`), and an over-pressured boiler throws sparks (`HOT_RATE`). A hit's chance to start a fire is scaled by the spot's flammability (more on coal, none on plate). Every other fire source (ember scorch, lightning rod) goes through `fire.ignite()`.
- **Validator**: WARN "coal bunker beside the boiler: fire risk" when the fire path (along a deck, 150 px per ladder) is under `BUILD_CHECK.FIRE_NEAR` (330; the classic ship's is 440), and an INFO fire-risk score 0-10 (coal-boiler closeness, bomb bay near them, extinguishers and plate near the coal and boiler take it down).
- **OUTDOOR / COVERED** (`drawDeck(parts, row, x0, x1, { covered })`, the Outdoor / Covered buttons under the pencil): the deck part's `outside` flag. Outdoor = rails, open sky: crew can be knocked overboard (already so for `outside` decks), weather (ice crusts, lightning strikes: `outdoorDecks()` in shipLayout.js), boarders and parachutists land there (boarding points, masts and lamps only go on open decks), wide gun arcs on rail posts, lighter (`MASS.outdoorDeck`), flames carried off a little. Covered = a deck inside the hull (a top deck turned covered gets a cabin with a roof): rooms, heavier (`MASS.coveredDeck`), guns only as ports or sponsons with narrow arcs, a helm under a roof cannot be hit. Drawing along a deck with the other kind turns it over (rooms and guns follow). Crow's nests are always open. The hull, collision samples and hit boxes follow the flag. Classic: top deck outdoor, main and lower covered, unchanged.
- **Armour plate** (`addArmour(parts, row, x0, x1)`, the Armour tool, the Armour picture in the tray; part `{ part: 'armour', p, x0, x1 }`, `layout.armour`): riveted iron along a deck's hull wall (covered) or rail (outdoor). `BALANCE.MASS.armour` 4.5 per 100 px (360 px is about a boiler), it does not burn, and a hit on it counts `ARMOUR.POWER_MUL` (35%) with `HOLE_MUL` (25%) the breaches. The eraser cuts it with the deck, Delete removes a stretch. Drawn as panels with rivets in the ship's gouache style, and in the blueprint as a hatched band.
- **Gates**: `node tools/buildsim.mjs --check-fire` (flammability, cap, validator WARN + score, blaze + call-out, a fire finds the coal, blowout and overheating sparks, bots run to coal fires, plate stops spread and cuts damage, and over six seeded botsim runs with the boiler over-pressured every 15 s a coal-beside-boiler ship (`--build coalnear`) burns far more than the classic one), `--check-edit` section 11 (covered / outdoor, armour, a raider lands on an outdoor lower deck, crew are thrown off outdoor decks only, frost on outdoor decks only, mixed builds fly 2 minutes with 0 errors). `botsim --blowout SECONDS` is the fire test switch. Re-baseline: the fire spread draws random numbers differently, so `botsim-baseline.txt` was re-snapshotted (it gained a `fires:` line); over 40 seeds x 3 maps x 4 min the classic ship burns the same within noise (burning avg 0.13 -> 0.12, hull eaten 22.5 -> 20.5, average hull 92.5 -> 92.4, kills 30.1 -> 30.2, wrecks 0).
### (b6) Pointed engines, swivel mounts and forces at places (S.5h)
Owner: "Engines should be able to have a pointed direction to help with control in that axis." Then: "force should be a moment on the ship"; sails push high up and tip her; crew walking about shift the balance.
- **Direction** (`engine.dir`, radians in the ship's frame: 0 forward, -PI/2 up, PI/2 down, PI back; none = forward, so the classic pods are untouched). `thrustVec(dir)` splits it into forward and up shares; presets `ENGINE_DIRS` (8 arrows). Pure ops in `buildEdit.js`: `setEngineDir(parts, name, angle)`, `setEngineSwivel(parts, name, on)`, and `placePart(parts, 'engine' | 'engineSwivel', x, y, { dir })`.
- **Dev page**: the tray has an Engine pod and a Swivel engine (pictures with a red thrust arrow). While dragging one: mouse wheel, `R` (Shift+R the other way) or the rotate buttons / arrow row on the left turn the ghost 45 degrees. On the blueprint every engine shows a red arrow with a brass dot at the tip: drag the dot (any tool, mouse or finger, 15 degree steps), or use "Aim engine" and click an engine, then pick one of 8 arrows (and tick "swivel mount"). The live ship draws the pod turned, with exhaust.
- **In flight** (`engines.js`, `config.ENGINES`): top speed = the forward thrust of the working engines over the drive engines (built within 60 degrees of forward): the classic's two forward engines give exactly the old speed; engines pointing back take thrust away (and keep her reverse full while forward speed is crushed); engines all pointing up / down do not push her ahead (the wind does). A working engine pointing up lifts like `LIFT_GAS` (16) gas points whatever the throttle: climb with no gas change; down dives. It burns steam all the time (`VERT_USE`, `shipBuild.engineUse`), counts in the LIFT gauge, and acts where it sits.
- **M.4: the engines are forces on a body** (`flight.js`, `config.SHIP.MOTION`; MOVEMENT.md has the whole model). The helm's lever orders a speed; the working engines (`thrust.factor` of them, `thrust.drivers` built) push to hold it against the air's drag, within `MOTION.THRUST` ahead and `BRAKE` astern; sails push; a ship with no engine going is carried by the wind. A build's weight (`balance.mass` + the live loads) makes her slower to respond: a giant build is heavy (slow to speed up, stop, climb and come about), the top speed does not change. More than two engines add push (acceleration), not top speed.
- **Swivel mount**: `engine.swivel` adds a crew station of kind `swivel` (`sx`, 64 px toward the middle of the ship; phone label "Swivel engine"). The stick turns the engine (`SWIVEL_RATE`, within `SWIVEL_ARC` of the way it was built). Bots (`bots.js swivelWant`): forward in cruise, up when she is sinking (gas low, falling, the last stand), down on a bombing run or when the helm wants to be well below.
- **Forces at places** (`forces.js`, `config.FORCES`): one model for everything that shoves the ship at a point. `applyForce(state, { x, y, fx, fy, source })` queues a push (acceleration, or `impulse` for a kick); torque = r x F about the live centre of mass (`state.balance.comX / comY`), divided by the radius of gyration squared (`balanceOf().k2`, plus the crew, coal and raiders: `balance.js`), so a long ship with her weight at the ends turns slower. The tilt `state.forces.theta` (added to `state.ship.pitch`) swings on a spring and settles; capped at `MAX_DEG` and `MAX_RATE` so the crew-slide limit holds. `forcesOf(state)` returns the ship's body-frame totals `{ fwd, up, climb, torque, spin }` without changing anything (per ship, no module-level captures: the pose will integrate it later). `staticPitch(layout, centre)` is the at-rest tilt the validator reports.
- **Sources**: engines (vertical thrust at the engine's place; the forward thrust is "balanced": held by drag along its line, so no torque, which is why the classic ship never tilts), raised sails (the wind's push at the sail's centre of effort, high up the mast: nose DOWN, more for a tall mast or an upper-nest sail, `SAIL.GUST_FORCE` times harder in a gust), storm gusts (the side wind leans on the tall gasbag; the up / down part lifts the front of it), hits and explosions (`impact()`: kicks the part struck, mostly up or down away from her middle height), rock scrapes (the contact point pushes back along the way out), rams and bumps (`planes.js`), the gunship's tether (pulls the bow). Crew and raiders walking to the bow tip her (`FORCES.CREW_DEG_PER_PX`). `FORCES.LIVE` false = only engines and sails (and no crowd tilt); the classic ship is then byte-identical to before S.5h.
- **Validator**: INFO on thrust (forward / back / up / down totals, swivel mounts, the engines' pitch torque) and on sails ("sails up: nose-down 0.8 degrees, 1.8 in a gust"); WARN when engines push against each other (net about 0), or tip her more than `PITCH_WARN_DEG` with no swivel to turn them back; WARN for sails that tip her with no lift engine to counter.
- **Baseline**: with `FORCES.LIVE` on (the default) hits, gusts, scrapes, rams and the tether twist the classic ship a little, so `tools/fixtures/botsim-baseline.txt` was re-snapshotted (S.5h) after `NO_FORCES=1 --check-botsim` reproduced the old numbers byte for byte. 3 seeds x 3 maps (3 min): hull 95.5 on vs 96.1 off, kills 23.8 vs 25.7, 0 wrecks either way; voyagesim 8 runs normal: 7/8 victories (median 30.5 min) on vs 6/8 (40.6 min) off (the timeouts are the existing Aether stall).
- **Gates**: `node tools/buildsim.mjs --check-engines` (pure ops, validator lines, forward = classic speed, back reduces / keeps reverse, 45 degrees mixes, up climbs with no gas change, down dives, steam cost, a nose engine up lifts the nose, a person swivels via the phone input and the thrust follows, 2-minute botsim of `tools/fixtures/swivel-build.mjs` x 3 maps with 0 errors and the bots using the crank) and `--check-forces` (nose / tail / belly hits kick that end, a middle hit hardly twists her, settles, the cap, a heavier ship is shoved less, LIVE off, force directions, `forcesOf`, a sail up tips the nose down and a nest sail more, reefed returns to level, a nose engine up cancels it, gusts and a 150 s Storm Front stay inside the cap, 6 crew stern to bow tip her and back, raiders weigh).

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
| S.5f | **Fire that cares where things are** (owner request): every part has a flammability. The COAL BUNKER is a tinderbox: a fire that reaches it flares into a big blaze that spreads fast. The boiler is an ignition source (blowouts, overheating start fires around it). Fire spreads between neighbouring parts and up/down through ladders and hatches, so placing coal next to the boiler is a real risk and keeping them apart costs walking. The validator warns "coal bunker beside the boiler: fire risk". Extinguishers and sprinklers matter more | M | botsim fire stats per build; a coal-beside-boiler build burns more than a separated one; classic stays within noise. **Done**, see (b7) |
| S.5g | **Outdoor or covered decks** (owner request): the pencil has an OUTDOOR / COVERED toggle.
Outdoor decks are open-air walkways with rails:
- wide gun arcs and the best view;
- boarders and paratroopers land there;
- crew can be knocked overboard;
- weather (ice, rain, lightning, gusts) hits them.
Covered decks sit inside the hull:
- protected rooms, where fires spread inside instead;
- heavier;
- guns limited to ports/sponsons.
Also **metal armour walls in spots**: drag or draw riveted iron plate onto stretches of hull wall or rail.
- Hits there do much less damage and rarely punch breaches.
- Plate doesn't burn.
- It's heavy (balance and lift).
- It's drawn as riveted plate in the storybook style.
Art, collision and the validator follow the choice | M | toggle works on the dev page; classic unchanged; botsim 0 errors on mixed builds. **Done**, see (b7) |
| S.5h | **Pointed engines** (owner request): every engine has a direction set when you place it. Rotate the ghost while dragging, or pick an arrow on the blueprint.
- Forward / back = speed.
- Up = lift thrust (climb without gas).
- Down = dive.
- Angled = a mix.
Thrust acts where the engine sits, so an engine at the nose pointing up also lifts the nose (pitch control, ties into balance). Optional **swivel mount**: a crew station that turns the engine in flight. Engines are heavy and use steam | M | each direction measurably changes speed / climb / pitch in a sim test; classic engines keep today's behaviour. **Done**, see (b6) |
| S.5i | **Parts break off for real** (owner request).

**Bomb bay explosions:** a loaded bomb bay hit hard (or reached by fire) explodes and BLOWS NEARBY PARTS OFF THE SHIP: decks, rooms, guns, engines, a gasbag. The pieces tumble away with physics (reuse the wreck break-apart art); crew standing on them fall and must parachute or grab on.

**Hard hits:** big rams, heavy shells, crashing into rock at speed, or a crash-landing break off the part that took the hit.

**Lost is lost:**
- Lost parts stay gone for the rest of the voyage until rebuilt (paid) at a sky-dock.
- The ship really changes shape mid-flight: lift, balance, steam and stations update.
- E.g. losing a nose engine makes her tail-heavy and slower.

**Engine work:** mid-flight `applyBuild` (S.1 limited builds to the dock), with safe resets for crew, routes, holes, fires and modules.

**Validator:** warns about "bomb bay next to the boiler / coal" chain-reaction risks. Armour plate reduces break-off chance | L | sim test: an explosion removes the right parts, the ship keeps flying with the new shape, crew on lost parts fall; classic baseline unchanged unless a break-off happens |
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

## Part catalogue v2: every customisation option (owner: "add it all")

Every part below is buildable in the blueprint editor (drag-and-drop or draw), with:
- a weight (balance and lift);
- a steam/hands cost where it applies;
- a validator line;
- a palette picture.

Built in tiers. Each part plugs into existing systems.

### Tier 1: biggest fun per effort (build first, after S.5e-S.5h)
- **Crew cannon (owner request).** A big brass cannon station that fires a CREW MEMBER across the map, to board enemy gunships or reach a far deck. A player climbs into the barrel; a second player aims and fires (a linked station). The flyer becomes airborne (airborne.js), and can steer a little, grab a ladder, deploy a parachute, or land on an enemy deck. It reuses hookshot/airborne/boarding code. Cooldown and steam cost. Bots can use it to board a latched gunship.
- **Gas types per bag:**
  - Hydrogen: cheap, strong lift, explodes when it catches fire.
  - Helium: safe, weaker.
  - Hot air: needs boiler heat, so crew keep it up.
- **Lifts, chutes, zip-lines, outside catwalks** (fast movement; the hidden walking stat).
- **Ballast dump tanks.** Crew dump water to shoot up; refill at the dock.
- **Anchor / grapple winch.** Hold position, or snag and reel in an enemy ship.
- **Cargo hold.** Salvage crates add weight and pay at the dock; dump them in an emergency.
- **Looks:** paint schemes, trim colours, hull stripes, figureheads, name plates, flags/pennants, gasbag crest, porthole styles, lantern strings, and a ship's mascot (parrot / cat / dog wandering the decks). Looks only; these are Hangar unlocks.

### Tier 2: handling and lift
- **Fins:** rudder and elevator fins, sized (turn/climb vs gust risk).
- **Propellers:** propeller types (big-slow vs small-fast; pusher vs puller).
- **Drogue chute:** an air brake.
- **Bag shapes:** cigar / round / cluster.
- **Bag protection:** bag netting / armoured skin.
- **Inner gas cells:** inside one big bag.

### Tier 3: weapons and defence
- **Turret types:**
  - Broadside cannon.
  - Rotating dorsal turret.
  - Flak.
  - Harpoon gun.
  - Mortar.
  - Rear-gunner tail perch.
- **Belly gondola:** a gun pod on a winch cable.
- **Torpedo tubes.**
- **Ram prow:** reinforced; smashes enemies and rock.
- **Spiked hull:** hurts boarders.
- **Smoke launchers:** hide from fighters briefly.
- **Spark arrestors and sprinklers:** tie into S.5f fire.
- **Armour plate walls in spots:** S.5g. Very heavy.

### Tier 4: crew and systems
- **Crew comfort:**
  - Bunks: faster wake-up.
  - Galley: a cook gives a crew speed buff.
- **Signal bell / speaking tubes:** warnings shared between stations.
- **Hookshot anchor points.**
- **Steam extras:** second steam line, pipe valves, pressure tanks (store steam for bursts).
- **Repair support:**
  - Workshop: faster repairs, craft patches.
  - Spare-parts locker.
- **Radio room:** one supply drop or scout plane per mission.
- **Observation:** observation dome / periscope (lookout range without a tall nest).
- **Searchlight colours:** red dazzles, white reaches far.
- **Hangar deck:** more escort fighters, or a scout plane to launch.

### Tier 5: big wild builds
- **Twin-hull catamaran:** two gondolas under one long bag, with a rope bridge.
- **Detachable lifeboat / escape pod:** launch when going down, reboard later.
- **Tethered kite / observation balloon:** a lookout on a cable above the ship.
- **Towed second airship:** a "train" on a cable; cut it and it drifts away.

### How the tiers will be built
- Each tier is a batch of parallel worker tasks.
- Each part needs:
  1. part data + palette picture;
  2. sim behaviour;
  3. bot use where sensible;
  4. validator line;
  5. gate in `tools/buildsim.mjs`;
  6. classic stays identical.
- The random batch (`buildsim --random`) gains each new part, to catch dominant parts and traps.

## Cross-ship physics (owner: "the possibilities could be endless")

Every airship, ours, the AI gunships and the PvP rival, uses the same weight-and-forces rules. That makes silly, creative strategies possible:
- **Gunships have balance too.** The enemy gunship gets a live centre of mass from her parts, her crew and anyone aboard her. If our boarders crowd her bow, she tips; enough weight at one end pitches her guns off target or drives her nose into the rocks. In PvP both ships already run the full sim, so this comes for free there.
- **Throwable ballast.** Sandbags (and coal sacks, crates, ice blocks) become carryable items you can:
  - THROW with the attack button (an arc, like a thrown ice block);
  - drop from the bomb bay;
  - fire from the crew cannon;
  - haul across on the hookshot.

  Thrown onto another ship they land as dead weight at that spot and tip her. The other crew can shovel them overboard (a job arrow appears). We can lighten our own ship by dumping ballast overboard for a quick climb.
- **Weight wars:**
  - pile crew on one end of an enemy ship;
  - cut her ballast lines;
  - drop an anchor onto her deck;
  - steal her coal (it lightens her and stalls her boiler);
  - hook her with the grapple and drag her down with our weight.
- **More ideas this unlocks:**
  - towing a disabled enemy home as a prize;
  - stacking crates to block her deck;
  - jettisoning a burning bunker to save the ship;
  - a "weight bomb" (an anvil) dropped onto a gasbag;
  - balancing contests in King of the Hill.

**Build order:**
1. (Done by MOVEMENT.md B.5: the gunship is a Ship, so her mass, centre of mass and torque, her crew, our boarders and dropped weights all use the ordinary rules.) After forces.js lands (S.5h), give gunship.js the same live centre-of-mass and torque model, fed by her crew, our boarders and dropped weights. Classic co-op stays within noise; measure and re-baseline.
2. Then the throwable-ballast item.
3. Then the weight-war tricks, one at a time, each with a bot-arena check so none becomes a must-use exploit.
