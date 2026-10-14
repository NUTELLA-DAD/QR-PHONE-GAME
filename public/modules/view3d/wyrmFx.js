// THE RIME WYRM'S MARKS IN 3D (3D.md section 40): what the 2D game draws over the fight (render.js drawWyrmFx) and the 3D view must draw itself, in two small meshes:
//   MARKS (one draw call, always over the picture: depth test off, like the grip rings and the 2D game): the dashed cyan RING on every segment of ice a hammer can reach (a green arc fills as it is chipped), the pale ring and
//   cross on a gun the breath has frozen solid, the red dashed ellipse over the cliff that is cracking (the telegraph), the ring that glows at the throat while it draws the frost breath, the CONE OF FROST BREATH (three
//   jagged layers that step on the key), the gold FUNNEL over the open maw (dashed edges, chevrons stepping down into it) and the SHAFT OF SUN of phase 3 (a pale gold column with dashed edges, slanted bands that step down
//   it, glints and a warm pool on the floor). Each is a rotatable quad with its own little fragment program (kind in aA.x); everything that moves does so on the 8 a second key (uKey), never a sine of time.
//   CRACKS (one draw call, depth tested, on the cliff's face): the fissures that spread over the cliff in the 2 s before it erupts (stepped eighths: ink and pale ice ribbons whose visible length grows) and the dark
//   split at its top that widens.
import { THREE } from './style.js';

const TAU = Math.PI * 2;
const MAX = 40;
const hash = (a, b = 0) => { let h = Math.imul((a | 0) * 73856093 ^ (b | 0) * 19349663, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

export function createWyrmMarks(parent, P) {
  const pos = new Float32Array(MAX * 6 * 3), loc = new Float32Array(MAX * 6 * 2), A = new Float32Array(MAX * 6 * 4), B = new Float32Array(MAX * 6 * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aP', new THREE.BufferAttribute(loc, 2));
  geo.setAttribute('aA', new THREE.BufferAttribute(A, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aB', new THREE.BufferAttribute(B, 4).setUsage(THREE.DynamicDrawUsage));
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (let q = 0; q < MAX; q++) for (let k = 0; k < 6; k++) { loc[(q * 6 + k) * 2] = corners[k][0]; loc[(q * 6 + k) * 2 + 1] = corners[k][1]; }
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const col = (h) => new THREE.Color(h);
  const BR = P.BREATH || {}, SN = P.SUN || {}, FN = P.FUNNEL || {};
  const U = {
    uKey: { value: 0 }, uFA: { value: new THREE.Vector2(FN.ALPHA || 0.06, FN.ALPHA_OPEN || 0.16) }, uInk: { value: col('#1a1620') }, uCyan: { value: col('#7fe8ff') }, uGreen: { value: col('#8fe388') }, uRed: { value: col('#ff4d4d') },
    uPale: { value: col('#cfeeff') }, uGold: { value: col(FN.COLOR || '#ffd23f') }, uBr: { value: [col(BR.FAR || '#b7e1f6'), col(BR.MID || '#dff3fe'), col(BR.CORE || '#ffffff')] }, uBrA: { value: new THREE.Vector3(...(BR.ALPHA || [0.5, 0.62, 0.78])) },
    uSun: { value: col(SN.COLOR || '#ffe48a') }, uSunCore: { value: col(SN.CORE || '#fff4c4') }, uSunEdge: { value: col(SN.EDGE || '#ffd23f') }, uSunA: { value: new THREE.Vector2(...(SN.ALPHA || [0.13, 0.17])) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 aP; attribute vec4 aA; attribute vec4 aB; varying vec2 vP; varying vec4 vA; varying vec4 vB; void main() { vP = aP; vA = aA; vB = aB; gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `
      varying vec2 vP; varying vec4 vA; varying vec4 vB;
      uniform float uKey; uniform vec2 uFA; uniform vec3 uInk, uCyan, uGreen, uRed, uPale, uGold, uSun, uSunCore, uSunEdge; uniform vec3 uBr[3]; uniform vec3 uBrA; uniform vec2 uSunA;
      float dashes( float a, float n ) { return step( 0.5, fract( a * n ) ); }
      void main() {
        // vA = kind, half width, half height, p1; vB = p2, p3, p4, rot   (kind 0 chip ring, 1 frozen gun, 2 crack ellipse, 3 funnel, 4 sun, 5 breath cone, 6 throat ring)
        vec2 q = vP * vA.yz;
        float kind = vA.x, pulse = mod( floor( uKey ), 2.0 );
        vec4 c = vec4( 0.0 );
        if ( kind < 0.5 ) { // a segment of ice a hammer can reach: dashed cyan ring, a green arc of progress inside
          float d = length( q ), r = vA.w, a = fract( atan( q.x, q.y ) / ${TAU.toFixed(5)} );
          float dash = dashes( a, 14.0 );
          if ( step( abs( d - r ), 17.0 ) * dash > 0.5 ) c = vec4( uInk, 1.0 );
          if ( step( abs( d - r ), 10.0 ) * dash > 0.5 ) c = vec4( uCyan, 1.0 );
          if ( vB.x > 0.02 && step( abs( d - r * 0.8 ), 14.0 ) * step( a, vB.x ) > 0.5 ) c = vec4( uGreen, 1.0 );
        } else if ( kind < 1.5 ) { // a gun the breath froze: a pale dashed ring and a cross
          float d = length( q ), r = vA.w, a = fract( atan( q.x, q.y ) / ${TAU.toFixed(5)} );
          float dash = dashes( a, 12.0 ), xx = step( abs( abs( q.x ) - abs( q.y ) ), 11.0 ) * step( max( abs( q.x ), abs( q.y ) ), r * 0.55 );
          if ( ( step( abs( d - r ), 17.0 ) * dash + step( abs( abs( q.x ) - abs( q.y ) ), 20.0 ) * step( max( abs( q.x ), abs( q.y ) ), r * 0.55 + 6.0 ) ) > 0.5 ) c = vec4( uInk, 1.0 );
          if ( step( abs( d - r ), 10.0 ) * dash + xx > 0.5 ) c = vec4( uPale, 1.0 );
        } else if ( kind < 2.5 ) { // the cliff that is about to crack: a red dashed ellipse (it breathes on the key)
          vec2 e = vec2( vA.y, vA.z ) * 0.94;
          float k0 = length( q / e ), k1 = length( q / ( e * e ) ), dist = k0 * ( k0 - 1.0 ) / max( k1, 1e-5 ), a = fract( atan( q.y / e.y, q.x / e.x ) / ${TAU.toFixed(5)} );
          float dash = dashes( a, 16.0 );
          if ( step( abs( dist ), 12.0 ) * dash > 0.5 ) c = vec4( uInk, 1.0 );
          if ( step( abs( dist ), 7.0 ) * dash > 0.5 ) c = vec4( uRed, 1.0 );
        } else if ( kind < 3.5 ) { // the funnel above the open maw: the quad runs from the maw (bottom) up; vA.w = 1 while open, vB.x = the chevrons' step
          float W = vA.y, H = vA.z * 2.0, h = q.y + vA.z, open = vA.w;
          float fade = 1.0 - 0.55 * ( h / H );
          c = vec4( uGold, mix( uFA.x, uFA.y, open ) * fade );
          if ( step( abs( abs( q.x ) - ( W - 10.0 ) ), 9.0 ) * step( 0.5, fract( h / 110.0 ) ) > 0.5 ) c = vec4( uGold, 0.95 );
          if ( open > 0.5 ) for ( int k = 0; k < 3; k++ ) {
            float hc = 260.0 + float( k ) * 420.0 - vB.x * 80.0, hl = hc - 40.0 + 130.0 * abs( q.x ) / 150.0;
            if ( abs( q.x ) < 150.0 && abs( h - hl ) < 11.0 ) c = vec4( uGold, 0.95 );
          }
        } else if ( kind < 4.5 ) { // the shaft of sun: a column from the sky to the floor; vA.w = 1 while a head is in it
          float W = vA.y, H = vA.z * 2.0, h = q.y + vA.z, hd = h / H, x = q.x / W; // (h = 0 at the floor, H at the sky)
          float across = 1.0 - smoothstep( 0.55, 1.0, abs( x ) ), core = 1.0 - smoothstep( 0.0, 0.5, abs( x ) );
          float band = step( 0.5, fract( ( q.x * 0.0012 + ( H - h ) / 2600.0 ) * 1.0 - vB.x * 0.125 ) ); // (slanted bands that step down the shaft)
          float a = uSunA.x * across * ( 0.55 + 0.45 * hd ) + uSunA.y * core * band * 0.6;
          c = vec4( mix( uSun, uSunCore, core * 0.7 ), a );
          if ( step( abs( abs( q.x ) - ( W - 9.0 ) ), 8.0 ) * step( 0.5, fract( h / 120.0 ) ) > 0.5 ) c = vec4( uSunEdge, 0.9 );
          float gl = 0.0; // glints drifting down on the key
          for ( int k = 0; k < 6; k++ ) { float fk = float( k ), gy = mod( fk * 1300.0 + vB.x * 260.0, 7800.0 ), gx = ( fract( fk * 0.5301 ) - 0.5 ) * W * 1.1; if ( abs( q.x - gx ) < 14.0 && abs( ( H - h ) - gy - 400.0 ) < 14.0 ) gl = 1.0; }
          if ( gl > 0.5 ) c = vec4( 1.0, 0.97, 0.78, 0.95 );
          if ( h < 700.0 ) { float u = 1.0 - h / 700.0; c = vec4( mix( c.rgb, uSunCore, 0.5 ), max( c.a, 0.22 * u * across ) ); } // (a warm pool where it meets the floor)
          if ( vA.w > 0.5 ) c.a = max( c.a, 0.22 * across * ( 1.0 - smoothstep( 0.0, 2600.0, h - 600.0 ) ) );
        } else if ( kind < 5.5 ) { // the cone of frost breath: apex at the left end of the quad, along +x; three layers with jagged ends that step on the key
          float len = vA.w, hf = vB.x, along = q.x + len * 0.5, rho = length( vec2( along, q.y ) ), ang = atan( q.y, max( along, 0.001 ) );
          for ( int L = 0; L < 3; L++ ) {
            float k = L == 0 ? 1.0 : ( L == 1 ? 0.7 : 0.4 ), hl = hf * k, t = ( ang + hl ) / ( 2.0 * hl ) * 6.0, i0 = floor( t ), f = t - i0;
            float r0 = len * k * ( mod( i0 + vB.y, 2.0 ) > 0.5 ? 0.82 : 1.0 ), r1 = len * k * ( mod( i0 + 1.0 + vB.y, 2.0 ) > 0.5 ? 0.82 : 1.0 );
            if ( abs( ang ) < hl && along > 0.0 && rho < mix( r0, r1, f ) ) c = vec4( uBr[L], L == 0 ? uBrA.x : ( L == 1 ? uBrA.y : uBrA.z ) );
          }
          if ( c.a > 0.02 && abs( ang ) > hf * 0.97 ) c = vec4( uInk, 0.85 );
        } else { // the throat glowing for the frost breath: a pale ring with ink, breathing on the key
          float d = length( q ), r = vA.w * ( 0.94 + 0.06 * pulse );
          if ( step( abs( d - r ), 19.0 ) > 0.5 ) c = vec4( uInk, 0.95 );
          if ( step( abs( d - r ), 10.0 ) > 0.5 ) c = vec4( uPale, 1.0 );
        }
        if ( c.a < 0.02 ) discard;
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 19;
  mesh.visible = false;
  mesh.name = 'wyrmMarks';
  parent.add(mesh);
  let n = 0;
  // a quad: centre, half sizes, rotation (rad, about z), kind, then up to four numbers for the program
  const quad = (cx, cy, cz, hw, hh, rot, kind, p1 = 0, b0 = 0, b1 = 0, b2 = 0) => {
    if (n >= MAX || !Number.isFinite(cx) || !Number.isFinite(cy) || !(hw > 0) || !(hh > 0)) return;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (let k = 0; k < 6; k++) {
      const i = n * 6 + k, lx = corners[k][0] * hw, ly = corners[k][1] * hh;
      pos[i * 3] = cx + lx * cs - ly * sn; pos[i * 3 + 1] = cy + lx * sn + ly * cs; pos[i * 3 + 2] = cz;
      A[i * 4] = kind; A[i * 4 + 1] = hw; A[i * 4 + 2] = hh; A[i * 4 + 3] = p1;
      B[i * 4] = b0; B[i * 4 + 1] = b1; B[i * 4 + 2] = b2; B[i * 4 + 3] = rot;
    }
    n++;
  };
  return {
    mesh,
    begin(key) { n = 0; U.uKey.value = key; },
    // (x, y) in 3D (y up)
    chipRing(x, y, z, r, prog) { quad(x, y, z, r * 1.2, r * 1.2, 0, 0, r, clamp01(prog)); },
    gunRing(x, y, z, r) { quad(x, y, z, r * 1.2, r * 1.2, 0, 1, r); },
    crackRing(x, y, z, rx, ry) { quad(x, y, z, rx * 1.1, ry * 1.4, 0, 2, 0); },
    funnel(x, y, z, w, h, open, step) { quad(x, y + h / 2, z, w, h / 2, 0, 3, open ? 1 : 0, step); },
    sun(x, floorY, topY, z, w, inSun, step) { quad(x, (floorY + topY) / 2, z, w / 2, Math.max(1, (topY - floorY) / 2), 0, 4, inSun ? 1 : 0, step); },
    cone(x, y, z, ang, len, half, step) { quad(x + Math.cos(ang) * len / 2, y + Math.sin(ang) * len / 2, z, len / 2 + 20, len * Math.sin(half) + 40, ang, 5, len, half, step & 1); },
    throatRing(x, y, z, r) { quad(x, y, z, r * 1.3, r * 1.3, 0, 6, r); },
    end() {
      geo.setDrawRange(0, n * 6);
      geo.getAttribute('position').needsUpdate = geo.getAttribute('aA').needsUpdate = geo.getAttribute('aB').needsUpdate = true;
      mesh.visible = n > 0;
    },
    hide() { n = 0; geo.setDrawRange(0, 0); mesh.visible = false; },
    get count() { return n; },
    dispose() { geo.dispose(); mat.dispose(); mesh.removeFromParent(); },
  };
}
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

// ---- the cracks on the cliff's face ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// crack = { x, y (the cliff top, game px), w, t, T, seed }: the lines spread out from where the Wyrm will come, a step at a time (the 2D picture's, in ribbons). One draw call, depth tested against the rock.
const CMAX = 16 * 4 * 2 + 2;
export function createCliffCracks(parent) {
  const pos = new Float32Array(CMAX * 6 * 3), loc = new Float32Array(CMAX * 6 * 2), ord = new Float32Array(CMAX * 6 * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aP', new THREE.BufferAttribute(loc, 2));
  geo.setAttribute('aO', new THREE.BufferAttribute(ord, 4));
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const U = { uU: { value: 0 }, uInk: { value: new THREE.Color('#16202e') }, uIce: { value: new THREE.Color('#e4f4ff') }, uDeep: { value: new THREE.Color('#2a4a6a') } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 aP; attribute vec4 aO; varying vec2 vP; varying vec4 vO; void main() { vP = aP; vO = aO; gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `
      varying vec2 vP; varying vec4 vO; uniform float uU; uniform vec3 uInk, uIce, uDeep;
      void main() {
        // vO = kind (0 ink ribbon, 1 pale ribbon, 2 the split at the top), order at the start, order at the end, (the split: its width share)
        vec4 c = vec4( 0.0 );
        if ( vO.x < 1.5 ) {
          float along = vP.x * 0.5 + 0.5, ord = mix( vO.y, vO.z, along );
          if ( ord > uU + 0.001 ) discard;
          float edge = 1.0 - smoothstep( 0.55, 1.0, abs( vP.y ) );
          c = vec4( vO.x < 0.5 ? uInk : uIce, vO.x < 0.5 ? 0.95 : 0.9 * step( 0.15, edge ) );
        } else {
          float k = 0.25 + 0.75 * uU, d = length( vP / vec2( k, 1.0 ) );
          if ( d < 1.0 ) c = vec4( d < 0.6 ? uInk : uDeep, 0.92 ); else if ( d < 1.12 ) c = vec4( uIce, 0.9 );
        }
        if ( c.a < 0.02 ) discard;
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  mesh.name = 'wyrmCracks';
  parent.add(mesh);
  let built = null;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  let n = 0;
  const quad = (cx, cy, z, hw, hh, rot, kind, o0, o1) => {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (let k = 0; k < 6; k++) {
      const i = n * 6 + k, lx = corners[k][0] * hw, ly = corners[k][1] * hh;
      pos[i * 3] = cx + lx * cs - ly * sn; pos[i * 3 + 1] = cy + lx * sn + ly * cs; pos[i * 3 + 2] = z;
      loc[i * 2] = corners[k][0]; loc[i * 2 + 1] = corners[k][1];
      ord[i * 4] = kind; ord[i * 4 + 1] = o0; ord[i * 4 + 2] = o1;
    }
    n++;
  };
  function build(c, z) { // the same fan of fissures the 2D picture draws, in 3D (y up): each a polyline of four pieces; its order says when the stepped growth reaches it
    n = 0;
    const cx = c.x, top = -c.y, seed = c.seed | 0, cracks = 16;
    for (let k = 0; k < cracks; k++) {
      const h = hash(k * 37 + seed * 11, 5), a0 = -Math.PI * (0.06 + 0.88 * ((k * 0.381966) % 1)), len = 300 + 1700 * h, start = (k / cracks) * 0.4;
      let px = cx + (hash(k, seed) - 0.5) * 500, py = top - 40;
      for (let j = 0; j < 4; j++) {
        const jit = (hash(k * 13 + j * 29, seed) - 0.5) * 1.0, a = a0 + jit * 0.5, dx = Math.cos(a) * len / 4, dy = Math.sin(a) * len / 4 * 0.9, qx = px + dx, qy = py + dy;
        const o0 = start + (j / 4) * (1 - start), o1 = start + ((j + 1) / 4) * (1 - start), mx = (px + qx) / 2, my = (py + qy) / 2, ln = Math.hypot(dx, dy) / 2 + 12, rot = Math.atan2(dy, dx);
        quad(mx, my, z, ln, 22, rot, 0, o0, o1);
        quad(mx, my, z + 1, ln, 9, rot, 1, o0, o1);
        px = qx; py = qy;
      }
    }
    quad(cx, top + 30, z + 2, 700, 210, 0, 2, 0, 1);
    geo.setDrawRange(0, n * 6);
    ['position', 'aP', 'aO'].forEach((nm) => { geo.getAttribute(nm).needsUpdate = true; });
    built = c.seed + '|' + c.x;
  }
  return {
    mesh,
    show(c, z, step) { // step: eighths (0..8)
      const id = c.seed + '|' + c.x;
      if (built !== id) build(c, z);
      U.uU.value = Math.min(1, Math.max(0, step / 8));
      mesh.visible = true;
    },
    hide() { mesh.visible = false; built = null; },
    get visible() { return mesh.visible; },
    dispose() { geo.dispose(); mat.dispose(); mesh.removeFromParent(); },
  };
}
