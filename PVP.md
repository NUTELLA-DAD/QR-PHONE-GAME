# Phase V - PvP airship battles ("Versus") - plan written with Fable

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

**Plain language:** the code assumes exactly one ship. Hundreds of places read "the ship" and "the layout", and the world scrolls past our ship. Rewriting that would be months of risky work.

Instead: **run two complete copies of the game side by side on the host**, each flying one ship with its own crew. A small **bridge** puts both ships in one sky, lets shells cross between them, and hands a player over when they jump ship. Co-op runs one copy with the bridge off, so it cannot change.

### Measured coupling
- `SHIP_LAYOUT`:
  - 306 references in 50 files;
  - 32 module-level captures;
  - 47 kind lookups.
- `state.ship`: 589 references in 44 files, including `state.ship.alt` 220.
- Also global:
  - `state.players` 127;
  - `state.course` 184;
  - `state.gunship` 69;
  - and more.

### Options considered
| Option | Verdict |
|---|---|
| (a) Generalise the code to N ships | Not now: thousands of edits, and the regression gate would be at risk for weeks. |
| (b) Player-driven gunship | Rejected as the end state: asymmetric and useless for evaluating real builds. Kept as a fallback demo. |
| (c) **Two sim instances + a bridge** | **Recommended.** |

### How option (c) works
ES modules are instanced per URL, so loading the host module graph twice gives two independent `SHIP_LAYOUT`, `config`, `state`, nav tables, bakes and bots, with no code change.
- **Browser:** `server.js` serves `/b` as a second path to `public/`, and PvP `main.js` imports `/b/modules/host/simulation.js` for ship B.
- **Node (arena tool):** a small `module.register` resolve hook, or a temp copy of `public/`. Both instances step in lockstep with one seeded RNG, A then B.

### The bridge (`pvp/bridge.js`, Node-safe)
1. **One sky.** Same map seed and environment for both. B's frame offset is `dx = (dist_B + ref_B.x) - (dist_A + ref_A.x)`, `dy = alt_A - alt_B`, exactly like `state.gunship.dx/dy` today.
2. **Rival mirror.** Each sim gets `state.rival = { layout, dx, dy, hull, guns, bags, crew, team }` every step. New code reads it behind `if (state.rival)`.
3. **Projectiles and damage.** The sim exposes `external = { hitsShip, impact, gasHoleAt, worldPos }`. The bridge tests A's shells against B and calls B's `impact` (holes, breaches, fires, hull), credited to the gunner.
4. **Transfers.** A player belongs to one sim at a time; `network.js` routes input by a `playerSim[id]` registry.
   - Landing on a rival surface calls `bridge.transfer`.
   - Overboard / KO transfers the player home.
   - Hostiles get a tiny `useFor` branch (capture / sabotage), and `attack()` targets hostile players.
5. **Render.** One canvas with a new `createArenaCamera`. `renderFrame(now, view, opts)` gains `opts.layers` (`background` | `ship` | `hud`) and `opts.worldOffset`; the background is drawn once and each ship draws at its offset. `pvpArt.js` draws the HUD, pennants, timer and scoreboard. The perf level is shared.
6. **Rounds.** The bridge owns round, score and win logic. `config.PVP.ENABLED` turns off the director and AI spawns, and PvP never writes co-op saves.

**Safety:** all new code sits behind `state.rival` / `config.PVP.ENABLED`. Co-op runs one instance, so `--check-botsim` must stay byte-identical. Memory roughly doubles. Sim CPU for two ships is about 3% of real time.

## 3. Bot evaluation arena

**Plain language:** a tool pits ship A against ship B with bot crews over many rounds in several skies, and reports who wins, how fast, and why. Over a pool of ships it gives chess-style ratings and flags parts that win everywhere. This is the balance tool for catalogue v2.

### Running it
`node tools/arena.mjs --a classic --b sparrow --rounds 10 --envs skyisles,fungal,storm --bots 6 --minutes 6 --seed 1 [--mode broadside|capture|koth] [--out arena.json]`

It loads two instances, applies builds via `buildload.mjs`, crews each side with bots, steps in lockstep and swaps sides every round.

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
- **Two module copies:** document them in CLAUDE.md and watch the shared globals (`localStorage`, `window.game`, `perfGov`, sfx queues).
- **Balance:** side swaps, the mirror gate, uncontested-capture time, the GOING DOWN! comeback, and arena Elo.
- **Determinism:** fixed A-then-B step order with one seeded RNG.
