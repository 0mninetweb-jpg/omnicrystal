import React from 'react';
import { ArrowRight, Eye, Sparkles } from 'lucide-react';
import { WORLD_SIM_BRAND } from '../content/brand';
import type { WorldSimSceneData } from '../types/worldSim';
import type { WorldSimJobDetail, WorldSimJobRef } from '../types/worldSimJob';
import { cn } from './CrystalCard';

interface WorldSimInlineCardProps {
  data: WorldSimSceneData;
  job?: WorldSimJobRef | WorldSimJobDetail | null;
  onOpen: () => void;
  className?: string;
  compact?: boolean;
  ctaLabel?: string;
}

export function WorldSimInlineCard({
  data,
  job,
  onOpen,
  className,
  compact = false,
  ctaLabel = WORLD_SIM_BRAND.enterLabel,
}: WorldSimInlineCardProps) {
  return (
    <section className={cn('oracle-panel overflow-hidden rounded-[32px] p-5 md:p-6', className)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-kicker !text-rose-200">{data.kicker}</span>
            <span
            className={cn(
                'rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                job && job.status !== 'completed'
                  ? 'border-sky-300/30 bg-sky-300/10 text-sky-100'
                  : data.mode === 'live'
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                  : 'border-amber-300/25 bg-amber-300/10 text-amber-100'
              )}
            >
              {job && job.status !== 'completed' ? job.status : data.mode === 'live' ? 'Live' : 'Preview'}
            </span>
            {job && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                {Math.round((job.progress || 0) * 100)}% · {job.agentCount} agents
              </span>
            )}
            {job?.depth && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                {job.depth}
              </span>
            )}
          </div>
          <h3 className="mt-3 text-2xl font-display font-semibold text-white md:text-3xl">{data.title}</h3>
          <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">{data.subtitle}</p>
        </div>

        <button
          onClick={onOpen}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
        >
          <Eye className="h-4 w-4" />
          {ctaLabel}
        </button>
      </div>

      <div className={cn('mt-5 grid gap-4', compact ? 'md:grid-cols-[1.1fr_0.9fr]' : 'xl:grid-cols-[1.1fr_0.9fr]')}>
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Question</div>
          <p className="mt-3 text-sm leading-7 text-slate-200">{data.question}</p>
          <p className="mt-4 text-xs leading-6 text-slate-400">{data.truthNote}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-200">
              <Sparkles className="h-4 w-4" />
              Pivotal actors
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.actors.slice(0, 3).map((actor) => (
                <span key={actor} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white">
                  {actor}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">What the layer adds</div>
          <p className="mt-3 text-sm leading-7 text-slate-200">
            {job?.statusMessage || WORLD_SIM_BRAND.honestNote}
          </p>
        </div>
      </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {data.scenarios.slice(0, 3).map((scenario) => (
          <span
            key={scenario.label}
            className="rounded-full border border-rose-200/15 bg-rose-300/10 px-3 py-1 text-[11px] font-semibold text-rose-100"
          >
            {scenario.label} - {Math.round(scenario.probability * 100)}%
          </span>
        ))}
      </div>

      {!compact && (
        <div className="mt-5 flex items-center gap-3 text-xs font-medium text-slate-400">
          <span>{data.sourceLabel}</span>
          <ArrowRight className="h-3.5 w-3.5 text-rose-200" />
          <span>Interroga il sistema con prompt guidati e leggi la simulazione dall alto.</span>
        </div>
      )}
    </section>
  );
}
