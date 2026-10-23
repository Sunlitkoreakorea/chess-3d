// 화면 쪽 AI 창구. 워커가 안 되는 환경이면 메인 스레드에서 짧게 계산한다.
import { Position } from './engine.js';
import { LEVELS, HINT_PARAMS } from './levels.js';

export class AI {
  constructor() {
    this.id = 0;
    this.pending = new Map();
    this.spawn();
  }

  spawn() {
    try {
      this.worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => {
        const d = e.data;
        if (d.ready) return;
        const p = this.pending.get(d.id);
        if (p) { this.pending.delete(d.id); p.resolve(d); }
      };
      this.worker.onerror = () => { this.worker = null; this.fallback = true; };
    } catch {
      this.worker = null; this.fallback = true;
    }
  }

  think({ startFen, moves, level, hint = false }) {
    const id = ++this.id;
    return new Promise((resolve) => {
      if (this.worker) {
        this.pending.set(id, { resolve });
        this.worker.postMessage({ id, startFen, moves, level, hint });
        return;
      }
      // 대체 경로: 메인 스레드 (얕게)
      setTimeout(async () => {
        const { findBestMove } = await import('./search.js');
        const pos = new Position(startFen);
        for (const m of moves) pos.makeMove(m);
        const base = hint ? HINT_PARAMS : LEVELS[level];
        const r = findBestMove(pos, { ...base, timeMs: Math.min(base.timeMs, 900), maxDepth: Math.min(base.maxDepth, 6), gamePly: moves.length });
        resolve({ id, move: r.move, score: r.score, depth: r.depth });
      }, 30);
    });
  }

  // 계산 중인 것을 버린다 (새 게임·무르기). 워커를 새로 띄워 바로 쓸 수 있게 한다.
  cancel() {
    if (this.pending.size === 0) return;
    this.pending.clear();
    if (this.worker) { this.worker.terminate(); this.spawn(); }
  }
}
