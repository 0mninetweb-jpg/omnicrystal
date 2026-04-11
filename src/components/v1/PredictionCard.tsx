import React from 'react';
import { Bookmark, GitBranch, Share2, Sparkles } from 'lucide-react';
import type { ForecastPrimaryStackItem } from '../../types/forecastV1';
import { getForecastMetaCopy, getSportsOneXTwoLabel } from '../../lib/forecastV1';
import { sanitizeDisplayText } from '../../lib/displayText';
import { TrustStrip } from './TrustStrip';
import { EvidenceDrawer } from './EvidenceDrawer';

type PredictionCardProps = {
  item: ForecastPrimaryStackItem;
  isSaved: boolean;
  isSaving: boolean;
  isFollowed: boolean;
  isFollowing: boolean;
  onSave: () => void;
  onFollow: () => void;
  onRemix: () => void;
  onShare: () => void;
};

export function PredictionCard({
  item,
  isSaved,
  isSaving,
  isFollowed,
  isFollowing,
  onSave,
  onFollow,
  onRemix,
  onShare,
}: PredictionCardProps) {
  const meta = getForecastMetaCopy(item.card);
  const sportsOneXTwoLabel = getSportsOneXTwoLabel(item.card);
  const probabilityLabel = sportsOneXTwoLabel
    ? null
    : item.binaryContract
      ? `${item.binaryContract.question_side_a} ${Math.round(item.binaryContract.question_side_a_probability * 100)}% | ${item.binaryContract.question_side_b} ${Math.round(item.binaryContract.question_side_b_probability * 100)}%`
      : item.probabilitySplit
        ? `${item.probabilitySplit.primary_label} ${Math.round(item.probabilitySplit.primary_probability * 100)}% | ${item.probabilitySplit.secondary_label} ${Math.round(item.probabilitySplit.secondary_probability * 100)}%`
        : null;
  const heroCall = sportsOneXTwoLabel || item.primaryCall || item.primaryOutcome || item.binaryContract?.display_call;
  const title = sanitizeDisplayText(item.title, 'Crystal forecast');
  const summary = sanitizeDisplayText(item.summary, 'No summary available yet.');
  const heroCallLabel = sanitizeDisplayText(heroCall, summary);

  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {item.entity} | {item.domainId} | {item.horizon}
          </div>
          {meta.runDateSummary ? <div className="mt-2 text-sm font-medium text-slate-600">Forecast run {meta.runDateSummary}</div> : null}
          {meta.relativeTimeSummary ? <div className="mt-1 text-sm text-slate-500">{meta.relativeTimeSummary}</div> : null}
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
        </div>
        <div className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Published
        </div>
      </div>

      <div className="mt-6 rounded-[28px] bg-slate-950 p-6 text-white">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">Primary call</div>
        <div className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{heroCallLabel}</div>
        {probabilityLabel ? <div className="mt-3 text-sm font-semibold text-sky-200">{probabilityLabel}</div> : null}
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{summary}</p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Why this side</div>
          <p className="mt-2 text-sm leading-7 text-slate-700">{item.whyThisSide || item.summary}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">What to do</div>
          <p className="mt-2 text-sm leading-7 text-slate-700">{item.recommendedAction}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">What would flip it</div>
          <div className="mt-2 space-y-2 text-sm leading-7 text-slate-700">
            {(item.invalidators.length > 0 ? item.invalidators : item.whatToWatch.slice(0, 3)).map((point) => (
              <p key={point}>{point}</p>
            ))}
          </div>
        </div>
      </div>

      {item.topDrivers.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Top drivers</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.topDrivers.slice(0, 4).map((driver) => (
              <span key={driver} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                {driver}
              </span>
            ))}
          </div>
        </div>
      )}

      {(item.counterSignals.length > 0 || item.historicalAnchors.length > 0) && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Counter-signals</div>
            <div className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
              {(item.counterSignals.length > 0 ? item.counterSignals : ['No major countersignal is currently dominating the main read.']).map((signal) => (
                <p key={signal}>{signal}</p>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Historical anchors</div>
            <div className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
              {(item.historicalAnchors.length > 0 ? item.historicalAnchors : ['Historical anchors were weaker than the current live read.']).map((anchor) => (
                <p key={anchor}>{anchor}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      <TrustStrip
        className="mt-5"
        trustLayer={item.trustLayer}
        freshnessSummary={meta.freshnessSummary}
        provenanceSummary={meta.provenanceSummary}
        runDateSummary={meta.runDateSummary}
      />

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-60"
        >
          <Bookmark className="h-4 w-4" />
          {isSaved ? 'Saved' : isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onFollow}
          disabled={isFollowing}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
            isFollowed
              ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-900'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          {isFollowing ? 'Enabling updates...' : isFollowed ? 'Updates enabled' : 'Follow'}
        </button>
        <button
          type="button"
          onClick={onRemix}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
        >
          <GitBranch className="h-4 w-4" />
          Remix
        </button>
        <button
          type="button"
          onClick={onShare}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>

      <div className="mt-5">
        <EvidenceDrawer evidence={item.evidenceDrawer} />
      </div>
    </article>
  );
}
