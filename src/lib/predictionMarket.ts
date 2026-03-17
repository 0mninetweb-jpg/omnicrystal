import type { PredictionMarketFrame } from '../types/crystal';
import type { WorldSimSceneMarketFrame } from '../types/worldSim';

type AnyPredictionMarketFrame = PredictionMarketFrame | WorldSimSceneMarketFrame | null | undefined;

function clamp01(value: number | null | undefined, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  if (next > 1) return Math.max(0, Math.min(1, next / 100));
  return Math.max(0, Math.min(1, next));
}

export function hasPredictionMarketFrame(frame?: AnyPredictionMarketFrame) {
  return Boolean(
    frame &&
      (
        ('market_question' in frame && frame.market_question) ||
        ('marketQuestion' in frame && frame.marketQuestion) ||
        ('reference_market' in frame && frame.reference_market) ||
        ('referenceMarket' in frame && frame.referenceMarket) ||
        ('implied_probability' in frame && frame.implied_probability != null) ||
        ('impliedProbability' in frame && frame.impliedProbability != null) ||
        ('prior_probability' in frame && frame.prior_probability != null) ||
        ('priorProbability' in frame && frame.priorProbability != null)
      )
  );
}

export function formatProbabilityLabel(value: number | null | undefined) {
  const next = clamp01(value, NaN);
  if (!Number.isFinite(next)) return 'n/a';
  return `${Math.round(next * 100)}%`;
}

export function formatSignedDelta(value: number | null | undefined) {
  const next = Number(value);
  if (!Number.isFinite(next)) return '0 pts';
  const pts = Math.round(next * 100);
  if (pts === 0) return '0 pts';
  return `${pts > 0 ? '+' : ''}${pts} pts`;
}

export function formatCompactNumber(value: number | null | undefined) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 'n/a';
  if (next >= 1_000_000) return `${(next / 1_000_000).toFixed(1)}M`;
  if (next >= 1_000) return `${(next / 1_000).toFixed(1)}k`;
  return `${Math.round(next)}`;
}

export function getMarketSignalState(frame?: AnyPredictionMarketFrame) {
  if (!frame) return 'none';
  const calibrationApplied =
    ('calibration_applied' in frame && frame.calibration_applied) ||
    ('calibrationApplied' in frame && frame.calibrationApplied);
  if (calibrationApplied) return 'calibrated';
  const divergence =
    ('divergence_vs_crystal' in frame && Number(frame.divergence_vs_crystal)) ||
    ('divergenceVsCrystal' in frame && Number(frame.divergenceVsCrystal)) ||
    0;
  const absoluteDivergence = Math.abs(divergence);
  if (absoluteDivergence >= 0.12) return 'diverge';
  if (absoluteDivergence >= 0.05) return 'watch';
  return 'agree';
}

export function getMarketSignalLabel(frame?: AnyPredictionMarketFrame) {
  const state = getMarketSignalState(frame);
  if (state === 'calibrated') return 'Calibrated with market';
  if (state === 'diverge') return 'Market diverges';
  if (state === 'watch') return 'Market under watch';
  if (state === 'agree') return 'Market agrees';
  return 'No market signal';
}
