import React from 'react';
import type { EvidenceDrawer as EvidenceDrawerData } from '../../types/crystal';

type EvidenceDrawerProps = {
  evidence?: EvidenceDrawerData;
};

export function EvidenceDrawer({ evidence }: EvidenceDrawerProps) {
  if (!evidence) return null;

  return (
    <details className="rounded-3xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">Evidence details</summary>
      <div className="mt-4 grid gap-4 text-sm text-slate-600 md:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Metrics provenance</div>
          <div className="mt-2 space-y-2">
            {(evidence.metrics_provenance || []).slice(0, 4).map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Coverage notes</div>
          <div className="mt-2 space-y-2">
            {(evidence.coverage_notes || []).slice(0, 4).map((item) => (
              <p key={item}>{item}</p>
            ))}
            {evidence.gating_reason ? <p>{evidence.gating_reason}</p> : null}
          </div>
        </div>
      </div>
    </details>
  );
}
