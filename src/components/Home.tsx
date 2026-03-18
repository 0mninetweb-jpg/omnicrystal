import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  Check,
  Globe2,
  Loader2,
  Lock,
  Mail,
  Quote,
  Radar,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { generateCrystalQuotes } from '../services/geminiService';
import { CrystalQuote, CardData } from '../types/crystal';
import { OnboardingState } from '../types/onboarding';
import { mockCards } from '../data/mockData';
import { useAppRuntime } from '../context/AppRuntimeContext';
import { PRODUCT_BRAND, RUNTIME_COPY, SECTION_COPY, WORLD_SIM_BRAND } from '../content/brand';
import { getDefaultWorldSimPreviewDataset } from '../lib/worldSimScene';
import { formatProbabilityLabel, getMarketSignalLabel, getMarketSignalState, hasPredictionMarketFrame } from '../lib/predictionMarket';
import { scheduleIdleTask } from '../lib/scheduleIdle';
import { cn } from './CrystalCard';
import type { WorldSimSceneData } from '../types/worldSim';

type HomeProps = {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
  onNavigate: (view: 'forecast' | 'nextletter' | 'watchlist' | 'profile') => void;
  onForecastIntent: (query?: string) => void;
  onOpenTutorial: () => void;
  onOpenWorldSimScene: (data: WorldSimSceneData) => void;
  onboardingState: OnboardingState;
};

type WatchlistPulseItem = {
  id: string;
  entity: string;
  type: string;
  pulse: string;
  trend?: 'up' | 'down' | 'flat';
  domains?: string[];
};

const HERO_EXAMPLES = [
  'How likely is an energy price jump in Italy over the next 30 days?',
  'Will Rome face another overtourism spike by this summer?',
  'Will AI automation in contact centers accelerate within 6 months?',
];

const SIGNALS_TO_WATCH = [
  { id: 'hazard-1', title: 'European energy pressure', region: 'Europe', probability: 72, horizon: '90d' },
  { id: 'hazard-2', title: 'Retail logistics slowdown', region: 'Central Europe', probability: 58, horizon: '30d' },
  { id: 'hazard-3', title: 'AI platform trust shock', region: 'Global', probability: 41, horizon: '14d' },
];

const CITY_PULSE: Array<{ city: string; signal: string; score: number; trend: 'up' | 'down' | 'flat' }> = [
  { city: 'Milan', signal: 'Housing repricing pressure', score: 94, trend: 'up' },
  { city: 'Rome', signal: 'Tourism and mobility under pressure', score: 89, trend: 'up' },
  { city: 'Turin', signal: 'Manufacturing in transition', score: 77, trend: 'flat' },
];

const GUEST_WATCHLIST: WatchlistPulseItem[] = [
  { id: 'guest-1', entity: 'Rome', type: 'City', pulse: 'Hot mobility', trend: 'up', domains: ['Tourism', 'Transit'] },
  { id: 'guest-2', entity: 'Italy', type: 'Country', pulse: 'Macro under watch', trend: 'flat', domains: ['Inflation', 'Energy'] },
  { id: 'guest-3', entity: 'AI orchestration', type: 'Industry', pulse: 'Acceleration', trend: 'up', domains: ['Hiring', 'Adoption'] },
];

function getWatchlistTrendTone(trend?: 'up' | 'down' | 'flat') {
  if (trend === 'up') return 'text-emerald-600 bg-emerald-50 border-emerald-100';
  if (trend === 'down') return 'text-rose-600 bg-rose-50 border-rose-100';
  return 'text-slate-600 bg-slate-100 border-slate-200';
}

function getMarketTone(state: ReturnType<typeof getMarketSignalState>) {
  if (state === 'calibrated') return 'border-sky-100 bg-sky-50 text-sky-700';
  if (state === 'diverge') return 'border-rose-100 bg-rose-50 text-rose-700';
  if (state === 'watch') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
}

export function Home({
  user,
  isGuest,
  onLogin,
  onNavigate,
  onForecastIntent,
  onOpenTutorial,
  onOpenWorldSimScene,
  onboardingState,
}: HomeProps) {
  const capabilities = useAppRuntime();
  const [quotes, setQuotes] = useState<CrystalQuote[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<CrystalQuote | null>(null);
  const [savedQuotes, setSavedQuotes] = useState<string[]>([]);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistPulseItem[]>(GUEST_WATCHLIST);
  const [todayCards, setTodayCards] = useState<CardData[]>(mockCards.slice(0, 3));
  const worldSimEnabled = capabilities.worldSimBetaAvailable;
  const worldSimMode = worldSimEnabled ? 'live' : 'preview';
  const worldSimLabel = capabilities.worldSimAvailable
    ? WORLD_SIM_BRAND.name
    : worldSimEnabled
      ? WORLD_SIM_BRAND.betaName
      : WORLD_SIM_BRAND.previewName;

  useEffect(() => {
    return scheduleIdleTask(() => {
      const fetchQuotes = async () => {
        setIsLoadingQuotes(true);
        try {
          const result = await generateCrystalQuotes();
          setQuotes((result.quotes || []).slice(0, 3));
        } catch (fetchError) {
          console.error('Error fetching quotes:', fetchError);
        } finally {
          setIsLoadingQuotes(false);
        }
      };

      void fetchQuotes();
    }, 1400);
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setWatchlistItems(GUEST_WATCHLIST);
      setTodayCards(mockCards.slice(0, 3));
      return;
    }

    const watchlistQuery = query(collection(db, 'users', user.uid, 'watchlist'), orderBy('createdAt', 'desc'), limit(4));
    const cardsQuery = query(collection(db, 'users', user.uid, 'cards'), orderBy('createdAt', 'desc'), limit(3));

    const unsubWatchlist = onSnapshot(
      watchlistQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({
          id: item.id,
          entity: String(item.data().entity || 'Entity'),
          type: String(item.data().type || 'Custom'),
          pulse: String(item.data().pulse || 'Monitoring'),
          trend:
              item.data().trend === 'down' || item.data().trend === 'up' || item.data().trend === 'flat'
                ? item.data().trend
                : 'flat',
          domains: Array.isArray(item.data().domains) ? item.data().domains.map(String) : [],
        }));

        setWatchlistItems(items.length > 0 ? items : GUEST_WATCHLIST.slice(0, 2));
      },
      (snapshotError) => handleFirestoreError(snapshotError, OperationType.LIST, `users/${user.uid}/watchlist`)
    );

    const unsubCards = onSnapshot(
      cardsQuery,
      (snapshot) => {
        const cards = snapshot.docs.map((item) => item.data() as CardData);
        setTodayCards(cards.length > 0 ? cards : mockCards.slice(0, 3));
      },
      (snapshotError) => handleFirestoreError(snapshotError, OperationType.LIST, `users/${user.uid}/cards`)
    );

    return () => {
      unsubWatchlist();
      unsubCards();
    };
  }, [user?.uid]);

  const checklistItems = useMemo(
    () => [
      {
        id: 'firstForecast',
        title: 'Run your first forecast',
        description: 'Open Forecast and try one simple 30-day question.',
        done: onboardingState.completedChecklist.firstForecast,
        action: () => onForecastIntent(HERO_EXAMPLES[0]),
      },
      {
        id: 'firstWatchlist',
        title: 'Save one watchlist item',
        description: 'Track a city, country, or sector you want to keep in view.',
        done: onboardingState.completedChecklist.firstWatchlist,
        action: () => onNavigate('watchlist'),
      },
      {
        id: 'openedBriefing',
        title: 'Open Nextletter',
        description: 'See how the same signals become a calmer daily read.',
        done: onboardingState.completedChecklist.openedBriefing,
        action: () => onNavigate('nextletter'),
      },
    ],
    [onForecastIntent, onNavigate, onboardingState.completedChecklist]
  );

  const featuredWorldSimScene = useMemo(
    () => getDefaultWorldSimPreviewDataset('public-opinion', worldSimMode),
    [worldSimMode]
  );

  const worldSimPreviewCards = useMemo(
    () => [
      getDefaultWorldSimPreviewDataset('public-opinion', worldSimMode),
      getDefaultWorldSimPreviewDataset('geopolitical-escalation', worldSimMode),
    ],
    [worldSimMode]
  );

  const handleSaveQuote = async (quote: CrystalQuote) => {
    if (!user?.uid) {
      onLogin?.();
      return;
    }

    setIsSavingQuote(true);
    try {
      await setDoc(doc(db, 'users', user.uid, 'saved_quotes', quote.quote_id), {
        ...quote,
        savedAt: serverTimestamp(),
      });
      setSavedQuotes((current) => (current.includes(quote.quote_id) ? current : [...current, quote.quote_id]));
    } catch (saveError) {
      handleFirestoreError(saveError, OperationType.WRITE, `users/${user.uid}/saved_quotes/${quote.quote_id}`);
    } finally {
      setIsSavingQuote(false);
    }
  };

  return (
    <div className="space-y-8 md:space-y-10">
      <section className="hero-surface overflow-hidden rounded-[40px] px-6 py-8 md:px-8 md:py-10">
        <div className="hero-mesh pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-[260px] w-[260px] rounded-full bg-[rgba(20,83,232,0.09)] blur-[90px]" />
        <div className="pointer-events-none absolute bottom-[-120px] left-[20%] h-[220px] w-[220px] rounded-full bg-[rgba(217,93,116,0.08)] blur-[100px]" />

        <div className="relative grid gap-7 lg:grid-cols-[1.18fr_0.82fr] lg:items-end">
          <div className="max-w-4xl">
            <div className="flex flex-wrap gap-2">
              <span className="hero-chip inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {SECTION_COPY.home.heroKicker}
              </span>
              <span className="hero-chip inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Light-first shell
              </span>
              <span className="hero-chip inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {worldSimLabel}
              </span>
            </div>
            <h2 className="mt-5 max-w-3xl text-4xl font-display font-semibold tracking-[-0.04em] text-slate-950 md:text-7xl md:leading-[0.96]">
              {SECTION_COPY.home.heroTitle}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 md:text-lg">{SECTION_COPY.home.heroBody}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => onForecastIntent(HERO_EXAMPLES[0])}
                className="inline-flex items-center gap-2 rounded-full bg-[#1453e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1248c8]"
              >
                {PRODUCT_BRAND.primaryCta}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={onOpenTutorial}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                {PRODUCT_BRAND.tutorialLabel}
              </button>
              {isGuest && (
                <button
                  onClick={onLogin}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  <Lock className="h-4 w-4" />
                  Sign in for free
                </button>
              )}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="metric-card rounded-[24px] px-4 py-4">
                <div className="section-kicker !text-slate-500">Forecast</div>
                <div className="mt-2 text-2xl font-display font-semibold text-slate-950">Direct</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">Ask one concrete question and get a readable answer fast.</div>
              </div>
              <div className="metric-card rounded-[24px] px-4 py-4">
                <div className="section-kicker !text-slate-500">{worldSimLabel}</div>
                <div className="mt-2 text-2xl font-display font-semibold text-slate-950">Layered</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">Open the observatory when actors and pressure matter more than a single number.</div>
              </div>
              <div className="metric-card rounded-[24px] px-4 py-4">
                <div className="section-kicker !text-slate-500">Runtime</div>
                <div className="mt-2 text-2xl font-display font-semibold capitalize text-slate-950">{capabilities.runtimeMode}</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">{capabilities.statusDetail}</div>
              </div>
            </div>

            <div className="editorial-divider mt-8" />

            <div className="mt-6 flex flex-wrap gap-2">
              {HERO_EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => onForecastIntent(example)}
                  className="hero-chip rounded-full px-4 py-2 text-left text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="oracle-panel relative overflow-hidden rounded-[38px] p-6 md:p-7">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(255,255,255,0.12),transparent_30%),radial-gradient(circle_at_20%_90%,rgba(56,189,248,0.12),transparent_34%)]" />
            <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div className="section-kicker !text-rose-200">{worldSimLabel}</div>
              <span className="glass-panel rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                {capabilities.worldSimAvailable ? 'Simulation live' : worldSimEnabled ? 'Beta runtime' : 'Guided preview'}
              </span>
            </div>
            <h3 className="mt-3 max-w-md text-2xl font-display font-semibold text-white md:text-[2rem] md:leading-tight">{WORLD_SIM_BRAND.teaserTitle}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {capabilities.worldSimAvailable
                  ? WORLD_SIM_BRAND.teaserBody
                  : worldSimEnabled
                    ? capabilities.worldSimStatusDetail
                    : RUNTIME_COPY.worldSimPreview}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ['Actors', 'Who moves first'],
                ['Pressure', 'Where pressure builds'],
                ['Delta', 'What changes the odds'],
              ].map(([kicker, item]) => (
                <div
                  key={item}
                  className="glass-panel rounded-[22px] px-4 py-4 text-white"
                >
                  <div className="section-kicker !text-slate-300">{kicker}</div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm font-medium">
                    <span>{item}</span>
                    <Waypoints className="h-4 w-4 text-rose-200" />
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => onOpenWorldSimScene(featuredWorldSimScene)}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              {WORLD_SIM_BRAND.enterLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="mt-5 text-xs leading-6 text-slate-400">{WORLD_SIM_BRAND.honestNote}</p>
            </div>
          </div>
        </div>
      </section>

      {!checklistItems.every((item) => item.done) && (
        <section className="editorial-panel content-auto rounded-[32px] px-6 py-6 md:px-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="section-kicker">First Moves</div>
              <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">Three quick moves to understand the product.</h3>
            </div>
            <button
              onClick={onOpenTutorial}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              {PRODUCT_BRAND.tutorialReplayLabel}
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {checklistItems.map((item) => (
              <button
                key={item.id}
                onClick={item.action}
                className={cn(
                  'rounded-[24px] border px-5 py-5 text-left transition',
                  item.done ? 'border-emerald-100 bg-emerald-50' : 'data-well hover:border-slate-300'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-display font-semibold text-slate-950">{item.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p>
                  </div>
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
                      item.done ? 'border-emerald-200 bg-white text-emerald-600' : 'border-slate-200 bg-slate-50 text-slate-400'
                    )}
                  >
                    {item.done ? <Check className="h-5 w-5" /> : <ArrowRight className="h-4 w-4" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="content-auto grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="editorial-panel rounded-[36px] p-6 md:p-7">
          <div className="section-kicker">Today</div>
          <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">The signals worth reading right now.</h3>
          <div className="mt-6 grid gap-4">
            {todayCards.map((card) => (
              <div key={card.card_id} className="data-well rounded-[26px] p-5">
                {(() => {
                  const marketFrame = card.prediction_market_frame || card.world_sim?.prediction_market_frame || null;
                  const hasMarketFrame = hasPredictionMarketFrame(marketFrame);
                  const marketState = getMarketSignalState(marketFrame);

                  return (
                    <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{card.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{card.summary}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {Math.round(card.trust_layer.confidence_score * 100)}% trust
                  </span>
                </div>
                {hasMarketFrame && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold', getMarketTone(marketState))}>
                      {getMarketSignalLabel(marketFrame)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                      Market {formatProbabilityLabel(marketFrame?.implied_probability ?? marketFrame?.prior_probability)}
                    </span>
                  </div>
                )}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>

        <div className="editorial-panel rounded-[36px] p-6 md:p-7">
          <div className="section-kicker">Briefing Preview</div>
          <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">A cleaner preview of Nextletter.</h3>
          <div className="mt-6 space-y-4">
            <div className="data-well rounded-[26px] p-5">
              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Mail className="h-4 w-4 text-[#1453e8]" />
                Global Edition
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                The signals that matter, arranged into a calmer daily read.
              </p>
            </div>
            <div className="data-well rounded-[26px] p-5">
              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Sparkles className="h-4 w-4 text-rose-500" />
                {worldSimLabel}
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                On higher-stakes themes, Nextletter can reuse the same deeper layer as Forecast so the answer and the story stay aligned.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('nextletter')}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open Nextletter
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="content-auto grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="editorial-panel rounded-[36px] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-kicker">{worldSimLabel}</div>
              <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">When it is worth opening the simulation layer.</h3>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {worldSimPreviewCards.map((preview) => (
              <button
                key={preview.id}
                onClick={() => onOpenWorldSimScene(preview)}
                className="data-well w-full rounded-[26px] p-5 text-left transition hover:border-slate-300 hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500">
                  <Sparkles className="h-4 w-4" />
                  {worldSimLabel}
                </div>
                <h4 className="mt-3 text-lg font-display font-semibold text-slate-950">{preview.title}</h4>
                <p className="mt-2 text-sm leading-7 text-slate-600">{preview.subtitle}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {preview.actors.slice(0, 3).map((detail) => (
                    <span
                      key={detail}
                      className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700"
                    >
                      {detail}
                    </span>
                  ))}
                </div>
              </button>
            ))}
            {!worldSimEnabled && (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-800">
                {RUNTIME_COPY.worldSimPreview}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="editorial-panel rounded-[36px] p-6">
            <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Radar className="h-4 w-4 text-amber-500" />
              Signals to watch
            </div>
            <div className="mt-5 space-y-3">
              {SIGNALS_TO_WATCH.map((hazard) => (
                <div key={hazard.id} className="data-well rounded-[24px] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{hazard.title}</div>
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        {hazard.region} - {hazard.horizon}
                      </div>
                    </div>
                    <div className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                      {hazard.probability}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="editorial-panel rounded-[36px] p-6">
            <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Globe2 className="h-4 w-4 text-emerald-500" />
              City Pulse
            </div>
            <div className="mt-5 space-y-3">
              {CITY_PULSE.map((city) => (
                <div key={city.city} className="data-well rounded-[24px] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{city.city}</div>
                      <div className="mt-1 text-xs font-medium text-slate-500">{city.signal}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', getWatchlistTrendTone(city.trend))}>
                        {city.trend === 'up' ? 'Up' : city.trend === 'down' ? 'Down' : 'Stable'}
                      </span>
                      <span className="text-sm font-semibold text-slate-950">{city.score}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="content-auto grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="editorial-panel rounded-[36px] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-kicker">Watchlist Pulse</div>
              <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">The things you are tracking.</h3>
            </div>
            <button
              onClick={() => (isGuest ? onLogin?.() : onNavigate('watchlist'))}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              {isGuest ? 'Sign in to save' : 'Open Watchlist'}
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {watchlistItems.slice(0, 4).map((item) => (
              <div key={item.id} className="data-well rounded-[26px] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-950">{item.entity}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.type}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(item.domains || []).slice(0, 3).map((domain) => (
                        <span
                          key={domain}
                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600"
                        >
                          {domain}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold', getWatchlistTrendTone(item.trend))}>
                      {item.pulse}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="editorial-panel rounded-[36px] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-kicker">Crystal Quotes</div>
              <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">Fast reads for the week.</h3>
            </div>
            {isLoadingQuotes && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {quotes.map((quote) => (
              <button
                key={quote.quote_id}
                onClick={() => setSelectedQuote(quote)}
                className="data-well rounded-[26px] p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Quote className="h-4 w-4 text-[#1453e8]" />
                  {quote.context}
                </div>
                <p className="mt-4 text-lg font-display font-semibold leading-tight text-slate-950">&quot;{quote.text}&quot;</p>
                <div className="mt-4 text-xs font-medium text-slate-500">{quote.author}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {selectedQuote && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8">
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedQuote(null)}
              className="absolute inset-0 bg-[rgba(15,23,42,0.48)] backdrop-blur-lg"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              className="relative w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/60 bg-[rgba(251,249,244,0.98)] shadow-[0_32px_90px_rgba(15,23,42,0.22)]"
            >
              <div className="border-b border-slate-200/80 px-6 py-5 md:px-8">
                <div className="section-kicker">Quote breakdown</div>
                <h3 className="mt-3 text-3xl font-display font-semibold text-slate-950">&quot;{selectedQuote.text}&quot;</h3>
                <div className="mt-3 flex items-center gap-3 text-sm font-medium text-slate-500">
                  <Sparkles className="h-4 w-4 text-[#1453e8]" />
                  {selectedQuote.author}
                </div>
              </div>

              <div className="grid gap-6 px-6 py-6 md:grid-cols-2 md:px-8 md:py-8">
                <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                  <div className="section-kicker !text-slate-500">Full read</div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{selectedQuote.analysis.full_text}</p>
                </div>
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="section-kicker !text-slate-500">Drivers</div>
                    <div className="mt-3 space-y-2">
                      {selectedQuote.analysis.drivers.map((driver) => (
                        <div key={driver} className="flex items-start gap-3 text-sm font-medium text-slate-600">
                          <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1453e8]" />
                          <span>{driver}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="section-kicker !text-slate-500">Impact and parallel</div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{selectedQuote.analysis.impact}</p>
                    <p className="mt-3 text-sm leading-7 text-slate-500">{selectedQuote.analysis.historical_parallel}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200/80 bg-white/70 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  A quick grounded read on the week’s signals.
                </div>
                <button
                  onClick={() => void handleSaveQuote(selectedQuote)}
                  disabled={isSavingQuote || savedQuotes.includes(selectedQuote.quote_id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition',
                    savedQuotes.includes(selectedQuote.quote_id)
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-950 text-white hover:bg-slate-800'
                  )}
                >
                  {savedQuotes.includes(selectedQuote.quote_id) ? (
                    <>
                      <Check className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-4 w-4" />
                      {isGuest ? 'Sign in to save' : 'Save analysis'}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
