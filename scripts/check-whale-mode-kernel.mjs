import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildGenericDecisionKernel, resolveHighImpactFamily } = require('../functions/crystalCore/decisionKernel.js');

assert.equal(resolveHighImpactFamily('A.23.markets_and_asset_regimes'), 'markets');
assert.equal(resolveHighImpactFamily('B.3.5.business_idea_outcomes'), 'business');
assert.equal(resolveHighImpactFamily('A.29.sports_performance_and_outcomes'), 'sports');

const sportsNoBetKernel = buildGenericDecisionKernel({
  domainId: 'A.29.sports_performance_and_outcomes',
  normalizedQuery: {
    primary_domain_id: 'A.29.sports_performance_and_outcomes',
    question_side_a: 'Italy',
    question_side_b: 'Bosnia',
  },
  evidenceBundle: {
    sports_grounding: {
      fixture_resolved: true,
      sports_grounded: true,
      sports_market_source: 'api_football_optional',
      sports_market_source_class: 'sharp',
    },
  },
  sportsDecision: {
    decision_state: 'no_bet',
    no_bet_reason: 'Italy is the favorite, but the market is already pricing that view tightly.',
    model_probabilities: {
      favorite_probability: 0.57,
    },
    market_probabilities: {
      favorite_probability: 0.55,
    },
    edge_delta: {
      best_delta: 0.02,
    },
    fragility_score: 0.31,
    simulation_confidence: 0.74,
  },
});

assert.equal(sportsNoBetKernel.decision_state, 'no_action');
assert.equal(sportsNoBetKernel.reference_source_class, 'sharp');
assert.equal(
  sportsNoBetKernel.no_action_reason,
  'Italy is the favorite, but the market is already pricing that view tightly.'
);

const retailOnlyKernel = buildGenericDecisionKernel({
  domainId: 'A.24.governance_policy_and_public_timeline',
  normalizedQuery: {
    primary_domain_id: 'A.24.governance_policy_and_public_timeline',
    binary_frame: {
      question_side_a: 'Yes',
      question_side_b: 'No',
    },
  },
  scorecard: {
    model_probability: 0.61,
  },
  evidenceBundle: {
    entity_resolution: { resolved: true },
    event_resolution: { resolved: true },
    live_signals: [
      {
        source_id: 'google_trends',
        summary: 'Retail attention is rising quickly.',
      },
    ],
    evidence_quality: {
      freshness_score: 0.82,
      agreement_score: 0.71,
      conflict_score: 0.18,
    },
  },
  simulationDigest: {
    quality_score: 0.74,
    graph_coverage: 0.7,
    agent_convergence: 0.72,
  },
});

assert.equal(retailOnlyKernel.reference_source_class, 'retail');
assert.equal(retailOnlyKernel.decision_state, 'no_action');
assert.match(retailOnlyKernel.decision_reason, /hype/i);

const proxyOnlyKernel = buildGenericDecisionKernel({
  domainId: 'A.24.governance_policy_and_public_timeline',
  normalizedQuery: {
    primary_domain_id: 'A.24.governance_policy_and_public_timeline',
  },
  scorecard: {
    model_probability: 0.62,
  },
  evidenceBundle: {
    entity_resolution: { resolved: true },
    event_resolution: { resolved: true },
    reference_frame: {
      source_class: 'proxy',
      source: 'prediction_market_proxy',
      reference_probability: 0.55,
      note: 'Consensus proxy only',
    },
    evidence_quality: {
      freshness_score: 0.84,
      agreement_score: 0.79,
      conflict_score: 0.14,
    },
  },
  simulationDigest: {
    quality_score: 0.8,
    graph_coverage: 0.76,
    agent_convergence: 0.75,
  },
});

assert.notEqual(proxyOnlyKernel.decision_state, 'edge');
assert.equal(proxyOnlyKernel.reference_source_class, 'proxy');
assert(['no_action', 'lean'].includes(proxyOnlyKernel.decision_state));

const noReferenceKernel = buildGenericDecisionKernel({
  domainId: 'B.3.5.business_idea_outcomes',
  normalizedQuery: {
    primary_domain_id: 'B.3.5.business_idea_outcomes',
  },
  scorecard: {
    model_probability: 0.58,
  },
  evidenceBundle: {
    entity_resolution: { resolved: true },
    event_resolution: { resolved: true },
    evidence_quality: {
      freshness_score: 0.75,
      agreement_score: 0.68,
      conflict_score: 0.22,
    },
  },
});

assert.equal(noReferenceKernel.decision_state, 'grounded_lean');
assert.equal(noReferenceKernel.reference_source_class, 'none');

const sharpEdgeKernel = buildGenericDecisionKernel({
  domainId: 'A.23.markets_and_asset_regimes',
  normalizedQuery: {
    primary_domain_id: 'A.23.markets_and_asset_regimes',
  },
  scorecard: {
    model_probability: 0.57,
  },
  evidenceBundle: {
    entity_resolution: { resolved: true },
    event_resolution: { resolved: true },
    reference_frame: {
      source_class: 'sharp',
      source: 'structured_market_feed',
      reference_probability: 0.5,
      note: 'Structured reference price',
    },
    evidence_quality: {
      freshness_score: 0.88,
      agreement_score: 0.81,
      conflict_score: 0.11,
    },
  },
  simulationDigest: {
    quality_score: 0.82,
    graph_coverage: 0.79,
    agent_convergence: 0.77,
  },
});

assert.equal(sharpEdgeKernel.reference_source_class, 'sharp');
assert.equal(sharpEdgeKernel.decision_state, 'edge');
assert.equal(sharpEdgeKernel.edge_delta, 0.07);

const baselineNoActionKernel = buildGenericDecisionKernel({
  domainId: 'B.3.8.personal_decisions_and_tradeoffs',
  normalizedQuery: {
    primary_domain_id: 'B.3.8.personal_decisions_and_tradeoffs',
  },
  scorecard: {
    model_probability: 0.55,
  },
  evidenceBundle: {
    entity_resolution: { resolved: true },
    event_resolution: { resolved: true },
    market_structure: {
      consensus_reference: {
        source_id: 'career_baseline',
        summary: 'Baseline scenario already captures most of the upside.',
      },
    },
    evidence_quality: {
      freshness_score: 0.8,
      agreement_score: 0.73,
      conflict_score: 0.19,
    },
  },
  simulationDigest: {
    quality_score: 0.7,
    graph_coverage: 0.69,
    agent_convergence: 0.68,
  },
});

assert.equal(baselineNoActionKernel.reference_source_class, 'baseline');
assert.equal(baselineNoActionKernel.decision_state, 'no_action');

console.log('check-whale-mode-kernel: ok');
