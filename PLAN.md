# Airship Crew - Next Level plan (round 2)

Where we are (Oct 2026): a working co-op airship game for up to 16 phones. Gas-and-engines
flight through cave, route and open-sky maps; many stations (helm with speed + pressure levers,
guns, deflector, lightning coil, bomb bay, escort fighter); enemies (dogfighter squadrons,
fighter, bombers, bats, gunships you can board, bosses, turrets, specials); upgrades between
missions; bots for testing; pause menu.

What "next level" means: a game a group wants to play for a whole evening and come back to.
That needs (1) a reason to keep going (a campaign), (2) every player feeling needed every
minute, (3) moments people talk about afterwards, and (4) polish so it reads and sounds great
on a TV at a party.

## How the work is done (the agent team)
- **Lead (Claude Opus, the main chat)**: owns this plan, picks the next task, writes a clear
  brief, hands it to one worker, checks the result, tests it, commits, and reports to the user
  in plain language. Only the lead talks to the user and only the lead commits.
- **Workers (Claude Sonnet - cheaper and faster)**, defined in `.claude/agents/`:
  - `gameplay-builder` - game rules, enemies, missions, bots (host code).
  - `art-builder` - drawing on the TV: ship, enemies, effects, HUD.
  - `phone-builder` - the phone controller (buttons, levers, hints).
  - `playtester` - runs headless bot games and reports balance and errors (changes nothing).
  - `reviewer` - reads a finished change against CLAUDE.md and looks for bugs (changes nothing).
- Rules for workers: one task at a time; read only the files needed; tunable numbers go in
  `public/config.js`; no internet assets; never commit; finish by running the headless test.
- Usage: the lead asks the user before starting each batch of tasks. A task is roughly one
  worker run + one playtest + one review.

## Current focus (from the user, 6 Oct 2026) - do these first, after A1
The user's goals: better player physics, better enemy fighter and enemy physics, a stronger game
loop, new airship mechanics, and richer ways for an enemy airship to interact with ours. Plus
the lead's own additions (marked *).

### F1. Game loop (the backbone)
- F1a. *Fixed-timestep simulation*: the game steps at exactly 60 Hz whatever the TV's frame rate
  (an accumulator in main.js), so physics feel the same on every laptop and bot runs repeat.
- F1b. A clear loop for every mission: **briefing** (one line: goal + threat) -> **flight** with
  rising encounters -> **objective moment** -> **escape / extraction** -> **debrief** (scorecard)
  -> **shipyard** (spend salvage). Each step has its own short screen on the TV and phones.
- F1c. *Director 2.0*: one "intensity" budget that spends on enemies, weather and ship faults so
  pressure rises and falls smoothly; tuned with botsim numbers rather than guesswork.

### F2. Enemy flight physics (fighters and everything that flies)
- F2a. One shared flight model for all planes: thrust, drag, lift and gravity. Planes lose speed
  climbing, gain it diving, **stall** if too slow (nose drops, then recover), bank into turns.
- F2b. Different "weights": nimble dogfighters, heavy bombers with wide slow turns, the big
  fighter with boom-and-zoom passes, bats as a flock (boids: stay together, avoid, swarm).
- F2c. Damage changes handling: a hurt plane wobbles, pulls to one side, trails smoke, and may
  try to ram. Rams shove our ship (real momentum) as well as damaging it.
- F2d. Our escort fighter uses the same model, so it feels like the enemies.

### F3. Player physics (the crew on deck)
- F3a. Walking with a little momentum (quick start, short skid), a **jump** button with a real
  arc, and ledge/ladder grabs.
- F3b. The ship moves under them: hard pitch or a big hit makes crew stagger and slide, loose
  crew on outside decks can be thrown off (and land in the medical bay as now).
- F3c. Knockback that reads: hits push crew, explosions blow them over, landing has a squash.

### F4. Airship mechanics (new ideas)
- F4a. **Ballast**: drop sandbags for an emergency climb (then the ship is lighter until you
  reload ballast at a station).
- F4b. **Steam boost**: a short engine burst that costs boiler pressure (escape or ram).
- F4c. **Wind and thermals**: updrafts, downdrafts and headwinds on some maps that the helm and
  pressure lever must fight or ride.
- F4d. **Ship damage zones**: losing a section (engine pod, gasbag cell) changes how she flies;
  repairs bring it back.
- F4e. *Anchor / grapple line*: hook onto rock or an enemy to hold position or pull close.

### F5. Enemy airships vs our airship
- F5a. Gunships fly with the same gas/engine physics as us instead of being locked alongside:
  they manoeuvre for a broadside, and our helm can out-manoeuvre them (get above, behind).
- F5b. **Ship-to-ship actions**: grapple hooks that pull the ships together, ramming with
  real shoves, boarding parties coming to US by rope swing, cutting their gasbag so they sink.
- F5c. Their visible crew aim their guns (you see the barrels track you), and the systems
  status (GUNS/STEAM/HELM) changes how they fly and fight.
- F5d. *Capture*: clear a gunship's crew and you can fire her guns at other enemies until she
  drifts away.

### Order for the focus work
A1 -> F1a -> F2a/F2b -> F3a/F3b -> F5a/F5b -> F4 -> F1b/F1c -> then Phase B onward.

## Phase A - Foundations that make everything else cheaper
- A1. **Headless test runner** (`tools/botsim.mjs`): run the real simulation in Node with N bots
  for M minutes on a chosen map type and difficulty; print missions done, wrecks, hull, kills
  and any errors. Every later task is tested with it. [gameplay-builder]
- A2. **Split the two giant files** (simulation.js about 1050 lines, render.js about 1600) into
  smaller modules (players/stations, flight, combat; HUD, effects, background) with no change
  in behaviour, checked with A1 before and after. [gameplay-builder, then art-builder]
- A3. **Balance report**: the runner prints a short table per difficulty (time to wreck,
  damage by enemy type) so tuning is based on numbers. [playtester + gameplay-builder]

## Phase B - A campaign worth playing
- B1. **Sector map between missions**: pick the next mission from 2-3 choices (risk vs reward),
  shown on the TV, voted on phones (reusing the upgrade vote).
- B2. **Mission types**: escort a slow supply barge, raid a factory (bomb bay), rescue downed
  crew (rope-ladder pickup), survive the storm, chase down a gunship.
- B3. **Salvage + shipyard**: earn salvage from kills, boarding and missions; spend it between
  missions on upgrades and repairs.
- B4. **Campaign save**: progress, ship and unlocks saved on the TV computer, with
  "Continue campaign" on the start screen.
- B5. **Final battle**: the enemy flagship after N sectors, with a proper ending screen.

## Phase C - Every player needed, every minute
- C1. **Call-outs**: the TV shows short orders ("GUNS LEFT!", "FIRE IN THE HOLD!") and an idle
  player's phone shows a big arrow toward the nearest useful job.
- C2. **Two-person stations**: a few jobs that need two people (heavy cannon loader + gunner,
  hand-cranked searchlight in storms).
- C3. **Roles at join**: optional role pick (pilot, gunner, engineer, medic) with a small perk.
- C4. **Join and drop-out polish**: join mid-flight cleanly; bots fill and free seats
  automatically so 2 players and 16 players both feel right.

## Phase D - Moments people talk about
- D1. **Set-piece events**: gasbag fire, engine stall, lightning strike, a ramming run, a
  canyon chase.
- D2. **Enemies board us by rope swing too**, and a deck-fight event.
- D3. **Boss phases**: bosses change behaviour at half health and have weak points.
- D4. **New biomes**: sea with flak ships, a city at night with searchlights, a mountain fortress.

## Phase E - Polish for the party
- E1. **Music**: a looping 1930s-style tune made in code (no internet files), calm and combat.
- E2. **Juice**: hit-stop, squash and stretch, better explosions.
- E3. **Phone polish**: clearer buttons per station, a short tutorial card per station,
  colour-blind friendly colours.
- E4. **First-time tutorial**: a short moored practice the first time a group plays.
- E5. **TV readability check**: contrast and text size from across a room.

## Order
A1 first, then the Current focus list above (F1-F5), then A2 -> A3, then B1-B4, then C1 and
E1 (lots of fun for little effort), then the rest. The lead re-checks the order with the user
after each phase.

## Progress log (round 2)
- Plan and agent team set up. User goals added as Current focus (F1-F5).
- Note: the .claude/agents files load in a NEW session; until then the lead runs the same
  instructions through a general-purpose agent with model = sonnet.

---

## Archive - round 1 roadmap (done)

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

### Phase 0 - Foundation (small, do first)
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

### Phase 1 - Camera and ship layout
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

### Phase 2 - Controls and weapons
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

### Phase 3 - Visual overhaul
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

### Phase 4 - Feel, sound, and balance
- Cartoon sound effects and a 1930s-style music loop on the host, with volume control.
- Screen shake, hit-stop, and squash-and-stretch on impacts.
- Difficulty presets and scaling by crew size, tuned in `config.js`.
- An end-of-mission scorecard: raiders whacked, holes patched, shells hauled, revives.

### Phase 5 - Game structure (later)
- Missions with goals (escort, raid, survive the storm) and a sector map between them.
- Ship upgrades between missions, more enemy aircraft and airships, weather events, and ship classes.

---

### Progress log
- Phases 0-2: done (modules, new ship, camera, tools, module damage, steam, phone gamepad,
  enemies, raider types, course with laps). Phase 3: film look tried and switched off at the
  user's request; sprite loader + art spec done; bulldog and skeleton vector art done.
- "Make it fun" pass (Oct 2026): upgrade votes at beacon/home (15 upgrades, shown on the ship),
  bat swarms, bombers, skeleton strafers, rocket batteries, the Dread Zeppelin boss with
  destroyable turrets, storms from lap 2, difficulty presets + autopilot, lap scorecard with
  awards, comic pop-up words, synthesised sound effects, phone buzzes/toasts, moored start screen
  with CAST OFF. Balance tuned with bot playtests (Normal, 8 bots: about 1 down per 5 minutes).
- Also: a different boss each lap (Dread Zeppelin, Bat Carrier, Iron Dreadnought), the fighter
  redrawn as the devil's twin-boom plane, vector art for the devil Brute and bat Cutter, a crew
  record remembered on the TV, "Add 4 bot crew" for small groups.
- Next ideas: playtest with real people and retune difficulty; painted sprite art; more
  missions/routes (Phase 5).

### Decisions to confirm with the user
- Phone orientation: landscape gamepad layout (recommended) or portrait.
- Name and crest of the player crew's faction.
- Weapon variants: cosmetic only (recommended for now) or with different stats.
