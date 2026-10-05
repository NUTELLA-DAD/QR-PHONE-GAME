# Airship Crew - roadmap to the next level

Current state (v0.4): QR join, 16 players, walking and ladders, helm, two cannons, ammo hauling,
boiler steam, breaches, fires, repairs, boarders, knockouts and revives. Everything is drawn with
simple vector shapes in two large HTML files.

Goals for this round, from the user:
1. Visuals that match the WW2 cartoon squadron style (1930s rubber-hose, squadron-patch art).
2. Less zoom: the ship fills too much of the screen.
3. A more interesting ship layout.
4. Refined controls and more ergonomic phone buttons (the joystick itself is fine).
5. Every player carries a melee weapon to fight raiders.

Order matters: the layout and camera come before the art, because drawing a ship that will be
rebuilt is wasted effort, and character animations depend on the final moves (walk, climb, swing).

---

## Phase 0 - Foundation (small, do first)
Make the code easy to grow without breaking things.
- Initialise git and commit the current v0.4 as the starting point.
- Split `host.html` into modules: simulation (players, ship, enemies, hazards), rendering, camera,
  network, and config. Split the controller the same way. Use plain ES modules served by Express
  (no build step), so `start.bat` keeps working.
- Move all tunable numbers into `config.js`.
- Describe the ship layout as data (rooms, floors, ladders, stations, gun mounts, boarder entry
  points) instead of hard-coded coordinates.
- Upgrade the test bots so they can take stations, haul ammo, and patch holes. Solo testing gets
  much more useful.

Done when: the game plays exactly like v0.4, and the layout lives in a data file.

## Phase 1 - Camera and ship layout
**Camera**
- The ship should take up roughly half the screen width, leaving open sky where fights happen.
- Smooth camera that frames the ship plus nearby enemies, zooming out when enemies are far.
- Parallax background layers: distant mountains or sea, far clouds, near clouds, plus weather later.

**New ship layout** - a three-section airship with varied rooms instead of three identical shelves:
- Crow's nest on top of the gasbag (lookout), reached by a rope ladder up the side of the envelope.
- Bridge at the bow with big windows: helm, navigator, and a nose gun.
- Midship gun deck with cannons in side blisters (sponsons) that stick out of the hull.
- Engine nacelles on outrigger catwalks: exposed spots for engine repairs, in the line of fire.
- Stern tail-gun turret.
- Belly: ammo and cargo hold with a small lift up to the gun deck, plus a ventral ball turret.
- A mix of ladders, a staircase, a lift, and outside walkways. Rooms of different sizes.
- Clear boarder entry points: deck hatches and grapple points on the outside walkways.
- A navigation graph so boarders and bots can path anywhere on the ship.

**Added by the user (Oct 2026)**
- Zoom further out than the first camera pass: the ship around 35-40% of the screen width.
- Guns turn only within a firing arc and can never shoot through their own ship.
- Steam pipes run from the boiler to every part of the ship, with pressure valves along the way
  (laid out as data here; the gameplay comes in Phase 2).
- Tool racks (swords, hammers) and fire-extinguisher hooks placed around the ship.

Done when: 16 avatars fit without crowding, any station is reachable in about 8 seconds, and every
station is visually distinct at a glance from across the room.

## Phase 2 - Controls and weapons
**Phone layout (landscape gamepad)**
- Joystick bottom-left (keep the current feel).
- Right-thumb cluster: a big context button (Action) and a separate Attack button, both at least
  72px and placed along the natural thumb arc. Small Leave/Menu button in a top corner.
- The Action button shows an icon plus a short verb (Load, Patch, Revive, Take Helm).
- Buttons react on touch-down, with a pressed state and a short vibration.
- A thin status strip: your colour and name, what you are carrying, and the shared hull.
- Ask to rotate the phone if held in portrait. Try fullscreen and orientation lock on Android.
- Left-handed mirror option.

**Station panels**
- Helm: a throttle lever (slider) plus the joystick for altitude.
- Cannon: joystick to aim plus FIRE, with light aim assist toward the nearest target.
- Boiler: pressure gauge plus a timing-based stoke (shovel at the right moment for a bonus).
- Repairs and revives: a ring that fills while you hold the button.

**Movement feel**
- Acceleration and snappy stops, automatic ladder grab, drop down through hatches.
- On the host screen, highlight what each player is about to interact with.

**Tools and ship systems** (user idea)
- Players pick up tools from racks and carry one at a time: a sword to fight raiders, a hammer to
  fix holes and burst pipes (replaces the patch kit), and fire extinguishers from hooks around the
  ship to put out fires.
- Steam network: the boiler feeds pipes to each section (helm/engines, guns, lift). Pressure valves
  let the crew route steam; pipes can be hit and burst, cutting power to that section until fixed.

- (Done) Boiler fed by carrying coal from the Coal Bunker; overpressure must be vented at vent
  stacks or the boiler blows. Gasbag holes leak gas and sink the ship; boiler pressure pumps gas
  back in.

**Weapons and boarding combat**
- Melee weapons come from the tool racks (see above). Cosmetic variants per player later
  (wrench, frying pan, umbrella, cricket bat).
- Attack button: a swing arc that hits raiders in front, a 3-hit combo, knockback, short cooldown.
- Raiders telegraph their attacks with a wind-up flash so players can step back or interrupt.
- Raider types: Grunt (basic), Brute (slow, tough, big knockback), Sapper (plants a bomb on the
  hull that blows a breach unless defused), Cutter (goes after gas lines and stations).
- Boarders arrive in an enemy cargo plane that approaches from far out and drops them on the ship.
  Gunners can shoot it down before it arrives, which ties the gun crew to boarding defence.

**Enemies and reasons to steer** (user idea)
- Enemy planes never fly through the ship: their paths go around it, and a plane that does hit
  the ship crashes into it (damage, fire, wreck).
- Hazards to dodge with the helm: floating mines, flak bursts, later storms.
- No friendly fire. Keep knockouts and revives, retuned for the new combat.

Done when: a new player can pick up the phone and play without instructions, and fighting raiders
feels like its own fun job.

## Phase 3 - Visual overhaul
**Style target**: 1930s rubber-hose cartoon combined with WW2 squadron-patch art.
- Thick ink outlines with a gentle "line boil" wobble (redrawn at 8-12 fps).
- Paper grain, film grain, vignette, and a slight flicker over the whole screen.
- A limited, warm palette per faction.
- Cartoon effects: puffy explosions, shell trails, sparks, smoke, scorch marks, animated fire.
- Vintage display font bundled locally.

**Characters**
- Replace vector shapes with layered sprite parts per species: head, body, arms, legs, scarf,
  weapon. Rig them with a simple 2D skeleton.
- Animations: idle, walk, climb, carry, swing, hit, knocked out, and a pose for each station.
- The scarf stays the player colour, so players can find themselves from across the room.

**Art pipeline** (the user supplies the final art; Claude builds the pipeline)
- Write a short art spec: exact parts list, sizes, side-view angles, transparent PNG at 2x, file
  naming convention, and colour notes, based on the user's turnaround sheets.
- A loader that uses real sprites when present and falls back to placeholders when not, so art can
  be added one piece at a time.
- Ship art built from parts: hull sections, gasbag, nacelles, props, and room interiors.

**Factions** (fictional)
- The player crew's faction with its own crest, palette, and name.
- The Ember Pact (fox pilots, red planes, flame-triangle insignia) as the first enemy faction.

Done when: a screenshot reads as one consistent style, with no placeholder shapes left in view.

## Phase 4 - Feel, sound, and balance
- Cartoon sound effects and a 1930s-style music loop on the host, with volume control.
- Screen shake, hit-stop, and squash-and-stretch on impacts.
- Difficulty presets and scaling by crew size, tuned in `config.js`.
- An end-of-mission scorecard: raiders whacked, holes patched, shells hauled, revives.

## Phase 5 - Game structure (later)
- Missions with goals (escort, raid, survive the storm) and a sector map between them.
- Ship upgrades between missions, more enemy aircraft and airships, weather events, and ship classes.

---

## Decisions to confirm with the user
- Phone orientation: landscape gamepad layout (recommended) or portrait.
- Name and crest of the player crew's faction.
- Weapon variants: cosmetic only (recommended for now) or with different stats.
