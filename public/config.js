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
    PATH_CY: 470,
    PATH_RX: 1300, // half-width of the loop
    PATH_RY: 680, // half-height of the loop
    PATH_WOBBLE: 50, // small up-down weave
    TURN_SPEED: 0.38, // how fast it goes round (radians per second)
  },
  // How far the helm can climb/dive (world pixels either way) and how fast.
  SHIP: {
    ALT_RANGE: 260,
    CLIMB_SPEED: 170,
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
    EVERY_MIN: 12,
    EVERY_MAX: 20,
    EDGE_CHANCE: 0.6, // chance a mine skims the top/bottom (dodge it); otherwise it's dead centre (shoot it)
    RADIUS: 34,
  },
  // How hard different explosions hit the ship (1 = one enemy bullet).
  IMPACT: {
    MINE: 2.5,
    PLANE_CRASH: 3,
    BOMB: 2,
  },
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
    HEAT_RATE: 7, // pressure gained per second while there's fuel
    WARN_AT: 90, // "vent steam!" warning
    BLOWOUT_AT: 100, // boiler blows: damages itself and bursts a pipe
    VENT_RATE: 20, // pressure released per second while someone holds a vent
  },
  // Gasbag: shots punch holes that leak gas. Low gas = the ship sinks. Boiler pressure
  // pumps gas back in, so high pressure can keep a leaky ship afloat.
  GAS: {
    LEAK_PER_HOLE: 3, // gas lost per second per hole
    REFILL_RATE: 3, // gas gained per second at 100% pressure
    SINK_BELOW: 65, // below this much gas the ship starts sinking
    SINK_SPEED: 4, // how fast it sinks per point of gas below that
    SCRAPE_BELOW: 35, // at the lowest altitude with gas below this, the hull scrapes...
    SCRAPE_DAMAGE: 2, // ...losing this much hull per second
    MAX_HOLES: 8,
  },
  // Phase 3 cartoon film look (set an amount to 0, or LINE_BOIL to false, to turn it off).
  STYLE: {
    LINE_BOIL: true, // outlines wobble like hand-drawn animation
    BOIL_FPS: 10, // how often the wobble changes
    BOIL_AMOUNT: 2.2, // how far lines wobble
    WARM_TINT: 0.14, // old-film sepia warmth
    PAPER: 0.1, // paper texture strength
    GRAIN: 0.07, // jumping film grain
    VIGNETTE: 0.45, // darkened screen edges
    FLICKER: 0.035, // projector flicker
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
