import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildRoutingHints,
  finalizeScorecard,
  safeText,
} = require("../functions/predictionCore.js");
const { runContextualVariableSelection } = require("../functions/crystalCore/adapterRegistry.js");
const { __testables: runtimeTestables } = require("../functions/crystalCore/runtime.js");

export const MARKETS_CASES = [
  {
    cluster: "asset_direction",
    query: "Bitcoin next 30 days",
    expectedDomains: ["A.23.markets_and_asset_regimes"],
    binary: false,
    requiredSources: ["yahoo_finance", "google_trends"],
    requiredSlots: ["trend_signal", "range_signal", "regime_risk_signal"],
  },
  {
    cluster: "asset_direction",
    query: "Ethereum next 90 days",
    expectedDomains: ["A.23.markets_and_asset_regimes"],
    binary: false,
    requiredSources: ["yahoo_finance", "google_trends"],
    requiredSlots: ["trend_signal", "range_signal", "regime_risk_signal"],
  },
  {
    cluster: "asset_direction",
    query: "Will Bitcoin break higher this month?",
    expectedDomains: ["A.23.markets_and_asset_regimes"],
    binary: true,
    preferredWinner: "a",
    requiredSources: ["yahoo_finance", "google_trends", "polymarket_public"],
    requiredSlots: ["trend_signal", "range_signal", "regime_risk_signal", "consensus_reference"],
  },
  {
    cluster: "range_regime",
    query: "Oil price regime next 90 days",
    expectedDomains: ["A.23.markets_and_asset_regimes"],
    binary: false,
    requiredSources: ["yahoo_finance", "google_trends"],
    requiredSlots: ["trend_signal", "range_signal", "regime_risk_signal"],
  },
  {
    cluster: "range_regime",
    query: "Nasdaq volatility in the next month",
    expectedDomains: ["A.23.markets_and_asset_regimes"],
    binary: false,
    requiredSources: ["yahoo_finance", "google_trends"],
    requiredSlots: ["trend_signal", "range_signal", "regime_risk_signal"],
  },
  {
    cluster: "range_regime",
    query: "Market regime shift in tech stocks this summer",
    expectedDomains: ["A.23.markets_and_asset_regimes"],
    binary: false,
    requiredSources: ["yahoo_finance", "google_trends"],
    requiredSlots: ["trend_signal", "range_signal", "regime_risk_signal"],
  },
  {
    cluster: "consensus_reference",
    query: "Will gold outperform equities this quarter?",
    expectedDomains: ["A.23.markets_and_asset_regimes"],
    binary: true,
    preferredWinner: "b",
    requiredSources: ["yahoo_finance", "google_trends", "polymarket_public"],
    requiredSlots: ["trend_signal", "range_signal", "regime_risk_signal", "consensus_reference"],
  },
  {
    cluster: "consensus_reference",
    query: "Crypto risk appetite in the next 6 months",
    expectedDomains: ["A.23.markets_and_asset_regimes"],
    binary: false,
    requiredSources: ["yahoo_finance", "google_trends"],
    requiredSlots: ["trend_signal", "range_signal", "regime_risk_signal"],
  },
  {
    cluster: "macro_markets",
    query: "Will ECB rates fall by autumn?",
    expectedDomains: ["A.14.macro_economy_and_cycles", "A.23.markets_and_asset_regimes"],
    binary: false,
    requiredSources: ["google_trends"],
    optionalSources: ["fred_api"],
    requiredSlots: ["trend_signal", "macro_context"],
  },
  {
    cluster: "macro_markets",
    query: "Inflation in Italy next 12 months",
    expectedDomains: ["A.14.macro_economy_and_cycles", "A.23.markets_and_asset_regimes"],
    binary: false,
    requiredSources: ["google_trends"],
    optionalSources: ["fred_api"],
    requiredSlots: ["trend_signal", "macro_context"],
  },
  {
    cluster: "macro_markets",
    query: "EURUSD next quarter",
    expectedDomains: ["A.23.markets_and_asset_regimes", "A.14.macro_economy_and_cycles"],
    binary: false,
    requiredSources: ["yahoo_finance", "google_trends"],
    optionalSources: ["fred_api"],
    requiredSlots: ["trend_signal", "range_signal", "regime_risk_signal"],
  },
];

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function safeNumber(value, fallback = null) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function ensureDirname(filePath) {
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

function buildSyntheticContext({ fredEnabled = false } = {}) {
  return {
    db: null,
    admin: null,
    ai: null,
    fetchJson: async () => ({}),
    llmRuntime: {
      async generateText({ prompt }) {
        const focusLine = safeText(prompt).split("\n")[0] || "Markets baseline";
        return `${focusLine}. Over the last 20 years, trend persistence, range compression, and regime breaks have repeatedly shaped market outcomes.`;
      },
    },
    async fetchTrendSignal(queryText) {
      const corpus = safeText(queryText).toLowerCase();
      const lean =
        /break higher|bitcoin|ethereum|crypto risk appetite|eurusd/.test(corpus)
          ? "up"
          : /gold outperform|volatility|regime shift|inflation|rates/.test(corpus)
            ? "flat"
            : /fall|drawdown|under pressure/.test(corpus)
              ? "down"
              : "flat";
      return {
        source_id: "google_trends",
        label: "Search momentum",
        summary: `Google Trends shows ${lean === "up" ? "rising" : lean === "down" ? "cooling" : "mixed"} attention around ${safeText(queryText)}.`,
        lean,
        freshness_score: 0.74,
        trust_score: 0.64,
      };
    },
    async fetchYahooMarketSignal(queryText) {
      const corpus = safeText(queryText).toLowerCase();
      let label = "";
      let deltaPct = 0.018;
      let low = 0;
      let high = 0;
      if (/bitcoin/.test(corpus)) {
        label = "Bitcoin";
        deltaPct = /break higher/.test(corpus) ? 0.041 : 0.026;
        low = 61250;
        high = 66400;
      } else if (/ethereum/.test(corpus)) {
        label = "Ethereum";
        deltaPct = 0.024;
        low = 3160;
        high = 3388;
      } else if (/gold/.test(corpus)) {
        label = "Gold futures";
        deltaPct = 0.009;
        low = 2332;
        high = 2394;
      } else if (/oil/.test(corpus)) {
        label = "Crude oil futures";
        deltaPct = -0.014;
        low = 78.2;
        high = 84.1;
      } else if (/nasdaq|tech stocks/.test(corpus)) {
        label = "Nasdaq Composite";
        deltaPct = 0.011;
        low = 18150;
        high = 19090;
      } else if (/crypto risk appetite/.test(corpus)) {
        label = "Bitcoin proxy";
        deltaPct = 0.022;
        low = 60500;
        high = 66950;
      } else if (/eurusd|eur\/usd/.test(corpus)) {
        label = "EUR/USD";
        deltaPct = 0.007;
        low = 1.07;
        high = 1.1;
      } else {
        return null;
      }

      const lean = deltaPct > 0.02 ? "up" : deltaPct < -0.02 ? "down" : "flat";
      const midpoint = (high + low) / 2 || 1;
      const rangeWidthPct = (high - low) / midpoint;
      const regimeRisk = rangeWidthPct >= 0.12 ? "high" : rangeWidthPct >= 0.07 ? "medium" : "low";

      return {
        signals: [
          {
            source_id: "yahoo_finance",
            label: `${label} price regime`,
            summary: `${label} is ${lean === "up" ? "pushing higher" : lean === "down" ? "under pressure" : "holding a range"} over the recent window, trading between ${low.toFixed(2)} and ${high.toFixed(2)}.`,
            lean,
            freshness_score: 0.88,
            trust_score: 0.84,
          },
        ],
        source_trust_map: [
          {
            source_id: "yahoo_finance",
            trust_score: 0.84,
            note: `${label} synthetic chart data over the latest 45 days.`,
          },
        ],
        conflict_map: [],
        market_metrics: {
          symbol: label.toUpperCase().replace(/[^A-Z]/g, "") || "MARKET",
          label,
          latest_price: Number(high.toFixed(4)),
          prior_price: Number(low.toFixed(4)),
          delta_pct: Number(deltaPct.toFixed(4)),
          range_low: Number(low.toFixed(4)),
          range_high: Number(high.toFixed(4)),
          range_width_pct: Number(rangeWidthPct.toFixed(4)),
          regime_risk: regimeRisk,
        },
      };
    },
    async fetchFredMacroSignal(_fetchJson, queryText) {
      if (!fredEnabled) return null;
      const corpus = safeText(queryText).toLowerCase();
      let label = "";
      let latest = 0;
      let previous = 0;
      if (/ecb rates|rates/.test(corpus)) {
        label = "Euro area policy rate";
        latest = 3.75;
        previous = 4;
      } else if (/inflation/.test(corpus)) {
        label = "Euro area CPI";
        latest = 2.4;
        previous = 2.7;
      } else if (/eurusd|eur\/usd/.test(corpus)) {
        label = "Dollar liquidity proxy";
        latest = 101.2;
        previous = 102.4;
      } else {
        return null;
      }
      const delta = latest - previous;
      const lean = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      return {
        signals: [
          {
            source_id: "fred_api",
            label: `${label} macro pulse`,
            summary: `${label} moved from ${previous.toFixed(2)} to ${latest.toFixed(2)} in the latest observation window.`,
            lean,
            freshness_score: 0.78,
            trust_score: 0.82,
          },
        ],
        source_trust_map: [
          {
            source_id: "fred_api",
            trust_score: 0.82,
            note: `${label} via synthetic FRED macro fixture.`,
          },
        ],
        conflict_map: [],
        macro_metrics: {
          series_id: `synthetic_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          label,
          latest_value: Number(latest.toFixed(4)),
          previous_value: Number(previous.toFixed(4)),
          delta: Number(delta.toFixed(4)),
          lean,
        },
      };
    },
    async getPredictionMarketPulse({ queryText, queryPlan }) {
      if (!queryPlan?.binary_frame?.asks_binary_question) return null;
      return {
        market_slug: `synthetic-markets-${safeText(queryText).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)}`,
        market_question: `Synthetic markets reference for ${safeText(queryText)}`,
        outcome: safeText(queryPlan?.question_side_a, "Primary"),
        calibrated_probability: 0.57,
        implied_probability: 0.57,
        match_status: "reference",
      };
    },
  };
}

function normalizeSyntheticQueryPlan(queryText) {
  const routingHints = buildRoutingHints(queryText);
  return {
    routingHints,
    queryPlan: runtimeTestables.normalizeQueryPlanPayload(
      {},
      {
        routingHints,
        fallbackDomain: routingHints.primaryDomainId,
        queryText,
      }
    ),
  };
}

function computeTop3Hit(expectedDomains = [], routingHints = {}) {
  const topDomain = safeText(routingHints?.primaryDomainId);
  const topThree = Array.isArray(routingHints?.candidateDomains)
    ? routingHints.candidateDomains.slice(0, 3).map((candidate) => safeText(candidate?.domain_id)).filter(Boolean)
    : [];
  return expectedDomains.includes(topDomain) || expectedDomains.some((domainId) => topThree.includes(domainId));
}

function validateBinaryContract(scorecard = {}, queryPlan = {}) {
  const contract = scorecard?.binary_contract;
  if (!contract) {
    return {
      missing: true,
      ambiguousWinner: true,
      splitInconsistent: true,
    };
  }

  const sideA = safeText(contract?.question_side_a, safeText(queryPlan?.question_side_a));
  const sideB = safeText(contract?.question_side_b, safeText(queryPlan?.question_side_b));
  const winner = safeText(contract?.winning_side);
  const sideAProbability = safeNumber(contract?.question_side_a_probability);
  const sideBProbability = safeNumber(contract?.question_side_b_probability);
  const winningProbability = safeNumber(contract?.winning_probability);
  const ambiguousWinner = !winner || (winner !== sideA && winner !== sideB);
  const splitInconsistent =
    sideAProbability == null ||
    sideBProbability == null ||
    winningProbability == null ||
    Math.abs(sideAProbability + sideBProbability - 1) > 0.02 ||
    Math.abs((winner === sideA ? sideAProbability : sideBProbability) - winningProbability) > 0.02;

  return {
    missing: false,
    ambiguousWinner,
    splitInconsistent,
  };
}

function hasRequiredMarketSlots(marketStructure = {}, requiredSlots = []) {
  return (Array.isArray(requiredSlots) ? requiredSlots : []).every((slot) => {
    if (slot === "macro_context") {
      return Array.isArray(marketStructure?.macro_context) && marketStructure.macro_context.length > 0;
    }
    return Boolean(marketStructure?.[slot]);
  });
}

function buildSyntheticMarketsScorecard(caseItem, queryPlan, verifiedEvidencePack) {
  const domainConfig = { current_state: "limited", status_reason: "Markets benchmark synthetic run." };
  const keyDrivers = [
    "trend and momentum structure",
    "range pressure and volatility compression",
    "external consensus and market-implied baseline",
  ];

  if (caseItem.binary && queryPlan?.binary_frame?.asks_binary_question) {
    const sideA = safeText(queryPlan?.question_side_a, "Primary");
    const sideB = safeText(queryPlan?.question_side_b, "Alternative");
    const winningSide = caseItem.preferredWinner === "b" ? sideB : sideA;
    const primaryProbability = winningSide === sideA ? 0.58 : 0.42;
    return finalizeScorecard(
      {
        primary_call: winningSide,
        probability_split: {
          primary_label: sideA,
          primary_probability: primaryProbability,
          secondary_label: sideB,
          secondary_probability: Number((1 - primaryProbability).toFixed(3)),
        },
        key_drivers: keyDrivers,
        counter_signals: ["macro reversal risk", "consensus squeeze risk"],
        invalidators: ["range break against the dominant bias", "consensus repricing against the current call"],
        historical_anchors: ["20-year market regime analogs"],
        why_this_side: `Crystal leans ${winningSide} because trend, range, and consensus still stack on that side.`,
        recommended_posture: "Treat this as a bounded market read and watch the range and consensus flip conditions before acting harder.",
      },
      verifiedEvidencePack,
      queryPlan,
      domainConfig,
      { engine: "extended" }
    );
  }

  let primaryCall = "The market remains range-bound with mixed conviction over the selected horizon.";
  if (caseItem.cluster === "asset_direction") {
    primaryCall = "The asset is likely to stay in range with a mild bullish bias over the selected horizon.";
  } else if (caseItem.cluster === "range_regime") {
    primaryCall = "Range pressure remains elevated and regime-break risk is still live over the selected horizon.";
  } else if (caseItem.cluster === "consensus_reference") {
    primaryCall = "Risk appetite still leans constructive, but the edge remains bounded by range pressure and consensus positioning.";
  } else if (caseItem.cluster === "macro_markets") {
    primaryCall = "Macro market pressure remains elevated over the selected window, with rates and liquidity still shaping the read.";
  }

  return finalizeScorecard(
    {
      primary_call: primaryCall,
      key_drivers: keyDrivers,
      counter_signals: ["consensus repricing", "macro spillover reversal"],
      invalidators: ["a sharper regime-break signal", "a reversal in search and price momentum"],
      historical_anchors: ["20-year market and liquidity analogs"],
      why_this_side: "Crystal is ordering the read through trend, range, regime risk, and consensus instead of relying on a generic asset summary.",
      recommended_posture: "Use this as a bounded market read and keep watching the range and macro triggers before acting harder.",
    },
    verifiedEvidencePack,
    queryPlan,
    domainConfig,
    { engine: "extended" }
  );
}

function findPreviousReportPath(reportDir, currentDate) {
  return fs
    .readdir(reportDir)
    .then((entries) =>
      entries
        .filter((entry) => /^markets-quality-report-\d{4}-\d{2}-\d{2}\.json$/.test(entry) && !entry.includes(currentDate))
        .sort()
        .pop() || ""
    )
    .catch(() => "");
}

export async function runMarketsAssetsBenchmark({
  currentDate = new Date().toISOString().slice(0, 10),
  fredEnabled = Boolean(process.env.FRED_API_KEY),
} = {}) {
  const context = buildSyntheticContext({ fredEnabled });
  const cases = [];

  for (const caseItem of MARKETS_CASES) {
    const { routingHints, queryPlan } = normalizeSyntheticQueryPlan(caseItem.query);
    const { variable_selection_pack: variableSelectionPack } = runContextualVariableSelection(queryPlan);
    const verifiedEvidencePack = await runtimeTestables.buildVerifiedEvidencePack(context, {
      runId: null,
      queryText: caseItem.query,
      normalizedQuery: queryPlan,
      variableSelectionPack,
      engine: "extended",
    });
    const scorecard = buildSyntheticMarketsScorecard(caseItem, queryPlan, verifiedEvidencePack);
    const binaryContractStatus = caseItem.binary ? validateBinaryContract(scorecard, queryPlan) : { missing: false, ambiguousWinner: false, splitInconsistent: false };
    const selectedVariables = Array.isArray(variableSelectionPack?.selected_variables) ? variableSelectionPack.selected_variables : [];
    const selectedAdapterIds = uniqueStrings(selectedVariables.map((variable) => safeText(variable?.source_adapter)).filter(Boolean));
    const usedSources = uniqueStrings(verifiedEvidencePack?.source_ledger || []);
    const missingRequiredSources = (caseItem.requiredSources || []).filter((sourceId) => !usedSources.includes(sourceId));
    const missingOptionalSources = (caseItem.optionalSources || []).filter((sourceId) => !usedSources.includes(sourceId));
    const topThree = Array.isArray(routingHints?.candidateDomains)
      ? routingHints.candidateDomains.slice(0, 3).map((candidate) => safeText(candidate?.domain_id)).filter(Boolean)
      : [];
    const marketStructure = verifiedEvidencePack?.market_structure || null;
    const marketStructureReady = hasRequiredMarketSlots(marketStructure, caseItem.requiredSlots);
    const contradictoryCall =
      caseItem.binary &&
      safeText(scorecard?.primary_call) &&
      safeText(scorecard?.binary_contract?.display_call) &&
      safeText(scorecard?.primary_call) !== safeText(scorecard?.binary_contract?.display_call);

    cases.push({
      ...caseItem,
      primary_domain_id: safeText(queryPlan?.primary_domain_id, safeText(routingHints?.primaryDomainId)),
      candidate_domains_top3: topThree,
      top3_hit: computeTop3Hit(caseItem.expectedDomains, routingHints),
      intent_shape: safeText(queryPlan?.intent_shape),
      resolution_frame: safeText(queryPlan?.resolution_frame),
      question_side_a: safeText(queryPlan?.question_side_a),
      question_side_b: safeText(queryPlan?.question_side_b),
      selected_adapter_ids: selectedAdapterIds,
      markets_adapter_selected: selectedAdapterIds.includes("markets_assets"),
      used_sources: usedSources,
      source_usage: verifiedEvidencePack?.source_usage || null,
      market_structure: marketStructure,
      market_structure_ready: marketStructureReady,
      missing_required_sources: missingRequiredSources,
      missing_optional_sources: missingOptionalSources,
      optional_source_missing: missingOptionalSources.length > 0,
      primary_call: safeText(scorecard?.primary_call),
      card_state: safeText(scorecard?.publication_state),
      binary_winning_side: safeText(scorecard?.binary_contract?.winning_side),
      binary_band: safeText(scorecard?.binary_contract?.band),
      binary_winning_probability: safeNumber(scorecard?.binary_contract?.winning_probability),
      binary_contract_missing: caseItem.binary ? binaryContractStatus.missing : false,
      binary_winner_ambiguous: caseItem.binary ? binaryContractStatus.ambiguousWinner : false,
      binary_split_inconsistent: caseItem.binary ? binaryContractStatus.splitInconsistent : false,
      contradictory_call: contradictoryCall,
    });
  }

  const totalCases = cases.length;
  const binaryCases = cases.filter((caseItem) => caseItem.binary);
  const generalFallbackCount = cases.filter((caseItem) => safeText(caseItem.primary_domain_id) === "A.0.general.general_forecast").length;
  const generalFallbackRate = totalCases > 0 ? Number((generalFallbackCount / totalCases).toFixed(4)) : null;
  const marketsAdapterMissingCount = cases.filter((caseItem) => !caseItem.markets_adapter_selected).length;
  const sourceCoverageFailures = cases.filter((caseItem) => caseItem.missing_required_sources.length > 0).length;
  const optionalSourceMissingCount = cases.filter((caseItem) => caseItem.missing_optional_sources.length > 0).length;
  const marketStructureFailures = cases.filter((caseItem) => !caseItem.market_structure_ready).length;
  const missingBinaryContractCount = binaryCases.filter((caseItem) => caseItem.binary_contract_missing).length;
  const ambiguousWinnerCount = binaryCases.filter((caseItem) => caseItem.binary_winner_ambiguous).length;
  const splitInconsistencyCount = binaryCases.filter((caseItem) => caseItem.binary_split_inconsistent).length;
  const contradictoryCallCount = cases.filter((caseItem) => caseItem.contradictory_call).length;
  const clusterSummary = Object.fromEntries(
    uniqueStrings(cases.map((caseItem) => caseItem.cluster)).map((cluster) => {
      const scopedCases = cases.filter((caseItem) => caseItem.cluster === cluster);
      return [
        cluster,
        {
          cases: scopedCases.length,
          used_sources: uniqueStrings(scopedCases.flatMap((caseItem) => caseItem.used_sources || [])),
          missing_required_sources: uniqueStrings(scopedCases.flatMap((caseItem) => caseItem.missing_required_sources || [])),
          missing_optional_sources: uniqueStrings(scopedCases.flatMap((caseItem) => caseItem.missing_optional_sources || [])),
        },
      ];
    })
  );

  const summary = {
    generated_at: new Date().toISOString(),
    report_date: currentDate,
    total_cases: totalCases,
    binary_cases: binaryCases.length,
    general_fallback_rate: generalFallbackRate,
    markets_adapter_missing_count: marketsAdapterMissingCount,
    source_coverage_failures: sourceCoverageFailures,
    optional_source_missing_count: optionalSourceMissingCount,
    market_structure_failures: marketStructureFailures,
    missing_binary_contract_count: missingBinaryContractCount,
    ambiguous_winner_count: ambiguousWinnerCount,
    split_inconsistency_count: splitInconsistencyCount,
    contradictory_call_count: contradictoryCallCount,
    verdict:
      generalFallbackRate != null &&
      generalFallbackRate < 0.1 &&
      marketsAdapterMissingCount === 0 &&
      sourceCoverageFailures === 0 &&
      marketStructureFailures === 0 &&
      missingBinaryContractCount === 0 &&
      ambiguousWinnerCount === 0 &&
      splitInconsistencyCount === 0 &&
      contradictoryCallCount === 0
        ? "markets-ready"
        : "needs-work",
  };

  return {
    summary,
    clusters: clusterSummary,
    cases,
  };
}

export async function writeMarketsAssetsReport({
  currentDate = new Date().toISOString().slice(0, 10),
  docsDir = path.resolve(process.cwd(), "docs"),
  fredEnabled = Boolean(process.env.FRED_API_KEY),
} = {}) {
  const report = await runMarketsAssetsBenchmark({ currentDate, fredEnabled });
  const markdownPath = path.join(docsDir, `markets-quality-report-${currentDate}.md`);
  const jsonPath = path.join(docsDir, `markets-quality-report-${currentDate}.json`);
  const previousReportFile = await findPreviousReportPath(docsDir, currentDate);
  let regressionLines = ["- No prior baseline report found."];

  if (previousReportFile) {
    const previousPath = path.join(docsDir, previousReportFile);
    const previousReport = JSON.parse(await fs.readFile(previousPath, "utf8"));
    const previousSummary = previousReport?.summary || {};
    regressionLines = [
      `- Previous report: \`${previousReportFile}\``,
      `- General fallback rate: \`${previousSummary.general_fallback_rate ?? "n/a"}\` -> \`${report.summary.general_fallback_rate}\``,
      `- Markets adapter missing count: \`${previousSummary.markets_adapter_missing_count ?? "n/a"}\` -> \`${report.summary.markets_adapter_missing_count}\``,
      `- Source coverage failures: \`${previousSummary.source_coverage_failures ?? "n/a"}\` -> \`${report.summary.source_coverage_failures}\``,
      `- Market structure failures: \`${previousSummary.market_structure_failures ?? "n/a"}\` -> \`${report.summary.market_structure_failures}\``,
    ];
  }

  const recommendation =
    report.summary.verdict === "markets-ready" ? "activate_calibrated_thresholds" : "hold_static_thresholds";

  const markdown = [
    `# Markets Quality Report - ${currentDate}`,
    "",
    "## Summary",
    `- Total cases: \`${report.summary.total_cases}\``,
    `- Binary cases: \`${report.summary.binary_cases}\``,
    `- A.0.general fallback rate: \`${report.summary.general_fallback_rate}\``,
    `- Markets adapter missing count: \`${report.summary.markets_adapter_missing_count}\``,
    `- Source coverage failures: \`${report.summary.source_coverage_failures}\``,
    `- Optional source missing count: \`${report.summary.optional_source_missing_count}\``,
    `- Market structure failures: \`${report.summary.market_structure_failures}\``,
    `- Missing binary contract count: \`${report.summary.missing_binary_contract_count}\``,
    `- Ambiguous winner count: \`${report.summary.ambiguous_winner_count}\``,
    `- Split inconsistency count: \`${report.summary.split_inconsistency_count}\``,
    `- Contradictory call count: \`${report.summary.contradictory_call_count}\``,
    `- Recommendation: \`${recommendation}\``,
    `- Verdict: **${report.summary.verdict}**`,
    "",
    "## Cluster Source Coverage",
    ...Object.entries(report.clusters).flatMap(([cluster, item]) => [
      `### ${cluster}`,
      `- Cases: \`${item.cases}\``,
      `- Used sources: ${item.used_sources.length ? item.used_sources.map((source) => `\`${source}\``).join(", ") : "none"}`,
      `- Missing required sources: ${item.missing_required_sources.length ? item.missing_required_sources.map((source) => `\`${source}\``).join(", ") : "none"}`,
      `- Missing optional sources: ${item.missing_optional_sources.length ? item.missing_optional_sources.map((source) => `\`${source}\``).join(", ") : "none"}`,
      "",
    ]),
    "## Regression vs Previous Report",
    ...regressionLines,
    "",
    "## Benchmark",
    "| Cluster | Query | Domain | Market structure | Sources | Optional missing | Call |",
    "|---|---|---|---|---|---|---|",
    ...report.cases.map(
      (caseItem) =>
        `| ${caseItem.cluster} | ${caseItem.query} | ${caseItem.primary_domain_id} | ${caseItem.market_structure_ready ? "ready" : "missing"} | ${(caseItem.used_sources || []).join(", ") || "-"} | ${(caseItem.missing_optional_sources || []).join(", ") || "-"} | ${caseItem.primary_call || "-"} |`
    ),
    "",
    "## Open Issues",
    ...(report.cases.some(
      (caseItem) =>
        !caseItem.top3_hit ||
        caseItem.missing_required_sources.length > 0 ||
        !caseItem.market_structure_ready ||
        caseItem.binary_contract_missing ||
        caseItem.binary_winner_ambiguous ||
        caseItem.binary_split_inconsistent ||
        caseItem.contradictory_call
    )
      ? report.cases.flatMap((caseItem) => {
          const issues = [];
          if (!caseItem.top3_hit) issues.push(`top-3 miss (${caseItem.candidate_domains_top3.join(", ")})`);
          if (caseItem.missing_required_sources.length > 0) issues.push(`missing required sources: ${caseItem.missing_required_sources.join(", ")}`);
          if (!caseItem.market_structure_ready) issues.push("market_structure incomplete");
          if (caseItem.binary_contract_missing) issues.push("missing binary contract");
          if (caseItem.binary_winner_ambiguous) issues.push("ambiguous winner");
          if (caseItem.binary_split_inconsistent) issues.push("split inconsistent");
          if (caseItem.contradictory_call) issues.push("contradictory call");
          return issues.length > 0 ? [`- ${caseItem.query}: ${issues.join("; ")}`] : [];
        })
      : ["- None."]),
    "",
  ].join("\n");

  await ensureDirname(markdownPath);
  await fs.writeFile(markdownPath, markdown, "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  return {
    markdownPath,
    jsonPath,
    report,
  };
}
