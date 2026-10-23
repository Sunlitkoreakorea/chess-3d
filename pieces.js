// 스탠턴 양식 기물을 코드로 깎아 만든다 (선반 가공 + 말 머리 스윕).
// 한 칸 = 1.0. 기물마다 몸통(body) / 금장식(trim) / 어두운 부분(dark) 세 덩어리로 합친다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { marbleTexture } from './textures.js';

const SEG = 60;
const V2 = (r, y) => new THREE.Vector2(r, y);

// 단면 윤곽을 이어 붙이는 도우미. corner()는 같은 점을 두 번 찍어 날카로운 모서리를 만든다.
class Profile {
  constructor() { this.pts = []; }
  start(r, y) { this.pts.push(V2(r, y)); return this; }
  line(r, y) { this.pts.push(V2(r, y)); return this; }
  corner(r, y) { this.pts.push(V2(r, y), V2(r, y)); return this; }
  curve(ctrl, perPoint = 6) {
    const last = this.pts[this.pts.length - 1];
    const spl = new THREE.SplineCurve([last, ...ctrl.map(([r, y]) => V2(r, y))]);
    const pts = spl.getPoints(ctrl.length * perPoint);
    for (let i = 1; i < pts.length; i++) this.pts.push(pts[i]);
    return this;
  }
  geometry(segs = SEG) { return new THREE.LatheGeometry(this.pts, segs); }
}

// 모든 기물 공통의 둥근 받침. 끝점은 (R-0.115, 0.125)
function plinth(p, R) {
  return p.start(0, 0)
    .line(R - 0.025, 0)
    .curve([[R, 0.02], [R, 0.05], [R - 0.03, 0.075]], 5)
    .corner(R - 0.05, 0.08)
    .line(R - 0.05, 0.095)
    .curve([[R - 0.075, 0.108], [R - 0.115, 0.125]], 4);
}

const ring = (radius, tube, y) => {
  const g = new THREE.TorusGeometry(radius, tube, 14, 72);
  g.rotateX(Math.PI / 2); g.translate(0, y, 0);
  return g;
};
const ball = (r, y, x = 0, z = 0) => {
  const g = new THREE.SphereGeometry(r, 36, 24);
  g.translate(x, y, z);
  return g;
};

function merge(list) {
  if (!list.length) return null;
  const clean = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    return ng;
  });
  return mergeGeometries(clean, false);
}

// ───────────────────────────── 각 기물 ─────────────────────────────

function buildPawn() {
  const R = 0.29, body = [], trim = [];
  const p = plinth(new Profile(), R);
  p.curve([[0.17, 0.2], [0.125, 0.33], [0.1, 0.44], [0.108, 0.49]], 5)
    .corner(0.15, 0.505)
    .curve([[0.2, 0.515], [0.212, 0.53], [0.2, 0.55]], 4)
    .corner(0.13, 0.565)
    .curve([[0.098, 0.585], [0.088, 0.62], [0.1, 0.65]], 4)
    .line(0.1, 0.66);
  body.push(p.geometry());
  body.push(ball(0.162, 0.775));
  trim.push(ring(R - 0.052, 0.012, 0.1));
  trim.push(ring(0.2, 0.011, 0.5));
  return { body, trim, dark: [] };
}

function buildRook() {
  const R = 0.345, body = [], trim = [];
  const p = plinth(new Profile(), R);
  p.curve([[0.215, 0.2], [0.2, 0.34], [0.195, 0.5], [0.205, 0.62]], 5)
    .corner(0.215, 0.645)
    .curve([[0.26, 0.665], [0.295, 0.69]], 4)
    .corner(0.298, 0.7)
    .line(0.298, 0.8)
    .corner(0.298, 0.82)
    .line(0.21, 0.82)
    .corner(0.21, 0.8)
    .line(0.0, 0.8);
  body.push(p.geometry());
  // 성가퀴(톱니)
  const n = 8, gap = 0.17, span = (Math.PI * 2) / n - gap;
  for (let i = 0; i < n; i++) {
    const a0 = (i * Math.PI * 2) / n + gap / 2, a1 = a0 + span;
    const rIn = 0.205, rOut = 0.298;
    const s = new THREE.Shape();
    s.moveTo(rIn * Math.cos(a0), rIn * Math.sin(a0));
    s.lineTo(rOut * Math.cos(a0), rOut * Math.sin(a0));
    s.absarc(0, 0, rOut, a0, a1, false);
    s.lineTo(rIn * Math.cos(a1), rIn * Math.sin(a1));
    s.absarc(0, 0, rIn, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.13, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.81, 0);
    body.push(g);
  }
  trim.push(ring(R - 0.052, 0.012, 0.1));
  trim.push(ring(0.222, 0.012, 0.645));
  trim.push(ring(0.299, 0.011, 0.805));
  return { body, trim, dark: [] };
}

function buildBishop() {
  const R = 0.335, body = [], trim = [];
  const p = plinth(new Profile(), R);
  p.curve([[0.19, 0.22], [0.135, 0.38], [0.105, 0.56], [0.098, 0.72]], 5)
    .corner(0.128, 0.74)
    .curve([[0.2, 0.752], [0.222, 0.768], [0.205, 0.79]], 4)
    .corner(0.12, 0.81)
    .curve([[0.1, 0.835], [0.112, 0.865]], 4)
    // 달걀 모양 머리
    .curve([[0.17, 0.915], [0.205, 1.0], [0.2, 1.1], [0.16, 1.2], [0.1, 1.28], [0.04, 1.325]], 5)
    .line(0.0, 1.335);
  body.push(p.geometry());
  trim.push(ring(R - 0.052, 0.012, 0.1));
  trim.push(ring(0.222, 0.011, 0.77));
  trim.push(ring(0.118, 0.012, 0.842));
  // 주교관의 갈라진 홈: 기울어진 금 띠
  const band = new THREE.TorusGeometry(0.205, 0.011, 10, 64, Math.PI * 1.15);
  band.rotateY(-Math.PI * 0.575); band.rotateZ(-0.72); band.translate(0.0, 1.075, 0);
  trim.push(band);
  trim.push(ball(0.062, 1.375));
  return { body, trim, dark: [] };
}

function buildQueen() {
  const R = 0.375, body = [], trim = [];
  const p = plinth(new Profile(), R);
  p.curve([[0.215, 0.24], [0.16, 0.45], [0.125, 0.68], [0.118, 0.88]], 6)
    .corner(0.15, 0.905)
    .curve([[0.235, 0.92], [0.262, 0.94], [0.245, 0.965]], 4)
    .corner(0.14, 0.985)
    .curve([[0.122, 1.02], [0.15, 1.13], [0.21, 1.26], [0.262, 1.38]], 5)
    .corner(0.285, 1.41)
    .line(0.285, 1.45)
    .corner(0.285, 1.47)
    .line(0.2, 1.47)
    .curve([[0.15, 1.455], [0.06, 1.44], [0.0, 1.44]], 4);
  body.push(p.geometry());
  // 왕관: 아홉 개의 뿔과 금 구슬
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = 0.245;
    const cone = new THREE.ConeGeometry(0.043, 0.2, 18);
    cone.translate(0, 0.1, 0);
    cone.rotateZ(-0.16);                       // 바깥으로 살짝 기울임
    cone.rotateY(-a + Math.PI / 2);
    cone.translate(rr * Math.cos(a), 1.47, rr * Math.sin(a));
    body.push(cone);
    const tipR = rr + 0.2 * Math.sin(0.16);
    trim.push(ball(0.037, 1.47 + 0.2 * Math.cos(0.16) + 0.012, tipR * Math.cos(a), tipR * Math.sin(a)));
  }
  body.push(ball(0.085, 1.52));
  trim.push(ball(0.04, 1.62));
  trim.push(ring(R - 0.052, 0.012, 0.1));
  trim.push(ring(0.246, 0.012, 0.94));
  trim.push(ring(0.287, 0.012, 1.425));
  return { body, trim, dark: [] };
}

function buildKing() {
  const R = 0.395, body = [], trim = [];
  const p = plinth(new Profile(), R);
  p.curve([[0.225, 0.26], [0.17, 0.5], [0.135, 0.76], [0.128, 0.99]], 6)
    .corner(0.16, 1.015)
    .curve([[0.245, 1.03], [0.272, 1.05], [0.255, 1.075]], 4)
    .corner(0.145, 1.095)
    .curve([[0.13, 1.14], [0.17, 1.27], [0.235, 1.42], [0.285, 1.54]], 5)
    .corner(0.305, 1.57)
    .line(0.305, 1.61)
    .corner(0.292, 1.635)
    .curve([[0.24, 1.665], [0.16, 1.7], [0.07, 1.72], [0.0, 1.725]], 4);
  body.push(p.geometry());
  // 십자가
  const v = new RoundedBoxGeometry(0.078, 0.34, 0.078, 3, 0.022); v.translate(0, 1.93, 0);
  const h = new RoundedBoxGeometry(0.25, 0.078, 0.078, 3, 0.022); h.translate(0, 1.98, 0);
  body.push(v, h);
  trim.push(ball(0.062, 1.745));
  trim.push(ring(R - 0.052, 0.012, 0.1));
  trim.push(ring(0.274, 0.012, 1.05));
  trim.push(ring(0.307, 0.012, 1.59));
  return { body, trim, dark: [] };
}

// ───────────────────────────── 말 머리 ─────────────────────────────

// 키 값 사이를 부드럽게 잇는 함수
function keyed(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
        const k = (t - t0) / (t1 - t0);
        return v0 + (v1 - v0) * (k * k * (3 - 2 * k));
      }
    }
    return keys[keys.length - 1][1];
  };
}

function buildKnight() {
  const R = 0.355, body = [], trim = [], dark = [];

  // 받침 위의 가슴(몸통)
  const chest = plinth(new Profile(), R);
  chest.curve([[0.235, 0.2], [0.225, 0.32], [0.22, 0.42]], 5)
    .corner(0.235, 0.445).line(0.0, 0.445);
  body.push(chest.geometry());
  trim.push(ring(R - 0.052, 0.012, 0.1));
  trim.push(ring(0.237, 0.011, 0.445));

  // 목~머리를 따라 단면이 변하는 관(스윕)
  const spineCtrl = [[-0.02, 0.32], [-0.07, 0.54], [-0.06, 0.78], [0.02, 0.99], [0.19, 1.07], [0.36, 0.98], [0.46, 0.82], [0.5, 0.7]];
  const spine = new THREE.CatmullRomCurve3(spineCtrl.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
  const top = keyed([[0, 0.245], [0.12, 0.225], [0.3, 0.185], [0.5, 0.17], [0.63, 0.165], [0.75, 0.13], [0.88, 0.102], [1, 0.092]]);
  const bot = keyed([[0, 0.2], [0.12, 0.18], [0.3, 0.14], [0.5, 0.155], [0.62, 0.25], [0.74, 0.185], [0.86, 0.128], [1, 0.1]]);
  const wid = keyed([[0, 0.215], [0.15, 0.19], [0.35, 0.15], [0.5, 0.15], [0.62, 0.178], [0.75, 0.142], [0.88, 0.112], [1, 0.102]]);
  const N = 64, M = 36, CAP = 0.07;
  const pos = [], uv = [], idx = [];
  const frames = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const c = spine.getPointAt(Math.min(0.9999, t)), tg = spine.getTangentAt(Math.min(0.9999, t));
    const nrm = new THREE.Vector3(-tg.y, tg.x, 0).normalize();
    // 코끝은 반구처럼 오므린다
    let k = 1;
    if (t > 1 - CAP) { const q = (t - (1 - CAP)) / CAP; k = Math.sqrt(Math.max(0, 1 - q * q)); }
    frames.push({ c, tg, nrm });
    for (let j = 0; j <= M; j++) {
      const th = (j / M) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      const ext = (ct > 0 ? top(t) : bot(t)) * ct * k;
      const x = c.x + nrm.x * ext, y = c.y + nrm.y * ext, z = wid(t) * st * k;
      pos.push(x, y, z);
      uv.push(j / M, t);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const head = new THREE.BufferGeometry();
  head.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  head.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  head.setIndex(idx);
  head.computeVertexNormals();
  // 면 방향 점검: 법선이 안쪽을 향하면 뒤집는다
  {
    const mid = Math.floor(N / 2) * (M + 1);
    const f = frames[Math.floor(N / 2)];
    const P = new THREE.Vector3(pos[mid * 3], pos[mid * 3 + 1], pos[mid * 3 + 2]);
    const Nn = new THREE.Vector3().fromBufferAttribute(head.attributes.normal, mid);
    if (Nn.dot(P.sub(f.c)) < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      head.setIndex(idx); head.computeVertexNormals();
    }
  }
  // 이음선 법선 맞추기
  const nA = head.attributes.normal;
  for (let i = 0; i <= N; i++) {
    const a = i * (M + 1), b = a + M;
    const v = new THREE.Vector3().fromBufferAttribute(nA, a).add(new THREE.Vector3().fromBufferAttribute(nA, b)).normalize();
    nA.setXYZ(a, v.x, v.y, v.z); nA.setXYZ(b, v.x, v.y, v.z);
  }
  body.push(head);

  const at = (t) => {
    const tt = Math.min(0.9999, t);
    const c = spine.getPointAt(tt), tg = spine.getTangentAt(tt);
    return { c, tg, nrm: new THREE.Vector3(-tg.y, tg.x, 0).normalize() };
  };
  const orient = (g, dir) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    g.applyQuaternion(q);
  };

  // 갈기: 목 뒤쪽을 따라 비늘처럼 겹친 덩어리
  for (let i = 0; i < 13; i++) {
    const t = 0.05 + (i / 12) * 0.5;
    const { c, tg, nrm } = at(t);
    const g = new THREE.SphereGeometry(1, 20, 14);
    g.scale(0.04, 0.085, 0.07 - 0.02 * (i / 12));
    const basis = new THREE.Matrix4().makeBasis(tg, nrm, new THREE.Vector3(0, 0, 1));
    g.applyMatrix4(basis);
    const e = top(t) * 0.95 + 0.02;
    g.translate(c.x + nrm.x * e - tg.x * 0.01, c.y + nrm.y * e - tg.y * 0.01, 0);
    body.push(g);
  }
  // 귀 한 쌍
  {
    const { c, tg, nrm } = at(0.545);
    for (const s of [-1, 1]) {
      const g = new THREE.ConeGeometry(0.062, 0.24, 16);
      g.scale(1, 1, 0.6); g.translate(0, 0.12, 0);
      const dir = nrm.clone().multiplyScalar(0.95).addScaledVector(tg, -0.45);
      orient(g, dir);
      g.translate(c.x + nrm.x * (top(0.545) * 0.78), c.y + nrm.y * (top(0.545) * 0.78), s * 0.09);
      body.push(g);
    }
  }
  // 눈 (금), 콧구멍·입 (어두운 색)
  {
    const { c, tg, nrm } = at(0.6);
    for (const s of [-1, 1]) {
      const e = ball(0.036, 0, 0, 0);
      e.translate(c.x + nrm.x * 0.05 + tg.x * 0.02, c.y + nrm.y * 0.05 + tg.y * 0.02, s * wid(0.6) * 0.9);
      trim.push(e);
    }
    const nose = at(0.965);
    for (const s of [-1, 1]) {
      const g = new THREE.SphereGeometry(1, 16, 12);
      g.scale(0.022, 0.014, 0.014);
      const basis = new THREE.Matrix4().makeBasis(tg, nrm, new THREE.Vector3(0, 0, 1));
      g.applyMatrix4(basis);
      g.translate(nose.c.x + nose.nrm.x * 0.03 + nose.tg.x * 0.025, nose.c.y + nose.nrm.y * 0.03 + nose.tg.y * 0.025, s * 0.04);
      dark.push(g);
    }
    // 입선
    const m0 = at(0.9), m1 = at(0.62);
    const mouth = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(m0.c.x - m0.nrm.x * 0.075, m0.c.y - m0.nrm.y * 0.075, 0.087),
        new THREE.Vector3((m0.c.x + m1.c.x) / 2 - m0.nrm.x * 0.1, (m0.c.y + m1.c.y) / 2 - m0.nrm.y * 0.1, 0.1),
        new THREE.Vector3(m1.c.x - m1.nrm.x * 0.15, m1.c.y - m1.nrm.y * 0.15, 0.1),
      ]), 12, 0.006, 6, false);
    dark.push(mouth);
    const mouthR = mouth.clone(); mouthR.scale(1, 1, -1);
    // 스케일 -1 은 면 방향을 뒤집으므로 인덱스를 맞춰 준다
    if (mouthR.index) { const a = mouthR.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
    dark.push(mouthR);
  }
  return { body, trim, dark, faceX: true };
}

// ───────────────────────────── 조립 ─────────────────────────────

export const PIECE_HEIGHT = { 1: 0.95, 2: 1.3, 3: 1.45, 4: 0.97, 5: 1.7, 6: 2.0 };

export function createPieceKit() {
  const built = {};
  const defs = { 1: buildPawn, 2: buildKnight, 3: buildBishop, 4: buildRook, 5: buildQueen, 6: buildKing };
  for (const t of Object.keys(defs)) {
    const d = defs[t]();
    built[t] = { body: merge(d.body), trim: merge(d.trim), dark: merge(d.dark), face: !!d.faceX };
  }
  const mats = {
    white: new THREE.MeshPhysicalMaterial({
      map: marbleTexture([246, 238, 220], [176, 160, 132], 1.7, 0.5),
      roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.14, envMapIntensity: 1.0,
    }),
    black: new THREE.MeshPhysicalMaterial({
      map: marbleTexture([30, 28, 30], [112, 104, 96], 5.1, 0.55),
      roughness: 0.26, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 1.1,
    }),
    trim: new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 1, roughness: 0.26, envMapIntensity: 1.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 0.45, metalness: 0.1 }),
  };
  for (const m of [mats.white, mats.black]) m.map.anisotropy = 8;

  // type: 1~6, color: 0 백 / 1 흑
  // side: 나이트가 바깥쪽으로 고개를 돌릴 방향 (-1 왼쪽 파일 / +1 오른쪽 파일)
  function create(type, color, side = 1) {
    const b = built[type];
    const g = new THREE.Group();
    const body = new THREE.Mesh(b.body, color ? mats.black : mats.white);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    if (b.trim) { const m = new THREE.Mesh(b.trim, mats.trim); m.castShadow = true; g.add(m); }
    if (b.dark) { const m = new THREE.Mesh(b.dark, mats.dark); g.add(m); }
    // 나이트는 상대 진영(백: -z, 흑: +z)을 바라보되 판 바깥쪽으로 비스듬히 돌려서 옆얼굴이 보이게 한다.
    // 모델은 +x 쪽을 본다.
    if (b.face) g.rotation.y = color ? -Math.PI / 2 + side * 0.85 : Math.PI / 2 - side * 0.85;
    const holder = new THREE.Group();
    holder.add(g);
    holder.userData = { type, color, inner: g };
    return holder;
  }
  return { create, mats, built };
}
