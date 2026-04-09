const crypto = require("node:crypto");
const {
  getWorldSimDigest,
  enhanceCardWithWorldSim,
} = require("./worldSim");

const WORLD_SIM_JOB_VERSION = "mirofish-original-job-v1";
const WORLD_SIM_JOB_COLLECTION = "worldsim_jobs";
const WORLD_SIM_DEFAULT_AGENT_COUNT = 1000;
const WORLD_SIM_JOB_KIND_OBSERVE = "observe";
const WORLD_SIM_JOB_KIND_MATRIX = "matrix_intervention";
const WORLD_SIM_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const WORLD_SIM_PENDING_WINDOW_MS = 45 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"]);
const WORLD_SIM_PLAN_CONFIG = {
  free: {
    enabled: true,
    agentCount: 120,
    depth: "lite",
    queue: "shared",
  },
  plus: {
    enabled: true,
    agentCount: 400,
    depth: "expanded",
    queue: "priority",
  },
  pro: {
    enabled: true,
    agentCount: 1000,
    depth: "deep",
    queue: "priority-plus",
  },
};
const FALLBACK_PROGRESS_STEPS = [
  {
    minAgeMs: 0,
    status: "created",
    progress: 0.08,
    phase: "created",
    statusMessage: "Job queued. Crystal is preparing the world seed.",
  },
  {
    minAgeMs: 2000,
    status: "preparing",
    progress: 0.24,
    phase: "graph_build",
    statusMessage: "Building graph context, entities, and relationships.",
  },
  {
    minAgeMs: 5000,
    status: "ready",
    progress: 0.44,
    phase: "environment_setup",
    statusMessage: "Configuring the simulated environment and social memory.",
  },
  {
    minAgeMs: 8000,
    status: "running",
    progress: 0.76,
    phase: "simulation_run",
    statusMessage: "Running the 1000-agent world simulation.",
  },
];

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function sanitizeList(list) {
  return Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim()) : [];
}

function clamp01(value, fallback = 0.5) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  if (next > 1) return Math.max(0, Math.min(1, next / 100));
  return Math.max(0, Math.min(1, next));
}

function sanitizeInterventionPayload(payload = {}) {
  return {
    cardId: safeText(payload.cardId || payload.card_id, "matrix-custom"),
    category: safeText(payload.category, "marketing_attention"),
    label: safeText(payload.label, "Matrix intervention"),
    intent: safeText(payload.intent, "Inject a structured intervention and observe how the world state reacts."),
    intensity: clamp01(payload.intensity, 0.42),
    geography: safeText(payload.geography, "Global"),
    duration: safeText(payload.duration, "30d"),
    targetAudience: safeText(payload.targetAudience || payload.target_audience, "Exposed communities"),
    timing: safeText(payload.timing, "Immediately"),
    safetyNote: safeText(
      payload.safetyNote || payload.safety_note,
      "Simulation only. This is not operational guidance or a certain forecast."
    ),
  };
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

function looksLikeCultureMedia(text = "") {
  return /(culture|media|creator|streaming|audience|attention|viral|narrative|brand|entertainment|music|cinema|serie|creator economy|media behavior|cultura|media|attenzione|spettacolo|streaming)/i.test(
    text
  );
}

function looksLikeCityLocal(text = "") {
  return /(city|urban|mobility|tourism|local|housing|rent|gentrification|crime|commuter|restaurant|neighborhood|roma|milano|napoli|torino|firenze|citta|mobilita|turismo|quartiere|affitti)/i.test(
    text
  );
}

function looksLikeMacroMarkets(text = "") {
  return /(market|macro|inflation|rate|rates|bond|stocks|equity|crypto|oil|energy|gdp|consumer|spending|retail|housing affordability|mortgage|market sentiment|mercati|inflazione|tassi|borsa|crypto|petrolio|energia|pil|consumi)/i.test(
    text
  );
}

function looksLikeGeopolitics(text = "") {
  return /(election|government|coalition|tariff|sanction|border|war|trade war|parliament|public opinion|protest|embargo|ceasefire|geopolitic|governo|coalizione|elezioni|dazi|sanzioni|conflitto|guerra|opinione pubblica)/i.test(
    text
  );
}

function resolveWorldSimTemplate(queryPlan = {}, queryText = "") {
  const domain = safeText(queryPlan?.domain || queryPlan?.domain_id).toLowerCase();
  const corpus = [queryText, queryPlan?.domain, queryPlan?.domain_id].filter(Boolean).join(" ");

  if (domain.startsWith("a.11.") || looksLikeGeopolitics(corpus)) {
    return "geopolitics-public-opinion";
  }

  if (domain.startsWith("a.1.") || domain.startsWith("a.2.") || looksLikeMacroMarkets(corpus)) {
    return "macro-markets";
  }

  if (domain.startsWith("a.7.") || looksLikeCityLocal(corpus)) {
    return "city-local";
  }

  if (looksLikeCultureMedia(corpus)) {
    return "culture-media";
  }

  return "public-discourse";
}

function getWorldSimPlanConfig(plan = "free") {
  return WORLD_SIM_PLAN_CONFIG[plan] || WORLD_SIM_PLAN_CONFIG.free;
}

function shouldUseAsyncWorldSim({ plan = "free" }) {
  return Boolean(getWorldSimPlanConfig(plan)?.enabled);
}

function buildSectionQueryPlan(section = {}, queryText = "") {
  const corpus = [section.topic, section.title, section.content, queryText].filter(Boolean).join(" ");
  const template = resolveWorldSimTemplate({}, corpus);
  const domainByTemplate = {
    "geopolitics-public-opinion": "A.11.geopolitics.trade_tensions",
    "macro-markets": "A.2.markets.equity_indices",
    "city-local": "A.7.city_pulse.micro_area_change",
    "culture-media": "A.10.consumer.consumer_confidence",
    "public-discourse": "A.11.geopolitics.trade_tensions",
  };

  return {
    domain_id: domainByTemplate[template] || domainByTemplate["public-discourse"],
    horizons: [{ horizon_id: safeText(section.horizon, "30d") }],
    filters: {
      confidence_preference: "rigorous",
    },
    constraints: {
      confidence_preference: "rigorous",
    },
    entities: [],
  };
}

function createWorldSimJobHash({
  uid,
  queryText,
  queryPlan,
  userContext,
  source,
  sourceRef,
  template,
  sourcePayload,
}) {
  const hashPayload = {
    version: WORLD_SIM_JOB_VERSION,
    uid,
    queryText: safeText(queryText).toLowerCase(),
    queryPlan: queryPlan || {},
    userContext: {
      location: safeText(userContext?.location),
      profession: safeText(userContext?.profession),
      interests: sanitizeList(userContext?.interests).slice(0, 8),
    },
    source,
    sourceRef: safeText(sourceRef),
    template,
    sourcePayload,
  };

  return crypto.createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex");
}

function createPreviewSummary(template, queryText) {
  const subject = safeText(queryText, "your scenario");
  switch (template) {
    case "geopolitics-public-opinion":
      return `WorldSim is mapping coalitions, public pressure, and second-order geopolitical reactions around "${subject}".`;
    case "macro-markets":
      return `WorldSim is tracing how markets, rates, and macro sentiment could react around "${subject}".`;
    case "city-local":
      return `WorldSim is building a city-level simulation of pressure, mobility, and local behavior around "${subject}".`;
    case "culture-media":
      return `WorldSim is simulating attention flows, narrative shifts, and audience behavior around "${subject}".`;
    default:
      return `WorldSim is preparing a public-discourse simulation around "${subject}".`;
  }
}

function createMatrixPreviewSummary(interventionPayload = {}, queryText = "") {
  const intervention = sanitizeInterventionPayload(interventionPayload);
  const subject = safeText(queryText, "the current world state");
  return `Matrix Simulation is testing "${intervention.label}" against "${subject}" and comparing the baseline world against the intervention branch.`;
}

function getMatrixNarrativePack(category) {
  switch (category) {
    case "marketing_attention":
      return {
        shift: "Attention compresses quickly around a visible launch, then fragments into intent, curiosity, and rejection.",
        social: "Audience response starts with curiosity, then splits between early adopters and skeptical observers.",
        stress: "Low systemic stress, but high volatility in attention.",
      };
    case "media_narrative":
      return {
        shift: "A narrative frame moves faster than facts and changes which actors look credible in the public conversation.",
        social: "Narrative alignment triggers amplification among already primed communities.",
        stress: "Moderate systemic stress through framing and reputational pressure.",
      };
    case "policy_regulation":
      return {
        shift: "Institutions respond first, operators second, and households only later see the real downstream tradeoffs.",
        social: "Institutional compliance rises before public clarity catches up.",
        stress: "Moderate-to-high stress where incentives and compliance diverge.",
      };
    case "pricing_product":
      return {
        shift: "Perceived fairness becomes the hinge: if value does not keep pace with price, churn stories spread faster than product wins.",
        social: "Users compare alternatives publicly and create fast narrative loops.",
        stress: "Medium stress concentrated on loyalty and switching behavior.",
      };
    case "social_shock":
      return {
        shift: "A broad social shock redistributes trust quickly across communities with different coping capacity.",
        social: "Communities adapt unevenly, creating visible pressure pockets before macro data reacts.",
        stress: "High social stress with uneven local resilience.",
      };
    case "conflict_systemic_shock":
      return {
        shift: "Coalitions harden, logistics become fragile, and the system reallocates attention to containment.",
        social: "Public reactions swing between demand for stability and rapid narrative escalation.",
        stress: "High systemic stress with visible spillover risk.",
      };
    case "health_disruption_shock":
      return {
        shift: "Service capacity and trust become the key bottlenecks, and perception can move faster than formal alerts.",
        social: "Communities change routines before institutions fully normalize the signal.",
        stress: "High stress on services, coordination, and public trust.",
      };
    default:
      return {
        shift: "The system absorbs the intervention, then redistributes pressure along the most exposed relationships.",
        social: "Communities respond in waves rather than all at once.",
        stress: "Mixed stress across the network.",
      };
  }
}

function adjustScenarioFrequencies(scenarios = [], shift = 0) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return [
      { label: "Higher momentum", probability: clamp01(0.5 + shift, 0.55) },
      { label: "Contained response", probability: clamp01(0.3 - shift / 2, 0.25) },
      { label: "Backlash and reversal", probability: clamp01(0.2 + Math.abs(shift) / 2, 0.2) },
    ];
  }

  const next = scenarios.map((scenario, index) => {
    const delta = index === 0 ? shift : index === 1 ? -shift / 2 : Math.abs(shift) / 2;
    return {
      label: safeText(scenario.label, `Scenario ${index + 1}`),
      probability: clamp01(scenario.probability + delta, clamp01(scenario.probability, 0.33)),
    };
  });
  const total = next.reduce((sum, scenario) => sum + scenario.probability, 0) || 1;
  return next.map((scenario) => ({
    ...scenario,
    probability: scenario.probability / total,
  }));
}

function buildMatrixSimulationResult(job = {}, baselineDigest = null) {
  const payload = sanitizeInterventionPayload(job.interventionPayload);
  const narrativePack = getMatrixNarrativePack(payload.category);
  const durationFactor = /60d|90d/i.test(payload.duration) ? 0.07 : /30d|45d/i.test(payload.duration) ? 0.05 : 0.03;
  const geographyFactor = /global|regional|eu|europe/i.test(payload.geography) ? 0.02 : /metro|city|urban/i.test(payload.geography) ? 0.015 : 0.01;
  const categoryFactor = {
    marketing_attention: 0.025,
    media_narrative: 0.03,
    policy_regulation: 0.04,
    pricing_product: 0.022,
    social_shock: 0.045,
    conflict_systemic_shock: 0.05,
    health_disruption_shock: 0.048,
  }[payload.category] || 0.02;
  const deltaProbability = Math.max(
    -0.18,
    Math.min(0.18, payload.intensity * 0.08 + durationFactor + geographyFactor + categoryFactor - 0.04)
  );
  const interventionScenarios = adjustScenarioFrequencies(baselineDigest?.scenario_frequencies || [], deltaProbability);
  const baselineProbability = clamp01(baselineDigest?.scenario_frequencies?.[0]?.probability, 0.5);
  const interventionProbability = clamp01(interventionScenarios[0]?.probability, baselineProbability + deltaProbability);

  const interventionDigest = {
    ...(baselineDigest || createPlaceholderDigest(job)),
    simulation_mode: job.transport === "remote-adapter" ? "matrix_live_intervention" : "matrix_async_intervention",
    narrative_arc: `${narrativePack.shift} Timing: ${payload.timing}. Target: ${payload.targetAudience}.`,
    pivotal_actors: sanitizeList(baselineDigest?.pivotal_actors || []).slice(0, 3),
    intervention_points: [
      `Intensity set to ${Math.round(payload.intensity * 100)}%.`,
      `Primary geography: ${payload.geography}.`,
      `Target audience: ${payload.targetAudience}.`,
    ],
    scenario_frequencies: interventionScenarios,
    probability_delta: deltaProbability,
    confidence_delta: 0.02,
    community_summaries: [
      narrativePack.social,
      `The first visible reaction is concentrated in ${payload.targetAudience.toLowerCase()}.`,
      `Durability depends on whether the system can absorb the move over ${payload.duration}.`,
    ],
    tensions: [
      `Intervention pressure vs resilience in ${payload.geography}.`,
      `Narrative coherence vs backlash among ${payload.targetAudience.toLowerCase()}.`,
    ],
    notes: [payload.safetyNote],
    matrix_mode: "intervene",
    matrix_branch_id: job.jobId,
  };

  return {
    branchId: safeText(job.jobId),
    baselineDigest: baselineDigest || null,
    interventionDigest,
    deltaDigest: {
      headline: `${payload.label} changes the shape of the system, not just the top-line probability.`,
      summary: `${narrativePack.shift} The main effect is a ${deltaProbability >= 0 ? "higher" : "lower"} probability path with visible redistribution of attention and stress.`,
      deltaProbability,
      socialResponse: narrativePack.social,
      narrativeShift: narrativePack.shift,
      systemStress: narrativePack.stress,
      dominantReactions: [
        `Early response concentrates in ${payload.targetAudience.toLowerCase()}.`,
        `Actors react faster when the intervention lasts ${payload.duration.toLowerCase()}.`,
        `Narrative loops grow strongest in ${payload.geography.toLowerCase()}.`,
      ],
      secondOrderEffects: [
        "Secondary actors adjust after seeing the first reputational or behavioral move.",
        "Backlash risk rises if the intervention intensity outruns perceived legitimacy.",
        "The system can overreact in adjacent communities even when the direct target is narrow.",
      ],
      riskOfBackfire:
        payload.intensity >= 0.65
          ? "High. Strong interventions create fast visibility but also sharper backlash and faster counter-mobilization."
          : "Medium. The system has room to absorb the move, but backlash rises if the narrative looks manipulative.",
      interventionEffectiveness:
        payload.intensity >= 0.5
          ? "High enough to move the system, but only if target audience and timing stay aligned."
          : "Useful for testing sensitivity, not yet strong enough to force a regime shift on its own.",
      amplificationFactors: [
        `A clearer message among ${payload.targetAudience.toLowerCase()}.`,
        `Alignment between timing (${payload.timing.toLowerCase()}) and public attention.`,
      ],
      dampeningFactors: [
        "Low credibility, weak distribution, or fast institutional pushback.",
        "Signal fatigue if the intervention lasts too long without a reinforcing event.",
      ],
      metrics: [
        {
          label: "Delta probability",
          before: baselineProbability,
          after: interventionProbability,
          delta: deltaProbability,
          unit: "probability",
        },
        {
          label: "Social response",
          before: 0.42,
          after: Math.max(0, Math.min(1, 0.42 + payload.intensity * 0.25)),
          delta: payload.intensity * 0.25,
          unit: "response",
        },
        {
          label: "Narrative shift",
          before: 0.4,
          after: Math.max(0, Math.min(1, 0.4 + payload.intensity * 0.22)),
          delta: payload.intensity * 0.22,
          unit: "sentiment",
        },
        {
          label: "System stress",
          before: 0.36,
          after: Math.max(0, Math.min(1, 0.36 + payload.intensity * 0.3)),
          delta: payload.intensity * 0.3,
          unit: "stress",
        },
      ],
    },
    dominantReactions: [
      `Early response concentrates in ${payload.targetAudience.toLowerCase()}.`,
      `Time horizon ${payload.duration.toLowerCase()} amplifies visible reaction loops.`,
    ],
    narrativeShift: narrativePack.shift,
    secondOrderEffects: [
      "Secondary actors adjust after observing the first move.",
      "The system may create backlash pockets outside the primary target audience.",
    ],
    riskOfBackfire:
      payload.intensity >= 0.65
        ? "High. Strong interventions create faster backlash."
        : "Medium. The system may still resist if legitimacy looks weak.",
    interventionEffectiveness:
      payload.intensity >= 0.5 ? "High enough to move the system." : "Good for sensitivity testing, not for regime change.",
    branchLabel: payload.label,
    sourceMode: job.transport === "remote-adapter" ? "live" : "preview",
  };
}

function createWorldSimJobRef(data = {}) {
  return {
    jobId: safeText(data.jobId),
    kind: safeText(data.jobType, WORLD_SIM_JOB_KIND_OBSERVE),
    status: safeText(data.status, "created"),
    createdAt: safeText(data.createdAt, new Date().toISOString()),
    lastUpdatedAt: safeText(data.lastUpdatedAt, new Date().toISOString()),
    source: safeText(data.source, "fallback"),
    template: safeText(data.template, "public-discourse"),
    progress: Number.isFinite(Number(data.progress)) ? Number(data.progress) : 0,
    agentCount: Number.isFinite(Number(data.agentCount)) ? Number(data.agentCount) : WORLD_SIM_DEFAULT_AGENT_COUNT,
    statusMessage: safeText(data.statusMessage),
    phase: safeText(data.phase, "created"),
    runtime: safeText(data.runtime, "mirofish-original"),
    adapterMode: safeText(data.adapterMode, data.transport === "remote-adapter" ? "original-runtime" : "fallback"),
    provider: safeText(data.provider, data.transport === "remote-adapter" ? "openrouter" : "local-fallback"),
    models:
      data.models && typeof data.models === "object"
        ? {
            default: safeText(data.models.default),
            graph: safeText(data.models.graph),
            simulation: safeText(data.models.simulation),
            report: safeText(data.models.report),
          }
        : undefined,
    depth: safeText(data.depth, "lite"),
    queue: safeText(data.queue, "shared"),
    branchId: safeText(data.branchId) || null,
    branchParentId: safeText(data.branchParentId) || null,
  };
}

function createPlaceholderDigest(job = {}) {
  const jobRef = createWorldSimJobRef(job);
  return {
    enabled: true,
    simulation_mode: `job_${jobRef.status}`,
    quality_score: 0.48,
    graph_coverage: Math.min(0.7, Math.max(0.08, jobRef.progress * 0.8)),
    agent_convergence: Math.min(0.64, Math.max(0.1, jobRef.progress * 0.68)),
    graph_age_hours: 0,
    narrative_arc:
      safeText(job.previewSummary) ||
      safeText(job.statusMessage) ||
      "WorldSim is still building the first world state for this forecast.",
    pivotal_actors: [],
    intervention_points: [],
    counterfactuals: [],
    source_set: ["mirofish-job"],
    scenario_frequencies: [],
    prediction_market_frame: null,
    probability_delta: 0,
    confidence_delta: 0,
    graph_summary: safeText(job.statusMessage, "The simulation has not produced a final digest yet."),
    community_summaries: [],
    tensions: [],
    simulation_id: null,
    cache_status: jobRef.status,
    generated_at: safeText(job.createdAt, new Date().toISOString()),
    notes: [
      `WorldSim job status: ${jobRef.status}.`,
      `Target runtime: original MiroFish with ${jobRef.agentCount} agents.`,
      `Simulation depth: ${safeText(jobRef.depth, "lite")} on ${safeText(jobRef.queue, "shared")} queue.`,
    ],
  };
}

function applyWorldSimToSection(section = {}, digest) {
  if (!digest || !digest.enabled) return { ...section };

  const next = {
    ...section,
    world_sim: {
      simulation_mode: digest.simulation_mode,
      narrative_arc: digest.narrative_arc,
      pivotal_actors: digest.pivotal_actors,
      intervention_points: digest.intervention_points,
      prediction_market_frame: digest.prediction_market_frame,
    },
  };

  if (digest.narrative_arc) {
    next.content = next.content ? `${next.content} ${digest.narrative_arc}` : digest.narrative_arc;
  }

  if (digest.counterfactuals?.[0]) {
    const note = `Counterfactual: ${digest.counterfactuals[0].label} -> ${digest.counterfactuals[0].outcome}`;
    next.historical_context = next.historical_context ? `${next.historical_context} ${note}` : note;
  }

  return next;
}

function getConfiguredRuntimeMetadata() {
  if (!process.env.MIROFISH_BASE_URL) {
    return {
      adapterMode: "fallback",
      provider: "local-fallback",
      models: undefined,
    };
  }

  const defaultModel = safeText(process.env.MIROFISH_DEFAULT_MODEL, "openai/gpt-4.1-mini");
  return {
    adapterMode: "original-runtime",
    provider: safeText(process.env.MIROFISH_PROVIDER, "openrouter"),
    models: {
      default: defaultModel,
      graph: safeText(process.env.MIROFISH_GRAPH_MODEL, defaultModel),
      simulation: safeText(process.env.MIROFISH_SIM_MODEL, defaultModel),
      report: safeText(process.env.MIROFISH_REPORT_MODEL, "openai/gpt-4.1"),
    },
  };
}

function createJobDocument({
  jobId,
  uid,
  plan,
  template,
  source,
  sourceRef,
  queryText,
  queryPlan,
  userContext,
  sourcePayload,
}) {
  const now = new Date().toISOString();
  const planConfig = getWorldSimPlanConfig(plan);
  const runtimeMetadata = getConfiguredRuntimeMetadata();
  return {
    version: WORLD_SIM_JOB_VERSION,
    jobId,
    jobType: WORLD_SIM_JOB_KIND_OBSERVE,
    uid,
    status: "created",
    progress: 0.08,
    phase: "created",
    statusMessage: "Job queued. Crystal is preparing the world seed.",
    createdAt: now,
    lastUpdatedAt: now,
    completedAt: null,
    canceledAt: null,
    errorMessage: null,
    source,
    sourceRef: sourceRef || null,
    template,
    runtime: process.env.MIROFISH_BASE_URL ? "mirofish-original" : "mirofish-fallback",
    adapterMode: runtimeMetadata.adapterMode,
    provider: runtimeMetadata.provider,
    models: runtimeMetadata.models,
    transport: process.env.MIROFISH_BASE_URL ? "remote-adapter" : "fallback",
    previewSummary: createPreviewSummary(template, queryText),
    queryText,
    queryPlan: queryPlan || {},
    userContext: {
      location: safeText(userContext?.location),
      profession: safeText(userContext?.profession),
      interests: sanitizeList(userContext?.interests).slice(0, 8),
    },
    sourcePayload: sourcePayload || null,
    digest: null,
    resultCard: null,
    resultSection: null,
    externalJobId: null,
    externalStatus: null,
    agentCount: planConfig.agentCount,
    plan,
    depth: planConfig.depth,
    queue: planConfig.queue,
    resultAvailable: false,
  };
}

function createMatrixJobDocument({
  jobId,
  uid,
  plan,
  template,
  source,
  sourceRef,
  queryText,
  queryPlan,
  userContext,
  interventionPayload,
  branchParentId,
}) {
  const now = new Date().toISOString();
  const planConfig = getWorldSimPlanConfig(plan);
  const runtimeMetadata = getConfiguredRuntimeMetadata();
  return {
    version: WORLD_SIM_JOB_VERSION,
    jobId,
    jobType: WORLD_SIM_JOB_KIND_MATRIX,
    uid,
    status: "created",
    progress: 0.08,
    phase: "created",
    statusMessage: "Matrix Simulation queued. Crystal is preparing the baseline world state.",
    createdAt: now,
    lastUpdatedAt: now,
    completedAt: null,
    canceledAt: null,
    errorMessage: null,
    source,
    sourceRef: sourceRef || null,
    template,
    runtime: process.env.MIROFISH_BASE_URL ? "mirofish-original" : "mirofish-fallback",
    adapterMode: runtimeMetadata.adapterMode,
    provider: runtimeMetadata.provider,
    models: runtimeMetadata.models,
    transport: process.env.MIROFISH_BASE_URL ? "remote-adapter" : "fallback",
    previewSummary: createMatrixPreviewSummary(interventionPayload, queryText),
    queryText,
    queryPlan: queryPlan || {},
    userContext: {
      location: safeText(userContext?.location),
      profession: safeText(userContext?.profession),
      interests: sanitizeList(userContext?.interests).slice(0, 8),
    },
    interventionPayload: sanitizeInterventionPayload(interventionPayload),
    branchId: jobId,
    branchParentId: branchParentId || null,
    digest: null,
    matrixResult: null,
    resultCard: null,
    resultSection: null,
    externalJobId: null,
    externalStatus: null,
    agentCount: planConfig.agentCount,
    plan,
    depth: planConfig.depth,
    queue: planConfig.queue,
    resultAvailable: false,
  };
}

function isJobReusable(data = {}, now = new Date()) {
  const updatedAt = parseDate(data.lastUpdatedAt) || parseDate(data.createdAt);
  if (!updatedAt) return false;

  if (isTerminalStatus(data.status)) {
    return now.getTime() - updatedAt.getTime() <= WORLD_SIM_ACTIVE_WINDOW_MS;
  }

  return now.getTime() - updatedAt.getTime() <= WORLD_SIM_PENDING_WINDOW_MS;
}

async function writeJobPatch(db, jobId, patch) {
  await db.collection(WORLD_SIM_JOB_COLLECTION).doc(jobId).set(patch, { merge: true });
}

function buildHeaders(apiKey) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["X-WorldSim-Key"] = apiKey;
  }

  return headers;
}

function getExternalJobPath(jobType = WORLD_SIM_JOB_KIND_OBSERVE, externalJobId = "", suffix = "") {
  const basePath =
    jobType === WORLD_SIM_JOB_KIND_MATRIX ? "/worldsim/interventions" : "/worldsim/jobs";
  if (!externalJobId) {
    return `${basePath}${suffix}`;
  }
  return `${basePath}/${externalJobId}${suffix}`;
}

async function callExternalJobCreate({ fetchJson, baseUrl, apiKey, job }) {
  const body =
    job.jobType === WORLD_SIM_JOB_KIND_MATRIX
      ? {
          jobId: job.jobId,
          template: job.template,
          query: job.queryText,
          baselineQuery: job.queryText,
          queryPlan: job.queryPlan,
          userContext: job.userContext,
          source: job.source,
          sourceRef: job.sourceRef,
          runtime: "mirofish-original",
          mode: "async",
          agentCount: job.agentCount,
          depth: job.depth,
          queue: job.queue,
          intervention: job.interventionPayload,
          branchParentId: job.branchParentId || null,
          jobType: job.jobType,
        }
      : {
          jobId: job.jobId,
          template: job.template,
          query: job.queryText,
          queryPlan: job.queryPlan,
          userContext: job.userContext,
          source: job.source,
          sourceRef: job.sourceRef,
          runtime: "mirofish-original",
          mode: "async",
          agentCount: job.agentCount,
          depth: job.depth,
          queue: job.queue,
        };

  return fetchJson(`${baseUrl.replace(/\/$/, "")}${getExternalJobPath(job.jobType)}`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

async function callExternalJobStatus({ fetchJson, baseUrl, apiKey, externalJobId, jobType }) {
  return fetchJson(`${baseUrl.replace(/\/$/, "")}${getExternalJobPath(jobType, externalJobId)}`, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
}

async function callExternalJobResult({ fetchJson, baseUrl, apiKey, externalJobId, jobType }) {
  return fetchJson(`${baseUrl.replace(/\/$/, "")}${getExternalJobPath(jobType, externalJobId, "/result")}`, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
}

async function callExternalJobCancel({ fetchJson, baseUrl, apiKey, externalJobId, jobType }) {
  return fetchJson(`${baseUrl.replace(/\/$/, "")}${getExternalJobPath(jobType, externalJobId, "/cancel")}`, {
    method: "POST",
    headers: buildHeaders(apiKey),
  });
}

function normalizeExternalStatus(status) {
  const value = safeText(status).toLowerCase();
  if (!value) return "created";
  if (value === "queued") return "created";
  if (value === "ready") return "ready";
  if (value === "running") return "running";
  if (value === "completed" || value === "failed" || value === "canceled") return value;
  if (value === "preparing" || value === "building" || value === "seeded") return "preparing";
  return "created";
}

function buildTerminalPatch(job, digest, matrixResult = null) {
  const now = new Date().toISOString();
  const next = {
    status: "completed",
    progress: 1,
    phase: "completed",
    statusMessage: "World simulation completed.",
    lastUpdatedAt: now,
    completedAt: now,
    resultAvailable: Boolean(digest),
    digest: digest || null,
    externalStatus: "completed",
    errorMessage: null,
    matrixResult: matrixResult || null,
  };

  if (digest && job?.sourcePayload?.baseCard) {
    next.resultCard = enhanceCardWithWorldSim(job.sourcePayload.baseCard, digest);
  }

  if (digest && job?.sourcePayload?.section) {
    next.resultSection = applyWorldSimToSection(job.sourcePayload.section, digest);
  }

  return next;
}

async function finalizeFallbackJob(context, job) {
  const ai = context.getGemini();
  const digest = await getWorldSimDigest({
    ai,
    db: context.db,
    admin: context.admin,
    withRetry: context.withRetry,
    fetchJson: context.fetchJson,
    queryText: job.queryText,
    queryPlan: job.queryPlan,
    userContext: job.userContext,
    engine: "oracle",
    plan: job.plan || "free",
    sidecarBaseUrl: process.env.WORLDSIM_BASE_URL,
    sidecarApiKey: process.env.WORLDSIM_API_KEY,
  });

  const patch = buildTerminalPatch(job, digest);
  await writeJobPatch(context.db, job.jobId, patch);
  return {
    ...job,
    ...patch,
  };
}

async function finalizeFallbackMatrixJob(context, job) {
  const ai = context.getGemini();
  const baselineDigest = await getWorldSimDigest({
    ai,
    db: context.db,
    admin: context.admin,
    withRetry: context.withRetry,
    fetchJson: context.fetchJson,
    queryText: job.queryText,
    queryPlan: job.queryPlan,
    userContext: job.userContext,
    engine: "oracle",
    plan: job.plan || "free",
    sidecarBaseUrl: process.env.WORLDSIM_BASE_URL,
    sidecarApiKey: process.env.WORLDSIM_API_KEY,
  });

  const matrixResult = buildMatrixSimulationResult(job, baselineDigest);
  const patch = buildTerminalPatch(job, matrixResult.interventionDigest, matrixResult);
  await writeJobPatch(context.db, job.jobId, patch);
  return {
    ...job,
    ...patch,
  };
}

async function refreshFallbackJob(context, job) {
  const createdAt = parseDate(job.createdAt) || new Date();
  const ageMs = Date.now() - createdAt.getTime();
  const nextStep =
    [...FALLBACK_PROGRESS_STEPS].reverse().find((step) => ageMs >= step.minAgeMs) || FALLBACK_PROGRESS_STEPS[0];

  if (ageMs < 12000) {
    const patch = {
      status: nextStep.status,
      progress: nextStep.progress,
      phase: nextStep.phase,
      statusMessage: nextStep.statusMessage,
      lastUpdatedAt: new Date().toISOString(),
      externalStatus: null,
    };
    await writeJobPatch(context.db, job.jobId, patch);
    return {
      ...job,
      ...patch,
    };
  }

  return finalizeFallbackJob(context, job);
}

async function refreshFallbackMatrixJob(context, job) {
  const createdAt = parseDate(job.createdAt) || new Date();
  const ageMs = Date.now() - createdAt.getTime();
  const nextStep =
    [...FALLBACK_PROGRESS_STEPS].reverse().find((step) => ageMs >= step.minAgeMs) || FALLBACK_PROGRESS_STEPS[0];

  if (ageMs < 14000) {
    const patch = {
      status: nextStep.status,
      progress: Math.min(0.92, nextStep.progress + 0.06),
      phase: nextStep.phase,
      statusMessage:
        nextStep.phase === "simulation_run"
          ? "Running the Matrix Simulation branch against the current world state."
          : nextStep.statusMessage,
      lastUpdatedAt: new Date().toISOString(),
      externalStatus: null,
    };
    await writeJobPatch(context.db, job.jobId, patch);
    return {
      ...job,
      ...patch,
    };
  }

  return finalizeFallbackMatrixJob(context, job);
}

async function refreshExternalJob(context, job) {
  const baseUrl = process.env.MIROFISH_BASE_URL;
  const apiKey = process.env.MIROFISH_API_KEY;

  if (!job.externalJobId) {
    const created = await callExternalJobCreate({
      fetchJson: context.fetchJson,
      baseUrl,
      apiKey,
      job,
    });
    const externalJobId = safeText(created?.jobId || created?.id || created?.job_id, job.jobId);
    const patch = {
      externalJobId,
      externalStatus: normalizeExternalStatus(created?.status || created?.phase),
      status: normalizeExternalStatus(created?.status || created?.phase),
      progress: Number.isFinite(Number(created?.progress)) ? Number(created.progress) : 0.12,
      phase: safeText(created?.phase, "preparing"),
      statusMessage: safeText(
        created?.statusMessage || created?.message,
        "Remote MiroFish runtime accepted the job."
      ),
      adapterMode: safeText(created?.adapterMode, "original-runtime"),
      provider: safeText(created?.provider, "openrouter"),
      models:
        created?.models && typeof created.models === "object"
          ? {
              default: safeText(created.models.default),
              graph: safeText(created.models.graph),
              simulation: safeText(created.models.simulation),
              report: safeText(created.models.report),
            }
          : job.models || undefined,
      lastUpdatedAt: new Date().toISOString(),
    };
    await writeJobPatch(context.db, job.jobId, patch);
    return {
      ...job,
      ...patch,
    };
  }

  const statusPayload = await callExternalJobStatus({
    fetchJson: context.fetchJson,
    baseUrl,
    apiKey,
    externalJobId: job.externalJobId,
    jobType: job.jobType,
  });

  const nextStatus = normalizeExternalStatus(statusPayload?.status || statusPayload?.phase);
  const patch = {
    externalStatus: nextStatus,
    status: nextStatus,
    progress: Number.isFinite(Number(statusPayload?.progress))
      ? Number(statusPayload.progress)
      : nextStatus === "completed"
        ? 1
        : job.progress,
    phase: safeText(statusPayload?.phase, job.phase || "running"),
    statusMessage: safeText(statusPayload?.statusMessage || statusPayload?.message, job.statusMessage),
    adapterMode: safeText(statusPayload?.adapterMode, safeText(job.adapterMode, "original-runtime")),
    provider: safeText(statusPayload?.provider, safeText(job.provider, "openrouter")),
    models:
      statusPayload?.models && typeof statusPayload.models === "object"
        ? {
            default: safeText(statusPayload.models.default),
            graph: safeText(statusPayload.models.graph),
            simulation: safeText(statusPayload.models.simulation),
            report: safeText(statusPayload.models.report),
          }
        : job.models || undefined,
    lastUpdatedAt: new Date().toISOString(),
  };

  if (nextStatus !== "completed") {
    if (nextStatus === "failed") {
      patch.errorMessage = safeText(statusPayload?.error || statusPayload?.message, "WorldSim job failed.");
    }
    await writeJobPatch(context.db, job.jobId, patch);
    return {
      ...job,
      ...patch,
    };
  }

  const resultPayload = await callExternalJobResult({
    fetchJson: context.fetchJson,
    baseUrl,
    apiKey,
    externalJobId: job.externalJobId,
    jobType: job.jobType,
  });

  const matrixResult = resultPayload?.matrix || resultPayload?.matrix_result || null;
  const digest =
    resultPayload?.digest ||
    resultPayload?.world_sim ||
    matrixResult?.interventionDigest ||
    matrixResult?.intervention_digest ||
    null;
  const terminalPatch = {
    ...patch,
    ...buildTerminalPatch(job, digest, matrixResult || null),
  };
  await writeJobPatch(context.db, job.jobId, terminalPatch);
  return {
    ...job,
    ...terminalPatch,
  };
}

function sanitizeJobForUser(job = {}) {
  const normalized = createWorldSimJobRef(job);
  return {
    ...normalized,
    completedAt: safeText(job.completedAt) || null,
    canceledAt: safeText(job.canceledAt) || null,
    errorMessage: safeText(job.errorMessage) || null,
    resultAvailable: Boolean(job.resultAvailable),
    previewSummary: safeText(job.previewSummary),
    queryText: safeText(job.queryText),
    sourceRef: safeText(job.sourceRef) || null,
  };
}

function readJobArtifacts(job = {}) {
  return {
    digest: job.digest || null,
    card: job.resultCard || null,
    section: job.resultSection || null,
    matrix: job.matrixResult || null,
  };
}

async function ensureJobOwnership(db, uid, jobId) {
  const snapshot = await db.collection(WORLD_SIM_JOB_COLLECTION).doc(jobId).get();
  if (!snapshot.exists) {
    const error = new Error("WorldSim job non trovato.");
    error.status = 404;
    error.code = "worldsim-job-not-found";
    throw error;
  }

  const data = snapshot.data() || {};
  if (data.uid !== uid) {
    const error = new Error("Non puoi accedere a questo job WorldSim.");
    error.status = 403;
    error.code = "worldsim-job-forbidden";
    throw error;
  }

  return data;
}

async function createOrReuseWorldSimJob(context, payload) {
  const template = resolveWorldSimTemplate(payload.queryPlan, payload.queryText);
  const jobId = createWorldSimJobHash({
    uid: payload.uid,
    queryText: payload.queryText,
    queryPlan: payload.queryPlan,
    userContext: payload.userContext,
    source: payload.source,
    sourceRef: payload.sourceRef,
    template,
    sourcePayload: payload.sourcePayload,
  });

  const docRef = context.db.collection(WORLD_SIM_JOB_COLLECTION).doc(jobId);
  const snapshot = await docRef.get();

  if (snapshot.exists) {
    const existing = snapshot.data() || {};
    if (isJobReusable(existing)) {
      return {
        job: sanitizeJobForUser(existing),
        digest: existing.digest || null,
        card: existing.resultCard || null,
        section: existing.resultSection || null,
      };
    }
  }

  const job = createJobDocument({
    jobId,
    uid: payload.uid,
    plan: payload.plan || "free",
    template,
    source: payload.source,
    sourceRef: payload.sourceRef,
    queryText: payload.queryText,
    queryPlan: payload.queryPlan,
    userContext: payload.userContext,
    sourcePayload: payload.sourcePayload,
  });

  await docRef.set(job, { merge: true });

  return {
    job: sanitizeJobForUser(job),
    digest: null,
    card: null,
    section: null,
    matrix: null,
  };
}

async function createOrReuseMatrixSimulationJob(context, payload) {
  const interventionPayload = sanitizeInterventionPayload(payload.interventionPayload || payload.intervention);
  const template = resolveWorldSimTemplate(payload.queryPlan, payload.queryText);
  const jobId = createWorldSimJobHash({
    uid: payload.uid,
    queryText: payload.queryText,
    queryPlan: payload.queryPlan,
    userContext: payload.userContext,
    source: payload.source,
    sourceRef: payload.sourceRef,
    template,
    sourcePayload: {
      mode: WORLD_SIM_JOB_KIND_MATRIX,
      branchParentId: payload.branchParentId || null,
      interventionPayload,
    },
  });

  const docRef = context.db.collection(WORLD_SIM_JOB_COLLECTION).doc(jobId);
  const snapshot = await docRef.get();

  if (snapshot.exists) {
    const existing = snapshot.data() || {};
    if (isJobReusable(existing)) {
      return {
        job: sanitizeJobForUser(existing),
        ...readJobArtifacts(existing),
      };
    }
  }

  const job = createMatrixJobDocument({
    jobId,
    uid: payload.uid,
    plan: payload.plan || "free",
    template,
    source: payload.source,
    sourceRef: payload.sourceRef,
    queryText: payload.queryText,
    queryPlan: payload.queryPlan,
    userContext: payload.userContext,
    interventionPayload,
    branchParentId: payload.branchParentId || null,
  });

  await docRef.set(job, { merge: true });

  return {
    job: sanitizeJobForUser(job),
    digest: null,
    card: null,
    section: null,
    matrix: null,
  };
}

async function refreshJob(context, job) {
  if (isTerminalStatus(job.status)) {
    const missingObserveArtifacts =
      job.status === "completed" &&
      job.jobType !== WORLD_SIM_JOB_KIND_MATRIX &&
      !job.resultAvailable &&
      !job.digest &&
      !job.resultCard &&
      !job.resultSection;
    const missingMatrixArtifacts =
      job.status === "completed" &&
      job.jobType === WORLD_SIM_JOB_KIND_MATRIX &&
      (!job.resultAvailable || !job.digest || !job.matrixResult);

    if (missingObserveArtifacts || missingMatrixArtifacts) {
      if (process.env.MIROFISH_BASE_URL) {
        return refreshExternalJob(context, {
          ...job,
          status: "running",
        });
      }
      if (job.jobType === WORLD_SIM_JOB_KIND_MATRIX) {
        return finalizeFallbackMatrixJob(context, job);
      }
      return finalizeFallbackJob(context, job);
    }
    return job;
  }

  if (process.env.MIROFISH_BASE_URL) {
    return refreshExternalJob(context, job);
  }

  if (job.jobType === WORLD_SIM_JOB_KIND_MATRIX) {
    return refreshFallbackMatrixJob(context, job);
  }

  return refreshFallbackJob(context, job);
}

async function createManualWorldSimJob(context, payload) {
  return createOrReuseWorldSimJob(context, {
    uid: payload.uid,
    source: payload.source || "manual",
    sourceRef: payload.sourceRef || "manual",
    queryText: payload.queryText,
    queryPlan: payload.queryPlan,
    userContext: payload.userContext,
    sourcePayload: payload.sourcePayload || null,
    plan: payload.plan || "free",
  });
}

async function createMatrixSimulationJob(context, payload) {
  return createOrReuseMatrixSimulationJob(context, {
    uid: payload.uid,
    plan: payload.plan || "free",
    source: payload.source || "matrix-simulation",
    sourceRef: payload.sourceRef || "worldsim-chamber",
    queryText: payload.queryText,
    queryPlan: payload.queryPlan,
    userContext: payload.userContext,
    interventionPayload: payload.interventionPayload || payload.intervention || {},
    branchParentId: payload.branchParentId || null,
  });
}

async function maybeCreatePredictionWorldSimJob(context, payload) {
  if (!shouldUseAsyncWorldSim(payload)) {
    return { card: payload.card };
  }

  const created = await createOrReuseWorldSimJob(context, {
    uid: payload.uid,
    plan: payload.plan,
    source: "forecast",
    sourceRef: payload.sourceRef || "forecast",
    queryText: payload.queryText,
    queryPlan: payload.queryPlan,
    userContext: payload.userContext,
    sourcePayload: {
      baseCard: payload.card,
    },
  });

  if (created.card) {
    return {
      card: {
        ...created.card,
        world_sim_job: created.job,
      },
      worldSimJob: created.job,
    };
  }

  return {
    card: {
      ...payload.card,
      world_sim: payload.card.world_sim || createPlaceholderDigest({ ...created.job, previewSummary: createPreviewSummary(resolveWorldSimTemplate(payload.queryPlan, payload.queryText), payload.queryText) }),
      world_sim_job: created.job,
    },
    worldSimJob: created.job,
  };
}

async function maybeCreateNextletterWorldSimJobs(context, payload) {
  if (!shouldUseAsyncWorldSim(payload) || !payload.letter || !Array.isArray(payload.letter.sections)) {
    return payload.letter;
  }

  const nextLetter = {
    ...payload.letter,
    sections: payload.letter.sections.map((section) => ({ ...section })),
  };

  for (let index = 0; index < nextLetter.sections.length; index += 1) {
    const section = nextLetter.sections[index];
    const queryText =
      safeText(section.query_suggestion) ||
      [safeText(section.topic), safeText(section.title)].filter(Boolean).join(": ");

    if (!queryText) continue;

    const queryPlan = buildSectionQueryPlan(section, queryText);
    const created = await createOrReuseWorldSimJob(context, {
      uid: payload.uid,
      plan: payload.plan,
      source: "nextletter",
      sourceRef: `section-${index + 1}`,
      queryText,
      queryPlan,
      userContext: payload.userContext,
      sourcePayload: {
        section,
      },
    });

    if (created.section) {
      nextLetter.sections[index] = {
        ...created.section,
        world_sim_job: created.job,
      };
      continue;
    }

    nextLetter.sections[index] = {
      ...section,
      world_sim: section.world_sim || {
        simulation_mode: `job_${created.job.status}`,
        narrative_arc: created.job.previewSummary,
        pivotal_actors: [],
        intervention_points: [],
        prediction_market_frame: null,
      },
      world_sim_job: created.job,
    };
  }

  return nextLetter;
}

async function getWorldSimJobDetail(context, uid, jobId) {
  const job = await ensureJobOwnership(context.db, uid, jobId);
  const refreshed = await refreshJob(context, job);

  return sanitizeJobForUser(refreshed);
}

async function getWorldSimJobResult(context, uid, jobId) {
  const job = await ensureJobOwnership(context.db, uid, jobId);
  const refreshed = await refreshJob(context, job);

  return {
    job: sanitizeJobForUser(refreshed),
    ...readJobArtifacts(refreshed),
  };
}

async function getMatrixSimulationJobDetail(context, uid, jobId) {
  const job = await ensureJobOwnership(context.db, uid, jobId);
  if (job.jobType !== WORLD_SIM_JOB_KIND_MATRIX) {
    const error = new Error("Questo job non e una Matrix Simulation.");
    error.status = 400;
    error.code = "matrix-job-invalid-kind";
    throw error;
  }
  const refreshed = await refreshJob(context, job);
  return sanitizeJobForUser(refreshed);
}

async function getMatrixSimulationJobResult(context, uid, jobId) {
  const job = await ensureJobOwnership(context.db, uid, jobId);
  if (job.jobType !== WORLD_SIM_JOB_KIND_MATRIX) {
    const error = new Error("Questo job non e una Matrix Simulation.");
    error.status = 400;
    error.code = "matrix-job-invalid-kind";
    throw error;
  }
  const refreshed = await refreshJob(context, job);
  return {
    job: sanitizeJobForUser(refreshed),
    ...readJobArtifacts(refreshed),
  };
}

async function cancelWorldSimJob(context, uid, jobId) {
  const job = await ensureJobOwnership(context.db, uid, jobId);

  if (job.status === "completed") {
    return sanitizeJobForUser(job);
  }

  if (job.externalJobId && process.env.MIROFISH_BASE_URL) {
    try {
      await callExternalJobCancel({
        fetchJson: context.fetchJson,
        baseUrl: process.env.MIROFISH_BASE_URL,
        apiKey: process.env.MIROFISH_API_KEY,
        externalJobId: job.externalJobId,
        jobType: job.jobType,
      });
    } catch (error) {
      console.error("WorldSim remote cancel failed:", error);
    }
  }

  const patch = {
    status: "canceled",
    progress: job.progress,
    phase: "canceled",
    statusMessage: "World simulation canceled.",
    lastUpdatedAt: new Date().toISOString(),
    canceledAt: new Date().toISOString(),
    externalStatus: "canceled",
  };

  await writeJobPatch(context.db, jobId, patch);
  return sanitizeJobForUser({
    ...job,
    ...patch,
  });
}

async function cancelMatrixSimulationJob(context, uid, jobId) {
  const job = await ensureJobOwnership(context.db, uid, jobId);
  if (job.jobType !== WORLD_SIM_JOB_KIND_MATRIX) {
    const error = new Error("Questo job non e una Matrix Simulation.");
    error.status = 400;
    error.code = "matrix-job-invalid-kind";
    throw error;
  }
  return cancelWorldSimJob(context, uid, jobId);
}

function normalizeRuntimeMode(value, fallback = "preview") {
  return ["live", "limited", "preview"].includes(value) ? value : fallback;
}

async function getWorldSimRuntimeHealth(context = {}) {
  const baseUrl = safeText(process.env.MIROFISH_BASE_URL).replace(/\/$/, "");
  const fallbackHealth = {
    asyncJobs: true,
    runtime: "mirofish-fallback",
    mode: "preview",
    betaAvailable: false,
    provider: "local-fallback",
    adapterMode: baseUrl ? "fallback" : "unconfigured",
    adapterConfigured: Boolean(baseUrl),
    adapterReachable: false,
    fallbackConfigured: true,
    allowFallback: true,
    agentCount: WORLD_SIM_DEFAULT_AGENT_COUNT,
    matrixSimulation: true,
    models: {},
    plans: WORLD_SIM_PLAN_CONFIG,
  };

  if (!baseUrl) {
    return fallbackHealth;
  }

  const fetchJson =
    context.fetchJson ||
    (async (url, options = {}) => {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response.json();
    });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const adapterHealth = await fetchJson(`${baseUrl}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const adapterMode = safeText(adapterHealth?.adapter_mode, "fallback");
    const configured = Boolean(adapterHealth?.mirofish?.configured);
    const reportedMode = normalizeRuntimeMode(
      safeText(adapterHealth?.mode),
      adapterMode === "original-runtime" && configured ? "limited" : "preview"
    );
    const models =
      adapterHealth?.models && typeof adapterHealth.models === "object"
        ? {
            default: safeText(adapterHealth.models.default),
            graph: safeText(adapterHealth.models.graph),
            simulation: safeText(adapterHealth.models.simulation),
            report: safeText(adapterHealth.models.report),
          }
        : {};

    return {
      ...fallbackHealth,
      runtime: safeText(adapterHealth?.runtime, adapterMode === "original-runtime" ? "mirofish-original" : "mirofish-fallback"),
      mode: reportedMode,
      betaAvailable: configured && reportedMode !== "preview",
      provider: safeText(
        adapterHealth?.provider,
        adapterMode === "original-runtime" ? "openrouter" : "local-fallback"
      ),
      adapterMode,
      adapterReachable: true,
      fallbackConfigured: Boolean(adapterHealth?.mirofish?.allowFallback),
      allowFallback: Boolean(adapterHealth?.mirofish?.allowFallback),
      models,
      validation: adapterHealth?.validation || null,
      activeJobThreads: Number.isFinite(Number(adapterHealth?.activeJobThreads))
        ? Number(adapterHealth.activeJobThreads)
        : 0,
    };
  } catch (error) {
    return {
      ...fallbackHealth,
      adapterMode: "degraded",
      adapterError: safeText(error?.message || String(error)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  WORLD_SIM_JOB_COLLECTION,
  WORLD_SIM_JOB_VERSION,
  WORLD_SIM_DEFAULT_AGENT_COUNT,
  resolveWorldSimTemplate,
  shouldUseAsyncWorldSim,
  createPlaceholderDigest,
  createManualWorldSimJob,
  createMatrixSimulationJob,
  maybeCreatePredictionWorldSimJob,
  maybeCreateNextletterWorldSimJobs,
  getWorldSimJobDetail,
  getWorldSimJobResult,
  getMatrixSimulationJobDetail,
  getMatrixSimulationJobResult,
  cancelWorldSimJob,
  cancelMatrixSimulationJob,
  getWorldSimRuntimeHealth,
};
