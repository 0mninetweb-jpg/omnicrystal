import React from 'react';
import { Activity, AlertCircle, Loader2, Orbit } from 'lucide-react';
import { cn } from './CrystalCard';

type RuntimeMode = 'live' | 'limited' | 'preview';

export function RuntimeStatusSurface({
  mode,
  label,
  detail,
  isChecking = false,
  compact = false,
}: {
  mode: RuntimeMode;
  label: string;
  detail: string;
  isChecking?: boolean;
  compact?: boolean;
}) {
  const tone =
    mode === 'live'
      ? 'border-emerald-100 bg-emerald-50/90 text-emerald-800'
      : mode === 'limited'
        ? 'border-amber-100 bg-amber-50/90 text-amber-800'
        : 'border-slate-200 bg-slate-50/92 text-slate-700';

  const pillTone =
    mode === 'live'
      ? 'border-emerald-200 bg-white text-emerald-700'
      : mode === 'limited'
        ? 'border-amber-200 bg-white text-amber-700'
        : 'border-slate-200 bg-white text-slate-600';

  const Icon = isChecking ? Loader2 : mode === 'live' ? Orbit : mode === 'limited' ? AlertCircle : Activity;

  return (
    <div className={cn('rounded-[22px] border px-4 py-3', tone, compact && 'rounded-[20px] px-3.5 py-3')}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
            pillTone
          )}
        >
          <Icon className={cn('h-3.5 w-3.5', isChecking && 'animate-spin')} />
          {isChecking ? 'Checking runtime' : label}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6">{detail}</p>
    </div>
  );
}
