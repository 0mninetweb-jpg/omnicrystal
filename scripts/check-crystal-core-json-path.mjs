import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dotenv = require("dotenv");

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), "..");
const envCandidates = [
  path.join(projectRoot, "functions", ".env.omnicrystal"),
  path.join(projectRoot, "functions", ".env"),
  path.join(projectRoot, ".env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);
const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
if (!process.env.LLM_PROVIDER) {
  process.env.LLM_PROVIDER = hasOpenRouterKey ? "openrouter" : "gemini";
}

const { createLlmRuntime } = require("../functions/llmRuntime.js");
const { buildRoutingHints, buildTemporalContext, finalizeScorecard } = require("../functions/predictionCore.js");
const { createCrystalCoreRuntime, __testables } = require("../functions/crystalCore/runtime.js");

const queries = [
  "Bitcoin next 30 days",
  "Inter Milan vs Roma 2026-04-05",
  "Best time to visit Tokyo in the next 90 days",
  "Cosa passera al referendum costituzionale di marzo in Italia? si o no",
];

function assertPlannerShape(plan, query) {
  assert.equal(typeof plan, "object", `Planner should return an object for "${query}"`);
  assert.ok(plan.primary_domain_id, `Planner missing primary_domain_id for "${query}"`);
  assert.ok(Array.isArray(plan.candidate_domains), `Planner missing candidate_domains for "${query}"`);
  assert.ok(plan.intent_shape, `Planner missing intent_shape for "${query}"`);
  assert.ok(plan.resolution_frame, `Planner missing resolution_frame for "${query}"`);
}

function assertDossierShape(payload) {
  assert.equal(typeof payload, "object", "Dossier should return an object");
  assert.equal(typeof payload.structured_dossier, "object", "Dossier missing structured_dossier");
  assert.equal(typeof payload.raw_prediction, "object", "Dossier missing raw_prediction");
  assert.ok(
    payload.raw_prediction.primary_call || payload.raw_prediction.probability_split,
    "Dossier missing primary_call/probability_split"
  );
}

function assertVerbalizerShape(payload) {
  assert.equal(typeof payload, "object", "Verbalizer should return an object");
  assert.ok(payload.title || payload.summary || payload.verdict, "Verbalizer missing core copy fields");
}

const llmRuntime = createLlmRuntime({
  getGeminiApiKey: () => process.env.GEMINI_API_KEY || "",
});

const runtime = createCrystalCoreRuntime({
  llmRuntime,
  getGeminiApiKey: () => process.env.GEMINI_API_KEY || "",
  withRetry: async (fn) => fn(),
});

const fixedAsOfUtc = "2026-03-30T10:00:00.000Z";
const todayContext = buildTemporalContext("oggi piovera a Roma?", {
  asOfUtc: fixedAsOfUtc,
  timeZone: "Europe/Rome",
});
assert.equal(todayContext.as_of_local_date, "2026-03-30", "Temporal context should keep the run local date.");
assert.equal(todayContext.uses_relative_time, true, '"oggi" should be normalized as relative time.');
assert.equal(todayContext.relative_phrase.toLowerCase(), "oggi", '"oggi" should be preserved as the matched relative phrase.');
assert.equal(todayContext.resolved_time_window?.start_date, "2026-03-30", '"oggi" should resolve to the current local date.');

const weekendContext = buildTemporalContext("Will Rome stay rainy this weekend?", {
  asOfUtc: fixedAsOfUtc,
  timeZone: "Europe/Rome",
});
assert.equal(weekendContext.uses_relative_time, true, '"this weekend" should be detected as relative time.');
assert.ok(weekendContext.resolved_time_window?.label, '"this weekend" should produce an absolute label.');

const nextQuarterContext = buildTemporalContext("What happens next quarter for Italy?", {
  asOfUtc: fixedAsOfUtc,
  timeZone: "Europe/Rome",
});
assert.equal(nextQuarterContext.relative_phrase.toLowerCase(), "next quarter", '"next quarter" should be preserved.');
assert.equal(nextQuarterContext.resolved_time_window?.start_date, "2026-04-01", '"next quarter" should start on Apr 1, 2026.');
assert.equal(nextQuarterContext.resolved_time_window?.end_date, "2026-06-30", '"next quarter" should end on Jun 30, 2026.');

const explicitDateContext = buildTemporalContext("Will it rain on 2026-06-01 in Rome?", {
  asOfUtc: fixedAsOfUtc,
  timeZone: "Europe/Rome",
  eventDate: "2026-06-01",
});
assert.equal(explicitDateContext.uses_relative_time, false, "Explicit dates should not be overridden by relative normalization.");

if (!hasOpenRouterKey && !hasGeminiKey) {
  console.log("Structured output probe skipped: no OPENROUTER_API_KEY or GEMINI_API_KEY configured locally.");
  process.exit(0);
}

const plannerResults = [];
for (const query of queries) {
  const plan = await runtime.compileQuery(query);
  assertPlannerShape(plan, query);
  plannerResults.push({ query, plan });
}

const basePlan = plannerResults[0].plan;
const dossierPrompt = __testables.buildDossierPredictionPrompt({
  queryText: queries[0],
  normalizedQuery: basePlan,
  researchPlan: {
    domain_map: [basePlan.primary_domain_id],
    evidence_plan: ["historical baseline", "live signals", "consensus check"],
  },
  variableSelectionPack: {
    selected_variables: [
      {
        variable_key: "btc_price_momentum",
        label: "Bitcoin price momentum",
        causal_relevance: 0.8,
        signal_quality: 0.72,
        selection_reason: "Momentum still shapes the next 30 day regime.",
      },
      {
        variable_key: "risk_appetite",
        label: "Risk appetite",
        causal_relevance: 0.71,
        signal_quality: 0.66,
        selection_reason: "Risk appetite changes can flip the short-term path.",
      },
    ],
    discarded_variables: [
      {
        variable_key: "long_term_adoption",
        label: "Long-term adoption",
        causal_relevance: 0.42,
        signal_quality: 0.55,
        selection_reason: "Too slow-moving for a 30 day horizon.",
      },
    ],
    adapter_activation_map: ["HistoricalBaselineAdapter", "ConsensusBaselineAdapter", "EventNewsAdapter"],
  },
  verifiedEvidencePack: {
    verification_summary: "Recent signals lean constructive but remain headline-sensitive.",
    historical_baseline_20y:
      "Bitcoin has shown repeated 20-year style regime changes driven by liquidity, policy pressure, narrative reflexivity and crowd positioning.",
    live_signals: [
      {
        label: "Spot momentum",
        summary: "Recent price action remains constructive versus the prior monthly range.",
        lean: "up",
        freshness_score: 0.78,
        trust_score: 0.67,
      },
      {
        label: "Risk sentiment",
        summary: "Broader risk appetite is supportive but still fragile.",
        lean: "up",
        freshness_score: 0.7,
        trust_score: 0.62,
      },
    ],
    conflict_map: [
      {
        issue: "Macro reversal risk",
        note: "A rapid risk-off move would pressure the bullish case.",
        severity: 0.36,
      },
    ],
    missingness_map: ["on_chain_flow_thin"],
    source_trust_map: [
      { source_id: "search_live", trust_score: 0.64, note: "Live reporting cluster" },
      { source_id: "polymarket_public", trust_score: 0.8, note: "Consensus reference" },
    ],
    evidence_quality: {
      coverage_score: 0.72,
      freshness_score: 0.77,
      agreement_score: 0.69,
      conflict_score: 0.24,
      source_count: 2,
    },
    consensus_inputs: ["Prediction market reference"],
  },
  baselineConsensusPack: {
    naive_baseline: "Bitcoin usually mean-reverts after extreme short-term moves.",
    consensus_prediction: "Closest public consensus still leans mildly constructive.",
    delta_vs_consensus: "Crystal should only diverge if signal quality stays high.",
    edge_claim: "Edge should come from variable selection and disciplined calibration.",
  },
});

const dossierPayload = await llmRuntime.generateJson({
  modelKind: "forecast",
  temperature: 0.1,
  systemInstruction:
    "You are Crystal's Dossier and Prediction Agent. Return exactly one JSON object. Stay concrete, directional, and grounded in the supplied evidence.",
  prompt: dossierPrompt,
  maxTokens: __testables.JSON_STAGE_MAX_TOKENS.dossier,
  jsonStage: "dossier",
  preferTextMode: true,
});
const dossier = __testables.normalizeDossierStagePayload(dossierPayload, {
  baselineConsensusPack: {
    naive_baseline: "Bitcoin usually mean-reverts after extreme short-term moves.",
    consensus_prediction: "Closest public consensus still leans mildly constructive.",
    delta_vs_consensus: "Crystal should only diverge if signal quality stays high.",
    edge_claim: "Edge should come from variable selection and disciplined calibration.",
  },
  variableSelectionPack: {
    selected_variables: [
      {
        label: "Bitcoin momentum",
        signal_quality: 0.72,
        selection_reason: "Momentum still shapes the next 30 day regime.",
      },
      {
        label: "Risk appetite",
        signal_quality: 0.66,
        selection_reason: "Risk appetite changes can flip the short-term path.",
      },
    ],
  },
});
assertDossierShape(dossier);

const scorecard = finalizeScorecard(
  {
    primary_call: dossier.raw_prediction.primary_call || "Lean Up 57/43",
    probability_split:
      dossier.raw_prediction.probability_split ||
      {
        primary_label: "Up",
        primary_probability: 0.57,
        secondary_label: "Down or flat",
        secondary_probability: 0.43,
      },
    key_drivers: dossier.raw_prediction.key_drivers,
    counter_signals: dossier.raw_prediction.counter_signals,
    invalidators: dossier.raw_prediction.invalidators,
    historical_anchors: dossier.raw_prediction.historical_anchors,
    why_this_side: dossier.raw_prediction.why_this_side,
    recommended_posture: dossier.raw_prediction.recommended_posture,
  },
  {
    historical_baseline_20y:
      "Bitcoin has repeated boom-bust cycles shaped by liquidity, positioning, reflexive narrative waves and regulatory pressure.",
    live_signals: [
      { lean: "up", freshness_score: 0.78 },
      { lean: "up", freshness_score: 0.7 },
    ],
    source_ledger: ["search_live", "polymarket_public"],
    entity_resolution: { resolved: true, entities: ["Bitcoin"] },
    event_resolution: { resolved: true, jurisdiction: "Global" },
    evidence_quality: {
      coverage_score: 0.72,
      freshness_score: 0.77,
      agreement_score: 0.69,
      conflict_score: 0.24,
      source_count: 2,
    },
  },
  {
    primary_domain_id: basePlan.primary_domain_id,
    question_side_a: "Up",
    question_side_b: "Down or flat",
  },
  {
    current_state: "limited",
    status_reason: "Short horizon still sensitive to macro shocks.",
  },
  {
    engine: "deep",
  }
);

const verbalizerPrompt = __testables.buildForecastVerbalizationPrompt({
  queryText: queries[0],
  normalizedQuery: basePlan,
  verifiedEvidencePack: {
    verification_summary: "Recent evidence still supports a directional read with visible macro flip risk.",
    conflict_map: [
      {
        issue: "Macro reversal risk",
        note: "Risk-off headlines could flip the short-term read.",
        severity: 0.36,
      },
    ],
    missingness_map: ["on_chain_flow_thin"],
  },
  scorecard,
});

const verbalizerPayload = await llmRuntime.generateJson({
  modelKind: "forecast",
  temperature: 0.15,
  systemInstruction:
    "You write Crystal prediction cards. Return exactly one JSON object. Put the call first, keep the tone precise, and never hide the thesis behind vague uncertainty copy.",
  prompt: verbalizerPrompt,
  maxTokens: __testables.JSON_STAGE_MAX_TOKENS.verbalizer,
  jsonStage: "verbalizer",
  preferTextMode: true,
});
const verbalizer = __testables.normalizeVerbalizerStagePayload(verbalizerPayload, {
  scorecard,
  verifiedEvidencePack: {
    conflict_map: [{ issue: "Macro reversal risk", note: "Risk-off headlines could flip the short-term read." }],
    missingness_map: ["on_chain_flow_thin"],
  },
});
assertVerbalizerShape(verbalizer);

console.log("Structured output probe passed.");
for (const { query, plan } of plannerResults) {
  console.log(`- planner ok: ${query} -> ${plan.primary_domain_id}`);
}
console.log(`- dossier ok: ${dossier.raw_prediction.primary_call || "directional thesis present"}`);
console.log(`- verbalizer ok: ${verbalizer.title || verbalizer.verdict || "copy fields present"}`);
