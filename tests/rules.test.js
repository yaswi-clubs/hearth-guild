import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const R = await import('../src/game/rules.js');
const { actions, newHousehold, maxHP, dealt, hpLeft, choreList, memberList, needsRollover, weekId, GameError } = R;

const wed = new Date(2026, 9, 28, 12); // Wednesday 28 Oct 2026
const sun = new Date(2026, 10, 1, 19); // Sunday 1 Nov 2026
const nextMon = new Date(2026, 10, 2, 8);

function fresh() {
  return newHousehold({
    name: 'Test Guild', date: wed,
    members: [{ name: 'Ann', role: 'adult' }, { name: 'Ben', role: 'adult' }, { name: 'Cat', role: 'kid' }],
    chores: [{ title: 'Bins', pts: 2, times: 1, drop: 'wood' }, { title: 'Dishes', pts: 3, times: 2, drop: 'stone' }],
  });
}
const ids = (s) => memberList(s).map((m) => m.id);

test('week ids follow ISO weeks (Monday start)', () => {
  assert.equal(weekId(new Date(2026, 9, 26)), '2026-W44'); // Monday
  assert.equal(weekId(new Date(2026, 10, 1)), '2026-W44'); // Sunday
  assert.equal(weekId(new Date(2026, 10, 2)), '2026-W45'); // next Monday
  assert.equal(weekId(new Date(2027, 0, 1)), '2026-W53');
});

test('new household sets HP from quests', () => {
  const s = fresh();
  assert.equal(memberList(s).length, 3);
  assert.equal(maxHP(s), 2 * 10 + 3 * 10 * 2);
  assert.equal(s.buildings.hall.built, true);
  assert.equal(s.buildings.bakery.built, false);
});

test('needs a name and two members', () => {
  assert.throws(() => newHousehold({ name: '', members: [{ name: 'A' }, { name: 'B' }] }), GameError);
  assert.throws(() => newHousehold({ name: 'X', members: [{ name: 'A' }] }), GameError);
});

test('attack is pending until a different member approves', () => {
  let s = fresh();
  const [ann, ben] = ids(s);
  const bins = choreList(s).find((c) => c.title === 'Bins');
  s = actions.markDone(s, { choreId: bins.id, memberId: ann });
  assert.equal(dealt(s), 0);
  const hitId = Object.keys(s.week.hits)[0];
  assert.throws(() => actions.approve(s, { hitId, approverId: ann }), /teammate/);
  const wood = s.res.wood;
  s = actions.approve(s, { hitId, approverId: ben });
  assert.equal(dealt(s), 20);
  assert.equal(s.res.wood, wood + R.dropFor(2));
  assert.throws(() => actions.markDone(s, { choreId: bins.id, memberId: ann }), /already finished/);
});

test('repeating quests can be hit up to their weekly count', () => {
  let s = fresh();
  const [ann] = ids(s);
  const d = choreList(s).find((c) => c.title === 'Dishes');
  s = actions.markDone(s, { choreId: d.id, memberId: ann });
  s = actions.markDone(s, { choreId: d.id, memberId: ann });
  assert.throws(() => actions.markDone(s, { choreId: d.id, memberId: ann }), GameError);
});

test('building costs resources and refuses when short', () => {
  let s = fresh();
  s = actions.build(s, { buildingId: 'bakery' }); // costs wood 6 stone 4; start 7/5
  assert.equal(s.buildings.bakery.built, true);
  assert.deepEqual([s.res.wood, s.res.stone], [1, 1]);
  assert.throws(() => actions.build(s, { buildingId: 'market' }), /Not enough/);
});

test('winning the week gives loot; losing burns the garden but never houses', () => {
  let s = fresh();
  const [ann, ben] = ids(s);
  for (const c of choreList(s)) for (let k = 0; k < c.times; k++) {
    s = actions.markDone(s, { choreId: c.id, memberId: ann });
    const h = Object.entries(s.week.hits).find(([, x]) => x.state === 'pending')[0];
    s = actions.approve(s, { hitId: h, approverId: ben });
  }
  assert.equal(hpLeft(s), 0);
  const gold = s.res.gold;
  const won = actions.endWeek(s, { date: sun });
  assert.equal(won.lastResult.won, true);
  assert.equal(won.res.gold, gold + R.WIN_LOOT.gold);
  assert.equal(won.week.bossIndex, 1);
  assert.equal(Object.keys(won.week.hits).length, 0);
  assert.equal(won.week.id, '2026-W45', 'ended on Sunday: the new boss belongs to next week');
  assert.equal(needsRollover(won, nextMon), false, 'Monday must not close the brand-new boss');

  const lost = actions.endWeek(fresh(), { date: sun });
  assert.equal(lost.lastResult.won, false);
  assert.equal(lost.buildings.garden.burnt, true);
  assert.deepEqual(lost.houses, fresh().houses === undefined ? lost.houses : lost.houses);
  const again = actions.endWeek(lost, { date: sun });
  assert.equal(again.lastResult.burned, null, 'nothing else to burn');
});

test('a week left open rolls over when the calendar moves on', () => {
  const s = fresh();
  assert.equal(needsRollover(s, wed), false);
  assert.equal(needsRollover(s, nextMon), true);
  const r = actions.endWeek(s, { date: nextMon });
  assert.equal(r.week.id, '2026-W45');
  assert.equal(needsRollover(r, nextMon), false);
});

test('ending mid-week starts a fresh boss in the same week', () => {
  const r = actions.endWeek(fresh(), { date: wed });
  assert.match(r.week.id, /^2026-W44\+1$/);
  assert.equal(needsRollover(r, wed), false);
  assert.equal(needsRollover(r, nextMon), true);
});

test('one-off quests disappear once done; others carry over', () => {
  let s = fresh();
  const [ann, ben] = ids(s);
  s = actions.addChore(s, { chore: { title: 'Fix the shelf', pts: 5, times: 1, drop: 'gold', oneOff: true } });
  const shelf = choreList(s).find((c) => c.title === 'Fix the shelf');
  s = actions.markDone(s, { choreId: shelf.id, memberId: ann });
  s = actions.approve(s, { hitId: Object.keys(s.week.hits)[0], approverId: ben });
  const r = actions.endWeek(s, { date: sun });
  assert.equal(choreList(r).some((c) => c.title === 'Fix the shelf'), false);
  assert.equal(choreList(r).length, 2);
});

test('state stays JSON-safe for Firestore (no undefined values)', () => {
  let s = fresh();
  const [ann, ben] = ids(s);
  const c = choreList(s)[0];
  s = actions.markDone(s, { choreId: c.id, memberId: ann });
  s = actions.approve(s, { hitId: Object.keys(s.week.hits)[0], approverId: ben });
  s = actions.endWeek(s, { date: sun });
  const walk = (v, path) => {
    assert.notEqual(v, undefined, `undefined at ${path}`);
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(s, 'state');
});
