import type {
  BillingInterval,
  CrystalFeature,
  EntitlementSnapshot,
  MeteredAction,
  MeteredActionSpec,
  PlanId,
  PlanStatus,
} from '../types/entitlements';
import type { MatrixInterventionCategory } from '../types/worldSim';

type BillingOffer = {
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyEquivalentMonthly: number;
  creditsPerCycle: number;
  watchlistLimit: number;
  headline: string;
  features: string[];
};

export type WorldSimPlanTier = {
  agentCount: number;
  monthlyRunsLabel: string;
  queueLabel: string;
  depthLabel: string;
  matrixBranchLimit: number;
  matrixCategories: MatrixInterventionCategory[];
  matrixLabel: string;
};

export const DEFAULT_FREE_PROFILE_MESSAGES = 10;
export const DEFAULT_PLAN: PlanId = 'free';

export const PLAN_OFFERS: Record<PlanId, BillingOffer> = {
  free: {
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyEquivalentMonthly: 0,
    creditsPerCycle: 15,
    watchlistLimit: 5,
    headline: 'The easiest way to try Forecast and WorldSim with a real but lightweight usage budget.',
    features: ['15 credits / month', 'Up to 5 watchlist entities', 'WorldSim Lite included'],
  },
  plus: {
    monthlyPrice: 12,
    yearlyPrice: 99,
    yearlyEquivalentMonthly: 8.25,
    creditsPerCycle: 120,
    watchlistLimit: 25,
    headline: 'The everyday plan if you want to use Crystal weekly with a steadier WorldSim layer.',
    features: ['120 credits / month', 'Up to 25 watchlist entities', 'Forecast up to 6 months', 'WorldSim Plus included'],
  },
  pro: {
    monthlyPrice: 29,
    yearlyPrice: 249,
    yearlyEquivalentMonthly: 20.75,
    creditsPerCycle: 400,
    watchlistLimit: 100,
    headline: 'For deeper forecasts, longer horizons, and the highest simulation resolution.',
    features: ['400 credits / month', 'Up to 100 watchlist entities', '12 months + Rigorous mode', 'WorldSim Deep included'],
  },
};

export const WORLD_SIM_PLAN_TIERS: Record<PlanId, WorldSimPlanTier> = {
  free: {
    agentCount: 120,
    monthlyRunsLabel: 'Light trials and a few personal runs',
    queueLabel: 'Shared queue',
    depthLabel: 'Lite simulation',
    matrixBranchLimit: 2,
    matrixCategories: ['marketing_attention', 'media_narrative', 'pricing_product'],
    matrixLabel: 'Matrix Simulation Lite',
  },
  plus: {
    agentCount: 400,
    monthlyRunsLabel: 'Steady use across Forecast and Nextletter',
    queueLabel: 'Standard priority queue',
    depthLabel: 'Expanded simulation',
    matrixBranchLimit: 5,
    matrixCategories: [
      'marketing_attention',
      'media_narrative',
      'policy_regulation',
      'pricing_product',
      'social_shock',
    ],
    matrixLabel: 'Matrix Simulation Plus',
  },
  pro: {
    agentCount: 1000,
    monthlyRunsLabel: 'Heavy use and the full chamber',
    queueLabel: 'High-priority queue',
    depthLabel: 'Deep simulation',
    matrixBranchLimit: 12,
    matrixCategories: [
      'marketing_attention',
      'media_narrative',
      'policy_regulation',
      'pricing_product',
      'social_shock',
      'conflict_systemic_shock',
      'health_disruption_shock',
    ],
    matrixLabel: 'Matrix Simulation Deep',
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'plus', 'pro'];

export const ACTION_CATALOG: Record<MeteredAction, MeteredActionSpec> = {
  search_standard: { action: 'search_standard', cost: 1, requiredPlan: 'free', label: 'Forecast', accent: 'sky' },
  search_extended: { action: 'search_extended', cost: 2, requiredPlan: 'plus', label: 'Forecast', accent: 'amber' },
  search_oracle: { action: 'search_oracle', cost: 5, requiredPlan: 'pro', label: 'WorldSim', accent: 'rose' },
  dashboard_add_card_standard: {
    action: 'dashboard_add_card_standard',
    cost: 1,
    requiredPlan: 'free',
    label: 'Create forecast',
    accent: 'sky',
  },
  dashboard_add_card_extended: {
    action: 'dashboard_add_card_extended',
    cost: 2,
    requiredPlan: 'plus',
    label: 'Create forecast',
    accent: 'amber',
  },
  dashboard_add_card_oracle: {
    action: 'dashboard_add_card_oracle',
    cost: 5,
    requiredPlan: 'pro',
    label: 'WorldSim',
    accent: 'rose',
  },
  nextletter_personal: {
    action: 'nextletter_personal',
    cost: 3,
    requiredPlan: 'free',
    label: 'Generate',
    accent: 'amber',
  },
  profile_ai_message: {
    action: 'profile_ai_message',
    cost: 1,
    requiredPlan: 'free',
    label: 'Send',
    accent: 'sky',
  },
};

const FEATURE_REQUIREMENTS: Record<CrystalFeature, PlanId> = {
  search_horizon_90d: 'plus',
  search_horizon_6m: 'plus',
  search_horizon_12m: 'pro',
  search_confidence_rigorous: 'pro',
  oracle_mode: 'pro',
  nextletter_personal: 'free',
  watchlist_plus: 'plus',
  watchlist_pro: 'pro',
};

export function getNextCreditResetDate(from = new Date()) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function toIsoString(value: unknown, fallback: string) {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return fallback;
}

function toOptionalIsoString(value: unknown) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return null;
}

function toNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toPlan(value: unknown): PlanId {
  return typeof value === 'string' && PLAN_ORDER.includes(value as PlanId) ? (value as PlanId) : DEFAULT_PLAN;
}

function toPlanStatus(value: unknown): PlanStatus {
  return value === 'past_due' || value === 'canceled' ? value : 'active';
}

export function createDefaultEntitlementFields(plan: PlanId = DEFAULT_PLAN, now = new Date()) {
  const offer = PLAN_OFFERS[plan];
  return {
    plan,
    planStatus: 'active' as PlanStatus,
    creditsBalance: offer.creditsPerCycle,
    creditsCycleAmount: offer.creditsPerCycle,
    creditsResetAt: getNextCreditResetDate(now),
    profileAiFreeMessagesRemaining: DEFAULT_FREE_PROFILE_MESSAGES,
    watchlistLimit: offer.watchlistLimit,
    planExpiresAt: null,
  };
}

export function normalizeEntitlements(raw?: Record<string, unknown> | null): EntitlementSnapshot {
  const plan = toPlan(raw?.plan);
  const defaults = createDefaultEntitlementFields(plan);

  return {
    plan,
    planStatus: toPlanStatus(raw?.planStatus),
    creditsBalance: toNumber(raw?.creditsBalance, defaults.creditsBalance),
    creditsCycleAmount: toNumber(raw?.creditsCycleAmount, PLAN_OFFERS[plan].creditsPerCycle),
    creditsResetAt: toIsoString(raw?.creditsResetAt, defaults.creditsResetAt.toISOString()),
    profileAiFreeMessagesRemaining: toNumber(
      raw?.profileAiFreeMessagesRemaining,
      DEFAULT_FREE_PROFILE_MESSAGES
    ),
    watchlistLimit: toNumber(raw?.watchlistLimit, PLAN_OFFERS[plan].watchlistLimit),
    planExpiresAt: toOptionalIsoString(raw?.planExpiresAt),
  };
}

export function isPlanAtLeast(plan: PlanId, requiredPlan: PlanId) {
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(requiredPlan);
}

export function canUseFeature(plan: PlanId, feature: CrystalFeature) {
  return isPlanAtLeast(plan, FEATURE_REQUIREMENTS[feature]);
}

export function getPlanLabel(plan: PlanId) {
  if (plan === 'plus') return 'Plus';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

export function getWorldSimPlanTier(plan: PlanId) {
  return WORLD_SIM_PLAN_TIERS[plan];
}

export function formatPrice(plan: PlanId, interval: BillingInterval) {
  const offer = PLAN_OFFERS[plan];
  return interval === 'year' ? `EUR ${offer.yearlyPrice}/year` : `EUR ${offer.monthlyPrice}/month`;
}

export function getPlanPrice(plan: Exclude<PlanId, 'free'>, interval: BillingInterval) {
  const offer = PLAN_OFFERS[plan];
  return interval === 'year' ? offer.yearlyPrice : offer.monthlyPrice;
}

export function formatCredits(cost: number) {
  return `${cost} ${cost === 1 ? 'credit' : 'credits'}`;
}

export function getPredictActionSpec(
  sourceView: 'search' | 'dashboard',
  filters?: { horizon?: string; confidence?: string }
): MeteredActionSpec {
  const horizon = filters?.horizon || '30d';
  const confidence = filters?.confidence || 'balanced';

  if (horizon === '12m' || confidence === 'rigorous') {
    return sourceView === 'search' ? ACTION_CATALOG.search_oracle : ACTION_CATALOG.dashboard_add_card_oracle;
  }
  if (horizon === '90d' || horizon === '6m') {
    return sourceView === 'search' ? ACTION_CATALOG.search_extended : ACTION_CATALOG.dashboard_add_card_extended;
  }
  return sourceView === 'search' ? ACTION_CATALOG.search_standard : ACTION_CATALOG.dashboard_add_card_standard;
}

export function getRecommendedPlanForAction(action: MeteredAction) {
  return ACTION_CATALOG[action].requiredPlan === 'free' ? 'plus' : ACTION_CATALOG[action].requiredPlan;
}
