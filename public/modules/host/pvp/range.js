// RANGE BANDS (config.PVP.RANGE; PVP.md "Space and range"): how far apart two ships are, and what kind of fight that is. Node-safe: no DOM.
//   SHORT  ramming, boarding, grapeshot, the harpoon          MID  the broadside guns, flak          LONG  the long gun and the mortars          FAR  nobody can hit anybody
// Distances are centre to centre (aim point to aim point) in world px; the TV shows metres (RANGE.PX_PER_M).
import { config } from '../../../config.js';

export const BANDS = ['short', 'mid', 'long', 'far'];
export const bandOf = (d) => {
  const R = config.PVP.RANGE;
  return d < R.SHORT ? 'short' : d < R.MID ? 'mid' : d < R.LONG ? 'long' : 'far';
};
export const metres = (px) => Math.round(px / config.PVP.RANGE.PX_PER_M / 5) * 5; // (to the nearest 5 m: the readout does not flicker)
export const BAND_WORDS = { short: 'CLOSE', mid: 'MID RANGE', long: 'LONG RANGE', far: 'FAR APART' };
// Where a captain who likes a band holds the ship (px between the aim points of two classic hulls; the standoff code adds the hulls' own difference).
export const holdFor = (band) => config.PVP.RANGE.HOLD[band === 'far' ? 'long' : band];
