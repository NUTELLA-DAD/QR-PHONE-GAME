// THE CREATURE'S FLAT EFFECTS (WP8): small draw-call-cheap things that sit on the water or over the picture, each ONE mesh however many there are.
//   FoamRings    instanced flat rings on the sea where a limb or the body crosses the sea line (a scalloped foam collar and a broken outer ring; fixed shapes: they only follow what makes them)
//   ShadowDecal  the breach shadow: a dark double ellipse on the water with ripple rings (stepped at 8 fps, linear growth), growing darker as the lunge nears
//   GripMarkers  billboards over the ship where a tentacle is about to grab (a dashed red ring) and the grip's timer (a ring that empties, gold then red, with the hack progress inside)
//   RopeSet      the harpoon lines: tubes from the ship's gun to the hooked part, hanging in a curve when slack and straight when taut
// No time-driven wobble anywhere: the only times used are the stepped 8 fps keys given by the view.
import { THREE, outlineMat, toonVC, plainVC } from './style.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- foam rings --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function createFoamRings(parent, uniforms, max = 40) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
  const A = new Float32Array(max * 4), B = new Float32Array(max * 4);
  const aA = new THREE.InstancedBufferAttribute(A, 4).setUsage(THREE.DynamicDrawUsage), aB = new THREE.InstancedBufferAttribute(B, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aA', aA); geo.setAttribute('aB', aB);
  geo.instanceCount = 0;
  const U = { uY: { value: 0 }, uFoam: uniforms.uFoam, uLevel: uniforms.uLevel, uBand: uniforms.uBand, uAlpha: uniforms.uAlpha };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, uniforms: U,
    vertexShader: `
      attribute vec4 aA; attribute vec4 aB; varying vec2 vP; varying vec4 vB; uniform float uY;
      void main() {
        float K = 1.55; // (the quad reaches past the ring: the outer broken ring)
        vP = position.xz;
        vB = aB;
        float c = cos( aB.x ), s = sin( aB.x );
        vec2 q = vec2( position.x * aA.z * K, position.z * aA.w * K );
        vec2 w = vec2( c * q.x - s * q.y, s * q.x + c * q.y );
        gl_Position = projectionMatrix * viewMatrix * vec4( aA.x + w.x, uY, aA.y + w.y, 1.0 );
      }`,
    fragmentShader: `
      varying vec2 vP; varying vec4 vB; uniform vec3 uFoam; uniform float uLevel, uBand, uAlpha;
      void main() {
        float d = length( vP ) * 1.55;
        float ang = atan( vP.y, vP.x ) / ${TAU.toFixed(5)} + vB.z;
        float sc = step( 0.5, fract( ang * 9.0 ) );
        float r1 = 1.0 - 0.07 * sc, r0 = r1 - ( vB.w > 0.0 ? vB.w : uBand );
        float ring = step( d, r1 ) * step( r0, d );
        float outer = step( 1.0, d ) * step( d, 1.0 + 0.16 ) * step( 0.55, fract( ang * 5.0 + 0.3 ) );
        float on = max( ring, outer * 0.85 ) * vB.y;
        if ( on < 0.5 ) discard;
        gl_FragColor = vec4( uFoam * uLevel, uAlpha );
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  parent.add(mesh);
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    // a ring of the given semi-axes (x and z, world units) turned by angle about the vertical, strength 0..1 (below 0.5 it is not drawn), seed = where its scallops start, band = the width of the collar as a share of the radius (0 = the default)
    add(cx, cz, rx, rz, angle, strength, seed, band = 0) {
      if (n >= max || !Number.isFinite(cx) || !Number.isFinite(rx) || !(rx > 1)) return;
      A[n * 4] = cx; A[n * 4 + 1] = cz; A[n * 4 + 2] = clamp(rx, 4, 2400); A[n * 4 + 3] = clamp(rz, 4, 2400);
      B[n * 4] = angle || 0; B[n * 4 + 1] = strength; B[n * 4 + 2] = seed || 0; B[n * 4 + 3] = band;
      n++;
    },
    end(y) {
      geo.instanceCount = n;
      aA.needsUpdate = aB.needsUpdate = true;
      U.uY.value = y + 1.6;
      mesh.visible = n > 0;
    },
    get count() { return n; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// ---- the breach shadow ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function createShadowDecal(parent, uniforms) {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  const U = { uC: { value: new THREE.Vector4(0, 0, 1, 1) }, uPr: { value: 0 }, uKey: { value: 0 }, uCol: uniforms.uShadow, uAlpha: uniforms.uShadowAlpha, uFoam: uniforms.uFoam, uLevel: uniforms.uLevel };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, uniforms: U,
    vertexShader: `varying vec2 vP; void main() { vP = position.xz * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `
      varying vec2 vP; uniform vec4 uC; uniform float uPr, uKey, uAlpha; uniform vec3 uCol, uFoam; uniform float uLevel;
      void main() {
        float d = length( vP );
        float core = step( d, 0.58 ), halo = step( d, 1.0 );
        float a = ( halo * 0.5 + core * 0.5 ) * uAlpha * ( 0.45 + 0.55 * uPr );
        vec3 c = uCol;
        // ripple rings: they restart every 0.9 s (stepped to 8 steps), growing at a constant speed
        float ring = 0.0;
        for ( int k = 0; k < 3; k++ ) {
          float u = fract( uKey * 1.1 + float( k ) / 3.0 );
          u = floor( u * 8.0 ) / 8.0;
          float r = 0.3 + 0.7 * u;
          ring = max( ring, step( abs( d - r ), 0.035 ) * ( 1.0 - u ) );
        }
        if ( ring > 0.25 ) { c = uFoam * uLevel; a = max( a, 0.8 * ring ); }
        if ( a < 0.02 || d > 1.0 ) discard;
        gl_FragColor = vec4( c, a );
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  parent.add(mesh);
  return {
    mesh,
    hide() { mesh.visible = false; },
    // centre (x, z) at height y, semi-axes rx, rz, pr 0..1 how near the lunge is, key = the stepped time in seconds
    set(x, y, z, rx, rz, pr, key) {
      mesh.visible = true;
      mesh.position.set(x, y + 1.0, z);
      mesh.scale.set(rx * 2, 1, rz * 2);
      U.uPr.value = pr; U.uKey.value = key;
    },
    dispose() { g.dispose(); mat.dispose(); },
  };
}

// ---- grip markers (over the ship) ----------------------------------------------------------------------------------------------------------------------------------------------------------------
export function createGripMarkers(parent, max = 4) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  const A = new Float32Array(max * 4), B = new Float32Array(max * 4);
  const aA = new THREE.InstancedBufferAttribute(A, 4).setUsage(THREE.DynamicDrawUsage), aB = new THREE.InstancedBufferAttribute(B, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aA', aA); geo.setAttribute('aB', aB);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec4 aA; attribute vec4 aB; varying vec2 vP; varying vec4 vB; void main() { vP = position.xy; vB = aB; gl_Position = projectionMatrix * viewMatrix * vec4( aA.xyz + vec3( position.xy * aA.w, 0.0 ), 1.0 ); }`,
    fragmentShader: `
      varying vec2 vP; varying vec4 vB;
      // vB: x = mode (0 windup, 1 hold), y = share of the hold left, z = hack progress, w = pulse (0 / 1, stepped)
      float arc( float d, float r, float w, float a, float frac ) { return step( abs( d - r ), w ) * step( a, frac ); }
      void main() {
        float d = length( vP ) * 200.0, a = fract( atan( vP.x, vP.y ) / ${TAU.toFixed(5)} );
        vec4 c = vec4( 0.0 );
        if ( vB.x < 0.5 ) { // about to grab: a dashed red ring
          float r = 150.0 + 24.0 * vB.w;
          float dash = step( 0.5, fract( a * 12.0 ) );
          float on = step( abs( d - r ), 9.0 ) * dash;
          float ink = step( abs( d - r ), 15.0 ) * dash;
          if ( ink > 0.5 ) c = vec4( on > 0.5 ? vec3( 1.0, 0.3, 0.3 ) : vec3( 0.08, 0.06, 0.1 ), 1.0 );
        } else { // held: the ring that empties, the green hack arc inside
          float ink = step( abs( d - 130.0 ), 17.0 );
          float arcA = step( abs( d - 130.0 ), 10.0 ) * step( a, vB.y );
          float hack = step( abs( d - 88.0 ), 8.0 ) * step( a, vB.z ) * step( 0.02, vB.z );
          if ( ink > 0.5 ) c = vec4( 0.08, 0.06, 0.1, 1.0 );
          if ( arcA > 0.5 ) c = vec4( vB.y > 0.4 ? vec3( 1.0, 0.82, 0.25 ) : vec3( 1.0, 0.23, 0.19 ), 1.0 );
          if ( hack > 0.5 ) c = vec4( 0.56, 0.89, 0.53, 1.0 );
        }
        if ( c.a < 0.5 ) discard;
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.visible = false;
  parent.add(mesh);
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    add(x, y, z, mode, frac, prog, pulse) {
      if (n >= max || !Number.isFinite(x) || !Number.isFinite(y)) return;
      A[n * 4] = x; A[n * 4 + 1] = y; A[n * 4 + 2] = z; A[n * 4 + 3] = 200;
      B[n * 4] = mode; B[n * 4 + 1] = clamp(frac, 0, 1); B[n * 4 + 2] = clamp(prog, 0, 1); B[n * 4 + 3] = pulse ? 1 : 0;
      n++;
    },
    end() { geo.instanceCount = n; aA.needsUpdate = aB.needsUpdate = true; mesh.visible = n > 0; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// ---- the harpoon lines -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function createRopeSet(parent, maxRopes = 3, rings = 18, sides = 6, ow = 7) {
  const per = rings * (sides + 1), total = per * maxRopes;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), ono = new Float32Array(total * 3);
  const idx = [];
  for (let k = 0; k < maxRopes; k++) for (let r = 0; r < rings - 1; r++) for (let s = 0; s < sides; s++) { const a = k * per + r * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('onormal', new THREE.BufferAttribute(ono, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mesh = new THREE.Mesh(geo, toonVC);
  mesh.frustumCulled = false;
  mesh.userData.toon = toonVC;
  mesh.userData.plain = plainVC;
  const ink = new THREE.Mesh(geo, outlineMat);
  ink.userData.isOutline = true;
  ink.frustumCulled = false;
  const g = new THREE.Group();
  g.add(mesh, ink);
  g.visible = false;
  parent.add(g);
  const tan = new THREE.Color('#d6bf8a'), dark = new THREE.Color('#a88e5c'), iron = new THREE.Color('#3a3a44'), taut = new THREE.Color('#f2b04a');
  const A = new THREE.Vector3(), Bv = new THREE.Vector3(), P = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), W = new THREE.Vector3();
  let n = 0;
  return {
    group: g,
    begin() { n = 0; },
    // from a to b ({x, y, z} in 3D), thickness r, sag = how far the middle hangs (world units), tension 0..1 (a taut line is paler gold)
    add(a, b, r, sag, tension) {
      if (n >= maxRopes) return;
      A.set(a.x, a.y, a.z); Bv.set(b.x, b.y, b.z);
      const len = A.distanceTo(Bv);
      if (!(len > 1) || !Number.isFinite(len)) return;
      const base = n * per;
      T.copy(Bv).sub(A).normalize();
      N1.set(0, 1, 0); if (Math.abs(T.dot(N1)) > 0.95) N1.set(1, 0, 0);
      N1.addScaledVector(T, -N1.dot(T)).normalize(); N2.copy(T).cross(N1);
      for (let i = 0; i < rings; i++) {
        const u = i / (rings - 1);
        P.copy(A).lerp(Bv, u); P.y -= 4 * u * (1 - u) * sag;
        const rr = i === rings - 1 ? r * 2.6 : r, c = i === rings - 1 ? iron : tension > 0.5 ? taut : i % 2 ? dark : tan;
        for (let s = 0; s <= sides; s++) {
          const a2 = (s / sides) * TAU, cs = Math.cos(a2), sn = Math.sin(a2), o = (base + i * (sides + 1) + s) * 3;
          W.set(N1.x * cs + N2.x * sn, N1.y * cs + N2.y * sn, N1.z * cs + N2.z * sn);
          pos[o] = P.x + W.x * rr; pos[o + 1] = P.y + W.y * rr; pos[o + 2] = P.z + W.z * rr;
          nor[o] = W.x; nor[o + 1] = W.y; nor[o + 2] = W.z;
          ono[o] = W.x * ow; ono[o + 1] = W.y * ow; ono[o + 2] = W.z * ow;
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        }
      }
      n++;
    },
    end() {
      for (let k = n; k < maxRopes; k++) { pos.fill(0, k * per * 3, (k + 1) * per * 3); ono.fill(0, k * per * 3, (k + 1) * per * 3); }
      geo.getAttribute('position').needsUpdate = geo.getAttribute('normal').needsUpdate = geo.getAttribute('onormal').needsUpdate = geo.getAttribute('color').needsUpdate = true;
      g.visible = n > 0;
    },
    dispose() { geo.dispose(); },
  };
}
