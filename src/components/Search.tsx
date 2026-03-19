import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Code2,
  Filter,
  Globe2,
  Loader2,
  Lock,
  MapPin,
  Search as SearchIcon,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CrystalCard, cn } from './CrystalCard';
import { CrystalLoader } from './CrystalLoader';
import { LazyMarkdown } from './LazyMarkdown';
import { CardData } from '../types/crystal';
import { compileQuery, getLocalInsights, getWorldSimJobResult, predict } from '../services/geminiService';
import { useCrystalPlan } from '../context/CrystalPlanContext';
import { useAppRuntime } from '../context/AppRuntimeContext';
import { useAppShell } from '../context/AppShellContext';
import { formatCredits, getPlanLabel, getPredictActionSpec } from '../lib/crystalPlans';
import { createWorldSimSceneData } from '../lib/worldSimScene';
import { PRODUCT_BRAND, RUNTIME_COPY, SECTION_COPY, WORLD_SIM_BRAND } from '../content/brand';
import { DomainCoverageExplorer } from './DomainCoverageExplorer';
import { WorldSimInlineCard } from './WorldSimInlineCard';
import type { WorldSimJobRef, WorldSimJobResult } from '../types/worldSimJob';
import { isTerminalWorldSimJobStatus as isWorldSimJobTerminal } from '../types/worldSimJob';

interface SearchProps {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
  initialQuery?: string;
  onForecastComplete?: () => void;
  onOpenWorldSimScene: (data: any, job?: WorldSimJobRef | null) => void;
}

type SearchFilters = {
  horizon: 'now' | '7d' | '30d' | '90d' | '6m' | '12m';
  geography: 'auto' | 'global' | 'italy' | 'rome' | 'milan';
  confidence: 'balanced' | 'high' | 'rigorous';
};

const DEFAULT_FILTERS: SearchFilters = {
  horizon: '30d',
  geography: 'auto',
  confidence: 'balanced',
};

const HERO_EXAMPLES = [
  'How likely is an energy price jump in Italy over the next 30 days?',
  'Will Rome face another overtourism spike within 90 days?',
  'Will AI automation in contact centers accelerate within 6 months?',
];

const GEOGRAPHY_METADATA: Record<
  SearchFilters['geography'],
  { label: string; level?: 'world' | 'country' | 'city'; location?: string }
> = {
  auto: { label: 'Auto' },
  global: { label: 'Global', level: 'world' },
  italy: { label: 'Italy', level: 'country', location: 'Italy' },
  rome: { label: 'Rome', level: 'city', location: 'Rome' },
  milan: { label: 'Milan', level: 'city', location: 'Milan' },
};

const HORIZON_OPTIONS: Array<{
  value: SearchFilters['horizon'];
  label: string;
  badge?: 'Plus' | 'Pro';
  feature?: 'search_horizon_90d' | 'search_horizon_6m' | 'search_horizon_12m';
}> = [
  { value: 'now', label: 'Now' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days', badge: 'Plus', feature: 'search_horizon_90d' },
  { value: '6m', label: '6 months', badge: 'Plus', feature: 'search_horizon_6m' },
  { value: '12m', label: '12 months', badge: 'Pro', feature: 'search_horizon_12m' },
];

const CONFIDENCE_OPTIONS: Array<{
  value: SearchFilters['confidence'];
  label: string;
  badge?: 'Pro';
  feature?: 'search_confidence_rigorous';
}> = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'High' },
  { value: 'rigorous', label: 'Rigorous', badge: 'Pro', feature: 'search_confidence_rigorous' },
];

const CONFIDENCE_LABELS: Record<SearchFilters['confidence'], string> = {
  balanced: 'Balanced',
  high: 'High',
  rigorous: 'Rigorous',
};

export function Search({ user, isGuest, onLogin, initialQuery, onForecastComplete, onOpenWorldSimScene }: SearchProps) {
  const { entitlements, canUseFeature, openUpgrade, runMeteredAction } = useCrystalPlan();
  const capabilities = useAppRuntime();
  const { isPhone, motionMode } = useAppShell();
  const [query, setQuery] = useState(initialQuery || '');
  const [hasSearched, setHasSearched] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [isLoadingPrediction, setIsLoadingPrediction] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Preparing the forecast...');
  const [queryPlan, setQueryPlan] = useState<any>(null);
  const [generatedCard, setGeneratedCard] = useState<CardData | null>(null);
  const [localInsights, setLocalInsights] = useState<{ text: string; chunks: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [isCardSaved, setIsCardSaved] = useState(false);
  const [autoOpenedWorldSimJobId, setAutoOpenedWorldSimJobId] = useState<string | null>(null);

  const predictActionSpec = useMemo(() => getPredictActionSpec('search', filters), [filters]);
  const useFilterSheet = isPhone;
  const shouldAnimatePanels = motionMode !== 'minimal';
  const isWorldSimMode = predictActionSpec.action === 'search_oracle';
  const canUseWorldSim = capabilities.worldSimBetaAvailable;
  const worldSimLabel = capabilities.worldSimAvailable
    ? WORLD_SIM_BRAND.name
    : canUseWorldSim
      ? WORLD_SIM_BRAND.betaName
      : WORLD_SIM_BRAND.previewName;
  const runtimeModeLabel = isWorldSimMode
    ? worldSimLabel
    : 'Standard forecast';
  const isSubmitBlocked = !capabilities.forecastAvailable || (isWorldSimMode && !canUseWorldSim);
  const worldSimPreviewScene = useMemo(
    () =>
      createWorldSimSceneData({
        title: 'WorldSim: see the system behind the number',
        question: query.trim() || HERO_EXAMPLES[1],
        mode: canUseWorldSim ? 'live' : 'preview',
      }),
    [canUseWorldSim, query]
  );
  const worldSimResultScene = useMemo(
    () =>
      createWorldSimSceneData({
        title: generatedCard?.title || 'WorldSim layer',
        subtitle: generatedCard?.summary,
        question: query.trim() || HERO_EXAMPLES[0],
        digest: generatedCard?.world_sim,
        mode:
          canUseWorldSim && (generatedCard?.world_sim_job?.status === 'completed' || Boolean(generatedCard?.world_sim?.enabled))
            ? 'live'
            : 'preview',
        sourceLabel:
          generatedCard?.world_sim_job && generatedCard.world_sim_job.status !== 'completed'
            ? 'MiroFish async job'
            : generatedCard?.world_sim?.enabled
              ? 'Forecast digest'
              : 'Preview dataset',
        job: generatedCard?.world_sim_job || null,
      }),
    [canUseWorldSim, generatedCard, query]
  );
  const isSportsForecastCard = Boolean(
    generatedCard &&
      (generatedCard.card_type === 'sports_fixture_board' ||
        generatedCard.domain === 'A.29.sports_performance_and_outcomes' ||
        generatedCard.domain === 'A.13.sports.match_outcomes')
  );

  useEffect(() => {
    if (initialQuery && !hasSearched) {
      setQuery(initialQuery);
      void handleSearch(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (generatedCard) {
      onForecastComplete?.();
    }
  }, [generatedCard, onForecastComplete]);

  useEffect(() => {
    const jobId = generatedCard?.world_sim_job?.jobId;
    if (isSportsForecastCard) return;
    if (!jobId || autoOpenedWorldSimJobId === jobId) return;
    onOpenWorldSimScene(worldSimResultScene, generatedCard?.world_sim_job || null);
    setAutoOpenedWorldSimJobId(jobId);
  }, [autoOpenedWorldSimJobId, generatedCard?.world_sim_job, isSportsForecastCard, onOpenWorldSimScene, worldSimResultScene]);

  useEffect(() => {
    const jobId = generatedCard?.world_sim_job?.jobId;
    const status = generatedCard?.world_sim_job?.status;
    if (!jobId || isWorldSimJobTerminal(status)) return;

    let active = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const result = (await getWorldSimJobResult(jobId)) as WorldSimJobResult<any, CardData>;
        if (!active) return;

        setGeneratedCard((current) => {
          if (!current || current.world_sim_job?.jobId !== jobId) {
            return current;
          }

          if (result.card) {
            return {
              ...result.card,
              world_sim_job: result.job,
            };
          }

          return {
            ...current,
            world_sim_job: result.job,
            world_sim: result.digest ? { ...(current.world_sim || {}), ...result.digest } : current.world_sim,
          };
        });

        if (!isWorldSimJobTerminal(result.job?.status)) {
          timer = window.setTimeout(poll, 4000);
        }
      } catch (jobError) {
        console.error('WorldSim job polling error:', jobError);
        if (active) {
          timer = window.setTimeout(poll, 6500);
        }
      }
    };

    void poll();

    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [generatedCard?.world_sim_job?.jobId, generatedCard?.world_sim_job?.status]);

  useEffect(() => {
    const messages = [
      'Preparing the forecast...',
      'Reading the main drivers and the surrounding context...',
      'Building the answer, probability, and what to watch next...',
      'Adding the final confidence layer...',
    ];
    if (!isLoadingPlan && !isLoadingPrediction) return;

    const interval = window.setInterval(() => {
      setLoadingMessage((current) => {
        const currentIndex = messages.indexOf(current);
        return messages[(currentIndex + 1) % messages.length];
      });
    }, 2400);

    return () => window.clearInterval(interval);
  }, [isLoadingPlan, isLoadingPrediction]);

  useEffect(() => {
    const checkSaved = async () => {
      if (!generatedCard || !user?.uid) {
        setIsCardSaved(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid, 'cards', generatedCard.card_id));
        setIsCardSaved(snapshot.exists());
      } catch (lookupError) {
        handleFirestoreError(lookupError, OperationType.GET, `users/${user.uid}/cards/${generatedCard.card_id}`);
      }
    };

    void checkSaved();
  }, [generatedCard, user?.uid]);

  const applyFilters = (patch: Partial<SearchFilters>) => {
    const nextFilters = { ...filters, ...patch };
    setFilters(nextFilters);
    if (hasSearched && query.trim()) {
      void handleSearch(query, nextFilters);
    }
  };

  const handleHorizonChange = (nextHorizon: SearchFilters['horizon']) => {
    const option = HORIZON_OPTIONS.find((item) => item.value === nextHorizon);
    if (option?.feature && !canUseFeature(option.feature)) {
      openUpgrade({
        reason: 'feature',
        title: `${option.badge} unlocks ${option.label}`,
        description:
          option.badge === 'Pro'
            ? `${WORLD_SIM_BRAND.name} and 12-month horizons are part of Pro.`
            : 'Medium and longer horizons are included in Plus.',
        recommendedPlan: option.badge === 'Pro' ? 'pro' : 'plus',
        sourceView: 'search',
      });
      return;
    }

    applyFilters({ horizon: nextHorizon });
  };

  const handleConfidenceChange = (nextConfidence: SearchFilters['confidence']) => {
    const option = CONFIDENCE_OPTIONS.find((item) => item.value === nextConfidence);
    if (option?.feature && !canUseFeature(option.feature)) {
      openUpgrade({
        reason: 'feature',
        title: 'Rigorous mode is a Pro feature',
        description: `${WORLD_SIM_BRAND.name} and deeper forecasts are part of Pro.`,
        recommendedPlan: 'pro',
        sourceView: 'search',
      });
      return;
    }

    applyFilters({ confidence: nextConfidence });
  };

  const handleSaveCard = async (card: CardData) => {
    if (!user?.uid) return;

    const cardRef = doc(db, 'users', user.uid, 'cards', card.card_id);
    try {
      if (isCardSaved) {
        await deleteDoc(cardRef);
        setIsCardSaved(false);
      } else {
        await setDoc(cardRef, {
          ...card,
          createdAt: serverTimestamp(),
        });
        setIsCardSaved(true);
      }
    } catch (writeError) {
      handleFirestoreError(writeError, OperationType.WRITE, `users/${user.uid}/cards/${card.card_id}`);
    }
  };

  const handleSearch = async (event: React.FormEvent | string, activeFilters: SearchFilters = filters) => {
    if (typeof event !== 'string') event.preventDefault();

    if (isGuest && onLogin) {
      onLogin();
      return;
    }

    const searchQuery = typeof event === 'string' ? event : query;
    if (!searchQuery.trim()) return;

    setQuery(searchQuery);
    setHasSearched(true);
    setQueryPlan(null);
    setGeneratedCard(null);
    setLocalInsights(null);
    setShowDebug(false);
    setError(null);

    const requiresWorldSim = activeFilters.horizon === '12m' || activeFilters.confidence === 'rigorous';
    if (!capabilities.forecastAvailable) {
      setError(RUNTIME_COPY.forecastPreview);
      return;
    }
    if (requiresWorldSim && !canUseWorldSim) {
      setError(`${capabilities.worldSimStatusDetail} For now you can keep using the standard forecast.`);
      return;
    }

    setIsLoadingPlan(true);
    setIsLoadingPrediction(false);
    setIsLoadingInsights(false);

    try {
      const plan = await compileQuery(searchQuery);
      const nextPlan = {
        ...plan,
        filters: { ...(plan.filters || {}) },
        constraints: { ...(plan.constraints || {}) },
        entities: [...(plan.entities || [])],
        horizons: [...(plan.horizons || [])],
      };

      const normalizedHorizon = activeFilters.horizon === 'now' ? '7d' : activeFilters.horizon;
      if (nextPlan.horizons.length > 0) {
        nextPlan.horizons[0] = { ...nextPlan.horizons[0], horizon_id: normalizedHorizon };
      } else {
        nextPlan.horizons = [{ horizon_id: normalizedHorizon }];
      }

      const geographyMeta = GEOGRAPHY_METADATA[activeFilters.geography];
      nextPlan.filters = {
        ...nextPlan.filters,
        geography: activeFilters.geography,
        geography_label: geographyMeta.label,
        confidence_preference: activeFilters.confidence,
      };
      nextPlan.constraints = {
        ...nextPlan.constraints,
        confidence_preference: activeFilters.confidence,
      };

      if (geographyMeta.level) {
        nextPlan.filters.geography_level = geographyMeta.level;
      }

      if (geographyMeta.location) {
        nextPlan.filters.location = geographyMeta.location;
        const locationEntityType = geographyMeta.level === 'country' ? 'country' : 'city';
        const hasLocationEntity = nextPlan.entities.some(
          (entity: any) => entity.label === geographyMeta.location && entity.entity_type === locationEntityType
        );

        if (!hasLocationEntity) {
          nextPlan.entities.push({
            entity_id: geographyMeta.location.toLowerCase(),
            entity_type: locationEntityType,
            label: geographyMeta.location,
          });
        }
      }

      setQueryPlan(nextPlan);
      setIsLoadingPlan(false);
      setIsLoadingPrediction(true);

      let userContext;
      if (user?.uid) {
        try {
          const userSnapshot = await getDoc(doc(db, 'users', user.uid));
          userContext = userSnapshot.exists() ? userSnapshot.data() : undefined;
        } catch (lookupError) {
          handleFirestoreError(lookupError, OperationType.GET, `users/${user.uid}`);
        }
      }

      const card = await runMeteredAction(
        getPredictActionSpec('search', activeFilters),
        () => predict(searchQuery, nextPlan, userContext),
        {
          sourceView: 'search',
          insufficientCreditsMessage:
            'You need more credits for this forecast. Move to Plus or Pro to keep going without interruptions.',
        }
      );
      setGeneratedCard(card);

      setIsLoadingInsights(true);
      void getLocalInsights(searchQuery, nextPlan.entities)
        .then((data) => setLocalInsights(data))
        .catch((insightError) => {
          console.error('Local insights fetch error:', insightError);
        })
        .finally(() => setIsLoadingInsights(false));
    } catch (searchError) {
      console.error('Failed to process query', searchError);
      setError(searchError instanceof Error ? searchError.message : 'Something unexpected happened.');
    } finally {
      setIsLoadingPlan(false);
      setIsLoadingPrediction(false);
    }
  };

  const renderOptionBadge = (badge?: 'Plus' | 'Pro') => {
    if (!badge) return null;
    return (
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
          badge === 'Pro' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
        )}
      >
        {badge}
      </span>
    );
  };

  const advancedFilters = (
    <div className="grid gap-5 rounded-[28px] border border-slate-200 bg-white p-5 md:grid-cols-3">
      <div>
        <div className="section-kicker">Geography</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(GEOGRAPHY_METADATA).map(([value, meta]) => (
            <button
              key={value}
              type="button"
              onClick={() => applyFilters({ geography: value as SearchFilters['geography'] })}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
                filters.geography === value
                  ? 'border-[#1453e8] bg-[#e8eefc] text-[#1453e8]'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
              )}
            >
              {meta.level === 'city' ? <MapPin className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="section-kicker">Horizon</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {HORIZON_OPTIONS.map((option) => {
            const locked = option.feature ? !canUseFeature(option.feature) : false;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleHorizonChange(option.value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
                  filters.horizon === option.value
                    ? 'border-[#1453e8] bg-[#e8eefc] text-[#1453e8]'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
                )}
              >
                {option.label}
                {renderOptionBadge(option.badge)}
                {locked && <Lock className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="section-kicker">Confidence</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {CONFIDENCE_OPTIONS.map((option) => {
            const locked = option.feature ? !canUseFeature(option.feature) : false;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleConfidenceChange(option.value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
                  filters.confidence === option.value
                    ? 'border-[#1453e8] bg-[#e8eefc] text-[#1453e8]'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
                )}
              >
                {option.label}
                {renderOptionBadge(option.badge)}
                {locked && <Lock className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-7">
      <section className="hero-surface overflow-hidden rounded-[40px] p-6 md:p-8">
        <div className="hero-mesh pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute right-[-70px] top-[-80px] h-[250px] w-[250px] rounded-full bg-[rgba(20,83,232,0.1)] blur-[90px]" />
        <div className="relative grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="max-w-4xl">
            <div className="flex flex-wrap gap-2">
              <span className="hero-chip inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {SECTION_COPY.forecast.heroKicker}
              </span>
              <span className="hero-chip inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Command studio
              </span>
              <span className="hero-chip inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {runtimeModeLabel}
              </span>
            </div>
            <h2 className="mt-5 max-w-3xl text-4xl font-display font-semibold tracking-[-0.04em] text-slate-950 md:text-6xl md:leading-[0.97]">
              {SECTION_COPY.forecast.heroTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{SECTION_COPY.forecast.heroBody}</p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setQuery(HERO_EXAMPLES[0]);
                  void handleSearch(HERO_EXAMPLES[0]);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-[#1453e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1248c8]"
              >
                {PRODUCT_BRAND.primaryCta}
              </button>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="metric-card rounded-[24px] px-4 py-4">
                <div className="section-kicker !text-slate-500">What may happen</div>
                <div className="mt-2 text-xl font-display font-semibold text-slate-950">Direct verdict</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">Lead with the call that matters, then expand only where the signal is real.</div>
              </div>
              <div className="metric-card rounded-[24px] px-4 py-4">
                <div className="section-kicker !text-slate-500">Why</div>
                <div className="mt-2 text-xl font-display font-semibold text-slate-950">Real drivers</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">Show the evidence behind the call instead of generic scenario filler.</div>
              </div>
              <div className="metric-card rounded-[24px] px-4 py-4">
                <div className="section-kicker !text-slate-500">{worldSimResultScene.mode === 'live' ? worldSimLabel : WORLD_SIM_BRAND.previewName}</div>
                <div className="mt-2 text-xl font-display font-semibold text-slate-950">Second layer only</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">Keep Forecast readable. Open WorldSim only when the system dynamics genuinely add value.</div>
              </div>
            </div>

            <div className="editorial-divider mt-8" />

            <div className="mt-6 flex flex-wrap gap-2">
              {HERO_EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    setQuery(example);
                    void handleSearch(example);
                  }}
                  className="hero-chip rounded-full px-4 py-2 text-left text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

            <div className="premium-strip rounded-[32px] p-5">
              <div className="section-kicker">Current Access</div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  {isGuest ? 'Guest' : getPlanLabel(entitlements.plan)}
                </span>
                <span className="text-sm font-semibold text-slate-700">
                  {isGuest ? 'Sign in to save and use credits' : `${entitlements.creditsBalance} credits available`}
                </span>
              </div>
              <div className="mt-4 text-sm leading-7 text-slate-500">
              A cleaner forecast studio: direct verdict, ranked reads, and a separate simulation layer when needed.
              </div>
            <div className="mt-4 rounded-[20px] border border-slate-200 bg-white/82 px-4 py-3 text-sm font-medium text-slate-600">
              {capabilities.message}
            </div>
          </div>
        </div>
      </section>

      <section className="command-surface rounded-[36px] p-5 md:p-6">
        <form onSubmit={handleSearch} className="space-y-5">
          <div className="data-well rounded-[30px] p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[24px] bg-slate-50/90 px-4 py-4">
                <SearchIcon className="h-5 w-5 shrink-0 text-[#1453e8]" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Ask ${PRODUCT_BRAND.name} what may happen and on which horizon...`}
                  className="w-full min-w-0 bg-transparent text-base font-medium text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitBlocked}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-55',
                  predictActionSpec.action === 'search_oracle'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : predictActionSpec.action === 'search_extended'
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-[#1453e8] hover:bg-[#1248c8]'
                )}
              >
                {predictActionSpec.action === 'search_oracle' ? <WandSparkles className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {predictActionSpec.label} - {formatCredits(predictActionSpec.cost)}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIsAdvancedOpen((current) => !current)}
              className="hero-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              <Filter className="h-4 w-4 text-[#1453e8]" />
              Filters
              {isAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <div className="text-sm font-medium text-slate-500">
              Mode: <span className="font-semibold text-slate-900">{runtimeModeLabel}</span>
            </div>
          </div>

          <div className="grid gap-3 rounded-[28px] border border-white/80 bg-white/78 p-4 shadow-[0_18px_38px_rgba(15,23,42,0.05)] md:grid-cols-3">
            {[
              'Verdict first: the main call should be visible immediately.',
              'Why it holds: show the real drivers and where confidence drops.',
              isWorldSimMode ? 'WorldSim stays separate: extra depth without polluting the main read.' : 'WorldSim remains optional and separate from the base forecast.',
            ].map((item) => (
              <div key={item} className="rounded-[18px] bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-600">
                {item}
              </div>
            ))}
          </div>

          {!useFilterSheet && (
            <AnimatePresence initial={false}>
              {isAdvancedOpen && (
              <motion.div
                initial={shouldAnimatePanels ? { opacity: 0, height: 0 } : undefined}
                animate={shouldAnimatePanels ? { opacity: 1, height: 'auto' } : undefined}
                exit={shouldAnimatePanels ? { opacity: 0, height: 0 } : undefined}
                className="overflow-hidden"
              >
                {advancedFilters}
              </motion.div>
              )}
            </AnimatePresence>
          )}
        </form>
      </section>

      {useFilterSheet && (
        <AnimatePresence>
          {isAdvancedOpen && (
            <div className="fixed inset-0 z-[120] md:hidden">
              <motion.button
                initial={shouldAnimatePanels ? { opacity: 0 } : undefined}
                animate={shouldAnimatePanels ? { opacity: 1 } : undefined}
                exit={shouldAnimatePanels ? { opacity: 0 } : undefined}
                onClick={() => setIsAdvancedOpen(false)}
                className="absolute inset-0 bg-[rgba(15,23,42,0.34)] backdrop-blur-sm"
              />
              <motion.div
                initial={shouldAnimatePanels ? { opacity: 0, y: 24 } : undefined}
                animate={shouldAnimatePanels ? { opacity: 1, y: 0 } : undefined}
                exit={shouldAnimatePanels ? { opacity: 0, y: 24 } : undefined}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-slate-200 bg-[rgba(252,250,247,0.98)] p-4 shadow-[0_-18px_50px_rgba(15,23,42,0.12)]"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="section-kicker">Filters</div>
                    <div className="mt-1 text-lg font-semibold text-slate-950">Tune the forecast without crowding the screen.</div>
                  </div>
                  <button
                    onClick={() => setIsAdvancedOpen(false)}
                    className="rounded-full border border-slate-200 bg-white p-2 text-slate-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[72vh] overflow-y-auto pb-2">{advancedFilters}</div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      )}

      {(isLoadingPlan || isLoadingPrediction) && (
      <section className="ink-panel rounded-[36px] p-8 text-center">
          <CrystalLoader />
          <p className="mt-6 text-base font-medium text-slate-300">{loadingMessage}</p>
        </section>
      )}

      {error && (
        <section className="rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {error}
        </section>
      )}

      {!hasSearched && !isLoadingPlan && !isLoadingPrediction && (
        <>
          <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="editorial-panel content-auto rounded-[32px] p-6">
              <div className="section-kicker">How to ask</div>
              <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">Think about the question like a decision.</h3>
              <div className="mt-5 space-y-3">
                {[
                  'Ask something concrete: what do you actually want to understand?',
                  'Use 30 days when you need to act soon, 6 months when you need wider orientation.',
                  'Add profile and watchlist context to make the answer feel closer to your world.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-white p-4 text-sm font-medium leading-7 text-slate-600">
                    <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1453e8]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <WorldSimInlineCard data={worldSimPreviewScene} onOpen={() => onOpenWorldSimScene(worldSimPreviewScene, null)} />
          </section>

          <DomainCoverageExplorer
            variant="compact"
            title="Blueprint registry"
            description="The forecast studio now knows the full Crystal blueprint. Domains only become readable cards when their evidence coverage is genuinely ready."
          />
        </>
      )}

      {generatedCard && (
        <section className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <div className="editorial-panel rounded-[28px] p-5">
                <div className="section-kicker">What may happen</div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    {filters.horizon === 'now' ? '7 days' : filters.horizon}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    {GEOGRAPHY_METADATA[filters.geography].label}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                    {CONFIDENCE_LABELS[filters.confidence]}
                  </span>
                </div>
              </div>

              <CrystalCard card={generatedCard} onSave={handleSaveCard} isSaved={isCardSaved} />

              <div className="editorial-panel content-auto rounded-[28px] p-5">
                <div className="section-kicker">Local context</div>
                {isLoadingInsights ? (
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-[#1453e8]" />
                    Pulling local context...
                  </div>
                ) : localInsights ? (
                  <div className="mt-4 prose prose-sm max-w-none text-slate-600">
                    <LazyMarkdown>{localInsights.text}</LazyMarkdown>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-slate-500">
                    When the question has a clear place attached to it, the local context lives here without competing with the main forecast.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-5">
              <div className="editorial-panel content-auto rounded-[28px] p-5">
                <div className="section-kicker">Why</div>
                <div className="mt-4 space-y-3">
                  {(generatedCard.drivers || []).slice(0, 4).map((driver) => (
                    <div key={driver.feature_key} className="rounded-[20px] border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">{driver.feature_key.replace(/_/g, ' ')}</div>
                      <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                        {driver.direction} - contribution {Math.round(driver.contribution * 100)}%
                      </div>
                    </div>
                  ))}
                  {generatedCard.world_sim?.enabled && !isSportsForecastCard && (
                    <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-5">
                      <div className="section-kicker !text-rose-600">{WORLD_SIM_BRAND.name}</div>
                      <p className="mt-3 text-sm leading-7 text-rose-800">
                        {WORLD_SIM_BRAND.name} adds a deeper read on scenarios, but the final number still stays anchored to the base forecast engine.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {isSportsForecastCard ? (
                <details className="editorial-panel rounded-[28px] p-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                    Nota WorldSim
                  </summary>
                  <div className="mt-4 rounded-[24px] border border-rose-200 bg-rose-50 p-5">
                    <div className="section-kicker !text-rose-600">{capabilities.worldSimStatusLabel}</div>
                    <p className="mt-3 text-sm leading-7 text-rose-800">
                      {generatedCard.world_sim?.enabled
                        ? 'WorldSim is attached as a secondary layer for system dynamics. It stays outside the main sports verdict.'
                        : capabilities.worldSimStatusDetail}
                    </p>
                    <div className="mt-4">
                      <button
                        onClick={() => onOpenWorldSimScene(worldSimResultScene, generatedCard.world_sim_job || null)}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                      >
                        {generatedCard.world_sim?.enabled ? 'Open the simulation layer' : WORLD_SIM_BRAND.enterLabel}
                      </button>
                    </div>
                  </div>
                </details>
              ) : (
                <WorldSimInlineCard
                  data={worldSimResultScene}
                  compact
                  job={generatedCard.world_sim_job || null}
                  onOpen={() => onOpenWorldSimScene(worldSimResultScene, generatedCard.world_sim_job || null)}
                  ctaLabel={generatedCard.world_sim?.enabled ? 'Open the simulation layer' : WORLD_SIM_BRAND.enterLabel}
                />
              )}
            </div>
          </div>

          {queryPlan && (
            <details
              className="editorial-panel content-auto rounded-[28px] p-5"
              onToggle={(event) => setShowDebug((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-700">
                <Code2 className="h-4 w-4 text-[#1453e8]" />
                Technical details
                {showDebug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                  <div className="section-kicker">Query Plan</div>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
                    {JSON.stringify(queryPlan, null, 2)}
                  </pre>
                </div>
                <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                  <div className="section-kicker">Request Context</div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-900">Action:</span> {predictActionSpec.action}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Cost:</span> {formatCredits(predictActionSpec.cost)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Plan:</span> {isGuest ? 'Guest' : getPlanLabel(entitlements.plan)}
                    </p>
                  </div>
                </div>
              </div>
            </details>
          )}

          <DomainCoverageExplorer
            variant="compact"
            title="Coverage explorer"
            description="Use this to check whether a domain is fully published, still limited, or intentionally blocked while the evidence fabric catches up."
          />
        </section>
      )}
    </div>
  );
}
