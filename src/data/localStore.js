// Single-device storage: the whole household lives in this browser's localStorage.
import { randomId } from '../game/rules.js';

const key = (id) => `hg:household:${id}`;

export function createLocalStore() {
  const listeners = new Map();
  const read = (id) => {
    try { const raw = localStorage.getItem(key(id)); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  const write = (id, s) => {
    localStorage.setItem(key(id), JSON.stringify(s));
    (listeners.get(id) || []).forEach((cb) => cb(s));
  };
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith('hg:household:')) return;
    const id = e.key.slice('hg:household:'.length);
    const s = read(id);
    if (s) (listeners.get(id) || []).forEach((cb) => cb(s));
  });
  return {
    mode: 'local',
    async init() { return 'this-device'; },
    async create(state) { const id = randomId(10); write(id, state); return id; },
    async join() { throw new Error('Joining needs the synced version. Add your Firebase config to share across phones.'); },
    async exists(id) { return !!read(id); },
    subscribe(id, cb, onError) {
      const s = read(id);
      if (!s) { onError?.(new Error('missing')); return () => {}; }
      const arr = listeners.get(id) || []; arr.push(cb); listeners.set(id, arr);
      queueMicrotask(() => cb(s));
      return () => listeners.set(id, (listeners.get(id) || []).filter((f) => f !== cb));
    },
    async run(id, fn) {
      const s = read(id);
      if (!s) throw new Error('This guild is not on this device.');
      const next = fn(s);
      if (next !== s) write(id, next);
      return next;
    },
  };
}
