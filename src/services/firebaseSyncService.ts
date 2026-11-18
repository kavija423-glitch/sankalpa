import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { AppState } from '../types/app';
import { reconcileTaskBlockLinks } from '../utils/bidirectionalSync';
import {
  DEFAULT_FIREBASE_CONFIG,
  DEFAULT_FIREBASE_CONFIG_JSON,
  type FirebaseConfigObject,
} from '../data/firebaseDefaultConfig';

export { DEFAULT_FIREBASE_CONFIG, DEFAULT_FIREBASE_CONFIG_JSON, type FirebaseConfigObject };

export interface FirebaseHandle {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  projectId: string;
  isBuiltInDefault: boolean;
}

const APP_NAME = 'sankalpa-cloud-sync';

/**
 * Recursively removes undefined values because Firestore rejects undefined properties.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

export function parseFirebaseConfigJson(rawJson?: string): {
  config: FirebaseConfigObject;
  isBuiltInDefault: boolean;
} {
  const cleaned = (rawJson ?? '').trim();
  if (!cleaned) {
    return { config: DEFAULT_FIREBASE_CONFIG, isBuiltInDefault: true };
  }
  const parsed = JSON.parse(cleaned) as Partial<FirebaseConfigObject>;
  if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId || !parsed.appId) {
    throw new Error('Config JSON must include apiKey, authDomain, projectId, and appId.');
  }
  const isBuiltInDefault =
    parsed.projectId === DEFAULT_FIREBASE_CONFIG.projectId &&
    parsed.apiKey === DEFAULT_FIREBASE_CONFIG.apiKey;
  return { config: parsed as FirebaseConfigObject, isBuiltInDefault };
}

export async function initUserFirebase(rawJson?: string): Promise<FirebaseHandle> {
  const { config, isBuiltInDefault } = parseFirebaseConfigJson(rawJson);
  const existing = getApps().find((a) => a.name === APP_NAME);

  let app: FirebaseApp;
  if (
    existing &&
    existing.options.projectId === config.projectId &&
    existing.options.apiKey === config.apiKey
  ) {
    app = existing;
  } else {
    if (existing) {
      await deleteApp(existing);
    }
    app = initializeApp(config, APP_NAME);
  }

  const auth = getAuth(app);
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    // Ignore if browser environment restricts persistence
  }
  // Complete any pending mobile/PWA redirect sign-in silently
  void getRedirectResult(auth).catch(() => undefined);

  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = getFirestore(app);
  }
  return { app, auth, db, projectId: config.projectId, isBuiltInDefault };
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

export async function signInFirebaseGoogle(auth: Auth): Promise<User | null> {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    // Keep default persistence
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const res = await signInWithPopup(auth, provider);
    return res.user;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

export async function signInFirebaseEmail(auth: Auth, email: string, password: string): Promise<User> {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    // Keep default persistence
  }
  const res = await signInWithEmailAndPassword(auth, email.trim(), password);
  return res.user;
}

export async function signUpFirebaseEmail(auth: Auth, email: string, password: string): Promise<User> {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    // Keep default persistence
  }
  const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return res.user;
}

export async function signOutFirebase(auth: Auth): Promise<void> {
  await signOut(auth);
}

export async function pushStateToFirestore(db: Firestore, uid: string, state: AppState): Promise<void> {
  const ref = doc(db, 'sankalpa_users', uid);
  const cleanState = reconcileTaskBlockLinks(state);
  const payload = stripUndefined({
    ...cleanState,
    settings: {
      ...cleanState.settings,
      firebaseConfigJson: '',
    },
  });
  await setDoc(ref, payload);
}

export async function pullStateFromFirestore(db: Firestore, uid: string): Promise<AppState | null> {
  const ref = doc(db, 'sankalpa_users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return reconcileTaskBlockLinks(snap.data() as AppState);
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
        onRemoteUpdate(reconcileTaskBlockLinks(snap.data() as AppState));
      }
    },
    (err) => {
      onError(err);
    }
  );
}
