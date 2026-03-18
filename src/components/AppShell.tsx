import React from 'react';
import { LogOut, Orbit, Sparkles, User, Waypoints } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCrystalPlan } from '../context/CrystalPlanContext';
import { useAppRuntime } from '../context/AppRuntimeContext';
import { useAppShell } from '../context/AppShellContext';
import { getPlanLabel } from '../lib/crystalPlans';
import { PRODUCT_BRAND, WORLD_SIM_BRAND } from '../content/brand';

type AppShellProps = {
  user: any;
  onLogout: () => void;
  onOpenWorldSimScene: () => void;
  children: React.ReactNode;
};

const NAV_ITEMS = [
  { to: '/app', label: 'Home', end: true },
  { to: '/app/forecast', label: 'Forecast' },
  { to: '/app/nextletter', label: 'Nextletter' },
  { to: '/app/watchlist', label: 'Watchlist' },
  { to: '/app/profile', label: 'Profile' },
];

export function AppShell({ user, onLogout, onOpenWorldSimScene, children }: AppShellProps) {
  const location = useLocation();
  const { entitlements } = useCrystalPlan();
  const runtime = useAppRuntime();
  const { isPhone } = useAppShell();
  const activeLabel = NAV_ITEMS.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))?.label || 'Home';

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <header className="sticky top-0 z-40 px-4 pt-4 md:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
          <div className="topbar-surface flex items-center justify-between rounded-[26px] px-4 py-3 md:px-5">
            <div className="flex items-center gap-4">
              <Link to="/app" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-slate-950 text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="hidden sm:block">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{PRODUCT_BRAND.name}</div>
                  <div className="text-sm text-slate-500">{activeLabel}</div>
                </div>
              </Link>

              <nav className="hidden items-center gap-1 md:flex">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `rounded-full px-4 py-2 text-sm font-semibold transition ${
                        isActive ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <span
                className={`hidden rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] md:inline-flex ${
                  runtime.runtimeMode === 'live'
                    ? 'bg-emerald-50 text-emerald-700'
                    : runtime.runtimeMode === 'limited'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {runtime.runtimeMode}
              </span>

              <button
                onClick={onOpenWorldSimScene}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                <Waypoints className="h-4 w-4 text-rose-500" />
                <span className="hidden sm:inline">{WORLD_SIM_BRAND.name}</span>
              </button>

              <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 md:flex">
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-500">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt={user?.displayName || 'User'} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{user?.displayName || 'Profile'}</div>
                  <div className="text-xs text-slate-500">
                    {getPlanLabel(entitlements.plan)} · {entitlements.creditsBalance} credits
                  </div>
                </div>
              </div>

              <button
                onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>

          {runtime.runtimeMode !== 'live' && (
            <div className="app-surface flex items-center justify-between gap-4 rounded-[22px] px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {runtime.runtimeMode === 'preview' ? 'Preview backend' : 'Limited runtime'}
                </div>
                <div className="mt-1 text-sm text-slate-600">{runtime.statusDetail}</div>
              </div>
              <div className="hidden items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white sm:inline-flex">
                <Orbit className="h-3.5 w-3.5" />
                {runtime.statusLabel}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mobile-content-safe px-4 pb-10 pt-5 md:px-6 md:pt-6">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      {isPhone && (
        <nav className="mobile-nav-safe fixed inset-x-3 z-40 rounded-[24px] border border-slate-200 bg-[rgba(255,255,255,0.94)] px-3 pt-2 shadow-[0_18px_34px_rgba(15,23,42,0.08)] backdrop-blur-lg">
          <div className="flex items-center justify-between gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2.5 text-[11px] font-semibold transition ${
                    isActive ? 'bg-slate-950 text-white' : 'text-slate-500'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
