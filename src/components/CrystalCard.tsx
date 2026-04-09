import React, { useEffect, useState } from 'react';
import { CardData, FixtureRead } from '../types/crystal';
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

function isSportsCard(card: CardData) {
  return (
    card.card_type === 'sports_fixture_board' ||
    card.domain === 'A.29.sports_performance_and_outcomes' ||
    card.domain === 'A.13.sports.match_outcomes' ||
    card.domain === 'B.3.6.sports_outcomes_probability_mode'
  );
}

function formatEvidenceTime(asOfUtc: string) {
  const date = new Date(asOfUtc);
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Fresh data';
  return `${hours}h old`;
}

function getSportsDecisionLabel(state?: string | null) {
  switch (state) {
    case 'edge':
      return 'Edge';
    case 'lean':
      return 'Lean';
    case 'no_bet':
      return 'No bet';
    case 'grounded_lean':
      return 'Grounded lean';
    case 'hold':
      return 'Hold';
    default:
      return 'Sports read';
  }
}

function getSportsDecisionTone(state?: string | null) {
  switch (state) {
    case 'edge':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'lean':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'no_bet':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'grounded_lean':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    default:
      return 'border-rose-200 bg-rose-50 text-rose-700';
  }
}

function getDecisionStateLabel(state?: string | null) {
  switch (state) {
    case 'edge':
      return 'Edge';
    case 'lean':
      return 'Lean';
    case 'no_action':
      return 'No action';
    case 'grounded_lean':
      return 'Grounded lean';
    case 'hold':
      return 'Hold';
    default:
      return 'Decision';
  }
}

function getDecisionStateTone(state?: string | null) {
  switch (state) {
    case 'edge':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'lean':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'no_action':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'grounded_lean':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    default:
      return 'border-rose-200 bg-rose-50 text-rose-700';
  }
}

function formatSportsPercent(value?: number | null) {
  const num = Number(value);
  return Number.isFinite(num) ? `${Math.round(num * 100)}%` : '--';
}

function formatSportsPrice(value?: number | null) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num.toFixed(2) : '--';
}

function inferSportsSideKey(
  frame: {
    home?: number | null;
    draw?: number | null;
    away?: number | null;
    home_label?: string | null;
    draw_label?: string | null;
    away_label?: string | null;
  } | null | undefined,
  label?: string | null
) {
  if (!frame || !label) return '';
  const normalizedLabel = label.trim().toLowerCase();
  const candidates: Array<'home' | 'draw' | 'away'> = ['home', 'draw', 'away'];
  for (const key of candidates) {
    const candidateLabel = frame[`${key}_label` as const];
    if (typeof candidateLabel === 'string' && candidateLabel.trim().toLowerCase() === normalizedLabel) {
      return key;
    }
  }
  if (normalizedLabel.includes('draw') || normalizedLabel.includes('pareggio') || normalizedLabel.includes('x')) {
    return 'draw';
  }
  return '';
}

function getSportsFrameValue(
  frame: {
    home?: number | null;
    draw?: number | null;
    away?: number | null;
  } | null | undefined,
  sideKey: string
) {
  if (!frame || !sideKey) return null;
  if (sideKey === 'home' || sideKey === 'draw' || sideKey === 'away') {
    const value = frame[sideKey];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  return null;
}

function SportsFixtureRow({ fixture, rank }: { fixture: FixtureRead; rank: number }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">
              {rank}
            </span>
            <h5 className="text-lg font-display font-semibold text-slate-950">{fixture.label}</h5>
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-700">{fixture.rationale}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full border border-[#1453e8]/20 bg-[#e9efff] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#1453e8]">
            {fixture.primary_call}
          </span>
          <span className="text-sm font-semibold text-slate-600">{Math.round(fixture.confidence * 100)} pts</span>
        </div>
      </div>

      {fixture.evidence.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {fixture.evidence.map((item) => (
            <span
              key={`${fixture.fixture_id}-${item}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {item}
            </span>
          ))}
        </div>
      )}

      {fixture.caution && (
        <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-900">
          {fixture.caution}
        </div>
      )}
    </div>
  );
}

function SportsCrystalCard({
  card,
  showEvidence,
  setShowEvidence,
  isSaved,
  isShared,
  handleSave,
  handleShare,
}: {
  card: CardData;
  showEvidence: boolean;
  setShowEvidence: React.Dispatch<React.SetStateAction<boolean>>;
  isSaved: boolean;
  isShared: boolean;
  handleSave: () => void;
  handleShare: () => Promise<void>;
}) {
  const rankedItems = (card.ranked_list || []).slice(0, 5);
  const fixtureReads = (card.fixture_reads || []).slice(0, 8);
  const sportsDecision = card.world_sim?.sports_decision || null;
  const decisionState =
    card.sports_decision_state || sportsDecision?.decision_state || card.sports_pick_state || (card.sports_grounded ? 'grounded_lean' : 'hold');
  const decisionReason = card.sports_decision_reason || sportsDecision?.decision_reason || card.summary;
  const noBetReason = card.sports_no_bet_reason || sportsDecision?.no_bet_reason || null;
  const modelProbabilities =
    card.sports_model_probabilities || sportsDecision?.model_probabilities || card.sports_grounding?.model_probabilities || null;
  const marketProbabilities =
    card.sports_market_probabilities || sportsDecision?.market_probabilities || card.sports_grounding?.market_probabilities || null;
  const fairPrices = card.sports_fair_prices || sportsDecision?.fair_prices || card.sports_grounding?.fair_prices || null;
  const bestEdgeKey = card.sports_edge_delta?.best_key || sportsDecision?.edge_delta?.best_key || '';
  const currentLean =
    card.sports_model_favorite ||
    sportsDecision?.model_favorite ||
    card.sports_grounding?.model_favorite ||
    card.sports_grounding?.winning_side ||
    card.primary_call ||
    'Grounded lean';
  const marketLean =
    card.sports_market_favorite || sportsDecision?.market_favorite || card.sports_grounding?.market_favorite || null;
  const selectedSideKey =
    bestEdgeKey ||
    inferSportsSideKey(modelProbabilities, currentLean) ||
    inferSportsSideKey(marketProbabilities, marketLean || currentLean);
  const modelProbability = getSportsFrameValue(modelProbabilities, selectedSideKey);
  const marketProbability = getSportsFrameValue(marketProbabilities, selectedSideKey);
  const fairPrice = getSportsFrameValue(fairPrices, selectedSideKey);
  const marketPrice = marketProbability && marketProbability > 0 ? 1 / marketProbability : null;
  const edgePoints = Number(card.sports_edge_delta?.best_delta ?? sportsDecision?.edge_delta?.best_delta);
  const fragilityScore = Number(card.sports_fragility_score ?? sportsDecision?.fragility_score);
  const simulationConfidence = Number(card.sports_simulation_confidence ?? sportsDecision?.simulation_confidence);
  const flipConditions =
    (card.sports_flip_conditions && card.sports_flip_conditions.length > 0
      ? card.sports_flip_conditions
      : sportsDecision?.flip_conditions && sportsDecision.flip_conditions.length > 0
        ? sportsDecision.flip_conditions
        : card.invalidators || []
    ).slice(0, 4);
  const decisionNotes = [
    card.fixture_window_state ? `Fixture window: ${card.fixture_window_state.replace(/_/g, ' ')}` : '',
    marketLean ? `Market favorite: ${marketLean}` : '',
    Number.isFinite(edgePoints) ? `Model vs market delta: ${Math.round(edgePoints * 100)} pts` : '',
    Number.isFinite(simulationConfidence) ? `Simulation confidence: ${Math.round(simulationConfidence * 100)}%` : '',
  ].filter(Boolean);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="editorial-panel flex h-full flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-[rgba(255,255,255,0.96)] shadow-[0_28px_70px_rgba(15,23,42,0.08)]"
    >
      <div className="p-8 pb-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#1453e8]/20 bg-[#e9efff] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#1453e8]">
                Forecast
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
                Sports read
              </span>
            </div>
            <h3 className="break-words text-2xl font-display font-bold leading-tight text-slate-950 md:text-3xl">
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
                  ? 'border-[#1453e8] bg-[#1453e8] text-white shadow-lg shadow-[#1453e8]/20'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900'
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
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900'
              )}
            >
              <Share2 className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        <div className="rounded-[30px] border border-[#1453e8]/10 bg-[linear-gradient(135deg,rgba(20,83,232,0.08),rgba(255,255,255,0.95))] p-7">
          <div className="section-kicker !text-[#1453e8]">Verdetto Crystal</div>
          <p className="mt-3 break-words text-2xl font-display font-bold leading-tight text-slate-950 md:text-3xl">
            {card.verdict}
          </p>
          <p className="mt-4 text-[16px] leading-8 text-slate-700">{card.summary}</p>
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Decision layer</div>
              <div className="mt-2 text-xl font-display font-bold text-slate-950">{currentLean}</div>
            </div>
            <span
              className={cn(
                'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                getSportsDecisionTone(decisionState)
              )}
            >
              {getSportsDecisionLabel(decisionState)}
            </span>
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-700">{decisionReason}</p>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Model prob</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">{formatSportsPercent(modelProbability)}</div>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Fair price</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">{formatSportsPrice(fairPrice)}</div>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Market price</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">{formatSportsPrice(marketPrice)}</div>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Fragility</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">
                {Number.isFinite(fragilityScore) ? `${Math.round(fragilityScore * 100)}%` : '--'}
              </div>
            </div>
          </div>

          {decisionNotes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {decisionNotes.map((note) => (
                <span
                  key={note}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {note}
                </span>
              ))}
            </div>
          )}

          {noBetReason && (
            <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Why this is no bet</div>
              <p className="mt-2">{noBetReason}</p>
            </div>
          )}

          {flipConditions.length > 0 && (
            <div className="mt-4 rounded-[22px] border border-slate-200 bg-[#fcfbf8] px-4 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">What could flip it</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {flipConditions.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {card.trust_layer.data_sufficiency_flag !== 'sufficient' && (
          <div className="mt-5 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-7 text-amber-900">
            Crystal ha evitato di forzare edge artificiali: il dato disponibile e parziale, quindi il ranking resta selettivo.
          </div>
        )}
      </div>

      {rankedItems.length > 0 && (
        <div className="border-t border-slate-200 px-8 py-8">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
            <TrendingUp className="w-4 h-4 text-[#1453e8]" /> Segnali più forti
          </h4>
          <div className="space-y-4">
            {rankedItems.map((item) => (
              <div key={item.item_id} className="rounded-[28px] border border-slate-200 bg-[#fcfbf8] px-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">
                      {item.rank}
                    </span>
                    <div className="text-base font-semibold text-slate-950">{item.label}</div>
                  </div>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                    {Math.round(item.score * 100)} pts
                  </span>
                </div>
                {item.note && <p className="mt-3 text-sm leading-7 text-slate-700">{item.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {fixtureReads.length > 0 && (
        <div className="border-t border-slate-200 bg-[rgba(247,244,239,0.55)] px-8 py-8">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
            <Activity className="w-4 h-4 text-[#1453e8]" /> Lettura partita per partita
          </h4>
          <div className="space-y-4">
            {fixtureReads.map((fixture, index) => (
              <SportsFixtureRow key={fixture.fixture_id} fixture={fixture} rank={index + 1} />
            ))}
          </div>
        </div>
      )}

      {card.drivers && card.drivers.length > 0 && (
        <div className="border-t border-slate-200 px-8 py-8">
          <h4 className="mb-6 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Perché Crystal la vede così</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {card.drivers.slice(0, 6).map((driver) => (
              <div key={driver.feature_key} className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                <div className="text-sm font-semibold text-slate-950">{driver.feature_key.replace(/_/g, ' ')}</div>
                <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {driver.direction} - contribution {Math.round(driver.contribution * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.personal_output && (
        <div className="border-t border-slate-200 bg-[rgba(20,83,232,0.03)] px-8 py-8">
          <h4 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#1453e8]">
            <Info className="w-4 h-4" /> Cosa significa adesso
          </h4>
          <p className="text-[15px] leading-8 text-slate-700">{card.personal_output}</p>
        </div>
      )}

      <div className="mt-auto border-t border-slate-200">
        <div
          className="flex cursor-pointer items-center justify-between bg-[rgba(248,246,241,0.9)] p-6 transition-all hover:bg-[rgba(245,242,235,1)]"
          onClick={() => setShowEvidence(!showEvidence)}
        >
          <div className="no-scrollbar flex items-center gap-5 overflow-x-auto">
            <div className="flex items-center gap-2.5 rounded-full border border-[#1453e8]/20 bg-[#e9efff] px-4 py-1.5 text-[11px] font-bold whitespace-nowrap text-[#1453e8]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Trust: {Math.round(card.trust_layer.confidence_score * 100)}%</span>
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600">
              {card.trust_layer.data_sufficiency_flag === 'sufficient'
                ? 'Data sufficient'
                : card.trust_layer.data_sufficiency_flag === 'partial'
                  ? 'Partial data'
                  : 'Thin data'}
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatEvidenceTime(card.trust_layer.freshness.as_of_utc)}</span>
            </div>
          </div>
          <motion.div animate={{ rotate: showEvidence ? 90 : 0 }} className="rounded-xl border border-slate-200 bg-white p-1.5">
            <ChevronRight className="w-4 h-4 text-slate-500" />
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
              <div className="space-y-4 border-t border-slate-200 bg-[#faf8f4] p-8 text-[12px] font-semibold text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="uppercase tracking-[0.2em] opacity-70">Last updated</span>
                  <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-slate-700">
                    {new Date(card.trust_layer.freshness.as_of_utc).toLocaleString('it-IT')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="uppercase tracking-[0.2em] opacity-70">Verification level</span>
                  <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 capitalize text-slate-700">
                    {card.trust_layer.provenance_summary.verification_level}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="uppercase tracking-[0.2em] opacity-70">Sources / licenses</span>
                  <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 uppercase text-slate-700">
                    {card.trust_layer.provenance_summary.license_summary.join(', ')}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function getDomainLabel(domain?: string) {
  if (!domain) return 'Forecast';
  return domain
    .split('.')
    .slice(-1)[0]
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getCardStateLabel(state?: CardData['card_state']) {
  if (state === 'published') return 'Published';
  if (state === 'limited') return 'Limited';
  if (state === 'blocked') return 'Coverage gap';
  return 'Published';
}

function getCardStateTone(state?: CardData['card_state']) {
  if (state === 'blocked') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (state === 'limited') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getMarketSignalTone(state: ReturnType<typeof getMarketSignalState>) {
  if (state === 'calibrated') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (state === 'diverge') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (state === 'watch') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getStakesTone(stakesLevel?: CardData['stakes_level']) {
  if (stakesLevel === 'imminent' || stakesLevel === 'high') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  if (stakesLevel === 'medium') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function getStakesLabel(stakesLevel?: CardData['stakes_level']) {
  if (stakesLevel === 'imminent') return 'Imminent';
  if (stakesLevel === 'high') return 'High impact';
  if (stakesLevel === 'medium') return 'Medium impact';
  return 'Lower impact';
}

function BlueprintCrystalCard({
  card,
  showEvidence,
  setShowEvidence,
  isSaved,
  isShared,
  handleSave,
  handleShare,
  marketFrame,
  hasMarketSignal,
  marketSignalState,
  crystalProbability,
  marketProbability,
}: {
  card: CardData;
  showEvidence: boolean;
  setShowEvidence: React.Dispatch<React.SetStateAction<boolean>>;
  isSaved: boolean;
  isShared: boolean;
  handleSave: () => void;
  handleShare: () => Promise<void>;
  marketFrame: CardData['prediction_market_frame'];
  hasMarketSignal: boolean;
  marketSignalState: ReturnType<typeof getMarketSignalState>;
  crystalProbability: number | null;
  marketProbability: number | null;
}) {
  const stateLabel = getCardStateLabel(card.card_state);
  const evidence = card.evidence_drawer;
  const confidencePercent = Math.round(card.trust_layer.confidence_score * 100);
  const whaleMode = card.world_sim?.whale_mode || null;
  const decisionState = card.decision_state || whaleMode?.decision_state || card.publication_basis?.decision_state || null;
  const decisionReason = card.decision_reason || whaleMode?.decision_reason || card.summary;
  const noActionReason = card.no_action_reason || whaleMode?.no_action_reason || card.publication_basis?.no_action_reason || null;
  const referenceSourceClass =
    card.reference_source_class || whaleMode?.reference_source_class || card.publication_basis?.reference_source_class || null;
  const referenceProbability =
    card.reference_probability ??
    whaleMode?.reference_probability ??
    card.publication_basis?.reference_probability ??
    marketProbability ??
    null;
  const modelProbabilityForDecision = card.world_sim?.whale_mode?.model_probability ?? crystalProbability ?? null;
  const edgeDelta = card.edge_delta ?? whaleMode?.edge_delta ?? card.publication_basis?.edge_delta ?? null;
  const fragilityScore = card.fragility_score ?? whaleMode?.fragility_score ?? card.publication_basis?.fragility_score ?? null;
  const simulationConfidence =
    card.simulation_confidence ?? whaleMode?.simulation_confidence ?? card.publication_basis?.simulation_confidence ?? null;
  const decisionNotes = [
    referenceSourceClass ? `Reference frame: ${referenceSourceClass.replace(/_/g, ' ')}` : '',
    whaleMode?.reference_source ? `Reference source: ${whaleMode.reference_source}` : '',
    Number.isFinite(Number(simulationConfidence)) ? `Simulation confidence: ${Math.round(Number(simulationConfidence) * 100)}%` : '',
  ].filter(Boolean);
  const genericFlipConditions =
    (Array.isArray(card.flip_conditions) && card.flip_conditions.length > 0
      ? card.flip_conditions
      : Array.isArray(whaleMode?.flip_conditions) && whaleMode.flip_conditions.length > 0
        ? whaleMode.flip_conditions
        : Array.isArray(card.invalidators)
          ? card.invalidators
          : []
    ).slice(0, 4);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="editorial-panel flex h-full flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-[rgba(255,255,255,0.98)] shadow-[0_28px_70px_rgba(15,23,42,0.08)]"
    >
      <div className="p-8 pb-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
                {getDomainLabel(card.domain)}
              </span>
              <span
                className={cn(
                  'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                  getCardStateTone(card.card_state)
                )}
              >
                {stateLabel}
              </span>
              {card.world_sim?.enabled && (
                <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-700">
                  {WORLD_SIM_BRAND.name}
                </span>
              )}
              {hasMarketSignal && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                    getMarketSignalTone(marketSignalState)
                  )}
                >
                  <Database className="h-3.5 w-3.5" />
                  {getMarketSignalLabel(marketFrame)}
                </span>
              )}
              {card.stakes_level && (
                <span
                  className={cn(
                    'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]',
                    getStakesTone(card.stakes_level)
                  )}
                >
                  {getStakesLabel(card.stakes_level)}
                </span>
              )}
              <span className="rounded-full border border-[#1453e8]/15 bg-[#eff4ff] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#1453e8]">
                {card.canonical_card_type?.replace(/_/g, ' ') || 'Forecast band'}
              </span>
              {card.version_id && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  {card.version_id}
                </span>
              )}
            </div>
            <h3 className="break-words text-2xl font-display font-bold leading-tight text-slate-950 md:text-3xl">
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
                  ? 'border-[#1453e8] bg-[#1453e8] text-white shadow-lg shadow-[#1453e8]/20'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900'
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
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900'
              )}
            >
              <Share2 className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(135deg,rgba(20,83,232,0.08),rgba(255,255,255,0.95))] p-7">
          <div className="section-kicker !text-[#1453e8]">Prediction</div>
          <p className="mt-3 break-words text-2xl font-display font-bold leading-tight text-slate-950 md:text-3xl">
            {card.verdict}
          </p>
          <p className="mt-4 text-[16px] leading-8 text-slate-700">{card.summary}</p>
        </div>

        {decisionState && (
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Decision layer</div>
                <div className="mt-2 text-xl font-display font-bold text-slate-950">{getDecisionStateLabel(decisionState)}</div>
              </div>
              <span
                className={cn(
                  'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                  getDecisionStateTone(decisionState)
                )}
              >
                {getDecisionStateLabel(decisionState)}
              </span>
            </div>

            <p className="mt-4 text-sm leading-7 text-slate-700">{decisionReason}</p>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Crystal</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{formatProbabilityLabel(modelProbabilityForDecision)}</div>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Reference</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{formatProbabilityLabel(referenceProbability)}</div>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Edge delta</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{formatSignedDelta(edgeDelta)}</div>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Fragility</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {Number.isFinite(Number(fragilityScore)) ? `${Math.round(Number(fragilityScore) * 100)}%` : '--'}
                </div>
              </div>
            </div>

            {decisionNotes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {decisionNotes.map((note) => (
                  <span
                    key={note}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {note}
                  </span>
                ))}
              </div>
            )}

            {noActionReason && (
              <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Why Crystal waits</div>
                <p className="mt-2">{noActionReason}</p>
              </div>
            )}

            {genericFlipConditions.length > 0 && (
              <div className="mt-4 rounded-[20px] border border-slate-200 bg-[#fcfbf8] px-4 py-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">What could flip it</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {genericFlipConditions.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {hasMarketSignal && (
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                <Database className="h-4 w-4 text-[#1453e8]" />
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
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Crystal</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{formatProbabilityLabel(crystalProbability)}</div>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Market</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{formatProbabilityLabel(marketProbability)}</div>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Delta</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {formatSignedDelta(marketFrame?.divergence_vs_crystal)}
                </div>
              </div>
            </div>

            {(marketFrame?.market_question || marketFrame?.reference_market) && (
              <div className="mt-4 text-sm leading-7 text-slate-700">
                <span className="font-semibold text-slate-950">Reference market:</span>{' '}
                {marketFrame?.market_question || marketFrame?.reference_market}
              </div>
            )}

            {(marketFrame?.volume_24h != null ||
              marketFrame?.open_interest != null ||
              marketFrame?.liquidity != null) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {marketFrame?.volume_24h != null && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700">
                    24h volume {formatCompactNumber(marketFrame.volume_24h)}
                  </span>
                )}
                {marketFrame?.open_interest != null && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700">
                    OI {formatCompactNumber(marketFrame.open_interest)}
                  </span>
                )}
                {marketFrame?.liquidity != null && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700">
                    Liquidity {formatCompactNumber(marketFrame.liquidity)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {card.card_state === 'blocked' && (
          <div className="mt-5 flex items-start gap-3 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-7 text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
            Crystal ha riconosciuto il dominio ma ha fermato la pubblicazione: la coverage di questa cella non e ancora
            abbastanza solida per un output affidabile.
            </div>
          </div>
        )}

        {card.card_state === 'limited' && (
          <div className="mt-5 flex items-start gap-3 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
            La card resta utile, ma il trust layer segnala copertura o freschezza parziale. Crystal mostra il read senza
            riempire i vuoti.
            </div>
          </div>
        )}
      </div>

      {card.scenario_set && card.scenario_set.length > 0 && (
        <div className="border-t border-slate-200 px-8 py-8">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
            <Activity className="w-4 h-4 text-[#1453e8]" /> Likely scenarios
          </h4>
          <div className="space-y-4">
            {card.scenario_set.map((scenario) => (
              <div key={scenario.scenario_id} className="rounded-[24px] border border-slate-200 bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-slate-950">{scenario.label}</div>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-700">
                    {Math.round(scenario.probability * 100)}%
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#1453e8]" style={{ width: `${scenario.probability * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.so_what && card.so_what.length > 0 && (
        <div className="border-t border-slate-200 bg-[rgba(20,83,232,0.03)] px-8 py-8">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#1453e8]">
            <Sparkles className="w-4 h-4" /> So what
          </h4>
          <div className="grid gap-4">
            {card.so_what.map((option) => (
              <div key={option.option_id} className="rounded-[24px] border border-slate-200 bg-white px-5 py-5">
                <div className="text-base font-semibold text-slate-950">{option.label}</div>
                <p className="mt-3 text-sm leading-7 text-slate-700">{option.tradeoff_note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(card.what_to_watch && card.what_to_watch.length > 0) && (
        <div className="border-t border-slate-200 px-8 py-8">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
            <Info className="w-4 h-4 text-[#1453e8]" /> What to watch
          </h4>
          <div className="space-y-3">
            {card.what_to_watch.map((item) => (
              <div key={item} className="rounded-[22px] border border-slate-200 bg-[#fcfbf8] px-4 py-4 text-sm leading-7 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {(card.how_to_raise_confidence && card.how_to_raise_confidence.length > 0) && (
        <div className="border-t border-slate-200 bg-[rgba(248,246,241,0.7)] px-8 py-8">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-[#1453e8]" /> How to raise confidence
          </h4>
          <div className="space-y-3">
            {card.how_to_raise_confidence.map((item) => (
              <div key={item} className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {card.ranked_list && card.ranked_list.length > 0 && (
        <div className="border-t border-slate-200 px-8 py-8">
          <h4 className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
            <TrendingUp className="w-4 h-4 text-[#1453e8]" /> Rank and compare
          </h4>
          <div className="space-y-4">
            {card.ranked_list.map((item) => (
              <div key={item.item_id} className="rounded-[24px] border border-slate-200 bg-white px-5 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">
                      {item.rank}
                    </span>
                    <div className="text-base font-semibold text-slate-950">{item.label}</div>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700">
                    {Math.round(item.score * 100)} pts
                  </span>
                </div>
                {item.note && <p className="mt-3 text-sm leading-7 text-slate-700">{item.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {card.drivers && card.drivers.length > 0 && (
        <div className="border-t border-slate-200 px-8 py-8">
          <h4 className="mb-6 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">Drivers</h4>

          {card.drivers[0].historical_trend && card.drivers[0].historical_trend.length > 0 && (
            <div className="content-auto mb-6 rounded-[28px] border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Historical context</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                  {card.drivers[0].feature_key.replace(/_/g, ' ')}
                </span>
              </div>
              <DeferredTrendChart data={card.drivers[0].historical_trend} />
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {card.drivers.map((driver) => (
              <div key={driver.feature_key} className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center gap-2">
                  {driver.direction === 'up' ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  ) : driver.direction === 'down' ? (
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                  ) : (
                    <Minus className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="text-sm font-semibold text-slate-950">{driver.feature_key.replace(/_/g, ' ')}</span>
                </div>
                <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  contribution {Math.round(driver.contribution * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {card.personal_output && (
        <div className="border-t border-slate-200 bg-[rgba(20,83,232,0.03)] px-8 py-8">
          <h4 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#1453e8]">
            <Activity className="w-4 h-4" /> What this means for you
          </h4>
          <p className="text-[15px] leading-8 text-slate-700">{card.personal_output}</p>
        </div>
      )}

      {card.world_sim?.enabled && (
        <div className="border-t border-slate-200 bg-[rgba(217,93,116,0.04)] px-8 py-8">
          <h4 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-[#d95d74]">
            <Sparkles className="w-4 h-4" /> {WORLD_SIM_BRAND.name}
          </h4>
          <p className="text-sm leading-7 text-slate-700">{card.world_sim.narrative_arc}</p>
        </div>
      )}

      <div className="mt-auto border-t border-slate-200">
        <div
          className="flex cursor-pointer items-center justify-between bg-[rgba(248,246,241,0.9)] p-6 transition-all hover:bg-[rgba(245,242,235,1)]"
          onClick={() => setShowEvidence(!showEvidence)}
        >
          <div className="no-scrollbar flex items-center gap-5 overflow-x-auto">
            <div className="flex items-center gap-2.5 rounded-full border border-[#1453e8]/20 bg-[#e9efff] px-4 py-1.5 text-[11px] font-bold whitespace-nowrap text-[#1453e8]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Trust: {confidencePercent}%</span>
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600">
              {card.trust_layer.data_sufficiency_flag === 'sufficient'
                ? 'Data sufficient'
                : card.trust_layer.data_sufficiency_flag === 'partial'
                  ? 'Partial data'
                  : 'Coverage gap'}
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatEvidenceTime(card.trust_layer.freshness.as_of_utc)}</span>
            </div>
          </div>
          <motion.div animate={{ rotate: showEvidence ? 90 : 0 }} className="rounded-xl border border-slate-200 bg-white p-1.5">
            <ChevronRight className="w-4 h-4 text-slate-500" />
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
              <div className="space-y-4 border-t border-slate-200 bg-[#faf8f4] p-8 text-[12px] font-semibold text-slate-600">
                <div className="flex items-center justify-between gap-4">
                  <span className="uppercase tracking-[0.2em] opacity-70">Last updated</span>
                  <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono text-slate-700">
                    {new Date(card.trust_layer.freshness.as_of_utc).toLocaleString('it-IT')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="uppercase tracking-[0.2em] opacity-70">Verification level</span>
                  <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 capitalize text-slate-700">
                    {card.trust_layer.provenance_summary.verification_level}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="uppercase tracking-[0.2em] opacity-70">Sources / licenses</span>
                  <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 uppercase text-slate-700">
                    {card.trust_layer.provenance_summary.license_summary.join(', ')}
                  </span>
                </div>
                {evidence && (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <span className="uppercase tracking-[0.2em] opacity-70">Cadence</span>
                      <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
                        {evidence.freshness_summary.cadence}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="uppercase tracking-[0.2em] opacity-70">Coverage notes</div>
                      {evidence.coverage_notes.length > 0 ? (
                        evidence.coverage_notes.map((item) => (
                          <div key={item} className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-[12px] leading-6 text-slate-700">
                            {item}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-[12px] leading-6 text-slate-700">
                          No additional coverage notes.
                        </div>
                      )}
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

  if (isSportsCard(card)) {
    return (
      <SportsCrystalCard
        card={card}
        showEvidence={showEvidence}
        setShowEvidence={setShowEvidence}
        isSaved={isSaved}
        isShared={isShared}
        handleSave={handleSave}
        handleShare={handleShare}
      />
    );
  }

  return (
    <BlueprintCrystalCard
      card={card}
      showEvidence={showEvidence}
      setShowEvidence={setShowEvidence}
      isSaved={isSaved}
      isShared={isShared}
      handleSave={handleSave}
      handleShare={handleShare}
      marketFrame={marketFrame}
      hasMarketSignal={hasMarketSignal}
      marketSignalState={marketSignalState}
      crystalProbability={crystalProbability}
      marketProbability={marketProbability}
    />
  );
}
