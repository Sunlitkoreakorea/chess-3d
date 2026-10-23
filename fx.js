// 연출 효과: 기물을 잡을 때의 임팩트(기물별 스타일 × 단계)와 체크메이트 연출.
// 파티클·충격파·빛기둥·빔·카메라 흔들림·슬로모션을 전부 코드로 만든다 (외부 파일 없음).
import * as THREE from 'three';

const TAU = Math.PI * 2;
const rnd = (a = 0, b = 1) => a + (b - a) * Math.random();
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const px = (sq) => (sq & 7) - 3.5;
const pz = (sq) => 3.5 - (sq >> 4);

// ───────────────────────── 잡기 등급 ─────────────────────────
// 기물 종류: 1 폰 · 2 나이트 · 3 비숍 · 4 룩 · 5 퀸 · 6 킹
export const VALUE = [0, 1, 3, 3, 5, 9, 0];
const LEVEL = [0, 0, 1, 1, 2, 3, 1];          // 몸값 등급 (폰 0 … 퀸 3)
const SUBJ = ['', '폰이', '나이트가', '비숍이', '룩이', '퀸이', '킹이'];
const OBJ = ['', '폰을', '나이트를', '비숍을', '룩을', '퀸을', '킹을'];

/**
 * 잡은 말이 값질수록 크게, 작은 말이 큰 말을 잡으면(업셋) 더 크게. 0(먼지) ~ 4(전설).
 * 폰이 말을 잡으면 한 단계 더, 퀸을 잡으면 한 단계 더.
 */
export function captureTier(attacker, victim) {
  let t = LEVEL[victim];
  if (VALUE[attacker] < VALUE[victim]) t += 1;
  if (attacker === 1 && victim !== 1) t += 1;
  if (victim === 5) t += 1;
  return Math.min(4, t);
}

export function captureBanner(attacker, victim, tier) {
  if (tier < 3) return null;
  const upset = VALUE[attacker] < VALUE[victim];
  const main = `${SUBJ[attacker]} ${OBJ[victim]} ${upset ? '쓰러뜨렸다!' : '잡았다!'}`;
  let sub = '';
  if (tier === 4) sub = upset ? (attacker === 1 ? '전설의 한 수' : '대역전의 일격') : '여왕들의 결투';
  return { main, sub, tier };
}

// ───────────────────────── 질감 ─────────────────────────
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const dotTex = () => canvasTex(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const sqTex = () => canvasTex(32, 32, (g, w) => { g.fillStyle = '#fff'; g.fillRect(3, 3, w - 6, w - 6); });
function starTexture(rays) {
  return canvasTex(256, 256, (g, s) => {
    const c = s / 2;
    const glow = g.createRadialGradient(c, c, 0, c, c, c * 0.55);
    glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.4, 'rgba(255,255,255,0.45)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, s, s);
    for (let i = 0; i < rays.length; i++) {
      g.save(); g.translate(c, c); g.rotate(rays[i]);
      const gr = g.createLinearGradient(0, 0, c, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -9); g.lineTo(c, 0); g.lineTo(0, 9); g.closePath(); g.fill();
      g.rotate(Math.PI); g.beginPath(); g.moveTo(0, -9); g.lineTo(c, 0); g.lineTo(0, 9); g.closePath(); g.fill();
      g.restore();
    }
  });
}
const STAR_RAYS = {
  plus: [0, Math.PI / 2],
  x: [Math.PI / 4, -Math.PI / 4],
  six: [0, Math.PI / 3, -Math.PI / 3],
};
const pillarTex = () => canvasTex(16, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const streakTex = () => canvasTex(256, 64, (g, w, h) => {
  const gx = g.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.75, 'rgba(255,255,255,0.7)'); gx.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gx; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.5, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, w, h);
});

// ───────────────────────── 파티클 ─────────────────────────
const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale; varying float vA; varying vec3 vC;
void main(){
  vA = aAlpha; vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 320.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uMap; varying float vA; varying vec3 vC;
void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); }`;

class Particles {
  constructor(scene, { max = 1000, additive = true, tex, floorY = null }) {
    this.max = max; this.next = 0; this.floorY = floorY; this.t = 0; this.dirty = false;
    const N = max;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3); this.size = new Float32Array(N); this.alpha = new Float32Array(N);
    this.life = new Float32Array(N); this.ttl = new Float32Array(N);
    this.s0 = new Float32Array(N); this.s1 = new Float32Array(N);
    this.c0 = new Float32Array(N * 3); this.c1 = new Float32Array(N * 3);
    this.grav = new Float32Array(N); this.drag = new Float32Array(N);
    this.sway = new Float32Array(N); this.swayF = new Float32Array(N); this.ph = new Float32Array(N);
    const geo = this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aSize', this.aSize); geo.setAttribute('aAlpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uScale: { value: 600 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 10 : 7;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, o = {}) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.life[i] = this.ttl[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c0[j] = c0.r; this.c0[j + 1] = c0.g; this.c0[j + 2] = c0.b;
    const e = c1 || c0;
    this.c1[j] = e.r; this.c1[j + 1] = e.g; this.c1[j + 2] = e.b;
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0;
    this.sway[i] = o.sway || 0; this.swayF[i] = o.swayF || rnd(2, 5); this.ph[i] = rnd(0, TAU);
    this.dirty = true;
  }

  update(dt) {
    this.t += dt;
    if (!this.dirty) return;
    let live = 0;
    for (let i = 0; i < this.max; i++) {
      let L = this.life[i];
      if (L <= 0) continue;
      L -= dt;
      if (L <= 0) { this.life[i] = 0; this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.life[i] = L; live++;
      const k = 1 - L / this.ttl[i], j = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[j] *= d; this.vel[j + 2] *= d; this.vel[j + 1] = this.vel[j + 1] * d + this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt + (this.sway[i] ? Math.sin(this.t * this.swayF[i] + this.ph[i]) * this.sway[i] * dt : 0);
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.floorY !== null && this.pos[j + 1] < this.floorY) {
        this.pos[j + 1] = this.floorY;
        this.vel[j + 1] = this.vel[j + 1] < -0.5 && this.grav[i] < -3 ? -this.vel[j + 1] * 0.3 : 0;
        this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6;
      }
      this.size[i] = lerp(this.s0[i], this.s1[i], k);
      this.alpha[i] = Math.min(1, k * 10) * (1 - k * k);
      this.col[j] = lerp(this.c0[j], this.c1[j], k);
      this.col[j + 1] = lerp(this.c0[j + 1], this.c1[j + 1], k);
      this.col[j + 2] = lerp(this.c0[j + 2], this.c1[j + 2], k);
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
    if (!live) this.dirty = false;
  }

  clear() {
    this.life.fill(0); this.alpha.fill(0); this.size.fill(0);
    this.aAlpha.needsUpdate = this.aSize.needsUpdate = true; this.dirty = false;
  }
}

// 편(백=금빛, 흑=보라·진홍)
const C = (r, g, b) => new THREE.Color(r, g, b);
const PAL = [
  { c0: C(1.0, 0.86, 0.45), c1: C(1.0, 0.5, 0.12), hot: C(1.0, 0.97, 0.85) },
  { c0: C(0.72, 0.5, 1.0), c1: C(1.0, 0.22, 0.45), hot: C(0.95, 0.88, 1.0) },
];
const DUST = C(0.78, 0.66, 0.5), STONE = C(0.42, 0.36, 0.32), WHITE = C(1, 1, 1);
const CONFETTI = [C(1, 0.82, 0.3), C(1, 0.4, 0.5), C(0.4, 0.8, 1), C(0.6, 1, 0.6), C(1, 1, 1), C(0.8, 0.5, 1)];

export class Effects {
  constructor(stage) {
    this.st = stage;
    const scene = stage.scene;
    this.scene = scene;
    this.glow = new Particles(scene, { max: 3200, additive: true, tex: dotTex() });
    this.puff = new Particles(scene, { max: 500, additive: false, tex: dotTex() });
    this.debris = new Particles(scene, { max: 500, additive: false, tex: sqTex(), floorY: 0.03 });
    this.confetti = new Particles(scene, { max: 900, additive: false, tex: sqTex(), floorY: -0.4 });
    this.systems = [this.glow, this.puff, this.debris, this.confetti];
    this.light = new THREE.PointLight(0xffd88a, 0, 18, 2);
    this.light.position.set(0, 2, 0);
    scene.add(this.light);
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 72); this.ringGeo.rotateX(-Math.PI / 2);
    this.planeGeo = new THREE.PlaneGeometry(1, 1); this.planeGeo.rotateX(-Math.PI / 2);
    this.pillarGeo = new THREE.CylinderGeometry(1, 1.25, 1, 40, 1, true);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    this.tex = {
      pillar: pillarTex(), streak: streakTex(),
      plus: starTexture(STAR_RAYS.plus), x: starTexture(STAR_RAYS.x), six: starTexture(STAR_RAYS.six),
    };
    this.shakeAmp = 0;
    this.gen = 0;                 // reset() 마다 올라가서, 지난 판의 연출이 새 판에 이어지지 않게 한다
    this.off = new THREE.Vector3();
    this.flashEl = document.getElementById('flash');
    this.vigEl = document.getElementById('vignette');
  }

  // ───── 프레임 ─────
  update(dt) {
    const r = this.st.renderer, cam = this.st.camera;
    const scale = r.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    for (const s of this.systems) { s.mat.uniforms.uScale.value = scale; s.update(dt); }
  }

  shakeOffset(rdt) {
    if (this.shakeAmp < 0.0008) { this.shakeAmp = 0; return this.off.set(0, 0, 0); }
    const a = this.shakeAmp;
    this.off.set(rnd(-a, a), rnd(-a, a) * 0.6, rnd(-a, a));
    this.shakeAmp *= Math.exp(-6.5 * rdt);
    return this.off;
  }
  shake(a) { this.shakeAmp = Math.max(this.shakeAmp, a); }

  flash(color, strength, dur = 0.5) {
    const el = this.flashEl; if (!el) return;
    el.style.transition = 'none';
    el.style.background = `radial-gradient(circle at 50% 55%, rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${strength}) 0%, rgba(255,255,255,${strength * 0.5}) 40%, rgba(255,255,255,0) 85%)`;
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = `opacity ${dur}s ease-out`;
    el.style.opacity = '0';
  }
  vignette(on) { if (this.vigEl) this.vigEl.classList.toggle('on', on); }

  flashLight(x, z, peak, dur, color, y = 1.6) {
    const L = this.light;
    L.color.copy(color); L.position.set(x, y, z);
    this.st.tween(dur, (k) => { L.intensity = peak * Math.pow(1 - k, 2) * Math.min(1, k * 14); });
  }

  reset() {
    this.gen++;
    for (const s of this.systems) s.clear();
    this.light.intensity = 0; this.shakeAmp = 0;
    this.vignette(false);
    if (this.flashEl) { this.flashEl.style.transition = 'none'; this.flashEl.style.opacity = '0'; }
  }

  // ───── 기본 부품 ─────
  ring(x, z, { r = 2, dur = 0.7, color, y = 0.05, op = 0.9, delay = 0 }) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.set(x, y, z); m.scale.set(0.05, 1, 0.05); m.renderOrder = 8; m.visible = false;
    this.scene.add(m);
    this.st.wait(delay).then(() => {
      m.visible = true;
      return this.st.tween(dur, (k) => {
        const s = r * easeOut(k) + 0.05; m.scale.set(s, 1, s);
        mat.opacity = op * Math.pow(1 - k, 1.4);
      });
    }).then(() => { this.scene.remove(m); mat.dispose(); });
  }

  pillar(x, z, { radius = 0.5, height = 9, dur = 1, color, op = 0.7, delay = 0 }) {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex.pillar, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const m = new THREE.Mesh(this.pillarGeo, mat);
    m.position.set(x, height / 2 - 0.05, z); m.scale.set(radius * 0.2, height, radius * 0.2); m.renderOrder = 8; m.visible = false;
    this.scene.add(m);
    this.st.wait(delay).then(() => {
      m.visible = true;
      return this.st.tween(dur, (k) => {
        const grow = Math.min(1, k / 0.15), s = radius * (0.2 + 0.8 * grow) * (1 - 0.35 * k);
        m.scale.set(s, height, s);
        mat.opacity = op * (k < 0.15 ? k / 0.15 : Math.pow(1 - (k - 0.15) / 0.85, 1.2));
      });
    }).then(() => { this.scene.remove(m); mat.dispose(); });
  }

  streak(ax, az, bx, bz, { width = 0.5, color, dur = 0.5, op = 0.9, y = 0.06 }) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 0.01;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex.streak, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const m = new THREE.Mesh(this.planeGeo, mat);
    m.position.set((ax + bx) / 2, y, (az + bz) / 2); m.rotation.y = -Math.atan2(dz, dx); m.renderOrder = 8;
    m.scale.set(len, 1, width);
    this.scene.add(m);
    return this.st.tween(dur, (k) => {
      m.scale.set(len, 1, width * (1 - 0.6 * k));
      mat.opacity = op * Math.pow(1 - k, 1.3);
    }).then(() => { this.scene.remove(m); mat.dispose(); });
  }

  beam3d(a, b, { radius = 0.07, color, dur = 1.5, op = 0.9 }) {
    const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
    const grp = new THREE.Group();
    const mk = (r, col, o) => {
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
      const m = new THREE.Mesh(this.beamGeo, mat); m.scale.set(r, len, r); m.renderOrder = 9; grp.add(m);
      return { mat, o };
    };
    const outer = mk(radius * 1.8, color, op * 0.55), core = mk(radius * 0.6, WHITE, op);
    grp.position.copy(a).addScaledVector(dir, 0.5);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.scene.add(grp);
    return this.st.tween(dur, (k) => {
      const env = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
      const pulse = 0.8 + 0.2 * Math.sin(k * 40);
      outer.mat.opacity = outer.o * env * pulse; core.mat.opacity = core.o * env;
    }, null, true).then(() => { this.scene.remove(grp); outer.mat.dispose(); core.mat.dispose(); });
  }

  star(x, y, z, { size = 3, color, dur = 0.6, kind = 'six', rot = 0, op = 1 }) {
    const mat = new THREE.SpriteMaterial({ map: this.tex[kind], color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0, rotation: rot, toneMapped: false, fog: false });
    const sp = new THREE.Sprite(mat); sp.position.set(x, y, z); sp.renderOrder = 12;
    this.scene.add(sp);
    return this.st.tween(dur, (k) => {
      const s = size * (0.3 + 0.9 * easeOut(k)); sp.scale.set(s, s, 1);
      mat.opacity = op * (k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 1.1));
      mat.rotation = rot + k * 0.5;
    }).then(() => { this.scene.remove(sp); mat.dispose(); });
  }

  // ───── 파티클 묶음 ─────
  dust(x, z, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), sp = rnd(0.5, 1.5), r = rnd(0.05, 0.35);
      this.puff.emit(x + Math.cos(a) * r, 0.08, z + Math.sin(a) * r, Math.cos(a) * sp, rnd(0.25, 0.9), Math.sin(a) * sp, rnd(0.7, 1.3), rnd(0.35, 0.6), rnd(0.9, 1.5), DUST, DUST, { drag: 1.6 });
    }
  }
  sparksRing(x, z, { n, speed, up, c0, c1, life = 0.9, size = 0.13 }) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), sp = speed * rnd(0.45, 1);
      this.glow.emit(x, 0.15, z, Math.cos(a) * sp, rnd(0.2, 1) * up, Math.sin(a) * sp, life * rnd(0.7, 1.2), size, size * 0.2, c0, c1, { grav: -4.5, drag: 0.8 });
    }
  }
  sparksCone(x, z, dx, dz, { n, speed, spread = 0.5, up = 1.5, c0, c1, life = 0.85, size = 0.12 }) {
    const base = Math.atan2(dz, dx);
    for (let i = 0; i < n; i++) {
      const a = base + rnd(-spread, spread), sp = speed * rnd(0.4, 1);
      this.glow.emit(x, 0.2, z, Math.cos(a) * sp, rnd(0.2, 1) * up, Math.sin(a) * sp, life * rnd(0.7, 1.2), size, size * 0.2, c0, c1, { grav: -4.5, drag: 0.7 });
    }
  }
  sparksSphere(x, y, z, { n, speed, c0, c1, life = 1.5, size = 0.12, grav = -2.4, drag = 1.1 }) {
    for (let i = 0; i < n; i++) {
      const u = rnd(-1, 1), a = rnd(0, TAU), s = Math.sqrt(1 - u * u), sp = speed * rnd(0.55, 1);
      this.glow.emit(x, y, z, Math.cos(a) * s * sp, u * sp, Math.sin(a) * s * sp, life * rnd(0.7, 1.15), size, size * 0.15, c0, c1, { grav, drag });
    }
  }
  fountain(x, z, { n, speed, c0, c1, size = 0.12 }) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), r = rnd(0, 0.5);
      this.glow.emit(x + Math.cos(a) * r * 0.3, 0.1, z + Math.sin(a) * r * 0.3, Math.cos(a) * r, speed * rnd(0.6, 1.1), Math.sin(a) * r, rnd(0.9, 1.6), size, size * 0.2, c0, c1, { grav: -6, drag: 0.4 });
    }
  }
  helix(x, z, { n, height, radius, turns = 3, dur = 0.8, c0, c1 }) {
    let emitted = 0;
    const gen = this.gen;
    return this.st.tween(dur, (k) => {
      if (gen !== this.gen) return;
      const want = Math.floor(n * k);
      while (emitted < want) {
        const u = emitted / n, a = u * turns * TAU;
        this.glow.emit(x + Math.cos(a) * radius, 0.1 + u * height * 0.35, z + Math.sin(a) * radius, -Math.sin(a) * 1.2, height * 0.75, Math.cos(a) * 1.2, rnd(0.8, 1.3), rnd(0.1, 0.18), 0.03, c0, c1, { drag: 0.5 });
        emitted++;
      }
    });
  }
  rain(x, z, { n, radius, height = 6, c0, c1, dur = 1.0, size = 0.1 }) {
    let emitted = 0;
    const gen = this.gen;
    return this.st.tween(dur, (k) => {
      if (gen !== this.gen) return;
      const want = Math.floor(n * k);
      while (emitted < want) {
        const a = rnd(0, TAU), r = Math.sqrt(Math.random()) * radius;
        this.glow.emit(x + Math.cos(a) * r, height + rnd(0, 2), z + Math.sin(a) * r, 0, -rnd(1.5, 3), 0, rnd(1.5, 2.4), size, size * 0.3, c0, c1, { sway: 0.5 });
        emitted++;
      }
    });
  }
  debrisBurst(x, z, { n, speed, color = STONE, size = 0.12 }) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), sp = speed * rnd(0.4, 1);
      const c = color.clone().multiplyScalar(rnd(0.7, 1.25));
      this.debris.emit(x, 0.15, z, Math.cos(a) * sp, rnd(1.5, 4.2), Math.sin(a) * sp, rnd(1.0, 1.6), size * rnd(0.7, 1.4), size * 0.8, c, c, { grav: -10 });
    }
  }

  // ───── 잡기 임팩트 ─────
  /**
   * 잡은 기물 스타일(attacker)별 연출을 단계(tier 0~4)만큼 키워서 보여 준다.
   * 고급 기물일수록 입자 수가 늘고, 값진 기물을 잡을수록 단계가 오른다.
   */
  impact({ sq, from, attacker, color, tier }) {
    const t = tier, st = this.st, P = PAL[color];
    const x = px(sq), z = pz(sq), fx = px(from), fz = pz(from);
    let dx = x - fx, dz = z - fz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const k = 0.75 + 0.15 * LEVEL[attacker];
    const n = (a) => Math.max(1, Math.round(a * k));

    this.dust(x, z, n(5 + 8 * t));
    this.sparksRing(x, z, { n: n(10 + 14 * t), speed: 2.2 + 0.9 * t, up: 1.6 + 0.5 * t, c0: P.hot, c1: P.c1 });
    if (t >= 1) {
      this.ring(x, z, { r: 1.1 + 0.55 * t, color: P.c0 });
      this.shake([0, 0.018, 0.035, 0.07, 0.13][t]);
      this.flashLight(x, z, 18 + 38 * t, 0.55, P.c0);
    }

    switch (attacker) {
      case 1: // 폰: 작지만 업셋이면 하늘에서 내리꽂는 빛
        if (t >= 1) this.fountain(x, z, { n: n(8 * t), speed: 4 + t, c0: P.hot, c1: P.c1 });
        if (t >= 3) {
          this.pillar(x, z, { radius: 0.35 + 0.08 * t, dur: 0.9 + 0.2 * t, color: P.c0 });
          this.star(x, 0.9, z, { size: 3 + 0.8 * t, color: P.hot, kind: 'six' });
          this.ring(x, z, { r: 2.2 + 0.8 * t, color: P.hot, delay: 0.12 });
        }
        if (t >= 4) {
          this.rain(x, z, { n: 90, radius: 1.8, c0: P.hot, c1: P.c1, dur: 1.2 });
          this.pillar(x, z, { radius: 0.95, dur: 1.5, color: P.c1, op: 0.28, delay: 0.05 });
        }
        break;
      case 2: // 나이트: 도약해서 앞으로 튀는 불꽃과 말발굽 충격
        this.sparksCone(x, z, dx, dz, { n: n(16 + 12 * t), speed: 4 + 1.2 * t, c0: P.hot, c1: P.c1 });
        this.ring(x, z, { r: 1 + 0.4 * t, color: P.c0, delay: 0.1 });
        if (t >= 2) this.star(x, 0.7, z, { size: 1.6 + 0.7 * t, color: P.hot, kind: 'x' });
        if (t >= 3) {
          this.pillar(x, z, { radius: 0.3 + 0.07 * t, dur: 0.9, color: P.c0 });
          this.sparksCone(x, z, dx, dz, { n: 40, speed: 6, spread: 0.25, c0: WHITE, c1: P.c0, up: 2.5 });
        }
        break;
      case 3: // 비숍: 대각선을 가르는 빛줄기와 성스러운 별
        this.streak(fx, fz, x, z, { width: 0.55 + 0.15 * t, color: P.c0, dur: 0.6 });
        if (t >= 2) this.streak(fx, fz, x, z, { width: 0.2, color: WHITE, dur: 0.5 });
        this.star(x, 0.8, z, { size: 2.4 + 0.9 * t, color: P.hot, kind: 'x' });
        this.helix(x, z, { n: n(20 + 14 * t), height: 2 + 0.6 * t, radius: 0.5, c0: P.hot, c1: P.c1 });
        if (t >= 2) this.pillar(x, z, { radius: 0.22 + 0.05 * t, height: 10, dur: 0.9, color: P.hot });
        break;
      case 4: { // 룩: 땅을 내리치는 묵직한 충격, 십자로 갈라지는 균열
        this.debrisBurst(x, z, { n: n(8 + 8 * t), speed: 2.5 + 0.8 * t });
        this.ring(x, z, { r: 1.6 + 0.7 * t, color: P.c0, op: 1 });
        this.ring(x, z, { r: 1.1 + 0.5 * t, color: P.hot, delay: 0.08 });
        this.shake([0, 0.03, 0.06, 0.11, 0.2][t]);
        const L = 1.5 + 0.8 * t;
        for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.streak(x, z, x + ax * L, z + az * L, { width: 0.32, color: P.c0, dur: 0.7 });
        if (t >= 3) {
          for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.4; this.streak(x, z, x + Math.cos(a) * (L + 0.6), z + Math.sin(a) * (L + 0.6), { width: 0.14, color: P.hot, dur: 0.9 }); }
        }
        this.star(x, 0.6, z, { size: 2.4 + 0.8 * t, color: P.hot, kind: 'plus' });
        break;
      }
      case 5: // 퀸: 화려한 빛줄기, 겹겹의 충격파, 솟구치는 나선과 꽃잎
        this.streak(fx, fz, x, z, { width: 0.8 + 0.2 * t, color: P.c0, dur: 0.7 });
        this.streak(fx, fz, x, z, { width: 0.25, color: WHITE, dur: 0.55 });
        this.ring(x, z, { r: 1.4 + 0.6 * t, color: P.c1, delay: 0.06 });
        this.ring(x, z, { r: 1.9 + 0.8 * t, color: P.c0, delay: 0.14 });
        this.helix(x, z, { n: n(60 + 34 * t), height: 3 + 0.8 * t, radius: 0.55, turns: 3, dur: 0.9, c0: P.hot, c1: P.c1 });
        this.star(x, 0.9, z, { size: 3.6 + 1.2 * t, color: P.hot, kind: 'six' });
        if (t >= 2) this.pillar(x, z, { radius: 0.5 + 0.1 * t, dur: 1.1, color: P.c0 });
        if (t >= 3) this.rain(x, z, { n: 70, radius: 1.8, c0: P.hot, c1: P.c1, dur: 1.2 });
        break;
      case 6: // 킹: 위엄 있게 느리게 퍼지는 왕의 빛
        this.ring(x, z, { r: 2 + 0.7 * t, color: P.c0, dur: 1.1 });
        this.star(x, 0.9, z, { size: 3 + t, color: P.hot, kind: 'six', dur: 0.9 });
        if (t >= 1) this.pillar(x, z, { radius: 0.7, height: 8, dur: 1.3, color: P.c0, op: 0.55 });
        this.rain(x, z, { n: n(20 + 25 * t), radius: 1.5, c0: P.hot, c1: P.c1, dur: 1.0 });
        break;
      default: break;
    }

    if (t >= 4) { st.slowmo(0.3, 1.1); this.flash(P.hot, 0.4, 0.55); }
    else if (t === 3) { st.slowmo(0.55, 0.55); this.flash(P.hot, 0.22, 0.4); }
  }

  // ───── 체크메이트 ─────
  async mate({ kingSq, attackers = [], winner, humanWon, onGround }) {
    const st = this.st, P = PAL[winner], gen = this.gen;
    const stale = () => gen !== this.gen;
    const x = px(kingSq), z = pz(kingSq);
    st.slowmo(0.45, 2.3);

    // 카메라가 쓰러질 왕에게 다가간다
    const cam = st.camera.position;
    const dir = new THREE.Vector3(cam.x - x, 0, cam.z - z);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const flight = st.flyTo(new THREE.Vector3(x + dir.x * 5.4, 3.5, z + dir.z * 5.4), new THREE.Vector3(x, 0.9, z), 1.5);
    this.vignette(true);

    // 왕을 가두는 빛의 그물
    const kingMid = new THREE.Vector3(x, 1.0, z);
    attackers.forEach((a, i) => {
      st.wait(0.12 * i, true).then(() => {
        const ax = px(a), az = pz(a);
        this.star(ax, 0.9, az, { size: 2.2, color: P.hot, kind: 'six', dur: 0.8 });
        return this.beam3d(new THREE.Vector3(ax, 0.9, az), kingMid, { radius: 0.09, color: P.c0, dur: 1.6 });
      });
    });
    this.flashLight(x, z, 160, 1.7, P.c0, 2.2);
    await st.wait(1.1, true);
    if (stale()) return;

    // 충격파
    this.ring(x, z, { r: 3.5, color: P.c0, dur: 1.0, op: 1 });
    this.ring(x, z, { r: 5.0, color: P.c1, dur: 1.3, delay: 0.12 });
    this.ring(x, z, { r: 2.2, color: P.hot, dur: 0.8, delay: 0.2 });
    this.sparksSphere(x, 1.0, z, { n: 150, speed: 5, c0: P.hot, c1: P.c1, life: 1.6 });
    this.shake(0.16); this.flash(P.hot, 0.6, 0.7);
    await st.wait(0.2, true);
    if (stale()) return;

    // 왕이 쓰러진다 (왕관이 반짝이며 부서진다)
    await st.topple(kingSq, {
      onFrame: (top) => {
        this.glow.emit(top.x + rnd(-0.12, 0.12), top.y, top.z + rnd(-0.12, 0.12), rnd(-0.6, 0.6), rnd(0.2, 1.2), rnd(-0.6, 0.6), rnd(0.6, 1.1), 0.14, 0.03, P.hot, P.c0, { grav: -2.5 });
      },
      onGround: (gx, gz) => {
        this.dust(gx, gz, 26);
        this.debrisBurst(gx, gz, { n: 22, speed: 3, color: STONE });
        this.sparksRing(gx, gz, { n: 60, speed: 4.5, up: 3, c0: P.hot, c1: P.c1 });
        this.ring(gx, gz, { r: 3, color: P.c0 });
        this.shake(0.22);
        onGround?.();
      },
    });
    await flight;
    if (stale()) return;

    // 승자에겐 축포, 패자에겐 잿불
    if (humanWon) this.celebrate(P); else this.embers();
    st.controls.autoRotate = true; st.controls.autoRotateSpeed = 1.1;
    await st.wait(1.5, true);
  }

  celebrate(P) {
    const st = this.st, gen = this.gen;
    let emitted = 0;
    st.tween(3.6, (k) => {
      if (gen !== this.gen) return;
      const want = Math.floor(240 * k);
      while (emitted < want) {
        const c = CONFETTI[(Math.random() * CONFETTI.length) | 0];
        this.confetti.emit(rnd(-6, 6), rnd(6.5, 9), rnd(-6, 6), rnd(-0.6, 0.6), -rnd(1.2, 2.4), rnd(-0.6, 0.6), 5, rnd(0.1, 0.18), 0.1, c, c, { sway: rnd(0.6, 1.4) });
        emitted++;
      }
    }, null, true);
    const cols = [P.c0, P.hot, CONFETTI[1], CONFETTI[2], CONFETTI[3]];
    for (let i = 0; i < 7; i++) {
      st.wait(0.25 + i * 0.42, true).then(() => {
        if (gen !== this.gen) return;
        const c = cols[i % cols.length];
        const bx = rnd(-4, 4), by = rnd(3.6, 5.6), bz = rnd(-3.5, 3.5);
        this.sparksSphere(bx, by, bz, { n: 90, speed: rnd(3, 4.6), c0: WHITE, c1: c, life: 1.7 });
        this.flashLight(bx, bz, 60, 0.6, c, by);
      });
    }
  }

  embers() {
    const st = this.st, gen = this.gen;
    const c0 = C(1, 0.55, 0.2), c1 = C(0.5, 0.05, 0.05);
    let emitted = 0;
    st.tween(3.2, (k) => {
      if (gen !== this.gen) return;
      const want = Math.floor(160 * k);
      while (emitted < want) {
        this.glow.emit(rnd(-4.5, 4.5), 0.1, rnd(-4.5, 4.5), rnd(-0.2, 0.2), rnd(0.5, 1.3), rnd(-0.2, 0.2), rnd(2, 3.4), rnd(0.07, 0.13), 0.02, c0, c1, { sway: 0.6 });
        emitted++;
      }
    }, null, true);
  }
}
