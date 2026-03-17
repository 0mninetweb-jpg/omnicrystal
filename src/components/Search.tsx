import React, { useEffect, useMemo, useState } from 'react';
import {
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
import Markdown from 'react-markdown';
import { AnimatePresence, motion } from 'framer-motion';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CrystalCard, cn } from './CrystalCard';
import { CrystalLoader } from './CrystalLoader';
import { CardData } from '../types/crystal';
import { compileQuery, getLocalInsights, predict } from '../services/geminiService';
import { useCrystalPlan } from '../context/CrystalPlanContext';
import { useAppRuntime } from '../context/AppRuntimeContext';
import { formatCredits, getPlanLabel, getPredictActionSpec } from '../lib/crystalPlans';
import { PRODUCT_BRAND, RUNTIME_COPY, SECTION_COPY, WORLD_SIM_BRAND } from '../content/brand';

interface SearchProps {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
  initialQuery?: string;
  onForecastComplete?: () => void;
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
  'Quanto e probabile un aumento delle bollette in Italia nei prossimi 30 giorni?',
  'Roma rischia un nuovo picco di over-tourism entro 90 giorni?',
  'L automazione AI nei contact center accelerera entro 6 mesi?',
];

const GEOGRAPHY_METADATA: Record<
  SearchFilters['geography'],
  { label: string; level?: 'world' | 'country' | 'city'; location?: string }
> = {
  auto: { label: 'Auto' },
  global: { label: 'Globale', level: 'world' },
  italy: { label: 'Italia', level: 'country', location: 'Italia' },
  rome: { label: 'Roma', level: 'city', location: 'Roma' },
  milan: { label: 'Milano', level: 'city', location: 'Milano' },
};

const HORIZON_OPTIONS: Array<{
  value: SearchFilters['horizon'];
  label: string;
  badge?: 'Plus' | 'Pro';
  feature?: 'search_horizon_90d' | 'search_horizon_6m' | 'search_horizon_12m';
}> = [
  { value: 'now', label: 'Ora' },
  { value: '7d', label: '7 giorni' },
  { value: '30d', label: '30 giorni' },
  { value: '90d', label: '90 giorni', badge: 'Plus', feature: 'search_horizon_90d' },
  { value: '6m', label: '6 mesi', badge: 'Plus', feature: 'search_horizon_6m' },
  { value: '12m', label: '12 mesi', badge: 'Pro', feature: 'search_horizon_12m' },
];

const CONFIDENCE_OPTIONS: Array<{
  value: SearchFilters['confidence'];
  label: string;
  badge?: 'Pro';
  feature?: 'search_confidence_rigorous';
}> = [
  { value: 'balanced', label: 'Bilanciata' },
  { value: 'high', label: 'Alta' },
  { value: 'rigorous', label: 'Massimo rigore', badge: 'Pro', feature: 'search_confidence_rigorous' },
];

const CONFIDENCE_LABELS: Record<SearchFilters['confidence'], string> = {
  balanced: 'Bilanciata',
  high: 'Alta',
  rigorous: 'Massimo rigore',
};

export function Search({ user, isGuest, onLogin, initialQuery, onForecastComplete }: SearchProps) {
  const { entitlements, canUseFeature, openUpgrade, runMeteredAction } = useCrystalPlan();
  const capabilities = useAppRuntime();
  const [query, setQuery] = useState(initialQuery || '');
  const [hasSearched, setHasSearched] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [isLoadingPrediction, setIsLoadingPrediction] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Sto preparando il forecast...');
  const [queryPlan, setQueryPlan] = useState<any>(null);
  const [generatedCard, setGeneratedCard] = useState<CardData | null>(null);
  const [localInsights, setLocalInsights] = useState<{ text: string; chunks: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [isCardSaved, setIsCardSaved] = useState(false);

  const predictActionSpec = useMemo(() => getPredictActionSpec('search', filters), [filters]);
  const isWorldSimMode = predictActionSpec.action === 'search_oracle';
  const runtimeModeLabel = isWorldSimMode
    ? capabilities.worldSimAvailable
      ? WORLD_SIM_BRAND.name
      : WORLD_SIM_BRAND.previewName
    : 'Standard forecast';
  const isSubmitBlocked = !capabilities.forecastAvailable || (isWorldSimMode && !capabilities.worldSimAvailable);

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
    const messages = [
      'Sto preparando il forecast...',
      'Leggo i driver principali e il contesto...',
      'Compongo risposta, probabilita e segnali da osservare...',
      'Aggiungo il livello di fiducia finale...',
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
        title: `${option.badge} sblocca ${option.label}`,
        description:
          option.badge === 'Pro'
            ? `${WORLD_SIM_BRAND.name} e gli orizzonti a 12 mesi fanno parte del piano Pro.`
            : 'Gli orizzonti medio-lunghi sono inclusi nel piano Plus.',
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
        title: 'Massimo rigore e una funzione Pro',
        description: `${WORLD_SIM_BRAND.name} e i forecast piu profondi fanno parte del piano Pro.`,
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
    if (requiresWorldSim && !capabilities.worldSimAvailable) {
      setError(`${RUNTIME_COPY.worldSimPreview} Per ora puoi continuare con il forecast standard.`);
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
            'Ti servono piu crediti per questo forecast. Passa a Plus o Pro per continuare senza interruzioni.',
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
      setError(searchError instanceof Error ? searchError.message : 'Si e verificato un errore imprevisto.');
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

  return (
    <div className="space-y-7">
      <section className="editorial-panel overflow-hidden rounded-[32px] p-6 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="section-kicker">{SECTION_COPY.forecast.heroKicker}</div>
            <h2 className="mt-4 max-w-3xl text-4xl font-display font-semibold tracking-tight text-slate-950 md:text-5xl">
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
                Fai un forecast
              </button>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {HERO_EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    setQuery(example);
                    void handleSearch(example);
                  }}
                  className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-left text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5">
            <div className="section-kicker">Current Access</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                {isGuest ? 'Guest' : getPlanLabel(entitlements.plan)}
              </span>
              <span className="text-sm font-semibold text-slate-700">
                {isGuest ? 'Accedi per salvare e usare i crediti' : `${entitlements.creditsBalance} crediti disponibili`}
              </span>
            </div>
            <div className="mt-4 text-sm leading-7 text-slate-500">
              Ricevi una risposta chiara, i motivi principali dietro al numero e i prossimi segnali da osservare.
            </div>
            <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              {capabilities.message}
            </div>
          </div>
        </div>
      </section>

      <section className="editorial-panel rounded-[32px] p-5 md:p-6">
        <form onSubmit={handleSearch} className="space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_35px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[22px] bg-slate-50 px-4 py-4">
                <SearchIcon className="h-5 w-5 shrink-0 text-[#1453e8]" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Chiedi a ${PRODUCT_BRAND.name} cosa potrebbe succedere e in quale orizzonte...`}
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
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              <Filter className="h-4 w-4 text-[#1453e8]" />
              Filters
              {isAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <div className="text-sm font-medium text-slate-500">
              Mode: <span className="font-semibold text-slate-900">{runtimeModeLabel}</span>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {isAdvancedOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </section>

      {(isLoadingPlan || isLoadingPrediction) && (
        <section className="ink-panel rounded-[32px] p-8 text-center">
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
        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="editorial-panel rounded-[32px] p-6">
            <div className="section-kicker">How to ask</div>
            <h3 className="mt-3 text-2xl font-display font-semibold text-slate-950">Pensa alla domanda come a una decisione.</h3>
            <div className="mt-5 space-y-3">
              {[
                'Chiedi una cosa concreta: cosa vuoi capire davvero?',
                'Usa 30 giorni se vuoi agire subito, 6 mesi se vuoi orientarti meglio.',
                'Aggiungi profilo e watchlist per rendere la risposta piu vicina al tuo contesto.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-white p-4 text-sm font-medium leading-7 text-slate-600">
                  <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1453e8]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="oracle-panel rounded-[32px] p-6">
            <div className="section-kicker !text-rose-200">{capabilities.worldSimAvailable ? WORLD_SIM_BRAND.name : WORLD_SIM_BRAND.previewName}</div>
            <h3 className="mt-3 text-2xl font-display font-semibold text-white">Quando serve un livello di profondita in piu.</h3>
            <div className="mt-5 space-y-3">
              <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-300">
                Usa 12 mesi o Massimo rigore solo quando vuoi leggere un tema a piu strati e con piu contesto causale.
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-300">
                {capabilities.worldSimAvailable ? WORLD_SIM_BRAND.honestNote : RUNTIME_COPY.worldSimPreview}
              </div>
            </div>
          </div>
        </section>
      )}

      {generatedCard && (
        <section className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <div className="editorial-panel rounded-[28px] p-5">
                <div className="section-kicker">Answer</div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    {filters.horizon === 'now' ? '7 giorni' : filters.horizon}
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
            </div>

            <div className="space-y-5">
              <div className="editorial-panel rounded-[28px] p-5">
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
                  {generatedCard.world_sim?.enabled && (
                    <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-5">
                      <div className="section-kicker !text-rose-600">{WORLD_SIM_BRAND.name}</div>
                      <p className="mt-3 text-sm leading-7 text-rose-800">
                        {WORLD_SIM_BRAND.name} ha aggiunto una vista piu profonda sugli scenari, ma il numero finale resta
                        ancorato al motore base.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="editorial-panel rounded-[28px] p-5">
                <div className="section-kicker">Local context</div>
                {isLoadingInsights ? (
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-[#1453e8]" />
                    Recupero il contesto locale...
                  </div>
                ) : localInsights ? (
                  <div className="mt-4 prose prose-sm max-w-none text-slate-600">
                    <Markdown>{localInsights.text}</Markdown>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-slate-500">
                    Quando la domanda ha un luogo chiaro, qui aggiungo il contesto locale senza togliere spazio alla previsione principale.
                  </p>
                )}
              </div>
            </div>
          </div>

          {queryPlan && (
            <details
              className="editorial-panel rounded-[28px] p-5"
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
        </section>
      )}
    </div>
  );
}
