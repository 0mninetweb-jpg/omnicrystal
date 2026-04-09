import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSportsDecisionFrame } = require('../functions/crystalCore/sportsDecision.js');
const { normalizeApiFootballMarket } = require('../functions/crystalCore/sportsMarket.js');
const { __testables: sportsDataTestables } = require('../functions/sportsData.js');
const { __testables: runtimeTestables } = require('../functions/crystalCore/runtime.js');
const { __testables: indexTestables } = require('../functions/index.js');

const sportsBenchmarkCases = JSON.parse(
  readFileSync(new URL('./fixtures/sports-decision-benchmark-cases.json', import.meta.url), 'utf8')
);

assert(
  Array.isArray(sportsBenchmarkCases?.cases) && sportsBenchmarkCases.cases.length >= 4,
  'Sports decision benchmark cases should define the shared sharp/proxy/hold truth set.'
);

const normalizedQuery = {
  primary_domain_id: 'B.3.6.sports_outcomes_probability_mode',
  query_text: 'Inter Milan vs Roma 2026-04-05',
  question_side_a: 'Inter Milan',
  question_side_b: 'Roma',
  event_date: '2026-04-05',
  temporal_context: {
    as_of_utc: '2026-04-01T10:00:00.000Z',
    as_of_timezone: 'Europe/Rome',
    as_of_local_date: '2026-04-01',
    uses_relative_time: false,
    resolved_time_window: null,
  },
};

const sportsGrounding = {
  provider_required: true,
  provider_configured: true,
  fixture_resolved: true,
  parity_ready: true,
  semantic_ready: true,
  publish_gate_ready: true,
  sports_pick_state: 'publishable_controlled',
  sports_grounded: true,
  fixture_window_state: 'active',
  fixture_window_open: true,
  question_side_a: 'Inter Milan',
  question_side_b: 'Roma',
  winning_side: 'Inter Milan',
  winning_probability: 0.58,
  model_probabilities: {
    home: 0.58,
    draw: 0.23,
    away: 0.19,
    home_label: 'Inter Milan',
    draw_label: 'Draw',
    away_label: 'Roma',
  },
  market_probabilities: {
    home: 0.55,
    draw: 0.24,
    away: 0.21,
    home_label: 'Inter Milan',
    draw_label: 'Draw',
    away_label: 'Roma',
  },
  fair_prices: {
    home: 1.72,
    draw: 4.35,
    away: 5.26,
    home_label: 'Inter Milan',
    draw_label: 'Draw',
    away_label: 'Roma',
  },
  model_favorite: 'Inter Milan',
  market_favorite: 'Inter Milan',
  invalidators: ['Late lineup downgrade', 'Unexpected rest rotation'],
  counter_signals: ['Roma transition speed can punish a high line'],
  market_consensus_strength: 0.71,
  market_disagreement_score: 0.16,
  price_move_pressure: 0.22,
  narrative_hype_score: 0.44,
  sportsbook_readiness_state: 'probability_mode_live',
  sports_fixture_kind: 'dated',
  sports_fixture_candidate_score: 0.94,
  sports_fixture_resolution_reason: 'team order matched cleanly; explicit date matched; fixture window upcoming',
  sports_fixture_date_match: true,
  sports_fixture_competition_match: true,
  sports_market_source: 'api_football_optional',
  sports_market_source_class: 'sharp',
  sports_market_quality_tier: 'sharp',
  sports_market_snapshot: {
    snapshot_time: '2026-04-01T10:00:00.000Z',
    latest_snapshot: {
      bookmaker: 'Bet365',
      home_decimal_odd: 1.85,
      draw_decimal_odd: 3.8,
      away_decimal_odd: 4.4,
    },
  },
  sports_market_overround: 0.048,
};

const sportsMarketOverlay = {
  enabled: true,
  available: true,
  market_frame: {
    source: 'api_football_optional',
    source_class: 'sharp',
    market_type: '1x2',
    selection_probabilities: sportsGrounding.market_probabilities,
    fair_probabilities: sportsGrounding.market_probabilities,
    overround: 0.048,
    snapshot_time: '2026-04-01T10:00:00.000Z',
    latest_snapshot: {
      bookmaker: 'Bet365',
    },
    market_quality_tier: 'sharp',
  },
  sports_market_source: 'api_football_optional',
  sports_market_source_class: 'sharp',
  sports_market_quality_tier: 'sharp',
  sports_market_snapshot: sportsGrounding.sports_market_snapshot,
  sports_market_overround: 0.048,
  market_consensus_strength: 0.71,
  market_disagreement_score: 0.16,
  price_move_pressure: 0.22,
  narrative_hype_score: 0.44,
  sportsbook_readiness_state: 'probability_mode_live',
};

const sportsSemanticOverlay = {
  enabled: true,
  ready: true,
  publish_gate_ready: true,
  confidence: 0.82,
  contradiction_score: 0.08,
  entity_alignment_score: 0.92,
  freshness_hours: 12,
  source_count: 5,
};

const sportsDecision = buildSportsDecisionFrame({
  sportsGrounding,
  sportsMarketOverlay,
  sportsSemanticOverlay,
  sportsContractState: {
    sportsGrounded: true,
    sportsPublishGateReady: true,
    fixtureWindowOpen: true,
    sportsPickState: 'publishable_controlled',
  },
  domainId: normalizedQuery.primary_domain_id,
  simulationTuning: {
    quality_score: 0.79,
    graph_coverage: 0.78,
    agent_convergence: 0.75,
  },
});

assert.equal(
  sportsDecision.decision_state,
  'no_bet',
  'A coherent favorite that is already fairly priced should downgrade to no_bet instead of pretending to be an edge.'
);
assert.equal(
  sportsDecision.sharp_market_available,
  true,
  'A priced sports setup should explicitly mark the presence of a harder market reference.'
);
assert.equal(sportsDecision.market_source_class, 'sharp', 'Sports decision frames should preserve the normalized market source class.');
assert.equal(sportsDecision.market_quality_tier, 'sharp', 'Sports decision frames should preserve the normalized market quality tier.');

const runtimeCard = runtimeTestables.buildFinalCard({
  runId: 'test_mirofish_sports',
  queryText: normalizedQuery.query_text,
  normalizedQuery,
  scorecard: {
    confidence_score: 0.74,
    publication_state: 'published',
    primary_call: 'Inter Milan',
    why_this_side: 'Inter still rates better after lineup and market context, but the price is already efficient.',
    personal_output: 'Inter remains the favorite, but Crystal would treat this as no bet at the current price.',
    publication_basis: {
      coverage_score: 0.78,
      freshness_score: 0.84,
      agreement_score: 0.72,
      conflict_score: 0.18,
      domain_state: 'sports_probability_mode',
      quality_verdict: 'publishable_controlled',
      notes: ['Sports decision stack active.'],
    },
    binary_contract: {
      question_side_a: 'Inter Milan',
      question_side_b: 'Roma',
      question_side_a_probability: 0.58,
      question_side_b_probability: 0.42,
      winning_side: 'Inter Milan',
      winning_probability: 0.58,
      band: 'lean',
      display_call: 'Inter Milan 58/42',
      flip_conditions: ['Late lineup downgrade'],
    },
    probability_split: {
      primary_label: 'Inter Milan',
      primary_probability: 0.58,
      secondary_label: 'Roma',
      secondary_probability: 0.42,
    },
    invalidators: ['Late lineup downgrade', 'Unexpected rest rotation'],
    counter_signals: ['Roma transition speed can punish a high line'],
    sports_decision_state: sportsDecision.decision_state,
    sports_decision_reason: sportsDecision.decision_reason,
    sports_no_bet_reason: sportsDecision.no_bet_reason,
    sports_model_probabilities: sportsDecision.model_probabilities,
    sports_market_probabilities: sportsDecision.market_probabilities,
    sports_edge_delta: sportsDecision.edge_delta,
    sports_fair_prices: sportsDecision.fair_prices,
    sports_fragility_score: sportsDecision.fragility_score,
    sports_simulation_confidence: sportsDecision.simulation_confidence,
    sports_upset_rate: sportsDecision.upset_rate,
    sports_draw_volatility: sportsDecision.draw_volatility,
    sports_flip_conditions: sportsDecision.flip_conditions,
    sports_model_favorite: sportsDecision.model_favorite,
    sports_market_favorite: sportsDecision.market_favorite,
    sports_favorite_but_no_bet: sportsDecision.favorite_but_no_bet,
  },
  voicePayload: {
    title: 'Inter Milan vs Roma',
    summary: 'Inter remains the favorite, but the current price already reflects most of the edge.',
    verdict: 'Favorite, but no bet at the current market',
    what_to_watch: ['Confirmed lineups', 'Roma press resistance'],
    how_to_raise_confidence: ['Re-check close to kickoff'],
  },
  verifiedEvidencePack: {
    source_ledger: ['thesportsdb_public', 'api_football_optional', 'sports_semantic_overlay', 'polymarket_public'],
    source_usage: [],
    prediction_market_frame: null,
    sports_grounding: sportsGrounding,
    sports_market_overlay: sportsMarketOverlay,
    sports_semantic_overlay: sportsSemanticOverlay,
    evidence_quality: {
      coverage_score: 0.78,
      freshness_score: 0.84,
      agreement_score: 0.72,
      conflict_score: 0.18,
      source_count: 4,
    },
  },
  simulationDigest: {
    enabled: true,
    simulation_mode: 'cache_hit',
    quality_score: 0.79,
    graph_coverage: 0.78,
    agent_convergence: 0.75,
    graph_age_hours: 4,
    narrative_arc: 'Inter remains better, but not mispriced enough for a bet.',
    pivotal_actors: ['Inter Milan', 'Roma'],
    intervention_points: ['Late team news'],
    counterfactuals: [],
    source_set: ['sports_match_decision'],
    scenario_frequencies: [
      { label: 'Inter win', probability: 0.58 },
      { label: 'Draw', probability: 0.23 },
      { label: 'Roma win', probability: 0.19 },
    ],
    probability_delta: 0.02,
    confidence_delta: 0.03,
    sports_decision: sportsDecision,
  },
  calibrationSnapshot: null,
  resolutionTarget: {
    resolution_id: 'sports_test_inter_roma',
    target_type: 'binary_outcome',
    source_type: 'sports_fixture',
    resolution_due_at: '2026-04-05T18:45:00Z',
    question_side_a: 'Inter Milan',
    question_side_b: 'Roma',
    event_date: '2026-04-05',
    evaluation_eligible: true,
  },
  evaluationEligible: true,
  runtimeTransport: 'local_core',
  rolloutBucket: 'sports_canary',
});

assert.equal(runtimeCard.sports_grounded, true, 'Runtime cards should preserve grounded sports truth.');
assert.equal(runtimeCard.sports_decision_state, 'no_bet', 'Runtime cards should expose the sports decision state.');
assert.equal(runtimeCard.sports_fixture_kind, 'dated', 'Runtime cards should expose deterministic fixture kind metadata.');
assert.equal(runtimeCard.sports_market_source_class, 'sharp', 'Runtime cards should expose normalized market source class.');
assert(runtimeCard.sports_model_probabilities, 'Runtime cards should expose model probabilities.');
assert(runtimeCard.sports_market_probabilities, 'Runtime cards should expose market probabilities.');
assert(runtimeCard.sports_fair_prices, 'Runtime cards should expose fair prices.');
assert.equal(runtimeCard.sports_favorite_but_no_bet, true, 'Runtime cards should explicitly flag favorite-but-no-bet states.');
assert(runtimeCard.world_sim?.sports_decision, 'Runtime world_sim digests should carry the typed sports decision block.');
assert.equal(runtimeCard.world_sim?.sports_decision?.decision_state, 'no_bet', 'World sim sports decision should stay aligned with the runtime card.');

const publicPayload = indexTestables.applySportsPublishGateToCardPayload(
  {
    card_state: 'published',
    title: 'Inter Milan vs Roma',
    summary: 'Inter remains the favorite, but the market already prices most of that edge.',
    verdict: 'Favorite, but no bet',
    publication_basis: {
      coverage_score: 0.78,
      freshness_score: 0.84,
      agreement_score: 0.72,
      conflict_score: 0.18,
    },
    trust_layer: {
      confidence_score: 0.74,
      confidence_tier: 'high',
      data_sufficiency_flag: 'sufficient',
      freshness: {
        staleness_bucket: 'fresh',
        as_of_utc: '2026-04-01T10:00:00.000Z',
      },
      provenance_summary: {
        verification_level: 'partially_verified',
        license_summary: ['thesportsdb_public'],
      },
    },
  },
  {
    provider_configured: true,
    semantic_ready: true,
    overlay_confidence: 0.82,
    overlay_blocker_reason: '',
    market_consensus_strength: 0.71,
    market_disagreement_score: 0.16,
    price_move_pressure: 0.22,
    narrative_hype_score: 0.44,
    sportsbook_readiness_state: 'probability_mode_live',
    market_overlay: sportsMarketOverlay,
    semantic_overlay: sportsSemanticOverlay,
    grounded_read: sportsGrounding,
  },
  normalizedQuery,
);

assert.equal(publicPayload.sports_decision_state, 'no_bet', 'Public payload shaping should preserve sports decision truth.');
assert(publicPayload.sports_model_probabilities, 'Public payload shaping should expose model probabilities.');
assert(publicPayload.sports_market_probabilities, 'Public payload shaping should expose market probabilities.');
assert(publicPayload.sports_fair_prices, 'Public payload shaping should expose fair prices.');
assert.equal(publicPayload.sports_fixture_kind, 'dated', 'Public payload shaping should preserve fixture-kind metadata.');
assert.equal(publicPayload.sports_market_source_class, 'sharp', 'Public payload shaping should preserve market source class metadata.');
assert.equal(
  publicPayload.sports_grounding?.sports_grounded,
  publicPayload.sports_grounded,
  'Nested and top-level sports grounded state should stay aligned in the public payload.'
);
assert.equal(
  publicPayload.sports_decision_state,
  publicPayload.publication_basis?.sports_decision_state,
  'Public payload shaping should keep decision state aligned with publication basis.'
);

const retailOnlyDecision = buildSportsDecisionFrame({
  sportsGrounding: {
    fixture_resolved: true,
    sports_grounded: true,
    publish_gate_ready: true,
    fixture_window_open: true,
    question_side_a: 'Italy',
    question_side_b: 'Bosnia',
    winning_side: 'Italy',
    winning_probability: 0.61,
    model_probabilities: {
      home: 0.61,
      draw: 0.22,
      away: 0.17,
      home_label: 'Italy',
      draw_label: 'Draw',
      away_label: 'Bosnia',
    },
    model_favorite: 'Italy',
    invalidators: ['Lineup quality still unclear'],
  },
  sportsMarketOverlay: {
    enabled: true,
    available: true,
    market_frame: {
      source: 'google_trends',
      source_class: 'retail',
      market_type: 'attention_proxy',
      selection_probabilities: null,
      fair_probabilities: null,
      overround: null,
      snapshot_time: '2026-04-01T10:00:00.000Z',
      open_snapshot: null,
      latest_snapshot: null,
      market_quality_tier: 'retail',
    },
    sports_market_source: 'google_trends',
    sports_market_source_class: 'retail',
    sports_market_quality_tier: 'retail',
    retail_sentiment_pressure: 0.81,
    retail_bias_risk: 0.74,
    narrative_hype_score: 0.81,
    sportsbook_readiness_state: 'market_context_thin',
  },
  sportsSemanticOverlay: {
    enabled: true,
    ready: true,
    publish_gate_ready: true,
    confidence: 0.8,
    contradiction_score: 0.08,
    entity_alignment_score: 0.92,
    freshness_hours: 12,
    source_count: 5,
  },
  sportsContractState: {
    sportsGrounded: true,
    sportsPublishGateReady: true,
    fixtureWindowOpen: true,
    sportsPickState: 'publishable_controlled',
  },
  domainId: 'B.3.6.sports_outcomes_probability_mode',
  simulationTuning: {
    quality_score: 0.76,
    graph_coverage: 0.74,
    agent_convergence: 0.72,
  },
});

assert.equal(
  retailOnlyDecision.decision_state,
  'no_bet',
  'Retail sentiment without a harder market reference should never graduate into an edge.'
);
assert.match(
  retailOnlyDecision.decision_reason || '',
  /retail sentiment|public attention/i,
  'Retail-only sports decisions should explain that hype is not being treated as price truth.'
);

const proxyOnlyDecision = buildSportsDecisionFrame({
  sportsGrounding: {
    fixture_resolved: true,
    sports_grounded: true,
    publish_gate_ready: true,
    fixture_window_open: true,
    question_side_a: 'Italy',
    question_side_b: 'Bosnia',
    winning_side: 'Italy',
    winning_probability: 0.58,
    model_probabilities: {
      home: 0.58,
      draw: 0.24,
      away: 0.18,
      home_label: 'Italy',
      draw_label: 'Draw',
      away_label: 'Bosnia',
    },
    model_favorite: 'Italy',
    sports_market_source_class: 'proxy',
  },
  sportsMarketOverlay: {
    enabled: true,
    available: true,
    market_frame: {
      source: 'polymarket_public',
      source_class: 'proxy',
      market_type: 'binary_side_proxy',
      market_quality_tier: 'proxy',
    },
    sports_market_source: 'polymarket_public',
    sports_market_source_class: 'proxy',
    sports_market_quality_tier: 'proxy',
    market_consensus_strength: 0.61,
    market_disagreement_score: 0.19,
    price_move_pressure: 0.21,
    sportsbook_readiness_state: 'proxy_market_only',
  },
  sportsSemanticOverlay: sportsSemanticOverlay,
  sportsContractState: {
    sportsGrounded: true,
    sportsPublishGateReady: true,
    fixtureWindowOpen: true,
    sportsPickState: 'publishable_controlled',
  },
  domainId: 'B.3.6.sports_outcomes_probability_mode',
  simulationTuning: {
    quality_score: 0.74,
    graph_coverage: 0.72,
    agent_convergence: 0.7,
  },
});

assert.notEqual(proxyOnlyDecision.decision_state, 'edge', 'Proxy-only market frames must never produce a full edge state.');
assert.equal(proxyOnlyDecision.market_source_class, 'proxy', 'Proxy-only market frames should stay explicitly tagged as proxy.');

const normalizedSharpMarket = normalizeApiFootballMarket({
  market: {
    home_implied_probability: 0.56,
    draw_implied_probability: 0.27,
    away_implied_probability: 0.24,
    home_decimal_odd: 1.78,
    draw_decimal_odd: 3.7,
    away_decimal_odd: 4.15,
  },
  snapshotTime: '2026-04-01T10:00:00.000Z',
  bookmaker: 'Bet365',
  labels: {
    home_label: 'Inter Milan',
    draw_label: 'Draw',
    away_label: 'Roma',
  },
});

assert.equal(normalizedSharpMarket?.source_class, 'sharp', 'Normalized API-Football odds should be treated as sharp market truth.');
assert(normalizedSharpMarket?.fair_probabilities, 'Normalized API-Football odds should expose de-vigged fair probabilities.');
assert.notEqual(normalizedSharpMarket?.overround, null, 'Normalized API-Football odds should expose market overround.');

const fixtureSelection = sportsDataTestables.selectBestFixtureCandidate(
  [
    {
      fixture: { id: 11, date: '2026-04-05T18:45:00Z' },
      league: { name: 'Serie A' },
      teams: { home: { name: 'Inter Milan' }, away: { name: 'Roma' } },
    },
    {
      fixture: { id: 12, date: '2026-05-20T18:45:00Z' },
      league: { name: 'Serie A' },
      teams: { home: { name: 'Inter Milan' }, away: { name: 'Roma' } },
    },
  ],
  {
    homeTeam: 'Inter Milan',
    awayTeam: 'Roma',
    explicitDate: '2026-04-05',
    competitionHint: 'Serie A',
  }
);

assert.equal(fixtureSelection?.selected?.fixture?.fixture?.id, 11, 'Fixture scoring should prefer the exact dated candidate over far-out alternatives.');
assert.equal(fixtureSelection?.selected?.fixture_kind, 'dated', 'Exact dated fixtures should be classified as dated.');

console.log('Sports decision stack checks passed.');
