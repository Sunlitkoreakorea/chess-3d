// 코드로 그리는 질감들: 대리석, 나무결, 글자판. 외부 이미지 파일 없이 전부 캔버스에서 만든다.
import * as THREE from 'three';

function h3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const sm = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
    l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
export function fbm(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2; a *= 0.5; }
  return s;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, { repeat = false, color = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
const mix = (a, b, t) => a + (b - a) * t;
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// 대리석 (가로로 이어지는 무늬: 선반으로 깎은 기물에 감기도록)
export function marbleTexture(base, vein, seed = 0, veinStrength = 0.55) {
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = (x / W) * Math.PI * 2;
      const px = Math.cos(a) * 1.3 + seed, py = Math.sin(a) * 1.3 + seed * 0.7, pz = (y / H) * 2.6;
      const n = fbm(px * 1.5, py * 1.5, pz * 1.5, 5);
      const warp = fbm(px * 0.8 + 9, py * 0.8, pz * 0.8, 3);
      const t = Math.abs(Math.sin((n * 5.2 + pz * 0.9 + warp * 2.2) * Math.PI));
      const v = (1 - ss(0.0, 0.16, t)) * veinStrength + (1 - ss(0.0, 0.5, t)) * 0.08;
      const cloud = (fbm(px * 3, py * 3, pz * 3, 3) - 0.5) * 0.10;
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, mix(base[k], vein[k], v) + cloud * 255));
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true });
}

// 나무결 한 장 (반복 타일)
export function woodTexture(base, grain, { size = 512, stretch = 0.12, rings = 9, seed = 0 } = {}) {
  const c = canvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const a = u * Math.PI * 2;
      const wob = fbm(Math.cos(a) + seed, Math.sin(a) + seed, v * stretch * 8, 4);
      const ring = Math.sin((u * rings + wob * 3.2) * Math.PI * 2) * 0.5 + 0.5;
      const fine = fbm(u * 60 + seed, v * 3, 0, 3);
      const t = Math.min(1, ring * 0.55 + fine * 0.5);
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) d[i + k] = mix(base[k], grain[k], t);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true });
}

// 체스판 한 장: 8x8 칸 각각 나뭇결이 다르다. color / bump 두 장을 돌려준다.
export function boardTextures() {
  const S = 1024, N = 8, cell = S / N;
  const col = canvas(S, S), bmp = canvas(S, S);
  const cg = col.getContext('2d'), bg = bmp.getContext('2d');
  const light = { base: [236, 208, 164], grain: [204, 164, 112] };
  const dark = { base: [122, 78, 50], grain: [78, 46, 28] };
  const ci = cg.createImageData(cell, cell), bi = bg.createImageData(cell, cell);
  for (let i = 0; i < N; i++) {          // 캔버스 위쪽 = 8랭크
    for (let j = 0; j < N; j++) {        // 왼쪽 = a파일
      const rank = 7 - i, file = j;
      const isLight = ((file + rank) & 1) === 1;
      const p = isLight ? light : dark;
      const sd = (file * 8 + rank) * 3.7 + 1.3;
      const vertical = (file + rank * 3) % 2 === 0;
      const tone = (h3(file, rank, 7) - 0.5) * 18;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const u = (vertical ? x : y) / cell, v = (vertical ? y : x) / cell;
          const wob = fbm(u * 2.2 + sd, v * 0.7 + sd, sd, 4);
          const ring = Math.sin((u * 7 + wob * 4.5) * Math.PI * 2) * 0.5 + 0.5;
          const fine = fbm(u * 40 + sd, v * 2.5, sd * 0.3, 3);
          const t = Math.min(1, ring * 0.5 + fine * 0.55);
          const k = (y * cell + x) * 4;
          for (let m = 0; m < 3; m++) ci.data[k + m] = Math.max(0, Math.min(255, mix(p.base[m], p.grain[m], t) + tone));
          ci.data[k + 3] = 255;
          const bv = 255 * (0.35 + 0.65 * fine);
          bi.data[k] = bi.data[k + 1] = bi.data[k + 2] = bv; bi.data[k + 3] = 255;
        }
      }
      cg.putImageData(ci, j * cell, i * cell);
      bg.putImageData(bi, j * cell, i * cell);
      // 칸 사이 가는 이음선
      cg.fillStyle = 'rgba(30,16,8,0.18)';
      cg.fillRect(j * cell, i * cell, cell, 2); cg.fillRect(j * cell, i * cell, 2, cell);
    }
  }
  return { map: tex(col, { aniso: 16 }), bump: tex(bmp, { color: false, aniso: 8 }) };
}

// 부드러운 원형 광원 스프라이트 (칸 표시용)
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', stop = 0.55) {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(stop, inner.replace(/[\d.]+\)$/, '0.55)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c);
}
export function ringTexture(color = 'rgba(255,90,70,0.95)') {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 34, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.45, color);
  gr.addColorStop(0.62, color);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c);
}
export function squareGlowTexture(rgb = '255,214,90') {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 92);
  gr.addColorStop(0, `rgba(${rgb},0.55)`);
  gr.addColorStop(0.7, `rgba(${rgb},0.42)`);
  gr.addColorStop(1, `rgba(${rgb},0.30)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = `rgba(${rgb},0.9)`; g.lineWidth = 5; g.strokeRect(3, 3, 122, 122);
  return tex(c);
}

export function labelTexture(text) {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.font = '600 84px Georgia, "Times New Roman", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#e9cf8f';
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 4;
  g.fillText(text, 64, 70);
  return tex(c);
}

// 책상 (어두운 나무)
export function tableTexture() {
  return woodTexture([44, 28, 18], [28, 17, 10], { size: 512, stretch: 0.05, rings: 5, seed: 3 });
}
