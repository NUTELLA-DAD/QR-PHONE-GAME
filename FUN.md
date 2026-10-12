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
