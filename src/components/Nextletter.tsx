import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  Check,
  Globe2,
  Lightbulb,
  Loader2,
  Lock,
  Mail,
  Shield,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { generateCrystalQuotes, generateNextletter, getWorldSimJobResult } from '../services/geminiService';
import { CrystalQuote, PredictionMarketFrame } from '../types/crystal';
import { useCrystalPlan } from '../context/CrystalPlanContext';
import { useAppRuntime } from '../context/AppRuntimeContext';
import { ACTION_CATALOG, formatCredits, getPlanLabel } from '../lib/crystalPlans';
import { formatProbabilityLabel, formatSignedDelta, getMarketSignalLabel, getMarketSignalState, hasPredictionMarketFrame } from '../lib/predictionMarket';
import { createWorldSimSceneData } from '../lib/worldSimScene';
import { scheduleIdleTask } from '../lib/scheduleIdle';
import { RUNTIME_COPY, SECTION_COPY, WORLD_SIM_BRAND } from '../content/brand';
import { cn } from './CrystalCard';
import { WorldSimInlineCard } from './WorldSimInlineCard';
import type { WorldSimJobRef, WorldSimJobResult } from '../types/worldSimJob';
import { isTerminalWorldSimJobStatus as isWorldSimJobTerminal } from '../types/worldSimJob';

interface NextletterProps {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
  onGenerateCard?: (query: string) => void;
  onOpenWorldSimScene: (data: any, job?: WorldSimJobRef | null) => void;
}

type GeneratedSection = {
  topic?: string;
  icon?: string;
  title?: string;
  content?: string;
  historical_context?: string;
  probability?: number;
  horizon?: string;
  impact?: string;
  so_what?: string;
  query_suggestion?: string;
  prediction_market_frame?: PredictionMarketFrame | null;
  world_sim?: {
    simulation_mode?: string;
    narrative_arc?: string;
    pivotal_actors?: string[];
    intervention_points?: string[];
    prediction_market_frame?: PredictionMarketFrame | null;
  };
  world_sim_job?: WorldSimJobRef | null;
};

type GeneratedLetter = {
  title?: string;
  subtitle?: string;
  sections?: GeneratedSection[];
};

const PREDEFINED_TOPICS = [
  { id: 'sport', label: 'Sports and collective attention' },
  { id: 'energy', label: 'Energy and cost of living' },
  { id: 'ai', label: 'AI, work, and productivity' },
  { id: 'markets', label: 'Markets and macro signals' },
  { id: 'cities', label: 'Cities, mobility, and tourism' },
  { id: 'culture', label: 'Culture and media behavior' },
];

const GLOBAL_SECTIONS: GeneratedSection[] = [
  {
    topic: 'Energy',
    title: 'European energy stress',
    content:
      'Pressure on energy and logistics is still the clearest thread of the quarter. It is not a uniform alarm yet, but the gap between risk and reaction time is narrowing.',
    probability: 72,
    horizon: '90d',
    impact: 'High',
    so_what: 'If your business is exposed to fixed costs, make pricing and cash-planning decisions earlier rather than later.',
    historical_context:
      'When geopolitical friction meets weaker inventories, repricing usually reaches retail before it reaches the broader public conversation.',
  },
  {
    topic: 'AI adoption',
    title: 'Service automation and knowledge work',
    content:
      'The real acceleration is not in single tools. It is in systems that orchestrate agents, data, and workflows. That is where the gap opens between teams that optimize early and teams that keep catching up.',
    probability: 64,
    horizon: '6m',
    impact: 'Medium',
    so_what: 'Bias toward coordination, quality control, and workflow integration, not only manual production.',
    historical_context:
      'Technologies that compress operating margins usually spread through repetitive functions first, then change the role of the most exposed teams.',
  },
];

function getImpactTone(impact?: string) {
  if ((impact || '').toLowerCase() === 'high') return 'bg-rose-50 text-rose-700 border-rose-100';
  if ((impact || '').toLowerCase() === 'medium') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-emerald-50 text-emerald-700 border-emerald-100';
}

function getMarketTone(state: ReturnType<typeof getMarketSignalState>) {
  if (state === 'calibrated') return 'border-sky-100 bg-sky-50 text-sky-700';
  if (state === 'diverge') return 'border-rose-100 bg-rose-50 text-rose-700';
  if (state === 'watch') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
}

function getSectionIcon(topic?: string) {
  const normalized = (topic || '').toLowerCase();
  if (normalized.includes('energy')) return <Zap className="h-5 w-5" />;
  if (normalized.includes('market')) return <Shield className="h-5 w-5" />;
  return <Lightbulb className="h-5 w-5" />;
}

export function Nextletter({ user, isGuest, onLogin, onGenerateCard, onOpenWorldSimScene }: NextletterProps) {
  const { entitlements, runMeteredAction } = useCrystalPlan();
  const capabilities = useAppRuntime();
  const [activeEdition, setActiveEdition] = useState<'global' | 'personal'>('global');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLetter, setGeneratedLetter] = useState<GeneratedLetter | null>(null);
  const [userContext, setUserContext] = useState<any>(null);
  const [crystalQuotes, setCrystalQuotes] = useState<CrystalQuote[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<CrystalQuote | null>(null);
  const [savedQuotes, setSavedQuotes] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const nextletterWorldSimPreview = useMemo(
    () =>
      createWorldSimSceneData({
        title: 'WorldSim inside Nextletter',
        subtitle: 'Use the same simulation chamber to read actors, pressure, and turning points inside the briefing too.',
        question: 'Which dynamic deserves a deeper read this week?',
        mode: capabilities.worldSimAvailable ? 'live' : 'preview',
        sourceLabel: 'Nextletter layer',
      }),
    [capabilities.worldSimAvailable]
  );

  useEffect(() => {
    return scheduleIdleTask(() => {
      const fetchQuotes = async () => {
        setIsLoadingQuotes(true);
        try {
          const result = await generateCrystalQuotes();
          setCrystalQuotes((result.quotes || []).slice(0, 4));
        } catch (error) {
          console.error('Error fetching quotes:', error);
        } finally {
          setIsLoadingQuotes(false);
        }
      };

      void fetchQuotes();
    }, 1200);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;

    const fetchContext = async () => {
      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        if (snapshot.exists()) {
          setUserContext(snapshot.data());
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    };

    void fetchContext();
  }, [user?.uid]);

  const allPersonalTopics = useMemo(() => {
    const topics = [...selectedTopics];
    if (customTopic.trim()) topics.push(customTopic.trim());
    return topics;
  }, [customTopic, selectedTopics]);

  const pendingWorldSimJobIds = useMemo(() => {
    if (!generatedLetter?.sections?.length) return [];
    return Array.from(
      new Set(
        generatedLetter.sections
          .map((section) => section.world_sim_job)
          .filter((job): job is WorldSimJobRef => Boolean(job?.jobId))
          .filter((job) => !isWorldSimJobTerminal(job.status))
          .map((job) => job.jobId)
      )
    );
  }, [generatedLetter]);

  useEffect(() => {
    if (pendingWorldSimJobIds.length === 0) return;

    let active = true;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const results = await Promise.all(
          pendingWorldSimJobIds.map((jobId) => getWorldSimJobResult(jobId) as Promise<WorldSimJobResult<any, any, GeneratedSection>>)
        );
        if (!active) return;

        setGeneratedLetter((current) => {
          if (!current?.sections?.length) return current;
          const resultMap = new Map(results.map((result) => [result.job.jobId, result]));

          return {
            ...current,
            sections: current.sections.map((section) => {
              const jobId = section.world_sim_job?.jobId;
              if (!jobId) return section;
              const result = resultMap.get(jobId);
              if (!result) return section;

              if (result.section) {
                return {
                  ...result.section,
                  world_sim_job: result.job,
                };
              }

              return {
                ...section,
                world_sim_job: result.job,
                world_sim: result.digest
                  ? {
                      ...(section.world_sim || {}),
                      ...result.digest,
                    }
                  : section.world_sim,
              };
            }),
          };
        });

        if (results.some((result) => !isWorldSimJobTerminal(result.job.status))) {
          timer = window.setTimeout(poll, 5000);
        }
      } catch (jobError) {
        console.error('Nextletter WorldSim polling error:', jobError);
        if (active) {
          timer = window.setTimeout(poll, 7000);
        }
      }
    };

    void poll();

    return () => {
      active = false;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [pendingWorldSimJobIds]);

  const handleSaveQuote = async (quote: CrystalQuote) => {
    if (!user?.uid) {
      onLogin?.();
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid, 'saved_quotes', quote.quote_id), {
        ...quote,
        savedAt: serverTimestamp(),
      });
      setSavedQuotes((current) => (current.includes(quote.quote_id) ? current : [...current, quote.quote_id]));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/saved_quotes/${quote.quote_id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTopic = (topic: string) => {
    if (generationError) setGenerationError(null);
    setSelectedTopics((current) => (current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]));
  };

  const handleGenerate = async () => {
    if (allPersonalTopics.length === 0) return;
    if (!capabilities.forecastAvailable) {
      setGenerationError(RUNTIME_COPY.forecastPreview);
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    try {
      const letter = await runMeteredAction(
        ACTION_CATALOG.nextletter_personal,
        () => generateNextletter(allPersonalTopics, userContext),
        {
          sourceView: 'nextletter',
          insufficientCreditsMessage:
            'Your Personal Edition needs 3 credits. Move to Plus or Pro if you want it as a steady habit.',
        }
      );
      setGeneratedLetter(letter);
    } catch (error) {
      console.error('Error generating nextletter:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderSection = (section: GeneratedSection, index: number) => {
    const sectionMarketFrame = section.prediction_market_frame || section.world_sim?.prediction_market_frame || null;
    const hasMarketFrame = hasPredictionMarketFrame(sectionMarketFrame);
    const marketState = getMarketSignalState(sectionMarketFrame);
    const sectionWorldSimScene = createWorldSimSceneData({
      title: section.title || section.topic || `Section ${index + 1}`,
      subtitle: section.content,
      question: section.query_suggestion || `What could materially change the picture for ${section.title || section.topic || 'this section'}?`,
      mode:
        capabilities.worldSimAvailable &&
        (section.world_sim_job?.status === 'completed' || Boolean(section.world_sim?.narrative_arc))
          ? 'live'
          : 'preview',
      sourceLabel:
        section.world_sim_job && section.world_sim_job.status !== 'completed'
          ? 'MiroFish async job'
          : section.world_sim
            ? 'Nextletter section'
            : 'Preview dataset',
      narrativeArc: section.world_sim?.narrative_arc,
      actors: section.world_sim?.pivotal_actors,
      interventionPoints: section.world_sim?.intervention_points,
      marketFrame: sectionMarketFrame || null,
      job: section.world_sim_job || null,
    });

    return (
      <article key={`${section.title || 'section'}-${index}`} className="signal-board content-auto rounded-[32px] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#e8eefc] text-[#1453e8]">
              {getSectionIcon(section.topic)}
            </div>
            <div>
              <div className="section-kicker">{section.topic || `Section ${index + 1}`}</div>
              <h3 className="mt-2 text-2xl font-display font-semibold text-slate-950">{section.title || 'Nextletter'}</h3>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {typeof section.probability === 'number' && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {section.probability}% probability
              </span>
            )}
            {section.horizon && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {section.horizon}
              </span>
            )}
            {section.impact && (
              <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', getImpactTone(section.impact))}>
                {section.impact} impact
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div>
              <div className="section-kicker !text-slate-500">Summary</div>
              <p className="mt-3 text-sm leading-8 text-slate-600">{section.content}</p>
            </div>
            {section.historical_context && (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="section-kicker !text-slate-500">Why It Matters</div>
                <p className="mt-3 text-sm leading-7 text-slate-600">{section.historical_context}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {section.so_what && (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="section-kicker !text-slate-500">What To Do</div>
                <p className="mt-3 text-sm leading-7 text-slate-600">{section.so_what}</p>
              </div>
            )}

            {hasMarketFrame && (
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="section-kicker !text-slate-500">What the market is pricing</div>
                  <span className={cn('rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', getMarketTone(marketState))}>
                    {getMarketSignalLabel(sectionMarketFrame)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    Market {formatProbabilityLabel(sectionMarketFrame?.implied_probability ?? sectionMarketFrame?.prior_probability)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    Delta {formatSignedDelta(sectionMarketFrame?.divergence_vs_crystal)}
                  </span>
                </div>
                {(sectionMarketFrame?.market_question || sectionMarketFrame?.reference_market) && (
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {sectionMarketFrame?.market_question || sectionMarketFrame?.reference_market}
                  </p>
                )}
                {sectionMarketFrame?.calibration_note && (
                  <p className="mt-3 text-sm leading-7 text-slate-500">{sectionMarketFrame.calibration_note}</p>
                )}
              </div>
            )}

            {section.world_sim && (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-4">
                <div className="section-kicker !text-rose-600">
                  {section.world_sim_job && section.world_sim_job.status !== 'completed'
                    ? `${WORLD_SIM_BRAND.name} in progress`
                    : capabilities.worldSimAvailable
                      ? WORLD_SIM_BRAND.name
                      : WORLD_SIM_BRAND.previewName}
                </div>
                {section.world_sim_job && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                      {section.world_sim_job.status}
                    </span>
                    <span className="text-xs font-medium text-rose-700">
                      {Math.round((section.world_sim_job.progress || 0) * 100)}% - {section.world_sim_job.agentCount} agents
                    </span>
                  </div>
                )}
                {section.world_sim.narrative_arc && <p className="mt-3 text-sm leading-7 text-rose-800">{section.world_sim.narrative_arc}</p>}
                {(section.world_sim.pivotal_actors || []).length > 0 && (
                  <div className="mt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600">Pivotal actors</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(section.world_sim.pivotal_actors || []).map((actor) => (
                        <span key={actor} className="rounded-full border border-rose-100 bg-white px-3 py-1 text-xs font-semibold text-rose-700">
                          {actor}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(section.world_sim.intervention_points || []).length > 0 && (
                  <div className="mt-4 space-y-2">
                    {(section.world_sim.intervention_points || []).map((point) => (
                      <div key={point} className="flex items-start gap-3 text-sm leading-7 text-rose-800">
                        <div className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => onOpenWorldSimScene(sectionWorldSimScene, section.world_sim_job || null)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100/70"
                >
                  Open the simulation layer
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {section.query_suggestion && (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <button
              onClick={() => onGenerateCard?.(section.query_suggestion || '')}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Open linked forecast
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-6">
      <section className="editorial-panel content-auto rounded-[36px] p-6 md:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <div className="section-kicker">{SECTION_COPY.nextletter.heroKicker}</div>
            <h2 className="mt-3 text-4xl font-display font-semibold tracking-tight text-slate-950 md:text-5xl">
              {SECTION_COPY.nextletter.heroTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{SECTION_COPY.nextletter.heroBody}</p>
          </div>

          <div className="signal-board rounded-[30px] p-5">
            <div className="section-kicker">Edition Access</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                {isGuest ? 'Guest' : getPlanLabel(entitlements.plan)}
              </span>
              <span className="text-sm font-semibold text-slate-700">
                {isGuest ? 'Global Edition is open right away' : `${entitlements.creditsBalance} credits available`}
              </span>
            </div>
            <div className="mt-4 text-sm leading-7 text-slate-500">
              Personal Edition uses {formatCredits(ACTION_CATALOG.nextletter_personal.cost)} for each successful generation.
            </div>
            <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              {capabilities.message}
            </div>
          </div>
        </div>
      </section>

      <section className="editorial-panel content-auto rounded-[34px] p-5">
        <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
          <button
              onClick={() => setActiveEdition('global')}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                activeEdition === 'global' ? 'bg-slate-950 text-white' : 'text-slate-600'
              )}
          >
            <span className="inline-flex items-center gap-2">
              <Globe2 className="h-4 w-4" />
              Global Edition
            </span>
          </button>
          <button
              onClick={() => setActiveEdition('personal')}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition',
                activeEdition === 'personal' ? 'bg-slate-950 text-white' : 'text-slate-600'
              )}
          >
            <span className="inline-flex items-center gap-2">
              <User className="h-4 w-4" />
              Personal Edition
            </span>
          </button>
        </div>
      </section>

      <AnimatePresence mode="wait">
        {activeEdition === 'global' ? (
          <motion.div key="global" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} className="space-y-6">
            <section className="editorial-panel content-auto rounded-[36px] p-6 md:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="section-kicker">Global Edition</div>
                  <h3 className="mt-3 text-3xl font-display font-semibold text-slate-950">The macro signals worth reading today.</h3>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">
                  Updated today
                </div>
              </div>

              <div className="mt-6 space-y-5">{GLOBAL_SECTIONS.map(renderSection)}</div>
            </section>

            <section className="editorial-panel content-auto rounded-[36px] p-6 md:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="section-kicker">Crystal Quotes</div>
                  <h3 className="mt-3 text-3xl font-display font-semibold text-slate-950">Fast reads for the week.</h3>
                </div>
                {isLoadingQuotes && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {crystalQuotes.map((quote) => (
                  <button
                    key={quote.quote_id}
                    onClick={() => setSelectedQuote(quote)}
                    className="rounded-[24px] border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <Mail className="h-4 w-4 text-[#1453e8]" />
                      {quote.context}
                    </div>
                    <p className="mt-4 text-lg font-display font-semibold leading-tight text-slate-950">&quot;{quote.text}&quot;</p>
                    <div className="mt-4 text-xs font-medium text-slate-500">{quote.author}</div>
                  </button>
                ))}
              </div>
            </section>
          </motion.div>
        ) : (
          <motion.div key="personal" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} className="space-y-6">
            {isGuest ? (
              <section className="editorial-panel content-auto rounded-[36px] p-10 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-slate-950 text-white">
                  <Lock className="h-9 w-9" />
                </div>
                <h3 className="mt-6 text-3xl font-display font-semibold text-slate-950">Your Personal Edition of Nextletter.</h3>
                <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-slate-600">
                  Sign in to generate personal editions shaped by your profile, interests, and live signals. The premium layer steps in only when it adds real value.
                </p>
                <button
                  onClick={onLogin}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Sign in to unlock
                </button>
              </section>
            ) : generatedLetter ? (
              <section className="space-y-6">
                <div className="editorial-panel content-auto rounded-[36px] p-6 md:p-7">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="section-kicker">Personal Briefing</div>
                      <h3 className="mt-3 text-4xl font-display font-semibold text-slate-950 md:text-5xl">
                        {generatedLetter.title || 'Your briefing edition'}
                      </h3>
                      <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
                        {generatedLetter.subtitle || 'A personal read of signals, probabilities, and next moves.'}
                      </p>
                    </div>
                    <button
                      onClick={() => setGeneratedLetter(null)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                    >
                      Generate another briefing
                    </button>
                  </div>
                </div>

                <div className="space-y-5">{(generatedLetter.sections || []).map(renderSection)}</div>
              </section>
            ) : (
              <section className="grid gap-5 xl:grid-cols-[0.98fr_1.02fr]">
                <div className="editorial-panel rounded-[34px] p-6">
                  <div className="section-kicker">Compose Your Briefing</div>
                  <h3 className="mt-3 text-3xl font-display font-semibold text-slate-950">Choose the themes you want to read more clearly.</h3>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {PREDEFINED_TOPICS.map((topic) => {
                      const active = selectedTopics.includes(topic.label);
                      return (
                        <button
                          key={topic.id}
                          onClick={() => toggleTopic(topic.label)}
                          className={cn(
                            'rounded-full border px-4 py-2 text-sm font-semibold transition',
                            active
                              ? 'border-[#1453e8] bg-[#e8eefc] text-[#1453e8]'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                          )}
                        >
                          {topic.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="section-kicker !text-slate-500">Custom topic</div>
                    <input
                      type="text"
                      value={customTopic}
                      onChange={(event) => {
                        if (generationError) setGenerationError(null);
                        setCustomTopic(event.target.value);
                      }}
                      placeholder="Add a specific topic..."
                      className="mt-3 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#1453e8] focus:bg-white"
                    />
                  </div>

                  <button
                    onClick={() => void handleGenerate()}
                    disabled={isGenerating || allPersonalTopics.length === 0}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#1453e8] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1248c8] disabled:opacity-60"
                  >
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generate {formatCredits(ACTION_CATALOG.nextletter_personal.cost)}
                  </button>
                  {generationError && <p className="mt-4 text-sm font-medium text-rose-600">{generationError}</p>}
                </div>

                <div className="editorial-panel rounded-[34px] p-6">
                  <div className="section-kicker">What You Will Get</div>
                  <div className="mt-5 space-y-4">
                    {[
                      'Topic, summary, probability, horizon, and impact in every section.',
                      'Why it matters and what to do in plain language.',
                      capabilities.worldSimAvailable
                        ? `${WORLD_SIM_BRAND.name} appears when there is already a deeper layer worth reusing.`
                        : RUNTIME_COPY.worldSimPreview,
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
                        <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1453e8]" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <div className="section-kicker !text-slate-500">Current plan</div>
                    <div className="mt-3 text-lg font-semibold text-slate-950">
                      {getPlanLabel(entitlements.plan)} - {entitlements.creditsBalance} credits available
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-500">
                      Free lets you feel the product. Plus and Pro make it steadier, deeper, and more personal.
                    </p>
                  </div>

                  <div className="mt-5">
                    <WorldSimInlineCard
                      compact
                      data={nextletterWorldSimPreview}
                      onOpen={() => onOpenWorldSimScene(nextletterWorldSimPreview, null)}
                      ctaLabel="Open the Nextletter layer"
                    />
                  </div>
                </div>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedQuote && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8">
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedQuote(null)}
              className="absolute inset-0 bg-[rgba(15,23,42,0.48)] backdrop-blur-lg"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              className="relative w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/60 bg-[rgba(251,249,244,0.98)] shadow-[0_32px_90px_rgba(15,23,42,0.22)]"
            >
              <div className="border-b border-slate-200/80 px-6 py-5 md:px-8">
                <div className="section-kicker">Quote breakdown</div>
                <h3 className="mt-3 text-3xl font-display font-semibold text-slate-950">&quot;{selectedQuote.text}&quot;</h3>
                <div className="mt-3 flex items-center gap-3 text-sm font-medium text-slate-500">
                  <Sparkles className="h-4 w-4 text-[#1453e8]" />
                  {selectedQuote.author}
                </div>
              </div>

              <div className="grid gap-6 px-6 py-6 md:grid-cols-2 md:px-8 md:py-8">
                <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                  <div className="section-kicker !text-slate-500">Full read</div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{selectedQuote.analysis.full_text}</p>
                </div>
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="section-kicker !text-slate-500">Drivers</div>
                    <div className="mt-3 space-y-2">
                      {selectedQuote.analysis.drivers.map((driver) => (
                        <div key={driver} className="flex items-start gap-3 text-sm leading-7 text-slate-600">
                          <div className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1453e8]" />
                          <span>{driver}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="section-kicker !text-slate-500">Impact and history</div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{selectedQuote.analysis.impact}</p>
                    <p className="mt-3 text-sm leading-7 text-slate-500">{selectedQuote.analysis.historical_parallel}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200/80 bg-white/70 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
                <div className="text-sm font-medium text-slate-500">A quick grounded read on the week’s signals.</div>
                <button
                  onClick={() => void handleSaveQuote(selectedQuote)}
                  disabled={isSaving || savedQuotes.includes(selectedQuote.quote_id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition',
                    savedQuotes.includes(selectedQuote.quote_id) ? 'bg-emerald-500 text-white' : 'bg-slate-950 text-white hover:bg-slate-800'
                  )}
                >
                  {savedQuotes.includes(selectedQuote.quote_id) ? (
                    <>
                      <Check className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-4 w-4" />
                      {isGuest ? 'Sign in to save' : 'Save analysis'}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
