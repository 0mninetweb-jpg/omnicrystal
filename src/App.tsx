/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { auth, loginWithGoogle, logout, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { CrystalPlanProvider } from './context/CrystalPlanContext';
import { createDefaultEntitlementFields } from './lib/crystalPlans';

const Dashboard = lazy(async () => ({ default: (await import('./components/Dashboard')).Dashboard }));
const Search = lazy(async () => ({ default: (await import('./components/Search')).Search }));
const Watchlist = lazy(async () => ({ default: (await import('./components/Watchlist')).Watchlist }));
const GlobalDashboards = lazy(async () => ({ default: (await import('./components/GlobalDashboards')).GlobalDashboards }));
const Profile = lazy(async () => ({ default: (await import('./components/Profile')).Profile }));
const Nextletter = lazy(async () => ({ default: (await import('./components/Nextletter')).Nextletter }));

type AppView = 'dashboard' | 'search' | 'watchlist' | 'global' | 'profile' | 'nextletter';

function ViewLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-slate-300 shadow-xl backdrop-blur-xl">
        <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
        Caricamento vista...
      </div>
    </div>
  );
}

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsGuest(false);
        // Ensure user profile exists in Firestore
        const path = `users/${currentUser.uid}`;
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
            // Only update non-immutable fields
            await setDoc(doc(db, 'users', currentUser.uid), {
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
            }, { merge: true });
          }
        } catch (error) {
          console.error("Firestore error during user setup:", error);
          // Don't throw here to avoid breaking the auth flow
        }
      } else {
        setUser(null);
        setIsGuest(true);
        setCurrentView('global');
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await logout();
    setIsGuest(true);
    setCurrentView('global');
  };

  useEffect(() => {
    if (isAuthReady && !user && !isGuest) {
      setIsGuest(true);
    }
  }, [isAuthReady, user, isGuest]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <CrystalPlanProvider user={user} isGuest={isGuest} onLogin={loginWithGoogle}>
      <Layout currentView={currentView} setCurrentView={setCurrentView} user={user} isGuest={isGuest} onLogin={loginWithGoogle} onLogout={handleLogout}>
        <Suspense fallback={<ViewLoader />}>
          {currentView === 'dashboard' && <Dashboard user={user} isGuest={isGuest} onLogin={loginWithGoogle} />}
          {currentView === 'search' && <Search user={user} isGuest={isGuest} onLogin={loginWithGoogle} initialQuery={searchQuery} />}
          {currentView === 'nextletter' && (
            <Nextletter
              user={user}
              isGuest={isGuest}
              onLogin={loginWithGoogle}
              onGenerateCard={(q) => {
                setSearchQuery(q);
                setCurrentView('search');
              }}
            />
          )}
          {currentView === 'watchlist' && <Watchlist user={user} isGuest={isGuest} onLogin={loginWithGoogle} />}
          {currentView === 'global' && (
            <GlobalDashboards
              user={user}
              isGuest={isGuest}
              onLogin={loginWithGoogle}
              onNavigate={(view) => setCurrentView(view)}
            />
          )}
          {currentView === 'profile' && <Profile user={user} isGuest={isGuest} onLogin={loginWithGoogle} />}
        </Suspense>
      </Layout>
    </CrystalPlanProvider>
  );
}
