import React from 'react';
import { Bookmark, Gem, Home, LogOut, Mail, PlayCircle, Sparkles, User, WandSparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from './CrystalCard';
import { RuntimeStatusSurface } from './RuntimeStatusSurface';
import { useCrystalPlan } from '../context/CrystalPlanContext';
import { useAppRuntime } from '../context/AppRuntimeContext';
import { useAppShell } from '../context/AppShellContext';
import { getPlanLabel } from '../lib/crystalPlans';
import { PRODUCT_BRAND, SECTION_COPY, WORLD_SIM_BRAND } from '../content/brand';

type LayoutView = 'home' | 'forecast' | 'nextletter' | 'watchlist' | 'profile';

interface LayoutProps {
  children: React.ReactNode;
  currentView: LayoutView;
  setCurrentView: (view: LayoutView) => void;
  onOpenTutorial: () => void;
  onOpenWorldSimScene: () => void;
  user?: any;
  isGuest?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
}

const NAV_ITEMS: Array<{
  id: LayoutView;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    description: SECTION_COPY.home.navDescription,
  },
  {
    id: 'forecast',
    label: 'Forecast',
    icon: Sparkles,
    description: SECTION_COPY.forecast.navDescription,
  },
  {
    id: 'nextletter',
    label: 'Nextletter',
    icon: Mail,
    description: SECTION_COPY.nextletter.navDescription,
  },
  {
    id: 'watchlist',
    label: 'Watchlist',
    icon: Bookmark,
    description: SECTION_COPY.watchlist.navDescription,
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: SECTION_COPY.profile.navDescription,
  },
];

export function Layout({
  children,
  currentView,
  setCurrentView,
  onOpenTutorial,
  onOpenWorldSimScene,
  user,
  isGuest,
  onLogin,
  onLogout,
}: LayoutProps) {
  const { entitlements, openUpgrade } = useCrystalPlan();
  const capabilities = useAppRuntime();
  const { isDesktop, motionMode } = useAppShell();
  const activeItem = NAV_ITEMS.find((item) => item.id === currentView) ?? NAV_ITEMS[0];
  const shouldAnimateShell = motionMode === 'full';

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className={cn('mx-auto flex min-h-screen w-full max-w-[1600px] flex-col', isDesktop && 'xl:flex-row')}>
        {isDesktop && (
          <aside className="hidden w-[312px] shrink-0 xl:block">
            <div className="px-5 py-4">
              <div className="editorial-panel sticky top-4 flex max-h-[calc(100vh-2rem)] min-h-0 flex-col rounded-[32px] px-5 py-5">
              <div className="flex items-center gap-4 px-2 py-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-slate-950 text-white shadow-[0_18px_35px_rgba(15,23,42,0.18)]">
                  <Gem className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-2xl font-semibold text-slate-950">{PRODUCT_BRAND.name}</div>
                  <div className="text-xs font-medium text-slate-500">{PRODUCT_BRAND.shellLabel}</div>
                </div>
              </div>

              <div className="mt-7 min-h-0 flex-1 overflow-y-auto pr-1 no-scrollbar">
                <div className="space-y-6">
                  <div className="space-y-2">
                  {NAV_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setCurrentView(item.id)}
                      className={cn(
                        'group relative flex w-full items-center gap-4 rounded-[22px] px-4 py-3.5 text-left transition',
                        currentView === item.id ? 'bg-slate-950 text-white shadow-[0_16px_32px_rgba(15,23,42,0.18)]' : 'hover:bg-white/80'
                      )}
                    >
                      {currentView === item.id && shouldAnimateShell && (
                        <motion.div
                          layoutId="activeNavDesktop"
                          className="absolute inset-0 rounded-[22px] border border-slate-950"
                          transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                        />
                      )}
                      {currentView === item.id && !shouldAnimateShell && (
                        <div className="absolute inset-0 rounded-[22px] border border-slate-950" />
                      )}
                      <div
                        className={cn(
                          'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border transition',
                          currentView === item.id
                            ? 'border-white/10 bg-white/10 text-white'
                            : 'border-slate-200 bg-white text-slate-500 group-hover:text-slate-900'
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="relative min-w-0">
                        <div className="text-sm font-semibold">{item.label}</div>
                        {currentView === item.id && (
                          <div className="mt-1 max-w-[190px] text-xs leading-5 text-slate-300">{item.description}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                  <div className="space-y-3">
                    <div className="signal-board rounded-[28px] p-4">
                      <div className="section-kicker">{PRODUCT_BRAND.plansLabel}</div>
                      <button
                        onClick={() =>
                          openUpgrade(
                            isGuest
                              ? {
                                  reason: 'login',
                                  title: `Sign in to unlock ${PRODUCT_BRAND.name}`,
                                  description: 'Save themes, use monthly credits, and activate your personal surfaces with a free account.',
                                  recommendedPlan: 'plus',
                                }
                              : {
                                  reason: 'feature',
                                  title: PRODUCT_BRAND.plansTitle,
                                  description: 'Compare Free, Plus, and Pro to choose how much depth and continuity you want each week.',
                                  recommendedPlan: entitlements.plan === 'pro' ? 'pro' : 'plus',
                                }
                          )
                        }
                        className="mt-3 w-full rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {isGuest ? PRODUCT_BRAND.guestLabel : `${getPlanLabel(entitlements.plan)} plan`}
                        </div>
                        <div className="mt-2 text-lg font-semibold text-slate-950">
                          {isGuest ? 'Sign in to activate credits' : `${entitlements.creditsBalance} credits left`}
                        </div>
                        <div className="mt-3 text-sm leading-6 text-slate-500">
                          {capabilities.worldSimAvailable
                            ? 'Premium simulation is ready for the deeper questions.'
                            : 'WorldSim stays in preview until the live backend is connected.'}
                        </div>
                      </button>
                    </div>

                    <div className="grid gap-3">
                      <button
                        onClick={onOpenTutorial}
                        className="inline-flex w-full items-center justify-between rounded-[24px] border border-slate-200 bg-white/80 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
                      >
                        <div>
                          <div className="section-kicker">Micro tutorial</div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">{PRODUCT_BRAND.tutorialLabel}</div>
                        </div>
                        <PlayCircle className="h-5 w-5 text-[#1453e8]" />
                      </button>

                      <button
                        onClick={onOpenWorldSimScene}
                        className="inline-flex w-full items-center justify-between rounded-[24px] border border-rose-200 bg-rose-50/85 px-4 py-4 text-left transition hover:border-rose-300 hover:bg-white"
                      >
                        <div>
                          <div className="section-kicker !text-rose-500">
                            {capabilities.worldSimAvailable ? WORLD_SIM_BRAND.name : WORLD_SIM_BRAND.previewName}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">{WORLD_SIM_BRAND.enterLabel}</div>
                        </div>
                        <WandSparkles className="h-5 w-5 text-rose-500" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 shrink-0 rounded-[30px] border border-slate-200 bg-white/82 p-4">
                <button
                  onClick={() => setCurrentView('profile')}
                  className="flex w-full items-center gap-3 rounded-[20px] px-2 py-1 text-left"
                >
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <User className="h-5 w-5 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-950">{isGuest ? 'Guest mode' : user?.displayName || 'Profile'}</div>
                    <div className="mt-1 text-xs font-medium text-slate-500">
                      {isGuest ? 'Sign in to personalize the product' : user?.email || 'Active account'}
                    </div>
                  </div>
                </button>

                {isGuest ? (
                  <button
                    onClick={onLogin}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Sign in for free
                  </button>
                ) : (
                  <button
                    onClick={onLogout}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                )}
              </div>
              </div>
            </div>
          </aside>
        )}

        <main
          className={cn(
            'mobile-content-safe flex-1 px-4 pb-8 pt-4 md:px-6',
            isDesktop ? 'xl:pr-6 xl:pt-4' : 'pt-3'
          )}
        >
          <div className="editorial-panel rounded-[32px] px-5 py-5 md:px-7 md:py-7">
            <header className="flex flex-col gap-6 border-b border-slate-200/80 pb-6 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-[18px] bg-slate-950 text-white', isDesktop && 'xl:hidden')}>
                  <Gem className="h-6 w-6" />
                </div>
                <div>
                  <div className="section-kicker">{activeItem.label}</div>
                  <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight text-slate-950 md:text-4xl">
                    {activeItem.label}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">{activeItem.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={onOpenTutorial}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  <PlayCircle className="h-4 w-4 text-[#1453e8]" />
                  {PRODUCT_BRAND.tutorialLabel}
                </button>
                <button
                  onClick={() =>
                    openUpgrade(
                      isGuest
                        ? {
                            reason: 'login',
                            title: `Sign in to unlock ${PRODUCT_BRAND.name}`,
                            description: 'Save themes, use monthly credits, and activate personal surfaces with a free account.',
                            recommendedPlan: 'plus',
                          }
                        : {
                            reason: 'feature',
                            title: PRODUCT_BRAND.plansTitle,
                            description: 'More credits, more continuity, and easier access to premium layers when they matter.',
                            recommendedPlan: entitlements.plan === 'pro' ? 'pro' : 'plus',
                          }
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <WandSparkles className="h-4 w-4 text-rose-300" />
                  {isGuest ? 'Activate credits' : `${getPlanLabel(entitlements.plan)} - ${entitlements.creditsBalance} credits`}
                </button>
              </div>
            </header>

            <div className="pt-5 md:pt-6">
              <RuntimeStatusSurface
                mode={capabilities.runtimeMode}
                label={capabilities.statusLabel}
                detail={capabilities.statusDetail}
                isChecking={capabilities.isChecking}
              />

              <div className="pt-6 md:pt-7">
                {shouldAnimateShell ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentView}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                      {children}
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <div>{children}</div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {!isDesktop && (
        <nav className="mobile-nav-safe fixed inset-x-3 z-50 rounded-[24px] border border-white/70 bg-[rgba(252,250,247,0.94)] px-3 pt-2 shadow-[0_18px_34px_rgba(15,23,42,0.1)] backdrop-blur-lg">
        <div className="flex items-center justify-between gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2.5 text-[11px] font-semibold transition',
                currentView === item.id ? 'text-slate-950' : 'text-slate-500'
              )}
            >
              {currentView === item.id && shouldAnimateShell && (
                <motion.div
                  layoutId="activeNavMobile"
                  className="absolute inset-0 rounded-[18px] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.1)]"
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }}
                />
              )}
              {currentView === item.id && !shouldAnimateShell && (
                <div className="absolute inset-0 rounded-[18px] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]" />
              )}
              <item.icon className="relative h-5 w-5" />
              <span className="relative">{item.label}</span>
            </button>
          ))}
        </div>
        </nav>
      )}
    </div>
  );
}
