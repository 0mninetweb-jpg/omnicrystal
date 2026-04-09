import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildRoutingHints, finalizeScorecard } = require('../functions/predictionCore.js');
const { buildSportsFixtureWindow } = require('../functions/sportsData.js');
const { computeSportsContractState, getSportsReleaseMode } = require('../functions/crystalCore/sportsState.js');
const { buildSportsDecisionFrame } = require('../functions/crystalCore/sportsDecision.js');
const { __testables: runtimeTestables } = require('../functions/crystalCore/runtime.js');
const { __testables: indexTestables } = require('../functions/index.js');

function addCases(target, queries, expectedDomains, options = {}) {
  for (const query of queries) {
    target.push({
      query,
      expectedDomains,
      binary:
        options.binary === undefined
          ? /\b(will|should i|dovrei|si o no|sì o no|yes or no|vincer|sopravviv|pass|approve|ease|rise|fall|buy now|wait)\b/i.test(query)
          : Boolean(options.binary),
    });
  }
}

const benchmarkCases = [];

addCases(
  benchmarkCases,
  [
    'Cosa passerà al referendum costituzionale di marzo in Italia, sì o no?',
    'Will the new Italian constitutional referendum pass?',
    'Chi vincerà il referendum in Italia il prossimo marzo?',
    'Election volatility in Italy over the next 90 days',
    'Will the coalition government survive the budget vote?',
    'Rischio di elezioni anticipate in Italia entro 12 mesi',
    'Will the new regulation be approved by parliament?',
    'Quanto è probabile un cambio di governo in Francia nei prossimi 6 mesi?',
    'Will the senate approve the reform package this quarter?',
    'Policy pressure around EU AI regulation next 90 days',
  ],
  ['A.24.governance_policy_and_public_timeline']
);

addCases(
  benchmarkCases,
  [
    'Will rents in Milan cool down by summer?',
    'Should I wait before renting in Rome?',
    'Dovrei comprare casa a Roma nel 2026?',
    'Housing affordability in Milan next 12 months',
    'Mortgage pressure in Italy over the next 6 months',
    'Will Rome home prices keep rising next year?',
    'Rental market in Bologna next 90 days',
    'Should I buy an apartment in Milan now or wait?',
    'Real estate scarcity in Florence this year',
    'Will housing pressure ease in Turin next quarter?',
  ],
  ['A.12.housing_and_real_estate_signals', 'B.3.8.personal_decisions_and_tradeoffs']
);

addCases(
  benchmarkCases,
  [
    'Bitcoin next 30 days',
    'Ethereum next 90 days',
    'Will gold outperform equities this quarter?',
    'Nasdaq volatility in the next month',
    'Oil price regime next 90 days',
    'S&P 500 drawdown risk over the next 30 days',
    'Crypto risk appetite in the next 6 months',
    'EURUSD next quarter',
    'Will Bitcoin break higher this month?',
    'Market regime shift in tech stocks this summer',
  ],
  ['A.23.markets_and_asset_regimes']
);

addCases(
  benchmarkCases,
  [
    'Inflation in Italy next 12 months',
    'Eurozone recession risk this year',
    'Will ECB rates fall by autumn?',
    'Italian GDP momentum over the next 6 months',
    'Macro outlook for Europe next quarter',
    'Will unemployment rise in Italy this year?',
    'Rate pressure in Europe over the next 90 days',
    'Growth slowdown in Germany next 12 months',
    'Will inflation cool faster than expected?',
    'Cross-country macro regime for Europe next 6 months',
  ],
  ['A.14.macro_economy_and_cycles']
);

addCases(
  benchmarkCases,
  [
    'Jobs in Milan next 6 months',
    'Hiring momentum in Rome next quarter',
    'Will salaries rise in Italy this year?',
    'Layoff stress in the tech sector next 90 days',
    'Labor attractiveness in Milan over the next year',
    'Will the labor market weaken in Italy?',
    'Wage pressure in Europe next quarter',
    'Employment outlook for young workers in Italy',
    'Hiring demand in fintech next 6 months',
    'Will job openings cool in Rome this fall?',
  ],
  ['A.15.jobs_and_labor_market_signals']
);

addCases(
  benchmarkCases,
  [
    'Should I change my job next year?',
    'Should I accept a new job offer in Milan?',
    'Will my career move pay off in the next 12 months?',
    'Should I resign this year or wait?',
    'Is this promotion likely to improve my trajectory?',
    'Should I switch sector in 2026?',
    'Will changing company improve my salary trajectory?',
    'Should I move into management next year?',
    'Is this role change the right career move now?',
    'Should I leave consulting for product next year?',
  ],
  ['B.3.3.work_and_career_outcomes', 'B.3.5.business_idea_outcomes']
);

addCases(
  benchmarkCases,
  [
    'Will my startup survive the next 12 months?',
    'Should I launch this startup now or wait?',
    'Business idea viability in Milan next year',
    'Will my SaaS business make it through the next 6 months?',
    'Should I open a cafe in Rome this year?',
    'Will my small business survive the next recession?',
    'Should I launch this marketplace in 2026?',
    'Startup runway risk over the next year',
    'Can this business idea reach product-market fit next 12 months?',
    'Will my company survive this year?',
  ],
  ['B.3.5.business_idea_outcomes']
);

addCases(
  benchmarkCases,
  [
    'Best time to visit Tokyo in the next 90 days',
    'Should I visit Tokyo this spring or wait?',
    'Travel disruption risk for London next month',
    'Flight delay pressure in Europe this summer',
    'Destination crowding in Barcelona next 30 days',
    'Will tourism pressure in Rome spike this weekend?',
    'Should I go to Japan in June?',
    'Travel flows to Milan next 90 days',
    'Trip disruption risk in Paris next month',
    'When is the best window to travel to Lisbon?',
  ],
  ['A.9.travel_flows_and_disruption', 'B.3.7.travel_personal_outcomes']
);

addCases(
  benchmarkCases,
  [
    'What is the safety risk in Milan this weekend?',
    'Crime pressure in Rome next 30 days',
    'Will crowd risk rise in Milan during the derby weekend?',
    'Safety outlook for Naples this month',
    'Incident risk near the city center this weekend',
    'Local hotspot risk in Turin next 7 days',
    'How risky is it to go out in Milan this weekend?',
    'Safety pressure around the station area next 30 days',
    'Will incident risk ease in Florence next month?',
    'Crowd and security stress in Rome during the concert weekend',
  ],
  ['A.27.safety_and_incident_risk']
);

addCases(
  benchmarkCases,
  [
    'Inter vs Juventus',
    'Milan vs Napoli',
    'Real Madrid vs Barcelona',
    'Liverpool vs Arsenal',
    'Juventus contro Inter',
  ],
  ['A.29.sports_performance_and_outcomes'],
  { binary: true }
);

addCases(
  benchmarkCases,
  [
    'Should I buy Bitcoin now with my savings?',
    'Should I wait before investing my cash?',
    'Will my personal budget improve next year?',
    'Should I lock a mortgage rate now?',
    'Can I afford to buy a house next year?',
    'Should I keep renting or buy?',
    'Will my savings last 12 months at current costs?',
    'Should I refinance my mortgage now?',
    'Personal finance pressure for a family in Milan next year',
    'Should I hold cash or invest over the next 6 months?',
  ],
  ['B.3.4.personal_finance_outcomes', 'B.3.8.personal_decisions_and_tradeoffs']
);

addCases(
  benchmarkCases,
  [
    'Will the Russia-Ukraine conflict escalate this quarter?',
    'Geopolitical risk in the Taiwan Strait next 90 days',
    'Will sanctions pressure intensify this year?',
    'Conflict spillover risk in the Middle East next month',
    'Will a ceasefire hold over the next 30 days?',
    'Geopolitical disruption risk for Europe this winter',
    'Will cross-border tension rise in the next 6 months?',
    'Military escalation risk this quarter',
    'Will sanctions ease this year?',
    'Conflict onset proxies for the region next 90 days',
  ],
  ['A.25.geopolitics_and_conflict_dynamics']
);

addCases(
  benchmarkCases,
  [
    'Public health risk in Milan this winter',
    'Will flu pressure rise next month?',
    'Hospital capacity stress in Rome next quarter',
    'Air quality exposure in Milan this week',
    'Pandemic-style health disruption risk next 90 days',
    'Will pollution exposure worsen this month?',
    'Healthcare strain in Italy next winter',
    'Environmental exposure risk in Naples next 30 days',
    'Will flu season hit earlier than usual?',
    'Public health pressure in Lombardy next 90 days',
  ],
  ['A.28.public_health_and_environmental_exposure']
);

assert(benchmarkCases.length >= 100, `Expected at least 100 benchmark cases, got ${benchmarkCases.length}`);

const failures = [];

for (const item of benchmarkCases) {
  const hints = buildRoutingHints(item.query);
  const topDomain = hints.primaryDomainId;
  const topThree = (hints.candidateDomains || []).slice(0, 3).map((candidate) => candidate.domain_id);

  if (!item.expectedDomains.includes(topDomain) && !item.expectedDomains.some((domainId) => topThree.includes(domainId))) {
    failures.push({
      query: item.query,
      reason: `Expected ${item.expectedDomains.join(' or ')}, got ${topDomain} (top3: ${topThree.join(', ')})`,
    });
  }

  if (item.binary) {
    if (hints.intentShape !== 'binary_outcome') {
      failures.push({
        query: item.query,
        reason: `Expected binary_outcome, got ${hints.intentShape}`,
      });
    }
    if (!hints.binaryFrame?.question_side_a || !hints.binaryFrame?.question_side_b) {
      failures.push({
        query: item.query,
        reason: 'Binary frame missing question_side_a/question_side_b',
      });
    }
  }
}

const scorecard = finalizeScorecard(
  {
    primary_call: 'Lean No 58/42',
    probability_split: {
      primary_label: 'No',
      primary_probability: 0.58,
      secondary_label: 'Si',
      secondary_probability: 0.42,
    },
    key_drivers: ['coalition fragmentation', 'weak institutional momentum', 'uncertain campaign discipline'],
    counter_signals: ['late polling swing', 'elite consolidation'],
    invalidators: ['credible polling reversal', 'major coalition agreement'],
    historical_anchors: ['Italian referendum volatility over the last 20 years'],
    why_this_side: 'The latest evidence supports a cautious Lean No rather than a dead-even call.',
    recommended_posture: 'Monitor late polling and campaign cohesion before acting on a stronger publish.',
  },
  {
    historical_baseline_20y: 'A 20-year policy baseline exists.',
    live_signals: [
      { lean: 'down', freshness_score: 0.82 },
      { lean: 'down', freshness_score: 0.74 },
    ],
    source_ledger: ['gdelt', 'rss_allowlist', 'polymarket_public'],
    entity_resolution: { resolved: true, entities: ['Italy'] },
    event_resolution: { resolved: true, jurisdiction: 'Italy' },
    evidence_quality: {
      coverage_score: 0.73,
      freshness_score: 0.79,
      agreement_score: 0.7,
      conflict_score: 0.22,
      source_count: 3,
    },
  },
  {
    question_side_a: 'Si',
    question_side_b: 'No',
  },
  {
    current_state: 'limited',
    status_reason: 'Event normalization is still partial.',
  },
  {
    engine: 'standard',
  }
);

assert(scorecard.primary_call, 'Scorecard should expose a primary call');
assert(scorecard.binary_contract, 'Binary scorecard should expose a binary contract');
assert(scorecard.probability_split, 'Binary scorecard should expose a probability split');
assert.notEqual(scorecard.publication_state, 'blocked', 'Scorecard should not hard-block a directional read with valid evidence');
assert.equal(scorecard.binary_contract.winning_side, 'No', 'Winner should be aligned with the higher-probability side');
assert.equal(scorecard.primary_call, scorecard.binary_contract.display_call, 'Primary call should mirror the canonical binary display call');
assert(Math.abs(scorecard.binary_contract.question_side_a_probability + scorecard.binary_contract.question_side_b_probability - 1) < 0.001, 'Binary side probabilities should sum to 1');
assert(scorecard.binary_contract.winning_probability >= 0.52 && scorecard.binary_contract.winning_probability < 0.85, 'Winning probability should be bounded for public output');
assert.equal(scorecard.probability_split.primary_label, 'No', 'Compatibility probability split should be winner-first');
assert(scorecard.counter_signals.length > 0, 'Binary scorecards should expose counter-signals');
assert(scorecard.invalidators.length > 0, 'Binary scorecards should expose flip conditions');

const sportsRawScorecard = {
  primary_call: 'Inter 62/38',
  confidence_score: 0.81,
  probability_split: {
    winning_side: 'Inter',
    winning_probability: 0.62,
  },
  key_drivers: ['home form is stronger', 'recent finishing volume is still positive', 'the structured matchup lean is stable'],
  counter_signals: ['late lineup uncertainty', 'set-piece variance remains live'],
  invalidators: ['confirmed starter absences', 'unexpected tactical rotation'],
  historical_anchors: ['Recent head-to-head form and season table remain broadly aligned.'],
  why_this_side: 'The structured matchup read still leans Inter, but the semantic layer can still hold the public gate closed.',
  recommended_posture: 'Keep the matchup on watch until the semantic overlay and parity gate are both ready.',
  sports_model_probabilities: {
    home: 0.58,
    draw: 0.23,
    away: 0.19,
    home_label: 'Inter Milan',
    draw_label: 'Draw',
    away_label: 'Roma',
  },
  sports_market_probabilities: {
    home: 0.55,
    draw: 0.24,
    away: 0.21,
    home_label: 'Inter Milan',
    draw_label: 'Draw',
    away_label: 'Roma',
  },
  sports_fair_prices: {
    home: 1.72,
    draw: 4.35,
    away: 5.26,
    home_label: 'Inter Milan',
    draw_label: 'Draw',
    away_label: 'Roma',
  },
  sports_model_favorite: 'Inter Milan',
  sports_market_favorite: 'Inter Milan',
};

const sportsFixtureMetadata = {
  fixture_id: 987654,
  sports_fixture_kind: 'dated',
  sports_fixture_candidate_score: 0.94,
  sports_fixture_resolution_reason: 'team order matched cleanly; explicit date matched; fixture window upcoming',
  sports_fixture_date_match: true,
  sports_fixture_competition_match: true,
};

const sharpMarketFrame = {
  source: 'api_football_optional',
  source_class: 'sharp',
  market_type: '1x2',
  selection_probabilities: sportsRawScorecard.sports_market_probabilities,
  fair_probabilities: sportsRawScorecard.sports_market_probabilities,
  overround: 0.048,
  snapshot_time: '2026-04-01T10:00:00.000Z',
  open_snapshot: {
    bookmaker: 'Bet365',
    home_decimal_odd: 1.9,
    draw_decimal_odd: 3.9,
    away_decimal_odd: 4.5,
  },
  latest_snapshot: {
    bookmaker: 'Bet365',
    home_decimal_odd: 1.85,
    draw_decimal_odd: 3.8,
    away_decimal_odd: 4.4,
  },
  market_quality_tier: 'sharp',
};

const sportsEvidenceBase = {
  historical_baseline_20y: 'Recent match and table baseline exists.',
  live_signals: [
    { lean: 'up', freshness_score: 0.86 },
    { lean: 'up', freshness_score: 0.8 },
    { lean: 'up', freshness_score: 0.78 },
  ],
  source_ledger: ['thesportsdb_public', 'sports_semantic_overlay', 'rss_allowlist', 'polymarket_public', 'google_trends'],
  sports_market_overlay: {
    enabled: true,
    available: true,
    used_source_ids: ['api_football_optional', 'polymarket_public', 'google_trends'],
    source_count: 3,
    market_frame: sharpMarketFrame,
    sports_market_source: 'api_football_optional',
    sports_market_source_class: 'sharp',
    sports_market_quality_tier: 'sharp',
    sports_market_snapshot: {
      snapshot_time: '2026-04-01T10:00:00.000Z',
      latest_snapshot: sharpMarketFrame.latest_snapshot,
    },
    sports_market_overround: 0.048,
    market_consensus_strength: 0.66,
    market_disagreement_score: 0.18,
    price_move_pressure: 0.34,
    narrative_hype_score: 0.57,
    sportsbook_readiness_state: 'forecast_betting_aware',
  },
  entity_resolution: { resolved: true, entities: ['Inter', 'Juventus'] },
  event_resolution: { resolved: true, jurisdiction: 'Italy' },
  evidence_quality: {
    coverage_score: 0.78,
    freshness_score: 0.82,
    agreement_score: 0.71,
    conflict_score: 0.18,
    source_count: 3,
  },
};

const sportsQueryPlan = {
  query_text: 'Inter Milan vs Roma 2026-04-05',
  question_side_a: 'Inter Milan',
  question_side_b: 'Roma',
};

const sportsDomainConfig = {
  domain_id: 'A.29.sports_performance_and_outcomes',
  current_state: 'limited',
  status_reason: 'Sports picks require the semantic publish gate before they can go public.',
};

const sportsBettingDomainConfig = {
  domain_id: 'B.3.6.sports_outcomes_probability_mode',
  current_state: 'limited',
  status_reason: 'Sports probability mode stays benchmark-only until it has its own parity-closed market benchmark.',
};

const sportsBlockedScorecard = finalizeScorecard(
  sportsRawScorecard,
  {
    ...sportsEvidenceBase,
    hard_stop: true,
    sports_grounding: {
      provider_required: true,
      provider_configured: true,
      fixture_resolved: true,
      parity_ready: true,
      semantic_ready: false,
      overlay_confidence: 0.59,
      overlay_blocker_reason: 'sports_semantic_overlay_pending',
      publish_gate_ready: false,
      fixture_window_state: 'upcoming',
      fixture_window_open: true,
      ...sportsFixtureMetadata,
      market_consensus_strength: 0.61,
      market_disagreement_score: 0.22,
      price_move_pressure: 0.31,
      narrative_hype_score: 0.55,
      sportsbook_readiness_state: 'forecast_context_only',
      question_side_a: 'Inter Milan',
      question_side_b: 'Roma',
      winning_side: 'Inter Milan',
      winning_probability: 0.58,
      model_probabilities: sportsRawScorecard.sports_model_probabilities,
      market_probabilities: sportsRawScorecard.sports_market_probabilities,
      fair_prices: sportsRawScorecard.sports_fair_prices,
      model_favorite: 'Inter Milan',
      market_favorite: 'Inter Milan',
      sports_market_source: 'api_football_optional',
      sports_market_source_class: 'sharp',
      sports_market_quality_tier: 'sharp',
      sports_market_snapshot: {
        snapshot_time: '2026-04-01T10:00:00.000Z',
        latest_snapshot: sharpMarketFrame.latest_snapshot,
      },
      sports_market_overround: 0.048,
      market_frame: sharpMarketFrame,
    },
  },
  sportsQueryPlan,
  sportsDomainConfig,
  {
    engine: 'extended',
  }
);

assert.equal(
  sportsBlockedScorecard.publication_state,
  'limited',
  'A.29 should degrade to a grounded lean while the sports semantic publish gate is still partial.'
);
assert.equal(sportsBlockedScorecard.publication_basis.quality_verdict, 'grounded_lean');
assert.equal(
  sportsBlockedScorecard.publication_basis.sports_publish_gate_ready,
  false,
  'A.29 grounded lean should expose publish gate readiness as false'
);
assert.equal(
  sportsBlockedScorecard.publication_basis.sportsbook_readiness_state,
  'forecast_context_only',
  'Grounded-lean A.29 should still expose a conservative sportsbook readiness state'
);
assert.equal(
  sportsBlockedScorecard.publication_basis.sports_fixture_kind,
  'dated',
  'Grounded-lean A.29 should keep deterministic fixture kind metadata on the scorecard.'
);
assert.equal(
  sportsBlockedScorecard.publication_basis.sports_market_source_class,
  'sharp',
  'Grounded-lean A.29 should still surface normalized market source class when sharp odds exist.'
);
assert(sportsBlockedScorecard.binary_contract, 'Grounded-lean sports scorecards should still expose a bounded binary contract.');

const sportsReadyScorecard = finalizeScorecard(
  sportsRawScorecard,
  {
    ...sportsEvidenceBase,
    hard_stop: false,
    sports_grounding: {
      provider_required: true,
      provider_configured: true,
      fixture_resolved: true,
      parity_ready: true,
      semantic_ready: true,
      overlay_confidence: 0.79,
      overlay_blocker_reason: '',
      publish_gate_ready: true,
      fixture_window_state: 'active',
      fixture_window_open: true,
      ...sportsFixtureMetadata,
      market_consensus_strength: 0.68,
      market_disagreement_score: 0.16,
      price_move_pressure: 0.28,
      narrative_hype_score: 0.59,
      sportsbook_readiness_state: 'forecast_betting_aware',
      question_side_a: 'Inter Milan',
      question_side_b: 'Roma',
      winning_side: 'Inter Milan',
      winning_probability: 0.58,
      model_probabilities: sportsRawScorecard.sports_model_probabilities,
      market_probabilities: sportsRawScorecard.sports_market_probabilities,
      fair_prices: sportsRawScorecard.sports_fair_prices,
      model_favorite: 'Inter Milan',
      market_favorite: 'Inter Milan',
      sports_market_source: 'api_football_optional',
      sports_market_source_class: 'sharp',
      sports_market_quality_tier: 'sharp',
      sports_market_snapshot: {
        snapshot_time: '2026-04-01T10:00:00.000Z',
        latest_snapshot: sharpMarketFrame.latest_snapshot,
      },
      sports_market_overround: 0.048,
      market_frame: sharpMarketFrame,
    },
  },
  sportsQueryPlan,
  sportsDomainConfig,
  {
    engine: 'extended',
  }
);

assert.notEqual(
  sportsReadyScorecard.publication_basis.blocker_reason,
  'provider_required_no_pick',
  'A.29 should clear provider_required_no_pick once the sports publish gate is ready'
);
assert.equal(
  sportsReadyScorecard.publication_basis.sports_publish_gate_ready,
  true,
  'A.29 ready scorecard should expose publish gate readiness as true'
);
assert.equal(
  sportsReadyScorecard.publication_basis.sports_semantic_ready,
  true,
  'A.29 ready scorecard should expose semantic readiness as true'
);
assert.equal(
  sportsReadyScorecard.publication_basis.sportsbook_readiness_state,
  'forecast_betting_aware',
  'A.29 ready scorecard should expose a betting-aware but forecast-first posture'
);
assert.equal(
  sportsReadyScorecard.publication_basis.sports_fixture_kind,
  'dated',
  'A.29 ready scorecards should expose fixture kind metadata.'
);
assert.equal(
  sportsReadyScorecard.publication_basis.sports_market_source,
  'api_football_optional',
  'A.29 ready scorecards should expose the structured market source.'
);
assert.equal(
  sportsReadyScorecard.publication_basis.sports_market_source_class,
  'sharp',
  'A.29 ready scorecards should expose the normalized market source class.'
);
assert.equal(
  sportsReadyScorecard.publication_basis.sports_market_quality_tier,
  'sharp',
  'A.29 ready scorecards should expose the market quality tier.'
);
assert.equal(
  sportsReadyScorecard.publication_basis.sports_market_overround,
  0.048,
  'A.29 ready scorecards should expose normalized overround metadata.'
);
assert(
  sportsReadyScorecard.binary_contract,
  'A.29 should expose a binary contract again once the sports publish gate is ready'
);

const sportsBenchmarkOnlyScorecard = finalizeScorecard(
  sportsRawScorecard,
  {
    ...sportsEvidenceBase,
    hard_stop: false,
    sports_grounding: {
      provider_required: true,
      provider_configured: true,
      fixture_resolved: true,
      parity_ready: true,
      semantic_ready: true,
      overlay_confidence: 0.76,
      overlay_blocker_reason: '',
      publish_gate_ready: true,
      sports_pick_state: 'publishable_controlled',
      sports_grounded: true,
      fixture_window_state: 'active',
      fixture_window_open: true,
      ...sportsFixtureMetadata,
      market_consensus_strength: 0.69,
      market_disagreement_score: 0.14,
      price_move_pressure: 0.27,
      narrative_hype_score: 0.58,
      sportsbook_readiness_state: 'probability_mode_live',
      question_side_a: 'Inter Milan',
      question_side_b: 'Roma',
      winning_side: 'Inter Milan',
      winning_probability: 0.58,
      model_probabilities: sportsRawScorecard.sports_model_probabilities,
      market_probabilities: sportsRawScorecard.sports_market_probabilities,
      fair_prices: sportsRawScorecard.sports_fair_prices,
      model_favorite: 'Inter Milan',
      market_favorite: 'Inter Milan',
      sports_market_source: 'api_football_optional',
      sports_market_source_class: 'sharp',
      sports_market_quality_tier: 'sharp',
      sports_market_snapshot: {
        snapshot_time: '2026-04-01T10:00:00.000Z',
        latest_snapshot: sharpMarketFrame.latest_snapshot,
      },
      sports_market_overround: 0.048,
      market_frame: sharpMarketFrame,
    },
  },
  sportsQueryPlan,
  sportsBettingDomainConfig,
  {
    engine: 'extended',
  }
);

assert.equal(
  sportsBenchmarkOnlyScorecard.publication_state,
  'published',
  'B.3.6 should go live once the fixture is grounded and the sports probability gate is ready.'
);
assert.equal(
  sportsBenchmarkOnlyScorecard.publication_basis.sports_semantic_ready,
  true,
  'B.3.6 should expose semantic readiness in live probability mode.'
);
assert.equal(
  sportsBenchmarkOnlyScorecard.publication_basis.sports_publish_gate_ready,
  true,
  'B.3.6 should expose the live sports publish gate as ready once released.'
);
assert.equal(
  sportsBenchmarkOnlyScorecard.publication_basis.sportsbook_readiness_state,
  'probability_mode_live',
  'B.3.6 should expose a live probability-mode sportsbook readiness state.'
);
assert.equal(
  sportsBenchmarkOnlyScorecard.publication_basis.sports_market_source_class,
  'sharp',
  'B.3.6 should preserve structured market truth in probability mode.'
);
assert(sportsBenchmarkOnlyScorecard.binary_contract, 'B.3.6 should expose a live binary contract in probability mode.');

const hoursToMs = 60 * 60 * 1000;
const now = Date.now();
const genericFixtureOpen = buildSportsFixtureWindow({
  kickoffUtc: new Date(now + 3 * 24 * hoursToMs).toISOString(),
});
assert.equal(
  genericFixtureOpen.window_open,
  true,
  'Generic sports matchups should open only when the next grounded fixture is inside the 7 day live window.'
);

const genericFixtureFar = buildSportsFixtureWindow({
  kickoffUtc: new Date(now + 8 * 24 * hoursToMs).toISOString(),
});
assert.equal(
  genericFixtureFar.window_open,
  false,
  'Generic sports matchups should stay closed when the grounded fixture is outside the 7 day live window.'
);
assert.equal(
  genericFixtureFar.state,
  'scheduled_far',
  'Generic sports matchups outside the live window should surface a scheduled_far state.'
);

const explicitKickoff = new Date(now + 13 * 24 * hoursToMs).toISOString();
const explicitFixtureOpen = buildSportsFixtureWindow({
  kickoffUtc: explicitKickoff,
  queryDate: explicitKickoff.slice(0, 10),
});
assert.equal(
  explicitFixtureOpen.window_open,
  true,
  'Explicit dated sports fixtures should open inside the 14 day dated-fixture window.'
);

const explicitFixtureMismatch = buildSportsFixtureWindow({
  kickoffUtc: explicitKickoff,
  queryDate: new Date(now + 14 * 24 * hoursToMs).toISOString().slice(0, 10),
});
assert.equal(
  explicitFixtureMismatch.window_open,
  false,
  'Explicit dated sports fixtures should stay closed when the resolved kickoff does not match the requested date.'
);
assert.equal(
  explicitFixtureMismatch.state,
  'date_mismatch',
  'Date-mismatched sports fixtures should expose a date_mismatch fixture window state.'
);

assert.equal(
  getSportsReleaseMode(undefined),
  'observe',
  'Missing SPORTS_RELEASE_MODE should fail closed to observe.'
);
assert.equal(
  getSportsReleaseMode('totally-invalid'),
  'observe',
  'Invalid SPORTS_RELEASE_MODE should fail closed to observe.'
);

const sharedSportsState = computeSportsContractState({
  sportsGrounding: {
    provider_configured: true,
    fixture_resolved: true,
    publish_gate_ready: false,
    fixture_window_state: 'upcoming',
    fixture_window_open: true,
  },
});

assert.equal(sharedSportsState.sportsGrounded, true, 'Shared sports state should ground a configured resolved fixture.');
assert.equal(sharedSportsState.sportsPickState, 'grounded_lean', 'Resolved sports fixtures without full gate closure should default to grounded_lean.');
assert.equal(sharedSportsState.fixtureWindowState, 'upcoming', 'Shared sports state should preserve fixture window state.');
assert.equal(sharedSportsState.fixtureWindowOpen, true, 'Shared sports state should preserve fixture window openness.');

const payloadFromSharedSportsState = indexTestables.applySportsPublishGateToCardPayload(
  {
    card_state: 'limited',
    summary: 'Existing payload summary.',
    verdict: 'Existing payload verdict.',
  },
  {
    provider_configured: true,
    semantic_ready: false,
    overlay_confidence: 0.58,
    overlay_blocker_reason: 'sports_semantic_overlay_pending',
    sportsbook_readiness_state: 'forecast_context_only',
    grounded_read: {
      provider_required: true,
      provider_configured: true,
      fixture_resolved: true,
      parity_ready: true,
      publish_gate_ready: false,
      fixture_window_state: 'upcoming',
      fixture_window_open: true,
      ...sportsFixtureMetadata,
      question_side_a: 'Inter Milan',
      question_side_b: 'Roma',
      winning_side: 'Inter Milan',
      winning_probability: 0.61,
      sports_market_source: 'api_football_optional',
      sports_market_source_class: 'sharp',
      sports_market_quality_tier: 'sharp',
      sports_market_snapshot: {
        snapshot_time: '2026-04-01T10:00:00.000Z',
        latest_snapshot: sharpMarketFrame.latest_snapshot,
      },
      sports_market_overround: 0.048,
    },
  },
  {
    original_query: 'Inter Milan vs Roma 2026-04-05',
    question_side_a: 'Inter Milan',
    question_side_b: 'Roma',
  }
);

assert.equal(
  payloadFromSharedSportsState.sports_grounded,
  true,
  'Public payload shaping should preserve the shared sports_grounded truth.'
);
assert.equal(
  payloadFromSharedSportsState.sports_pick_state,
  'grounded_lean',
  'Public payload shaping should preserve the shared sports_pick_state truth.'
);
assert.equal(
  payloadFromSharedSportsState.sports_publish_gate_ready,
  false,
  'Public payload shaping should preserve the shared sports publish gate readiness.'
);
assert.equal(
  payloadFromSharedSportsState.fixture_window_state,
  'upcoming',
  'Public payload shaping should preserve the shared fixture window state.'
);
assert.equal(
  payloadFromSharedSportsState.fixture_window_open,
  true,
  'Public payload shaping should preserve the shared fixture window openness.'
);
assert.equal(
  payloadFromSharedSportsState.sports_fixture_kind,
  'dated',
  'Public payload shaping should preserve fixture-kind metadata.'
);
assert.equal(
  payloadFromSharedSportsState.sports_market_source_class,
  'sharp',
  'Public payload shaping should preserve market source class metadata.'
);
assert.equal(
  payloadFromSharedSportsState.sports_grounding?.sports_grounded,
  payloadFromSharedSportsState.sports_grounded,
  'Nested and top-level sports grounding should stay aligned.'
);
assert.equal(
  payloadFromSharedSportsState.sports_grounding?.sports_pick_state,
  payloadFromSharedSportsState.sports_pick_state,
  'Nested and top-level sports pick state should stay aligned.'
);

const probabilityPayload = indexTestables.applySportsPublishGateToCardPayload(
  {
    card_state: 'published',
    summary: 'Probability mode payload.',
    verdict: 'Probability mode verdict.',
  },
  {
    provider_configured: true,
    semantic_ready: true,
    overlay_confidence: 0.74,
    overlay_blocker_reason: '',
    sportsbook_readiness_state: 'probability_mode_live',
    market_consensus_strength: 0.66,
    market_disagreement_score: 0.14,
    price_move_pressure: 0.21,
    narrative_hype_score: 0.49,
    grounded_read: {
      provider_required: true,
      provider_configured: true,
      fixture_resolved: true,
      parity_ready: true,
      publish_gate_ready: true,
      sports_pick_state: 'publishable_controlled',
      sports_grounded: true,
      fixture_window_state: 'active',
      fixture_window_open: true,
      ...sportsFixtureMetadata,
      question_side_a: 'Inter Milan',
      question_side_b: 'Roma',
      winning_side: 'Inter Milan',
      winning_probability: 0.63,
      model_probabilities: sportsRawScorecard.sports_model_probabilities,
      market_probabilities: sportsRawScorecard.sports_market_probabilities,
      fair_prices: sportsRawScorecard.sports_fair_prices,
      model_favorite: 'Inter Milan',
      market_favorite: 'Inter Milan',
      invalidators: ['Late lineup downgrade'],
      sports_market_source: 'api_football_optional',
      sports_market_source_class: 'sharp',
      sports_market_quality_tier: 'sharp',
      sports_market_snapshot: {
        snapshot_time: '2026-04-01T10:00:00.000Z',
        latest_snapshot: sharpMarketFrame.latest_snapshot,
      },
      sports_market_overround: 0.048,
      market_frame: sharpMarketFrame,
    },
  },
  {
    original_query: 'Will Inter Milan beat Roma on 2026-04-05?',
    question_side_a: 'Inter Milan',
    question_side_b: 'Roma',
  }
);

assert(probabilityPayload.binary_contract, 'Sports probability mode payloads should still emit a binary contract.');
assert.equal(
  probabilityPayload.binary_contract?.winning_side,
  'Inter Milan',
  'Sports probability mode payloads should preserve the grounded winning side.'
);
assert.equal(
  probabilityPayload.sports_pick_state,
  'publishable_controlled',
  'Sports probability mode payloads should preserve publishable_controlled state when the gate is ready.'
);
assert.equal(
  sportsBlockedScorecard.sports_decision_state,
  'grounded_lean',
  'Grounded sports reads without a live market frame should default to grounded_lean in the decision layer.'
);
assert.equal(
  sportsReadyScorecard.sports_decision_state,
  'no_bet',
  'A market-coherent favorite without robust mispricing should resolve to no_bet instead of edge.'
);
assert.equal(
  probabilityPayload.sports_decision_state,
  'no_bet',
  'Live probability mode should still say no_bet when the market is already close to Crystal fair value.'
);
assert(probabilityPayload.sports_model_probabilities, 'Sports payloads should expose model probabilities.');
assert(probabilityPayload.sports_market_probabilities, 'Sports payloads should expose market probabilities.');
assert(probabilityPayload.sports_fair_prices, 'Sports payloads should expose fair prices.');
assert.equal(
  probabilityPayload.sports_market_source_class,
  'sharp',
  'Sports probability mode payloads should expose normalized sharp market truth.'
);
assert.equal(
  probabilityPayload.sports_fixture_kind,
  'dated',
  'Sports probability mode payloads should preserve deterministic fixture kind metadata.'
);
assert.equal(
  probabilityPayload.sports_market_overround,
  0.048,
  'Sports probability mode payloads should expose normalized market overround.'
);
assert.equal(
  probabilityPayload.sports_favorite_but_no_bet,
  true,
  'Sports payloads should explicitly mark favorite-but-no-bet situations.'
);

const runtimeProbabilityCard = runtimeTestables.buildFinalCard({
  runId: 'test_whale_mode_foundations',
  queryText: sportsQueryPlan.query_text,
  normalizedQuery: {
    primary_domain_id: 'B.3.6.sports_outcomes_probability_mode',
    query_text: sportsQueryPlan.query_text,
    question_side_a: sportsQueryPlan.question_side_a,
    question_side_b: sportsQueryPlan.question_side_b,
    event_date: '2026-04-05',
    temporal_context: {
      as_of_utc: '2026-04-01T10:00:00.000Z',
      as_of_timezone: 'Europe/Rome',
      as_of_local_date: '2026-04-01',
      uses_relative_time: false,
      resolved_time_window: null,
    },
  },
  scorecard: sportsBenchmarkOnlyScorecard,
  voicePayload: {
    title: 'Inter Milan vs Roma',
    summary: 'Inter remains the favorite, but the market is already close to Crystal fair value.',
    verdict: 'Favorite, but no bet',
    what_to_watch: ['Late lineup downgrade'],
    how_to_raise_confidence: ['Re-check close to kickoff'],
  },
  verifiedEvidencePack: {
    ...sportsEvidenceBase,
    sports_grounding: {
      ...sportsBenchmarkOnlyScorecard.publication_basis,
      ...sportsFixtureMetadata,
      fixture_id: sportsFixtureMetadata.fixture_id,
      question_side_a: 'Inter Milan',
      question_side_b: 'Roma',
      winning_side: 'Inter Milan',
      winning_probability: 0.58,
      sports_grounded: true,
      sports_pick_state: 'publishable_controlled',
      model_probabilities: sportsRawScorecard.sports_model_probabilities,
      market_probabilities: sportsRawScorecard.sports_market_probabilities,
      fair_prices: sportsRawScorecard.sports_fair_prices,
      market_frame: sharpMarketFrame,
      sports_market_source: 'api_football_optional',
      sports_market_source_class: 'sharp',
      sports_market_quality_tier: 'sharp',
      sports_market_snapshot: {
        snapshot_time: '2026-04-01T10:00:00.000Z',
        latest_snapshot: sharpMarketFrame.latest_snapshot,
      },
      sports_market_overround: 0.048,
    },
    sports_market_overlay: sportsEvidenceBase.sports_market_overlay,
    sports_semantic_overlay: {
      ready: true,
      confidence: 0.81,
      contradiction_score: 0.08,
      entity_alignment_score: 0.92,
    },
  },
  simulationDigest: {
    enabled: true,
    simulation_mode: 'cache_hit',
    quality_score: 0.78,
    graph_coverage: 0.76,
    agent_convergence: 0.74,
    graph_age_hours: 5,
    narrative_arc: 'Inter is still the favorite, but not enough above price to force a bet.',
    pivotal_actors: ['Inter Milan', 'Roma'],
    intervention_points: ['Late lineup downgrade'],
    counterfactuals: [],
    source_set: ['sports_match_decision'],
    sports_decision: {
      decision_state: 'no_bet',
      no_bet_reason: 'Inter is the favorite, but the market is already close to Crystal fair value.',
    },
  },
  calibrationSnapshot: null,
  resolutionTarget: {
    resolution_id: 'sports_foundation_inter_roma',
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

assert.equal(runtimeProbabilityCard.sports_grounded, true, 'Runtime sports cards should preserve grounded truth.');
assert.equal(runtimeProbabilityCard.decision_state, 'no_action', 'Runtime sports cards should expose the generic no_action whale-mode state for favorite-but-no-bet cases.');
assert.equal(runtimeProbabilityCard.sports_decision_state, 'no_bet', 'Runtime sports cards should preserve no_bet pricing decisions.');
assert.equal(
  runtimeProbabilityCard.publication_basis?.decision_state,
  'no_action',
  'Runtime publication basis should preserve the generic whale-mode decision state.'
);
assert.equal(runtimeProbabilityCard.sports_fixture_kind, 'dated', 'Runtime sports cards should expose fixture-kind metadata.');
assert.equal(runtimeProbabilityCard.sports_market_source_class, 'sharp', 'Runtime sports cards should expose sharp market truth.');
assert.equal(runtimeProbabilityCard.sports_market_overround, 0.048, 'Runtime sports cards should expose normalized overround.');
assert(runtimeProbabilityCard.binary_contract, 'Runtime sports cards should still expose a binary contract in probability mode.');
assert(runtimeProbabilityCard.world_sim?.sports_decision, 'Runtime sports cards should keep the typed world_sim sports decision block.');
assert(runtimeProbabilityCard.world_sim?.whale_mode, 'Runtime sports cards should expose the generic whale-mode digest inside world_sim.');

const normalizedSportsCard = indexTestables.normalizeCard(
  runtimeProbabilityCard,
  runtimeProbabilityCard.query_plan || {
    primary_domain_id: 'B.3.6.sports_outcomes_probability_mode',
    query_text: sportsQueryPlan.query_text,
    question_side_a: sportsQueryPlan.question_side_a,
    question_side_b: sportsQueryPlan.question_side_b,
    event_date: '2026-04-05',
  },
  {
    scorecard: sportsBenchmarkOnlyScorecard,
    evidenceBundle: {
      ...sportsEvidenceBase,
      sports_grounding: {
        ...sportsBenchmarkOnlyScorecard.publication_basis,
        ...sportsFixtureMetadata,
        fixture_id: sportsFixtureMetadata.fixture_id,
        question_side_a: 'Inter Milan',
        question_side_b: 'Roma',
        winning_side: 'Inter Milan',
        winning_probability: 0.58,
        sports_grounded: true,
        sports_pick_state: 'publishable_controlled',
        model_probabilities: sportsRawScorecard.sports_model_probabilities,
        market_probabilities: sportsRawScorecard.sports_market_probabilities,
        fair_prices: sportsRawScorecard.sports_fair_prices,
        market_frame: sharpMarketFrame,
        sports_market_source: 'api_football_optional',
        sports_market_source_class: 'sharp',
        sports_market_quality_tier: 'sharp',
        sports_market_snapshot: {
          snapshot_time: '2026-04-01T10:00:00.000Z',
          latest_snapshot: sharpMarketFrame.latest_snapshot,
        },
        sports_market_overround: 0.048,
      },
      sports_market_overlay: sportsEvidenceBase.sports_market_overlay,
      sports_semantic_overlay: {
        ready: true,
        confidence: 0.81,
        contradiction_score: 0.08,
        entity_alignment_score: 0.92,
      },
    },
  }
);

assert.equal(normalizedSportsCard.decision_state, 'no_action', 'Index card normalization should preserve generic whale-mode state.');
assert.equal(normalizedSportsCard.publication_basis?.decision_state, 'no_action', 'Index publication basis should preserve generic whale-mode state.');
assert.equal(normalizedSportsCard.sports_decision_state, 'no_bet', 'Index normalization should preserve sports-specific no_bet state.');
assert(normalizedSportsCard.world_sim?.whale_mode, 'Index normalization should preserve world_sim whale-mode data.');

const governanceDraftCard = indexTestables.buildDraftCard({
  queryText: 'Will the coalition government survive the budget vote?',
  queryPlan: {
    primary_domain_id: 'A.24.governance_policy_and_public_timeline',
    binary_frame: {
      question_side_a: 'Si',
      question_side_b: 'No',
    },
  },
  domainConfig: {
    domain_id: 'A.24.governance_policy_and_public_timeline',
    refresh_cadence: 'daily',
  },
  voicePayload: {
    title: 'Italian budget vote survival',
    summary: 'Crystal has a grounded policy read, but it still lacks a cleaner pricing baseline.',
    verdict: 'Grounded lean',
  },
  scorecard,
  evidenceBundle: {
    historical_baseline_20y: 'A 20-year policy baseline exists.',
    live_signals: [
      { lean: 'down', freshness_score: 0.82 },
      { lean: 'down', freshness_score: 0.74 },
    ],
    source_ledger: ['gdelt', 'rss_allowlist', 'polymarket_public'],
    entity_resolution: { resolved: true, entities: ['Italy'] },
    event_resolution: { resolved: true, jurisdiction: 'Italy' },
    evidence_quality: {
      coverage_score: 0.73,
      freshness_score: 0.79,
      agreement_score: 0.7,
      conflict_score: 0.22,
      source_count: 3,
    },
  },
});

assert.equal(governanceDraftCard.decision_state, 'grounded_lean', 'Draft cards should surface the generic grounded_lean state for grounded reads without a pricing baseline.');
assert.equal(
  governanceDraftCard.publication_basis?.decision_state,
  'grounded_lean',
  'Draft publication basis should keep the same generic whale-mode state.'
);

const clearEdgeDecision = buildSportsDecisionFrame({
  sportsGrounding: {
    fixture_resolved: true,
    sports_grounded: true,
    publish_gate_ready: true,
    fixture_window_open: true,
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
      away: 0.30,
      home_label: 'Italy',
      draw_label: 'Draw',
      away_label: 'Bosnia',
    },
    fair_prices: {
      home: 4.55,
      draw: 4.55,
      away: 1.79,
      home_label: 'Italy',
      draw_label: 'Draw',
      away_label: 'Bosnia',
    },
    model_favorite: 'Bosnia',
    market_favorite: 'Italy',
    invalidators: ['Bosnia loses lineup depth late'],
    market_disagreement_score: 0.18,
    sports_market_source: 'api_football_optional',
    sports_market_source_class: 'sharp',
    sports_market_quality_tier: 'sharp',
    market_frame: {
      ...sharpMarketFrame,
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
    },
  },
  sportsMarketOverlay: {
    market_frame: {
      ...sharpMarketFrame,
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
    },
    sports_market_source: 'api_football_optional',
    sports_market_source_class: 'sharp',
    sports_market_quality_tier: 'sharp',
    market_consensus_strength: 0.74,
    market_disagreement_score: 0.18,
    price_move_pressure: 0.19,
  },
  sportsSemanticOverlay: {
    ready: true,
    confidence: 0.83,
    contradiction_score: 0.08,
    entity_alignment_score: 0.9,
  },
  sportsContractState: {
    sportsGrounded: true,
    sportsPublishGateReady: true,
    fixtureWindowOpen: true,
    sportsPickState: 'publishable_controlled',
  },
  domainId: 'B.3.6.sports_outcomes_probability_mode',
  simulationTuning: {
    quality_score: 0.78,
    graph_coverage: 0.77,
    agent_convergence: 0.74,
  },
});

assert.equal(clearEdgeDecision.decision_state, 'edge', 'A robust model-vs-market mismatch should surface as an edge.');
assert.equal(clearEdgeDecision.model_favorite, 'Bosnia', 'Edge detection should preserve the model favorite.');
assert.equal(clearEdgeDecision.market_favorite, 'Italy', 'Edge detection should preserve the market favorite.');
assert.equal(clearEdgeDecision.market_source_class, 'sharp', 'Clear edge detection should still be anchored to sharp market truth.');

const retailOnlyNoBetDecision = buildSportsDecisionFrame({
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
  },
  sportsMarketOverlay: {
    sharp_market_available: false,
    retail_sentiment_only: true,
    retail_sentiment_pressure: 0.8,
    retail_bias_risk: 0.72,
    narrative_hype_score: 0.8,
  },
  sportsSemanticOverlay: {
    ready: true,
    confidence: 0.82,
    contradiction_score: 0.1,
    entity_alignment_score: 0.92,
  },
  sportsContractState: {
    sportsGrounded: true,
    sportsPublishGateReady: true,
    fixtureWindowOpen: true,
    sportsPickState: 'publishable_controlled',
  },
  domainId: 'B.3.6.sports_outcomes_probability_mode',
});

assert.equal(
  retailOnlyNoBetDecision.decision_state,
  'no_bet',
  'Retail sentiment without hard market truth should still resolve to no_bet.'
);
assert.equal(
  retailOnlyNoBetDecision.sharp_market_available,
  false,
  'Retail-only pressure should not be promoted into sharp market availability.'
);

const proxyOnlyNoEdgeDecision = buildSportsDecisionFrame({
  sportsGrounding: {
    fixture_resolved: true,
    sports_grounded: true,
    publish_gate_ready: true,
    fixture_window_open: true,
    question_side_a: 'Inter Milan',
    question_side_b: 'Roma',
    winning_side: 'Inter Milan',
    winning_probability: 0.57,
    model_probabilities: sportsRawScorecard.sports_model_probabilities,
    market_probabilities: sportsRawScorecard.sports_market_probabilities,
    fair_prices: sportsRawScorecard.sports_fair_prices,
    model_favorite: 'Inter Milan',
    market_favorite: 'Inter Milan',
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
      open_snapshot: null,
      latest_snapshot: {
        market_question: 'Inter Milan vs Roma',
        implied_probability: 0.58,
      },
      market_quality_tier: 'proxy',
    },
  },
  sportsMarketOverlay: {
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
      open_snapshot: null,
      latest_snapshot: {
        market_question: 'Inter Milan vs Roma',
        implied_probability: 0.58,
      },
      market_quality_tier: 'proxy',
    },
    market_consensus_strength: 0.61,
    market_disagreement_score: 0.14,
    price_move_pressure: 0.22,
    narrative_hype_score: 0.39,
  },
  sportsSemanticOverlay: {
    ready: true,
    confidence: 0.79,
    contradiction_score: 0.08,
    entity_alignment_score: 0.91,
  },
  sportsContractState: {
    sportsGrounded: true,
    sportsPublishGateReady: true,
    fixtureWindowOpen: true,
    sportsPickState: 'publishable_controlled',
  },
  domainId: 'B.3.6.sports_outcomes_probability_mode',
});

assert.notEqual(
  proxyOnlyNoEdgeDecision.decision_state,
  'edge',
  'Proxy-only market inputs must never be promoted to edge.'
);
assert.equal(proxyOnlyNoEdgeDecision.market_source_class, 'proxy', 'Proxy-only decisions should preserve proxy market classification.');

if (failures.length > 0) {
  console.error(`Prediction core benchmark failed with ${failures.length} issues.`);
  for (const failure of failures.slice(0, 20)) {
    console.error(`- ${failure.query}`);
    console.error(`  ${failure.reason}`);
  }
  process.exit(1);
}

console.log(`Prediction core benchmark passed on ${benchmarkCases.length} routing cases.`);
console.log(`Synthetic scorecard check passed with publication_state=${scorecard.publication_state}.`);
console.log(
  `Sports publish gate checks passed with blocked=${sportsBlockedScorecard.publication_state} and ready=${sportsReadyScorecard.publication_state}.`
);
