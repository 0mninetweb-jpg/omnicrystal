import React from 'react';
import type { ForecastUiFilters } from '../../types/forecastV1';
import {
  CONFIDENCE_OPTIONS,
  GEOGRAPHY_OPTIONS,
  HORIZON_OPTIONS,
  formatConfidenceLabel,
  formatHorizonLabel,
} from '../../lib/forecastV1';
import { cn } from '../../lib/ui';

type UniversalFiltersProps = {
  filters: ForecastUiFilters;
  canUseFeature: (feature: 'search_horizon_90d' | 'search_horizon_6m' | 'search_horizon_12m' | 'search_confidence_rigorous') => boolean;
  onChange: (patch: Partial<ForecastUiFilters>) => void;
  onLockedOption: (label: string, recommendedPlan: 'plus' | 'pro') => void;
};

function FilterPill({
  active,
  label,
  badge,
  locked,
  onClick,
}: {
  active: boolean;
  label: string;
  badge?: 'Plus' | 'Pro';
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
        active
          ? 'border-slate-950 bg-slate-950 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950'
      )}
    >
      {label}
      {badge ? (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]',
            active ? 'bg-white/12 text-white' : badge === 'Pro' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
          )}
        >
          {locked ? `${badge} only` : badge}
        </span>
      ) : null}
    </button>
  );
}

export function UniversalFilters({ filters, canUseFeature, onChange, onLockedOption }: UniversalFiltersProps) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.04)]">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr_1.2fr_1.2fr]">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Entity</div>
          <input
            type="text"
            value={filters.entity}
            onChange={(event) => onChange({ entity: event.target.value })}
            placeholder="Auto-detect or specify one"
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Geography</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(GEOGRAPHY_OPTIONS).map(([value, meta]) => (
              <FilterPill
                key={value}
                active={filters.geography === value}
                label={meta.label}
                onClick={() => onChange({ geography: value as ForecastUiFilters['geography'] })}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Horizon</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {HORIZON_OPTIONS.map((option) => {
              const locked = option.feature ? !canUseFeature(option.feature) : false;
              return (
                <FilterPill
                  key={option.value}
                  active={filters.horizon === option.value}
                  label={formatHorizonLabel(option.value)}
                  badge={option.badge}
                  locked={locked}
                  onClick={() => (locked ? onLockedOption(option.label, option.badge === 'Pro' ? 'pro' : 'plus') : onChange({ horizon: option.value }))}
                />
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Confidence</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONFIDENCE_OPTIONS.map((option) => {
              const locked = option.feature ? !canUseFeature(option.feature) : false;
              return (
                <FilterPill
                  key={option.value}
                  active={filters.confidence === option.value}
                  label={formatConfidenceLabel(option.value)}
                  badge={option.badge}
                  locked={locked}
                  onClick={() => (locked ? onLockedOption(option.label, 'pro') : onChange({ confidence: option.value }))}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
