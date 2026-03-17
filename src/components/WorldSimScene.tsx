import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Copy,
  Globe2,
  Loader2,
  Play,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import type { WorldSimDigest } from '../types/crystal';
import type { MatrixInterventionPayload, MatrixSimulationResult, SimulationBranch, WorldSimSceneData, WorldSimSceneNode, WorldSimScenePrompt } from '../types/worldSim';
import type { WorldSimJobDetail, WorldSimJobRef, WorldSimJobResult } from '../types/worldSimJob';
import { isTerminalWorldSimJobStatus as isWorldSimJobTerminal } from '../types/worldSimJob';
import { cancelMatrixSimulationJob, cancelWorldSimJob, createMatrixSimulationJob, getMatrixSimulationJobResult, getWorldSimJobResult } from '../services/geminiService';
import { useCrystalPlan } from '../context/CrystalPlanContext';
import { useAppRuntime } from '../context/AppRuntimeContext';
import { useAppShell } from '../context/AppShellContext';
import { formatProbabilityLabel, formatSignedDelta, getMarketSignalLabel, getMarketSignalState } from '../lib/predictionMarket';
import { createMatrixSimulationPreviewResult, createSimulationBranch, createWorldSimSceneData } from '../lib/worldSimScene';
import { getWorldSimPlanTier } from '../lib/crystalPlans';
import { WORLD_SIM_BRAND } from '../content/brand';
import { cn } from './CrystalCard';
import { RuntimeStatusSurface } from './RuntimeStatusSurface';

interface WorldSimSceneProps {
  open: boolean;
  mode: 'preview' | 'live';
  data: WorldSimSceneData;
  job?: WorldSimJobRef | null;
  onClose: () => void;
}

const NODE_SIZE_MAP: Record<WorldSimSceneNode['size'], string> = {
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-14 w-14',
};

const TONE_CLASS_MAP: Record<WorldSimSceneNode['tone'], string> = {
  signal: 'border-sky-300/30 bg-sky-400/15 text-sky-100 shadow-[0_0_26px_rgba(56,189,248,0.18)]',
  pressure: 'border-rose-300/30 bg-rose-400/15 text-rose-100 shadow-[0_0_26px_rgba(244,63,94,0.18)]',
  stability: 'border-emerald-300/30 bg-emerald-400/15 text-emerald-100 shadow-[0_0_26px_rgba(52,211,153,0.16)]',
};

const STAT_ACCENT_MAP = {
  blue: 'border-sky-400/20 bg-sky-400/10 text-sky-100',
  rose: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
  emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
  amber: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
} as const;

function clamp01(value: number, fallback = 0.42) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0.1, Math.min(1, value));
}

function getMarketTone(state: ReturnType<typeof getMarketSignalState>) {
  if (state === 'calibrated') return 'border-sky-300/20 bg-sky-300/10 text-sky-100';
  if (state === 'diverge') return 'border-rose-300/20 bg-rose-300/10 text-rose-100';
  if (state === 'watch') return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
  return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';
}

function getNodePosition(node: WorldSimSceneNode) {
  const radians = (node.angle * Math.PI) / 180;
  const x = 50 + Math.cos(radians) * node.distance;
  const y = 50 + Math.sin(radians) * node.distance;
  return { x, y };
}

function findPoint(id: string, nodes: WorldSimSceneNode[]) {
  if (id === 'core') return { x: 50, y: 50 };
  const node = nodes.find((item) => item.id === id);
  return node ? getNodePosition(node) : { x: 50, y: 50 };
}

function createFallbackQueryPlan(scene: WorldSimSceneData) {
  return {
    domain_id: scene.marketFrame?.outcome ? 'A.11.geopolitics.trade_tensions' : 'A.10.consumer.consumer_confidence',
    horizons: [{ horizon_id: scene.marketFrame?.horizon || '30d' }],
    filters: {
      confidence_preference: 'rigorous',
    },
  };
}

function duplicateBranchPayload(payload: MatrixInterventionPayload): MatrixInterventionPayload {
  return {
    ...payload,
    intensity: clamp01(payload.intensity + 0.08, payload.intensity),
    timing: payload.timing === 'Immediately' ? 'One week later' : payload.timing,
  };
}

export function WorldSimScene({ open, mode, data, job, onClose }: WorldSimSceneProps) {
  const capabilities = useAppRuntime();
  const { isPhone, isTablet, motionMode } = useAppShell();
  const { entitlements } = useCrystalPlan();
  const worldSimTier = useMemo(() => getWorldSimPlanTier(entitlements.plan), [entitlements.plan]);
  const shouldAnimate = motionMode !== 'minimal';
  const [selectedPromptId, setSelectedPromptId] = useState<string>(data.prompts[0]?.id || '');
  const [jobDetail, setJobDetail] = useState<WorldSimJobDetail | null>((job as WorldSimJobDetail | null) || null);
  const [jobDigest, setJobDigest] = useState<WorldSimDigest | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [viewMode, setViewMode] = useState<'observe' | 'intervene'>(data.viewMode || 'observe');
  const [selectedInterventionId, setSelectedInterventionId] = useState<string>('');
  const [draftPayload, setDraftPayload] = useState<MatrixInterventionPayload | null>(null);
  const [branches, setBranches] = useState<SimulationBranch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [isRunningBranch, setIsRunningBranch] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedPromptId(data.prompts[0]?.id || '');
    setViewMode(data.viewMode || 'observe');
    setBranches(data.branch ? [data.branch] : []);
    setActiveBranchId(data.branch?.id || null);
    setBranchError(null);
  }, [data, open]);

  useEffect(() => {
    setJobDetail((job as WorldSimJobDetail | null) || null);
    setJobDigest(null);
  }, [job]);

  const allowedInterventions = useMemo(
    () => data.availableInterventions.filter((item) => item.allowedPlans.includes(entitlements.plan)),
    [data.availableInterventions, entitlements.plan]
  );

  useEffect(() => {
    const preferred = allowedInterventions[0];
    if (!preferred) return;
    setSelectedInterventionId((current) => {
      if (current && allowedInterventions.some((item) => item.id === current)) return current;
      return preferred.id;
    });
  }, [allowedInterventions]);

  useEffect(() => {
    const selected = allowedInterventions.find((item) => item.id === selectedInterventionId);
    if (!selected) return;
    setDraftPayload((current) => {
      if (current?.cardId === selected.id) return current;
      return { ...selected.defaultPayload };
    });
  }, [allowedInterventions, selectedInterventionId]);

  useEffect(() => {
    const jobId = job?.jobId;
    if (!open || !jobId) return;

    let active = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const result = (await getWorldSimJobResult(jobId)) as WorldSimJobResult<WorldSimDigest>;
        if (!active) return;
        setJobDetail(result.job);
        setJobDigest(result.digest);
        if (!isWorldSimJobTerminal(result.job.status)) {
          timer = window.setTimeout(poll, 4000);
        }
      } catch (jobError) {
        console.error('WorldSim chamber polling error:', jobError);
        if (active) {
          timer = window.setTimeout(poll, 6500);
        }
      }
    };

    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [job?.jobId, open]);

  const activeData = useMemo(() => {
    if (!jobDetail && !jobDigest) return data;
    if (!jobDigest) {
      return {
        ...data,
        jobStatus: jobDetail?.status || data.jobStatus || null,
        jobProgress: jobDetail?.progress ?? data.jobProgress ?? 0,
        jobMessage: jobDetail?.statusMessage || data.jobMessage || '',
        agentCount: jobDetail?.agentCount || data.agentCount,
      };
    }

    return createWorldSimSceneData({
      title: data.title,
      subtitle: data.subtitle,
      question: data.question,
      sourceLabel: jobDetail?.status === 'completed' ? 'MiroFish completed job' : data.sourceLabel,
      mode: jobDetail?.status === 'completed' ? 'live' : mode,
      viewMode,
      digest: jobDigest,
      narrativeArc: jobDigest.narrative_arc || data.narrativeArc,
      actors: jobDigest.pivotal_actors?.length ? jobDigest.pivotal_actors : data.actors,
      interventionPoints: jobDigest.intervention_points?.length ? jobDigest.intervention_points : data.interventionPoints,
      tensions: jobDigest.tensions?.length ? jobDigest.tensions : data.tensions,
      communityNotes: jobDigest.community_summaries?.length ? jobDigest.community_summaries : data.communityNotes,
      scenarios: jobDigest.scenario_frequencies?.length ? jobDigest.scenario_frequencies : data.scenarios,
      marketFrame: jobDigest.prediction_market_frame || data.marketFrame,
      job: jobDetail || job || null,
      branch: branches.find((item) => item.id === activeBranchId) || null,
      availableInterventions: allowedInterventions.length > 0 ? allowedInterventions : data.availableInterventions,
      branchLimit: worldSimTier.matrixBranchLimit,
    });
  }, [activeBranchId, allowedInterventions, branches, data, job, jobDetail, jobDigest, mode, viewMode, worldSimTier.matrixBranchLimit]);

  const displayNodes = useMemo(() => {
    if (isPhone) return activeData.nodes.slice(0, 4);
    if (isTablet) return activeData.nodes.slice(0, 6);
    return activeData.nodes;
  }, [activeData.nodes, isPhone, isTablet]);

  const links = useMemo(
    () =>
      activeData.links
        .filter(
          (link) =>
            link.from === 'core' ||
            link.to === 'core' ||
            (displayNodes.some((node) => node.id === link.from) && displayNodes.some((node) => node.id === link.to))
        )
        .map((link) => {
        const from = findPoint(link.from, displayNodes);
        const to = findPoint(link.to, displayNodes);
        return { ...link, from, to };
      }),
    [activeData.links, displayNodes]
  );

  const selectedPrompt: WorldSimScenePrompt | undefined = useMemo(
    () => activeData.prompts.find((prompt) => prompt.id === selectedPromptId) || activeData.prompts[0],
    [activeData.prompts, selectedPromptId]
  );

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === activeBranchId) || branches[branches.length - 1] || null,
    [activeBranchId, branches]
  );

  useEffect(() => {
    const branch = selectedBranch;
    if (!open || !branch?.jobId || !['queued', 'running'].includes(branch.status)) return;

    let active = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const result = (await getMatrixSimulationJobResult(branch.jobId!)) as WorldSimJobResult<
          WorldSimDigest,
          unknown,
          unknown,
          MatrixSimulationResult
        >;
        if (!active) return;
        setBranches((current) =>
          current.map((item) =>
            item.id === branch.id
              ? {
                  ...item,
                  jobId: result.job.jobId,
                  status:
                    result.job.status === 'completed'
                      ? 'completed'
                      : result.job.status === 'failed'
                        ? 'failed'
                        : result.job.status === 'canceled'
                          ? 'canceled'
                          : 'running',
                  result: result.matrix || item.result,
                }
              : item
          )
        );
        if (!isWorldSimJobTerminal(result.job.status)) {
          timer = window.setTimeout(poll, 4500);
        }
      } catch (pollError) {
        console.error('Matrix Simulation polling error:', pollError);
        if (active) {
          timer = window.setTimeout(poll, 7000);
        }
      }
    };

    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, selectedBranch]);

  const marketState = getMarketSignalState(activeData.marketFrame);

  const handleCancelJob = async () => {
    if (!jobDetail?.jobId || isCanceling) return;
    setIsCanceling(true);
    try {
      const nextJob = (await cancelWorldSimJob(jobDetail.jobId)) as WorldSimJobDetail;
      setJobDetail(nextJob);
    } catch (cancelError) {
      console.error('WorldSim cancel error:', cancelError);
    } finally {
      setIsCanceling(false);
    }
  };

  const handleRunBranch = async () => {
    if (!draftPayload) return;
    if (branches.length >= worldSimTier.matrixBranchLimit) {
      setBranchError(`You have reached the ${worldSimTier.matrixBranchLimit}-branch limit for the ${entitlements.plan} plan.`);
      return;
    }

    const branchId = crypto.randomUUID?.() || `matrix-${Date.now()}`;
    setBranchError(null);
    setIsRunningBranch(true);
    try {
      if (!capabilities.worldSimAvailable) {
        const previewResult = createMatrixSimulationPreviewResult({
          scene: activeData,
          payload: draftPayload,
          branchId,
          sourceMode: 'preview',
        });
        const branch = createSimulationBranch({
          id: branchId,
          label: draftPayload.label,
          payload: draftPayload,
          parentId: selectedBranch?.id || null,
          status: 'completed',
          result: previewResult,
        });
        setBranches((current) => [...current, branch]);
        setActiveBranchId(branch.id);
        return;
      }

      const created = await createMatrixSimulationJob(activeData.question, createFallbackQueryPlan(activeData), draftPayload, {
        branchParentId: selectedBranch?.id || null,
        source: 'matrix-simulation',
        sourceRef: activeData.id,
      });
      const branch = createSimulationBranch({
        id: branchId,
        label: draftPayload.label,
        payload: draftPayload,
        parentId: selectedBranch?.id || null,
        status: 'queued',
        jobId: created.job?.jobId || null,
      });
      setBranches((current) => [...current, branch]);
      setActiveBranchId(branch.id);
    } catch (branchRunError) {
      console.error('Matrix Simulation run error:', branchRunError);
      setBranchError(branchRunError instanceof Error ? branchRunError.message : 'Unable to start the simulation.');
    } finally {
      setIsRunningBranch(false);
    }
  };

  const handleDuplicateBranch = () => {
    if (!selectedBranch) return;
    if (branches.length >= worldSimTier.matrixBranchLimit) {
      setBranchError(`You have reached the ${worldSimTier.matrixBranchLimit}-branch limit for the ${entitlements.plan} plan.`);
      return;
    }
    const duplicated = duplicateBranchPayload(selectedBranch.payload);
    setViewMode('intervene');
    setSelectedInterventionId(duplicated.cardId);
    setDraftPayload(duplicated);
    setBranchError(null);
  };

  const handleCancelBranch = async () => {
    if (!selectedBranch?.jobId || selectedBranch.status !== 'running') return;
    try {
      await cancelMatrixSimulationJob(selectedBranch.jobId);
      setBranches((current) =>
        current.map((item) => (item.id === selectedBranch.id ? { ...item, status: 'canceled' } : item))
      );
    } catch (cancelError) {
      console.error('Matrix Simulation cancel error:', cancelError);
    }
  };

  const stageNarrative =
    viewMode === 'intervene' && selectedBranch?.result
      ? selectedBranch.result.interventionDigest?.narrative_arc || activeData.narrativeArc
      : activeData.narrativeArc;
  const chamberClassName = isPhone
    ? 'observatory-shell relative flex h-[100dvh] w-full max-w-none flex-col overflow-hidden border-0 text-white shadow-none'
    : isTablet
      ? 'observatory-shell relative flex h-[94vh] w-full max-w-[1220px] flex-col overflow-hidden rounded-[32px] border border-white/10 text-white shadow-[0_30px_110px_rgba(2,6,23,0.38)]'
      : 'observatory-shell relative flex h-[min(92vh,980px)] w-full max-w-[1500px] flex-col overflow-hidden rounded-[36px] border border-white/10 text-white shadow-[0_40px_140px_rgba(2,6,23,0.45)]';
  const stageGridClassName = isPhone
    ? 'relative flex min-h-0 flex-1 flex-col'
    : isTablet
      ? 'relative grid min-h-0 flex-1 lg:grid-cols-[1fr_0.96fr]'
      : 'relative grid min-h-0 flex-1 lg:grid-cols-[1.1fr_0.9fr]';
  const stagePanelClassName = isPhone
    ? 'relative min-h-[300px] overflow-hidden border-b border-white/10 p-4'
    : 'relative min-h-[360px] overflow-hidden border-b border-white/10 p-5 md:p-7 lg:border-b-0 lg:border-r';
  const stageViewportClassName = isPhone
    ? 'relative mt-5 h-[34vh] min-h-[280px] overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.3),rgba(2,6,23,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
    : 'relative mt-6 h-[46vh] min-h-[360px] overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.3),rgba(2,6,23,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
  const railClassName = isPhone
    ? 'min-h-0 overflow-y-auto border-t border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-4'
    : 'matrix-rail min-h-0 overflow-y-auto p-5 md:p-7';

  return (
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-[140] flex items-center justify-center', isPhone ? 'p-0' : 'p-3 md:p-6')}>
          <motion.button
            initial={shouldAnimate ? { opacity: 0 } : undefined}
            animate={shouldAnimate ? { opacity: 1 } : undefined}
            exit={shouldAnimate ? { opacity: 0 } : undefined}
            onClick={onClose}
            className="absolute inset-0 bg-[rgba(2,6,23,0.76)] backdrop-blur-xl"
            aria-label="Close WorldSim"
          />

          <motion.div
            initial={shouldAnimate ? { opacity: 0, y: 24, scale: 0.98 } : undefined}
            animate={shouldAnimate ? { opacity: 1, y: 0, scale: 1 } : undefined}
            exit={shouldAnimate ? { opacity: 0, y: 24, scale: 0.98 } : undefined}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={chamberClassName}
          >
            <div className="world-sim-grid pointer-events-none absolute inset-0 opacity-80" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.14),transparent_22%),radial-gradient(circle_at_left,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.12),transparent_24%)]" />

            <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-4 md:px-7">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="section-kicker !text-slate-400">{activeData.kicker}</span>
                  <span
                    className={cn(
                      'rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                      activeData.mode === 'live'
                        ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                        : 'border-amber-300/20 bg-amber-300/10 text-amber-100'
                    )}
                  >
                    {activeData.mode === 'live' ? 'Live' : 'Preview'}
                  </span>
                  <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                    {([
                      { id: 'observe', label: WORLD_SIM_BRAND.observeLabel },
                      { id: 'intervene', label: WORLD_SIM_BRAND.interveneLabel },
                    ] as const).map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setViewMode(option.id)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition',
                          viewMode === option.id ? 'bg-white text-slate-950' : 'text-slate-300'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <h2 className="mt-2 text-2xl font-display font-semibold text-white md:text-3xl">{activeData.title}</h2>
                <div className="mt-3 max-w-3xl">
                  <RuntimeStatusSurface
                    mode={capabilities.runtimeMode}
                    label={capabilities.statusLabel}
                    detail={capabilities.statusDetail}
                    isChecking={capabilities.isChecking}
                    compact
                  />
                </div>
              </div>

              <button
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className={stageGridClassName}>
              <div className={stagePanelClassName}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{activeData.sourceLabel}</div>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                      {viewMode === 'observe'
                        ? activeData.subtitle
                        : `Matrix Simulation tests a structured intervention and shows Baseline world, Intervention world, and Delta. ${WORLD_SIM_BRAND.matrixPreviewNote}`}
                    </p>
                  </div>
                  <div className="glass-panel rounded-[20px] px-4 py-3 text-xs leading-6 text-slate-300">
                    <div className="font-semibold text-white">Truth layer</div>
                    <div className="mt-1">{viewMode === 'observe' ? activeData.truthNote : WORLD_SIM_BRAND.matrixPreviewNote}</div>
                  </div>
                </div>

                {viewMode === 'observe' && jobDetail && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[20px] border border-sky-300/10 bg-sky-300/5 px-4 py-3 text-xs text-sky-100">
                    <div className="inline-flex items-center gap-2 font-semibold uppercase tracking-[0.18em]">
                      {!isWorldSimJobTerminal(jobDetail.status) && <Loader2 className="h-4 w-4 animate-spin" />}
                      {jobDetail.status}
                    </div>
                    <div>{Math.round((jobDetail.progress || 0) * 100)}%</div>
                    <div>{jobDetail.agentCount} agents</div>
                    {jobDetail.depth && <div>{jobDetail.depth}</div>}
                    {jobDetail.queue && <div>{jobDetail.queue}</div>}
                    <div className="text-slate-300">{jobDetail.statusMessage}</div>
                    {!isWorldSimJobTerminal(jobDetail.status) && (
                      <button
                        onClick={handleCancelJob}
                        disabled={isCanceling}
                        className="ml-auto rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isCanceling ? 'Canceling...' : 'Cancel job'}
                      </button>
                    )}
                  </div>
                )}

                <div className={stageViewportClassName}>
                  <div className="world-sim-scan pointer-events-none absolute inset-0 opacity-60" />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_28%),radial-gradient(circle_at_center,rgba(244,63,94,0.08),transparent_46%)]" />
                  <svg className="absolute inset-0 h-full w-full">
                    {links.map((link) => (
                      <line
                        key={link.id}
                        x1={`${link.from.x}%`}
                        y1={`${link.from.y}%`}
                        x2={`${link.to.x}%`}
                        y2={`${link.to.y}%`}
                        stroke={
                          link.strength === 'high'
                            ? 'rgba(244, 63, 94, 0.55)'
                            : link.strength === 'medium'
                              ? 'rgba(56, 189, 248, 0.45)'
                              : 'rgba(148, 163, 184, 0.28)'
                        }
                        strokeWidth={link.strength === 'high' ? 1.8 : link.strength === 'medium' ? 1.3 : 1}
                        strokeDasharray={link.strength === 'low' ? '4 6' : '0'}
                      />
                    ))}
                  </svg>

                  <div className="absolute left-1/2 top-1/2 h-[170px] w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/20 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),rgba(56,189,248,0.18),rgba(2,6,23,0.2))] shadow-[0_0_80px_rgba(56,189,248,0.18)]">
                    <div className="world-sim-globe absolute inset-0 rounded-full" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <Globe2 className="h-8 w-8 text-sky-100" />
                      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                        {viewMode === 'observe' ? 'World state' : WORLD_SIM_BRAND.matrixName}
                      </div>
                    </div>
                  </div>

                  {displayNodes.map((node, index) => {
                    const position = getNodePosition(node);
                    return (
                      <motion.div
                        key={node.id}
                        initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : undefined}
                        animate={shouldAnimate ? { opacity: 1, scale: 1 } : undefined}
                        transition={{ duration: 0.28, delay: shouldAnimate ? index * 0.04 : 0 }}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${position.x}%`, top: `${position.y}%` }}
                      >
                        <div className="relative flex flex-col items-center gap-2">
                          <div className={cn('flex items-center justify-center rounded-full border backdrop-blur-sm', NODE_SIZE_MAP[node.size], TONE_CLASS_MAP[node.tone])}>
                            <div className="h-2.5 w-2.5 rounded-full bg-current" />
                          </div>
                          <div className="rounded-full border border-white/10 bg-[rgba(2,6,23,0.72)] px-3 py-1 text-[11px] font-semibold text-white">
                            {node.label}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  <div className={cn('absolute inset-x-4 bottom-4 md:inset-x-6', isPhone && 'inset-x-3 bottom-3')}>
                    <div className="glass-panel rounded-[24px] px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {viewMode === 'observe' ? 'Narrative arc' : 'Active branch reading'}
                      </div>
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200">{stageNarrative}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className={railClassName}>
                {viewMode === 'observe' ? (
                  <div className="space-y-6">
                    <section className="glass-panel rounded-[28px] p-5">
                      <div className="section-kicker !text-slate-400">God mode question</div>
                      <h3 className="mt-3 text-xl font-display font-semibold text-white">{activeData.question}</h3>
                    </section>

                    <section className="space-y-3">
                      {(isPhone ? activeData.prompts.slice(0, 2) : activeData.prompts).map((prompt) => (
                        <button
                          key={prompt.id}
                          onClick={() => setSelectedPromptId(prompt.id)}
                          className={cn(
                            'w-full rounded-[22px] border px-4 py-4 text-left transition',
                            selectedPrompt?.id === prompt.id
                              ? 'border-rose-300/30 bg-rose-300/10'
                              : 'border-white/10 bg-white/5 hover:border-white/20'
                          )}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{prompt.label}</div>
                          <div className="mt-2 text-sm font-semibold text-white">{prompt.question}</div>
                        </button>
                      ))}
                    </section>

                    {selectedPrompt && (
                      <section className="glass-panel rounded-[28px] p-5">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200">
                          <Sparkles className="h-4 w-4" />
                          System reading
                        </div>
                        <p className="mt-3 text-sm leading-7 text-slate-200">{selectedPrompt.response}</p>
                      </section>
                    )}

                    <section className="grid gap-3 sm:grid-cols-2">
                      {activeData.stats.map((stat) => (
                        <div key={stat.label} className={cn('rounded-[22px] border p-4', STAT_ACCENT_MAP[stat.accent])}>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{stat.label}</div>
                          <div className="mt-2 text-lg font-semibold text-white">{stat.value}</div>
                        </div>
                      ))}
                    </section>

                    <section className="glass-panel rounded-[28px] p-5">
                      <div className="section-kicker !text-slate-400">Pivotal actors</div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {activeData.actors.map((actor) => (
                          <span key={actor} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white">
                            {actor}
                          </span>
                        ))}
                      </div>
                    </section>

                    <section className="glass-panel rounded-[28px] p-5">
                      <div className="section-kicker !text-slate-400">Scenario spread</div>
                      <div className="mt-4 space-y-3">
                        {activeData.scenarios.map((scenario) => (
                          <div key={scenario.label}>
                            <div className="flex items-center justify-between gap-4 text-sm font-medium text-slate-200">
                              <span>{scenario.label}</span>
                              <span>{Math.round(scenario.probability * 100)}%</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.round(scenario.probability * 100)}%` }}
                                transition={{ duration: 0.7, ease: 'easeOut' }}
                                className="h-full rounded-full bg-[linear-gradient(90deg,rgba(244,63,94,0.75),rgba(56,189,248,0.75))]"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {activeData.marketFrame?.outcome && (
                      <section className="glass-panel rounded-[28px] p-5">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          <ShieldAlert className="h-4 w-4 text-amber-200" />
                          Market consensus
                          <span className={cn('rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', getMarketTone(marketState))}>
                            {getMarketSignalLabel(activeData.marketFrame)}
                          </span>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Market consensus</div>
                            <div className="mt-2 text-lg font-semibold text-white">
                              {formatProbabilityLabel(activeData.marketFrame.impliedProbability ?? activeData.marketFrame.priorProbability)}
                            </div>
                          </div>
                          <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Crystal vs Market</div>
                            <div className="mt-2 text-lg font-semibold text-white">{formatSignedDelta(activeData.marketFrame.divergenceVsCrystal)}</div>
                          </div>
                          <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Calibration</div>
                            <div className="mt-2 text-lg font-semibold text-white">
                              {activeData.marketFrame.calibrationApplied ? 'Applied' : 'Reference only'}
                            </div>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <section className="glass-panel rounded-[28px] p-5">
                      <div className="section-kicker !text-rose-200">{WORLD_SIM_BRAND.matrixName}</div>
                      <h3 className="mt-3 text-xl font-display font-semibold text-white">Inject a move, then compare the world before and after.</h3>
                      <p className="mt-3 text-sm leading-7 text-slate-300">
                        Use structured interventions, not open-ended prompts. The simulation stays hypothetical: it is not certainty and it is not operational instruction.
                      </p>
                    </section>

                      <section className="glass-panel rounded-[28px] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="section-kicker !text-slate-400">Intervention cards</div>
                          <p className="mt-2 text-sm text-slate-300">{worldSimTier.matrixLabel} - {worldSimTier.agentCount} agents - {worldSimTier.matrixBranchLimit} branch max</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3">
                        {allowedInterventions.map((card) => (
                          <button
                            key={card.id}
                            onClick={() => setSelectedInterventionId(card.id)}
                            className={cn(
                              'rounded-[22px] border px-4 py-4 text-left transition',
                              selectedInterventionId === card.id ? 'border-rose-300/30 bg-rose-300/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{card.iconLabel}</div>
                                <div className="mt-2 text-sm font-semibold text-white">{card.label}</div>
                              </div>
                            </div>
                            <p className="mt-2 text-sm leading-7 text-slate-300">{card.description}</p>
                          </button>
                        ))}
                      </div>
                    </section>

                    {draftPayload && (
                      <section className="rounded-[28px] border border-white/10 bg-[rgba(15,23,42,0.55)] p-5">
                        <div className="section-kicker !text-slate-400">Selected move</div>
                        <div className="mt-4 space-y-4">
                          <label className="block text-sm text-slate-300">
                            Intensity
                            <input
                              type="range"
                              min="0.1"
                              max="1"
                              step="0.05"
                              value={draftPayload.intensity}
                              onChange={(event) =>
                                setDraftPayload((current) => (current ? { ...current, intensity: Number(event.target.value) } : current))
                              }
                              className="mt-3 w-full"
                            />
                            <span className="mt-2 block text-xs text-slate-400">{Math.round(draftPayload.intensity * 100)}%</span>
                          </label>
                          {[
                            ['Geography', 'geography'],
                            ['Duration', 'duration'],
                            ['Target audience', 'targetAudience'],
                            ['Timing', 'timing'],
                          ].map(([label, key]) => (
                            <label key={key} className="block text-sm text-slate-300">
                              {label}
                              <input
                                type="text"
                                value={(draftPayload as any)[key]}
                                onChange={(event) =>
                                  setDraftPayload((current) => (current ? { ...current, [key]: event.target.value } : current))
                                }
                                className="mt-2 w-full rounded-[16px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                              />
                            </label>
                          ))}
                        </div>
                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            onClick={() => void handleRunBranch()}
                            disabled={isRunningBranch}
                            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-60"
                          >
                            {isRunningBranch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            Run simulation
                          </button>
                          {selectedBranch && (
                            <button
                              onClick={handleDuplicateBranch}
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20"
                            >
                              <Copy className="h-4 w-4" />
                              Duplicate branch
                            </button>
                          )}
                          {selectedBranch?.status === 'running' && (
                            <button
                              onClick={() => void handleCancelBranch()}
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20"
                            >
                              Cancel branch
                            </button>
                          )}
                        </div>
                        {branchError && <p className="mt-4 text-sm font-medium text-rose-200">{branchError}</p>}
                      </section>
                    )}

                    <section className="glass-panel rounded-[28px] p-5">
                      <div className="section-kicker !text-slate-400">Branches</div>
                      <div className="mt-4 space-y-3">
                        {branches.length === 0 ? (
                          <p className="text-sm leading-7 text-slate-300">No branches saved yet. Start with one intervention, then compare the baseline world with the alternate branch.</p>
                        ) : (
                          branches.map((branch) => (
                            <button
                              key={branch.id}
                              onClick={() => setActiveBranchId(branch.id)}
                              className={cn(
                                'w-full rounded-[22px] border px-4 py-4 text-left transition',
                                activeBranchId === branch.id ? 'border-sky-300/30 bg-sky-300/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                              )}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-white">{branch.label}</div>
                                  <div className="mt-1 text-xs text-slate-400">{branch.payload.geography} - {branch.payload.duration} - {Math.round(branch.payload.intensity * 100)}%</div>
                                </div>
                                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">{branch.status}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </section>

                    {selectedBranch?.result && (
                      <section className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-3">
                          <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
                            <div className="section-kicker !text-slate-400">Baseline world</div>
                            <div className="mt-3 text-sm leading-7 text-slate-200">{activeData.baseline?.narrativeArc || activeData.narrativeArc}</div>
                          </div>
                          <div className="rounded-[26px] border border-rose-300/20 bg-rose-300/10 p-5">
                            <div className="section-kicker !text-rose-200">Intervention world</div>
                            <div className="mt-3 text-sm leading-7 text-rose-50">{selectedBranch.result.interventionDigest?.narrative_arc}</div>
                          </div>
                          <div className="rounded-[26px] border border-sky-300/20 bg-sky-300/10 p-5">
                            <div className="section-kicker !text-sky-200">Delta</div>
                            <div className="mt-3 text-sm leading-7 text-sky-50">{selectedBranch.result.deltaDigest.summary}</div>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          {selectedBranch.result.deltaDigest.metrics.map((metric) => (
                            <div key={metric.label} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{metric.label}</div>
                              <div className="mt-2 text-lg font-semibold text-white">
                                {metric.unit === 'probability' ? formatSignedDelta(metric.delta) : `${Math.round((metric.delta || 0) * 100)} pts`}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
                          <div className="section-kicker !text-slate-400">Dominant reactions</div>
                          <div className="mt-4 space-y-3">
                            {selectedBranch.result.deltaDigest.dominantReactions.map((reaction) => (
                              <div key={reaction} className="flex items-start gap-3 text-sm leading-7 text-slate-200">
                                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-sky-200" />
                                <span>{reaction}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-5 grid gap-4 xl:grid-cols-2">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Second-order effects</div>
                              <div className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
                                {selectedBranch.result.secondOrderEffects.map((effect) => (
                                  <p key={effect}>{effect}</p>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Risk and effectiveness</div>
                              <p className="mt-3 text-sm leading-7 text-slate-300">{selectedBranch.result.riskOfBackfire}</p>
                              <p className="mt-3 text-sm leading-7 text-slate-300">{selectedBranch.result.interventionEffectiveness}</p>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
