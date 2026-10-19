'use strict';
// 画面に関係しないしくみ：日付、自動で作る問題、出題スケジュール。
// index.html と tools/check.mjs の両方から読みこむ（cards.js・questions.js の後に読むこと）。

// ---------------------------------------------------------------------------
// 日付（端末の現地時刻で日付を区切る）
// ---------------------------------------------------------------------------
const LAUNCH = [2026, 10, 19]; // 第1日
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNum = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(LAUNCH[0], LAUNCH[1] - 1, LAUNCH[2])) / 86400000);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

// ---------------------------------------------------------------------------
// 乱数（種を決めると毎回同じ結果になる）
// ---------------------------------------------------------------------------
function rng(seed) {
  let x = (seed >>> 0) || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const ERA = new Map(ERAS.map((e, i) => [e.id, { ...e, i }]));
const CARD = new Map(CARDS.map(c => [c.id, c]));
const isFixed = c => /^\d+年$/.test(c.yl);       // 年がはっきりしているカード
const eraName = id => ERA.get(id).name;

// ---------------------------------------------------------------------------
// 自動で作る問題（知識カードから作る。答えはカードのデータで決まる）
//   どの問題も、選択肢に出てきたカードの説明を解説に並べるので、まちがえた選択肢からも学べる
// ---------------------------------------------------------------------------
function byYear(a, b) { return a.y - b.y; }

// やさしい：「○○」は何時代？
function eraQuestion(c) {
  const i = ERA.get(c.e).i;
  // となりの時代ほど選ばれやすく、まぎらわしくする
  const rnd = rng(hash('era' + c.id));
  const near = ERAS.filter(e => e.id !== c.e).map(e => ({ e, d: Math.abs(ERA.get(e.id).i - i) + rnd() * 2.5 }))
    .sort((a, b) => a.d - b.d).slice(0, 3).map(o => o.e.id);
  const ids = [c.e, ...near];
  return {
    id: 'g-era-' + c.id, lv: 1, e: c.e, kind: '時代あて',
    q: `「<b>${c.t}</b>」は、何時代のできごと・ものでしょう？`,
    c: ids.map(eraName), a: 0,
    x: `<b>${c.t}</b>は<b>${eraName(c.e)}</b>（${ERA.get(c.e).span}）。${c.d}`,
    n: ids.map((id, k) => k === 0 ? '' : `${eraName(id)}は${ERA.get(id).span}。`),
    r: [c.id, ...c.r.slice(0, 2)],
  };
}

// やさしい：「○○」と関係の深い人物は？
function whoQuestion(c) {
  const i = ERA.get(c.e).i;
  const names = new Set(c.w.split('・'));
  const text = c.t + c.d;
  const rnd = rng(hash('who' + c.id));
  // 時代のちかい人物ほど選ばれやすくする（同じ時代の人物は、関係があるかもしれないので使わない）
  const pool = CARDS.filter(o => o.w && o.e !== c.e && Math.abs(ERA.get(o.e).i - i) <= 3 &&
    !o.w.split('・').some(n => names.has(n) || text.includes(n)))
    .map(o => ({ o, d: Math.abs(ERA.get(o.e).i - i) + rnd() * 2 })).sort((a, b) => a.d - b.d).map(p => p.o);
  const picked = [];
  for (const o of pool) {
    if (picked.some(p => p.w === o.w)) continue;
    picked.push(o); if (picked.length === 3) break;
  }
  if (picked.length < 3) return null;
  return {
    id: 'g-who-' + c.id, lv: 1, e: c.e, kind: '人物',
    q: `「<b>${c.t}</b>」と、最も関係の深い人物は？`,
    c: [c.w, ...picked.map(o => o.w)], a: 0,
    x: `<b>${c.w}</b>。${c.d}`,
    n: ['', ...picked.map(o => `${o.w}：${o.t}（${o.yl}・${eraName(o.e)}）`)],
    r: [c.id, ...picked.map(o => o.id)],
  };
}

// むずかしい：いちばん古いのは？（年がはっきりしたカード4枚）
function oldestQuestion(seed) {
  const fixed = CARDS.filter(isFixed);
  const rnd = rng(seed);
  for (let tries = 0; tries < 50; tries++) {
    const base = fixed[Math.floor(rnd() * fixed.length)];
    const range = base.y < 1600 ? 200 : base.y < 1868 ? 120 : 50;
    const near = shuffle(fixed.filter(o => o !== base && Math.abs(o.y - base.y) <= range), rnd);
    const pick = [base];
    for (const o of near) {
      if (pick.some(p => Math.abs(p.y - o.y) < 2 || p.e === o.e && p.t === o.t)) continue;
      pick.push(o); if (pick.length === 4) break;
    }
    if (pick.length < 4) continue;
    const sorted = pick.slice().sort(byYear);
    return {
      id: 'g-old-' + sorted.map(p => p.id).join('-'), lv: 2, e: sorted[0].e, kind: '年代',
      q: 'つぎの4つのうち、<b>いちばん古い</b>できごとは？',
      c: sorted.map(p => p.t), a: 0,
      x: `古い順に並べると、${sorted.map(p => `<b>${p.t}</b>（${p.yl}）`).join(' → ')}。${sorted[0].d}`,
      n: sorted.map(p => `${p.yl}・${eraName(p.e)}`),
      r: sorted.map(p => p.id),
    };
  }
  return null;
}

// むずかしい：○○年のできごとは？
function yearQuestion(c) {
  const fixed = CARDS.filter(o => isFixed(o) && o.y !== c.y);
  const range = c.y < 1600 ? 150 : c.y < 1868 ? 80 : 40;
  const rnd = rng(hash('year' + c.id));
  const picked = [];
  for (const o of shuffle(fixed.filter(o => Math.abs(o.y - c.y) <= range), rnd)) {
    if (picked.some(p => p.y === o.y)) continue;
    picked.push(o); if (picked.length === 3) break;
  }
  if (picked.length < 3) return null;
  return {
    id: 'g-year-' + c.id, lv: 2, e: c.e, kind: '年代',
    q: `<b>${c.yl}</b>に起きたできごと（始まったこと）は？`,
    c: [c.t, ...picked.map(o => o.t)], a: 0,
    x: `${c.yl}は<b>${c.t}</b>。${c.d}`,
    n: ['', ...picked.map(o => `${o.yl}・${eraName(o.e)}`)],
    r: [c.id, ...picked.map(o => o.id)],
  };
}

// 同じ年にカードが2枚以上ある年は、「○○年のできごと」の答えが1つに決まらないので使わない
const YEAR_COUNT = CARDS.filter(isFixed).reduce((m, c) => m.set(c.y, (m.get(c.y) || 0) + 1), new Map());

// 名前に時代名が入っているカード（「縄文土器」「大仙古墳」など）は、時代あてにすると答えが見えてしまう
const ERA_WORDS = ['旧石器', '縄文', '弥生', '古墳', '飛鳥', '奈良', '平安', '鎌倉', '室町', '安土', '桃山', '江戸', '明治', '大正', '昭和', '平成', '令和'];
const GENERATED = [
  ...CARDS.filter(c => !c.x && !ERA_WORDS.some(w => c.t.includes(w))).map(eraQuestion),
  // 名前に人物名が入っているカード（「遣隋使（小野妹子）」など）は人物の問題にしない
  ...CARDS.filter(c => c.w && !c.w.split('・').some(n => c.t.includes(n))).map(whoQuestion),
  ...CARDS.filter(c => isFixed(c) && YEAR_COUNT.get(c.y) === 1).map(yearQuestion),
  ...Array.from({ length: 120 }, (_, k) => oldestQuestion(9001 + k * 7919)),
].filter(Boolean).filter((q, i, all) => all.findIndex(o => o.id === q.id) === i);

// ---------------------------------------------------------------------------
// 出題スケジュール
//   毎日「やさしい」と「むずかしい」の2問。どちらも手作りの問題と自動の問題を1日おきに出す。
//   それぞれのリストを種つきでまぜ、1周したら別の順番でもう1周する。
// ---------------------------------------------------------------------------
const ALL = [...QUESTIONS, ...GENERATED];
const BY_ID = new Map(ALL.map(q => [q.id, q]));
const POOLS = {
  easyHand: QUESTIONS.filter(q => q.lv === 1), easyGen: GENERATED.filter(q => q.lv === 1),
  hardHand: QUESTIONS.filter(q => q.lv === 2), hardGen: GENERATED.filter(q => q.lv === 2),
};
const orderCache = new Map();
const GAP = 30; // 周の変わり目でも、同じ問題は少なくともこの回数あけて出す
function orderOf(name, cycle) {
  const key = name + cycle;
  if (!orderCache.has(key)) {
    let order = shuffle(POOLS[name], rng(hash(key) + 17));
    if (cycle > 0) {
      const tail = new Set(orderOf(name, cycle - 1).slice(-GAP));
      const head = order.filter(q => !tail.has(q)).slice(0, GAP);
      order = [...head, ...order.filter(q => !head.includes(q))];
    }
    orderCache.set(key, order);
  }
  return orderCache.get(key);
}
function fromPool(name, idx) {
  const n = POOLS[name].length;
  return orderOf(name, Math.floor(idx / n))[((idx % n) + n) % n];
}
function questionFor(d, slot) {
  const n = dayNum(d), half = Math.floor(n / 2);
  const hand = (n % 2 === 0) === (slot === 'easy');   // やさしいが手作りの日は、むずかしいが自動
  return fromPool(slot + (hand ? 'Hand' : 'Gen'), half);
}

// 選択肢の並び順（問題ごとに決まった順番でまぜる）
function choiceOrder(q) {
  return shuffle(q.c.map((_, i) => i), rng(hash('order' + q.id)));
}

// 解いたときに「ずかん」に入るカード
function cardsOf(q) { return [...new Set(q.r)].filter(id => CARD.has(id)); }

if (typeof module !== 'undefined') module.exports = { ERAS, CARDS, CARD, ERA, QUESTIONS, GENERATED, ALL, BY_ID, POOLS, ON_THIS_DAY, questionFor, choiceOrder, cardsOf, isFixed, keyOf, addDays, dayNum, LAUNCH };
