import test from 'node:test';
import assert from 'node:assert/strict';
import { Position, nameSq, sqName, mFrom, mTo } from '../engine.js';
import { findBestMove, evaluate, resetSearch, LEVELS } from '../search.js';

const uci = (m) => sqName(mFrom(m)) + sqName(mTo(m));
const best = (fen, o = {}) => { resetSearch(); return findBestMove(new Position(fen), { maxDepth: 6, timeMs: 3000, ...o }); };

test('한 수 메이트를 찾는다', () => {
  const r = best('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
  assert.equal(uci(r.move), 'a1a8');
});

test('두 수 메이트를 찾는다 (사다리 메이트)', () => {
  const r = best('7k/8/8/8/8/8/R7/1R4K1 w - - 0 1', { maxDepth: 6 });
  assert.ok(r.score > 29000, 'score ' + r.score);
});

test('공짜 퀸을 잡는다 / 걸린 퀸을 피한다', () => {
  assert.equal(uci(best('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1').move), 'd1d5');
  // 흑 퀸이 폰에 맞는 상황: 퀸이 움직여야 함
  const r = best('rnb1kbnr/pppp1ppp/8/4p3/3PP2q/8/PPP2PPP/RNBQKBNR b KQkq - 0 3');
  assert.ok(r.depth >= 3);
});

test('평가 함수는 색 대칭이다', () => {
  const a = new Position('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
  const b = new Position('rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 2 3');
  assert.equal(evaluate(a), evaluate(b));
});

test('속도와 난이도별 시간', () => {
  for (const [i, lv] of LEVELS.entries()) {
    resetSearch();
    const t = performance.now();
    const r = findBestMove(new Position(), { ...lv, gamePly: 99 });
    const ms = Math.round(performance.now() - t);
    console.log(`  ${lv.name}: ${sqName(mFrom(r.move))}${sqName(mTo(r.move))} depth ${r.depth} nodes ${r.nodes} ${ms}ms (${Math.round(r.nodes / Math.max(1, ms))}k n/s)`);
    assert.ok(r.move);
    assert.ok(ms < lv.timeMs + 600, `${lv.name} ${ms}ms`);
  }
});

test('AI끼리 한 판 두어 끝까지 합법수만 둔다', () => {
  const pos = new Position();
  resetSearch();
  let plies = 0;
  while (!pos.status().over && plies < 120) {
    const r = findBestMove(pos, { maxDepth: 3, timeMs: 200, noise: 30, gamePly: plies });
    assert.ok(pos.legalMoves().includes(r.move), 'illegal at ply ' + plies);
    pos.makeMove(r.move);
    plies++;
  }
  console.log('  plies', plies, pos.status());
});
