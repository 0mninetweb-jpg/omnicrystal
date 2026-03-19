import React from 'react';
import { cn } from '../../lib/ui';

export type WorldSimStructuredScenario = {
  id: string;
  label: string;
  probability: number;
  summary: string;
  drivers: string[];
  triggers: string[];
  reliability: string;
};

export type WorldSimStructuredResult = {
  title: string;
  subtitle: string;
  sourceMode: 'preview' | 'live';
  sourceLabel: string;
  reliabilitySummary: string;
  compareMode: boolean;
  scenarios: WorldSimStructuredScenario[];
  keyDifferences: string[];
  sharedDrivers: string[];
  flipSignals: string[];
  statusLabel?: string;
};

export function WorldSimResult({ result }: { result: WorldSimStructuredResult }) {
  return (
    <section className="space-y-5">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">World Sim</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{result.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{result.subtitle}</p>
          </div>
          <div
            className={cn(
              'rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]',
              result.sourceMode === 'live' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
            )}
          >
            {result.sourceMode === 'live' ? 'Live simulation' : 'Structured fallback'}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reliability</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{result.reliabilitySummary}</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Source</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{result.sourceLabel}</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Compare mode</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{result.compareMode ? 'On' : 'Off'}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {result.scenarios.map((scenario, index) => (
          <article
            key={scenario.id}
            className={cn(
              'rounded-[32px] border p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]',
              index === 0
                ? 'border-slate-200 bg-white'
                : index === 1
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-rose-200 bg-rose-50/60'
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{scenario.label}</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                  {Math.round(scenario.probability * 100)}%
                </div>
              </div>
              <div className="rounded-full bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm">
                {scenario.reliability}
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-700">{scenario.summary}</p>

            <div className="mt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Drivers</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
                {scenario.drivers.map((driver) => (
                  <p key={driver}>{driver}</p>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Flip triggers</div>
              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
                {scenario.triggers.map((trigger) => (
                  <p key={trigger}>{trigger}</p>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Key differences</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
            {result.keyDifferences.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </article>
        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Shared drivers</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
            {result.sharedDrivers.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </article>
        <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">What flips the outcome</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
            {result.flipSignals.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
