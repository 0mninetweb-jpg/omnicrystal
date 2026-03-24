/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CrystalPlanProvider } from './context/CrystalPlanContext';
import { AppRuntimeProvider } from './context/AppRuntimeContext';
import { AppShellProvider } from './context/AppShellContext';
import { createDefaultEntitlementFields, getPlanLabel, PLAN_OFFERS } from './lib/crystalPlans';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getDefaultWorldSimPreviewDataset } from './lib/worldSimScene';
import type { WorldSimSceneData } from './types/worldSim';
import type { WorldSimJobRef } from './types/worldSimJob';
import { isFeatureEnabled } from './lib/featureFlags';
import { ForecastPage } from './components/v1/ForecastPage';
import { WorldSimPage } from './components/v1/WorldSimPage';
import { GalleryPage } from './components/v1/GalleryPage';
import {
  ForecastGalleryBestCallsPage,
  ForecastGalleryEntityPage,
  ForecastGalleryPage,
  ForecastGalleryTopicPage,
  PublicForecastPage,
} from './components/v1/ForecastGalleryPage';
import { PrimaryShell } from './components/v1/PrimaryShell';

const Nextletter = lazy(async () => ({ default: (await import('./components/Nextletter')).Nextletter }));
const Watchlist = lazy(async () => ({ default: (await import('./components/Watchlist')).Watchlist }));
const Profile = lazy(async () => ({ default: (await import('./components/Profile')).Profile }));
const WorldSimScene = lazy(async () => ({ default: (await import('./components/WorldSimScene')).WorldSimScene }));
const DomainCoverageExplorer = lazy(async () => ({
  default: (await import('./components/DomainCoverageExplorer')).DomainCoverageExplorer,
}));

const PENDING_ROUTE_KEY = 'crystal-pending-route-v1';

function ViewLoader() {
  return (
    <div className="flex min-h-[42vh] items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <Loader2 className="h-4 w-4 animate-spin text-[#1453e8]" />
        Loading...
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

function sanitizeRoutePath(path?: string | null) {
  if (!path) return '/forecast';

  let normalized = path;
  try {
    normalized = decodeURIComponent(path);
  } catch {
    normalized = path;
  }

  if (!normalized.startsWith('/') || normalized.startsWith('//') || normalized.startsWith('/api')) {
    return '/forecast';
  }

  if (normalized === '/app' || normalized === '/app/forecast') return '/forecast';
  if (normalized === '/app/profile') return '/settings';
  if (normalized === '/app/nextletter') return '/beta/nextletter';
  if (normalized === '/app/watchlist') return '/beta/watchlist';
  if (normalized === '/sim') return '/beta/world-sim';

  return normalized;
}

function readPendingRoute() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(PENDING_ROUTE_KEY);
}

function writePendingRoute(path: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PENDING_ROUTE_KEY, sanitizeRoutePath(path));
}

function clearPendingRoute() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_ROUTE_KEY);
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

function UtilitySurface({
  kicker,
  title,
  body,
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-[36px] border border-slate-200 bg-white p-8 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
      <div className="max-w-3xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{kicker}</div>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950 md:text-6xl">{title}</h1>
        <p className="mt-4 text-base leading-8 text-slate-600">{body}</p>
      </div>
      {children ? <div className="mt-8">{children}</div> : null}
    </section>
  );
}

function SigninPrompt({ onLogin }: { onLogin: () => void }) {
  return (
    <UtilitySurface
      kicker="Sign in"
      title="Keep going without losing the thread."
      body="Crystal v1 supports a real guest forecast lane, but saving, following, and internal beta surfaces stay behind sign-in so the product never offers buttons that dead-end."
    >
      <button
        type="button"
        onClick={onLogin}
        className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Sign in with Google
      </button>
    </UtilitySurface>
  );
}

function PricingPage({ onLogin }: { onLogin: () => void }) {
  return (
    <UtilitySurface
      kicker="Pricing"
      title="Simple plans, same ambition."
      body="Crystal keeps the prediction surface simple while plans mainly control usage budget, longer horizons, and deeper simulation layers."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {(['free', 'plus', 'pro'] as const).map((plan) => (
          <div key={plan} className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{getPlanLabel(plan)}</div>
            <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              EUR {PLAN_OFFERS[plan].monthlyPrice}
              <span className="text-base font-medium text-slate-500"> / month</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-600">{PLAN_OFFERS[plan].headline}</p>
            <div className="mt-5 space-y-2 text-sm leading-7 text-slate-700">
              {PLAN_OFFERS[plan].features.map((feature) => (
                <p key={feature}>{feature}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onLogin}
        className="mt-8 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Sign in to continue
      </button>
    </UtilitySurface>
  );
}

function AboutPage() {
  return (
    <UtilitySurface
      kicker="About"
      title="Crystal is not a generic chatbot."
      body="Crystal is a decision-intelligence product built to forecast broad domains over time. The public product is now structured around Forecast, Forecast Gallery, and Gallery. World Sim remains available as an internal beta layer, while MiroFish stays inside the engine as optional simulation enrichment."
    />
  );
}

function BetaSurface({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <UtilitySurface kicker="Beta route" title={title} body={body} />
      {children}
    </div>
  );
}

function AppRouter() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [worldSimSceneOpen, setWorldSimSceneOpen] = useState(false);
  const [worldSimSceneMode, setWorldSimSceneMode] = useState<'preview' | 'live'>('preview');
  const [worldSimPreviewDataset, setWorldSimPreviewDataset] = useState<WorldSimSceneData>(() =>
    getDefaultWorldSimPreviewDataset()
  );
  const [worldSimJobRef, setWorldSimJobRef] = useState<WorldSimJobRef | null>(null);

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
            const payload = getUserSyncPayload(userDoc.data(), currentUser, defaults);
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

  const openWorldSimScene = (dataset?: WorldSimSceneData, job?: WorldSimJobRef | null) => {
    const nextDataset = dataset || getDefaultWorldSimPreviewDataset();
    setWorldSimPreviewDataset(nextDataset);
    setWorldSimSceneMode(nextDataset.mode);
    setWorldSimJobRef(job || null);
    setWorldSimSceneOpen(true);
  };

  const handleLogin = async (targetPath?: string) => {
    const next = sanitizeRoutePath(targetPath || `${location.pathname}${location.search}${location.hash}`);
    writePendingRoute(next);

    if (user) {
      clearPendingRoute();
      await navigate(next, { replace: true });
      return;
    }

    const signedInUser = await loginWithGoogle();
    if (signedInUser) {
      clearPendingRoute();
      await navigate(next, { replace: true });
    }
  };

  const handleLogout = async () => {
    await logout();
    clearPendingRoute();
    await navigate('/forecast', { replace: true });
  };

  useEffect(() => {
    if (!isAuthReady || !user) return;
    if (location.pathname !== '/signin') return;
    const next = new URLSearchParams(location.search).get('next') || readPendingRoute() || '/forecast';
    clearPendingRoute();
    void navigate(sanitizeRoutePath(next), { replace: true });
  }, [isAuthReady, location.pathname, location.search, navigate, user]);

  if (!isAuthReady) {
    return <AuthLoader />;
  }

  const shell = (children: React.ReactNode) => (
    <PrimaryShell
      user={user}
      onLogin={() => void handleLogin(`${location.pathname}${location.search}${location.hash}`)}
      onLogout={() => void handleLogout()}
    >
      {children}
    </PrimaryShell>
  );

  const protectedRoute = (children: React.ReactNode) =>
    user ? children : <SigninPrompt onLogin={() => void handleLogin(`${location.pathname}${location.search}${location.hash}`)} />;

  const betaNextletterEnabled = isFeatureEnabled('beta_nextletter');
  const betaWatchlistEnabled = isFeatureEnabled('beta_watchlist');
  const internalCoverageEnabled = isFeatureEnabled('internal_coverage');
  const forecastGalleryBestCallsEnabled = isFeatureEnabled('forecast_gallery_best_calls');
  const v1ShellEnabled = isFeatureEnabled('v1_shell');

  return (
    <CrystalPlanProvider user={user} isGuest={!user} onLogin={() => void handleLogin('/forecast')}>
      <Routes>
        <Route path="/" element={<Navigate to={v1ShellEnabled ? '/forecast' : '/forecast'} replace />} />
        <Route path="/forecast" element={shell(<ForecastPage user={user} onLogin={() => void handleLogin('/forecast')} />)} />
        <Route
          path="/forecast-gallery"
          element={shell(<ForecastGalleryPage user={user} onLogin={() => void handleLogin('/forecast-gallery')} />)}
        />
        <Route
          path="/forecast-gallery/forecast/:slug"
          element={shell(<PublicForecastPage user={user} onLogin={() => void handleLogin(location.pathname)} />)}
        />
        <Route
          path="/forecast-gallery/entity/:entitySlug"
          element={shell(<ForecastGalleryEntityPage user={user} onLogin={() => void handleLogin(location.pathname)} />)}
        />
        <Route
          path="/forecast-gallery/topic/:topicSlug"
          element={shell(<ForecastGalleryTopicPage user={user} onLogin={() => void handleLogin(location.pathname)} />)}
        />
        <Route
          path="/forecast-gallery/best-calls"
          element={
            forecastGalleryBestCallsEnabled
              ? shell(<ForecastGalleryBestCallsPage user={user} onLogin={() => void handleLogin(location.pathname)} />)
              : <Navigate to="/forecast-gallery" replace />
          }
        />
        <Route path="/gallery" element={shell(<GalleryPage user={user} onLogin={() => void handleLogin('/gallery')} />)} />
        <Route path="/sim" element={<Navigate to="/beta/world-sim" replace />} />
        <Route path="/signin" element={shell(<SigninPrompt onLogin={() => void handleLogin(readPendingRoute() || '/forecast')} />)} />
        <Route path="/pricing" element={shell(<PricingPage onLogin={() => void handleLogin('/pricing')} />)} />
        <Route path="/about" element={shell(<AboutPage />)} />
        <Route
          path="/settings"
          element={shell(
            protectedRoute(
              <Suspense fallback={<ViewLoader />}>
                <Profile user={user} isGuest={false} onLogin={() => void handleLogin('/settings')} />
              </Suspense>
            )
          )}
        />

        <Route path="/app" element={<Navigate to="/forecast" replace />} />
        <Route path="/app/forecast" element={<Navigate to="/forecast" replace />} />
        <Route path="/app/profile" element={<Navigate to="/settings" replace />} />
        <Route path="/app/nextletter" element={<Navigate to="/beta/nextletter" replace />} />
        <Route path="/app/watchlist" element={<Navigate to="/beta/watchlist" replace />} />

        <Route
          path="/beta/world-sim"
          element={shell(
            protectedRoute(
              <BetaSurface
                title="World Sim stays available as a beta/internal layer."
                body="World Sim is no longer part of the public primary navigation. It remains accessible here for deeper scenario work while Forecast and Forecast Gallery carry the main product surface."
              >
                <WorldSimPage user={user} onLogin={() => void handleLogin('/beta/world-sim')} />
              </BetaSurface>
            )
          )}
        />
        <Route
          path="/beta/nextletter"
          element={
            betaNextletterEnabled
              ? shell(
                  protectedRoute(
                    <Suspense fallback={<ViewLoader />}>
                      <BetaSurface
                        title="Nextletter stays alive, but outside the primary product surface."
                        body="This module is preserved behind a beta route while Forecast, Forecast Gallery, and Gallery become the public v1 entry points."
                      >
                        <Nextletter
                          user={user}
                          isGuest={false}
                          onLogin={() => void handleLogin('/beta/nextletter')}
                          onGenerateCard={(query) => void navigate(`/forecast?q=${encodeURIComponent(query)}`)}
                          onOpenWorldSimScene={openWorldSimScene}
                        />
                      </BetaSurface>
                    </Suspense>
                  )
                )
              : <Navigate to="/forecast" replace />
          }
        />
        <Route
          path="/beta/watchlist"
          element={
            betaWatchlistEnabled
              ? shell(
                  protectedRoute(
                    <Suspense fallback={<ViewLoader />}>
                      <BetaSurface
                        title="Watchlist remains available as a secondary memory surface."
                        body="The underlying follow/save infrastructure stays intact, but Watchlist leaves the main navigation in v1."
                      >
                        <Watchlist user={user} isGuest={false} onLogin={() => void handleLogin('/beta/watchlist')} />
                      </BetaSurface>
                    </Suspense>
                  )
                )
              : <Navigate to="/forecast" replace />
          }
        />
        <Route
          path="/beta/profile"
          element={shell(
            protectedRoute(
              <Suspense fallback={<ViewLoader />}>
                <BetaSurface
                  title="Profile is preserved as settings and context memory."
                  body="The personalization layer stays available, but it no longer competes with Forecast in the public product shell."
                >
                  <Profile user={user} isGuest={false} onLogin={() => void handleLogin('/beta/profile')} />
                </BetaSurface>
              </Suspense>
            )
          )}
        />
        <Route
          path="/beta/coverage"
          element={
            internalCoverageEnabled
              ? shell(
                  <Suspense fallback={<ViewLoader />}>
                    <BetaSurface
                      title="Coverage explorer is still available for internal or beta use."
                      body="This route keeps the registry and coverage debug surface alive without diluting the public v1 experience."
                    >
                      <DomainCoverageExplorer
                        variant="full"
                        title="Coverage explorer"
                        description="Use this internal route to inspect blueprint coverage, publication status, and registry depth."
                      />
                    </BetaSurface>
                  </Suspense>
                )
              : <Navigate to="/forecast" replace />
          }
        />

        <Route path="*" element={<Navigate to="/forecast" replace />} />
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
