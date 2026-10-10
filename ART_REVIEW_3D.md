# 3D art-director review (Fable, after WP0-WP15)

A read-only review of 42 screenshots plus the `view3d` code. Lead's notes are marked **Lead:**.

**Lead:** the plan for the next round of art work. A1 started on 2026-10-10. A9 needs the owner's OK for a download.

## Summary
**What works:**
- Night, cave, storm and Aether scenes are lovely and on brief (8/10).
- The Kraken is the best single thing in the build (9/10).
- Crew look charming up close (8/10).
- Nothing wobbles, and the tech underneath is strong.

**The gap:** in daylight, which is most of the game (5.5/10), the ship reads as a nice plastic model on top of a painting. Three reasons:
- The shading is too soft, and the ink lines vanish when zoomed out.
- The painted backgrounds and the 3D clouds and cave wall look like different artists made them.
- The water and lava are flat planes covered in a repeating pattern.

Water scores 3/10, lava 5/10, VFX 6/10, and crew at TV distance 5/10.

## Top 10 gaps (ranked by impact from the sofa)
1. **Ink and shadow step.**
   - The toon gradient never goes below 60% brightness, so nothing has a real shadow side.
   - The ink is set in world units, so it goes sub-pixel when zoomed out (the Versus ships have no outline at all).
   - Fix: a 2-step gradient (shadow about 0.5); a screen-constant ink uniform scaled by camera distance in every ink patch (style, kit, crew, creatureKit, enemyArt), never thinner than about 1.5 px; and the rim light up to about 0.22.
2. **Water.**
   - Problem: straight foam lanes like a swimming pool, and a hard horizon line.
   - Fix: stamped Wind Waker foam arcs and rings from an atlas, each sliding at a constant speed; a two-tone crest pattern; a stepped sun-glitter band; a horizon haze band.
3. **Background versus foreground.**
   - Problems: the 3D clouds read as camera bokeh; the painted strips are too saturated and fight with the ship; the cave wall looks like bubble wrap; the Ember sky is a plain gradient.
   - Fix:
     - painted flat-bottom cumulus shapes instead of the soft discs, or no front clouds;
     - fade the far and mid strips toward the haze;
     - a dark strata shader on the cave wall;
     - paint an Ember sky.
4. **Gasbag.**
   - Problem: the biggest shape on screen and the blandest.
   - Fix: real gore panels with creases, a nose cap and tail cone, thick ribbed fins, and stronger canvas cells.
5. **Stations.**
   - Problem: brown on brown, so they're hard to tell apart at TV distance.
   - Fix: one saturated accent chip per station kind; a lighter far wall with corner AO and a skirting line; a coloured station mat under manned stations.
6. **Crew at gameplay zoom.**
   - Problem: crew are tiny, and the white bot labels are the brightest thing on screen.
   - Fix: bigger heads and marker cones as the camera pulls back; label bots only while they're busy.
7. **Shadows.**
   - Problem: soft grey blurs, and no contact shadow under the ship.
   - Fix: crisp cel shadows (radius 1, less normal bias), plus a contact-shadow decal under the ship on rock and water.
8. **Smoke.**
   - Problem: translucent bubbles.
   - Fix: flat gouache puffs with an opaque core, a light crescent and an ink rim; fewer and bigger.
9. **Rock.**
   - Problem: layer-cake stripes.
   - Fix: ragged broken strata, a darker shadow side, and painted bush or pine fringes along the lip.
10. **Come-about.**
    - Problem: the mid-turn view shows a black hole in the hull and a featureless disc for a bag.
    - Fix: show both hull walls mid-turn, and a smaller yaw (0.17 rad).

Also: dim the far lava, fill out the Fungal caves, and shrink the HUD logbook panel about 10% in 3D.

## Quick wins (under 1 hour each)
- 2-step gradient.
- Shadow radius 1, normalBias 6.
- No front clouds, and cloud alpha 0.3.
- Strip haze tint.
- Cave emissive 0.08.
- Bots unlabelled when idle.
- Smoke: half the rate, bigger, opaque.
- Come-about yaw 0.17 with both walls shown.
- Lava HDR down 25%.
- Rim light 0.22.

## SDXL (~7 GB download)?
Not this week. Probably yes in week two, and only to repaint the backgrounds (Ember sky and far strip, cave walls, the far strips, a cumulus atlas), using the 3D render as the reference so the two agree. Run a two-picture trial on Ember first. It needs the owner's OK.

## Packages for next week
| # | Package | Gate |
|---|---|---|
| A1 | Ink and shade (gap 1, plus the gradient, shadow, rim and come-about quick wins) | `--check-3d` (re-snapshot), draw calls and tris within 2% |
| A2 | Water v2 | `weather3d-check --only sea`, `creature3d-check --quick` |
| A3 | Sky cohesion: clouds, strips, cave wall, Ember sky | the seven environment shots, `--check-3d` |
| A4 | Gasbag v2 | fallbacks empty, ≤120k tris, `--check-physics`, ship shots |
| A5 | Readable stations and crew | `crew3d-check`, HUD hash, `cine3d-check` |
| A6 | Contact shadow, gouache smoke, lava falloff | `--check-enemy3d`, `weather3d-check --only ember` |
| A7 | Rock v2 | chunk build ≤4 ms, `--check-3d` |
| A8 | Come-about and Fungal fill | `cine3d-check`, `light3d-check` |
| A9 | SDXL background trial (**owner's OK needed**) | the owner approves two pictures |

Pairs that can run together: A1 then A2, A3 with A4, A5 with A6, A7 with A8. A1 goes first.
