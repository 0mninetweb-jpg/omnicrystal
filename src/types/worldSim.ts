import type { WorldSimDigest } from './crystal';
import type { PlanId } from './entitlements';

export type WorldSimSceneMode = 'preview' | 'live';
export type WorldSimViewMode = 'observe' | 'intervene';

export type WorldSimNodeTone = 'signal' | 'pressure' | 'stability';
export type MatrixInterventionCategory =
  | 'marketing_attention'
  | 'media_narrative'
  | 'policy_regulation'
  | 'pricing_product'
  | 'social_shock'
  | 'conflict_systemic_shock'
  | 'health_disruption_shock';

export interface WorldSimSceneNode {
  id: string;
  label: string;
  orbit: 'inner' | 'mid' | 'outer';
  angle: number;
  distance: number;
  tone: WorldSimNodeTone;
  status: string;
  size: 'sm' | 'md' | 'lg';
}

export interface WorldSimSceneLink {
  id: string;
  from: string;
  to: string;
  strength: 'low' | 'medium' | 'high';
}

export interface WorldSimScenePrompt {
  id: string;
  label: string;
  question: string;
  response: string;
}

export interface WorldSimSceneScenario {
  label: string;
  probability: number;
}

export interface WorldSimSceneStat {
  label: string;
  value: string;
  accent: 'blue' | 'rose' | 'emerald' | 'amber';
}

export interface MatrixInterventionPayload {
  cardId: string;
  category: MatrixInterventionCategory;
  label: string;
  intent: string;
  intensity: number;
  geography: string;
  duration: string;
  targetAudience: string;
  timing: string;
  safetyNote: string;
}

export interface MatrixInterventionCard {
  id: string;
  category: MatrixInterventionCategory;
  label: string;
  description: string;
  guidance: string;
  iconLabel: string;
  allowedPlans: PlanId[];
  defaultPayload: MatrixInterventionPayload;
}

export interface WorldSimSceneMarketFrame {
  outcome?: string;
  horizon?: string;
  resolutionCriteria?: string;
  referenceMarket?: string | null;
  priorProbability?: number | null;
  marketId?: string | null;
  marketSlug?: string | null;
  marketQuestion?: string;
  marketUrl?: string | null;
  impliedProbability?: number | null;
  matchConfidence?: number | null;
  marketQuality?: number | null;
  openInterest?: number | null;
  volume24h?: number | null;
  liquidity?: number | null;
  priceUpdatedAt?: string | null;
  divergenceVsCrystal?: number | null;
  calibrationApplied?: boolean;
  calibrationNote?: string;
  crystalProbability?: number | null;
  calibratedProbability?: number | null;
  priceChange7d?: number | null;
}

export interface MatrixWorldStateSnapshot {
  title: string;
  subtitle: string;
  narrativeArc: string;
  actors: string[];
  scenarios: WorldSimSceneScenario[];
  notes: string[];
  digest?: Partial<WorldSimDigest> | null;
}

export interface WorldStateDeltaMetric {
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  unit: 'probability' | 'stress' | 'attention' | 'sentiment' | 'response' | 'custom';
}

export interface WorldStateDelta {
  headline: string;
  summary: string;
  deltaProbability: number;
  socialResponse: string;
  narrativeShift: string;
  systemStress: string;
  dominantReactions: string[];
  secondOrderEffects: string[];
  riskOfBackfire: string;
  interventionEffectiveness: string;
  amplificationFactors: string[];
  dampeningFactors: string[];
  metrics: WorldStateDeltaMetric[];
}

export interface MatrixSimulationResult {
  branchId: string;
  baselineDigest: Partial<WorldSimDigest> | null;
  interventionDigest: Partial<WorldSimDigest> | null;
  deltaDigest: WorldStateDelta;
  dominantReactions: string[];
  narrativeShift: string;
  secondOrderEffects: string[];
  riskOfBackfire: string;
  interventionEffectiveness: string;
  branchLabel: string;
  sourceMode: 'preview' | 'live';
}

export interface SimulationBranch {
  id: string;
  parentId?: string | null;
  label: string;
  createdAt: string;
  status: 'draft' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  payload: MatrixInterventionPayload;
  jobId?: string | null;
  result?: MatrixSimulationResult | null;
}

export interface WorldSimSceneData {
  id: string;
  mode: WorldSimSceneMode;
  viewMode: WorldSimViewMode;
  kicker: string;
  title: string;
  subtitle: string;
  question: string;
  sourceLabel: string;
  truthNote: string;
  narrativeArc: string;
  actors: string[];
  interventionPoints: string[];
  tensions: string[];
  communityNotes: string[];
  scenarios: WorldSimSceneScenario[];
  prompts: WorldSimScenePrompt[];
  nodes: WorldSimSceneNode[];
  links: WorldSimSceneLink[];
  stats: WorldSimSceneStat[];
  availableInterventions: MatrixInterventionCard[];
  baseline?: MatrixWorldStateSnapshot | null;
  branch?: SimulationBranch | null;
  delta?: WorldStateDelta | null;
  branchLimit?: number;
  marketFrame?: WorldSimSceneMarketFrame | null;
  jobStatus?: string | null;
  jobProgress?: number;
  jobMessage?: string;
  agentCount?: number;
}
