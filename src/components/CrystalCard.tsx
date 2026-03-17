import React, { useEffect, useState } from 'react';
import { CardData } from '../types/crystal';
import { ShieldCheck, AlertTriangle, Clock, Info, ChevronRight, TrendingUp, TrendingDown, Minus, Share2, Bookmark, Activity, Sparkles, Check, Database } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { WORLD_SIM_BRAND } from '../content/brand';
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
  isSaved: initialIsSaved = false 
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
    const newSavedState = !isSaved;
    setIsSaved(newSavedState);
    if (onSave) {
      onSave(card);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 0.55) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
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
    const trustStamp = `Fiducia ${Math.round(card.trust_layer.confidence_score * 100)}% • ${card.trust_layer.data_sufficiency_flag} • ${new Date(card.trust_layer.freshness.as_of_utc).toLocaleDateString('it-IT')}`;
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
      className="bg-[#0a0a0a] rounded-[32px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/10 overflow-hidden flex flex-col h-full transition-all hover:border-white/20 group premium-gradient"
    >
      {/* Header */}
      <div className="p-8 pb-6">
        <div className="flex justify-between items-start mb-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-[0.2em] bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">
                {card.domain?.split('.').pop()?.replace(/_/g, ' ') || 'PREVISIONE'}
              </span>
              {card.world_sim?.enabled && (
                <span className="text-[10px] font-bold text-rose-300 uppercase tracking-[0.2em] bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  {WORLD_SIM_BRAND.name}
                </span>
              )}
              {hasMarketSignal && (
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full border flex items-center gap-1.5',
                    getMarketSignalTone(marketSignalState)
                  )}
                >
                  <Database className="w-3 h-3" />
                  {getMarketSignalLabel(marketFrame)}
                </span>
              )}
              {card.stakes_level && (
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full border flex items-center gap-1.5",
                  card.stakes_level === 'imminent' || card.stakes_level === 'high' 
                    ? "text-rose-400 bg-rose-500/10 border-rose-500/20" 
                    : card.stakes_level === 'medium' ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    : "text-slate-400 bg-white/5 border-white/10"
                )}>
                  <Activity className="w-3 h-3" /> 
                  {card.stakes_level === 'imminent' ? 'Imminente' : 
                   card.stakes_level === 'high' ? 'Alto Impatto' : 
                   card.stakes_level === 'medium' ? 'Medio Impatto' : 'Basso Impatto'}
                </span>
              )}
            </div>
            <h3 className="text-2xl md:text-3xl font-display font-bold text-white leading-tight break-words">{card.title}</h3>
          </div>
          <div className="flex gap-2.5">
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={handleSave}
              className={cn(
                "p-3 rounded-2xl transition-all border",
                isSaved ? "bg-sky-500 text-white border-sky-500 shadow-lg shadow-sky-500/20" : "bg-white/5 text-slate-400 hover:text-white border-white/10 hover:border-white/20"
              )}
            >
              {isSaved ? <Check className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
            </motion.button>
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={handleShare}
              className={cn(
                "p-3 rounded-2xl transition-all border",
                isShared ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20" : "bg-white/5 text-slate-400 hover:text-white border-white/10 hover:border-white/20"
              )}
            >
              <Share2 className="w-5 h-5" />
            </motion.button>
          </div>
        </div>
        
        {/* Explicit Verdict - Premium UX */}
        {card.verdict && (
          <div className="mb-8 p-8 bg-white/5 rounded-[32px] border border-white/10 relative overflow-hidden group/verdict shadow-inner">
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-transparent opacity-0 group-hover/verdict:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover/verdict:opacity-20 transition-all duration-500 group-hover/verdict:scale-110">
              <Sparkles className="w-20 h-20 text-sky-400" />
            </div>
            <div className="flex justify-between items-center mb-4 relative z-10">
              <h4 className="text-[10px] font-bold text-sky-400 uppercase tracking-[0.3em]">Verdetto Crystal</h4>
              {card.risk_band && (
                <div className="flex items-center gap-2.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Rischio</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map((i) => {
                      const levels = { low: 1, medium: 2, high: 3, extreme: 4 };
                      const current = levels[card.risk_band!] || 1;
                      return (
                        <div 
                          key={i} 
                          className={cn(
                            "w-5 h-1.5 rounded-full transition-all duration-500",
                            i <= current 
                              ? (current >= 3 ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : current === 2 ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]")
                              : "bg-white/10"
                          )} 
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <p className="text-2xl md:text-3xl font-display font-bold text-white leading-tight break-words relative z-10">
              {card.verdict}
            </p>
          </div>
        )}

        <p className="text-[16px] md:text-[17px] text-slate-300 leading-relaxed font-medium break-words">
          {card.summary}
        </p>
        {card.trust_layer.data_sufficiency_flag !== 'sufficient' && (
          <div className="mt-4 flex items-center gap-2 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-4 py-2 rounded-xl border border-amber-500/20 w-fit">
            <AlertTriangle className="w-4 h-4" />
            <span>Nota: Basato su dati parziali. Crystal ha evitato allucinazioni.</span>
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
                <div className="mt-2 text-lg font-semibold text-white">{formatSignedDelta(marketFrame?.divergence_vs_crystal)}</div>
              </div>
            </div>

            {(marketFrame?.market_question || marketFrame?.reference_market) && (
              <div className="mt-4 text-sm leading-7 text-slate-300">
                <span className="font-semibold text-white">Reference market:</span>{' '}
                {marketFrame?.market_question || marketFrame?.reference_market}
              </div>
            )}

            {(marketFrame?.volume_24h != null || marketFrame?.open_interest != null || marketFrame?.liquidity != null) && (
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

      {/* Prediction / Scenarios */}
      {card.scenario_set && card.scenario_set.length > 0 && (
        <div className="px-8 py-8 border-t border-white/5">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em] mb-8 flex items-center gap-2">
            <Activity className="w-4 h-4" /> SCENARI PROBABILI
          </h4>
          <div className="space-y-6">
            {card.scenario_set.map((scenario, idx) => (
              <div key={scenario.scenario_id} className="flex items-center justify-between group/scenario">
                <span className="text-[15px] font-semibold text-slate-300 group-hover/scenario:text-white transition-colors">{scenario.label}</span>
                <div className="flex items-center gap-5">
                  <div className="w-32 md:w-48 h-2 bg-white/5 rounded-full overflow-hidden relative">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${scenario.probability * 100}%` }}
                      transition={{ duration: 1.2, delay: 0.2 + idx * 0.1, ease: "circOut" }}
                      className={cn(
                        "h-full rounded-full",
                        idx === 0 ? "bg-sky-500" : idx === 1 ? "bg-emerald-400" : "bg-amber-400"
                      )}
                    />
                  </div>
                  <span className="text-sm font-bold text-white w-10 text-right">
                    {Math.round(scenario.probability * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ranked List */}
      {card.ranked_list && card.ranked_list.length > 0 && (
        <div className="px-8 py-8 border-t border-white/5">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em] mb-8 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> CLASSIFICA CRYSTAL
          </h4>
          <div className="space-y-4">
            {card.ranked_list.map((item) => (
              <div key={item.item_id} className="flex items-center gap-5 p-5 bg-white/5 rounded-3xl border border-white/10 hover:border-white/20 transition-all">
                <div className="w-10 h-10 bg-sky-500 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg shadow-sky-500/20">
                  {item.rank}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[15px] font-bold text-white">{item.label}</span>
                    <span className="text-[11px] font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg">
                      {Math.round(item.score * 100)} pts
                    </span>
                  </div>
                  {item.note && <p className="text-[12px] text-slate-400 font-medium leading-tight">{item.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* So What / Tradeoffs */}
      {card.so_what && card.so_what.length > 0 && (
        <div className="px-8 py-8 border-t border-white/5 bg-sky-500/5">
          <h4 className="text-[10px] font-bold text-sky-400 uppercase tracking-[0.25em] mb-8 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> COSA PUOI FARE ORA
          </h4>
          <div className="grid grid-cols-1 gap-5">
            {card.so_what.map((option) => (
              <div key={option.option_id} className="p-6 bg-[#050505] rounded-3xl border border-white/10 shadow-sm hover:border-sky-500/40 hover:shadow-xl transition-all group/action">
                <div className="font-display font-bold text-lg text-white mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 bg-sky-500 rounded-full shadow-[0_0_10px_rgba(14,165,233,0.5)]" />
                    {option.label}
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-700 group-hover/action:text-sky-400 group-hover/action:translate-x-1 transition-all" />
                </div>
                <div className="text-[14px] text-slate-400 flex items-start gap-3 leading-relaxed font-medium">
                  <Info className="w-4 h-4 mt-1 shrink-0 text-sky-500/40" />
                  <span>{option.tradeoff_note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drivers */}
      {card.drivers && card.drivers.length > 0 && (
        <div className="px-8 py-8 border-t border-white/5">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em] mb-6">DRIVER DI ANALISI</h4>
          
          {/* Primary Driver Chart */}
          {card.drivers[0].historical_trend && card.drivers[0].historical_trend.length > 0 && (
            <div className="mb-8 p-6 bg-white/5 rounded-3xl border border-white/10">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trend 20 Anni</span>
                <span className="text-[11px] font-bold text-sky-400 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
                  {card.drivers[0].feature_key.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="h-28 md:h-32 w-full" style={{ minHeight: 112, minWidth: 0 }}>
                <ResponsiveContainer width="99%" height="100%">
                  <LineChart data={card.drivers[0].historical_trend}>
                    <YAxis domain={['auto', 'auto']} hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#050505', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', fontSize: '12px', fontWeight: 'bold', padding: '16px' }}
                      itemStyle={{ color: '#0ea5e9' }}
                      labelStyle={{ color: '#64748b', marginBottom: '6px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#0ea5e9" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: '#0ea5e9', strokeWidth: 2, stroke: '#050505' }} 
                      activeDot={{ r: 6, fill: '#0ea5e9', strokeWidth: 2, stroke: '#050505' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {card.drivers.map((driver, idx) => (
              <div key={idx} className="flex items-center gap-2.5 px-5 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-[13px] font-bold text-slate-300 hover:border-white/20 transition-all">
                {driver.direction === 'up' ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : 
                 driver.direction === 'down' ? <TrendingDown className="w-4 h-4 text-rose-500" /> : 
                 <Minus className="w-4 h-4 text-slate-400" />}
                {driver.feature_key.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {card.world_sim?.enabled && (
        <div className="px-8 py-8 border-t border-white/5 bg-rose-500/5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h4 className="text-[10px] font-bold text-rose-300 uppercase tracking-[0.25em] flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> ORACLE WORLD SIM
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
            <p className="text-[15px] font-medium text-slate-300 leading-relaxed mb-6">
              {card.world_sim.narrative_arc}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {card.world_sim.pivotal_actors.length > 0 && (
              <div className="rounded-3xl border border-white/10 bg-[#050505] p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">Attori pivot</div>
                <div className="flex flex-wrap gap-2">
                  {card.world_sim.pivotal_actors.map((actor) => (
                    <span key={actor} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-white">
                      {actor}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {card.world_sim.intervention_points.length > 0 && (
              <div className="rounded-3xl border border-white/10 bg-[#050505] p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3">Intervention points</div>
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

      {/* Personal Output (Secondary) */}
      {card.personal_output && (
        <div className="px-8 py-8 border-t border-white/5 bg-gradient-to-br from-white/5 to-transparent">
          <h4 className="text-[10px] font-bold text-sky-400 uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Impatto su di te
          </h4>
          <p className="text-[15px] font-medium text-slate-300 leading-relaxed">
            {card.personal_output}
          </p>
        </div>
      )}

      {/* Trust Strip */}
      <div className="mt-auto border-t border-white/5">
        <div 
          className="bg-white/5 p-6 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-all"
          onClick={() => setShowEvidence(!showEvidence)}
        >
          <div className="flex items-center gap-5 overflow-x-auto no-scrollbar">
            <div className={cn("flex items-center gap-2.5 px-4 py-1.5 rounded-full border text-[11px] font-bold whitespace-nowrap shadow-sm", "text-sky-400 bg-sky-500/10 border-sky-500/20")}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Fiducia: {Math.round(card.trust_layer.confidence_score * 100)}%</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold whitespace-nowrap">
              {getSufficiencyIcon(card.trust_layer.data_sufficiency_flag)}
              <span className={cn(
                "uppercase tracking-[0.15em]",
                card.trust_layer.data_sufficiency_flag === 'sufficient' ? 'text-emerald-500' : 
                card.trust_layer.data_sufficiency_flag === 'partial' ? 'text-amber-500' : 'text-rose-500'
              )}>
                {card.trust_layer.data_sufficiency_flag === 'sufficient' ? 'Dati OK' : 
                 card.trust_layer.data_sufficiency_flag === 'partial' ? 'Dati Parziali' : 'Dati Insufficienti'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {(() => {
                  const diff = Date.now() - new Date(card.trust_layer.freshness.as_of_utc).getTime();
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  if (hours < 1) return 'Dati recenti';
                  return `Dati di ${hours}h fa`;
                })()}
              </span>
            </div>
          </div>
          <motion.div 
            animate={{ rotate: showEvidence ? 90 : 0 }}
            className="p-1.5 bg-black/40 rounded-xl border border-white/10"
          >
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </motion.div>
        </div>

        {/* Evidence Drawer */}
        <AnimatePresence>
          {showEvidence && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-8 bg-black/20 border-t border-white/10 text-[12px] text-slate-400 space-y-4 font-semibold">
                <div className="flex justify-between items-center">
                  <span className="uppercase tracking-[0.2em] opacity-50">Ultimo aggiornamento</span>
                  <span className="font-mono bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 text-slate-300">
                    {new Date(card.trust_layer.freshness.as_of_utc).toLocaleString('it-IT')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="uppercase tracking-[0.2em] opacity-50">Livello di verifica</span>
                  <span className="capitalize bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 text-slate-300">
                    {card.trust_layer.provenance_summary.verification_level}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="uppercase tracking-[0.2em] opacity-50">Fonti / Licenze</span>
                  <span className="uppercase bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 text-slate-300">
                    {card.trust_layer.provenance_summary.license_summary.join(', ')}
                  </span>
                </div>
                {card.world_sim?.enabled && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="uppercase tracking-[0.2em] opacity-50">Graph coverage</span>
                      <span className="font-mono bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 text-slate-300">
                        {Math.round(card.world_sim.graph_coverage * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="uppercase tracking-[0.2em] opacity-50">Agent convergence</span>
                      <span className="font-mono bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 text-slate-300">
                        {Math.round(card.world_sim.agent_convergence * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="uppercase tracking-[0.2em] opacity-50">Simulation mode</span>
                      <span className="capitalize bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 text-slate-300">
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
