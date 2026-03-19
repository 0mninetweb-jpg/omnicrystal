import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db } from '../../firebase';
import { createWorldSimSceneData } from '../../lib/worldSimScene';
import { patchQueryPlanWithFilters } from '../../lib/forecastV1';
import { compileQuery, createWorldSimJob, getWorldSimJobResult } from '../../services/geminiService';
import type { WorldSimDigest } from '../../types/crystal';
import type { WorldSimJobRef, WorldSimJobResult } from '../../types/worldSimJob';
import { isTerminalWorldSimJobStatus } from '../../types/worldSimJob';
import { useAppRuntime } from '../../context/AppRuntimeContext';
import { WorldSimResult, type WorldSimStructuredResult } from './WorldSimResult';

type WorldSimPageProps = {
  user: User | null;
  onLogin: () => void;
};

function buildStructuredResult(input: {
  query: string;
  assumptions: string;
  geography: string;
  horizon: string;
  compareMode: boolean;
  digest?: Partial<WorldSimDigest> | null;
  job?: WorldSimJobRef | null;
  sourceMode: 'preview' | 'live';
}): WorldSimStructuredResult {
  const scene = createWorldSimSceneData({
    title: `World Sim for ${input.query}`,
    subtitle: input.assumptions || 'Structured scenarios across base, upside, and stress paths.',
    question: input.query,
    digest: input.digest,
    mode: input.sourceMode,
  });

  const labels = ['Base case', 'Upside case', 'Stress case'];
  const summaries = [
    'The current path holds if the main drivers keep behaving the way they are behaving now.',
    'The better path opens if supportive signals strengthen faster than expected.',
    'The adverse path takes over if pressure compounds before the system adapts.',
  ];

  const scenarios = labels.map((label, index) => {
    const seed = scene.scenarios[index] || scene.scenarios[0];
    return {
      id: `${label}-${index}`,
      label,
      probability: seed?.probability ?? Math.max(0.15, 0.45 - index * 0.1),
      summary: summaries[index],
      drivers: [...scene.actors.slice(index, index + 2), ...scene.interventionPoints.slice(0, 1)].slice(0, 3),
      triggers: [...scene.interventionPoints.slice(index, index + 2), ...scene.tensions.slice(0, 1)].slice(0, 3),
      reliability:
        input.sourceMode === 'live'
          ? index === 0
            ? 'Higher'
            : 'Moderate'
          : 'Preview',
    };
  });

  return {
    title: scene.title,
    subtitle: `${scene.subtitle} Geography: ${input.geography || 'Auto'}. Horizon: ${input.horizon || '90 days'}.`,
    sourceMode: input.sourceMode,
    sourceLabel:
      input.sourceMode === 'live'
        ? input.job?.statusMessage || 'Live WorldSim job'
        : 'Structured fallback while the deeper simulation is unavailable or still loading.',
    reliabilitySummary:
      input.sourceMode === 'live'
        ? 'Live digest connected. Reliability varies by scenario and current graph coverage.'
        : 'Fallback mode. The page is still returning a structured scenario set instead of a raw error.',
    compareMode: input.compareMode,
    scenarios,
    keyDifferences: [
      'The base case assumes the present driver mix holds without a new external shock.',
      'The upside case needs at least one stabilizing signal to arrive early enough to matter.',
      'The stress case dominates if the main tension starts spreading faster than institutions can absorb it.',
    ],
    sharedDrivers: [...scene.actors.slice(0, 3), ...scene.communityNotes.slice(0, 2)].slice(0, 5),
    flipSignals: [...scene.interventionPoints.slice(0, 3), ...scene.tensions.slice(0, 2)].slice(0, 5),
    statusLabel: input.job?.status,
  };
}

export function WorldSimPage({ user, onLogin }: WorldSimPageProps) {
  const runtime = useAppRuntime();
  const [query, setQuery] = useState('Will rents in Milan cool down by summer?');
  const [assumptions, setAssumptions] = useState('');
  const [geography, setGeography] = useState('Auto');
  const [horizon, setHorizon] = useState('90 days');
  const [compareMode, setCompareMode] = useState(true);
  const [result, setResult] = useState<WorldSimStructuredResult | null>(null);
  const [job, setJob] = useState<WorldSimJobRef | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const fallbackResult = useMemo(
    () =>
      buildStructuredResult({
        query,
        assumptions,
        geography,
        horizon,
        compareMode,
        sourceMode: 'preview',
      }),
    [assumptions, compareMode, geography, horizon, query]
  );

  useEffect(() => {
    const jobId = job?.jobId;
    if (!jobId || isTerminalWorldSimJobStatus(job?.status)) return;

    let active = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const payload = (await getWorldSimJobResult(jobId)) as WorldSimJobResult<WorldSimDigest>;
        if (!active) return;
        setJob(payload.job);
        setResult(
          buildStructuredResult({
            query,
            assumptions,
            geography,
            horizon,
            compareMode,
            digest: payload.digest,
            job: payload.job,
            sourceMode: payload.job.status === 'completed' ? 'live' : 'preview',
          })
        );
        if (!isTerminalWorldSimJobStatus(payload.job.status)) {
          timer = window.setTimeout(poll, 4000);
        } else {
          setIsRunning(false);
        }
      } catch (_error) {
        if (active) {
          timer = window.setTimeout(poll, 6000);
        }
      }
    };

    void poll();

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [assumptions, compareMode, geography, horizon, job?.jobId, job?.status, query]);

  const handleRun = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;

    setIsRunning(true);
    setResult(fallbackResult);

    if (!user || !runtime.worldSimBetaAvailable) {
      setJob(null);
      setResult(fallbackResult);
      setIsRunning(false);
      return;
    }

    try {
      const plan = await compileQuery(query);
      const patchedPlan = patchQueryPlanWithFilters(plan, {
        entity: '',
        geography: geography.toLowerCase() === 'italy' ? 'italy' : geography.toLowerCase() === 'rome' ? 'rome' : geography.toLowerCase() === 'milan' ? 'milan' : 'auto',
        horizon: horizon === '12 months' ? '12m' : horizon === '6 months' ? '6m' : horizon === '30 days' ? '30d' : '90d',
        confidence: 'rigorous',
      });
      const userSnapshot = await getDoc(doc(db, 'users', user.uid));
      const userContext = userSnapshot.exists() ? userSnapshot.data() : undefined;
      const created = await createWorldSimJob(query, patchedPlan, userContext, 'manual', 'sim-page');
      setJob(created.job || null);
      setResult(
        buildStructuredResult({
          query,
          assumptions,
          geography,
          horizon,
          compareMode,
          digest: null,
          job: created.job || null,
          sourceMode: 'preview',
        })
      );
    } catch (_error) {
      setJob(null);
      setResult(fallbackResult);
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.05)] md:p-8">
        <div className="max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">World Sim</div>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-slate-950 md:text-6xl">Structured scenarios, not empty depth theater.</h1>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Use World Sim when a question depends on actors, pressure, turning points, and what would flip the outcome. Even if the deep engine is unavailable, Crystal still returns a structured simulation result.
          </p>
        </div>

        <form onSubmit={handleRun} className="mt-8 grid gap-4">
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={3}
            className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4 text-base text-slate-900 outline-none transition focus:border-slate-400"
            placeholder="What system do you want to simulate?"
          />
          <textarea
            value={assumptions}
            onChange={(event) => setAssumptions(event.target.value)}
            rows={3}
            className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            placeholder="Assumptions or context"
          />
          <div className="grid gap-4 md:grid-cols-4">
            <select
              value={geography}
              onChange={(event) => setGeography(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            >
              <option>Auto</option>
              <option>Global</option>
              <option>Italy</option>
              <option>Rome</option>
              <option>Milan</option>
            </select>
            <select
              value={horizon}
              onChange={(event) => setHorizon(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            >
              <option>30 days</option>
              <option>90 days</option>
              <option>6 months</option>
              <option>12 months</option>
            </select>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={compareMode} onChange={(event) => setCompareMode(event.target.checked)} />
              Compare mode
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Run simulation
            </button>
          </div>
        </form>

        {!user ? (
          <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
            Guest mode can explore World Sim in structured fallback. Sign in if you want live async jobs and richer runtime depth.
            <button
              type="button"
              onClick={onLogin}
              className="ml-3 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Sign in
            </button>
          </div>
        ) : null}
      </section>

      <WorldSimResult result={result || fallbackResult} />
    </div>
  );
}
