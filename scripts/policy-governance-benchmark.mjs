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

export const POLICY_CASES = [
  {
    cluster: "referendum",
    query: "Cosa passera al referendum costituzionale di marzo in Italia? si o no",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: true,
    requiredMetadata: ["event_date", "jurisdiction", "governing_entity"],
    preferredWinner: "b",
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "polymarket_public"],
  },
  {
    cluster: "referendum",
    query: "Will the new Italian constitutional referendum pass?",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: true,
    requiredMetadata: ["jurisdiction", "governing_entity"],
    preferredWinner: "b",
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "polymarket_public"],
  },
  {
    cluster: "policy_risk",
    query: "Will the coalition government survive the budget vote in Italy?",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: true,
    requiredMetadata: ["jurisdiction", "governing_entity"],
    preferredWinner: "a",
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "polymarket_public"],
  },
  {
    cluster: "policy_risk",
    query: "Quanto e probabile un cambio di governo in Francia nei prossimi 6 mesi?",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: true,
    requiredMetadata: ["jurisdiction", "governing_entity", "event_date"],
    preferredWinner: "b",
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "polymarket_public"],
  },
  {
    cluster: "regulatory_decision",
    query: "Will the new regulation be approved by parliament?",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: true,
    requiredMetadata: ["governing_entity"],
    preferredWinner: "a",
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "polymarket_public"],
  },
  {
    cluster: "regulatory_decision",
    query: "Will the senate approve the reform package this quarter?",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: true,
    requiredMetadata: ["event_date", "governing_entity"],
    preferredWinner: "a",
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "polymarket_public"],
  },
  {
    cluster: "public_timeline",
    query: "Election volatility in Italy over the next 90 days",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: false,
    requiredMetadata: ["event_date", "jurisdiction", "governing_entity"],
    requiredSources: ["wikidata", "gdelt", "rss_allowlist"],
  },
  {
    cluster: "public_timeline",
    query: "Policy pressure around EU AI regulation next 90 days",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: false,
    requiredMetadata: ["event_date", "jurisdiction", "governing_entity"],
    requiredSources: ["wikidata", "gdelt", "rss_allowlist"],
  },
  {
    cluster: "policy_risk",
    query: "Rischio di elezioni anticipate in Italia entro 12 mesi",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: true,
    requiredMetadata: ["event_date", "jurisdiction", "governing_entity"],
    preferredWinner: "b",
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "polymarket_public"],
  },
  {
    cluster: "regulatory_decision",
    query: "Will parliament block the reform package before autumn?",
    expectedDomains: ["A.24.governance_policy_and_public_timeline"],
    binary: true,
    requiredMetadata: ["event_date", "governing_entity"],
    preferredWinner: "b",
    requiredSources: ["wikidata", "gdelt", "rss_allowlist", "polymarket_public"],
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

function pickSyntheticWikidataId(label = "") {
  const normalized = safeText(label).toLowerCase();
  if (normalized === "italy") return "Q38";
  if (normalized === "france") return "Q142";
  if (normalized === "european union") return "Q458";
  if (normalized === "coalition government") return "Q714676";
  if (normalized === "government") return "Q7188";
  if (normalized === "parliament") return "Q11005";
  if (normalized === "senate") return "Q210560";
  if (normalized === "eu institutions") return "Q458";
  if (normalized === "voters") return "Q417240";
  if (normalized === "constitutional referendum") return "Q43109";
  return `Q${Math.abs([...normalized].reduce((sum, char) => sum + char.charCodeAt(0), 0)) || 999}`;
}

function buildSyntheticContext() {
  return {
    db: null,
    admin: null,
    ai: null,
    fetchJson: async () => ({}),
    llmRuntime: {
      async generateText({ prompt }) {
        const focusLine = safeText(prompt).split("\n")[0] || "Policy baseline";
        return `${focusLine}. Over the last 20 years, institutional calendars, coalition incentives, and regulatory bottlenecks have repeatedly driven the final outcome.`;
      },
    },
    async fetchWikidataEntitySignal(_fetchJson, normalizedQuery = {}) {
      const label =
        safeText((Array.isArray(normalizedQuery?.entities) ? normalizedQuery.entities[0] : null)?.label) ||
        safeText(normalizedQuery?.jurisdiction) ||
        safeText(normalizedQuery?.governing_entity);
      if (!label) return null;
      return {
        signals: [
          {
            source_id: "wikidata",
            label: "Entity resolution",
            summary: `Primary policy entity resolved as ${label} (${pickSyntheticWikidataId(label)}).`,
            lean: "flat",
            freshness_score: 0.54,
            trust_score: 0.8,
          },
        ],
        source_trust_map: [
          {
            source_id: "wikidata",
            trust_score: 0.8,
            note: `Resolved ${label} into a stable entity node.`,
          },
        ],
        conflict_map: [],
      };
    },
    async fetchGdeltAttentionSignal(_fetchJson, queryText, normalizedQuery = {}) {
      const focus = safeText(normalizedQuery?.jurisdiction, safeText(queryText).split(" ").slice(0, 4).join(" "));
      return {
        signals: [
          {
            source_id: "gdelt",
            label: "Attention and event flow",
            summary: `Recent policy/event attention is active around ${focus}. Institutional coverage remains elevated across recent articles.`,
            lean: "up",
            freshness_score: 0.82,
            trust_score: 0.66,
          },
        ],
        source_trust_map: [
          {
            source_id: "gdelt",
            trust_score: 0.66,
            note: "Recent attention flow from the GDELT document API.",
          },
        ],
        conflict_map: [],
      };
    },
    async fetchAllowlistedRssSignal(queryText, normalizedQuery = {}) {
      const focus = safeText(normalizedQuery?.governing_entity, safeText(queryText).split(" ").slice(0, 5).join(" "));
      return {
        signals: [
          {
            source_id: "rss_allowlist",
            label: "Reuters allowlist signal",
            summary: `Allowlisted policy headlines remain active around ${focus}, keeping the institutional path live.`,
            lean: "up",
            freshness_score: 0.78,
            trust_score: 0.64,
          },
        ],
        source_trust_map: [
          {
            source_id: "rss_allowlist",
            trust_score: 0.64,
            note: "Allowlisted Reuters RSS coverage aligned with the current policy query.",
          },
        ],
        conflict_map: [],
      };
    },
    async getPredictionMarketPulse({ queryPlan, queryText }) {
      if (!queryPlan?.binary_frame?.asks_binary_question) return null;
      return {
        market_slug: `synthetic-policy-${safeText(queryText).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)}`,
        market_question: `Synthetic policy market for ${safeText(queryText)}`,
        outcome: safeText(queryPlan?.question_side_a, "Primary"),
        calibrated_probability: 0.56,
        implied_probability: 0.56,
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

function buildSyntheticPolicyScorecard(caseItem, queryPlan, verifiedEvidencePack) {
  const binaryFrame = queryPlan?.binary_frame || {};
  if (caseItem.binary && binaryFrame.asks_binary_question) {
    const sideA = safeText(queryPlan?.question_side_a, "Yes");
    const sideB = safeText(queryPlan?.question_side_b, "No");
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
        key_drivers: [
          "institutional calendar discipline",
          "coalition pressure and approval bottlenecks",
          "recent event/news attention",
        ],
        counter_signals: ["late political reversal", "unexpected coalition consolidation"],
        invalidators: ["credible vote count shift", "institutional veto reversal"],
        historical_anchors: ["20-year policy baseline and approval path analogs"],
        why_this_side: `Crystal leans ${winningSide} because institutional incentives and live attention remain aligned on that side.`,
        recommended_posture: "Treat this as a bounded policy read and keep watching the flip conditions before acting harder.",
      },
      verifiedEvidencePack,
      queryPlan,
      { current_state: "limited", status_reason: "Policy benchmark synthetic run." },
      { engine: "extended" }
    );
  }

  return finalizeScorecard(
    {
      primary_call: "Policy pressure remains elevated over the selected window.",
      key_drivers: [
        "institutional calendar discipline",
        "coalition pressure and approval bottlenecks",
        "recent event/news attention",
      ],
      counter_signals: ["late narrative reversal", "policy de-escalation"],
      invalidators: ["sudden legislative pause", "unexpected coalition agreement"],
      historical_anchors: ["20-year policy baseline and event-cycle analogs"],
      why_this_side: "Crystal sees continuing policy pressure because live attention and institutional timing are still aligned.",
      recommended_posture: "Use this as a directional policy read and monitor the invalidation triggers.",
    },
    verifiedEvidencePack,
    queryPlan,
    { current_state: "limited", status_reason: "Policy benchmark synthetic run." },
    { engine: "extended" }
  );
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

function findPreviousReportPath(reportDir, currentDate) {
  return fs
    .readdir(reportDir)
    .then((entries) =>
      entries
        .filter((entry) => /^policy-quality-report-\d{4}-\d{2}-\d{2}\.json$/.test(entry) && !entry.includes(currentDate))
        .sort()
        .pop() || ""
    )
    .catch(() => "");
}

export async function runPolicyGovernanceBenchmark({ currentDate = new Date().toISOString().slice(0, 10) } = {}) {
  const context = buildSyntheticContext();
  const cases = [];

  for (const caseItem of POLICY_CASES) {
    const { routingHints, queryPlan } = normalizeSyntheticQueryPlan(caseItem.query);
    const { variable_selection_pack: variableSelectionPack } = runContextualVariableSelection(queryPlan);
    const verifiedEvidencePack = await runtimeTestables.buildVerifiedEvidencePack(context, {
      runId: null,
      queryText: caseItem.query,
      normalizedQuery: queryPlan,
      variableSelectionPack,
      engine: "extended",
    });
    const scorecard = buildSyntheticPolicyScorecard(caseItem, queryPlan, verifiedEvidencePack);
    const binaryContractStatus = validateBinaryContract(scorecard, queryPlan);
    const selectedVariables = Array.isArray(variableSelectionPack?.selected_variables) ? variableSelectionPack.selected_variables : [];
    const selectedVariableLabels = selectedVariables.map((variable) => safeText(variable?.label)).filter(Boolean);
    const selectedAdapterIds = uniqueStrings(selectedVariables.map((variable) => safeText(variable?.source_adapter)).filter(Boolean));
    const usedSources = uniqueStrings(verifiedEvidencePack?.source_ledger || []);
    const missingRequiredSources = (caseItem.requiredSources || []).filter((sourceId) => !usedSources.includes(sourceId));
    const missingMetadata = (caseItem.requiredMetadata || []).filter((field) => !safeText(queryPlan?.[field]));
    const topThree = Array.isArray(routingHints?.candidateDomains)
      ? routingHints.candidateDomains.slice(0, 3).map((candidate) => safeText(candidate?.domain_id)).filter(Boolean)
      : [];

    cases.push({
      ...caseItem,
      primary_domain_id: safeText(queryPlan?.primary_domain_id, safeText(routingHints?.primaryDomainId)),
      candidate_domains_top3: topThree,
      top3_hit: computeTop3Hit(caseItem.expectedDomains, routingHints),
      intent_shape: safeText(queryPlan?.intent_shape),
      resolution_frame: safeText(queryPlan?.resolution_frame),
      question_side_a: safeText(queryPlan?.question_side_a),
      question_side_b: safeText(queryPlan?.question_side_b),
      event_date: safeText(queryPlan?.event_date),
      jurisdiction: safeText(queryPlan?.jurisdiction),
      governing_entity: safeText(queryPlan?.governing_entity),
      selected_variable_labels: selectedVariableLabels,
      selected_adapter_ids: selectedAdapterIds,
      policy_adapter_selected: selectedAdapterIds.includes("policy_risk"),
      used_sources: usedSources,
      source_usage: verifiedEvidencePack?.source_usage || null,
      missing_required_sources: missingRequiredSources,
      missing_metadata: missingMetadata,
      primary_call: safeText(scorecard?.primary_call),
      card_state: safeText(scorecard?.publication_state),
      binary_winning_side: safeText(scorecard?.binary_contract?.winning_side),
      binary_band: safeText(scorecard?.binary_contract?.band),
      binary_winning_probability: safeNumber(scorecard?.binary_contract?.winning_probability),
      binary_contract_missing: binaryContractStatus.missing,
      binary_winner_ambiguous: binaryContractStatus.ambiguousWinner,
      binary_split_inconsistent: binaryContractStatus.splitInconsistent,
    });
  }

  const totalCases = cases.length;
  const binaryCases = cases.filter((caseItem) => caseItem.binary);
  const top3MissCount = cases.filter((caseItem) => !caseItem.top3_hit).length;
  const generalFallbackCount = cases.filter(
    (caseItem) => safeText(caseItem.primary_domain_id) === "A.0.general.general_forecast"
  ).length;
  const policyAdapterMissingCount = cases.filter((caseItem) => !caseItem.policy_adapter_selected).length;
  const missingMetadataCount = cases.filter((caseItem) => caseItem.missing_metadata.length > 0).length;
  const sourceCoverageFailures = cases.filter((caseItem) => caseItem.missing_required_sources.length > 0).length;
  const missingBinaryContractCount = binaryCases.filter((caseItem) => caseItem.binary_contract_missing).length;
  const ambiguousWinnerCount = binaryCases.filter((caseItem) => caseItem.binary_winner_ambiguous).length;
  const splitInconsistencyCount = binaryCases.filter((caseItem) => caseItem.binary_split_inconsistent).length;
  const generalFallbackRate = totalCases > 0 ? Number((generalFallbackCount / totalCases).toFixed(4)) : null;
  const sourceCoverageByCluster = Object.fromEntries(
    uniqueStrings(cases.map((caseItem) => caseItem.cluster)).map((cluster) => {
      const scopedCases = cases.filter((caseItem) => caseItem.cluster === cluster);
      const usedSourceIds = uniqueStrings(scopedCases.flatMap((caseItem) => caseItem.used_sources || []));
      return [
        cluster,
        {
          cases: scopedCases.length,
          used_sources: usedSourceIds,
          missing_required_sources: uniqueStrings(scopedCases.flatMap((caseItem) => caseItem.missing_required_sources || [])),
        },
      ];
    })
  );

  const summary = {
    generated_at: new Date().toISOString(),
    report_date: currentDate,
    total_cases: totalCases,
    binary_cases: binaryCases.length,
    top3_miss_count: top3MissCount,
    general_fallback_rate: generalFallbackRate,
    policy_adapter_missing_count: policyAdapterMissingCount,
    missing_metadata_count: missingMetadataCount,
    source_coverage_failures: sourceCoverageFailures,
    missing_binary_contract_count: missingBinaryContractCount,
    ambiguous_winner_count: ambiguousWinnerCount,
    split_inconsistency_count: splitInconsistencyCount,
    verdict:
      generalFallbackRate != null &&
      generalFallbackRate < 0.1 &&
      policyAdapterMissingCount === 0 &&
      missingMetadataCount === 0 &&
      sourceCoverageFailures === 0 &&
      missingBinaryContractCount === 0 &&
      ambiguousWinnerCount === 0 &&
      splitInconsistencyCount === 0
        ? "policy-ready"
        : "needs-work",
  };

  return {
    summary,
    clusters: sourceCoverageByCluster,
    cases,
  };
}

export async function writePolicyGovernanceReport({
  currentDate = new Date().toISOString().slice(0, 10),
  docsDir = path.resolve(process.cwd(), "docs"),
} = {}) {
  const report = await runPolicyGovernanceBenchmark({ currentDate });
  const markdownPath = path.join(docsDir, `policy-quality-report-${currentDate}.md`);
  const jsonPath = path.join(docsDir, `policy-quality-report-${currentDate}.json`);
  const previousReportFile = await findPreviousReportPath(docsDir, currentDate);
  let regressionLines = ["- No prior baseline report found."];

  if (previousReportFile) {
    const previousPath = path.join(docsDir, previousReportFile);
    const previousReport = JSON.parse(await fs.readFile(previousPath, "utf8"));
    const previousSummary = previousReport?.summary || {};
    regressionLines = [
      `- Previous report: \`${previousReportFile}\``,
      `- General fallback rate: \`${previousSummary.general_fallback_rate ?? "n/a"}\` -> \`${report.summary.general_fallback_rate}\``,
      `- Policy adapter missing count: \`${previousSummary.policy_adapter_missing_count ?? "n/a"}\` -> \`${report.summary.policy_adapter_missing_count}\``,
      `- Source coverage failures: \`${previousSummary.source_coverage_failures ?? "n/a"}\` -> \`${report.summary.source_coverage_failures}\``,
      `- Missing binary contract count: \`${previousSummary.missing_binary_contract_count ?? "n/a"}\` -> \`${report.summary.missing_binary_contract_count}\``,
    ];
  }

  const markdown = [
    `# Policy Quality Report - ${currentDate}`,
    "",
    "## Summary",
    `- Total cases: \`${report.summary.total_cases}\``,
    `- Binary cases: \`${report.summary.binary_cases}\``,
    `- A.0.general fallback rate: \`${report.summary.general_fallback_rate}\``,
    `- Policy adapter missing count: \`${report.summary.policy_adapter_missing_count}\``,
    `- Missing metadata count: \`${report.summary.missing_metadata_count}\``,
    `- Source coverage failures: \`${report.summary.source_coverage_failures}\``,
    `- Missing binary contract count: \`${report.summary.missing_binary_contract_count}\``,
    `- Ambiguous winner count: \`${report.summary.ambiguous_winner_count}\``,
    `- Split inconsistency count: \`${report.summary.split_inconsistency_count}\``,
    `- Verdict: **${report.summary.verdict}**`,
    "",
    "## Cluster Source Coverage",
    ...Object.entries(report.clusters).flatMap(([cluster, item]) => [
      `### ${cluster}`,
      `- Cases: \`${item.cases}\``,
      `- Used sources: ${item.used_sources.length ? item.used_sources.map((source) => `\`${source}\``).join(", ") : "none"}`,
      `- Missing required sources: ${item.missing_required_sources.length ? item.missing_required_sources.map((source) => `\`${source}\``).join(", ") : "none"}`,
      "",
    ]),
    "## Regression vs Previous Report",
    ...regressionLines,
    "",
    "## Benchmark",
    "| Cluster | Query | Domain | Event date | Jurisdiction | Governing entity | Policy adapter | Sources | Call |",
    "|---|---|---|---|---|---|---|---|---|",
    ...report.cases.map(
      (caseItem) =>
        `| ${caseItem.cluster} | ${caseItem.query} | ${caseItem.primary_domain_id} | ${caseItem.event_date || "-"} | ${caseItem.jurisdiction || "-"} | ${caseItem.governing_entity || "-"} | ${caseItem.policy_adapter_selected ? "yes" : "no"} | ${(caseItem.used_sources || []).join(", ") || "-"} | ${caseItem.primary_call || "-"} |`
    ),
    "",
    "## Open Issues",
    ...(report.cases.some(
      (caseItem) =>
        !caseItem.top3_hit ||
        caseItem.missing_metadata.length > 0 ||
        caseItem.missing_required_sources.length > 0 ||
        (caseItem.binary && caseItem.binary_contract_missing) ||
        (caseItem.binary && caseItem.binary_winner_ambiguous) ||
        (caseItem.binary && caseItem.binary_split_inconsistent)
    )
      ? report.cases.flatMap((caseItem) => {
          const issues = [];
          if (!caseItem.top3_hit) issues.push(`top-3 miss (${caseItem.candidate_domains_top3.join(", ")})`);
          if (caseItem.missing_metadata.length > 0) issues.push(`missing metadata: ${caseItem.missing_metadata.join(", ")}`);
          if (caseItem.missing_required_sources.length > 0) issues.push(`missing sources: ${caseItem.missing_required_sources.join(", ")}`);
          if (caseItem.binary && caseItem.binary_contract_missing) issues.push("missing binary contract");
          if (caseItem.binary && caseItem.binary_winner_ambiguous) issues.push("ambiguous winner");
          if (caseItem.binary && caseItem.binary_split_inconsistent) issues.push("split inconsistent");
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
