import React from 'react';
import type { TrustLayer } from '../../types/crystal';
import { cn } from '../../lib/ui';

type TrustStripProps = {
  trustLayer?: TrustLayer;
  freshnessSummary?: string;
  provenanceSummary?: string;
  runDateSummary?: string;
  className?: string;
};

function toPercent(value?: number) {
  if (!Number.isFinite(value)) return 'N/A';
  return `${Math.round((value || 0) * 100)}%`;
}

function formatSufficiency(value?: string) {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ');
}

export function TrustStrip({ trustLayer, freshnessSummary, provenanceSummary, runDateSummary, className }: TrustStripProps) {
  return (
    <div
      className={cn(
        'grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600',
        runDateSummary ? 'md:grid-cols-5' : 'md:grid-cols-4',
        className
      )}
    >
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Confidence</div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{toPercent(trustLayer?.confidence_score)}</div>
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sufficiency</div>
        <div className="mt-1 text-sm font-semibold capitalize text-slate-900">
          {formatSufficiency(trustLayer?.data_sufficiency_flag)}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Freshness</div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{freshnessSummary || 'Not available'}</div>
      </div>
      {runDateSummary ? (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Run Date</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{runDateSummary}</div>
        </div>
      ) : null}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Provenance</div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{provenanceSummary || 'Not available'}</div>
      </div>
    </div>
  );
}
