# The core loop: scrap, build, climb

Fable's game-design study (read-only), 2026-10-10. The owner asked: "Game loop is important. the crew should be ship building as they go from scraps and levels should be more and more complicated". Lead's notes are marked **Lead:**.

**Lead:** waiting for the owner's OK. The 3D level mechanics (orbit finale and others) follow in a separate Fable answer.

**G1 status (scrap, flotsam and the hold): built on branch `worktree-agent-a61e948826c7cd386`, not merged. `config.SCRAP.ENABLED` is on by default; `NO_SCRAP=1` in any tool (or `ENABLED: false`, or Versus) is the old game byte for byte.**
- **Files:** `modules/host/scrap.js` (new: the hold, the flotsam system, the helm's plan), `scrapArt.js` (new: bundle, chute, ring, hulk, bin), `cargo.js` (the `scrap` item, chute physics, stow / pick up / take off a hulk / dump), `hookshot.js` (a bundle is a light anchor), `towing.js` + `aim.js` (the harpoon hooks a hulk), `goingDown.js` (DUMP THE SCRAP), `balance.js` / `structure.js` (the hold weighs), `jobs.js` / `bots.js` (STOW, hulk, the helm steers under flotsam, the hookshot stunt), `render.js` / `shipArt.js` / `view3d` (rings, chutes, bin), `spotter.js` + phone radar (gold blips), `logWriter.js` (four new moments), `tools/scrap-check.mjs` (`buildsim.mjs --check-scrap`).
- **How scrap flows:** a kill is noticed (a plane gone from its list with 0 hp, the zeppelin, a creature dying or losing a limb, a gunship sinking), `flotsam.drop` makes bundles that fall on chutes as `world.thrown` items (`chute: true`), drift with the wind and land on any deck as LOADS (weight counted); the helm bot slows under them in a calm, a hookshot reels one to the thrower's feet, a harpoon hauls a gunship's HULK alongside and crew take its bundles from the rail; Action picks one up, Action at the hold bin (derived from the Hold room: no new part) stows it; the supply balloon is a crate of 2; GRAB at the bin takes one out again; while she falls, hold Action at the bin dumps the lot. `holdSpend(state, n)` / `holdAdd(state, n)` in scrap.js are the purse for G2 and G4.
- **Gates:** `--check-scrap` (new); `--check-botsim`, `--check-golden`, `--check-frames` and `--check-creature` run with `NO_SCRAP=1` beside `NO_STRUCTURE=1` until G7 re-snapshots them. `--check-log` pins `SCRAP.ENABLED = false` in its scenes (its gunship scene leaves before the hunt once the helm detours), and fails 3 checks of its own on this branch with or without scrap (holes patched, going-down-saved, the run end: the Book was cut before STRUCTURE).
- **Income (`voyagesim.mjs`, Normal, 8 bots, 24 seeds, its `scrap:` line):** the classic ship catches 5.1 bundles a stop (median 4.8, runs 2.4-17.5; target 5-8) and stows 3.0; 7.6 a stop fall (supply crates 3.6, boss 1.6, creatures 1.2, fighters 0.8, gunships 0.2, squadrons and bombers 0.2) and 5.5 are lost (given up, dumped while falling). The Sparrow catches 4.3. Hulks are rarely stripped by bots (no harpoon gun aboard: the helm has to fly alongside).
- **The cost:** the hold is heavy and nothing spends scrap yet. With `BUNDLE_W` 4 the classic ship's bots win about half as often (48 seeds, 101-148: 11 victories against 27 with NO_SCRAP=1; 16 at weight 2, 17 at 1, 23 at 0). The weight is the whole cost: the helm detours, the hookshot stunt and the stowing are free (steering and hooking off at weight 0: 25). The Sparrow's bots already die at stop 3 and do not change (0/24 and 2/24). G7 re-tunes (`SCRAP.BUNDLE_W`, `HOLD_CAP`), and G2 spending the hold at the dock should take most of it back.
- **For G2 (prices):** the purse is `holdCount(state)` / `holdSpend(state, n)` / `holdAdd(state, n)` (scrap.js) on a ship's context (`state.scrapHold.count`; ship 0's forwards to the world); the dock already shows it (`render.js drawVote`, `yardArt.js`). `run.scrap` and `run.scrapStowed` carry the stats; a derelict leg that pays scrap calls `holdAdd`. A price that takes more than the hold cap is never payable.
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
| G2 | Yard in scrap: prices, sell/buy, derelict legs give scrap, upgrades trimmed, shop of 3 cards | S/M |
| T | Treasure chests at outposts, HEIST | M |
| G4 | Frames (the in-flight build crew job, the phone BUILD card, scrap patches, provenance) | L |
| G5 | Derelicts and stripping, named part cards | M |
| G6 | Objectives: SALVAGE RUN, DEFEND | M |
| G7 | Bosun bot, `--no-build`, one combined re-tune and re-snapshot with STRUCTURE WP6 | M |
| G8 | Campaign across evenings (veteran start, unlocks) | S/M |

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
| R2 | the castle kit and art, the ring dial, the slow-motion crown fall | M |
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
