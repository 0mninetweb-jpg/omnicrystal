import React from 'react';
import { ArrowRight, Check, ChevronRight, Globe2, Layers3, Lock, Orbit, Sparkles, Waypoints } from 'lucide-react';
import { PRODUCT_BRAND, WORLD_SIM_BRAND } from '../content/brand';

type MarketingLandingProps = {
  isAuthenticated: boolean;
  onPrimaryAction: () => void;
  onOpenWorldSimPreview: () => void;
};

const PRODUCT_PREVIEWS = [
  {
    title: 'Forecast',
    body: 'Start with one question. Crystal answers directly, then gives you the reasoning behind it.',
    label: 'Answer first',
  },
  {
    title: 'Nextletter',
    body: 'Turn signals into a calmer daily read with summaries, probabilities, and what matters next.',
    label: 'Daily briefing',
  },
  {
    title: 'Watchlist',
    body: 'Keep a few places, markets, or themes in view without turning the product into a dense dashboard.',
    label: 'Pulse board',
  },
];

const HOW_IT_WORKS = [
  'Ask one concrete question.',
  'Get a readable answer and the main reasons behind it.',
  'Open WorldSim only when the system matters more than the headline.',
];

const PLANS = [
  {
    title: 'Free',
    copy: 'Start with the base product and understand the workflow clearly.',
  },
  {
    title: 'Plus',
    copy: 'Use Crystal more often with more credits and broader forecasting depth.',
  },
  {
    title: 'Pro',
    copy: 'Unlock the deepest runtime, premium simulation, and heavier usage patterns.',
  },
];

export function MarketingLanding({ isAuthenticated, onPrimaryAction, onOpenWorldSimPreview }: MarketingLandingProps) {
  return (
    <div className="marketing-shell min-h-screen text-slate-900">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-slate-950 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{PRODUCT_BRAND.name}</div>
            <div className="text-sm text-slate-500">{PRODUCT_BRAND.shellLabel}</div>
          </div>
        </div>

        <button
          onClick={onPrimaryAction}
          className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {isAuthenticated ? 'Open app' : 'Sign in'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-14 pt-4 md:gap-10 md:px-6 md:pb-20 md:pt-8">
        <section className="preview-frame overflow-hidden rounded-[36px] px-6 py-8 md:px-10 md:py-12">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div className="max-w-4xl">
              <div className="section-kicker">Prediction intelligence</div>
              <h1 className="mt-4 max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-slate-950 md:text-7xl md:leading-[0.92]">
                Crystal helps you read what may happen next.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 md:text-lg">
                A minimal product for turning one question into a clear forecast, useful context, and a deeper system view only when you need it.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={onPrimaryAction}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {isAuthenticated ? 'Open app' : 'Sign in to try Crystal'}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  How it works
                </a>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  ['Simple input', 'Ask one question'],
                  ['Readable output', 'Get one clear answer'],
                  ['Premium depth', 'Open WorldSim only when needed'],
                ].map(([label, copy]) => (
                  <div key={label} className="app-card rounded-[24px] px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
                    <div className="mt-3 text-sm font-semibold text-slate-900">{copy}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="app-surface rounded-[32px] p-5 md:p-6">
              <div className="section-kicker">Minimal workflow</div>
              <div className="mt-4 space-y-3">
                {HOW_IT_WORKS.map((item) => (
                  <div key={item} className="app-card flex items-center gap-3 rounded-[22px] px-4 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white">
                      <Check className="h-4 w-4" />
                    </div>
                    <div className="text-sm font-medium text-slate-700">{item}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="grid gap-5 lg:grid-cols-3">
          {PRODUCT_PREVIEWS.map((item) => (
            <article key={item.title} className="app-surface rounded-[30px] p-6">
              <div className="section-kicker">{item.label}</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="app-surface rounded-[32px] p-6 md:p-7">
            <div className="section-kicker">Product preview</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">A cleaner app after login.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
              The web app keeps the same product functions, but the experience becomes much lighter: one clear forecast flow, a calmer Home, a cleaner Nextletter, and a dedicated chamber for simulation.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="app-card rounded-[24px] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-[#1453e8]" />
                  Forecast
                </div>
                <div className="mt-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  One question, one answer, one reasoning path.
                </div>
              </div>
              <div className="app-card rounded-[24px] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Layers3 className="h-4 w-4 text-[#1453e8]" />
                  Home
                </div>
                <div className="mt-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  One action, recent reads, and a few things in view.
                </div>
              </div>
              <div className="app-card rounded-[24px] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Globe2 className="h-4 w-4 text-[#1453e8]" />
                  Nextletter
                </div>
                <div className="mt-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  A calmer reading surface for signals and briefings.
                </div>
              </div>
            </div>
          </div>

          <div className="oracle-panel rounded-[32px] p-6 md:p-7">
            <div className="section-kicker !text-rose-200">{WORLD_SIM_BRAND.name}</div>
            <h2 className="mt-3 max-w-md text-3xl font-semibold tracking-[-0.04em] text-white">
              A separate chamber for the deeper system read.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              WorldSim and Matrix Simulation stay premium, darker, and clearly separate from the everyday product shell.
            </p>
            <div className="mt-6 space-y-3">
              {[
                'Observe actors, pressure, and turning points.',
                'Run structured interventions in Matrix Simulation.',
                'Keep the normal app calm and minimal.',
              ].map((item) => (
                <div key={item} className="glass-panel rounded-[20px] px-4 py-3 text-sm text-slate-200">
                  {item}
                </div>
              ))}
            </div>
            <button
              onClick={onOpenWorldSimPreview}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              Preview {WORLD_SIM_BRAND.name}
              <Waypoints className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="app-surface rounded-[32px] p-6 md:p-7">
            <div className="section-kicker">Plans</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Start simple. Add depth only when you need it.</h2>
            <div className="mt-6 grid gap-3">
              {PLANS.map((plan) => (
                <div key={plan.title} className="app-card flex items-start justify-between gap-4 rounded-[22px] px-4 py-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{plan.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{plan.copy}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 text-slate-400" />
                </div>
              ))}
            </div>
          </div>

          <div className="app-surface rounded-[32px] p-6 md:p-7">
            <div className="section-kicker">Ready to try</div>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Crystal is simpler when it starts with the question, not the dashboard.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
              Use the public landing to understand the product quickly. Then open the app and work inside a cleaner, focused forecasting flow.
            </p>
            <button
              onClick={onPrimaryAction}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {isAuthenticated ? 'Open app' : 'Sign in to continue'}
              {isAuthenticated ? <Orbit className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
