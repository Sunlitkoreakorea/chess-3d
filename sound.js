// 효과음은 파일 없이 WebAudio 로 합성한다 (나무 말 소리).
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

  move() { this._tock(0, 0.8, 1); }
  capture() { this._tock(0, 1.15, 0.85); this._tock(0.07, 0.6, 1.3); }
  castle() { this._tock(0, 0.8, 1); this._tock(0.16, 0.7, 1.1); }
  promote() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, i * 0.07, 0.35, 0.1, 'triangle')); }
  check() { this._tone(880, 0.05, 0.22, 0.09); this._tone(1175, 0.16, 0.3, 0.08); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, i * 0.13, 0.7, 0.11, 'triangle')); }
  lose() { [392, 349, 311, 262].forEach((f, i) => this._tone(f, i * 0.2, 0.8, 0.1, 'triangle')); }
  draw() { [440, 440, 349].forEach((f, i) => this._tone(f, i * 0.18, 0.5, 0.09, 'triangle')); }
}
