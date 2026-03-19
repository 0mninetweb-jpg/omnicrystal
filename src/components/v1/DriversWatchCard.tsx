import React from 'react';
import type { ForecastDriversWatchStackItem } from '../../types/forecastV1';

export function DriversWatchCard({ item }: { item: ForecastDriversWatchStackItem }) {
  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.title}</div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">Drivers</div>
          <div className="mt-3 space-y-3">
            {item.drivers.map((driver) => (
              <div key={driver.feature_key} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">{driver.feature_key.replace(/_/g, ' ')}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {driver.direction} · contribution {Math.round(driver.contribution * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">What to watch</div>
          <div className="mt-3 space-y-3">
            {item.whatToWatch.map((watch) => (
              <div key={watch} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {watch}
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
