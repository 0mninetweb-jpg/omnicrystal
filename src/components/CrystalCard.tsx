import React, { useEffect, useState } from 'react';
import { CardData } from '../types/crystal';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  Info,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Share2,
  Bookmark,
  Activity,
  Sparkles,
  Check,
  Database,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';
import { WORLD_SIM_BRAND } from '../content/brand';
import { DeferredTrendChart } from './DeferredTrendChart';
import {
  formatCompactNumber,
  formatProbabilityLabel,
  formatSignedDelta,
  getMarketSignalLabel,
  getMarketSignalState,
  hasPredictionMarketFrame,
} from '../lib/predictionMarket';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function CrystalCard({
  card,
  onSave,
  isSaved: initialIsSaved = false,
}: {
  card: CardData;
  onSave?: (card: CardData) => void;
  isSaved?: boolean;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [isSaved, setIsSaved] = useState(initialIsSaved);
  const [isShared, setIsShared] = useState(false);
  const marketFrame = card.prediction_market_frame || card.world_sim?.prediction_market_frame || null;
  const hasMarketSignal = hasPredictionMarketFrame(marketFrame);
  const marketSignalState = getMarketSignalState(marketFrame);
  const topScenarioProbability = Array.isArray(card.scenario_set) && card.scenario_set.length > 0
    ? Math.max(...card.scenario_set.map((scenario) => Number(scenario?.probability) || 0))
    : null;
  const crystalProbability = marketFrame?.crystal_probability ?? topScenarioProbability;
  const marketProbability = marketFrame?.implied_probability ?? marketFrame?.prior_probability ?? null;

  useEffect(() => {
    setIsSaved(initialIsSaved);
  }, [initialIsSaved]);

  const handleSave = () => {
    const nextSavedState = !isSaved;
    setIsSaved(nextSavedState);
    if (onSave) {
      onSave(card);
    }
  };

  const getSufficiencyIcon = (flag: string) => {
    if (flag === 'sufficient') return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
    if (flag === 'partial') return <AlertTriangle className="w-4 h-4 text-amber-600" />;
    return <AlertTriangle className="w-4 h-4 text-rose-600" />;
  };

  const getWorldSimModeLabel = (mode?: string) => {
    if (mode === 'cache_hit') return 'Cache hit';
    if (mode === 'delta_simulation') return 'Delta sim';
    if (mode === 'full_rebuild') return 'Full rebuild';
    return 'Narrative only';
  };

  const getMarketSignalTone = (state: ReturnType<typeof getMarketSignalState>) => {
    if (state === 'calibrated') return 'text-sky-300 bg-sky-500/10 border-sky-500/20';
    if (state === 'diverge') return 'text-rose-300 bg-rose-500/10 border-rose-500/20';
    if (state === 'watch') return 'text-amber-300 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20';
  };

  const handleShare = async () => {
    const trustStamp = `Trust ${Math.round(card.trust_layer.confidence_score * 100)}% - ${card.trust_layer.data_sufficiency_flag} - ${new Date(card.trust_layer.freshness.as_of_utc).toLocaleDateString('en-US')}`;
    const sharePayload = {
      title: card.title,
      text: `${card.verdict || card.summary}\n${trustStamp}`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(sharePayload);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
          `${sharePayload.title}\n${sharePayload.text}\n${sharePayload.url}`
        );
      }

      setIsShared(true);
      window.setTimeout(() => setIsShared(false), 2000);
    } catch {
      setIsShared(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-gradient flex h-full flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#0a0a0a] shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all hover:border-white/20 group"
    >
      <div className="p-8 pb-6">
        <div className="mb-6 flex items-start justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400">
                {card.domain?.split('.').pop()?.replace(/_/g, ' ') || 'Forecast'}
              </span>
              {card.world_sim?.enabled && (
                <span className="flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300">
                  <Sparkles className="w-3 h-3" />
                  {WORLD_SIM_BRAND.name}
                </span>
              )}
              {hasMarketSignal && (
                <span
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                    getMarketSignalTone(marketSignalState)
                  )}
                >
                  <Database className="w-3 h-3" />
                  {getMarketSignalLabel(marketFrame)}
                </span>
              )}
              {card.stakes_level && (
                <span
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                    card.stakes_level === 'imminent' || card.stakes_level === 'high'
                      ? 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                      : card.stakes_level === 'medium'
                        ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                        : 'border-white/10 bg-white/5 text-slate-400'
                  )}
                >
                  <Activity className="w-3 h-3" />
                  {card.stakes_level === 'imminent'
                    ? 'Imminent'
                    : card.stakes_level === 'high'
                      ? 'High impact'
                      : card.stakes_level === 'medium'
                        ? 'Medium impact'
                        : 'Lower impact'}
                </span>
              )}
            </div>
            <h3 className="break-words text-2xl font-display font-bold leading-tight text-white md:text-3xl">
              {card.title}
            </h3>
          </div>

          <div className="flex gap-2.5">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleSave}
              className={cn(
                'rounded-2xl border p-3 transition-all',
                isSaved
                  ? 'border-sky-500 bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'
              )}
            >
              {isSaved ? <Check className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleShare}
              className={cn(
                'rounded-2xl border p-3 transition-all',
                isShared
                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'
              )}
            >
              <Share2 className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {card.verdict && (
          <div className="group/verdict relative mb-8 overflow-hidden rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-inner">
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover/verdict:opacity-100" />
            <div className="absolute top-0 right-0 p-6 opacity-5 transition-all duration-500 group-hover/verdict:scale-110 group-hover/verdict:opacity-20">
              <Sparkles className="w-20 h-20 text-sky-400" />
            </div>
            <div className="relative z-10 mb-4 flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-sky-400">Crystal read</h4>
              {card.risk_band && (
                <div className="flex items-center gap-2.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Risk</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((level) => {
                      const levels = { low: 1, medium: 2, high: 3, extreme: 4 };
                      const current = levels[card.risk_band!] || 1;
                      return (
                        <div
                          key={level}
                          className={cn(
                            'h-1.5 w-5 rounded-full transition-all duration-500',
                            level <= current
                              ? current >= 3
                                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                                : current === 2
                                  ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                                  : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                              : 'bg-white/10'
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <p className="relative z-10 break-words text-2xl font-display font-bold leading-tight text-white md:text-3xl">
              {card.verdict}
            </p>
          </div>
        )}

        <p className="break-words text-[16px] font-medium leading-relaxed text-slate-300 md:text-[17px]">
          {card.summary}
        </p>

        {card.trust_layer.data_sufficiency_flag !== 'sufficient' && (
          <div className="mt-4 flex w-fit items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[11px] font-bold text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span>Built from partial data only. Crystal kept the read conservative instead of filling the gaps.</span>
          </div>
        )}

        {hasMarketSignal && (
          <div className="mt-6 rounded-[30px] border border-white/10 bg-[#050505] p-5 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                <Database className="h-4 w-4 text-sky-400" />
                Market signal
              </div>
              <span
                className={cn(
                  'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                  getMarketSignalTone(marketSignalState)
                )}
              >
                {getMarketSignalLabel(marketFrame)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Crystal</div>
                <div className="mt-2 text-lg font-semibold text-white">{formatProbabilityLabel(crystalProbability)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Market</div>
                <div className="mt-2 text-lg font-semibold text-white">{formatProbabilityLabel(marketProbability)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Delta</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatSignedDelta(marketFrame?.divergence_vs_crystal)}
                </div>
              </div>
            </div>

            {(marketFrame?.market_question || marketFrame?.reference_market) && (
              <div className="mt-4 text-sm leading-7 text-slate-300">
                <span className="font-semibold text-white">Reference market:</span>{' '}
                {marketFrame?.market_question || marketFrame?.reference_market}
              </div>
            )}

            {(marketFrame?.volume_24h != null ||
              marketFrame?.open_interest != null ||
              marketFrame?.liquidity != null) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {marketFrame?.volume_24h != null && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300">
                    24h volume {formatCompactNumber(marketFrame.volume_24h)}
                  </span>
                )}
                {marketFrame?.open_interest != null && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300">
                    OI {formatCompactNumber(marketFrame.open_interest)}
                  </span>
                )}
                {marketFrame?.liquidity != null && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300">
                    Liquidity {formatCompactNumber(marketFrame.liquidity)}
                  </span>
                )}
              </div>
            )}

            {marketFrame?.calibration_note && (
              <p className="mt-4 text-sm leading-7 text-slate-400">{marketFrame.calibration_note}</p>
            )}
          </div>
        )}
      </div>

      {card.scenario_set && card.scenario_set.length > 0 && (
        <div className="border-t border-white/5 px-8 py-8">
          <h4 className="mb-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
            <Activity className="w-4 h-4" /> Likely scenarios
          </h4>
          <div className="space-y-6">
            {card.scenario_set.map((scenario, idx) => (
              <div key={scenario.scenario_id} className="group/scenario flex items-center justify-between">
                <span className="text-[15px] font-semibold text-slate-300 transition-colors group-hover/scenario:text-white">
                  {scenario.label}
                </span>
                <div className="flex items-center gap-5">
                  <div className="relative h-2 w-32 overflow-hidden rounded-full bg-white/5 md:w-48">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${scenario.probability * 100}%` }}
                      transition={{ duration: 1.2, delay: 0.2 + idx * 0.1, ease: 'circOut' }}
                      className={cn(
                        'h-full rounded-full',
                        idx === 0 ? 'bg-sky-500' : idx === 1 ? 'bg-emerald-400' : 'bg-amber-400'
                      )}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-bold text-white">
                    {Math.round(scenario.probability * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.ranked_list && card.ranked_list.length > 0 && (
        <div className="border-t border-white/5 px-8 py-8">
          <h4 className="mb-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
            <TrendingUp className="w-4 h-4" /> Crystal ranking
          </h4>
          <div className="space-y-4">
            {card.ranked_list.map((item) => (
              <div
                key={item.item_id}
                className="flex items-center gap-5 rounded-3xl border border-white/10 bg-white/5 p-5 transition-all hover:border-white/20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500 text-lg font-bold text-white shadow-lg shadow-sky-500/20">
                  {item.rank}
                </div>
                <div className="flex-1">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[15px] font-bold text-white">{item.label}</span>
                    <span className="rounded-lg bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-400">
                      {Math.round(item.score * 100)} pts
                    </span>
                  </div>
                  {item.note && (
                    <p className="text-[12px] font-medium leading-tight text-slate-400">{item.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.so_what && card.so_what.length > 0 && (
        <div className="border-t border-white/5 bg-sky-500/5 px-8 py-8">
          <h4 className="mb-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400">
            <Sparkles className="w-4 h-4" /> What to do now
          </h4>
          <div className="grid grid-cols-1 gap-5">
            {card.so_what.map((option) => (
              <div
                key={option.option_id}
                className="group/action rounded-3xl border border-white/10 bg-[#050505] p-6 shadow-sm transition-all hover:border-sky-500/40 hover:shadow-xl"
              >
                <div className="mb-3 flex items-center justify-between font-display text-lg font-bold text-white">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)]" />
                    {option.label}
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-700 transition-all group-hover/action:translate-x-1 group-hover/action:text-sky-400" />
                </div>
                <div className="flex items-start gap-3 text-[14px] font-medium leading-relaxed text-slate-400">
                  <Info className="mt-1 w-4 h-4 shrink-0 text-sky-500/40" />
                  <span>{option.tradeoff_note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.drivers && card.drivers.length > 0 && (
        <div className="border-t border-white/5 px-8 py-8">
          <h4 className="mb-6 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
            Drivers behind the read
          </h4>

          {card.drivers[0].historical_trend && card.drivers[0].historical_trend.length > 0 && (
            <div className="content-auto mb-8 rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="mb-6 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">20-year trend</span>
                <span className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-bold text-sky-400">
                  {card.drivers[0].feature_key.replace(/_/g, ' ')}
                </span>
              </div>
              <DeferredTrendChart data={card.drivers[0].historical_trend} />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {card.drivers.map((driver, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-[13px] font-bold text-slate-300 transition-all hover:border-white/20"
              >
                {driver.direction === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                ) : driver.direction === 'down' ? (
                  <TrendingDown className="w-4 h-4 text-rose-500" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-400" />
                )}
                {driver.feature_key.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {card.world_sim?.enabled && (
        <div className="border-t border-white/5 bg-rose-500/5 px-8 py-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-rose-300">
              <Sparkles className="w-4 h-4" /> {WORLD_SIM_BRAND.name}
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-200">
                {getWorldSimModeLabel(card.world_sim.simulation_mode)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                Quality {Math.round(card.world_sim.quality_score * 100)}%
              </span>
            </div>
          </div>

          {card.world_sim.narrative_arc && (
            <p className="mb-6 text-[15px] font-medium leading-relaxed text-slate-300">
              {card.world_sim.narrative_arc}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {card.world_sim.pivotal_actors.length > 0 && (
              <div className="rounded-3xl border border-white/10 bg-[#050505] p-5">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Pivotal actors</div>
                <div className="flex flex-wrap gap-2">
                  {card.world_sim.pivotal_actors.map((actor) => (
                    <span
                      key={actor}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-white"
                    >
                      {actor}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {card.world_sim.intervention_points.length > 0 && (
              <div className="rounded-3xl border border-white/10 bg-[#050505] p-5">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Intervention points</div>
                <div className="space-y-2">
                  {card.world_sim.intervention_points.map((point) => (
                    <div key={point} className="flex items-start gap-3 text-[13px] font-medium text-slate-300">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {card.personal_output && (
        <div className="border-t border-white/5 bg-gradient-to-br from-white/5 to-transparent px-8 py-8">
          <h4 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400">
            <Activity className="w-4 h-4" /> What this means for you
          </h4>
          <p className="text-[15px] font-medium leading-relaxed text-slate-300">{card.personal_output}</p>
        </div>
      )}

      <div className="mt-auto border-t border-white/5">
        <div
          className="flex cursor-pointer items-center justify-between bg-white/5 p-6 transition-all hover:bg-white/10"
          onClick={() => setShowEvidence(!showEvidence)}
        >
          <div className="no-scrollbar flex items-center gap-5 overflow-x-auto">
            <div className={cn('flex items-center gap-2.5 rounded-full border px-4 py-1.5 text-[11px] font-bold whitespace-nowrap shadow-sm', 'border-sky-500/20 bg-sky-500/10 text-sky-400')}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Trust: {Math.round(card.trust_layer.confidence_score * 100)}%</span>
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap text-[11px] font-bold">
              {getSufficiencyIcon(card.trust_layer.data_sufficiency_flag)}
              <span
                className={cn(
                  'uppercase tracking-[0.15em]',
                  card.trust_layer.data_sufficiency_flag === 'sufficient'
                    ? 'text-emerald-500'
                    : card.trust_layer.data_sufficiency_flag === 'partial'
                      ? 'text-amber-500'
                      : 'text-rose-500'
                )}
              >
                {card.trust_layer.data_sufficiency_flag === 'sufficient'
                  ? 'Data sufficient'
                  : card.trust_layer.data_sufficiency_flag === 'partial'
                    ? 'Partial data'
                    : 'Thin data'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {(() => {
                  const diff = Date.now() - new Date(card.trust_layer.freshness.as_of_utc).getTime();
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  if (hours < 1) return 'Fresh data';
                  return `${hours}h old`;
                })()}
              </span>
            </div>
          </div>
          <motion.div animate={{ rotate: showEvidence ? 90 : 0 }} className="rounded-xl border border-white/10 bg-black/40 p-1.5">
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </motion.div>
        </div>

        <AnimatePresence>
          {showEvidence && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 border-t border-white/10 bg-black/20 p-8 text-[12px] font-semibold text-slate-400">
                <div className="flex items-center justify-between">
                  <span className="uppercase tracking-[0.2em] opacity-50">Last updated</span>
                  <span className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-slate-300">
                    {new Date(card.trust_layer.freshness.as_of_utc).toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="uppercase tracking-[0.2em] opacity-50">Verification level</span>
                  <span className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 capitalize text-slate-300">
                    {card.trust_layer.provenance_summary.verification_level}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="uppercase tracking-[0.2em] opacity-50">Sources / licenses</span>
                  <span className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 uppercase text-slate-300">
                    {card.trust_layer.provenance_summary.license_summary.join(', ')}
                  </span>
                </div>
                {card.world_sim?.enabled && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="uppercase tracking-[0.2em] opacity-50">Graph coverage</span>
                      <span className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-slate-300">
                        {Math.round(card.world_sim.graph_coverage * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="uppercase tracking-[0.2em] opacity-50">Agent convergence</span>
                      <span className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-slate-300">
                        {Math.round(card.world_sim.agent_convergence * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="uppercase tracking-[0.2em] opacity-50">Simulation mode</span>
                      <span className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 capitalize text-slate-300">
                        {getWorldSimModeLabel(card.world_sim.simulation_mode)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
