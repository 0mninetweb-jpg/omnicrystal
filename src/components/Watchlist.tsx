import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  BellOff,
  BookmarkPlus,
  ChevronRight,
  Globe2,
  Lock,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useCrystalPlan } from '../context/CrystalPlanContext';
import { getPlanLabel } from '../lib/crystalPlans';
import { formatProbabilityLabel, getMarketSignalLabel, getMarketSignalState, hasPredictionMarketFrame } from '../lib/predictionMarket';
import { SECTION_COPY } from '../content/brand';
import { getPolymarketPulse } from '../services/geminiService';
import type { PredictionMarketFrame } from '../types/crystal';
import { cn } from './CrystalCard';

interface WatchlistProps {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
  onChecklistComplete?: () => void;
}

type WatchlistItem = {
  id: string;
  entity: string;
  type: string;
  domains: string[];
  alerts: boolean;
  pulse: string;
  trend?: 'up' | 'down' | 'flat';
};

const GUEST_ITEMS: WatchlistItem[] = [
  { id: 'guest-1', entity: 'Roma', type: 'City', domains: ['Tourism', 'Mobility', 'Weather'], alerts: true, pulse: 'High activity', trend: 'up' },
  { id: 'guest-2', entity: 'Italia', type: 'Country', domains: ['Inflation', 'Macro', 'Energy'], alerts: true, pulse: 'Under watch', trend: 'flat' },
  { id: 'guest-3', entity: 'AI orchestration', type: 'Industry', domains: ['Jobs', 'Adoption'], alerts: false, pulse: 'Acceleration', trend: 'up' },
];

function getTone(trend?: 'up' | 'down' | 'flat') {
  if (trend === 'up') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (trend === 'down') return 'border-rose-100 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function getMarketTone(state: ReturnType<typeof getMarketSignalState>) {
  if (state === 'calibrated') return 'border-sky-100 bg-sky-50 text-sky-700';
  if (state === 'diverge') return 'border-rose-100 bg-rose-50 text-rose-700';
  if (state === 'watch') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
}

function buildPulseQueryPlan(item: WatchlistItem) {
  const type = (item.type || '').toLowerCase();
  const entityType = type.includes('city') ? 'city' : type.includes('country') ? 'country' : 'theme';
  const domain =
    entityType === 'city'
      ? 'A.7.city_pulse.micro_area_change'
      : entityType === 'country'
        ? 'A.11.geopolitics.trade_tensions'
        : 'A.2.markets.equity_indices';

  return {
    domain_id: domain,
    horizons: [{ horizon_id: '30d' }],
    entities: [
      {
        label: item.entity,
        entity_type: entityType,
      },
    ],
    filters: {
      source: 'watchlist',
    },
  };
}

export function Watchlist({ user, isGuest, onLogin, onChecklistComplete }: WatchlistProps) {
  const { entitlements, openUpgrade } = useCrystalPlan();
  const [isAdding, setIsAdding] = useState(false);
  const [newEntity, setNewEntity] = useState('');
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>(GUEST_ITEMS);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [marketPulseById, setMarketPulseById] = useState<Record<string, PredictionMarketFrame | null>>({});

  useEffect(() => {
    if (!user?.uid) {
      setWatchlistItems(GUEST_ITEMS);
      return;
    }

    const watchlistQuery = query(collection(db, 'users', user.uid, 'watchlist'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      watchlistQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({
          id: item.id,
          entity: String(item.data().entity || 'Entity'),
          type: String(item.data().type || 'Custom'),
          domains: Array.isArray(item.data().domains) ? item.data().domains.map(String) : [],
          alerts: Boolean(item.data().alerts),
          pulse: String(item.data().pulse || 'Monitoring'),
          trend:
            item.data().trend === 'down' || item.data().trend === 'up' || item.data().trend === 'flat'
              ? item.data().trend
              : 'flat',
        }));
        setWatchlistItems(items);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/watchlist`)
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (user?.uid && watchlistItems.length > 0) {
      onChecklistComplete?.();
    }
  }, [onChecklistComplete, user?.uid, watchlistItems.length]);

  useEffect(() => {
    if (!user?.uid || watchlistItems.length === 0) {
      setMarketPulseById({});
      return;
    }

    let active = true;

    const fetchPulse = async () => {
      const entries = await Promise.all(
        watchlistItems.slice(0, 6).map(async (item) => {
          try {
            const queryText = [item.entity, ...(item.domains || [])].filter(Boolean).join(' ');
            const frame = (await getPolymarketPulse(queryText, buildPulseQueryPlan(item))) as PredictionMarketFrame | null;
            return [item.id, frame || null] as const;
          } catch (pulseError) {
            console.error('Watchlist market pulse error:', pulseError);
            return [item.id, null] as const;
          }
        })
      );

      if (active) {
        setMarketPulseById(Object.fromEntries(entries));
      }
    };

    void fetchPulse();

    return () => {
      active = false;
    };
  }, [user?.uid, watchlistItems]);

  const toggleAlerts = async (id: string, currentAlerts: boolean) => {
    if (!user?.uid) return;

    try {
      await setDoc(doc(db, 'users', user.uid, 'watchlist', id), { alerts: !currentAlerts }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/watchlist/${id}`);
    }
  };

  const handleAddEntity = async () => {
    if (!newEntity.trim()) return;
    if (!user?.uid) {
      onLogin?.();
      return;
    }

    if (watchlistItems.length >= entitlements.watchlistLimit) {
      if (entitlements.plan === 'pro') {
        setLimitMessage('Hai raggiunto il limite massimo della watchlist Pro.');
      } else {
        openUpgrade({
          reason: 'feature',
          title: 'La tua watchlist vuole piu spazio',
          description:
            entitlements.plan === 'free'
              ? 'Free include fino a 5 entita. Passa a Plus per monitorarne 25.'
              : 'Plus include fino a 25 entita. Passa a Pro per arrivare a 100.',
          recommendedPlan: entitlements.plan === 'free' ? 'plus' : 'pro',
          sourceView: 'watchlist',
        });
      }
      return;
    }

    try {
      const reference = doc(collection(db, 'users', user.uid, 'watchlist'));
      await setDoc(reference, {
        entity: newEntity.trim(),
        type: 'Custom',
        domains: ['General'],
        alerts: true,
        pulse: 'Monitoring',
        trend: 'flat',
        createdAt: serverTimestamp(),
      });
      setNewEntity('');
      setIsAdding(false);
      setLimitMessage(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/watchlist`);
    }
  };

  const removeEntity = async (id: string) => {
    if (!user?.uid) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'watchlist', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/watchlist/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <section className="editorial-panel rounded-[32px] p-6 md:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="section-kicker">{SECTION_COPY.watchlist.heroKicker}</div>
            <h2 className="mt-3 text-4xl font-display font-semibold tracking-tight text-slate-950 md:text-5xl">
              {SECTION_COPY.watchlist.heroTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{SECTION_COPY.watchlist.heroBody}</p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="section-kicker">Current Capacity</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                {isGuest ? 'Guest' : getPlanLabel(entitlements.plan)}
              </span>
              <span className="text-sm font-semibold text-slate-700">
                {isGuest ? 'Accedi per salvare la tua watchlist' : `${watchlistItems.length} / ${entitlements.watchlistLimit} entita`}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="editorial-panel rounded-[32px] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm leading-7 text-slate-500">
            Salva una citta, un paese o un settore. Watchlist lo riusa poi in Home, Forecast e Nextletter.
          </div>
          {isGuest ? (
            <button
              onClick={onLogin}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Lock className="h-4 w-4" />
              Accedi per gestire
            </button>
          ) : (
            <button
              onClick={() => setIsAdding((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full bg-[#1453e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1248c8]"
            >
              <BookmarkPlus className="h-4 w-4" />
              Aggiungi entita
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={newEntity}
                    onChange={(event) => {
                      setNewEntity(event.target.value);
                      if (limitMessage) setLimitMessage(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleAddEntity();
                      }
                    }}
                    placeholder="Es: Milano, Giappone, semiconduttori..."
                    className="rounded-[22px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium text-slate-900 outline-none transition focus:border-[#1453e8] focus:bg-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsAdding(false)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={() => void handleAddEntity()}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      Aggiungi
                    </button>
                  </div>
                </div>
                {limitMessage && <p className="mt-4 text-sm font-medium text-rose-600">{limitMessage}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="grid gap-4">
        {watchlistItems.length === 0 ? (
          <div className="editorial-panel rounded-[32px] p-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Activity className="h-8 w-8" />
            </div>
            <h3 className="mt-5 text-2xl font-display font-semibold text-slate-950">Nessuna entita monitorata.</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
              Aggiungi il tuo primo nodo alla watchlist per far comparire il pulse in Home e avere un contesto piu
              utile nei forecast.
            </p>
          </div>
        ) : (
          watchlistItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="editorial-panel rounded-[30px] p-5 md:p-6"
            >
              {(() => {
                const marketFrame = marketPulseById[item.id];
                const hasMarketFrame = hasPredictionMarketFrame(marketFrame);
                const marketState = getMarketSignalState(marketFrame);

                return (
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-slate-200 bg-white text-slate-500">
                    {item.type.toLowerCase().includes('city') ? (
                      <MapPin className="h-6 w-6" />
                    ) : item.type.toLowerCase().includes('country') ? (
                      <Globe2 className="h-6 w-6" />
                    ) : (
                      <Activity className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-2xl font-display font-semibold text-slate-950">{item.entity}</h3>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.type}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.domains.map((domain) => (
                        <span
                          key={domain}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600"
                        >
                          {domain}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-5">
                  <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
                    <div className="section-kicker">Pulse</div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', getTone(item.trend))}>
                        {item.pulse}
                      </span>
                    </div>
                  </div>

                  {hasMarketFrame && (
                    <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
                      <div className="section-kicker">Market pulse</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', getMarketTone(marketState))}>
                          {getMarketSignalLabel(marketFrame)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                          Market {formatProbabilityLabel(marketFrame?.implied_probability ?? marketFrame?.prior_probability)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void toggleAlerts(item.id, item.alerts)}
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-full border transition',
                        item.alerts
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : 'border-slate-200 bg-white text-slate-500 hover:text-slate-900'
                      )}
                      title={item.alerts ? 'Disattiva alert' : 'Attiva alert'}
                    >
                      {item.alerts ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
                    </button>

                    {!isGuest && (
                      <button
                        onClick={() => void removeEntity(item.id)}
                        className="flex h-12 w-12 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                        title="Rimuovi"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}

                    <button className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-950">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                  </div>
                );
              })()}
            </motion.div>
          ))
        )}
      </section>
    </div>
  );
}
