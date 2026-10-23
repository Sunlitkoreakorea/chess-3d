// 게임 진행: 입력 → 규칙 엔진 → 3D 애니메이션 → AI 응수 → 화면 갱신
import {
  Position, START_FEN, WHITE, BLACK, PAWN, KING, QUEEN, ROOK, BISHOP, KNIGHT,
  mFrom, mTo, mPromo, mFlags, F_CAP, F_CASTLE, sqName,
} from './engine.js';
import { LEVELS } from './levels.js';
import { Stage } from './stage.js';
import { AI } from './ai.js';
import { Sound } from './sound.js';
import { captureTier, captureBanner } from './fx.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GLYPH = ['', '♟', '♞', '♝', '♜', '♛', '♚'].map((g) => g + '︎');
const OUTLINE = ['', '♙', '♘', '♗', '♖', '♕', '♔'].map((g) => g + '︎');
const VALUE = [0, 1, 3, 3, 5, 9, 0];
const START_COUNT = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1 };
const PIECE_NAME = { [QUEEN]: '퀸', [ROOK]: '룩', [BISHOP]: '비숍', [KNIGHT]: '나이트' };

const prefs = (() => {
  try { return { level: 2, color: 'white', sound: true, ...JSON.parse(localStorage.getItem('chess3d') || '{}') }; }
  catch { return { level: 2, color: 'white', sound: true }; }
})();
const savePrefs = () => { try { localStorage.setItem('chess3d', JSON.stringify(prefs)); } catch { /* 저장 불가 환경 */ } };

const G = {
  pos: new Position(), moves: [], sans: [],
  human: WHITE, level: prefs.level,
  busy: false, thinking: false, over: false, started: false,
  token: 0, selected: -1, targets: [], hintTimer: 0, lastMove: null,
  manual: false, // 켜면 AI가 자동으로 두지 않는다 (스크립트 테스트용)
};
let stage, ai, sound;

// ───────────────────────── 화면 부품 ─────────────────────────
function setStatus(text, cls = '') {
  $('statusText').textContent = text;
  $('status').className = cls;
}

function sanHtml(san, color) {
  const map = color === WHITE ? OUTLINE : GLYPH;
  const g = { K: 6, Q: 5, R: 4, B: 3, N: 2 }[san[0]];
  return g ? map[g] + san.slice(1) : san;
}

function renderMoves() {
  const list = $('moveList');
  if (!G.sans.length) { list.innerHTML = '<div class="empty">첫 수를 두면 여기에 기록돼요.</div>'; return; }
  let html = '';
  for (let i = 0; i < G.sans.length; i += 2) {
    const last = G.sans.length - 1;
    const w = sanHtml(G.sans[i], WHITE), b = G.sans[i + 1] ? sanHtml(G.sans[i + 1], BLACK) : '';
    html += `<div class="mv"><span class="n">${i / 2 + 1}.</span>` +
      `<span class="san${i === last ? ' last' : ''}">${w}</span>` +
      `<span class="san${i + 1 === last ? ' last' : ''}">${b}</span></div>`;
  }
  list.innerHTML = html;
  list.scrollTop = list.scrollHeight;
}

function missingOf(pos, color) {
  const have = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = pos.board[sq];
    if (pc && (pc >> 3) === color && (pc & 7) !== KING) have[pc & 7]++;
  }
  const out = [];
  for (let t = 5; t >= 1; t--) for (let i = 0; i < START_COUNT[t] - have[t]; i++) out.push(t);
  return out;
}
function materialOf(pos, color) {
  let s = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const pc = pos.board[sq];
    if (pc && (pc >> 3) === color) s += VALUE[pc & 7];
  }
  return s;
}

function renderCaptured() {
  const me = G.human, ai_ = me ^ 1;
  const mine = missingOf(G.pos, ai_);     // 내가 잡은 (상대 색) 기물
  const theirs = missingOf(G.pos, me);    // AI가 잡은 기물
  const fmt = (arr, color) => arr.map((t) => `<span class="${color === WHITE ? 'w' : 'b'}">${GLYPH[t]}</span>`).join('');
  $('capsMe').innerHTML = fmt(mine, ai_);
  $('capsAI').innerHTML = fmt(theirs, me);
  const diff = materialOf(G.pos, me) - materialOf(G.pos, ai_);
  $('advMe').textContent = diff > 0 ? `+${diff}` : '';
  $('advAI').textContent = diff < 0 ? `+${-diff}` : '';
}

function updateButtons() {
  const idle = !G.busy && G.started;
  $('btnUndo').disabled = !idle || G.moves.length === 0 || (G.moves.length === 1 && G.human === BLACK);
  $('btnHint').disabled = !idle || G.over || G.thinking || G.pos.turn !== G.human;
  $('btnResign').disabled = !G.started || G.over;
}

function refreshStatus() {
  if (!G.started) return;
  if (G.over) return;
  if (G.thinking || G.pos.turn !== G.human) { setStatus('AI가 생각하는 중…', 'think'); $('aiNote').textContent = '생각하는 중…'; return; }
  $('aiNote').textContent = `난이도 · ${LEVELS[G.level].name}`;
  if (G.pos.inCheck()) setStatus('체크! 왕을 지키세요', 'check');
  else setStatus(`내 차례 (${G.human === WHITE ? '백' : '흑'})`);
}

// 큰 잡기·체크메이트 배너 (CSS 애니메이션을 처음부터 다시 돌린다)
function restart(el, cls) {
  el.className = '';
  void el.offsetWidth;
  el.className = cls;
}
function showBanner({ main, sub, tier }) {
  const el = $('banner');
  el.querySelector('.b-main').textContent = main;
  el.querySelector('.b-sub').textContent = sub;
  restart(el, `show t${tier}`);
}
function showMateBanner() { restart($('mateBanner'), 'show'); }
function clearFx() {
  $('banner').className = ''; $('mateBanner').className = '';
  stage.fx.vignette(false);
  stage.controls.autoRotate = false;
}

// ───────────────────────── 선택·이동 ─────────────────────────
function clearSelection() {
  G.selected = -1; G.targets = [];
  stage.setSelected(-1); stage.setTargets([]);
}
function clearHint() { clearTimeout(G.hintTimer); stage.setHint(-1, -1); }

function select(sq) {
  const moves = G.pos.legalMoves().filter((m) => mFrom(m) === sq);
  if (!moves.length) { clearSelection(); return false; }
  const seen = new Map();
  for (const m of moves) {
    const to = mTo(m);
    const t = seen.get(to) || { sq: to, capture: false, promo: false };
    if (mFlags(m) & F_CAP) t.capture = true;
    if (mPromo(m)) t.promo = true;
    seen.set(to, t);
  }
  G.selected = sq; G.targets = [...seen.values()];
  stage.setSelected(sq); stage.setTargets(G.targets);
  return true;
}

function onSquare(sq) {
  if (!G.started || G.over || G.busy || G.thinking || G.pos.turn !== G.human || sq < 0) return;
  if (G.selected >= 0) {
    const t = G.targets.find((x) => x.sq === sq);
    if (t) {
      if (t.promo) { askPromotion(G.selected, sq); return; }
      playHuman(G.selected, sq, 0); return;
    }
  }
  const pc = G.pos.board[sq];
  if (pc && (pc >> 3) === G.human && sq !== G.selected) select(sq);
  else clearSelection();
}

function askPromotion(from, to) {
  const box = $('promoBtns');
  box.innerHTML = '';
  for (const t of [QUEEN, ROOK, BISHOP, KNIGHT]) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="g ${G.human === WHITE ? 'w' : 'b'}">${GLYPH[t]}</span>${PIECE_NAME[t]}`;
    b.onclick = () => { $('promo').classList.remove('show'); playHuman(from, to, t); };
    box.appendChild(b);
  }
  $('promo').classList.add('show');
}

function playHuman(from, to, promo) {
  const m = G.pos.findMove(from, to, promo);
  if (m) applyMove(m);
}

async function applyMove(m) {
  G.busy = true; clearHint(); clearSelection(); updateButtons();
  const san = G.pos.san(m);
  const fl = mFlags(m);
  // 잡는 수라면 어떤 기물이 무엇을 잡는지에 따라 연출 등급이 정해진다
  const isCap = !!(fl & F_CAP);
  const attacker = G.pos.board[mFrom(m)] & 7;
  const victim = isCap ? ((fl & 2) ? PAWN : G.pos.board[mTo(m)] & 7) : 0;   // 2 = 앙파상
  const tier = isCap ? captureTier(attacker, victim) : 0;
  G.pos.makeMove(m);
  G.moves.push(m); G.sans.push(san);
  renderMoves();
  const check = san.endsWith('+');
  await stage.animateMove(m, {
    fx: isCap ? { tier } : null,
    onImpact: () => {
      sound.impact(tier, attacker);
      const b = captureBanner(attacker, victim, tier);
      if (b) showBanner(b);
    },
    onLand: () => {
      if (mPromo(m)) sound.promote();
      else if (!isCap) { if (fl & F_CASTLE) sound.castle(); else sound.move(); }
      if (check) setTimeout(() => sound.check(), 120);
      stage.setLastMove(mFrom(m), mTo(m));
    },
  });
  G.lastMove = m;
  stage.setCheck(G.pos.inCheck() ? G.pos.kingSq[G.pos.turn] : -1);
  renderCaptured();
  G.busy = false;

  const st = G.pos.status();
  if (st.over) { await finish(st); return; }
  refreshStatus(); updateButtons();
  if (G.pos.turn !== G.human && !G.manual) aiMove();
}

async function aiMove() {
  const token = ++G.token, ply = G.moves.length;
  G.thinking = true; refreshStatus(); updateButtons();
  const t0 = performance.now();
  const res = await ai.think({ startFen: START_FEN, moves: G.moves, level: G.level });
  if (token !== G.token) return;
  await sleep(Math.max(0, 700 - (performance.now() - t0)));
  if (token !== G.token || G.moves.length !== ply) return;
  G.thinking = false;
  if (!res.move) { refreshStatus(); return; }
  applyMove(res.move);
}

async function finish(st) {
  const token = G.token;
  G.over = true; G.thinking = false; updateButtons();
  const winner = st.result === '1-0' ? WHITE : st.result === '0-1' ? BLACK : -1;
  const humanWon = winner === G.human;
  let title, text;
  const side = (c) => (c === WHITE ? '백' : '흑');
  switch (st.reason) {
    case 'checkmate':
      title = '체크메이트!';
      text = humanWon ? `${side(winner)} 승리 — 멋진 승리예요! 🎉` : `${side(winner)} 승리 — AI가 이겼어요.`;
      break;
    case 'resign': title = '기권'; text = `${side(winner)} 승리`; break;
    case 'stalemate': title = '스테일메이트'; text = '둘 수 있는 수가 없어 무승부예요.'; break;
    case 'insufficient': title = '무승부'; text = '체크메이트를 만들 기물이 부족해요.'; break;
    case 'fifty': title = '무승부'; text = '50수 동안 진전이 없었어요.'; break;
    default: title = '무승부'; text = '같은 국면이 세 번 반복됐어요.';
  }
  setStatus(title, 'over');
  if (st.reason === 'checkmate') {
    stage.setCheck(-1);
    const loserKing = G.pos.kingSq[winner ^ 1];
    showMateBanner();
    sound.mate();
    await stage.mate({
      kingSq: loserKing, attackers: G.pos.attackersOf(loserKing, winner), winner, humanWon,
      onGround: () => sound.thud(),
    });
    if (token !== G.token) return;     // 연출 도중 새 판·무르기를 눌렀다면 이어 가지 않는다
  }
  if (winner < 0) sound.draw(); else if (humanWon) sound.win(); else sound.lose();
  $('resTitle').textContent = title;
  $('resText').textContent = text;
  $('result').classList.add('show');
}

// ───────────────────────── 버튼 ─────────────────────────
async function undo() {
  if (G.busy || !G.started || G.moves.length === 0) return;
  G.token++; ai.cancel(); G.thinking = false; clearHint(); clearSelection();
  $('result').classList.remove('show'); clearFx();
  let n = G.pos.turn === G.human ? 2 : 1;
  n = Math.min(n, G.moves.length);
  for (let i = 0; i < n; i++) { G.pos.unmakeMove(); G.moves.pop(); G.sans.pop(); }
  G.over = false;
  stage.setPosition(G.pos);
  const lm = G.moves[G.moves.length - 1];
  stage.setLastMove(lm ? mFrom(lm) : -1, lm ? mTo(lm) : -1);
  stage.setCheck(G.pos.inCheck() ? G.pos.kingSq[G.pos.turn] : -1);
  renderMoves(); renderCaptured(); refreshStatus(); updateButtons();
  if (G.pos.turn !== G.human && !G.manual) aiMove();
}

async function hint() {
  if (G.busy || G.thinking || G.over || G.pos.turn !== G.human) return;
  const btn = $('btnHint'); btn.disabled = true; btn.textContent = '💡 생각 중…';
  const token = G.token;
  const res = await ai.think({ startFen: START_FEN, moves: G.moves, level: 0, hint: true });
  btn.textContent = '💡 힌트';
  if (token !== G.token || G.busy || G.thinking || G.over) { updateButtons(); return; }
  if (res.move) {
    stage.setHint(mFrom(res.move), mTo(res.move));
    clearTimeout(G.hintTimer);
    G.hintTimer = setTimeout(() => stage.setHint(-1, -1), 5000);
  }
  updateButtons();
}

let resignTimer = 0;
function resign() {
  const b = $('btnResign');
  if (b.dataset.armed) {
    clearTimeout(resignTimer); delete b.dataset.armed; b.textContent = '기권';
    G.token++; ai.cancel();
    finish({ over: true, result: G.human === WHITE ? '0-1' : '1-0', reason: 'resign' });
    return;
  }
  b.dataset.armed = '1'; b.textContent = '정말 기권?';
  resignTimer = setTimeout(() => { delete b.dataset.armed; b.textContent = '기권'; }, 3000);
}

// ───────────────────────── 새 게임 / 메뉴 ─────────────────────────
function openMenu() {
  $('menu').classList.add('show');
  $('btnBack').style.display = G.started && !G.over ? '' : 'none';
  stage.controls.autoRotate = !G.started;
}

function startGame() {
  let color = prefs.color;
  if (color === 'random') color = Math.random() < 0.5 ? 'white' : 'black';
  G.token++; ai.cancel();
  G.human = color === 'white' ? WHITE : BLACK;
  G.level = prefs.level;
  G.pos = new Position(); G.moves = []; G.sans = []; G.over = false; G.thinking = false; G.busy = false;
  G.started = true; G.lastMove = null;
  clearHint(); clearSelection();
  $('menu').classList.remove('show'); $('result').classList.remove('show'); $('promo').classList.remove('show');
  clearFx();
  stage.setPosition(G.pos, { intro: true });
  stage.setFlipped(G.human === BLACK);
  stage.setLastMove(-1, -1); stage.setCheck(-1);
  stage.setView(G.human === WHITE ? 'white' : 'black');
  markView(G.human === WHITE ? 'white' : 'black');
  $('lvLabel').textContent = `AI · ${LEVELS[G.level].name}`;
  $('meNote').textContent = G.human === WHITE ? '백' : '흑';
  $('aiNote').textContent = `난이도 · ${LEVELS[G.level].name}`;
  $('sideAI').querySelector('.av').textContent = '♞';
  $('sideMe').querySelector('.av').textContent = G.human === WHITE ? '♔' : '♚';
  renderMoves(); renderCaptured(); refreshStatus(); updateButtons();
  if (G.human === BLACK) { G.busy = true; setTimeout(() => { G.busy = false; aiMove(); }, 1500); }
  else { G.busy = true; setTimeout(() => { G.busy = false; updateButtons(); }, 900); }
}

function markView(name) {
  document.querySelectorAll('#viewBtns button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
}

function buildMenu() {
  const seg = $('segLevel');
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.textContent = lv.name;
    b.onclick = () => { prefs.level = i; savePrefs(); syncMenu(); };
    seg.appendChild(b);
  });
  $('segColor').querySelectorAll('button').forEach((b) => {
    b.onclick = () => { prefs.color = b.dataset.c; savePrefs(); syncMenu(); };
  });
  const back = document.createElement('button');
  back.id = 'btnBack'; back.className = 'btn go'; back.style.display = 'none'; back.style.marginTop = '10px';
  back.textContent = '진행 중인 판으로 돌아가기';
  back.onclick = () => { $('menu').classList.remove('show'); stage.controls.autoRotate = false; };
  $('menu').querySelector('.card').appendChild(back);
  syncMenu();
}
function syncMenu() {
  [...$('segLevel').children].forEach((b, i) => b.classList.toggle('on', i === prefs.level));
  $('segColor').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === prefs.color));
  $('levelDesc').textContent = LEVELS[prefs.level].desc;
}

// ───────────────────────── 입력 ─────────────────────────
function bindInput() {
  const el = stage.renderer.domElement;
  let down = null;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; sound.ensure(); });
  el.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (moved < 7 && dt < 600) onSquare(stage.pick(e.clientX, e.clientY));
  });
  let last = 0;
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const now = performance.now();
    if (now - last < 70 || (e.buttons & 1)) return;
    last = now;
    if (!G.started || G.over || G.busy || G.thinking || G.pos.turn !== G.human) { stage.setHover(-1); el.style.cursor = ''; return; }
    const sq = stage.pick(e.clientX, e.clientY);
    const pc = sq >= 0 ? G.pos.board[sq] : 0;
    const clickable = sq >= 0 && ((pc && (pc >> 3) === G.human) || G.targets.some((t) => t.sq === sq));
    stage.setHover(clickable ? sq : -1);
    el.style.cursor = clickable ? 'pointer' : '';
  });
  el.addEventListener('pointerleave', () => stage.setHover(-1));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSelection();
    else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
  });
}

// ───────────────────────── 시작 ─────────────────────────
async function boot() {
  const loadText = $('loadText');
  try {
    sound = new Sound(); sound.on = prefs.sound;
    stage = new Stage($('stage'));
    await stage.init((t) => { loadText.textContent = t; });
    ai = new AI();
  } catch (err) {
    console.error(err);
    $('fatal').style.display = 'block';
    $('fatal').textContent = '이 브라우저에서는 3D 그래픽을 시작할 수 없어요. 최신 크롬·엣지·사파리에서 열어 주세요.';
    loadText.textContent = '';
    return;
  }
  buildMenu(); bindInput();
  $('swSound').setAttribute('aria-pressed', String(sound.on));
  $('swSound').onclick = () => {
    sound.on = !sound.on; prefs.sound = sound.on; savePrefs();
    $('swSound').setAttribute('aria-pressed', String(sound.on));
    if (sound.on) sound.move();
  };
  document.querySelectorAll('#viewBtns button').forEach((b) => {
    b.onclick = () => { stage.setView(b.dataset.view); markView(b.dataset.view); };
  });
  $('btnStart').onclick = () => { sound.ensure(); startGame(); };
  $('btnNew').onclick = openMenu;
  $('btnUndo').onclick = undo;
  $('btnHint').onclick = hint;
  $('btnResign').onclick = resign;
  $('resAgain').onclick = () => { $('result').classList.remove('show'); clearFx(); openMenu(); };
  $('resView').onclick = () => { $('result').classList.remove('show'); stage.fx.vignette(false); stage.controls.autoRotate = false; };
  stage.controls.autoRotate = true;
  stage.setPosition(new Position(), { intro: true });
  setStatus('난이도를 고르고 시작하세요');
  updateButtons();
  $('loading').classList.add('hide');
  window.__chess = { G, stage, ai, sound, applyMove, onSquare, startGame, prefs, Position, sqName };
}
boot();
