# Airship Crew - "Next Level" plan

Written by the planning model (Fable) after reading the code, art and test tools. Lead's notes are marked **Lead:**.
Work through it phase by phase; each work package (P1.1 etc.) is one worker task.

**Lead:** two things in here need the owner's OK before they happen:
- **Bundled fonts (P1.1).** Downloading free-licence font files means downloading files from the internet, which needs a yes first.
- **Music loops (P1.5).** These would need to be made or downloaded. Generating them locally is the alternative.

## 1. The vision

The ship itself is the main character: a room of friends, phones in hand, crewing one slightly-too-big, slightly-too-old airship.

Every session should end with two feelings:
- **"We only made it because *you* did that thing."**
- **"One more voyage."** A route we didn't take, a captain we didn't beat, a part we nearly unlocked.

Three words for every decision: **Together. Legible. Warm.** An idea belongs if:
- it makes people talk to each other;
- it reads from across the room;
- it looks like a painting.

## 2. Art style - "Airship style"

### Style bible

**The rule of two worlds**
- **Backgrounds are paintings:** soft, no ink, atmospheric.
- **Anything you can touch or that can hurt you is storybook gouache:** thin warm-brown ink `#2b2622`, flat matte fills, one highlight band, no gradients.
- Never ink the background. Never paint-blur a gameplay object.

**Palette per environment** (a `TINT` block in `config.ENVIRONMENTS.<env>`; the ship keeps its own cream/sage/wood so it always reads):

| Environment | Palette | Mood |
|---|---|---|
| Sky Isles | cobalt, cumulus white, viridian, warm cream | morning |
| Frost Peaks | powder blue, lavender shadow, bone white, one lantern-orange note | noon glare |
| Ember Forge | soot charcoal, ember orange, dusty rose smoke, brass | furnace glow from below |
| Storm Front | slate, indigo, cold white lightning; the ship's lamps are the only warmth | night |
| Sunken Sea | teal, sea-foam, bleached driftwood, gull grey | late afternoon |
| Fungal Depths | plum, moss, bioluminescent cyan and pink pinpricks | no sun, local light |
| The Aether | deep violet, star white, pale gold auroras | dusk forever |

**Ink**
- One ink colour everywhere, and only three line weights (`OUTLINE.SMALL / MAIN / SHIP`).
- Round joins.
- Enemies differ by shape and colour, never by line.

**Shape language**

| Kind | Shapes | Colours |
|---|---|---|
| Friendly | round, soft, horizontal | cream, sage, wood, brass |
| Enemy | angular, spiked, vertical, asymmetric | oxblood, charcoal, iron |
| Threats | triangles pointing at you | |
| Pickups / goals | circles | gold |

**Light**
- One key light per environment: top-left and warm by default, from below in Ember.
- No key light in Fungal or Storm, where lamps and searchlights are the light.
- One shared helper places the highlight band on every object.

**VFX** (all code-drawn, at most 12 draw calls each):

| Effect | How it's drawn |
|---|---|
| Explosions | flat gouache puffs: 3 stacked circles (cream, orange, charcoal) that grow and fade |
| Smoke | grey circles, ink only on the outer edge |
| Fire | a 4-frame flat flame |
| Steam | pure white puffs |
| Impacts | 3-5 comic ink ticks |
| Primed burst | a gold ring plus ink ticks |

**UI: "captain's logbook"**
- Cream paper panels, ink borders, brass pins and red stamps for warnings.
- The route map is a hand-drawn chart.
- The shop is a dockside noticeboard of pinned cards.
- The phone mirrors this look, with a brass panel per station.

**Type:** two bundled open-licence fonts in `public/fonts/` (a 1930s display face and a readable serif), referenced via `config.FONTS`.

**Animation (no wobble)**
- Squash-and-stretch on landings and hits.
- Anticipation: a crouch before a jump, recoil before the muzzle flash.
- Hold-and-snap poses.
- Secondary motion only on cloth and smoke.
- Walk cycles stepped at 8 fps while the position stays smooth.
- Outlines never move separately from fills.

### Pipeline
1. **Style board:** lock one prompt and one reference image per world.
2. **Backgrounds (ComfyUI):**
   - feather the top edges;
   - make seams with the latent-inpaint trick.
3. **Painted sprites, only for big static shapes:** the gasbag, gunship plates, planes, the Flagship and shop cards.
4. **Code gouache for anything animated:** crew, gunship parts, VFX and the HUD. Review on `styletest.html` and `charactertest.html`.
5. **Textures:** bake once per colour (ImageBitmap). No new per-frame blend modes.

### Art upgrades, ranked by payoff per effort
1. (S) Fix background seams and edges in all 7 environments.
2. (S) Bundle fonts and restyle the HUD as the logbook.
3. (M) A VFX pass: gouache explosions, ink ticks, flat steam and smoke.
4. (M) Key light and time of day per environment, plus a dusk shift across a voyage.
5. (M) A painted Flagship and boss hulls.
6. (L) Crew cosmetic layers (hats, goggles, scarves).
7. (L) Painted room interiors.

## 3. Deeper, addictive mechanics

### Highest leverage

**A. Linked stations.** Two people matter at once, and a wire on the TV shows the link.

| Link | How it works |
|---|---|
| Gun + loader | A second person at the ammo rack primes shells; the gunner fires them. Solo gunners still shoot. |
| Helm + lookout | Spotting also shows the helm updraft lanes and gust warnings, and the helm turns faster while a spotter is active. |
| Boiler + valve | Overdrive needs someone holding the surge into one consumer: push-your-luck shared by two. |

Measure with botsim:
- gunner idle time under 25%;
- "paired seconds" (two crew working a pairing at once) above 20% of station time.

**B. Rival captain**
- One generated gunship captain per voyage escapes at low HP.
- She returns 2 stops later, repaired and upgraded, taunting on the TV, and is worth triple salvage.
- Beaten captains go into the saved **Captain's Log**, e.g. "Boarded by Mia at Frost Peaks".

**C. The Hangar** (saved on the host computer)
- Unlocks come from *doing things*, for example:
  - first hijack → aviator goggles;
  - first Flagship kill → a figurehead;
  - 50 patches by one player → the Hammer hat;
  - winning with 2 players → the "Skeleton Crew" flag.
- Cosmetics show on the crew, on the gasbag crest and in the lobby.
- Every 3 victories unlocks a new starting ship variant, e.g. "The Kettle": smaller, faster, one fewer gun.

**D. Session length**

| Mode | Length |
|---|---|
| Quick voyage | 4 stops, 15-20 min |
| Voyage | 6-8 stops, as now |
| Evening campaign | two voyages, with hangar unlocks in between |

**E. Tiny crews finish**
- On Easy and Normal, crews of 3 or fewer get grey-scarved "ship's mates": bots that only do coal, ammo and patching.
- Target: 2 players reach the Flagship in 40% or more of Normal voyages.

### Core loop
- **Jobs follow the fight:** enemies favour one side during a peak, so the work clusters.
- **Help! drops a gold "meet here" marker** for human crew.
- **One mid-mission twist** per mission (a boarding, a fire spread, a lightning charge or a cargo rescue), with a 3-second breath to assign roles.
- **Shop "crew deals":** 3 pinned choices, cheaper if the vote is unanimous, so the table has to talk.

### Juice
- Hit-stop on boarding kills and primed hits.
- A "play of the mission" card on the scorecard.
- 3 music loops (calm, combat, dock), crossfaded by the pacing director.

### Variety
- **Modifier deck at launch:**
  - Low ammo / high salvage;
  - Night across the whole route;
  - Ghost crew (raiders doubled, gunships halved);
  - Gale.
- **Daily seed:** a named daily voyage, with the best daily run shown in the lobby.
- **Stop events:** a derelict to loot, a merchant balloon, a distress call that gives a temporary mate.

### Mastery and party
- **Daring score:** primed hits, swings, hijacks and boardings feed awards and unlocks.
- **Veteran/Hard captains counter you.**
- **Joining mid-game:** the new player gets a 10-second job card on their phone.
- **Leaving:** their station passes to a mate.
- **Knocked-out players** can "haunt" with a harmless ghost puff.
- **The final hit** before a crash plays in slow motion, with a strip of the crew's faces.

## 4. Roadmap

S is about half a day of agent work, M is 1-2 days and L is 3 days or more. Parallel work happens in separate worktrees that don't share files.

### Phase 1 - Foundation and face

| # | Package | Size | Files | Notes |
|---|---|---|---|---|
| P1.1 | Fonts + logbook HUD | S | fonts/, host.html, controller.html, render.js HUD, config.FONTS | needs a download OK |
| P1.2 | Background edge/seam fix | S | art/backgrounds, backgroundArt.js | |
| P1.3 | Linked stations | M | prime.js, spotter.js, simulation.js, bots.js, config | |
| P1.4 | Ship's mates for crews of 3 or fewer | M | bots.js, crewscale.js, crewArt.js | |
| P1.5 | Music loops + director crossfade | S | sfx.js, public/audio/, simulation.js | needs audio |
| P1.6 | Perf tier: auto-drop textures/darkness when draw time > 12 ms | M | render.js, searchlightArt.js, textureArt.js | **lands before Phase 2 art** |

**Phase 1 status: DONE** (perf tier, fonts + logbook HUD, background fixes, linked stations, ship's mates, music).

### Phase S - Modular ship building (alongside Phase 2)
Start with a small ship ("the Sparrow") and add parts at each sky-dock: hull bays, decks, gasbags, engines, lift engines, nests, mounts.
Proved by a building simulator. Full plan: **[SHIP_BUILDING.md](SHIP_BUILDING.md)**.

Order:
1. S.0 snapshot.
2. S.1 layout-from-parts.
3. S.2 and S.3, in parallel.
4. S.4 (art bake) and S.5 (building simulator), in parallel.
5. S.6 parts + Shipwright UI.
6. S.7 balance.

Do S.1 before P2.1 (both touch gunship.js), and S.7 after P2.2 (save schema).

### Phase V - PvP airship battles (planned with Fable)
Two crews, each on their own built ship, one TV. Ways to win:
- sink the other ship;
- capture her helm;
- hold the ring.

It also includes a bot arena (`tools/arena.mjs`): ship-vs-ship ratings and part balance.

How it's built (B.4): two Ships in ONE World (the game was changed to understand many airships), run by pvp/match.js, so co-op is untouched. Broadside and Capture are in, with the lobby button, teams, the shelf, rounds and the scoreboard; the hold-the-ring mode and the bot arena are still to come. Full plan: **[PVP.md](PVP.md)**.

V.0, V.1a and V.2 can start alongside Phase S.

### Phase 2 - Story and stickiness

| # | Package | Size | Files |
|---|---|---|---|
| P2.1 | Rival captain | L | gunshipBlueprint.js, gunship.js, voyage.js, render.js |
| P2.2 | Hangar + Captain's Log + unlocks | L | voyage.js save, new hangar.js, crewArt.js, lobby, phone |
| P2.3 | Session modes + daily seed | M | config.VOYAGE.MODE, voyage.js, menu.js |
| P2.4 | VFX pass | M | render.js drawEffects, threatArt.js, goingDownArt.js |
| P2.5 | Shop crew deals | S | upgrades.js, simulation.js |

### Phase 3 - Variety and spectacle

| # | Package | Size | Files |
|---|---|---|---|
| P3.1 | Modifier deck + stop events | M | config, voyage.js, course.js, jobs.js |
| P3.2 | Mid-mission twist | M | simulation.js, config.ENVIRONMENTS |
| P3.3 | Time-of-day tint | M | envArt.js, backgroundArt.js, skyArt.js |
| P3.4 | Painted Flagship + boss phases | L | art/sprites/gunship, gunshipArt.js, gunship.js |
| P3.5 | Spectator + fail moments | S | goingDown.js, radar.js, render.js |

### Phase C - Controller ergonomics (owner request, next after S.4)
The problem: players grab or drop the wrong thing by accident. The owner picked up a hammer and dropped it again straight away.

Direction:
- The **big main button USES** what you hold.
- A **smaller side button** does swaps, new pickups and hopping onto stations/modules.
- The first pickup when empty-handed may use the big button.

Plan:
1. A controls assessment, running now.
2. Then a phone + host change:
   - controller/ui.js, controller.html;
   - simulation.js `interaction()`;
   - the bots' input;
   - hint text.

Success: no accidental swaps in a playtest, and the cold-player test passes.

### Phase 4 - Polish
- Crew cosmetics art set.
- Painted rooms.
- Daring scoring.
- Veteran captain counters.
- First-time tutorial.
- A TV readability check from 3 m.

### Playtest questions after each phase
- Who did you need most?
- What would you do differently?
- Name one moment you'd tell someone about.
- Did anyone sit idle for more than a minute?
- "One more voyage?" on a 1-5 phone vote, stored in the save. This is the key number.

## 5. Risks
- **Performance**
  - P1.6 comes first.
  - Every art package reports draw time from the F-key meter, before and after.
  - No new per-frame gradients or blend modes without baking.
  - Darkness stays low-resolution.
  - VFX stay at 12 draw calls or fewer.
- **Scope creep**
  - Reuse existing systems.
  - New stations and enemy classes wait for Phase 4.
  - Workers never touch simulation.js and render.js in the same batch.
- **Party complexity**
  - Every rule fits in one phone line.
  - Links give bonuses, never penalties.
  - The "cold player" test: can someone who joined 30 s ago do the job the arrow points at?
- **Balance**
  - Numbers stay in config.js.
  - botsim (3 seeds × 3 maps) and voyagesim (10 runs, Normal) after every package.
- **Art consistency:** locked prompts per world, the bible, and the Art test page as the review gate.
- **Save data:** a versioned, tolerant schema.

### Queued (owner requests, next up)
- **Crew health: 3 hearts.** BUILT (`health.js`, `config.HEALTH`, gate `--check-health`; `NO_HEALTH=1` / `HEALTH_CFG='{...}'` for botsim).
  - A fire burns whoever stands in it (a heart after 0.7 s, then one per 1.4 s; hopping over it or spraying it out is safe); a raider blow, a shell burst beside you, a sword and a hard landing take a heart; a bomb, the bomb bay going up, a heavy shell beside you and a great fall are BIG (knocked out at once). Revive / waking gives 1 heart; the medbay heals one per 5 s; hold Action on a hurt crewmate to bandage; phones show hearts, the arrow says GET TO THE MEDBAY!; the TV shows heart pips over a hurt crewman. Bots step out of fires and go to the medbay on their last heart.
  - Original request:
  - Fires hurt players standing in them.
  - Shell hits, raider blows and falls take a heart; big hits (explosions, bomb bay blasts, heavy shells) knock you out in one go.
  - At 0 hearts you're knocked out, as today.
  - Hearts show on the phone controller.
  - The medbay heals hearts over time, and reviving gives 1 heart back.
- **PvP range tactics:** running now.
  - a big arena;
  - spyglass inset camera for far ships;
  - long guns, mortars, mine layers, ram prow, harpoon;
  - captain AI by range band.
