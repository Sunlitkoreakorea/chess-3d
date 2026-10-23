// 난이도 프리셋 (화면과 AI 워커가 같이 쓴다)
export const LEVELS = [
  { name: '입문', desc: '가끔 기물을 그냥 줘요', maxDepth: 1, timeMs: 300, noise: 220, variety: 0 },
  { name: '초급', desc: '한두 수 앞만 봐요', maxDepth: 2, timeMs: 400, noise: 110, variety: 0 },
  { name: '중급', desc: '기본기는 탄탄해요', maxDepth: 3, timeMs: 600, noise: 40, variety: 25 },
  { name: '고급', desc: '전술에 강해요', maxDepth: 7, timeMs: 1500, noise: 0, variety: 20 },
  { name: '마스터', desc: '오래 깊게 생각해요', maxDepth: 14, timeMs: 4000, noise: 0, variety: 12 },
];
export const HINT_PARAMS = { maxDepth: 8, timeMs: 1400, noise: 0, variety: 0 };
