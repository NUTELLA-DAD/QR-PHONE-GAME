// THE MYCELIAL MOTHER'S MARKS IN 3D (3D.md section 41): what the 2D game draws over the fight (render.js drawMotherFx) and the 3D view must draw itself, in ONE draw call of rotatable quads, each with its own little fragment
// program (the kind in aA.x), always over the picture (depth test off, like the grip rings and the 2D game). Everything that moves does so on the 8 a second key (uKey), never a sine of time:
//   0  the SPORE RING   a red dashed ellipse on the ship where the cloud will fall (it grows with the telegraph)
//   1  a SPORE CLOUD    a sheet of soft lime and cream puffs inside an ellipse, glinting spores falling through it, a dashed dark-green rim; gold when a flame burns it off
//   2  a WIND CHEVRON   a broad chevron blowing toward one side (dashed gold while the wings spread, solid pale lime and drifting while they beat)
//   3  a HALO           a soft round glow (orange round a burning tendril, lime round a spore burst)
//   4  the HEART RING   a dashed ring round the spore heart with a green arc that fills as a boarder strikes
// Each is a quad: centre, half sizes, rotation, kind, then up to four numbers for the program.
import { THREE } from './style.js';

const MAX = 72;
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

export function createMotherMarks(parent, P) {
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
  const U = {
    uKey: { value: 0 }, uInk: { value: col('#1d1426') }, uRed: { value: col(P.ring || '#ff4d4d') }, uSpore: { value: col(P.spore || '#c8ff8a') }, uSporeLt: { value: col(P.sporeLt || '#f2ffd0') }, uSporeDk: { value: col(P.sporeDk || '#4a7a2a') },
    uFlash: { value: col(P.sporeFlash || '#ffd23f') }, uGold: { value: col('#ffd23f') }, uFire: { value: col(P.burnHot || '#ff8a30') }, uGreen: { value: col('#8fe388') }, uPale: { value: col('#e8f8c8') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 aP; attribute vec4 aA; attribute vec4 aB; varying vec2 vP; varying vec4 vA; varying vec4 vB; void main() { vP = aP; vA = aA; vB = aB; gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `
      varying vec2 vP; varying vec4 vA; varying vec4 vB;
      uniform float uKey; uniform vec3 uInk, uRed, uSpore, uSporeLt, uSporeDk, uFlash, uGold, uFire, uGreen, uPale;
      float hsh( float n ) { n = fract( n * 0.1031 ); n *= n + 33.33; n *= n + n; return fract( n ); }
      float dashes( float a, float n ) { return step( 0.5, fract( a * n ) ); }
      void main() {
        // vA = kind, half width, half height, p1; vB = p2, p3, p4, rot
        vec2 q = vP * vA.yz;
        float kind = vA.x, pulse = mod( floor( uKey ), 2.0 );
        vec4 c = vec4( 0.0 );
        if ( kind < 0.5 ) { // the spore ring: a dashed red ellipse (vA.w = how far the telegraph has come, 0..1)
          vec2 e = vec2( vA.y, vA.z ) * 0.92;
          float k0 = length( q / e ), k1 = length( q / ( e * e ) ), dist = k0 * ( k0 - 1.0 ) / max( k1, 1e-5 ), a = fract( atan( q.y / e.y, q.x / e.x ) / 6.28318 );
          float dash = dashes( a + 0.04 * pulse, 18.0 );
          if ( step( abs( dist ), 13.0 ) * dash > 0.5 ) c = vec4( uInk, 1.0 );
          if ( step( abs( dist ), 7.5 ) * dash > 0.5 ) c = vec4( uRed, 1.0 );
          if ( c.a < 0.5 && k0 < 1.0 ) c = vec4( uRed, 0.05 + 0.05 * vA.w );
        } else if ( kind < 1.5 ) { // a spore cloud: soft puffs, spores falling through, a dashed rim. vB.x = the seed, vB.y = 1 once flame has burnt it, vB.z = opacity, vA.w = grow
          vec2 e = q / vec2( vA.y, vA.z ) * 1.1; // (-1.1 .. 1.1: the ellipse is the unit circle of e)
          float seed = vB.x, key = floor( uKey ), fl = vB.y, op = vB.z;
          vec3 base = mix( uSpore, uFlash, fl );
          float dens = 0.0, densL = 0.0; vec2 lo = vec2( 0.06, -0.08 ); // (the second sample, a little toward the lower right: what it loses is the lit edge on the upper left)
          for ( int k = 0; k < 14; k++ ) {
            float fk = float( k ), r = sqrt( hsh( seed * 3.1 + fk * 7.7 ) ) * 0.7, an = hsh( seed * 5.3 + fk * 3.3 ) * 6.28318;
            vec2 cc = vec2( cos( an ), sin( an ) ) * r + ( vec2( hsh( fk + mod( key, 3.0 ) * 11.0 + seed ), hsh( fk * 1.7 + mod( key, 3.0 ) * 5.0 + seed ) ) - 0.5 ) * 0.1;
            float rho = 0.3 + 0.2 * hsh( seed + fk * 2.9 );
            dens += 1.0 - smoothstep( rho * 0.35, rho, length( e - cc ) );
            densL += 1.0 - smoothstep( rho * 0.35, rho, length( e + lo - cc ) );
          }
          float inside = 1.0 - smoothstep( 0.86, 1.0, length( e ) );
          float body = smoothstep( 0.32, 0.62, dens ) * inside, rim = clamp( ( dens - densL ) * 2.2 + 0.0, 0.0, 1.0 );
          if ( body > 0.02 ) c = vec4( mix( base, uSporeLt, rim * 0.75 ), ( 0.3 + 0.2 * rim ) * op * body );
          // spores: bright specks drifting down in steps
          for ( int k = 0; k < 22; k++ ) {
            float fk = float( k ), x = ( hsh( seed * 2.3 + fk * 4.1 ) - 0.5 ) * 1.7, y = 0.85 - fract( hsh( seed + fk * 9.1 ) + key * ( 0.045 + 0.03 * hsh( fk ) ) ) * 1.7;
            if ( length( vec2( x, y ) ) < 0.95 && length( ( e - vec2( x, y ) ) * vec2( vA.y, vA.z ) ) < 11.0 ) c = vec4( mix( uSporeLt, uFlash, fl ), 0.95 * op );
          }
          float d = length( e ), a = fract( atan( e.y, e.x ) / 6.28318 );
          if ( abs( d - 0.97 ) < 0.022 && dashes( a, 22.0 ) > 0.5 ) c = vec4( uSporeDk, 0.85 * op );
        } else if ( kind < 2.5 ) { // a wind chevron: vA.w = the side it blows to (+1 right, -1 left), vB.x = 1 while the wings are only spread (dashed, gold), vB.y = opacity
          float dir = vA.w, w = vA.y, h = vA.z, x = q.x * dir, y = abs( q.y );
          float line = x - ( w * 0.55 - y * ( w * 1.1 / h ) ); // (the apex is on the right of the quad: it points the way the wind blows)
          float thick = 20.0;
          if ( abs( line ) < thick * 1.5 && abs( q.y ) < h ) {
            float along = y / h;
            float dash = vB.x > 0.5 ? step( 0.5, fract( along * 3.0 ) ) : 1.0;
            vec3 colr = vB.x > 0.5 ? uGold : uPale;
            if ( abs( line ) < thick * 1.5 ) c = vec4( uInk, 0.9 * vB.y * dash );
            if ( abs( line ) < thick * 0.7 ) c = vec4( colr, vB.y * dash );
          }
        } else if ( kind < 3.5 ) { // a soft halo (vA.w: 0 fire orange, 1 spore lime, 2 gold)
          float d = length( q ) / vA.y, f = vA.w;
          vec3 hc = f < 0.5 ? uFire : f < 1.5 ? uSpore : uGold;
          float a = ( 1.0 - smoothstep( 0.15, 1.0, d ) ) * vB.x;
          c = vec4( hc, a * 0.55 );
        } else { // the spore heart's ring: dashed, with a green arc of progress (vA.w = the radius, vB.x = progress)
          float d = length( q ), r = vA.w, a = fract( atan( q.x, q.y ) / 6.28318 );
          float dash = dashes( a, 14.0 );
          if ( step( abs( d - r ), 17.0 ) * dash > 0.5 ) c = vec4( uInk, 1.0 );
          if ( step( abs( d - r ), 10.0 ) * dash > 0.5 ) c = vec4( uPale, 1.0 );
          if ( vB.x > 0.02 && step( abs( d - r * 0.8 ), 14.0 ) * step( a, vB.x ) > 0.5 ) c = vec4( uGreen, 1.0 );
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
  mesh.name = 'motherMarks';
  parent.add(mesh);
  let n = 0;
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
    ring(x, y, z, rx, ry, u) { quad(x, y, z, rx * 1.12, ry * 1.12, 0, 0, clamp01(u)); },
    cloud(x, y, z, rx, ry, id, flash, opacity) { quad(x, y, z, rx * 1.1, ry * 1.1, 0, 1, 1, (id * 1.37) % 97 + 1, flash ? 1 : 0, clamp01(opacity)); },
    chevron(x, y, z, w, h, dir, dashed, opacity) { quad(x, y, z, w, h, 0, 2, dir < 0 ? -1 : 1, dashed ? 1 : 0, clamp01(opacity)); },
    halo(x, y, z, r, kind, opacity) { quad(x, y, z, r, r, 0, 3, kind, clamp01(opacity)); },
    heartRing(x, y, z, r, prog) { quad(x, y, z, r * 1.3, r * 1.3, 0, 4, r, clamp01(prog)); },
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
