import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSportsDecisionFrame } = require('../functions/crystalCore/sportsDecision.js');
const { buildSportsFixtureWindow } = require('../functions/sportsData.js');

function buildBaseGrounding(overrides = {}) {
  return {
    fixture_resolved: true,
    sports_grounded: true,
    publish_gate_ready: true,
    fixture_window_open: true,
    fixture_window_state: 'active',
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
    invalidators: ['Late lineup downgrade'],
    sports_market_source: 'api_football_optional',
    sports_market_source_class: 'sharp',
    sports_market_quality_tier: 'sharp',
    market_frame: {
      source: 'api_football_optional',
      source_class: 'sharp',
      market_type: '1x2',
      selection_probabilities: {
        home: 0.55,
        draw: 0.24,
        away: 0.21,
        home_label: 'Inter Milan',
        draw_label: 'Draw',
        away_label: 'Roma',
      },
      fair_probabilities: {
        home: 0.55,
        draw: 0.24,
        away: 0.21,
        home_label: 'Inter Milan',
        draw_label: 'Draw',
        away_label: 'Roma',
      },
      overround: 0.048,
      snapshot_time: '2026-04-01T10:00:00.000Z',
      latest_snapshot: { bookmaker: 'Bet365' },
      market_quality_tier: 'sharp',
    },
    ...overrides,
  };
}

function buildBaseSemantic(overrides = {}) {
  return {
    ready: true,
    confidence: 0.82,
    contradiction_score: 0.08,
    entity_alignment_score: 0.92,
    freshness_hours: 12,
    source_count: 5,
    ...overrides,
  };
}

function buildBaseContract(overrides = {}) {
  return {
    sportsGrounded: true,
    sportsPublishGateReady: true,
    fixtureWindowOpen: true,
    sportsPickState: 'publishable_controlled',
    ...overrides,
  };
}

const favoriteButNoBet = buildSportsDecisionFrame({
  sportsGrounding: buildBaseGrounding(),
  sportsMarketOverlay: {
    sports_market_source: 'api_football_optional',
    sports_market_source_class: 'sharp',
    sports_market_quality_tier: 'sharp',
    market_consensus_strength: 0.71,
    market_disagreement_score: 0.16,
    price_move_pressure: 0.22,
  },
  sportsSemanticOverlay: buildBaseSemantic(),
  sportsContractState: buildBaseContract(),
  domainId: 'B.3.6.sports_outcomes_probability_mode',
  simulationTuning: {
    quality_score: 0.78,
    graph_coverage: 0.77,
    agent_convergence: 0.75,
  },
});

assert.equal(favoriteButNoBet.decision_state, 'no_bet', 'Fairly priced favorites should land on no_bet, not edge.');
assert.match(
  favoriteButNoBet.decision_reason || '',
  /fair value|market|price/i,
  'Favorite-but-no-bet should explicitly explain that the current price is already efficient.'
);

const sharpEdge = buildSportsDecisionFrame({
  sportsGrounding: buildBaseGrounding({
    question_side_a: 'Italy',
    question_side_b: 'Bosnia',
    winning_side: 'Bosnia',
    winning_probability: 0.56,
    model_probabilities: {
      home: 0.22,
      draw: 0.22,
      away: 0.56,
      home_label: 'Italy',
      draw_label: 'Draw',
      away_label: 'Bosnia',
    },
    market_probabilities: {
      home: 0.43,
      draw: 0.27,
      away: 0.3,
      home_label: 'Italy',
      draw_label: 'Draw',
      away_label: 'Bosnia',
    },
    model_favorite: 'Bosnia',
    market_favorite: 'Italy',
    sports_market_source: 'api_football_optional',
    sports_market_source_class: 'sharp',
    sports_market_quality_tier: 'sharp',
    market_frame: {
      source: 'api_football_optional',
      source_class: 'sharp',
      market_type: '1x2',
      selection_probabilities: {
        home: 0.43,
        draw: 0.27,
        away: 0.3,
        home_label: 'Italy',
        draw_label: 'Draw',
        away_label: 'Bosnia',
      },
      fair_probabilities: {
        home: 0.43,
        draw: 0.27,
        away: 0.3,
        home_label: 'Italy',
        draw_label: 'Draw',
        away_label: 'Bosnia',
      },
      overround: 0.048,
      snapshot_time: '2026-04-01T10:00:00.000Z',
      latest_snapshot: { bookmaker: 'Bet365' },
      market_quality_tier: 'sharp',
    },
  }),
  sportsMarketOverlay: {
    sports_market_source: 'api_football_optional',
    sports_market_source_class: 'sharp',
    sports_market_quality_tier: 'sharp',
    market_consensus_strength: 0.76,
    market_disagreement_score: 0.18,
    price_move_pressure: 0.18,
  },
  sportsSemanticOverlay: buildBaseSemantic(),
  sportsContractState: buildBaseContract(),
  domainId: 'B.3.6.sports_outcomes_probability_mode',
  simulationTuning: {
    quality_score: 0.8,
    graph_coverage: 0.79,
    agent_convergence: 0.77,
  },
});

assert.equal(sharpEdge.decision_state, 'edge', 'Robust sharp-market divergence should surface as edge.');
assert.equal(sharpEdge.market_source_class, 'sharp', 'Edge should remain anchored to sharp market truth.');

const proxyOnly = buildSportsDecisionFrame({
  sportsGrounding: buildBaseGrounding({
    sports_market_source: 'polymarket_public',
    sports_market_source_class: 'proxy',
    sports_market_quality_tier: 'proxy',
    market_frame: {
      source: 'polymarket_public',
      source_class: 'proxy',
      market_type: 'binary_side_proxy',
      selection_probabilities: null,
      fair_probabilities: null,
      overround: null,
      snapshot_time: '2026-04-01T10:00:00.000Z',
      latest_snapshot: { implied_probability: 0.58 },
      market_quality_tier: 'proxy',
    },
  }),
  sportsMarketOverlay: {
    sports_market_source: 'polymarket_public',
    sports_market_source_class: 'proxy',
    sports_market_quality_tier: 'proxy',
    market_consensus_strength: 0.63,
    market_disagreement_score: 0.14,
    price_move_pressure: 0.21,
  },
  sportsSemanticOverlay: buildBaseSemantic(),
  sportsContractState: buildBaseContract(),
  domainId: 'B.3.6.sports_outcomes_probability_mode',
});

assert.notEqual(proxyOnly.decision_state, 'edge', 'Proxy-only market context must never generate edge.');

const retailOnly = buildSportsDecisionFrame({
  sportsGrounding: buildBaseGrounding({
    market_probabilities: null,
    sports_market_source: 'google_trends',
    sports_market_source_class: 'retail',
    sports_market_quality_tier: 'retail',
    market_frame: {
      source: 'google_trends',
      source_class: 'retail',
      market_type: 'attention_proxy',
      selection_probabilities: null,
      fair_probabilities: null,
      overround: null,
      snapshot_time: '2026-04-01T10:00:00.000Z',
      latest_snapshot: null,
      market_quality_tier: 'retail',
    },
  }),
  sportsMarketOverlay: {
    sports_market_source: 'google_trends',
    sports_market_source_class: 'retail',
    sports_market_quality_tier: 'retail',
    retail_sentiment_pressure: 0.81,
    retail_bias_risk: 0.74,
    narrative_hype_score: 0.81,
  },
  sportsSemanticOverlay: buildBaseSemantic(),
  sportsContractState: buildBaseContract(),
  domainId: 'B.3.6.sports_outcomes_probability_mode',
});

assert.equal(retailOnly.decision_state, 'no_bet', 'Retail-only hype should resolve to no_bet.');
assert.match(
  retailOnly.decision_reason || '',
  /retail|public attention|price truth/i,
  'Retail-only no_bet should explain that hype is not treated as price truth.'
);

const groundedLeanNoMarket = buildSportsDecisionFrame({
  sportsGrounding: buildBaseGrounding({
    market_probabilities: null,
    sports_market_source: null,
    sports_market_source_class: 'none',
    sports_market_quality_tier: 'none',
    market_frame: null,
  }),
  sportsMarketOverlay: {
    sports_market_source: null,
    sports_market_source_class: 'none',
    sports_market_quality_tier: 'none',
  },
  sportsSemanticOverlay: buildBaseSemantic(),
  sportsContractState: buildBaseContract(),
  domainId: 'A.29.sports_performance_and_outcomes',
});

assert.equal(groundedLeanNoMarket.decision_state, 'grounded_lean', 'Grounded matches without market truth should stay grounded_lean.');

const staleFixtureWindow = buildSportsFixtureWindow({
  kickoffUtc: '2026-05-20T18:45:00Z',
  queryDate: '2026-04-05',
});

assert.equal(staleFixtureWindow.window_open, false, 'Far-out dated fixtures should not open the live decision window.');
assert.equal(staleFixtureWindow.state, 'date_mismatch', 'Far-out dated fixtures should expose a date_mismatch window state.');

console.log('Sports product QA passed.');
