import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';

type ForecastComposerProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  examples: string[];
  onExampleClick: (query: string) => void;
};

export function ForecastComposer({
  query,
  onQueryChange,
  onSubmit,
  isSubmitting,
  examples,
  onExampleClick,
}: ForecastComposerProps) {
  return (
    <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] md:p-8">
      <div className="max-w-3xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Forecast</div>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950 md:text-6xl">What do you want to predict?</h1>
        <p className="mt-4 text-base leading-8 text-slate-600">
          Ask anything about the future. Crystal turns it into prediction cards with confidence, drivers, and what to watch.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8">
        <div className="flex flex-col gap-4 md:flex-row">
          <textarea
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Bitcoin next 30 days, will rents in Milan cool down by summer, should I wait before renting in Rome..."
            rows={3}
            className="min-h-[112px] flex-1 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4 text-base text-slate-900 outline-none transition focus:border-slate-400"
          />
          <button
            type="submit"
            disabled={isSubmitting || !query.trim()}
            className="inline-flex min-w-[160px] items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Forecast
          </button>
        </div>
      </form>

      <div className="mt-6 flex flex-wrap gap-2">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onExampleClick(example)}
            className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-950"
          >
            {example}
          </button>
        ))}
      </div>
    </section>
  );
}
