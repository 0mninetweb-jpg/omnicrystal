import type { CardData, Driver, EvidenceDrawer, PublicationBasis, ProbabilitySplit, Scenario, TrustLayer } from './crystal';

export type ForecastGeography = 'auto' | 'global' | 'italy' | 'rome' | 'milan';
export type ForecastHorizon = 'now' | '7d' | '30d' | '90d' | '6m' | '12m';
export type ForecastConfidence = 'balanced' | 'high' | 'rigorous';

export interface ForecastUiFilters {
  entity: string;
  geography: ForecastGeography;
  horizon: ForecastHorizon;
  confidence: ForecastConfidence;
}

export type ForecastCardState = 'published' | 'limited' | 'coverage_gap';

export interface ForecastResolvedContext {
  query: string;
  domainId: string;
  entity: string;
  geography: string;
  horizon: string;
  entityType?: string;
  versionId?: string;
  queryPlan?: any;
  filters: ForecastUiFilters;
}

export interface ForecastBaseStackItem {
  id: string;
  kind: 'primary' | 'scenario' | 'drivers_watch' | 'action' | 'coverage';
  state: ForecastCardState;
  domainId: string;
  entity: string;
  geography: string;
  horizon: string;
  versionId?: string;
}

export interface ForecastPrimaryStackItem extends ForecastBaseStackItem {
  kind: 'primary';
  title: string;
  primaryOutcome: string;
  summary: string;
  primaryCall?: string;
  probabilitySplit?: ProbabilitySplit | null;
  whyThisSide?: string;
  recommendedAction: string;
  topDrivers: string[];
  counterSignals: string[];
  historicalAnchors: string[];
  invalidators: string[];
  whatToWatch: string[];
  publicationBasis?: PublicationBasis | null;
  trustLayer: TrustLayer;
  evidenceDrawer?: EvidenceDrawer;
  card: CardData;
}

export interface ForecastScenarioStackItem extends ForecastBaseStackItem {
  kind: 'scenario';
  title: string;
  scenarios: Scenario[];
}

export interface ForecastDriversWatchStackItem extends ForecastBaseStackItem {
  kind: 'drivers_watch';
  title: string;
  drivers: Driver[];
  whatToWatch: string[];
}

export interface ForecastActionStackItem extends ForecastBaseStackItem {
  kind: 'action';
  title: string;
  recommendedAction: string;
  supportingActions: Array<{
    id: string;
    label: string;
    note: string;
  }>;
}

export interface ForecastCoverageStackItem extends ForecastBaseStackItem {
  kind: 'coverage';
  title: string;
  primaryOutcome: string;
  explanation: string;
  missingSignals: string[];
  refinementHints: string[];
  alternateSuggestions: string[];
  trustLayer?: TrustLayer;
  evidenceDrawer?: EvidenceDrawer;
}

export type ForecastStackItem =
  | ForecastPrimaryStackItem
  | ForecastScenarioStackItem
  | ForecastDriversWatchStackItem
  | ForecastActionStackItem
  | ForecastCoverageStackItem;
