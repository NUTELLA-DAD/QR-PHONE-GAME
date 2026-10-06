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
  // Big enemies (bombers, boss) bump off the ship instead of crashing. Scaled by their size.
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
    // Two patrol planes hang under the hull. With nobody at the station she flies herself:
    AUTO_PATROL: true, // false = she only flies when someone takes the station
    PATROL_ENGAGE: 1500, // the auto pilot only goes after enemies this close to the ship
    PATROL_IDLE: 10, // seconds with nothing to shoot before the auto pilot flies home
    PATROL_FIRE_CONE: 0.14, // auto pilot aims worse than a human (radians, vs FIRE_CONE)
    PATROL_SHOT_EVERY: 0.38, // ...and fires slower (vs SHOT_EVERY)
    PATROL_MIN_HP: 0.75, // she won't launch on auto below this share of her hp
    PATROL_RETURN_HP: 0.5, // below this share of hp the auto pilot flies home
    REPAIR_RATE: 0.12, // hp repaired per second while docked
    CRAMPED: 0.12, // share of the space round the ship that is rock before the auto pilot stays home
    BOT_MAX: 1, // bot crew will fly at most this many of the planes at once
    ORBIT_SPREAD: 0.4, // the second plane circles this much wider
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
    STAY: 150, // seconds engaged (hunting or latched on) before it pulls away
    PLANT_TIME: 2.5, // holding Action at its boiler to set the charge
    FUSE: 8, // seconds to get back before it blows
    CUT_TIME: 7, // seconds its crew need to hack through the rope (they wait 3s first)
    // -- Her own flight: gasbag + engines + boiler + helm, like ours. Positions are offsets from our ship --
    START_DX: 4200, // she appears this far ahead of our ship (pixels) as a small shape on the horizon (nearer if rock is in the way)...
    START_DY: 300, // ...and up to this much above or below
    START_VX: -330, // her world speed as she appears (she is flying toward us, nose left, engines roaring)
    HOLD_DX: 0, // the station her helmsman tries to hold, relative to our ship (0,0 = broadside off our bow, level)
    HOLD_DY: 0,
    DOCK_DX: 250, // "on station" once she is this close to it (sideways) and...
    DOCK_DY: 150, // ...this close (up/down)
    MAX_SPEED: 760, // her top forward speed through the world (our top is 560, a bit more in overdrive)
    ENGINE_ACC: 430, // full-throttle engine push (pixels/s per second); top speed = this / DRAG_X
    DRAG_X: 0.5, // air drag on her (per second): with the engines idle she coasts to a stop
    REVERSE: 0.35, // share of full power available astern
    THROTTLE_RESP: 2.5, // how quickly the engines spool up and down (per second)
    ENGINE_GAIN: 1.4, // how hard her helmsman asks for throttle toward the speed he wants
    KX: 0.9, // how strongly she closes a sideways gap (wanted closing speed = KX x gap)
    MAX_CLOSE: 650, // fastest she will close on her station
    CLOSE_PASS: 1150, // fastest closing speed on a strafing run / retreat
    LIFT_ACC: 900, // gasbag lift: acceleration = (gas - 0.5) x this; 0.5 = neutral buoyancy (like ours)
    DRAG_Y: 1.2, // vertical drag (so full gas climbs at about 0.5 x LIFT_ACC / DRAG_Y)
    GAS_RATE: 0.22, // how fast her crew can fill or vent the bag (fraction per second) at full steam
    GAS_DAMP: 1.6, // helmsman damping when setting the gas
    GAS_PUMP_MIN: 0.3, // pump speed with no steam (share of GAS_RATE)
    LEAK_NOHELM: 0.025, // gas leaking per second when nobody tends the bag (she sags)
    LEAK_DAMAGE: 0.02, // extra leak per second at zero hull (scaled by damage)
    MAX_VY: 370, // her fastest climb/dive
    KY: 1.1, // how strongly she corrects being above/below her station
    REACT: 0.8, // seconds her helmsman takes to notice what our ship is doing (bigger = more lag)
    WOBBLE_X: 70, // she never sits perfectly still: slow sway around her station
    WOBBLE_Y: 40,
    STEAM_FEED: 0.3, // boiler pressure gained per second while her stoker is at the boiler
    STEAM_LOSS: 0.03, // ...and lost per second with nobody stoking
    STEAM_USE: 0.14, // ...plus this much per second at full throttle
    STEAM_MIN: 0.3, // engine power with the boiler cold (share of full)
    ENGINE_HIT: 0.06, // chance a shell that hits her hull or bag also damages an engine
    ENGINE_DMG: 0.25, // engine health lost per such hit (0..1)
    ENGINE_REPAIR: 0.012, // engine health her crew patch back per second (a retreat repairs faster)
    GAS_HIT: 0.012, // gas lost from the bag per shell that hits it
    // -- Turning round (a squash through the middle, ~1.5 s; only when nobody is aboard and no rope is on) --
    TURN_TIME: 1.5,
    TURN_CD: 5, // seconds between turns
    TURN_AHEAD: 1900, // she swings round to station heading this far out from a station
    TURN_MIN_SPEED: 150, // wanted world speed that makes her point her nose that way
    // -- Captain: what she does (scored from her health, guns, crew, room) --
    STRAFE_CD: 22, // seconds between strafing runs
    STRAFE_CHANCE: 0.5, // chance she goes for a strafing run (when allowed) each time her captain picks the next move
    STRAFE_CLOSE: 750, // her closing speed along a strafing run (slow enough for a couple of broadsides)
    WP_TIMEOUT: 22, // a strafing run that takes longer than this (blocked by rock) is abandoned
    STRAFE_FIRE: 3.5, // seconds between broadsides while strafing (faster than at a station)
    STRAFE_Y_HI: -1000, // strafing height above our ship (she passes over the top)...
    STRAFE_Y_LO: 900, // ...or underneath
    RETREAT_AT: 0.42, // she pulls out to repair when her hull is this fraction of full or lower
    RETURN_AT: 0.8, // ...and comes back at this fraction
    RETREATS: 1, // how many times
    RETREAT_MAX: 35, // longest she stays away repairing
    RETREAT_DX: 3600, // where she goes to repair (ahead of us)
    REPAIR_SEA: 0.6, // hull points per second her crew patch while she is away (+0.2 per guard)
    FLEE_AT: 0.15, // with her retreats used up, she flees when the hull is this fraction of full
    WP_PASS: 380, // a waypoint on a run counts as reached within this
    TILT_MAX: 0.14, // her nose-up / nose-down (radians) in a climb or dive (less while crew are aboard)
    TILT_ABOARD: 0.03,
    // -- Terrain: she is solid. Her outline (gasbag + hull) is tested against rock every step --
    MAX_SPEED_ANY: 780, // her speed in any direction never exceeds this, even when the rope yanks her
    ROCK_MARGIN: 70, // her helmsman wants this much clear space around her when choosing where to sit
    PUSH_STEP: 30, // push-out search resolution (pixels)
    ROCK_BOUNCE: 0.25, // share of her speed that bounces back off a wall
    ROCK_DAMAGE: 0.8, // hull points lost per scrape (scaled by how fast she hit, 0.25x to 3x)
    SCRAPE_CD: 0.5, // seconds between clang/damage events while she grinds along rock
    SCRAPE_SHOVE: 160, // sideways stagger for crew standing on her deck when she hits
    LOOKAHEAD: 1.3, // seconds ahead her helmsman looks along her own velocity for rock
    PLAN_EVERY: 0.25, // seconds between her free-space checks (station spots)
    ROCK_BREAKOFF: 8, // seconds of "no room to manoeuvre" before she breaks off
    SHIP_RECT: { x0: 100, x1: 1520, y0: -120, y1: 960 }, // our ship's box: she is nudged away if she overlaps it
    // -- Free manoeuvring: her captain flies a ring round our ship, stopping at firing spots (nodes) --
    // dx/dy = her offset from our ship. fire = she shoots from here, drop = paratroopers jump from here
    // (high up and ahead so they can drift down onto our catwalk), w = how often it is picked, links =
    // nodes she can fly to directly (the ring keeps her clear of our ship). Nodes blocked by rock are not used.
    NODES: {
      bow: { dx: 0, dy: 0, fire: true, w: 3, links: ['high', 'c1', 'c2'] },
      high: { dx: -300, dy: -800, fire: true, drop: true, w: 2, links: ['bow', 'c1'] },
      c1: { dx: 0, dy: -1100, links: ['bow', 'high', 'A'] },
      A: { dx: -1700, dy: -1100, fire: true, w: 1, links: ['c1', 'c3'] },
      c3: { dx: -3700, dy: -1100, links: ['A', 'K'] },
      K: { dx: -3700, dy: -100, w: 1, links: ['c3', 'c4'] },
      c4: { dx: -3700, dy: 1000, links: ['K', 'B'] },
      B: { dx: -1900, dy: 1000, w: 1, links: ['c4', 'c2'] },
      c2: { dx: 0, dy: 1000, links: ['B', 'bow'] },
    },
    STAY_MIN: 7, // seconds she stays at a firing spot before her captain moves her...
    STAY_MAX: 13,
    NODE_ARRIVE: 120, // "there" (final spot)
    NODE_PASS: 260, // ring corners count as passed within this distance
    FIRE_RANGE: 2300, // her gunners only fire at our hull from this close (and with a clear line)
    // -- Gun ports (destroyable: when all are down, or her gunners are, she latches on) --
    PORT_HP: 6, // shell damage a gun port takes (0.5 per shell, so 12 shells)
    APPROACH_GIVEUP: 25, // seconds she keeps trying to get in before giving up and leaving
    PORT_RADIUS: 55, // how close a shell must be to hit a port
    // -- Latching on --
    LATCH_RANGE: 760, // she fires her own grapple once her yardarm is this close to our bow
    LATCH_RETRY: 6, // seconds before she re-fires after we cut her line
    LATCH_SEND_EVERY: 6, // seconds between raiders crossing her rope to board us
    LATCH_EXTRA: 4, // extra deckhands (beyond her guards) that can cross the rope
    CUT_HOLD: 3, // seconds of holding Action at our bow to cut her grapple line
    // -- Paratroopers: raiders jump from her deck and parachute onto our ship --
    PARA_FIRST: 12, // seconds after she gets on station before the first drop
    PARA_EVERY_MIN: 26, // seconds between drops
    PARA_EVERY_MAX: 38,
    PARA_FALL: 85, // descent speed under the chute (pixels/s)
    PARA_STEER: 230, // sideways steering speed toward our deck
    PARA_HP: 1, // shell damage to kill one (0.5 per shell = 2 shells)
    PARA_MAX_AIR: 5, // no new drop while this many are still in the air
    PARA_MAX_BOARDERS: 3, // ...or while this many raiders are already on our ship
    GONE_DIST: 6500, // lost for good (removed) if she gets this far from us in any direction
    // -- Her broadsides get less accurate the further she is from her station --
    MISS_BASE: 0.15, // chance a cannonball misses even when perfectly placed
    MISS_DX: 1500, // her guns are fully accurate within 1500px of our hull, then each this-many pixels further adds +100% miss chance
    MISS_MAX: 0.92,
    // -- Hookshot rope --
    HOOK_RANGE: 900, // the grapple only catches if the yardarm is this close to our bow
    SWING_RANGE: 620, // you can only swing across while the rope is hooked and she is this close
    BOARD_LEN: 470, // the winch reels the rope in to this length (pixels)
    REEL_SPEED: 45, // reeling speed (pixels per second)
    SNAP_LEN: 1250, // the rope snaps if the ships get this far apart
    ROPE_K: 5, // taut rope pulls HER back (accel per pixel of stretch)...
    ROPE_DAMP: 1.8, // ...and kills the speed she's pulling away at
    ROPE_MAX_ACC: 700, // strongest rope pull on her
    TUG_VY: 0.35, // gentle tug on OUR ship's climb speed per pixel of stretch
    TUG_SPEED: 0.0005, // gentle tug on OUR ship's throttle (fraction of speed per second per pixel of stretch)
    TUG_CAP: 300, // stretch beyond this adds no more tug on our ship
    TILT_PER_SPEED: 0.0008, // her tilt (radians) per pixel/second of climb
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
    // The director runs one rhythm per mission: BUILD (small trickle, rising) -> PEAK (one big set piece)
    // -> CALM (nothing new; stragglers leave; supply balloon) -> repeat.
    BUILD: 48, // seconds of build-up (shorter on later missions / harder settings, longer on easy)
    BUILD_MIN: 30, // ...but never shorter than this
    BUILD_PER_MISSION: 0.08, // build-up shrinks by this share per mission after the first
    RATE_START: 0.45, // trickle speed at the start of a build-up (1 = the modules' own timers)...
    RATE_END: 1.15, // ...rising to this by its end
    PEAK_RATE: 0.35, // trickle speed while a set piece is on (the set piece is the main event)
    PEAK_MIN: 20, // a set piece lasts at least this long...
    PEAK_MAX: 50, // ...and is called off (calm) after this long even if enemies remain
    GUNSHIP_PEAK_MAX: 120, // (the gunship fight gets longer)
    GUNSHIP_GAP: 80, // seconds after one gunship before the next may be the set piece
    GUNSHIP_FIRST: 70, // seconds into a mission before the first gunship may come
    SWARM_MULT: 1.8, // a bat-swarm set piece is this many times a normal swarm
    BOSS_LEAD: 0.12, // no new set piece starts within this share of the route before the boss (it is the next one)
    CALM: 34, // nothing new arrives for this long after a set piece
    CALM_LEAVE: 4, // seconds into a calm before far-off stragglers go home
    CALM_FORCE: 16, // seconds into a calm before every straggler goes (unless crew are fighting them)
    CALM_FAR: 2200, // "far off" = this many px from the ship
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
    SCORECARD_TIME: 8, // seconds the mission scorecard shows before the sky-dock
  },
  // SALVAGE: the currency of a voyage. Earned in missions, spent at the sky-dock.
  SALVAGE: {
    PER_KILL: 2, // each enemy shot down
    OUTPOST: 15, // an outpost knocked out
    GUNSHIP_BOARDED: 45, // a gunship blown up by a boarding party
    GUNSHIP_SHOT: 15, // a gunship shot down
    BOSS: 70,
    MISSION: 30, // bonus for finishing a mission (plus the stop's own reward)
  },
  // The SKY-DOCK shop between missions.
  SHOP: {
    OFFERS: 6, // cards on offer (repairs and upgrades), plus the Cast off card
    TIME: 20, // seconds to vote on each purchase
    MAX_TIME: 55, // the whole shop closes after this long
    ALL_VOTED_WAIT: 1.2,
    REPEAT_PRICE: 0.5, // an upgrade costs this much more per time it has been bought already
    PRICE_DEFAULT: 70,
    PRICES: { 'twin-barrels': 90, 'big-shells': 90, 'deep-magazines': 70, 'auto-loader': 90, armour: 100, reinforced: 90, firebox: 70, 'safety-valve': 80, 'twin-gasbag': 110, 'rubber-gasbag': 70, rudders: 80, cutlasses: 60, sprinklers: 60, 'hammer-drills': 70, periscope: 50 },
    REPAIR_HULL: 40, // full hull, every hole and every broken part
    REPAIR_GAS: 25, // gasbag refilled and holes patched
    REPAIR_COAL: 20, // boiler topped up with coal, guns with shells
    BOT_CAST_CHANCE: 0.3, // bots: chance to cast off on each round
  },
  // THE VOYAGE: a branching route of stops across the Broken Skies; one run = one voyage.
  VOYAGE: {
    STOPS_MIN: 6, // columns on the map, first (launch) and last (the Flagship) included
    STOPS_MAX: 8,
    CHOICES_MIN: 2, // stops to choose between in each middle column
    CHOICES_MAX: 3,
    ROUTE_TIME: 20, // seconds to vote on the next stop
    ROUTE_ALL_VOTED_WAIT: 1.2,
    REWARD_BASE: 10, // a stop's salvage reward: base + per skull + random
    REWARD_PER_DANGER: 15,
    REWARD_RANDOM: 10,
    DANGER_DAMAGE: 0.2, // hull damage is 1 + (skulls - 2) * this
    DANGER_FIRE: 0.2, // enemy fire rate likewise
    WRECK_SUMMARY_TIME: 10, // seconds the run summary shows after the ship is lost (before the lobby)
    VICTORY_TIME: 25, // seconds the victory screen shows
    // Planned environments. Not-ready ones fly as Sky Isles for now but show their real name.
    ENVIRONMENTS: {
      skyisles: { name: 'Sky Isles', icon: '🏝️', color: '#7fb6d9', ready: true },
      frost: { name: 'Frost Peaks', icon: '❄️', color: '#bfe3f0', ready: true },
      ember: { name: 'Ember Forge', icon: '🌋', color: '#e0713a', ready: true },
      storm: { name: 'Storm Front', icon: '⛈️', color: '#6a6f9a', ready: false },
      sea: { name: 'Sunken Sea', icon: '🌊', color: '#3f8fa6', ready: false },
      fungal: { name: 'Fungal Depths', icon: '🍄', color: '#8a6fb0', ready: false },
      aether: { name: 'The Aether', icon: '🌌', color: '#4b3f7a', ready: false },
    },
    KIND_NAMES: { network: 'Cave run', route: 'Narrow pass', open: 'Outpost raid' },
  },
  // Fires.
  FIRE: {
    SPREAD_EVERY: 7, // seconds before a fire spreads
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
    WIDTH_PER_LEVEL: 10, // ...growing with each mission
    HEIGHT_PER_LEVEL: 6,
    ROOMS: 8, // caverns along the way (more on later missions)
    BRANCHES: 3, // side caves that dead-end (network maps)
    TUNNEL_CELLS: 8, // tunnel height (the ship needs 7)
    SHAFT_CELLS: 12, // shaft width (the ship needs 11)
    GOAL_RADIUS: 700, // how close to the beacon counts as reaching it
    OPEN_WIDTH: 190, // open-sky map size (squares) for its first mission
    OPEN_HEIGHT: 50,
    OUTPOSTS: 3, // outposts to destroy on an open-sky map (more later)
    STUCK_AFTER: 25, // seconds without real headway before the pilot plan tries to unstick the ship
    UNSTICK_TIME: 8, // seconds the unstick manoeuvre lasts (back off, then take a longer look ahead)
    KM: 4000, // map pixels shown as one "km" on the TV goal readout
    LENGTH: { network: 1.2, route: 1.15, open: 1.2 }, // length knob per mission type: multiplies the map width (so the flying time)
    BOMB_RUN_RANGE: 7000, // bots start loading the bomb bay when the next outpost is this close (px)
    OUTPOST_REFILL: true, // knocking out an outpost restocks the bomb bay to full
    BOMB_RUN_MAN: 2600, // within this distance of the outpost one bot drops everything to man the bomb bay (px)
    BOMB_RUN_STOCK: 4, // ...and keep it stocked to at least this many bombs
    DETOUR: 1.6, // an open map is rebuilt if the way from the start to an outpost (or between outposts) is more than this many times the straight trip (mountains in the way)
    STATION_SLACK: 3, // an outpost's hover spot may be at most this many squares lower than planned (else the map is rebuilt)
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
    BOSS_HP: 36,
    BOSS_HP_PER_LAP: 10, // extra boss toughness per mission...
    BOSS_HP_LAPS: 4, // ...for at most this many missions
    BOSS_FLAGSHIP_HP: 100, // the Flagship (last stop of a voyage)
    BOSS_STATION_X: 2700, // where it parks, ahead of the ship
    BOSS_FIRE_EVERY: 3.4,
    BOSS_BOARD_EVERY: 40, // seconds between boarding parties
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
    MIX: { grunt: 0.5, brute: 0.15, sapper: 0.2, cutter: 0.15 }, // chances for each raider that lands from a gunship or boarding line
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
  // Sky effects (modules/host/skyArt.js): sun, god-rays, birds, far airships. All soft and faint.
  SKY: {
    ENABLED: true,
    SUN: { X: 0.78, Y: 0.2, DUSK_DROP: 0.3, DISC: 0.04, GLOW: 0.32, GLOW_ALPHA: 0.3, DISC_ALPHA: 0.5, COLOR: '255,246,214', DUSK_COLOR: '255,196,140' },
    RAYS: { COUNT: 6, ALPHA: 0.06, LENGTH: 0.7, SPREAD: 0.9, PULSE: 0.25, COLOR: '255,250,228', DUSK_COLOR: '255,208,160' }, // off in storms
    BIRDS: { FLOCKS: 3, PER_FLOCK: 6, SPEED: 14, ALPHA: 0.4, SIZE: 0.011, PARALLAX: 0.05, COLOR: '58,66,78' },
    SHIPS: { COUNT: 2, SPEED: 5, ALPHA: 0.16, SIZE: 0.085, PARALLAX: 0.02, COLOR: '104,120,138' },
  },
  // Fog banks in valleys and caves, cave backdrop, light shafts and dust (skyArt.js).
  FOG: {
    ENABLED: true,
    COLOR: '226,233,234', DUSK_COLOR: '240,200,172', STORM_COLOR: '132,140,148',
    // OPEN_LEVEL = world y of the fog surface in open country (ground is at COURSE.GROUND);
    // CAVE_DEPTH = how far above the bottom of a cave map the fog top sits.
    OPEN_LEVEL: 1380, CAVE_DEPTH: 700,
    // Back layers sit BEHIND the rock (parallax = how much they follow the ground; less = farther).
    LAYERS: [
      { parallax: 0.55, alpha: 0.2, lift: -150, wave: 70, drift: 9, spacing: 70 },
      { parallax: 0.8, alpha: 0.22, lift: 0, wave: 55, drift: 14, spacing: 55 },
    ],
    FRONT: { parallax: 1, alpha: 0.1, lift: 120, wave: 45, drift: 20, spacing: 50, cave: 1.3 }, // thin, over the rock
    BOTTOM_BOOST: 1.6, // fog is this much thicker at the bottom than at its top
    TALL: 700, // px from the fog top to where it reaches full thickness
  },
  CAVE_ATMOS: {
    ENABLED: true,
    TOP: '#3e4756', BOTTOM: '#566174', // far wall colours (top of the map to the bottom)
    PILLARS: [
      { parallax: 0.35, alpha: 0.2, spacing: 620, chance: 0.6, color: '30,36,48' },
      { parallax: 0.6, alpha: 0.26, spacing: 760, chance: 0.55, color: '28,33,45' },
    ],
    SHAFTS: { SPACING: 9, CHANCE: 0.3, ALPHA: 0.085, LENGTH: 1500, WIDTH: 150, SPREAD: 320, PULSE: 0.3, COLOR: '236,242,248', DUSK_COLOR: '255,214,170' },
    DUST: { TILE: 1000, ALPHA: 0.35, SIZE: 3.2, SPEED: 6 },
  },
  // Environments (modules/host/environments.js + envArt.js): each mission can happen in one. 'skyisles'
  // is the original look and rules. FORCE = pin one id for testing (botsim --env). Each block holds the
  // palette, background layers, weather, flying modifiers, hazards and enemy weights ("favour").
  ENVIRONMENTS: {
    DEFAULT: 'skyisles',
    FORCE: null,
    skyisles: { name: 'Sky Isles', favour: { swarm: 1, imps: 1, bombers: 1, strafers: 1, gunship: 1 } },
    // FROST PEAKS: ice builds up on the gasbag, top deck and guns. Chip it off with the hammer.
    frost: {
      name: 'Frost Peaks',
      favour: { swarm: 0.7, imps: 0.5, bombers: 1.6, strafers: 1, gunship: 1 }, // more bombers
      sky: ['6f9cc4', 'bcd8ec', 'eef5fa'], sun: '255,255,255', ridgeHaze: '232,242,250',
      rock: '#c6d7e6', rockStripes: ['rgba(60,90,130,.16)', 'rgba(255,255,255,.35)'], rockHaze: 'rgba(214,230,246,.2)',
      rim: 'rgba(235,246,255,.75)', edgeDark: '#cfe2f1', edgeLight: '#ffffff', // snow lying on floors
      cave: ['#4b6f96', '#7a9cbc'], pillar: '22,38,62', fog: '222,236,248', shaft: '214,236,255',
      ridges: [
        { f: 0.02, base: 0.86, amp: 190, freq: 0.003, color: '#b7cbe0', snow: '#ffffff' },
        { f: 0.045, base: 0.91, amp: 130, freq: 0.004, color: '#a3bbd3', snow: '#f4f9ff' },
        { f: 0.1, base: 0.98, amp: 100, freq: 0.007, color: '#8ca6c0', snow: '#eef6ff' },
      ],
      SNOW: { COUNT: 140, SPEED: 95, DRIFT: -30, SIZE: 3.4, TILE_W: 2600, TILE_H: 1500, ALPHA: 0.8 },
      BLIZZARD: { FIRST: 40, EVERY_MIN: 55, EVERY_MAX: 90, TIME: 14, WIND: 50, HAZE: 0.32, SNOW_MUL: 3 }, // wind = px per second the gust shoves the ship along
      ICE: {
        SPAWN_EVERY: 11, // seconds between new crusts while flying (a blizzard doubles the rate)
        MAX_CRUSTS: 8, // at most this many crusts on the ship at once
        START: 0.25, GROW: 0.011, // a crust starts at this size (0-1) and grows this much per second
        AREAS: { gasbag: 0.45, topdeck: 0.25, gun: 0.3 }, // chance a new crust lands on each area
        GASBAG_CAP: 3, DECK_CAP: 3, // crusts of an area that count as "fully iced" for the weight
        SINK: 8, // full ice on the gasbag raises the gas level she needs to hover by this many points (she sinks)
        DECK_SINK: 3, // ...and a fully iced top deck by this many
        GUN_SLOW: 1.6, // an iced gun's cooldown grows by this much times the ice (1 = double)
        JAM_AT: 0.8, // ice this thick jams a gun completely ("ICED - chip it!")
        CHIP_TIME: 2.2, // seconds of hammering to knock a crust off
        JOB_AT: 0.35, // crusts thicker than this show up as a job on idle phones and for the bots
      },
    },
    // EMBER FORGE: lava low in the map. Thermals over it lift the ship hard, getting too low sets the
    // hull on fire and overheats the boiler. Smoke drifts across the screen (visual only).
    ember: {
      name: 'Ember Forge',
      favour: { swarm: 2.2, imps: 1.4, bombers: 0.8, strafers: 0.8, gunship: 1 }, // magma bats
      sky: ['2a1216', '7a2e22', 'd4692e'], sun: '255,150,70', ridgeHaze: '150,60,40',
      rock: '#4c3a3e', rockStripes: ['rgba(10,4,6,.3)', 'rgba(255,110,50,.14)'], rockHaze: 'rgba(150,60,40,.2)',
      rim: 'rgba(255,150,80,.55)', edgeDark: '#7a2a14', edgeLight: '#ff8a34', // a glowing crust on the floors
      cave: ['#1c0d10', '#42191a'], pillar: '12,4,6', fog: '130,56,40', shaft: '255,150,80',
      ridges: [
        { f: 0.02, base: 0.86, amp: 180, freq: 0.003, color: '#6a2c26', snow: null },
        { f: 0.045, base: 0.92, amp: 130, freq: 0.004, color: '#52211e', snow: null },
        { f: 0.1, base: 0.98, amp: 100, freq: 0.007, color: '#3a1816', snow: null },
      ],
      EMBERS: { COUNT: 70, SPEED: 70, SIZE: 3.2, TILE_W: 2600, TILE_H: 1500 },
      LAVA: {
        OPEN_SHARE: 0.55, // the lava surface sits where this share of a map's columns have open sky below it...
        ROWS_MIN: 8, ROWS_MAX: 24, // ...but is always between this many map rows deep and that many
        COLOR: ['#ffcf4a', '#ff7a1c', '#c8320f'], GLOW: 700, // glow height above the surface (px)
        KEEL: 380, // the ship's underside is this far below her reference point (px)
        THERMAL_RANGE: 1100, // thermals reach this far above the lava (px)
        THERMAL_LIFT: 150, // extra upward push at full heat (px per second squared; the gas valve is 8 per gas point)
        BURN_MARGIN: 200, // keel this close to the lava (or lower) sets the hull on fire
        FIRE_EVERY: 6, // seconds between new fires while scorched
        MAX_FIRES: 4, // she won't start fires past this many
        PRESS_RATE: 1.0, // boiler pressure gained per second at full heat (vent it!)
        BURN_PRESS: 1.4, // ...and extra while scorched
        PLUME_EVERY: 2300, // smoke plumes rise from the lava every this many px
      },
      SMOKE: { FIRST: 35, EVERY_MIN: 35, EVERY_MAX: 60, TIME: 11, ALPHA: 0.34 },
      bat: { body: '#d2491f', wing: '#e8742a' }, // magma bats
    },
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
    ACCEL: 2300, // px/s² speeding up (about 0.1 s to full speed)
    BRAKE: 2300, // px/s² slowing down (a short ~0.1 s skid)
    JUMP_VY: 520, // px/s upward kick of a hop
    JUMP_GRAVITY: 1900, // px/s² pulling a jumper back down (hop lasts ~0.55 s, ~70 px high)
    JUMP_AIR_CONTROL: 0.8, // share of walking speed you can still steer in the air
    JUMP_DODGE: 28, // height (px) above the deck at which a jumper dodges a raider's swing
    JUMP_COOLDOWN: 0.15, // seconds after landing before the next hop
  },
  // Airborne play (jumping off the ship, falling onto lower decks, being thrown about).
  AIR: {
    GRAVITY: 1900, // px/s² while falling free (same as the hop, so a jump off an edge feels continuous)
    MAX_FALL: 1150, // terminal falling speed (px/s)
    STEER_ACCEL: 520, // px/s² of sideways push from the stick in the air
    DRAG: 2.2, // sideways air drag (per second); steer speed tops out near STEER_ACCEL / DRAG (~240 px/s)
    SHIP_DRIFT: 150, // px/s the air carries a faller backwards at full ship speed (the ship flies on without them)
    EDGE_HOLD: 0.3, // seconds of pushing at the end of an OUTSIDE deck before you step off it
    EDGE_HOP: 0.5, // stick push (0-1) needed at a deck end during a jump to leave the deck
    VAULT_DROP: 140, // px/s downward shove when you jump over the rail with the stick held DOWN (outside decks)
    STUN_HEIGHT: 330, // fall height (px) above which landing stuns you
    STUN_TIME: 0.9, // seconds of stun after a big fall
    SQUASH_TIME: 0.28, // seconds of landing squash (drawing only)
    OVERBOARD_Y: 1150, // fall below this (ship coordinates) and you are overboard
    OVERBOARD_X: 520, // or this far beyond the ship's ends (px past 0 / 1600)
    TUMBLE_SPIN: 9, // radians/s of tumbling once overboard
    TUMBLE_ACCEL: 1500, // px/s² a tumbling faller speeds up (they drop away fast)
    STAGGER_POWER: 0.8, // a hit this strong makes standing crew on OUTSIDE decks stagger
    STAGGER_KICK: 380, // px/s sideways shove per hit power (capped at 3x), about 30-60 px of slide
    STAGGER_TIME: 0.45, // seconds a stagger lasts (drawn as a lean)
    KNOCK_POWER: 2.4, // a hit this big can throw an outside-deck player off their feet and over the rail
    KNOCK_CHANCE: 0.22, // chance per eligible player of being thrown by such a hit
    KNOCK_VX: 240, // sideways launch speed when thrown
    KNOCK_VY: 380, // upward launch speed when thrown (they land on the deck below, or go overboard)
    PITCH_STAGGER: 0.035, // ship pitch (radians; max is 0.06) beyond which outside-deck crew slide toward the low end
    PITCH_SLIDE: 260, // px/s slide at full pitch
    GRAB_REACH: 30, // px: fly or hop this close (sideways) to a ladder/rope and you grab it automatically (hold the stick DOWN to fall past instead)
    LADDER_JUMP_VX: 260, // px/s sideways launch when you press JUMP on a ladder (stick direction, or toward the middle of the ship)
    LADDER_JUMP_VY: 600, // px/s upward kick of that jump (about 95 px of rise: enough to get onto the deck above if you leave near the top)
    REGRAB_CD: 0.5, // seconds after jumping off a ladder before you can grab that same ladder again
    CHUTE_DELAY: 0.5, // seconds of free fall after jumping from the bomb bay before the parachute opens
    CHUTE_GRAVITY: 700, // px/s² under the open parachute (the fall is cushioned)
    CHUTE_FALL: 150, // terminal falling speed under the parachute (px/s)
    CHUTE_STEER: 1100, // px/s² of sideways push from the stick under the parachute
    CHUTE_DRAG: 1.6, // sideways drag under the parachute (steer speed tops out near CHUTE_STEER / CHUTE_DRAG, about 690 px/s)
    CHUTE_OVERBOARD_Y: 1900, // under a parachute you are only overboard below this (ship coordinates), so there is time to drift onto a gunship
    CLIMB_FAST: 1.35, // climbing speed multiplier with the stick pushed fully up/down (humans only)
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
  // The helm sits on an exposed mount on the top deck: enemy hits close to the helmsman knock them out.
  HELM_EXPOSED: {
    HIT_RADIUS: 40, // px: a hit this close (grows a little with hit power) to the helmsman can KO them
    KO_CHANCE: 0.6, // chance that such a hit knocks them out
    KO_TIME: 5, // seconds out cold (a crewmate can revive them sooner); they let go of the wheel
    WARN_TIME: 1.6, // seconds the red flash and HELMSMAN HIT! stay on screen
    HIT_CY: 55, // px above the helm floor where the helmsman is hit (body height)
  },
  // Test bot behaviour (times in seconds).
  BOTS: {
    THINK_EVERY: 0.3, // how often a bot rethinks what to do
    WHACK_EVERY: 0.35, // time between swings at a raider
    ICE_AT: 0.5, // frost: bots chip an ice crust once it is this thick (0-1)
    ENGINEER_PRESS: 35, // steam this low: bots shut the valve of a leaking module (reopened after repair)
    OVERDRIVE_PUSH_EVERY: 45, // every third spell of this many seconds the bots stoke extra coal to reach overdrive
    BOILER_LOW: 55, // start stoking below this pressure
    BOILER_HIGH: 85, // stop stoking above this pressure
    HELM_SPEED: 0.55, // cruising speed the bot helmsman holds (0-1)
    AMMO_LOW: 10, // fetch ammo when a gun has this many shells or fewer
    AIM_TOLERANCE: 0.12, // fire when aim is within this many radians
    STATION_MIN: 20, // stay at a station at least this long...
    STATION_MAX: 40, // ...and at most this long, then rotate
    STATION_TIER_PX: 1800, // a station that is one 'usefulness point' better is worth walking this many extra px for
    LEAVE_FOR_EMERGENCY: 0.2, // chance per think to leave a station when help is short
  },
  // Job arrows on idle phones (the job finder, modules/host/jobs.js).
  JOBS: {
    EVERY: 0.3, // seconds between looks at the ship's job list
    HOLD: 3, // a suggestion stays at least this long unless the job is gone or done
    SWITCH_GAIN: 0.6, // ...and is only swapped for a new job that scores this fraction of the old one or better (lower = calmer)
    ARRIVE: 70, // px: standing this close (same deck) means you have arrived - the arrow goes away
    IDLE_AFTER: 0.8, // seconds free (no station, not working) before the first arrow shows
    AMMO_LOW: 8, // a gun with this many shells or fewer is worth an ammo run
    COAL_LOW: 30, // boiler fuel below this percent is worth a coal run
    CLAIM_PENALTY: 1.2, // each other crewmate already going to the same job adds this to its (distance-weighted) score
    // How much each kind of job matters (bigger = pulls harder; score = seconds of walking / this).
    URGENCY: { fight: 3, fire: 2.6, revive: 2.2, hole: 1.8, gas: 1.6, swat: 1.5, leak: 1.4, ice: 1.2, repair: 1.1, ammo: 1, coal: 1 },
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
  CREW_SPRITES: false, // true = use crew sprite art from art/sprites/crew (only the bulldog has any); false = the drawn style for everyone
  CREW_SPECIES: ['bulldog', 'wolf', 'tiger', 'shiba', 'fox', 'bear', 'cat', 'rabbit'],
};

// The ship layout (floors, ladders, stations, rooms) lives in shipLayout.js.
