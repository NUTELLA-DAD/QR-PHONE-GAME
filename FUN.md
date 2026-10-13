# FUN.md - Airship Crew: the fun and the mechanics as a whole

Fable's read-only study, 2026-10-12, for the lead (Opus) to execute. It is read from the code and measured with the tools; nothing was edited.

**Status: approved by the owner 2026-10-12.** Owner decisions:
- **Go:** build it, starting with round 1 (F1 + F8; F7 done).
- **Escort crash: KEEP as it is.** Friendly planes still crash into the player's own ship, so F4 must NOT change `ESCORT.CRASH_ON_SHIPS`.
- **Boarding:** announced boarding attacks (F5) replace "relentless" boarding.
- **Pause both:** the Away Team (A0-A3) until after the first playtest, and scrap carrying (F7) until G2 + the scrap patch.

Progress:
- **F7 done:** `SCRAP.ENABLED` is off in the game; `SCRAP_ON=1` turns it on in a tool, and `--check-scrap` sets it.
- **Garrison D1 merged.**
- **F8 done (2026-10-12):** `config.BOTS.PROFILES { bot, human }` + `BOTS.PROFILE` (default `bot`, byte-identical); `--profile human|bot` on botsim, voyagesim and botbatch; voyagesim defaults to `--build sparrow` (`--build none` = the old no-start-build, used by `--check-golden`); fun lines in the voyagesim summary (`tools/funmetrics.mjs`; botsim prints them only with `--fun 1`, before the baseline marker); `--check-human-profile` (a snapshot, no thresholds) and `--check-fun-metrics`.
- **F1 done, gates only partly met (2026-10-12):** dangers `[1,2,2,2,2,3,3,3]`, `BRANCH_UP` 0.35, `SALVAGE.MAX_PER_VOYAGE 1` and `FROM_COLUMN 2`, `WIDE_CAVES` (the Sparrow's caves get 4,4,3,3,2,2,1,1 squares of slack by route share; stop 1 was the right cave, just too tight), `CLASSIC_STOP1` (the classic's stop 1 is an outpost raid, danger 2, planes at the first set piece), `START_BUILD_BY_CREW` (6 or fewer = Sparrow at CAST OFF unless the Ship button, `?ship=` or a tool forced one; the Ship button now cycles Auto / Sparrow / Classic). Sparrow 48 bot runs: wins 2 -> 5, timeouts 25 -> 18, mean stops 4.3 -> 4.2, salvage runs taken 3.2 -> 0.9 a voyage, lairs met 9 -> 12 of 48, stop-1 falls 0.3. Classic: wins 3 -> 2, stop-1 hull 99.3 -> 97.3. The rest (wins 30-50%, timeouts, lairs met) is the death spiral and the fortress/citadel rings, which belong to F5 (fires, raiders, structure drain, the grounded stall) and the ring packages.
- **F5 built, gates only partly met (2026-10-12):** `RAIDERS.PARTY` (announced boarding: the boss's lines hang the raiders on ropes in sight for `WARN_TIME` 3 s under a BOARDERS AFT / FORE! banner and a red mark on the deck they will land on, then they drop; at most `1 + floor(crew/3)` aboard, a floor of 2 on Veteran/Hard; none while FALLING or within `HOLD_CALM` 10 s of SHE HOLDS; the gunship's paratroopers and rope crossings obey the same cap and calm via `raiders.canBoard`; cutters leave the crew alone while a station is left to hack; `KO_TIME` 12 -> 8; `STRIKE_CD` 1.5 moved to config) and `FIRE.PARTY` (cap `CAP_FLAT` 3 + crew x 1/3, spread every 10 s on stops 1-3, nothing ignites while FALLING); `GOING_DOWN.ALL_HANDS` 20; `BREACH_RATE` 0.007, `FIRE_RATE` 0.006; end segments with the boiler or helm hold `GRACE_END_KEY` 8 s and cannot break off before stop `KEY_NO_BREAK_BEFORE` 3; the ground soft lock (`STRUCTURE.LIFT.GROUND_STALL` 40 s grounded and still raises FALLING with the crash clock). `NO_PARTY=1` = the old raider/fire numbers (the seeded baselines, the curriculum and the golden gates pin it); `--check-party`; voyagesim prints a `ground (F5)` line. Bots: one free hand walks under an announced boarding. Sparrow 48 runs (Normal, bot): wins 5 -> 9, wrecks 25 -> 17, crashes per voyage 3.9 -> 3.2, mean stops 4.2 -> 4.9, but timeouts 18 -> 22 and falls (15.3 -> 15.7) and overrun (3.2 -> 3.2) did not move: the falls are 48% `pumpNoRise` (the pump gets no steam) and 39% sitting on rock, the overruns happen 79% with a mid-voyage zeppelin's boarding lines in the sky (F6 cuts those), and the timeouts are slow ring stops (0/2 faces at stop 5-7), not the ground (the stall rule fired 0 times in 96 runs; grounded-and-still with no alarm is 12-17 s a voyage). Classic 48: wins 2 -> 3, timeouts 12 -> 18, crashes 4.4 -> 3.8. Human profile (12 Sparrow): 0 -> 0 wins, wrecks 11 -> 8, falls 17.6 -> 14.2.
- **F6 done, gates met except the voyage length, which cannot be measured (2026-10-12):** `config.STOP_SHAPE { BRIEFING, ESCAPE, GUNSHIP }`, `SHOP.V2` (+ `V2_OFFERS/TIME/MAX_TIME/MEND_MUL/PART_CHANCE/FITTINGS`), `VOTE.SCORECARD_TIME_V2/BOT_THINK`, `VOYAGE.ROUTE_TIME_V2`, `SHOP.BOT_REPAIR_CHANCE`, `WAVES.MID_BOSS`; all on in the game, and `NO_STOP_SHAPE=1` in a tool is the old game (the botsim, golden, frames, creature, curriculum, yard, breakoff, gas and two-ships gates run with it).
  - **Briefing:** the first flight step of a stop raises `state.briefing` (3 s, the goal in one line; `render.js drawBriefing`) and each phone gets a toast with the goal and the verb of its nearest seat (`simulation.js startBriefing`, `config STOP_SHAPE.BRIEFING.VERBS`; the old stop banner is not said as well).
  - **Escape:** outposts down, a lair slain or a ring crowned starts `course.escape` (20 s): `tempo.phase 'escape'`, rate 0, stragglers and the gunship go home, a supply balloon, the banner ESCAPE TO THE BEACON and a countdown in the goal chip, then the scorecard. A beacon stop and the Flagship end at once.
  - **Gunship:** a stop with no lair or ring and the gunship in its gates gets her at its first set piece (`wantsGunship`); a cave seldom has the clear sky she needs, so she came at about 40% of such stops (a swarm comes instead and she is tried again).
  - **Dock:** three cards (MEND HER = hull + gas + coal priced by need x 0.8; one REBUILD / trophy / Yard part / one of six fittings; Cast off); votes 12 s (cap 35 s), scorecard 6 s, route 15 s; the phone and the TV (the blueprint screen too) show three big cards. No mid-voyage zeppelins; the Flagship stays.
  - **Numbers (24 voyages, Normal, bots):** menu s/stop Sparrow 48 -> 34, classic 54 -> 36; parts bought Sparrow 2.7 -> 2.7 (3.7 in a second run), classic 2.6 -> 4.0; mean stops Sparrow 4.3 -> 4.3, classic 3.9 -> 4.8; victories 3 -> 2 and 1 -> 1, timeouts 10 -> 8 and 5 -> 11 (the classic's reach the citadel now and stall there - the ring packages and F5). Median victorious voyage cannot be measured (1-3 victories in 24): the menus save about 2 minutes a voyage and the escapes add about 0.6.
  - **Tools:** `--check-stop-shape` (`tools/stopshape-check.mjs`), `tools/dock-shots.mjs` (a real Chrome: the briefing, the escape, the scorecard and the dock on the TV and a phone; shots in `../3d-screenshots/dock_*.png`), a stop-shape line in the voyagesim summary; `ring-check.mjs` waits out the escape and restores the fittings between its scenarios (they leaked from one to the next). Already failing before F6: `--check-hatch`, `--check-two-ships` ("both flew"), `--check-gunship-ship` (c), `--check-match` (the split's hysteresis).
- **F4 done, gates met except that victories are within noise of the old game (2026-10-12):** `config.PACING.AIM_AT_GUNS` (+ `AIM_CHANCE` 0.85, `HARD`, `MULTI`, tool-only `FORCE_COLUMN`), `MINES.FIRST_COLUMN`, `JOBS.SEATED_IDLE`, `CREW_SEATS`, `LINKS_AIM`, `SQUADRONS.FOLD_LONE`, `BOTS.GUN_IDLE_LEAVE` / `FILL_GUNS`; all on in the game, `NO_GUNS=1` in a tool is the old game byte for byte (the botsim, golden, frames, creature, curriculum, yard, breakoff, gas, two-ships gates and the structure `--sink` run pin it). `ESCORT.CRASH_ON_SHIPS` untouched (owner decision); the optional "auto patrol only after 60 s" was not built.
  - **Aim:** `links.js` keeps `state.links.idle[gun]` (seconds each manned gun has had no target, looked at every 0.25 s) and `state.links.aim` (the side whose manned guns, weighted 1 + 0.1 per idle second, are most; a gun counts for every side its arc covers); swarms, bombers, squadrons, imps, saws, snipers and tugs come in from that side 85% of the time (`gunsMatter.js aimedSide`).
  - **Tempo:** from stop 3 `PACING.HARD` (trickle starts 0.6, calm 34, set piece cap 40) and from stop 5 a second set piece 4 s after the first (never the gunship, never while falling or with the gunship about). **The old director overwrote every calm it entered with the set piece's own length** (`tp.t = max - el` ran after `enterPhase('calm')`), so the calm really lasted PEAK_MAX, 50 s, not CALM, 34 s. The harder tempo honours its calm; columns 1-2 keep the old behaviour. FUN.md's 24 would have been a cut from 50 to 24: it was tried (classic victories 4 -> 1 of 24); 34 is the shipped value (50 -> 34).
  - **Seats:** a seated human gunner with no target 6 s gets the gold job arrow on the phone while still seated (`ui.job.seated`); under 8 crew the Aft Dorsal Gun and the Deflector are mothballed (nobody takes them, no bot, no repair or ammo arrow, a canvas cover on the TV in 2D and on the gun in 3D); 8+ crews are untouched. The lone big fighter is a squadron of one (`squads.spawn({ size: 1, lone })`, the old fighter's hp, no ace; `state.enemy` stays a dead placeholder). No mines before stop 3. Bots leave an idle gun after 3 s (was 6) and man at most `FILL_GUNS` 0 guns with nothing to shoot, none in a calm or the escape: this, more than the director, is what takes the gun-seat idle down.
  - **Numbers (24 voyages, Normal, bots):** gun-seat idle Sparrow 69.0% -> 27.7%, classic 78.0% -> 38.1% (all seats 43.1 -> 20.8 and 39.0 -> 20.3); victories Sparrow 1 -> 2, classic 4 -> 3; timeouts 18 -> 15 and 17 -> 18; mean stops 4.9 -> 4.9 and 5.4 -> 5.4; classic stop hull 98.7 -> 95.7 (stop 1), 96.5 -> 98.3, 94.5 -> 92.5, 91.4 -> 96.3. botsim seed 3, open map, 8 bots, 6 min: gun-seat idle 82.5% -> 48.7% at stop 1 and 39.7% with the stop forced to 5 (`BATCH_SET=PACING.FORCE_COLUMN=5`), moments 28 -> 23 and 32 per 10 min. 6 seeds, stop 5: 79% -> 40%. `tools/botbatch.mjs --fun` prints the idle and moment numbers.
  - **Tools:** `--check-guns` (`tools/guns-check.mjs`). `--check-log` had a 15 px "SPOTTED by" world mark counted as page text (a longer fight left one up when the page was drawn): the check now skips it.
- **F3 done, gates met (2026-10-12):** `config.CONTROLS.HELM_V2` (on in the game; `NO_HELM_V2=1` in a tool = the old helm and the old classic ship byte for byte: `--check-botsim`, golden, frames and the other baseline gates pin it), `CONTROLS.EXPERT` (off; the TV's lobby / pause-menu button "Helm: easy / EXPERT", remembered in `localStorage.airshipExpertHelm`), `CONTROLS.HELM_HOLD { DEAD 0.15, GAIN 1.15, LEAD 0.9, TRIM 0.6, SPAN 150 }`.
  - **The helm phone:** stick up/down = pump/vent (`shipSim.js helmStickV2` -> `gasValve.input`), stick left/right = ahead/astern and COME ABOUT as before, the speed lever = cruise; let go of the stick and the autopilot's trim holds the height she would coast to (pump via `gasFor`, the small trim engine over `SPAN`), so a new player cannot drift off. The PRESSURE lever is a narrow GAS gauge with a HOVER mark and a RISE / SINK / LEVEL tag (`ui.hv = [gas, hover]`, `controller/ui.js showGauge`); the stick says CLIMB / SINK on the pad; the info line reads "Stick: steer & climb. Lever: cruise speed." for the first 12 s in the seat. The SPLIT engine panel (`ui.eng`) is only sent with EXPERT; a person's helm without EXPERT always has the engines linked (a bot's SPLIT is left alone). GOING DOWN! still pumps flat out.
  - **Bots:** `bots.js` writes the stick as `p.jy = -p.gas` (no deadzone, no hold) and keeps its old trim number as `p.trimIn` (the autopilot trim of a bot).
  - **Navigator:** removed from `BUILDS.classic` only when HELM_V2 is on (it changes the seeded runs, so with `NO_HELM_V2=1` she is still there and every baseline stays byte-identical, nothing was re-snapshotted); the glyph `N` and its removal entry in `buildSlots.js` are gone; the `navigator` kind stays valid for old saved builds. `--check-classic` compares the fixture minus the Navigator when HELM_V2 is on.
  - **Bots and fires at a repair (found by `--check-ring`):** `config.BOTS.FIRE_AT_REPAIR` (on with HELM_V2): a fire within `MODULES.FIRE_RADIUS` of a broken critical part (the boiler that has just blown) is sprayed first (an urgent fire job in `bots.js listJobs` and in `goingDown.js botJobs`). Before it, the bot at the hammer burned, stepped out, walked back and burned again, so the boiler stayed broken ~40 s, took the helm's pipe with it and she crashed. Not caused by the new helm: the tower on Easy, 4 bots, 20 seeds, failed 2 (old helm) / 3 (old helm, no Navigator) / 4 (new helm) times before the fix and 0 times after.
  - **Numbers:** botsim classic, route map, 4 min, seeds 1-6: net speed 173 px/s (old helm) -> 180 (new); voyagesim classic 4 min x 36: falls per voyage 0.4 -> 0.2, stops 0.7 -> 0.7; Sparrow human profile 10 min x 12: falls 2.5 -> 2.1, stops 2.0 -> 1.8 (noise).
  - **Tools:** `--check-helm` (`tools/helm-check.mjs`), `tools/helm-shots.mjs` (a real Chrome: the helm phone in normal and EXPERT mode, a real drag on the stick; shots `../3d-screenshots/helm_*.png`).
- **F2 done (2026-10-12):** `host/alarms.js` is the one voice of the TV banner: every writer (about 100 in 38 files) now calls `world.say(kind, text, pri, hold, at)`; `state.ev.warn` / `warnText` stay as its output and `state.ev.q` is the queue. `config.ALARMS { ENABLED, HOLD 2.5, PREEMPT 8, PRI { crash 9, falling 8, boarders 7, blaze 7, helm 6, structure 6, setpiece 5, objective 5, fire 4, info 2 }, QUEUE 3, STALE 6, PHONE_ONE_LINE, PHONE_ALL, ALSO }`. A lower priority waits, an equal or higher one takes over once the banner on screen has had HOLD s, 8+ cuts in at once (a cut-off banner of priority 6+ comes back), the same words are merged. render.js draws a small "ALSO: ..." line over the banner for the next one waiting; the phone gets `alarm` (the top alarm that concerns its deck or seat, or a crash / FALLING) and `controller/ui.js` `infoLine` is an ordered rule list (alarm, status, hurt, hint) instead of the 13-way ternary. Text only: `--check-botsim`, golden and frames are byte-identical with it on; `NO_ALARMS=1` is the old last-writer banner (the checks that read the banner text right after an event - ring, creature, collide, turn, hatch, match, scrap, gas, fire, escort-crash, squadrons, gunship-ship - pin it). `--check-alarms` (`tools/alarms-check.mjs`), `tools/alarms-shots.mjs` (a real Chrome; shots `../3d-screenshots/alarms_*.png`). 12 min, 8 bots, Normal: 13.0 banners/min and 5.7 cut off before they could be read (old) -> 10.9 and 0 (new); the longest a priority 8+ alarm waited: 0 s. Already failing before F2: `--check-two-ships` (`gdSince` is not a registered ship key), `--check-gunship-ship` (c).
- **F10 done (2026-10-12; absorbs SHIPS_BOOK L6):** `config.CONTROLS.ROLE_CARDS { ENABLED, VERB_AFTER 5, CARD_TIME 8, HELP_TIME 7, JOIN_TITLE, JOIN_TEXT }`, on in the game; `NO_ROLE_CARDS=1` in a tool is the old game (the botsim, golden and frames gates pin it).
  - **Phone:** after joining, one big card (once per page, not on a reconnect): "You're crew!  Walk with the stick. Press the big button to grab or use things. Follow the GOLD ARROW." - a tap closes it, or it closes itself after 8 s (the F6 CAST OFF toast "GOAL - YOUR JOB" is unchanged and not repeated). A round **?** button (44 px, between the hull bar and Help!, no taller strip even on a 667x375 phone) re-shows the hint: at a station that seat's line from `SEAT_HINTS` (the boiler got one, it had none), free with a gold arrow "YOUR JOB: <verb>" + the job and "Follow the GOLD ARROW", knocked out / carrying coal, ammo or a tool / nothing to do each their own words (`controller/help.js helpFor`, pure text; the card is `#rcard` in controller.html). A tap closes it, 7 s otherwise.
  - **TV:** `host/roleCards.js` (`verbOf`, `idleVerb`); `jobs.js` sets `p.job.verb` and the phone's `job.verb`. Verb by the job's kind (the label's first word as the fallback): fire SPRAY, hole/gas/repair/leak/frame/ice PATCH, ammo LOAD, coal STOKE, helm TAKE THE HELM, revive/help/winch HELP, raider/tentacle/bat FIGHT, and GRAB while a tool, coal or ammo must be fetched first (so a new player first sees GRAB, then SPRAY once the extinguisher is in hand); the rarer jobs get their own word (SHOVEL, PUMP, TRIM, SAIL, VENT, DUMP, CUT, PULL, HEAL, JUMP). SHOOT has no job that sends a crewman to shoot, so nothing maps to it (a seated-idle gunner, F4, shows his own job's verb). A dark plate with gold letters over the colour marker (above the arrow, or in its place once he has arrived) for a human free (no station, nothing in work) for more than 5 s with a job on offer; two crew side by side get plates at two heights. Drawn in `render.js` at the two places that draw the arrow: the 2D view and the 2D layer over the 3D view, so **view3d/ is untouched** and the verb shows in 3D by itself.
  - **Tools:** `--check-role-cards` (`tools/rolecards-check.mjs`: the verb map for every job kind, GRAB while fetching, the first-word fallback, the 5 s threshold in a real sim (4.0 s none, 6.0 s GRAB, extinguisher in hand SPRAY, a seat or a bot none), 8 humans for 40 s with 0 wrong frames, the ? card for each of the 13 station kinds, the page, the switch), `tools/rolecards-shots.mjs` (a real Chrome, 2D and 3D; shots `../3d-screenshots/roles_*.png`: join card, ? button, ? card at a job / at the helm / on a small phone, the TV with verbs).
- **F11 done (2026-10-12; = STRUCTURE.md WP6, and the first half of WP2): one rule set.** `NO_STRUCTURE` and `config.STRUCTURE.ENABLED` are gone: the structure game is the only rule for the co-op ship (the enemy gunship, a Versus ship and a half that split off have no frame - `structure.on()` false - and still play the old hull bar until WP3; that is why `damageHull`'s hull-bar branch and a small drain branch in `shipSim.js stepUpkeep` are still there, now reading `config.SHIP.DRAIN`).
  - **Removed:** the legacy last stand in `goingDown.js` (`tryStart`, `spawnHoles`, `spawnCargo`, the non-live `update`, `succeed`, `fail`, `pumpMul`, `used`, and the config `GOING_DOWN` keys only they read: `ENABLED TIME TIME_PER_MISSING SURVIVE_HULL HOLD_HULL GRACE LEVEL_GAS FALL_* START_GAS PUMP_MUL HOLD LEAKS_* LEAK_MUL CARGO`); `startFall()` is the one hook left, for the gates; `tools/goingdown.mjs`. `measure()` stays (the build gauge the engine-size and hatch gates weigh with). `FALLING` is the continuous lift rule only; the TV's "HOLD IT" reads `STRUCTURE.LIFT.END`.
  - **Creatures on segments:** `structure.js creatureHit(ship, x, y, hull, { power, kind })` (the segment under the blow through `structure.hit`; a ship with no frame falls back to the hull bar). The Kraken's rip (no part to break) and slap, the breach smash (`kind: 'rock'`: the keel under the shadow), the Drake's swoop, tail lash, lunge and lava spout (keel), its breath (the segment the cone first scorches) and the Thunderbird's pass all call it instead of `damageHull`. No number changed: `HULL` / `POWER` keep their meaning (old hull points; x the damage scale x `HP_PER_HULL`), the blow just lands on ONE segment instead of the shim's four. Flame, a flood, bats, a bomb bay and scraping still use `damageHull` (the second half of WP2).
  - **One truth:** `state.ship.structure` is the reading, `state.ship.hull` stays as its mirror for the phone's bar, the TV HUD and the Versus readers. `structure.js hullOrStructure(body)` (structure, else the hull bar of a ship with no frame) is what the bots' dares and rescues, the sound's hit thump, the Book's crisis, the dock (`needsHull`, the bots' MEND HER choice), `buildStats`, `botsim` and `voyagesim` read. `step()` sets `structure = null` on a ship with no frame so a stale reading cannot leak into Versus. `ships.js` registers `gdSince` as a ship key (this fixes `--check-two-ships`, failing since F5).
  - **Baselines re-snapshotted once (`tools/fixtures/botsim-baseline.txt`, `golden.json` + `golden-table.txt`, `frames/`); new `--snapshot-botsim --force [note]` mode.** The nine botsim runs have no creature and no fall, so with the new code they play byte for byte what the structure game played before this change (checked); what moved is hull bar -> structure game (3 min, 8 bots, Normal, 9 runs, old -> new): wrecks 0 -> 0, errors 0 -> 0, no NaN; average hull 97.1 -> 99.6 (the meter is the weakest load-bearing segment, so a deck-end hole or a fire under the keel is no longer 1/3 of "the hull"); kills 26.3 -> 23.8; fires lit 0.7 -> 0.8; hauls 4.1 -> 4.8; knock-outs 4.8 -> 5.6; hearts lost 6.1 -> 8.3 (the frame and the fires share the crew); steam, gas and blowouts unchanged within noise. golden: voyagesim `--build none` Normal 7/10 -> 3/10 victories (median 34.5 -> 45 min), Easy 8/10 -> 5/10 (32.4 -> 41.7): the known price of the structure rule (STRUCTURE.md balance pass: 18/48 -> 6/48 with only structure on) plus the F-package pins; botsim 10 min, 9 runs, old -> new means: kills 105.8 -> 78.8 (8 of 9 runs lower: FALLING pulls gunners off the guns and the bots hammer frames), missions 2.2 -> 1.7, wrecks 0 -> 0, hull 92.5 -> 92.9 with one low run (network seed 1: 67.9, a fire under the crew for 100 s with `NO_PARTY` pinning the old fire numbers - 104 knock-outs, 2 break-offs, 6 falls, 1 crash), errors 0, no NaN. frames: reference traces re-recorded, hull 97.8 .. 100 on the noise bands. The old files are in git history.
  - **Creature fights (`--check-creature` on the structure game, 422 pass, 0 fail; was pinned to the hull bar).** Six scripted checks read the hull MIRROR and the weakest-segment meter, which a blow on a non-critical segment does not move: they read `frameHp` (the sum of the frame's soundness) or the per-segment loss now. Fairness, 6 minutes, 8 bots, Normal, the old shim against the placed blow: Kraken 42 seeds: wrecks 1 -> 3, falls 52 -> 69, crashes 11 -> 24, killed 17 -> 17, meter mean 93.1 -> 92.9; with the creature's blows switched off entirely (18 seeds) the crashes were still 15, so most of that is chaos in a few runs that drown (the Kraken drags her into the sea) and not the damage. Drake 6 seeds: wrecks 0 -> 0, meter mean 95.5 -> 87.5, the worst segment 84 -> 46 %. Thunderbird 6 seeds: 0 -> 0, 98.4 -> 92.9, worst segment 92 -> 76 %. Nothing gave way (0 splits) in the 54 creature runs; the placed blow is the point of WP2 (a segment to shore up) and no tuning was needed. `botsim` prints `falls by cause` on its structure line.
  - **Gates:** `--check-creature`, `--check-structure` (section 9 is now "a creature hits one segment; a ship with no frame keeps the hull bar"), `--check-log` (its scripted scenes use real lift failure and `sim.wreck`), `--check-stop-shape` (the dock test lowers the frame), `--check-hatch` (pinned like the yard and gas gates with `NO_HELM_V2` etc.; keeps the fall alive with torn bags), `--check-two-ships`, golden, frames, botsim, ring, party, guns, alarms, helm, role-cards, curriculum, fire, health, yard, breakoff, gas, squadrons, escort-crash, scrap, match, turn, `--lint`, `--check-3d-lint` all green. `--check-gunship-ship`: the parity's hull comparison is printed, not gated (with the structure rule it is noise, WP3); (c) "she fires: 0 cannonballs" was already failing and still does.
- **F9 done (2026-10-12; folded into F11):** `config.PACING.SUPPLY_AMMO` 8 (was `+ 8` in `simulation.js`), `config.ENEMY.SPAWN_BAND [-700, 200]` (the fighter's first run height, `threats.js`), `config.SHIP.DRAIN { BREACH 0.5, FIRE 0.35, MUL 2 }` (the hull-bar drain of a ship with no frame, `shipSim.js`, and the estimate `botsim` / `voyagesim` make of what fires and breaches ate; one formula, three readers), `config.BOTS.SURGE_MAX_PRESS 78` and `SURGE_MIN_FUEL 25` (the last literals of the bots' surge). Verified already in config: `RAIDERS.STRIKE_CD` (F5), `BOTS.PROFILES` with the link and surge timings (F8), `VOTE.BOT_THINK` and `SHOP.BOT_REPAIR_CHANCE` (F6). New `--check-hygiene` (`tools/hygiene-check.mjs`): a grep that fails if any of those literals comes back, if `NO_STRUCTURE`, `STRUCTURE.ENABLED`, `tryStart` or `pumpMul` reappear, or if a creature calls `damageHull` again. Byte-identical: the moved numbers have the same values.
- **voyagesim before / after F11 (24 runs, Normal, bot profile; the game as it ships, so the death spiral is still there):** Sparrow wins 1 -> 1, timeouts 18 -> 18, mean stops 4.7 -> 4.7, falls per voyage 15.1 -> 15.2, crashes 2.5 -> 2.5, overrun 2.17 -> 2.50; classic wins 1 -> 1, timeouts 14 -> 14, mean stops 4.6 -> 4.5, falls 13.8 -> 14.0, crashes 3.4 -> 3.4, overrun 1.71 -> 1.71. Unchanged within noise, as it should be: the game already ran the structure rule, only the creatures' blows moved.
- **F12 small ships crack castles (2026-10-12; branch worktree-agent-ae935c0b09628e50c, not merged; gates partly met):** `config.RING.FAIR { ENABLED, GUN_RESTOCK 1, BOT_LEAD 8, KEEP_GATES true }`; `NO_RINGFAIR=1` in a tool is the old game byte for byte (the baseline, golden, frames, curriculum and the other pinned gates set it beside `NO_GUNS`).
  - **Cause (measured with `ring-trace.mjs --build sparrow --detail 1`, `botsim --map ring`, a new `tools/voyagesim` ring line):** it was not the cores' toughness. (1) The shutter's window is a bomb-bay moment (`RING.CORE.RESTOCK` fills the bay; a bomb is 6 shell points) and the Sparrow has no bay: her one gun that can reach a core (the Fore Sponson; the Nose and Tail guns point sideways and cannot) had spent its 20 shells on the face's guns and met the window with 0-5 (gate 2 of the trace: 5 shells, 0 for the next window), so a face took 3-4 windows (90-130 s each) instead of 1-2 and a fortress did not fall in 8 minutes (1 of 4). (2) Nobody was sent to that gun for the window when the crew was busy (fires, boarders). (3) A stale Flagship: a limp home makes `squadrons.reset()` tell the boss to leave, and a boss moored to a citadel never left (the moored branch of `updateBoss` has no leaving code), so after one wreck at a citadel the old Flagship hung on the old mooring for good: the new castle's moorings cut nothing and the stop could not be won ("ring: 2/2" for 6 to 15 minutes in the voyages, and in the classic ship's voyages too). (4) What the fix does not touch: most Sparrow castle stops that never finish are lost to the ship (lift failures, fires, the single bag, 15 falls a voyage), and a Sparrow that loses the Fore Sponson (it breaks off) has no gun that can reach a core at all.
  - **Design (all behind `RING.FAIR.ENABLED`):** (a) `ring.js restock()`: every time a shutter opens a ship with NO bomb bay has every broadside gun's magazine filled (the bay's refill is the classic ship's; flame, mine and harpoon guns are left alone). (b) `bots.js ringWindowGun`: while a shutter is open, or opens within `BOT_LEAD` 8 s, and nobody is at a gun that can reach the core, one bot takes it ahead of the chores and the fighting (a ship with a bay keeps her bay's man). (c) `squadrons.js updateBoss`: a moored Flagship that is leaving, or is not the current castle's, is dropped (the new castle hangs its own). (d) `ring.js keepDown` (`KEEP_GATES`): the gates the crew had breached stay breached when a limp home flies the stop again (`state.run.castle[stopId]`, forgotten when the crown falls). (e) `simulation.js partCard`: ring stops count as raids for the dock's "bomb bay" recommendation (a bay-less ship is offered it more often; `partsShop.js` needsOf is unchanged).
  - **Tools:** `tools/voyagesim.mjs` prints a `ring stops (F12)` line (per castle: how many fell, the median minutes of those that fell, how many were unfinished by the clock or by the end of the run and how long she was there, attempts, minutes to the first gate, faces down) and a `castles:` note on every voyage row; `botsim` prints `ring N face-fall times`; `ring-trace.mjs --build sparrow --detail 1 --from S`; `ring-check.mjs` (p) the Sparrow's magazines at the window, (q) kept gates and the old Flagship (both with their switch off).
  - **Numbers:** `botsim --map ring` (Normal, 8 bots, 8 min, seeds 1-4): Sparrow tower 4/4 fell, median 150 s -> 98 s; fortress 1/4 (417 s) -> 4/4 (median 273 s, 235-299 s); citadel 2/4 (326 s) -> 4/4 (245 s). Classic: byte-identical (tower 98 s, fortress 365 s, citadel 2/4). `voyagesim --runs 24 --seed 1 --build sparrow`: victories 1 -> 4, timeouts 18 -> 18, mean stops 4.7 -> 5.1; castle stops fell 9 of 28 -> 13 of 32 (tower 5/7 -> 6/7, fortress 3/9 -> 3/11, citadel 1/12 -> 4/14); minutes per column 5 / 6: 16.0 / 12.3 -> 12.7 / 11.8; the citadel's median fall 6.6 -> 8.5 min (more voyages get there). Classic: victories 1 -> 3, timeouts 14 -> 13, castle stops fell 9 of 29 -> 12 of 30, column 5 / 6: 10.3 / 10.3 -> 9.5 / 9.0.
  - **Gates NOT met:** the voyage timeouts stay at 18 of 24 for the Sparrow (6 end at a castle, 12 elsewhere: lairs 3, outposts 4, caves 3, routes 2) and a fortress still falls in only 3 of 11 voyages: the Sparrow is wrecked at the castle (the first gate falls a median 7.5 minutes in, after 2.1 attempts) or has lost her Fore Sponson. The classic ship has the same trouble at the citadel (fell 3 of 17). KEEP_GATES changed nothing measurable for the Sparrow (a gate seldom falls before a wreck) and gave the classic one more victory (within noise).
  - **Open, for the next builder:** the Sparrow's Tail Gun (aim 3.49, arc 1.1) could cover straight down (aim 2.5, arc 1.5) and so could reach a core from the hover lane: two core guns instead of one (not done: it changes the Sparrow's whole fight and F4's gun sides); a bay-less ship with no core-reaching gun left has no way to breach (hover lower, a charge from the gallery, or the keep chip from the Nose gun on the wall).
- **Check cleanup (2026-10-12): the modes that were already failing.** Game bugs fixed: (1) the enemy gunship's gunners only pulled the trigger inside a crew shell's 1520 px (`aim.js solution`), while her director lets her fire broadsides of her own slow cannonballs from up to `GUNSHIP.FIRE_RANGE` 2300: on a firing spot 1500-2300 px out she sat manned and ready and never fired (now her guns' range is the director's); (2) at the bow, a hookshot that cannot catch ("Too far to hook!", "She is turning round!") took the Action button whenever a gunship was in the sky, so the fore bag's gas valve there could not be shut or opened (`shipSim.js useFor`, `idle` on the hook offer in `gunshipShip.js` / `gunship.js`); a bot sent to a gas valve with a hammer in hand shored up the frame instead of turning it. Stale tests fixed: `--check-match` (the porthole's hysteresis is measured from the gap where the view really splits, about 13 400 px, not START_GAP + 700), `--check-engines` (the scripted helmsman flies the pre-F3 controls, so those runs pin `HELM_V2` off; a new line flies the per-engine levers with today's helm and EXPERT), `--check-bags` (the one-bag-down flight is read 10 s after the rupture, as the other lines: with the pumps cut every ship sinks to the floor by 50 s and the structure rule crashes her there; the valve scene's helmsman pumps with the stick under `HELM_V2`), `--check-gunship-ship` (c) ("she fires" in a scene where nobody boards her: in the 8-bot fight our bots hook and board her before her first broadside on some seeds, FIRE_EVERY s after she takes station; hits counted with `onBulletHit`), `--check-physics` (the Ship button), `crew3d-check`, `portholes-check`, and the ring draw calls (3D.md section 30). `--check-botsim` byte-identical. Not fixed here (F13's area): the bots refill a patched bag only as far as the helm needs lift, so on some seeds (botsim `--build bags --rupture 40`, seeds 3 and 6) the fore bag stays low; `--check-bags` uses seed 1 (20 s).


## 0. What was measured (on top of the balance table)

| Run | Result |
|---|---|
| Classic, 8 bots, Normal, open map, 6 min (`BOT_ACT=1 botsim --seed 3`) | hull never under 99; **gunners idle 64% of seat time**; bot time spread over 14 seats (helm 12%, lookout 7%, best gun 5.5%); 13 moments / 10 min |
| Classic, 2 "human" bots + 2 mates, cave, 6 min | **idle 53%**, 13 kills, hull 100 the whole time |
| **Sparrow** (the ship the browser starts with: `config.js START_BUILD: 'sparrow'`), 8 bots, Normal, 8 voyages (`voyagesim --build sparrow --seed 11`) | **2/8 wins, 4/8 TIMEOUTS** (the ship sits on the ground with a cold boiler for up to 40 min), 2 wrecks at stop 3; **17 FALLING alarms per voyage**; **21 of 23 SALVAGE RUN offers taken**; 8 lairs planned, 0 met; 71 scrap bundles dumped |
| Sparrow seed 12, minute by minute | Stop 1 ("danger 1", bats and imps only, a narrow-pass cave): 8 falling alarms in 9 minutes, one limp, 5 fires, 4 broken modules, both engines broken by minute 6. The cave floor is the enemy; the structure rule turns every scrape into a failure. |

The classic 4/48 table describes a ship new players never fly first. The one they do fly does worse.

## 1. In plain words: the eight biggest findings

1. **The game humans get is not the game being balanced.**
   - Every tool defaults to the classic ship, but the browser starts the Sparrow.
   - The Sparrow has about 9 seats for up to 16 phones, and she cannot fly the stop-1 cave without grinding her keel.
2. **The difficulty curve is a cliff with a flat top.**
   - Stops 1-2 are dull: hull 99-100, half the crew idle.
   - Stops 3-5 pile fires, raiders, lift, structure, bombers and the gunship on at once.
   - Voyages that survive run into the 45-minute cap.
3. **Six systems share one death spiral.** A hit breaks a pipe, so steam leaks, the pump cannot lift and she sinks. FALLING pulls everyone off the guns, a raider knocks out the helmsman, and fires drain the segments under the boiler, so she crashes. 17 FALLING alarms a voyage is a siren that never stops.
4. **Nobody can read it.**
   - 100 places in 38 files write the one TV banner.
   - The phone's Action button has 70+ label rules.
   - The TV carries a dozen panels and gauges.
5. **Roles are lopsided.**
   - The helm has five controls on one phone.
   - Gunners sit idle two thirds of the time.
   - The stoker has one real decision that is rarely reached.
   - Building does not exist yet as a role.
6. **The catch-up branch ate the voyage.** The Sparrow gets a SALVAGE RUN almost every stop, so the curriculum, the lairs and the fortress never arrive.
7. **Menus take a fifth of the evening:** up to ~95 s of voting per stop.
8. **The bots cannot fail like humans,** so the win rate is a weak compass.

## 2. What the game should feel like

"Overcooked on an airship."
- One shared crisis everyone can see on the TV, and one clear verb on every phone.
- A crescendo in every stop: flight, then one big thing, then the escape.
- A breather with a laugh, and a cheer when the big thing dies.
- A 25-35 minute evening that ends on a postcard with your name on it.

Panic should come from ONE thing at a time getting out of hand, never from five sirens.

## 3. The top changes

1. **Flatten the cliff.**
   - The Sparrow gets an open-sky stop 1; the classic gets real threats at stop 1.
   - Dangers change from [1,1,2,2,3,3,3,3] to [1,2,2,2,2,3,3,3].
   - At most one salvage run per voyage.
2. **One doom clock: LIFT.**
   - Raise `GOING_DOWN.ALL_HANDS`.
   - No new fires or raiders arrive during a fall.
   - Halve what fires and breaches take off the frame.
   - Fix the "sitting on the ground with no alarm" soft lock.
3. **One voice:** an alarm arbiter with priorities and a hold; the phone shows one line.
4. **Guns that matter:**
   - set pieces arrive on the manned side;
   - idle gunners get a job arrow;
   - small crews are offered fewer stations.
5. **A dock in 60 s:** three cards, shorter votes, stat upgrades folded into parts.
6. **A helm for one thumb:**
   - stick = speed and climb, lever = cruise, plus COME ABOUT;
   - SPLIT goes behind an expert toggle;
   - the dead Navigator station is removed.
7. **Bots that fail like humans,** and a voyagesim that reports fun metrics and defaults to the Sparrow.
8. **Pause what adds seats** before the seats that exist are fun: Away Team A0-A3, Secret Orders L5, STRUCTURE WP3, gas types.

## 4. Diagnosis: roles

| Role | Fun on a phone | Decisions | Idle / overloaded | Fix |
|---|---|---|---|---|
| **Helm** (`shipSim.js` helm, `controller/input.js`, `enginePanel.js`) | Good core | Too many at once: five controls | Overloaded; a single point of failure | One-thumb helm (F3); a helm KO shows "TAKE THE HELM" to the nearest phone |
| **Gunner** | Good when there is a target | Which target, when to prime | **Idle 64%** | Set pieces on the manned arc; a job arrow when idle; fewer guns for crews under 8 (F4) |
| **Stoker / engineer** | A chore loop with one good push-your-luck (overdrive) | Few; the valves are hidden | Overloaded in a fall, idle otherwise | Make overdrive visible on the phone; one ENGINEER card (F3/F10) |
| **Repair / firefighter** | Fine | Which fire first | The walking tax | Fewer fires at once for small crews (F5) |
| **Lookout / spyglass** | Passive panning | Few | Idle | Show the spot as a team bonus on the TV; never offer it to crews under 5 (F4) |
| **Bombardier** | Great in the 20 s it matters | When to drop | Idle on cave/route maps | Every stop gets a drop window (F6) |
| **Escort pilot** | Hero moment | Where to fly | Marginal (auto patrol) | Own-ship crash OFF (**owner decision**); auto patrol only after 60 s untouched (F4) |
| **Deflector / Coil / Searchlights** | Deflector dull, coil fun, lamps only in the dark | Few | Idle most of the voyage | Deflector only for imp/bomb set pieces; coil and lamps stay |
| **Hookshot / boarding / cannon / hijack** | The best moments in the game | Yes | Rare | Protect; one boarding window per stop (F6) |
| **Scrap carrier / builder** | Not yet a role (0.3% of crew time) | None | - | Pause the switch until scrap can be spent (F7) |
| **Navigator** (`shipBuild.js`) | A station with no behaviour | - | Dead | Cut |
| **Ship's mates** | Invisible helpers | - | Fine | Keep |

How it scales:
- **2-4 players:** stop 1 is empty (53% idle).
- **12-16 players:** the classic has 20 seats but only ~6 are useful at once, and boarding becomes a brawl of six. F4 and F5 cap seats and raiders by crew size.

## 5. Diagnosis: systems

| System | Verdict | Reason |
|---|---|---|
| Lift / gas / steam | **KEEP, make it THE clock** | Physical and readable; it is already the thing that kills |
| Structure segments and splits | **SIMPLIFY** | Halve the fire/breach drain; end sections can't break off before stop 3; fix the ground soft lock; bring WP6 forward |
| GOING DOWN legacy branch | **CUT** | Two rule sets in one file |
| Pacing director (`simulation.js`) | **KEEP, retune** | No set piece during a fall; a stop shape; spawn on the manned arc |
| Curriculum + salvage catch-up | **SIMPLIFY** | Max one salvage run; Sparrow stop 1 in open sky |
| Fires | **SIMPLIFY** | Cap by crew size; slower spread early; no new ignition while FALLING |
| Raiders | **SIMPLIFY** | A telegraphed boarding set piece, capped by crew size; KO 12 s → 8 s |
| Mid-voyage zeppelin bosses | **CUT, KEEP the Flagship** | A parked HP bar; lairs, rings and the gunship are the memorable bosses |
| Gunship, boarding, hookshot, hijack, crew cannon | **KEEP** | The hero moments |
| Creatures / lairs | **KEEP, shorten** | HP ×0.8 on Normal; one lair per voyage |
| Rings / castles | **KEEP** | The finale and the strongest TV picture |
| Squadrons | **KEEP** | Good |
| Lone fighter + mines | **MERGE / cut early mines** | The lone fighter becomes a squadron of one; no mines on stops 1-2 |
| Scrap and the hold | **PAUSE the switch** | No spending yet; return with G2 plus a one-frame "scrap patch" |
| Shop stat upgrades (15) | **CUT to 6** | Parts cover them; the dock is too long |
| Gas types | **PARK behind Veteran** | Depth nobody needs at a party |
| Links (loader, lookout, surge) | **KEEP** | Needs visibility, not code |
| Portholes, spyglass, radar, HELP! | **KEEP** | Readability tools |
| Ship's Book | **KEEP, continue L2** | Cheap identity |
| Secret Orders (L5) | **DROP for now** | A second channel on a phone that can't yet show one line |
| Away Team (A0-A3) | **PAUSE** (**owner decision**) | More seats before the seats are fun |
| Sails / swivel engines / hatches / towlines / mine layer | **KEEP, off the first 3 docks** | Niche parts |
| Escort own-ship crash | **CUT for own ship** (**owner decision**) | Punishes the hero seat beginners pick |

## 6. Readability

- **The banner:** one slot with 100 writers and no priority; the last writer wins. F2 fixes this.
- **The phone's info line** (`controller/ui.js`) is a 13-way ternary, and "Hey!" is the idle label.
- **Protect:** the gold job arrow, the hold ring, the hearts, the LIFT/STRUCTURE bars, the comic pops, the portholes.
- **Missing:**
  - the verb over an idle player's head on the TV;
  - a 3 s briefing card with the stop's goal;
  - a role card on join.

## 7. Difficulty and pacing

- **The curve:** column 1 is bats and imps (the classic is bored), but it's a cave, which the Sparrow can't fly. Columns 3-5 add everything at once.
- **Recovery:** there are mend paths, but no in-mission breather; FALLING doesn't stop boarders, bombers or spreading fire.
- **Comebacks that work:** limp home, emergency ballast, SHE HOLDS. Add a 20 s ESCAPE calm after the objective (F6).
- **Session length:** about 10 min of each voyage is menus. Target median 28-34 min, 95th percentile under 40.

## 8. Code problems that matter for gameplay

- **Tunables outside config:**
  - the hull drain in `shipSim.js`, duplicated in voyagesim and botsim;
  - supply ammo in `simulation.js`;
  - bot vote delays and the repair chance;
  - the raider strike cooldown in `raiders.js`;
  - bot link constants;
  - the fighter spawn band in `threats.js`.
- **Entangled systems:**
  - `goingDown.js` holds two rule sets;
  - `state.ship.hull` mirrors the structure meter;
  - `damageHull` is a shim.
- **Bots vs the real game:**
  - botsim forces the curriculum, lairs and spyglass off;
  - voyagesim defaults to the classic;
  - there is no human profile;
  - `jobs.js` never gives a seated player an arrow.

## 9. Work packages (one Opus builder each)

**Common rules:**
- Tunables go in `config.js`, and each new rule sits behind a flag whose OFF state is byte-identical (`--check-botsim`).
- Run voyagesim before and after on both `--build sparrow` and `--build classic`, 24 seeds, Normal.
- Don't touch garrison D1's files while it's in flight.

### F1. The Sparrow is the real game: the ramp (M)
- **Feel:** the first stop has something to shoot and nothing that kills; stop 3 is the first scare; the finale is the hardest thing.
- **Files:**
  - `config.js` `VOYAGE.CURRICULUM.TABLES`, `SALVAGE`, `BRANCH_UP`;
  - `simulation.js` `markSalvage`, `newRun`, `setStartBuild`;
  - `voyage.js` `generateCurriculum`;
  - `tools/voyagesim.mjs`, `tools/curriculum-check.mjs`.
- **Design:**
  - Column 1 is open sky for a start build without a bomb bay (gun-only outpost or a wide pass).
  - Dangers become `[1,2,2,2,2,3,3,3]`.
  - `BRANCH_UP` goes from 0.55 to 0.35.
  - `SALVAGE.MAX_PER_VOYAGE: 1`, never in column 2.
  - Column 2 gains strafers.
  - `START_BUILD_BY_CREW: { max: 6, small: 'sparrow', big: 'classic' }`.
- **Gate:**
  - Sparrow, 48 runs: victories 30-50%, timeouts ≤ 4, mean stops ≥ 4.5, stop-1 falling alarms ≤ 1, salvage runs ≤ 1 per voyage, lairs met ≥ 50% of planned.
  - Classic, 48 runs: victories 35-55%, stop-1 hull mean ≤ 97.
  - `--check-botsim` byte-identical.

### F2. One voice: the alarm arbiter (M)
- **Feel:** the TV says one thing at a time, in order of danger; the phone says one line.
- **Files:**
  - a new `host/alarms.js` (`say(kind, text, pri, hold)`, a queue, `tick`);
  - every direct `state.ev.warn/warnText` writer: `simulation.js`, `threats.js`, `goingDown.js`, `ring.js`, the creature files, `environments.js`, `envDeep.js`, `gunshipShip.js`, `course.js`, `shipSim.js` (text only);
  - `render.js` (banner plus an "also" ticker);
  - `controller/ui.js`.
- **Design:** `config.ALARMS = { ENABLED, HOLD: 2.5, PRI: { crash 9, falling 8, boarders 7, blaze 7, helm 6, structure 6, setpiece 5, objective 5, fire 4, info 2 }, QUEUE: 3, PHONE_ONE_LINE }`.
  - Priority 8 and above always preempts.
  - `state.ev.warnText` stays the output.
- **Gate:**
  - A new `--check-alarms`: no two banners within HOLD except priority ≥ 8; FALLING shown within 0.1 s; 0 direct writes left (a grep).
  - `--check-botsim` byte-identical.

### F3. A helm for one thumb (S)
- **Feel:** a new player takes the wheel and flies within ten seconds.
- **Files:**
  - `controller/input.js`, `controller/ui.js`, `enginePanel.js`;
  - `shipSim.js` helm input mapping;
  - the `bots.js` helm branch;
  - `shipBuild.js` (Navigator), `buildSlots.js`, `blueprintArt.js`.
- **Design:**
  - `CONTROLS.HELM_V2`: stick y = pump/vent, stick x = ahead/astern, the speed lever = cruise, and the pressure lever becomes a readout.
  - Trim folds into the autopilot.
  - SPLIT only with `CONTROLS.EXPERT`.
  - Remove the Navigator station.
- **Gate:**
  - `--check-turn`; `--check-botsim` byte-identical with HELM_V2 off.
  - With HELM_V2 on: net speed within 10%, falling alarms unchanged.

### F4. Guns that matter (M)
- **Feel:** when something attacks, it attacks where you are standing.
- **Files:**
  - `simulation.js` pacing (`pickSetPiece/enterPhase/updateTempo`);
  - the `squadrons.js` spawn sides;
  - `threats.js` `spawnFighter`/`updateMines`;
  - `jobs.js` (the busy rule), `controller/ui.js` `showJob`;
  - `links.js` (per-gun idle), `escort.js`, `config.PACING`.
- **Design:**
  - `PACING.AIM_AT_GUNS`.
  - From column 3: `RATE_START` 0.45 → 0.6, `CALM` 34 → 24, `PEAK_MAX` 50 → 40.
  - Two set pieces from column 5; `MINES.FIRST_COLUMN: 3`.
  - `JOBS.SEATED_IDLE: 6`.
  - Escort crash only into enemies (**owner decision**).
  - `CREW_SEATS` mothballs 2 stations for crews under 8.
  - The lone fighter folds into a squadron of one.
- **Gate:**
  - Gunner idle 64% → ≤ 40%; moments ≥ 12 per 10 min; hull mean 95-99.
  - `--check-squadrons`; byte-identical with the flags off.

### F5. Raiders and fire as a party, not a spiral (M)
- **Feel:** boarders are a 40-second brawl everyone can see coming; fire is a job, not a verdict.
- **Files:**
  - `raiders.js`, `gunshipShip.js`, `squadrons.js` (boss boarders);
  - `fire.js`, `fireModel.js`, `goingDown.js`;
  - the `RAIDERS/FIRE/GOING_DOWN/STRUCTURE` config.
- **Design:**
  - `RAIDERS.PARTY`: a 3 s announced boarding; max `1 + floor(crew/3)` aboard; KO 12 → 8 s; cutters prefer stations; no boarding while FALLING or within 10 s of SHE HOLDS.
  - Fire: `CAP_BASE` becomes 3 + crew/3; `SPREAD_EVERY` 7 → 10 on columns ≤ 3; no new ignition while FALLING.
  - `ALL_HANDS` 12 → 20; `BREACH_RATE` 0.012 → 0.007; `FIRE_RATE` 0.01 → 0.006.
  - Soft lock: grounded for 40 s, slow and with no alarm, raises FALLING.
  - End segments with a boiler or helm: grace 8, and no break-off before column 3.
- **Replaces** the "relentless raider boarding" brief (**owner decision**).
- **Gate:**
  - voyagesim `overrun` ≤ 0.5 per voyage; Sparrow timeouts → 0; falling alarms 17 → ≤ 6.
  - `--check-structure/fire/health`; byte-identical with the old numbers.

### F6. Stop shape and a 60-second dock (M)
- **Feel:** briefing → flight → one big thing → escape → scorecard → three cards → go.
- **Files:**
  - `course.js` `startMission`/`mapProgress`;
  - `simulation.js` `updateTempo`, `buildOffers`, `startDock`, `updateVote`, `onMarker`;
  - `squadrons.js` `spawnBoss`;
  - `render.js` vote and scorecard; `controller/ui.js` `showVote`;
  - the config for `SHOP/VOTE/ROUTE_TIME/WAVES`.
- **Design:**
  - A 3 s BRIEFING card.
  - An ESCAPE phase of 20 s after the objective.
  - `SHOP.OFFERS` 6 → 3 (MEND HER / one part or fitting / Cast off).
  - `SHOP.TIME` 20 → 12, `MAX_TIME` 55 → 35, scorecard 8 → 6 s, route vote 20 → 15 s.
  - Upgrades trimmed to 6.
  - No mid-voyage zeppelins; stops without a lair or ring get the gunship as their objective.
- **Gate:**
  - menu ≤ 60 s per stop; median victory 28-34 min; parts bought ≥ 2.5 (Sparrow) / 3.5 (classic).
  - `--check-log/curriculum`; byte-identical with `SHOP.V2` off.

### F7. Scrap: pause the switch until it spends (S)
- `SCRAP.ENABLED` defaults to false until G2 (prices in scrap) ships with ONE frame type: a scrap patch on a failing segment (1 bundle = +0.3 soundness).
- Gate: `NO_SCRAP` byte-identical; `--check-scrap` green when on.

### F8. Bots that fail like humans, tools that measure fun (M)
- **Files:**
  - `bots.js` (think rate, aim, reaction delay, alarm gap);
  - `config.BOTS.PROFILES { bot, human }`;
  - `tools/voyagesim.mjs`: default Sparrow, `--profile human`, and new lines for overrun, idle%, menu s/stop, longest dull gap, time to first threat, falls by stop;
  - `botsim.mjs --profile`, `botbatch.mjs`.
- **Gate:** `--check-botsim` byte-identical with the bot profile; a new `--check-human-profile` snapshot (12 Sparrow seeds).

### F9. Config hygiene (S)
- Move to config: the hull drain, supply ammo, bot vote timings, the repair chance, the raider strike cooldown, bot link constants, and the fighter spawn band.
- Gate: byte-identical, plus a grep gate.

### F10. Role cards and the "what do I do?" verb (S/M)
- **Files:** `controller/ui.js` (a join role card, a `?` button), the `shipSim.js` ui emit, `render.js` `drawPlayer` (the verb over an idle head), `jobs.js`.
- **Verbs:** GRAB / PATCH / SPRAY / LOAD / STOKE / TAKE THE HELM / SHOOT / HELP.
- **Gate:** `--check-frames` unchanged with the flag off; a screenshot gate. Humans: every new phone does a job within 90 s.

### F11. STRUCTURE WP6 now: one rule set (M)
- Delete the legacy GOING DOWN branch, the old drain branch and `tools/goingdown.mjs`.
- Move creatures onto segments (`structure.hit`).
- Re-snapshot the baselines once, and remove `NO_STRUCTURE`.
- Gate: every `--check-*` green; botsim byte-identical to the new baseline.

## 10. Order and parallel pairs

Garrison D1 owns `host/garrison.js`, the `ring.js` hooks, the `maps.js` posts and `shipSim.js impactBody`. Merge D1 first wherever a file is shared.

1. **Wave 1 (now):** F1 + F8 + F7.
2. **Wave 2 (after D1):** F2 + F5. They are not run together, because both edit `goingDown.js`, so they go in sequence.
3. **Wave 3:** F4 + F6. These clash on `updateTempo`, so they go in sequence or are merged carefully. Then **PLAYTEST**.
4. **Wave 4:** F3 + F10. Then **PLAYTEST** again.
5. **Wave 5:** F9 + F11, then G2 + the scrap patch.

## 11. The human playtest script

**Setup:**
- 4-6 friends, Normal, VOYAGE, the Sparrow, TV 2.5 m away, nobody coached.
- The owner mostly watches, with a notepad and a stopwatch.
- Run it after Wave 3 and again after Wave 4.

**The first 3 minutes:**
- Count the "what do I do?" questions (target under 3).
- Note who hasn't touched a station by minute 3.
- Time CAST OFF to the first shot (under 60 s).

**Every stop:**
- At the scorecard ask:
  - "What was the goal of that stop?" (everyone should give the same answer)
  - "What nearly killed us?" (ONE answer is good)
  - "Who did the best thing?" (a name means a moment landed)
- Time the dock (under 60 s).
- Tick laughs and cheers, and every "I can't see what's happening".

**Watch for:**
- a gunner with nothing to shoot for 10+ s;
- two people at one fire while the helm is empty;
- a helmsman who never discovers climbing;
- a banner nobody read before the next one replaced it;
- the ship on the ground with everyone waiting.

**After the run:**
- The next-day retell: count the events (4+).
- "Play again next week?" by a show of hands, and "what would you cut?" on paper.
- Total 25-35 min; menus under 7 min.

**Solo check with bots:** add 4 bots and watch two stops. Then:
- Take a gun. Is there something to shoot within 10 s?
- Take the helm. Are the levers clear without the hint?

## 12. How it fits the queued work

- **CASTLE A0-A3 (Away Team):** PAUSE until after Wave 3 and a playtest (**owner decision**). D1 finishes; D2/D3 (view only) may continue.
- **LOOP:**
  - G2 ships with the scrap patch (F7);
  - G3/T treasure after F6;
  - G7 becomes F8 + F11;
  - G8 after L2.
- **SHIP'S BOOK:**
  - L2 continues now; L3 after Wave 3; L4 Nemesis after F4.
  - **L5 Secret Orders: DROP for now.**
  - L6 folds into F10; L7 goes with F6; L8 is absorbed by F6.
- **STRUCTURE:**
  - WP2 half-lands in F11; **WP3 (enemy structure) PAUSE**.
  - WP4 folds into F2; WP5 is fine.
  - **WP6 = F11, brought forward.**
- **Relentless raider boarding:** replaced by F5's telegraphed boarding set piece (**owner decision**).
- **Outpost treasure:** after F6, as the objective's reward.
