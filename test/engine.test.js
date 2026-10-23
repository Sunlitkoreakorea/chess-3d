import test from 'node:test';
import assert from 'node:assert/strict';
import { Position, START_FEN, nameSq, mkMove, QUEEN } from '../engine.js';

const PERFT = [
  ['시작 국면', START_FEN, [20, 400, 8902, 197281]],
  ['Kiwipete(캐슬링·앙파상)', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['포지션 3(앙파상 핀)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['포지션 4(승진)', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['포지션 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [name, fen, counts] of PERFT) {
  test(`perft ${name}`, () => {
    const pos = new Position(fen);
    counts.forEach((c, i) => assert.equal(pos.perft(i + 1), c, `depth ${i + 1}`));
  });
}

test('FEN 왕복과 make/unmake 가 해시·FEN 을 되돌린다', () => {
  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  const pos = new Position(fen);
  assert.equal(pos.toFEN(), fen);
  const lo = pos.hashLo, hi = pos.hashHi;
  for (const m of pos.legalMoves()) {
    pos.makeMove(m);
    for (const m2 of pos.legalMoves()) { pos.makeMove(m2); pos.unmakeMove(); }
    pos.unmakeMove();
    assert.equal(pos.toFEN(), fen);
    assert.equal(pos.hashLo, lo); assert.equal(pos.hashHi, hi);
  }
});

test('증분 해시 = 처음부터 계산한 해시', () => {
  const pos = new Position();
  const play = (a, b, p = 0) => { const m = pos.findMove(nameSq(a), nameSq(b), p); assert.ok(m, a + b); pos.makeMove(m); };
  for (const [a, b] of [['e2', 'e4'], ['d7', 'd5'], ['e4', 'e5'], ['f7', 'f5'], ['e5', 'f6'], ['g8', 'f6'], ['g1', 'f3'], ['e7', 'e6'], ['f1', 'e2'], ['f8', 'e7'], ['e1', 'g1']]) {
    play(a, b);
    const lo = pos.hashLo, hi = pos.hashHi;
    pos.computeHash();
    assert.equal(pos.hashLo, lo); assert.equal(pos.hashHi, hi);
  }
});

test('SAN: 캐슬링·승진·모호성 해소·체크메이트', () => {
  let pos = new Position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(pos.san(pos.findMove(nameSq('e1'), nameSq('g1'))), 'O-O');
  assert.equal(pos.san(pos.findMove(nameSq('e1'), nameSq('c1'))), 'O-O-O');
  pos = new Position('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(pos.san(pos.findMove(nameSq('a7'), nameSq('a8'), QUEEN)), 'a8=Q+');
  pos = new Position('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
  assert.equal(pos.san(pos.findMove(nameSq('a1'), nameSq('d1'))), 'Rad1');
  pos = new Position('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
  assert.equal(pos.san(pos.findMove(nameSq('a1'), nameSq('a8'))), 'Ra8#');
});

test('종료 판정', () => {
  assert.deepEqual(new Position('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status(), { over: true, result: '1/2-1/2', reason: 'stalemate' });
  assert.equal(new Position('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1').status().reason, 'checkmate');
  assert.equal(new Position('4k3/8/8/8/8/8/8/4KB2 w - - 0 1').status().reason, 'insufficient');
  assert.equal(new Position('4k3/8/8/8/8/8/8/4KN1N w - - 0 1').status().over, false);
});

test('3회 반복 판정', () => {
  const pos = new Position();
  const seq = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']];
  for (let k = 0; k < 2; k++) for (const [a, b] of seq) pos.makeMove(pos.findMove(nameSq(a), nameSq(b)));
  assert.equal(pos.repetitionCount(), 3);
  assert.equal(pos.status().reason, 'repetition');
});
