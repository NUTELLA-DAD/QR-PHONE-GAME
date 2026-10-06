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

- **Helm** (bridge): the engines. Stick left/right = front/back engines, stick up/down = a small
  up/down trim engine, the lever = cruise speed (yellow STOP line = hover, below it = reverse).
  Steer over mountains, under rock, through zig-zags, past fortresses and factories, and stop
  below cliff walls. Nobody at the helm? On Easy/Normal the autopilot steers gently.
- **Gas Valve** (top catwalk): the big up/down control. Stick UP pumps hot steam into the gasbag
  (she rises - fast when overfilled, and the envelope swells), DOWN vents it (she drops - fast
  when empty, and it sags). The gas slowly cools and leaks from holes, so keep topping it up.
  Pumping uses boiler steam.
- **Guns** (6 of them, each turns only so far): aim near a target and the aim snaps on. Guns need
  **ammo** carried from the Ammo Hold.
- **Lightning Coil** (main deck, Workshop): aim with the stick, HOLD to charge (uses lots of
  steam), let go to fire a giant lightning bolt from the top of the crow's nest that hits
  everything along it. The longer the charge, the harder it hits.
- **Deflector** (top catwalk): point the stick to swing a glowing steam shield round the ship.
  It blocks enemy bullets, bats, rockets and bombs - but uses steam while it's up.
- **Bomb Bay** (lower deck, Aft Gun Deck): press DROP to drop a bomb through the belly doors. A
  red ring on the TV shows where it will land. Bombs knock out gun turrets and flatten castle
  towers, walls and smokestacks (clearing your path). Reload with ammo crates (2 bombs each).
- **Boarding**: when an enemy **gunship** comes alongside (it fires broadsides - watch its gun
  ports glow), stand at the very front of the main deck and tap Action to **fire the hookshot**.
  Run across the rope bridge, fight her crew (swords!), and hold Action at her boiler (yellow
  arrow) to **plant a charge** - then run back before it blows. Blowing her up brings hull, coal
  and ammo aboard. Her crew will cut the rope if nobody crosses. Anyone who falls comes round in
  the **medical bay** (red cross, lower deck) after a few seconds.
- **Boiler**: carry **coal** from the Coal Bunker (lower deck) - about one load a minute. More
  coal = more steam pressure.
  Everything powered (engines, helm, lift) uses steam; tap Action at a **vent** stack to open or
  close it. At 100% pressure the boiler blows.
- **Tools** from the racks and hooks: **hammer** (patch holes, repair broken modules and gasbag
  tears), **extinguisher** (fires), **sword** (raiders). One thing at a time.
- **Valves** on the steam pipes: close a burst pipe's valve to stop the leak.
- **Lookout** (crow's nest): shows arrows to threats that are off screen.

## The flight

Each **mission** is a new map of caves, shafts and passages to fly through in any direction -
up shafts, back along tunnels, across caverns. Find your way to the **beacon** (the yellow star on
the minimap at the top of the TV; the helm's phone says which way to go). Missions take turns
between a **branching cave network** (with dead ends), a **winding passage** that climbs, drops
and doubles back, and **open sky** with enemy **outposts** to destroy in any order (red dots on
the minimap - bomb them from above or shoot them), and get bigger each time. Reaching the beacon patches the hull, shows the
scorecard with crew awards, and the crew **votes on an upgrade** on their phones. If the hull
breaks, the ship **breaks apart** and the game starts over at mission 1.

Enemies: fighters (they fly like real planes: long strafing runs from far out, wide turns,
and they can crash into mountains), raider cargo planes (shoot them before they drop raiders), mines, bat swarms,
bombers, skeleton strafers, **gyro-saws** (spinning blades that circle then dash in - shoot
them), **imp swarms**, the **sniper zeppelin** (a red line tracks you, then flashes: get out of
the line or block it with the Deflector), the **harpoon tug** (hooks and drags the ship - shoot
the cable or hack it with a sword at the hook), ground flak turrets and rocket batteries, the **Dread Zeppelin** boss
on the way home, and storms from lap 2.

## For tinkering

All the numbers (damage, speeds, timers, difficulty) are in `public/config.js`. Game art goes in
`art/sprites/` - see `art/ART_SPEC.md`.

Off-LAN / HTTPS testing: `ngrok http 3000`, then `PUBLIC_URL=https://xxxx.ngrok.app npm start`.
