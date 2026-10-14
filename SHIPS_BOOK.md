# The missing factor: THE SHIP'S BOOK

Fable's game-design study (read-only), 2026-10-10. Lead's notes are marked **Lead:**.

**Lead:** waiting for the owner's OK.

**Status (L0 + L1 built, branch `worktree-agent-abe28dcf40b2d271b`, not merged):**
- **L0 moments:** `moments.js` (world-level `state.moments` ring, in `WORLD_SHARED` with `moment` / `momentNote` / `momentTake` / `momentOverboard`; data only, no random draws, `--check-botsim` byte-identical). Hooks are small `moment()` calls beside the existing sites: `simulation.js` (stat funnel: first fire out, revive under fire, going-down helpers; the boss / Flagship down; a REBUILD bought; limp; ship lost; cannon flight onto the gunship), `shipSim.js` (break-off, overboard fall), `creatureSystem.js` (creature win), `creatureGrip.js` / `creatureDrake.js` / `creatureBird.js` (freed / driven off), `gunshipShip.js` (shot down, charge, captured, fled, boarding kill), `goingDown.js` (saved), `airborne.js` (crew cannon miss, cannon landing). At each stop's end the busiest of each job become "leader" moments. Weights, thresholds and the rest are `config.LOG`. The split-in-half hook is left for STRUCTURE (it does not exist on this base: add `moment('split', ...)` beside the new break code and a `SENT.split` in `logWriter.js`).
- **L1 the Log:** `logWriter.js` (3 variants of every line, a hash picks the variant, no random draws, a line is never told twice in a run), `logArt.js` (the dock's Log line with the quill, PLAY OF THE MISSION on the scorecard, the run-end POSTCARD). `render.js` only changed in the scorecard, `drawVote` (dock) and `drawRunEnd`; `yardArt.js` moves its title up 34 px when there is a Log line. "Nobody did much this mission" is gone (a gentle line names whoever did the most).
- **Gates:** `node tools/buildsim.mjs --check-log [--quick] [--samples]` (`tools/log-check.mjs`), the botsim `moments:` line (before the summary marker; `LOG_PAGE=1` prints the Log and the postcard).
- **L2 built (branch `worktree-agent-abeeb390ec4798746`, not merged): the christening and save v3.**
  - **What the crew sees:** the first CAST OFF of an unnamed ship, with a human phone aboard, opens a NAME vote (5 made-up names, one of each shape: "The Brass Heron", "Lady Marigold", "Pettigrew's Hope", "The Teapot of Larkhill", "The Gallant Finch", and a green "Name her later" card; 14 s, or 1.2 s after everyone has voted), then a 5 s ceremony on the TV (bunting, a bottle swinging in on a rope to the bow plank, glass and foam, her name painted a letter at a time, "Fair winds to her", confetti; a glass-and-bell sound; the phones toast the name). The whole thing is under 20 s; SPACE / CAST OFF again skips the vote or the ceremony (she flies unnamed and is asked again next time). Her name is then on the lobby title, the HUD plate under the gauges, the scorecard, the Log (6 lines say it: `NAMED` in `logWriter.js`), the postcard heading ("THE LOG OF ..."), and the phones. A ship that is lost gets a black-bordered postcard and a place under IN MEMORIAM in the book; the next ship is christened fresh.
  - **The book:** the lobby shows a "THE SHIP'S BOOK" card (the first thing under the title; a "Ship's Book (B)" button and B key; also the pause menu's Ship's Book button). The page opens on a cover (her name, christening date, voyages / victories / stops, the lost ships, the crew's records, the recent voyages) and Left / Right (or a click, or the bar at the top) turn to one postcard for each voyage, newest first.
  - **Save v3** (`airshipVoyage`, still one key): the old fields untouched plus `ship` (name, born, voyages, victories, stops, salvage), `book` (a page for each voyage: the postcard's data; newest 40), `fleet` (lost ships, 12), `crew` (a record for every human by name: voyages, victories, first / last night, stat totals; bots never; 60). v1 and v2 saves load as v3 (fixtures `tools/fixtures/save-v1.json`, `save-v2.json`); the old text is kept aside once (`airshipVoyage.v1` / `.v2`, `.bad` for text that would not parse); odd entries are dropped, unknown fields kept.
  - **Code:** `book.js` (names, v3 normalise, voyage / crew / fleet records; no DOM, no random draws), `christen.js` (the vote, the ceremony clock, the book-keeping at the end of a run), `bookArt.js` (vote screen, ceremony, plate, lobby card, cover), `voyage.js` (`upgradeSave`), `logArt.js` (heading / date / black border / `opts.footer`), `simulation.js` (small: 6 hooks, away from the dock offer code), `network.js` / `host.html` / `menu.js` (button, keys, nav bar, `?christen=0|1`), phone `ui.js` + `controller.html` (the names grid), `sfx.js` (`glass`). `config.BOOK` holds every number.
  - **Switches:** ON in the browser; in a Node tool OFF unless `BOOK_ON=1` (many gates cast off with a human and expect to fly at once; baselines stay byte-identical), `NO_BOOK2=1` off even then; `host.html?christen=0` never (the `*-shots` tools with a phone use it), `?christen=1` christens even a crew of bots (solo try-out). A bots-only crew never christens.
  - **Gates:** `node tools/buildsim.mjs --check-book [--quick]` (`tools/book-check.mjs`: christening flow and timing, skips, who christens, the name everywhere, a voyage's page and the crew records, fleet, save v3 round-trip / v1 / v2 migration / damage, every TV page on a stub canvas with nothing under 22 px, botsim identical with `BOOK_ON=1`), and `node tools/book-shots.mjs [--view 3d]` (real Chrome, own server; pictures `3d-screenshots/book_*.png`).
- **L3 built (branch `worktree-agent-aecea6617cc8cee89`, not merged): the Crew Roster and titles.**
  - **What the crew sees:** a phone that has flown before is welcomed within a step of scanning in (0.2 s in a real browser; the gate is 2 s): the TV lobby shows "Mia the Old Salt returns!" with "9 voyages, 4 won" under it for 8 s (up to 4 at once), and her phone's join card says "Welcome back, Mia!  Old Salt - 9 voyages, 4 won." A new face is "Welcome aboard, Zed - Deckhand!" and the phone card says "You are a Deckhand!" with the usual how-to. The title sits under the name on every row of the scorecard, beside each name on the book's cover, and the Ship's Book has a new page 2, THE CREW ROSTER (title, voyages and wins, favourite station, what they did most, "also" the other titles earned). A title earned at a voyage's end is told to the phone ("New title: Firefighter!") and kept on `state.runEnd.titles`.
  - **Who is who:** the phone keeps its own random id in localStorage (`airshipPid`) and sends it when it joins (`pid`, passed on by `server.js` in `player:joined`), so a new TV session (a new room, a new reconnect token) knows the same phone; a record is kept under that id, its name follows what the phone types, another phone with the same name is another person. A person with no id (a tool, an old phone) is kept by name, as in L2; an L2 record kept by name is claimed by the first phone that arrives with that name. Bots and ship's mates never have a record or a title. Only the typed name, colour and animal are kept (privacy: names only, on this TV's localStorage).
  - **Titles** (`config.BOOK.ROSTER`, rules in `roster.js` `titleFor`, no dice): 14 deed titles (Ship's Lunatic, Gun Captain, Boarder's Bane, Stoker of the Year, Firefighter, Patch Master, Ship's Surgeon, Master Builder, Treasure Hunter, Quartermaster, Bomb Squad, Gunship Breaker, Helmsman, Eagle Eye), each a stat total, a Book moment count or station time with a number to reach and at least `MIN_VOYAGES` (2) voyages; the headline is the one the record is furthest past its number on (a tie: the higher `rank`), else the rank by voyages (Deckhand 0-2, Able Hand 3-7, Old Salt 8+).
  - **Code:** `roster.js` (new: `titleFor`, `favouriteStation`, `notable`, `welcomeOf`, `createRoster` = the scan-in welcomes, `state.titles` / `state.welcomes`, the station clock), `book.js` (`findCrew`, `recordCrew` by id with `pid` / `stations` / `deeds` on a record, `pageCount` / `crewPage`), `christen.js` (`endRun` collects the id, station seconds and the voyage's Book moments, finds new titles), `bookArt.js` (roster page, cover titles, `welcomes`), `render.js` (lobby banners, scorecard titles only), `simulation.js` (3 lines), `network.js` (page count), `server.js` / phone `network.js` / `ui.js` (the id, the join card).
  - **Switch:** behind the same `BOOK` switch as L2 (off in a Node tool unless `BOOK_ON=1`; no `state.titles` / `state.welcomes` exist with it off); records are written by `christen.endRun`, so `?christen=0` writes none (as in L2). The save keeps one record per phone (60); old records are untouched, new fields are added empty.
  - **Gates:** `node tools/buildsim.mjs --check-roster [--quick]` (`tools/roster-check.mjs`: the title rules, a record growing over 2 voyages, a veteran's title in sim steps, reconnect / new session / rename / same-name / L2-claim identity, no bots, save round-trip and an L2 save, every TV piece on a stub canvas with nothing under 22 px, the Book off, botsim identical) and `node tools/roster-shots.mjs [--view 3d]` (real Chrome, own server; pictures `3d-screenshots/roster_*.png`). `--check-book` now expects the roster page (page 2) before the voyages; `tools/book-shots.mjs` presses Right one more time.
- **For L2 (save v3, christening), the notes L1 left:** `run.log` (one `writeStop()` result per stop: `text`, `cands`, `play`, `colors`, `end`, `env`, `lair`, `creature`) and `state.runEnd.lines / route / colors` are the data to keep in the book; the ship's name can replace "the crew" in `SENT.quiet` / `ship-lost`; hull scars can be read from `breakoff` moments (`data.names`). `state.moments` is cleared by `newRun()` (a new voyage).

## The diagnosis
The game has an astonishing number of things that *can happen*, and almost no way to *remember that they happened*. It has a body (ship physics, parts, creatures, PvP, 3D) and no heart: no ship with a name, no crew with faces, no enemy with a grudge, no book that says "we did this". **The missing factor is memory and identity.**

**Evidence from the code:**
- **The save** holds 7 numbers and one unlock (`flagship-medal`) that nothing ever reads.
- **The ship has no name.** She's a toggle button ("Sparrow" or "Classic"), and losing her resets everything as if nothing happened.
- **Crew identity is thrown away.** Each crewman's stats are tallied for one run and discarded at the end; the phone saves only the typed name.
- **Enemy captains are forgotten.** They are generated with names and personalities, can flee, and never come back. A `rival` flag exists in the config and nothing reads it. The planned Rival Captain and Captain's Log are the only unbuilt items in "Phase 2 - Story and stickiness".
- **The run ends as a spreadsheet.**
- **The phone has no private channel.** Everything on it is something the TV already shows.
- **Big moments vanish.** A ship splitting in half or a dragon perching on the bag lives for one 4-second banner, with no replay and no record of who did it.

**Over-built and under-built.** The systems are deep and done enough: a 27-part catalogue, 3 creatures, PvP, 60+ 3D modules, 40 test gates. What's shallow is what every session touches: the first 5 minutes, the run end, the save, enemy memory, and the phone as a person. **The game needs a spine to hang them on, not a new system.**

## The big idea: one cream-paper logbook, kept on this TV
1. **Her name.**
   - The crew christen the ship at the first cast-off, voting on their phones from generated names or typing their own.
   - Her name is painted on the hull. Voyages are counted, trophies hang in the lobby, and scars from REBUILDs and splits stay on the hull as cosmetic seams.
   - If she's lost, the book gets a black-bordered page and the next ship is christened fresh.
2. **The Log.**
   - 6 to 10 lines per run, written automatically from what really happened, with names. For example: "The Cinder Drake perched on the bag; **Kenny** hacked at it until it let go. **Bob** fell overboard twice."
   - One line is read out at each sky-dock, and the run-end page is a postcard worth photographing.
3. **The Crew Roster.**
   - The phone remembers you (name, animal, hat), and the TV keeps your service record.
   - You earn titles by what you do: "Stoker", "Patch Master", "Ship's Lunatic" for 3 overboard falls.
   - Scanning in shows "Welcome back, Mia - Boatswain, 4 voyages".
4. **The Nemesis.**
   - A gunship captain who flees is remembered. She comes back two stops later, repaired and upgraded, with a taunt and worth triple salvage.
   - If she's still alive at the end, the book says "The Iron Widow is still out there", and she opens next week's voyage.
   - Beat her and her flag hangs in the lobby. Only one nemesis at a time.

**How an evening goes:**
- The book opens on last week's page, veterans are welcomed by their titles, and new players get a 90-second mooring drill.
- The crew christen the ship and cast off.
- Each phone gets a private **order** for every stop.
- The Iron Widow returns and goes down in slow motion: "PLAY OF THE MISSION: Mia planted the charge".
- The Kraken lair.
- The run-end page: the route inked through the skies with a stamp at each stop, the Log, awards, and the ship's record.
- Phones vote "one more voyage?".

## Supporting features (most impact per effort first)
1. **Moments, the Log page and the postcard:** S/M.
2. **Christening and ship identity:** M.
3. **Crew Roster:** M.
4. **The Nemesis:** M.
5. **Secret Orders on the phone:** M.
   - One private order per stop: 70% cooperative ("put out the next fire"), 20% daring ("be aboard the gunship when she blows"), 10% whimsy.
   - Completing one earns a ribbon, a little salvage, and a Log line. It never asks for sabotage.
6. **Mooring drill for the first 5 minutes:** S. It runs only when there are new players, and CAST OFF works at any time.
7. **Play of the mission, co-op slow motion and awards v2:** S.
8. **The dock as a mess hall:** S/M. A Log line, the nemesis taunt, one stop-event card (a derelict, a merchant, a distress call), and a shop trimmed to 3 cards.

## What to cut or simplify
- **Freeze the catalogue:** no new parts, weapons or creature wins until the Book ships.
- **Pause PvP** after King of the Hill.
- **Pause 3D polish:** no SDXL download.
- **Fold the lobby's 7 buttons** into one "Voyage" card, keeping CAST OFF, Add bots and Menu.
- **Retire the old "Record on this TV" line.**
- **Shop:** 3 cards plus Cast off.
- **Helm engine levers** default to LINK; SPLIT becomes an expert toggle.
- **Never show** "Nobody did much this mission".

## Roadmap
| # | Package | Size | Fun gate |
|---|---|---|---|
| L0 | `moments.js` (data only) | S | ≥ 6 named moments per 10 min |
| L1 | The Log writer, the run-end page, the dock line, the postcard | M | every line names someone and reads aloud well |
| L2 | Save v3: ship name, christening vote, hull name, scars, trophies, the lobby book page | M | the book is the first thing you see |
| L3 | Crew Roster and titles | M | a veteran's title shows within 2 s of scanning in |
| L4 | The Nemesis | M | the voyage win rate stays within 5 points; you can name her without looking |
| L5 | Secret Orders | M | 40-70% completed; an order never blocks a critical job |
| L6 | Mooring drill | S | every new phone does one job within 90 s (**built in FUN.md F10**: the join card, the ? button and the verb over an idle head; the 90 s test is a human playtest) |
| L7 | Play of the mission, slow motion, awards v2 | S | someone says "do that again" |
| L8 | Lobby fold, shop trim, dock mess hall and stop events | S/M | the dock takes under 60 s (**the shop trim is done in FUN.md F6**: three cards, shorter votes, six fittings; the lobby fold, the mess hall and the stop events remain) |

Order: L0 → L1 → L2 → L3 → L4, then L5 and L6, then L7 and L8. **Playtest with real people after L2.**

**Testing for fun:**
- moments per 10 minutes;
- the longest stretch with no moment (under 90 s);
- the retell test: the next day, one player tells the run in 30 seconds, and we count the events (4 or more);
- the "one more voyage?" vote.

## Risks
| Risk | How it's handled |
|---|---|
| The Log reads like a robot | templates with names first, 3 variants each, 10 lines max, the owner reads 5 pages before merging |
| Save migration | a v3 schema and a tolerant loader |
| Identity keyed by typed name | fine for a living room; duplicate names get a suffix |
| The Nemesis breaks balance | never on lair or Flagship stops; checked with voyagesim |
| Orders make people selfish | 70% cooperative, never harmful |
| Scope creep into a written story | everything is generated from game events; no authored story |
