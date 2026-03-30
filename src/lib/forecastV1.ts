import type { CardData } from '../types/crystal';
import type {
  ForecastActionStackItem,
  ForecastConfidence,
  ForecastCoverageStackItem,
  ForecastDriversWatchStackItem,
  ForecastGeography,
  ForecastHorizon,
  ForecastResolvedContext,
  ForecastStackItem,
  ForecastUiFilters,
} from '../types/forecastV1';

export const FORECAST_EXAMPLES = [
  'Bitcoin next 30 days',
  'Will rents in Milan cool down by summer?',
  'Inter vs Juventus',
  'Best time to visit Tokyo in the next 90 days',
  'Should I wait before renting in Rome?',
];

export const GUEST_FORECAST_SESSION_KEY = 'crystal-v1-guest-forecast-used';

export const GEOGRAPHY_OPTIONS: Record<
  ForecastGeography,
  { label: string; level?: 'world' | 'country' | 'city'; location?: string }
> = {
  auto: { label: 'Auto' },
  global: { label: 'Global', level: 'world' },
  italy: { label: 'Italy', level: 'country', location: 'Italy' },
  rome: { label: 'Rome', level: 'city', location: 'Rome' },
  milan: { label: 'Milan', level: 'city', location: 'Milan' },
};

export const HORIZON_OPTIONS: Array<{
  value: ForecastHorizon;
  label: string;
  badge?: 'Plus' | 'Pro';
  feature?: 'search_horizon_90d' | 'search_horizon_6m' | 'search_horizon_12m';
}> = [
  { value: 'now', label: 'Now' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days', badge: 'Plus', feature: 'search_horizon_90d' },
  { value: '6m', label: '6 months', badge: 'Plus', feature: 'search_horizon_6m' },
  { value: '12m', label: '12 months', badge: 'Pro', feature: 'search_horizon_12m' },
];

export const CONFIDENCE_OPTIONS: Array<{
  value: ForecastConfidence;
  label: string;
  badge?: 'Pro';
  feature?: 'search_confidence_rigorous';
}> = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'High' },
  { value: 'rigorous', label: 'Rigorous', badge: 'Pro', feature: 'search_confidence_rigorous' },
];

export const DEFAULT_FORECAST_FILTERS: ForecastUiFilters = {
  entity: '',
  geography: 'auto',
  horizon: '30d',
  confidence: 'balanced',
};

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function deriveProbabilitySplit(card: CardData) {
  if (card.probability_split) return card.probability_split;
  if (card.binary_contract) {
    return {
      primary_label: safeText(card.binary_contract.question_side_a, 'Side A'),
      primary_probability: Number(card.binary_contract.question_side_a_probability || 0.5),
      secondary_label: safeText(card.binary_contract.question_side_b, 'Side B'),
      secondary_probability: Number(card.binary_contract.question_side_b_probability || 0.5),
    };
  }
  return null;
}

export function formatHorizonLabel(horizon: ForecastHorizon) {
  return HORIZON_OPTIONS.find((item) => item.value === horizon)?.label || horizon;
}

export function formatConfidenceLabel(confidence: ForecastConfidence) {
  return CONFIDENCE_OPTIONS.find((item) => item.value === confidence)?.label || confidence;
}

function formatFreshnessSummary(card: CardData) {
  const freshness = card.trust_layer?.freshness;
  if (!freshness) return 'Freshness unknown';

  const asOf = freshness.as_of_utc ? new Date(freshness.as_of_utc) : null;
  const ageLabel =
    asOf && !Number.isNaN(asOf.getTime())
      ? asOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'unknown date';

  if (freshness.staleness_bucket === 'fresh') return `Fresh as of ${ageLabel}`;
  if (freshness.staleness_bucket === 'stale') return `Stale as of ${ageLabel}`;
  return `Updated ${ageLabel}`;
}

function formatProvenanceSummary(card: CardData) {
  const provenance = card.trust_layer?.provenance_summary;
  if (!provenance) return 'Provenance not available';

  const licenses = Array.isArray(provenance.license_summary) ? provenance.license_summary.slice(0, 3) : [];
  if (licenses.length > 0) {
    return `${provenance.verification_level.replace(/_/g, ' ')} via ${licenses.join(', ')}`;
  }

  return provenance.verification_level.replace(/_/g, ' ');
}

function formatRunDateSummary(card: CardData) {
  const runAsOf = safeText(card.run_as_of_utc, safeText(card.temporal_context?.as_of_utc));
  if (!runAsOf) return '';
  const parsed = new Date(runAsOf);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTimeSummary(card: CardData) {
  const temporalContext = card.temporal_context;
  const phrase = safeText(card.relative_time_phrase, safeText(temporalContext?.relative_phrase));
  const resolvedLabel = safeText(card.resolved_time_window?.label, safeText(temporalContext?.resolved_time_window?.label));
  const usesRelative =
    temporalContext?.uses_relative_time === true || Boolean(phrase && resolvedLabel);
  if (!usesRelative || !phrase || !resolvedLabel) return '';
  return `Interpreted "${phrase}" as ${resolvedLabel}`;
}

function getPrimaryState(card: CardData) {
  if (card.card_state === 'blocked') return 'coverage_gap' as const;
  if (card.card_state === 'limited') return 'limited' as const;
  return 'published' as const;
}

export function resolveForecastContext(query: string, queryPlan: any, filters: ForecastUiFilters, card?: CardData): ForecastResolvedContext {
  const firstEntity = Array.isArray(queryPlan?.entities) ? queryPlan.entities[0] : null;
  return {
    query,
    domainId: safeText(card?.domain, safeText(queryPlan?.domain_id, 'A.0.general.general_forecast')),
    entity: safeText(filters.entity, safeText(firstEntity?.label, 'Auto')),
    geography: GEOGRAPHY_OPTIONS[filters.geography].label,
    horizon: formatHorizonLabel(filters.horizon),
    entityType: safeText(firstEntity?.entity_type, undefined),
    versionId: safeText(card?.version_id, undefined),
    queryPlan,
    filters,
  };
}

export function patchQueryPlanWithFilters(queryPlan: any, filters: ForecastUiFilters) {
  const nextPlan = {
    ...(queryPlan || {}),
    filters: { ...((queryPlan && queryPlan.filters) || {}) },
    constraints: { ...((queryPlan && queryPlan.constraints) || {}) },
    entities: [...(((queryPlan && queryPlan.entities) || []) as any[])],
    horizons: [...(((queryPlan && queryPlan.horizons) || []) as any[])],
  };

  const normalizedHorizon = filters.horizon === 'now' ? '7d' : filters.horizon;
  if (nextPlan.horizons.length > 0) {
    nextPlan.horizons[0] = {
      ...nextPlan.horizons[0],
      horizon_id: normalizedHorizon,
    };
  } else {
    nextPlan.horizons = [{ horizon_id: normalizedHorizon }];
  }

  const geographyMeta = GEOGRAPHY_OPTIONS[filters.geography];
  nextPlan.filters = {
    ...nextPlan.filters,
    geography: filters.geography,
    geography_label: geographyMeta.label,
    confidence_preference: filters.confidence,
  };
  nextPlan.constraints = {
    ...nextPlan.constraints,
    confidence_preference: filters.confidence,
  };

  if (filters.entity.trim()) {
    const existing = nextPlan.entities.some(
      (entity: any) => safeText(entity?.label).toLowerCase() === filters.entity.trim().toLowerCase()
    );
    if (!existing) {
      nextPlan.entities.unshift({
        entity_id: filters.entity.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        entity_type: 'entity',
        label: filters.entity.trim(),
      });
    }
  }

  if (geographyMeta.level) {
    nextPlan.filters.geography_level = geographyMeta.level;
  }

  if (geographyMeta.location) {
    nextPlan.filters.location = geographyMeta.location;
    const entityType = geographyMeta.level === 'country' ? 'country' : 'city';
    const exists = nextPlan.entities.some(
      (entity: any) =>
        safeText(entity?.label).toLowerCase() === geographyMeta.location?.toLowerCase() &&
        safeText(entity?.entity_type) === entityType
    );

    if (!exists) {
      nextPlan.entities.push({
        entity_id: geographyMeta.location.toLowerCase(),
        entity_type: entityType,
        label: geographyMeta.location,
      });
    }
  }

  return nextPlan;
}

function buildActionItem(card: CardData, context: ForecastResolvedContext): ForecastActionStackItem | null {
  const supportingActions = Array.isArray(card.so_what)
    ? card.so_what
        .map((option) => ({
          id: option.option_id,
          label: safeText(option.label, 'Action'),
          note: safeText(option.tradeoff_note),
        }))
        .filter((option) => option.label && option.note)
        .slice(0, 3)
    : [];

  const recommendedAction =
    safeText(card.personal_output) ||
    safeText(card.so_what?.[0]?.tradeoff_note) ||
    `Keep ${context.entity} under review while signal quality improves.`;

  if (!recommendedAction && supportingActions.length === 0) {
    return null;
  }

  return {
    id: `${card.card_id}-action`,
    kind: 'action',
    state: getPrimaryState(card),
    domainId: context.domainId,
    entity: context.entity,
    geography: context.geography,
    horizon: context.horizon,
    versionId: context.versionId,
    title: 'What to do',
    recommendedAction,
    supportingActions,
  };
}

function buildCoverageCompanion(card: CardData, context: ForecastResolvedContext): ForecastCoverageStackItem | null {
  const state = getPrimaryState(card);
  const evidenceNotes = Array.isArray(card.evidence_drawer?.coverage_notes) ? card.evidence_drawer.coverage_notes : [];
  const refinementHints = Array.isArray(card.how_to_raise_confidence) ? card.how_to_raise_confidence.slice(0, 3) : [];
  const alternateSuggestions = uniqueList([
    context.entity !== 'Auto' ? `Try the same question with a shorter horizon for ${context.entity}.` : '',
    context.geography !== 'Auto' ? `Switch geography from ${context.geography} to Auto if you want broader signal coverage.` : '',
    context.horizon !== '30 days' ? 'Try the 30-day horizon for a stronger public coverage envelope.' : '',
  ]).slice(0, 3);

  if (state === 'published' && evidenceNotes.length === 0 && refinementHints.length === 0) {
    return null;
  }

  const explanation =
    state === 'coverage_gap'
      ? 'Crystal understood the question but will not publish a full-confidence forecast while coverage is still too thin.'
      : state === 'limited'
        ? 'Crystal can publish a directional read here, but coverage or freshness is still partial.'
        : 'Crystal published the main read, but a few trust limits are still worth watching.';

  return {
    id: `${card.card_id}-coverage`,
    kind: 'coverage',
    state,
    domainId: context.domainId,
    entity: context.entity,
    geography: context.geography,
    horizon: context.horizon,
    versionId: context.versionId,
    title: state === 'coverage_gap' ? 'Coverage gap' : 'Coverage notes',
    primaryOutcome: safeText(card.verdict, card.summary),
    explanation,
    missingSignals: evidenceNotes.slice(0, 3),
    refinementHints,
    alternateSuggestions,
    trustLayer: card.trust_layer,
    evidenceDrawer: card.evidence_drawer,
    card,
  };
}

export function buildForecastStack(card: CardData, context: ForecastResolvedContext): ForecastStackItem[] {
  const state = getPrimaryState(card);
  if (state === 'coverage_gap') {
    return [
      {
        id: `${card.card_id}-coverage`,
        kind: 'coverage',
        state,
        domainId: context.domainId,
        entity: context.entity,
        geography: context.geography,
        horizon: context.horizon,
        versionId: context.versionId,
        title: 'Coverage gap',
        primaryOutcome: safeText(card.verdict, safeText(card.summary, 'Crystal is holding this forecast.')),
        explanation:
          'Crystal understands the question, but current signal quality is not yet strong enough to publish a reliable prediction card.',
        missingSignals: Array.isArray(card.evidence_drawer?.coverage_notes) ? card.evidence_drawer.coverage_notes.slice(0, 3) : [],
        refinementHints: Array.isArray(card.how_to_raise_confidence) ? card.how_to_raise_confidence.slice(0, 3) : [],
        alternateSuggestions: uniqueList([
          'Try a shorter horizon if the current question is too far out.',
          context.entity !== 'Auto' ? `Try a broader version of the same question around ${context.entity}.` : '',
          context.geography !== 'Auto' ? `Switch geography from ${context.geography} to Auto for wider coverage.` : '',
        ]).slice(0, 3),
        trustLayer: card.trust_layer,
        evidenceDrawer: card.evidence_drawer,
        card,
      },
    ];
  }

  const stack: ForecastStackItem[] = [
    {
      id: `${card.card_id}-primary`,
      kind: 'primary',
      state,
      domainId: context.domainId,
      entity: context.entity,
      geography: context.geography,
      horizon: context.horizon,
      versionId: context.versionId,
      title: safeText(card.title, 'Crystal forecast'),
      primaryOutcome: safeText(card.verdict, safeText(card.primary_call, safeText(card.summary, 'Crystal is still evaluating this question.'))),
      summary: safeText(card.summary, 'No summary available yet.'),
      primaryCall: safeText(card.binary_contract?.display_call, safeText(card.primary_call, undefined)),
      binaryContract: card.binary_contract || null,
      probabilitySplit: deriveProbabilitySplit(card),
      whyThisSide: safeText(card.why_this_side, undefined),
      recommendedAction:
        safeText(card.personal_output) ||
        safeText(card.so_what?.[0]?.tradeoff_note) ||
        `Watch ${context.entity} closely before making a bigger decision.`,
      topDrivers: uniqueList((card.drivers || []).slice(0, 4).map((driver) => safeText(driver.feature_key).replace(/_/g, ' '))),
      counterSignals: uniqueList((card.counter_signals || []).slice(0, 4)),
      historicalAnchors: uniqueList((card.historical_anchors || []).slice(0, 4)),
      invalidators: uniqueList((card.invalidators || []).slice(0, 4)),
      whatToWatch: uniqueList((card.what_to_watch || []).slice(0, 4)),
      publicationBasis: card.publication_basis || null,
      trustLayer: card.trust_layer,
      evidenceDrawer: card.evidence_drawer,
      card,
    },
  ];

  if (Array.isArray(card.scenario_set) && card.scenario_set.length > 0) {
    stack.push({
      id: `${card.card_id}-scenario`,
      kind: 'scenario',
      state,
      domainId: context.domainId,
      entity: context.entity,
      geography: context.geography,
      horizon: context.horizon,
      versionId: context.versionId,
      title: 'Scenarios',
      scenarios: card.scenario_set.slice(0, 4),
    });
  }

  if (((card.drivers || []).length > 0) || ((card.what_to_watch || []).length > 0)) {
    const driversWatchItem: ForecastDriversWatchStackItem = {
      id: `${card.card_id}-drivers`,
      kind: 'drivers_watch',
      state,
      domainId: context.domainId,
      entity: context.entity,
      geography: context.geography,
      horizon: context.horizon,
      versionId: context.versionId,
      title: 'Drivers and what to watch',
      drivers: (card.drivers || []).slice(0, 4),
      whatToWatch: (card.what_to_watch || []).slice(0, 4),
    };
    stack.push(driversWatchItem);
  }

  const actionItem = buildActionItem(card, context);
  if (actionItem) {
    stack.push(actionItem);
  }

  const coverageCompanion = buildCoverageCompanion(card, context);
  if (coverageCompanion) {
    stack.push(coverageCompanion);
  }

  return stack.slice(0, 5);
}

export function normalizeForecastFailure(
  error: unknown,
  context: ForecastResolvedContext,
  reason: 'runtime' | 'guest_limit' = 'runtime'
): ForecastCoverageStackItem[] {
  const message = error instanceof Error ? error.message : 'Crystal could not complete the request.';

  if (reason === 'guest_limit') {
    return [
      {
        id: `guest-limit-${Date.now()}`,
        kind: 'coverage',
        state: 'coverage_gap',
        domainId: context.domainId,
        entity: context.entity,
        geography: context.geography,
        horizon: context.horizon,
        versionId: context.versionId,
        title: 'Guest forecast used',
        primaryOutcome: 'Crystal can publish one real guest forecast before sign-in.',
        explanation:
          'Your first public forecast worked. To keep forecasting, save cards, follow entities, and revisit versions, sign in and continue from the same surface.',
        missingSignals: [],
        refinementHints: ['Sign in to unlock the next forecast without losing the current query.'],
        alternateSuggestions: ['Keep the same query and continue after sign-in.'],
      },
    ];
  }

  return [
    {
      id: `forecast-error-${Date.now()}`,
      kind: 'coverage',
      state: 'coverage_gap',
      domainId: context.domainId,
      entity: context.entity,
      geography: context.geography,
      horizon: context.horizon,
      versionId: context.versionId,
      title: 'Coverage gap',
      primaryOutcome: 'Crystal could not publish a reliable card for this request.',
      explanation:
        'Instead of returning a broken state, Crystal is holding the output until the signal is clear enough to publish responsibly.',
      missingSignals: [message].filter(Boolean),
      refinementHints: [
        'Try a shorter horizon if the question is too far out.',
        'Make the entity more explicit if the subject is ambiguous.',
        'Switch geography to Auto if local coverage is still thin.',
      ],
      alternateSuggestions: [
        'Try the same question with a 30-day horizon.',
        'Narrow the subject to one entity or one geography.',
      ],
    },
  ];
}

export function getForecastMetaCopy(card: CardData) {
  return {
    freshnessSummary: formatFreshnessSummary(card),
    provenanceSummary: formatProvenanceSummary(card),
    runDateSummary: formatRunDateSummary(card),
    relativeTimeSummary: formatRelativeTimeSummary(card),
  };
}
