# Airship Crew

A co-op party game: up to 16 friends crew a steam airship together. The TV (or laptop) shows the
ship; everyone plays with their phone as the controller.

## Starting a game

1. Double-click `start.bat`. A black server window opens (leave it open) and the TV screen opens
   in your browser.
2. Players scan the QR code on the TV with their phones (same Wi-Fi), type a name, pick an animal,
   and hold the phone sideways.
3. While moored at the mast, walk around and try things out. No enemies yet.
4. Press **CAST OFF!** on the TV (or Space) to set off.

TV buttons: **Add 4 bot crew** (bots crew stations for you, great for small groups),
**Difficulty** (Easy / Normal / Hard) and **Sound** (or press M).

## The phone controls

- **Joystick** (left): walk; push up/down at a ladder, stairs or the lift to climb.
- **Action** (big cream button): does whatever it shows - take a tool, load a gun, man a station,
  patch, repair, vent steam... Some say HOLD: keep pressing.
- **Attack** (blue button): swing your sword (or shove if empty-handed). Hold to keep swinging.
- **Leave** (top right): step off a station.

## Jobs on board

- **Helm** (bridge): steer up/down through mountains, under rock, through underpasses and
  zig-zag runs (climb, dive, climb...), over mountain **fortresses** (gun towers on the walls) and
  **factories** (tall smokestacks). The land climbs and falls: at a **cliff wall**, stop and climb
  straight up; at a **cliff edge**, clear it, then dive down into the cave. The lever is the
  throttle: up = ahead, the yellow STOP line = hover, below it = reverse. Nobody at the helm? On Easy/Normal the autopilot steers gently.
- **Guns** (6 of them, each turns only so far): aim near a target and the aim snaps on. Guns need
  **ammo** carried from the Ammo Hold.
- **Bomb Bay** (lower deck, Aft Gun Deck): press DROP to drop a bomb through the belly doors. A
  red ring on the TV shows where it will land. Bombs knock out gun turrets and flatten castle
  towers, walls and smokestacks (clearing your path). Reload with ammo crates (2 bombs each).
- **Boiler**: carry **coal** from the Coal Bunker (lower deck). More coal = more steam pressure.
  Everything powered (engines, helm, lift) uses steam; tap Action at a **vent** stack to open or
  close it. At 100% pressure the boiler blows.
- **Gasbag**: steam pressure pumps gas into the bag; holes leak it out. The gas gauge shows
  **sinky** (blue), **just right** (green) or **floaty** (yellow) - the ship drifts down or up and
  the helm has to fight it. Patch holes and keep the pressure up to stay afloat.
- **Tools** from the racks and hooks: **hammer** (patch holes, repair broken modules and gasbag
  tears), **extinguisher** (fires), **sword** (raiders). One thing at a time.
- **Valves** on the steam pipes: close a burst pipe's valve to stop the leak.
- **Lookout** (crow's nest): shows arrows to threats that are off screen.

## The flight

Each lap flies out past checkpoint flags to a **turning beacon**, then home to the mooring mast.
At the beacon and at home the crew **votes on an upgrade** on their phones. Arriving home shows
the **lap scorecard** with crew awards. Each checkpoint flag brings supplies (+15 hull). If the
hull breaks, the ship **breaks apart** and the game starts over at the mast (upgrades are lost).

Enemies: fighters (they fly like real planes: long strafing runs from far out, wide turns,
and they can crash into mountains), raider cargo planes (shoot them before they drop raiders), mines, bat swarms,
bombers, skeleton strafers, ground flak turrets and rocket batteries, the **Dread Zeppelin** boss
on the way home, and storms from lap 2.

## For tinkering

All the numbers (damage, speeds, timers, difficulty) are in `public/config.js`. Game art goes in
`art/sprites/` - see `art/ART_SPEC.md`.

Off-LAN / HTTPS testing: `ngrok http 3000`, then `PUBLIC_URL=https://xxxx.ngrok.app npm start`.
