// 3D 무대: 체스판, 조명, 기물 배치와 이동 애니메이션, 칸 하이라이트, 카메라.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { createPieceKit } from './pieces.js';
import {
  boardTextures, woodTexture, tableTexture, labelTexture,
  glowTexture, ringTexture, squareGlowTexture,
} from './textures.js';
import { mFrom, mTo, mPromo, mFlags, F_EP, F_CASTLE, KNIGHT, KING, PAWN } from './engine.js';

// 화면이 가려져 있어도 로딩이 멈추지 않게 타이머로 한 숨 쉰다
const nextFrame = () => new Promise((r) => setTimeout(r, 20));
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeOutBack = (k) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

const TABLE_Y = -0.45;
export const sqX = (sq) => (sq & 7) - 3.5;
export const sqZ = (sq) => 3.5 - (sq >> 4);
export const worldToSq = (x, z) => {
  const f = Math.floor(x + 4), r = Math.floor(4 - z);
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return r * 16 + f;
};

export const VIEWS = {
  white: { pos: [0, 11.2, 8.0], target: [0, 0, 0.3] },
  black: { pos: [0, 11.2, -8.0], target: [0, 0, -0.3] },
  top: { pos: [0, 15.5, 2.2], target: [0, 0, 0.2] },
  side: { pos: [9.6, 5.2, 4.2], target: [0, 0.2, 0] },
};

export class Stage {
  constructor(container) {
    this.container = container;
    this.tweens = [];
    this.pieces = new Map();      // 칸 → 기물 홀더
    this.grave = [[], []];        // 색별 잡힌 기물
    this.selectedHolder = null;
    this.markers = [];
    this.time = 0;
    this.hoverSq = -1;
    this.flipped = false;
  }

  async init(onProgress = () => {}) {
    const el = this.container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(r.domElement);
    r.domElement.style.touchAction = 'none';

    const scene = this.scene = new THREE.Scene();
    const bg = new THREE.Color(0x120d0a);
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 26, 60);
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    const cam = this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
    const ctl = this.controls = new OrbitControls(cam, r.domElement);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08;
    ctl.minDistance = 5.5; ctl.maxDistance = 26;
    ctl.minPolarAngle = 0.06; ctl.maxPolarAngle = 1.4;
    ctl.enablePan = false; ctl.rotateSpeed = 0.7; ctl.zoomSpeed = 0.8;
    ctl.autoRotateSpeed = 0.7;

    this.buildLights();
    onProgress('기물을 깎는 중…'); await nextFrame();
    this.kit = createPieceKit();
    onProgress('나무판을 만드는 중…'); await nextFrame();
    this.buildBoard();
    onProgress('조명을 맞추는 중…'); await nextFrame();
    this.buildHighlights();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(el);
    this.setView('white', false);
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.frame());
  }

  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xbfd2ff, 0x4a3326, 0.32));
    const key = this.key = new THREE.DirectionalLight(0xfff0dc, 2.7);
    key.position.set(-5.5, 12, 7.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -9.5, right: 9.5, top: 9.5, bottom: -9.5, near: 2, far: 34 });
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.025; key.shadow.radius = 3;
    s.add(key);
    const rim = new THREE.DirectionalLight(0x9db8ff, 0.9);
    rim.position.set(7, 5, -9);
    s.add(rim);
    const warm = new THREE.PointLight(0xffb066, 40, 22, 2);
    warm.position.set(5, 4.5, 5);
    s.add(warm);
  }

  buildBoard() {
    const s = this.scene;
    const bt = boardTextures();
    // 책상
    const tt = tableTexture(); tt.repeat.set(9, 9);
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ map: tt, roughness: 0.5, metalness: 0.0, color: 0xb59a86 }));
    table.rotation.x = -Math.PI / 2; table.position.y = TABLE_Y; table.receiveShadow = true;
    s.add(table);

    // 판 받침
    const frameTex = woodTexture([70, 42, 26], [38, 21, 12], { size: 512, rings: 7, seed: 11 });
    frameTex.repeat.set(3, 3);
    const frameMat = new THREE.MeshPhysicalMaterial({ map: frameTex, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const slab = new THREE.Mesh(new RoundedBoxGeometry(9.5, -TABLE_Y, 9.5, 4, 0.06), frameMat);
    slab.position.y = TABLE_Y / 2 - 0.0; slab.castShadow = slab.receiveShadow = true;
    s.add(slab);
    // 테두리 (구멍 뚫린 판)
    const half = 4.65, inner = 4.02;
    const sh = new THREE.Shape();
    sh.moveTo(-half, -half); sh.lineTo(half, -half); sh.lineTo(half, half); sh.lineTo(-half, half); sh.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner); hole.lineTo(-inner, inner); hole.lineTo(inner, inner); hole.lineTo(inner, -inner); hole.closePath();
    sh.holes.push(hole);
    const ringG = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 });
    ringG.rotateX(-Math.PI / 2);
    const frame = new THREE.Mesh(ringG, frameMat);
    frame.position.y = 0.0; frame.castShadow = frame.receiveShadow = true;
    s.add(frame);
    // 금 상감선
    const g1 = new THREE.Shape();
    g1.moveTo(-4.07, -4.07); g1.lineTo(4.07, -4.07); g1.lineTo(4.07, 4.07); g1.lineTo(-4.07, 4.07); g1.closePath();
    const g2 = new THREE.Path();
    g2.moveTo(-4.02, -4.02); g2.lineTo(-4.02, 4.02); g2.lineTo(4.02, 4.02); g2.lineTo(4.02, -4.02); g2.closePath();
    g1.holes.push(g2);
    const inlayG = new THREE.ShapeGeometry(g1); inlayG.rotateX(-Math.PI / 2);
    const inlay = new THREE.Mesh(inlayG, new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 1, roughness: 0.3 }));
    inlay.position.y = 0.092; s.add(inlay);
    // 칸 판
    const surf = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshPhysicalMaterial({
        map: bt.map, bumpMap: bt.bump, bumpScale: 1.2,
        roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.28, envMapIntensity: 0.8,
      }));
    surf.rotation.x = -Math.PI / 2; surf.position.y = 0.002; surf.receiveShadow = true;
    s.add(surf);
    this.surface = surf;

    // 좌표 글자
    this.labels = new THREE.Group(); s.add(this.labels);
    const lm = new Map();
    const mk = (ch) => {
      if (!lm.has(ch)) lm.set(ch, new THREE.MeshBasicMaterial({ map: labelTexture(ch), transparent: true, depthWrite: false, toneMapped: false }));
      return lm.get(ch);
    };
    const plane = new THREE.PlaneGeometry(0.36, 0.36);
    const put = (ch, x, z) => {
      const holder = new THREE.Group(); holder.position.set(x, 0.1, z);
      const m = new THREE.Mesh(plane, mk(ch)); m.rotation.x = -Math.PI / 2;
      holder.add(m); this.labels.add(holder);
    };
    for (let i = 0; i < 8; i++) {
      const ch = 'abcdefgh'[i], n = String(i + 1);
      put(ch, i - 3.5, 4.34); put(ch, i - 3.5, -4.34);
      put(n, -4.34, 3.5 - i); put(n, 4.34, 3.5 - i);
    }
  }

  buildHighlights() {
    const s = this.scene;
    const mat = (map, opacity = 1) => new THREE.MeshBasicMaterial({
      map, transparent: true, opacity, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const sqGeo = new THREE.PlaneGeometry(1, 1); sqGeo.rotateX(-Math.PI / 2);
    const mkSq = (texture, order) => {
      const m = new THREE.Mesh(sqGeo, mat(texture)); m.position.y = 0.012; m.visible = false; m.renderOrder = order; s.add(m); return m;
    };
    this.tex = {
      gold: squareGlowTexture('255,205,80'),
      amber: squareGlowTexture('255,190,70'),
      teal: squareGlowTexture('70,220,200'),
      white: squareGlowTexture('255,255,255'),
      dot: glowTexture('rgba(255,236,160,1)', 'rgba(255,236,160,0)', 0.5),
      ring: ringTexture('rgba(255,96,72,0.95)'),
      red: glowTexture('rgba(255,50,40,1)', 'rgba(255,50,40,0)', 0.35),
    };
    this.hl = {
      last: [mkSq(this.tex.amber, 1), mkSq(this.tex.amber, 1)],
      select: mkSq(this.tex.gold, 3),
      hint: [mkSq(this.tex.teal, 4), mkSq(this.tex.teal, 4)],
      hover: mkSq(this.tex.white, 2),
      check: mkSq(this.tex.red, 2),
    };
    this.hl.last.forEach((m) => { m.material.opacity = 0.55; });
    this.hl.hover.material.opacity = 0.22;
    this.hl.check.scale.set(1.5, 1, 1.5);
    this.markerGeo = sqGeo;
    this.markerMats = { dot: mat(this.tex.dot), ring: mat(this.tex.ring) };
  }

  // ───────── 크기·시점 ─────────
  resize() {
    const el = this.container;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // 좁은 화면에서는 판 전체가 보이도록 시야를 키운다
    this.camera.fov = w / h < 1 ? 36 + Math.min(26, (1 - w / h) * 40) : 36;
    this.camera.updateProjectionMatrix();
  }

  setView(name, animate = true) {
    const v = VIEWS[name]; if (!v) return;
    const aspect = this.camera.aspect;
    const pull = aspect < 1.25 ? 1 + (1.25 - aspect) * 0.32 : 1;
    const tgt = new THREE.Vector3(...v.target);
    const pos = new THREE.Vector3(...v.pos).sub(tgt).multiplyScalar(pull).add(tgt);
    this.currentView = name;
    this.flyTo(pos, tgt, animate ? 1.0 : 0);
  }

  flyTo(pos, target, dur = 1.0) {
    const c = this.camera, ctl = this.controls;
    if (dur <= 0) { c.position.copy(pos); ctl.target.copy(target); ctl.update(); return; }
    const t0 = ctl.target.clone();
    const o0 = c.position.clone().sub(t0), o1 = pos.clone().sub(target);
    const s0 = new THREE.Spherical().setFromVector3(o0), s1 = new THREE.Spherical().setFromVector3(o1);
    let dTheta = s1.theta - s0.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    this.cancelFly?.();
    let dead = false;
    this.cancelFly = () => { dead = true; };
    return this.tween(dur, (k) => {
      if (dead) return;
      const e = easeInOut(k);
      const sp = new THREE.Spherical(
        s0.radius + (s1.radius - s0.radius) * e,
        s0.phi + (s1.phi - s0.phi) * e,
        s0.theta + dTheta * e);
      const tg = t0.clone().lerp(target, e);
      ctl.target.copy(tg);
      c.position.copy(tg).add(new THREE.Vector3().setFromSpherical(sp));
    });
  }

  // 흑으로 두면 글자가 거꾸로 보이지 않게 돌려 준다
  setFlipped(flipped) {
    this.flipped = flipped;
    for (const h of this.labels.children) h.rotation.y = flipped ? Math.PI : 0;
  }

  // ───────── 트윈 ─────────
  tween(dur, fn, ease = (k) => k) {
    return new Promise((resolve) => {
      this.tweens.push({ t: 0, dur, fn, ease, resolve });
    });
  }
  wait(sec) { return this.tween(sec, () => {}); }

  frame() {
    const raw = this.clock.getDelta();
    this.adaptQuality(raw);
    this.advance(Math.min(0.05, raw));
    this.renderer.render(this.scene, this.camera);
  }

  // 프레임이 계속 느리면 해상도를 한 단계씩 낮춰서 부드러움을 지킨다 (다시 올리지는 않는다)
  adaptQuality(raw) {
    if (raw > 0.25) return;                // 창이 가려졌다 돌아온 프레임은 무시
    const p = this.perf || (this.perf = { sum: 0, n: 0 });
    p.sum += raw; p.n++;
    if (p.n < 90) return;
    const avg = p.sum / p.n; p.sum = 0; p.n = 0;
    const r = this.renderer, pr = r.getPixelRatio();
    if (avg > 0.027 && pr > 1) {
      r.setPixelRatio(Math.max(1, pr - 0.5)); this.resize();
    } else if (avg > 0.034 && this.key.shadow.mapSize.x > 1024) {
      this.key.shadow.mapSize.set(1024, 1024);
      this.key.shadow.map?.dispose(); this.key.shadow.map = null;
    }
  }

  // 시간을 dt초만큼 앞으로 (화면 그리기와 분리해 두면 가려진 창에서도 테스트로 돌릴 수 있다)
  advance(dt) {
    this.time += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k), k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.resolve(); }
    }
    // 선택한 기물은 살짝 들려서 흔들린다
    for (const holder of this.pieces.values()) {
      const u = holder.userData;
      const target = holder === this.selectedHolder ? 0.16 + Math.sin(this.time * 4.2) * 0.025 : 0;
      u.lift += (target - u.lift) * Math.min(1, dt * 14);
      u.inner.position.y = u.lift;
    }
    // 이동 가능 표시가 숨 쉬듯 커졌다 작아진다
    const pulse = 1 + Math.sin(this.time * 4) * 0.08;
    for (const m of this.markers) if (m.visible) m.scale.set(m.userData.base * pulse, 1, m.userData.base * pulse);
    if (this.hl.check.visible) this.hl.check.material.opacity = 0.65 + Math.sin(this.time * 5) * 0.25;
    this.controls.update();
  }

  // ───────── 기물 ─────────
  makePiece(type, color, sq) {
    const h = this.kit.create(type, color, (sq & 7) < 4 ? -1 : 1);
    h.userData.lift = 0;
    h.userData.sq = sq;
    h.position.set(sqX(sq), 0, sqZ(sq));
    this.scene.add(h);
    return h;
  }

  clearPieces() {
    for (const h of this.pieces.values()) this.scene.remove(h);
    for (const side of this.grave) for (const h of side) this.scene.remove(h);
    this.pieces.clear(); this.grave = [[], []];
    this.selectedHolder = null;
  }

  // Position 의 판 상태 그대로 기물을 다시 세운다 (처음 시작, 무르기)
  setPosition(pos, { intro = false } = {}) {
    this.clearPieces();
    const b = pos.board;
    const counts = [{ 1: 8, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1 }, { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1 }];
    let n = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = b[sq];
      if (!pc) continue;
      const t = pc & 7, c = pc >> 3;
      counts[c][t]--;
      const h = this.makePiece(t, c, sq);
      this.pieces.set(sq, h);
      if (intro) {
        const delay = 0.04 * ((sq & 7) + (c ? 0 : 3)) + Math.random() * 0.12;
        h.visible = false;
        this.wait(delay).then(() => {
          h.visible = true;
          const y0 = 2.6;
          this.tween(0.7, (k) => { h.position.y = y0 * (1 - easeOutBack(k)); }, (k) => k);
        });
      }
      n++;
    }
    // 빠진 기물은 잡힌 기물 자리로
    for (let c = 0; c < 2; c++) {
      for (let t = 5; t >= 1; t--) {
        for (let i = 0; i < counts[c][t]; i++) this.sendToGrave(this.makePiece(t, c, 0), c, false);
      }
    }
    return n;
  }

  graveSlot(color, index) {
    const col = index % 2, row = Math.floor(index / 2);
    const side = color === 0 ? -1 : 1;
    return new THREE.Vector3(side * (5.65 + col * 0.62), TABLE_Y, 3.2 - row * 0.58);
  }

  sendToGrave(holder, color, animate = true) {
    const idx = this.grave[color].length;
    this.grave[color].push(holder);
    holder.userData.sq = -1;
    const slot = this.graveSlot(color, idx);
    const S = 0.62;
    if (!animate) {
      this.scene.add(holder);
      holder.position.copy(slot); holder.scale.setScalar(S);
      return Promise.resolve();
    }
    const p0 = holder.position.clone(), s0 = holder.scale.x;
    return this.tween(0.75, (k) => {
      const e = easeInOut(k);
      holder.position.set(p0.x + (slot.x - p0.x) * e, p0.y + (slot.y - p0.y) * e + Math.sin(Math.PI * k) * 1.5, p0.z + (slot.z - p0.z) * e);
      holder.scale.setScalar(s0 + (S - s0) * e);
      holder.rotation.y = Math.sin(k * Math.PI) * 0.6;
    });
  }

  // 한 수를 보여 준다. (엔진 규칙대로 이미 합법으로 확인된 수)
  async animateMove(m, onLand) {
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const mover = this.pieces.get(from);
    if (!mover) { return; }
    const color = mover.userData.color, type = mover.userData.type;
    this.setSelected(-1);
    this.pieces.delete(from);

    let victim = null;
    const victimSq = (fl & F_EP) ? (color === 0 ? to - 16 : to + 16) : to;
    if (this.pieces.has(victimSq) && victimSq !== from) { victim = this.pieces.get(victimSq); this.pieces.delete(victimSq); }
    this.pieces.set(to, mover);
    mover.userData.sq = to;

    const x0 = sqX(from), z0 = sqZ(from), x1 = sqX(to), z1 = sqZ(to);
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const dur = 0.32 + Math.min(0.5, dist * 0.075);
    const jump = type === KNIGHT ? 0.95 : 0.14;
    mover.renderOrder = 1;
    const tasks = [];

    let victimStarted = false;
    const moverTask = this.tween(dur, (k) => {
      const e = easeInOut(k);
      mover.position.set(x0 + (x1 - x0) * e, Math.sin(Math.PI * k) * jump, z0 + (z1 - z0) * e);
      if (victim && !victimStarted && k > 0.72) {
        victimStarted = true;
        tasks.push(this.sendToGrave(victim, victim.userData.color, true));
      }
    });
    tasks.push(moverTask);

    if (fl & F_CASTLE) {
      const rookFrom = to > from ? to + 1 : to - 2, rookTo = to > from ? to - 1 : to + 1;
      const rook = this.pieces.get(rookFrom);
      this.pieces.delete(rookFrom);
      if (rook) {
        this.pieces.set(rookTo, rook); rook.userData.sq = rookTo;
        const rx0 = sqX(rookFrom), rz0 = sqZ(rookFrom), rx1 = sqX(rookTo), rz1 = sqZ(rookTo);
        tasks.push(this.wait(dur * 0.35).then(() => this.tween(dur * 0.8, (k) => {
          const e = easeInOut(k);
          rook.position.set(rx0 + (rx1 - rx0) * e, Math.sin(Math.PI * k) * 0.3, rz0 + (rz1 - rz0) * e);
        })));
      }
    }
    await moverTask;
    mover.position.set(x1, 0, z1);
    onLand?.();
    await Promise.all(tasks);

    if (promo && type === PAWN) {
      const np = this.makePiece(promo, color, to);
      this.scene.remove(mover);
      this.pieces.set(to, np);
      np.scale.setScalar(0.01);
      await this.tween(0.45, (k) => { np.scale.setScalar(Math.max(0.01, easeOutBack(k))); });
      np.scale.setScalar(1);
    } else {
      // 착지할 때 살짝 눌렸다 올라온다
      await this.tween(0.12, (k) => { mover.scale.y = 1 - Math.sin(Math.PI * k) * 0.03; });
      mover.scale.y = 1;
    }
  }

  // 체크메이트 당한 왕이 받침 가장자리를 축으로 쓰러진다
  async topple(sq) {
    const h = this.pieces.get(sq);
    if (!h) return;
    const d = h.userData.color === 0 ? -1 : 1;   // 백은 -z, 흑은 +z 쪽으로
    const R = 0.4, z0 = h.position.z;
    await this.tween(0.9, (k) => {
      const th = (k * k * (3 - 2 * k)) * (Math.PI / 2) * 0.98;
      h.rotation.x = d * th;
      h.position.y = R * Math.sin(th);
      h.position.z = z0 + d * R * (1 - Math.cos(th));
    });
  }

  // ───────── 표시 ─────────
  placeSq(mesh, sq) {
    if (sq < 0) { mesh.visible = false; return; }
    mesh.position.x = sqX(sq); mesh.position.z = sqZ(sq); mesh.visible = true;
  }
  setSelected(sq) {
    this.placeSq(this.hl.select, sq);
    this.selectedHolder = sq >= 0 ? (this.pieces.get(sq) || null) : null;
  }
  setLastMove(from, to) {
    this.placeSq(this.hl.last[0], from); this.placeSq(this.hl.last[1], to);
  }
  setCheck(sq) { this.placeSq(this.hl.check, sq); }
  setHint(from, to) {
    this.placeSq(this.hl.hint[0], from); this.placeSq(this.hl.hint[1], to);
  }
  setHover(sq) {
    if (sq === this.hoverSq) return;
    this.hoverSq = sq; this.placeSq(this.hl.hover, sq);
  }
  setTargets(list) {
    // list: [{sq, capture}]
    while (this.markers.length < list.length) {
      const m = new THREE.Mesh(this.markerGeo, this.markerMats.dot);
      m.position.y = 0.014; m.renderOrder = 5; this.scene.add(m); this.markers.push(m);
    }
    this.markers.forEach((m, i) => {
      const t = list[i];
      if (!t) { m.visible = false; return; }
      m.visible = true;
      m.material = t.capture ? this.markerMats.ring : this.markerMats.dot;
      m.userData.base = t.capture ? 1.0 : 0.52;
      m.position.x = sqX(t.sq); m.position.z = sqZ(t.sq);
    });
  }

  // ───────── 선택(레이캐스트) ─────────
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const holders = [...this.pieces.values()];
    const hit = ray.intersectObjects(holders, true)[0];
    if (hit) {
      let o = hit.object;
      while (o && o.userData.sq === undefined) o = o.parent;
      if (o && o.userData.sq >= 0) return o.userData.sq;
    }
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return worldToSq(p.x, p.z);
    return -1;
  }
}
