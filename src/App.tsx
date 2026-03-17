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
import { createDefaultEntitlementFields } from './lib/crystalPlans';
import { OnboardingModal } from './components/OnboardingModal';
import {
  defaultOnboardingState,
  ONBOARDING_STORAGE_KEY,
  OnboardingChecklistKey,
  OnboardingState,
} from './types/onboarding';

const Home = lazy(async () => ({ default: (await import('./components/Home')).Home }));
const Search = lazy(async () => ({ default: (await import('./components/Search')).Search }));
const Watchlist = lazy(async () => ({ default: (await import('./components/Watchlist')).Watchlist }));
const Profile = lazy(async () => ({ default: (await import('./components/Profile')).Profile }));
const Nextletter = lazy(async () => ({ default: (await import('./components/Nextletter')).Nextletter }));

type AppView = 'home' | 'forecast' | 'watchlist' | 'profile' | 'nextletter';

function ViewLoader() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-[0_16px_35px_rgba(15,23,42,0.08)]">
        <Loader2 className="h-4 w-4 animate-spin text-[#1453e8]" />
        Caricamento vista...
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
            await setDoc(
              doc(db, 'users', currentUser.uid),
              {
                email: currentUser.email || 'no-email@example.com',
                displayName: currentUser.displayName || 'User',
                photoURL: currentUser.photoURL || '',
                plan: data.plan || defaults.plan,
                planStatus: data.planStatus || defaults.planStatus,
                creditsBalance: typeof data.creditsBalance === 'number' ? data.creditsBalance : defaults.creditsBalance,
                creditsCycleAmount:
                  typeof data.creditsCycleAmount === 'number' ? data.creditsCycleAmount : defaults.creditsCycleAmount,
                creditsResetAt: data.creditsResetAt || defaults.creditsResetAt,
                profileAiFreeMessagesRemaining:
                  typeof data.profileAiFreeMessagesRemaining === 'number'
                    ? data.profileAiFreeMessagesRemaining
                    : defaults.profileAiFreeMessagesRemaining,
                watchlistLimit: typeof data.watchlistLimit === 'number' ? data.watchlistLimit : defaults.watchlistLimit,
              },
              { merge: true }
            );
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

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <Loader2 className="h-8 w-8 animate-spin text-[#1453e8]" />
      </div>
    );
  }

  return (
    <CrystalPlanProvider user={user} isGuest={isGuest} onLogin={loginWithGoogle}>
      <Layout
        currentView={currentView}
        setCurrentView={setCurrentView}
        onOpenTutorial={() => setIsOnboardingOpen(true)}
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
            />
          )}
          {currentView === 'nextletter' && (
            <Nextletter
              user={user}
              isGuest={isGuest}
              onLogin={loginWithGoogle}
              onGenerateCard={(query) => openForecast(query)}
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
          openForecast('Quanto e probabile un aumento dei costi energetici in Italia nei prossimi 30 giorni?');
        }}
      />
    </CrystalPlanProvider>
  );
}
