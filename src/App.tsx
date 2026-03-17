/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { CrystalPlanProvider } from './context/CrystalPlanContext';
import { AppRuntimeProvider } from './context/AppRuntimeContext';
import { AppShellProvider } from './context/AppShellContext';
import { createDefaultEntitlementFields } from './lib/crystalPlans';
import { scheduleIdleTask } from './lib/scheduleIdle';
import { OnboardingModal } from './components/OnboardingModal';
import { getDefaultWorldSimPreviewDataset } from './lib/worldSimScene';
import {
  defaultOnboardingState,
  ONBOARDING_STORAGE_KEY,
  OnboardingChecklistKey,
  OnboardingState,
} from './types/onboarding';
import type { WorldSimSceneData } from './types/worldSim';
import type { WorldSimJobRef } from './types/worldSimJob';

const Home = lazy(async () => ({ default: (await import('./components/Home')).Home }));
const Search = lazy(async () => ({ default: (await import('./components/Search')).Search }));
const Watchlist = lazy(async () => ({ default: (await import('./components/Watchlist')).Watchlist }));
const Profile = lazy(async () => ({ default: (await import('./components/Profile')).Profile }));
const Nextletter = lazy(async () => ({ default: (await import('./components/Nextletter')).Nextletter }));
const WorldSimScene = lazy(async () => ({ default: (await import('./components/WorldSimScene')).WorldSimScene }));

type AppView = 'home' | 'forecast' | 'watchlist' | 'profile' | 'nextletter';

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

function ViewLoader() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-[0_16px_35px_rgba(15,23,42,0.08)]">
        <Loader2 className="h-4 w-4 animate-spin text-[#1453e8]" />
        Loading view...
      </div>
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

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [forecastSeed, setForecastSeed] = useState('');
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(defaultOnboardingState);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
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
        setIsGuest(false);

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
        setIsGuest(true);
        setCurrentView('home');
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAuthReady && !user && !isGuest) {
      setIsGuest(true);
    }
  }, [isAuthReady, isGuest, user]);

  useEffect(() => {
    if (isAuthReady && !onboardingState.hasSeenIntro) {
      setIsOnboardingOpen(true);
    }
  }, [isAuthReady, onboardingState.hasSeenIntro]);

  useEffect(() => {
    if (currentView === 'nextletter') {
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
  }, [currentView]);

  useEffect(() => {
    const isDesktopViewport = typeof window !== 'undefined' && window.innerWidth >= 1280;
    if (!isAuthReady || !isDesktopViewport) return;

    return scheduleIdleTask(() => {
      void import('./components/Search');
    }, 1200);
  }, [isAuthReady]);

  const handleLogout = async () => {
    await logout();
    setCurrentView('home');
    setIsGuest(true);
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

  const completeTutorial = () => {
    setOnboardingState((current) => ({
      ...current,
      hasSeenIntro: true,
      dismissedAt: new Date().toISOString(),
    }));
    setIsOnboardingOpen(false);
  };

  const openForecast = (query = '') => {
    setForecastSeed(query);
    setCurrentView('forecast');
  };

  const openWorldSimScene = (dataset?: WorldSimSceneData, job?: WorldSimJobRef | null) => {
    const nextDataset = dataset || getDefaultWorldSimPreviewDataset();
    setWorldSimPreviewDataset(nextDataset);
    setWorldSimSceneMode(nextDataset.mode);
    setWorldSimJobRef(job || null);
    setWorldSimSceneOpen(true);
  };

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <Loader2 className="h-8 w-8 animate-spin text-[#1453e8]" />
      </div>
    );
  }

  return (
    <AppShellProvider>
      <AppRuntimeProvider>
        <CrystalPlanProvider user={user} isGuest={isGuest} onLogin={loginWithGoogle}>
          <Layout
            currentView={currentView}
            setCurrentView={setCurrentView}
            onOpenTutorial={() => setIsOnboardingOpen(true)}
            onOpenWorldSimScene={() => openWorldSimScene()}
            user={user}
            isGuest={isGuest}
            onLogin={loginWithGoogle}
            onLogout={handleLogout}
          >
            <Suspense fallback={<ViewLoader />}>
              {currentView === 'home' && (
                <Home
                  user={user}
                  isGuest={isGuest}
                  onLogin={loginWithGoogle}
                  onNavigate={setCurrentView}
                  onForecastIntent={openForecast}
                  onOpenTutorial={() => setIsOnboardingOpen(true)}
                  onOpenWorldSimScene={openWorldSimScene}
                  onboardingState={onboardingState}
                />
              )}
              {currentView === 'forecast' && (
                <Search
                  user={user}
                  isGuest={isGuest}
                  onLogin={loginWithGoogle}
                  initialQuery={forecastSeed}
                  onForecastComplete={() => markChecklist('firstForecast')}
                  onOpenWorldSimScene={openWorldSimScene}
                />
              )}
              {currentView === 'nextletter' && (
                <Nextletter
                  user={user}
                  isGuest={isGuest}
                  onLogin={loginWithGoogle}
                  onGenerateCard={(query) => openForecast(query)}
                  onOpenWorldSimScene={openWorldSimScene}
                />
              )}
              {currentView === 'watchlist' && (
                <Watchlist
                  user={user}
                  isGuest={isGuest}
                  onLogin={loginWithGoogle}
                  onChecklistComplete={() => markChecklist('firstWatchlist')}
                />
              )}
              {currentView === 'profile' && <Profile user={user} isGuest={isGuest} onLogin={loginWithGoogle} />}
            </Suspense>
          </Layout>

          <OnboardingModal
            open={isOnboardingOpen}
            onClose={completeTutorial}
            onStartForecast={() => {
              completeTutorial();
              openForecast('How likely is an energy cost spike in Italy over the next 30 days?');
            }}
          />
          {worldSimSceneOpen && (
            <Suspense fallback={null}>
              <WorldSimScene
                open={worldSimSceneOpen}
                mode={worldSimSceneMode}
                data={worldSimPreviewDataset}
                job={worldSimJobRef}
                onClose={() => setWorldSimSceneOpen(false)}
              />
            </Suspense>
          )}
        </CrystalPlanProvider>
      </AppRuntimeProvider>
    </AppShellProvider>
  );
}
