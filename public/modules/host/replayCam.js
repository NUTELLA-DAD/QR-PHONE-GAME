// PLAY OF THE MISSION, the camera and the projector (SHIPS_BOOK.md L7). The browser half of the replay: replay.js keeps the clips, this copies the TV picture into them and plays them back.
//
//   RECORDING. Once per drawn picture main.js calls cam.grab(). If replay.wants() (a 1/REPLAY.FPS has passed of flying), the 3D canvas (or, in the 2D view, the whole 2D canvas) is drawn down to a REPLAY.CAP.W px wide
//   canvas, turned into an ImageBitmap and handed to replayWorker.js, which reads it back and encodes a JPEG on a worker thread (the main thread pays about 0.15 ms a picture; canvas.toBlob is the fallback where a
//   worker or an OffscreenCanvas is missing, and it stalls the main thread on the readback). The JPEG is about 50 KB, so a few seconds of film is a few MB. It is called inside the same task that drew the picture
//   (a WebGL canvas can only be read then). Where each crewman stands on that picture is stored with it, so the hero can be ringed on the footage.
//   The camera only READS canvases and the world: it draws no random number and writes nothing the sim reads. It guards itself: at most MAX_INFLIGHT pictures wait for the encoder, and a recorder that costs more than
//   CAP.COST_MS a grab on average switches itself off for the session (no film, the awards still come). It does nothing on the lowest quality tier. Nothing is loaded from the internet.
//   PLAYING. footage.loader(film) (replay.js) is set here: it decodes the JPEGs of a clip as ImageBitmaps in a sliding window (REPLAY.LOAD) so a few MB of JPEG never becomes a hundred MB of pictures.
//
//   const cam = createReplayCam({ replay, canvas2d, canvas3d, state, level })    level() -> the quality tier (0 = lowest)
//   cam.grab(now, { use3D, view, p3 })   cam.supported   cam.stats()   cam.switchOff(why)
//   installFootage()      the playback side (once, at start)
import { config } from '../../config.js';
import { footage } from './replay.js';

const can = () => typeof document !== 'undefined' && typeof createImageBitmap === 'function' && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.toBlob === 'function';

export function createReplayCam({ replay, canvas2d, canvas3d, state, level }) {
  const C = () => config.REPLAY.CAP;
  let small = null, sctx = null, inflight = 0, why = can() ? '' : 'no canvas.toBlob / createImageBitmap';
  let wasJpeg = null;
  const cost = [];
  const st = { grabbed: 0, skippedBusy: 0, encoded: 0, bytes: 0, msTotal: 0, msMax: 0, on: !why };
  const switchOff = (reason) => { why = reason || 'off'; st.on = false; };

  const prepare = (sw, sh) => {
    const W = C().W, H = Math.max(2, Math.round((W * sh) / sw / 2) * 2);
    if (!small) {
      small = document.createElement('canvas');
      sctx = small.getContext('2d', { alpha: false });
      if (!sctx) { switchOff('no 2d context'); return false; }
    }
    if (small.width !== W || small.height !== H) { small.width = W; small.height = H; }
    return true;
  };

  // The encoder: a worker (replayWorker.js) reads the small picture back and compresses it off the main thread; where a worker or an OffscreenCanvas is missing, canvas.toBlob does it (slower: the pixels are read
  // back on the main thread, so the cost guard below may well switch the recorder off).
  let worker = null, wid = 0, useWorker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
  const waits = new Map();
  const startWorker = () => {
    if (worker || !useWorker) return worker;
    try {
      worker = new Worker(new URL('./replayWorker.js', import.meta.url));
      worker.onmessage = (e) => { const r = waits.get(e.data && e.data.id); if (r) { waits.delete(e.data.id); r(e.data.blob || null); } };
      worker.onerror = () => {
        useWorker = false;
        for (const r of waits.values()) r(null);
        waits.clear();
        try { worker.terminate(); } catch { /* ignore */ }
        worker = null;
      };
    } catch { useWorker = false; worker = null; }
    return worker;
  };
  const encode = (cb) => {
    if (cam.debug === 'draw') { cb(null); return; } // (dev: the bench measures each step of the grab on its own)
    if (cam.debug === 'bitmap') { createImageBitmap(small).then((bm) => { bm.close(); cb(null); }).catch(() => cb(null)); return; }
    if (startWorker()) {
      st.mode = 'worker';
      createImageBitmap(small).then((bm) => {
        if (!worker) { try { bm.close(); } catch { /* ignore */ } cb(null); return; }
        const id = ++wid;
        waits.set(id, cb);
        worker.postMessage({ id, bm, q: C().Q }, [bm]);
      }).catch(() => cb(null));
    } else {
      st.mode = 'toBlob';
      small.toBlob(cb, 'image/jpeg', C().Q);
    }
  };

  const grab = (now, o = {}) => {
    if (!st.on || cam.hold) return null;
    try {
      if (!replay.wants()) return null;
      if (state.phase !== 'flying' || state.scorecard || state.paused) return null;
      if ((level ? level() : 3) <= 0 && config.REPLAY.SKIP_LOW) return null; // (the lowest tier has no film)
      if (inflight >= C().MAX_INFLIGHT) { st.skippedBusy++; return null; }
      const use3D = !!o.use3D && canvas3d;
      const src = use3D ? canvas3d : canvas2d;
      if (!src || !(src.width > 32) || !(src.height > 32)) return null;
      const t0 = performance.now();
      if (!prepare(src.width, src.height)) return null;
      sctx.drawImage(src, 0, 0, small.width, small.height);
      const t1 = performance.now(); st.tDraw = (st.tDraw || 0) + (t1 - t0);
      // where the crew are on this picture
      const sw = src.width, sh = src.height, view = o.view, p3 = o.p3;
      const project = use3D && p3
        ? (p, wx, wy) => {
          const a = p3.crew ? p3.crew(p.id) : null;
          if (a) return p3.project(a.x, a.y + 70 * (a.sc || 1), a.z);
          return p3.mapPt ? p3.mapPt(wx, wy) : null;
        }
        : view && Number.isFinite(view.zoom)
          ? (p, wx, wy) => ({ x: ((wx - view.cx) * view.zoom + sw / 2) / sw, y: ((wy - view.cy) * view.zoom + sh / 2) / sh })
          : null;
      const P = replay.crewFrame(project);
      const t2 = performance.now(); st.tCrew = (st.tCrew || 0) + (t2 - t1);
      const f = replay.push({ w: small.width, h: small.height, bytes: 0, blob: null, P, pr: null, bad: false });
      if (!f) return null;
      f.pr = new Promise((resolve) => {
        inflight++;
        let done = false, to = 0;
        const fin = (b) => {
          if (done) return;
          done = true;
          clearTimeout(to);
          inflight = Math.max(0, inflight - 1);
          if (b && b.size) {
            if (wasJpeg === null) { wasJpeg = b.type === 'image/jpeg'; if (!wasJpeg) switchOff('this browser cannot encode JPEG'); }
            f.blob = b; f.bytes = b.size; st.encoded++; st.bytes += b.size;
          } else f.bad = true;
          resolve(f);
        };
        try { encode(fin); } catch { fin(null); }
        to = setTimeout(() => fin(null), 4000); // (an encoder that never answers must not hold a slot for ever)
      });
      const ms = performance.now() - t0;
      st.grabbed++; st.msTotal += ms; st.msMax = Math.max(st.msMax, ms);
      cost.push(ms);
      if (cost.length > C().COST_N) cost.shift();
      if (cost.length >= C().COST_N && cost.reduce((a, b) => a + b, 0) / cost.length > C().COST_MS) switchOff('the recorder costs too much (' + (cost.reduce((a, b) => a + b, 0) / cost.length).toFixed(1) + ' ms a grab)');
      return f;
    } catch (e) {
      (globalThis.gameErrors = globalThis.gameErrors || []).push('replayCam: ' + (e && e.message ? e.message : e));
      switchOff('it threw');
      return null;
    }
  };
  const cam = { grab, switchOff, hold: false, debug: '', get supported() { return st.on; }, get why() { return why; }, stats: () => ({ ...st, mean: st.grabbed ? st.msTotal / st.grabbed : 0, inflight, why }) };
  return cam;
}

// ---- playback: decode the JPEGs of a clip in a sliding window ----
export function installFootage() {
  if (!can()) return false;
  footage.loader = (film) => {
    const clip = film.clip, frames = clip.frames, L = config.REPLAY.LOAD;
    const bm = new Map(), jobs = new Map();
    let closed = false;
    const decode = (j) => {
      if (closed || j < 0 || j >= frames.length) return Promise.resolve(null);
      if (bm.has(j)) return Promise.resolve(bm.get(j));
      if (jobs.has(j)) return jobs.get(j);
      const f = frames[j];
      const job = Promise.resolve(f.pr)
        .then(() => {
          if (closed || !f.blob) return null;
          return createImageBitmap(f.blob);
        })
        .then((b) => {
          jobs.delete(j);
          if (!b) return null;
          if (closed) { try { b.close(); } catch { /* ignore */ } return null; }
          bm.set(j, b);
          return b;
        })
        .catch(() => { jobs.delete(j); f.bad = true; return null; });
      jobs.set(j, job);
      return job;
    };
    const src = {
      // the picture of frame i, or the nearest decoded one behind it (else just ahead of it)
      at(i) {
        for (let j = i; j >= Math.max(0, i - 6); j--) if (bm.has(j)) return bm.get(j);
        for (let j = i + 1; j <= i + 3; j++) if (bm.has(j)) return bm.get(j);
        return null;
      },
      want(i0, i1) {
        const lo = Math.max(0, i0 - L.BEHIND), hi = Math.min(frames.length - 1, i1 + L.AHEAD);
        for (const [j, b] of bm) if (j < lo || j > hi) { try { b.close(); } catch { /* ignore */ } bm.delete(j); }
        for (let j = Math.max(0, i0); j <= hi; j++) decode(j);
      },
      close() {
        closed = true;
        for (const b of bm.values()) { try { b.close(); } catch { /* ignore */ } }
        bm.clear(); jobs.clear();
      },
      get held() { return bm.size; },
    };
    film.src = src;
    // the film starts when its first pictures are decoded
    const first = [];
    for (let j = 0; j <= Math.min(frames.length - 1, L.AHEAD); j++) first.push(decode(j));
    Promise.all(first).then((got) => {
      if (closed) return;
      if (got.some(Boolean)) film.ready = true; else film.failed = true;
    }).catch(() => { film.failed = true; });
  };
  return true;
}
