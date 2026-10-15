# PLAYTEST1.md - the first real playtest: what we heard and what we do about it

This is Fable's read-only study, written 2026-10-15 for the lead and the Opus builders. Every claim cites a file and line under `public/` or `tools/`. The owner approved two decisions after the playtest:
- **Phone buzzing:** off completely. This is already done: `CONTROLS.PHONE_BUZZ` is false (commit aa795fe).
- **Start ship:** "tiny raft, build it all".

## 1. In plain words

**What we heard.** The owner's six notes all come down to one problem: the game is hard to READ.
- The Sparrow packs 11 racks, 7 stations, 2 ladders, a lift, a rope and 3 pipe valves into 980 px. The phone's button changes every step and is often wrong.
- Ladders only catch you if you stand on a 76 px spot and push straight up.
- You can't find your own little person on the TV.
- The route map looks the same every time because the first two stops ARE the same every time: a Sky Isles cave, then the Titan.
- Two of the seven creatures never appear in a Voyage at all.
- The ship arrives finished, so building barely registers.

**What we will change, in the order you'll feel it:**
1. **The Titan stops repeating, and the skies vary.** A TV's first-ever voyage meets the Titan at stop 2, as a tutorial. After that the opening is rolled, and the Drake and the Rime Wyrm can appear as the hard branch at stops 3-4. The route map shows every stop's name, sky and boss.
2. **The phone says what's in front of you.** At a station, the big button is that station, hammer in hand or not. Racks only win when clearly nearer. The Sparrow sheds half her extinguishers and hammers.
3. **Ladders catch you.** Stand within a step of one and push up, and you slide onto it. The phone says "Push UP to climb", and the ladder glows.
4. **Where am I?**
   - A FIND ME button flares your figure and name on the TV for 2 s.
   - Your name plate is in your phone's colour and bigger.
   - The phone names the deck you stand on.
   - The camera never shrinks a crewman to a thumbnail.
5. **The raft.**
   - **Start:** a voyage begins on a 480 px deck with a small balloon, a boiler and a helm, two empty FRAMES (an engine pod and a gun mount) and 4+crew/2 scrap bundles in the hold, moored by a wreck.
   - **First minutes:** the crew build the engine and the gun in about two minutes and strip the wreck. The first dock sells a longer hull or a lower deck.
   - **Every stop after:** she grows a little more, and the threats follow what she has: no gunship until 2 guns, no raid until a bomb bay.

## 2. Diagnosis

### 2a. Chaotic: items and terminals are hard to grab

**The big button never takes a station for a person.**
- `shipSim.js:181-297 useFor`: for humans `legacy` is false (`shipSim.js:369`), so lines 266 and 290 never take a rack or station.
- Stations come only from GRAB (`grabsFor` 327-352). GRAB is folded into the big button only with empty hands (`shipSim.js:1561`).
- So with a hammer in hand the big button can't take the helm.
- GRAB also has `GRAB_HOLD` 0.35 s and `GRAB_LOCK` 0.6 s (`config.js:3917-3918`).

**`grabsFor` picks the nearest thing, and racks win ties.** Reach is 65 for racks and 85 for stations, with 15 px hysteresis. Vents and valves (`useFor` 269-272) come before stations, at 65 px reach.

**The Sparrow's reach zones overlap** (`shipBuild.js:414-461`):
- **Lower deck:** the coal bunker at 680, hammer at 760, lift at 800, extinguisher at 800 and Fore Sponson at 880 all overlap. Standing at the gun, the extinguisher wins.
- **Main deck:** the helm at 720 and the sword at 830 overlap.
- **In total** she has 6 extinguishers, 4 hammers and 1 sword.

**Labels flicker.** The label follows x every frame (`AID_GRACE` 0.25 s). At walk speed 230 px/s a 65 px zone is crossed in 0.28 s.

**The TV is cluttered.** The labels (`render.js:3289-3410`) carry a name (min 18 px), cone, hearts, "Hey!", chevron, verb plate, KO bars and popups. The figures are small: about 50 screen px on the Sparrow, and about 28 px once a threat zooms the camera out (`MAX_ZOOM_OUT` 1.8, `camera.js:107-109`).

### 2b. Ladders
- **Getting on:** `nav.js:13 GRAB = 38` px. `nav.js:182-191` needs you within 38 px of the foot or top AND |jy| > 0.4. There's no magnet, a diagonal push slides past, and at 230 px/s the window lasts 0.33 s.
- **Getting off:** only by pushing UP at the top (`nav.js:170-176`); pushing sideways does nothing.
- **In the air:** the grab reach is 30 px (`config.js:3887`).
- **Mixed connectors:** five types at five speeds (`shipBuild.js:39`); the pole is one-way. The Sparrow's ladders sit at different x on neighbouring decks.
- **No phone help:** the phone has no CLIMB offer or hint for ship ladders (`shipSim.js:296` is only the castle rope).

### 2c. Where am I
- **Colour is the only identity:** 16 colours (`server.js:10-11`), a 32 px triangle on the TV, and 8 animal heads that repeat. There's no YOU mark and no ping.
- **Every label looks the same:** `700 18px` on a cream halo for everyone (`render.js:3378, 3407`; `LABELS3D` `config.js:3650`).
- **The phone doesn't name your place:** `controller/ui.js:53` shows the station or "Walking". `jobs.js:54 roomName` already knows the room but only feeds arrows.
- **The camera shrinks you:** it zooms out for threats down to 1/1.8, with no floor on crewman size (`camera.js:97-109`).

### 2d. The Titan repeats
- `voyage.js:248-265 titanLair`: unless it's a "second" voyage or the route has fewer than 5 stops, column 1 of Sky Isles becomes the Titan, guaranteed (`config.js:3079 COLUMN 1, MIN_STOPS 5`). VOYAGE routes have 6-8 stops, so this always fires.
- Every new game counts as a first voyage: `simulation.js:664` doesn't pass a voyage number, and `newRun` sets `voyageNo` 1 (668). The save knows `save.totalRuns` / `save.ship.voyages` but `generateVoyage` is never told.
- So in 100% of voyages: stop 1 is a Sky Isles cave, and stop 2 is the Titan.

### 2e. The levels don't feel different
- `config.js:1045-1054`: slots 0-1 are always Sky Isles. Tier A (Frost, Ember) is at slots 2-3, under `LAIR_FROM` 0.6 and with no `lair` flag, so the Drake and the Wyrm can never appear in a Voyage (`voyage.js:216-242`). Only slots 5-6 hold lairs.
- The route map (`render.js:2445-2529`) shows discs and emoji, with names only on the stops being voted on (2522-2525). The teaching tag is 13 px. The map kind appears only in the vote card's description (`simulation.js:1274`).

### 2f. Why building doesn't register
- The Sparrow arrives with 3 guns, 2 engines, a lift, a lamp, a deflector, a medbay and 11 racks.
- The dock offers ONE part card about 90% of the time (`config.js:925`), so a voyage buys 4-5 parts onto a ship that already works.
- Frames are only the twin of that card, and only for small parts (`FRAMES.PARTS` `config.js:2554`).
- Danger follows power only 20% (`config.js:973 POWER_SCALE`).

## 3. The raft start (on existing systems)

Use `BUILDS` with `buildLayout`, plus `placeFrame` / `finishFrame` / `growPart`, `holdAdd`, the G6 FIELD map, G5 derelicts, the Yard `CATALOGUE` and validator, and `powerRatio`. Nothing new apart from one catalogue card pair and a `RAFT` config block.

### 3a. The raft (`BUILDS.raft`, after `shipBuild.js:461`)

`--check-minimum` already validates deck + bag + helm + boiler + coal with no FAIL (`tools/fixtures/minimum-lib.mjs:11-29`, `buildSlots.js:554-577 minimalBuild`). It flies at 502 px/s climbing with a boiler.

- **Main deck:** x 140..620 (4 columns = 480 px). That's 2 segments, so there's no critical middle and she can't split. `KEY_NO_BREAK_BEFORE` protects the boiler and helm ends.
- **Gasbag:** one, at cx 380. Size it so hover lands at 42-50 (`BUILD_CHECK`); the first guess is rx about 430, ry 232.
- **Stations and storage:** Helm x 540, Boiler x 220, Coal Bunker x 340, Ammo Hold x 440, medbay x 380.
- **Racks:** ONE hammer x 300, ONE sword x 480, ONE extinguisher x 400.
- **Not on her:** no lift, lower deck, catwalk, nest, engine or gun.
- **Also:** 2 boarder entries, a vent, and pipes by `routePipes`.
- **Spacing rule:** every grabbable thing is at least 85 px from every other.

**The gift at cast off** (`simulation.js newRun` after line 673):
- Two frames via `placeFrame` (`simulation.js:1031-1039`): an `engine` (aft outrigger) and a `gun` (fore).
- `holdAdd(state, 4 + floor(crew/2))`, capped at `SCRAP.HOLD_CAP`.
- `FRAMES.PARTS` needs `'engine'`. Check `--check-frames-build` with an engine frame FIRST. If that fails, the gift becomes a built engine plus a gun frame.
- `FRAMES_PENDING`: 1 / 2 / 3 by crew size (1, 6, 12).

### 3b. Stop by stop

| Stop | What | What gets built | From |
|---|---|---|---|
| 1 THE BREAKER'S YARD | SALVAGE RUN field map (`maps.js buildFieldMap`, `stopGoals.js`); first wreck within 1200 px, two more at 45% / 75%; bats only at `RATE_MUL` 0.5; storm `TIME` 420 s; goal STRIP 2 PARTS | Engine and gun frames (6 bundles, about 90 s for 3 people); 2-3 crates stripped from the wreck | Gift scrap; G5 stripping (+1 bundle per crate) |
| Dock 1 | MEND HER / HULL BAY (one-row bays, see 3g) / a NAMED card from the wreck / Cast off | Longer hull; a second gun | G5 named cards, G2 prices |
| 2 Sky Isles PASS or RAID (no Titan for a raft) | Strafers once she has a gun; flotsam | A frame from flotsam (lamp, armour, ladder) | G1 flotsam, G4 frames |
| Dock 2 | LOWER DECK card (3g) / a gasbag / a named part | A second deck and a hold room | Catalogue |
| 3 | Tier A raid or the Titan (hard branch); gunship only with 2 guns | A bomb bay at the next dock | Catalogue |
| 4-8 | Today's game | | |

### 3c. Threats follow the build
- **Set-piece gates:** add `buildGates` to `pickSetPiece` / `wantsGunship` (`simulation.js:474-502`): `RAFT.GATES = { strafers:{guns:1}, bombers:{guns:1}, gunship:{guns:2}, imps:{guns:1} }`.
- **Route rewrites:** `markRaftRoute` runs on the way to each column, like `markSalvage` (1245-1263) and `markDefend` (`voyage.js:195-210`):
  - an `open` stop becomes a `route` stop with no bomb bay;
  - the Titan becomes a plain stop while `guns < 2`.
- **Power scaling:** `RAFT.POWER_SCALE` 0.6 (`shipPower.js:35-40`).

### 3d. 2-16 players on a tiny raft
- **Early jobs are shared:** carrying, the wreck, one stoker, one at the helm, one gunner.
- **Things that scale with crew:**
  - `START_SCRAP`;
  - `FRAMES_PENDING`;
  - the field run's `NEED` (4 at 10+ crew);
  - named cards at a dock: 3 at 10+ crew, with `buildOffers` (line 1169) capped at 5 cards for big crews (the phone needs `dock5`);
  - `BIG_MUL` (`partsShop.js:285`).
- **Big crews build faster:** carrying takes about 90 s for 3 people and about 25 s for 8.

### 3e. The Sparrow and the classic
- **Keep both:** the Ship button becomes Auto / Raft / Sparrow / Classic (`simulation.js:1824`, `network.js:239`), and Sparrow and Classic are labelled QUICK START.
- **Auto pick:** `START_BUILD_BY_CREW.small` = `'raft'`; `big` stays classic for 7+ crew until the raft has been measured with big crews.
- **Tools** still default to the classic, so the baselines are untouched.

### 3f. The save
- `persistBuild` writes `save.build`, but `newRun` never reads it, so the ship doesn't carry between nights; her name, Book, roster and Nemesis do. Keep it that way.
- The raft is christened, and provenance lines ("the fore gun came off the Kestrel; Ann and Bo built the engine") are what carries over.
- A veteran start comes later (G8).

### 3g. New catalogue cards
- Add `lowerDeck` and `topDeck` to `partsShop.js:236 CATALOGUE`. Build them from `drawDeck` (`buildEdit.js:235`) + a `ladder` + `ensureFrame` + `routePipes`, shaped like `nestCandidates` (171-189).
- **Prices:** 110 and 100. They're allowed only while that row is missing.
- **Bays:** relax `bayCandidates` to one row for the raft (line 99).
- **Scoring:** `fitOf` scores them 3 while the ship has one deck.

### 3h. Bots
- `RAFT.BOTS = { PREFER: 1, BUILD_ANY_PHASE_UNTIL_GUNS: 1 }`, using `buildFrames.js:74 calmFor` and `botChoice` (`simulation.js:1290-1322`).
- Bots strip wrecks in a salvage run, and stop 1 is one.
- With no engine the raft drifts at 123 px/s, so the first wreck is hung within drift reach.
- **The measure:** `voyagesim --build raft`.

### 3i. Difficulty and length
- **Length:** a raft voyage runs 35-42 min (the Sparrow's is 30-35); QUICK mode is 20-25 min.
- **Targets** (24 seeds, Normal, 8 bots):
  - wins 25-45%;
  - timeouts no worse than the Sparrow's;
  - mean stops ≥ 5;
  - parts by the Flagship ≥ 8;
  - frames built ≥ 3 per voyage;
  - 0 errors.
- **Human profile** (12 seeds): stop 1 is done in under 8 minutes in 10 of 12.

### 3j. Risks

| Risk | Mitigation |
|---|---|
| `growPart` with an engine (pipes, nose weights) | Test it first; fallback: a built engine plus a gun frame |
| A one-deck ship in 3D has never been drawn (`shipMesh.js`) | A `raft` scene in `--check-3d` with a fixture, from day one |
| An end breaks off | `RAFT.NO_BREAK_BEFORE` 2 for every end while she has one deck |
| Boredom with no gun | Stop 1 is a strip-and-build race against the storm; bats from minute 2; a sword rack |
| The camera zooms out | The crewman size floor (P2) |
| Big crews on 480 px | The lower-deck card first at dock 1 for 9+ crew; `FRAMES_PENDING` 3 |

## 4. Packages

**Common rules for every package:**
- All numbers go in `config.js`.
- Every rule goes behind a switch whose OFF state is byte-identical (`--check-botsim`, `--check-golden`, `--check-frames`).
- Human-only rules guard on `!player.bot`.
- Run voyagesim before and after on sparrow and classic, 24 seeds.
- Never kill node globally.
- Never run gates in parallel: the timing budgets flake.

### P1. The Titan stops repeating; skies and beasts vary (S)
- **STATUS: DONE (2026-10-15, branch worktree-agent-a792af57bf3e17898).** `opts.firstEver` = `false` makes a route "varied"; no `firstEver` (the tools, a direct call) is today's route, so botsim / golden / frames stay byte-identical. The Titan: 37-38% of varied routes, column 1 or 2, never both; Drake or Wyrm on 64% of 7-8 stop routes; 50% open with a narrow pass. The daily route always varies (everyone must see the same map). Map: every stop shows name 20 px, kind 16 px, NEW tag 18 px, lair icons 44 px, legend "N skies, N beasts on this route" (config `VOYAGE.ROUTE_MAP`). Shots: `tools/routemap-shots.mjs`. `--check-curriculum` has a new (a2) section. For P5: `titanLair` / `curriculumLairs` take a `vary` argument; `generateCurriculum` computes `vary` from `opts.firstEver === false`.
- **Files:**
  - `voyage.js:248-265 titanLair`, `111-180 generateCurriculum` (`opts.firstEver`, `opts.raft`), `215-242 curriculumLairs`;
  - `simulation.js:664 newRun` (pass `firstEver: !(save.totalRuns > 0)` and the start build);
  - `config.js:1045-1054 TABLES.voyage`, `config.js:3079 TITAN.LAIR`;
  - `render.js:2445-2529 drawRouteMap`;
  - `tools/curriculum-check.mjs`.
- **Design:**
  - `TITAN.LAIR.VARY = { ENABLED: true, CHANCE: 0.4, COLUMNS: [1, 2] }`. On a voyage that isn't first-ever, the Titan stands with CHANCE at a hash-picked column, as the HARD branch, or doesn't appear.
  - Slot 0 kinds: `['network', 'route']`.
  - Slots 2-3 get `lair: 'light'` with `LAIR.LIGHT = { DANGER: 0, REWARD_MUL: 1.5, FROM: 0.25 }`: the Drake in Ember and the Wyrm in Frost. Never put lairs in neighbouring columns, and keep within COUNT.
  - **Map:** every stop gets its name at 20 px and its kind at 16 px. The NEW tag goes from 13 to 18 px. Lair icons are 44 px. Add a legend line ("N skies, N beasts on this route").
- **Switch:** `firstEver` is a browser-only input (tools have no save), so the tools stay byte-identical. `VARY.ENABLED false` gives today's game.
- **Gates:**
  - `--check-curriculum` over 200 voyages that aren't first-ever: the Titan in 30-50%, never in both column 1 and 2; Drake/Wyrm lairs in ≥ 20% of 7-8 stop routes; every column keeps a branch at base danger.
  - First-ever: the Titan at column 1, always.
  - botsim, golden and frames byte-identical; log and book green.

### P2. FIND ME: where am I (S/M)
- **Status (2026-10-15): BUILT** on branch `worktree-agent-a1728c8536538e727`, not merged. Switches: `CONTROLS.FIND_ME.ENABLED`, `LABELS3D.HUMAN.ENABLED` (config.LOOK3D) and `CAMERA.CREW_MIN_PX` (0 = off); all ON in a browser, OFF in Node tools unless `WITH_FIND_ME=1`, so botsim / golden / frames stay byte-identical. The ring is drawn last (over every name and verb) in 2D and over 3D. The floor is scaled to the screen height (36 px at 1080p); the classic is already under 36 px at its normal view, so the floor never zooms IN past the normal framing. Gates green: `--check-role-cards` (section 7), `rolecards-shots` (`find_me_*.png`), `--check-3d`, `--check-alarms`, `--check-botsim`, `--check-frames`, `--lint`.
- **Files:**
  - `controller.html` (a FIND ME button by `#hintbtn`), `controller/input.js` (`{find:1}`), `controller/ui.js:53 infoLine`;
  - `shipSim.js` input (`player.pingT`) and ui emit (`ui.room`);
  - `render.js:2831-2910 drawPlayer`, `3353-3410 crewNames/placeNames`, `3303-3305` (label floor);
  - `camera.js:104-109`;
  - `jobs.js:54 roomName` (export it);
  - `config.js:3650 LABELS3D`.
- **Design:**
  - `LABELS3D.HUMAN = { MIN_PX: 24, PLATE: true }`: a human's name sits on a plate in their own colour with ink text. Bots keep the cream halo.
  - `CONTROLS.FIND_ME = { TIME: 2.2, RING: 260, NAME_PX: 44, AUTO: ['join','wake','land'] }`: a 2.2 s expanding ring in their colour plus a 44 px name, stepped on 8 fps keys, in 2D and over 3D.
  - `CAMERA.CREW_MIN_PX: 36`: raise `minZoom` so a 90 px crewman is never under 36 screen px, except with a creature, a ring map, or in Versus.
  - The info line's bold part becomes "LOWER DECK - HOLD" while walking.
- **Switch:** off gives today's game. View and phone only.
- **Gates:**
  - `--check-role-cards` extended (the ping in 2D and over 3D; the room line for 13 station kinds and 4 decks; nothing under 22 px).
  - `rolecards-shots` adds `find_me_*.png`.
  - `--check-3d` and `--check-alarms`.

### P3. The button says what's in front of you (M)
**STATUS 2026-10-15: BUILT (worktree branch, not merged).** `CONTROLS.GRAB_V2` (NO_GRAB_V2=1 = the old game); `BUILDS.sparrow` decluttered, `BUILDS.sparrow_v1` is the old one. Deviations from the text: the main hammer is at 330, not 300 (300 is 60 px from the Boiler); the vent moved to main 840 and the two main pipe valves to 470 / 540 so the sword has its own stretch of deck; the boiler is no seat (it was never lockable: SURGE / coal stay on the big button). The tool taken to a seat goes back on its rack (racks are endless); a bundle or sandbag is set down as a load. `--check-grab` (`tools/grab-check.mjs`, reusable: `boot / person / sweep / idOf`, P4 adds sections at the bottom) and `tools/grab-shots.mjs` (`grab_*.png`). `--check-yard` now pins NO_GRAB_V2 (its sail "ONE legal place" is the old Sparrow's).
- **Files:**
  - `shipSim.js:327-352 grabsFor`, `355-366 sticky`, `1556-1564` (the merge), `266-272` (racks, vents and valves order for humans);
  - `config.js:3916-3929 CONTROLS`;
  - `shipBuild.js:448-459` (the Sparrow's racks);
  - `controller/ui.js:346-366` (labels);
  - new `tools/grab-check.mjs` and `--check-grab`.
- **Design:**
  - `CONTROLS.GRAB_V2 = { ENABLED: true, STATION_BIAS: 45, HYSTERESIS: 40, TOOL_TAKES_SEAT: true }`. A station's distance is scored minus 45. Station hysteresis is 40.
  - The merge at line 1561 also takes a station grab with a tool in hand. The tool is put down at his feet as a load via `cargo.place`; check `takeStation`.
  - For humans, vents and valves use `VALVE_REACH` 40 and come after stations.
  - **Sparrow racks:**
    - extinguishers 6 → 3 (lower 120, main 400, lower 590);
    - hammers 4 → 2 (main 300, lower 200);
    - the sword moves 830 → 600;
    - remove the lower hammer at 760 and the extinguisher at 800.
    - Rule: nothing grabbable within 85 px of a station except its own ammo or coal.
- **Switch:** `GRAB_V2.ENABLED false` plus `BUILDS.sparrow_v1` gives today's game. Humans only.
- **Gates:**
  - `--check-grab`: a staged human every 10 px along the Sparrow's 4 decks, with empty hands, a hammer, and scrap.
    - At a station ±40 px the big button names the station.
    - No label flips twice within 60 px.
    - Rack labels still show within 65 px of a rack with no station near.
    - The classic's labels at its stations.
  - Green: scrap, frames-build, derelicts and stop-shape.

### P4. Ladders that catch you (S) - after P3 (both touch `shipSim.js` near 296 and 1556 and share `grab-check.mjs`)
- **STATUS (2026-10-15): BUILT** (branch worktree-agent-a31ba4dfc4427c665, not merged). `config.NAV.LADDER` (`ENABLED` false or `NO_LADDER_V2=1` = today's game; `WITH_LADDER_BOTS=1` makes bots walk by the people's rules, for botsim). `nav.js`: `ladderEnd()` and `board()`; `moveWalker(..., human)` slides a person pushing mostly up/down within 70 px at 420 px/s and grabs, and a sideways push at a ladder's end steps off (a 0.3 s lock stops it snatching him back); bots and raiders keep the 38 px grab. `shipSim.js`: a `climb` act (CLIMB UP / CLIMB DOWN / SLIDE DOWN) on the big button when nothing else wants it (racks, seats, valves still win), ui `climb` for the phone line ("Push UP to climb"; "Push UP or DOWN to climb" on it; "push sideways to step off" at its ends). `render.js`: gold band and rungs, stepped, in 2D and the 3D HUD, on ladders a person is within 220 px of or on. Deviation: on the Sparrow the lower ladder's foot shares ground with an extinguisher (CLIMB shows within about 25 px of the foot; the push still catches from 70 px). `--check-grab` sections 8-14, `tools/ladder-shots.mjs` (`ladder_*.png`). Castle ladders (ground.js) untouched.
- **Files:**
  - `nav.js:13, 160-192 moveWalker` (humans only);
  - `shipSim.js:296` (a CLIMB offer) and `1551`;
  - `render.js` (a ladder glow via `p3.shipPt`);
  - `controller/ui.js HINT_RULES` (line 31);
  - new `config.NAV`.
- **Design:**
  - `NAV.LADDER = { GRAB_HUMAN: 70, MAGNET: 420, SIDE_OFF: 0.5, HINT: true, GLOW: true }`.
  - A human with |jy| > 0.4 and |jy| ≥ |jx| within 70 px slides to the ladder at 420 px/s and grabs it.
  - At the top or bottom, a sideways push > 0.5 steps off onto that deck.
  - The big button offers CLIMB.
  - The info line says "Push UP to climb".
  - The rungs glow gold (stepped).
  - Bots keep 38.
- **Gates (`grab-check.mjs`):**
  - A human at 0/30/60/90 px pushing up: grabbed in under 0.5 s at 0-60 px, not at 90.
  - A diagonal push grabs.
  - At the top, a sideways push lands on the deck.
  - The pole still slides.
  - `--check-away` untouched.

### P5. The raft, first slice (L)
- **Files:**
  - `shipBuild.js` (`BUILDS.raft`);
  - `config.js`: the `RAFT` block, `START_BUILD_BY_CREW.small`, `FRAMES.PARTS` + engine, and `TABLES.raft` (the voyage table with row 0 = `{ env:['skyisles'], kinds:['salvage'], gates:['swarm'], danger:1, yard:true }`);
  - `simulation.js newRun:661-684` (the gift) and `setStartBuild:1824`;
  - `network.js:239` (the Ship button cycle);
  - `voyage.js generateCurriculum` (`opts.raft`);
  - `stopGoals.js` and `maps.js buildFieldMap` (the `RAFT.YARD` settings);
  - `partsShop.js:236 CATALOGUE` (`lowerDeck`, `topDeck`; one-row bays);
  - `shipPower.js:35`, `buildFrames.js:74 calmFor`, `simulation.js:1290 botChoice`;
  - new `tools/raft-check.mjs` and `--check-raft`;
  - a `raft` 3D fixture scene.
- **Design:** `RAFT = { ENABLED: true, START_SCRAP: { BASE: 4, PER_CREW: 0.5 }, GIFT: ['engine','gun'], FRAMES_PENDING: {1:1, 6:2, 12:3}, POWER_SCALE: 0.6, NO_BREAK_BEFORE: 2, YARD: { TIME: 420, NEED: 2, FIRST_AT: 0.06, RATE_MUL: 0.5 }, BOTS: { PREFER: 1, BUILD_ANY_PHASE_UNTIL_GUNS: 1 } }`. The dock card cap is 5 for crews of 10+ (phone `dock5`).
- **Switch:** `RAFT.ENABLED false` plus the Sparrow start gives today's game. In tools the raft exists only with `--build raft`.
- **Gates:**
  - `--check-raft`:
    - the raft validates and hovers at 40-55;
    - 2 frames and the scrap at cast off;
    - an engine frame comes alive and she then flies faster than 450 px/s;
    - the gun frame works;
    - the yard map puts the first wreck within 1500 px;
    - no split in 20 forced-hit runs;
    - the `lowerDeck` / `topDeck` cards validate on the raft and the Sparrow;
    - the Ship button cycles;
    - 6 eight-bot raft voyages: 0 errors and ≥ 4 frames built.
  - Also green: frames-build (engine), derelicts, yard and 3d (raft scene); botsim, golden and frames byte-identical.
  - voyagesim `--build raft` vs `--build sparrow`: the 3i targets.

### P6. Threats follow the build (M) - after P5
- **Files:**
  - `simulation.js:474-502` (`buildGates`) and `1265 startRoute` (`markRaftRoute`);
  - `voyage.js` (a `rerouted` flag);
  - `render.js drawRouteMap`;
  - `config.js RAFT.GATES`;
  - `tools/curriculum-check.mjs` (c);
  - voyagesim: a "raft gates" line.
- **Design:** `RAFT.GATES = { strafers:{guns:1}, bombers:{guns:1}, gunship:{guns:2}, raid:{bombBay:1}, titan:{guns:2} }`, with `RAFT.GATES_ALL_SHIPS` false.
- **Gates:**
  - A raft with 0 guns sees no gunship, strafers or bombers in 6 minutes of stop 2.
  - With 2 guns, the gunship comes.
  - With no bay, raids are rerouted.
  - voyagesim raft: ≥ 1 gunship met per voyage.

### P7. The classic gets the declutter (S, optional)
- Apply the P3 rule to the classic's lower deck as `BUILDS.classic_v2`, with a new `--check-classic` fixture.

## 5. Order (about 25-30% of the week's usage is left, about 2.9 days)
1. **First, in parallel:** P1 + P2 + P3. P4 starts right after P3 merges.
2. **Then P5.** Merge P1 first: both add an option in `voyage.js generateCurriculum` and at `simulation.js:664`.
3. **Then P6,** then a combined voyagesim pass (raft, sparrow and classic; 24 seeds; 12 human-profile raft seeds), then **playtest 2**.
4. **If the budget is short:** ship P1-P4 plus a P5 "slice 0":
   - `BUILDS.raft`, the Ship button, the gift, `FRAMES.PARTS` + engine, and `--check-raft` on today's curriculum;
   - stop 1 forced to a salvage run (`markSalvage` `FROM_COLUMN 0`);
   - `TITAN.LAIR` off for the raft.
5. **Never in parallel:** P3 with P4, or P5 with P6.

## 6. Playtest 2 script (30 min, 4-6 people, Normal, VOYAGE, raft)

**Before:** don't clear the save (it should NOT be first-ever). Ship on Auto, nobody coached, the TV 2.5 m away.

**Minutes 0-3:**
- Time cast off → first bundle in a frame (under 45 s), → NEW: ENGINE POD (under 3 min), → first shot (under 4 min).
- Count "what do I do?" (under 3) and "where am I?" (under 2; did FIND ME work?).
- Has everyone touched something by minute 3?

**At every scorecard, ask:** What was the goal? What nearly killed us? Who did the best thing? What did we build?

**Tick when you see:**
- a failed ladder grab (target: under 1 per person per stop);
- a wrong phone label at a station;
- someone lost for more than 5 s;
- at the route vote, whether the owner can say the next sky and boss without the small text;
- whether stops 1 and 2 differ from last night.

**At the end:**
- total time 35-42 min, menus under 7 min;
- parts built, stripped and bought (the Book's run-end page);
- "again next week?";
- one line each on paper: what to cut.

**Solo check the night before** (4 bots, raft):
- Do the bots carry scrap to the frames and strip the first wreck?
- Is the engine alive by minute 3?
- At stop 2, is there something to shoot within 10 s?
- Does FIND ME work?
