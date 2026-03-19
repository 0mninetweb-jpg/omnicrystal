import React from 'react';
import type { ForecastPrimaryStackItem } from '../../types/forecastV1';
import { getForecastMetaCopy } from '../../lib/forecastV1';
import { TrustStrip } from './TrustStrip';
import { EvidenceDrawer } from './EvidenceDrawer';

type LimitedCardProps = {
  item: ForecastPrimaryStackItem;
  onRemix: () => void;
};

export function LimitedCard({ item, onRemix }: LimitedCardProps) {
  const meta = getForecastMetaCopy(item.card);

  return (
    <article className="rounded-[32px] border border-amber-200 bg-[linear-gradient(180deg,#fffdf7_0%,#ffffff_100%)] p-6 shadow-[0_18px_44px_rgba(120,53,15,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Limited signal</div>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{item.primaryOutcome}</h3>
        </div>
        <div className="rounded-full bg-amber-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
          Limited
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-slate-700">{item.summary}</p>

      <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
        Crystal can publish a directional read here, but confidence or coverage is still partial. Treat this as orientation, not a hard call.
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recommended move</div>
        <p className="mt-2 text-sm leading-7 text-slate-700">{item.recommendedAction}</p>
      </div>

      <TrustStrip
        className="mt-5"
        trustLayer={item.trustLayer}
        freshnessSummary={meta.freshnessSummary}
        provenanceSummary={meta.provenanceSummary}
      />

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRemix}
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Refine this forecast
        </button>
      </div>

      <div className="mt-5">
        <EvidenceDrawer evidence={item.evidenceDrawer} />
      </div>
    </article>
  );
}
