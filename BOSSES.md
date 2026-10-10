# Airship Crew - Giant boss creatures

Planned by Fable (a read-only study of the code). Lead's notes are marked **Lead:**.

**Lead:** status: C.6a (the Cinder Drake) is built; waiting for the owner's OK on the rest. The first build is the Kraken vertical slice, tasks C.0 to C.5 below.
Note that the "C." numbers here are creature tasks. They are not the same as Phase C (controller ergonomics) in NEXT_LEVEL.md.

## 1. The vision

Today's bosses are zeppelins: a big oval that parks ahead, shoots, and has a health bar. A giant creature is a *puzzle with limbs*, not a health bar. It reaches onto the ship, so the fight happens where the crew already are:
- the deck tips;
- a tentacle is wrapped round the aft gun;
- someone hacks it with a sword while someone else bombs the open mouth.

Every phone on the sofa gets a clear thing to shout: "LIGHT IT UP", "IT'S GOT THE TAIL", "MOUTH'S OPEN - DROP!". At 3-5 times the ship's size, the ship is the small one for once, and the camera pulls back to show it.

**What makes it memorable on one TV with 2-16 phones**
- **Readable telegraphs in three beats:**
  - WIND-UP, 1.2-2.0 s: a shape on the TV points at the coming hit, a roar sounds, and crew standing there feel their phones buzz "GET OFF THE AFT DECK!".
  - The ACT: fast and loud, with one frame of hit-stop.
  - A RECOVERY window: a weak point opens and the TV stamps it ("MOUTH OPEN - 3 s").

  The delivery system already exists: the banner (`state.ev.warn`), `pop()`, `phoneFx`, and the gold job arrows on phones (`jobs.js`).
- **Every role matters, because the creature attacks the SHIP:**
  - gunners cut limbs;
  - the helm steers out of grabs and under the mouth;
  - searchlights reveal weak points in the dark;
  - the bomb bay and drop hatch feed the mouth;
  - hammers chip ice and scales;
  - swords hack a gripping limb;
  - the boiler feeds flamethrowers;
  - the medbay heals;
  - the stoker keeps steam up for the harpoon reel;
  - the hookshot and crew cannon let the daring board its back.
- **Three phases.** For the Kraken: it rises; it grabs; it is hauled half out of the water, exhausted.
- **Several ways to win, at least three per creature:**
  - sever its limbs;
  - overwhelm it;
  - feed the mouth;
  - board it and strike the heart;
  - tow it into rock.

  The health pool is the slow, safe fallback, so beginners always have a way to win.
- **Comeback moments:**
  - a grabbed ship is a GOING DOWN!-style crisis on a timer: the grip rips a section off unless the tentacle is cut;
  - the last blow plays in slow motion.
- **Loot:**
  - salvage and a hull patch;
  - a TROPHY part card at the next dock (Kraken-beak ram prow, Drake-scale plating, Thunderbird feather sail);
  - a Captain's Log line;
  - a Hangar unlock.

## 2. Bestiary: seven creatures, one per sky

Every creature uses the same kit: a body with separately damageable parts, a mouth that opens, and a heart to board for. Each one also leans on its own sky's crew job. The classic ship is about 2700 px long, so a creature spans 5000-8000 px.

### 2.1 Sunken Sea - THE KRAKEN (built first)
- **Body:**
  - a mantle under the waves;
  - a beak/mouth that opens on a roar;
  - two eyes, which only count when lit at dusk;
  - 6 tentacles of 8 rigid segments, each with its own health and severed where hit;
  - a heart, reachable in phase 3.
- **Attacks:**
  - GRAB: a tentacle rises and sways for 1.5 s, then wraps the nearest deck end. That side gets a downward force and torque, the crew slide, and if the keel goes under, the sea flood rules start. After 9 s the grip rips that section off unless it is cut.
  - SLAP: a tentacle whips along the top deck.
  - SPOUT: a drifting waterspout.
  - DIVE: in phase 3, three grips at once drag the ship down.
- **Wins:**
  - (a) SEVER all tentacles with shells, mortar, coil or flame, or with a sword/hammer HACK on the gripping segment.
  - (b) MOUTH: three bombs while the beak is open. Thrown crates and sandbags count as half a bomb.
  - (c) TOW: harpoon it in phase 3 and drag it onto the rock spires, or ram it.
  - (d) BOARD: hookshot onto the surfaced mantle. "BLIND IT" at an eye halves its grabs; "STRIKE THE HEART" wins.
  - (e) The health pool.
- **Systems it uses:**
  - searchlights, mortars, mines in the water;
  - the bilge pump;
  - sandbags thrown off the gripped side, which changes the ship's balance;
  - towing, the ram prow and flame (a burning tentacle lets go);
  - hydrogen bags (a squeezed hydrogen bag is dangerous).
- **Reward:** triple boss salvage, hull repair, and the Kraken Beak ram prow.

### 2.2 Ember Forge - THE CINDER DRAKE (dragon)
- **Body and movement:** it flies in huge swooping passes. Two wings, a neck, a head and a tail, with the heart behind its breast scales.
- **Attacks:**
  - BREATH: the throat glows for 1.6 s, then a flame cone sweeps the decks. Armour doesn't catch fire and hydrogen explodes.
  - SWOOP: a hull bump.
  - PERCH: it lands on the gasbag and claws holes in it.
- **Wins:**
  - shells into the glowing mouth choke the breath;
  - tear a wing and it crashes and crawls, so the bomb bay can reach it;
  - harpoon it into a lava spout;
  - board its neck when it perches;
  - flak on the wings, which finally gives the flak gun a job.

### 2.3 Storm Front - THE THUNDERBIRD
- **Attacks:**
  - LIGHTNING DIVE: the lightning rod grounds it. A manned coil absorbs the bolt and fires it back at triple strength.
  - GUST: twists the ship.
  - PERCH: it sits on the bag, tips the ship and tears at it.
- **Wins:** pluck both wings, coil-bolt its glowing gizzard, mortar it while it is perched, or board it.

### 2.4 Frost Peaks - THE RIME WYRM
- **How it fights:** a burrower that erupts from ice cliffs, with cracks spreading for 2 s first. It coils around the hull and stops the ship.
- **Ice armour:** shells bounce off its segments until hammers chip the ice or flame/steam melts it. Its frost breath ices the guns.
- **Wins:** break the ice and then shell it, bomb its open maw, tow it into the sun, or board its underbelly.

### 2.5 Fungal Depths - THE MYCELIAL MOTHER
- **How it fights:** a giant spore-moth on the cave roof, with tendrils that grow toward the ship. In the pitch dark nothing can be aimed at until a searchlight lights it.
- **Attacks:** tendril grabs from above, spore bursts, and a wing beat that pushes the ship into rock.
- **Wins:** burn the tendrils (flame does triple damage and the fire spreads along them), shell the lit eyes, mortar the cap, cut the grips, or board the cap.

### 2.6 The Aether - THE VOID EEL (joins the Flagship)
- **Body:** a 24-segment body circling the ship. Its lantern lure looks like a gold pickup, a deliberate trick that the lookout warns about.
- **Attacks:** coils with three grips, and SWALLOW: a wide mouth opens ahead.
- **Wins:** sever it at the joints, bomb the mouth, or board it in low gravity.
- **At the Flagship stop:** sink the Flagship, OR kill the eel and the Flagship flees.

### 2.7 Sky Isles - THE ISLAND TITAN (gentle tutorial boss)
- **Body:** a slow stone colossus, only 2 times the ship's size, carrying an island on its back.
- **Attacks:** it throws boulders and grabs the gasbag.
- **Wins:** shell its arms off, bomb its roaring mouth, or land on its island and hack the crystal in its chest.
- **Why it's first in a voyage:** it teaches every creature rule in daylight.

## 3. Architecture

The ship is built from decks and gasbags, and the whole engine knows that shape. So a kraken should not pretend to be a Ship. Instead there is a new **Creature**: rigid segments like a puppet, plugged into the slots the game already has for a big enemy:
- gun targets, radar and camera;
- hookshot anchors and landing surfaces;
- forces and break-off.

### 3.1 The Creature system
- **Where it runs:** a new `public/modules/host/creature.js`, a world-level system next to `squadrons`/`specials`. It is stepped in `stepWorld`, and `state.creature` is listed in `WORLD_SHARED`.
- **Body record:** `{ kind, x, y, vx, vy, f, phase, t, hp, maxHp, parts }`. Each part has a kind (tentacle, wing, neck, head, mouth, eye, heart, mantle), hp, segments `{x,y,ang,len,r}`, a goal, a grip, `lit` and a hit flash.
- **Hit test:** one function, `creature.hitAt(x, y, r)`, uses capsules and returns the part hit. Every weapon asks it.
- **Animation without wobble:** segments are rigid, and each limb is a cheap 2-iteration IK chain chasing a goal point. The goal moves on a **stepped clock**: a new pose every 1/8 s, held, with no sine wobble. A limb pulls back 0.4 s before striking and snaps on contact. Idle breathing is a hold-and-snap.
- **Grips:**
  - Like a one-sided tow (`towing.js`): a spring pulls the ship, clamped to `GRIP.MAX_ACC`, plus torque through `forces.js` (`GAIN.grab`, kept under `FORCES.MAX_DEG`).
  - The tentacle tip is glued to the grip point, so the picture and the physics agree.
  - After `GRIP.TIME` the grip rips that section off via `ship.sim.breakOff({ kind: 'limb' })`.
  - A sword within reach gives "HACK THE TENTACLE!". Shells and flame on the gripping segment also free the ship.
  - COME ABOUT is refused while gripped.
- **Boarding:** the body is a landing surface (`air.addProvider`, as for the rival's decks) and a hookshot anchor. Boarders get creature actions: blind it, hack it, strike the heart.
- **Damage in:** each weapon calls `hitAt`:
  - shells;
  - bombs, which do MOUTH damage in an open mouth;
  - flame, coil and mines;
  - thrown cargo, which counts as half a bomb;
  - rams, through its own bump test;
  - harpoon/tow, through a small creature tow handle (decided in C.2).
- **Aim and radar:** every living part goes into the `aim.js` targets, with open or lit weak points ranked higher. Aim assist, searchlights, radar, the coil and the bots then all see it for free.
- **Data per creature:** `creatures/kraken.js` holds the parts, phases, attacks (each with windup/act/recover and its telegraph), wins and reward. `creature.js` is the generic runner.
- **Pacing:** the creature counts as a boss for tempo and music. No zeppelin boss appears on a creature stop. New code-made sounds: roar, splash, grip, sever, chomp.
- **Voyage:** 1-2 middle stops become **lairs**. They show a creature icon on the route map, are +1 danger, pay double rewards, and never come two in a row. Trophy cards are offered at the shop.
- **Scaling:** part health and attack pace follow crew size and difficulty. Grips at once are 1 under 6 crew, 2 for 6-11 and 3 for 12+.

### 3.2 Camera
- The creature's parts are added to the framing, with a creature zoom-out cap of 2.4 (today 1.8; Versus uses 2.9).
- Zoom is locked while a grip starts.
- If the mouth is off screen, the Versus spyglass porthole becomes a **boss-cam** on the weak point, and edge arrows label the parts off screen.

### 3.3 Art
- **Style:** a new `creatureArt.js` in the storybook gouache style: one ink colour, flat fills, one highlight band, and angular, spiky enemy shapes.
- **Baking:** each segment type is drawn ONCE per zoom level into an offscreen canvas and then blitted, about 54 blits a frame for the Kraken. There are no gradients and no live blend modes.
- **Painted textures:** optional ones for the big static shapes are baked under the ink, like the gunship's textures, and never blurred.
- **Dark skies:** parts stay dim until lit.
- **Severed parts:** they tumble away as debris, and a dead creature sinks or falls in slow motion.

### 3.4 Performance
- **Budget:** under `PERF.BUDGET_MS` 12 at 1080p.
- **Rules:**
  - no `shadowBlur`;
  - no gradients each frame;
  - pose keys at 8 Hz;
  - capsule hit tests;
  - `perfLowFx()` drops the painted textures and the drips.
- **Check:** the gate draws 300 frames on a stub canvas and reports the time.

### 3.5 Bots
- **Gunners:** they get the creature parts automatically and prefer the open mouth.
- **New bot jobs:**
  - hack a grip on their deck;
  - drop a bomb when it will land in the open mouth;
  - man the searchlight in the dark;
  - harpoon it in phase 3;
  - open the drop hatch over the mouth.
- **Helm bot:** it keeps the ship's belly over the mouth during a mouth window, and otherwise stays at range and climbs away from rising tentacles.

### 3.6 PvP twist (later)
**The Beast wildcard:** when the storm wall closes, a creature surfaces in the middle and grabs the nearest ship. Crews can push each other into its reach. Later it guards the King of the Hill ring.

## 4. Roadmap

One monster gets built all the way first: the Kraken. It is proved with bots, then its kit is cloned for the other six.

| # | Task | Size | Main files | Gate |
|---|---|---|---|---|
| C.0 | Skeleton: `creature.js` body, IK and stepped keys; a dev page `creaturetest.html` with a kraken puppet reaching for a point; `config.CREATURES` | S | new files, `config.js` | page loads, 60 fps, no wobble |
| C.1 | Core hooks: world step, `hitAt`, every weapon, aim/radar, camera cap, HP bar with part pips, dark/lit, pacing, music/sfx | M | `simulation.js`, `ships.js`, `aim.js`, `spotter.js`, `camera.js`, `squadrons.js`, `course.js`, `flame.js`, `coil.js`, `minefield.js`, `cargo.js`, `music.js`, `sfx.js`, `render.js` | botsim byte-identical, golden unchanged |
| C.2 | Grips: force/torque/shove, rip via break-off, HACK action and phone arrow, slap, COME ABOUT refusal, boarding surface and hook anchor, harpoon target | M | `creature.js`, `shipSim.js`, `comeAbout.js`, `hookshot.js`, `towing.js`, `jobs.js`, `forces.js` | `--check-forces`; new grip checks |
| C.3 | The Kraken: phases, attacks, telegraphs, five wins, death, reward, trophy, lair stops on the route map. **IN: see "C.3 is in" below** | M | `creatures/kraken.js`, `creatureFight.js`, `voyage.js`, `maps.js`, `simulation.js`, `partsShop.js`, `envStormSea.js` | `--check-creature` |
| C.4 | Kraken art: baked segments, telegraph shapes, grip squash, severed debris, boss-cam, slow-mo finale | M | `creatureArt.js`, `debrisArt.js`, `render.js` | 300-frame draw timed, TV check |
| C.5 | Bots and the gate: creature jobs, helm plan, bombardier mouth drop; `tools/creature-check.mjs`, `--check-creature`, `botsim --creature kraken` | M | `bots.js`, `course.js`, `tools/*` | see below |
| C.6a-f | The other six, one each, Drake first. **C.6a (Drake) IN: see "C.6a is in" below** | S-M each | `creatures/*.js`, `creatureArt.js`, env hooks | each win proven headless |
| C.7 | PvP Beast wildcard + King of the Hill guardian | M | `pvp/match.js`, `creature.js` | mirror match still 35-65% |
| C.8 | Polish: Log lines, Hangar unlocks, play-of-the-mission card, phone buzz, first-time lair hint | S | `render.js`, `voyage.js`, `controller/ui.js` | TV review |

**Order:** C.0 → C.1 → C.2 → (C.3 alongside C.4) → C.5 → C.6a Drake → the rest in pairs → C.7 → C.8.

**C.1 is in** (`creatureSystem.js`; gate `node tools/buildsim.mjs --check-creature`):
- **Dev flag only:** `host.html?creature=kraken` or `botsim --creature kraken` puts a Kraken in every mission; with no flag nothing changes (botsim and golden are byte-identical / inside their bands).
- **Placeholder life:**
  - it rises untouchable for `SPAWN.SURFACE_TIME`, then idles;
  - it holds station `SPAWN.STANDOFF` ahead of the ship (in the Sunken Sea on the sea line, elsewhere `BELOW` the ship and `GROUND_CLEAR` above the first rock);
  - its tentacles reach at the ship (no grips yet);
  - the beak opens on the C.0 puppet's timer;
  - it dies (sinks) when the health pool is empty or all six tentacles are cut.
- **Damage:** every weapon ends in `hurtCreature` (a part, the segment hit, a tentacle at 0 hp is severed there and tumbles as a chunk, the pool takes `HURT.POOL` of the blow). The numbers are `config.CREATURES.HURT`.
- **For C.2:**
  - the creature record is the C.0 body plus `mode` ('surfacing' | 'idle' | 'dying'), `side`, `base`, `ai`, `chunks`, `stats` and a non-enumerable `hooks` (`state`, `puff`, `credit`, `rng`);
  - `think()` in `creatureSystem.js` is the placeholder behaviour: C.2/C.3 replace its reaches with grips;
  - `cr.hooks.rng` is the creature's own seeded stream (never `Math.random`).
- **Shells die in rock:** off the sea a creature in a cave map is partly inside the walls (the dev flag does not choose the map); the real lair stops (C.3) should pick open maps.

**C.2 is in** (`creatureGrip.js` = grabs, slap, the hack; `creatureBoard.js` = boarding and the hook; `creatureTow.js` = the harpoon; numbers in `config.CREATURES.GRIP / SLAP / BOARD / TOW`, `GRIPS_BY_CREW`, `FORCES.GAIN.grab`):
- **GRAB:**
  - A limb rears beside the ship (`WINDUP` 1.1 s + the 0.4 s pull-back), with the TV banner `TENTACLE! FORE MAIN DECK!`, a dashed red ring on the spot and a phone buzz/toast for whoever stands within `WARN_REACH` of it. The spot is the nearest reachable deck end (decks of at least `MIN_DECK` px).
  - It then strikes and the tip is glued to that point of the ship (`moveGrip` with `pose.js toWorld` every step, so the picture and the physics agree). While it holds, a one-sided spring shoves her speed and climb (the `towing.js` way, `BASE_ACC`..`MAX_ACC`, toward the limb's root and down) and twists her at the grip (`applyForce` source `grab`, `GAIN.grab`, so the tilt stays under `FORCES.MAX_DEG`). Crew on the open decks stagger when it seizes (`air.shove`).
  - After `GRIP.TIME` (x difficulty) it rips the section off (`ship.sim.breakOff({ kind: 'limb', cause: 'creature' })`); a ship with nothing to break takes a hull blow (`RIP.HULL`). The ring on the TV is the timer; the green ring inside is the hack progress.
  - Grips at once follow the crew (`GRIPS_BY_CREW`: 1 under 6, 2 for 6-11, 3 for 12+) and come as one burst (`SPREAD` s apart), then a pause of `EVERY` s. A blinded eye halves the rate.
- **GETTING FREE:**
  - HACK: a sword (hammer, slower) at the grip point on its deck gives the Action `HACK THE TENTACLE!` (hold 1.5 s, hammer 2.6 s) or 3 ATTACK blows. Shells and the coil on the limb take it off once they have done `RELEASE_DMG` of its health; flame frees her at once; cutting the limb off frees her.
  - It recoils and rests `COOLDOWN` s.
  - The phone gets a gold job arrow to the spot (`jobs.js`, kind `hack`). Bots: a `hack` job right after fires in the coal (they fetch a sword if they need one), and a bot leaves its station for it (`hackCall`).
  - COME ABOUT is refused while she is gripped (`comeAbout.js`).
- **SLAP:** a limb rears over the top deck (banner and buzz), then whips along it: every crewman there loses `HEARTS` (never a one-shot), is flung off unless he sits at a station (a jump over it clears it), and the hull takes a little.
- **BOARDING:**
  - The mantle's top is a landing strip for people in the air (`air.addProvider`, ids `creature:*`; bots do not land on it). A boarder keeps `player.ship`, gets `player.on = { cr, id, s }`, and walks the mantle's outline (`s`: arc length) carried by its transform every step. JUMP leaps off toward the ship.
  - Actions: `BLIND IT!` at an eye (hold 6 s: that eye is blind for 45 s, each blind eye halves the grab rate) and `STRIKE THE HEART!` with a sword when the heart is exposed (hold 8 s: `HEART_DMG` of its health and 3x that off the pool). `BOARD.HEART_EXPOSED` exposes it for tests; C.3 decides when it really is.
  - If it dives or dies, or he is knocked out, he falls into the airborne / fall system with the parachute button.
  - A hook anywhere on it is an anchor (`hookshot.js` -> `creatureAnchor`); reeled right in to the body you climb aboard.
- **HARPOON:** `towing.fireHarpoon` hooks the nearer of an enemy deck and a creature part (`creatureTow.js`, lines in `cr.harpoons`, drawn on the TV). The ship takes `TOW.SHIP_SHARE` of the pull and is hauled in fast; the creature gets the rest, slowly (`cr.tvx`, `cr.stats.hauled`, at most `CREATURE_MAX` px/s) and stops swimming along beside her while a line holds (`cr.hooked`). A sword cuts the line at the ship's end.
- **SEA ONLY:** the Kraken lives at the water line. `spawn()` does nothing where there is no sea level (`creatureBreach.js seaLevel`: the Sunken Sea's `state.env.seaY`), and `host.html?creature=kraken` / `botsim --creature kraken` fly the Sunken Sea. C.3 lair stops are Sunken Sea stops. `host.html?creature=kraken&heart=1` exposes the heart for STRIKE THE HEART.
- **THE PULL IS DOWN:** each grip pulls mostly DOWN toward the sea (`SIDEWAYS` 0.25), the pulls add up and are capped by `GRIP.MAX_TOTAL`, so three grips drag her down hard but full steam and lift can still fight it. Keel under the sea line: the existing flood rules.
- **THE COIL (art):** while it holds, the outer `GRIP.WRAP.SEGS` segments of the tentacle lie along a helix round the hull (over the gunwale, down the FRONT, under the keel, up the BACK), built every step from ship coordinates through `tilt` and `pose.js` (`creatureGrip.js coilPath`, `creature.js setWrap`). It tightens in stepped keys; segments stay rigid. Segments behind the hull are marked `behind`: `render.js drawCreatureBehind` draws them before the ships (`creatureArt.drawBehind`) and the normal draw after. The tip is glued to a point just over the deck (`g.ex, g.ey`).
- **BREACH (`creatureBreach.js`, `CREATURES.BREACH`):**
  - DIVE (it vanishes), WARN about 2 s (a shadow and ripple rings on the water, the banner "IT'S UNDER US! CLIMB!", a buzz on every phone, the camera keeps the shadow in view), then it launches, smashes the hull and falls back with a splash. It only starts with no grip or slap going; every `EVERY` s (x difficulty).
  - It misses if her keel is at least `REACH` above the water (climb, `breachClimbAlt` tells the helm bots how high) or her middle is more than `HALF_W` from the shadow. A hit: hull damage, a kick up and sideways, one heart for crew within `HURT_R` (knocked out within `CORE_R`), the rest thrown about, a chance by difficulty to tear a section off.
  - While it hangs in the air (`EXPOSE` s) the heart is exposed, the beak open and everything that hits it does `BONUS` x the damage (`cr.breach.exposed`; `vulnerable()` is true only then).
  - `cr.mode` is 'breach' meanwhile; `cr.stats` counts `breaches`, `breachHits`, `breachMiss`, `breachBroke`.
- **Only the main ship is grabbed** for now (the creature system works on `mainShip`); every new function takes a ship handle, so a fleet ship is a later change.
- **For C.3:**
  - `cr.stats` now also counts `grips`, `freed` (by hack / shot / flame / severed / rip / missed / gone), `hacks`, `ripped`, `hulled`, `slaps`, `slapHits`, `blinded`, `struck`, `hauled`.
  - `thinkAttacks` is the whole attack director (grab and slap timers live in `cr.ai`); C.3 phases should scale `GRIP` through it, not around it.
  - A phase's win conditions can read `cr.hooked`, `cr.tvx`, `cr.base.x` (tow it onto rocks) and `cr.hp` after `STRIKE`.

**C.3 is in** (the fight as a real part of a voyage; `creatureFight.js` = phases, the beak's windows, the tow onto rock, the bots' dev flag; `creatures/kraken.js` = the phase names and banners; `maps.js buildLairMap`; numbers in `config.CREATURES.PHASE / MOUTH / DIVE / TOW_ROCK / WIN_TEXT / FINALE / POWER / REWARD / LAIR`):
- **PHASES** (`cr.phase` 1..3). Phase 2 starts below `PHASE.TWO.HP` (66%) of the pool OR with 2 tentacles cut, phase 3 below 33% OR with 4 cut. Each change is a TV banner ("IT GRABS!", "IT'S EXHAUSTED - STRIKE THE HEART!"), a roar, a phone buzz and a BREATHER (3.5 s in which the attack timers stand still: `cr.ai.breather`).
  - 1 "IT RISES": slaps and single grabs, no lunge. 2 "IT GRABS": grabs by crew size (`GRIPS_BY_CREW`) and the lunge. 3 "EXHAUSTED": it surfaces 420 px higher, the heart is exposed (stays exposed through any lunge), the harpoon can tow it, and it DIVES.
  - DIVE: `min(3, crew cap + 1)` grips seize 0.9 s apart, each pulls x1.4 and together up to `MAX_TOTAL x 1.8`, `TIME x 0.9`; every 40 s. The health bar shows the phase name and the notches where phases 2 and 3 begin.
- **THE BEAK** (`cr.mouthWin`): on a roar the beak opens for 3.4 s (4.2 in phase 3), every 22 / 18 / 12 s, with the banner "MOUTH OPEN - DROP BOMBS! (n/3)". The body swims under her bomb bay (`MOUTH.LURE_SPEED`), and the beak GAPES UP THROUGH THE MANTLE: a bomb or crate anywhere in the FUNNEL (330 px each side of the beak, 1900 px up) falls in (`creatureBomb` / `creatureCargo`; the bomb-bay aiming ring lands there too). A bomb is 1, a crate 0.5, 3 win; it gulps after a bomb (beak shut 2.4 s), so about one a window. `cr.fed`.
- **THE WINS**, all recorded in `cr.stats.win` ('sever' | 'mouth' | 'tow' | 'board' | 'hp'), final banner `config.CREATURES.WIN_TEXT` ("SEVERED!", "FED IT BOMBS!", "DRAGGED ONTO THE ROCKS!", "HEART STRUCK!", "SUNK IT!") held for 6 s (the pacing director's ALL CLEAR waits until it has sunk), `state.bossDownLap` set (a lair, like the Flagship, is done when the boss is), the last blow in slow motion (`state.slow` 0.4 for 1.2 s, `main.js` reads it: the same hook as `match.slow`).
  - TOW: in phase 3, a harpoon line holds it and its body touches rock at the water line: the pool loses `TOW_ROCK.RATE` hp per px/s of (haul speed + `GRIND` 50) (`creatureFight.js stepRock`); in phase 3 the body is hauled `SHARE` 0.55 of the pull, at most 230 px/s. A tow in phase 1 or 2 does nothing to it. The spire under the lair's middle (where she hovers) is the target.
  - BOARD: `STRIKE THE HEART` (sword, 8 s) takes `HEART_DMG` off the heart and 3x that off the pool; the blow that empties the heart or the pool wins. HP: the pool, `PART_HP_MUL` pool 2.2 and tentacles 1.8, tentacle blows take only 0.25 of themselves off the pool, so cutting it up is the quicker road and the pool is the slow safe fallback. Part health and the pool also follow the ship (`CREATURES.POWER`: the Sparrow meets about half).
- **REWARD** (`simulation.js salvageWatch`): salvage x3 (`REWARD_MUL`), +35 hull, +30 gas in every bag, and `run.trophy = 'krakenBeak'`: the next dock offers the free TROPHY card "Kraken Beak" (`partsShop.js` CATALOGUE `krakenBeak`, never in the random pool, `simulation.js trophyCard`) until the crew takes it. It IS a `ramProw` with `art: 'kraken'` (`shipBuild.js` copies the key to `layout.ram.art`, `weaponsArt.js drawRam` draws bone and purple instead of iron): no new rules. A ship that has an iron prow gets the beak in its place.
- **LAIRS** (`voyage.js markLairs`, its own random stream, so a seeded route is exactly what it was but for these stops): 1 middle stop (2 when the voyage has 7+ columns) that is a Sunken Sea stop, never the first stop flown or the Flagship, never in neighbouring columns; `kind: 'lair'`, danger +1, reward x2. The route map (`render.js drawRouteMap`) shows the octopus icon, a dashed purple ring and "LAIR"; the phone vote says "LAIR: Kraken lair - skulls - reward". Flying one: `course.startMission` takes `stop.lair` and builds `buildLairMap` (open sky over a sea 2000 px under the launch, a flat sea floor, 3 rock spires, NO outposts, no waterspouts or survivors, `map.lair`); the route runs 16000 px level to the lair's middle; the Kraken rises at the zeppelin's slot (`progress > WAVES.BOSS_AT` and `tempo.bossOk`, or at 90% anyway, `creatureSystem.js update`); no zeppelin on a lair stop (`squadrons.js`); the stop is done once the creature has sunk (`course.js mapProgress`, "SLAY THE KRAKEN FIRST!" at the middle meanwhile). Dev: `host.html?lair=1`, `botsim --lair 1` make every stop a lair.
- **BOTS**: the bomb bay is manned from 5 s before a window (a job and a station reach) and stocked to `MOUTH.FED + 1`; `bombInMouth(state)` (the bomb's own flight path through the funnel) says when to hold Action. In phase 3 a gun-station bot with a HARPOON gun fires it at the body (`aim.js towTarget`). `CREATURE_FORCE_WIN=sever|mouth|tow|board|hp` (= `config.CREATURES.FORCE_WIN`): the bots fire only at what that win needs (the escort and the coil too), only that win can end the fight, and for `board` one bot with a sword is put on the mantle in phase 3 and holds Action at the heart (people use the hookshot or the crew cannon).
- **botsim and golden**: `botsim.mjs` zeroes the lair count unless `--lair` / `WITH_LAIRS=1` is given, so its seeded baselines (`--check-botsim`, the golden's botsim rows, the frames) stay byte-identical; `voyagesim.mjs` flies the lairs (`NO_LAIRS=1` switches them off to compare). Only the golden's two voyagesim rows were re-snapshotted (normal 8/10 -> 9/10 victories, median 37.7 -> 33.6 min; easy 7/10 -> 8/10, 33.3 -> 30.9 min). `voyagesim` now prints how many lairs were met and won. Voyage mode, Normal, seeds 1-40: classic 9/40 -> 13/40 victories, Sparrow 10/40 -> 11/40; 61 lairs on each set of routes: the classic crews met 15 and won 15 (all by the beak), the Sparrow crews met 16 and won 15 (14 by the pool, 1 by the beak: she has no bomb bay).
- **For C.5/C.4**: art: the funnel is invisible (the beak should gape upward through the mantle while `cr.mouthWin` runs; `mouth.open` shows the jaw), phase 3 raises the body by `cr.phaseDy` (negative), dive grips carry `g.dive`, the death is `cr.mode === 'dying'` (`state.slow`), the banner is `state.ev.warnText`. Bots: the helm does not steer the creature onto a spire (a human crew has to); the harpoon bot fires once and the helm bot stays near the lair's middle, which is where the spire is.

**C.6a is in** (THE CINDER DRAKE, the Ember Forge dragon, about 3x ship size; `creatures/drake.js` = body data, poses and phase names; `creatureDrake.js` = the whole fight (arrive, orbit, breath, swoop, perch, crash, crawl); `creatureBreath.js` = the flame cone on the fire model; numbers in `config.CREATURES.DRAKE`, `LAIR.BY_ENV`, `FORCES.GAIN.perch`):
- **BODY:** 2 wings (`wingN`/`wingF`, 5 membrane segments each, hp each), a 6-segment neck, head, mouth, tail, torso, and a hidden heart behind scales. The Kraken's `creature.js` got generic, Kraken-inert additions: `body.rot` (pitch), driven limbs (`pd.drive`, `p.rel`, set only on key frames), `pd.attach` (head rides the neck, mouth rides the head), `bodyVec`, `snapPose`.
- **MOVES:** 'arrive' then 'fly' (orbit loop with acts) and 'perch'; torn wing or below 60% -> 'crash' onto the rock shelf -> 'crawl'; 'dying'. Phases: 1 flying, 2 crawling, 3 desperate below 30% with the heart exposed while it rears (`drakePhaseName`).
- **ATTACKS** (each: banner, phone buzz for crew in the zone, sound):
  - BREATH: throat glows 1.6 s, then a cone of flame (patterns level / high / up) that ignites decks, hurts crew, burns hull (armour resists), scorches gas bags (hydrogen explodes); a budget caps fires per breath.
  - SWOOP: wind, lock, dive, escape; a hull bump if she is still under it.
  - PERCH: the drake lands on the gasbag as a live load (`ship.ctx.perch` -> `balance.js` loads, `applyForce` source 'perch', tilt within `FORCES.MAX_DEG`), claws holes (capped by `PERCH.CLAWS`), lashes with its tail; driven off by swords, shots, flame, a hard helm shake, or time.
  - CRAWL: lunge at the hull, GAPE (mouth open, bombs), REAR (heart exposed in phase 3), cough.
- **WINS** (`cr.stats.win`): 'choke' (feed it enough in the open mouth when the throat glows), 'bombs' (crawling mouth lured over the bomb bay), 'tow' (harpoon into a lava spout), 'board' (board the neck while perched, hack the scales, strike the heart), 'flak' (flak on the wings, pool kill with at least half from flak), 'hp'.
- **LAIR:** `voyage.js markLairs` picks the creature by stop environment (`LAIR.BY_ENV`: sea -> Kraken, ember -> Drake); `maps.js buildDrakeLairMap` = lava below `LAIR.LAVA_BELOW`, a rock shelf and lava spouts. Dev flags: `host.html?creature=drake`, `botsim --creature drake`.
- **REWARD:** triple salvage and the trophy "Drake-scale plating" (an armour part with `art:'drake'`, mass x `TROPHY.MASS_MUL`).
- **BOTS** (`bots.js`): gunners with led aim, fire crew, a drive-off-perch job (helm shake), the bomb bay over a crawling mouth, flak priority on wings, helm steering over a lava spout when hooked.
- **ART:** 2D in `creatureArt.js` (`drawDrake`); `view3d/creature.js` has a `drake` kind (tubes only) with `view3d/creatureDrake.js`. A proper 3D Drake model (wing membranes, scales, glowing throat) is still to do.
- **GATE:** `tools/creature-check.mjs` section D0-D11. Forced wins with 8 bots on Normal (seconds, seeds 1-3): choke 78/74/99, bombs 188/190/256, tow 184/163/165, board 29, flak 245/224/210, hp 123/175/241; Easy: 4 bots win (hp) in about 200 s, 16 bots in about 115 s. Voyagesim (24 seeds, Normal) classic 14/24 (was 16/24), Sparrow 7/24 (was 6/24); the golden bands still hold.


**The gate `node tools/buildsim.mjs --check-creature`:**
- (a) Parts build, hit capsules work, the IK reaches, and keys hold for 1/8 s.
- (b) Every weapon damages a part. A bomb in the open mouth does MOUTH damage; in the closed mouth it does nothing.
- (c) Grips:
  - the tilt stays within `FORCES.MAX_DEG`;
  - flooding starts when the ship is pulled under;
  - the rip happens on time;
  - a sword frees the ship;
  - COME ABOUT is refused.
- (d) **Each win is proven by bots**, forced one at a time (`CREATURE_FORCE_WIN=sever|mouth|tow|board|hp`), within 6 minutes with 8 bots on Normal, then once unforced.
- (e) A 4-bot and a 16-bot crew both win on Easy within 10 minutes.
- (f) Stability and baselines:
  - 0 errors and no NaN in a 3-minute fight;
  - botsim and golden unchanged, since no lair is in the fixtures;
  - the stub-canvas draw is timed;
  - the phone payload carries the job arrow.

Only the voyagesim goldens get re-snapshotted, after C.5.

## 5. Beyond bosses: the top five next-level priorities

1. **Tutorial and the first voyage.** A 90-second guided first mission, plus a "what do I do?" button on the phone. Nobody should sit lost.
2. **Rival captain, Hangar and Captain's Log unlocks.** Named captains who come back, and cosmetic unlocks: the cheapest "come back next week" pull.
3. **Mission variety:**
   - stop events: derelicts, merchants, distress calls, a heist;
   - a modifier deck;
   - a mid-mission twist.
4. **Real-hardware performance pass** on the owner's actual TV and laptop, with 2-3 ships and a creature, plus a per-machine Detail default.
5. **Audio and juice:**
   - distinct telegraph sounds;
   - hit-stop and a slow-motion finale in co-op;
   - a play-of-the-mission card.

   The creatures also give the mine layer and flak gun, today's trap parts, a real job.

## 6. Risks and how they're handled
- **Performance:** baked segments, 8 Hz keys, capsule hits, the low-detail mode, and timed draws in the gate.
- **TV readability when zoomed out:** big telegraph shapes, part pips, banners, the boss-cam, zoom locked during grips, and a sofa review per creature.
- **Physics fighting itself:** grips are clamped like tows, small crews get one grip, the gate checks the tilt, and Going Down protection is honoured.
- **Baselines changing:** creatures spawn only on lair stops and use their own random seed, and botsim/golden stay byte-identical.
- **Unwinnable fights:** the health pool always works, every win is proven by bots, and every grip has three escapes plus a timer.
- **Scope:** one generic runner and one data file per creature, with the Kraken shipped alone first.
- **Wobble/art:** rigid segments, stepped keys, and a dev-page review before anything goes in the game.
- **Party complexity:** every rule fits one phone line, with an arrow pointing at it.
- **Voyage balance:** voyagesim bands re-recorded after C.5. Lair rewards are tuned so skipping lairs is never strictly better.
