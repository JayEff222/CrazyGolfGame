import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

/*
 * These values are checked in deliberately.
 *
 * Firebase web config is public by design - the API key identifies the project,
 * it does not authorise anything, and it ships in the browser bundle of every
 * Firebase web app whether you commit it or not. Google's own guidance is that
 * it "does not need to be treated as a secret".
 *
 * What actually protects the data is firestore.rules. If you are looking for the
 * thing that must never be committed, it is a *service account* JSON key - that
 * one is a real secret and belongs nowhere near this repo.
 *
 * Keeping the config here rather than in .env means CI and deploys cannot break
 * from a missing environment variable.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyCIA_H3jxAtrVMRk8T6UdfTiNybT8jcFhA',
  authDomain: 'crazygolfgame.firebaseapp.com',
  projectId: 'crazygolfgame',
  storageBucket: 'crazygolfgame.firebasestorage.app',
  messagingSenderId: '1011466376798',
  appId: '1:1011466376798:web:f8704dd194b9ce238d06cf',
}

export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

/*
 * Offline-first, which is a hard requirement: a round must keep working in a dead
 * patch on the course and sync when signal returns.
 *
 * persistentLocalCache caches reads in IndexedDB and queues writes until the
 * device is back online. The multi-tab manager keeps those caches consistent if
 * the app is open in more than one tab. This replaces the deprecated
 * enableIndexedDbPersistence().
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
