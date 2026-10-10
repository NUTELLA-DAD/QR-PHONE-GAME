// Post-processing: ONE EffectComposer in a fixed order (3D.md section 1, the "painted storybook" finish).
//
//   RenderPass   the scene, in floating point (lights, shadows, fog)
//   Bloom        a small blur chain at quarter and eighth size (MiniBloom below; UnrealBloomPass cost 3x as much), threshold ~0.92: only emissive things glow (lanterns, fire, the boiler's firebox, the lamps, the Kraken's eyes). It is added back inside the grade pass.
//   Grade        ONE fused pass: NeutralToneMapping (exposure per environment) + the sRGB conversion + the procedural 16x16x16 colour-grade table of the environment (built here in code from
//                config.LOOK3D) + the finish: a little shadow desaturation, the vignette and STATIC paper grain (a fixed picture, never animated)
//   AA           SMAA (High) or FXAA (Medium); none on Low
//
// Why one fused pass and not OutputPass + LUTPass + a finish pass: every full-screen pass costs a read and a write of the whole picture (about 0.4 ms each at 1080p on the dev laptop's
// graphics), and the three of them did the same job as one. The grade and finish work on the picture AFTER the tone mapping (a 16-step table in raw light values would band).
// No SSAO, no depth of field. Low keeps only the RenderPass and the grade. Every feature has a kill-switch in style.js `look` and a tier flag in quality.js. If the composer cannot be
// built the view draws directly (index.js), with the materials doing the tone mapping.
import { THREE, look } from './style.js';
import { config } from '../../config.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// ---- the colour grade as a 16x16x16 table ------------------------------------------------------------------------------------------------------------------------
const LUT_N = 16;
const lutCache = new Map();
const smooth = (v) => v * v * (3 - 2 * v);
const lumaOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const tintFactor = (hex) => { const c = new THREE.Color(hex); c.convertLinearToSRGB(); const l = Math.max(0.05, lumaOf(c.r, c.g, c.b)); return [c.r / l, c.g / l, c.b / l]; }; // (a luminance-preserving multiplier: pushes colour toward the tint without changing brightness)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// grade = { shadow, shadowAmt, high, highAmt, sat, contrast, lift } (config.LOOK3D.<env>.grade). Works on sRGB values 0..1.
export function lutFor(grade) {
  const key = JSON.stringify(grade);
  if (lutCache.has(key)) return lutCache.get(key);
  const G = grade, N = LUT_N;
  const sh = tintFactor(G.shadow), hi = tintFactor(G.high);
  const data = new Uint16Array(N * N * N * 4);
  let i = 0;
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    let c = [r / (N - 1), g / (N - 1), b / (N - 1)];
    c = c.map((v) => v + (smooth(v) - v) * G.contrast * 3); // a soft S-curve
    c = c.map((v) => v * (1 - G.lift) + G.lift); // lifted blacks (faded, like paint)
    const l = lumaOf(c[0], c[1], c[2]);
    c = c.map((v) => l + (v - l) * G.sat);
    const sw = (1 - l) * (1 - l) * G.shadowAmt, hw = l * l * G.highAmt;
    c = c.map((v, k) => v + (v * sh[k] - v) * sw);
    c = c.map((v, k) => v + (v * hi[k] - v) * hw);
    data[i++] = THREE.DataUtils.toHalfFloat(clamp01(c[0])); data[i++] = THREE.DataUtils.toHalfFloat(clamp01(c[1])); data[i++] = THREE.DataUtils.toHalfFloat(clamp01(c[2])); data[i++] = THREE.DataUtils.toHalfFloat(1);
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat; t.type = THREE.HalfFloatType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false; t.unpackAlignment = 1;
  t.needsUpdate = true;
  lutCache.set(key, t);
  return t;
}

// ---- the paper grain: a FIXED noise picture (seeded, lightly smoothed like paper fibre), tiled over the screen; it never moves or changes ---------------------------------------
function grainTexture() {
  const N = 256, a = new Float32Array(N * N);
  let s = 0x9e3779b9;
  for (let i = 0; i < a.length; i++) { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x7f4a7c15) | 0; a[i] = ((s >>> 8) & 0xffff) / 65535; }
  const out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const at = (xx, yy) => a[((yy + N) % N) * N + ((xx + N) % N)];
    const v = (at(x, y) * 2 + at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 6;
    out[y * N + x] = Math.round(clamp01(0.5 + (v - 0.5) * 3.2) * 255); // (re-stretched after the smoothing)
  }
  const t = new THREE.DataTexture(out, N, N, THREE.RedFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// ---- the bloom: a small, cheap chain (about a third of the cost of UnrealBloomPass: no full-resolution blend pass) -----------------------------------------------------------
// 1) the bright part (what is more than `threshold` brighter than the picture's own light: only emissives) at QUARTER size, 2) a soft blur there, 3) the same again at EIGHTH size
// (a wide glow). The grade pass adds both back in before the tone mapping. needsSwap is false: it only makes the two glow pictures, it does not touch the scene picture.
const BLOOM_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const BLOOM_BRIGHT = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
  vec3 pick( vec2 uv ) { vec3 c = max( texture2D( tDiffuse, uv ).rgb, 0.0 ); float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); return c * ( max( l - uThreshold, 0.0 ) / max( l, 0.0001 ) ); }
  void main() { vec3 s = pick( vUv + uTexel * vec2( -1.0, -1.0 ) ) + pick( vUv + uTexel * vec2( 1.0, -1.0 ) ) + pick( vUv + uTexel * vec2( -1.0, 1.0 ) ) + pick( vUv + uTexel * vec2( 1.0, 1.0 ) ); gl_FragColor = vec4( s * 0.25, 1.0 ); }
`;
const BLOOM_BLUR = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
  void main() { vec3 c = texture2D( tDiffuse, vUv ).rgb * 0.2270270270; c += ( texture2D( tDiffuse, vUv + uDir * 1.3846153846 ).rgb + texture2D( tDiffuse, vUv - uDir * 1.3846153846 ).rgb ) * 0.3162162162; c += ( texture2D( tDiffuse, vUv + uDir * 3.2307692308 ).rgb + texture2D( tDiffuse, vUv - uDir * 3.2307692308 ).rgb ) * 0.0702702703; gl_FragColor = vec4( c, 1.0 ); }
`;
class MiniBloom extends Pass {
  constructor(threshold) {
    super();
    this.needsSwap = false;
    const mk = () => new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.a = mk(); this.b = mk(); this.c = mk(); this.d = mk();
    this.bright = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: threshold } }, vertexShader: BLOOM_VERT, fragmentShader: BLOOM_BRIGHT, depthTest: false, depthWrite: false });
    this.blur = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: BLOOM_VERT, fragmentShader: BLOOM_BLUR, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.bright);
    this.size = { w: 2, h: 2 };
  }
  get threshold() { return this.bright.uniforms.uThreshold.value; }
  set threshold(v) { this.bright.uniforms.uThreshold.value = v; }
  setSize(w, h) {
    this.size.w = w; this.size.h = h;
    const qw = Math.max(2, Math.round(w / 4)), qh = Math.max(2, Math.round(h / 4)), ew = Math.max(2, Math.round(w / 8)), eh = Math.max(2, Math.round(h / 8));
    this.a.setSize(qw, qh); this.b.setSize(qw, qh); this.c.setSize(ew, eh); this.d.setSize(ew, eh);
  }
  run(renderer, mat, from, to) { this.quad.material = mat; mat.uniforms.tDiffuse.value = from.texture; renderer.setRenderTarget(to); this.quad.render(renderer); }
  render(renderer, writeBuffer, readBuffer) {
    const { a, b, c, d, bright, blur } = this;
    bright.uniforms.uTexel.value.set(1 / this.size.w, 1 / this.size.h);
    this.run(renderer, bright, readBuffer, a); // the bright part, quarter size
    blur.uniforms.uDir.value.set(1 / a.width, 0); this.run(renderer, blur, a, b);
    blur.uniforms.uDir.value.set(0, 1 / a.height); this.run(renderer, blur, b, a); // (a = the tight glow)
    blur.uniforms.uDir.value.set(1 / a.width, 0); this.run(renderer, blur, a, c); // (smaller target: this is also the down-sample)
    blur.uniforms.uDir.value.set(0, 1 / c.height); this.run(renderer, blur, c, d);
    blur.uniforms.uDir.value.set(1 / c.width, 0); this.run(renderer, blur, d, c);
    blur.uniforms.uDir.value.set(0, 1 / c.height); this.run(renderer, blur, c, d); // (d = the wide glow)
  }
  dispose() { for (const t of [this.a, this.b, this.c, this.d]) t.dispose(); this.bright.dispose(); this.blur.dispose(); this.quad.dispose(); }
}

// The fused grade pass. (The tone-mapping function is three's own NeutralToneMapping, written out so the exposure and the sky planes' compensation, style.js paintedPlane, agree with it.)
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null }, tGrain: { value: null }, tLut: { value: null }, tGlow1: { value: null }, tGlow2: { value: null }, uGlow: { value: 0 },
    uExposure: { value: 1 }, uLut: { value: 1 }, uVig: { value: 0.16 }, uGrain: { value: 0.022 }, uDesat: { value: 0.18 }, uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D tGrain; uniform sampler3D tLut; uniform sampler2D tGlow1; uniform sampler2D tGlow2; uniform float uGlow;
    uniform float uExposure; uniform float uLut; uniform float uVig; uniform float uGrain; uniform float uDesat; uniform float uAspect;
    varying vec2 vUv;
    vec3 neutralTone( vec3 color ) {
      const float StartCompression = 0.8 - 0.04;
      const float Desaturation = 0.15;
      color *= uExposure;
      float x = min( color.r, min( color.g, color.b ) );
      float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= offset;
      float peak = max( color.r, max( color.g, color.b ) );
      if ( peak < StartCompression ) return color;
      float d = 1.0 - StartCompression;
      float newPeak = 1.0 - d * d / ( peak + d - StartCompression );
      color *= newPeak / peak;
      float g = 1.0 - 1.0 / ( Desaturation * ( peak - newPeak ) + 1.0 );
      return mix( color, vec3( newPeak ), g );
    }
    vec3 toSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 0.41666 ) ) - 0.055, step( 0.0031308, c ) ); }
    void main() {
      vec3 hdr = max( texture2D( tDiffuse, vUv ).rgb, 0.0 );
      if ( uGlow > 0.0 ) hdr += ( texture2D( tGlow1, vUv ).rgb * 0.7 + texture2D( tGlow2, vUv ).rgb ) * uGlow;      // the bloom, added in light values before the tone mapping
      vec3 c = toSRGB( clamp( neutralTone( hdr ), 0.0, 1.0 ) );
      if ( uLut > 0.0 ) { c = mix( c, texture( tLut, vec3( 0.5 / 16.0 ) + c * ( 1.0 - 1.0 / 16.0 ) ).rgb, uLut ); } // the environment's colour grade (16 x 16 x 16)
      float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
      c = mix( vec3( l ), c, 1.0 - uDesat * ( 1.0 - smoothstep( 0.0, 0.4, l ) ) );                      // shadows lose a little colour
      vec2 p = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
      float r = length( p ) / ( 0.5 * sqrt( uAspect * uAspect + 1.0 ) );                                // 0 in the middle, 1 in the corners
      float v = smoothstep( 0.4, 1.0, r );
      c *= 1.0 - uVig * v * v;                                                                          // the vignette
      float gr = texture2D( tGrain, gl_FragCoord.xy / 256.0 ).r - 0.5;                                   // paper grain: the same picture every frame
      c += gr * uGrain * ( 1.0 - 1.6 * abs( l - 0.5 ) );
      gl_FragColor = vec4( c, 1.0 );
    }
  `,
};

// ---- the composer -------------------------------------------------------------------------------------------------------------------------------------------------------
export function createPost(renderer, scene, camera) {
  const P = { enabled: false, composer: null, passes: {}, lutKey: '', sceneCalls: 0, sceneTris: 0, error: '', timing: null };
  try {
    if (!(renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'))) throw new Error('this graphics card cannot draw to floating-point pictures'); // (then the view draws directly, tone mapped by the materials)
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
    const composer = new EffectComposer(renderer, rt);
    const renderPass = new RenderPass(scene, camera);
    const B = (config.LOOK3D && config.LOOK3D.BLOOM) || {};
    const bloom = new MiniBloom(B.THRESHOLD == null ? 0.9 : B.THRESHOLD);
    const grade = new ShaderPass(GradeShader);
    grade.uniforms.tGrain.value = grainTexture();
    grade.uniforms.tGlow1.value = bloom.a.texture; grade.uniforms.tGlow2.value = bloom.d.texture;
    const fxaa = new ShaderPass(FXAAShader);
    const smaa = new SMAAPass(2, 2);
    for (const p of [renderPass, bloom, grade, fxaa, smaa]) composer.addPass(p);
    // Numbers for the perf gate: the scene's own draw calls and triangles (the later passes would add to the counters) and, with the GPU timer, the milliseconds each pass takes on the GPU.
    const gl = renderer.getContext(), ext = gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const T = (P.timing = { on: false, ms: {}, pend: [], ok: !!ext });
    for (const [name, pass] of Object.entries({ renderPass, bloom, grade, fxaa, smaa })) {
      const orig = pass.render.bind(pass);
      pass.render = (...a) => {
        if (name === 'renderPass') renderer.info.reset();
        let q = null;
        if (T.on && ext && T.pend.length < 40) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
        orig(...a);
        if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); T.pend.push({ name, q }); }
        if (name === 'renderPass') { P.sceneCalls = renderer.info.render.calls; P.sceneTris = renderer.info.render.triangles; }
      };
    }
    P.pollTiming = () => {
      while (T.pend.length) {
        const e = T.pend[0];
        if (!gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) break;
        T.pend.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { const ms = gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6; T.ms[e.name] = T.ms[e.name] == null ? ms : T.ms[e.name] * 0.9 + ms * 0.1; }
        gl.deleteQuery(e.q);
      }
    };
    P.composer = composer; P.passes = { renderPass, bloom, grade, fxaa, smaa };
    P.enabled = true;
  } catch (e) { P.error = String(e && e.message ? e.message : e); P.enabled = false; console.warn('view3d: post-processing is off (' + P.error + ')'); }

  // pixel size of the drawing buffer is (w * pr, h * pr)
  P.setSize = (w, h, pr) => {
    if (!P.composer) return;
    P.composer.setPixelRatio(pr);
    P.composer.setSize(w, h);
    const { fxaa, grade } = P.passes;
    fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    grade.uniforms.uAspect.value = w / h;
  };

  // Every frame: which passes run (tier + kill-switches) and their numbers (environment rig).
  P.configure = (tier, rig, envKey, exposure) => {
    if (!P.composer) return;
    const { bloom, grade, fxaa, smaa } = P.passes;
    bloom.enabled = !!(tier.bloom && look.bloom);
    const u = grade.uniforms;
    u.uGlow.value = bloom.enabled ? rig.bloom : 0;
    if (P.lutKey !== envKey) { u.tLut.value = lutFor(rig.grade); P.lutKey = envKey; }
    u.uExposure.value = exposure;
    u.uLut.value = look.lut ? 1 : 0;
    const fin = tier.finish && look.grain;
    u.uVig.value = fin ? rig.vignette : 0;
    u.uGrain.value = fin ? Number(config.LOOK3D && config.LOOK3D.GRAIN) || 0 : 0;
    u.uDesat.value = fin ? Number(config.LOOK3D && config.LOOK3D.SHADOW_DESAT) || 0 : 0;
    fxaa.enabled = tier.aa === 'fxaa';
    smaa.enabled = tier.aa === 'smaa';
  };

  P.render = (dt) => { P.composer.render(dt); };
  P.dispose = () => { try { P.composer && P.composer.renderTarget1.dispose(); P.composer && P.composer.renderTarget2.dispose(); } catch { /* (gone) */ } };
  return P;
}
