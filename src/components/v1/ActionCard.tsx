import React from 'react';
import type { ForecastActionStackItem } from '../../types/forecastV1';

export function ActionCard({ item }: { item: ForecastActionStackItem }) {
  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.title}</div>
      <div className="mt-4 text-lg font-semibold text-slate-950">{item.recommendedAction}</div>
      {item.supportingActions.length > 0 && (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {item.supportingActions.map((action) => (
            <div key={action.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">{action.label}</div>
              <div className="mt-2 text-sm leading-7 text-slate-700">{action.note}</div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
