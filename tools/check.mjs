// 全データの検査：node tools/check.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const ctx = { module: { exports: {} } };
vm.createContext(ctx);
for (const f of ['cards.js', 'questions.js', 'core.js']) vm.runInContext(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
const { ERAS, CARDS, CARD, ERA, QUESTIONS, GENERATED, ALL, POOLS, ON_THIS_DAY, questionFor, isFixed, addDays, LAUNCH } = ctx.module.exports;

const errors = [];
const err = m => errors.push(m);

// カード
const ids = new Set();
for (const c of CARDS) {
  if (ids.has(c.id)) err(`カードidが重複: ${c.id}`); ids.add(c.id);
  if (!ERA.has(c.e)) err(`カード ${c.id}: 時代 ${c.e} がない`);
  if (typeof c.y !== 'number') err(`カード ${c.id}: y が数でない`);
  if (isFixed(c) && Number(c.yl.replace('年', '')) !== c.y) err(`カード ${c.id}: yl と y が合わない`);
  for (const r of c.r) if (!CARD.has(r)) err(`カード ${c.id}: つながるカード ${r} がない`);
  if (c.r.includes(c.id)) err(`カード ${c.id}: 自分自身につながっている`);
}
for (const [mmdd, list] of Object.entries(ON_THIS_DAY)) for (const o of list) if (!CARD.has(o.c)) err(`きょうは何の日 ${mmdd}: カード ${o.c} がない`);

// 問題
const qids = new Set();
for (const q of ALL) {
  const where = `問題 ${q.id}`;
  if (qids.has(q.id)) err(`問題idが重複: ${q.id}`); qids.add(q.id);
  if (!ERA.has(q.e)) err(`${where}: 時代 ${q.e} がない`);
  if (![1, 2].includes(q.lv)) err(`${where}: lv が 1 か 2 でない`);
  if (q.c.length < 2 || q.c.length > 4) err(`${where}: 選択肢の数が ${q.c.length}`);
  if (new Set(q.c).size !== q.c.length) err(`${where}: 同じ選択肢がある`);
  if (!(q.a >= 0 && q.a < q.c.length)) err(`${where}: 正解の番号がおかしい`);
  if (q.n && q.n.length !== q.c.length) err(`${where}: n の数が選択肢と合わない`);
  if (!q.x) err(`${where}: 解説がない`);
  if (!q.r || q.r.length === 0) err(`${where}: つながる知識がない`);
  for (const r of q.r) if (!CARD.has(r)) err(`${where}: カード ${r} がない`);
}
// 自動の問題：答えが本当に1つに決まるか
for (const q of GENERATED) {
  if (q.id.startsWith('g-old-')) {
    const ys = q.r.map(id => CARD.get(id).y);
    if (Math.min(...ys.slice(1)) <= ys[0]) err(`${q.id}: いちばん古いものが1つに決まらない`);
  }
  if (q.id.startsWith('g-year-')) {
    const y = CARD.get(q.r[0]).y;
    if (q.r.slice(1).some(id => CARD.get(id).y === y)) err(`${q.id}: 同じ年のできごとが選択肢にある`);
  }
}

// 2年分のスケジュール
const start = new Date(LAUNCH[0], LAUNCH[1] - 1, LAUNCH[2]);
const seen = { easy: new Map(), hard: new Map() };
for (let i = 0; i < 730; i++) {
  const d = addDays(start, i);
  for (const slot of ['easy', 'hard']) {
    const q = questionFor(d, slot);
    if (!q) { err(`${i}日目 ${slot}: 問題がない`); continue; }
    if ((slot === 'easy') !== (q.lv === 1)) err(`${i}日目 ${slot}: むずかしさが合わない (${q.id})`);
    const last = seen[slot].get(q.id);
    if (last !== undefined && i - last < 60) err(`${i}日目 ${slot}: ${q.id} が ${i - last} 日ぶりにまた出る`);
    seen[slot].set(q.id, i);
  }
}

const count = (list, kind) => list.filter(q => q.id.startsWith(kind)).length;
console.log(`時代 ${ERAS.length} / カード ${CARDS.length}（年がはっきりしたもの ${CARDS.filter(isFixed).length}）`);
console.log(`手作り やさしい ${POOLS.easyHand.length} / むずかしい ${POOLS.hardHand.length}`);
console.log(`自動   やさしい ${POOLS.easyGen.length}（時代あて ${count(GENERATED, 'g-era-')}・人物 ${count(GENERATED, 'g-who-')}） / むずかしい ${POOLS.hardGen.length}（○年 ${count(GENERATED, 'g-year-')}・いちばん古い ${count(GENERATED, 'g-old-')}）`);
console.log(`2年分（730日）の出題で使われる問題：やさしい ${seen.easy.size} / むずかしい ${seen.hard.size}`);
if (errors.length) { console.log(`\n${errors.length} 件の問題があります`); for (const e of errors) console.log(' - ' + e); process.exit(1); }
console.log('\nOK');
