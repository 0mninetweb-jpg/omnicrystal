import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function getGoogleLoginErrorMessage(error: any) {
  switch (error?.code) {
    case 'auth/unauthorized-domain':
      return 'Authentication error: the current domain is not authorized in Firebase. Add this URL under Firebase Authentication > Settings > Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'Authentication error: Google sign-in is not enabled for this Firebase project. Enable it in Firebase Console > Authentication > Sign-in method.';
    case 'auth/configuration-not-found':
      return 'Authentication error: Firebase Authentication is not configured correctly for this project yet. Finish the setup in the Firebase console and try again.';
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked by the browser. Allow popups for this site and try again.';
    default:
      return 'Login failed: ' + (error?.message || 'Unknown error');
  }
}

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Error logging in with Google', error);
    if (error?.code !== 'auth/popup-closed-by-user') {
      alert(getGoogleLoginErrorMessage(error));
    }
    return null;
  }
};

export const loginAsDemo = async (setUser: (user: any) => void, setIsGuest: (isGuest: boolean) => void) => {
  const demoUser = {
    uid: 'demo-user-123',
    displayName: 'Demo User',
    email: 'demo@crystal.ai',
    photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Crystal',
  };
  setUser(demoUser as any);
  setIsGuest(false);
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error logging out', error);
  }
};
