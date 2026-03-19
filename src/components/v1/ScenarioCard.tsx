import React from 'react';
import type { ForecastScenarioStackItem } from '../../types/forecastV1';

export function ScenarioCard({ item }: { item: ForecastScenarioStackItem }) {
  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.title}</div>
      <div className="mt-5 space-y-4">
        {item.scenarios.map((scenario) => (
          <div key={scenario.scenario_id}>
            <div className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-900">
              <span>{scenario.label}</span>
              <span>{Math.round(scenario.probability * 100)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#0f172a,#2563eb)]"
                style={{ width: `${Math.max(6, Math.round(scenario.probability * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
