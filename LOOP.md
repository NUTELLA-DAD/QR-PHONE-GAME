# The core loop: scrap, build, climb

Fable's game-design study (read-only), 2026-10-10. The owner asked: "Game loop is important. the crew should be ship building as they go from scraps and levels should be more and more complicated". Lead's notes are marked **Lead:**.

**Lead:** waiting for the owner's OK. The 3D level mechanics (orbit finale and others) follow in a separate Fable answer.

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
