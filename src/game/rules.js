// Pure game rules. Every action takes the household state and returns a new state
// (or throws a GameError with a message for the player). Storage layers run these
// inside a transaction, so the same logic works on one device or synced via Firebase.

export class GameError extends Error {}

export const RESOURCES = ['wood', 'stone', 'gold'];
export const MEMBER_COLOURS = ['#e0603f', '#3f7fd1', '#b04fb8', '#2f9e8f', '#d99a1e', '#6b8f2f'];
export const MAX_MEMBERS = 6;

export const BOSSES = [
  { name: 'The Dust Wyrm', body: '#9b8fb8', belly: '#c9c0de', eye: '#ff7a3d' },
  { name: 'The Laundry Hydra', body: '#6fa8d6', belly: '#b9dcf5', eye: '#f5c542' },
  { name: 'The Clutter Golem', body: '#b8946a', belly: '#e0c49a', eye: '#7ff0c0' },
  { name: 'The Crumb Kraken', body: '#d98a7a', belly: '#f3c6b8', eye: '#5fb85a' },
  { name: 'The Sock Goblin', body: '#8fbf6a', belly: '#cfe8b8', eye: '#d9483b' },
  { name: 'The Paperwork Phantom', body: '#a7b0c4', belly: '#e1e6f0', eye: '#3f6fb5' },
];
export const bossFor = (i) => BOSSES[((i % BOSSES.length) + BOSSES.length) % BOSSES.length];

// Guild buildings on the 7x7 village grid. Houses are placed from HOUSE_SLOTS by member order.
export const BUILDINGS = [
  { id: 'tower', type: 'tower', i: 1, j: 0, name: 'Watchtower', desc: 'Keeps watch for next week’s boss.', cost: { stone: 8, gold: 3 } },
  { id: 'library', type: 'library', i: 3, j: 1, name: 'Library', desc: 'Where the guild’s stories are kept.', cost: { wood: 4, stone: 6, gold: 4 } },
  { id: 'bakery', type: 'bakery', i: 5, j: 1, name: 'Bakery', desc: 'Smells of Sunday victories.', cost: { wood: 6, stone: 4 } },
  { id: 'hall', type: 'hall', i: 3, j: 3, name: 'Guild Hall', desc: 'Your guild’s home. Upgrade it to show off.', start: true },
  { id: 'market', type: 'market', i: 5, j: 3, name: 'Market', desc: 'Busy stalls for a busy guild.', cost: { wood: 6, stone: 4, gold: 6 } },
  { id: 'well', type: 'well', i: 2, j: 5, name: 'Well', desc: 'The first thing every village needs.', start: true },
  { id: 'garden', type: 'garden', i: 4, j: 5, name: 'Flower garden', desc: 'A decoration. If a boss escapes, it burns this first.', start: true, deco: true },
];
export const HOUSE_SLOTS = [[1, 2], [1, 4], [5, 5], [3, 6], [6, 4], [0, 4]];
export const SCENERY = [
  ['pond', 4, 3], ['tree', 0, 0], ['tree', 0, 3], ['tree', 0, 5], ['tree', 6, 0], ['tree', 6, 2],
  ['tree', 1, 6], ['tree', 6, 6], ['tree', 2, 0], ['tree', 6, 4], ['tree', 0, 1], ['tree', 0, 4],
];

export const WIN_LOOT = { gold: 6, wood: 5, stone: 5 };
export const REPLANT_COST = { wood: 3, gold: 2 };
export const houseUpgradeCost = (lvl) => ({ wood: 3 * lvl, stone: 2 * lvl });
export const hallUpgradeCost = (lvl) => ({ wood: 8 * lvl, stone: 8 * lvl, gold: 5 * lvl });
export const MAX_LEVEL = 3;
export const dropFor = (pts) => Math.ceil(pts / 2) + 1;

// ---------- dates ----------
// ISO week id like "2026-W44"; weeks start on Monday.
export function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
export const dayIndex = (date = new Date()) => (date.getDay() + 6) % 7; // Monday = 0
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---------- ids ----------
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomId(n = 10) {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHA[b % ALPHA.length]).join('');
}
export const formatCode = (id) => id.replace(/(.{4})(?=.)/g, '$1-');
export const parseCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------- derived values ----------
export const choreList = (s) => Object.entries(s.chores || {}).map(([id, c]) => ({ id, ...c })).sort((a, b) => (a.created || 0) - (b.created || 0));
export const hitList = (s) => Object.entries(s.week?.hits || {}).map(([id, h]) => ({ id, ...h })).sort((a, b) => a.at - b.at);
export const memberList = (s) => (s.memberOrder || []).filter((id) => s.members?.[id]).map((id) => ({ id, ...s.members[id] }));

export const maxHP = (s) => choreList(s).reduce((t, c) => t + c.pts * 10 * c.times, 0);
export const dealt = (s) => hitList(s).filter((h) => h.state === 'done').reduce((t, h) => t + h.dmg, 0);
export const hpLeft = (s) => Math.max(0, maxHP(s) - dealt(s));
export const hitsFor = (s, choreId) => hitList(s).filter((h) => h.choreId === choreId);
export const remaining = (s, chore) => chore.times - hitsFor(s, chore.id).length;

export const canAfford = (res, cost) => Object.entries(cost).every(([k, v]) => (res?.[k] || 0) >= v);
function pay(res, cost) {
  if (!canAfford(res, cost)) throw new GameError('Not enough resources yet.');
  const out = { ...res };
  for (const [k, v] of Object.entries(cost)) out[k] -= v;
  return out;
}
const add = (res, gain) => {
  const out = { ...res };
  for (const [k, v] of Object.entries(gain)) out[k] = (out[k] || 0) + v;
  return out;
};

// ---------- creation ----------
export const STARTER_CHORES = [
  { title: 'Empty the dishwasher', pts: 3, times: 5, drop: 'wood' },
  { title: 'Take the bins out', pts: 2, times: 1, drop: 'wood' },
  { title: 'Hoover the living room', pts: 5, times: 1, drop: 'stone' },
  { title: 'Tidy bedroom', pts: 4, times: 2, drop: 'stone' },
  { title: 'Clean the bathroom', pts: 8, times: 1, drop: 'stone' },
  { title: 'Homework done before dinner', pts: 4, times: 4, drop: 'gold' },
  { title: 'Weekly food shop', pts: 6, times: 1, drop: 'gold' },
  { title: 'Pay a bill or do life admin', pts: 4, times: 1, drop: 'gold' },
];

export function newHousehold({ name, members, chores, now = Date.now(), date = new Date(), deviceUid }) {
  if (!name?.trim()) throw new GameError('Give your guild a name.');
  const clean = (members || []).filter((m) => m.name?.trim()).slice(0, MAX_MEMBERS);
  if (clean.length < 2) throw new GameError('A guild needs at least two members.');
  const memberMap = {}, order = [];
  clean.forEach((m, k) => {
    const id = randomId(6);
    memberMap[id] = { name: m.name.trim().slice(0, 20), color: m.color || MEMBER_COLOURS[k % MEMBER_COLOURS.length], role: m.role === 'kid' ? 'kid' : 'adult', pinHash: null };
    order.push(id);
  });
  const choreMap = {};
  (chores || []).forEach((c, k) => {
    const v = validChore(c);
    choreMap[randomId(8)] = { ...v, created: now + k };
  });
  const buildings = {};
  BUILDINGS.forEach((b) => (buildings[b.id] = { built: !!b.start, lvl: 1, burnt: false }));
  const houses = {};
  order.forEach((id) => (houses[id] = 1));
  return {
    schema: 1,
    name: name.trim().slice(0, 30),
    createdAt: now,
    members: memberMap,
    memberOrder: order,
    chores: choreMap,
    res: { wood: 7, stone: 5, gold: 4 },
    buildings,
    houses,
    week: { id: weekId(date), bossIndex: 0, hits: {} },
    history: [],
    lastResult: null,
    devices: deviceUid ? { [deviceUid]: true } : {},
  };
}

export function validChore(c) {
  const title = String(c.title || '').trim().slice(0, 60);
  if (!title) throw new GameError('The quest needs a name.');
  const pts = Math.round(Number(c.pts));
  if (!(pts >= 1 && pts <= 8)) throw new GameError('Effort points go from 1 to 8.');
  const times = Math.round(Number(c.times || 1));
  if (!(times >= 1 && times <= 7)) throw new GameError('A quest can repeat 1 to 7 times a week.');
  const drop = RESOURCES.includes(c.drop) ? c.drop : 'wood';
  return { title, pts, times, drop, memberId: c.memberId || null, oneOff: !!c.oneOff };
}

// ---------- actions (all pure: (state, args) -> new state) ----------
export const actions = {
  addChore(s, { chore, now = Date.now() }) {
    const id = randomId(8);
    return { ...s, chores: { ...s.chores, [id]: { ...validChore(chore), created: now } } };
  },
  updateChore(s, { id, chore }) {
    if (!s.chores[id]) throw new GameError('That quest no longer exists.');
    const v = validChore({ ...s.chores[id], ...chore });
    if (v.times < hitsFor(s, id).length) throw new GameError('It has already been done more times than that this week.');
    return { ...s, chores: { ...s.chores, [id]: { ...s.chores[id], ...v } } };
  },
  deleteChore(s, { id }) {
    const chores = { ...s.chores };
    delete chores[id];
    const hits = Object.fromEntries(Object.entries(s.week.hits).filter(([, h]) => h.choreId !== id || h.state === 'done'));
    return { ...s, chores, week: { ...s.week, hits } };
  },
  markDone(s, { choreId, memberId, now = Date.now() }) {
    const c = s.chores[choreId];
    if (!c) throw new GameError('That quest no longer exists.');
    if (!s.members[memberId]) throw new GameError('Pick who is playing first.');
    if (remaining(s, { id: choreId, ...c }) <= 0) throw new GameError('That quest is already finished for this week.');
    const id = randomId(8);
    const hit = { choreId, memberId, dmg: c.pts * 10, drop: c.drop, gain: dropFor(c.pts), state: 'pending', at: now };
    return { ...s, week: { ...s.week, hits: { ...s.week.hits, [id]: hit } } };
  },
  undoHit(s, { hitId, memberId }) {
    const h = s.week.hits[hitId];
    if (!h || h.state !== 'pending') throw new GameError('Only a quest waiting for a check can be taken back.');
    if (h.memberId !== memberId) throw new GameError('Only the person who did it can take it back.');
    const hits = { ...s.week.hits };
    delete hits[hitId];
    return { ...s, week: { ...s.week, hits } };
  },
  approve(s, { hitId, approverId, now = Date.now() }) {
    const h = s.week.hits[hitId];
    if (!h) throw new GameError('That quest no longer exists.');
    if (h.state === 'done') return s;
    if (h.memberId === approverId) throw new GameError('A teammate has to check your quest, not you.');
    if (!s.members[approverId]) throw new GameError('Pick who is playing first.');
    const hit = { ...h, state: 'done', approvedBy: approverId, approvedAt: now };
    return { ...s, res: add(s.res, { [h.drop]: h.gain }), week: { ...s.week, hits: { ...s.week.hits, [hitId]: hit } } };
  },
  build(s, { buildingId }) {
    const def = BUILDINGS.find((b) => b.id === buildingId);
    const b = s.buildings[buildingId];
    if (!def || !b || b.built) throw new GameError('That plot is already built.');
    return { ...s, res: pay(s.res, def.cost), buildings: { ...s.buildings, [buildingId]: { ...b, built: true } } };
  },
  upgradeHall(s) {
    const b = s.buildings.hall;
    if (b.lvl >= MAX_LEVEL) throw new GameError('The Guild Hall is fully upgraded.');
    return { ...s, res: pay(s.res, hallUpgradeCost(b.lvl)), buildings: { ...s.buildings, hall: { ...b, lvl: b.lvl + 1 } } };
  },
  upgradeHouse(s, { memberId }) {
    const lvl = s.houses[memberId] || 1;
    if (lvl >= MAX_LEVEL) throw new GameError('That house is fully upgraded.');
    return { ...s, res: pay(s.res, houseUpgradeCost(lvl)), houses: { ...s.houses, [memberId]: lvl + 1 } };
  },
  replant(s, { buildingId }) {
    const b = s.buildings[buildingId];
    if (!b?.burnt) return s;
    return { ...s, res: pay(s.res, REPLANT_COST), buildings: { ...s.buildings, [buildingId]: { ...b, burnt: false } } };
  },
  addMember(s, { member }) {
    if (s.memberOrder.length >= MAX_MEMBERS) throw new GameError(`A guild can have up to ${MAX_MEMBERS} members.`);
    const name = String(member.name || '').trim().slice(0, 20);
    if (!name) throw new GameError('Give the new member a name.');
    const id = randomId(6);
    const color = member.color || MEMBER_COLOURS.find((c) => !Object.values(s.members).some((m) => m.color === c)) || MEMBER_COLOURS[0];
    return {
      ...s,
      members: { ...s.members, [id]: { name, color, role: member.role === 'kid' ? 'kid' : 'adult', pinHash: null } },
      memberOrder: [...s.memberOrder, id],
      houses: { ...s.houses, [id]: 1 },
    };
  },
  updateMember(s, { id, patch }) {
    const m = s.members[id];
    if (!m) throw new GameError('That member no longer exists.');
    const next = { ...m };
    if (patch.name !== undefined) {
      const name = String(patch.name).trim().slice(0, 20);
      if (!name) throw new GameError('Names cannot be empty.');
      next.name = name;
    }
    if (patch.color) next.color = patch.color;
    if (patch.role) next.role = patch.role === 'kid' ? 'kid' : 'adult';
    if (patch.pinHash !== undefined) next.pinHash = patch.pinHash;
    return { ...s, members: { ...s.members, [id]: next } };
  },
  // Close the current week: count damage, give loot or burn a decoration, start the next boss.
  endWeek(s, { now = Date.now(), date = new Date() } = {}) {
    const hp = maxHP(s), d = Math.min(dealt(s), hp);
    const won = hp > 0 && d >= hp;
    const hits = hitList(s);
    const doneHits = hits.filter((h) => h.state === 'done');
    const perMember = {};
    doneHits.forEach((h) => (perMember[h.memberId] = (perMember[h.memberId] || 0) + h.dmg));
    let res = s.res, buildings = s.buildings, burned = null;
    if (won) res = add(res, WIN_LOOT);
    else {
      const target = BUILDINGS.find((b) => b.deco && s.buildings[b.id]?.built && !s.buildings[b.id]?.burnt);
      if (target) {
        burned = target.id;
        buildings = { ...buildings, [target.id]: { ...buildings[target.id], burnt: true } };
      }
    }
    const result = {
      weekId: s.week.id, bossIndex: s.week.bossIndex, bossName: bossFor(s.week.bossIndex).name,
      hp, dealt: d, won, burned, choresPlanned: choreList(s).reduce((t, c) => t + c.times, 0),
      choresDone: doneHits.length, pendingDropped: hits.length - doneHits.length, perMember, endedAt: now,
    };
    // One-off quests that were completed disappear; everything else carries into the new week.
    const chores = Object.fromEntries(choreList(s)
      .filter((c) => !(c.oneOff && doneHits.filter((h) => h.choreId === c.id).length >= c.times))
      .map(({ id, ...c }) => [id, c]));
    // Ended at the weekend: the new boss belongs to next calendar week, so Monday doesn't close it again.
    // Ended mid-week (e.g. testing): a fresh boss for the rest of this week.
    let nextId;
    if (weekId(date) !== String(s.week.id).split('+')[0]) nextId = weekId(date);
    else if (dayIndex(date) >= 5) nextId = weekId(new Date(date.getTime() + 3 * 86400000));
    else nextId = `${weekId(date)}+${(s.history?.length || 0) + 1}`;
    return {
      ...s, res, buildings, chores,
      history: [...(s.history || []), result].slice(-52),
      lastResult: result,
      week: { id: nextId, bossIndex: s.week.bossIndex + 1, hits: {} },
    };
  },
};

// A week that has passed on the calendar closes automatically when anyone next opens the app.
export function needsRollover(s, date = new Date()) {
  const base = String(s.week?.id || '').split('+')[0];
  return base !== weekId(date) && base < weekId(date);
}

export async function hashPin(pin) {
  const data = new TextEncoder().encode(`hearth-guild:${pin}`);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
