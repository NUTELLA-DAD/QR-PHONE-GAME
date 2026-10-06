# Airship Crew – Art Spec

How to make art that drops straight into the game. The reference sheets in `art/reference/` set
the look; this file sets the **pieces, sizes and file names**.

The game uses your art wherever a file exists and keeps its current placeholder drawing
everywhere else, so you can add art **one piece at a time** and see it in the game straight away.

---

## 1. The golden rules

1. **Style:** 1930s rubber-hose cartoon (Cuphead-like), as in the reference sheets. Thick black
   ink outlines, flat colours with a little texture, warm and slightly faded palette.
2. **No real-world markings — ever.** No national insignia, flags, roundels, crosses, sun discs,
   stars, real squadron codes, real unit badges or foreign-language text. Use only our own
   **fictional crests** (section 7) or harmless nose art (shark teeth, skulls, lightning bolt,
   playing cards, numbers).
3. **Side view, facing RIGHT.** The game is side-on. Everything faces right; the game flips it
   when something turns left.
4. **One piece per file, nothing else in the picture.** No background, no shadow on the ground,
   no labels, no text, no other pieces.
5. **Transparent background (PNG).** If your art tool can't make transparent backgrounds, use a
   **flat pure magenta background (#FF00FF)** and I'll strip it automatically.
   SVG (vector) files work too; if a PNG and an SVG have the same name, the PNG is used.
6. **Size = 2× the game size.** Every size below is in pixels at 2× and is a guide: a little
   bigger or smaller is fine as long as the **proportions** match. Leave about 10 px of empty
   space around each piece.
7. **Light from the top-left**, same as the sheets.
8. **File names:** lowercase, words joined with `-` or `_`, exactly as listed. PNG only.
9. **Don't worry about joint points.** Just centre each piece in its image; I'll measure where
   arms, legs and heads attach and record it in a small settings file.

---

## 2. Who's who

**Our crew: the animals.** Players pick one of 8 animal pilots:

| Slot | Animal | Reference |
|---|---|---|
| 1 | Bulldog | `bulldog-pilot-and-fighter.webp` (blue flight jacket) |
| 2 | Wolf | `wolf-pilot-and-fighter.webp` (**remove the cross badges**) |
| 3 | Shiba | `shiba-pilot-and-fighter.webp` (**remove the sun badges**) |
| 4 | Tiger | new – same style |
| 5 | Fox | new – same style |
| 6 | Bear | new – same style |
| 7 | Cat | new – same style |
| 8 | Rabbit | new – same style |

**The enemy: monsters.**

| Game role | Creature | Reference | Notes |
|---|---|---|---|
| Raider (grunt) | Skeleton crewman | `skeleton-squadron.webp` | carries a cutlass or wrench |
| Brute | Big devil | `devil-pilot-and-twin-boom.webp` | with trident; drawn normal size, the game makes it bigger |
| Sapper | Skeleton bomber | `skeleton-squadron.webp` ("Bomber") | hugs a round black bomb |
| Cutter | Bat creature | new | claws or big shears; it hacks at pipes and guns |
| Fighter plane | Devil's twin-boom fighter | `devil-pilot-and-twin-boom.webp` | |
| Cargo plane (drops raiders) | new design | – | big, slow, side door that opens |
| Later fighter | Skeleton squadron plane | `skeleton-squadron.webp` | |

---

## 3. Characters (crew and monsters use the same pieces)

Characters are built from separate pieces that the game moves to walk, climb, swing and so on.
In the game a character is about **100 units tall**, so the whole figure assembled is about
**200 px tall at 2×**. Proportions like the sheets: **big head (about 40% of the height)**, short
body, rubber-hose arms and legs.

Folders (exact names):

- Crew: `art/sprites/crew/<animal>/` with `<animal>` = `bulldog`, `wolf`, `shiba`, `tiger`, `fox`,
  `bear`, `cat`, `rabbit` — e.g. `art/sprites/crew/bulldog/head.png`
- Monsters: `art/sprites/enemies/skeleton/` (Raider), `enemies/devil/` (Brute),
  `enemies/skeleton-bomber/` (Sapper), `enemies/bat/` (Cutter)

A character switches to its art once it has at least `head.png` and `torso.png`; any other
piece that's missing is simply left out (or uses the placeholder tool, for held items).

| File | What | Size (2×) |
|---|---|---|
| `head.png` | Head **with helmet and goggles**, side view facing right, neutral face | ~110 × 110 |
| `head_effort.png` | Same, gritted teeth / shouting (used when fighting, hammering, hauling) | ~110 × 110 |
| `head_ko.png` | Same, eyes as X's or spirals, tongue out (knocked out) | ~110 × 110 |
| `torso.png` | Body: jacket/uniform with belt, **no arms, no legs, no head** | ~80 × 80 |
| `arm.png` | One whole arm with glove, hanging straight down | ~30 × 70 |
| `leg.png` | One whole leg with boot, straight, boot pointing right | ~34 × 60 |
| `tail.png` | Tail (skip if none) | ~60 × 60 |
| `scarf.png` | Scarf, blowing back to the left — **draw it in light grey** (see note) | ~70 × 40 |
| `climb.png` | Whole character from **behind**, arms up as if on a ladder | ~110 × 200 |
| `ko.png` | Whole character **lying flat** on its back, knocked out | ~200 × 90 |

Monsters also need:

| File | What | Size (2×) |
|---|---|---|
| `weapon.png` | Their weapon held upright (cutlass, trident, shears; sapper: the bomb) | ~40 × 120 |
| `windup.png` | Whole character, weapon raised high, about to strike | ~160 × 220 |

**Scarf note:** every player's scarf is tinted to their own colour so they can spot themselves
from across the room. Draw the scarf in **light grey shades with normal black outlines**; the
game adds the colour.

**Arms and legs:** the game uses the same `arm.png` for both arms (it darkens the far one) and
the same `leg.png` for both legs.

---

## 4. Planes

Folder: `art/sprites/planes/<name>/` — names: `fighter` (the devil's twin-boom), `cargo`,
`skeleton-fighter` (not in the game yet)

| File | What | Size (2×) |
|---|---|---|
| `body.png` | Whole plane, side view facing right, **no propeller**, pilot visible in the cockpit | fighter ~340 × 150, cargo ~620 × 240 |
| `prop.png` | Propeller seen **edge-on** (a thin vertical blade, as in the sheets' "side" view) | ~40 × 180 |
| `wreck.png` | Same plane broken and burning, for when it's shot down | same as body |
| `door_open.png` | **Cargo plane only:** the side door section, open, monsters peeking out | ~120 × 100 |

---

## 5. The airship

The ship's shape and room positions are fixed by the game layout, so these sizes are exact
(2×). The game draws the rooms as a cut-away, like the `airship.webp` sheet.

Folder: `art/sprites/ship/`

**Big pieces**

| File | What | Size (2×) |
|---|---|---|
| `gasbag.png` | The envelope: banded, strapped, riveted — **no roundel** (the crest is a separate decal) | 3440 × 740 |
| `fin-top.png`, `fin-bottom.png` | Red tail fins at the back (left) end | ~270 × 260 each |
| `gondola.png` | The outside shell of the gondola (hull, bow, keel), with the inside left **empty/transparent** where the rooms show | 2772 × 670 |
| `nest.png` | Crow's-nest basket with railing | 440 × 160 |
| `pod.png` | Ball-turret pod under the belly, with a porthole | 288 × 232 |
| `engine.png` | Engine nacelle on its strut, no propeller | 248 × 96 |
| `catwalk.png` | One 140-wide section of top catwalk with railing (repeats) | 280 × 100 |
| `outrigger.png` | One section of the outside engine walkway with railing (repeats) | 280 × 100 |

**Room backgrounds** (back wall, lamps, rivets, pipes on the wall – no floor objects)

| File | Room | Size (2×) |
|---|---|---|
| `room-tail-turret.png` | Tail Turret | 200 × 296 |
| `room-boiler.png` | Boiler Room | 760 × 296 |
| `room-workshop.png` | Workshop | 960 × 296 |
| `room-bridge.png` | Bridge (big windows) | 740 × 296 |
| `room-aft-gun-deck.png` | Aft Gun Deck | 800 × 280 |
| `room-hold.png` | Hold | 600 × 280 |
| `room-fore-gun-deck.png` | Fore Gun Deck | 800 × 280 |
| `floor.png` | A section of deck planks (repeats) | 256 × 24 |

**Fittings and props**

| File | What | Size (2×) |
|---|---|---|
| `boiler.png` | The boiler with firebox door (fire glow added by the game) | 180 × 224 |
| `gauge.png` | Round pressure gauge face, **no needle** | 64 × 64 |
| `wheel.png` | Ship's wheel, face-on (the game spins it) | 152 × 152 |
| `chart-table.png` | Navigator's chart table | 160 × 104 |
| `coal-bunker.png` | Bin heaped with coal | 200 × 172 |
| `ammo-crates.png` | Stack of shell crates | 200 × 100 |
| `rack-sword.png`, `rack-hammer.png` | Wall rack holding two swords / two hammers | 136 × 140 |
| `extinguisher.png` | Wall-hung fire extinguisher | 48 × 120 |
| `vent.png` | Steam vent stack with a red valve wheel | 64 × 220 |
| `valve.png` | Pipe valve wheel, face-on | 56 × 56 |
| `ladder.png` | One rung section of ladder (repeats upward) | 64 × 52 |
| `rope-ladder.png` | One rung section of rope ladder (repeats) | 64 × 52 |
| `stairs.png` | Staircase going down to the right | 280 × 300 |
| `lift.png` | Lift cage | 152 × 256 |
| `gun-mount.png` | Round gun turret base | 64 × 64 |
| `gun-barrel.png` | Gun barrel pointing **right**, breech at the left end (the game turns it) | 132 × 48 |
| `porthole.png` | Round porthole | 64 × 64 |

---

## 6. Items, hazards and effects

Folder: `art/sprites/items/` and `art/sprites/fx/`

| File | What | Size (2×) |
|---|---|---|
| `items/sword.png`, `items/hammer.png`, `items/extinguisher.png` | Held tools, pointing **up** | ~40 × 100 |
| `items/coal.png`, `items/ammo.png` | Lump of coal / shell crate carried in arms | ~50 × 40 |
| `fx/fire-1.png` … `fx/fire-4.png` | 4 frames of a looping cartoon flame | 120 × 140 each |
| `fx/hole.png` | Splintered hole in the hull wall | 100 × 120 |
| `fx/gas-hole.png` | Rip in the gasbag fabric | 80 × 60 |
| `fx/bomb.png` | Sapper's round bomb with fuse | 96 × 120 |
| `fx/mine.png` | Floating spiked mine hanging from a little balloon (a skull face is welcome) | 200 × 320 |
| `fx/explosion-1.png` … `-4.png` | *(optional, not used yet)* puffy cartoon explosion frames | 200 × 200 each |

---

## 7. Crests (fictional)

Folder: `art/sprites/crests/` — round squadron patches, 512 × 512, no text.

| File | For | Idea |
|---|---|---|
| `crew.png` | Our animals: gasbag decal, flag, uniform patch | e.g. winged cog, or a paw over wings |
| `monsters.png` | The enemy: plane markings, cargo plane | e.g. skull with bat wings, or a horned flame |

These replace every real marking on the reference sheets.

---

## 8. If you use an AI image tool

Make **one piece per image**. A prompt template that tends to keep the style consistent:

> *Single [PIECE] of [CHARACTER], 1930s rubber hose cartoon style, thick black ink outlines,
> flat muted colours with light paper texture, side view facing right, isolated on a plain
> pure magenta (#FF00FF) background, no text, no logos, no insignia, no shadow.*

Examples for [PIECE] / [CHARACTER]: *"head with leather flying helmet and goggles"* /
*"cartoon bulldog pilot"*; *"left-facing body only, no head no arms no legs, blue flight jacket"*.

Tips: attach the reference sheet as a style reference; ask for the same character in every
prompt; keep the outline thickness the same between pieces.

---

## 9. Where to start (most visible first)

1. **Bulldog**: all character pieces (section 3) — lets us prove the character system works.
2. **Skeleton raider**: all pieces — the most common enemy.
3. **Gasbag, fins, gondola** — the biggest thing on screen.
4. **Devil fighter**: `body`, `prop`, `wreck`.
5. **Cargo plane** and **mine**.
6. The other animals, monsters, rooms and props in any order.

## 10. Fine-tuning (my job)

`art/sprites/rig.json` holds the joint points for each character and plane, e.g.
`{ "crew/bulldog": { "neck": { "x": 3, "y": -60 }, "armLength": 30 } }`. I'll fill it in once
real art arrives, so the pieces line up.

## 11. How to hand it over

Put the PNGs in the folders above (inside `art/sprites/`) and tell me. I'll check each piece,
strip magenta backgrounds, set the joint points, and you'll see it in the game the next time
you start it. Anything missing keeps its placeholder, so nothing ever breaks.

## Style guide (the whole game)

Simple and uncluttered. The colours live in `public/config.js` under `PALETTE`.

- **Backgrounds stay calm:** sky, distant hills, rock and caves are flat, muted colours with only
  soft bands - no speckles or busy detail. Caves are a plain dark backdrop.
- **The action is bold:** the ship (warm wood and cream), the crew (their bright scarf colours
  and a colour marker over each head) and enemies (red accents, with a soft red glow) are the
  brightest, highest-contrast things on screen.
- **Colour means something:** red = enemies and their attacks/warnings; gold = goals, pickups
  and supplies; cyan = our shield and Lightning Coil; crew shots glow in the shooter's colour.
- **Warnings come before attacks:** a glow or a line (turret glow and dotted aim line, sniper
  line, gun-port glow, raider wind-up flash) - always in red.
- **Screen layout:** HUD top-left, minimap top-right, messages in one small bar at the bottom,
  join code bottom-right. Nothing sits over the middle of the screen, where the ship stays.
- **Text on the playfield is small:** comic pop-up words are short and few; station names show
  only on the start screen (in flight, each phone says where its player is).
- One ink outline weight (about 4-6 px) for everything drawn.
