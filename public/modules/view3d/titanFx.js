// THE ISLAND TITAN'S MARKS IN 3D (3D.md section 38): what the 2D game draws over the fight (render.js drawTitanFx) and the 3D view must draw itself, in ONE draw call: the RED RING where a boulder will land (dashed while it
// follows the ship, solid with a pulsing inner ring once it has locked), the GOLD FUNNEL over the roaring mouth (a faint column with dashed edges and, while the mouth is open, chevrons that step down into it), the dashed gold
// LANDING STRIP along the island's top, and the cyan ring round the crystal (dashed, with a green arc that fills as a man holds the hack). Each is a quad with its own little fragment program (kind in aA.x); the pulse and
// the chevrons move on the 8 a second key (uKey), never a sine of time. Always drawn over the picture (depth test off, like the grip rings and the 2D game), nothing is drawn when there is nothing to show.
import { THREE } from './style.js';

const TAU = Math.PI * 2;
const MAX = 10;

export function createTitanOverlay(parent, P) {
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
  const U = { uKey: { value: 0 }, uFA: { value: new THREE.Vector2(P.FUNNEL ? P.FUNNEL.ALPHA : 0.06, P.FUNNEL ? P.FUNNEL.ALPHA_OPEN : 0.16) }, uRed: { value: col(P.RING ? P.RING.COLOR : '#ff4d4d') }, uPale: { value: col(P.RING ? P.RING.LOCKED : '#ffd0d0') }, uGold: { value: col(P.FUNNEL ? P.FUNNEL.COLOR : '#ffd23f') }, uInk: { value: col('#1a1620') }, uCyan: { value: col('#7fe8ff') }, uGreen: { value: col('#8fe388') } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 aP; attribute vec4 aA; attribute vec4 aB; varying vec2 vP; varying vec4 vA; varying vec4 vB; void main() { vP = aP; vA = aA; vB = aB; gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `
      varying vec2 vP; varying vec4 vA; varying vec4 vB;
      uniform float uKey; uniform vec2 uFA; uniform vec3 uRed, uPale, uGold, uInk, uCyan, uGreen;
      void main() {
        // vA = kind, half width, half height, p1; vB = p2, p3, p4, 0   (kind 0 ring following, 1 ring locked, 2 funnel, 3 strip, 4 crystal ring)
        vec2 q = vP * vA.yz;
        float kind = vA.x, pulse = mod( floor( uKey ), 2.0 );
        vec4 c = vec4( 0.0 );
        if ( kind < 1.5 ) {
          float d = length( q ), r = vA.w, a = fract( atan( q.x, q.y ) / ${TAU.toFixed(5)} );
          if ( kind < 0.5 ) {
            float dash = step( 0.5, fract( a * 16.0 ) );
            if ( step( abs( d - r ), 17.0 ) * dash > 0.5 ) c = vec4( uInk, 1.0 );
            if ( step( abs( d - r ), 10.0 ) * dash > 0.5 ) c = vec4( uRed, 1.0 );
          } else {
            float r2 = r * ( 0.45 + 0.1 * pulse );
            if ( step( abs( d - r ), 26.0 ) > 0.5 || step( abs( d - r2 ), 17.0 ) > 0.5 ) c = vec4( uInk, 1.0 );
            if ( step( abs( d - r ), 17.0 ) > 0.5 || step( abs( d - r2 ), 9.0 ) > 0.5 ) c = vec4( uRed, 1.0 );
            if ( step( abs( d - r ), 6.0 ) > 0.5 ) c = vec4( uPale, 1.0 );
          }
        } else if ( kind < 2.5 ) { // the funnel: the quad runs from the mouth (bottom) up; vA.w = 1 while the mouth is open, vB.x = the chevrons' step
          float W = vA.y - 0.0, H = vA.z * 2.0, h = q.y + vA.z, open = vA.w;
          float fade = 1.0 - 0.55 * ( h / H );
          c = vec4( uGold, mix( uFA.x, uFA.y, open ) * fade );
          if ( step( abs( abs( q.x ) - ( W - 10.0 ) ), 9.0 ) * step( 0.5, fract( h / 110.0 ) ) > 0.5 ) c = vec4( uGold, 0.95 );
          if ( open > 0.5 ) for ( int k = 0; k < 3; k++ ) {
            float hc = 260.0 + float( k ) * 420.0 - vB.x * 80.0, hl = hc - 40.0 + 130.0 * abs( q.x ) / 150.0;
            if ( abs( q.x ) < 150.0 && abs( h - hl ) < 11.0 ) c = vec4( uGold, 0.95 );
          }
        } else if ( kind < 3.5 ) { // the landing strip: a dashed line
          float dash = step( 0.5, fract( ( q.x + vA.y ) / 120.0 ) );
          if ( dash > 0.5 && abs( q.y ) < 7.0 ) c = vec4( uGold, 0.95 );
        } else { // the crystal's ring: dashed cyan, and the green arc of the hack inside
          float d = length( q ), r = vA.w, a = fract( atan( q.x, q.y ) / ${TAU.toFixed(5)} );
          if ( step( abs( d - r ), 8.0 ) * step( 0.5, fract( a * 22.0 ) ) > 0.5 ) c = vec4( uCyan, 0.95 );
          if ( vB.x > 0.02 && step( abs( d - r * 0.8 ), 12.0 ) * step( a, vB.x ) > 0.5 ) c = vec4( uGreen, 1.0 );
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
  mesh.name = 'titanMarks';
  parent.add(mesh);
  let n = 0;
  const quad = (cx, cy, cz, hw, hh, kind, p1, b0 = 0, b1 = 0) => {
    if (n >= MAX || !Number.isFinite(cx) || !Number.isFinite(cy)) return;
    for (let k = 0; k < 6; k++) {
      const i = n * 6 + k, x = cx + corners[k][0] * hw, y = cy + corners[k][1] * hh;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = cz;
      A[i * 4] = kind; A[i * 4 + 1] = hw; A[i * 4 + 2] = hh; A[i * 4 + 3] = p1;
      B[i * 4] = b0; B[i * 4 + 1] = b1;
    }
    n++;
  };
  return {
    mesh,
    begin(key) { n = 0; U.uKey.value = key; },
    // (x, y) 3D (y up); r = the ring's radius
    ring(x, y, z, r, locked) { quad(x, y, z, r * 1.2, r * 1.2, locked ? 1 : 0, r); },
    funnel(x, y, z, w, h, open, step) { quad(x, y + h / 2, z, w, h / 2, 2, open ? 1 : 0, step); },
    strip(x0, x1, y, z) { quad((x0 + x1) / 2, y, z, Math.max(1, (x1 - x0) / 2), 14, 3, 0); },
    crystalRing(x, y, z, r, prog) { quad(x, y, z, r * 1.1, r * 1.1, 4, r, prog); },
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
