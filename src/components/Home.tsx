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
import { cn } from './CrystalCard';

type HomeProps = {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
  onNavigate: (view: 'forecast' | 'nextletter' | 'watchlist' | 'profile') => void;
  onForecastIntent: (query?: string) => void;
  onOpenTutorial: () => void;
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
  'Quanto e probabile un aumento delle bollette in Italia nei prossimi 30 giorni?',
  'Roma rischia un nuovo picco di over-tourism entro l estate?',
  'L automazione AI nei contact center accelerera entro 6 mesi?',
];

const SIGNALS_TO_WATCH = [
  { id: 'hazard-1', title: 'Stress energetico europeo', region: 'Europa', probability: 72, horizon: '90d' },
  { id: 'hazard-2', title: 'Rallentamento logistica retail', region: 'Europa centrale', probability: 58, horizon: '30d' },
  { id: 'hazard-3', title: 'Shock reputazionale piattaforme AI', region: 'Globale', probability: 41, horizon: '14d' },
];

const CITY_PULSE: Array<{ city: string; signal: string; score: number; trend: 'up' | 'down' | 'flat' }> = [
  { city: 'Milano', signal: 'Repricing immobiliare', score: 94, trend: 'up' },
  { city: 'Roma', signal: 'Turismo e mobilita sotto pressione', score: 89, trend: 'up' },
  { city: 'Torino', signal: 'Manifattura in transizione', score: 77, trend: 'flat' },
];

const WORLDSIM_PREVIEWS = [
  {
    title: 'Public opinion drift in Europa',
    subtitle: 'Utile quando la previsione dipende da coalizioni, pressione pubblica e reazioni a catena.',
    details: ['Who moves it', 'Where it can shift', 'What changes the odds'],
  },
  {
    title: 'Escalation geopolitica',
    subtitle: 'Utile quando uno shock puo propagarsi tra attori e sistemi, non solo nei titoli del giorno.',
    details: ['Key actors', 'Pressure points', 'Possible spillovers'],
  },
];

const GUEST_WATCHLIST: WatchlistPulseItem[] = [
  { id: 'guest-1', entity: 'Roma', type: 'City', pulse: 'Hot mobility', trend: 'up', domains: ['Tourism', 'Transit'] },
  { id: 'guest-2', entity: 'Italia', type: 'Country', pulse: 'Macro under watch', trend: 'flat', domains: ['Inflation', 'Energy'] },
  { id: 'guest-3', entity: 'AI orchestration', type: 'Industry', pulse: 'Acceleration', trend: 'up', domains: ['Hiring', 'Adoption'] },
];

function getWatchlistTrendTone(trend?: 'up' | 'down' | 'flat') {
  if (trend === 'up') return 'text-emerald-600 bg-emerald-50 border-emerald-100';
  if (trend === 'down') return 'text-rose-600 bg-rose-50 border-rose-100';
  return 'text-slate-600 bg-slate-100 border-slate-200';
}

export function Home({
  user,
  isGuest,
  onLogin,
  onNavigate,
  onForecastIntent,
  onOpenTutorial,
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

  useEffect(() => {
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
        title: 'Fai il primo forecast',
        description: 'Apri Forecast e prova una domanda semplice a 30 giorni.',
        done: onboardingState.completedChecklist.firstForecast,
        action: () => onForecastIntent(HERO_EXAMPLES[0]),
      },
      {
        id: 'firstWatchlist',
        title: 'Salva una voce in Watchlist',
        description: 'Monitora una citta, un paese o un settore che vuoi seguire.',
        done: onboardingState.completedChecklist.firstWatchlist,
        action: () => onNavigate('watchlist'),
      },
      {
        id: 'openedBriefing',
        title: 'Apri Nextletter',
        description: 'Vedi come i segnali diventano una lettura piu ordinata e utile.',
        done: onboardingState.completedChecklist.openedBriefing,
        action: () => onNavigate('nextletter'),
      },
    ],
    [onForecastIntent, onNavigate, onboardingState.completedChecklist]
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

  const worldSimLabel = capabilities.worldSimAvailable ? WORLD_SIM_BRAND.name : WORLD_SIM_BRAND.previewName;

  return (
    <div className="space-y-8 md:space-y-10">
      <section className="editorial-panel overflow-hidden rounded-[32px] px-6 py-8 md:px-8 md:py-10">
        <div className="grid gap-7 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <div className="section-kicker">{SECTION_COPY.home.heroKicker}</div>
            <h2 className="mt-4 max-w-3xl text-4xl font-display font-semibold tracking-tight text-slate-950 md:text-6xl">
              {SECTION_COPY.home.heroTitle}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 md:text-lg">{SECTION_COPY.home.heroBody}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => onForecastIntent(HERO_EXAMPLES[0])}
                className="inline-flex items-center gap-2 rounded-full bg-[#1453e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1248c8]"
              >
                Fai un forecast
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
                  Accedi gratis
                </button>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {HERO_EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => onForecastIntent(example)}
                  className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-left text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="oracle-panel rounded-[32px] p-6 md:p-7">
            <div className="section-kicker !text-rose-200">{worldSimLabel}</div>
            <h3 className="mt-3 text-2xl font-display font-semibold text-white md:text-3xl">
              Un layer premium per le domande piu delicate.
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {capabilities.worldSimAvailable
                ? 'Usalo quando il forecast dipende da reazioni a catena, attori chiave e punti di svolta difficili da leggere con un solo numero.'
                : RUNTIME_COPY.worldSimPreview}
            </p>
            <div className="mt-6 grid gap-3">
              {WORLDSIM_PREVIEWS[0].details.map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white"
                >
                  <span>{item}</span>
                  <Waypoints className="h-4 w-4 text-rose-200" />
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs leading-6 text-slate-400">{WORLD_SIM_BRAND.honestNote}</p>
          </div>
        </div>
      </section>

      {!checklistItems.every((item) => item.done) && (
        <section className="editorial-panel rounded-[28px] px-6 py-6 md:px-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="section-kicker">First Moves</div>
              <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">Tre mosse per capire il prodotto.</h3>
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
                  item.done ? 'border-emerald-100 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
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

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="editorial-panel rounded-[32px] p-6 md:p-7">
          <div className="section-kicker">Today</div>
          <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">I segnali piu utili da guardare adesso.</h3>
          <div className="mt-6 grid gap-4">
            {todayCards.map((card) => (
              <div key={card.card_id} className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{card.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{card.summary}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {Math.round(card.trust_layer.confidence_score * 100)}% trust
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="editorial-panel rounded-[32px] p-6 md:p-7">
          <div className="section-kicker">Briefing Preview</div>
          <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">Una preview semplice di Nextletter.</h3>
          <div className="mt-6 space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Mail className="h-4 w-4 text-[#1453e8]" />
                Global Edition
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                I segnali che contano davvero, in una lettura piu ordinata e meno rumorosa.
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Sparkles className="h-4 w-4 text-rose-500" />
                {worldSimLabel}
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Sui temi piu delicati, Nextletter puo riusare lo stesso layer profondo del forecast per mantenere coerenza tra risposta e racconto.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('nextletter')}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Apri Nextletter
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="editorial-panel rounded-[32px] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-kicker">{worldSimLabel}</div>
              <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">Quando entra il layer premium.</h3>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {WORLDSIM_PREVIEWS.map((preview) => (
              <div key={preview.title} className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-500">
                  <Sparkles className="h-4 w-4" />
                  {capabilities.worldSimAvailable ? WORLD_SIM_BRAND.name : WORLD_SIM_BRAND.previewName}
                </div>
                <h4 className="mt-3 text-lg font-display font-semibold text-slate-950">{preview.title}</h4>
                <p className="mt-2 text-sm leading-7 text-slate-600">{preview.subtitle}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {preview.details.map((detail) => (
                    <span
                      key={detail}
                      className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700"
                    >
                      {detail}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!capabilities.worldSimAvailable && (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-800">
                {RUNTIME_COPY.worldSimPreview}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="editorial-panel rounded-[32px] p-6">
            <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Radar className="h-4 w-4 text-amber-500" />
              Signals to watch
            </div>
            <div className="mt-5 space-y-3">
              {SIGNALS_TO_WATCH.map((hazard) => (
                <div key={hazard.id} className="rounded-[22px] border border-slate-200 bg-white p-4">
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

          <div className="editorial-panel rounded-[32px] p-6">
            <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Globe2 className="h-4 w-4 text-emerald-500" />
              City Pulse
            </div>
            <div className="mt-5 space-y-3">
              {CITY_PULSE.map((city) => (
                <div key={city.city} className="rounded-[22px] border border-slate-200 bg-white p-4">
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

      <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="editorial-panel rounded-[32px] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-kicker">Watchlist Pulse</div>
              <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">I temi che stai seguendo.</h3>
            </div>
            <button
              onClick={() => (isGuest ? onLogin?.() : onNavigate('watchlist'))}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              {isGuest ? 'Accedi per salvare' : 'Apri Watchlist'}
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {watchlistItems.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
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

        <div className="editorial-panel rounded-[32px] p-6 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="section-kicker">Crystal Quotes</div>
              <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">Le letture rapide della settimana.</h3>
            </div>
            {isLoadingQuotes && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {quotes.map((quote) => (
              <button
                key={quote.quote_id}
                onClick={() => setSelectedQuote(quote)}
                className="rounded-[24px] border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300"
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
                  Una lettura rapida grounded sui trend della settimana.
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
                      Salvato
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-4 w-4" />
                      {isGuest ? 'Accedi per salvare' : 'Salva analisi'}
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
