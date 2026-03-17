export type PlanId = 'free' | 'plus' | 'pro';

export type PlanStatus = 'active' | 'past_due' | 'canceled';

export type BillingInterval = 'month' | 'year';

export type MeteredAction =
  | 'search_standard'
  | 'search_extended'
  | 'search_oracle'
  | 'dashboard_add_card_standard'
  | 'dashboard_add_card_extended'
  | 'dashboard_add_card_oracle'
  | 'nextletter_personal'
  | 'profile_ai_message';

export type CrystalFeature =
  | 'search_horizon_90d'
  | 'search_horizon_6m'
  | 'search_horizon_12m'
  | 'search_confidence_rigorous'
  | 'oracle_mode'
  | 'nextletter_personal'
  | 'watchlist_plus'
  | 'watchlist_pro';

export interface EntitlementSnapshot {
  plan: PlanId;
  planStatus: PlanStatus;
  creditsBalance: number;
  creditsCycleAmount: number;
  creditsResetAt: string;
  profileAiFreeMessagesRemaining: number;
  watchlistLimit: number;
  planExpiresAt?: string | null;
}

export interface MeteredActionSpec {
  action: MeteredAction;
  cost: number;
  requiredPlan: PlanId;
  label: string;
  accent: 'sky' | 'amber' | 'rose';
}

export interface UpgradeIntent {
  reason: 'login' | 'credits' | 'feature';
  title: string;
  description: string;
  recommendedPlan?: Exclude<PlanId, 'free'>;
  action?: MeteredAction;
  sourceView?: string;
}
