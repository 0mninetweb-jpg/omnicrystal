import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildRoutingHints, finalizeScorecard } = require('../functions/predictionCore.js');

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
  ['B.3.3.work_and_career_outcomes']
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
assert(scorecard.probability_split, 'Binary scorecard should expose a probability split');
assert.notEqual(scorecard.publication_state, 'blocked', 'Scorecard should not hard-block a directional read with valid evidence');

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
