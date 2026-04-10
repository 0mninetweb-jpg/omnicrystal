import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../firebase';
import { useAppRuntime } from '../../context/AppRuntimeContext';
import { useCrystalPlan } from '../../context/CrystalPlanContext';
import { getPredictActionSpec } from '../../lib/crystalPlans';
import {
  buildForecastStack,
  DEFAULT_FORECAST_FILTERS,
  FORECAST_EXAMPLES,
  normalizeForecastFailure,
  patchQueryPlanWithFilters,
  resolveForecastContext,
} from '../../lib/forecastV1';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { followForecastEntity, isForecastCardSaved, isForecastEntityFollowed, saveForecastCardToLibrary } from '../../lib/cardLibrary';
import {
  compileQuery,
  compileQueryPublic,
  getForecastRun,
  getPublicForecastRun,
  predict,
  predictPublic,
} from '../../services/geminiService';
import type { CardData } from '../../types/crystal';
import type { ForecastResolvedContext, ForecastStackItem, ForecastUiFilters } from '../../types/forecastV1';
import { ForecastComposer } from './ForecastComposer';
import { UniversalFilters } from './UniversalFilters';
import { ResultStack } from './ResultStack';

type ForecastPageProps = {
  user: User | null;
  onLogin: () => void;
};

const FORECAST_RUN_TIMEOUT_MS = 45000;
const FORECAST_RUN_MAX_POLL_MS = 6000;

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
  const [isFollowed, setIsFollowed] = useState(false);
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
    if (!context || !user?.uid) {
      setIsFollowed(false);
      return;
    }

    void isForecastEntityFollowed(user.uid, context).then(setIsFollowed).catch(() => setIsFollowed(false));
  }, [context, user?.uid]);

  useEffect(() => {
    if (!initialQuery || initialRunRef.current) return;
    initialRunRef.current = true;
    const syntheticEvent = { preventDefault() {} } as React.FormEvent<HTMLFormElement>;
    void handleSubmit(syntheticEvent);
  }, [initialQuery]);

  useEffect(() => {
    const pendingRun = currentCard?.pending_run;
    if (!pendingRun?.run_id || pendingRun.status !== 'running' || !context) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const failPendingRun = (message: string, run?: { query_plan?: unknown } | null) => {
      if (cancelled) return;
      const failureContext = resolveForecastContext(context.query, run?.query_plan || context.queryPlan, filters);
      setItems(normalizeForecastFailure(new Error(message), failureContext));
      setCurrentCard(null);
      setContext(failureContext);
    };

    const pollRun = async () => {
      let pollAfterMs = Math.max(750, Number(pendingRun.poll_after_ms) || 2500);

      while (!cancelled) {
        if (Date.now() - startedAt >= FORECAST_RUN_TIMEOUT_MS) {
          failPendingRun('Crystal is taking longer than expected, so this deep run was held instead of spinning forever.');
          return;
        }

        await sleep(pollAfterMs);
        if (cancelled) return;

        try {
          const response =
            pendingRun.visibility === 'public' || !user?.uid
              ? pendingRun.access_token
                ? await getPublicForecastRun(pendingRun.run_id, pendingRun.access_token)
                : null
              : await getForecastRun(pendingRun.run_id);

          if (cancelled) {
            return;
          }

          if (!response) {
            failPendingRun('Crystal could not resume this deep forecast run. Retry in a moment.');
            return;
          }

          const run = response.run || null;
          const nextCard = response.card || null;

          if (nextCard) {
            const nextContext = resolveForecastContext(context.query, run?.query_plan || context.queryPlan, filters, nextCard);
            setItems(buildForecastStack(nextCard, nextContext));
            setCurrentCard(nextCard);
            setContext(nextContext);

            if (!nextCard.pending_run || nextCard.pending_run.status !== 'running') {
              return;
            }

            pollAfterMs = Math.min(Math.max(750, Number(nextCard.pending_run.poll_after_ms) || 2500), FORECAST_RUN_MAX_POLL_MS);
            continue;
          }

          if (run?.status === 'failed' || run?.status === 'canceled') {
            const failureMessage =
              typeof run?.error_message === 'string' && run.error_message.trim()
                ? run.error_message
                : 'Crystal could not complete the deep forecast run.';
            failPendingRun(failureMessage, run);
            return;
          }

          pollAfterMs = Math.min(Math.max(750, Number(run?.pending_poll_after_ms) || pollAfterMs), FORECAST_RUN_MAX_POLL_MS);
        } catch (_error) {
          if (Date.now() - startedAt >= FORECAST_RUN_TIMEOUT_MS) {
            failPendingRun('Crystal is still waiting on the remote runtime. Retry in a moment instead of waiting on a stalled spinner.');
            return;
          }
          pollAfterMs = Math.min(pollAfterMs + 1000, FORECAST_RUN_MAX_POLL_MS);
        }
      }
    };

    void pollRun();

    return () => {
      cancelled = true;
    };
  }, [context, currentCard, filters, user?.uid]);

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
      await saveForecastCardToLibrary(user.uid, query, context, currentCard, { sourceView: 'forecast' });
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
      await followForecastEntity(user.uid, context, { sourceView: 'forecast' });
      setIsFollowed(true);
    } finally {
      setIsFollowing(false);
    }
  };

  const handleRemix = () => {
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleShare = async () => {
    const targetUrl = currentCard?.public_slug
      ? `${window.location.origin}/forecast-gallery/forecast/${currentCard.public_slug}`
      : `${window.location.origin}/forecast?q=${encodeURIComponent(query)}`;
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

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Forecast Gallery</div>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Browse real public forecast cards generated by Crystal, then come back here to ask your own forecast or remix a live call.
            </p>
          </div>
          <Link
            to="/forecast-gallery"
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open Forecast Gallery
          </Link>
        </div>
      </section>

      {items.length > 0 ? (
        <>
          <ResultStack
            items={items}
            isAuthenticated={isAuthenticated}
            isSaved={isSaved}
            isSaving={isSaving}
            isFollowed={isFollowed}
            isFollowing={isFollowing}
            onSave={handleSave}
            onFollow={handleFollow}
            onRemix={handleRemix}
            onShare={() => void handleShare()}
            onLogin={onLogin}
          />
          {currentCard && context ? (
            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Keep this forecast alive</div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-950">Save</div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    Save stores this exact card in Gallery so the call, trust layer, and evidence stay easy to revisit.
                  </p>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-950">Follow</div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    Follow keeps the entity or theme on your watchlist so the next meaningful update has somewhere to land.
                  </p>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-950">Proof</div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    Public forecast pages are the shareable proof layer. Gallery is the private memory and version history.
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="rounded-[32px] border border-dashed border-slate-300 bg-white/70 p-8 text-sm leading-7 text-slate-600">
          Submit one question and Crystal will return a finite stack of cards instead of a transcript. Published, limited, and coverage-gap outcomes all resolve through the same rendering policy.
        </section>
      )}
    </div>
  );
}
