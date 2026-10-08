# Phase V - PvP airship battles ("Versus") - plan written with Fable

**Status (B.4): Versus is built on the one-world design (section 2): two Ships in ONE World, `pvp/match.js`, `node tools/buildsim.mjs --check-match`. Broadside and Capture are in; King of the Hill, the Shipwright build phase (v2), the crew cannon and the Elo arena tool of section 3 are still to come. The roadmap table in section 4 is the original plan.**

## 1. Player experience

Two crews, each on a ship they built themselves, on one TV.

1. **Pick a side** in the lobby (a red or blue scarf).
2. **Pick or build a ship** under the same budget.
3. **Fight** in one of the seven skies.
4. **Win** by sinking the other ship, or by boarding her and holding her wheel. Best of three.

Co-op stays the main game; Versus is a separate lobby button.

### Lobby and teams
- New lobby button `Mode: VERSUS`. Joining is unchanged: the same server, the 16-player cap and personal colours.
- The host alternates new joiners between red and blue. The phone says "You're RED - tap to swap" until cast-off.
- The TV shows two mast pennants with heads under each.
- Team identity shows as:
  - a scarf on the crew sprite;
  - a pennant;
  - the hull trim colour;
  - a red/blue half of the HUD.
- Enemy crew on your deck get the enemy scarf and an ink "!".

### Build phase (kept fair)
- **v1:** a shelf of ready ships with a visible "tonnage" line (mass / lift / steam / hands / cost):
  - classic;
  - Sparrow;
  - fixture builds;
  - random builds;
  - Hangar builds.

  Both teams pick under the same cap, and the validator must PASS.
- **v2 (after S.6b):** a 3-minute Shipwright phase. Both teams vote parts onto their own blueprint under the same salvage cap, and both blueprints show side by side on the TV.

### Arena
- One of the seven environments. The course generator builds a bounded arena: open sky with 2-4 rock islands, or a cave chamber for cover.
- The environment rules become strategy:
  - caves favour short ships;
  - storms punish tall ones;
  - the Aether needs lift.
- A soft wind wall marks the edge. After 4 minutes a shrinking "storm wall" forces contact.

### Win conditions
| Mode | How to win |
|---|---|
| **Broadside** (default) | Sink or wreck the other ship. GOING DOWN! stays as the last stand; limp-home spares are off. |
| **Capture** | An enemy crewman holds Action at the helm for 6 s with no defender in reach: "HELM TAKEN". |
| **King of the Hill** | Keep your hull inside a gold ring in the sky; first to 90 s. |

Rounds are best of 3 with a 6-minute cap. On a timeout the higher hull % wins. Sides swap every round.

### Boarding
- **Ways across:**
  - hookshot onto her decks;
  - parachute / jump from the bomb bay;
  - the crew cannon (catalogue v2).
- **On the enemy deck** a hostile has three actions:
  - Fight;
  - Sabotage boiler (hold 3 s: fire + steam leak);
  - Take the helm (hold 6 s).
- Falling overboard sends you to your own medbay.
- **Defenders:**
  - cut the grapple;
  - fight;
  - the TV shouts "BOARDERS ON THE MAIN DECK!".

### Camera
**One shared camera, not split-screen.** It frames both ships with a zoom cap, and the arena is sized so the cap holds. Things off screen get edge arrows.

### Round flow
1. Lobby.
2. Teams.
3. Build / shelf.
4. Count-in, with both ships moored at opposite masts.
5. Fight.
6. Wreck / capture finale: slow-mo final hit, then the winners' faces.
7. Scoreboard: hits, boardings, patches, play of the round.
8. Next round, or a rematch vote on the phones.

### Handicaps
- Bots fill the smaller team.
- Crew scaling already runs per ship.
- PvP has its own gentler table, `config.PVP.HANDICAP`.

## 2. Technical architecture

**Plain language (B.4, as built):** Versus is TWO SHIPS IN ONE WORLD. The game was changed (MOVEMENT.md, Option B) so one simulation understands many airships: each ship has her own hull, gas, guns, fires, crew and picture, and flies from her own position in one shared sky. Versus puts a red ship and a blue ship in that sky, and `pvp/match.js` runs the rounds. (This file's first draft planned two complete copies of the game stitched together by a "bridge"; that harness, with its `/b` server route, its Node loader hook and `pvptest.html`, was built as a stepping stone and was retired in B.4. Nothing of it is left.)

### How it works
- **The lobby.** The Mode button gains VERSUS (`simulation.setSession('versus')`, lobby only). `match.enter()` adds the second ship, sets `ship.team` red / blue, deals the crew out (`player.team`, `player.ship`) and keeps `config.PVP.ENABLED` on. New phones join the smaller side; a phone's `swap` input moves it; "Add bots" adds two to each side; CAST OFF fills the smaller crew with bots.
- **The shelf.** `pvp/shelf.js`: the classic ship, Twin Boiler, Four Bags and three seeded random valid builds, every one validator-PASS and under `PVP.TONNAGE` (classic weight x 1.15). After CAST OFF each team votes on its phones (the dock vote's machinery, tallied per team). Red is the main ship: her layout is refitted in place (`shipSim.refit()`); blue is made afresh (`removeShip` / `addShip`).
- **Rounds.** `match.js`: count-in (both ships moored at opposite ends of a fresh arena sky: the course generator's open sky with rock islands, no flak, `ARENA.LIFT` above the start, a soft wind wall at the edges), fight, finale (slow motion while the wreck plays out), scoreboard, next round with the sides swapped, best of three with a 6-minute cap (higher hull % wins; five rounds at most), match winner, rematch vote. Capture mode: `PVP.MODE = 'capture'`.
- **Cross-ship combat.** One shell list and one bomb list. After the enemy fire of each step `match.crossFire()` tests every shell and bomb against every OTHER ship (`shieldBlocks`, `hitsShip`, `impact` of that ship, in her coordinates through `pose.js`); a rock island gives cover. Shells carry `from` (their ship). Two hulls that touch are pushed apart by the world-level `shipCollide.js` (not Versus-only: every pair of ships, co-op included), which hurts them by the speed they met at and kicks them by a `forces.js` moment where they touched; Versus only counts the bumps. The enemies' `targetShip(world, enemy)` picks the nearest ship still flying.
- **The rival.** `ship.rival` / `ctx.rival` (refreshed each step): the other team's nearest ship in WORLD coordinates (aim point, guns with `manned`, gasbags, crew, helm, boiler). The bot captains (`course.js rivalPlan`) and gunners (`aim.js`) read it.
- **Boarding.** Each ship's `air` has the other team's decks as landing surfaces (and hook anchors); an airborne crewman who lands on one is `transfer()`red to that ship and is a boarder (`shipSim.js isHostile`). A boarder's Action button: TAKE THE HELM (hold CAPTURE_TIME, not with a defender within DEFEND_REACH), SABOTAGE the boiler (hold SABOTAGE_TIME: fires and a burst pipe); ATTACK fights (`FIGHT` hit points; at zero a crewman is out cold). A knocked-out boarder is carried to his own medical bay; falling off wakes him there too. The TV shouts BOARDERS ON THE MAIN DECK!
- **Bot captains.** Standoff and an altitude edge (the ship that started on the left holds the high ground), rock cover when losing, retreat to repair (hull < 35% and more than 2 holes), COME ABOUT when the rival is behind the bow, gunnery order (her manned guns that bear on us, her gasbags, her boiler and helm, her hull) with a lead, and a daring "board" stunt (hook across when her decks are in reach and the ship is calm; the captain closes in while he goes).
- **Safety.** Everything sits behind `world.match` / `config.PVP.ENABLED`. Co-op runs one ship with none of it: `--check-botsim` stays byte-identical. A Versus game writes no co-op save (record, voyage, mode).
- **The gate.** `node tools/buildsim.mjs --check-match` (alias `--check-arena`): `tools/match-check.mjs`.

### What is still to come
(The enemy gunship as a Ship, B.5, and `forces.js` driving every pose, M.4, are in.) Cross-ship ballast throws, towing and the crew cannon (B.6), the Shipwright build phase (v2) and King of the Hill.

## 3. Bot evaluation arena (still to build, on top of `--check-match --mirror N`)

**Plain language:** a tool pits ship A against ship B with bot crews over many rounds in several skies, and reports who wins, how fast, and why. Over a pool of ships it gives chess-style ratings and flags parts that win everywhere. This is the balance tool for catalogue v2.

### Running it
`node tools/arena.mjs --a classic --b sparrow --rounds 10 --envs skyisles,fungal,storm --bots 6 --minutes 6 --seed 1 [--mode broadside|capture|koth] [--out arena.json]`

It makes one world with two ships (`match.applyPicks`), crews each side with bots, steps it and swaps sides every round.

### What it reports
- **Per round:**
  - winner and cause;
  - time-to-kill;
  - damage dealt and taken;
  - holes and fires caused;
  - gas lost;
  - shots and hit %;
  - boardings and captures;
  - patches;
  - bot idle %.
- **Aggregates:**
  - win rate with a confidence interval;
  - mean time-to-kill;
  - JSON stats.

### Pools and ratings
- `--pool classic,sparrow,bags,giantbag,random:20` runs a round-robin with Elo (K=24).
- Random builds carry their mutation tags, so the dominant / trap / situational verdicts apply per environment.
- **Flags:**
  - any build over 65% against the pool after 20 games;
  - any part correlating above +0.25 with Elo in every environment.
- **Sanity gate:** a mirror match lands at about 50%.
- **Speed:** about 10 s per 6-minute round, run in parallel child processes.

`buildsim --random` gains an "Elo vs classic" column.

### Bot PvP AI (bots.js, behind `state.rival`)
- **Gunnery priority:**
  1. guns bearing on us;
  2. gasbags;
  3. boiler / helm area;
  4. hull.

  Shots lead the target.
- **Helm:**
  - hold broadside range;
  - keep an altitude edge;
  - use rock as cover;
  - retreat to repair when hull < 35% and holes > 2;
  - press when the rival is deflating.
- **Captain styles** reuse `GUNSHIP_PARTS.PERSONALITY` (brawler / sniper / boarder).
- **Boarding:** hook across when in range and the own ship is calm. Aboard, capture the helm if it's unguarded, otherwise sabotage.
- **Defence:** fight hostiles and cut the line.

### The lively captain (built; `pvp/captainAI.js`, `config.PVP.BOT`)
**Plain language:** the bot captains used to hover at a fixed distance with a gentle wobble. Now each ship's captain rolls a personality for every round (brawler, sniper, boarder, daredevil) and flies like one: she weaves (irregular climbs, dives and surges, never a sine), dodges shells that are flying at her hull, and now and then does something dramatic.
- **Weave and dodge:** the wanted altitude, throttle and standoff jump about at random; every shell flying at the hull is followed (`scanShells`), and when one is coming she jumps up or down away from where it would land and surges. She never dives when low on gas or near the ground (a dive vents lift she cannot spare).
- **Plays:** PASS (a high pass over her, the bombardier drops when a bomb let go now would fall through her hull, or a dive-under; then COME ABOUT to face her again; only flown where the whole strip of sky is free of rock), RAM RUN (a weak rival, a stronger ship; real collisions now, `shipCollide.js`), GRAPPLE (close in and match speed for a while so the decks are a hook's throw apart), CHASE (a nearly beaten rival), retreat-and-repair (as before). The TV banner calls them sparingly ("RED RAM RUN!", "BLUE DIVES UNDER!", "EVASIVE!", "IS BOARDING!").
- **Raids:** `bots.js pvpRaid`: an idle (or now and then a busy) hand goes across by hookshot, or by a parachute jump from the bomb bay when her deck hangs below (`drop`). Fires and holes do not stop it; the wheel stays manned, the last gunner keeps his gun and `RAID.KEEP` hands stay home. Aboard, the old boarder jobs (fight, sabotage the boiler, take the helm). Defenders run at a boarder standing at the wheel or the boiler before anything else.
- **Fairness:** the old 450 px altitude edge gave the left-hand ship about two wins in three, so `ALT_EDGE` is now 150 and the captains never press the hulls together (`BOT.MIN_GAP`).
- **Numbers:** `node tools/pvp-stats.mjs --matches 12` prints per round: boardings, bumps, come abouts, shells dodged, altitude range, the captains' counters. Honest limit: a hull is a thousand pixels tall and a shell crosses the gap in about a second, so dodging by height saves few shells (1-2% of the aimed ones); the movement mostly changes WHERE they hit, and the range excursions, rock and the passes change how many are fired.

## 4. Roadmap

| # | Package | Size | Files | Parallel-safe? |
|---|---|---|---|---|
| V.0 | Two-instance spike (browser `/b`, Node loader hook), measurements | S | server.js, main.js PvP branch, tools/instances.mjs | Yes, now |
| V.1a | render.js layers/offset/hud options; arenaCamera.js | S | render.js, pvp/arenaCamera.js | Yes, now |
| V.1b | sim `external` API; network.js routing; PvP save guard | S | simulation.js (return block), network.js | After the S.5f/S.5i simulation.js work |
| V.2 | bridge.js: one sky, rival mirror, cross-fire, rounds, team palettes; `--check-arena` | M | pvp/bridge.js, pvp/pvpArt.js, config.PVP, buildsim | Yes |
| V.3 | arena.mjs + PvP bot AI + Elo pool + dominance report | M | tools/arena.mjs, bots.js, buildStats.js | bots.js after S.5e |
| V.4 | Boarding transfers, hostile actions, medbay routing, defence | M | bridge.js, simulation.js, hookshot/airborne | simulation.js batch alone |
| V.5 | Lobby mode, team pick, shelf, best-of-3, scoreboard, rematch, KOTH, arena wall | M | host.html, menu.js, network.js, controller ui.js, course.js, pvpArt.js | Alongside S.6 |
| V.6 | Handicaps, 7 arena maps, perf pass, Shipwright build phase | M | config.PVP, maps.js, crewArt.js, S.6b hooks | After S.6b |

**Success measures:**
- co-op botsim byte-identical after every package;
- `--check-arena` green;
- mirror match 45-55%;
- draw time < 12 ms with two classic ships at 1080p;
- a 6-player best-of-3 in under 25 minutes;
- the cold-player test passes on the enemy deck;
- no build over 65% against the pool.

V.3 should land before the catalogue v2 tiers, so every new part gets an arena rating.

## 5. Risks and mitigations
- **Performance:** S.4 bakes ships into blits, the background is drawn once, the perf governor is shared, and zoom is capped. Check with the F-meter before and after.
- **TV readability:** shared camera with a zoom cap, a bounded arena, scarf + pennant + HUD side, the enemy-aboard shout, and the validator's fit cap.
- **Party complexity:** one phone line per rule, only three hostile actions, teams by scarf colour, a one-vote rematch.
- **Network:** phones send the same inputs; the server is unchanged; the extra cost is host CPU, about 3%.
- **Shared globals:** `localStorage` and the sfx queues are shared by both crews (one World): a Versus game writes no co-op save.
- **Balance:** side swaps, the mirror gate, uncontested-capture time, the GOING DOWN! comeback, and arena Elo.
- **Determinism:** one World, one step order, one seeded RNG.
