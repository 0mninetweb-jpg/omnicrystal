import React from 'react';
import { Bell, GitBranch, LogIn } from 'lucide-react';
import type { ForecastCoverageStackItem } from '../../types/forecastV1';
import { TrustStrip } from './TrustStrip';
import { EvidenceDrawer } from './EvidenceDrawer';

type CoverageGapCardProps = {
  item: ForecastCoverageStackItem;
  isAuthenticated: boolean;
  isFollowing: boolean;
  onFollow: () => void;
  onRemix: () => void;
  onLogin: () => void;
};

export function CoverageGapCard({
  item,
  isAuthenticated,
  isFollowing,
  onFollow,
  onRemix,
  onLogin,
}: CoverageGapCardProps) {
  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Coverage gap</div>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{item.primaryOutcome}</h3>
        </div>
        <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
          Hold
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-slate-700">{item.explanation}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">What is missing</div>
          <div className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
            {(item.missingSignals.length > 0 ? item.missingSignals : ['Signal quality is still too thin for a responsible publish.']).map((signal) => (
              <p key={signal}>{signal}</p>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">How to refine</div>
          <div className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
            {(item.refinementHints.length > 0 ? item.refinementHints : ['Try a shorter horizon or a more explicit entity.']).map((hint) => (
              <p key={hint}>{hint}</p>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Alternatives</div>
          <div className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
            {(item.alternateSuggestions.length > 0 ? item.alternateSuggestions : ['Try the same question at a 30-day horizon.']).map((suggestion) => (
              <p key={suggestion}>{suggestion}</p>
            ))}
          </div>
        </div>
      </div>

      {item.trustLayer ? <TrustStrip className="mt-5" trustLayer={item.trustLayer} /> : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRemix}
          className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <GitBranch className="h-4 w-4" />
          Refine in Forecast
        </button>
        {isAuthenticated ? (
          <button
            type="button"
            onClick={onFollow}
            disabled={isFollowing}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-60"
          >
            <Bell className="h-4 w-4" />
            {isFollowing ? 'Following...' : 'Notify me when coverage improves'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            <LogIn className="h-4 w-4" />
            Sign in to follow coverage
          </button>
        )}
      </div>

      <div className="mt-5">
        <EvidenceDrawer evidence={item.evidenceDrawer} />
      </div>
    </article>
  );
}
