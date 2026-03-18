/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CrystalPlanProvider } from './context/CrystalPlanContext';
import { AppRuntimeProvider } from './context/AppRuntimeContext';
import { AppShellProvider } from './context/AppShellContext';
import { createDefaultEntitlementFields } from './lib/crystalPlans';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  defaultOnboardingState,
  ONBOARDING_STORAGE_KEY,
  OnboardingChecklistKey,
  OnboardingState,
} from './types/onboarding';
import { getDefaultWorldSimPreviewDataset } from './lib/worldSimScene';
import type { WorldSimSceneData } from './types/worldSim';
import type { WorldSimJobRef } from './types/worldSimJob';

const MarketingLanding = lazy(async () => ({ default: (await import('./components/MarketingLanding')).MarketingLanding }));
const AppShell = lazy(async () => ({ default: (await import('./components/AppShell')).AppShell }));
const AppHome = lazy(async () => ({ default: (await import('./components/AppHome')).AppHome }));
const Search = lazy(async () => ({ default: (await import('./components/Search')).Search }));
const Watchlist = lazy(async () => ({ default: (await import('./components/Watchlist')).Watchlist }));
const Profile = lazy(async () => ({ default: (await import('./components/Profile')).Profile }));
const Nextletter = lazy(async () => ({ default: (await import('./components/Nextletter')).Nextletter }));
const WorldSimScene = lazy(async () => ({ default: (await import('./components/WorldSimScene')).WorldSimScene }));

type AppRoute = '/app' | '/app/forecast' | '/app/nextletter' | '/app/watchlist' | '/app/profile';

const PENDING_APP_PATH_KEY = 'crystal-pending-app-path-v1';

function ViewLoader() {
  return (
    <div className="flex min-h-[42vh] items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <Loader2 className="h-4 w-4 animate-spin text-[#1453e8]" />
        Loading…
      </div>
    </div>
  );
}

function AuthLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent">
      <Loader2 className="h-8 w-8 animate-spin text-[#1453e8]" />
    </div>
  );
}

function readOnboardingState() {
  if (typeof window === 'undefined') return defaultOnboardingState;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return defaultOnboardingState;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      hasSeenIntro: Boolean(parsed.hasSeenIntro),
      completedChecklist: {
        ...defaultOnboardingState.completedChecklist,
        ...(parsed.completedChecklist || {}),
      },
      dismissedAt: typeof parsed.dismissedAt === 'string' ? parsed.dismissedAt : null,
    };
  } catch {
    return defaultOnboardingState;
  }
}

function persistOnboardingState(state: OnboardingState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
}

function sanitizeAppPath(path?: string | null): AppRoute | `${AppRoute}?${string}` {
  if (!path) return '/app';
  let normalized = path;

  try {
    normalized = decodeURIComponent(path);
  } catch {
    normalized = path;
  }

  if (!normalized.startsWith('/app')) {
    return '/app';
  }

  return normalized as AppRoute | `${AppRoute}?${string}`;
}

function readPendingAppPath() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(PENDING_APP_PATH_KEY);
}

function writePendingAppPath(path: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PENDING_APP_PATH_KEY, sanitizeAppPath(path));
}

function clearPendingAppPath() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_APP_PATH_KEY);
}

function getUserSyncPayload(
  data: Record<string, any> | undefined,
  currentUser: User,
  defaults: ReturnType<typeof createDefaultEntitlementFields>
) {
  const payload: Record<string, any> = {};

  const nextEmail = currentUser.email || 'no-email@example.com';
  const nextDisplayName = currentUser.displayName || 'User';
  const nextPhotoURL = currentUser.photoURL || '';

  if (data?.email !== nextEmail) payload.email = nextEmail;
  if (data?.displayName !== nextDisplayName) payload.displayName = nextDisplayName;
  if (data?.photoURL !== nextPhotoURL) payload.photoURL = nextPhotoURL;
  if (typeof data?.plan !== 'string') payload.plan = defaults.plan;
  if (typeof data?.planStatus !== 'string') payload.planStatus = defaults.planStatus;
  if (typeof data?.creditsBalance !== 'number') payload.creditsBalance = defaults.creditsBalance;
  if (typeof data?.creditsCycleAmount !== 'number') payload.creditsCycleAmount = defaults.creditsCycleAmount;
  if (!data?.creditsResetAt) payload.creditsResetAt = defaults.creditsResetAt;
  if (typeof data?.profileAiFreeMessagesRemaining !== 'number') {
    payload.profileAiFreeMessagesRemaining = defaults.profileAiFreeMessagesRemaining;
  }
  if (typeof data?.watchlistLimit !== 'number') payload.watchlistLimit = defaults.watchlistLimit;

  return Object.keys(payload).length > 0 ? payload : null;
}

function AppRouter() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(defaultOnboardingState);
  const [worldSimSceneOpen, setWorldSimSceneOpen] = useState(false);
  const [worldSimSceneMode, setWorldSimSceneMode] = useState<'preview' | 'live'>('preview');
  const [worldSimPreviewDataset, setWorldSimPreviewDataset] = useState<WorldSimSceneData>(() =>
    getDefaultWorldSimPreviewDataset()
  );
  const [worldSimJobRef, setWorldSimJobRef] = useState<WorldSimJobRef | null>(null);

  useEffect(() => {
    setOnboardingState(readOnboardingState());
  }, []);

  useEffect(() => {
    persistOnboardingState(onboardingState);
  }, [onboardingState]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          const defaults = createDefaultEntitlementFields(
            typeof userDoc.data()?.plan === 'string' ? (userDoc.data()?.plan as 'free' | 'plus' | 'pro') : 'free'
          );

          if (!userDoc.exists()) {
            await setDoc(doc(db, 'users', currentUser.uid), {
              email: currentUser.email || 'no-email@example.com',
              displayName: currentUser.displayName || 'User',
              photoURL: currentUser.photoURL || '',
              createdAt: serverTimestamp(),
              ...defaults,
            });
          } else {
            const data = userDoc.data();
            const payload = getUserSyncPayload(data, currentUser, defaults);

            if (payload) {
              await setDoc(doc(db, 'users', currentUser.uid), payload, { merge: true });
            }
          }
        } catch (error) {
          console.error('Firestore error during user setup:', error);
        }
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user || location.pathname !== '/') return;
    const params = new URLSearchParams(location.search);
    const next = params.get('next') || readPendingAppPath();
    if (next) {
      clearPendingAppPath();
      void navigate(sanitizeAppPath(next), { replace: true });
    }
  }, [isAuthReady, location.pathname, location.search, navigate, user]);

  useEffect(() => {
    if (location.pathname === '/app/nextletter') {
      setOnboardingState((current) => {
        if (current.completedChecklist.openedBriefing) return current;
        return {
          ...current,
          completedChecklist: {
            ...current.completedChecklist,
            openedBriefing: true,
          },
        };
      });
    }
  }, [location.pathname]);

  const isGuest = !user;

  const handleLogin = async (targetPath?: string) => {
    const next = sanitizeAppPath(targetPath || new URLSearchParams(location.search).get('next') || readPendingAppPath() || '/app');
    writePendingAppPath(next);

    if (user) {
      clearPendingAppPath();
      await navigate(next, { replace: true });
      return;
    }

    const signedInUser = await loginWithGoogle();
    if (signedInUser) {
      clearPendingAppPath();
      await navigate(next, { replace: true });
    }
  };

  const handleLogout = async () => {
    await logout();
    clearPendingAppPath();
    await navigate('/', { replace: true });
  };

  const markChecklist = (key: OnboardingChecklistKey) => {
    setOnboardingState((current) => {
      if (current.completedChecklist[key]) return current;
      return {
        ...current,
        completedChecklist: {
          ...current.completedChecklist,
          [key]: true,
        },
      };
    });
  };

  const completeInlineIntro = () => {
    setOnboardingState((current) => ({
      ...current,
      hasSeenIntro: true,
      dismissedAt: new Date().toISOString(),
    }));
  };

  const openForecast = (query = '') => {
    const target = query ? `/app/forecast?q=${encodeURIComponent(query)}` : '/app/forecast';
    void navigate(target);
  };

  const openWorldSimScene = (dataset?: WorldSimSceneData, job?: WorldSimJobRef | null) => {
    const nextDataset = dataset || getDefaultWorldSimPreviewDataset();
    setWorldSimPreviewDataset(nextDataset);
    setWorldSimSceneMode(nextDataset.mode);
    setWorldSimJobRef(job || null);
    setWorldSimSceneOpen(true);
  };

  const renderAppRoute = (children: React.ReactNode) => {
    if (!isAuthReady) {
      return <AuthLoader />;
    }

    if (!user) {
      const target = sanitizeAppPath(`${location.pathname}${location.search}${location.hash}`);
      writePendingAppPath(target);
      return <Navigate to={`/?next=${encodeURIComponent(target)}`} replace />;
    }

    return (
      <Suspense fallback={<ViewLoader />}>
        <AppShell user={user} onLogout={handleLogout} onOpenWorldSimScene={() => openWorldSimScene()}>
          {children}
        </AppShell>
      </Suspense>
    );
  };

  const forecastSeed = useMemo(() => new URLSearchParams(location.search).get('q') || '', [location.search]);

  return (
    <CrystalPlanProvider user={user} isGuest={isGuest} onLogin={() => handleLogin('/app')}>
      <Routes>
        <Route
          path="/"
          element={
            <Suspense fallback={<AuthLoader />}>
              <MarketingLanding
                isAuthenticated={Boolean(user)}
                onPrimaryAction={() => {
                  if (user) {
                    void navigate('/app');
                    return;
                  }
                  void handleLogin('/app');
                }}
                onOpenWorldSimPreview={() => openWorldSimScene(getDefaultWorldSimPreviewDataset())}
              />
            </Suspense>
          }
        />
        <Route
          path="/app"
          element={renderAppRoute(
            <Suspense fallback={<ViewLoader />}>
              <AppHome
                user={user}
                onboardingState={onboardingState}
                onCompleteIntro={completeInlineIntro}
                onNavigate={(path) => void navigate(path)}
                onForecastIntent={openForecast}
                onOpenWorldSimScene={openWorldSimScene}
              />
            </Suspense>
          )}
        />
        <Route
          path="/app/forecast"
          element={renderAppRoute(
            <Suspense fallback={<ViewLoader />}>
              <Search
                user={user}
                isGuest={false}
                onLogin={() => handleLogin('/app')}
                initialQuery={forecastSeed}
                onForecastComplete={() => markChecklist('firstForecast')}
                onOpenWorldSimScene={openWorldSimScene}
              />
            </Suspense>
          )}
        />
        <Route
          path="/app/nextletter"
          element={renderAppRoute(
            <Suspense fallback={<ViewLoader />}>
              <Nextletter
                user={user}
                isGuest={false}
                onLogin={() => handleLogin('/app')}
                onGenerateCard={(query) => openForecast(query)}
                onOpenWorldSimScene={openWorldSimScene}
              />
            </Suspense>
          )}
        />
        <Route
          path="/app/watchlist"
          element={renderAppRoute(
            <Suspense fallback={<ViewLoader />}>
              <Watchlist
                user={user}
                isGuest={false}
                onLogin={() => handleLogin('/app')}
                onChecklistComplete={() => markChecklist('firstWatchlist')}
              />
            </Suspense>
          )}
        />
        <Route
          path="/app/profile"
          element={renderAppRoute(
            <Suspense fallback={<ViewLoader />}>
              <Profile user={user} isGuest={false} onLogin={() => handleLogin('/app')} />
            </Suspense>
          )}
        />
        <Route path="*" element={<Navigate to={user ? '/app' : '/'} replace />} />
      </Routes>

      {worldSimSceneOpen && (
        <Suspense fallback={null}>
          <WorldSimScene
            open={worldSimSceneOpen}
            mode={worldSimSceneMode}
            data={worldSimPreviewDataset}
            job={worldSimJobRef}
            onClose={() => {
              setWorldSimSceneOpen(false);
              setWorldSimJobRef(null);
            }}
          />
        </Suspense>
      )}
    </CrystalPlanProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppShellProvider>
          <AppRuntimeProvider>
            <AppRouter />
          </AppRuntimeProvider>
        </AppShellProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
