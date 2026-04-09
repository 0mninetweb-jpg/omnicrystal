import { GoogleAuthProvider, auth, signInWithPopup, signOut } from 'firebase/auth';
import { db } from 'firebase/firestore';

export { auth, db };
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
  console.error('Data layer error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function getGoogleLoginErrorMessage(error: any) {
  switch (error?.code) {
    case 'auth/unauthorized-domain':
      return 'Authentication error: the current domain is not authorized in Appwrite. Add this URL under Project settings > Platforms.';
    case 'auth/operation-not-allowed':
      return 'Authentication error: Google sign-in is not enabled for this Appwrite project yet.';
    case 'auth/configuration-not-found':
      return 'Authentication error: Appwrite OAuth is not configured correctly for this project yet. Finish the Google provider setup and try again.';
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked by the browser. Allow redirects or popups for this site and try again.';
    default:
      return 'Login failed: ' + (error?.message || 'Unknown error');
  }
}

export const loginWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
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
    await signOut();
  } catch (error) {
    console.error('Error logging out', error);
  }
};
