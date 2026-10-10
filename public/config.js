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
    CREATURE: { MAX_ZOOM_OUT: 2.4, MARGIN: 200 }, // while a giant creature is alive the cap is this (BOSSES.md 3.2), and its living parts are kept in view with this much margin (world pixels)
    SMOOTHING: 1.6, // how quickly the camera pans to catch up (higher = snappier)
    ZOOM_SMOOTHING: 0.6, // how quickly it zooms (low = calm, no pumping)
    PULL_SMOOTHING: 0.22, // ...and this slowly in the pull-back after a part was built at the sky-dock (YARD.PULL_TIME): the "she grew!" moment
    LEAD_TIME: 0.6, // look this many seconds ahead of where she's heading
    LEAD_SMOOTHING: 1.2,
    SHAKE_SCALE: 14, // screen shake per unit of 'shake'...
    SHAKE_MAX: 9, // ...but never more than this many pixels
    SHIP_KEEP_IN: 0.5, // the ship's middle stays within this share of the screen from the centre
    FRAME_RANGE: 1900, // threats closer than this are kept in view (farther ones get edge arrows)
    // VERSUS (camera.js): the arena is big, so the camera may pull much further out (the ships shrink to silhouettes with a pennant and a name over them: pvpArt.js). When even that cannot
    // fit both ships the view SPLITS: the main view follows the ship nearer the middle of the sky (zoomed to FAR_ZOOM x the normal view) and a framed "spyglass" porthole shows the other, with the
    // distance (render.js drawInset). The split starts when the ships fit at less than ENTER x the widest zoom and ends when they fit again at more than EXIT x (so it does not flicker).
    VERSUS: {
      MAX_ZOOM_OUT: 2.9, // the widest view: this many times out from the normal one (the ship bake's floor is about zoom 0.16, so keep zoom >= 0.16 on a 1920 px screen)
      ENTER: 0.97, EXIT: 1.12, FAR_ZOOM: 0.5, // see above; FAR_ZOOM = the main view's zoom in the split, as a share of the normal view's
      INSET: { W: 0.34, H: 0.38, X: 0.012, Y: 0.5, LEFT: true, ZOOM: 1, MAX_RATIO: 1.2, SMOOTHING: 3 }, // the porthole: size and place as shares of the screen (X from the left edge - or the right with LEFT false - and Y from the top; it sits over the bottom left, clear of the panels, the banner and the join-code card), its zoom as a share of the main view's (never smaller than main / MAX_RATIO: the ship pictures are baked for one zoom and a very different one would re-bake them every frame), how quickly it follows the far ship
      NAME_ZOOM: 0.34, // below this zoom the pennants and the ships' names are drawn bigger, so they read from the sofa (pvpArt.js)
    },
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
    PITCH_PER_ACCEL: 0.03, // nose lift when speeding up / dip when braking
    TOP_SPEED: 560, // forward speed at full throttle (reverse is up to 40% of this)
    REVERSE: 0.4, // how much of the throttle is reverse
    HULL_DAMAGE: 1, // multiplier on hull damage taken (armour upgrades lower it)
    HIT_DAMAGE: 3, // hull lost per enemy bullet hit (bigger blasts scale this up)
    HOLE_CHANCE: 0.6, // chance an enemy bullet hit punches a hole in the deck
    TILT_MAX: 0.06, // most the nose tips up/down while climbing or diving (radians, about 3.5 degrees)
    TILT_PER_SPEED: 0.0004, // tilt per pixel/second of climb
    TILT_SMOOTH: 3, // how quickly the tilt follows (higher = snappier)
    TILT_PIVOT: null, // the point the ship tips around: null = the ship's own (the layout's tiltPivot: [800, 520] on the classic ship), or [x, y] to force one
    // MOTION (flight.js, M.4): FORCES drive every ship's pose. Her engines push, her sails push, the air drags (partly linear, partly quadratic in the speed relative to the air, which the
    // wind carries), and a = force / weight. Accelerations below are quoted in px/s^2 for a ship that weighs REF_MASS; a heavier ship does everything slower, a lighter one quicker. The helm's
    // lever is a speed ORDER: the engines open until she holds it (feed-forward for the drag + GOVERN x the speed error), within what they can make (THRUST ahead, BRAKE astern).
    MOTION: {
      REF_MASS: 160, // the weight (gas points: the build plus the crew, coal, shells and bombs aboard) the figures below are quoted for; the classic ship with a crew weighs about this
      MASS_SCALE_MIN: 0.4, // how much slower the heaviest ship responds (REF_MASS / weight, never below this): a giant build feels heavy...
      MASS_SCALE_MAX: 1.25, // ...and how much quicker the lightest does (never above this): a tiny ship feels nimble
      DRAG: 300, // the drag on her at TOP_SPEED in still air (px/s^2); it falls away with the speed: mostly linearly, partly with its square
      DRAG_LIN: 0.9, // the linear share of that drag (the rest is quadratic): it brings a ship nobody drives back to the speed of the wind
      THRUST: 400, // what her working engines can push with at full steam (px/s^2): top speed is set by the helm's order, this sets how fast she gets there (a rudders upgrade raises it)
      BRAKE: 350, // the most her engines can slow her (astern, px/s^2)
      REF_ENGINES: 2, // the number of engines THRUST is quoted for (the classic ship has two): a ship built with more has that many times the push (top speed is still set by the helm's order: more engines add acceleration and safety)
      GOVERN: 2.5, // how hard the engines chase the ordered speed (1/s): the gap between the speed ordered and the speed she has, times this, is the push asked on top of the drag
      SAIL_PUSH: 275, // a raised sail's push, as an acceleration (px/s^2) per share of top speed its pull gives (SAIL.BONUS): alone in a calm sky a sail speeds her by about its pull
      TURN_MASS: 0.5, // COME ABOUT takes TURN.TIME x (weight / REF_MASS) to this power: a heavy ship comes round slower
      TURN_MIN: 0.7, TURN_MAX: 1.8, // ...never faster or slower than these multiples of TURN.TIME
      PITCH_RESPONSE: 0.5, // how much the weight slows the nose's tilt (the tilt follows at TILT_SMOOTH x (REF_MASS / weight) to this power)
    },
    // COME ABOUT (shipSim.js comeAbout, M.3): turning the ship round, on the helmsman's command only. The picture squashes through zero and comes out mirrored; at the middle
    // the ship's facing flips (and her speed along her bow flips with it, so she keeps moving the same way over the ground).
    TURN: {
      HOLD: 1.0, // seconds the helm holds COME ABOUT (the phone's button) or the stick hard astern before she starts to turn
      TIME: 2.6, // seconds the manoeuvre takes
      MAX_SPEED: 0.4, // the fastest she may be going (share of full throttle, either way) to begin, and the most she is allowed while she turns
      COOLDOWN: 4, // seconds after a turn before the next one may begin
      STICK: 0.9, // how far astern (0..1) the helm's stick must be held to count as the command
      REFUSE_COOLDOWN: 2, // seconds before a refused command can be tried again (so the phone is not buzzed every frame)
      BOT_TURNS: false, // true = a bot at the helm turns her round when the way to the goal has been behind her for BOT_BEHIND seconds (tools/buildsim.mjs --check-turn); off in co-op until it is rebaselined
      BOT_FAR: 600, // pixels the goal must be behind her bow for a bot helm to count it as behind
      BOT_BEHIND: 4, // seconds the goal must stay behind her before a bot helm commands a turn
      MARGIN: 20, // pixels of clear air the mirrored hull needs round each outline point to be allowed to turn
    },
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
  // Searchlights (searchlight.js, searchlightArt.js): two crewed lamps, one on the crow's nest and one under the belly.
  // The stick sweeps the beam; HOLD Action focuses it (narrower, longer, brighter). Anything in a manned beam is LIT:
  // it takes bonus damage from the guns, the guns snap onto it more easily and it gets a bracket outline.
  // In dark places (DARK below + each environment's DARK) the world is dim and the beams cut light out of it.
  SEARCHLIGHT: {
    TURN: 2.2, // how fast the beam swings (radians per second)
    RANGE: 1900, // how far the beam reaches (px); a cave wall stops it
    FOCUS_RANGE: 2700, // ...when focused
    HALF_ANGLE: 0.24, // half-width of the beam cone (radians)
    FOCUS_HALF_ANGLE: 0.11,
    UNMANNED: 0.28, // power of a lamp nobody is working (0 = off): a faint short cone, no lit-target bonus
    POWER_RISE: 4, // how fast the lamp comes up to power / fades (per second)
    ASSIST_ANGLE: 0.22, // the stick snaps the beam onto a target within this angle of where you point (0 = off)
    ASSIST_STRENGTH: 0.6,
    LIT_DAMAGE: 0.5, // extra damage to a lit target (a fraction of each hit's damage, added up over hits)
    LIT_HOLD: 0.3, // seconds something stays lit after the beam leaves it
    LIT_AIM_ANGLE: 1.9, // aim assist reaches this many times further for a lit target...
    LIT_AIM_STRENGTH: 0.95, // ...and snaps harder (normal: AIM_ASSIST)
    DAY_ALPHA: 0.12, // how visible the beam cone is in daylight (0..1)
    DARK_ALPHA: 0.45, // ...in the dark
    DAZZLE_MISS: 0.7, // an enemy caught in a beam is dazzled: this share of its shots go wide
    DARK_ASSIST: 0.85, // in the dark the guns can't see what isn't lit: aim assist on unlit targets drops by darkness x this
    DARK: {
      ENABLED: true,
      MAX: 0.88, // the darkest the overlay ever gets (0..1): the ship and crew stay readable
      CAVE: 0, // darkness inside cave and tunnel maps (network / route)
      DUSK: 0, // extra darkness at the end of a day (course.dusk = 1)
      COLOR: '6,9,22', // the colour of the dark (r,g,b)
      RES: 4, // the dark is drawn at 1/RES of the screen size and scaled up (cheap and soft)
      SMOOTH: 1.6, // how fast the dark fades in and out (per second)
      SHIP_GLOW: 0.8, // how clear the ship's own glow is just outside the hull (0..1; the ship itself is always clear)
      SHIP_GLOW_CX: 800, SHIP_GLOW_CY: 500, // the ship's glow is an ellipse round the whole ship (ship coordinates, px)...
      SHIP_GLOW_RX: 1050, SHIP_GLOW_RY: 600, // ...this wide and tall (it fades out over the outer third)
      LAMP: 150, // glow radius of a flash, an explosion or a muzzle (px)
      EYES: true, // unlit enemies in the dark show glowing eyes / lamps
      EYE_ALPHA: 0.9,
    },
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
  // Personal hookshot (a tool from the rack): ATTACK fires it, it catches the ship, rock, the gunship
  // and big enemies, you swing on the rope, ACTION (hold) reels in, ATTACK/JUMP lets go and you launch.
  HOOKSHOT: {
    RANGE: 950, // how far the hook flies (px) before it falls short and reels back
    SPEED: 2600, // hook flight speed (px/s)
    BACK_SPEED: 3600, // reel-back speed after a miss (px/s)
    MISS_COOLDOWN: 0.45, // seconds before you can fire again after a miss or a release
    SKIP: 60, // the first px in front of you never catch (so you do not hook the floor under your own feet)
    THICK: 16, // how thick a deck edge is for the hook to catch on (px)
    GUNSHIP_DEPTH: 90, // the gunship's hull below her deck also catches (px)
    BOMBER_HW: 130, BOMBER_HH: 50, // bomber body half size (px)
    BOSS_HW: 300, BOSS_HH: 120, // boss body half size (px)
    PLANE_R: 60, // a dogfighter catches the hook inside this radius
    HAND: 55, // px above your feet where the rope is held
    MIN_LEN: 50, // the rope is never shorter than this
    POP: 420, // px/s kick toward the hook when it catches (lifts you off the deck)
    POP_UP: 260, // ...and at least this much upward (px/s)
    AUTO_REEL: 150, // px/s the rope winds in by itself (so you never hang forever); hold ACTION for REEL_SPEED
    REEL_SPEED: 520, // px/s the rope shortens while ACTION is held
    PUMP: 700, // px/s² extra swing push from the stick (on top of normal air steering)
    RELEASE_LOCK: 0.35, // seconds after a catch before ATTACK/JUMP can let go (so a held button does not drop you)
    BOOST: 1.12, // launch speed multiplier when you let go
    MAX_SPEED: 1500, // speed cap while swinging / launching (px/s)
    LEDGE_POP: 300, // reeling right up to a deck edge: upward kick so you land on top (px/s)
    LEDGE_AT: 70, // reel in to this close to a deck anchor and you climb onto it (px)
    BOARD_AT: 75, // reel in to this close to a dogfighter and you climb aboard (px)
  },
  // Hijack a small plane: touch a dogfighter in the air (or hook it and reel in), kick the pilot out, fly it.
  HIJACK: {
    RADIUS: 75, // how close an airborne player must get to a dogfighter to climb aboard (px)
    KICKS: 3, // action taps to kick the pilot out (a short hold of KICK_HOLD seconds works too)
    KICK_HOLD: 0.9, // seconds of holding ACTION that kick the pilot out
    KICK_DECAY: 0.25, // kick progress lost per second when you stop (0..1 scale)
    BOARD_SPEED: 300, // the plane slows to this while a stranger is on the wing (cruise)
    BOARD_WOBBLE: 0.9, // radians/s of wobble while boarded
    HP: 5, // enemy bullets the stolen plane can take
    FUEL_TIME: 80, // seconds she flies before running dry (you bail out)
    LEASH: 3400, // beyond this far from the ship she turns for home on her own
    GREEN: '#8fb37a', CREAM: '#e8d8a8', // her new colours
    // The big enemy fighter (the one that makes strafing runs) can be stolen too. It flies on its own ENEMY stats.
    FIGHTER: {
      HP: 10, // enemy bullets she can take once she is ours
      FUEL_TIME: 60, // seconds she flies before running dry
      SPEED: 0.85, // share of the enemy fighter's cruise speed
      TURN: 0.9, // share of its turn rate
      THRUST: 520, // her engines when she is ours (the enemy's own THRUST is tuned for boom-and-zoom runs; a stolen plane has to hold height circling the ship)
      GRAVITY: 300, // pull along her flight path (lower = climbs cost less speed)
      STALL_SPEED: 220, // she stalls below this airspeed
      ORBIT: 1.0, // her circle round the ship, as a share of a small plane's (any wider and a rider who bails out lands past the ship's end and goes overboard)
      SHOT_EVERY: 0.2, // two guns, one burst this often
      SCALE: 1.7, // drawn this much bigger than a dogfighter
      BOARD_SPEED: 0.55, // share of cruise speed while a stranger is on the wing
      RADIUS: 95, // how close an airborne player must get to climb aboard (px)
    },
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
    SHIP_RECT: null, // our ship's box { x0, x1, y0, y1 }: she is nudged away if she overlaps it. null = the ship's own (the layout's hullRect)
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
    AS_SHIP: true, // true = the gunship is a real Ship in the sky (gunshipShip.js, MOVEMENT.md B.5): her own flight, collisions, fires, holes, steam and a bot crew; false = the old offset-from-our-ship gunship (gunship.js)
  },
  // The enemy gunship as a SHIP (gunshipShip.js; only when GUNSHIP.AS_SHIP is on). The old GUNSHIP numbers above still say how she hunts, fires, latches and boards; these say how the ship rules treat her.
  GUNSHIP_SHIP: {
    HIT_POWER: 0.12, // impact power of one crew shell on her hull (1 = one enemy bullet, 3 hull): the size of the blow, and with it how often a hit holes her deck, lights a fire or tears her gasbag (as a rival ship's: PVP.SHELL_POWER)
    SHELL_HULL: 1, // 1 = a shell takes the share of her hull that it took of the old gunship's hit points (shellDmg / her max; the difficulty button and her crew's size do not scale it). Tuned so she takes about as many shells to sink as the old one
    DAMAGE_MUL: 0.35, // what every other blow costs her hull (a rock scrape, a collision with our ship), as a multiple of what it costs ours on Normal: the old gunship lost about 2.4% of her hull a second grinding along rock, a ship loses 3% every 0.45 s
    DRAIN_MUL: 1, // what an open hole or a fire costs her hull every second, as a multiple of what it costs ours on Normal
    FIRE_MUL: 1, // her guns reload this many times slower than the old broadside timers (G.FIRE_EVERY ...), per gun (each manned gun fires on its own timer now)
    SPEED_MUL: 1.35, // her engines' top speed against ours (the old gunship flew at up to G.MAX_SPEED 760 against our 560): body.topMul, course.js scrollSpeed, flight.js
    BULLET_SPEED: 620, // her cannonballs (px/s)
    WEAVE: 0.12, // how much of the PvP captain's weave and dodge (pvp/captainAI.js) her helmsman flies on top of her director's course (0 = none, 1 = as a Versus ship)
    STYLE_MAP: { aggressive: 'brawler', cautious: 'sniper', boarder: 'boarder', coward: 'daredevil' }, // her blueprint's personality -> the PvP captain style (config.PVP.BOT.STYLES) that sets her weave and dodge
  },
  // Enemy gunship GENERATOR (see gunshipBlueprint.js): every gunship is built from these parts at spawn,
  // so no two are alike. Strength grows with the mission number (shifted -1 on Easy, +1 on Hard).
  GUNSHIP_PARTS: {
    HULLS: {
      // len = deck length (px); hp = hull hit points multiplier; crew = base crew; ports = cannon ports [min, max];
      // engines = [min, max]; layouts = the deck arrangements this hull can have; ry = gasbag height
      cutter: { len: 800, hp: 0.8, crew: 3, ports: [2, 2], engines: [1, 2], layouts: ['flush', 'quarter', 'sunkenstern', 'foredeck'], ry: 118 },
      frigate: { len: 1100, hp: 1.0, crew: 4, ports: [2, 3], engines: [2, 2], layouts: ['flush', 'quarter', 'sunkenstern', 'foredeck', 'well'], ry: 160 },
      dreadnought: { len: 1400, hp: 1.3, crew: 5, ports: [3, 4], engines: [2, 3], layouts: ['quarter', 'sunkenstern', 'well', 'tiered'], ry: 195 },
    },
    // chance weights [cutter, frigate, dreadnought] by mission number (the last row repeats)
    HULL_WEIGHTS: [[1, 1, 0], [1, 1, 0], [2, 3, 1], [1, 3, 2], [1, 2, 3]],
    DIFF_SHIFT: { easy: -1, normal: 0, veteran: 0, hard: 1 }, // added to the mission number for strength
    TWIN_BAG: 0.4, // chance of twin gasbags (cutters: half this)
    TURRET: [0.15, 0.12, 0.6], // top turret: [chance at mission 1, extra per mission, cap]
    MORTAR: [0.0, 0.12, 0.5], // mortar: starts at 0 on mission 1
    FLAK: [0.0, 0.1, 0.4],
    SPECIAL_CHANCE: 0.7, // chance of one special part
    SPECIALS: ['hangar', 'ramp', 'harpoon', 'armoured', 'paras'],
    SPECIAL_MIN_MISSION: { hangar: 2, harpoon: 2 },
    CREW_MAX: 8,
    ENGINE_POWER: [0, 0.82, 1, 1.12], // engine power share by pod count (index = number of pods)
    // Extra weapons. EVERY = seconds between shots (while a gunner is aboard), RANGE = reach, HP = hits to wreck.
    TURRET_GUN: { EVERY: 4.2, RANGE: 2100, SPEED: 560, MISS: 0.3, HP: 7 },
    MORTAR_GUN: { EVERY: 8.5, RANGE: 2400, GRAVITY: 520, TIME: [1.4, 2.6], DAMAGE: 1.5, MISS: 0.25, HP: 8 },
    FLAK_GUN: { EVERY: 6, RANGE: 2200, SPEED: 650, SPREAD: 0.13, MISS: 0.4, HP: 7 },
    // Specials
    HANGAR: { FIRST: 16, EVERY: 30, BATS: 2, MAX_BATS: 6 }, // a bat hangar launches small swarms
    RAMP: { LATCH_RANGE: 1.3, LATCH_CD: 0.2, SEND_MUL: 0.7 }, // boarding ramp: latches faster and sends raiders sooner
    HARPOON: { FIRST: 18, EVERY: 12, RANGE: 1100, LATCH_RANGE: 1.45 }, // fires her grapple from range
    ARMOURED: { PLANT_MUL: 2.2 }, // armoured boiler: planting the charge takes this much longer
    PARAS: { EXTRA: 1, EVERY_MUL: 0.7 }, // extra paratroopers, dropped more often
    // Captain personalities: settings fed into her captain's choices (nodeW multiplies how often a ring spot is picked).
    PERSONALITY: {
      aggressive: { strafeChance: 0.85, strafeCd: 0.6, retreatAt: 0.3, retreats: 1, fleeAt: 0.1, latchAfter: 0, nodeW: { bow: 2.4, high: 1.3, A: 0.6 }, fireMul: 0.85 },
      cautious: { strafeChance: 0.25, strafeCd: 1.4, retreatAt: 0.6, retreats: 2, fleeAt: 0.2, latchAfter: 0, nodeW: { bow: 0.4, high: 0.8, A: 3 }, fireMul: 1 },
      boarder: { strafeChance: 0.3, strafeCd: 1.2, retreatAt: 0.35, retreats: 1, fleeAt: 0.12, latchAfter: 38, nodeW: { bow: 2.2 }, fireMul: 1 },
      coward: { strafeChance: 0.2, strafeCd: 1.5, retreatAt: 0.0, retreats: 0, fleeAt: 0.55, latchAfter: 0, nodeW: { bow: 0.5, A: 2 }, fireMul: 1.1 },
    },
    NAME_ADJ: ['Iron', 'Crimson', 'Black', 'Rusty', 'Grim', 'Pale', 'Hollow', 'Scarlet', 'Ashen', 'Gilded', 'Wicked', 'Sullen', 'Brass', 'Cinder', 'Bitter', 'Thunder', 'Sour', 'Silent', 'Hungry', 'Lonely'],
    NAME_NOUN: ['Widow', 'Gull', 'Kettle', 'Hornet', 'Magpie', 'Anvil', 'Lantern', 'Vulture', 'Thistle', 'Cormorant', 'Gallows', 'Maiden', 'Baron', 'Wasp', 'Bellows', 'Mule', 'Cleaver', 'Badger', 'Pelican', 'Tinker'],
    // Flag colours (enemy palette). Cloth must be dark enough for a cream badge to read on it.
    CLOTH: ['#a8443f', '#8c2f2f', '#5c1e1e', '#4a4346', '#8a6444', '#6b3a50', '#7a3a2a', '#59463a'],
    TRIM: ['#f2d36b', '#e8884a', '#c9706a', '#ebdfc0', '#c9a24a', '#9a9a9a'],
    HULL_COLORS: ['#4a2626', '#3a2a30', '#4a3a2a', '#3f2f3a', '#52302a', '#35303a'],
    BAG_COLORS: ['#5a3a40', '#4a4346', '#6b3a34', '#3f3a48', '#5c2a2a', '#59463a'],
    PATTERNS: ['band', 'diagonal', 'chevron', 'split', 'checks'],
    EMBLEMS: ['horns', 'eye', 'band', 'chevrons', 'fangs'],
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
  // GUN TYPES (weapons.js; PVP.md "Space and range"): a gun part may be one of these instead of the plain broadside gun above (the gun part's `gtype`, the layout's gunMounts[n].type). They are the
  // weapons of the range bands: LONG (the long gun: slow, accurate, far; the mortar: a high arc that drops onto the deck and the gasbag, better with a spotter), MID (the broadside above; flak),
  // SHORT (grapeshot; the harpoon, which latches and reels the ships together). Each is a normal station: a person (or a bot) mans it, the stick aims, FIRE fires, the ammo hold feeds it.
  // SPEED / LIFE = the shell's speed (px/s, relative to the ship) and how long it flies (s): speed x life x the nest bonus = range; COOLDOWN = seconds between shots; MUL = the blow of a shell (x PVP.SHELL_POWER
  // on a rival ship; x the plain shell's damage on a plane); MAX_AMMO / START_AMMO / LOAD = shells a gun holds, starts with and gets from one ammo crate; ARC = the share of the usual firing arc (a long barrel
  // swings less); TOL = how true (radians) a bot's aim must be to fire; MASS is in BALANCE.MASS.kind (gun_long ...). SHOP: the sky-dock's part cards may offer them. POWER = the points this gun adds to the
  // ship's power over a plain gun's YARD.POWER.GUN (shipPower.js: the danger of a voyage follows the power).
  GUN_TYPES: {
    SHOP: true,
    long: { LABEL: 'Long gun', POWER: 1.2, SPEED: 2700, LIFE: 2.55, COOLDOWN: 2.1, MUL: 2.4, MAX_AMMO: 12, START_AMMO: 10, LOAD: 6, ARC: 0.7, TOL: 0.025, SPREAD: 0.004, AUTOLOAD: 7 }, // rifled: range about 6900 px, a tight spread, a heavy blow; a shell takes 2 s to cross 5000 px, so a target that holds still is a target that dies
    mortar: { LABEL: 'Mortar', POWER: 1, SPEED: 2000, GRAVITY: 900, LIFE: 7, COOLDOWN: 3.2, MUL: 2.6, MAX_AMMO: 10, START_AMMO: 8, LOAD: 5, ARC: 1, TOL: 0.05, SPREAD: 0.075, SPREAD_SPOTTED: 0.02, SPLASH: 150, SPLASH_MUL: 0.6, SPLASH_DY: 330, AUTOLOAD: 6, ASSIST: 3 }, // a high arc (range 1000-4400 px by the barrel's angle); it falls onto a deck and a gasbag, and a SPLASH of SPLASH_MUL x the blow goes on SPLASH_DY px down through the hull; SPREAD (radians) shrinks to SPREAD_SPOTTED when a lookout is manned or the rival is spotted
    scatter: { LABEL: 'Grapeshot gun', POWER: 0.4, SPEED: 1250, LIFE: 0.62, COOLDOWN: 1.0, MUL: 0.55, PELLETS: 8, CONE: 0.3, MAX_AMMO: 14, START_AMMO: 12, LOAD: 7, ARC: 1.25, TOL: 0.2, AUTOLOAD: 3.5 }, // a fan of PELLETS across CONE radians, about 800 px: hulls alongside, boarders on the way
    flak: { LABEL: 'Flak gun', POWER: 0.2, SPEED: 1500, LIFE: 1.5, COOLDOWN: 0.75, MUL: 0.5, FUSE: 150, BURST: 230, MAX_AMMO: 24, START_AMMO: 20, LOAD: 12, ARC: 1, TOL: 0.1, PLANE_MUL: 3, AUTOLOAD: 3 }, // the shell bursts when it is FUSE px from a plane, a bat or an enemy crewman in the air; the burst (BURST px) knocks every enemy flier in it out of the sky (he falls to his own medical bay) and hurts a plane PLANE_MUL x a shell
    mines: { LABEL: 'Mine layer', POWER: 0.6, COOLDOWN: 1.3, MAX_AMMO: 6, START_AMMO: 6, LOAD: 3, ARC: 0, TOL: 3, AUTOLOAD: 14 }, // a chute in the belly: FIRE drops a mine (config.MINEFIELD); the ammo is the mines it holds, an ammo crate adds LOAD
    harpoon: { LABEL: 'Harpoon gun', POWER: 0.8, SPEED: 2600, RANGE: 2600, COOLDOWN: 9, MAX_AMMO: 4, START_AMMO: 3, LOAD: 2, ARC: 1, TOL: 0.09, LEN: 760, REEL: 300, SNAP: 4300, MAX_ACC: 520, K: 3.2, HP: 3, AUTOLOAD: 12 }, // fires a line at the nearest enemy deck in the way it points; it latches, then REEL px/s shortens the line to LEN px (a spring between the two poses: towing.js); the line snaps past SNAP px, a sword cuts it (HP blows)
    flame: { LABEL: 'Flamethrower', POWER: 0.9, RANGE: 560, COOLDOWN: 0, MAX_AMMO: 12, START_AMMO: 12, LOAD: 6, ARC: 1, TOL: 0.2, AUTOLOAD: 5, MASS: 5, PRICE: 130, STEAM_USE: 1 }, // the short-range burner (flame.js, the FLAME block below): no shell, a cone of fire RANGE px long while FIRE is held; ammo is its FUEL TANK (MAX_AMMO units, a coal sack from the bunker adds LOAD, a trickle of one per AUTOLOAD s refills it); MASS = its weight, PRICE = the sky-dock's base price, STEAM_USE = steam points in the build budget
  },
  // THE FLAMETHROWER (flame.js; GUN_TYPES.flame above). Hold FIRE and a cone of fire leaves the nozzle: it eats steam from the boiler and fuel from its tank, and heats up (let go to cool; at full heat it cuts out
  // until it has cooled to RESUME_AT). The cone burns what it touches: the decks of a hostile ship by their flammability (wood catches, armour plate does not, the coal blazes: fire.js), the crew standing in
  // it (hearts: health.js, cause 'fire'), her gasbag (holes), bats and imps, boarders on your own deck, planes (as small shells), and the ice crusts on your own ship. Firing with a hostile hull right at
  // the nozzle can set YOUR OWN deck alight (BACKDRAFT). Everything is per second unless it says otherwise.
  FLAME: {
    HALF: 0.26, // half the angle of the cone (radians)
    NOZZLE: 66, // px from the pivot to the nozzle, along the barrel (where the cone starts)
    RAMP: 0.22, // seconds for the flame to reach its full length once FIRE is held (and to die away when let go: FADE)
    FADE: 0.18,
    TAP: 0.35, // seconds of flame a single tap of the button gives (a held button just keeps it going)
    MIN_PRESS: 28, // boiler pressure needed to fire at all ("NO STEAM!")
    STEAM_RATE: 4.5, // boiler pressure the flame eats (percentage points a second)
    FUEL_RATE: 1.5, // fuel units a second (a full tank of 12 is 8 s of fire)
    HEAT_RATE: 0.16, // heat gained a second while burning (full at 1: about 6 s)
    COOL_RATE: 0.24, // heat lost a second while not burning
    RESUME_AT: 0.35, // an overheated burner fires again once it has cooled to this
    TICK: 0.1, // seconds between the cone's effects (the numbers below are per second and are scaled by this)
    // what it does to a hostile ship
    IGNITE_RATE: 2.2, // chance a second that a deck spot in the cone catches, times the spot's flammability (a plain deck 1, coal 4.5, armour plate 0: ignite chance, fire.js)
    HULL_RATE: 0.5, // hull points a second a hull in the cone loses (less on armour plate: ARMOUR.POWER_MUL)
    HOLE_RATE: 0.5, // chance a second that a gasbag in the cone gets a hole (a hydrogen bag in the cone is also scorched: GASES.HYDROGEN.FLAME_RATE)
    CREW_HEARTS: 1, CREW_EVERY: 0.8, // a foe standing in the cone loses CREW_HEARTS hearts every CREW_EVERY seconds
    CREW_REACH: 34, // px around a crewman that counts as in the cone
    PENETRATE: 240, // the cone stops at the first hull it meets, but goes on this far through a port into the room behind
    // what it does to the sky and your own deck
    BAT_DPS: 4, IMP_DPS: 4, // hit points a second a bat / an imp loses in the cone (a bat has 1)
    RAIDER_DPS: 1.6, // ...a boarder on your own ship (a grunt has 3 hit points; a sword blow is 1)
    RAIDER_IGNITE: 0.3, // chance a second that a burning boarder sets the deck under him alight (flammability decides: coal under him is a blaze)
    PLANE_EVERY: 0.3, PLANE_MUL: 1.3, // a plane in the cone takes a small shell (x PLANE_MUL of the plain shell's blow) this often
    MELT_RATE: 1.4, // ice-crust level (0-1) melted a second on your own ship
    // the risk
    BACKDRAFT_RANGE: 230, // a hostile hull this close to the nozzle (inside the cone)...
    BACKDRAFT_RATE: 0.07, // ...lights a fire on the deck at your gun with this chance a second
    // the look (flameArt.js)
    GLOW: 2.2, // size of the glow a flame lights in the dark (x the muzzle flash's)
    BOT: { BAND: 2.4, BURN_RATE: 0.12, BURN_TIME: [10, 18], BURN_CD: 14, BURN_CLOSE: 900, SELF_RISK: 1.7, FUEL_LOW: 6, PRESS: 160, WISH_WAIT: 7 }, // bots (captainAI.js / bots.js): a gunner fetches coal when a tank holds FUEL_LOW units or fewer; points for the SHORT band per flamethrower; the captain's BURN play (chance a second, how long, the pause after, how much closer than the standoff she presses, PRESS: how much nearer than the noses touching she may press - the hulls bump and lean on each other - and WISH_WAIT: she first wishes it, the crew man the burners, and she goes in once one is manned or after this many seconds); a gunner will not burn a boarder who stands on ground at least SELF_RISK flammable (ammo 1.8, powder 3, coal 4.5: a plain deck is 1)
  },
  // Primed shells (prime.js): hold PRIME on a gun to charge the loaded shell for a harder hit. Never required.
  PRIME: {
    TIME: 2.4, // seconds of holding PRIME to fully charge a shell
    DECAY: 0.5, // charge lost per second when you let go early (a fully primed shell keeps until fired)
    DAMAGE_MUL: 2, // a primed shell hits this many times harder than a normal one
    FRAGS: 5, // little splinters thrown out where a primed shell bursts (they hurt other nearby targets too)
    FRAG_SPEED: 650, // px/s of those splinters
    FRAG_LIFE: 0.13, // seconds they fly (speed x life = about 85 px blast radius)
    BLAST_SIZE: 150, // size of the burst ring on the TV
  },
  // Linked stations (links.js, prime.js): two crew at once are worth more than two crew apart. Always a bonus; a lone crew member still plays.
  LINKS: {
    ENABLED: true, // false = no links at all (tools/botsim.mjs uses NO_LINKS=1 to compare)
    // GUN + LOADER: a second crew member standing at a manned gun holds Action to prime its shell for the gunner.
    SOLO_MUL: 1.6, // a gunner priming alone takes this many times PRIME.TIME (with a loader beside the gun they prime at the normal rate)
    LOADER_TIME: 1.2, // seconds for a loader holding Action to fully prime a shell (stacks with the gunner priming too)
    LOADER_HOLD: 0.15, // seconds the link stays lit after the loader's last frame of work
    // HELM + LOOKOUT: someone in the crow's nest (Lookout or Nest Searchlight) makes the helm answer faster.
    HELM_MAN: 0.15, // extra helm response (engine speed changes, trim engine, gasbag valve) while the nest is manned
    HELM_SPOT: 0.25, // ...and this much while the nest has spotted something lately (radar tap or a lit enemy)
    SPOT_RECENT: 8, // seconds a spot / lit enemy counts as "lately"
    GUST_WARN: 3, // seconds ahead of a storm gust that the TV shows warning arrows (only while the nest is manned)
    // BOILER SURGE: hold Action at the boiler (steam high enough) to push extra steam into one consumer. Pressure climbs: overdo it and she blows.
    SURGE: {
      MIN_PRESS: 60, // pressure needed before the boiler hand can surge
      RAMP: 0.5, // seconds to reach full surge while held
      FALL: 1.2, // seconds to fade after letting go
      PRESS_RATE: 6, // pressure added per second at full surge (70 -> 100 in about 5 s; 100 blows the boiler)
      ENGINE: 0.35, // extra ship speed at full surge (stacks with overdrive)
      COIL: 1, // extra Lightning Coil charge speed at full surge (1 = double)
    },
  },
  // Radar on idle phones (spotter.js): a map of everything out there, tap a ping to SPOT it for the whole crew.
  RADAR: {
    RANGE: 4500, // px from the ship to the edge of the phone radar (farther things are pinned to the rim)
    HZ: 4.5, // radar updates sent per second to each phone showing it
    IDLE_AFTER: 1.2, // seconds with nothing to do before a walking player's radar appears
    GUN_IDLE_AFTER: 1, // seconds with nothing in reach before a gunner's radar appears
    GUN_BUSY_AFTER: 0.8, // seconds with a target in reach before it goes away again
    MAX_ITEMS: 30, // most pings sent (the nearest ones win)
  },
  // Spotting (tap a radar ping): a marker on the TV, extra damage, and aim assist that prefers it.
  SPOT: {
    TIME: 10, // seconds a target stays spotted
    BONUS: 0.25, // spotted targets take this much extra damage from shells (0.25 = +25%)
    ASSIST_ANGLE: 2.2, // aim assist reaches this many times farther for a spotted target
    ASSIST_PULL: 0.45, // a spotted target counts as this much closer to your aim (lower = more preferred)
    COOLDOWN: 0.4, // seconds between one player's taps
    MAX_PER_PLAYER: 2, // most targets one player can have spotted at once (a new spot drops their oldest)
  },
  // HELP! button on every phone (spotter.js): call-out on the TV, and the nearest idle crew are sent over.
  HELP: {
    COOLDOWN: 8, // seconds before the same player can call again
    SHOW: 5, // seconds the HELP! call-out shows over the caller
    RESPONDERS: 2, // how many idle crew are sent
    IDLE_FOR: 0.8, // a human must have been free this long to count as idle
    BOT_HOLD: 9, // seconds a bot keeps helping near the caller
    NEAR: 420, // px: bots help with jobs this close to the caller
    ARRIVE: 90, // px: a human this close (same deck) has arrived, and goes back to the normal job arrow
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
    RESCUE: 12, // each survivor winched out of the Sunken Sea
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
    BOT_CAST_CHANCE: 0.12, // bots: chance to cast off on each round
    BOT_REPAIR_HULL: 85, // bots: buy the full hull repair first when the hull is below this
  },
  // The SHIPWRIGHT'S YARD (S.6a, modules/host/partsShop.js): ship PARTS as cards in the sky-dock shop, at most one per dock. A part is a pure build edit (the voyage's parts list,
  // simulation.js run.build), checked by the validator (never a FAIL) and fitted to ship 0 at the dock; its effects are weight, lift, steam and stations in the build, never config.
  PARTS_SHOP: {
    PRICES: { hullBay: 130, keel: 150, gasbag: 160, engine: 120, liftEngine: 170, nest: 140, gun: 100, lamp: 90, bombBay: 150, boiler: 170, coal: 90, ammo: 90, armour: 120, sail: 110, ballast: 90, ladder: 90, pole: 90, lift: 130, crewCannon: 140, gun_long: 160, gun_mortar: 150, gun_scatter: 110, gun_flak: 120, gun_harpoon: 150, mineLayer: 130, ramProw: 130, dropHatch: 100 }, // base salvage price of each part
    REPEAT_PRICE: 0.3, // each part already bought this voyage adds this share of the base price (the price rises with how many you own)
    CREW_SMALL: 3, // a crew of this many players or fewer finds engines, armour and gasbags cheaper...
    SMALL_MUL: 0.85, // ...by this factor
    CREW_BIG: 6, // a crew of this many or more finds station parts (guns, lamps, boilers, bunkers, bomb bay, sails) cheaper...
    BIG_MUL: 0.85, // ...by this factor
    DERELICT_STOPS: [2, 5], // after these stops of a voyage a derelict part is found: the part card is FREE
    BAGS_MAX: 3, // a ship may carry this many gasbags (v1: the editor allows more)
    ENGINES_MAX: 4, // ...this many engine pods (all kinds)
    BOILERS_MAX: 2,
    HULL_BAYS_MAX: 2, // hull bays bought (a longer hull each)
    NEST_MAX: 2, // gun nests on the bag
    GUNS_MAX: 8,
    CARD_CHANCE: 0.55, // chance that a dock offers a part card at all (a derelict stop always does): about 4 parts in a 7-dock voyage
    CANDIDATES: 18, // how many candidate spots of a part are tried by the validator when an offer is made (the best spread are kept)
  },
  // The Yard's votes and screens (S.6b).
  YARD: {
    SLOT_TIME: 10, // seconds to vote on where a bought part goes (A / B / C) when it fits in more than one place
    SLOT_MAX: 3, // at most this many places to choose between
    DEAL: 0.25, // crew deal: a UNANIMOUS vote for the part card takes this share off the price
    DEAL_VOTERS: 2, // ...when at least this many players voted (a lone player does not get it every time)
    BUILT_STAMP: 3.4, // seconds the BUILT stamp shows on the blueprint after a part is placed
    NEW_CALLOUT: 7, // seconds the "NEW: ENGINE POD" call-out hangs over the new part after cast off
    PULL_TIME: 8, // seconds the camera takes its slow pull-back after cast off (the ship grew)
    BOT_PART_CHANCE: 0.55, // bots: chance to vote for the part card when they can afford it...
    BOT_REC_CHANCE: 0.9, // ...and when the card is RECOMMENDED (it fixes the ship's weakest budget, partsShop.js fitOf)
    BOT_SLOT_PICK: 0.8, // bots: chance to vote for the place the validator scores best (else a random place)
    REC: { // what "recommended" reads (partsShop.js needsOf / fitOf)
      MIN: 2.5, // a part card scoring this or more wears the RECOMMENDED tag and wins the bots' vote more often
      GUNS_WANT: 5, // fewer guns than this and a gun part is wanted
      HEAVY_HOVER: 55, // hover gas above this: she is getting heavy, lift parts are wanted (gasbag, lift engine) and heavy ones are not
      STEAM_SHORT: 62, // settled cruise pressure below this: a boiler is wanted
      HANDS_MAX: 2.5, // manned stations per crew member above this: no more stations are wanted
      TILT_DEG: 1, // a trim this far off level: ballast is wanted
      RAID_STOPS: 1, // this many outpost raids still ahead on the route and a bomb bay is wanted (if she has none)
      AETHER_LIFT: 1.5, // extra score for a lift engine when the Aether (the Flagship's sky) is still ahead and she has none
    },
    SHAKEN_HP: 0, // limp home: the newest part's modules start with this share of their health (0 = broken, a hammer mends them)
    SHAKEN_HOLES: 1, // limp home: a newest gasbag starts with this many holes
    // DANGER THAT FOLLOWS THE SHIP (shipPower.js, read by crewscale.js): a voyage's enemies scale with the ship's fighting strength as well as the crew. Her power (guns, bomb bay, coil,
    // escorts, armour, engines ...) is worked out from the build once per build, as a share of the classic ship's; the classic ship is 1.0 = full danger, nothing changes for her.
    POWER_SCALE: 0.2, // how much of the danger a weak ship is spared: 0 = none (every ship meets the classic danger), 1 = danger in proportion to her power (kept low: the Sparrow wins about as often as the classic ship)
    POWER_FLOOR: 0.4, // ...but never less than this share of the full danger (a bare hull still gets shot at)
    POWER: {
      BASE: 3, GUN: 1, BOMB_BAY: 1.5, COIL: 2, ESCORT: 1, DEFLECTOR: 1, ARMOUR: 1.2, ENGINE: 0.6, SPARE_BAG: 1, CANNON: 1, CARGO_RACK: 0.3, TOWLINE: 0.5, HATCH: 0.3, // (B.6: a crew cannon, a sandbag or crate rack, a towline reel) power points: the hull and deck; per gun; the bomb bay; the coil; per escort fighter; the deflector; per 100 px of armour plate; per engine pod; per gasbag beyond the first
      KEYS: { spawn: 1, count: 1, fire: 1, damage: 1, raiders: 1, hp: 1 }, // which crew-scale numbers follow it, and how fully (1 = all of the relief, 0 = none)
    },
  },
  // THE VOYAGE: a branching route of stops across the Broken Skies; one run = one voyage.
  VOYAGE: {
    // Session-length modes (chosen in the lobby / pause menu, remembered on this TV; voyage.js, simulation.js).
    // stopsMin/Max: columns on the map, first (launch) and last (the Flagship) included (per voyage).
    // dangerRamp: how far the skulls climb from the first stop to the last (bigger = danger ramps faster).
    // lengthMul: multiplies every mission map's length (so the flying time). voyages: 2 = two voyages back to back.
    // rival: whether the rival captain's gunship hunts the crew (read by gunship.js once the rival exists).
    // time: the playing time this mode is tuned for, in minutes (shown in the lobby; checked by tools/voyagesim.mjs).
    MODES: {
      quick: { label: 'QUICK VOYAGE', blurb: '4 stops', time: '15-20 min', stopsMin: 4, stopsMax: 4, dangerRamp: 2.4, lengthMul: 0.85, voyages: 1, rival: false },
      voyage: { label: 'VOYAGE', blurb: '6-8 stops', time: '30-35 min', stopsMin: 6, stopsMax: 8, dangerRamp: 1.6, lengthMul: 1, voyages: 1, rival: true },
      campaign: { label: 'EVENING CAMPAIGN', blurb: 'two voyages', time: 'about an hour', stopsMin: 5, stopsMax: 7, dangerRamp: 1.6, lengthMul: 1, voyages: 2, rival: true },
    },
    START_MODE: 'voyage',
    START_BUILD: 'sparrow', // the ship a Voyage / Quick / Campaign starts with in the browser host ('classic' = the old full ship; the pause menu toggles it). Headless tools stay on the classic ship unless they ask (sim.setStartBuild)
    // The harder second voyage of the Evening Campaign, started after the first Flagship falls.
    SECOND: {
      DANGER_BONUS: 1, // every stop (and the Flagship) is this many skulls harder (danger may go above 3)
      LEVEL_BONUS: 2, // missions are numbered this much higher (bigger maps, tougher gunships)
      HARBOUR_REPAIR: 45, // hull repaired free at the harbour between the voyages (the sky-dock shop opens too)
      SALVAGE_BONUS: 30, // free salvage handed over at the harbour
    },
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
      storm: { name: 'Storm Front', icon: '⛈️', color: '#6a6f9a', ready: true },
      sea: { name: 'Sunken Sea', icon: '🌊', color: '#3f8fa6', ready: true },
      fungal: { name: 'Fungal Depths', icon: '🍄', color: '#8a6fb0', ready: true },
      aether: { name: 'The Aether', icon: '🌌', color: '#4b3f7a', ready: true },
    },
    KIND_NAMES: { network: 'Cave run', route: 'Narrow pass', open: 'Outpost raid' },
  },
  // Fires.
  // S.5f: fire cares where things are (modules/host/fireModel.js reads this; fire.js runs it). Every spot of the ship has a flammability: a covered wooden deck is 1 (medium),
  // coal is tinder, iron and armour plate barely burn. A fire spreads along its deck and up / down through ladders and hatches towards the more flammable neighbour; one that
  // reaches the coal flares into a BLAZE. A boiler blowout or overheating lights fires beside the boiler.
  FIRE: {
    SPREAD_EVERY: 7, // seconds before a fire tries to spread (shorter on very flammable ground, longer on damp / open-air ground; the crew-size 'spread' scale applies too)
    CAP_BASE: 8, // most fires burning at once on a ship with CAP_REF_PX of deck (the classic ship): bigger ships hold more, small ones fewer
    CAP_REF_PX: 5180, // total walkable deck width of the classic ship (px)
    CAP_MIN: 3, CAP_MAX: 24, // ...and the cap never goes outside these
    FLAMMABILITY: {
      deck: 1, // a covered wooden deck or room: medium (everything else is measured against it)
      outdoor: 0.85, // an open-air deck: the wind carries flames off a little
      armour: 0, // riveted iron plate does not burn: a fire cannot start or spread onto it
      gasbag: 1.5, // a HYDROGEN bag (config.GASES.HYDROGEN): a fire that reaches it scorches it this much faster (hydrogen.js); helium and hot air do not burn
      // A spot within r px of one of these on the same deck takes its flammability instead of the deck's (the nearest wins). Coal and powder are tinder; iron housings give little to burn.
      kind: { coal: { f: 4.5, r: 130 }, bombBay: { f: 3, r: 150 }, ammo: { f: 1.8, r: 100 }, boiler: { f: 0.35, r: 90 }, engine: { f: 0.35, r: 70 }, gun: { f: 0.6, r: 60 } },
    },
    SPREAD_MIN_MUL: 0.6, SPREAD_MAX_MUL: 2.5, // how much the flammability of the burning spot speeds up (or slows) the spread clock, within these
    LADDER_REACH: 130, // a fire within this many px of a ladder / pole / rope / stairs end can climb or drop through it...
    LADDER_UP: 0.35, LADDER_DOWN: 0.2, // ...as a share of the weight of a plain step along the deck (flames climb better than they fall)
    HIT_IGNITE_MAX: 2.5, // a hit's chance to light a fire is multiplied by how flammable the spot is (a plain deck = 1), up to this
    BOILER_BLOWOUT_FIRES: 0.7, // a boiler blowout lights a fire beside the boiler with this chance (and a second one with 60% of it)
    BOILER_FIRE_SPREAD: 90, // ...within this many px of the boiler
    HOT_RATE: 0.04, // overheating: chance per second of a spark fire beside the boiler at full over-pressure (from BOILER.WARN_AT up to 100)
    // A fire that reaches the coal (a spot at least FLAME_AT flammable) flares into a blaze: several fires at once, spreading faster, bigger flames and smoke.
    BLAZE: {
      FLAME_AT: 3, // a fire on ground this flammable (coal) flares
      FIRES: 3, // extra fires lit round it at once
      EXTRA_CAP: 2, // a blaze may go this far over the fire cap
      SPREAD_MUL: 1.8, // its fires spread this many times faster...
      KIDS_BIG: 0.75, // ...and a fire born of a big one is big itself with this chance
      HULL_MUL: 1.4, // a big fire eats this much more hull...
      EXTINGUISH_MUL: 1.8, // ...and takes this much longer to spray out
      SCORCH_MUL: 1.5, // ...and scorches nearby parts this much harder
      REFLARE: 20, // seconds before the same ship can flare again
      SMOKE_RATE: 5, // black smoke puffs per second from each big fire
      CALL: "THE COAL'S ALIGHT!", // the TV call-out
    },
  },
  // ARMOUR (S.5g): riveted iron plate drawn on a stretch of hull wall or rail. Very heavy (BALANCE.MASS.armour), does not burn, and hits landing on it do far less.
  ARMOUR: {
    POWER_MUL: 0.35, // a hit on plate counts as this share of its power (hull damage, broken parts, fires)
    HOLE_MUL: 0.25, // ...and it punches a breach this much as often
    MIN_LEN: 120, // the shortest stretch that can be drawn (px)
    SNAP: 60, // a stroke along a deck snaps to the deck's ends this close (px)
  },
  // PARTS BREAK OFF FOR REAL (S.5i; breakOff.js plans it, shipSim.js breakOff() does it mid-flight, debris.js tumbles the pieces). A bomb bay that is hit hard or reached by fire goes up and blows the
  // parts round it off the ship; very heavy hits, hard crashes into rock and rams break off the end or limb that took them; a ripped, empty gasbag can tear away. Lost is lost: the parts stay gone
  // until the crew pays for a REBUILD card at a sky-dock. Gentle by default (a co-op ship on Normal should rarely lose anything); every chance is multiplied by DIFFICULTY and by the armour on the spot.
  BREAKOFF: {
    ENABLED: true, // false = nothing ever breaks off (the old game)
    DIFFICULTY: { easy: 0.4, normal: 1, veteran: 1.25, hard: 1.5 }, // chance multiplier by the difficulty button's name (no entry = 1)
    ARMOUR_MUL: 0.25, // plate on the spot a hit or crash lands on: this share of the break-off chance is left
    STUB: 240, // a stretch of deck left standing at the end of a cut that is shorter than this goes too (no little floating stubs)
    GRACE: 6, // seconds after a break-off during which the same ship cannot lose another part to a hit, crash or ram (a bomb bay going up ignores it)
    BAY: {
      HIT_RADIUS: 150, // a hit this close to the middle of a LOADED bomb bay can set the bombs off...
      MIN_POWER: 2, // ...if it is at least this powerful (an enemy bullet is 1, a mine or bomb 2, a plane crash 3)
      HIT_CHANCE: 0.12, // chance per such hit with a full bay (fewer bombs aboard, less chance)
      FIRE_RADIUS: 170, // fire in the bay's compartment this close to its middle heats the bombs...
      COOKOFF: 60, // ...and when it has burned for this many seconds in all (the crew can spray it out, the heat fades) they cook off
      RADIUS: 230, // the blast blows off every deck stretch, room, gun, engine and rack within this many px of the bay (the classic ship loses the bay, her ball turret, the coal bunker and what stands round it)
      ARMOUR_HOLD: 0.6, // a blown deck stretch that is armoured all along holds with this chance
      BAG_REACH: 0.25, // a gasbag whose envelope is within this share of the radius from the blast is torn away
      HULL: 12, // hull points the blast costs (before the damage scale)
      POWER: 4, // forces.js kick of the blast (hit power: tips the ship about her centre of mass)
      SHAKE: 1.2, // screen shake
      CHAIN_RADIUS: 560, // fires start in surviving coal, ammo and boiler this close to the blast (the coal flares into a blaze, fire.js)
      FIRES: 3, // ...at most this many fires in all
      THROW: 380, // crew on the blown deck are thrown out with this speed (px/s)
      CHAIN_WARN: 450, // the validator WARNs when the bomb bay is closer than this (px of fire path: along a deck, 150 per ladder) to a boiler or a coal bunker (the classic ship's bay is 496 from her coal and 710 from her boiler)
    },
    HIT: {
      MIN_POWER: 2.4, // a hit this powerful (before armour) can break off the end or limb it struck ...
      CHANCE: 0.06, // ... with this chance at MIN_POWER ...
      PER_POWER: 0.05, // ... and this much more for each point of power above it
      MAX: 0.4, // ... but never more than this
      END_REACH: 230, // a deck's end this close to the hit goes (the outrigger, the tail, the nose); a small deck (a belly pod, a nest) goes whole
      LIMB: 220, // how much of a deck's end breaks off (px)
    },
    CRASH: {
      MIN_CLOSING: 420, // the first touch of rock at least this fast (px/s; her top speed is 560) can break off the part that hit it
      FULL_CLOSING: 700, // closing speed at which the chance is MAX
      CHANCE: 0.06, // chance at MIN_CLOSING
      MAX: 0.4, // chance at FULL_CLOSING
      END_REACH: 260, // the end or limb within this many px of where the hull met the rock goes ...
      FAR: 620, // ... and when there is none (the rock took the nose of the gasbag, far ahead of the hull) the nearest one within this many px: the bow crumples
    },
    RAM: {
      MIN_CLOSING: 300, // two ships meeting at least this fast (px/s of closing speed) can each lose the part at the contact point
      FULL_CLOSING: 600,
      CHANCE: 0.1,
      MAX: 0.5,
      FAR: 620, // as CRASH.FAR: where the two hulls met is the gasbags' noses, the deck ends behind them go
    },
    BAG: {
      MIN_BAGS: 2, // only a ship with at least this many gasbags can lose one this way (a single bag is her lifeline)
      HOLES: 3, // a bag with at least this many holes in it ...
      FLAT: 3, // ... that is down to this much gas (0..100) ...
      TEAR_TIME: 10, // ... for this many seconds tears away
    },
    LIFT_FAIL: 100, // a ship whose lift is so short that her hover level would be above this cannot hold her bags up at all: she is as heavy as the pump can lift
    REBUILD: {
      MASS_PRICE: 6, // salvage per point of weight lost (the classic ship weighs about 150) ...
      LIFT_PRICE: 2, // ... and per point of gasbag lift lost ...
      DECK_PRICE: 5, // ... and per 100 px of deck lost
      MIN: 40, // dearer than nothing, ...
      MAX: 280, // ... never more than this
    },
    BOT_REBUILD: 0.85, // the bots' crews vote for a REBUILD card (the oldest they can afford) with this chance
    DEBRIS: {
      LIFE: 7, // seconds a piece tumbles in the sky before it is gone
      GRAVITY: 520, // px/s^2
      SPIN: 1.1, // rad/s at most, either way
      SPREAD: 220, // px/s the blast throws pieces apart by
      SMOKE: 0.35, // chance per second per 100 px of piece of a puff of smoke
      FIRE: 0.5, // share of pieces that burn (orange puffs) when they come from a blast
      MAX: 12, // pieces in the sky at once (the oldest goes first)
    },
  },
  // Floating mines drifting toward the bow.
  MINES: {
    FIRST_AFTER: 30,
    EVERY_MIN: 18,
    EVERY_MAX: 28,
    EDGE_CHANCE: 0.6, // chance a mine skims the top/bottom (dodge it); otherwise it's dead centre (shoot it)
    RADIUS: 34,
  },
  // LAID MINES (minefield.js; the mine layer is a gun type: GUN_TYPES.mines below): floating iron mines a crew member drops out of the belly. They arm after a few seconds, go off against ANY ship that
  // touches them (the layer's own too), against planes, and when shot. Works in co-op (mines for the things that chase you) and in Versus (a field across the chaser's path).
  MINEFIELD: {
    SHOP: true, // the sky-dock's part cards may offer the mine layer
    ARM: 3.2, // seconds after the drop before a mine is live (it floats clear of the layer first)
    DRIFT: 26, // px/s it drifts on, the way the layer was going; it sinks at SINK px/s; DRAG = how quickly (per second) it settles to those from the layer's speed
    SINK: 12,
    DRAG: 1.4,
    LIFE: 110, // seconds before it rusts away
    MAX: 36, // mines in the sky at once (the oldest goes first)
    RADIUS: 40, // its body (px): a shell within RADIUS + 10 shoots it
    TRIGGER: 60, // a ship's hull within this many px sets it off
    POWER: 2.6, // the blow on the ship it goes off against (1 = one enemy bullet = 3 hull; Versus scales the holes and fires of a blow by it)
    BLAST: 280, // the bang reaches this far (px): a ship within it, but not touching, takes BLAST_MUL of the blow
    BLAST_MUL: 0.5,
    KICK: 2.4, // the forces.js kick away from it (RAM_KICK multiples)
    PLANE: 240, // a plane or a bat this close (an enemy crewman in the air: 0.6 x this) sets it off; a plane within BLAST takes PLANE_MUL shells' worth
    PLANE_MUL: 14,
    SHOOT_RANGE: 1800, // the gunners shoot another crew's mine (any mine, in co-op) that lies within this many px of her aim point and ahead of her ...
    SHOOT_NEAR: 700, // ... or within this many px whichever way it lies
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
    TUNNEL_SLACK: 1, // squares of spare room in a tunnel's height beyond what the ship needs (the layout's caveNeed: 7 on the classic ship)
    SHAFT_SLACK: 1, // squares of spare room in a shaft's width beyond what the ship needs (caveNeed: 11 on the classic ship)
    GOAL_RADIUS: 700, // how close to the beacon counts as reaching it
    OPEN_WIDTH: 190, // open-sky map size (squares) for its first mission
    OPEN_HEIGHT: 50,
    OUTPOSTS: 3, // outposts to destroy on an open-sky map (more later)
    STUCK_AFTER: 25, // seconds without real headway before the pilot plan tries to unstick the ship
    TOW_AFTER: 40, // seconds wedged where the ship does not fit before a tug hauls it clear
    UNSTICK_RISE: 450, // the unstick manoeuvre also climbs this far (px) so a ship resting on a ledge lifts off it
    UNSTICK_TIME: 8, // seconds the unstick manoeuvre lasts (back off, then take a longer look ahead)
    KM: 4000, // map pixels shown as one "km" on the TV goal readout
    LENGTH: { network: 1.2, route: 1.15, open: 1.2 }, // length knob per mission type: multiplies the map width (so the flying time)
    BOMB_RUN_RANGE: 7000, // bots start loading the bomb bay when the next outpost is this close (px)
    OUTPOST_REFILL: true, // knocking out an outpost restocks the bomb bay to full
    BOMB_RUN_MAN: 2600, // within this distance of the outpost one bot drops everything to man the bomb bay (px)
    BOMB_RUN_STOCK: 4, // ...and keep it stocked to at least this many bombs
    DETOUR: 1.6, // an open map is rebuilt if the way from the start to an outpost (or between outposts) is more than this many times the straight trip (mountains in the way)
    EASE_EVERY: 3, // an open map that keeps failing the checks is rebuilt one level easier every this many tries (so it always ends up playable)
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
    BOSS_STATION_GAP: 1400, // ...but no farther than this beyond her foremost gun (the classic ship's nose gun is 1328 short of 2700, so she parks as always; a shorter ship's gun can still reach it)
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
  // Background music loops (on the TV; music.js). Three CC0 tracks in public/audio/, picked from the game state:
  // dock = lobby / sky-dock shop / route map / scorecard / run end, calm = flying while the director builds or rests,
  // combat = a peak, a boss, a gunship alongside, or GOING DOWN. Also muted by the Sound button / M key.
  MUSIC: {
    ENABLED: true,
    VOLUME: 0.45, // overall music loudness (0-1)
    CROSSFADE: 2.5, // seconds to fade from one track to the next
    MIN_HOLD: 8, // a calm/combat track stays on at least this many seconds before the other can take over
    FILES: { dock: 'audio/dock-adventurers-rag.mp3', calm: 'audio/calm-treasure-hunter.mp3', combat: 'audio/combat-determined-pursuit.mp3' },
    TRACK_GAIN: { dock: 1, calm: 1, combat: 1 }, // per-track level trim (the files are mastered at different loudness)
    SILENCE: 0.01, // sample level below which the start/end of a file counts as silence (trimmed off the loop)
    EDGE_RATIO: 0.3, // if the loop's first/last 0.25 s is quieter than this share of the track's average, it fades in/out
    //   instead of looping cleanly, so that track is looped with a crossfade (LOOP_FADE) rather than a hard seam
    LOOP_FADE: 1.5, // seconds of overlap at the loop point for such tracks
    DUCK: 0.55, // music level (x) while a big warning banner is up...
    DUCK_IN: 0.12, // ...how fast it dips (seconds, smaller = faster)...
    DUCK_OUT: 0.9, // ...and comes back
  },
  // Difficulty presets (button on the TV). damage = hull damage taken; pace = how often waves,
  // flak and enemy fire come (higher = busier).
  // A wrecked ship ends the run, so damage is kept gentle (multiplier on all hull damage).
  // Re-tuned with tools/voyagesim.mjs (8 bots, --build classic and sparrow, 48 seeds): win rates about Easy 90%, Normal 55%, Veteran 35%, Hard 15%.
  DIFFICULTY: {
    easy: { label: 'Easy', damage: 0.12, pace: 0.72, autopilot: true, gunHp: 0.72, spares: 4 },
    normal: { label: 'Normal', damage: 0.22, pace: 0.91, autopilot: true, gunHp: 0.91, spares: 4 },
    veteran: { label: 'Veteran', damage: 0.285, pace: 1.0, autopilot: true, gunHp: 1.0, spares: 4 },
    hard: { label: 'Hard', damage: 0.24, pace: 0.97, autopilot: false, gunHp: 0.97, spares: 3 },
  },
  // Crew-size scaling (crewscale.js). The number of crew aboard (connected players, bots included)
  // multiplies the difficulty above, anchored at 8 crew = 1.0 and interpolated between rows.
  // spawn = how often waves/specials come; count = how many enemies in each; fire = enemy fire rate;
  // damage = hull damage taken; raiders = paratroopers/boarders; hp = enemy toughness (gunship, fighters);
  // spread = how fast fires spread; collateral = how often a hit also breaks things (modules, holes, fires).
  CREW_SCALE: {
    ENABLED: true,
    RAMP: 0.25, // the effective crew number follows the real one at this many crew per second (no mid-wave jumps)
    AUTOPILOT_MAX_CREW: 4, // this many crew or fewer: the helm autopilot stays on whatever the difficulty
    TABLE: {
      1: { spawn: 0.25, count: 0.25, fire: 0.2, damage: 0.2, raiders: 0.15, hp: 0.4, spread: 0.25, collateral: 0.2 },
      2: { spawn: 0.35, count: 0.35, fire: 0.3, damage: 0.3, raiders: 0.25, hp: 0.55, spread: 0.35, collateral: 0.3 },
      4: { spawn: 0.45, count: 0.45, fire: 0.4, damage: 0.4, raiders: 0.34, hp: 0.62, spread: 0.45, collateral: 0.4 },
      6: { spawn: 0.86, count: 0.86, fire: 0.84, damage: 0.82, raiders: 0.8, hp: 0.91, spread: 0.86, collateral: 0.82 },
      8: { spawn: 1, count: 1, fire: 1, damage: 1, raiders: 1, hp: 1, spread: 1, collateral: 1 },
      12: { spawn: 1.25, count: 1.5, fire: 1.25, damage: 1.4, raiders: 1.6, hp: 1.4, spread: 1.25, collateral: 1.25 },
      16: { spawn: 1.35, count: 1.55, fire: 1.35, damage: 1.5, raiders: 1.7, hp: 1.5, spread: 1.45, collateral: 1.4 },
    },
  },
  // Ship's mates (mates.js): helpers for short-handed crews. They use the bot brain with a restricted job list (bots.js),
  // man no stations, cast no votes, win no awards and do not count as crew for CREW_SCALE.
  MATES: {
    ENABLED: true,
    DIFFICULTIES: ['easy', 'normal'], // only on these difficulties
    MAX_CREW: 3, // this many human crew or fewer get mates (a 4th human sends them home)
    COUNT: { 1: 2, 2: 2, 3: 1 }, // mates per number of humans aboard
    SPAWN_GAP: 1.5, // seconds between one mate dropping aboard and the next
    JOBS: ['coal', 'ammo', 'patch', 'fire', 'revive', 'heal'], // the only job kinds a mate takes (hauling and mending; going to the medbay when hurt; GOING_DOWN.MATE_JOBS adds a few while she falls)
    COLOR: '#8a6f4e', // jacket colour (khaki)
    SCARF: '#b4b8bd', // the grey scarf that marks a mate
  },
  START_DIFFICULTY: 'normal',
  AUTOPILOT_SPEED: 0.65, // an unmanned helm steers itself at this share of the climb speed (Easy/Normal)
  // Enemies get busier with each lap: their fire rate is multiplied by this (lap 1 first).
  LAP_FIRE_RATE: [0.6, 0.8, 1.0, 1.15, 1.3],
  // Raider types. windup = seconds of warning ("!") before they strike.
  RAIDERS: {
    WAKE_GRACE: 3, // seconds after coming round when raiders (and bombs) can't knock you down again
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
    EXTRA_BOILER: 0.6, // a ship with several boilers: each extra working boiler adds this share of the first one's heat AND coal burn (one shared firebox and steam pool)
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
    SEEP_NO_PUMP: 0.004, // ...a ship that can never pump (no helm or no boiler) loses gas this slowly: a tight bag nobody tops up, she sinks only over many minutes
    LEAK_PER_HOLE: 0.9, // extra gas lost per second per hole
    SCRAPE_BELOW: 25, // grinding along the ground with gas below this, the hull scrapes...
    SCRAPE_DAMAGE: 5, // ...losing this much hull per second (before the difficulty multiplier)
    MAX_HOLES: 8,
    BALLAST: { BELOW: 4, TO: 56, COOLDOWN: 75 }, // emergency ballast drop: gas below BELOW jumps to TO (a brief hover), at most once per COOLDOWN seconds
    HOLE_CHANCE: 1, // chance a hit on the gasbag punches a hole
    // Several gasbags side by side (S.5d): each has its own gas and holes; the pump and the vent act on all of them, and the ship's lift follows the
    // lift-weighted average of their gas. A bag at or below BAG_DOWN is deflated (it sags, the TV calls it out) while the rest of the bags hold at least BAG_REST
    // more gas than it (venting every bag empty is not "a bag down"); it counts as back up above BAG_UP.
    BAG_DOWN: 4, BAG_UP: 22, BAG_REST: 15,
    // Gas valves (a part on a deck; one per bag at most matters): a SHUT valve cuts its bag off from the helm's pump and vent. While the helm pumps, each hole in a bag
    // whose valve is OPEN bleeds this much gas per second out of the shared feed (shared by the open bags), so a ruptured bag starves the others until the crew
    // shuts its valve (or patches it). A bag with no valve is always open; a ship with one bag is unchanged.
    HOLE_BLEED: 10,
  },
  // GAS TYPES (catalogue v2 Tier 1; gases.js, hydrogen.js, gasBags.js). Every gasbag part has a `gasType` (absent = helium, so every older build is unchanged): the lift of a bag is its size times its gas's
  // `lift`; the weight of a hot-air bag's burner is `mass`; `seep` multiplies how fast the bag loses gas by itself; `price` multiplies the dock's top-up (SHOP.REPAIR_GAS, helium = 1).
  GASES: {
    helium: { name: 'Helium', short: 'He', tint: 'rgba(120,180,225,0.22)', lift: 1, mass: 0, seep: 1, price: 1, blurb: 'safe, and the dearest to top up' },
    hydrogen: { name: 'Hydrogen', short: 'H2', tint: 'rgba(205,70,50,0.24)', lift: 1.3, mass: 0, seep: 1.4, price: 0.5, blurb: '30% more lift and cheap, but it burns: a fire that reaches the bag sets it off' },
    hot: { name: 'Hot air', short: 'HOT', tint: 'rgba(240,160,60,0.30)', lift: 0.6, mass: 1.5, seep: 1, price: 0, blurb: 'free, but weak and only as good as the boiler heat: keep her stoked' },
    // HYDROGEN: a fire (or flame, or a lucky hit) reaching the bag SCORCHES it; at 1 it is ALIGHT, burns for FUSE seconds (venting its gas), then EXPLODES: the bag tears away (breakOff), fires start under it,
    // the crew near it are blasted, and a hydrogen bag touching it catches too. A bag that has burned down below FIZZLE gas just fizzles (it still tears away, with no blast).
    HYDROGEN: {
      REACH_BELOW: 120, // a fire on a deck up to this many px below the envelope's underside (and under it, in x) reaches the bag; one on the nest decks on top of it does too
      REACH_ABOVE: 260, // ...and a deck this far above the bag's top (a high crow's nest)
      BIG_REACH: 110, // a BIG fire (a blaze) reaches this much farther down
      SCORCH_RATE: 0.13, // scorch (0..1) a second per fire reaching the bag, times FIRE.FLAMMABILITY.gasbag; 1 = alight (about 5 s with one fire)
      BIG_MUL: 1.8, // a big fire scorches this much faster
      SCORCH_COOL: 0.12, // scorch lost a second when nothing burns near it
      HIT_IGNITE: 0.05, // chance a hit's power 1 on a hydrogen bag sets it alight at once (more power, more chance)
      FLAME_RATE: 1.6, // scorch a second a flamethrower's cone puts on the bag (0.7 s of flame lights it)
      FUSE: 3, // seconds an ALIGHT bag burns before it explodes
      BURN_LEAK: 7, // gas a second an alight bag loses
      FIZZLE: 8, // an alight bag with less gas than this when the fuse ends fizzles instead of exploding
      EMPTY: 6, // a bag with less gas than this has nothing left to burn: it cannot be scorched or lit
      RELIGHT: 25, // seconds a bag that burnt out (her only bag, ripped open) cannot catch again
      FIRE_EVERY: 0.9, // seconds between the big fires an alight bag drops on the decks under it
      BLAST_RADIUS: 380, // crew within this many px of the underside of the bag are blasted (hearts: health.js)
      BLAST_BIG: false, // true = knocked out at once like the bomb bay; false = one heart (BLAST_HEARTS)
      BLAST_HEARTS: 1,
      HULL: 8, // hull points the blast costs (before the damage scale), times the bag's fill
      POWER: 3, // forces.js kick of the blast
      SHAKE: 1, // screen shake
      FIRES: 3, // fires lit on the decks under the bag when it goes
      CHAIN_GAP: 40, // a hydrogen bag whose envelope is within this many px of the exploding one catches too...
      CHAIN: 0.85, // ...with this chance...
      CHAIN_FUSE: 0.5, // ...burning for this share of the fuse
      WARN_NEAR: 260, // the validator WARNs for a boiler, coal bunker or flamethrower within this fire path of a hydrogen bag's reach
    },
    // HOT AIR: the bag's lift follows the boiler's heat. heat (0..1) chases PRESS_FULL-scaled boiler pressure, warming at WARM and cooling at COOL a second; a cold bag keeps COLD of its fill's lift.
    HOT: {
      PRESS_FULL: 45, // boiler pressure that gives full heat
      WARM: 0.12, COOL: 0.035, // heat gained / lost a second (she cools slowly: a lull in the stoking is not a fall)
      COLD: 0.3, // share of its lift a cold bag keeps
      WARN_BELOW: 0.7, // the TV calls out "HOT AIR COOLING" below this heat; the bots stoke
    },
    OFFER_HOVER: 55, // the dock offers to convert a bag to hydrogen on a ship whose hover level is above this (heavy ships)
    CONVERT: { hydrogen: 90, helium: 120, hot: 30 }, // dock price of converting one bag TO this gas
  },
  // What the ship-building validator (modules/host/buildCheck.js, tools/buildsim.mjs --build, public/buildtest.html) holds a build to.
  // Part weights, lifts and hands are data in modules/host/shipBuild.js (PARTS); these are the limits and the assumptions behind the gauges.
  BUILD_CHECK: {
    HOVER_MIN: 25, // LIFT: the gas level she hovers at (GAS.NEUTRAL + weight - lift) must be at least this...
    HOVER_MAX: 70, // ...and at most this (FAIL outside)
    HOVER_WARN: 62, // WARN above this (more pumping, more steam, more holes to lose)
    PRESS_CRUISE_MIN: 55, // STEAM: settled pressure at cruise must be at least this (FAIL below)...
    PRESS_IDLE_MAX: 95, // ...and at idle at most this (WARN above: she needs venting)
    FUEL_SETTLED: 50, // coal in the firebox the settled pressure is worked out at (the crew keeps it around here)
    CRUISE_SPEED: 0.5, // engine speed (0..1) counted as cruising...
    IDLE_SPEED: 0.3, // ...and as idling
    PUMP_DUTY: 0.1, // share of cruise time the gas pump runs (BOILER pressure used = GAS.PUMP_STEAM x this)
    POWER_DUTY: 0.05, // share of cruise time the shield / coil draw their extra steam
    WALK_COAL: 9, // seconds from a coal bunker to the boiler it feeds (WARN above; FAIL above x WALK_FAIL)
    WALK_AMMO: 14, // seconds from an ammo hold to the farthest gun it feeds
    WALK_NEST: 8, // seconds from the crow's nest to the main deck
    WALK_FAIL: 1.5, // a walk this many times its budget is a FAIL
    FIT_WIDTH: 2700, // the drawn ship may be at most this wide (px)...
    FIT_HEIGHT: 1400, // ...and this tall, or she shrinks too small to read on a TV
    CAVE_TUNNEL: 8, // the widest cave tunnel (map squares, tall) and shaft the map maker carves for a ship;
    CAVE_SHAFT: 12, // a build needing more wedges in caves (WARN for player builds, FAIL for the starter ships)
    CREW: 8, // HANDS: crew size the gauge is read at...
    HANDS_PER_PLAYER: 3, // ...WARN above this many manned stations per player
    FIRE_NEAR: 330, // FIRE (S.5f): a coal bunker closer than this (px of fire path: along a deck, 150 per ladder) to a boiler WARNs "coal bunker beside the boiler: fire risk" (the classic ship's are 440 apart)
    FIRE_EXT_REACH: 350, // an extinguisher within this fire path of the coal / boiler counts as covering it in the fire-risk read-out
    MIN_GAP: 40, // two stations on one deck must be at least this far apart (px)
    BAG_GAP_WARN: 60, // WARN when two gasbags leave more than this much open sky between them over a deck (px)
    BOT_BOTS: 6, // the bot-run check: bots...
    BOT_MINUTES: 3, // ...minutes (on a cave map and an open-sky map)...
    BOT_HULL_MIN: 60, // ...average hull must stay above this...
    BOT_TUGS_MAX: 1, // ...and she may be hauled out of a wedge at most this often
  },
  // Balance (S.5c): where the ship's weight hangs against where her lift is. The centre of mass (COM: every part's mass at its x, plus the live loads
  // while flying) should sit under the centre of lift (COL: the bag's middle, lift engines when they exist). Ahead of it she is nose-heavy, behind it tail-heavy.
  // The validator reads the build numbers (buildCheck.js), shipLayout.js turns them into SHIP_BALANCE, and simulation.js tips and slows the ship by them.
  BALANCE: {
    // What things weigh, in gas points (the same scale as a gasbag's lift: she hovers at GAS.NEUTRAL + weight - lift). The classic ship adds up to about
    // 150, the lift of her bag, with her centre of mass a few px behind her bag's middle. Heavy things (boiler, coal, bomb bay, engines) are what tips the seesaw.
    MASS: {
      deck: 0.3, // per 100 px of deck (an outside deck weighs half)
      link: { ladder: 0.4, rope: 0.3, stairs: 1, lift: 3, pole: 0.3 }, // ways between decks
      kind: { helm: 5, boiler: 16, lookout: 1, coal: 10, ammo: 6, gun: 3, searchlight: 2, coil: 5, deflector: 5, bombBay: 10, navigator: 1, escort: 5, sail: 4, cannon: 9, cannonSeat: 0, gun_long: 6, gun_mortar: 5, gun_scatter: 4, gun_flak: 4, gun_harpoon: 5, mineLayer: 6, ram: 8 }, // stations by kind (B.6: the crew cannon's brass barrel and carriage weigh on its gunner's station; the seat in the barrel is just a place to stand). The gun_* ones are the gun types of GUN_TYPES (a plain gun is 3); mineLayer is the mine chute and its racks, ram the reinforced prow
      engine: 9, pipe: 0.5, vent: 0.3, gasValve: 0.4, rack: 0.2, extinguisher: 0.2, medbay: 3,
      bag: 6, bagTwin: 4, // a gasbag's rigging, and the twin envelope's
      ballast: 5, // one sandbag: cheap and dense, the trimming tool
      armour: 4.5, // riveted iron plate, per 100 px of stretch (a 360 px stretch weighs about a boiler)
      coveredDeck: 1, outdoorDeck: 0.5, // S.5g: a covered deck (walls, roof, rooms) weighs this times deck per column; an open-air walkway with rails only this much
      mast: 3, // the mast of a high crow's nest tier (crow2): weight way up high
      swivel: 2, // S.5h: a swivel mount (the crank and the gimbal) on an engine
    },
    LEVEL_PX: 30, // COM within this many px of COL counts as level (no trim at all: the classic ship is exactly level)
    WARN_PX: 80, // WARN beyond this ("nose-heavy 2 degrees")...
    FAIL_PX: 220, // ...FAIL beyond this ("she will nose-dive")
    DEG_PER_PX: 0.025, // the trim angle the gauge shows: degrees per px of offset beyond LEVEL_PX...
    CAP_DEG: 6, // ...up to this many degrees
    BALLAST_MAX: 16, // most sandbags a ship may carry
    BALLAST_GAP: 36, // sandbags on one deck (or hanging from one) at least this far apart (px)
    BALLAST_HANG: 52, // a hanging sandbag's centre is this far under its deck (px)
    // ---- in flight (simulation.js) ----
    SIM_SHARE: 0.3, // the flying ship rests tipped by only this share of the gauge angle (subtle, and under AIRBORNE.PITCH_STAGGER so crew do not slide)...
    SIM_CAP_DEG: 1.8, // ...at most this many degrees, on top of the climb / dive tilt
    DIVE_ACCEL: 14, // nose-heavy: extra downward push (px/s^2) at the full gauge angle (CAP_DEG); tail-heavy: the same upward. Gentle, and the helm trim engine counters it
    SLOW_TAIL: 0.1, // tail-heavy: the share of top speed lost at the full gauge angle (she drags her tail)
    SCRAPE_PER_DEG: 0.12, // nose-heavy: extra hull scraping per second per degree of gauge angle while she grinds along the ground (the bow digs in)
    WARN_DEG: 3.5, // gauge angle (live) beyond which the TV shouts "NOSE-HEAVY! TRIM HER!" (and the phones get a job) ...
    WARN_EVERY: 25, // ...at most this often (seconds)
    // Live loads: while flying, the things that move or burn shift the centre of mass. LIVE false = only the build's own weight counts.
    LIVE: true,
    LIVE_MASS: { crew: 1.2, carry: 0.8, fuel: 0.06, ammo: 0.03, bomb: 0.8 }, // per crew member aboard / per load carried / per fuel point in the firebox / per round in a gun / per bomb in the bay
    LIVE_SMOOTH: 1.5, // how quickly the live balance follows (per second): crew running about do not make her flutter
    BAG_COL: true, // several bags: the live centre of lift follows each bag's gas (a deflated bag stops lifting, so she tips toward it); false = the build's static one
  },
  // The blueprint editor (modules/host/buildEdit.js; the dev page's draw / erase tools).
  BUILD_EDIT: {
    SNAP_ROW: 60, // a pen stroke counts as drawing on a deck row when it is this close to it (px)
    SNAP_X: 45, // a stroke's end snaps to a deck end this close (px), otherwise to the 120 px column grid
    MIN_PIECE: 60, // an erase never leaves a sliver of deck shorter than this (px): it clears to the end instead
    ERASE_MARGIN: 14, // things standing this close to an erased stretch (px) go with it
    BAG_STEP: 60, // the gasbag gets this much longer or shorter (px of half-length: one column in all) per click...
    BAG_MIN: 120, BAG_MAX: 1900, // ...between these half-lengths (a small bag is 240 px long, a giant one 3800)
    BAG_DROP: 240, // the half-length of a bag dragged in from the part tray
    BAGS_MAX: 8, // most gasbags side by side
    VALVE_GAP: 100, // two gas valves on one deck at least this far apart (px)
    VALVE_STATION: 52, // ...and from a station (px; more than TOOLS.VALVE_REACH, or a player working the station would turn the valve)
    VALVE_CLEAR: 46, // a gas valve at least this far from any rack, vent, ladder or other valve (it only needs TOOLS.VALVE_REACH to work, so it fits on a crowded deck)
    DROP_SNAP: 90, // dragging a part from the tray: it snaps to a legal spot this near the pointer (screen px)
    DROP_REACH: 220, // placePart (the pure drop, no screen): the nearest legal spot within this many ship px takes the part...
    DROP_ROW: 75, // ...and only a spot whose deck is within this many px up or down of the drop point (a gun dropped on the main deck does not jump to the top deck)
    BAG_CY: 198, BAG_RY: 232, // a gasbag drawn from nothing sits at this height with this half-height (the classic bag's)
    BAG_COVER: 0.9, // the share of the gasbag's half-length that counts as covering the ship (the ends of the ellipse are thin): validator WARN beyond it
  },
  // ---- The build page's big view and playtest (buildView.js, playtest.js, buildPlay.js) ----
  BUILD_VIEW: {
    ZOOM_MIN: 0.4, ZOOM_MAX: 10, // how far the blueprint zooms out and in (1 = the whole sheet fitted to the pane)
    ZOOM_STEP: 1.25, // one press of the + / - buttons (or a key)
    WHEEL_RATE: 0.0016, // zoom per wheel delta unit (an exponent: a notch of 100 is about 17%)
    FIT_MARGIN: 70, // "Fit ship" leaves this many screen px of paper round the ship
    PAN_TAP: 5, // a right-button drag shorter than this (screen px) is a right-click (it deletes the thing under it), longer is a pan
    SIDE_MIN: 0.2, SIDE_MAX: 0.8, // the Split view's blueprint share of the pane (draggable divider)
    SPLIT: 0.62, // ...starts at this
    VIEW: 'bp', // the view the page opens with (then the last one used is remembered): 'bp' blueprint only, 'split', 'live'
    UI_MAX: 3, // the page scales up on big screens: 1 at 1920x1080, 2 at 4K (never above this)
    UI_STEPS: [0.8, 1, 1.25, 1.5, 2, 2.5], // the "UI size" choices (Auto picks one from the screen)
    WORKING_DEBOUNCE: 400, // ms after an edit before the working build is saved to this computer
  },
  // ---- Playtest and My Ships (playtest.js): the build page hands a build to the real host game ----
  PLAYTEST: {
    DESIGNS_MAX: 60, // most named designs kept in My Ships (this computer's storage)
    NAME_MAX: 32, // longest design name
    CREW: [0, 2, 4, 8], // the "Crew" choices: 0 = phones only (the lobby with its QR code); else that many bots (Versus: per side) and the ship casts off at once
    CREW_DEFAULT: 0,
    FOE_DEFAULT: 'classic', // the shelf ship the Versus playtest fights by default
    SHIP_ID: 'mine', // the shelf id of the playtest ship in a Versus match
  },
  // ---- S.5h: POINTED ENGINES. Every engine has a direction (an angle, 0 = forward, -PI/2 = up, PI/2 = down, PI = back). Forward / back thrust is speed, up thrust is lift (climb without gas,
  // costs steam), down thrust is a dive. Thrust acts where the engine sits, so a vertical push also pitches the ship (forces.js). A swivel mount is a crew station that turns the engine in flight.
  ENGINES: {
    DRIVE_COS: 0.5, // an engine pointing within 60 degrees of forward counts as a drive engine (top speed = working drive thrust / drive engines; more engines add safety, not speed)
    LIFT_GAS: 16, // one engine pointing straight up lifts like this many gas points (a bag of 150 lifts the classic ship); pointing down it drags her down as much
    VERT_USE: 0.5, // steam an engine burns for vertical thrust, relative to full forward use (BOILER.USE_ENGINE), whatever the throttle is
    BODY_DY: 38, // an engine hangs this far under its deck (px): the height its thrust acts at
    SWIVEL_OFFSET: 64, // the swivel crank stands this far from its engine, toward the middle of the ship (px)
    SWIVEL_RATE: 1.6, // radians per second the engine turns when the stick points elsewhere
    SWIVEL_ARC: 1.75, // a swivel mount turns this far either side of the direction it was placed with (radians, 100 degrees: forward reaches up and down but not back)
    SWIVEL_STICK: 0.3, // the stick must be pushed this far to turn it
    OPPOSE_NET: 0.15, // validator: engines whose net forward thrust is under this share while some push forward and some back (WARN)
    PITCH_WARN_DEG: 1.2, // validator: engines (and sails) that tip her more than this many degrees at rest (WARN, unless a swivel mount can counter them)
    BOT_CLIMB_GAS: 34, // bots point a swivel engine UP when the gasbag is under this (she is sinking) ...
    BOT_DIVE_DY: 140, // ...and DOWN when the helm wants to be this many px lower than she is, or on a bombing run
    // ---- PER-ENGINE THROTTLES. Every engine has its own throttle; linked (default) the helm's lever sets them all, split each lever sets its own engine (engines.js).
    THRUST_MOMENT: 100, // an engine pushing ahead at full throttle twists the ship as a push of this many px/s^2 at the engine's place (an engine hung below the centre of mass tips the nose up); it adds no speed. 0 = the old ship
    THR_RATE: 2.5, // an engine's throttle chases what the helm set at this share of full per second (the levers on the phone glide)
    LEVER_UP: 0.5, // linked, the helm's lever is the throttle of an engine pointing ahead (DRIVE_COS) and no more than this share up or down; one that lifts more than that runs flat out, as it always did
    TRIM_MIX: 0.35, // AUTO-TRIM: with the helm stick fully up (down) and the levers linked, the engines whose push tips the nose up (down) get this much more throttle and the others this much less (0..1)
    LEVEL_MIX: 0.8, // a bot levelling the ship with split throttles shifts them this far (same rule as TRIM_MIX, stronger)
    BOT_LEVEL_DEG: 0.6, // a bot at the helm splits the throttles when the nose is more than this many degrees off level while it climbs out of a Kraken breach or after a hit (a ship with lift engines only)
  },
  // FORCES (S.5h): one model for everything that shoves the ship at a point: engine thrust, sails' wind, gusts, hits and explosions, rock scrapes, rams, the gunship's tether. A force is applied at
  // a place (forces.js applyForce) and twists the ship about her live centre of mass: torque / (her radius of gyration squared), a longer or more spread-out ship turns slower. The tilt then
  // swings like a weight on a spring (K, DAMP) and settles back. Gains scale each source's torque. LIVE false = only the engines, sails and the weight move her pitch (the S.5c ship).
  FORCES: {
    LIVE: true, // hits, gusts, scrapes, rams and the tether twist the ship too (false: only engines and sails do)
    K: 14, // how hard the ship swings back to level (1/s^2): she hangs from her bag
    DAMP: 4.5, // damping of the swing (1/s): critical is about 7.5
    MAX_DEG: 1.8, // most the forces tip her (degrees), on top of the rest trim and the climb tilt: kept small so crew do not slide (AIRBORNE.PITCH_STAGGER, 2 degrees)
    MAX_RATE: 0.7, // fastest she can tip (radians per second)
    REF_MASS: 150, // the weight (gas points) the hit and ram kicks are quoted for: a heavier ship is shoved less
    GAIN: { engine: 0.7, sail: 1, gust: 1, hit: 1, scrape: 1, ram: 1, tether: 1, grab: 1 }, // torque gain per source
    HIT_KICK: 20, // a power-1 hit changes the ship's velocity by this much (px/s) at REF_MASS: it twists her about the point it struck
    HIT_SIDEWAYS: 0.35, // ...mostly up or down (away from the middle of the ship's height), with this much sideways
    GUST_WIND: 110, // a storm gust's side wind pushes the gasbag with this acceleration (px/s^2), at the gasbag's height: it tips her nose down
    GUST_LIFT: 1, // the up/down part of a gust pushes the front of the bag with this share of its alt shove
    SCRAPE_ACC: 70, // grinding along rock pushes back at the contact point with this acceleration (px/s^2) at 60 px deep
    RAM_KICK: 25, // a plane ramming the ship kicks her this hard (px/s at REF_MASS), at the plane's place
    TETHER_ACC: 30, // the gunship's rope pulls the bow with this acceleration (px/s^2) per 100 px of stretch
    CREW_DEG_PER_PX: 0.022, // a crowd's weight pulling the centre of mass this many px toward the bow tips her nose down by this many degrees per px (to the stern: nose up); six crew at the bow is about 0.6 degrees
    CREW_MAX_DEG: 1.2, // ...at most this much
    BOARDER_MASS: 1.2, // a raider on deck weighs this much in the live centre of mass (like a crew member)
  },
  // SHIP-SHIP COLLISION (shipCollide.js): any two ships in one sky are solid to each other - co-op ?ships=N, every Versus phase while flying, later the gunship as a ship. Once per step, after the
  // ships have moved, the hulls (the gasbag ellipses and hit boxes a shell hits) are pushed apart by the FULL overlap (a heavier ship moves less) and the closing speed along the contact is taken out of both.
  COLLIDE: {
    ENABLED: true, // false = ships pass through each other (the old co-op)
    ITER: 6, // pushes per pair per step (a hull is several shapes; the first usually clears them all, a ship thrown deep into another may need a few)
    PASSES: 2, // sweeps over all pairs per step (with three ships a push on one can shove her into the next)
    SLOP: 0.5, // px of air left between two hulls that were pushed apart
    RESTITUTION: 0.3, // the share of the closing speed they bounce back at (0 = they stick, 1 = a perfect bounce); only above MIN_CLOSING, a light touch just stops
    MIN_CLOSING: 60, // closing speed (px/s) that hurts: below it the hulls just press
    CLANG_CLOSING: 25, // closing speed (px/s) that clangs, puffs sparks and counts as a bump (a harder hit always does)
    COOLDOWN: 0.9, // seconds before the same two ships can clang or hurt each other again
    DAMAGE: 0.5, // impact power each ship takes per 100 px/s of closing speed (1 = one enemy bullet)
    MAX_POWER: 5, // ...at most this much
    KICK: 1.6, // the forces.js kick where they touched (RAM_KICK multiples, at most x3 per 150 px/s of closing speed)
    GIVE_WAY: { TIME: 1.5, MARGIN: 150 }, // bot pilots in a fleet (course.js giveWay): a ship does not fly on while another is inside the box she sweeps over the next TIME seconds, grown by MARGIN px, and AHEAD of her
  },
  // The RAM PROW (shipBuild.js ramProw, shipCollide.js, weaponsArt.js drawRam): a big reinforced iron beak that sticks TIP px out past the fore end of its deck (about 350 past the gondola's nose, beyond even the gasbag's) and is part of
  // the hull for every collision, so it can be the first thing to touch (a nose-on meeting at its point counts too: REACH, SIDE). When the PROW is where two ships meet, the OTHER ship takes MUL x the usual blow (at most MAX_POWER) and the rammer only SELF x; both are
  // kicked, and a ram counts for the stats (match.js rams). A touch below COLLIDE.MIN_CLOSING hurts nothing, as any bump. A contact elsewhere on the hull (the prow missed) is an ordinary collision.
  RAM: { BREAK_SELF: 0.2, BREAK_OTHER: 1.8, POWER: 1.2, MUL: 2.5, SELF: 0.3, MAX_POWER: 9, SHOP: true, // (SHOP: the sky-dock's part cards may offer it)
    TIP: 460, // how far past the fore end of her deck the point of the beak reaches, px (the classic gasbag's nose is 320 out and the outriggers' 110: the prow sticks out past both)
    HALF: 78, // half the height of the beak where its collar is bolted to the hull, px
    TIP_HALF: 10, // half the height of the blunt end of the point (the collision shape; the picture ends in a point inside it), px
    REACH: 520, // a nose-on meeting counts as the prow's when it is within this many px of the point (level ships meet gasbag-first: shipCollide.js noseOn)
    SIDE: 0.6, // ...and the way out is within this much (sine of the angle) of straight along her bow
    SHELL_MUL: 0.1, // a shell that lands on the prow is stopped by the iron: this share of the usual blow
    SHAKE: 1.1, // the screen shake of a landed ram (flight shake, 1 = a heavy blow)
    SPARKS: 26, // sparks thrown from the point of contact
    SCUFF_MAX: 6, // the prow shows one more dent and scratch for each landed ram, up to this many
  },
  // CROSS-SHIP PLAY (B.6): things that cross from one ship to another, or change what another ship weighs. All of it is per-part and per-ship: a classic co-op ship has none of these parts and nothing here runs.
  CROSS: {
    // The CREW CANNON (cannon.js): a brass cannon on an open deck that fires a CREW MEMBER across the sky. Two stations: the SEAT in the barrel (Action while it is empty: you climb in) and the
    // GUNNER'S post beside it (stick aims, hold to charge, let go to fire). Nobody at the post: the one in the barrel can fire himself (weaker, and straight along the barrel's aim).
    CANNON: {
      AIM: -0.8, // the barrel's middle angle in ship space (radians, y down: -0.8 is forward and up; a cannon on the stern half of a ship faces aft: PI + 0.8)
      ARC: 0.75, // how far the gunner can swing the barrel either side of AIM
      TURN: 1.5, // radians per second the barrel swings
      SPEED: 1750, // launch speed at full power, relative to the cannon (px/s)
      MIN_POWER: 0.3, // a tap fires at this share of SPEED
      CHARGE_TIME: 1.3, // seconds of holding to reach full power
      SOLO_POWER: 0.62, // the self-fired shot: this share of SPEED, whatever the barrel
      COOLDOWN: 8, // seconds before the cannon can fire again
      STEAM: 14, // boiler pressure points a shot uses up
      MIN_PRESS: 22, // ...and the pressure it needs to fire at all
      GUNNER_DX: 85, // the gunner's post stands this far behind the barrel (px, along the ship)
      MUZZLE: 78, // the crewman leaves the barrel this far along its aim (px)
      DRAG: 0.18, // sideways air drag on a flying crewman fired from it (per second; a walker's is AIR.DRAG): he really carries
      NO_LAND: 0.45, // seconds after firing that he cannot land (he flies through the decks round the muzzle)
      OVERBOARD_X: 3400, // a cannon flyer is only overboard this far (px) beyond the ends of the ship he left
      RECOIL: 2.2, // the kick the barrel gives the ship (RAM_KICK multiples), tipping the end it stands on
      FLYER_STEER: 1, // stick steering in the air as a share of the normal (AIR.STEER_ACCEL); the parachute steers harder
      SOLVE_ANGLES: 30, // the bots' aim search: barrel angles tried ...
      SOLVE_POWERS: 7, // ... and powers tried
      SHOP: true, // true: the sky-dock shop sells the cannon (owner turned it on; false keeps it to the build page and the dev flags)
    },
    // THROWABLE BALLAST and cargo (cargo.js): sandbags and crates come from racks, coal from the bunker. ATTACK on an open deck throws what you hold; it lands as a LIVE LOAD on the deck it falls on.
    CARGO: {
      ITEMS: { sandbag: { w: 6, label: 'Sandbag' }, crate: { w: 9, label: 'Crate' }, coal: { w: 3, label: 'Coal sack' } }, // what each weighs on a ship (gas points; a crew member is 1.2), whether carried or lying on a deck
      THROW_SPEED: 1000, // px/s of a throw
      THROW_UP: 0.45, // ...with this much upward tilt added to the stick's way
      GRAVITY: 1300, // px/s^2 on a thrown load (a sack falls slower than a person)
      FLIGHT: 6, // seconds before a thrown load is given up for lost
      OPEN_ONLY: true, // a throw needs an open-air deck (inside the hull there is nowhere to throw it)
      STOCK: 4, // sandbags (or crates) a rack holds
      REFILL: 30, // seconds for a rack to grow one back
      MAX_LOADS: 10, // loads on one ship at once; the oldest goes over the side when there are more
      SHOVEL_TIME: 1.8, // seconds of holding Action to shovel one load overboard
      DUMP_REACH: 90, // px from the end of an open deck (the rail) within which the Action button dumps the sandbag you carry
      DUMP_GAS: 6, // gas points a dumped sandbag adds to the bag's lift (a brief climb, the helm's pump takes it back) ...
      DUMP_KICK: 55, // ...and a push upward (px/s at REF_MASS), at the deck's end: it lifts that end first
      DROP_SPEED: 160, // a load let fall from the bomb bay leaves the ship with this downward speed
      STEAL_FUEL: 9, // firebox fuel (of BOILER.FUEL_MAX) one sack of coal lifted from an enemy ship's bunker takes out of her; it feeds the thief's own boiler as a normal load (BOILER.COAL_FUEL)
    },
    // TOWING (towing.js): carry a towline from a rack (Action at the rack), ATTACK throws its grapple at another ship in reach; the line pulls both ships (a spring between the two poses)
    // and twists both about their centres of mass. Cut it with a sword (ATTACK at its end) or let it snap.
    TOW: {
      RANGE: 1000, // px a grapple flies and hooks a ship's deck or hull
      SPEED: 2200, // px/s of the flying grapple (the TV draws it)
      LEN: 520, // rest length (px) of the line once it has caught; she hauls in to it
      REEL: 120, // px/s the line shortens while it holds
      K: 2.4, // spring: acceleration (px/s^2) per px of stretch ...
      DAMP: 1.6, // ...and per px/s of the ships moving apart
      MAX_ACC: 420, // ...at most this
      SNAP: 1500, // px: the line parts when the ships are further apart than this
      TORQUE: 1, // the twist of each pull (forces.js 'tether', FORCES.TETHER_ACC multiples per 100 px of stretch)
      CUT_REACH: 90, // px from the end of the line on a deck within which a sword cuts it
      PRIZE: 150, // salvage paid at the dock for arriving with a captured enemy gunship still in tow
    },
    BOTS: {
      CANNON_CHANCE: 1.4, // per minute, per think: the chance a quiet bot crew goes for the crew cannon when the target is in reach (also gated by the hull and the cooldown)
      CANNON_MIN_CREW: 3, // not with fewer hands
      CANNON_WAIT: 14, // seconds the seat waits for a gunner before firing solo
      THROW_CHANCE: 1.2, // per minute: a bot crew with a sandbag rack throws sandbags at a rival ship that is close under or beside them
      THROW_RANGE: 2400, // ...a rival whose ship is within this many px of ours (origin to origin) is looked at; the throw only goes if the arc from the end of the top deck lands on one of her decks
      TOW_RANGE: 800, // a bot with a towline hooks a ship that is this near
    },
  },
  // THE CARGO DROP HATCH (hatch.js; the dropHatch part, 1-3 columns wide, with a lever beside it): a pair of trapdoors in a deck. Open, they leave a real hole: anyone standing over it falls through (a parachute
  // can be opened with Action), loads lying on it drop as world objects that land on any ship below or fall away, raiders and boarders standing on it are tipped out, and walking routes go round it.
  HATCH: {
    SHOP: true, // true: the sky-dock shop sells the hatch (false keeps it to the build page and the dev flags)
    WARN_TIME: 1.3, // seconds between pulling the lever and the doors giving way: a klaxon, hazard lamps on the TV, and "CLEAR THE HATCH!" for anyone standing on it
    OPEN_TIME: 0.5, // seconds the two leaves take to swing open ...
    CLOSE_TIME: 0.8, // ... and to swing shut
    GAP_AT: 0.35, // the hole counts as open (things fall, routes avoid it) once the doors are this far open (0 shut .. 1 wide), and until they are this far shut again
    LEVER_DX: 58, // px from the edge of the hatch to its lever (on the free side of it)
    LEVER_REACH: 46, // px: the lever is pulled from this close (nearer than a rack's reach, so it works on a crowded deck)
    EDGE_PUSH: 3, // px: a walker held at the edge of an open hatch stands this far off it
    FALL_VY: 70, // px/s downward speed a faller leaves the deck with
    FALL_VX: 0.35, // share of his sideways walking speed he keeps
    CHUTE_WINDOW: 900, // px further a faller through the hatch can drop before he counts as overboard (about a second more to press ACTION for the parachute)
    DROP_REACH: 70, // px from the edge of an OPEN hatch within which Action lets the sandbag or crate you carry fall through it
    LOAD_VY: 110, // px/s downward speed of a load that drops through (it keeps the ship's own speed)
    COAL_REACH: 120, // px: a coal bunker this near an opening hatch (same deck) spills its stock down the chute (GOING DOWN! only: it counts as dumped weight)
    MASS: 0.8, // weight per 100 px of hatch (the leaves, the frame and the lever)
    TIP_VY: 80, // px/s a tipped raider leaves the deck with (they fall away; a deck below catches them)
    TIP_GRAV: 1500, // px/s^2 of a tipped raider
    TIP_HURT: 20, // hit points a raider loses landing on a deck below
    BAD_FALL: 1700, // a tipped raider this far below his deck is gone overboard
    BOT: {
      OPEN_FOR: 3.5, // a bot who opened the hatch keeps it open at least this long, then shuts it when nothing wants it open
      BELOW_X: 80, // an enemy ship counts as "directly below" when her deck reaches within this many px of the hatch (world x)
      BELOW_Y: 2600, // ...and she is no further below than this
      DROP_CHANCE: 1.6, // per minute, per think: the chance a quiet bot crew drops a crate on a ship directly below (Versus and gunship)
      TIP_MIN: 1, // raiders / boarders on the hatch needed before a bot pulls the lever (never with a crewman on it)
    },
  },
  // ---- S.5e: a ship needs only a gasbag and a deck to fly. Everything else is optional; what is missing just takes control away. ----
  // WIND: with no helm (or no engines, or no boiler) the ship simply DRIFTS with the wind. Speeds are shares of SHIP.TOP_SPEED (the throttle scale).
  WIND: {
    BASE: 0.22, // drift speed in a calm sky (about 120 px/s; the engines' idle cruise is 0.2, full ahead 1.0)
    ENV: { skyisles: 1, frost: 1.2, ember: 0.8, fungal: 0.35, aether: 1.3, storm: 1.7, sea: 1.45 }, // how windy each environment is (multiplies BASE and a sail's pull)
    CAVE: 0.45, // maps with rock walls and tunnels: sheltered, so the wind (and the sails) count for this much
    HAND_TRIM: 0.4, // a helm with no boiler is a hand wheel: its little up/down trim works at this share of its power (nothing is steam-powered)
  },
  // SAIL: a mast and canvas on the top deck or a nest. A crew member hauls it up (hold Action) or lets it down (tap); a raised sail catches the wind for extra forward speed.
  SAIL: {
    MAST_H: 250, WIDTH: 190, // the mast's height above its deck and the canvas width (px, the drawing; a part may set its own)
    BONUS: 0.13, // forward speed one fully raised sail adds (share of top speed) in a windless-neutral sky; times WIND.ENV (and WIND.CAVE on rock maps)
    BONUS_DIM: 0.8, // each further raised sail adds this share of the one before it (diminishing returns)
    HAUL_TIME: 3.2, // seconds of holding Action to haul a sail all the way up
    LOWER_TIME: 1.1, // seconds for a sail to drop once the crew taps Lower
    GUST_WARN: 3.5, // a storm gust due within this many seconds: a raised sail should be reefed now (the TV and phone say so)
    TEAR_CHANCE: 0.55, // a gust blowing on a raised sail tears it with this chance per second, times how high it is up (torn: broken module, mend it with a hammer)
    GUST_SHOVE: 0.5, // a gust also shoves a ship with her sails up this much harder (per fully raised sail, as a share of the shove)
    SPEED_RATE: 1.2, // how quickly the ship's speed follows the sails' pull (per second, as a share of the difference): the canvas fills, she gathers way
    REACH: 70, // how close to the mast a crew member must stand to work the sail (px)
    COLORS: ['#d9a86a', '#c97a5a', '#e0c070', '#b8a07a'], // canvas colours (the TV picks one per sail): warm, so a sail shows against the cream gasbag
    FORCE_ACC: 900, // S.5h: the wind's push on a raised sail, as a ship acceleration (px/s^2) per share of top speed its pull gives. It acts high up on the mast, so it tips her nose down (forces.js)
    GUST_FORCE: 2.5, // ...and a gust blows the push up this many times
  },
  // NEST (S.5e): the crow's nest may be cut in two, and a second higher tier (crow2) stands on a mast above it. Height buys a longer view, but weighs on the ship, is a bigger
  // target and catches the wind.
  NEST: {
    TIER_BONUS: 0.18, // a lookout / searchlight / gun on the high tier sees, lights and shoots this much further (warning time, beam length, shell life)
    GUST_PER_TIER: 0.2, // a storm gust shoves the ship this much harder per high tier she carries (share of the shove)
    MAST_CLEAR: 40, // the high nest sits at least this far inside the end of the nest it is climbed from (px)
  },
  // When the hull gives out the ship breaks apart and the whole game starts over at the mast.
  WRECK: {
    TIME: 8, // seconds of breaking apart before the restart
  },
  // "GOING DOWN!": the first time the hull hits 0 in a mission the ship does not break up at once. She FALLS for a while (goingDown.js) and the crew has to make her LIFT beat her
  // WEIGHT again - the real numbers of the flight (balance.js weight with the crew, coal, cargo and bombs aboard; the gasbags' lift by how much gas each holds; steam; engines pointing up).
  // The TV shows the two as a big balance bar. The ways: DUMP WEIGHT (shovel the loose cargo over the rail, drop the bombs, dump the coal bunker), PATCH the glowing gasbag leaks and PUMP
  // (a hand at the helm), FULL STEAM (stoke the boiler: hot gas lifts more, up-pointing engines push harder - but over-pressure blows the boiler, so VENT), or as a last resort CUT AWAY
  // a heavy section (hold Action at the marked joint: a break-off that stays lost until the sky-dock rebuilds it). Lift beating weight by MARGIN for HOLD seconds = "SHE HOLDS!";
  // otherwise she is wrecked as usual.
  GOING_DOWN: {
    ENABLED: true,
    TIME: 24, // seconds of falling (with 8 crew)
    TIME_PER_MISSING: 1.6, // extra seconds for each crew member under 8 (so 2 players get 6 x this more)
    SURVIVE_HULL: 15, // hull left when she holds
    HOLD_HULL: 2, // hull shown while she falls (nothing can hurt her meanwhile)
    GRACE: 5, // seconds nothing can hurt her after she holds
    LEVEL_GAS: 8, // gas above the neutral fill the bags are left with when she holds (a gentle climb, not a rocket)
    FALL_RATE: 62, // sinking speed (px/s) at the end of the fall with nothing done; it starts at FALL_START of this
    FALL_START: 0.45,
    FALL_BRAKE: 0.8, // her lift matching her weight takes this share off the sinking
    NOSE: 0.045, // extra nose-down tip while falling (radians)
    ENEMY_RATE: 0.12, // enemy spawn speed while she falls (1 = normal)
    START_GAS: 18, // the gas the torn bags are left with when she starts to fall (0..100; a bag fuller than this loses the difference)
    PUMP_MUL: 0.5, // the pump only gets this share of its gas into the torn bags
    MARGIN: 3, // her lift must beat her weight by this many points...
    HOLD: 2, // ...for this many seconds in a row to save her
    TRIM_LOSS: 14, // a lopsided ship spills lift: this many points lost per 100 px her centre of mass sits beyond BALANCE.LEVEL_PX from her centre of lift (dump evenly!)
    LEAKS_MIN: 1, // gasbag leaks that must be patched: 1 + crew / 4, within MIN..MAX
    LEAKS_MAX: 3,
    LEAK_MUL: 4, // each glowing leak loses this many times the normal gas per second (GAS.LEAK_PER_HOLE) until it is patched
    STEAM_LIFT: 28, // hot gas: lift points a boiler at full overdrive adds (0 at BOILER.OVERDRIVE_AT pressure, full at 100)
    STOKE_PRESS: 14, // a load of coal shovelled in while she falls kicks the pressure up this much at once (BOILER.WARN_AT starts the blowout chance - vent!)
    CARGO: { BASE: 1, PER_CREW: 0.6, MIN: 2, MAX: 8 }, // loose cargo (crates and sandbags) that shakes loose on her decks when she starts to fall: BASE + crew x PER_CREW loads, shovelled overboard (the SHOVEL job)
    DUMP: {
      COAL_WEIGHT: 10, // gas points the coal bunker's stock weighs: dumping it overboard takes this off her weight ...
      COAL_TIME: 1.6, // ... seconds of holding Action at the bunker; but then there is no coal to stoke with, and ...
      COAL_REFILL: 90, // ... the bunker stays empty for this many seconds after she holds (less fuel later: the boiler runs down)
      BOMB_TIME: 1.2, // seconds of holding Action at the bomb bay to let the whole bomb load go through the doors
    },
    CUT: {
      TIME: 3, // seconds of holding Action at a marked joint to cut the section away (the LAST resort: it stays lost until the sky-dock rebuilds it)
      MAX_JOINTS: 2, // marked joints (the heaviest sections that can go without taking the helm, boiler or a gasbag with them)
      MIN_MASS: 8, // a section lighter than this (gas points) is not worth cutting
      REACH: 80, // px within which Action reaches the joint
    },
    MATE_JOBS: ['shovel', 'vent'], // the job kinds a ship's mate takes besides MATES.JOBS while she falls (the mates dump cargo and vent steam too)
    STOKE_BELOW: 76, // bots (and the job arrows) stoke while the pressure is below this (so a load, STOKE_PRESS more, stays under BOILER.WARN_AT) ...
    VENT_AT: 86, // ... open a vent when it is this high (BOILER.WARN_AT blows the boiler) ...
    VENT_CLOSE: 74, // ... and close it again below this
    CUT_AT: 0.5, // bots cut a section away only when this share of the fall is gone and she is still short (the last resort)
  },
  // Spare gasbags: in a voyage a wreck is not final. Each wreck costs one spare, loses the stop's progress and a share
  // of the salvage, and the ship limps back to the previous stop. No spares left = the voyage ends.
  LIMP: {
    SPARES: 3,
    SALVAGE_LOSS: 0.3, // share of the salvage on board that is lost
    HULL: 50, // hull she is patched up to
    TIME: 7, // seconds of the break-up before she limps away (the "LIMPING HOME" card shows during it)
  },
  // PvP "Versus" (PVP.md, Phase V; B.4: two Ships in ONE World, pvp/match.js). OFF in the co-op game.
  // ENABLED is switched on by the lobby's Mode button (VERSUS) or the dev flag host.html?versus=1, and off again when the lobby goes back to a co-op mode.
  // THE SHIP GENERATOR (modules/host/shipGen.js; the combo finder is tools/shipforge.mjs; the build page's Random ship button and the Versus shelf's Surprise me use it): a valid
  // ship from nothing, seeded. A "theme" picks the hull and the loadout (long-range kiter, brawler, rammer ...); the numbers here are the generator's dials.
  SHIPGEN: {
    HOVER: [34, 52], // the gas level a generated ship hovers at: the bags are sized to her weight for a value in this range (the build gauge allows 25-70)
    TRIES: 8, // fresh genomes tried before a seed gives up (a ship that cannot be made valid is simply not returned)
    REPAIRS: 14, // repair passes per try (add a ladder, a boiler, drop the heaviest extra ...)
    HULL: { LOWER: [7, 14], MAIN_TRIM: [1, 3], CAT_TRIM: [0, 3], KEEL: [2, 4], NEST: [3, 4] }, // deck lengths in 120 px columns: the lower deck, how many columns shorter the main deck and the top deck are, the keel deck and the crow's nest
    KEEL_CHANCE: 0.22, OPEN_MAIN_CHANCE: 0.12, TALL_NEST_CHANCE: 0.15, NO_MAIN_CHANCE: 0.1, // a keel deck, an open-air main deck, an upper nest, a ship with no main deck at all
    TWIN_CHANCE: 0.1, BALLAST_CHANCE: 0.2, // a one-bag ship has a twin envelope, a sandbag aft
    NAME_MAX: 24, // longest ship name (characters)
    GAS: { // the gas of a generated ship's bags (config.GASES): the chance a theme takes hydrogen (heavy ones) or hot air (light ones); WILD = any ship may take one of the two at random
      hydrogen: { fortress: 0.45, brawler: 0.3, rammer: 0.3, bomber: 0.3, gunboat: 0.15, wildcard: 0.15 },
      hot: { skiff: 0.3, kiter: 0.1, sapper: 0.1 },
      WILD: 0.04,
    },
  },
  PVP: {
    ENABLED: false, // on = no pacing director, no AI enemies, no gunship, no limp-home spares, no co-op saves, the crew-size scaling is HANDICAP's (simulation.js, crewscale.js, voyage.js, shipSim.js read this)
    MODE: 'broadside', // how a round is won: 'broadside' (sink or wreck the other ship) or 'capture' (an enemy crewman holds Action at the helm CAPTURE_TIME s with no defender in reach: HELM TAKEN). A wreck ends a round in both
    WINS_NEEDED: 2, // rounds to win the match (best of three)
    ROUND_TIME: 360, // seconds: the round cap; on a timeout the ship with the higher hull % wins
    COUNT_IN: 3, // seconds both ships stay moored before CAST OFF
    FINALE: 4, // seconds the sky keeps running after the deciding blow (the wreck plays out) before the round is closed; under WRECK.TIME
    BETWEEN: 6, // seconds the scoreboard stays up between a closed round and the next count-in
    SHELF_TIME: 20, // seconds each team has to vote for its ship on the phones (the shelf), after CAST OFF in the lobby
    REMATCH_TIME: 25, // seconds the rematch vote on the phones lasts after the match winner is shown
    LOBBY_GAP: 2300, // in the lobby the blue ship moors this far AHEAD of the red one, so the two cards on the TV sit over their own ships (px)
    START_GAP: 8400, // centre-to-centre distance of the two ships at cast off (px; about 840 m, RANGE.PX_PER_M; just inside the widest view): the arena is big, they have to find each other; the left one starts on the map's start
    FACE_OFF: true, // the right-hand ship starts facing LEFT (a COME ABOUT's worth of bow turned already), so the two bows point at each other; false = both start bow-right
    SHELL_POWER: 0.12, // impact power of one crew shell on a rival ship (1 = one enemy bullet, 3 hull; the holes, fires and gas holes a hit may cause scale with it): a round of bot crews lasts about 100 s
    BOMB_POWER: 2, // impact power of a bomb dropped through a rival ship
    STANDOFF: 1900, // pilots (bots and the autopilot) hold this centre-to-centre distance from the rival (px): nose to nose at gun range (a classic hull is 2000 wide, shells fly 1520), the bow decks a hook's throw apart
    REF_HALF: 1025, // half the length of the classic hull (layout.bounds is 2050 wide): STANDOFF is the distance for two of them, a longer or shorter ship adds or takes off her own difference (px)
    APPROACH: 900, // px of range error for full throttle when holding the standoff
    ALT_EDGE: 150, // the rear ship holds this far above the rival, the lead ship this far below (px): the guns arc up and down, not only forward
    ROCK_MARGIN: 520, // pilots keep this far from rock (px)
    MAP_SEED: 7, // arena sky: the map seed of round 1 (+ the round number); both ships get the same sky
    MAP_KIND: 'open', // arena sky: 'open' (islands and hills) | 'network' | 'route'
    ENVIRONMENT: 'skyisles', // arena sky: which of the seven environments
    // THE ARENA (maps.js buildArenaMap): one big sky, the same on both sides (the left half is made, the right half is its mirror): hills, tall spires, floating islands and a hollow island on each side.
    // TOP_LEGACY = the ceiling above the map's start (px) the enemy gunship's captain keeps in CO-OP, where there is no arena wall (it was the old arena's top). SIZE = [cells wide, cells high] (a cell is MAPS.CELL px: 150 x 80 is 30000 x 16000 px, about five screens across at the widest zoom); ISLANDS = floating islands (each also set at its mirror image),
    // SPIRES = tall rock spires on the ground, POCKETS = hollow islands (a cavity with its mouth toward the middle) on each side, START_Y = the height the ships start at (share of the map's height from the top).
    // The WIND WALL is a rectangle: MARGIN px in from each side of the map, CEILING px from the top; a ship past it is pushed back (PUSH: px/s per px over, at most PUSH_MAX). The STORM closes that rectangle in on the middle
    // of the sky after AFTER seconds of fighting, taking TIME seconds to shrink to MIN_W x MIN_H px (the ships have to meet in the end), and a ship caught in the storm band is hurt (DAMAGE hull % a second).
    ARENA: { TOP_LEGACY: 3400, SIZE: [150, 80], ISLANDS: 14, SPIRES: 4, POCKETS: 1, PAD: 2, START_Y: 0.4, MARGIN: 1400, CEILING: 1600, PUSH: 0.9, PUSH_MAX: 420, STORM: { AFTER: 120, TIME: 170, MIN_W: 6400, MIN_H: 4400, DAMAGE: 0.4 } },
    // RANGE BANDS (centre to centre, px; RANGE.PX_PER_M px = 1 metre on the TV): SHORT is ramming, boarding and grapeshot; MID is the broadside guns; LONG is the long gun and the mortars. The captains
    // pick a preferred band from their style and their ship's guns (pvp/captainAI.js), the stats count the seconds spent in each (match.js), the TV shows the range.
    RANGE: { PX_PER_M: 10, SHORT: 2300, MID: 3800, LONG: 7000, HOLD: { short: 1900, mid: 2800, long: 5200 }, FAR_WORD: 9000 }, // (SHORT / MID / LONG are each band's upper limit, between the ships' aim points: a classic hull is 2000 wide, so under SHORT the hulls are nearly touching; a ship that likes a band holds HOLD px from the rival; FAR_WORD = the distance past which the TV says FAR APART in red)
    FIGHT: { HP: 4, SWORD: 2, SHOVE: 1, KNOCK: 70, KO_TIME: 8 }, // crew against crew on a deck: hit points of a crewman, what a sword blow and a shove take off, how far a blow knocks him back (px) and how long he is out cold at zero (s; a boarder is carried home)
    CAPTURE_TIME: 6, // seconds an enemy crewman holds Action at the rival's helm, with no defender in reach, to take it
    SABOTAGE_TIME: 3, // seconds an enemy crewman holds Action at the rival's boiler to start a fire and a steam leak
    DEFEND_REACH: 260, // px: a defender (a rival-team crewman on his own ship's helm deck, awake) this close to the helm stops a capture
    HAND_REACH: 80, // px: how close a boarder stands to the helm / the boiler to work it
    BOARD_RANGE: 1700, // bots look for a way across when the rival's middle is this close (px) and their own ship is calm
    TONNAGE: 1.15, // the shelf's weight cap: the classic ship's mass x this (shipBuild.js budgets mass: 150 x 1.15 = 172), the same for both teams
    SHELF: { RANDOM: 3, SEED: 11, CROSS: false, RANGE: true, CHAMPIONS: 4, SURPRISE: true }, // (CHAMPIONS: how many Hall-of-Fame ships of the ship forge (pvp/champions.js) stand on the shelf after the others; SURPRISE: a last card, Surprise me!, that gives each team a brand-new random ship from the generator (shipGen.js); RANGE: the Sniper, Brawler and Ram ships of the range bands are on the shelf after the variants; CROSS: also the Boarder's Barge, the cross-ship dev ship: host.html?versus=1&cross=1) random valid builds on the shelf (seeded mutations of the classic ship that validate and fit the cap) and their seed
    HANDICAP: { // crew-size scaling in Versus (replaces CREW_SCALE.TABLE): only the damage and collateral columns matter, and gently: a small crew takes a little less, a big one a little more
      1: { spawn: 1, count: 1, fire: 1, damage: 0.7, raiders: 1, hp: 1, spread: 0.8, collateral: 0.7 },
      2: { spawn: 1, count: 1, fire: 1, damage: 0.78, raiders: 1, hp: 1, spread: 0.85, collateral: 0.78 },
      4: { spawn: 1, count: 1, fire: 1, damage: 0.9, raiders: 1, hp: 1, spread: 0.93, collateral: 0.9 },
      6: { spawn: 1, count: 1, fire: 1, damage: 0.97, raiders: 1, hp: 1, spread: 0.98, collateral: 0.97 },
      8: { spawn: 1, count: 1, fire: 1, damage: 1, raiders: 1, hp: 1, spread: 1, collateral: 1 },
      12: { spawn: 1, count: 1, fire: 1, damage: 1.08, raiders: 1, hp: 1, spread: 1.05, collateral: 1.08 },
      16: { spawn: 1, count: 1, fire: 1, damage: 1.15, raiders: 1, hp: 1, spread: 1.1, collateral: 1.15 },
    },
    BOT: { // bot captains and crews (modules/host/pvp/captainAI.js flies; bots.js crews)
      RETREAT_HULL: 35, RETREAT_HOLES: 2, COVER_WEIGHT: 0.6, BEARING: 0.5, BOARD_CALM_HULL: 55, BOARD_CLOSE: 260, // pull away to repair under this hull % with more than RETREAT_HOLES holes, how strongly a rock between the ships is valued, the angle (rad) a rival gun must be within of pointing at us to count as "bearing", the hull % above which a crew is calm enough to board, and how much closer than the standoff (px) the captain brings her while a crewman is hooking across
      WEAVE: true, // the lively captain: irregular climbs, dives and surges, a dodge from shells flying at her hull, and a play (pass, ram, chase) picked by her style; false = the old steady standoff
      JINK: { ALT: [150, 650], EVERY: [0.9, 2.8], THR: [0.1, 0.4], THR_EVERY: [1.2, 3.4], RANGE: 420, RANGE_EVERY: [3, 7], EXCURSION: 0.2, EXCURSION_RANGE: 800, HOT: 0.55, LOW_GAS: 38, FLOOR: 350 }, // random weaving (no dives below LOW_GAS gas or within FLOOR px of the lowest safe altitude): how far (px) and how often (s) the wanted altitude jumps, the extra throttle (share of full) and how often it changes, the standoff she wanders by (px, every RANGE_EVERY s), the chance of a bigger lunge or fall-back of EXCURSION_RANGE px, and how much shorter the timers are while shells are flying at her (x HOT)
      DODGE: { ALT: 450, THR: 0.35, LOOK: 1.2, LOOK_LONG: 2.8, LONG_MUL: 1.7, HOLD: [0.9, 1.5], MIN_T: 0.1, EVERY: 0.1, COOLDOWN: 0.45 }, // shells aimed at her hull: the altitude jump away from the impact (px), the surge, how far ahead (s) a shell is followed, how long the dodge holds, the latest (s) a shell is still worth dodging, how often (s) the sky is scanned, and the pause between dodges
      PASS: { RATE: 0.05, CD: 20, MARGIN: -100, MIN_HULL: 45, MAX_DIST: 3400, ALIGN_TIME: 9, CROSS_TIME: 14, TURN_TIME: 9, END: 0.6, OVER_BOMB: 0.6 }, // a pass over or under the rival (a high pass with bombs, a dive-under, then come about to face her): chance per second (x style), the pause after one (s), the clear air between the outermost bounds of the hulls (px; negative: the nest and the belly pod are narrow, the hulls slide past with the bounds overlapping), the hull % and distance (px) it starts from, the longest each leg may take (s), how far past her (share of the standoff) she goes before turning, and how often it is the high pass with bombs when both ways are free
      RAM: { RATE: 0.05, THEIR_HULL: 50, EDGE: 15, MY_HULL: 45, TIME: 8, REACH: 2100, BACKOFF: 900, CD: 28 }, // a ram run at a weak rival: chance per second (x style), she must be under THEIR_HULL % and EDGE points weaker than us, we must have MY_HULL %, it gives up after TIME s, counts as a ram when the aim points are REACH px apart (the hulls touch at 1700-2000), and backs off BACKOFF px afterwards (for CD s no new run)
      CHASE: { HULL: 32, CLOSE: 650, MY_HULL: 40 }, // a rival under HULL % is chased: the standoff shrinks by CLOSE px while we have MY_HULL % or more
      MIN_GAP: 2000, // the closest she holds the rival in a duel, a grapple or a chase (px between the aim points of two classic hulls; they touch nose to nose at about 1700-2000: a ram run or a pass goes in anyway)
      TURN_BEHIND: 1.5, // seconds the rival must stay behind her bow before the captain comes about (co-op bots wait TURN.BOT_BEHIND)
      CALLOUT_GAP: 6, // seconds between TV call-outs for plays (a boarding or a ram may cut in after 2)
      // RANGE BANDS (pvp/captainAI.js chooseBand; PVP.md "Space and range"): each style likes a band (STYLES[..].band), but the captain also reads her SHIP: every gun that works in a band is points for it.
      // A band the ship has nothing to fight with (a sniper without a long gun or a mortar) is not chosen; the nearest one she can fight in is. The captain then holds PVP.RANGE.HOLD[band] from the rival.
      RANGE: {
        STYLE: 3, // points for the band the style likes
        LONG_GUN: 2, MORTAR: 1, // ... per long gun / mortar for LONG
        PLAIN: 0.35, FLAK: 0.2, // ... per ordinary broadside gun / flak gun for MID
        SCATTER: 1.2, HARPOON: 1.2, RAM: 3, // ... per grapeshot gun / harpoon gun / a ram prow for SHORT
        KITE_AT: 0.72, KITE_TIME: [7, 13], KITE_CD: 9, // a long-band ship closed on to this share of her hold turns tail and runs (KITE) for KITE_TIME s, then at least KITE_CD s before the next run
        HOLD_JITTER: 350, // how far (px) the hold wanders from the band's middle, and the extra she keeps from the storm wall
      },
      MINES: { RETREAT: true, CLOSING_BAND: 1.25, AWAY: 150, EVERY: 3.2, WINDOW: 1.4, MAX_DIST: 6800, AVOID: { LOOK: 1500, SPEED_LOOK: 1.6, MARGIN: 260 } }, // when the captain wants a mine field laid (captain.mines, read by bots.js): only while she is moving AWAY from the rival (faster than AWAY px/s: a field dropped on the spot would be her own hazard), while she retreats or runs from a chaser (RETREAT), or holds the long band with the rival inside CLOSING_BAND x her hold; the rival must be within MAX_DIST; the wish comes in a WINDOW (s) once every EVERY s (about one mine each); AVOID: she steers over or under mines in the box LOOK px (+ SPEED_LOOK s of speed) ahead, MARGIN px clear
      ROUTE: { SHUT: 100, OPEN: 90, EVERY: 30, STEPS: 9, SLOW: 700, IDLE: 150 }, // a rock island between the ships for SHUT steps (60 a second), or IDLE steps of going nowhere while far from her: the captain follows the map's route round it (a waypoint STEPS cells along, worked out every EVERY steps; full speed beyond SLOW px from it) until the line has been clear OPEN steps
      LOS: { AFTER: 2.5, HOLD: 6, RESET: 3, TRY: [-700, 700, -1400, 1400, -2100, 2100, -3000, 3000] }, // a rock island on the line between the ships for AFTER s: the captain (not a hurt or losing one, who hides on purpose) shifts her height to the nearest of TRY px (world y, + = lower) where the line is open and keeps it HOLD s; the shift is dropped once the line has stayed open RESET s
      HARPOON: { MIN_HULL: 40, CD: 25, GRAPPLE_TIME: 10 }, // a captain with the harpoon fires it once her hull is over MIN_HULL, then waits CD s; once it latches she presses in (GRAPPLE) for GRAPPLE_TIME s
      RAMPROW: { RATE_MUL: 4, THEIR_HULL: 101, EDGE: -100, MY_HULL: 28, REACH: 3600 }, // with a ram prow the ram run is flown against any rival (not only a weak one): the chance is x RATE_MUL, the hull rules loosen
      RAID: { CHANCE_PER_MIN: 7, BOOST: 5, COOLDOWN: 9, MAX: 2, MIN_HULL: 26, KEEP: 3, BUSY: 0.6, DROP_REACH: 1250, DROP_BELOW: 120, GRAPPLE: 0.03, GRAPPLE_TIME: [8, 14], GRAPPLE_CLOSE: 420 }, // crew going across (hookshot or parachute): chance per idle bot per minute (x style), x BOOST when a deck is in reach, the pause after a raid (s), raiders at once, the lowest hull % it still dares from, the crew that must stay home (and the helm, a gun and a lit boiler), the chance a busy hand goes anyway, the parachute drop's sideways reach (px) and how far below the bay floor her deck must be; and the captain's "grapple": chance per second (x style) to close in for GRAPPLE_TIME s, GRAPPLE_CLOSE px inside the standoff, so the decks are in hook range
      STYLE: null, // a style name here puts every captain in it (tests); null = rolled at random for each ship each round
      BOMB: { LOOK: 2.4, STEP: 0.05 }, // the bombardier drops when a bomb let go now would pass through her hull: how many seconds of fall are followed and the step (s)
      STYLES: { // captain personalities (the gunship captains' aggressive / cautious / boarder, plus a daredevil): picked at random for each ship each round by WEIGHT; stand = standoff change (x STANDOFF), jink = weave size, pass / ram / raid = how keen on those plays, bomb = chance of bombing runs, dodge = how readily she dodges
        brawler: { WEIGHT: 3, band: 'mid', stand: -0.12, jink: 0.9, pass: 0.7, ram: 1.4, raid: 1.2, bomb: 0.6, dodge: 0.8, harpoon: 1 },
        sniper: { WEIGHT: 2, band: 'long', stand: 0.14, jink: 1.25, pass: 0.4, ram: 0, raid: 0.3, bomb: 0.2, dodge: 1.2, harpoon: 0 },
        boarder: { WEIGHT: 2, band: 'short', stand: -0.28, jink: 0.8, pass: 0.6, ram: 0.3, raid: 3, bomb: 0.2, dodge: 0.9, harpoon: 2 },
        daredevil: { WEIGHT: 2, band: 'short', stand: -0.06, jink: 1.5, pass: 2, ram: 1.6, raid: 2.2, bomb: 1, dodge: 1, harpoon: 1.5 },
      },
    },
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
  // Bundled fonts (public/fonts/, @font-face in host.html / controller.html; nothing from the internet).
  // DISPLAY (Limelight, Art Deco, one weight only) = titles, shouts, popups, big numbers.
  // TEXT (Libre Baskerville, weights 400-700) = labels and body text.
  FONTS: {
    DISPLAY: "'Limelight', Georgia, serif",
    TEXT: "'Libre Baskerville', Georgia, serif",
  },
  // "Captain's logbook" HUD: cream paper panels, warm-brown ink, brass corner pins, red stamp warnings.
  LOGBOOK: {
    PAPER: '#f3ead6', PAPER_SHADE: '#e4d7b8', RULE: 'rgba(107,74,50,0.16)', // panel fill / lower band / faint ruled lines
    INK: '#3a2c20', INK_SOFT: '#6b4a32', // text and border (warm brown), secondary text
    BORDER: 2.5, PIN: '#c9a85a', PIN_DARK: '#8a6c2e', // brass corner pins
    STAMP: '#a8443f', STAMP_BG: 'rgba(243,234,214,0.92)', // red ink for warnings and alarm banners
    SHADOW: 'rgba(43,34,22,0.28)',
  },
  // PvP look (modules/host/pvp/pvpArt.js: the flag, the two-sided hull bars, the "!" over an enemy). Soft faded team colours, logbook style.
  PVP_ART: {
    RED: '#c4574d', RED_DARK: '#8f3a34', RED_PALE: '#e8b7ae', // team red: flag / bar / outline / light tint
    BLUE: '#4d7fb3', BLUE_DARK: '#34577d', BLUE_PALE: '#b3cbe3',
    CAMERA: {
      MARGIN_X: 240, MARGIN_Y: 120, // empty sky kept round the two ships (world pixels)
      PAD_Y: 90, // sky kept above and below each ship (as the co-op camera)
      CREW_H: 130, MIN_CREW_PX: 21, // a crew member is about this tall in the world; never zoom out past this many screen pixels (readable from the sofa). Keep minZoom >= 0.16: below it shipArt's bake (scale floor 0.2) re-bakes every frame
      SMOOTHING: 2.0, ZOOM_IN: 0.7, ZOOM_OUT: 2.0, // pan speed; zoom speed in (calm) and out (quicker, so a ship never slips off screen)
    },
    PENNANT: { POLE: 100, LEN: 150, HEIGHT: 56, WAVE: 0.2 }, // the team flag on a pole above each gasbag (world pixels)
    HUD: { Y: 24, W: 470, H: 104, BAR_W: 360, BAR_H: 22, LOW: 35 }, // the two side panels on the 1600x900 stage
    BANG: { SIZE: 30 }, // the "!" over an enemy on your deck (world pixels)
  },
  // Several airships on one TV (B.3: fleetArt.js, ships.js teamOf, render.js). With ONE ship none of this is drawn.
  FLEET: {
    TEAMS: { // a ship's side, soft faded colours like PVP_ART: color = pennant / panel band / arrows, trim = the stripe on her hull and gasbag, dark = outlines, pale = light tint
      red: { name: 'RED', color: '#c4574d', trim: '#a13f38', dark: '#8f3a34', pale: '#e8b7ae' },
      blue: { name: 'BLUE', color: '#4d7fb3', trim: '#3a6492', dark: '#34577d', pale: '#b3cbe3' },
      green: { name: 'GREEN', color: '#5f9a5a', trim: '#47793f', dark: '#3b6236', pale: '#bcd9b3' },
      gold: { name: 'GOLD', color: '#d2a53d', trim: '#a8801f', dark: '#7a5a14', pale: '#ecd9a0' },
      brass: { name: 'CREW', color: '#b59a5a', trim: '#8a6c2e', dark: '#6b5424', pale: '#e8dcb4' }, // no team: the edge arrows and panel band of a ship that has none
      enemy: { name: 'GUNSHIP', color: '#8c2f2f', trim: '#4a4346', dark: '#2f2326', pale: '#c9706a' }, // the enemy gunship as a ship (B.5, gunshipShip.js): oxblood, charcoal and iron
    },
    DEV_TEAMS: ['red', 'blue', 'green'], // host.html?teams=1 and botsim --teams: ship 1, 2, 3 take these in turn
    PANEL: { W: 238, H: 116, GAP: 8, Y: 8, CENTER: 870 }, // the compact logbook panel of each ship, on the 1600x900 stage, in a row centred on CENTER (between the big panel and the minimap)
    TRIM: { HULL: 9, BELT: 0.1, BELT_AT: 0.3 }, // team trim: the stripe along the hull (ship px thick); the belt round the gasbag (share of its width, where along it: share of its half width)
    CREW_BAND: 6, // px (ship units) of team-coloured scarf band on a crewman's marker
    ARROW_PAD: 46, // px from the screen edge where the arrow to an off-screen ship sits
  },
  // Outline weights (Style 2026, see art/ART_SPEC.md).
  OUTLINE: { MAIN: 3.4, SMALL: 2.5, SHIP: 4 },
  // GIANT CREATURES (modules/host/creature.js = the generic puppet body, creatures/kraken.js = the Kraken's data, creatureArt.js = its drawing; see BOSSES.md).
  // Limbs are chains of rigid segments chasing a goal point (FABRIK). The goal moves on a STEPPED clock (STEP_FPS keys a second, held in between);
  // there is no sine wobble anywhere: a pose is held, then snaps (the picture only eases toward the held pose).
  CREATURES: {
    STEP_FPS: 8, // pose keys per second: the goal pose changes only on these beats
    ANTICIPATION: 0.4, // s a limb pulls back before it strikes (rounded to whole keys: 0.4 s = 3 keys)
    PULL_BACK: 0.45, PULL_LIFT: 0.35, // the wind-up: the tip draws back from the target by this share of the limb's reach, and rears up by this share
    HOLD: 0.9, // s a strike is held on its target before the limb recovers
    GRIP_SNAP: 70, // px: a seizing tentacle counts as gripped when its tip is this close to the grip point (or after GRIP_KEYS keys)
    GRIP_KEYS: 8,
    EASE: { IDLE: 5, SNAP: 40, MOUTH: 14, BREATH: 12 }, // how fast (per second) the picture eases to the held pose: lazy for sway, quick for a strike
    IK: { ITER: 2, GRIP_ITER: 6, GUIDE: 0.35 }, // FABRIK passes per frame (a glued grip gets more); GUIDE = how hard each joint is nudged toward the limb's curved shape first
    SWAY: { EVERY_KEYS: 6, AMOUNT: 0.18 }, // idle sway: a new rest-pose offset every EVERY_KEYS keys, up to AMOUNT of the limb's reach (stepped, never a sine)
    BREATH: { EVERY_KEYS: 12, AMOUNT: 0.025 }, // idle breathing: the mantle holds, snaps 2.5% bigger, holds, snaps back (a 2-key hold-and-snap)
    HIT_FLASH: 0.15, // s a hit part shows its white flash
    // ---- in the real game (creatureSystem.js, C.1) ----
    DEV_SPAWN: null, // dev flag: 'kraken' spawns that creature at the start of every mission (host.html?creature=kraken, tools/botsim.mjs --creature kraken). null = no creature, nothing changes
    SEED: 4242, // the creature system's own seeded random numbers (never the world's Math.random, so a run without a creature is untouched)
    SPAWN: {
      STANDOFF: 2300, // px ahead of the ship's middle (to the creature's centre) where it holds station: the nearest limbs reach her and her bow guns (about 1500 px of range) reach its body
      FOLLOW: 0.8, // per second: how quickly it catches up with that spot as she flies on (it swims along with her)
      BELOW: 1000, // px below the ship's middle that the body's centre sits (the mantle sits 650 above that, about level with her hull; the limbs' roots 650 below)
      GROUND_CLEAR: 900, // px the body's centre keeps above the first rock below the ship at its limbs' roots (they are 650 below it): shells die in rock, so it stands clear of cliffs and the ground
      SEA_RISE: 500, // in the Sunken Sea the body's centre sits this far above the sea line (the limbs' roots then sit just under it, as on the dev page)
      DEEP: 3600, // px under its station that it starts (and sinks to when it dies)
      SURFACE_TIME: 6, // s it takes to rise to its station (untouchable meanwhile)
      SINK_TIME: 7, // s it takes to sink when it dies
    },
    // The placeholder behaviour until the real fight (C.3): threatening reaches at the ship, the beak opening on a timer.
    BEHAVE: { REACH_EVERY: 4, REACH_JITTER: 0.4, FIRST_REACH: 2, REACH_SHORT: 0.92, MOUTH_AFTER: 3 }, // s between reaches (+- share), s to the first, share of a limb's reach it stretches to, s after surfacing before the beak starts opening
    // ---- the attacks (creatureGrip.js, C.2) ----
    // GRAB: a tentacle rears beside the ship (WINDUP, with a TV banner and a phone warning), seizes the nearest reachable deck end (the tip is glued to that point of the ship, so the picture and the physics
    // agree), and drags her down and toward it with a one-sided spring (the way towing.js pulls: a shove on her speed and climb, clamped to MAX_ACC) and a twist at the grip (forces.js 'grab'). After TIME the grip RIPS
    // that section off (ship.sim.breakOff), unless the crew got free first: a sword or hammer HACK at the grip point, shells / flame / the coil on the gripping tentacle, or cutting the tentacle off.
    GRIPS_BY_CREW: [[1, 1], [6, 2], [12, 3]], // [crew from, grips at once]: one under 6 crew, two for 6-11, three for 12 and more
    GRIP: {
      TIME: 9, TIME_BY_DIFF: { easy: 1.35, normal: 1, veteran: 0.9, hard: 0.8 }, // s the grip holds before it rips a section off (x the difficulty's number)
      FIRST: 8, EVERY: 24, EVERY_BY_DIFF: { easy: 1.4, normal: 1, veteran: 0.85, hard: 0.7 }, JITTER: 0.25, SPREAD: 3, // s from rising to the first grab; s between grabs (x difficulty, +- JITTER); s before the next of several grips at once
      COOLDOWN: 4, RECOIL: 1.2, // s a limb that let go keeps away from the ship; s it snaps back before it is idle again
      WINDUP: 1.1, WARN_REACH: 450, SEIZE_MAX: 2.5, // s the limb rears before it strikes (it pulls back 0.4 s more first: about 1.6 s of warning in all); px: crew this close to the spot (same deck) get the buzz; s the strike may take before the grip counts
      REACH_SHARE: 0.95, SEP: 180, MIN_DECK: 300, // a limb grabs only a point within this share of its reach; grip points at least this far apart; only decks at least this long are gripped (px)
      BASE_ACC: 300, K: 0.1, MAX_ACC: 450, MAX_TOTAL: 800, SLACK: 0.75, SIDEWAYS: 0.25, RAMP: 0.8, // px/s^2 of pull each grip always has (mostly DOWN, toward the sea), per px the limb is stretched past SLACK x its reach, the most one grip may pull (like a tow's MAX_ACC), the most all the grips together may (so the pull grows with the grips but she can still fight it with lift and steam); the pull's sideways share (toward the creature); s to build up
      TORQUE: 0.35, SHAKE: 0.18, SHOVE_POWER: 2.2, // multiplies the force that twists her (and FORCES.GAIN.grab); screen shake while it holds; the stagger power crew on outside decks get when it seizes (airborne.js shove)
      CUT_REACH: 180, SWORD_TIME: 1.5, HAMMER_TIME: 2.6, BLOWS: 3, HAMMER_BLOW: 0.6, BLOW_HOLD: 1.6, // px from the grip point within which a sword (or hammer) hack works; s of holding Action; ATTACK blows with a sword; a hammer blow is worth this share of one; s a blow keeps the hack from wearing off
      RELEASE_DMG: 0.3, // share of the tentacle's health that shells / the coil on it must take (since it seized) to make it let go; flame makes it let go at once
      WRAP: { SEGS: 4, TURNS: 1, START_TURNS: 0.3, KEYS: 6, LIFT: 70, UNDER: 35, MIN_RY: 150, PITCH: 420, N: 20 }, // the coil round the hull: the outer SEGS segments follow a helix of TURNS turns (it tightens from START_TURNS in KEYS key steps, 8 a second): over the deck LIFT px above the grip point, under the keel UNDER px below the lowest deck, at least MIN_RY px from the middle of the loop, PITCH px along the ship per turn, N points to the path
      RIP: { REACH: 230, LEN: 260, HULL: 70 }, // the rip: ship.sim.breakOff({ kind: 'limb' }) at the grip point (its reach, how much deck goes); a ship with nothing to break takes a hull blow of this power instead (damageHull: x the difficulty and crew damage scale, about 15 hull on Normal)
    },
    // BREACH: the Kraken dives out of sight, a dark shadow and ripples slide under the ship (WARN s: "IT'S UNDER US! CLIMB!"), then it lunges up out of the sea and SMASHES into the hull like a great white. It is open (heart and beak,
    // shots do BONUS x) for EXPOSE s while it hangs in the air; it falls back in with a huge splash. A ship that has climbed REACH px clear of the water (keel gap), or is not in the shadow, is missed.
    BREACH: {
      FIRST: 25, EVERY: 30, JITTER: 0.2, GRACE: 6, // s after rising to the first breach; between breaches (x GRIP.EVERY_BY_DIFF); s of peace for grabs and slaps afterwards
      DIVE: 1.3, WARN: 2.2, LOCK: 0.7, RISE: 0.9, HOLD: 0.3, FALL: 1.3, RETURN: 2, // s: sinking away, the shadow's telegraph, before the lunge the shadow stops following (it aims where she will be), up out of the water, hanging at the top, falling back, swimming back to its place
      SHADOW_SPEED: 1500, SHADOW_W: 1800, // px/s the shadow slides toward her; px wide (the TV's dark ellipse and the hit zone's centre)
      HALF_W: 650, REACH: 800, APEX_UP: 300, HIT_AT: 0.8, // the hit zone: her middle within this many px of the shadow; the keel must be less than REACH px above the water to be hit; px the body's centre ends above its usual place; share of RISE when it meets the hull
      EXPOSE: 1.5, EXPOSE_AT: 0.55, BONUS: 2.5, // s the heart and beak are open, from this share of RISE; damage multiplier on everything while it is
      HULL: 60, POWER: 3, KICK_UP: 260, KICK_X: 140, SHOVE: 3, // hull blow (damageHull power: about 13 hull on Normal), forces.js kick power, px/s up and sideways she is flung, airborne.js shove power
      HURT_R: 900, CORE_R: 200, FLING: 380, // px from the impact: crew lose a heart / are knocked out (BIG hit) / thrown off their feet at this speed (px/s)
      BREAK_CHANCE: { easy: 0, normal: 0.15, veteran: 0.4, hard: 0.6 }, // chance by difficulty that the blow also tears a section off (breakOff)
    },
    // SLAP: a tentacle rears high over the top deck (WINDUP), then whips along it. Crew there lose HEARTS and, unless they sit at a station, are flung off; a jump clears it.
    SLAP: {
      FIRST: 16, EVERY: 30, JITTER: 0.25, COOLDOWN: 4, // s after rising to the first slap; between slaps (x GRIP.EVERY_BY_DIFF); a limb's rest afterwards
      WINDUP: 1.3, WHIP_DELAY: 0.6, RISE: 900, // s the limb rears; s from the whip command until it lands (the pull-back and the snap); px above the deck it rears
      HEARTS: 1, VX: 520, VY: 340, DUCK_JZ: 45, // hearts a slap takes (never a one-shot); px/s the shove flings a crewman along the deck and up; a crewman hopping higher than this over the deck (px) clears it
      HULL: 12, POWER: 2, // hull damage power (damageHull, before the difficulty scale: about 2-3 hull on Normal) and forces.js kick power of the blow
    },
    // BOARDING: the surfaced mantle is a landing place (air.addProvider, like a rival's decks) and every part is a hookshot anchor. A boarder keeps his ship but stands on the mantle (player.on) and is carried by it.
    BOARD: {
      LAND_HALF: 380, HOOK_R: 40, // px: the landing strip is this wide each side of the top of the mantle; px added to the hook's reach for the parts
      WALK: 300, JUMP_VX: 380, JUMP_VY: 560, // px/s a boarder walks along the mantle's outline; px/s he leaps off the creature with (toward the ship, and up)
      EYE_REACH: 520, BLIND_TIME: 6, BLIND_FOR: 45, BLIND_RATE: 0.5, // px from an eye within which BLIND IT works; s of holding Action; s the eye stays blind; each blind eye multiplies the grab rate by this
      HEART_REACH: 700, HEART_TIME: 8, HEART_DMG: 150, HEART_EXPOSED: false, // px from the heart for STRIKE THE HEART (sword, hold); s of holding; its damage (the pool takes POOL.heart x this); dev flag: the heart starts exposed (C.3 decides when it is)
    },
    // HARPOON / TOW: the harpoon gun (towing.js fireHarpoon) can hook a creature part. The line reels in (GUN_TYPES.harpoon: REEL, K, MAX_ACC, SNAP), the ship takes SHIP_SHARE of the pull and the creature (it is heavy) the rest, slowly.
    TOW: { SHIP_SHARE: 0.85, MIN_LEN: 600, CREATURE_MAX: 90, CREATURE_DRAG: 0.8, CUT_REACH: 120, HIT_R: 30 }, // share of the pull the ship takes; px the line reels in to; px/s the most the creature can be hauled; its 1/s drag; px a sword cuts the line from its end; px added to the ray test
    // What hurts it and how much. Damage is in "creature hit points": a shell does GUNS.DAMAGE x SHELL_MUL. POOL says how much of a blow to a part also comes off the health pool (HP below).
    // A tentacle at 0 hp is SEVERED where it was hit; the other parts floor at 0 (they stay as targets). Part hp and the pool scale with crewMul('hp') x the difficulty's gunHp.
    HURT: {
      SHELL_MUL: 12, // a crew shell (x prime, x spotted) is worth this many times GUNS.DAMAGE against it
      FLAME_DPS: 34, // hp a second off every part inside the flame's cone
      COIL: 6, // x COIL.DAMAGE (at charge) to each part the bolt crosses
      BOMB: 40, MOUTH_BOMB: 60, BOMB_RADIUS: 260, BOMB_SPLASH: 0.5, // our bomb: a hit on a part, the share the other parts in the radius take; in an OPEN beak MOUTH_BOMB instead (a closed beak takes nothing: the bomb falls on through)
      CARGO: 14, CARGO_MOUTH: 0.5, // a thrown crate or sandbag: to the part it hits; in an open beak this share of MOUTH_BOMB (half a bomb)
      MINE: 70, MINE_RADIUS: 300, // a laid mine going off within MINE_RADIUS (px) of a part (the nearer the harder: down to half at the edge)
      TOUCH: 14, // px added to a shell's or a thrown load's radius for the hit test
      POOL: { tentacle: 0.5, mantle: 0.6, eye: 1, mouth: 2, heart: 3 }, // share of a blow that also comes off the pool
      PART_HP_MUL: { tentacle: 1, mantle: 1, eye: 1, mouth: 1, heart: 1, pool: 1 }, // tuning knobs on the data's hp (config.CREATURES.KRAKEN)
    },
    REWARD_MUL: 3, // salvage for a dead creature: SALVAGE.BOSS times this
    DARK_AT: 0.35, // the sky counts as dark (parts dim unless a searchlight has them) above this searchlight darkNow
    CHUNK: { LIFE: 6, GRAVITY: 2600, SPIN: 2.4, KICK: 300, MAX: 12 }, // a severed limb tumbling away: seconds it lasts, px/s^2, spin and sideways kick (rad/s, px/s), pieces kept
    SINK_CLIP: 70, // px below the sea line at which the Kraken is hidden (it rises out of the water)
    ART: {
      INK_W: 14, // ink outline weight in WORLD px (a creature is drawn zoomed far out, so it is much thicker than OUTLINE.MAIN)
      SS: 1, MIN_SCALE: 0.03, MAX_SCALE: 0.7, // segment pictures are baked at the screen scale x SS, kept between these (bucketed in half octaves)
      DIM: 0.6, FLASH: 0.65, // how far fills mix toward night-blue when a part is not lit / toward white on a hit flash
      BUCKETS_KEPT: 3, // baked zoom levels kept before the oldest is dropped
    },
    KRAKEN: {
      HP: 1200, // the health pool (the slow, safe way to win)
      TENTACLES: 6, SEGS: 8, // limbs and rigid segments per limb
      LEN: [430, 270], // segment length root -> tip (px, linear taper): a limb is about 2800 px, a bit over the ship's length
      R: [140, 28], // segment radius root -> tip (px, geometric taper)
      ROOT_X: [-700, -450, -180, 180, 450, 700], ROOT_Y: 650, // where each limb starts, on the body (px; the mantle's centre is the origin)
      FRONT: [0, 5], // limb numbers drawn in front of the head (the rest behind it)
      REST: [0.75, 0.6, 0.8, 0.8, 0.6, 0.75], FAN: 1.3, // idle pose: how far (share of reach) each limb rests, and the widest lean from straight up (rad)
      BEND: 0.7, // how far a limb arches (0 = straight); it always arches upward out of the sea
      MANTLE: { AT: [0, -650], LEN: 900, R: 620, LEAN: 0.12, HP: 300 },
      EYES: { AT: [[-380, 120], [400, 150]], R: 105, HP: 60 },
      MOUTH: { AT: [0, 330], R: 230, HP: 150, EVERY: 9, OPEN_FOR: 3 }, // the beak opens for OPEN_FOR s every EVERY s (the demo puppet's timer)
      HEART: { AT: [0, -300], R: 130, HP: 200 },
      TENTACLE_HP: 120,
    },
  },
  // Effects in the storybook gouache style (modules/host/vfxArt.js): flat colours, ink from INK + OUTLINE, no gradients.
  VFX: {
    CHARCOAL: '#3a302c', ORANGE: '#f08a3c', CREAM: '#fff2cf', GOLD: '#f2c14e', // explosion rim / body / core, primed-shell ring
    SMOKE: '#9a9490', STEAM: '#ffffff', // smoke grey (puffs are mixed halfway toward it); steam is pure white with no ink
    FIRE_OUT: '#f08a3c', FIRE_IN: '#ffd35c', // flat flame: body and heart
    TICK_SECS: 0.15, // how long the comic ink ticks stay on an impact
  },
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
    skyisles: { name: 'Sky Isles', DARK: 0, favour: { swarm: 1, imps: 1, bombers: 1, strafers: 1, gunship: 1 } },
    // STORM FRONT: dark slate cloud and rain. Wind gusts shove the ship; lightning CHARGES for a few seconds
    // (warning) and strikes the top deck unless a crew member holds Action at a lightning rod (grounded).
    // A manned Lightning Coil drinks a grounded bolt (instantly full charge). (rules: envStormSea.js)
    storm: {
      name: 'Storm Front',
      DARK: 0.72, // searchlights (searchlight.js): how dark this environment is, 0 (daylight) .. 1 (pitch black). A night storm.
      favour: { swarm: 0.6, imps: 0.6, bombers: 0.7, strafers: 2.6, gunship: 1 }, // storm riders (dogfighters)
      sky: ['1c2230', '3a4660', '6d7a90'], sun: '150,170,205', ridgeHaze: '70,82,104',
      rock: '#566176', rockStripes: ['rgba(14,18,30,.3)', 'rgba(170,190,225,.16)'], rockHaze: 'rgba(80,92,116,.22)',
      rim: 'rgba(190,210,240,.55)', edgeDark: '#3a4558', edgeLight: '#8fa6c8',
      cave: ['#161c2a', '#2f3a52'], pillar: '10,14,24', fog: '84,96,120', shaft: '170,190,230',
      ridges: [
        { f: 0.02, base: 0.86, amp: 190, freq: 0.003, color: '#46526a', snow: null },
        { f: 0.045, base: 0.92, amp: 130, freq: 0.004, color: '#363f55', snow: null },
        { f: 0.1, base: 0.98, amp: 100, freq: 0.007, color: '#262d40', snow: null },
      ],
      strafer: { body: '#4a5676', trim: '#d8e24a' }, // storm riders
      WEATHER: { // overrides of config.STORM while the mission is a Storm Front (weather.js)
        STRIKE_CHANCE: 0, // (the rod system below makes the strikes)
        GUST_EVERY_MIN: 8, GUST_EVERY_MAX: 14, GUST_TIME: 2.0, GUST_MIN: 45, GUST_MAX: 90, // up/down shove (px/s of altitude)
        BOLT_EVERY_MIN: 2.5, BOLT_EVERY_MAX: 5, // frequent flashes (distant bolts)
      },
      WIND: 90, // px/s the gust also shoves the ship along the course (forward or back)
      RAIN: { COUNT: 150, SLANT: 30, WIND_SLANT: 0.9, ALPHA: 0.5 }, // rain slants by the wind
      ROD: {
        SPOTS: [{ p: 'catwalk', x: 450 }, { p: 'catwalk', x: 1130 }], // lightning rods on the top deck (either one held grounds a bolt)
        FIRST: 24, EVERY_MIN: 24, EVERY_MAX: 36, // seconds before the first strike warning, then between them
        WARN: 4.5, // seconds a bolt charges before it hits
        HOLD_GRACE: 0.3, // a rod counts as held this long after the last frame the button was down
        POWER: 1.3, // how hard an un-grounded strike hits (1 = one enemy bullet): module damage, dents
        MAX_FIRES: 6, // an un-grounded strike starts a fire unless this many burn already
      },
    },
    // SUNKEN SEA: an ocean at the bottom of every map. Skimming it scrapes the hull and floods the lower deck
    // (pump it out at the Bilge Pump). Waterspouts pull the ship in. Survivors bob on wreckage: fly low, a
    // crew member holds Action at the winch in the bomb bay to haul them up for salvage. (rules: envStormSea.js)
    sea: {
      name: 'Sunken Sea',
      DARK: 0, // (a hint of gloom under the waterspouts)
      favour: { swarm: 0.8, imps: 0.7, bombers: 2.0, strafers: 0.9, gunship: 1 }, // bombers (flak ships later)
      sky: ['4d93b8', 'a6d3e0', 'e9f4ee'], sun: '255,246,214', ridgeHaze: '196,226,230',
      rock: '#5d6b66', rockStripes: ['rgba(14,30,34,.26)', 'rgba(220,240,230,.2)'], rockHaze: 'rgba(160,205,215,.22)',
      rim: 'rgba(230,248,240,.65)', edgeDark: '#6f7f6e', edgeLight: '#d9e8b4',
      cave: ['#2a4650', '#5a8a92'], pillar: '16,34,40', fog: '190,224,230', shaft: '230,248,255',
      ridges: [
        { f: 0.02, base: 0.86, amp: 150, freq: 0.003, color: '#7fb0b8', snow: null },
        { f: 0.045, base: 0.92, amp: 110, freq: 0.004, color: '#5f98a2', snow: null },
        { f: 0.1, base: 0.98, amp: 90, freq: 0.007, color: '#437a86', snow: null },
      ],
      SEA: {
        PATH_PCT: 0.92, // the surface is set from the route the ship flies: this share of the route is higher than the waves' skim line...
        MARGIN: 150, // ...plus this much clearance (px) - so the lowest ~40% of the route dips the keel in the water if the helm follows it exactly
        OPEN_SHARE: 0.5, ROWS_MIN: 3, ROWS_MAX: 40, // (fallback if a map has no route) the surface sits where this share of columns has open sky below; always 3-40 map rows (200 px each) deep
        KEEL: 420, // the ship's underside is this far below her reference point (px)
        SKIM: 25, // the keel touches the waves this far above the surface (px)
        COLOR: ['#3fa3bd', '#1f6f8f', '#0e3d5a'], FOAM: '#f4fbff', WAVE_AMP: 14, // wave height (px; waves roll along fixed positions)
        WRECKS: { EVERY: 2600, CHANCE: 0.45 }, // sunken hulls poking out of the water, on a fixed grid
        GULLS: 7, // gulls wheeling over the water
      },
      FLOOD: {
        RATE: 0.11, // flood level (0-1) gained per second while the keel is in the water
        SCRAPE_EVERY: 2, SCRAPE_HULL: 0.6, // seconds between scrapes while in the water, and hull damage each
        PUMP_X: 760, PUMP_RATE: 0.2, // the Bilge Pump (lower deck): flood level pumped out per second while someone holds Action
        DRAIN: 0.003, // the water seeps out slowly by itself
        SINK: 9, // a fully flooded ship needs this many more gas points to hover (she sinks)
        SLOW_SHIP: 0.4, // ...and loses this share of her speed
        SLOW_CREW: 0.55, // crew on the lower decks lose this share of walking speed when fully flooded
        CRITICAL: 0.9, CRITICAL_HULL: 0.8, // above this level she is breaking up: hull damage per second
        JOB_AT: 0.12, // flooding above this shows up as a job on idle phones and for the bots
      },
      SPOUT: {
        EVERY: 4200, CHANCE: 0.6, // a waterspout every so far along the map (px) on average, by chance
        SWAY: 450, // they wander this far from their spot (px, slowly)
        RANGE: 800, // pulls the ship within this distance (px)...
        PULL: 110, // ...up to this many px per second (at the core)
        HEIGHT: 950, // only reaches ships whose keel is within this height above the water (px)
        CORE: 70, // radius of the spinning core (px)
        HIT_EVERY: 8, POWER: 0.6, // the core batters the ship if she is dragged into it
      },
      RESCUE: {
        EVERY: 3300, CHANCE: 0.8, // survivors on wreckage: one every so far (px) on average, by chance
        CATCH: 130, // the rope catches a survivor within this sideways distance of the bomb bay doors (px)
        ROPE: 520, // ...if they are this far or less below the doors (px)
        SLACK: 1300, // the rope slips when the ship has moved this far past them
        SPOT: 1500, // the crew is told about survivors this far ahead (px)
        WINCH_X: 420, TIME: 1.6, // where the winch is (bomb bay) and seconds of holding Action to haul one in
        PROG_DECAY: 0.4, // winding progress lost per second when nobody works the winch
      },
    },
    // FROST PEAKS: ice builds up on the gasbag, top deck and guns. Chip it off with the hammer.
    frost: {
      name: 'Frost Peaks',
      DARK: 0, // (long polar dusk)
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
      DARK: 0, // (smoky gloom; the lava itself glows)
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
    // FUNGAL DEPTHS: glowing mushroom caves. SPORE CLOUDS drift through the ship: crew inside move slower
    // (their phone says SPORES!), and spores clog the engines (less power) until a crewmate clears them.
    fungal: {
      name: 'Fungal Depths',
      DARK: 0.8, // (deep cave: lamps and searchlights only)
      favour: { swarm: 2, imps: 1.5, bombers: 0.7, strafers: 0.7, gunship: 0.9 }, // bat swarms and spore drones
      sky: ['0b0818', '1d1240', '2f2a5c'], sun: '110,255,210', ridgeHaze: '44,24,84',
      rock: '#2c2547', rockStripes: ['rgba(6,2,16,.34)', 'rgba(110,255,210,.1)'], rockHaze: 'rgba(70,36,120,.2)',
      rim: 'rgba(120,255,214,.6)', edgeDark: '#1b4a4c', edgeLight: '#62f2cc', stalac: '#4a3a78', vine: '#4be0b0',
      cave: ['#140a2a', '#0a2e34'], pillar: '10,4,26', fog: '74,40,128', shaft: '110,255,210',
      ridges: [
        { f: 0.02, base: 0.86, amp: 190, freq: 0.003, color: '#3a2c66', snow: null },
        { f: 0.045, base: 0.92, amp: 130, freq: 0.004, color: '#2a2150', snow: null },
        { f: 0.1, base: 0.98, amp: 100, freq: 0.007, color: '#1d1840', snow: null },
      ],
      MUSHROOMS: { CHANCE: 0.34, GIANT: 0.14, GLOW: 0.2, CAPS: ['#8b5cf6', '#19c3b0', '#e657b6', '#52c8ff'] }, // chance a rock edge carries a mushroom, share of those that are giants, halo alpha, cap colours
      MOTES: { COUNT: 90, SPEED: 14, SIZE: 3.4, TILE_W: 2600, TILE_H: 1500, COLORS: ['150,255,220', '190,150,255'] },
      SPORES: {
        FIRST: 22, EVERY_MIN: 15, EVERY_MAX: 28, // seconds between clouds
        MAX: 3, // clouds at once
        RX: 200, RY: 135, // cloud radius (ship pixels)
        SPEED: 70, // drift across the ship (px per second)
        SLOW: 0.55, // crew inside walk at this share of normal speed
        COLOR: '176,240,110',
      },
      CLOG: {
        BASE: 0.002, // engine clog gained per second just from the spore-laden air
        CLOUD: 0.04, // ...and per second while a cloud sits over the engine
        POWER: 0.5, // a fully clogged engine loses this share of its power (both clogged: the ship crawls)
        CLEAR_TIME: 2.2, // seconds of holding Action (at the engine) to clear one
        JOB_AT: 0.3, // clogs thicker than this show as a job on idle phones
        BOT_AT: 0.45, // ...and bots clear them from this thickness
      },
      bat: { body: '#7a4fc8', wing: '#34d1b0' }, // glowing cave bats
      imp: { wing: '#2a6a62', body: '#7a4fb0', eye: '#9dffd8' }, // 'spore drones'
    },
    // THE AETHER: the top of the sky. Thin air: the gasbag lifts weakly (pump more gas to hover), the engines
    // are strong, crew are light (low gravity: big jumps), and the ship's OXYGEN slowly drains - refill it
    // at the oxygen tank. Void corsairs (dogfighters) and gunships hunt here.
    aether: {
      name: 'The Aether',
      DARK: 0.68, // (the thin dark air high above the sky)
      favour: { swarm: 0.4, imps: 0.5, bombers: 0.6, strafers: 2, gunship: 1.5 },
      sky: ['04020c', '150a30', '3b2a72'], sun: '190,160,255', ridgeHaze: '70,48,130',
      rock: '#5a5278', rockStripes: ['rgba(10,6,30,.3)', 'rgba(200,180,255,.14)'], rockHaze: 'rgba(120,96,190,.2)',
      rim: 'rgba(205,190,255,.65)', edgeDark: '#2e2756', edgeLight: '#d2c4ff', stalac: '#8a7cc0', vine: '#9d8cff',
      cave: ['#0c0824', '#1e1648'], pillar: '12,8,34', fog: '100,76,170', shaft: '176,156,255',
      ridges: [], // (unused: the Aether draws the curve of the world instead)
      STARS: { COUNT: 230, SIZE: 3.4, PARALLAX: 0.01 },
      AURORA: { ALPHA: 0.2, COLORS: ['90,255,200', '150,110,255'], PARALLAX: 0.02 },
      WORLD: { COLOR: ['#1a2a6a', '#3d6fb0'], ATMOS: '120,170,255', RISE: 0.8 }, // the planet below: its colours, the atmosphere glow, where its rim sits on the screen
      ISLANDS: { COUNT: 7, PARALLAX: 0.05, COLOR: '#2a2252', GLOW: '176,156,255' }, // far floating rocks
      GRAVITY: 0.33, // crew gravity multiplier (hops and falls: jumps go ~3x higher and longer)
      SINK: 18, // thin air: she needs this many MORE points of gas to hover (50 -> 68)
      ENGINE: 1.25, // engines are strong: forward speed multiplier
      ENGINE_ACCEL: 1.4, // ...and she picks up speed this much faster
      OXYGEN: {
        DRAIN: 1 / 170, // oxygen (0-1) lost per second while flying: about 170 s from full to empty
        TANK_X: 1405, // where the oxygen tank stands (main deck, by the bridge)
        REFILL: 0.5, // oxygen gained each time a refill hold completes
        REFILL_TIME: 2.6, // seconds of holding Action at the tank
        LOW: 0.22, // below this the lack starts to bite, growing to full at zero
        WALK: 0.62, // crew walk at this share of speed with none left
        GUN: 1.0, // guns cool down this much slower with none left (1 = twice as slow = half speed)
        HELM: 0.5, // the helm responds this much slower with none left (0.5 = half speed)
        JOB_AT: 0.5, // below this the tank shows as a job on idle phones
        BOT_AT: 0.4, // ...and bots go to refill it
      },
      bat: { body: '#5a4a9a', wing: '#9d8cff' },
      strafer: { body: '#2b2146', trim: '#8a63ff' }, // void corsairs
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
    VALVE_REACH: 40, // a GAS valve (S.5d) is turned from this close: nearer than a rack, so it works on a crowded deck
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
  // Phone controls (Phase C): the big ACTION button uses what you hold; the small GRAB button takes, swaps and hops on stations.
  CONTROLS: {
    GRAB_LOCK: 0.6, // seconds after any pickup / put-back / swap / station take when the host ignores more grab presses from that player (job actions are exempt)
    GRAB_HOLD: 0.35, // seconds GRAB must be held to swap, put back or replace what is in your hands (taking with empty hands is instant)
    HYSTERESIS: 15, // px: the rack / station you were already near keeps the button until another is this much closer (no flickering labels)
    AID_GRACE: 0.25, // seconds a press may still carry the PREVIOUS button label's id (the phone pressed just before the label changed)
    BAY_JUMP_ZONE: 22, // px either side of the hatch: only here does Action say "Jump!" (the rest of the bay is for the bombardier's seat)
    HOLD_TAP: 0.25, // a hold-action released sooner than this (seconds) counts as a tap: the phone nags "keep holding"
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
  // Crew health (health.js): every crewman has hearts. Fires, shell bursts, raider blows, swords and hard landings take some; a BIG hit (a bomb, the bomb bay going up, a heavy shell
  // right beside you, a fall from a great height) takes them all. At zero you are knocked out as before (a crewmate revives you, or you wake after the KO time) and come round with WAKE_HP.
  // The medical bay heals a heart every HEAL.EVERY seconds; a crewmate can bandage you. Between missions everyone is whole again.
  HEALTH: {
    ENABLED: true, // false = the old rules: a raider blow, a bomb, a helm hit or a hard landing knocks a crewman out in one go, and fires and shells do not hurt crew
    MAX: 3, // hearts
    BIG: 99, // a hit of this many hearts or more is a BIG hit: it ignores the i-frames and takes every heart
    IFRAMES: 0.8, // seconds after a hit when nothing else (but a big hit) can hurt you; the TV blinks and staggers him for that long
    WAKE_HP: 1, // hearts you come round (or are revived) with
    FIRE: {
      HEARTS: 1, // a burn takes this many hearts
      REACH: 50, // px: standing this close to a fire (same deck, not hopping over it) burns
      FIRST: 0.7, // seconds in the fire before the first heart goes (walking straight through costs nothing)
      TICK: 1.4, // ...then one heart per this many seconds while you stay
      BIG_MUL: 1.5, // a blaze (a big fire) burns this much faster
      SPRAY_MUL: 0, // spraying a fire out with the extinguisher: this share of the burn (0 = you cannot be burnt while you spray)
      COOL: 2, // out of the flames the burn clock runs down this many times faster than it filled
      RESET: 1.5, // seconds out of the flames before the next burn is a first one again (FIRST, not TICK)
    },
    BLOW: { default: 1, brute: 3 }, // hearts a raider's blow takes (by raider type)
    GUNSHIP_BLOW: 1, // hearts a blow from the enemy gunship's crew takes (our boarders)
    SWORD: 1.5, SHOVE: 0.75, // crew against crew (Versus; the gunship's crew against our boarders): hearts a sword blow and a shove take - the old PVP.FIGHT.HP 4 / SWORD 2 / SHOVE 1 in hearts (two sword blows or four shoves = out)
    MELEE_IFRAMES: 0.35, // ...he blinks for this long after such a blow (a fight's blows are never blocked by i-frames, only by KO)
    SHELL: { MIN_POWER: 0.9, RADIUS: 120, BIG_POWER: 2, BIG_RADIUS: 70 }, // a shell bursting inside the ship (power at least MIN_POWER) hurts crew within RADIUS px (a little more for a hard hit); a hit of BIG_POWER or more within BIG_RADIUS is a BIG one
    SHELL_HEARTS: 1, // hearts such a burst takes
    HELM_HEARTS: 1, // hearts a hit on the exposed helmsman takes (the HELM_EXPOSED.KO_CHANCE roll still decides whether he is struck)
    BLOWOUT: { RADIUS: 110, HEARTS: 1 }, // the boiler blowing: crew this close to it lose a heart
    BAY_RADIUS: 280, // px: crew this close to the bomb bay when it goes up are knocked out at once (BIG)
    BOMB_RADIUS: 90, // px: crew this close to a sapper's bomb when it goes off are knocked out at once (BIG; it was 90 px before hearts too)
    FALL: { HEARTS: 1, BIG_HEIGHT: 700, TOSS_HEIGHT: 120, KO_TIME: 8 }, // a landing from higher than AIR.STUN_HEIGHT costs HEARTS (and the short stun); from BIG_HEIGHT, or from over TOSS_HEIGHT after being thrown off a deck that broke away with no parachute open, it is a BIG hit, out for KO_TIME
    OVERBOARD: 1, // falling off the ship: you come round in the medical bay this many hearts down (never below 1)
    HEAL: {
      REACH: 130, // px: within this of the medical bay's cot (same deck) you heal
      EVERY: 5, // seconds per heart in the medical bay
      NO_MEDBAY_EVERY: 45, // a ship with no medical bay: seconds per heart of slow natural recovery (0 = never)
    },
    BANDAGE: { ENABLED: true, TIME: 2.5, HEARTS: 1 }, // a crewmate holds Action on a hurt (awake) crewman for TIME seconds: he gets HEARTS back
    JOB_AT: 1, // at this many hearts or fewer the phone says GET TO THE MEDBAY! and the arrow points there; the bots go and heal
    BOT: { FLEE: 0.4 }, // a bot that has been burning this long (s) steps out of the fire (unless it is on its way to put it out)
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
    GAS_EMERGENCY: 3, // this many gasbag holes (and the gas running low, or ruin below) and patching them jumps ahead of other chores
    GAS_LOW: 32, // ...gas below this counts as running low
    GAS_RUIN: 6, // ...or this many holes is ruin whatever the gas level is
    GAS_CAP: 3, // at most this many crew patch the gasbag at once
    FIRE_BLAZE: 3, // this many fires at once is a blaze: putting them out comes before gasbag patching
    FIRE_CAP: 4, // at most this many crew on fires at once
    HOT_FIRE_CAP: 6, // a fire in the coal (a big one, S.5f) is the worst fire aboard: up to this many crew run to it, ahead of every other chore (two to a fire)
    HOT_FIRE_PX: 900, // ...and among fires a coal fire counts as this many px of walking nearer than it is
    COAL_EMERGENCY: 15, // boiler fuel below this (with pressure not high): stoke it before anything else
    PRESS_EMERGENCY: 22, // steam below this (with coal not plentiful): same
    CRITICAL: ['helm', 'boiler', 'lift'], // module kinds (and the steam pipes feeding them) the bots rebuild before anything else once they break
    BOILER_SPREAD: 400, // a ship with several boilers: walking px a bot will add per coal load already shovelled into a boiler, to spread coal between them
    CHORE_SHARE: 0.6, // at most this share of the crew works on chores (patching, fires, repairs) at once; the rest man stations
    JOB_HOLD: 2.5, // seconds a bot sticks to a job before it may swap to a more urgent kind (it never swaps to a merely closer job of the same kind)
    HELM_CALL: 0.7, // chance per think that a crew member leaves a station to take an empty helm
    AMMO_LOW: 10, // fetch ammo when a gun has this many shells or fewer
    AIM_TOLERANCE: 0.12, // fire when aim is within this many radians
    STATION_MIN: 20, // stay at a station at least this long...
    STATION_MAX: 40, // ...and at most this long, then rotate
    STATION_TIER_PX: 1800, // a station that is one 'usefulness point' better is worth walking this many extra px for
    LEAVE_FOR_EMERGENCY: 0.2, // chance per think to leave a station when help is short
    // Bots now and then do something daring when they have nothing urgent to do: take a hookshot, hook the enemy
    // gunship, swing about our own decks, or hook / jump onto a fighter, kick the pilot out, fly it, bail out over our ship.
    DARING: {
      ENABLED: true,
      CHANCE_PER_MIN: 0.6, // per idle bot: chance each minute that it feels daring
      TARGET_BOOST: 6, // ...times this while a plane is close to the ship or a gunship is roped on (a better excuse than a quiet moment)
      MAX_AT_ONCE: 1, // at most this many bots on a daring stunt at once
      COOLDOWN: 40, // seconds after any stunt ends before the next may start
      MIN_CREW: 4, // not with fewer bots than this (the ship still needs hands)
      MIN_HULL: 35, // not while the hull is below this
      GET_TIMEOUT: 25, // seconds to fetch the hookshot from the rack
      WAIT_TIMEOUT: 18, // seconds to wait for a target to come into reach
      HOOK_TRIES: 3, // misses before it gives up
      REEL_TIMEOUT: 6, // seconds on the rope before it lets go
      TOTAL_TIMEOUT: 75, // a whole stunt never lasts longer than this (it stops controlling the bot)
      KICK_TIMEOUT: 6, // seconds to kick the pilot out before it gives up and jumps off
      FLY_TIME: 14, // seconds it flies a stolen plane before heading back over the ship to bail out
      FLY_TIME_BIG: 18, // ...the big fighter
      BAIL_OVER: 500, // bails out when the plane is within this sideways distance of the ship's middle...
      BAIL_Y: -200, // ...and above this height (ship coordinates; the ship's top is -165, planes keep off the hull, the parachute does the rest)
      REACH: 900, // only hooks a plane this close (px, ship coordinates; the hook flies 950)
      GUN_REACH: 800, // only hooks the gunship when her deck is this close (and only while her rope to our bow is tied, so the crew can swing back as usual)
      SHOW_REACH: 750, // show-off swings aim at our own decks this far
      BOARD_REACH: 940, // Versus: a bot boards the rival by hook only when one of her decks is this close to the end of our top deck (the hook flies 950)
      KINDS: { plane: 3, gun: 2, show: 1, board: 5, drop: 4 }, // how often each stunt is picked when it is possible (drop = Versus: a parachute jump from the bomb bay onto the rival's deck below)
    },
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
    URGENCY: { fight: 3, fire: 2.6, revive: 2.2, heal: 3.5, bandage: 1.3, hole: 1.8, gas: 1.6, swat: 1.5, leak: 1.4, ice: 1.2, unclog: 1.2, oxygen: 1.6, rod: 3.2, pump: 1.9, winch: 1.5, repair: 1.1, ammo: 1, coal: 1, help: 8, trim: 0.9, sail: 1.3, reef: 3, shovel: 1.5, hack: 3.4 },
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
  // Painted background images (art/backgrounds/<env>/sky|far|mid|near|cave .png) - see art/ART_PIPELINE.md.
  // Painted gouache textures laid over the ship and gunship fills (art/textures/*.png). ENABLED false = flat colours as before.
  // SCALE = size of one texture pixel in world units (the 512px tile covers 512*SCALE units; the airship is ~1500 wide).
  // Painted textures on the ship and gunships. STRENGTH: how strongly they show (1 = subtle, 2 = clear, 3 = bold).
  // Screen sharpness. The game draws at the screen's real pixel density (e.g. 1.5x on a laptop with display
  // scaling) up to this cap; 1 = old soft look but lightest on slow computers.
  // SHARP (pause menu button, remembered on this computer) switches between 1 and SHARP_RATIO.
  DISPLAY: { MAX_PIXEL_RATIO: 1, SHARP_RATIO: 1.5 },
  // Automatic detail (perf.js). When frames get slow (under MIN_FPS, or drawing over BUDGET_MS, for DROP_SECS) the game
  // lowers detail one level (sharp screen, then textures/darkness resolution/background strips, then clouds and puffs);
  // after RISE_SECS of comfortable speed it climbs back (a flip-flop doubles the wait, up to RISE_MAX_SECS).
  // AUTO false = no automatic changes (the pause menu "Detail" button can still force a level).
  PERF: { AUTO: true, BUDGET_MS: 12, MIN_FPS: 50, DROP_SECS: 2, RISE_SECS: 10, RISE_MAX_SECS: 160, DARK_RES_LOW: 6 },
  // Ship art (shipArt.js): the static parts of the ship are baked into offscreen pictures. BAKE_SS = how many times the screen's
  // pixel density they are drawn at; SMOOTH = imageSmoothingQuality when they are blitted (low is fastest); BAKE_ZOOM = re-bake
  // when the zoom has moved by this share; OFF true = always draw the ship directly (the old way).
  SHIP_ART: { BAKE_SS: 1.5, SMOOTH: 'low', BAKE_ZOOM: 0.25, OFF: false },
  TEXTURES: { ENABLED: true, SCALE: 1.1, STRENGTH: 2 },
  BACKGROUNDS: {
    ENABLED: true,
    // How fast each strip slides past, as a share of the ship's speed (bigger = nearer). Same idea as the drawn ridges.
    PARALLAX: { clouds: 0.01, far: 0.02, mist: 0.035, mid: 0.05, near: 0.1 },
    // The strip is drawn this much taller than the screen so it can shift up and down a little with the camera.
    OVERSCAN: 1.1,
    // Each strip sits along the bottom of the screen: its height (share of the screen) and how opaque it is.
    // clouds hang from TOP; DRIFT = pixels per second they move on their own (minus = leftwards).
    LAYERS: { clouds: { TOP: 0, HEIGHT: 0.55, ALPHA: 1, DRIFT: 12 }, far: { HEIGHT: 0.6, ALPHA: 0.9 }, mist: { HEIGHT: 0.5, ALPHA: 0.8, DRIFT: -20 }, mid: { HEIGHT: 0.42, ALPHA: 1 }, near: { HEIGHT: 0.28, ALPHA: 1 } },
    // Cave texture: world units tall (the picture is scaled to this), how fast it follows the camera, and a dark wash over it (0-1).
    CAVE: { HEIGHT: 900, PARALLAX: 0.5, DIM: 0.25 },
  },
  CREW_SPECIES: ['bulldog', 'wolf', 'tiger', 'shiba', 'fox', 'bear', 'cat', 'rabbit'],
};

// The ship layout (floors, ladders, stations, rooms) lives in shipLayout.js.
