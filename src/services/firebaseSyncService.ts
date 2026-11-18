import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { AppState } from '../types/app';

export interface FirebaseConfigObject {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export interface FirebaseHandle {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  projectId: string;
}

const APP_NAME = 'sankalpa-byo-sync';

export function parseFirebaseConfigJson(rawJson: string): FirebaseConfigObject {
  const cleaned = rawJson.trim();
  if (!cleaned) {
    throw new Error('Paste your Firebase Web Config JSON first.');
  }
  const parsed = JSON.parse(cleaned) as Partial<FirebaseConfigObject>;
  if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId || !parsed.appId) {
    throw new Error('Config JSON must include apiKey, authDomain, projectId, and appId.');
  }
  return parsed as FirebaseConfigObject;
}

export async function initUserFirebase(rawJson: string): Promise<FirebaseHandle> {
  const config = parseFirebaseConfigJson(rawJson);
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    await deleteApp(existing);
  }
  const app = initializeApp(config, APP_NAME);
  const auth = getAuth(app);
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = initializeFirestore(app, {});
  }
  return { app, auth, db, projectId: config.projectId };
}

export async function disconnectUserFirebase(): Promise<void> {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    await deleteApp(existing);
  }
}

export function subscribeFirebaseAuth(auth: Auth, cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function signInFirebaseGoogle(auth: Auth): Promise<User> {
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function signInFirebaseEmail(auth: Auth, email: string, password: string): Promise<User> {
  const res = await signInWithEmailAndPassword(auth, email.trim(), password);
  return res.user;
}

export async function signUpFirebaseEmail(auth: Auth, email: string, password: string): Promise<User> {
  const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return res.user;
}

export async function signOutFirebase(auth: Auth): Promise<void> {
  await signOut(auth);
}

export async function pushStateToFirestore(db: Firestore, uid: string, state: AppState): Promise<void> {
  const ref = doc(db, 'sankalpa_users', uid);
  const payload: AppState = {
    ...state,
    settings: {
      ...state.settings,
      firebaseConfigJson: '', // Never store local config string inside remote doc unnecessarily
    },
  };
  await setDoc(ref, payload, { merge: true });
}

export async function pullStateFromFirestore(db: Firestore, uid: string): Promise<AppState | null> {
  const ref = doc(db, 'sankalpa_users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AppState;
}

export function subscribeRemoteState(
  db: Firestore,
  uid: string,
  onRemoteUpdate: (remoteState: AppState) => void,
  onError: (err: Error) => void
) {
  const ref = doc(db, 'sankalpa_users', uid);
  return onSnapshot(
    ref,
    { includeMetadataChanges: false },
    (snap) => {
      if (snap.exists() && !snap.metadata.hasPendingWrites) {
        onRemoteUpdate(snap.data() as AppState);
      }
    },
    (err) => {
      onError(err);
    }
  );
}
