import { firebaseConfig } from './firebaseConfig.js';
import { createLocalStore } from './localStore.js';

export async function createStore() {
  if (firebaseConfig && firebaseConfig.projectId) {
    const { createFirebaseStore } = await import('./firebaseStore.js');
    return createFirebaseStore(firebaseConfig);
  }
  return createLocalStore();
}
