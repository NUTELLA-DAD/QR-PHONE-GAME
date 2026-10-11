# Structural damage replaces the hull bar

Planned by Fable (a read-only study). Lead's notes are marked **Lead:**.

**Lead:** the owner asked on 2026-10-10: "remove hull damage, and just make it when the ship is structurally unable to fly, so blimps break it crashes. enough structure falls away and it splits in half". **Waiting for the owner's OK before building.**

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
