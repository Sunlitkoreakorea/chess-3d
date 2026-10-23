// 효과음은 파일 없이 WebAudio 로 합성한다 (나무 말 소리).
const rnd = (a, b) => a + Math.random() * (b - a);
export class Sound {
  constructor() { this.ctx = null; this.on = true; this.noise = null; }

  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
      const len = Math.floor(this.ctx.sampleRate * 0.08);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      this.noise = buf;
      const long = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.9), this.ctx.sampleRate);
      const ld = long.getChannelData(0);
      for (let i = 0; i < ld.length; i++) ld[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ld.length, 1.5);
      this.noiseLong = long;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _tock(delay = 0, vol = 1, pitch = 1) {
    const c = this.ensure(); if (!c || !this.on) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 * pitch; bp.Q.value = 1.1;
    const g = c.createGain(); g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(bp).connect(g).connect(c.destination); src.start(t);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(210 * pitch, t); o.frequency.exponentialRampToValueAtTime(85 * pitch, t + 0.09);
    const og = c.createGain(); og.gain.setValueAtTime(0.7 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(og).connect(c.destination); o.start(t); o.stop(t + 0.16);
  }

  _tone(freq, delay, dur, vol = 0.12, type = 'sine') {
    const c = this.ensure(); if (!c || !this.on) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }


  // ── 임팩트용 소리 ──
  _boom(delay = 0, vol = 1, f = 90, dur = 0.55) {
    const c = this.ensure(); if (!c || !this.on) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 2.4, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur * 0.85);
    const g = c.createGain(); g.gain.setValueAtTime(0.95 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    const src = c.createBufferSource(); src.buffer = this.noiseLong;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    const ng = c.createGain(); ng.gain.setValueAtTime(0.7 * vol, t); ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(ng).connect(c.destination); src.start(t);
  }

  _gong(delay = 0, vol = 1, f = 110, dur = 2.6) {
    const c = this.ensure(); if (!c || !this.on) return;
    const t = c.currentTime + delay;
    [[1, 1], [2.01, 0.6], [2.76, 0.45], [4.12, 0.3], [5.4, 0.18]].forEach(([m, a]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * a * vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (0.6 + m * 0.25));
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.1);
    });
  }

  _choir(delay, vol, notes, dur = 1.6) {
    const c = this.ensure(); if (!c || !this.on) return;
    const t = c.currentTime + delay;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(c.destination);
    notes.forEach((f, i) => {
      for (const det of [-6, 6]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det + i * 2;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
      }
    });
  }

  _sparkle(delay, vol, n) {
    for (let i = 0; i < n; i++) this._tone(rnd(1800, 4200), delay + i * rnd(0.03, 0.08), 0.28, 0.035 * vol, 'sine');
  }

  // 잡기 소리: tier 0(먼지)~4(전설), style = 잡은 기물 종류(1 폰 … 6 킹)
  impact(tier, style) {
    this.capture();
    if (tier >= 1) this._sparkle(0.02, 1, 2 + tier * 2);
    if (tier === 1) return;
    if (style === 2) { this._tock(0.05, 0.5, 1.1); this._tock(0.11, 0.6, 1.2); }          // 말발굽
    this._boom(0, 0.5 + tier * 0.15, tier >= 3 ? 70 : 95);
    if (style === 4) this._boom(0.02, 0.9, 55, 0.7);                                          // 룩: 묵직하게
    if (style === 5) [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.04 + i * 0.05, 0.5, 0.07, 'triangle'));
    if (style === 3) this._choir(0, 0.6, [523, 784], 1.1);
    if (style === 6) { this._tone(392, 0.0, 0.7, 0.1, 'sawtooth'); this._tone(523, 0.22, 0.9, 0.1, 'sawtooth'); }
    if (style === 1) this._tone(1568, 0.0, 0.4, 0.09, 'triangle');
    if (tier >= 3) {
      [392, 494, 587, 784].forEach((f, i) => this._tone(f, 0.05 + i * 0.07, 0.8, 0.09, 'triangle'));
      this._sparkle(0.1, 1, 8);
    }
    if (tier >= 4) {
      this._gong(0.03, 1, 98);
      this._choir(0.05, 1, [196, 247, 294, 392], 2.2);
      this._boom(0.0, 1.2, 50, 0.9);
      this._sparkle(0.25, 1.4, 14);
    }
  }

  // 체크메이트: 낮은 징 + 합창, 쓰러질 때 쿵
  mate() {
    this._gong(0, 1.1, 82, 3.2);
    this._choir(0.1, 1.1, [147, 185, 220, 294], 2.6);
    [0, 0.12, 0.24].forEach((d) => this._boom(d + 0.95, 0.6, 60, 0.6));
  }
  thud() { this._boom(0, 1.3, 48, 0.8); this._tock(0.02, 1.2, 0.7); }

  move() { this._tock(0, 0.8, 1); }
  capture() { this._tock(0, 1.15, 0.85); this._tock(0.07, 0.6, 1.3); }
  castle() { this._tock(0, 0.8, 1); this._tock(0.16, 0.7, 1.1); }
  promote() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, i * 0.07, 0.35, 0.1, 'triangle')); }
  check() { this._tone(880, 0.05, 0.22, 0.09); this._tone(1175, 0.16, 0.3, 0.08); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, i * 0.13, 0.7, 0.11, 'triangle')); }
  lose() { [392, 349, 311, 262].forEach((f, i) => this._tone(f, i * 0.2, 0.8, 0.1, 'triangle')); }
  draw() { [440, 440, 349].forEach((f, i) => this._tone(f, i * 0.18, 0.5, 0.09, 'triangle')); }
}
