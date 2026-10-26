// Synced storage: one Firestore document per household, changed only through transactions,
// so two phones acting at once never overwrite each other.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, onSnapshot, runTransaction, setDoc, getDoc, updateDoc,
} from 'firebase/firestore';
import { randomId } from '../game/rules.js';

export function createFirebaseStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }
  let uid = null;
  const ref = (id) => doc(db, 'households', id);

  return {
    mode: 'firebase',
    async init() {
      uid = await new Promise((resolve, reject) => {
        const stop = onAuthStateChanged(auth, (user) => {
          if (user) { stop(); resolve(user.uid); }
        }, reject);
        signInAnonymously(auth).catch((e) => { stop(); reject(e); });
      });
      return uid;
    },
    async create(state) {
      const id = randomId(10);
      await setDoc(ref(id), { ...state, devices: { [uid]: true } });
      return id;
    },
    async join(id) {
      const snap = await getDoc(ref(id));
      if (!snap.exists()) throw new Error('No guild found with that code. Check it and try again.');
      if (!snap.data().devices?.[uid]) await updateDoc(ref(id), { [`devices.${uid}`]: true });
      return id;
    },
    async exists(id) {
      try { const snap = await getDoc(ref(id)); return snap.exists() && !!snap.data().devices?.[uid]; } catch { return false; }
    },
    subscribe(id, cb, onError) {
      return onSnapshot(ref(id), (snap) => (snap.exists() ? cb(snap.data()) : onError?.(new Error('missing'))), onError);
    },
    async run(id, fn) {
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref(id));
        if (!snap.exists()) throw new Error('This guild no longer exists.');
        const s = snap.data();
        const next = fn(s);
        if (next !== s) tx.set(ref(id), next);
        return next;
      });
    },
  };
}
