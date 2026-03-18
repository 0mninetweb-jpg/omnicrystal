import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Globe2, Mail, Sparkles, Waypoints } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { CardData } from '../types/crystal';
import type { OnboardingState } from '../types/onboarding';
import type { WorldSimSceneData } from '../types/worldSim';
import { useAppRuntime } from '../context/AppRuntimeContext';
import { getDefaultWorldSimPreviewDataset } from '../lib/worldSimScene';
import { WORLD_SIM_BRAND } from '../content/brand';

type AppHomeProps = {
  user: any;
  onboardingState: OnboardingState;
  onCompleteIntro: () => void;
  onNavigate: (path: '/app/forecast' | '/app/nextletter' | '/app/watchlist' | '/app/profile') => void;
  onForecastIntent: (query?: string) => void;
  onOpenWorldSimScene: (data: WorldSimSceneData) => void;
};

type WatchlistPulseItem = {
  id: string;
  entity: string;
  type: string;
  pulse: string;
};

const FALLBACK_CARDS: Array<Pick<CardData, 'card_id' | 'title' | 'summary' | 'trust_layer'>> = [
  {
    card_id: 'fallback-1',
    title: 'European energy pressure',
    summary: 'A quick read on what may move costs and attention over the next 30 days.',
    trust_layer: {
      confidence_score: 0.76,
      confidence_tier: 'high',
      data_sufficiency_flag: 'sufficient',
      freshness: { staleness_bucket: 'fresh', as_of_utc: new Date().toISOString() },
      provenance_summary: { verification_level: 'verified', license_summary: ['internal'] },
    },
  },
  {
    card_id: 'fallback-2',
    title: 'Tourism pressure in Rome',
    summary: 'A short-horizon city read with operational implications and signals to watch.',
    trust_layer: {
      confidence_score: 0.71,
      confidence_tier: 'high',
      data_sufficiency_flag: 'sufficient',
      freshness: { staleness_bucket: 'fresh', as_of_utc: new Date().toISOString() },
      provenance_summary: { verification_level: 'verified', license_summary: ['internal'] },
    },
  },
];

const FALLBACK_WATCHLIST: WatchlistPulseItem[] = [
  { id: 'fallback-watch-1', entity: 'Rome', type: 'City', pulse: 'Mobility under pressure' },
  { id: 'fallback-watch-2', entity: 'Italy', type: 'Country', pulse: 'Macro and energy under watch' },
  { id: 'fallback-watch-3', entity: 'AI orchestration', type: 'Theme', pulse: 'Adoption accelerating' },
];

const FIRST_QUERY = 'How likely is an energy price jump in Italy over the next 30 days?';

export function AppHome({
  user,
  onboardingState,
  onCompleteIntro,
  onNavigate,
  onForecastIntent,
  onOpenWorldSimScene,
}: AppHomeProps) {
  const runtime = useAppRuntime();
  const [recentCards, setRecentCards] = useState<Array<Pick<CardData, 'card_id' | 'title' | 'summary' | 'trust_layer'>>>(FALLBACK_CARDS);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistPulseItem[]>(FALLBACK_WATCHLIST);

  useEffect(() => {
    if (!user?.uid) return;

    const cardsQuery = query(collection(db, 'users', user.uid, 'cards'), orderBy('createdAt', 'desc'), limit(3));
    const watchlistQuery = query(collection(db, 'users', user.uid, 'watchlist'), orderBy('createdAt', 'desc'), limit(4));

    const unsubscribeCards = onSnapshot(
      cardsQuery,
      (snapshot) => {
        const nextCards = snapshot.docs.map((item) => item.data() as CardData).map((card) => ({
          card_id: card.card_id,
          title: card.title,
          summary: card.summary,
          trust_layer: card.trust_layer,
        }));
        setRecentCards(nextCards.length > 0 ? nextCards : FALLBACK_CARDS);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/cards`)
    );

    const unsubscribeWatchlist = onSnapshot(
      watchlistQuery,
      (snapshot) => {
        const nextItems = snapshot.docs.map((item) => ({
          id: item.id,
          entity: String(item.data().entity || 'Item'),
          type: String(item.data().type || 'Theme'),
          pulse: String(item.data().pulse || 'Monitoring'),
        }));
        setWatchlistItems(nextItems.length > 0 ? nextItems : FALLBACK_WATCHLIST);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/watchlist`)
    );

    return () => {
      unsubscribeCards();
      unsubscribeWatchlist();
    };
  }, [user?.uid]);

  const worldSimPreview = useMemo(
    () => getDefaultWorldSimPreviewDataset('public-opinion', runtime.worldSimAvailable ? 'live' : 'preview'),
    [runtime.worldSimAvailable]
  );

  const checklistItems = [
    {
      id: 'firstForecast',
      title: 'Run your first forecast',
      done: onboardingState.completedChecklist.firstForecast,
      action: () => onForecastIntent(FIRST_QUERY),
    },
    {
      id: 'firstWatchlist',
      title: 'Save one watchlist item',
      done: onboardingState.completedChecklist.firstWatchlist,
      action: () => onNavigate('/app/watchlist'),
    },
    {
      id: 'openedBriefing',
      title: 'Open Nextletter',
      done: onboardingState.completedChecklist.openedBriefing,
      action: () => onNavigate('/app/nextletter'),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="app-surface rounded-[32px] px-6 py-7 md:px-8 md:py-9">
        <div className="max-w-4xl">
          <div className="section-kicker">Home</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-slate-950 md:text-6xl md:leading-[0.96]">
            Start with one clear question.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
            Crystal is calmer when it does less at once: one direct forecast, a few recent reads, and deeper simulation only when the question needs it.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => onForecastIntent(FIRST_QUERY)}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Run a forecast
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onNavigate('/app/nextletter')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Open Nextletter
              <Mail className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {!onboardingState.hasSeenIntro && (
        <section className="app-surface rounded-[30px] p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="section-kicker">Getting started</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Three quick moves to understand Crystal.</h2>
            </div>
            <button
              onClick={onCompleteIntro}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Hide guide
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {checklistItems.map((item) => (
              <button
                key={item.id}
                onClick={item.action}
                className={`app-card rounded-[24px] p-5 text-left transition hover:-translate-y-0.5 ${
                  item.done ? 'border-emerald-100 bg-emerald-50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-base font-semibold text-slate-900">{item.title}</div>
                  <CheckCircle2 className={`h-5 w-5 ${item.done ? 'text-emerald-600' : 'text-slate-300'}`} />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="app-surface rounded-[30px] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-kicker">Recent forecasts</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Your last reads.</h2>
            </div>
            <button
              onClick={() => onNavigate('/app/forecast')}
              className="text-sm font-semibold text-slate-600 transition hover:text-slate-950"
            >
              Open Forecast
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {recentCards.slice(0, 3).map((card) => (
              <div key={card.card_id} className="app-card rounded-[24px] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-base font-semibold text-slate-900">{card.title}</div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {Math.round(card.trust_layer.confidence_score * 100)}% trust
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">{card.summary}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="oracle-panel rounded-[30px] p-6">
          <div className="section-kicker !text-rose-200">{runtime.worldSimAvailable ? WORLD_SIM_BRAND.name : WORLD_SIM_BRAND.previewName}</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">Open the deeper chamber only when the system matters.</h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Keep the everyday app calm. Open WorldSim when actors, pressure, and second-order effects change the answer.
          </p>
          <button
            onClick={() => onOpenWorldSimScene(worldSimPreview)}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            Open {WORLD_SIM_BRAND.name}
            <Waypoints className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="app-surface rounded-[30px] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-kicker">Watchlist pulse</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">A few things in view.</h2>
            </div>
            <button
              onClick={() => onNavigate('/app/watchlist')}
              className="text-sm font-semibold text-slate-600 transition hover:text-slate-950"
            >
              Open Watchlist
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {watchlistItems.slice(0, 4).map((item) => (
              <div key={item.id} className="app-card flex items-center justify-between gap-4 rounded-[24px] p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{item.entity}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{item.type}</div>
                </div>
                <div className="text-sm text-slate-600">{item.pulse}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="app-surface rounded-[30px] p-6">
          <div className="section-kicker">Nextletter</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Read the briefing without reopening the dashboard.</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
            Nextletter becomes the calmer reading surface for signals, summaries, and what to do next. That keeps Home lighter and easier to use.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="app-card rounded-[24px] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Mail className="h-4 w-4 text-[#1453e8]" />
                Daily read
              </div>
              <div className="mt-3 text-sm leading-7 text-slate-600">A cleaner way to orient quickly without scanning many modules at once.</div>
            </div>
            <div className="app-card rounded-[24px] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Globe2 className="h-4 w-4 text-[#1453e8]" />
                Personal themes
              </div>
              <div className="mt-3 text-sm leading-7 text-slate-600">Use your profile and watchlist context to make each edition more relevant.</div>
            </div>
          </div>

          <button
            onClick={() => onNavigate('/app/nextletter')}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            Open Nextletter
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
