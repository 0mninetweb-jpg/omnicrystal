import {
  createCurrentUserJwt,
  ensureAuthBootstrap,
  getCurrentSessionUser,
  loginWithGoogleRedirect,
  logoutCurrentSession,
  subscribeAuthState,
  type AppwriteSessionUser,
} from '../appwriteClient';

export type User = AppwriteSessionUser;

export class GoogleAuthProvider {
  setCustomParameters(_params: Record<string, unknown>) {
    return this;
  }
}

type AuthFacade = {
  readonly currentUser: User | null;
};

export const auth: AuthFacade = {
  get currentUser() {
    return getCurrentSessionUser();
  },
};

export function getAuth() {
  return auth;
}

export function onAuthStateChanged(_auth: AuthFacade, callback: (user: User | null) => void) {
  return subscribeAuthState(callback);
}

export async function signOut(..._args: unknown[]) {
  await logoutCurrentSession();
}

export async function signInWithPopup(..._args: unknown[]) {
  return loginWithGoogleRedirect();
}

export async function getIdToken() {
  return createCurrentUserJwt();
}

void ensureAuthBootstrap();
