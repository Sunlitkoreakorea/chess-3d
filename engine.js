// 체스 규칙 엔진 (0x88 보드). 화면 코드와 무관해서 워커·Node 테스트에서도 그대로 쓴다.
// 기물 = 종류(1~6) | 색<<3.  수 = from | to<<7 | 승진기물<<14 | 플래그<<17

export const WHITE = 0, BLACK = 1;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DPP = 8;
export const mkMove = (from, to, promo = 0, flags = 0) => from | (to << 7) | (promo << 14) | (flags << 17);
export const mFrom = (m) => m & 127;
export const mTo = (m) => (m >> 7) & 127;
export const mPromo = (m) => (m >> 14) & 7;
export const mFlags = (m) => m >> 17;

const FILES = 'abcdefgh';
export const sqName = (s) => FILES[s & 7] + ((s >> 4) + 1);
export const nameSq = (n) => (n.charCodeAt(0) - 97) + (n.charCodeAt(1) - 49) * 16;
export const sqFile = (s) => s & 7;
export const sqRank = (s) => s >> 4;
export const pieceType = (p) => p & 7;
export const pieceColor = (p) => p >> 3;

const KNIGHT_OFF = [33, 31, 18, 14, -14, -18, -31, -33];
const KING_OFF = [1, -1, 16, -16, 15, -15, 17, -17];
const BISHOP_DIR = [17, 15, -17, -15];
const ROOK_DIR = [16, -16, 1, -1];
const QUEEN_DIR = [17, 15, -17, -15, 16, -16, 1, -1];

// 말이 움직이거나 잡힐 때 캐슬링 권리가 어떻게 사라지는지 (1=백K 2=백Q 4=흑K 8=흑Q)
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0] = 13; CASTLE_MASK[7] = 14; CASTLE_MASK[4] = 12;
CASTLE_MASK[112] = 7; CASTLE_MASK[119] = 11; CASTLE_MASK[116] = 3;

// 해시용 난수 (고정 시드)
function makeRng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
}
const rnd = makeRng(0xC0FFEE);
const ZP_LO = new Int32Array(16 * 128), ZP_HI = new Int32Array(16 * 128);
const ZC_LO = new Int32Array(16), ZC_HI = new Int32Array(16);
const ZE_LO = new Int32Array(8), ZE_HI = new Int32Array(8);
for (let i = 0; i < ZP_LO.length; i++) { ZP_LO[i] = rnd(); ZP_HI[i] = rnd(); }
for (let i = 1; i < 16; i++) { ZC_LO[i] = rnd(); ZC_HI[i] = rnd(); }
for (let i = 0; i < 8; i++) { ZE_LO[i] = rnd(); ZE_HI[i] = rnd(); }
const ZS_LO = rnd(), ZS_HI = rnd();

const STACK = 4096;
const LETTER = ['', 'P', 'N', 'B', 'R', 'Q', 'K'];

export class Position {
  constructor(fen = START_FEN) {
    this.board = new Int8Array(128);
    this.kingSq = [4, 116];
    this.stMove = new Int32Array(STACK);
    this.stCap = new Int8Array(STACK);
    this.stCastle = new Uint8Array(STACK);
    this.stEp = new Int16Array(STACK);
    this.stHalf = new Int16Array(STACK);
    this.stLo = new Int32Array(STACK);
    this.stHi = new Int32Array(STACK);
    this.setFEN(fen);
  }

  setFEN(fen) {
    const p = fen.trim().split(/\s+/);
    const b = this.board;
    b.fill(0);
    const map = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
    const rows = p[0].split('/');
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const lower = ch.toLowerCase();
        const color = ch === lower ? 1 : 0;
        const sq = (7 - r) * 16 + f;
        b[sq] = map[lower] | (color << 3);
        if (map[lower] === KING) this.kingSq[color] = sq;
        f++;
      }
    }
    this.turn = p[1] === 'b' ? BLACK : WHITE;
    this.castling = 0;
    for (const ch of (p[2] || '-')) {
      if (ch === 'K') this.castling |= 1;
      else if (ch === 'Q') this.castling |= 2;
      else if (ch === 'k') this.castling |= 4;
      else if (ch === 'q') this.castling |= 8;
    }
    this.ep = p[3] && p[3] !== '-' ? nameSq(p[3]) : -1;
    this.halfmove = +(p[4] || 0);
    this.fullmove = +(p[5] || 1);
    this.sp = 0;
    this.computeHash();
  }

  toFEN() {
    const b = this.board;
    const ch = ' PNBRQK';
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const pc = b[r * 16 + f];
        if (!pc) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        const c = ch[pc & 7];
        s += (pc >> 3) ? c.toLowerCase() : c;
      }
      if (empty) s += empty;
      if (r) s += '/';
    }
    let cs = '';
    if (this.castling & 1) cs += 'K';
    if (this.castling & 2) cs += 'Q';
    if (this.castling & 4) cs += 'k';
    if (this.castling & 8) cs += 'q';
    return `${s} ${this.turn ? 'b' : 'w'} ${cs || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
  }

  // 상대가 앙파상으로 잡을 수 있을 때만 해시에 앙파상 파일을 넣는다
  _epCapturable(ep, side) {
    if (ep < 0) return false;
    const b = this.board;
    const pawn = PAWN | (side << 3);
    const a = side === WHITE ? ep - 15 : ep + 15;
    const c = side === WHITE ? ep - 17 : ep + 17;
    return (!(a & 0x88) && b[a] === pawn) || (!(c & 0x88) && b[c] === pawn);
  }

  computeHash() {
    let lo = 0, hi = 0;
    const b = this.board;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const pc = b[sq];
      if (pc) { lo ^= ZP_LO[pc * 128 + sq]; hi ^= ZP_HI[pc * 128 + sq]; }
    }
    lo ^= ZC_LO[this.castling]; hi ^= ZC_HI[this.castling];
    if (this.turn) { lo ^= ZS_LO; hi ^= ZS_HI; }
    if (this._epCapturable(this.ep, this.turn)) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
    this.hashLo = lo; this.hashHi = hi;
  }

  isAttacked(sq, by) {
    const b = this.board;
    // 폰
    if (by === WHITE) {
      let s = sq - 15; if (!(s & 0x88) && b[s] === PAWN) return true;
      s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true;
    } else {
      const bp = PAWN | 8;
      let s = sq + 15; if (!(s & 0x88) && b[s] === bp) return true;
      s = sq + 17; if (!(s & 0x88) && b[s] === bp) return true;
    }
    const sh = by << 3;
    const kn = KNIGHT | sh, kg = KING | sh;
    for (let i = 0; i < 8; i++) {
      let s = sq + KNIGHT_OFF[i]; if (!(s & 0x88) && b[s] === kn) return true;
      s = sq + KING_OFF[i]; if (!(s & 0x88) && b[s] === kg) return true;
    }
    const bi = BISHOP | sh, ro = ROOK | sh, qu = QUEEN | sh;
    for (let i = 0; i < 4; i++) {
      let d = BISHOP_DIR[i], s = sq + d;
      while (!(s & 0x88)) {
        const pc = b[s];
        if (pc) { if (pc === bi || pc === qu) return true; break; }
        s += d;
      }
      d = ROOK_DIR[i]; s = sq + d;
      while (!(s & 0x88)) {
        const pc = b[s];
        if (pc) { if (pc === ro || pc === qu) return true; break; }
        s += d;
      }
    }
    return false;
  }

  inCheck(side = this.turn) { return this.isAttacked(this.kingSq[side], side ^ 1); }

  // 의사 합법수 생성. list[off..] 에 채우고 끝 인덱스를 돌려준다.
  generate(list, off, capsOnly = false) {
    const b = this.board, us = this.turn, them = us ^ 1;
    let n = off;
    const dirP = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const promoRank = us === WHITE ? 6 : 1;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = r * 16 + f;
        const pc = b[sq];
        if (!pc || (pc >> 3) !== us) continue;
        const t = pc & 7;
        if (t === PAWN) {
          let to = sq + dirP;
          if (!b[to]) {
            if (r === promoRank) {
              list[n++] = mkMove(sq, to, QUEEN);
              if (!capsOnly) {
                list[n++] = mkMove(sq, to, ROOK);
                list[n++] = mkMove(sq, to, BISHOP);
                list[n++] = mkMove(sq, to, KNIGHT);
              }
            } else if (!capsOnly) {
              list[n++] = mkMove(sq, to);
              if (r === startRank && !b[to + dirP]) list[n++] = mkMove(sq, to + dirP, 0, F_DPP);
            }
          }
          for (let k = -1; k <= 1; k += 2) {
            to = sq + dirP + k;
            if (to & 0x88) continue;
            const tp = b[to];
            if (tp) {
              if ((tp >> 3) !== them) continue;
              if (r === promoRank) {
                list[n++] = mkMove(sq, to, QUEEN, F_CAP);
                list[n++] = mkMove(sq, to, ROOK, F_CAP);
                list[n++] = mkMove(sq, to, BISHOP, F_CAP);
                list[n++] = mkMove(sq, to, KNIGHT, F_CAP);
              } else list[n++] = mkMove(sq, to, 0, F_CAP);
            } else if (to === this.ep) {
              list[n++] = mkMove(sq, to, 0, F_EP | F_CAP);
            }
          }
        } else if (t === KNIGHT || t === KING) {
          const offs = t === KNIGHT ? KNIGHT_OFF : KING_OFF;
          for (let i = 0; i < 8; i++) {
            const to = sq + offs[i];
            if (to & 0x88) continue;
            const tp = b[to];
            if (!tp) { if (!capsOnly) list[n++] = mkMove(sq, to); }
            else if ((tp >> 3) === them) list[n++] = mkMove(sq, to, 0, F_CAP);
          }
        } else {
          const dirs = t === BISHOP ? BISHOP_DIR : t === ROOK ? ROOK_DIR : QUEEN_DIR;
          const nd = dirs.length;
          for (let i = 0; i < nd; i++) {
            const d = dirs[i];
            let to = sq + d;
            while (!(to & 0x88)) {
              const tp = b[to];
              if (!tp) { if (!capsOnly) list[n++] = mkMove(sq, to); }
              else { if ((tp >> 3) === them) list[n++] = mkMove(sq, to, 0, F_CAP); break; }
              to += d;
            }
          }
        }
      }
    }
    if (!capsOnly && this.castling) {
      const base = us === WHITE ? 0 : 112;
      const kingPc = KING | (us << 3), rookPc = ROOK | (us << 3);
      if (b[base + 4] === kingPc && !this.isAttacked(base + 4, them)) {
        if ((this.castling & (us === WHITE ? 1 : 4)) && b[base + 7] === rookPc && !b[base + 5] && !b[base + 6] &&
            !this.isAttacked(base + 5, them) && !this.isAttacked(base + 6, them)) {
          list[n++] = mkMove(base + 4, base + 6, 0, F_CASTLE);
        }
        if ((this.castling & (us === WHITE ? 2 : 8)) && b[base] === rookPc && !b[base + 1] && !b[base + 2] && !b[base + 3] &&
            !this.isAttacked(base + 3, them) && !this.isAttacked(base + 2, them)) {
          list[n++] = mkMove(base + 4, base + 2, 0, F_CASTLE);
        }
      }
    }
    return n;
  }

  makeMove(m) {
    const b = this.board;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
    const us = this.turn, them = us ^ 1;
    const pc = b[from];
    const i = this.sp++;
    this.stMove[i] = m;
    this.stCastle[i] = this.castling;
    this.stEp[i] = this.ep;
    this.stHalf[i] = this.halfmove;
    this.stLo[i] = this.hashLo;
    this.stHi[i] = this.hashHi;

    let lo = this.hashLo, hi = this.hashHi;
    if (this._epCapturable(this.ep, us)) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }

    let cap = b[to];
    if (fl & F_EP) {
      const cs = us === WHITE ? to - 16 : to + 16;
      cap = b[cs];
      b[cs] = 0;
      lo ^= ZP_LO[cap * 128 + cs]; hi ^= ZP_HI[cap * 128 + cs];
    } else if (cap) {
      lo ^= ZP_LO[cap * 128 + to]; hi ^= ZP_HI[cap * 128 + to];
    }
    this.stCap[i] = cap;

    b[from] = 0;
    const np = promo ? (promo | (us << 3)) : pc;
    b[to] = np;
    lo ^= ZP_LO[pc * 128 + from] ^ ZP_LO[np * 128 + to];
    hi ^= ZP_HI[pc * 128 + from] ^ ZP_HI[np * 128 + to];

    if ((pc & 7) === KING) this.kingSq[us] = to;
    if (fl & F_CASTLE) {
      const rook = ROOK | (us << 3);
      let rf, rt;
      if (to > from) { rf = to + 1; rt = to - 1; } else { rf = to - 2; rt = to + 1; }
      b[rf] = 0; b[rt] = rook;
      lo ^= ZP_LO[rook * 128 + rf] ^ ZP_LO[rook * 128 + rt];
      hi ^= ZP_HI[rook * 128 + rf] ^ ZP_HI[rook * 128 + rt];
    }

    const oldC = this.castling;
    const newC = oldC & CASTLE_MASK[from] & CASTLE_MASK[to];
    if (newC !== oldC) { lo ^= ZC_LO[oldC] ^ ZC_LO[newC]; hi ^= ZC_HI[oldC] ^ ZC_HI[newC]; this.castling = newC; }

    this.ep = (fl & F_DPP) ? (from + to) >> 1 : -1;
    this.halfmove = ((pc & 7) === PAWN || cap) ? 0 : this.halfmove + 1;
    this.turn = them;
    lo ^= ZS_LO; hi ^= ZS_HI;
    if (this._epCapturable(this.ep, them)) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
    this.hashLo = lo; this.hashHi = hi;
    if (us === BLACK) this.fullmove++;
  }

  unmakeMove() {
    const i = --this.sp;
    const b = this.board;
    const m = this.stMove[i];
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
    const them = this.turn, us = them ^ 1;
    this.turn = us;
    const cap = this.stCap[i];
    const pc = promo ? (PAWN | (us << 3)) : b[to];
    b[from] = pc;
    if (fl & F_EP) {
      b[to] = 0;
      b[us === WHITE ? to - 16 : to + 16] = cap;
    } else b[to] = cap;
    if ((pc & 7) === KING) this.kingSq[us] = from;
    if (fl & F_CASTLE) {
      const rook = ROOK | (us << 3);
      let rf, rt;
      if (to > from) { rf = to + 1; rt = to - 1; } else { rf = to - 2; rt = to + 1; }
      b[rt] = 0; b[rf] = rook;
    }
    this.castling = this.stCastle[i];
    this.ep = this.stEp[i];
    this.halfmove = this.stHalf[i];
    this.hashLo = this.stLo[i]; this.hashHi = this.stHi[i];
    if (us === BLACK) this.fullmove--;
  }

  makeNull() {
    const i = this.sp++;
    this.stMove[i] = 0; this.stCap[i] = 0;
    this.stCastle[i] = this.castling; this.stEp[i] = this.ep; this.stHalf[i] = this.halfmove;
    this.stLo[i] = this.hashLo; this.stHi[i] = this.hashHi;
    let lo = this.hashLo, hi = this.hashHi;
    if (this._epCapturable(this.ep, this.turn)) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
    this.ep = -1;
    this.turn ^= 1;
    lo ^= ZS_LO; hi ^= ZS_HI;
    this.hashLo = lo; this.hashHi = hi;
    this.halfmove++;
  }

  unmakeNull() {
    const i = --this.sp;
    this.turn ^= 1;
    this.castling = this.stCastle[i]; this.ep = this.stEp[i]; this.halfmove = this.stHalf[i];
    this.hashLo = this.stLo[i]; this.hashHi = this.stHi[i];
  }

  // 지금 국면이 이전에 나왔는가 (탐색용: 한 번이라도 나왔으면 true)
  seenBefore() {
    const lim = Math.max(0, this.sp - this.halfmove);
    for (let i = this.sp - 2; i >= lim; i -= 2) {
      if (this.stLo[i] === this.hashLo && this.stHi[i] === this.hashHi) return true;
    }
    return false;
  }

  // 지금 국면이 몇 번째 등장인지 (3이면 3회 반복)
  repetitionCount() {
    let c = 1;
    const lim = Math.max(0, this.sp - this.halfmove);
    for (let i = this.sp - 2; i >= lim; i -= 2) {
      if (this.stLo[i] === this.hashLo && this.stHi[i] === this.hashHi) c++;
    }
    return c;
  }

  legalMoves() {
    const buf = new Int32Array(256);
    const n = this.generate(buf, 0, false);
    const out = [];
    const us = this.turn;
    for (let i = 0; i < n; i++) {
      this.makeMove(buf[i]);
      if (!this.isAttacked(this.kingSq[us], us ^ 1)) out.push(buf[i]);
      this.unmakeMove();
    }
    return out;
  }

  hasLegalMove() {
    const buf = new Int32Array(256);
    const n = this.generate(buf, 0, false);
    const us = this.turn;
    for (let i = 0; i < n; i++) {
      this.makeMove(buf[i]);
      const ok = !this.isAttacked(this.kingSq[us], us ^ 1);
      this.unmakeMove();
      if (ok) return true;
    }
    return false;
  }

  findMove(from, to, promo = 0) {
    for (const m of this.legalMoves()) {
      if (mFrom(m) === from && mTo(m) === to && mPromo(m) === promo) return m;
    }
    return 0;
  }

  isInsufficientMaterial() {
    const b = this.board;
    let knights = 0, bishopsLight = 0, bishopsDark = 0;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const t = b[r * 16 + f] & 7;
        if (!t || t === KING) continue;
        if (t === PAWN || t === ROOK || t === QUEEN) return false;
        if (t === KNIGHT) knights++;
        else if ((r + f) & 1) bishopsLight++; else bishopsDark++;
      }
    }
    const minors = knights + bishopsLight + bishopsDark;
    if (minors <= 1) return true;
    if (!knights && (!bishopsLight || !bishopsDark)) return true; // 같은 색 칸 비숍뿐
    return false;
  }

  // 게임이 끝났는지. result: '1-0' | '0-1' | '1/2-1/2'
  status() {
    if (!this.hasLegalMove()) {
      if (this.inCheck()) return { over: true, result: this.turn === WHITE ? '0-1' : '1-0', reason: 'checkmate' };
      return { over: true, result: '1/2-1/2', reason: 'stalemate' };
    }
    if (this.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient' };
    if (this.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty' };
    if (this.repetitionCount() >= 3) return { over: true, result: '1/2-1/2', reason: 'repetition' };
    return { over: false };
  }

  // 수를 두기 전에 호출: 표준 대수 표기 (SAN)
  san(m) {
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const t = this.board[from] & 7;
    let s = '';
    if (fl & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
    else if (t === PAWN) {
      if (fl & F_CAP) s += FILES[from & 7] + 'x';
      s += sqName(to);
      if (promo) s += '=' + LETTER[promo];
    } else {
      s += LETTER[t];
      const others = this.legalMoves().filter((o) => o !== m && mTo(o) === to && mFrom(o) !== from && (this.board[mFrom(o)] & 7) === t);
      if (others.length) {
        const sameFile = others.some((o) => (mFrom(o) & 7) === (from & 7));
        const sameRank = others.some((o) => (mFrom(o) >> 4) === (from >> 4));
        if (!sameFile) s += FILES[from & 7];
        else if (!sameRank) s += (from >> 4) + 1;
        else s += sqName(from);
      }
      if (fl & F_CAP) s += 'x';
      s += sqName(to);
    }
    this.makeMove(m);
    if (this.inCheck()) s += this.hasLegalMove() ? '+' : '#';
    this.unmakeMove();
    return s;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const buf = new Int32Array(256);
    const n = this.generate(buf, 0, false);
    const us = this.turn;
    let total = 0;
    for (let i = 0; i < n; i++) {
      this.makeMove(buf[i]);
      if (!this.isAttacked(this.kingSq[us], us ^ 1)) total += depth === 1 ? 1 : this.perft(depth - 1);
      this.unmakeMove();
    }
    return total;
  }
}
