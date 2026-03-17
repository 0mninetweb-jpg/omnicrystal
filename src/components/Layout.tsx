import React from 'react';
import { Bookmark, Gem, Home, LogOut, Mail, PlayCircle, Sparkles, User, WandSparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from './CrystalCard';
import { useCrystalPlan } from '../context/CrystalPlanContext';
import { useAppRuntime } from '../context/AppRuntimeContext';
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
  const activeItem = NAV_ITEMS.find((item) => item.id === currentView) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <aside className="hidden w-[304px] shrink-0 lg:block">
          <div className="sticky top-0 h-screen px-5 py-5">
            <div className="editorial-panel flex h-full min-h-0 flex-col rounded-[32px] px-5 py-5">
              <div className="flex items-center gap-4 px-2 py-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-slate-950 text-white shadow-[0_18px_35px_rgba(15,23,42,0.18)]">
                  <Gem className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-2xl font-semibold text-slate-950">{PRODUCT_BRAND.name}</div>
                  <div className="text-xs font-medium text-slate-500">{PRODUCT_BRAND.shellLabel}</div>
                </div>
              </div>

              <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1 no-scrollbar">
                <div className="space-y-6">
                  <div className="space-y-1.5">
                  {NAV_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setCurrentView(item.id)}
                      className={cn(
                        'group relative flex w-full items-center gap-4 rounded-[22px] px-4 py-3.5 text-left transition',
                        currentView === item.id ? 'bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]' : 'hover:bg-white/80'
                      )}
                    >
                      {currentView === item.id && (
                        <motion.div
                          layoutId="activeNavDesktop"
                          className="absolute inset-0 rounded-[22px] border border-slate-950"
                          transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                        />
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
                          <div className="mt-1 max-w-[180px] text-xs leading-5 text-slate-300">{item.description}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                  <div className="space-y-3">
                    <div className="rounded-[28px] border border-slate-200 bg-white/80 p-4">
                      <div className="section-kicker">{PRODUCT_BRAND.plansLabel}</div>
                      <button
                        onClick={() =>
                          openUpgrade(
                            isGuest
                              ? {
                                  reason: 'login',
                                  title: `Accedi per attivare ${PRODUCT_BRAND.name}`,
                                  description: 'Salva temi, usa i crediti mensili e attiva le aree personali con un account gratuito.',
                                  recommendedPlan: 'plus',
                                }
                              : {
                                  reason: 'feature',
                                  title: PRODUCT_BRAND.plansTitle,
                                  description: 'Confronta Free, Plus e Pro e scegli quanta profondita vuoi usare ogni settimana.',
                                  recommendedPlan: entitlements.plan === 'pro' ? 'pro' : 'plus',
                                }
                          )
                        }
                        className="mt-3 w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {isGuest ? PRODUCT_BRAND.guestLabel : `${getPlanLabel(entitlements.plan)} plan`}
                        </div>
                        <div className="mt-2 text-lg font-semibold text-slate-950">
                          {isGuest ? 'Accedi per attivare i crediti' : `${entitlements.creditsBalance} crediti rimasti`}
                        </div>
                        <div className="mt-3 text-sm leading-6 text-slate-500">
                          {capabilities.worldSimAvailable
                            ? 'Il layer premium e pronto per le query piu profonde.'
                            : 'WorldSim resta in preview finche il backend live non e collegato.'}
                        </div>
                      </button>
                    </div>

                    <div className="grid gap-3">
                      <button
                        onClick={onOpenTutorial}
                        className="inline-flex w-full items-center justify-between rounded-[24px] border border-slate-200 bg-white/80 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
                      >
                        <div>
                          <div className="section-kicker">Micro Tutorial</div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">{PRODUCT_BRAND.tutorialLabel}</div>
                        </div>
                        <PlayCircle className="h-5 w-5 text-[#1453e8]" />
                      </button>

                      <button
                        onClick={onOpenWorldSimScene}
                        className="inline-flex w-full items-center justify-between rounded-[24px] border border-rose-200 bg-rose-50/80 px-4 py-4 text-left transition hover:border-rose-300 hover:bg-white"
                      >
                        <div>
                          <div className="section-kicker !text-rose-500">
                            {capabilities.worldSimAvailable ? WORLD_SIM_BRAND.name : WORLD_SIM_BRAND.previewName}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">Apri la simulation chamber</div>
                        </div>
                        <WandSparkles className="h-5 w-5 text-rose-500" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 shrink-0 rounded-[28px] border border-slate-200 bg-white/80 p-4">
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
                      {isGuest ? 'Accedi per personalizzare il prodotto' : user?.email || 'Account attivo'}
                    </div>
                  </div>
                </button>

                {isGuest ? (
                  <button
                    onClick={onLogin}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Accedi gratis
                  </button>
                ) : (
                  <button
                    onClick={onLogout}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                  >
                    <LogOut className="h-4 w-4" />
                    Esci
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>

        <main className="mobile-content-safe flex-1 px-4 pb-8 pt-4 md:px-6 lg:px-0 lg:pr-6 lg:pt-5">
          <div className="editorial-panel rounded-[32px] px-5 py-5 md:px-7 md:py-6">
            <header className="flex flex-col gap-5 border-b border-slate-200/80 pb-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-slate-950 text-white lg:hidden">
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
                            title: `Accedi per attivare ${PRODUCT_BRAND.name}`,
                            description: 'Salva temi, usa i crediti mensili e attiva le aree personali con un account gratuito.',
                            recommendedPlan: 'plus',
                          }
                        : {
                            reason: 'feature',
                            title: PRODUCT_BRAND.plansTitle,
                            description: 'Piu crediti, piu continuita e accesso ai layer premium quando servono.',
                            recommendedPlan: entitlements.plan === 'pro' ? 'pro' : 'plus',
                          }
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <WandSparkles className="h-4 w-4 text-rose-300" />
                  {isGuest ? 'Attiva i crediti' : `${getPlanLabel(entitlements.plan)} - ${entitlements.creditsBalance} crediti`}
                </button>
              </div>
            </header>

            <div className="pt-6 md:pt-7">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentView}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>

      <nav className="mobile-nav-safe fixed inset-x-3 z-50 rounded-[26px] border border-white/70 bg-[rgba(251,249,244,0.94)] px-3 pt-2 shadow-[0_22px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:hidden">
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
              {currentView === item.id && (
                <motion.div
                  layoutId="activeNavMobile"
                  className="absolute inset-0 rounded-[18px] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.1)]"
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }}
                />
              )}
              <item.icon className="relative h-5 w-5" />
              <span className="relative">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
