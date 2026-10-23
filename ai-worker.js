// AI 계산은 별도 스레드에서 돌려서 화면이 멈추지 않게 한다.
import { Position } from './engine.js';
import { findBestMove, resetSearch } from './search.js';
import { LEVELS, HINT_PARAMS } from './levels.js';

self.onmessage = (e) => {
  const { id, startFen, moves, level, hint } = e.data;
  const pos = new Position(startFen);
  for (const m of moves) pos.makeMove(m);
  const params = hint ? HINT_PARAMS : LEVELS[level];
  const r = findBestMove(pos, { ...params, gamePly: moves.length });
  self.postMessage({ id, move: r.move, score: r.score, depth: r.depth, nodes: r.nodes });
};
self.postMessage({ ready: true });
resetSearch();
