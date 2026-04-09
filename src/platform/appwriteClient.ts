import { Account, Client, ID, OAuthProvider } from 'appwrite';

export type AppwriteSessionUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  getIdToken: () => Promise<string>;
};

type AuthListener = (user: AppwriteSessionUser | null) => void;

const DEFAULT_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const DEFAULT_PROJECT_ID = 'crystal';
const OAUTH_USER_ID_PARAM = 'userId';
const OAUTH_SECRET_PARAM = 'secret';

const endpoint = (import.meta.env.VITE_APPWRITE_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/$/, '');
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || DEFAULT_PROJECT_ID;

const client = new Client().setEndpoint(endpoint).setProject(projectId);
const account = new Account(client);

const listeners = new Set<AuthListener>();

let currentUser: AppwriteSessionUser | null = null;
let bootstrapPromise: Promise<AppwriteSessionUser | null> | null = null;

function sanitizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function buildUser(model: Record<string, any> | null): AppwriteSessionUser | null {
  if (!model || !sanitizeString(model.$id)) return null;

  return {
    uid: String(model.$id),
    email: sanitizeString(model.email),
    displayName: sanitizeString(model.name),
    photoURL: sanitizeString(model.prefs?.photoURL ?? model.prefs?.photoUrl ?? model.prefs?.avatarUrl),
    emailVerified: Boolean(model.emailVerification),
    isAnonymous: Boolean(model.status === false && !model.email),
    async getIdToken() {
      const jwt = await account.createJWT();
      return jwt.jwt;
    },
  };
}

function notifyAuthListeners() {
  for (const listener of listeners) {
    listener(currentUser);
  }
}

function stripOauthParams() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(OAUTH_USER_ID_PARAM) && !url.searchParams.has(OAUTH_SECRET_PARAM)) {
    return;
  }
  url.searchParams.delete(OAUTH_USER_ID_PARAM);
  url.searchParams.delete(OAUTH_SECRET_PARAM);
  window.history.replaceState({}, '', url.toString());
}

async function exchangeOauthSessionIfNeeded() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const userId = url.searchParams.get(OAUTH_USER_ID_PARAM);
  const secret = url.searchParams.get(OAUTH_SECRET_PARAM);
  if (!userId || !secret) return;
  await account.createSession(userId, secret);
  stripOauthParams();
}

export async function refreshSessionUser() {
  try {
    await exchangeOauthSessionIfNeeded();
    currentUser = buildUser(await account.get());
  } catch (_error) {
    currentUser = null;
  }
  notifyAuthListeners();
  return currentUser;
}

export function ensureAuthBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = refreshSessionUser();
  }
  return bootstrapPromise;
}

export function subscribeAuthState(listener: AuthListener) {
  listeners.add(listener);
  void ensureAuthBootstrap().then(() => listener(currentUser));
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentSessionUser() {
  return currentUser;
}

export async function loginWithGoogleRedirect() {
  if (typeof window === 'undefined') return null;
  const success = new URL(window.location.href);
  success.hash = '';
  const failure = new URL(window.location.href);
  failure.searchParams.set('authError', 'google');
  account.createOAuth2Session(OAuthProvider.Google, success.toString(), failure.toString());
  return null;
}

export async function loginWithEmailPassword(email: string, password: string) {
  await account.createEmailPasswordSession(email.trim(), password);
  return refreshSessionUser();
}

export async function registerWithEmailPassword(name: string, email: string, password: string) {
  const trimmedEmail = email.trim();
  const trimmedName = name.trim();
  await account.create(ID.unique(), trimmedEmail, password, trimmedName || undefined);
  await account.createEmailPasswordSession(trimmedEmail, password);
  return refreshSessionUser();
}

export async function logoutCurrentSession() {
  try {
    await account.deleteSession('current');
  } finally {
    currentUser = null;
    notifyAuthListeners();
  }
}

export async function createCurrentUserJwt() {
  await ensureAuthBootstrap();
  if (!currentUser) {
    throw new Error('Devi accedere per usare questa funzione.');
  }
  return currentUser.getIdToken();
}

export { account, client, endpoint as appwriteEndpoint, projectId as appwriteProjectId };
