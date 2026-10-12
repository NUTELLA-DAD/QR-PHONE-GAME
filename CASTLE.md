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

## Risks
| Risk | How it's handled |
|---|---|
| Clutter | squads read as blocks with banners; the core stays the brightest thing on a face; one telegraph at a time |
| Performance | merged and instanced: soldiers take 8 draw calls however many there are; caps per tier |
| Chip damage from arrows | weak arrows, plate immune, 45% miss, a fairness check, existing counters |
| Wobble | held poses at 8 fps; banners in 3 poses; stepped waterfalls; the crown falls on sim time |
| Stranded frustration | flare, warning, a soft return; bots never strand |
| Too much for 2 players | objectives only with 3 or more players |
