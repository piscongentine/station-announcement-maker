/* Station Announcement Maker v1.1 - 3D Sound Placement editor.
 * Plain WebGL (no libraries). Data comes from the route's own files through the backend:
 *   terrain  <- TILES\*.t + *_y.raw        track/stations <- <route>.tdb
 *   sounds   <- WORLD\*.ws (Soundsource)   track sounds   <- ttype.dat + Soundregion
 *   radii, triggers, volume curve <- each sound's own .sms
 * World coords (MSTS: x east, y up, z north, metres from the route origin tile) are drawn as GL (x, y, -z).
 */
(() => {
'use strict';
const SAM = window.SAM;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = SAM.esc, icon = SAM.icon;
const TILE = 2048, GRID = 33, DEG = Math.PI / 180;

/* ------------------------------------------------------------------ state */
const ED = {
  data: null, route: '', active: false, running: false, mode: '3d', labels: true,
  cam: { x: 0, y: 200, z: 0, yaw: 0, pitch: -20 * DEG, fov: 60 * DEG },
  tiles: new Map(), routeTiles: new Set(), loadingTiles: new Set(),
  sel: null, selStation: null, pointer: null,
  added: [], removed: new Set(), undo: [], newId: 1,
  hold: new Set(), keys: new Set(), fly: null,
  muted: new Set(), nearest: new Map(), stats: { fps: 0 },
};
const allSounds = () => ED.data ? ED.data.sounds.concat(ED.added) : [];
const isRegion = s => s && s.kind === 'region';
const glPos = (gx, y, gz) => [gx, y, -gz];

/* ------------------------------------------------------------------ math */
const M4 = {
  persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]); },
  lookAt(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  },
  mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
  inv(m) {
    const a = m, o = new Float32Array(16);
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5],
      b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6], b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12],
      b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return null; det = 1 / det;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
    return o;
  },
  xf(m, v) { const x = v[0], y = v[1], z = v[2]; const w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w]; },
};

/* ------------------------------------------------------------------ WebGL */
let gl = null, prog = {}, idxBuf = null, VP = null, INVVP = null, W = 1, H = 1;
const canvas = $('#ed-canvas');

function shader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function program(vs, fs, attrs) {
  const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
const FOG = `uniform vec3 uCam; uniform vec3 uFog; uniform float uFogFar;`;
function initGL() {
  gl = canvas.getContext('webgl2', { antialias: true, alpha: false }) || canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) return false;
  prog.terrain = program(`attribute vec3 aPos; attribute vec3 aNrm; uniform mat4 uVP; varying vec3 vP; varying vec3 vN;
    void main(){ vP=aPos; vN=aNrm; gl_Position=uVP*vec4(aPos,1.0); }`,
  `precision highp float; varying vec3 vP; varying vec3 vN; ${FOG} uniform float uGridA; uniform float uLo; uniform float uHi;
    void main(){
      float t=clamp((vP.y-uLo)/max(1.0,uHi-uLo),0.0,1.0);
      vec3 low=vec3(0.30,0.44,0.24), mid=vec3(0.45,0.50,0.30), high=vec3(0.62,0.58,0.48);
      vec3 c=t<0.5?mix(low,mid,t*2.0):mix(mid,high,(t-0.5)*2.0);
      float slope=1.0-clamp(vN.y,0.0,1.0); c=mix(c,vec3(0.52,0.45,0.36),clamp(slope*3.0,0.0,0.7));
      float l=0.55+0.45*max(dot(normalize(vN),normalize(vec3(0.4,0.85,0.3))),0.0); c*=l;
      vec2 g=abs(fract(vP.xz/100.0-0.5)-0.5)/fwidthApprox(vP.xz/100.0);
      float line=1.0-min(min(g.x,g.y),1.0); c=mix(c,c*1.18+0.04,line*uGridA);
      vec2 tg=abs(fract((vP.xz+1024.0)/2048.0-0.5)-0.5)/fwidthApprox(vP.xz/2048.0);
      float tl=1.0-min(min(tg.x,tg.y),1.0); c=mix(c,vec3(0.35,0.55,0.95),tl*0.35*uGridA);
      float d=distance(vP,uCam); float f=clamp((d-uFogFar*0.35)/(uFogFar*0.65),0.0,1.0);
      gl_FragColor=vec4(mix(c,uFog,f),1.0);
    }
    `.replace('fwidthApprox', 'fw').replace('fwidthApprox', 'fw').replace('void main(){', 'vec2 fw(vec2 v){ return vec2(0.02); }\n void main(){'),
  ['aPos', 'aNrm']);
  prog.line = program(`attribute vec3 aPos; attribute vec4 aCol; uniform mat4 uVP; varying vec4 vC; varying vec3 vP;
    void main(){ vC=aCol; vP=aPos; gl_Position=uVP*vec4(aPos,1.0); gl_Position.z-=0.0025*gl_Position.w; }`,
  `precision highp float; varying vec4 vC; varying vec3 vP; ${FOG}
    void main(){ float d=distance(vP,uCam); float f=clamp((d-uFogFar*0.5)/(uFogFar*0.5),0.0,1.0); gl_FragColor=vec4(mix(vC.rgb,uFog,f*0.8),vC.a); }`, ['aPos', 'aCol']);
  prog.pts = program(`attribute vec3 aPos; attribute vec4 aCol; attribute float aSize; uniform mat4 uVP; uniform float uScale; varying vec4 vC;
    void main(){ vC=aCol; gl_Position=uVP*vec4(aPos,1.0); gl_PointSize=clamp(aSize*uScale/max(gl_Position.w,1.0),aSize*0.35,aSize*1.6); }`,
  `precision mediump float; varying vec4 vC;
    void main(){ vec2 p=gl_PointCoord*2.0-1.0; float r=dot(p,p); if(r>1.0) discard; float ring=smoothstep(0.55,0.7,r);
      gl_FragColor=vec4(mix(vC.rgb,vec3(1.0),ring*0.85),vC.a); }`, ['aPos', 'aCol', 'aSize']);
  // shared index buffer for a GRID x GRID terrain patch
  const idx = [];
  for (let r = 0; r < GRID - 1; r++) for (let c = 0; c < GRID - 1; c++) { const i = r * GRID + c; idx.push(i, i + GRID, i + 1, i + 1, i + GRID, i + GRID + 1); }
  idxBuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  return true;
}
function vbo(data) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }

/* ------------------------------------------------------------------ tiles (streamed around the camera) */
const tileKey = (tx, tz) => tx + ',' + tz;
function camTile() { const o = ED.data.origin; return [o[0] + Math.round(ED.cam.x / TILE), o[1] + Math.round(-ED.cam.z / TILE)]; }
function tileCenter(tx, tz) { const o = ED.data.origin; return [(tx - o[0]) * TILE, (tz - o[1]) * TILE]; }

function buildTerrain(tx, tz, heights) {
  const [cx, cz] = tileCenter(tx, tz), step = TILE / (GRID - 1);
  const pos = new Float32Array(GRID * GRID * 6);
  const h = (r, c) => heights[Math.min(GRID - 1, Math.max(0, r)) * GRID + Math.min(GRID - 1, Math.max(0, c))];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    const i = (r * GRID + c) * 6, gx = cx - 1024 + c * step, gz = cz + 1024 - r * step;
    pos[i] = gx; pos[i + 1] = h(r, c); pos[i + 2] = -gz;
    const nx = h(r, c - 1) - h(r, c + 1), nz = h(r + 1, c) - h(r - 1, c), ny = 2 * step;
    const l = Math.hypot(nx, ny, nz); pos[i + 3] = nx / l; pos[i + 4] = ny / l; pos[i + 5] = -nz / l;
  }
  return vbo(pos);
}
function buildLines(flat, color, lift = 0.35) {
  const n = flat.length / 3, out = new Float32Array(n * 7);
  for (let i = 0; i < n; i++) { out.set([flat[i * 3], flat[i * 3 + 1] + lift, -flat[i * 3 + 2], ...color], i * 7); }
  return { buf: vbo(out), count: n };
}
async function streamTiles() {
  if (!ED.data || !ED.active) return;
  const [ctx, ctz] = camTile(), alt = Math.max(0, ED.cam.y - (groundAt(ED.cam.x, -ED.cam.z) ?? 0));
  const R = ED.mode === 'map' ? Math.min(7, 2 + Math.floor(alt / 900)) : Math.min(5, 3 + Math.floor(alt / 1500));
  const want = [];
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const k = tileKey(ctx + dx, ctz + dz);
    if (ED.routeTiles.has(k) && !ED.tiles.has(k) && !ED.loadingTiles.has(k)) want.push([ctx + dx, ctz + dz, dx * dx + dz * dz]);
  }
  for (const [k, t] of ED.tiles) {  // drop far tiles
    const [tx, tz] = k.split(',').map(Number);
    if (Math.abs(tx - ctx) > R + 2 || Math.abs(tz - ctz) > R + 2) { if (t.terr) gl.deleteBuffer(t.terr); if (t.track) gl.deleteBuffer(t.track.buf); ED.tiles.delete(k); }
  }
  if (!want.length) return;
  want.sort((a, b) => a[2] - b[2]);
  const batch = want.slice(0, 24);
  batch.forEach(t => ED.loadingTiles.add(tileKey(t[0], t[1])));
  try {
    const r = await SAM.api('world/tiles', { route: ED.route, tiles: batch.map(t => [t[0], t[1]]), n: GRID });
    for (const [tx, tz] of batch) {
      const k = tileKey(tx, tz), b64 = r.terrain[k], tr = r.track[k] || [];
      const t = { terr: null, heights: null, track: null };
      if (b64) {
        const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        t.heights = new Float32Array(u8.buffer); t.terr = buildTerrain(tx, tz, t.heights);
        for (const v of t.heights) { if (v < ED.hLo) ED.hLo = v; if (v > ED.hHi) ED.hHi = v; }
      }
      if (tr.length) t.track = buildLines(tr, [1.0, 0.78, 0.35, 1], 1.6);
      ED.tiles.set(k, t);
      ED.loadingTiles.delete(k);
    }
  } catch (e) { batch.forEach(t => ED.loadingTiles.delete(tileKey(t[0], t[1]))); }
}

/* height of the ground under a world (MSTS) point, from loaded tiles; null if not loaded */
function groundAt(gx, gz) {
  if (!ED.data) return null;
  const o = ED.data.origin, tx = o[0] + Math.round(gx / TILE), tz = o[1] + Math.round(gz / TILE);
  const t = ED.tiles.get(tileKey(tx, tz)); if (!t || !t.heights) return null;
  const [cx, cz] = tileCenter(tx, tz), step = TILE / (GRID - 1);
  const fc = Math.max(0, Math.min(GRID - 1.001, (gx - cx + 1024) / step)), fr = Math.max(0, Math.min(GRID - 1.001, (cz + 1024 - gz) / step));
  const c0 = Math.floor(fc), r0 = Math.floor(fr), ac = fc - c0, ar = fr - r0, H_ = t.heights;
  const h = (r, c) => H_[r * GRID + c];
  return (h(r0, c0) * (1 - ac) + h(r0, c0 + 1) * ac) * (1 - ar) + (h(r0 + 1, c0) * (1 - ac) + h(r0 + 1, c0 + 1) * ac) * ar;
}

/* ------------------------------------------------------------------ dynamic geometry: sounds, rings, pointer */
let soundBuf = null, soundCount = 0, overlayLines = null, overviewLines = null;
const COL = { placed: [0.23, 0.51, 0.96, 1], route: [0.38, 0.65, 0.98, 1], region: [0.66, 0.45, 0.96, 1], sel: [0.96, 0.62, 0.04, 1],
  added: [0.06, 0.73, 0.51, 1], removed: [0.45, 0.47, 0.52, 0.55], muted: [0.55, 0.58, 0.64, 1], playing: [0.2, 0.9, 0.6, 1] };
function soundColor(s) {
  if (ED.sel && ED.sel.id === s.id) return COL.sel;
  if (ED.removed.has(s.id)) return COL.removed;
  if (String(s.id).startsWith('new')) return COL.added;
  if (isRegion(s)) return COL.region;
  if (ED.muted.has(s.id)) return COL.muted;
  if (AU.playing.has(s.id)) return COL.playing;
  return COL.placed;
}
function rebuildSounds() {
  if (!gl || !ED.data) return;
  const list = visibleSoundSet();
  const out = new Float32Array(list.length * 8);
  list.forEach((s, i) => { const sel = ED.sel && ED.sel.id === s.id; out.set([s.gx, s.y + 4, -s.gz, ...soundColor(s), sel ? 30 : (isRegion(s) ? 13 : 18)], i * 8); });
  if (soundBuf) gl.deleteBuffer(soundBuf);
  soundBuf = vbo(out); soundCount = list.length;
  rebuildOverlay();
}
function visibleSoundSet() {
  const showReg = $('#ed-show-regions').checked || $('#ed-snd-src').value !== 'ssource';
  return allSounds().concat(showReg ? ED.data.regions : []);
}
function ring(out, gx, gz, y, r, col, dashed) {
  const N = Math.max(48, Math.min(160, Math.round(r / 6)));
  for (let i = 0; i < N; i++) {
    if (dashed && i % 2) continue;
    for (const k of [i, i + 1]) {
      const a = (k / N) * Math.PI * 2, x = gx + Math.cos(a) * r, z = gz + Math.sin(a) * r;
      const g = groundAt(x, z); out.push(x, (g ?? y) + 1.2, -z, ...col);
    }
  }
}
function rebuildOverlay() {
  if (!gl) return;
  const out = [];
  const s = ED.sel;
  if (s) {
    const info = smsOf(s);
    if (info) {
      const st = info.streams?.[0] || {};
      if (info.activation) ring(out, s.gx, s.gz, s.y, info.activation, [0.38, 0.65, 0.98, 0.9], true);
      if (st.start) ring(out, s.gx, s.gz, s.y, st.start, [0.06, 0.73, 0.51, 1]);
      if (st.release && st.release !== st.start) ring(out, s.gx, s.gz, s.y, st.release, [0.96, 0.62, 0.04, 1], true);
      const zero = curveZero(st.curve); if (zero) ring(out, s.gx, s.gz, s.y, zero, [0.96, 0.25, 0.37, 0.9], true);
    }
    const g = groundAt(s.gx, s.gz) ?? s.y; out.push(s.gx, g, -s.gz, ...COL.sel, s.gx, s.y + 30, -s.gz, ...COL.sel);
  }
  // stems for nearby sounds (depth cue)
  for (const x of nearSounds(1500, 120)) { const g = groundAt(x.gx, x.gz) ?? x.y; const c = soundColor(x); out.push(x.gx, g, -x.gz, c[0], c[1], c[2], 0.5, x.gx, x.y + 4, -x.gz, c[0], c[1], c[2], 0.5); }
  if (ED.pointer) {
    const p = ED.pointer, c = [0.13, 0.83, 0.93, 1];
    out.push(p.gx, p.y, -p.gz, ...c, p.gx, p.y + 45, -p.gz, ...c);
    ring(out, p.gx, p.gz, p.y, 10, c); ring(out, p.gx, p.gz, p.y, 3, c);
    out.push(p.gx - 16, p.y + 1, -p.gz, ...c, p.gx + 16, p.y + 1, -p.gz, ...c, p.gx, p.y + 1, -p.gz - 16, ...c, p.gx, p.y + 1, -p.gz + 16, ...c);
  }
  if (ED.selStation) { const t = ED.selStation; ring(out, t.x, t.z, t.y, 60, [0.96, 0.62, 0.04, 1]); }
  if (overlayLines) gl.deleteBuffer(overlayLines.buf);
  overlayLines = out.length ? { buf: vbo(new Float32Array(out)), count: out.length / 7 } : null;
}
function curveZero(curve) { if (!curve || !curve.length) return null; for (let i = 1; i < curve.length; i++) if (curve[i][1] <= 0.0001) return curve[i][0]; return null; }

/* ------------------------------------------------------------------ camera */
function camForward() { const c = ED.cam; return [Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch)]; }
function updateMatrices() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  W = w; H = h;
  const c = ED.cam, f = camForward(), eye = [c.x, c.y, c.z];
  const up = Math.abs(f[1]) > 0.995 ? [Math.sin(c.yaw), 0, -Math.cos(c.yaw)] : [0, 1, 0];
  const proj = M4.persp(c.fov, Math.max(0.1, w / Math.max(1, h)), ED.mode === 'map' ? 5 : 1, 90000);
  VP = M4.mul(proj, M4.lookAt(eye, [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]], up));
  INVVP = M4.inv(VP);
}
function project(p) { const v = M4.xf(VP, p); if (v[3] <= 0.1 || v[2] > 1) return null; return [(v[0] * 0.5 + 0.5) * W, (1 - (v[1] * 0.5 + 0.5)) * H, v[3]]; }
function rayAt(sx, sy) {
  const nx = sx / W * 2 - 1, ny = 1 - sy / H * 2;
  const a = M4.xf(INVVP, [nx, ny, -1]), b = M4.xf(INVVP, [nx, ny, 1]);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d);
  return { o: [ED.cam.x, ED.cam.y, ED.cam.z], d: d.map(v => v / l) };
}
function pickGround(sx, sy) {
  const r = rayAt(sx, sy); let t = 0, step = 2;
  for (let i = 0; i < 4000 && t < 40000; i++) {
    const x = r.o[0] + r.d[0] * t, y = r.o[1] + r.d[1] * t, z = r.o[2] + r.d[2] * t;
    const g = groundAt(x, -z);
    if (g !== null && y <= g) {  // refine
      let lo = Math.max(0, t - step), hi = t;
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2, yy = r.o[1] + r.d[1] * m, gg = groundAt(r.o[0] + r.d[0] * m, -(r.o[2] + r.d[2] * m)); if (gg !== null && yy <= gg) hi = m; else lo = m; }
      return { gx: r.o[0] + r.d[0] * hi, gz: -(r.o[2] + r.d[2] * hi), y: groundAt(r.o[0] + r.d[0] * hi, -(r.o[2] + r.d[2] * hi)) };
    }
    t += step; step = Math.min(60, step * 1.04);
  }
  return null;
}
function flyTo(gx, gz, y, dist = 260, height = 120) {
  const g = groundAt(gx, gz) ?? y ?? 0;
  const yaw = ED.cam.yaw;
  const target = ED.mode === 'map'
    ? { x: gx, y: Math.max(g + 700, ED.cam.y), z: -gz, yaw, pitch: -89.5 * DEG }
    : { x: gx - Math.sin(yaw) * dist, y: g + height, z: -gz + Math.cos(yaw) * dist, yaw, pitch: -Math.atan2(height, dist) };
  ED.fly = { from: { ...ED.cam }, to: target, t: 0 };
}

/* ------------------------------------------------------------------ input */
const HOLD_KEYS = { ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyQ: 'rotl', KeyE: 'rotr', KeyR: 'up', PageUp: 'up', KeyF: 'down', PageDown: 'down', KeyT: 'tiltu', KeyG: null, Equal: 'zin', NumpadAdd: 'zin', Minus: 'zout', NumpadSubtract: 'zout' };
const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA') && a.type !== 'range' && a.type !== 'checkbox'; };
window.addEventListener('keydown', e => {
  if (!ED.active) return;
  if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); save(); return; }
  if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
  if (e.code === 'F1') { e.preventDefault(); openHelp(); return; }
  if (typing()) return;
  if (e.code === 'KeyG' && (ED.sel || ED.pointer)) { goSel(); return; }
  if (e.code === 'KeyG') { ED.keys.add('tiltd'); e.preventDefault(); return; }
  const k = HOLD_KEYS[e.code];
  if (k) { ED.keys.add(k); e.preventDefault(); }
  if (e.code === 'KeyV') setMode('3d'); if (e.code === 'KeyM') setMode('map');
  if (e.code === 'KeyL') toggleLabels();
  if (e.code === 'Delete' && ED.sel) removeSel();
  if (e.code === 'Escape') { ED.sel = null; ED.pointer = null; ED.selStation = null; renderSel(); renderPointer(); rebuildSounds(); }
});
window.addEventListener('keyup', e => { const k = HOLD_KEYS[e.code] || (e.code === 'KeyG' ? 'tiltd' : null); if (k) ED.keys.delete(k); });
window.addEventListener('blur', () => { ED.keys.clear(); ED.hold.clear(); });

$$('#ed-pad [data-hold]').forEach(b => {
  const k = b.dataset.hold;
  const on = e => { e.preventDefault(); if (k === 'fast') { ED.fastLatch = !ED.fastLatch; b.classList.toggle('on', ED.fastLatch); return; } ED.hold.add(k); b.classList.add('on'); };
  const off = () => { if (k !== 'fast') { ED.hold.delete(k); b.classList.remove('on'); } };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});

let drag = null;
canvas.addEventListener('pointerdown', e => { canvas.focus(); drag = { x: e.clientX, y: e.clientY, moved: 0, btn: e.button, yaw: ED.cam.yaw, pitch: ED.cam.pitch, cx: ED.cam.x, cz: ED.cam.z }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!drag) { hoverAt(e); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
  if (drag.moved < 4) return;
  canvas.classList.add('dragging');
  if (ED.mode === 'map' && drag.btn === 0) {  // pan the map
    const scale = (ED.cam.y - (groundAt(ED.cam.x, -ED.cam.z) ?? 0)) * Math.tan(ED.cam.fov / 2) * 2 / H;
    const c = Math.cos(ED.cam.yaw), s = Math.sin(ED.cam.yaw);
    ED.cam.x = drag.cx - (dx * c - dy * s) * scale; ED.cam.z = drag.cz - (dx * s + dy * c) * scale;
  } else {  // look around 360
    ED.cam.yaw = drag.yaw + dx * 0.0045;
    if (ED.mode !== 'map') ED.cam.pitch = Math.max(-89 * DEG, Math.min(80 * DEG, drag.pitch - dy * 0.0045));
  }
});
canvas.addEventListener('pointerup', e => {
  canvas.classList.remove('dragging');
  const d = drag; drag = null;
  if (d && d.moved < 4 && d.btn === 0) clickAt(e);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const f = camForward(), sp = speed() * (e.deltaY < 0 ? 0.35 : -0.35) * (e.shiftKey ? 2 : 1);
  if (ED.mode === 'map') ED.cam.y = Math.max((groundAt(ED.cam.x, -ED.cam.z) ?? 0) + 40, ED.cam.y - sp * 1.5);
  else { ED.cam.x += f[0] * sp; ED.cam.y += f[1] * sp; ED.cam.z += f[2] * sp; }
}, { passive: false });

function speed() { const g = groundAt(ED.cam.x, -ED.cam.z) ?? 0; return Math.max(18, Math.min(4000, (ED.cam.y - g) * 0.9)); }
function moveStep(dt) {
  const act = new Set([...ED.keys, ...ED.hold]); if (!act.size) return false;
  const fast = (ED.keys.has('shift') || ED.shift || ED.fastLatch) ? 2 : 1;
  const c = ED.cam, sp = speed() * fast * dt;
  const fx = Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = Math.sin(c.yaw);
  if (act.has('fwd')) { c.x += fx * sp; c.z += fz * sp; }
  if (act.has('back')) { c.x -= fx * sp; c.z -= fz * sp; }
  if (act.has('left')) { c.x -= rx * sp; c.z -= rz * sp; }
  if (act.has('right')) { c.x += rx * sp; c.z += rz * sp; }
  if (act.has('up')) c.y += sp * 0.8;
  if (act.has('down')) c.y -= sp * 0.8;
  if (act.has('rotl')) c.yaw -= 70 * DEG * dt * fast;
  if (act.has('rotr')) c.yaw += 70 * DEG * dt * fast;
  if (ED.mode !== 'map') {
    if (act.has('tiltu')) c.pitch = Math.min(80 * DEG, c.pitch + 50 * DEG * dt);
    if (act.has('tiltd')) c.pitch = Math.max(-89 * DEG, c.pitch - 50 * DEG * dt);
  }
  if (act.has('zin')) c.fov = Math.max(12 * DEG, c.fov - 40 * DEG * dt);
  if (act.has('zout')) c.fov = Math.min(100 * DEG, c.fov + 40 * DEG * dt);
  return true;
}
window.addEventListener('keydown', e => { if (e.key === 'Shift') ED.shift = true; });
window.addEventListener('keyup', e => { if (e.key === 'Shift') ED.shift = false; });

function setMode(m) {
  ED.mode = m; $('#ed-mode-pill').textContent = m === 'map' ? 'MAP' : '3D';
  const g = groundAt(ED.cam.x, -ED.cam.z) ?? 0;
  if (m === 'map') { ED.cam.pitch = -89.5 * DEG; ED.cam.y = Math.max(ED.cam.y, g + 900); }
  else { ED.cam.pitch = -22 * DEG; ED.cam.y = Math.min(ED.cam.y, g + 250); }
}
function toggleLabels() { ED.labels = !ED.labels; $('#ed-labels').hidden = !ED.labels; }

/* ------------------------------------------------------------------ picking */
function nearSounds(range, max) {
  const out = []; const cx = ED.cam.x, cz = -ED.cam.z;
  for (const s of visibleSoundSet()) { const d = Math.hypot(s.gx - cx, s.gz - cz); if (d < range) out.push([d, s]); }
  out.sort((a, b) => a[0] - b[0]); return out.slice(0, max).map(x => x[1]);
}
function soundAtScreen(sx, sy) {
  let best = null, bd = 18;
  for (const s of visibleSoundSet()) { const p = project(glPos(s.gx, s.y + 4, s.gz)); if (!p) continue; const d = Math.hypot(p[0] - sx, p[1] - sy); if (d < bd) { bd = d; best = s; } }
  return best;
}
function clickAt(e) {
  const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  const s = soundAtScreen(sx, sy);
  if (s) { select(s); return; }
  const g = pickGround(sx, sy);
  if (g) setPointer(g.gx, g.gz, g.y);
}
function hoverAt(e) {
  const r = canvas.getBoundingClientRect(); const s = soundAtScreen(e.clientX - r.left, e.clientY - r.top);
  canvas.style.cursor = s ? 'pointer' : (ED.mode === 'map' ? 'grab' : 'crosshair');
  ED.hover = s ? s.id : null;
}

/* ------------------------------------------------------------------ helpers: stations, names, sms */
function smsOf(s) { const f = isRegion(s) ? ttypeSms(s) : s.file; return f ? ED.data.sms[f] : null; }
function ttypeSms(r) { const t = ED.data.ttype[r.type]; return t ? t.outside : null; }
function displayName(s) {
  if (isRegion(s)) { const t = ED.data.ttype[s.type]; return `Track sound: ${t ? t.name : 'type ' + s.type}`; }
  const e = ED.ssByFile.get(s.file.toLowerCase()); return e ? e.name : s.file.replace(/\.sms$/i, '');
}
function nearestStations(gx, gz, n = 2) {
  const st = ED.data.stations; const best = [];
  for (const t of st) { const d = Math.hypot(t.x - gx, t.z - gz); if (best.length < n || d < best[best.length - 1][0]) { best.push([d, t]); best.sort((a, b) => a[0] - b[0]); if (best.length > n) best.pop(); } }
  return best.map(([d, t]) => ({ name: t.name, d }));
}
const km = d => d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(d < 10000 ? 1 : 0) + ' km';
function nearText(s) { return (s._near || (s._near = nearestStations(s.gx, s.gz))).map(n => `${esc(n.name)} <b>${km(n.d)}</b>`).join(' · '); }
function localFromGlobal(gx, gz) {
  const o = ED.data.origin, tx = o[0] + Math.round(gx / TILE), tz = o[1] + Math.round(gz / TILE);
  const [cx, cz] = tileCenter(tx, tz); return { tx, tz, x: gx - cx, z: gz - cz };
}

/* ------------------------------------------------------------------ selection, pointer, place, remove */
function select(s, fly) {
  ED.sel = s; ED.selStation = null; renderSel(); rebuildSounds(); renderList(true);
  if (fly) flyTo(s.gx, s.gz, s.y);
}
function setPointer(gx, gz, y) {
  const l = localFromGlobal(gx, gz);
  ED.pointer = { gx, gz, y: y ?? 0, ...l, exact: false };
  renderPointer(); rebuildOverlay();
  SAM.api('world/height', { route: ED.route, tx: l.tx, tz: l.tz, x: l.x, z: l.z }).then(r => {
    if (ED.pointer && ED.pointer.gx === gx && r.y != null) { ED.pointer.y = r.y; ED.pointer.exact = true; renderPointer(); rebuildOverlay(); }
  }).catch(() => {});
}
function renderPointer() {
  const p = ED.pointer, box = $('#ed-pointer-info');
  if (!p) { box.innerHTML = 'Click the ground to drop the pointer where a sound should go.'; $('#ed-place-btn').disabled = true; return; }
  box.innerHTML = `<div class="kv"><span>Tile</span><b class="mono">${p.tx}, ${p.tz}</b></div>
    <div class="kv"><span>Position in tile</span><b class="mono">${p.x.toFixed(1)}  ${p.y.toFixed(2)}  ${p.z.toFixed(1)}</b></div>
    <div class="kv"><span>Ground height</span><b>${p.y.toFixed(2)} m ${p.exact ? '<span class="badge ok">exact</span>' : '<span class="badge">approx.</span>'}</b></div>
    <div class="kv"><span>Nearest</span><b>${nearestStations(p.gx, p.gz, 3).map(n => `${esc(n.name)} ${km(n.d)}`).join(' · ')}</b></div>`;
  $('#ed-place-btn').disabled = !$('#ed-place-sel').value;
}
function place() {
  const p = ED.pointer, file = $('#ed-place-sel').value;
  if (!p || !file) return;
  const s = { id: 'new-' + (ED.newId++), file, tx: p.tx, tz: p.tz, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), gx: p.gx, gz: p.gz, uid: 'new' };
  ED.added.push(s); ED.undo.push({ type: 'add', id: s.id });
  dirty(); select(s);
  SAM.toast(`Placed <b>${esc(displayName(s))}</b> — not saved yet`, 'info', 2600);
}
function removeSel() {
  const s = ED.sel; if (!s) return;
  if (isRegion(s)) { SAM.toast('Track-sound regions are made with TSRE5 track tools and are not removed here.', 'warn'); return; }
  if (String(s.id).startsWith('new')) { ED.added = ED.added.filter(x => x.id !== s.id); ED.undo.push({ type: 'unadd', s }); }
  else { if (ED.removed.has(s.id)) return; ED.removed.add(s.id); ED.undo.push({ type: 'remove', id: s.id }); }
  dirty(); renderSel(); rebuildSounds(); renderList();
  SAM.toast(`Removed <b>${esc(displayName(s))}</b> — not saved yet (Ctrl+Z to undo)`, 'warn', 2600);
}
function undo() {
  const u = ED.undo.pop(); if (!u) { SAM.toast('Nothing to undo.', 'info', 1500); return; }
  if (u.type === 'add') { ED.added = ED.added.filter(x => x.id !== u.id); if (ED.sel?.id === u.id) ED.sel = null; }
  if (u.type === 'unadd') ED.added.push(u.s);
  if (u.type === 'remove') ED.removed.delete(u.id);
  dirty(); renderSel(); rebuildSounds(); renderList();
}
function dirty() {
  const n = ED.added.length + ED.removed.size;
  $('#ed-pending').textContent = n ? `${n} unsaved change${n > 1 ? 's' : ''}` : 'No changes';
  $('#ed-pending').classList.toggle('on', !!n);
  $('#ed-save-btn').disabled = !n;
  const b = $('#ed-dirty-count'); b.hidden = !n; b.textContent = n;
}
async function save() {
  const n = ED.added.length + ED.removed.size; if (!n || !ED.data) { SAM.toast('Nothing to save.', 'info', 1500); return true; }
  const byId = new Map(ED.data.sounds.map(s => [s.id, s]));
  const remove = [...ED.removed].map(id => byId.get(id)).filter(Boolean).map(s => ({ tx: s.tx, tz: s.tz, uid: s.uid }));
  const add = ED.added.map(s => ({ tx: s.tx, tz: s.tz, x: s.x, y: s.y, z: s.z, file: s.file }));
  try {
    const r = await SAM.api('world/save', { route: ED.route, add, remove });
    const prevSel = ED.sel;
    ED.data.sounds = prepSounds(r.sounds); ED.added = []; ED.removed.clear(); ED.undo = [];
    if (prevSel && !String(prevSel.id).startsWith('new')) ED.sel = ED.data.sounds.find(s => s.id === prevSel.id) || null; else ED.sel = null;
    dirty(); renderSel(); rebuildSounds(); renderList();
    SAM.modal(`<div class="row"><span class="big-check">${icon('check')}</span><div><h3>Saved ${add.length} placed · ${remove.length} removed</h3>
      <p class="lead" style="margin:0">Written to the route's world sound files${r.backupDir ? '; originals backed up first' : ''}.</p></div></div>
      <ul class="sum-list" style="margin-top:14px">${r.report.map((f, i) => `<li style="animation-delay:${i * 0.07}s"><span class="ck">${icon('check')}</span><div>
      <div class="what">${f.created ? 'Created' : 'Updated'} ${esc(f.file.split(/[\\/]/).pop())} · +${f.added.length} / −${f.removed.length}</div>
      <div class="path mono">${esc(f.file)}</div></div></li>`).join('')}</ul>
      ${r.backupDir ? `<div class="tsre-note">${icon('shield')}<div>Backups: <span class="mono">${esc(r.backupDir.replace(/^.*?\\AppData\\Local/i, '%LOCALAPPDATA%'))}</span></div></div>` : ''}
      <div class="tsre-note">${icon('train')}<div>Restart TSRE5 / Open Rails (or reload the route) to see the changes there.</div></div>`,
      [{ label: 'Done', value: true, icon: 'check' }]);
    return true;
  } catch (e) { SAM.toast('Save failed: ' + esc(e.message), 'err', 8000); return false; }
}
async function exitEditor() {
  if (ED.added.length || ED.removed.size) {
    const r = await SAM.modal(`<h3>${icon('warn')}Unsaved changes</h3><p class="lead">You have ${ED.added.length + ED.removed.size} unsaved change(s) in ${esc(ED.data.routeName)}.</p>`,
      [{ label: 'Cancel', cls: 'ghost', value: 'cancel' }, { label: 'Discard', cls: 'ghost', value: 'discard' }, { label: 'Save and exit', value: 'save', icon: 'save' }]);
    if (!r || r === 'cancel') return;
    if (r === 'save' && !(await save())) return;
    if (r === 'discard') { ED.added = []; ED.removed.clear(); ED.undo = []; dirty(); rebuildSounds(); renderList(); }
  }
  AU.stop(); $('#ed-snd-on').checked = false;
  $('#tabs [data-tab="single"]').click();
}
function goSel() { if (ED.sel) flyTo(ED.sel.gx, ED.sel.gz, ED.sel.y); else if (ED.pointer) flyTo(ED.pointer.gx, ED.pointer.gz, ED.pointer.y); }
function openHelp() { $('#tabs [data-tab="help"]').click(); setTimeout(() => $('#h-3d')?.scrollIntoView({ behavior: 'smooth' }), 60); }

/* ------------------------------------------------------------------ selection panel */
function curveSvg(curve, maxD) {
  if (!curve || curve.length < 2) return '';
  const w = 220, h = 56, mx = Math.max(maxD || 0, curve[curve.length - 1][0]) || 1;
  const pts = curve.map(([d, v]) => `${(d / mx * w).toFixed(1)},${(h - 4 - v * (h - 10)).toFixed(1)}`).join(' ');
  return `<svg class="curve" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
}
function renderSel() {
  const s = ED.sel, panel = $('#ed-sel-panel');
  panel.hidden = !s; if (!s) return;
  const info = smsOf(s) || {}, st = (info.streams || [])[0] || {};
  const removed = ED.removed.has(s.id), isNew = String(s.id).startsWith('new');
  const file = isRegion(s) ? ttypeSms(s) : s.file;
  $('#ed-sel-info').innerHTML = `<div class="sel-name">${esc(displayName(s))} ${isNew ? '<span class="badge ok">new</span>' : ''}${removed ? '<span class="badge err">removed</span>' : ''}</div>
    <div class="mono muted small">${esc(file || '?')} · ${isRegion(s) ? 'Soundregion' : 'UiD ' + s.uid} · tile ${s.tx}, ${s.tz}</div>
    <div class="kv"><span>Nearest</span><b>${nearText(s)}</b></div>
    ${info.found === false ? '<div class="badge err">.sms not found in the route or MSTS SOUND folder</div>' : `
    <div class="radii">
      <div><i class="rk a"></i>Activation <b>${info.activation ?? '—'} m</b></div>
      <div><i class="rk a"></i>Deactivation <b>${info.deactivation ?? '—'} m</b></div>
      <div><i class="rk s"></i>Starts within <b>${st.start ?? '—'} m</b></div>
      <div><i class="rk r"></i>Stops beyond <b>${st.release ?? '—'} m</b></div>
      <div><i class="rk c"></i>Silent from <b>${curveZero(st.curve) ?? '—'} m</b></div>
      <div>Volume <b>${info.volume ?? 1}</b> · ${esc(st.mode || '—')}</div>
    </div>
    ${curveSvg(st.curve, st.curveType === 'SpeedControlled' ? null : info.activation)}
    <div class="muted small">${st.curveType ? esc(st.curveType) + ' volume curve' : 'no volume curve'}${(info.streams || []).length > 1 ? ` · ${info.streams.length} streams` : ''}</div>
    <details class="trig"><summary>Triggers in this .sms</summary>${(info.streams || []).map((sm, i) => `<div class="trig-s"><b>Stream ${i + 1}</b>${(sm.triggers || []).map(t =>
      `<div class="mono">${t.kind === 'Initial' ? 'Initial' : `${esc(t.var || '?')} ${t.dir === 'Inc' ? '↑ past' : '↓ past'} ${t.value}${t.var === 'Distance' ? ' m' : t.var === 'Speed' ? ` m/s (${Math.round(t.value * 3.6)} km/h)` : ''}`} → ${esc(t.action || '?')}${t.wavs.length ? ' ' + esc(t.wavs.join(', ')) : ''}</div>`).join('')}</div>`).join('')}</details>
    <div class="mono muted small">${(st.wavs || []).map(esc).join(', ')} ${info.where ? '· ' + info.where : ''}</div>`}`;
  // slide through every place that uses the same sound
  const same = isRegion(s) ? [] : allSounds().filter(x => x.file.toLowerCase() === s.file.toLowerCase());
  const i = same.findIndex(x => x.id === s.id);
  $('#ed-slide').innerHTML = same.length > 1 ? `<div class="slide"><button class="icon-btn" data-sl="-1">◀</button>
      <div><b>Used at ${same.length} places</b><span class="muted small">place ${i + 1} of ${same.length} — slide to visit each</span>
      <input type="range" min="1" max="${same.length}" value="${i + 1}" id="ed-slide-r"></div><button class="icon-btn" data-sl="1">▶</button></div>` : '';
  $$('#ed-slide [data-sl]').forEach(b => b.onclick = () => select(same[(i + +b.dataset.sl + same.length) % same.length], true));
  const r = $('#ed-slide-r'); if (r) r.oninput = () => select(same[r.value - 1], true);
  $('#ed-sel-mute').innerHTML = `${icon(ED.muted.has(s.id) ? 'volume' : 'mute')}${ED.muted.has(s.id) ? 'Unmute' : 'Mute'}`;
  $('#ed-sel-remove').disabled = isRegion(s) || removed;
}
$('#ed-sel-mute').onclick = () => { const s = ED.sel; if (!s) return; ED.muted.has(s.id) ? ED.muted.delete(s.id) : ED.muted.add(s.id); renderSel(); rebuildSounds(); renderList(); };
$('#ed-sel-solo').onclick = () => { $('#ed-snd-mode').value = 'solo'; if (!$('#ed-snd-on').checked) { $('#ed-snd-on').checked = true; AU.start(); } SAM.toast('Listening to the selected sound only. Move the camera to hear it change.', 'info'); };
$('#ed-sel-remove').onclick = removeSel;
$('#ed-place-btn').onclick = place;

/* ------------------------------------------------------------------ left lists (sound bars, stations) */
$$('.ed-tabs button').forEach(b => b.onclick = () => { $$('.ed-tabs button').forEach(x => x.classList.toggle('active', x === b)); $('#lt-sounds').hidden = b.dataset.lt !== 'sounds'; $('#lt-stations').hidden = b.dataset.lt !== 'stations'; renderStations(); });
let listTimer = 0;
function renderList(keepScroll) {
  if (!ED.data) return;
  const q = $('#ed-snd-search').value.trim().toLowerCase();
  const stName = $('#ed-near-st').value, radius = +$('#ed-radius').value * 1000;
  const center = stName ? ED.data.stations.find(s => s.name === stName) : null;
  const cx = center ? center.x : ED.cam.x, cz = center ? center.z : -ED.cam.z;
  let list = visibleSoundSet().filter(s => $('#ed-show-regions').checked || !isRegion(s));
  list = list.map(s => ({ s, d: Math.hypot(s.gx - cx, s.gz - cz) })).filter(x => x.d <= radius);
  if (q) list = list.filter(x => (displayName(x.s) + ' ' + (x.s.file || '')).toLowerCase().includes(q));
  list.sort((a, b) => a.d - b.d);
  $('#ed-snd-count').textContent = `${list.length} sound${list.length === 1 ? '' : 's'} within ${km(radius)} of ${center ? center.name : 'the camera'}`;
  const box = $('#ed-snd-list'), st = box.scrollTop;
  const bar = ({ s, d }) => {
    const sel = ED.sel && ED.sel.id === s.id, rem = ED.removed.has(s.id), isNew = String(s.id).startsWith('new');
    return `<div class="sbar ${sel ? 'sel' : ''} ${rem ? 'rem' : ''} ${isNew ? 'new' : ''} ${isRegion(s) ? 'reg' : ''}" data-id="${esc(s.id)}">
      <span class="dot"></span>
      <div class="sb-main"><div class="sb-name">${esc(displayName(s))}</div>
        <div class="sb-near">${nearText(s)}</div>
        <div class="sb-meter"><i style="width:0%"></i></div></div>
      <div class="sb-side"><span class="sb-d">${km(d)}</span><span class="sb-state" data-state="${esc(s.id)}"></span>
        <button class="icon-btn sb-mute ${ED.muted.has(s.id) ? 'on' : ''}" title="Sound on / off" data-mute="${esc(s.id)}">${icon(ED.muted.has(s.id) ? 'mute' : 'volume')}</button></div></div>`;
  };
  let html = '';
  if ($('#ed-group').checked) {
    const groups = new Map();
    list.slice(0, 1500).forEach(x => { const k = isRegion(x.s) ? 'region:' + x.s.type : x.s.file.toLowerCase(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    for (const [, g] of groups) html += `<div class="sgroup"><div class="sg-head">${esc(displayName(g[0].s))} <span class="badge info">${g.length} place${g.length > 1 ? 's' : ''}</span></div>${g.slice(0, 30).map(bar).join('')}</div>`;
  } else html = list.slice(0, 250).map(bar).join('');
  box.innerHTML = html || '<div class="empty-note">No sounds here. Widen the radius or move the camera.</div>';
  if (keepScroll) box.scrollTop = st;
  $$('.sbar', box).forEach(el => el.onclick = e => {
    if (e.target.closest('[data-mute]')) return;
    const s = visibleSoundSet().find(x => String(x.id) === el.dataset.id); if (s) select(s, true);
  });
  $$('[data-mute]', box).forEach(b => b.onclick = () => { const id = b.dataset.mute; ED.muted.has(id) ? ED.muted.delete(id) : ED.muted.add(id); renderList(true); rebuildSounds(); if (ED.sel?.id === id) renderSel(); });
}
function scheduleList() { clearTimeout(listTimer); listTimer = setTimeout(() => renderList(true), 250); }
['#ed-snd-search', '#ed-near-st', '#ed-group', '#ed-show-regions'].forEach(s => $(s).addEventListener('input', () => { renderList(); rebuildSounds(); }));
$('#ed-radius').addEventListener('input', () => { $('#ed-radius-lbl').textContent = $('#ed-radius').value + ' km'; renderList(); });
$('#ed-near-st').addEventListener('change', () => { const t = ED.data?.stations.find(s => s.name === $('#ed-near-st').value); if (t) { ED.selStation = t; flyTo(t.x, t.z, t.y, 420, 220); rebuildOverlay(); } });

function renderStations() {
  if (!ED.data) return;
  const q = $('#ed-st-search').value.trim().toLowerCase(), cx = ED.cam.x, cz = -ED.cam.z;
  const list = ED.data.stations.filter(s => !q || s.name.toLowerCase().includes(q)).map(s => ({ s, d: Math.hypot(s.x - cx, s.z - cz) })).sort((a, b) => a.d - b.d).slice(0, 400);
  $('#ed-st-list').innerHTML = list.map(({ s, d }) => `<div class="stitem ${ED.selStation === s ? 'sel' : ''}" data-st="${esc(s.name)}">${icon('train')}<div><b>${esc(s.name)}</b><span class="muted small">${s.platforms} platform${s.platforms > 1 ? 's' : ''} · ${km(d)}</span></div></div>`).join('');
  $$('#ed-st-list [data-st]').forEach(el => el.onclick = () => selectStation(ED.data.stations.find(s => s.name === el.dataset.st)));
}
function selectStation(t) { if (!t) return; ED.selStation = t; flyTo(t.x, t.z, t.y, 420, 220); rebuildOverlay(); renderStations(); }
$('#ed-st-search').addEventListener('input', renderStations);
function fillNearStations() {
  const cx = ED.cam.x, cz = -ED.cam.z, cur = $('#ed-near-st').value;
  const list = ED.data.stations.map(s => ({ s, d: Math.hypot(s.x - cx, s.z - cz) })).sort((a, b) => a.d - b.d).slice(0, 200);
  $('#ed-near-st').innerHTML = '<option value="">Around the camera</option>' + list.map(({ s, d }) => `<option value="${esc(s.name)}">${esc(s.name)} — ${km(d)}</option>`).join('');
  $('#ed-near-st').value = cur;
}

/* place list = the route's ssource.dat entries */
function renderPlaceList() {
  const q = $('#ed-place-search').value.trim().toLowerCase();
  const items = ED.data.ssource.filter(e => !q || (e.name + ' ' + e.file).toLowerCase().includes(q));
  const cur = $('#ed-place-sel').value;
  $('#ed-place-sel').innerHTML = items.map(e => `<option value="${esc(e.file)}">${esc(e.name)} — ${esc(e.file)}${ED.data.sms[e.file]?.found === false ? ' (missing .sms)' : ''}</option>`).join('');
  if (items.some(e => e.file === cur)) $('#ed-place-sel').value = cur;
  renderPointer();
}
$('#ed-place-search').addEventListener('input', renderPlaceList);
$('#ed-place-sel').addEventListener('change', renderPointer);

/* ------------------------------------------------------------------ labels overlay */
const labelPool = [];
function label(i) { if (!labelPool[i]) { const d = document.createElement('div'); d.className = 'lbl'; $('#ed-labels').append(d); labelPool[i] = d; d.addEventListener('click', () => d._act && d._act()); } return labelPool[i]; }
function drawLabels() {
  if (!ED.labels || !ED.data) { labelPool.forEach(l => l.style.display = 'none'); return; }
  let n = 0;
  const alt = ED.cam.y - (groundAt(ED.cam.x, -ED.cam.z) ?? 0);
  const stRange = ED.mode === 'map' ? Math.max(4000, alt * 4) : 6000;
  const stations = [];
  for (const t of ED.data.stations) { const d = Math.hypot(t.x - ED.cam.x, t.z + ED.cam.z); if (d < stRange) stations.push([d, t]); }
  stations.sort((a, b) => a[0] - b[0]);
  for (const [, t] of stations.slice(0, 40)) {
    const p = project(glPos(t.x, t.y + 25, t.z)); if (!p) continue;
    const l = label(n++); l.className = 'lbl st' + (ED.selStation === t ? ' sel' : '');
    l.innerHTML = `${icon('train')}<span>${esc(t.name)}</span>`; l.style.display = ''; l.style.transform = `translate(${p[0]}px,${p[1]}px)`;
    l._act = () => selectStation(t);
  }
  const range = ED.mode === 'map' ? Math.max(1200, alt * 1.5) : 1800;
  const snd = nearSounds(range, 35);
  if (ED.sel && !snd.includes(ED.sel)) snd.push(ED.sel);
  for (const s of snd) {
    const p = project(glPos(s.gx, s.y + 4, s.gz)); if (!p) continue;
    const l = label(n++); const sel = ED.sel && ED.sel.id === s.id;
    l.className = 'lbl snd' + (sel ? ' sel' : '') + (ED.removed.has(s.id) ? ' rem' : '') + (String(s.id).startsWith('new') ? ' new' : '') + (isRegion(s) ? ' reg' : '');
    const lvl = AU.levels.get(s.id) || 0;
    l.innerHTML = `<span>${esc(displayName(s))}</span><em style="--lv:${Math.round(lvl * 100)}%"></em>`;
    l.style.display = ''; l.style.transform = `translate(${p[0]}px,${p[1] - 14}px)`;
    l._act = () => select(s);
  }
  if (ED.pointer) {
    const p = project(glPos(ED.pointer.gx, ED.pointer.y + 48, ED.pointer.gz));
    if (p) { const l = label(n++); l.className = 'lbl ptr'; l.innerHTML = `${icon('target')}<span>Pointer</span>`; l.style.display = ''; l.style.transform = `translate(${p[0]}px,${p[1]}px)`; l._act = null; }
  }
  for (let i = n; i < labelPool.length; i++) labelPool[i].style.display = 'none';
}

/* ------------------------------------------------------------------ HUD */
function hud(fps) {
  const c = ED.cam, g = groundAt(c.x, -c.z), [tx, tz] = camTile();
  const near = nearestStations(c.x, -c.z, 1)[0];
  const head = ((c.yaw / DEG) % 360 + 360) % 360;
  $('#ed-hud').innerHTML = `<span>${icon('target')} tile ${tx}, ${tz}</span><span>height ${g === null ? '—' : Math.round(c.y - g) + ' m'}</span>
    <span>heading ${Math.round(head)}°</span><span>${(ED.shift || ED.fastLatch) ? '<b class="fast">2× speed</b>' : '1× speed'}</span>
    ${near ? `<span>near <b>${esc(near.name)}</b> ${km(near.d)}</span>` : ''}<span>${fps} fps · ${ED.tiles.size} tiles</span>
    ${AU.on ? `<span class="aud">${icon('volume')} ${AU.playing.size} playing</span>` : ''}`;
  $('#ed-compass').style.transform = `rotate(${-head}deg)`;
}

/* ------------------------------------------------------------------ render loop */
let last = performance.now(), frames = 0, fpsT = 0, fps = 0, streamT = 0, labelT = 0, audioT = 0, rebuildT = 0;
function frame(now) {
  if (!ED.active || !ED.data) { ED.running = false; return; }
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (ED.fly) {
    ED.fly.t = Math.min(1, ED.fly.t + dt / 0.9); const k = 1 - Math.pow(1 - ED.fly.t, 3), a = ED.fly.from, b = ED.fly.to;
    let dy = b.yaw - a.yaw;
    for (const p of ['x', 'y', 'z', 'pitch']) ED.cam[p] = a[p] + (b[p] - a[p]) * k;
    ED.cam.yaw = a.yaw + dy * k;
    if (ED.fly.t >= 1) { ED.fly = null; fillNearStations(); renderList(true); rebuildOverlay(); }
  }
  const moved = moveStep(dt);
  const g = groundAt(ED.cam.x, -ED.cam.z); if (g !== null && ED.cam.y < g + 2) ED.cam.y = g + 2;
  updateMatrices();
  // draw
  const dark = document.documentElement.dataset.theme !== 'light';
  const fog = dark ? [0.06, 0.09, 0.16] : [0.78, 0.86, 0.95];
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(...fog, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const fogFar = ED.mode === 'map' ? 200000 : 14000, eye = [ED.cam.x, ED.cam.y, ED.cam.z];
  // terrain
  let P = prog.terrain; gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniform3fv(P.u.uCam, eye); gl.uniform3fv(P.u.uFog, fog); gl.uniform1f(P.u.uFogFar, fogFar);
  gl.uniform1f(P.u.uGridA, ED.mode === 'map' ? 0.6 : 0.35); gl.uniform1f(P.u.uLo, ED.hLo); gl.uniform1f(P.u.uHi, ED.hHi);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
  for (const t of ED.tiles.values()) {
    if (!t.terr) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, t.terr);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.drawElements(gl.TRIANGLES, (GRID - 1) * (GRID - 1) * 6, gl.UNSIGNED_SHORT, 0);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  // lines: overview, track, overlay
  P = prog.line; gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniform3fv(P.u.uCam, eye); gl.uniform3fv(P.u.uFog, fog); gl.uniform1f(P.u.uFogFar, fogFar);
  const drawLines = L => { if (!L) return; gl.bindBuffer(gl.ARRAY_BUFFER, L.buf); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12); gl.drawArrays(gl.LINES, 0, L.count); };
  if (overviewLines && (ED.mode === 'map' || true)) drawLines(overviewLines);
  for (const t of ED.tiles.values()) drawLines(t.track);
  gl.disable(gl.DEPTH_TEST); drawLines(overlayLines); gl.enable(gl.DEPTH_TEST);
  // sound points
  if (soundBuf && soundCount) {
    P = prog.pts; gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, VP); gl.uniform1f(P.u.uScale, ED.mode === 'map' ? 9000 : 2600);
    gl.enableVertexAttribArray(2);
    gl.bindBuffer(gl.ARRAY_BUFFER, soundBuf);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
    gl.disable(gl.DEPTH_TEST); gl.drawArrays(gl.POINTS, 0, soundCount); gl.enable(gl.DEPTH_TEST);
    gl.disableVertexAttribArray(2);
  }
  // timers
  frames++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; hud(fps); }
  streamT += dt; if (streamT > 0.35) { streamT = 0; streamTiles(); }
  labelT += dt; if (labelT > 0.033) { labelT = 0; drawLabels(); }
  rebuildT += dt; if ((moved || ED.fly) && rebuildT > 0.6) { rebuildT = 0; rebuildOverlay(); scheduleList(); }
}
function startLoop() { if (ED.running || !ED.active || !ED.data) return; ED.running = true; last = performance.now(); requestAnimationFrame(frame); }

/* ------------------------------------------------------------------ spatial audio (follows each .sms) */
const AU = {
  ctx: null, master: null, on: false, buffers: new Map(), voices: new Map(), playing: new Set(), levels: new Map(), state: new Map(),
  ensure() {
    if (!this.ctx) { this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
    this.master.gain.value = +$('#ed-snd-vol').value; return this.ctx;
  },
  start() { this.ensure(); this.ctx.resume(); this.on = true; },
  stop() { this.on = false; for (const v of this.voices.values()) this.kill(v); this.voices.clear(); this.playing.clear(); this.levels.clear(); this.state.clear(); rebuildSounds(); },
  buffer(path) {
    if (!path) return Promise.reject(new Error('no wav'));
    if (!this.buffers.has(path)) this.buffers.set(path, fetch(SAM.audioUrl(path)).then(r => { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); }).then(b => this.ctx.decodeAudioData(b)));
    return this.buffers.get(path);
  },
  curve(c, d) {
    if (!c || !c.length) return 1;
    if (d <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) if (d <= c[i][0]) { const [d0, v0] = c[i - 1], [d1, v1] = c[i]; return v0 + (v1 - v0) * ((d - d0) / Math.max(1e-6, d1 - d0)); }
    return c[c.length - 1][1];
  },
  speed() { return (+$('#ed-speed').value || 0) / 3.6; },  // km/h slider -> m/s (Open Rails Speed variable)
  apply(ss, tr, sm) {
    const a = tr.action || '';
    if (a.startsWith('StartLoop')) { ss.on = true; ss.oneShot = false; ss.wav = tr.wavs[0] || ss.wav || sm.wavs[0]; }
    else if (a.startsWith('ReleaseLoopRelease')) { ss.on = false; }
    else if (a === 'PlayOneShot') { ss.on = true; ss.oneShot = true; ss.wav = tr.wavs[0] || sm.wavs[0]; ss.shotAt = performance.now(); }
  },
  candidates() {
    const src = $('#ed-snd-src').value, out = [];
    if (src !== 'ttype') for (const s of allSounds()) if (!ED.removed.has(s.id)) out.push(s);
    if (src !== 'ssource') for (const r of ED.data.regions) out.push(r);
    return out;
  },
  update() {
    if (!this.on || !ED.data) return;
    const ctx = this.ensure(), L = ctx.listener, c = ED.cam, f = camForward(), t = ctx.currentTime;
    if (L.positionX) { L.positionX.setTargetAtTime(c.x, t, 0.05); L.positionY.setTargetAtTime(c.y, t, 0.05); L.positionZ.setTargetAtTime(c.z, t, 0.05);
      L.forwardX.setTargetAtTime(f[0], t, 0.05); L.forwardY.setTargetAtTime(f[1], t, 0.05); L.forwardZ.setTargetAtTime(f[2], t, 0.05); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(c.x, c.y, c.z); L.setOrientation(f[0], f[1], f[2], 0, 1, 0); }
    const mode = $('#ed-snd-mode').value;
    // decide, per source and stream, what the .sms says should be playing now
    const want = [];
    for (const s of this.candidates()) {
      if (ED.muted.has(s.id)) continue;
      if (mode === 'solo' && (!ED.sel || ED.sel.id !== s.id)) continue;
      const info = smsOf(s); if (!info || !info.streams) continue;
      const d = Math.hypot(s.gx - c.x, s.y - c.y, -s.gz - c.z);
      const act = info.activation ?? 1e9, deact = info.deactivation ?? act;
      // Activation / Deactivation distance, as in the .sms: outside them the source sleeps and
      // its streams start from their initial state again when it wakes (as Open Rails does).
      let st = this.state.get(s.id);
      if (!st || !st.active) { if (d <= act) st = { active: true, streams: [] }; else { this.state.set(s.id, { active: false, streams: [] }); continue; } }
      if (d > deact) { this.state.set(s.id, { active: false, streams: [] }); continue; }
      const vals = { Distance: d, Speed: AU.speed() };
      info.streams.forEach((sm, i) => {
        let ss = st.streams[i];
        if (!ss) {  // fresh stream: Initial_Trigger fires, variables start from "far away" / "standing still"
          ss = st.streams[i] = { on: false, wav: null, oneShot: false, prev: { Distance: Infinity, Speed: 0 } };
          for (const tr of sm.triggers || []) if (tr.kind === 'Initial') this.apply(ss, tr, sm);
        }
        for (const tr of sm.triggers || []) {
          if (tr.kind !== 'Variable' || !(tr.var in vals)) continue;
          const v = vals[tr.var], p = ss.prev[tr.var];
          const crossed = tr.dir === 'Inc' ? (p < tr.value && v >= tr.value) : (p > tr.value && v <= tr.value);
          if (crossed) this.apply(ss, tr, sm);
        }
        ss.prev = { ...vals };
        if (!ss.on) return;
        let g = (info.volume ?? 1) * (sm.volume ?? 1);
        if (sm.curveType === 'DistanceControlled') g *= this.curve(sm.curve, d);
        else if (sm.curveType === 'SpeedControlled') g *= this.curve(sm.curve, vals.Speed);
        if (sm.curveType !== 'DistanceControlled') g *= Math.max(0, 1 - d / Math.max(1, act));  // no distance curve in the file: fade out across its Activation distance
        want.push({ key: s.id + '#' + i + '#' + ss.wav, s, sm, d, gain: g, wav: ss.wav, oneShot: ss.oneShot });
      });
      this.state.set(s.id, st);
    }
    want.sort((a, b) => a.d - b.d);
    let keep = want;
    if (mode === 'nearest') keep = want.slice(0, 1);
    keep = keep.slice(0, 16);
    const keepKeys = new Set(keep.map(w => w.key));
    for (const [k, v] of this.voices) if (!keepKeys.has(k)) { this.kill(v); this.voices.delete(k); }
    this.playing.clear(); this.levels.clear();
    for (const w of keep) {
      let v = this.voices.get(w.key);
      if (!v) {
        v = { key: w.key, id: w.s.id, gain: ctx.createGain(), pan: ctx.createPanner(), an: ctx.createAnalyser(), src: null, data: null };
        v.pan.panningModel = 'HRTF'; v.pan.distanceModel = 'linear'; v.pan.rolloffFactor = 0; v.pan.refDistance = 1;
        v.an.fftSize = 256; v.data = new Float32Array(v.an.fftSize);
        v.gain.gain.value = 0; v.gain.connect(v.pan); v.pan.connect(v.an); v.an.connect(this.master);
        this.voices.set(w.key, v);
        const wi = (w.sm.wavs || []).findIndex(n => w.wav && n.toLowerCase() === w.wav.toLowerCase());
        const path = (w.sm.wavPaths || [])[wi >= 0 ? wi : 0];
        this.buffer(path).then(buf => {
          if (!this.voices.has(w.key)) return;
          const src = ctx.createBufferSource(); src.buffer = buf; src.loop = !w.oneShot; src.connect(v.gain); src.start(); v.src = src;
        }).catch(() => { v.bad = true; });
      }
      const p = v.pan;
      if (p.positionX) { p.positionX.value = w.s.gx; p.positionY.value = w.s.y + 2; p.positionZ.value = -w.s.gz; } else p.setPosition(w.s.gx, w.s.y + 2, -w.s.gz);
      v.gain.gain.setTargetAtTime(Math.max(0, w.gain), ctx.currentTime, 0.08);
      this.playing.add(w.s.id);
      v.an.getFloatTimeDomainData(v.data); let rms = 0; for (const x of v.data) rms += x * x; rms = Math.sqrt(rms / v.data.length);
      this.levels.set(w.s.id, Math.max(this.levels.get(w.s.id) || 0, Math.min(1, rms * 3.2)));
    }
    this.master.gain.value = +$('#ed-snd-vol').value;
    // live sound bars
    $$('#ed-snd-list .sbar').forEach(el => {
      const id = el.dataset.id, lv = this.levels.get(id) || 0, st = this.state.get(id);
      el.querySelector('.sb-meter i').style.width = Math.round(lv * 100) + '%';
      const tag = el.querySelector('.sb-state');
      tag.textContent = this.playing.has(id) ? 'playing' : st && st.active ? 'in range' : '';
      tag.className = 'sb-state ' + (this.playing.has(id) ? 'on' : st && st.active ? 'near' : '');
    });
    if (this._lastPlay !== this.playing.size) { this._lastPlay = this.playing.size; rebuildSounds(); }
  },
  kill(v) { try { v.src && v.src.stop(); } catch { /* already stopped */ } try { v.an.disconnect(); v.gain.disconnect(); } catch { /* ignore */ } },
};
$('#ed-snd-on').addEventListener('change', e => { if (e.target.checked) { AU.start(); SAM.toast('Route sound on — move around to hear each sound by its own .sms distances and volume curve.', 'info', 3200); } else AU.stop(); });
$('#ed-snd-src').addEventListener('change', () => { AU.stop(); if ($('#ed-snd-on').checked) AU.start(); rebuildSounds(); renderList(); });
setInterval(() => { if (AU.on && ED.data) { try { AU.update(); } catch (e) { console.error(e); } } }, 100);  // independent of drawing, keeps going when the view is not painted
$('#ed-speed').addEventListener('input', () => { $('#ed-speed-lbl').textContent = $('#ed-speed').value + ' km/h'; });
function speedVis() { $('#ed-speed-wrap').hidden = $('#ed-snd-src').value === 'ssource'; }
$('#ed-snd-src').addEventListener('change', speedVis); speedVis();
$('#ed-snd-mode').addEventListener('change', () => { for (const v of AU.voices.values()) AU.kill(v); AU.voices.clear(); });

/* ------------------------------------------------------------------ load route */
function prepSounds(list) { return list.map(s => ({ ...s, kind: 'sound' })); }
function fillRoutes() {
  const sel = $('#ed-route'), cur = sel.value || SAM.state.settings.lastRoute;
  const routes = SAM.allRoutes();
  sel.innerHTML = routes.map(r => `<option value="${esc(r.path)}">${esc(r.name)}</option>`).join('') || '<option value="">Set the MSTS/OR folder in Settings</option>';
  if (routes.some(r => r.path === cur)) sel.value = cur;
}
async function loadRoute() {
  const route = $('#ed-route').value;
  if (!route) { SAM.toast('Choose your MSTS / Open Rails folder in Settings first.', 'warn'); return; }
  if ((ED.added.length || ED.removed.size) && !(await SAM.confirmBox('Discard unsaved changes?', 'Loading a route discards the unsaved changes.', 'Discard'))) return;
  if (!gl && !initGLSafe()) return;
  $('#ed-loading').hidden = false; $('#ed-loading-txt').textContent = 'Reading the track database, stations and world sound files…';
  try {
    const d = await SAM.api('world/load', { route });
    AU.stop();
    for (const t of ED.tiles.values()) { if (t.terr) gl.deleteBuffer(t.terr); if (t.track) gl.deleteBuffer(t.track.buf); }
    ED.tiles.clear(); ED.loadingTiles.clear();
    d.sounds = prepSounds(d.sounds); d.regions = d.regions.map(r => ({ ...r, kind: 'region' }));
    ED.data = d; ED.route = route; ED.routeTiles = new Set(d.tiles.map(t => tileKey(t[0], t[1])));
    ED.ssByFile = new Map(d.ssource.map(e => [e.file.toLowerCase(), e]));
    ED.added = []; ED.removed.clear(); ED.undo = []; ED.sel = null; ED.pointer = null; ED.selStation = null; ED.hLo = 1e9; ED.hHi = -1e9;
    dirty();
    // overview track lines
    const ov = []; for (const line of d.overview) for (let i = 0; i + 5 < line.length; i += 3) ov.push(line[i], line[i + 1], line[i + 2], line[i + 3], line[i + 4], line[i + 5]);
    if (overviewLines) gl.deleteBuffer(overviewLines.buf);
    overviewLines = buildLines(ov, [0.62, 0.70, 0.85, 0.7], 1.6);
    // start at the station with the most sounds nearby, looking at it
    let start = d.stations[0];
    if (d.sounds.length && d.stations.length) {
      const s0 = d.sounds[Math.floor(d.sounds.length / 2)]; start = d.stations.reduce((a, b) => Math.hypot(b.x - s0.gx, b.z - s0.gz) < Math.hypot(a.x - s0.gx, a.z - s0.gz) ? b : a);
    }
    const sx = start ? start.x : 0, sz = start ? start.z : 0, sy = start ? start.y : 0;
    Object.assign(ED.cam, { x: sx, y: sy + 260, z: -sz + 520, yaw: 0, pitch: -24 * DEG, fov: 60 * DEG });
    ED.mode = '3d'; $('#ed-mode-pill').textContent = '3D';
    $('#ed-empty').hidden = true;
    fillNearStations(); renderPlaceList(); renderList(); renderStations(); renderSel(); renderPointer(); rebuildSounds();
    await streamTiles();
    SAM.updateHeaderRoute(route);
    SAM.toast(`<b>${esc(d.routeName)}</b>: ${d.stations.length} stations · ${d.sounds.length} placed sounds · ${d.regions.length} track-sound regions (read in ${d.parseSeconds}s)`, 'ok', 4500);
    startLoop();
  } catch (e) { SAM.toast('Could not load the route: ' + esc(e.message), 'err', 8000); }
  finally { $('#ed-loading').hidden = true; }
}
function initGLSafe() {
  try { if (initGL()) return true; } catch (e) { console.error(e); }
  $('#ed-empty').innerHTML = `<b>3D view is not available</b><span class="muted small">WebGL could not start (${esc(SAM.webglRenderer())}). Update your graphics driver, or set Settings → Graphics to "Integrated" and restart.</span>`;
  return false;
}
$('#ed-load').onclick = loadRoute;

/* ------------------------------------------------------------------ menus */
$$('.ed-menu').forEach(m => {
  const btn = m.querySelector('.ed-menu-btn');
  btn.onclick = e => { e.stopPropagation(); const open = m.classList.contains('open'); $$('.ed-menu').forEach(x => x.classList.remove('open')); if (!open) m.classList.add('open'); };
});
document.addEventListener('click', () => $$('.ed-menu').forEach(x => x.classList.remove('open')));
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ed]'); if (!b) return;
  const a = b.dataset.ed;
  if (a === 'save') save(); if (a === 'undo') undo(); if (a === 'exit') exitEditor(); if (a === 'reload') loadRoute();
  if (a === 'view3d') setMode('3d'); if (a === 'viewmap') setMode('map'); if (a === 'labels') toggleLabels(); if (a === 'home') goSel();
  if (a === 'help') openHelp(); if (a === 'tsre') openTsre();
});
$('#ed-save-btn').onclick = save;

async function openTsre() {
  if (!ED.data) { SAM.toast('Load a route first.', 'warn'); return; }
  const info = await SAM.api('tsre/info', {});
  if (!info.found) { SAM.toast('TSRE5.exe not found. Set it in Settings → Graphics & 3D editor.', 'warn', 6000); return; }
  const p = ED.sel || ED.pointer, [tx, tz] = p ? [p.tx, p.tz] : camTile();
  const v = info.values || {};
  const ok = await SAM.modal(`<h3>${icon('open')}Open in TSRE5</h3><p class="lead">TSRE5 opens the route set in its <span class="mono">settings.txt</span>. Set it to this route and tile?</p>
    <pre class="code mono">gameRoot  = ${esc(v.gameRoot || '—')}   →  ${esc(ED.route.replace(/\\[^\\]+\\[^\\]+$/, '').replace(/\\/g, '/'))}
routeName = ${esc(v.routeName || '—')}   →  ${esc(ED.data.routeName)}
startTileX / startTileY  →  ${tx} / ${tz}</pre><p class="muted small">A copy is kept as settings.txt.SAM_backup. Lines are written plain (TSRE 0.6 breaks on // comments).</p>`,
    [{ label: 'Cancel', cls: 'ghost', value: null }, { label: 'Just open TSRE5', cls: 'ghost', value: 'open' }, { label: 'Set route & open', value: 'apply', icon: 'open' }]);
  if (!ok) return;
  try { await SAM.api('tsre/open', { route: ED.route, apply: ok === 'apply', tile: [tx, tz] }); SAM.toast('TSRE5 is starting…', 'ok'); }
  catch (e) { SAM.toast(esc(e.message), 'err'); }
}

/* ------------------------------------------------------------------ tab life-cycle */
window.addEventListener('beforeunload', e => { if (ED.added.length || ED.removed.size) { e.preventDefault(); e.returnValue = ''; } });
/* deep link: #editor&autoload&sel=<sound name>&view=map  (opens the editor straight on a sound) */
let deepDone = false;
async function deepLink() {
  if (deepDone) return; deepDone = true;
  const p = new URLSearchParams(location.hash.slice(1).replace(/^[^&]*&?/, ''));
  if (!p.has('autoload')) return;
  await loadRoute();
  const name = (p.get('sel') || '').toLowerCase();
  if (name && ED.data) { const s = ED.data.sounds.find(x => displayName(x).toLowerCase().includes(name) || x.file.toLowerCase().includes(name)); if (s) { select(s); flyTo(s.gx, s.gz, s.y); Object.assign(ED.cam, ED.fly.to); ED.fly = null; } }
  if (p.get('view') === 'map') { setMode('map'); if (ED.sel) { ED.cam.x = ED.sel.gx; ED.cam.z = -ED.sel.gz; } }
  if (p.has('alt') && ED.sel) ED.cam.y = ED.sel.y + +p.get('alt');
  rebuildOverlay(); streamTiles(); fillNearStations(); renderList(); renderStations();
  if (p.has('sound')) { $('#ed-snd-on').checked = true; }
}
window.SAMEditor = {
  onTab(tab) {
    const was = ED.active; ED.active = tab === 'editor';
    if (ED.active) { fillRoutes(); if (ED.data) startLoop(); setTimeout(() => canvas.focus(), 50); deepLink(); }
    else if (was) { ED.keys.clear(); ED.hold.clear(); if (AU.ctx) AU.ctx.suspend(); }
    if (ED.active && AU.ctx && AU.on) AU.ctx.resume();
  },
  state: ED, audio: AU,
  _step: dt => moveStep(dt),  // used by self-tests
};
})();
