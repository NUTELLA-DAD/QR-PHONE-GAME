export const config = {
  W: 1600,
  H: 900,
  INK: '#2b2622',
  MAX_PLAYERS: 16,
  PLAYER_COLORS: ['#e63946', '#f4a261', '#f1c40f', '#2a9d8f', '#3a86ff', '#8338ec', '#ff5da2', '#06d6a0', '#ff7b00', '#00b4d8', '#9ef01a', '#b5179e', '#ffffff', '#7f5539', '#4cc9f0', '#d00000'],
  // Main loop: the simulation always advances in fixed steps so game speed is the same on any display.
  LOOP: {
    STEP: 1 / 60, // seconds of game time per simulation step
    MAX_STEPS: 5, // most steps run in one drawn frame; leftover time is dropped (stops a slow-down spiral)
    MAX_FRAME: 0.25, // longest real frame time counted (a tab coming back from hidden won't fast-forward)
  },
  // Camera framing.
  CAMERA: {
    SHIP_SCREEN_FRACTION: 0.53, // the ship (incl. its long gasbag) takes at most this much of the screen width; the hull reads ~20% bigger than before
    ENEMY_MARGIN: 260, // empty sky kept around the enemy plane (world pixels)
    MAX_ZOOM_OUT: 1.8, // never zoom out more than this beyond the normal view
    SMOOTHING: 1.6, // how quickly the camera pans to catch up (higher = snappier)
    ZOOM_SMOOTHING: 0.6, // how quickly it zooms (low = calm, no pumping)
    LEAD_TIME: 0.6, // look this many seconds ahead of where she's heading
    LEAD_SMOOTHING: 1.2,
    SHAKE_SCALE: 14, // screen shake per unit of 'shake'...
    SHAKE_MAX: 9, // ...but never more than this many pixels
    SHIP_KEEP_IN: 0.5, // the ship's middle stays within this share of the screen from the centre
    FRAME_RANGE: 1900, // threats closer than this are kept in view (farther ones get edge arrows)
  },
  // Flight model shared by every plane (see planes.js flyPlane). Per-type THRUST / DRAG / STALL_SPEED /
  // MAX_SPEED / GRAVITY in ENEMY, DOGFIGHT, ESCORT and WAVES override these.
  FLIGHT: {
    GRAVITY: 420, // pull along the flight path (pixels per second squared): climbs lose speed, dives gain it
    THRUST: 360, // engine push back up to cruise speed (less than GRAVITY: a long steep climb runs out of speed)
    DRAG: 1.6, // how fast a plane sheds speed above cruise (per second)
    STALL_SHARE: 0.55, // stall speed as a share of cruise (when a type has no STALL_SPEED)
    MAX_SHARE: 1.4, // top speed as a share of cruise (when a type has no MAX_SPEED)
    MIN_SHARE: 0.3, // she never drops below this share of cruise
    STALL_PITCH: 1.3, // how fast the nose drops in a stall (radians per second)
    STALL_ROOM: 450, // a stall only drops the nose if the ground is at least this far below
    SLOW_TURN: 0.45, // turn rate share at (nearly) no airspeed; full at cruise, up to FAST_TURN when faster
    FAST_TURN: 1.15,
    WOBBLE: 0.9, // heading shake (radians per second) of a plane at death's door (below half hp)
    PULL: 0.35, // steady drift to one side (radians per second) of a plane at death's door
    RAM_KICK: 90, // shove a ramming plane gives the ship's up/down speed
    RAM_CHANCE: 0.35, // chance a nearly dead dogfighter tries to ram the ship on its next pass
  },
  // Big enemies (bombers, cargo plane, boss) bump off the ship instead of crashing. Scaled by their size.
  BUMP: {
    DAMAGE: 0.8, // hit on our ship (1 = one enemy bullet) per bump, times size
    SELF_DAMAGE: 1, // hp the enemy loses per bump (it never dies from bumping)
    PUSH: 70, // pixels it is shoved clear at once, times size
    BOUNCE: 260, // speed it bounces away at (pixels per second)...
    DECAY: 3, // ...fading out at this rate per second
    SHIP_KICK: 60, // shove our ship's up/down speed gets, times size
    SHIP_SPEED: 0.05, // and her forward speed (share of full), times size
    COOLDOWN: 1.2, // seconds before the same enemy can bump again
    BOMBER_SIZE: 1,
    CARGO_SIZE: 0.8,
    BOSS_SIZE: 2.5,
  },
  // Enemy plane: flies a loop around the ship.
  // Enemy fighter: flies like a plane (speed + limited turning), making long strafing runs.
  ENEMY: {
    SPEED: 560, // air speed (pixels per second)
    TURN: 1.1, // normal turn rate (radians per second) - lower = wider turns
    TURN_AVOID: 1.7, // hardest it can turn to dodge rock or the ship
    THRUST: 300, // heavy: slow to pick speed back up after a climb
    DRAG: 1.4,
    STALL_SPEED: 300,
    MAX_SPEED: 780, // boom and zoom: a dive from height takes her well over cruise
    ZOOM: 500, // extra height she climbs to after a pass before diving back in
    RUN_FROM: 2300, // how far out it lines up before a run, and extends to after one
    FIRE_RANGE: 1900, // opens fire inside this distance
    BREAK_AT: 600, // breaks away this close to its aim point...
    BREAK_LOOKAHEAD: 1.3, // ...or when it would reach the hull within this many seconds
    SHOTS: 5, // bullets per run (more on later laps / harder settings)
    SHOT_EVERY: 0.22,
    BULLET_SPEED: 720,
    RESPAWN: 5, // seconds until the next fighter after one goes down
  },
  // How far the helm can climb/dive (world pixels either way) and how fast.
  SHIP: {
    ALT_RANGE: 420, // how far the ship can climb or dive from the middle
    TRIM_ACCEL: 150, // push from the helm's small up/down trim engine (pixels per second squared)
    THRUST: 0.9, // (old) throttle change per second from the stick; see ACCEL/BRAKE
    ACCEL: 0.45, // how fast she picks up speed (share of full speed per second) - she's heavy
    BRAKE: 0.9, // how fast she sheds speed when braking or reversing
    PITCH_PER_ACCEL: 0.03, // nose lift when speeding up / dip when braking
    TOP_SPEED: 560, // forward speed at full throttle (reverse is up to 40% of this)
    REVERSE: 0.4, // how much of the throttle is reverse
    HULL_DAMAGE: 1, // multiplier on hull damage taken (armour upgrades lower it)
    HIT_DAMAGE: 3, // hull lost per enemy bullet hit (bigger blasts scale this up)
    HOLE_CHANCE: 0.6, // chance an enemy bullet hit punches a hole in the deck
    TILT_MAX: 0.06, // most the nose tips up/down while climbing or diving (radians, about 3.5 degrees)
    TILT_PER_SPEED: 0.0004, // tilt per pixel/second of climb
    TILT_SMOOTH: 3, // how quickly the tilt follows (higher = snappier)
    TILT_PIVOT: [800, 520], // the point the ship tips around (ship coordinates)
  },
  // Special enemies (see specials.js), one group every so often.
  SPECIALS: {
    FIRST_AFTER: 50, // seconds before the first
    EVERY_MIN: 30,
    EVERY_MAX: 45,
    SAW_COUNT: 3,
    SAW_HP: 2,
    SAW_SPEED: 380,
    SAW_IMPACT: 0.7, // hull cut per dash that connects
    IMP_COUNT: 14, // imps per swarm (more on later laps)
    IMP_SPEED: 330,
    IMP_IMPACT: 0.35,
    SNIPER_HP: 5,
    SNIPER_SHOTS: 2, // beams before it leaves
    SNIPER_CHARGE: 2.6, // seconds the red line tracks the ship...
    SNIPER_LOCK: 0.7, // ...then it locks and flashes this long before firing
    SNIPER_IMPACT: 2.2,
    TUG_HP: 4,
    CABLE_HP: 2, // shell hits to cut the harpoon cable
    TUG_PULL: 70, // how hard a hooked tug drags the ship down (pixels per second)
    TUG_SLOW: 1.2, // and how quickly it drags her speed back
  },
  // Lightning Coil super-weapon: hold to charge (uses lots of steam), let go to fire.
  COIL: {
    CHARGE_TIME: 3.5, // seconds to full charge at good pressure
    MIN_CHARGE: 0.3, // letting go below this just fizzles
    DAMAGE: 10, // damage at full charge (scales with charge)
    WIDTH: 80, // half-width of the bolt
    RANGE: 3200,
    TURN: 2.5, // aiming speed (radians per second)
    STEAM_USE: 9, // extra steam used while charging
    COOLDOWN: 4,
  },
  // Enemy gunships that come alongside to be boarded (see gunship.js).
  // Dogfighters: a squadron of small biplanes that circle the ship and take turns diving at it.
  DOGFIGHT: {
    COUNT: 2, // planes in a squadron on the first mission...
    PER_LAP: 1, // ...plus this many per later mission...
    MAX: 4, // ...up to this many
    HP: 3,
    SPEED: 470, // air speed
    TURN: 1.7, // turn rate (radians per second): tighter than the big fighter
    TURN_AVOID: 2.4,
    THRUST: 360, // nimble: a spry engine
    DRAG: 1.6,
    STALL_SPEED: 230,
    MAX_SPEED: 650,
    ORBIT: 1000, // how far out they circle the ship
    ORBIT_SPEED: 0.35, // how fast the circle goes round
    CIRCLE_MIN: 3, // seconds circling before peeling off to attack
    CIRCLE_MAX: 6,
    LOOP_CHANCE: 0.4, // chance of a loop-the-loop after a pass
    FIRE_RANGE: 1300,
    BURST: 4, // bullets per pass
    SHOT_EVERY: 0.2,
    BULLET_SPEED: 700,
  },
  // The ship's own escort fighter (hangs under the hull; the "Escort Fighter" station flies it).
  ESCORT: {
    HP: 6, // enemy bullets she can take
    SPEED: 560,
    TURN: 2.4, // turn rate (radians per second): nimble, but she still swoops
    TURN_AVOID: 3,
    THRUST: 410, // generous: she recovers speed quickly and rarely stalls
    DRAG: 1.6,
    STALL_SPEED: 200,
    MAX_SPEED: 780,
    ORBIT: 900, // hands off the stick, she circles the ship this far out
    ORBIT_SPEED: 0.45,
    FIRE_RANGE: 1000, // guns fire at anything this close...
    FIRE_CONE: 0.3, // ...within this angle of her nose (radians)
    SHOT_EVERY: 0.18,
    LEASH: 3200, // further than this from the ship and she flies home
    DOCK_RANGE: 90, // how close to the hook she latches on
    REBUILD: 30, // seconds to build a new one after she's shot down
  },
  GUNSHIP: {
    FIRST_AFTER: 100, // seconds into a mission before the first
    EVERY_MIN: 80,
    EVERY_MAX: 120,
    HP: 30, // shell hits to shoot one down (boarding is quicker)
    CREW: 4, // crew aboard: gunner, helmsman, stoker, guard (more on later missions)
    CREW_HP: 3, // sword hits count 2
    CREW_SPEED: 160,
    FIRE_EVERY: 7, // seconds between broadsides
    SHOTS: 3, // most cannonballs per broadside (1 gunner = 2 shots, 2 gunners = 3)
    STAY: 75, // seconds alongside before it pulls away
    PLANT_TIME: 2.5, // holding Action at its boiler to set the charge
    FUSE: 8, // seconds to get back before it blows
    CUT_TIME: 7, // seconds its crew need to hack through the rope (they wait 3s first)
    // -- Her own flight (she has engines + gas lift of her own; positions are offsets from our ship) --
    START_DX: 2600, // she appears this far ahead of our ship (pixels)...
    START_DY: 120, // ...and up to this much above or below
    HOLD_DX: 0, // the station her helmsman tries to hold, relative to our ship (0,0 = broadside off our bow, level)
    HOLD_DY: 0,
    DOCK_DX: 250, // "on station" once she is this close to it (sideways) and...
    DOCK_DY: 150, // ...this close (up/down)
    MAX_SPEED: 800, // her top forward speed through the world (our top is 560, a bit more in overdrive)
    MAX_BACK: 250, // her top reverse speed
    ACCEL_X: 260, // engine push (pixels/s per second): lower = she lags more when we speed up or brake
    ENGINE_GAIN: 1.4, // how hard she throttles toward the speed she wants (higher = snappier, less overshoot)
    KX: 0.9, // how strongly she closes a sideways gap (wanted closing speed = KX x gap)
    MAX_CLOSE: 650, // fastest she will close on her station
    DRAG_X: 0.15, // with nobody at the helm her engines idle and she coasts to a stop (per second)
    MAX_VY: 220, // her fastest climb/dive
    ACCEL_Y: 150, // gas-lift response (pixels/s per second): lower = slower to follow our dives and climbs
    LIFT_GAIN: 1.5,
    KY: 1.1, // how strongly she corrects being above/below her station
    DRAG_Y: 0.8, // vertical drag with nobody at the helm
    SAG: 25, // with nobody at the helm she slowly sags (pixels/s per second)
    REACT: 0.8, // seconds her helmsman takes to notice what our ship is doing (bigger = more lag)
    WOBBLE_X: 70, // she never sits perfectly still: slow sway around her station
    WOBBLE_Y: 40,
    ROCK_AVOID: 150, // she shifts this far up/down to keep rock off her hull and gasbag
    GONE_DIST: 4200, // lost for good (removed) if she gets this far from us in any direction
    // -- Her broadsides get less accurate the further she is from her station --
    MISS_BASE: 0.15, // chance a cannonball misses even when perfectly placed
    MISS_DY: 600, // each this-many pixels above/below the station adds +100% miss chance
    MISS_FREE_DX: 300, // sideways slop that costs nothing...
    MISS_DX: 1500, // ...then each this-many pixels adds +100%
    MISS_MAX: 0.92,
    // -- Hookshot rope --
    HOOK_RANGE: 700, // the grapple only catches if the yardarm is this close to our bow
    SWING_RANGE: 620, // you can only swing across while the rope is hooked and she is this close
    BOARD_LEN: 470, // the winch reels the rope in to this length (pixels)
    REEL_SPEED: 45, // reeling speed (pixels per second)
    SNAP_LEN: 1000, // the rope snaps if the ships get this far apart
    ROPE_K: 5, // taut rope pulls HER back (accel per pixel of stretch)...
    ROPE_DAMP: 1.8, // ...and kills the speed she's pulling away at
    ROPE_MAX_ACC: 700, // strongest rope pull on her
    TUG_VY: 0.35, // gentle tug on OUR ship's climb speed per pixel of stretch
    TUG_SPEED: 0.0005, // gentle tug on OUR ship's throttle (fraction of speed per second per pixel of stretch)
    TUG_CAP: 300, // stretch beyond this adds no more tug on our ship
    TILT_PER_SPEED: 0.0004, // drawing only: her tilt (radians) per pixel/second of climb (capped at 0.04)
    SWING_TIME: 0.9, // seconds to swing across on the line
    SWING_DIP: 150, // how far below the deck the swing dips
    STOMP_RANGE: 160, // landing on her deck knocks back crew this close
    DRIFT_TIME: 6, // seconds without a helmsman (and nobody aboard her) before she drifts away
    REFILL_TIME: 6, // seconds before a guard takes over an empty post (nobody aboard)
    REPAIR_RATE: 0.15, // her hull points patched per second, per guard, while nobody is aboard
    RESPAWN_TIME: 4, // seconds dazed in the medical bay after falling off
    REWARD_HULL: 15,
    REWARD_COAL: 40,
  },
  // Pacing: each fight builds up, peaks, then eases off for a breather with a supply balloon.
  PACING: {
    BUILD: 45, // seconds of normal pressure...
    PEAK: 30, // ...then enemies come faster for this long...
    CALM: 22, // ...then nothing new arrives for this long
    SUPPLY_REACH: 750, // fly within this of the balloon to grab it
    SUPPLY_HULL: 12,
    SUPPLY_COAL: 25,
  },
  // Deflector shield: a steam-powered arc the Deflector station swings around the ship. It
  // blocks enemy bullets, bats, rockets and bombs that hit it.
  SHIELD: {
    SPAN: 0.42, // half-width of the arc (radians around the ship): bigger = covers more
    TURN: 4.5, // how fast it swings round (radians per second)
    STEAM_USE: 1.5, // extra steam used while it's up
  },
  // Bomb bay: drops bombs on turrets and buildings below.
  BOMBS: {
    START: 3, // bombs aboard at the start
    MAX: 6,
    LOAD: 2, // bombs added per ammo crate
    COOLDOWN: 0.9, // seconds between drops
    GRAVITY: 700,
    DRAG: 0.35, // how quickly a falling bomb loses the ship's forward speed
    RADIUS: 170, // blast radius
  },
  // Ship guns (upgrades change these).
  GUNS: {
    COOLDOWN: 0.28, // seconds between shots (about 3.5 per second)
    DAMAGE: 0.5, // damage per shell hit (enemy hp are whole numbers, so 2 shells = 1 old hit)
    MAX_AMMO: 20, // shells a gun holds
    START_AMMO: 16, // shells in each gun at the start of a game
    LOAD: 10, // shells added per ammo crate
    AUTOLOAD_EVERY: 4, // seconds per free shell (0 = off; the Auto-Loader upgrade makes it faster)
    SHELL_SPEED: 1300, // shell speed, px/s
    SHELL_LIFE: 1.17, // shell lifetime, seconds (speed x life = range, about 1520 px)
  },
  // Upgrade votes at the beacon and back home.
  VOTE: {
    TIME: 15, // seconds to vote
    ALL_VOTED_WAIT: 1.5, // once everyone has voted, wait this long
    SCORECARD_TIME: 8, // seconds the lap scorecard shows before the vote
  },
  // Fires.
  FIRE: {
    SPREAD_EVERY: 7, // seconds before a fire spreads
  },
  // Enemy cargo plane: flies in from far away and drops raiders on the catwalk.
  CARGO: {
    FIRST_AFTER: 25, // seconds before the first one
    EVERY_MIN: 40, // seconds between cargo planes...
    EVERY_MAX: 60,
    START_DISTANCE: 2300, // how far from the ship it appears
    SPEED: 140,
    HEIGHT: 300, // how far above the ship's top it flies
    HP: 8, // plus 1 per 4 crew
  },
  // Floating mines drifting toward the bow.
  MINES: {
    FIRST_AFTER: 30,
    EVERY_MIN: 18,
    EVERY_MAX: 28,
    EDGE_CHANCE: 0.6, // chance a mine skims the top/bottom (dodge it); otherwise it's dead centre (shoot it)
    RADIUS: 34,
  },
  // How hard different explosions hit the ship (1 = one enemy bullet).
  IMPACT: {
    MINE: 2,
    PLANE_CRASH: 3,
    WRECK_SMALL: 1.2, // a small plane's falling wreck
    BOMB: 2,
  },
  // The course: terrain the ship flies through (mountains, overhangs, underpasses) with
  // ground turrets. Endless, getting harder with distance.
  COURSE: {
    ENABLED: true,
    GROUND: 1520, // ground level far below the ship (world y)
    FIRST_FEATURE: 4000, // distance before the first obstacle
    GAP_MIN: 700, // open sky between obstacles...
    GAP_MAX: 1600,
    UNDERPASS_GAP_START: 280, // how much altitude room an underpass leaves at first...
    UNDERPASS_GAP_END: 150, // ...shrinking to this as you go further
    HARDEST_AT: 240000, // distance at which obstacles reach full difficulty (about lap 3)
    LOOP_LENGTH: 110000, // one lap: out to the beacon and back home (~6 minutes at cruising speed)
    SECTIONS: 6, // markers per lap: home, checkpoints, beacon halfway
    CHECKPOINT_REPAIR: 15, // hull repaired by the supplies at each checkpoint flag
    // Share of each kind of obstacle (the rest are rolling hills).
    MIX: { mountain: 0.17, overhang: 0.12, underpass: 0.17, zigzag: 0.16, fortress: 0.13, factory: 0.13 },
    CLIFF_SHARE: 0.25, // share of obstacles that are a cliff to climb or a drop to dive
    ELEV_LIMIT: 2600, // the land wanders up and down but stays within about this height
    MAX_REVERSE: 3000, // how far the ship may back up from the furthest point reached
    ZIGZAG_GATES: [3, 6], // a zig-zag is this many spires/hanging rocks in a row, alternating
    ZIGZAG_GAP: 2000, // distance between one gate's end and the next (the ship is ~1750 long)...
    ZIGZAG_GAP_PER_SWING: 3.4, // ...plus this much per pixel of climb/dive each gate asks for
    MARKER_CLEAR: 1800, // open sky kept around every marker (safe restart spots)
    REWIND_BEFORE: 900, // after going down, restart this far before the last marker
    SCRAPE_COOLDOWN: 0.45, // seconds between scrape damage while touching rock
    WARN_SECONDS: 3, // warning before an obstacle...
    LOOKOUT_WARN_SECONDS: 5, // ...earlier with someone on Lookout
    TURRET_HP: 3,
    TURRET_FIRE_MIN: 4, // seconds between flak shots
    TURRET_FIRE_MAX: 6.5,
    TURRET_RANGE: 2000,
    TURRET_WARN: 0.9, // seconds a ground gun glows and shows its aim before firing
    FLAK_MISS: 0.3, // share of flak that misses anyway (weaving at the helm adds more)
    FLAK_SPEED: 520,
    ROCKET_SHARE: 0.45, // share of turrets that are rocket batteries at full difficulty
    ROCKET_SPEED: 300,
    ROCKET_TURN: 1.3, // how sharply rockets home in (radians per second)
    ROCKET_LIFE: 7,
    ROCKET_IMPACT: 1.3,
  },
  // Mission maps (maps.js): caves, shafts and passages flown through in any direction. Each
  // mission is a fresh map; reach the beacon to finish it (scorecard, upgrade vote, next map).
  MAPS: {
    ENABLED: true,
    FORCE_KIND: null, // set to 'network', 'route' or 'open' to use only that kind (used by tools/botsim.mjs)
    KINDS: ['network', 'route', 'open'], // mission types in turn: branching caves, one winding
    // passage, open sky with outposts to destroy
    CELL: 200, // size of one map square (pixels)
    WIDTH: 170, // map size in squares for mission 1...
    HEIGHT: 60,
    WIDTH_PER_LEVEL: 25, // ...growing with each mission
    HEIGHT_PER_LEVEL: 6,
    ROOMS: 8, // caverns along the way (more on later missions)
    BRANCHES: 3, // side caves that dead-end (network maps)
    TUNNEL_CELLS: 8, // tunnel height (the ship needs 7)
    SHAFT_CELLS: 12, // shaft width (the ship needs 11)
    GOAL_RADIUS: 700, // how close to the beacon counts as reaching it
    OPEN_WIDTH: 190, // open-sky map size (squares) for its first mission
    OPEN_HEIGHT: 50,
    OUTPOSTS: 3, // outposts to destroy on an open-sky map (more later)
  },
  // Enemy waves (bat swarms and bombers) and the Dread Zeppelin boss.
  WAVES: {
    FIRST_AFTER: 35, // seconds before the first wave
    EVERY_MIN: 28, // seconds between waves (shorter on later laps)...
    EVERY_MAX: 42,
    BATS_BASE: 4, // bats in a swarm on lap 1...
    BATS_PER_LAP: 2, // ...plus this many per extra lap
    BATS_MAX: 14,
    BAT_SPEED: 240,
    BAT_SEPARATE: 70, // bats this close push apart...
    BAT_COHESION: 0.6, // ...pull toward the flock's middle (share of speed)...
    BAT_ALIGN: 0.5, // ...and fly the way their neighbours fly
    BAT_SEEK: 1.0, // (how strongly they head for the ship, against the flock urges)
    BAT_FLOCK_RANGE: 400, // who counts as a neighbour
    BAT_IMPACT: 0.4, // (now unused: bats latch on instead of bursting) how hard a bat bursting on the ship hits
    BAT_LATCH_SPEED: 170, // how fast a bat that hit the ship crawls to its landing spot (px/s)
    BAT_GAS_CHANCE: 0.45, // chance a bat that hits the gasbag settles on it (otherwise it drops to a deck)
    BAT_GNAW_GAS: 5, // seconds a gasbag bat gnaws before it chews a gas hole
    BAT_GNAW_DECK: 6, // seconds a deck bat gnaws between breaches...
    BAT_DECK_DPS: 0.1, // ...and the hull points it chews per second meanwhile
    BAT_LIFE: 16, // a bat left alone flies off after this many seconds on the ship
    BAT_SWAT_REACH: 30, // extra reach (px) to swat a bat on the gasbag from the catwalk below it
    BAT_NOTICE: 220, // a player within this distance of a latched bat gets a 'Swat bat!' button
    BOMBER_SPEED: 120,
    BOMBER_TURN: 0.35, // very wide, slow turns (radians per second)
    BOMBER_FM: { THRUST: 90, DRAG: 1, GRAVITY: 60, STALL_SPEED: 40, MAX_SPEED: 170 }, // flight model overrides
    BOMBER_HP: 9,
    BOMB_EVERY: 1.8, // seconds between bombs while over the ship
    BOMB_IMPACT: 1.0,
    BOSS_AT: 0.66, // lap progress (0-1) when the Dread Zeppelin shows up, on the way home
    BOSS_HP: 45,
    BOSS_HP_PER_LAP: 20,
    BOSS_STATION_X: 2700, // where it parks, ahead of the ship
    BOSS_FIRE_EVERY: 2.6,
    BOSS_BOARD_EVERY: 30, // seconds between boarding parties
    BOSS_REWARD_HULL: 35,
    BOSS_GUN_HP: 4, // each turret can be shot off separately...
    BOSS_GUN_BONUS: 6, // ...knocking this much off the boss
    BOSS_BATS_EVERY: 20, // from lap 2 the boss launches small bat swarms this often (seconds) // hull patched when you shoot it down
  },
  // Storm fronts: where they are in each lap (progress 0-1) and from which lap they start.
  STORM: {
    ZONES: [
      { fromLap: 2, from: 0.18, to: 0.32 },
      { fromLap: 2, from: 0.7, to: 0.82 },
      { fromLap: 3, from: 0.4, to: 0.48 },
    ],
    GUST_EVERY_MIN: 3, // seconds between wind gusts
    GUST_EVERY_MAX: 6,
    GUST_TIME: 1.6, // how long a gust pushes
    GUST_MIN: 70, // how hard (altitude change per second)
    GUST_MAX: 150,
    BOLT_EVERY_MIN: 5, // seconds between lightning flashes
    BOLT_EVERY_MAX: 9,
    STRIKE_CHANCE: 0.4, // chance a flash actually strikes the ship
    STRIKE_POWER: 1,
  },
  // Sound effects (on the TV). Press M on the TV keyboard to mute.
  SOUND: {
    VOLUME: 0.5,
    START_MUTED: false,
  },
  // Difficulty presets (button on the TV). damage = hull damage taken; pace = how often waves,
  // flak and enemy fire come (higher = busier).
  // A wrecked ship ends the run, so damage is kept gentle (multiplier on all hull damage).
  DIFFICULTY: {
    easy: { label: 'Easy', damage: 0.1, pace: 0.75, autopilot: true },
    normal: { label: 'Normal', damage: 0.17, pace: 0.9, autopilot: true },
    hard: { label: 'Hard', damage: 0.45, pace: 1.3, autopilot: false },
  },
  START_DIFFICULTY: 'normal',
  AUTOPILOT_SPEED: 0.65, // an unmanned helm steers itself at this share of the climb speed (Easy/Normal)
  // Enemies get busier with each lap: their fire rate is multiplied by this (lap 1 first).
  LAP_FIRE_RATE: [0.6, 0.8, 1.0, 1.15, 1.3],
  // Raider types. windup = seconds of warning ("!") before they strike.
  RAIDERS: {
    grunt: { name: 'Raider', hp: 3, speed: 85, windup: 0.6, reach: 40, species: 'skeleton', color: '#8c2f2f', scale: 1 },
    brute: { name: 'Brute', hp: 7, speed: 55, windup: 1.0, reach: 52, species: 'devil', color: '#5c2a1a', scale: 1.35, knockback: 140, noShove: true },
    sapper: { name: 'Sapper', hp: 2, speed: 100, windup: 0.6, reach: 40, species: 'skeleton', color: '#7a6420', scale: 0.95 },
    cutter: { name: 'Cutter', hp: 3, speed: 105, windup: 0.6, reach: 40, species: 'bat', color: '#2f4f8c', scale: 1 },
    MIX: { grunt: 0.5, brute: 0.15, sapper: 0.2, cutter: 0.15 }, // chances when a cargo plane drops a squad
    KO_TIME: 12,
    BOMB_FUSE: 10, // seconds until a sapper's bomb goes off
    DEFUSE_TIME: 1.6, // seconds of holding Action to defuse (no tool needed)
    CUT_DAMAGE: 14, // per second a cutter does to the module it's hacking
  },
  // Gun aim assist: pulls your aim toward a target near where you point.
  AIM_ASSIST: {
    ANGLE: 0.28, // radians: how close your aim must be for assist to kick in
    STRENGTH: 0.7, // 0 = off, 1 = snap fully onto the target
  },
  // Boiler: crew carry coal from the Coal Bunker. Burning coal builds pressure; too much
  // pressure must be vented at the vent stacks or the boiler blows.
  BOILER: {
    START_FUEL: 40,
    COAL_FUEL: 25, // fuel added per load of coal
    FUEL_MAX: 100,
    BURN_RATE: 0.35, // fuel burned per second (one load lasts about a minute)
    // Pressure in the line = heat in vs steam used. Heat comes from the coal in the firebox
    // (more coal = hotter fire, with diminishing returns). Steam is used by everything powered
    // (each open pipe valve), by open vents, burst pipes and pumping the gasbag, and all of
    // them use more when the pressure is higher, so the pressure settles where they balance.
    HEAT_MAX: 10, // heat from a firebox stuffed full
    HEAT_HALF: 20, // coal in the firebox that gives half that heat
    USE_REF: 60, // usage below is per second at this pressure (scales with pressure)
    USE_BASE: 1, // the boiler itself
    USE_ENGINE: 3, // each working engine, times the ship's speed
    USE_POWERED: 1, // each other powered module (helm, lift) with its valve open
    VENT_RATE: 10, // each open vent stack
    WARN_AT: 90, // "vent steam!" warning
    BLOWOUT_AT: 100, // boiler surely blows here: damages itself and bursts a pipe
    // Overdrive: the hotter the boiler runs above OVERDRIVE_AT the bigger the bonuses (full at
    // 100) - but from WARN_AT it rattles and each second has a growing chance to blow.
    OVERDRIVE_AT: 70, // bonuses start above this pressure
    USE_GAUGE: 20, // steam use that fills the whole "where the steam goes" bar on the TV
    OD_ENGINE: 0.2, // extra ship speed at full overdrive (0.2 = +20%)
    OD_PUMP: 0.5, // extra gasbag pumping speed at full overdrive
    OD_COIL: 0.6, // extra Lightning Coil charge speed at full overdrive
    BLOWOUT_RATE: 0.12, // chance per second of a blowout at 100 pressure (scales up from 0 at WARN_AT)
    WARN_SHAKE: 0.18, // screen rattle while over WARN_AT (more near the top)
  },
  // The gasbag is the big up/down control. The helm's PRESSURE lever pumps hot steam in (she
  // rises - fast when overfilled) or vents it (she drops - fast when deflated). At the neutral
  // fill she hangs still. Hot gas cools and seeps out, and holes leak more, so the helmsman
  // keeps topping it up. The envelope visibly swells and shrinks with the gas.
  GAS: {
    START: 50,
    NEUTRAL: 50, // gas level at which she neither rises nor falls
    LIFT: 8, // up/down push per point of gas away from neutral (pixels per second squared)
    DRAG: 1.1, // air drag on climbing/falling (lower = longer, floatier swoops)
    PUMP_RATE: 22, // gas pumped in per second (valve full open, good pressure)
    PUMP_STEAM: 6, // boiler pressure used per second while pumping full
    PUMP_MIN_PRESS: 15, // below this pressure the pump can't push any gas in
    VENT_RATE: 30, // gas vented per second (valve full open the other way)
    SEEP: 0.5, // gas cooling/seeping out per second
    LEAK_PER_HOLE: 0.9, // extra gas lost per second per hole
    SCRAPE_BELOW: 25, // grinding along the ground with gas below this, the hull scrapes...
    SCRAPE_DAMAGE: 5, // ...losing this much hull per second (before the difficulty multiplier)
    MAX_HOLES: 8,
    HOLE_CHANCE: 1, // chance a hit on the gasbag punches a hole
  },
  // When the hull gives out the ship breaks apart and the whole game starts over at the mast.
  WRECK: {
    TIME: 8, // seconds of breaking apart before the restart
  },
  // The look of the whole game, in one place. Simple style: calm, muted backgrounds (sky, rock,
  // caves); the ship in warm wood and cream; crew in their bright scarf colours; enemies and
  // their attacks in red; friendly shots in the shooter's colour; pickups and goals in gold.
  PALETTE: {
    // Style 2026: "Bomber XXL soft flat" - faded pastels, thin dark outlines.
    sky: '#cfe3ea', haze: '#e6ecea', rock: '#9a8670', cave: '#5d687a',
    woodLight: '#b98a5a', woodDark: '#6b4a32', brass: '#c9a85a', canvas: '#ebdfc0', canvasShade: '#d6c7a2',
    crew: '#ece3c8', crewGreen: '#8fb37a',
    enemy: '#a8443f', enemyDark: '#4a4346', enemyLight: '#c9706a',
    muzzle: '#f2d36b', fire: '#e8884a', smoke: '#9a9a9a',
    gold: '#f2d36b', ink: '#2b2622', panel: '#f3ead6',
  },
  // Outline weights (Style 2026, see art/ART_SPEC.md).
  OUTLINE: { MAIN: 3.4, SMALL: 2.5, SHIP: 4 },
  // Old-film effects. All OFF (the user found them unpleasant). Raise a number or set
  // LINE_BOIL to true to bring one back.
  STYLE: {
    LINE_BOIL: false, // outlines wobble like hand-drawn animation
    BOIL_FPS: 10,
    BOIL_AMOUNT: 2.2,
    WARM_TINT: 0, // old-film sepia warmth
    PAPER: 0, // paper texture
    GRAIN: 0, // jumping film grain
    VIGNETTE: 0, // darkened screen edges
    FLICKER: 0, // projector flicker
    SCRATCHES: false, // the odd film scratch
  },

  // Walking feel.
  MOVE: {
    WALK_SPEED: 230,
    ACCEL: 2300, // px/s² speeding up (about 0.1 s to full speed)
    BRAKE: 2300, // px/s² slowing down (a short ~0.1 s skid)
    JUMP_VY: 520, // px/s upward kick of a hop
    JUMP_GRAVITY: 1900, // px/s² pulling a jumper back down (hop lasts ~0.55 s, ~70 px high)
    JUMP_AIR_CONTROL: 0.8, // share of walking speed you can still steer in the air
    JUMP_DODGE: 28, // height (px) above the deck at which a jumper dodges a raider's swing
    JUMP_COOLDOWN: 0.15, // seconds after landing before the next hop
  },
  // Tools and close combat.
  TOOLS: {
    REACH: 65, // how close you must stand to a rack, hook or valve (generous: no pixel-perfect standing)
    STATION_REACH: 85, // how close to a gun, boiler, bunker or bomb bay for Action to load/grab/take it
    SWORD_RANGE: 95,
    SWORD_DAMAGE: 1,
    SWORD_COOLDOWN: 0.35,
    SWORD_KNOCKBACK: 60,
    SHOVE_RANGE: 65, // bare hands: pushes a raider back but does no damage
    SHOVE_COOLDOWN: 0.6,
    SHOVE_KNOCKBACK: 45,
    EXTINGUISH_TIME: 1.0, // seconds of spraying per fire
    PATCH_TIME: 1.5, // seconds of hammering per hole
    REVIVE_TIME: 1.2,
  },
  // Ship modules (guns, boiler, helm, engines, lift, steam pipes).
  MODULES: {
    HP: 100,
    HIT_DAMAGE: 55, // damage from an enemy hit right on top of a module...
    HIT_RADIUS: 180, // ...fading to nothing at this distance
    FIRE_DAMAGE: 6, // per second, per fire within FIRE_RADIUS on the same deck
    FIRE_RADIUS: 120,
    BOILER_BLOWOUT_DAMAGE: 35, // when pressure goes over the top
    REPAIR_RATE: 40, // hp per second while hammering
    STEAM_MIN: 10, // below this pressure nothing gets steam
    LEAK_FULL: 3, // steam lost per second by a fully broken steam module (proportional to its damage)
    LEAK_BELOW: 0.6, // a module only leaks once its health is below this share of full
    PIPE_LEAK: 6, // pressure lost per second from each burst pipe with its valve open
    UNPOWERED_LIFT: 0.25, // lift speed without steam (hand crank)
    NO_ENGINE_SPEED: 0.1, // top speed with both engines out
  },
  // Test bot behaviour (times in seconds).
  BOTS: {
    THINK_EVERY: 0.3, // how often a bot rethinks what to do
    WHACK_EVERY: 0.35, // time between swings at a raider
    ENGINEER_PRESS: 35, // steam this low: bots shut the valve of a leaking module (reopened after repair)
    OVERDRIVE_PUSH_EVERY: 45, // every third spell of this many seconds the bots stoke extra coal to reach overdrive
    BOILER_LOW: 55, // start stoking below this pressure
    BOILER_HIGH: 85, // stop stoking above this pressure
    HELM_SPEED: 0.55, // cruising speed the bot helmsman holds (0-1)
    AMMO_LOW: 10, // fetch ammo when a gun has this many shells or fewer
    AIM_TOLERANCE: 0.12, // fire when aim is within this many radians
    STATION_MIN: 20, // stay at a station at least this long...
    STATION_MAX: 40, // ...and at most this long, then rotate
    LEAVE_FOR_EMERGENCY: 0.2, // chance per think to leave a station when help is short
  },
  SPECIES: {
    bulldog: { fur: '#b08a62', ear: 'floppy' },
    wolf: { fur: '#7d8794', ear: 'point' },
    tiger: { fur: '#e8892b', ear: 'point', stripes: 1 },
    shiba: { fur: '#d9a05b', ear: 'point' },
    fox: { fur: '#d9572b', ear: 'point' },
    bear: { fur: '#6b4a33', ear: 'round' },
    cat: { fur: '#9a9a9a', ear: 'point' },
    rabbit: { fur: '#e8e2d6', ear: 'long' },
    // Monsters (raiders). Placeholder looks until their art arrives.
    skeleton: { fur: '#efe9dc', ear: 'none', monster: 1 },
    devil: { fur: '#c8372d', ear: 'point', horns: 1, monster: 1 },
    bat: { fur: '#4a3b5c', ear: 'bat', monster: 1 },
  },
  // Animals players (and test bots) can be.
  CREW_SPECIES: ['bulldog', 'wolf', 'tiger', 'shiba', 'fox', 'bear', 'cat', 'rabbit'],
};

// The ship layout (floors, ladders, stations, rooms) lives in shipLayout.js.
