export const config = {
  W: 1600,
  H: 900,
  INK: '#1b1410',
  MAX_PLAYERS: 16,
  PLAYER_COLORS: ['#e63946', '#f4a261', '#f1c40f', '#2a9d8f', '#3a86ff', '#8338ec', '#ff5da2', '#06d6a0', '#ff7b00', '#00b4d8', '#9ef01a', '#b5179e', '#ffffff', '#7f5539', '#4cc9f0', '#d00000'],
  // Camera framing.
  CAMERA: {
    SHIP_SCREEN_FRACTION: 0.38, // the ship takes at most this much of the screen width
    ENEMY_MARGIN: 260, // empty sky kept around the enemy plane (world pixels)
    MAX_ZOOM_OUT: 1.8, // never zoom out more than this beyond the normal view
    SMOOTHING: 1.6, // how quickly the camera catches up (higher = snappier)
  },
  // Enemy plane: flies a loop around the ship.
  ENEMY: {
    PATH_CX: 800, // centre of the loop
    PATH_CY: 452,
    PATH_RX: 1500, // half-width of the loop (big enough to go all the way round the ship)
    PATH_RY: 900, // half-height of the loop
    PATH_WOBBLE: 50, // small up-down weave
    TURN_SPEED: 0.38, // how fast it goes round (radians per second)
  },
  // How far the helm can climb/dive (world pixels either way) and how fast.
  SHIP: {
    ALT_RANGE: 260,
    CLIMB_SPEED: 170,
    HULL_DAMAGE: 1, // multiplier on hull damage taken (armour upgrades lower it)
    HIT_DAMAGE: 3, // hull lost per enemy bullet hit (bigger blasts scale this up)
    HOLE_CHANCE: 0.6, // chance an enemy bullet hit punches a hole in the deck
    TILT_MAX: 0.06, // most the nose tips up/down while climbing or diving (radians, about 3.5 degrees)
    TILT_PER_SPEED: 0.0004, // tilt per pixel/second of climb
    TILT_SMOOTH: 3, // how quickly the tilt follows (higher = snappier)
    TILT_PIVOT: [800, 520], // the point the ship tips around (ship coordinates)
  },
  // Ship guns (upgrades change these).
  GUNS: {
    COOLDOWN: 0.55, // seconds between shots
    DAMAGE: 1, // damage per shell hit
    LOAD: 4, // shells added per ammo crate
    AUTOLOAD_EVERY: 0, // seconds per free shell (0 = off; the Auto-Loader upgrade turns it on)
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
    GROUND: 1350, // ground level far below the ship (world y)
    FIRST_FEATURE: 4000, // distance before the first obstacle
    GAP_MIN: 700, // open sky between obstacles...
    GAP_MAX: 1600,
    UNDERPASS_GAP_START: 280, // how much altitude room an underpass leaves at first...
    UNDERPASS_GAP_END: 150, // ...shrinking to this as you go further
    HARDEST_AT: 240000, // distance at which obstacles reach full difficulty (about lap 3)
    LOOP_LENGTH: 110000, // one lap: out to the beacon and back home (~6 minutes at cruising speed)
    SECTIONS: 6, // markers per lap: home, checkpoints, beacon halfway
    CHECKPOINT_REPAIR: 15, // hull repaired by the supplies at each checkpoint flag
    MARKER_CLEAR: 1800, // open sky kept around every marker (safe restart spots)
    REWIND_BEFORE: 900, // after going down, restart this far before the last marker
    SCRAPE_COOLDOWN: 0.45, // seconds between scrape damage while touching rock
    WARN_SECONDS: 3, // warning before an obstacle...
    LOOKOUT_WARN_SECONDS: 5, // ...earlier with someone on Lookout
    TURRET_HP: 3,
    TURRET_FIRE_MIN: 4, // seconds between flak shots
    TURRET_FIRE_MAX: 6.5,
    TURRET_RANGE: 2000,
    FLAK_MISS: 0.3, // share of flak that misses anyway (weaving at the helm adds more)
    FLAK_SPEED: 520,
    ROCKET_SHARE: 0.45, // share of turrets that are rocket batteries at full difficulty
    ROCKET_SPEED: 300,
    ROCKET_TURN: 1.3, // how sharply rockets home in (radians per second)
    ROCKET_LIFE: 7,
    ROCKET_IMPACT: 1.3,
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
    BAT_IMPACT: 0.4, // how hard a bat bursting on the ship hits (1 = an enemy bullet)
    BOMBER_SPEED: 120,
    BOMBER_HP: 9,
    BOMB_EVERY: 1.8, // seconds between bombs while over the ship
    BOMB_IMPACT: 1.0,
    STRAFER_SPEED: 620,
    STRAFER_HP: 3,
    STRAFER_FIRE_EVERY: 0.22,
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
    easy: { label: 'Easy', damage: 0.12, pace: 0.75, autopilot: true },
    normal: { label: 'Normal', damage: 0.2, pace: 0.9, autopilot: true },
    hard: { label: 'Hard', damage: 0.5, pace: 1.3, autopilot: false },
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
    BURN_RATE: 1.6, // fuel burned per second
    // Pressure in the line = heat in vs steam used. Heat comes from the coal in the firebox
    // (more coal = hotter fire). Steam is used by everything powered (each open pipe valve),
    // by open vents and by burst pipes, and all of them use more when the pressure is higher,
    // so the pressure settles where heat and use balance.
    HEAT_PER_COAL: 0.16, // pressure gained per second per unit of coal in the firebox
    USE_REF: 60, // usage below is per second at this pressure (scales with pressure)
    USE_BASE: 1, // the boiler itself
    USE_ENGINE: 3, // each working engine, times the ship's speed
    USE_POWERED: 1, // each other powered module (helm, lift) with its valve open
    VENT_RATE: 10, // each open vent stack
    WARN_AT: 90, // "vent steam!" warning
    BLOWOUT_AT: 100, // boiler blows: damages itself and bursts a pipe
  },
  // Lift comes from the GAS in the gasbag (not straight from the boiler): too little and the ship
  // sinks, too much and it floats up. The helm has to fight the drift.
  BUOYANCY: {
    SINKY_BELOW: 40, // below this much gas the ship drifts down...
    FLOATY_ABOVE: 75, // ...above this it drifts up (open a vent to settle it)
    DRIFT: 2.2, // altitude drift per second for each point of gas outside the band
  },
  // Gasbag: boiler pressure pumps gas in, the envelope seeps a little out, and holes leak more.
  // With no holes the gas settles near the pressure; each hole costs about 13 points, so a
  // leaky ship needs more pressure to stay up.
  GAS: {
    START: 65,
    REFILL_RATE: 9, // gas pumped in per second at 100% pressure
    SEEP: 9, // gas seeping out per second when the bag is full (less when emptier)
    LEAK_PER_HOLE: 1.2, // extra gas lost per second per hole
    SCRAPE_BELOW: 35, // at the lowest altitude with gas below this, the hull scrapes...
    SCRAPE_DAMAGE: 5, // ...losing this much hull per second (before the difficulty multiplier)
    MAX_HOLES: 8,
    HOLE_CHANCE: 1, // chance a hit on the gasbag punches a hole
  },
  // When the hull gives out the ship breaks apart and the whole game starts over at the mast.
  WRECK: {
    TIME: 8, // seconds of breaking apart before the restart
  },
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
    ACCEL: 1600, // px/s² speeding up
    BRAKE: 3200, // px/s² slowing down (snappy stops)
  },
  // Tools and close combat.
  TOOLS: {
    REACH: 45, // how close you must stand to a rack, hook or valve
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
    PIPE_LEAK: 6, // pressure lost per second from each burst pipe with its valve open
    UNPOWERED_LIFT: 0.25, // lift speed without steam (hand crank)
    NO_ENGINE_SPEED: 0.1, // top speed with both engines out
  },
  // Test bot behaviour (times in seconds).
  BOTS: {
    THINK_EVERY: 0.3, // how often a bot rethinks what to do
    WHACK_EVERY: 0.35, // time between swings at a raider
    BOILER_LOW: 55, // start stoking below this pressure
    BOILER_HIGH: 85, // stop stoking above this pressure
    HELM_SPEED: 0.55, // cruising speed the bot helmsman holds (0-1)
    AMMO_LOW: 3, // fetch ammo when a gun has this many shells or fewer
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
