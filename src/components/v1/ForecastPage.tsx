import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../firebase';
import { useAppRuntime } from '../../context/AppRuntimeContext';
import { useCrystalPlan } from '../../context/CrystalPlanContext';
import { getPredictActionSpec } from '../../lib/crystalPlans';
import {
  buildForecastStack,
  DEFAULT_FORECAST_FILTERS,
  FORECAST_EXAMPLES,
  GUEST_FORECAST_SESSION_KEY,
  normalizeForecastFailure,
  patchQueryPlanWithFilters,
  resolveForecastContext,
} from '../../lib/forecastV1';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { followForecastEntity, isForecastCardSaved, saveForecastCardToLibrary } from '../../lib/cardLibrary';
import { compileQuery, compileQueryPublic, predict, predictPublic } from '../../services/geminiService';
import type { CardData } from '../../types/crystal';
import type { ForecastResolvedContext, ForecastStackItem, ForecastUiFilters } from '../../types/forecastV1';
import { ForecastComposer } from './ForecastComposer';
import { UniversalFilters } from './UniversalFilters';
import { ResultStack } from './ResultStack';

type ForecastPageProps = {
  user: User | null;
  onLogin: () => void;
};

export function ForecastPage({ user, onLogin }: ForecastPageProps) {
  const runtime = useAppRuntime();
  const { canUseFeature, openUpgrade, runMeteredAction } = useCrystalPlan();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ForecastUiFilters>(DEFAULT_FORECAST_FILTERS);
  const [items, setItems] = useState<ForecastStackItem[]>([]);
  const [currentCard, setCurrentCard] = useState<CardData | null>(null);
  const [context, setContext] = useState<ForecastResolvedContext | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const initialRunRef = useRef(false);

  const isAuthenticated = Boolean(user);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const guestForecastEnabled = isFeatureEnabled('public_forecast_guest');
  const actionSpec = useMemo(
    () => getPredictActionSpec('search', { horizon: filters.horizon, confidence: filters.confidence }),
    [filters.confidence, filters.horizon]
  );

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!currentCard || !user?.uid || !context) {
      setIsSaved(false);
      return;
    }

    void isForecastCardSaved(user.uid, query, context).then(setIsSaved).catch(() => setIsSaved(false));
  }, [context, currentCard, query, user?.uid]);

  useEffect(() => {
    if (!initialQuery || initialRunRef.current) return;
    initialRunRef.current = true;
    const syntheticEvent = { preventDefault() {} } as React.FormEvent<HTMLFormElement>;
    void handleSubmit(syntheticEvent);
  }, [initialQuery]);

  const handleLockedOption = (label: string, recommendedPlan: 'plus' | 'pro') => {
    if (!isAuthenticated) {
      onLogin();
      return;
    }

    openUpgrade({
      reason: 'feature',
      title: `${label} is part of ${recommendedPlan === 'pro' ? 'Pro' : 'Plus'}`,
      description:
        recommendedPlan === 'pro'
          ? 'Rigorous confidence and the longest horizons stay available, but they are intentionally gated behind Pro.'
          : 'Extended horizons stay in the product, but they are intentionally gated behind Plus.',
      recommendedPlan,
      sourceView: 'search',
    });
  };

  const runForecast = async (activeQuery: string) => {
    if (!activeQuery.trim()) return;
    setIsSubmitting(true);

    try {
      const compile = isAuthenticated ? compileQuery : compileQueryPublic;
      const rawPlan = await compile(activeQuery);
      const patchedPlan = patchQueryPlanWithFilters(rawPlan, filters);
      const baseContext = resolveForecastContext(activeQuery, patchedPlan, filters);

      let card: CardData;

      if (isAuthenticated) {
        const userSnapshot = await getDoc(doc(db, 'users', user!.uid));
        const userContext = userSnapshot.exists() ? userSnapshot.data() : undefined;

        card = await runMeteredAction(actionSpec, () => predict(activeQuery, patchedPlan, userContext), {
          sourceView: 'search',
          insufficientCreditsMessage:
            'You need more credits for this forecast. Move to Plus or Pro to keep going without interruptions.',
        });
      } else {
        if (!guestForecastEnabled) {
          const disabledItems = normalizeForecastFailure(
            new Error('Public guest forecasting is disabled right now. Sign in to continue from the same surface.'),
            baseContext
          );
          setItems(disabledItems);
          setContext(baseContext);
          setCurrentCard(null);
          setIsSubmitting(false);
          return;
        }

        const guestUsed = typeof window !== 'undefined' && window.sessionStorage.getItem(GUEST_FORECAST_SESSION_KEY);
        if (guestUsed) {
          const guestItems = normalizeForecastFailure(null, baseContext, 'guest_limit');
          setItems(guestItems);
          setContext(baseContext);
          setCurrentCard(null);
          setIsSubmitting(false);
          return;
        }

        if (actionSpec.requiredPlan !== 'free') {
          const lockedItems = normalizeForecastFailure(
            new Error('Guest mode currently supports one standard forecast. Sign in for longer horizons or rigorous mode.'),
            baseContext
          );
          setItems(lockedItems);
          setContext(baseContext);
          setCurrentCard(null);
          setIsSubmitting(false);
          return;
        }

        card = await predictPublic(activeQuery, patchedPlan);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(GUEST_FORECAST_SESSION_KEY, '1');
        }
      }

      const nextContext = resolveForecastContext(activeQuery, patchedPlan, filters, card);
      setItems(buildForecastStack(card, nextContext));
      setCurrentCard(card);
      setContext(nextContext);
      setQuery(activeQuery);
      setSearchParams({ q: activeQuery }, { replace: true });
    } catch (error) {
      const fallbackContext = resolveForecastContext(activeQuery, null, filters);
      setItems(normalizeForecastFailure(error, fallbackContext));
      setCurrentCard(null);
      setContext(fallbackContext);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runForecast(query);
  };

  const handleSave = async () => {
    if (!currentCard || !context) return;
    if (!user?.uid) {
      onLogin();
      return;
    }
    setIsSaving(true);
    try {
      await saveForecastCardToLibrary(user.uid, query, context, currentCard);
      setIsSaved(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFollow = async () => {
    if (!context) return;
    if (!user?.uid) {
      onLogin();
      return;
    }
    setIsFollowing(true);
    try {
      await followForecastEntity(user.uid, context);
    } finally {
      setIsFollowing(false);
    }
  };

  const handleRemix = () => {
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleShare = async () => {
    const targetUrl = `${window.location.origin}/forecast?q=${encodeURIComponent(query)}`;
    if (navigator.share) {
      await navigator.share({ title: 'Crystal forecast', text: query, url: targetUrl });
      return;
    }
    await navigator.clipboard.writeText(targetUrl);
  };

  return (
    <div className="space-y-6" ref={composerRef}>
      <ForecastComposer
        query={query}
        onQueryChange={setQuery}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        examples={FORECAST_EXAMPLES}
        onExampleClick={(example) => {
          setQuery(example);
          void runForecast(example);
        }}
      />

      <UniversalFilters
        filters={filters}
        canUseFeature={canUseFeature}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onLockedOption={handleLockedOption}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.04)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Engine breadth</div>
          <div className="mt-3 text-sm leading-7 text-slate-700">The query stays open-ended. The output always resolves into a finite stack of standardized cards.</div>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.04)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current mode</div>
          <div className="mt-3 text-sm leading-7 text-slate-700">{runtime.message}</div>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.04)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Guest lane</div>
          <div className="mt-3 text-sm leading-7 text-slate-700">
            {isAuthenticated
              ? 'Signed-in mode keeps save, follow, remix, share, and version memory active.'
              : 'Guest mode gives one real forecast, then gracefully asks you to sign in instead of breaking the flow.'}
          </div>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.04)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current action</div>
          <div className="mt-3 text-sm leading-7 text-slate-700">
            {actionSpec.label} · {actionSpec.requiredPlan === 'free' ? 'available now' : `requires ${actionSpec.requiredPlan}`}
          </div>
        </div>
      </section>

      {items.length > 0 ? (
        <ResultStack
          items={items}
          isAuthenticated={isAuthenticated}
          isSaved={isSaved}
          isSaving={isSaving}
          isFollowing={isFollowing}
          onSave={handleSave}
          onFollow={handleFollow}
          onRemix={handleRemix}
          onShare={() => void handleShare()}
          onLogin={onLogin}
        />
      ) : (
        <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/70 p-8 text-sm leading-7 text-slate-600">
          Submit one question and Crystal will return a finite stack of cards instead of a transcript. Published, limited, and coverage-gap outcomes all resolve through the same rendering policy.
        </section>
      )}
    </div>
  );
}
