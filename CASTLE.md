# Castle level v2 and the Away Team

Fable's study, 2026-10-11. The owner asked for "more flair, towers, armies on the ground, archers firing from the tower" and "crew members depart the ship and do objectives on the ground". **Status: plan approved by the owner. R2 (the castle art) is built, see the line below; the other packages are not started.**

**R2 status: BUILT (2026-10-12, branch worktree-agent-a2c7bad933db2a0f0, not merged).** The three ring castles are drawn as in this plan: a floating island with a stepped cliff and two stepped waterfalls (8 fps frames); a curtain wall with battlements, arrow slits and a walkway joining the gatehouses; a gatehouse at every face (drum towers with slate or tile roofs and machicolations, a gate arch, a PORTCULLIS that rises in the same four steps as the old shutter, a DRAWBRIDGE that drops on the first shutter window, banners in three poses phased per face, braziers with real fire); the inner ward (fortress 4 towers, citadel 3, tower none) in the camera frame, turned by -RB.thc so the towers slide past each other, with a rope bridge to each gatehouse; a slim keep (0.09 R, set back 0.25 R) with a separate CROWN group (the lantern, the gold crown, the great banner) ready for D3; the specials dressed (a hangar arch, a ballista tower, a trebuchet frame, a covered gallery hoarding on the sim's exact ledge); fictional Ember Pact heraldry only; three palettes in config.RING3D.ART (tower limestone, fortress granite and oxblood, citadel aether stone, gold and glowing shards). The castle adds 16 to 17 draw calls and 22k to 52k triangles (budget 20 / 60k); the crown stays under NDC y 0.85; FOG 0.75; ZOOM_MUL is wired in camera.js but left at 1 because the globally zoomed-out camera already fits it. No simulation file touched. Notes, files, numbers and limits: 3D.md section 29; look at it with node tools/castle-shots.mjs --shots DIR --extra.

## In plain words
**Today's problem:** the castle is one fat grey chimney right behind the ship: a lighthouse, not a fortress. The faces are plain boxes.

**The fix:** a floating island the size of a town.
- Cliffs and two waterfalls falling into the clouds.
- A curtain wall joining the gatehouses (the faces you fight).
- An inner ward of 3-4 towers of different heights, joined by rope bridges, with banners and braziers. The towers slide past each other as you circle, which gives real depth.
- A slim keep, set back, topped by the CROWN that falls when you win.

**The three castles:**
| Castle | Stop | What it is |
|---|---|---|
| THE TOWER | 3 | a lone tower with a wooden hoarding, on a small sky-island |
| THE FORTRESS | 6 | four gatehouses, walls, the ward and the keep |
| THE CITADEL | the finale | Aether shards, a cathedral spire, and the Flagship moored above |

**Defenders that actually fight:**
- **Archers:** a horn and a flag, then an amber arc, then a volley of 24-32 arrows that pepper the hull and bag. Each arrow is weak, and fire arrows can light a deck.
  - Counters: fly higher (arrows run out of climb), shoot or bomb the post, armour plate, the deflector, or a searchlight to dazzle them.
- **Ballista:** a pale aim-line for 1.5 s, then a heavy bolt that bites a hull section or tears the bag. Dodge it.
- **Manned cannon:** bomb the gun crew and that cannon fires at half speed.
- **Armies:**
  - squads with banner poles, on the plazas;
  - they cheer when you're hit, flee when their gate falls, and wave white flags at the end;
  - hover low to bomb them, and they throw grapples and climb aboard.
- **Catapults:** flaming stones that set fires where they land.
- **The boom chain:** a glowing chain across your path. Dive under it, shoot it until it snaps, or get dragged until it breaks.

**Big moments:**
- the portcullis rises and the drawbridge drops when a gate opens;
- a breached gatehouse breaks into stone chunks that tumble down the cliff;
- the crown breaks off and falls in slow motion while the garrison waves white flags.

**The Away Team:**
- **Getting down:** parachute, hookshot to the rock, the crew cannon, or a new ROPE LADDER lowered while the ship hovers low.
- **On the ground:** walk the plazas and walls, and climb the wall ladders.
- **Objectives:**
  - crank the gate winch: the gate stays open twice as long and that face's archers are silenced;
  - plant a charge at a tower's base;
  - sabotage a ballista;
  - light a beacon: the revolving guns pause and a supply balloon comes;
  - free prisoners;
  - steal the great banner (that face's soldiers flee, and you earn a trophy card) or a treasure chest.
- **Getting back:** climb the ladder while the helm hovers over you, hookshot up to the hull, or fire a flare that calls the ship.
- **Left behind:** a 40-second "STRANDED" warning. If the ship still leaves, he walks home and rejoins at the next dock, costing a little salvage. Nobody dies of it.
- **Rules:**
  - every castle can still be won from the air;
  - objectives appear only with 3 or more players;
  - the crew left aboard defend the ship meanwhile (the party split).

## Packages (one builder each)
| # | Package | Side | Size |
|---|---|---|---|
| R2 | Castle art v2: the island, cliffs, waterfalls, curtain wall, gatehouses with portcullis and drawbridge, the turning ward, the slim keep and crown, banners, braziers, three palettes; zoom and fog tweaks; ≤ 20 draw calls | view | M |
| D1 | Garrison sim (`garrison.js`): archer volleys, fire arrows, ballista, manned guns, squads (muster/cheer/flee/surrender), grapples from below, catapult stones, the boom chain; the 2D fallback; a fairness check (garrison damage ≤ 60% of the guns') | sim | M |
| A0 | Ground core (`ground.js`): walkable ground surfaces from the map, plazas and walls, stairs, the rope ladder, hookshot-to-rock landing, the flare, the leash and stranded rules, away/pickup jobs, edge portholes for the away team, helm hover, an away bot | sim | M |
| D2 | Garrison view: instanced soldiers in 4 poses, arrows, telegraph arcs, the ballista line, white flags, castle cannon, grapple lines, night glow | view | M |
| D3 | Set pieces: the tower collapse (Rapier chunks), the crown fall with its cinematic, the drawbridge, flaming stones, the chain's glow | view | S/M |
| A1 | Castle objectives: winch, charge, sabotage, beacon, steal the banner, soldiers against a crewman | sim | S/M |
| A2 | Treasure and outposts on foot (with LOOP G3: chests, rescue, HEIST) | sim | S/M |
| A3 | Away-team view: ladder, flare, "AWAY TEAM" labels, prisoners, carried banner and chest | view | S |
| A4 | Ground sword fights (later) | sim | M |

**Pairs that can run together:** R2 with D1; A0 with D2; D3 with A1; A2 with A3.

**In the LOOP order:**
- A0 with the treasure package;
- R2 and D1 with frames (G4), then A1;
- D2, D3, A2 and A3 after that;
- the balance pass (G7) also tunes the garrison and away-team numbers.

**Switches:** `GARRISON.ENABLED` and `AWAY.ENABLED` turned off give exactly today's game.

**D1 status: DONE (2026-10-12, branch worktree-agent-a65cd974baac7679c).**
- **What exists (sim + the 2D fallback; the 3D look is D2):** `host/garrison.js` (new, built by `ring.js` with the ring), `config.GARRISON` (every number; `ENABLED: false` = byte-identical R0 ring, checked on all three variants), `maps.js buildRingMap` (per face: `walk`, `posts` (2 archers, 600 px up the wall), `plazas`; `map.ring.chains`; the fortress's third face is a ballista in place of the flak battery), `ring.js` (hooks: begin / blast / breach / crown, the catapult's stone flags, grapple zips), `shipSim.js impactBody` (kinds `arrow` / `bolt` / `stone` / `chain`, plate-immune arrows, `fire`), `simulation.js` (the bullet step passes `kind` and `fire`; a tool hook `state.onBulletHit`), `course.js` (`t.slow` on a gun's cool-down; `pilotPlan` honours a chain), `aim.js` (posts are targets, `dazzled` by a searchlight), `bots.js` (the helm dives under a chain; gas floor bypassed for it), `raiders.js dropSquad(x, y, only)`, `escort.js` (an arrow hurts a patrol plane by its own 0.12), `ringArt.js` + `render.js` (posts, amber arcs, the flag and horn rings, squads with banners and white flags, the ballista and its line, the chain, grapple ropes, arrows and bolts, dial chevrons and chain ticks), `logWriter.js` / `moments.js` / `config.LOG` (a `ring-squad` Book moment).
- **Behaviour:**
  - ARCHERS: a horn and a flag, then a 1.2 s amber arc, then 24-32 lobbed arrows (0.12 power, 45% aimed to miss; fire arrows on the citadel and in Ember). One telegraph at a time, castle-wide. Plate is immune, the Deflector stops them, a post in a searchlight beam misses 90%, an arrow cannot climb more than 800 px above its post (fly high), 6 plain shells or a bomb in flight wreck a post, a breach silences the face. Hits leave `hitLog` marks (kind `arrow`).
  - BALLISTA: a 1.5 s lock with an aim-line (`sp.lock`, frozen for the last 0.4 s), then a straight bolt (power 2.3) that bites a structure segment and makes a double gas hole; the helm's jink raises the miss.
  - SQUADS: a crew of 3 on every face gun (a dead crew slows its gun x2 via `t.slow`), squads of 7 on the plazas (muster / cheer after a hit on the ship / man / flee on a breach / surrender with a white flag on the crown / dead). A bomb kills a squad (+1 kill, a Book moment), a shell takes 2 men. GRAPPLES: the keel within 250 px of a plaza squad for 1.5 s (swing = the tell, then a ring zip, one grunt aboard).
  - CATAPULT: the mortar's shells are stones; on the citadel and in Ember they burn (a flame where they land; a burning hit lights a deck by `igniteChance`).
  - BOOM CHAIN (fortress 2, citadel 1): hangs from the top to 2800 px over the platforms between the gates. A ship with any part in it is snagged (drag, pulled back, a bag tick each second); it snaps after 6 s of strain, to 6 shell-equivalents of fire, or a bomb (3); under it passes. The lookout calls it; the autopilot and the helm bots dive under it. The sky round it is cleared of spire tops so there is room to dive.
- **Fairness (a 60% rule):** on paper, per face (guns 0.31 power/s): archers 0.06/s + ballista 0.04/s = tower 18%, fortress 32%, citadel 18%. In 8-bot play (power that LANDED): garrison 13% of the guns' over the gate's runs; per variant over 160 runs each, fortress 15% (192 / 1295) and citadel 7% (276 / 4236).
- **Bot win rates** (`botsim --map ring --difficulty normal`, 8 min, 160 seeds): tower 100% (40/40) both; fortress R0 93.8% (150/160) -> 89.4% (143/160); citadel R0 43.1% (69/160) -> 42.5% (68/160). `--check-botsim` is byte-identical; `GARRISON.ENABLED=false` reproduces R0's `botsim --map ring` output exactly (tower / fortress / citadel, 4 min, seed 7).
- **What the numbers cost, for G7:** the gate pulled the garrison's pace down until the bots stayed within 5 points: a post's first volley comes 12-45 s into being in range and then every 55-75 s, the ballista 10-30 s then 45 s, a grapple 120 s apart per squad. Humans, who fight a gate for longer, will meet more of it. The grapple range is 250 px, not CASTLE.md's 650: at R0's own stations the keel is already 400-770 px over the plazas, so 650 fired a grapple at every normal hover. Bots do not dodge a grapple (`GRAPPLE.BOT_DODGE: 0`: climbing away cost them more than the grapple did) and their gunners rank a post after the shutter (they chip the keep first).
- **Gates and tools:** `buildsim --check-ring` (`tools/ring-check.mjs`, now with (j) archers, (k) ballista, (l) manned guns and squads, (m) grapples, (n) catapult and chain, (o) fairness on paper and in play; its (g) wants a face to fall in 2 of 3 bot runs, not all 3, now the castle shoots back); `botsim --map ring` prints a `garrison` line per ring (volleys, arrows, bolts, posts, squads, grapples, chain, power landed by the guns and by the garrison); `--check-structure`, `--check-curriculum`, `--check-log`, `--lint`, `--check-escort-crash`, `--check-ring3d` all pass. Screenshots of the 2D fallback: `3d-screenshots/garrison_*.png`.
- **For D2 (the view):** read `course.ring.faces[i]`: `posts[]` (`x, y, mode` idle / tell / loose, `telegraph` s left, `aim` {x, y}, `hp`, `dead`, `lit`), `squads[]` (`kind` plaza / gun, `x, y, n, state`, `swing` while a grapple is swung, `grapT`), `flag` and `horn` (seconds left), `special.lock` ({ x0, y0, x1, y1, t, max } the ballista's line), `course.ring.gar.chains[]` (`x, yTop, yLow, hp, broken, snagging`), `course.ring.zips[]` (`grapple: true` ones go from a plaza to the keel). Arrows and bolts are `state.bullets` entries with `arrow: true` / `bolt: true` (`burn` on a fire arrow), a stone has `stone: true`.
- **Not done:** nothing is drawn in 3D (arrows come out as the generic tracer); the garrison never targets a second ship's gasbag specifically (arrows aim at the nearest ship's hull and bag); the crowns' white flags and the squads are 2D only.

**A0 status: BUILT (2026-10-12, branch worktree-agent-a5b5759038aaa542d, not merged; the owner un-paused the Away Team: "build the castle away team next").**
- **What exists (sim, the 2D fallback and a HUD layer over the 3D view; no 3D models, that is A3):** `host/ground.js` (new), `config.AWAY` (every number; `ENABLED: false` = the old game, `NO_AWAY=1` in a tool; `BOT_TRIPS` only with `AWAY_BOT_TRIPS=1`), `host/groundArt.js` (new, the drawing), `shipSim.js` (a crewman with `player.on.away` is stepped by ground.js; the Action at the rope hatch; the phone's `ui.away`), `airborne.js` (`ground:` surfaces widen the fall limits like a gallery's), `hookshot.js` (reeled in to a rock face with open air above it = stand on top of it, `HOOKSHOT.ROCK_CLIMB`), `simulation.js` / `course.js` (the world's ground, the stop held for a stranded man, the dock bringing walkers home), `bots.js` (the bot's trip; the bot helm flies to a flare), `jobs.js` (the helm man's PICK UP job), `portholes.js` (an away man is a friend in an edge window), `render.js` (the AWAY TEAM label, walkways and wall ladders, the rope ladder, the flare and the pickup ring), `controller/ui.js` + `help.js` (ground hints, icons), `creatureSystem.js` (a creature reset does not touch the away team), `ships.js` (`groundSys`, `away` are shared world keys), `crewArt.js` / `characterArt.js` (a man standing on the ground does not flail).
- **What a player can do (only with 3 or more crew, people and bots counted; open-sky maps with ground: ring, outposts; not a cave, a lair or Versus):**
  - GET DOWN: the bomb bay's JUMP (parachute), a hookshot swing, the crew cannon, being blown off: the rock under a flyer and the castle walkways are landing surfaces for people (bots only on a trip); with the ground within `LAND_RANGE` Action opens the parachute. Or the ROPE LADDER: an action at the hatch on the lowest deck (the widest of the lowest platforms, away from the bay doors): "LOWER THE ROPE LADDER" while the hatch is within `LADDER.REACH` 820 px of the ground ("fly lower (N px)" if not); it hangs to 45 px over the ground (most 900 px), is drawn up 10 s after the last man leaves it. Stick down to climb down, off the foot onto the ground.
  - ON THE GROUND: walk at 230 px/s over plazas, platforms, hills and islands (a step up or down of one cell is a slope; a rock face stops him; an edge holds him 0.7 s and then he steps off: parachute button, else the old fall back aboard). On a ring map a CURTAIN-WALL WALKWAY on every face (`face.walk`) with a wall ladder at each end: stick UP at the foot, DOWN at the top, JUMP leaps off the wall.
  - GET BACK: stand under the rope's foot and push UP (climb to the hatch: aboard on the lowest deck); hook the hull (the hookshot works from the ground; once it catches he is a swinger again and the old reel-to-the-deck-edge rule takes him); or FIRE FLARE (Action, 18 s cool-down, lit 55 s): the TV banner ("FLARE! PICK UP MIA - HOVER LOW OVER HIM", the helm's phone line through the arbiter, kind `away` priority 6), a red flare and a gold ring where the ship's hatch should hover, the helm man's phone "PICK UP MIA - FLY TO THE FLARE" (job kind `pickup`, an arrow, `down` once near), the bot helm flies over him and hovers (`ground.helmCall`), and the rope ladder drops by itself when the ship is within 700 px and low enough.
  - LEFT BEHIND: the ship further than `STRAND.LEASH` 2800 px, or the stop ending (the scorecard WAITS: `ground.holdStop` hooks `onMarker`), or too few crew left: "STRANDED! MIA - 40 s", a second warning at 10 s, a flare starts the clock again; at 40 s he walks home (`on.mode: 'home'`, off the map, nobody can touch him) and is aboard again at the next dock (`startDock`) for `HOME.COST` 12 salvage; a new map, a limp home or a new game bring everybody back for nothing; a man who gets up the rope in time lets the scorecard go on at once. Nobody dies of it; bots never strand (recalled the moment the stop ends or the ship is far).
  - THE PHONE: station "AWAY TEAM", the big button FIRE FLARE / "FLARE READY IN 12s" / CLIMB, a hint line (FIRE FLARE, CLIMB: push the stick UP at the wall ladder, the rope), STRANDED with a countdown in red; the ? card says the same.
  - THE TV: "AWAY TEAM" plate over a man on the ground (2D and 3D), edge portholes (friendly green) for a man off screen, the rope ladder, flares and the pickup ring (2D in the world, 3D as a HUD layer through the camera), the wall ladders and walkways (2D; in 3D the ladders only while somebody is down there, the castle art has the walkways).
- **The bot trip (tools; `AWAY_BOT_TRIPS=1` or `config.AWAY.BOT_TRIPS`):** one idle bot walks to the hatch when the rope can reach a plaza, lowers the ladder, climbs down, walks to the plaza's middle, looks round 6 s, fires a flare, walks back under the rope and climbs it; one trip per 45 s; after 40 s with no way home he is put back aboard.
- **Gates:** `buildsim --check-away` (`tools/away-check.mjs`; 67 checks: the ground built, <3 crew, parachute and hookshot landings, walking, the edge, the wall ladder, the rope ladder both ways, the flare, the helm job and phone line, the bot helm, STRANDED, walk home, the dock's salvage, the held scorecard, the porthole, two ships, a forced bot trip and 8-bot runs on three variants with 0 errors), `tools/away-shots.mjs` (a real Chrome, 2D and 3D, shots `../3d-screenshots/away_*.png`: plaza with the label, the rope ladder, the flare and pickup ring, the edge porthole, STRANDED, the phone on the ground and stranded). `NO_AWAY=1` is pinned next to `NO_STEAMFIX` in every baseline gate: `--check-botsim`, `--check-golden`, `--check-frames` are byte-identical; with AWAY ON and no trips the `botsim --map ring` output of tower, fortress and citadel (4 min, seed 7) is identical to the one with it off, so the win rates cannot have moved. `botsim` prints an `away` line when anything happened.
- **Not done, for A1 / A3:** nothing on the ground has an objective yet (A1); no 3D models for the ladder, the flare or a man on the wall (A3: the HUD layer stands in); a man hurt by the garrison (soldiers against a crewman, A1); the walkway's height is the sim's `face.walk.y` (surfY - 600), the 3D castle's wall top is close to it but not tied to it; a hard fall onto the ground hurts (a wall-top jump without the parachute is a big hit) and knocks him out for the usual time; `FUN.md` still says the Away Team is paused (the lead's call).

## Risks
| Risk | How it's handled |
|---|---|
| Clutter | squads read as blocks with banners; the core stays the brightest thing on a face; one telegraph at a time |
| Performance | merged and instanced: soldiers take 8 draw calls however many there are; caps per tier |
| Chip damage from arrows | weak arrows, plate immune, 45% miss, a fairness check, existing counters |
| Wobble | held poses at 8 fps; banners in 3 poses; stepped waterfalls; the crown falls on sim time |
| Stranded frustration | flare, warning, a soft return; bots never strand |
| Too much for 2 players | objectives only with 3 or more players |
