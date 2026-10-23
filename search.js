// 체스 AI: 평가 함수 + 알파-베타 탐색 (반복 심화, 치환표, 널무브, LMR, 정지 탐색)
import {
  WHITE, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  F_CAP, F_EP, mFrom, mTo, mPromo, mFlags,
} from './engine.js';

const INF = 32000, MATE = 31000, MAX_PLY = 96, MATE_BOUND = MATE - MAX_PLY;
const VAL = [0, 100, 320, 330, 500, 900, 0];

// ───────── 평가: 위치 점수표 (백 기준, 0번 칸 = a8) ─────────
const T_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0];
const T_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50];
const T_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20];
const T_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0];
const T_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20];
const T_KING_MG = [
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20];
const T_KING_EG = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

// PST[색][종류][0x88 칸]
const PST = [[], []];
const PST_KEG = [new Int16Array(128), new Int16Array(128)];
{
  const tables = [null, T_PAWN, T_KNIGHT, T_BISHOP, T_ROOK, T_QUEEN, T_KING_MG];
  for (let c = 0; c < 2; c++) {
    for (let t = 1; t <= 6; t++) {
      const arr = new Int16Array(128);
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        arr[r * 16 + f] = tables[t][(c === 0 ? 7 - r : r) * 8 + f];
        if (t === 6) PST_KEG[c][r * 16 + f] = T_KING_EG[(c === 0 ? 7 - r : r) * 8 + f];
      }
      PST[c][t] = arr;
    }
  }
}
const PASSED = [0, 5, 10, 20, 35, 60, 100, 0];

const wMin = new Int8Array(10), bMax = new Int8Array(10), wCnt = new Int8Array(10), bCnt = new Int8Array(10);
const pawnSq = [new Int16Array(10), new Int16Array(10)];
const rookSq = [new Int16Array(10), new Int16Array(10)];

// 지금 둘 차례인 쪽 기준 점수 (센티폰)
export function evaluate(pos) {
  const b = pos.board;
  wMin.fill(8); bMax.fill(-1); wCnt.fill(0); bCnt.fill(0);
  let nWP = 0, nBP = 0, nWR = 0, nBR = 0;
  let sW = 0, sB = 0, phaseMat = 0, bishopsW = 0, bishopsB = 0, minors = 0, heavy = 0;
  let kW = 0, kB = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = r * 16 + f;
      const pc = b[sq];
      if (!pc) continue;
      const t = pc & 7, c = pc >> 3;
      if (t === KING) { if (c) kB = sq; else kW = sq; continue; }
      const v = VAL[t] + PST[c][t][sq];
      if (c) sB += v; else sW += v;
      if (t === PAWN) {
        if (c) { bCnt[f + 1]++; if (r > bMax[f + 1]) bMax[f + 1] = r; pawnSq[1][nBP++] = sq; }
        else { wCnt[f + 1]++; if (r < wMin[f + 1]) wMin[f + 1] = r; pawnSq[0][nWP++] = sq; }
      } else if (t === ROOK) {
        if (c) rookSq[1][nBR++] = sq; else rookSq[0][nWR++] = sq;
        phaseMat += 2; heavy++;
      } else if (t === QUEEN) { phaseMat += 4; heavy++; }
      else {
        phaseMat += 1; minors++;
        if (t === BISHOP) { if (c) bishopsB++; else bishopsW++; }
      }
    }
  }
  if (!nWP && !nBP && !heavy && minors <= 1) return 0; // 기물 부족 무승부
  const phase = Math.min(24, phaseMat) / 24; // 1 = 중반, 0 = 종반
  if (bishopsW >= 2) sW += 30;
  if (bishopsB >= 2) sB += 30;
  const pw = 0.6 + 0.8 * (1 - phase);
  for (let i = 0; i < nWP; i++) {
    const sq = pawnSq[0][i], f = (sq & 7) + 1, r = sq >> 4;
    if (wCnt[f] > 1) sW -= 6;
    if (!wCnt[f - 1] && !wCnt[f + 1]) sW -= 12;
    if (bMax[f - 1] <= r && bMax[f] <= r && bMax[f + 1] <= r) sW += PASSED[r] * pw;
  }
  for (let i = 0; i < nBP; i++) {
    const sq = pawnSq[1][i], f = (sq & 7) + 1, r = sq >> 4;
    if (bCnt[f] > 1) sB -= 6;
    if (!bCnt[f - 1] && !bCnt[f + 1]) sB -= 12;
    if (wMin[f - 1] >= r && wMin[f] >= r && wMin[f + 1] >= r) sB += PASSED[7 - r] * pw;
  }
  for (let i = 0; i < nWR; i++) { const f = (rookSq[0][i] & 7) + 1; if (!wCnt[f]) sW += bCnt[f] ? 8 : 18; }
  for (let i = 0; i < nBR; i++) { const f = (rookSq[1][i] & 7) + 1; if (!bCnt[f]) sB += wCnt[f] ? 8 : 18; }
  // 왕: 중반엔 안전, 종반엔 중앙
  sW += PST[0][KING][kW] * phase + PST_KEG[0][kW] * (1 - phase);
  sB += PST[1][KING][kB] * phase + PST_KEG[1][kB] * (1 - phase);
  // 폰 방패
  if ((kW >> 4) <= 1) {
    let sh = 0;
    for (let d = -1; d <= 1; d++) {
      const s1 = kW + 16 + d;
      if (!(s1 & 0x88)) { if (b[s1] === PAWN) sh += 10; else if (!(s1 + 16 & 0x88) && b[s1 + 16] === PAWN) sh += 6; }
    }
    sW += sh * phase;
  }
  if ((kB >> 4) >= 6) {
    let sh = 0;
    const bp = PAWN | 8;
    for (let d = -1; d <= 1; d++) {
      const s1 = kB - 16 + d;
      if (!(s1 & 0x88)) { if (b[s1] === bp) sh += 10; else if (!(s1 - 16 & 0x88) && b[s1 - 16] === bp) sh += 6; }
    }
    sB += sh * phase;
  }
  const score = Math.round(sW - sB);
  return (pos.turn === WHITE ? score : -score) + 10;
}

// ───────── 탐색 ─────────
const TT_SIZE = 1 << 20, TT_MASK = TT_SIZE - 1;
const ttHi = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE), ttFlag = new Uint8Array(TT_SIZE); // 1 정확 2 하한 3 상한
const moveBuf = new Int32Array(MAX_PLY * 256), scoreBuf = new Int32Array(MAX_PLY * 256);
const killers = new Int32Array(MAX_PLY * 2);
const history = new Int32Array(2 * 128 * 128);

let nodes = 0, stopped = false, deadline = 0, checkTime = true;

export function resetSearch() {
  ttFlag.fill(0); killers.fill(0); history.fill(0);
}

function scoreMove(pos, m, ttm, ply) {
  if (m === ttm) return 1e7;
  const fl = m >> 17;
  if (fl & F_CAP) {
    const victim = (fl & F_EP) ? PAWN : (pos.board[(m >> 7) & 127] & 7);
    return 1e6 + victim * 16 - (pos.board[m & 127] & 7) + (((m >> 14) & 7) === QUEEN ? 800 : 0);
  }
  const promo = (m >> 14) & 7;
  if (promo) return 9e5 + promo;
  if (m === killers[ply * 2]) return 8e5;
  if (m === killers[ply * 2 + 1]) return 7e5;
  return history[(pos.turn * 128 + (m & 127)) * 128 + ((m >> 7) & 127)];
}

function timeUp() { return checkTime && performance.now() >= deadline; }

function qsearch(pos, alpha, beta, ply) {
  if ((++nodes & 2047) === 0 && timeUp()) stopped = true;
  if (stopped) return 0;
  if (ply >= MAX_PLY - 1) return evaluate(pos);
  const inChk = pos.inCheck();
  let best = -INF;
  if (!inChk) {
    best = evaluate(pos);
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
  }
  const off = ply * 256;
  const end = pos.generate(moveBuf, off, !inChk);
  for (let i = off; i < end; i++) scoreBuf[i] = scoreMove(pos, moveBuf[i], 0, ply);
  const us = pos.turn;
  let legal = 0;
  for (let i = off; i < end; i++) {
    let bi = i;
    for (let j = i + 1; j < end; j++) if (scoreBuf[j] > scoreBuf[bi]) bi = j;
    if (bi !== i) {
      const tm = moveBuf[i]; moveBuf[i] = moveBuf[bi]; moveBuf[bi] = tm;
      const ts = scoreBuf[i]; scoreBuf[i] = scoreBuf[bi]; scoreBuf[bi] = ts;
    }
    const m = moveBuf[i];
    if (!inChk && !(m >> 14 & 7)) {
      const victim = (m >> 17 & F_EP) ? PAWN : (pos.board[(m >> 7) & 127] & 7);
      if (best + VAL[victim] + 200 < alpha) continue; // 델타 가지치기
    }
    pos.makeMove(m);
    if (pos.isAttacked(pos.kingSq[us], us ^ 1)) { pos.unmakeMove(); continue; }
    legal++;
    const score = -qsearch(pos, -beta, -alpha, ply + 1);
    pos.unmakeMove();
    if (stopped) return 0;
    if (score > best) {
      best = score;
      if (score > alpha) { alpha = score; if (alpha >= beta) break; }
    }
  }
  if (inChk && !legal) return -MATE + ply;
  return best;
}

function negamax(pos, depth, alpha, beta, ply, allowNull) {
  if ((++nodes & 2047) === 0 && timeUp()) stopped = true;
  if (stopped) return 0;
  if (pos.halfmove >= 100 || pos.seenBefore()) return 0;
  if (ply >= MAX_PLY - 1) return evaluate(pos);
  alpha = Math.max(alpha, -MATE + ply);
  beta = Math.min(beta, MATE - ply - 1);
  if (alpha >= beta) return alpha;

  const pv = beta - alpha > 1;
  const inChk = pos.inCheck();
  if (inChk) depth++;
  if (depth <= 0) return qsearch(pos, alpha, beta, ply);

  const idx = pos.hashLo & TT_MASK;
  let ttm = 0;
  if (ttFlag[idx] && ttHi[idx] === pos.hashHi) {
    ttm = ttMove[idx];
    if (!pv && ttDepth[idx] >= depth) {
      let sc = ttScore[idx];
      if (sc > MATE_BOUND) sc -= ply; else if (sc < -MATE_BOUND) sc += ply;
      const fg = ttFlag[idx];
      if (fg === 1 || (fg === 2 && sc >= beta) || (fg === 3 && sc <= alpha)) return sc;
    }
  }

  const us = pos.turn;
  let staticEval = 0;
  if (!pv && !inChk) {
    staticEval = evaluate(pos);
    if (depth <= 3 && staticEval - 130 * depth >= beta) return staticEval; // 역 퓨틸리티
    if (allowNull && depth >= 3 && staticEval >= beta) {
      // 폰·왕만 남았으면 널무브 금지 (추크츠방)
      let hasPiece = false;
      for (let r = 0; r < 8 && !hasPiece; r++) for (let f = 0; f < 8; f++) {
        const pc = pos.board[r * 16 + f];
        if (pc && (pc >> 3) === us && (pc & 7) > PAWN && (pc & 7) < KING) { hasPiece = true; break; }
      }
      if (hasPiece) {
        pos.makeNull();
        const sc = -negamax(pos, depth - 3 - (depth > 6 ? 1 : 0), -beta, -beta + 1, ply + 1, false);
        pos.unmakeNull();
        if (stopped) return 0;
        if (sc >= beta) return sc >= MATE_BOUND ? beta : sc;
      }
    }
  }

  const off = ply * 256;
  const end = pos.generate(moveBuf, off, false);
  for (let i = off; i < end; i++) scoreBuf[i] = scoreMove(pos, moveBuf[i], ttm, ply);
  const origAlpha = alpha;
  let best = -INF, bestMove = 0, legal = 0;
  for (let i = off; i < end; i++) {
    let bi = i;
    for (let j = i + 1; j < end; j++) if (scoreBuf[j] > scoreBuf[bi]) bi = j;
    if (bi !== i) {
      const tm = moveBuf[i]; moveBuf[i] = moveBuf[bi]; moveBuf[bi] = tm;
      const ts = scoreBuf[i]; scoreBuf[i] = scoreBuf[bi]; scoreBuf[bi] = ts;
    }
    const m = moveBuf[i];
    pos.makeMove(m);
    if (pos.isAttacked(pos.kingSq[us], us ^ 1)) { pos.unmakeMove(); continue; }
    legal++;
    const quiet = !(m >> 17 & F_CAP) && !(m >> 14 & 7);
    let score;
    if (legal === 1) score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
    else {
      let red = 0;
      if (depth >= 3 && legal > 3 && quiet && !inChk && m !== killers[ply * 2] && m !== killers[ply * 2 + 1] && !pos.inCheck()) {
        red = legal > 8 && depth >= 5 ? 2 : 1;
        if (red > depth - 2) red = depth - 2;
      }
      score = -negamax(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha && red > 0) score = -negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
      if (score > alpha && score < beta) score = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
    }
    pos.unmakeMove();
    if (stopped) return 0;
    if (score > best) {
      best = score; bestMove = m;
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) {
          if (quiet) {
            if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
            const hi = (us * 128 + (m & 127)) * 128 + ((m >> 7) & 127);
            history[hi] = Math.min(600000, history[hi] + depth * depth);
          }
          break;
        }
      }
    }
  }
  if (!legal) return inChk ? -MATE + ply : 0;

  let store = best;
  if (store > MATE_BOUND) store += ply; else if (store < -MATE_BOUND) store -= ply;
  if (ttFlag[idx] === 0 || ttHi[idx] !== pos.hashHi || depth >= ttDepth[idx]) {
    ttHi[idx] = pos.hashHi; ttMove[idx] = bestMove; ttScore[idx] = store; ttDepth[idx] = depth;
    ttFlag[idx] = best <= origAlpha ? 3 : best >= beta ? 2 : 1;
  }
  return best;
}

// 루트: 수 목록을 (이전 반복 결과 순서로) 탐색해서 최선수를 맨 앞으로 올린다
function searchRoot(pos, roots, depth, scores) {
  let alpha = -INF;
  const us = pos.turn;
  let bestIdx = 0, best = -INF;
  for (let k = 0; k < roots.length; k++) {
    const m = roots[k];
    pos.makeMove(m);
    let score;
    if (k === 0) score = -negamax(pos, depth - 1, -INF, -alpha, 1, true);
    else {
      score = -negamax(pos, depth - 1, -alpha - 1, -alpha, 1, true);
      if (score > alpha && !stopped) score = -negamax(pos, depth - 1, -INF, -alpha, 1, true);
    }
    pos.unmakeMove();
    if (stopped) return null;
    scores[k] = score;
    if (score > best) { best = score; bestIdx = k; if (score > alpha) alpha = score; }
  }
  if (bestIdx > 0) {
    const m = roots[bestIdx], s = scores[bestIdx];
    for (let k = bestIdx; k > 0; k--) { roots[k] = roots[k - 1]; scores[k] = scores[k - 1]; }
    roots[0] = m; scores[0] = s;
  }
  return best;
}

// 수마다 점수를 따로 구하고 싶을 때 (난이도 낮은 AI의 실수, 오프닝 다양성)
function scoreEachRoot(pos, roots, depth) {
  const out = [];
  const us = pos.turn;
  for (const m of roots) {
    pos.makeMove(m);
    const sc = -negamax(pos, depth - 1, -INF, INF, 1, true);
    pos.unmakeMove();
    if (stopped) return null;
    out.push(sc);
  }
  return out;
}

/**
 * opts: { maxDepth, timeMs, noise, variety, gamePly }
 *  - noise:   각 수 점수에 0~noise 센티폰의 무작위 값을 더해 고른다 (낮은 난이도)
 *  - variety: 오프닝에서 최선수와 variety 센티폰 이내인 수 중 무작위로 고른다
 */
export function findBestMove(pos, opts = {}) {
  const { maxDepth = 6, timeMs = 1000, noise = 0, variety = 0, gamePly = 99 } = opts;
  const roots = pos.legalMoves();
  nodes = 0; stopped = false; checkTime = true;
  deadline = performance.now() + timeMs;
  if (roots.length === 0) return { move: 0, score: 0, depth: 0, nodes: 0 };
  if (roots.length === 1) return { move: roots[0], score: 0, depth: 0, nodes: 0 };

  if (noise > 0 || (variety > 0 && gamePly < 14)) {
    checkTime = false; // 얕은 탐색이라 시간 제한 없이 끝까지
    const depth = noise > 0 ? maxDepth : Math.min(maxDepth, 4);
    const sc = scoreEachRoot(pos, roots, depth);
    let bestI = 0, bestV = -Infinity;
    if (noise > 0) {
      for (let i = 0; i < roots.length; i++) {
        const v = sc[i] + Math.random() * noise;
        if (v > bestV) { bestV = v; bestI = i; }
      }
    } else {
      const top = Math.max(...sc);
      const pool = [];
      for (let i = 0; i < roots.length; i++) if (sc[i] >= top - variety) pool.push(i);
      bestI = pool[Math.floor(Math.random() * pool.length)];
    }
    return { move: roots[bestI], score: sc[bestI], depth, nodes };
  }

  // 간단한 정렬: 잡기·승진 먼저
  const sortKey = (m) => scoreMove(pos, m, 0, 0);
  roots.sort((a, b) => sortKey(b) - sortKey(a));
  const scores = new Array(roots.length).fill(0);
  let bestMove = roots[0], bestScore = 0, doneDepth = 0;
  for (let d = 1; d <= maxDepth; d++) {
    if (d === 1) checkTime = false; else checkTime = true;
    const sc = searchRoot(pos, roots, d, scores);
    if (sc === null) break;
    bestMove = roots[0]; bestScore = scores[0]; doneDepth = d;
    if (Math.abs(bestScore) > MATE_BOUND) break; // 메이트 발견
    if (performance.now() >= deadline) break;
  }
  return { move: bestMove, score: bestScore, depth: doneDepth, nodes };
}

export { LEVELS } from './levels.js';
