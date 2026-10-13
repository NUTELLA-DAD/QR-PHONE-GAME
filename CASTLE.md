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

**D2 status: BUILT (2026-10-12, view only, not merged).** The garrison has its 3D look (`view3d/garrison3d.js` + `garrisonKit.js`, numbers in `config.RING3D.GAR`): instanced soldiers in five held poses (stand, aim, cheer, run, give up with a white flag; 5 draw calls however many; capped 28 / 64 / 110 by tier), plaza squads with Ember Pact standards, archers on their posts, gun crews (a dead crew is an empty gun), instanced arrows and bolts (fire arrows glow, bolts are heavy; no more generic tracer), the amber telegraph arc (one at a time) with a landing ring, a "!" and the horn, the ballista on a bastion with its bow drawing in four steps and its aim-line freezing red for the last 0.4 s, the boom chain (links, a glow column, red when snagged, snapping into a hanging top half and a falling log), grapple ropes with a climber, white flags on every man, standard and tower when the crown falls, and a halo from braziers and fire arrows at night. The garrison adds 6 to 10 draw calls and 19k to 64k triangles; the castle is unchanged (16-17 calls). `GARRISON.ENABLED` off draws nothing; no sim file touched (`--check-botsim` byte-identical). Notes: 3D.md section 31; look at it with `node tools/castle-shots.mjs --garrison --shots DIR [--close]`; screenshots in `3d-screenshots/garrison3d_*.png`. For D3: the chain's snap is seen by the view (it compares with what it drew) and the log falls on stepped keys; stones are still the generic ball.

## Risks
| Risk | How it's handled |
|---|---|
| Clutter | squads read as blocks with banners; the core stays the brightest thing on a face; one telegraph at a time |
| Performance | merged and instanced: soldiers take 8 draw calls however many there are; caps per tier |
| Chip damage from arrows | weak arrows, plate immune, 45% miss, a fairness check, existing counters |
| Wobble | held poses at 8 fps; banners in 3 poses; stepped waterfalls; the crown falls on sim time |
| Stranded frustration | flare, warning, a soft return; bots never strand |
| Too much for 2 players | objectives only with 3 or more players |
