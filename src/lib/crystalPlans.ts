import type {
  BillingInterval,
  CrystalFeature,
  EntitlementSnapshot,
  MeteredAction,
  MeteredActionSpec,
  PlanId,
  PlanStatus,
} from '../types/entitlements';

type BillingOffer = {
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyEquivalentMonthly: number;
  creditsPerCycle: number;
  watchlistLimit: number;
  headline: string;
  features: string[];
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
    headline: 'Il modo piu semplice per provare il prodotto con crediti mensili inclusi.',
    features: ['15 crediti / mese', '5 entita in watchlist', 'Tutte le aree dell app in preview completa'],
  },
  plus: {
    monthlyPrice: 12,
    yearlyPrice: 99,
    yearlyEquivalentMonthly: 8.25,
    creditsPerCycle: 120,
    watchlistLimit: 25,
    headline: 'Il piano giusto se vuoi usare Crystal ogni settimana.',
    features: ['120 crediti / mese', '25 entita in watchlist', 'Forecast fino a 6 mesi'],
  },
  pro: {
    monthlyPrice: 29,
    yearlyPrice: 249,
    yearlyEquivalentMonthly: 20.75,
    creditsPerCycle: 400,
    watchlistLimit: 100,
    headline: 'Per forecast piu profondi, orizzonti lunghi e layer premium.',
    features: ['400 crediti / mese', '100 entita in watchlist', '12 mesi + Massimo Rigore'],
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
    label: 'Crea forecast',
    accent: 'sky',
  },
  dashboard_add_card_extended: {
    action: 'dashboard_add_card_extended',
    cost: 2,
    requiredPlan: 'plus',
    label: 'Crea forecast',
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
    label: 'Genera',
    accent: 'amber',
  },
  profile_ai_message: {
    action: 'profile_ai_message',
    cost: 1,
    requiredPlan: 'free',
    label: 'Invia',
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

export function formatPrice(plan: PlanId, interval: BillingInterval) {
  const offer = PLAN_OFFERS[plan];
  return interval === 'year' ? `EUR ${offer.yearlyPrice}/anno` : `EUR ${offer.monthlyPrice}/mese`;
}

export function getPlanPrice(plan: Exclude<PlanId, 'free'>, interval: BillingInterval) {
  const offer = PLAN_OFFERS[plan];
  return interval === 'year' ? offer.yearlyPrice : offer.monthlyPrice;
}

export function formatCredits(cost: number) {
  return `${cost} ${cost === 1 ? 'credito' : 'crediti'}`;
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
