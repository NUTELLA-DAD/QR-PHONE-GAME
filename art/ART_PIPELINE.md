# Art pipeline: from ComfyUI to the game

A plain-language guide. You make pictures in ComfyUI, drop them into folders, and the game shows them.
**Every image is optional.** If a file is missing, the game keeps drawing that piece itself, so you can
add art one picture at a time and the game never breaks.

## The quick loop

1. Make a picture, save it as a **PNG** with the exact file name from the lists below.
2. Put it in the right folder (backgrounds: `art/backgrounds/<environment>/`, everything else: `art/sprites/...`).
3. Open the **Art test** page: `http://localhost:3000/styletest.html` (or Pause menu, "Art test" button). Press **Reload images**.
   The top strip shows all seven environments side by side (a `*` means that one has your images). The big picture
   below is a live game with bot crew, so you see the ship, enemies and gunships in the new style.
4. In the real game, just restart the page (F5 on the host screen). No other setup.

The server window must be open (double-click `start.bat`). Nothing is ever loaded from the internet.

---

## Part 1. Painted backgrounds

Folder: `art/backgrounds/<environment>/` where `<environment>` is one of:

| Folder | Environment |
|---|---|
| `skyisles` | Sky Isles (the first, sunny one) |
| `frost` | Frost Peaks |
| `ember` | Ember Forge |
| `storm` | Storm Front |
| `sea` | Sunken Sea |
| `fungal` | Fungal Depths |
| `aether` | The Aether |

Each folder can hold up to five pictures (all optional, `.png` preferred; `.webp`, `.jpg` and `.svg` also work):

| File | What it shows | Pixel size (make it this big) | Transparent? | Tileable sideways? |
|---|---|---|---|---|
| `sky.png` | The whole sky: gradient, sun glow, big soft clouds. Never moves. | **1920 x 1080** (16:9). Any 16:9 works; it is scaled to cover the screen. | No | No |
| `far.png` | Farthest scenery: pale distant mountains / islands / sea horizon. Slides slowly. | **3072 x 768** (4:1) | **Yes**, empty sky above the shapes | **Yes** |
| `mid.png` | Middle scenery: hills, big rock towers, cloud banks. | **3072 x 768** | Yes | Yes |
| `near.png` | Nearest scenery: dark foreground rocks, tree tops, wisps of cloud. Slides fastest. Keep it sparse so it does not hide the action. | **3072 x 768** | Yes | Yes |
| `cave.png` | The wall behind the ship in cave maps (rock, mushrooms, ice...). Dark and calm so enemies and shots stand out. | **1024 x 1024** (square is fine) | No | **Yes, both ways** |

Rules the game follows:

- A strip is scaled so its **height fills the screen** (a little taller, to allow gentle up/down movement), and repeated
  sideways forever. So **draw the important shapes in the middle band**; the very top and bottom edges can be trimmed.
- If an environment has **any** of sky/far/mid/near, the game's own drawn clouds and ridges for that environment are replaced.
  If you add strips but no `sky.png`, the game's drawn sky stays behind your strips (fine for testing).
  Fog, god-rays, rain, snow, embers and lightning are still drawn on top.
- Backgrounds are fixed to the world, so they never shimmer. Keep fine detail soft: they move behind everything.
- Speeds, the cave darkening, and the strip stretch are in `public/config.js` under `BACKGROUNDS`.
- Keep **bright, high-contrast and busy** things out of backgrounds. Enemies, shots and warnings (red aim lines, bomb
  warnings) must stay easy to see. Low contrast, hazy and slightly desaturated works best, the far layers lightest.

### Make strips tileable (no seam) in ComfyUI

Pick one:

1. **Tiling option.** In KSampler workflows use a "Make Circular VAE" / "asymmetric tiled KSampler" custom node
   (search "tiled" in ComfyUI Manager, e.g. *ComfyUI-seamless-tiling*) and set it to **X only** for strips,
   **X and Y** for `cave.png`. The image then wraps round by design.
2. **Offset trick** (works with any tool): generate the strip, shift it sideways by half its width (ComfyUI "Image Offset",
   or Krita/GIMP "Offset" with wrap-around), draw (inpaint) over the visible seam in the middle with a soft mask,
   shift back. Check by placing the picture twice side by side.
3. **Cheat:** generate a wide picture, mirror it, join the original and mirror: it tiles, with a symmetrical look
   (fine for hazy `far.png`).

The Art test page draws every strip twice side by side as it scrolls, so you will see a seam if there is one.

### Making them transparent (far / mid / near)

Generate the layer on a **plain flat sky colour or white**, then remove it:
use a background-removal node (ComfyUI Manager: *rembg* / "Remove Background (RMBG-1.4)" / "BiRefNet") and save as PNG with alpha.
For soft haze at the bottom, add a fade-to-transparent at the **top** of the strip (a gradient mask), so it blends
into the sky. Mist and clouds do not remove well: ask for them with a plain pale blue sky behind and fade the
top edge by hand.

---

## Part 2. Sprites (ship, enemies, items, effects)

Folder: `art/sprites/`. Full descriptions are in `art/ART_SPEC.md`. **The sizes below are the game's box size in "world"
units; make the picture 2 times bigger** (so 124 x 48 becomes 248 x 96). Same proportions matter; exact pixels do not.
All face **right**, transparent PNG, one piece per file. (Magenta `#FF00FF` backgrounds are also auto-removed.)

### Ship parts (`art/sprites/ship/`, looked up by `sprites.box`)

| File (key) | Game box (w x h) | Notes |
|---|---|---|
| `gasbag.png` | 1720 x 370 | the big envelope |
| `fin-top.png`, `fin-bottom.png` | 135 x 130 each | tail fins |
| `gondola.png` | 1386 x 335 | hull shell; rooms show through the empty (transparent) inside |
| `nest.png` | ship layout width x 80 (about 220 x 80) | crow's nest |
| `pod.png` | 144 x 116 | belly turret pod |
| `engine.png` | 124 x 48 | nacelle, no propeller (the game flips it for the other side) |
| `catwalk.png` | 140 x 50 | one repeating section |
| `outrigger.png` | 140 x 50 | one repeating section |
| `floor.png` | 128 x 12 | repeating deck planks |
| `room-tail-turret.png`, `room-boiler.png`, `room-workshop.png`, `room-bridge.png`, `room-aft-gun-deck.png`, `room-hold.png`, `room-fore-gun-deck.png` | each room's own size; see the table in ART_SPEC.md section 5 (e.g. boiler 380 x 148, bridge 370 x 148) | back wall only |
| `boiler.png` | 90 x 112 | |
| `gauge.png` | 56 x 56 | round, no needle |
| `wheel.png` | natural size, 0.5 world per pixel (about 76 x 76) | face-on; the game spins it |
| `chart-table.png` | 80 x 52 | |
| `coal-bunker.png` | 100 x 86 | |
| `ammo-crates.png` | 100 x 50 | |
| `rack-sword.png`, `rack-hammer.png` | 68 x 70 | wall racks |
| `extinguisher.png` | 24 x 60 | wall-hung |
| `vent.png` | 32 x 110 | steam stack |
| `valve.png` | 28 x 28 | |
| `ladder.png`, `rope-ladder.png` | 32 x 26 | one rung section, repeats upward |
| `stairs.png` | about 140 x 150 (follows the stair) | |
| `lift.png` | 76 x 132 | |
| `porthole.png` | 32 x 32 | |
| `gun-mount.png` | 32 x 32 | |
| `gun-barrel.png` | natural size (0.5 world per pixel), pointing right, pivot at the left end | about 66 x 24 |

### Planes and enemy craft (`art/sprites/planes/<name>/`, looked up by `sprites.plane`)

Names the game asks for: `fighter` (dogfighter / the enemy's main plane), `bomber`, `cargo`, `boss`.
Files in each: `body.png` (facing right, **no propeller**), `prop.png` (propeller edge-on, thin vertical blade; the game
"spins" it), `wreck.png` (shot down version, `fighter` and `cargo` use it). Drawn at 0.5 world per pixel, so make
the fighter about **340 x 150** pixels and cargo about **620 x 240**. Optional position of the prop is set in `art/sprites/rig.json`.

**Gunships have no image hooks yet** (they are drawn by `gunshipArt.js`, and each gunship is generated differently:
hull size, decks, gasbags, engines). Painting them is a later job; ask for a gunship hook when you want one.

### Crew and monsters (later)

`art/sprites/crew/<animal>/` and `art/sprites/enemies/<creature>/` are made of separate head/torso/arm/leg parts
(see ART_SPEC.md section 3). Turn them on with `CREW_SPRITES` in `config.js`. Do these last.

### Items and effects (`art/sprites/items/`, `art/sprites/fx/`, `art/sprites/crests/`)

| File | Box | Notes |
|---|---|---|
| `items/coal.png`, `items/ammo.png` | natural size at 0.5 world per pixel (about 25 x 20) | carried in the arms |
| `items/sword.png`, `items/hammer.png`, `items/extinguisher.png` | natural size, pointing **up** (about 20 x 50) | held tools |
| `fx/fire-1.png` to `fx/fire-4.png` | 60 x 70 each | looping flame (a single `fire-1.png` also works) |
| `fx/hole.png` | 50 x 60 | hole in the hull |
| `fx/mine.png` | 100 x 160 | floating mine with balloon |
| `fx/bomb.png` | 48 x 60 | sapper's bomb |
| `fx/turret.png` | 80 x 52 | ground turret |
| `fx/turret-barrel.png` | natural size, pointing right, pivot near the left end | |
| `crests/crew.png` | 220 x 220 on the gasbag (also 34 x 34 on the flag) | our crest, fictional only |
| `crests/monsters.png` | 32 x 32 (scaled up on bigger things) | enemy crest, fictional only |

---

## Part 3. Generating with SDXL: sizes and consistency

**Sizes.** SDXL likes about one megapixel. Good sizes: **1344 x 768** (wide), **1216 x 832**, **1024 x 1024**, **768 x 1344** (tall).

- `sky.png`: generate 1344 x 768, then upscale to 1920 x 1080 (ComfyUI "Upscale Image By" 1.43 with an ESRGAN model, or latent upscale + 0.35 denoise).
- Strips (4:1): generate 1344 x 768 and make them tileable, then **stitch** or **upscale** to 3072 x 768 (use the offset trick, step 2, and extend with outpainting
  if you want it longer). Or generate 1536 x 384 strips directly and upscale 2x.
- Sprites: generate on 1024 x 1024 or 1344 x 768 (ship/planes are wide), remove the background, **crop tight** with
  a few pixels of margin, and resize to the 2x size above. Do not worry about exact pixels, but keep the proportions.

**Transparent sprites.** Prompt "isolated on a plain white background" (or flat magenta), then use a background-removal
node. Check the edges against a dark colour and a light colour for halos; if there is a light fringe, shrink the mask by 1-2 pixels.

**Consistent style across 60+ images**

1. **One fixed style prompt**: paste the same style paragraph (below) at the start of every prompt. Change only the subject.
2. **One checkpoint and LoRA set**, never mixed mid-project. Keep the same sampler/steps/CFG. Save the workflow.
3. **Style reference image**: make a "style board" first, pick the one best picture, then use it as an IP-Adapter /
   Reference image (weight 0.5 to 0.7) for everything else.
4. **Seed families**: when you find a good picture, keep the seed and only change a word or two for variants
   (or use the picture as img2img at 0.5 to 0.6 denoise).
5. **Fictional everything**: always keep the "no insignia" negatives. Never ask for real planes' markings. Check each image:
   no crosses, roundels, swastikas, stars on wings, flags, or real writing. Our factions: the **crew** (cream and sage, a winged-cog crest) and the **monsters** (oxblood and charcoal, skull-and-bat crest).
6. **Draft small, finish big**: 768-wide drafts to find the picture, then rerun the chosen seed at full size.

---

## Part 4. Style prompt sheet (3 art directions)

Generate the same five test images in each direction, put them side by side, and pick one. All use the same
**negative base** (add the direction's own negatives after it):

> Shared negative: `photo, photorealistic, 3d render, text, letters, watermark, signature, logo, flag, national insignia, roundel, cross, swastika, star emblem, real aircraft markings, nazi, military badge, modern, blurry, lowres, jpeg artifacts, deformed, extra wings, cropped`

Subjects (swap into the `[SUBJECT]` slot of each base prompt):

- **sky**: a wide empty sky backdrop at golden morning, soft layered clouds, huge empty space, no objects, no aircraft
- **far strip**: a seamless horizontal strip of distant pale blue mountains and floating islands fading into haze, empty sky above, plain pale sky background
- **player airship**: a steam airship, side view facing right, long cream canvas gasbag with sage green fins, wooden gondola with brass portholes, propeller engines on struts, centered, isolated on a plain white background
- **enemy gunship**: a menacing armoured flying gunship, side view facing right, oxblood red and charcoal iron hull, spiked prow, multiple gun barrels, patched dark gasbag, skull-and-bat emblem, isolated on a plain white background
- **dogfighter biplane**: a small single-seat biplane, side view facing right, oxblood red wings with charcoal trim, shark-teeth nose art, propeller removed (just the nose), pilot visible, isolated on a plain white background

### Direction A: 1930s storybook gouache

Base positive:
`1930s children's storybook illustration, flat gouache painting, matte opaque paint, soft pastel faded colours, thin dark brown ink outlines, simple shapes, gentle paper texture, warm cream and dusty teal palette, [SUBJECT], clean composition`

Negative additions: `glossy, neon, harsh shadows, gradients, 3d, anime, glow, high detail noise`

Example prompts:

- Sky: `1930s children's storybook illustration, flat gouache painting, matte opaque paint, soft pastel faded colours, gentle paper texture, warm cream and dusty teal palette, a wide empty sky backdrop at golden morning, soft layered clouds, huge empty space, no objects`
- Far strip: `... flat gouache painting ..., a seamless horizontal strip of distant pale blue mountains and floating islands fading into haze, empty sky above, plain pale sky background, tileable`
- Airship: `... thin dark brown ink outlines, a steam airship, side view facing right, long cream canvas gasbag with sage green fins, wooden gondola with brass portholes, propeller engines on struts, isolated on a plain white background`
- Gunship: `... a menacing armoured flying gunship, side view facing right, oxblood red and charcoal hull, spiked prow, multiple gun barrels, patched dark gasbag, skull-and-bat emblem, isolated on a plain white background`
- Biplane: `... a small single-seat biplane, side view facing right, oxblood red wings, charcoal trim, shark-teeth nose art, pilot in cockpit, isolated on a plain white background`

### Direction B: painterly Ghibli-like watercolour

Base positive:
`hand-painted watercolour animation background style, soft painterly clouds, luminous light, delicate wash and gouache layers, lush detailed but gentle, warm sunlight, romantic adventure mood, [SUBJECT], high quality`

Negative additions: `harsh black outlines, cel shading, cartoon outlines, oversaturated, neon, noisy`

Example prompts:

- Sky: `hand-painted watercolour animation background style, soft painterly clouds, luminous light, a vast open sky with towering cumulus clouds in the distance, warm morning sun low on the horizon, no objects, no aircraft`
- Far strip: `hand-painted watercolour animation background style, a seamless horizontal band of far blue misty mountains and tiny floating rock islands with trees, hazy, plain pale sky above, tileable`
- Airship: `hand-painted watercolour animation style, a steam airship, side view facing right, patched cream canvas envelope, riveted brass and wood gondola with round windows, little propellers, soft rim light, isolated on a plain white background`
- Gunship: `hand-painted watercolour animation style, a rugged armoured sky gunship, side view facing right, dark red and charcoal plates, big guns along the hull, spiked bow, torn dark balloon above, isolated on a plain white background`
- Biplane: `hand-painted watercolour animation style, a small scrappy red biplane, side view facing right, shark mouth painted on the nose, goggled pilot, isolated on a plain white background`

### Direction C: bold vintage travel-poster print

Base positive:
`vintage 1930s travel poster, bold flat colour blocks, limited palette of cream, teal, coral and mustard, screen print texture, strong simple silhouettes, clean shapes, art deco, [SUBJECT]`

Negative additions: `gradients, realistic shading, tiny detail, soft blur, photo, busy`

Example prompts:

- Sky: `vintage 1930s travel poster, bold flat colour blocks, screen print texture, art deco sky with stylised stacked cloud bands in cream and coral over teal, sunburst glow behind, no objects, no aircraft, no text`
- Far strip: `vintage 1930s travel poster, flat colour blocks, a seamless horizontal strip of stylised layered mountain silhouettes and floating islands in pale teal and cream, empty plain sky above, tileable`
- Airship: `vintage 1930s travel poster style, bold flat colours, a streamlined steam airship, side view facing right, cream envelope with sage green fins, mustard gondola with round windows, art deco lines, isolated on a plain white background`
- Gunship: `vintage 1930s travel poster style, bold flat colours, a sinister armoured gunship airship, side view facing right, deep red and charcoal, spiked nose, rows of guns, skull-and-bat emblem, isolated on a plain white background`
- Biplane: `vintage 1930s travel poster style, bold flat colours, a small red biplane, side view facing right, shark-tooth nose, pilot with goggles, isolated on a plain white background`

**Choosing:** put the five images of each direction on one board (the Art test page helps once the backgrounds and ship are in),
squint from across the room: which one still reads clearly at TV distance, with enemies visibly distinct from the backdrop?
Then freeze that direction's base prompt as the fixed style paragraph (Part 3).

---

## Order to work in

1. Style board: pick a direction (Part 4).
2. `sky.png` + `far.png` + `mid.png` for Sky Isles, check on the Art test page.
3. The other six environments' backgrounds, then `near.png` and `cave.png`.
4. Ship: `gasbag`, `fin-*`, `gondola`, `engine`, `pod`, `nest`, then props and rooms.
5. Planes (`fighter`, `bomber`, `cargo`, `boss`), then items and effects.
6. Characters last.
