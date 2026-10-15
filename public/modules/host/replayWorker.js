// PLAY OF THE MISSION, the encoder (SHIPS_BOOK.md L7; replayCam.js). A Web Worker: it gets a small ImageBitmap of the TV picture, paints it on an OffscreenCanvas and encodes it as a JPEG, so the pixels are
// read back and compressed OFF the main thread (the TV's frame never waits for it). Messages in: { id, bm, q } (bm is transferred). Messages out: { id, blob } (blob null if it could not be encoded).
// Plain classic worker, no imports, nothing from the internet.
let oc = null, octx = null;
self.onmessage = async (e) => {
  const { id, bm, q } = e.data || {};
  let blob = null;
  try {
    if (!oc || oc.width !== bm.width || oc.height !== bm.height) { oc = new OffscreenCanvas(bm.width, bm.height); octx = oc.getContext('2d', { alpha: false }); }
    octx.drawImage(bm, 0, 0);
    blob = await oc.convertToBlob({ type: 'image/jpeg', quality: q || 0.72 });
  } catch (err) { blob = null; }
  try { bm.close(); } catch (err) { /* ignore */ }
  self.postMessage({ id, blob });
};
