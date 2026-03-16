import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
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
      return "Errore di Autenticazione: il dominio attuale non e autorizzato in Firebase. Aggiungi questo URL ai domini autorizzati nella console di Firebase (Authentication -> Settings -> Authorized domains).";
    case 'auth/operation-not-allowed':
      return "Errore di Autenticazione: il login con Google non e attivo nel progetto Firebase. Vai in Firebase Console -> Authentication -> Sign-in method -> Google, abilitalo e salva.";
    case 'auth/configuration-not-found':
      return "Errore di Autenticazione: Firebase Authentication non e ancora configurato correttamente per questo progetto. Inizializza Authentication nella console Firebase e riprova.";
    case 'auth/popup-blocked':
      return "Il popup di login e stato bloccato dal browser. Consenti i popup per questo sito e riprova.";
    default:
      return "Errore durante il login: " + (error?.message || 'Errore sconosciuto');
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

// Validate Connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();
