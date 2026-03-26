const { GoogleGenAI } = require("@google/genai");

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_PROVIDER = "openrouter";

const OPENROUTER_MODELS = {
  query: "openai/gpt-4.1-mini",
  forecast: "openai/gpt-4.1-mini",
  chat: "openai/gpt-4.1-mini",
  copy: "openai/gpt-4.1-mini",
};

const GEMINI_MODELS = {
  query: "gemini-2.5-flash",
  forecast: "gemini-2.5-flash",
  chat: "gemini-2.5-flash",
  copy: "gemini-2.5-flash",
};

const DEFAULT_MAX_TOKENS = {
  query: 768,
  forecast: 1600,
  chat: 640,
  copy: 1200,
  repair: 768,
};
const RETRYABLE_RUNTIME_ERROR_CODES = new Set([
  "provider-rate-limited",
  "provider-upstream-error",
  "provider-fallback-failed",
  "forecast-runtime-not-configured",
]);

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.trunc(parsed));
}

function createRuntimeError(message, code, status = 503, details = {}, cause) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function normalizeProvider(value) {
  const normalized = safeText(value, DEFAULT_PROVIDER).toLowerCase();
  if (normalized === "openai") return "openrouter";
  if (normalized === "gemini") return "gemini";
  return "openrouter";
}

function stripTrailingSlash(value) {
  return safeText(value).replace(/\/+$/, "");
}

function getDefaultModels(provider) {
  return provider === "gemini" ? GEMINI_MODELS : OPENROUTER_MODELS;
}

function resolveModelOverride(provider, overrideValue, fallbackValue) {
  const override = safeText(overrideValue);
  if (!override) return fallbackValue;

  if (provider === "gemini" && !override.toLowerCase().startsWith("gemini")) {
    return fallbackValue;
  }

  return override;
}

function resolveModels(provider, options = {}) {
  const defaults = getDefaultModels(provider);
  if (options.useEnvOverrides === false) {
    return { ...defaults };
  }

  return {
    query: resolveModelOverride(provider, process.env.LLM_MODEL_QUERY, defaults.query),
    forecast: resolveModelOverride(provider, process.env.LLM_MODEL_FORECAST, defaults.forecast),
    chat: resolveModelOverride(provider, process.env.LLM_MODEL_CHAT, defaults.chat),
    copy: resolveModelOverride(provider, process.env.LLM_MODEL_COPY, defaults.copy),
  };
}

function resolveMaxTokens(modelKind, maxTokens) {
  const budget = DEFAULT_MAX_TOKENS[modelKind] || DEFAULT_MAX_TOKENS.forecast;
  const requested = toPositiveInteger(maxTokens);
  if (!requested) return budget;
  return Math.max(128, Math.min(requested, budget));
}

function contentToString(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part.trim();
        if (part && typeof part.text === "string") return part.text.trim();
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function buildMessages({ systemInstruction, prompt, messages }) {
  const built = [];
  const systemText = safeText(systemInstruction);
  if (systemText) {
    built.push({ role: "system", content: systemText });
  }

  if (Array.isArray(messages)) {
    for (const message of messages) {
      const content = contentToString(message?.content);
      if (!content) continue;
      const role = safeText(message?.role, "user").toLowerCase();
      if (role === "system") {
        built.push({ role: "system", content });
      } else if (role === "assistant" || role === "model") {
        built.push({ role: "assistant", content });
      } else {
        built.push({ role: "user", content });
      }
    }
  }

  const promptText = safeText(prompt);
  if (promptText) {
    built.push({ role: "user", content: promptText });
  }

  return built;
}

function getSecretValue(getValue) {
  try {
    return safeText(getValue?.());
  } catch (_error) {
    return "";
  }
}

function ensureConfigured(config) {
  if (config.configured) return;

  if (config.provider === "gemini") {
    throw createRuntimeError(
      "Forecast temporarily unavailable. The Gemini fallback is not configured.",
      "forecast-runtime-not-configured",
      503,
      {
        provider: config.provider,
        configRole: config.role,
      }
    );
  }

  throw createRuntimeError(
    "Forecast temporarily unavailable. The primary OpenRouter provider is not configured.",
    "forecast-runtime-not-configured",
    503,
    {
      provider: config.provider,
      configRole: config.role,
    }
  );
}

function toGeminiContents(messages) {
  const converted = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  return converted.length > 0 ? converted : [{ role: "user", parts: [{ text: "Return an empty JSON object." }] }];
}

function parseJsonPayload(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function serializeError(error) {
  return {
    code: safeText(error?.code, "unknown"),
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : 500,
    message: error instanceof Error ? error.message : String(error),
    details: error?.details || null,
  };
}

function isRetryableRuntimeError(error) {
  const code = safeText(error?.code);
  if (RETRYABLE_RUNTIME_ERROR_CODES.has(code)) {
    return true;
  }

  const status = Number(error?.status);
  if (Number.isFinite(status) && status >= 500) {
    return true;
  }

  const message = safeText(error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("resource_exhausted") ||
    message.includes("rate limited") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("temporarily unavailable") ||
    message.includes("unexpected end of json input") ||
    message.includes("unavailable")
  );
}

function normalizeProviderException(provider, error) {
  if (error?.code && error?.status) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("resource_exhausted") ||
    normalized.includes("quota") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("high demand") ||
    normalized.includes("overloaded")
  ) {
    return createRuntimeError(
      `Forecast temporarily unavailable. ${provider === "gemini" ? "Gemini" : "The provider"} is rate limited right now.`,
      "provider-rate-limited",
      503,
      {
        provider,
        upstreamMessage: message,
      },
      error
    );
  }

  if (
    normalized.includes("unexpected end of json input") ||
    normalized.includes("unavailable") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("\"status\":\"unavailable\"") ||
    normalized.includes("\"code\":503") ||
    normalized.includes("status code 503") ||
    normalized.includes("internal server error")
  ) {
    return createRuntimeError(
      "Unable to generate the forecast right now. Please retry in a moment.",
      "provider-upstream-error",
      503,
      {
        provider,
        upstreamMessage: message,
      },
      error
    );
  }

  return createRuntimeError(
    "Unable to generate the forecast right now. Please retry in a moment.",
    "provider-upstream-error",
    503,
    {
      provider,
      upstreamMessage: message,
    },
    error
  );
}

async function callGemini(config, { model, messages, expectJson = false, temperature, maxTokens, responseSchema }) {
  ensureConfigured(config);
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const systemInstruction = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
  const requestConfig = {};
  if (systemInstruction) {
    requestConfig.systemInstruction = systemInstruction;
  }
  if (expectJson) {
    requestConfig.responseMimeType = "application/json";
    if (responseSchema && typeof responseSchema === "object") {
      requestConfig.responseJsonSchema = responseSchema;
    }
  }
  if (typeof temperature === "number") {
    requestConfig.temperature = temperature;
  }
  requestConfig.maxOutputTokens = resolveMaxTokens(config.maxTokenKind, maxTokens);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: toGeminiContents(messages),
      config: requestConfig,
    });

    return {
      provider: config.provider,
      text: safeText(response?.text),
      raw: response,
    };
  } catch (error) {
    throw normalizeProviderException(config.provider, error);
  }
}

function buildOpenRouterError(response, responseText) {
  const payload = parseJsonPayload(responseText);
  const upstreamMessage = safeText(payload?.error?.message || payload?.message || responseText || response.statusText);
  const details = {
    provider: "openrouter",
    upstreamStatus: response.status,
    upstreamMessage,
  };

  if (response.status === 402) {
    return createRuntimeError(
      "Forecast temporarily unavailable. The primary provider is out of credits.",
      "provider-credits-exhausted",
      503,
      details
    );
  }

  if (response.status === 429) {
    return createRuntimeError(
      "Forecast temporarily unavailable. The primary provider is rate limited right now.",
      "provider-rate-limited",
      503,
      details
    );
  }

  if (response.status >= 500) {
    return createRuntimeError(
      "Unable to generate the forecast right now. Please retry in a moment.",
      "provider-upstream-error",
      503,
      details
    );
  }

  return createRuntimeError(
    "The forecast request was rejected by the primary provider.",
    "provider-request-rejected",
    502,
    details
  );
}

async function callOpenRouter(config, { model, messages, expectJson = false, temperature, maxTokens }) {
  ensureConfigured(config);
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const referer = safeText(process.env.OPENROUTER_SITE_URL);
  const title = safeText(process.env.OPENROUTER_APP_TITLE);
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  const payload = {
    model,
    messages: messages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
      content: message.content,
    })),
    max_tokens: resolveMaxTokens(config.maxTokenKind, maxTokens),
  };

  if (expectJson) {
    payload.response_format = { type: "json_object" };
  }
  if (typeof temperature === "number") {
    payload.temperature = temperature;
  }

  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw normalizeProviderException(config.provider, error);
  }

  if (!response.ok) {
    const message = await response.text();
    throw buildOpenRouterError(response, message);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw normalizeProviderException(config.provider, error);
  }
  const text = data?.choices
    ?.map((choice) => contentToString(choice?.message?.content))
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return {
    provider: config.provider,
    text: safeText(text),
    raw: data,
  };
}

function stripCodeFence(text) {
  const trimmed = safeText(text).replace(/^\uFEFF/, "").trim();
  if (!trimmed) return "";

  const fencedMatch = trimmed.match(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && safeText(fencedMatch[1])) {
    return fencedMatch[1].trim();
  }

  return trimmed.replace(/^`+/, "").replace(/`+$/, "").trim();
}

function buildExcerpt(text, limit = 240) {
  const normalized = safeText(text).replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceLooseString(value, fallback = "") {
  if (typeof value === "string") return safeText(value, fallback);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isPlainObject(value)) {
    return safeText(
      value.text ||
        value.type ||
        value.value ||
        value.label ||
        value.name ||
        value.id ||
        value.domain_id ||
        value.entity_id,
      fallback
    );
  }
  return fallback;
}

function sanitizeStringList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => coerceLooseString(value))
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeObjectList(values = [], mapper) {
  return (Array.isArray(values) ? values : [])
    .map((value, index) => mapper(value, index))
    .filter(Boolean)
    .slice(0, 12);
}

function extractBalancedJsonSnippets(text, limit = 8) {
  const source = safeText(text);
  if (!source) return [];

  const snippets = [];
  let start = -1;
  const stack = [];
  let inString = false;
  let escaped = false;

  const reset = () => {
    start = -1;
    stack.length = 0;
    inString = false;
    escaped = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (start === -1) {
      if (char === "{" || char === "[") {
        start = index;
        stack.push(char);
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack[stack.length - 1] !== expected) {
        reset();
        continue;
      }

      stack.pop();
      if (stack.length === 0 && start >= 0) {
        snippets.push(source.slice(start, index + 1));
        if (snippets.length >= limit) break;
        reset();
      }
    }
  }

  return snippets;
}

function unwrapStagePayload(payload, jsonStage) {
  if (!isPlainObject(payload)) return payload;

  const wrapperKeys = {
    planner: ["query_plan", "plan", "payload", "result"],
    dossier: ["dossier_prediction", "payload", "result"],
    verbalizer: ["voice_payload", "card", "payload", "result"],
  }[safeText(jsonStage).toLowerCase()] || ["payload", "result"];

  for (const key of wrapperKeys) {
    if (isPlainObject(payload[key])) {
      return payload[key];
    }
  }

  return payload;
}

function normalizePlannerPayload(payload) {
  const value = unwrapStagePayload(payload, "planner");
  if (!isPlainObject(value)) return value;

  const mode = isPlainObject(value.mode) ? value.mode : {};
  const entities = sanitizeObjectList(value.entities || value.entity_set, (entity, index) => {
    if (typeof entity === "string") {
      const label = coerceLooseString(entity);
      if (!label) return null;
      return {
        entity_id: `entity_${index + 1}`,
        entity_type: "entity",
        label,
      };
    }
    if (!isPlainObject(entity)) return null;
    const label = coerceLooseString(entity.label, coerceLooseString(entity.entity_id, index === 0 ? "Entity 1" : `Entity ${index + 1}`));
    if (!label) return null;
    return {
      entity_id: coerceLooseString(entity.entity_id, `entity_${index + 1}`),
      entity_type: coerceLooseString(entity.entity_type, "entity"),
      label,
    };
  });

  return {
    ...value,
    plan_version: coerceLooseString(value.plan_version, "crystal-core-v1"),
    primary_domain_id: coerceLooseString(value.primary_domain_id, coerceLooseString(value.domain_id)),
    domain_id: coerceLooseString(value.domain_id, coerceLooseString(value.primary_domain_id)),
    candidate_domains: sanitizeObjectList(value.candidate_domains, (candidate) => {
      if (!isPlainObject(candidate)) return null;
      const domainId = coerceLooseString(candidate.domain_id, coerceLooseString(candidate.id));
      if (!domainId) return null;
      const score = Number(candidate.score);
      return {
        domain_id: domainId,
        score: Number.isFinite(score) ? score : 0,
        reason: coerceLooseString(candidate.reason),
      };
    }),
    intent_shape: coerceLooseString(value.intent_shape),
    resolution_frame: coerceLooseString(value.resolution_frame),
    confidence_mode: coerceLooseString(value.confidence_mode, "balanced"),
    mode: {
      ...mode,
      type: coerceLooseString(mode.type, coerceLooseString(value["mode.type"], "forecast")),
    },
    entity_set: entities,
    entities,
    horizons: sanitizeObjectList(value.horizons, (horizon) => {
      if (!isPlainObject(horizon)) return null;
      const horizonId = coerceLooseString(horizon.horizon_id, coerceLooseString(horizon.id));
      if (!horizonId) return null;
      return {
        horizon_id: horizonId,
        label: coerceLooseString(horizon.label),
        resolution_date: coerceLooseString(horizon.resolution_date),
        confidence_window: coerceLooseString(horizon.confidence_window),
      };
    }),
    card_types: sanitizeStringList(value.card_types),
    question_side_a: coerceLooseString(value.question_side_a),
    question_side_b: coerceLooseString(value.question_side_b),
    event_date: coerceLooseString(value.event_date),
    governing_entity: coerceLooseString(value.governing_entity),
    jurisdiction: coerceLooseString(value.jurisdiction),
    supporting_domains: sanitizeStringList(value.supporting_domains),
    subdomain_map: sanitizeObjectList(value.subdomain_map, (item, index) => {
      if (!isPlainObject(item)) return null;
      const label = coerceLooseString(item.label, coerceLooseString(item.id, `subdomain_${index + 1}`));
      if (!label) return null;
      return {
        id: coerceLooseString(item.id, `subdomain_${index + 1}`),
        label,
        why_it_matters: coerceLooseString(item.why_it_matters, coerceLooseString(item.reason)),
      };
    }),
  };
}

function normalizeProbabilitySplit(probabilitySplit) {
  if (!isPlainObject(probabilitySplit)) return null;
  const normalized = {
    primary_label: safeText(probabilitySplit.primary_label),
    primary_probability: Number(probabilitySplit.primary_probability),
    secondary_label: safeText(probabilitySplit.secondary_label),
    secondary_probability: Number(probabilitySplit.secondary_probability),
  };

  if (!normalized.primary_label && !normalized.secondary_label) {
    return null;
  }

  if (!Number.isFinite(normalized.primary_probability)) {
    delete normalized.primary_probability;
  }
  if (!Number.isFinite(normalized.secondary_probability)) {
    delete normalized.secondary_probability;
  }

  return normalized;
}

function normalizeBinaryContract(binaryContract) {
  if (!isPlainObject(binaryContract)) return null;

  const normalized = {
    question_side_a: safeText(binaryContract.question_side_a),
    question_side_b: safeText(binaryContract.question_side_b),
    question_side_a_probability: Number(binaryContract.question_side_a_probability),
    question_side_b_probability: Number(binaryContract.question_side_b_probability),
    winning_side: safeText(binaryContract.winning_side),
    winning_probability: Number(binaryContract.winning_probability),
    band: safeText(binaryContract.band),
    display_call: safeText(binaryContract.display_call),
    flip_conditions: sanitizeStringList(binaryContract.flip_conditions),
  };

  if (
    !normalized.question_side_a &&
    !normalized.question_side_b &&
    !normalized.winning_side &&
    !normalized.display_call &&
    normalized.flip_conditions.length === 0
  ) {
    return null;
  }

  if (!Number.isFinite(normalized.question_side_a_probability)) {
    delete normalized.question_side_a_probability;
  }
  if (!Number.isFinite(normalized.question_side_b_probability)) {
    delete normalized.question_side_b_probability;
  }
  if (!Number.isFinite(normalized.winning_probability)) {
    delete normalized.winning_probability;
  }

  return normalized;
}

function normalizeDossierPayload(payload) {
  const value = unwrapStagePayload(payload, "dossier");
  if (!isPlainObject(value)) return value;

  const rawPrediction = isPlainObject(value.raw_prediction) ? value.raw_prediction : {};

  return {
    ...value,
    structured_dossier: isPlainObject(value.structured_dossier) ? value.structured_dossier : {},
    feature_bundle: sanitizeObjectList(value.feature_bundle, (feature, index) => {
      if (!isPlainObject(feature)) return null;
      const label = safeText(feature.label, `feature_${index + 1}`);
      return {
        label,
        direction: safeText(feature.direction),
        confidence: Number.isFinite(Number(feature.confidence)) ? Number(feature.confidence) : undefined,
        note: safeText(feature.note),
      };
    }),
    baseline_consensus_pack: isPlainObject(value.baseline_consensus_pack) ? value.baseline_consensus_pack : {},
    raw_prediction: {
      ...rawPrediction,
      primary_call: safeText(rawPrediction.primary_call),
      probability_split: normalizeProbabilitySplit(rawPrediction.probability_split),
      binary_contract: normalizeBinaryContract(rawPrediction.binary_contract),
      confidence_score: Number.isFinite(Number(rawPrediction.confidence_score)) ? Number(rawPrediction.confidence_score) : undefined,
      key_drivers: sanitizeStringList(rawPrediction.key_drivers),
      counter_signals: sanitizeStringList(rawPrediction.counter_signals),
      invalidators: sanitizeStringList(rawPrediction.invalidators),
      historical_anchors: sanitizeStringList(rawPrediction.historical_anchors),
      why_this_side: safeText(rawPrediction.why_this_side),
      recommended_posture: safeText(rawPrediction.recommended_posture),
      scenario_set: sanitizeObjectList(rawPrediction.scenario_set, (scenario, index) => {
        if (!isPlainObject(scenario)) return null;
        const label = safeText(scenario.label, `scenario_${index + 1}`);
        return {
          label,
          outcome: safeText(scenario.outcome),
          probability: Number.isFinite(Number(scenario.probability)) ? Number(scenario.probability) : undefined,
          drivers: sanitizeStringList(scenario.drivers),
        };
      }),
    },
  };
}

function normalizeVerbalizerPayload(payload) {
  const value = unwrapStagePayload(payload, "verbalizer");
  if (!isPlainObject(value)) return value;

  return {
    ...value,
    title: safeText(value.title),
    summary: safeText(value.summary),
    verdict: safeText(value.verdict),
    recommended_action: safeText(value.recommended_action),
    what_to_watch: sanitizeStringList(value.what_to_watch),
    how_to_raise_confidence: sanitizeStringList(value.how_to_raise_confidence),
    coverage_notes: sanitizeStringList(value.coverage_notes),
  };
}

function normalizeStagePayload(payload, jsonStage) {
  switch (safeText(jsonStage).toLowerCase()) {
    case "planner":
      return normalizePlannerPayload(payload);
    case "dossier":
      return normalizeDossierPayload(payload);
    case "verbalizer":
      return normalizeVerbalizerPayload(payload);
    default:
      return payload;
  }
}

function validateStagePayload(payload, jsonStage) {
  const stage = safeText(jsonStage).toLowerCase();
  if (stage === "planner") {
    const normalized = normalizePlannerPayload(payload);
    if (!isPlainObject(normalized)) {
      return { ok: false, reason: "Planner payload must be a JSON object." };
    }
    if (
      !safeText(normalized.primary_domain_id) &&
      !safeText(normalized.domain_id) &&
      (!Array.isArray(normalized.candidate_domains) || normalized.candidate_domains.length === 0)
    ) {
      return { ok: false, reason: "Planner payload is missing domain routing fields." };
    }
    if (!safeText(normalized.intent_shape) && !safeText(normalized.resolution_frame)) {
      return { ok: false, reason: "Planner payload is missing intent/resolution framing." };
    }
    return { ok: true, value: normalized };
  }

  if (stage === "dossier") {
    const normalized = normalizeDossierPayload(payload);
    if (!isPlainObject(normalized)) {
      return { ok: false, reason: "Dossier payload must be a JSON object." };
    }
    if (!isPlainObject(normalized.raw_prediction)) {
      return { ok: false, reason: "Dossier payload is missing raw_prediction." };
    }
    if (
      !safeText(normalized.raw_prediction.primary_call) &&
      !normalized.raw_prediction.binary_contract &&
      !normalized.raw_prediction.probability_split &&
      normalized.raw_prediction.key_drivers.length === 0
    ) {
      return { ok: false, reason: "Dossier payload is missing a usable prediction thesis." };
    }
    return { ok: true, value: normalized };
  }

  if (stage === "verbalizer") {
    const normalized = normalizeVerbalizerPayload(payload);
    if (!isPlainObject(normalized)) {
      return { ok: false, reason: "Verbalizer payload must be a JSON object." };
    }
    if (
      !normalized.title &&
      !normalized.summary &&
      !normalized.verdict &&
      !normalized.recommended_action &&
      normalized.what_to_watch.length === 0
    ) {
      return { ok: false, reason: "Verbalizer payload is missing card copy fields." };
    }
    return { ok: true, value: normalized };
  }

  if (!isPlainObject(payload) && !Array.isArray(payload)) {
    return { ok: false, reason: "JSON payload must be an object or array." };
  }

  return { ok: true, value: payload };
}

function getJsonRepairContract(jsonStage) {
  switch (safeText(jsonStage).toLowerCase()) {
    case "planner":
      return `Return one JSON object with:
- plan_version
- primary_domain_id
- domain_id
- candidate_domains[]
- intent_shape
- resolution_frame
- confidence_mode
- mode { type }
- entity_set[]
- entities[]
- horizons[]
- card_types[]
- question_side_a
- question_side_b
- event_date
- governing_entity
- jurisdiction
- supporting_domains[]
- subdomain_map[]`;
    case "dossier":
      return `Return one JSON object with:
- structured_dossier {}
- feature_bundle[]
- baseline_consensus_pack {}
- raw_prediction {
  primary_call,
  probability_split {},
  binary_contract {},
  confidence_score,
  key_drivers[],
  counter_signals[],
  invalidators[],
  historical_anchors[],
  why_this_side,
  recommended_posture,
  scenario_set[]
}`;
    case "verbalizer":
      return `Return one JSON object with:
- title
- summary
- verdict
- recommended_action
- what_to_watch[]
- how_to_raise_confidence[]
- coverage_notes[]`;
    default:
      return "Return one valid JSON object or array. Never return a quoted string.";
  }
}

function createJsonExtractionError(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  return error;
}

function extractJsonCandidate(text, options = {}) {
  const stage = safeText(options.jsonStage, "generic").toLowerCase();
  const failures = [];
  const queue = [];
  const seen = new Set();

  const enqueue = (candidate, source) => {
    const normalized = stripCodeFence(candidate);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    queue.push({ text: normalized, source });
  };

  const acceptParsedValue = (parsedValue, source) => {
    if (typeof parsedValue === "string") {
      enqueue(parsedValue, `${source}:json-string`);
      failures.push(`${source} parsed as a JSON string instead of a JSON object.`);
      return null;
    }

    const validation = validateStagePayload(parsedValue, stage);
    if (validation.ok) {
      return validation.value;
    }

    failures.push(`${source} failed ${stage} validation: ${validation.reason}`);
    return null;
  };

  enqueue(text, "response");

  while (queue.length > 0) {
    const current = queue.shift();
    const parsed = parseJsonPayload(current.text);
    if (parsed !== null) {
      const accepted = acceptParsedValue(parsed, current.source);
      if (accepted) {
        return accepted;
      }
    }

    for (const snippet of extractBalancedJsonSnippets(current.text)) {
      enqueue(snippet, `${current.source}:balanced-json`);
    }
  }

  throw createJsonExtractionError("Model returned malformed JSON.", {
    jsonStage: stage,
    excerpt: buildExcerpt(text),
    failures: failures.slice(0, 8),
  });
}

function messagesToPlainText(messages, limit = 12000) {
  const plain = messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n")
    .trim();
  return plain.length > limit ? plain.slice(0, limit) : plain;
}

function shouldAttemptFallback(primaryConfig, fallbackConfig, error) {
  if (primaryConfig.provider !== "openrouter") return false;
  if (!fallbackConfig.configured) return false;

  if (error?.code === "forecast-runtime-not-configured") {
    return safeText(error?.details?.provider) === "openrouter";
  }

  if (error?.code === "provider-credits-exhausted" || error?.code === "provider-rate-limited") {
    return true;
  }

  if (error?.code === "provider-upstream-error") {
    const upstreamStatus = Number(error?.details?.upstreamStatus);
    return !Number.isFinite(upstreamStatus) || upstreamStatus >= 500;
  }

  return false;
}

function buildFallbackFailureError(primaryConfig, fallbackConfig, primaryError, fallbackError = null) {
  const message =
    primaryError?.code === "provider-credits-exhausted"
      ? "Forecast temporarily unavailable. The primary provider is out of credits and the Gemini backup could not complete the request."
      : "Forecast temporarily unavailable. The primary provider failed and the Gemini backup could not complete the request.";

  return createRuntimeError(
    message,
    "provider-fallback-failed",
    503,
    {
      primaryProvider: primaryConfig.provider,
      fallbackProvider: fallbackConfig.provider,
      primaryError: serializeError(primaryError),
      fallbackError: fallbackError ? serializeError(fallbackError) : null,
      fallbackConfigured: fallbackConfig.configured,
    }
  );
}

function buildPrimaryConfig(getGeminiApiKey) {
  const provider = normalizeProvider(process.env.LLM_PROVIDER);
  if (provider === "gemini") {
    const apiKey = safeText(process.env.GEMINI_API_KEY) || getSecretValue(getGeminiApiKey) || safeText(process.env.LLM_API_KEY);
    return {
      provider,
      role: "primary",
      configured: Boolean(apiKey),
      apiKey,
      baseUrl: "",
      models: resolveModels(provider),
      maxTokenKind: "forecast",
    };
  }

  const apiKey = safeText(process.env.LLM_API_KEY);
  return {
    provider,
    role: "primary",
    configured: Boolean(apiKey),
    apiKey,
    baseUrl: stripTrailingSlash(process.env.LLM_BASE_URL || DEFAULT_OPENROUTER_BASE_URL) || DEFAULT_OPENROUTER_BASE_URL,
    models: resolveModels(provider),
    maxTokenKind: "forecast",
  };
}

function buildGeminiFallbackConfig(getGeminiApiKey) {
  const apiKey = getSecretValue(getGeminiApiKey);
  return {
    provider: "gemini",
    role: "fallback",
    configured: Boolean(apiKey),
    apiKey,
    baseUrl: "",
    models: resolveModels("gemini", { useEnvOverrides: false }),
    maxTokenKind: "forecast",
  };
}

function createLlmRuntime({ getGeminiApiKey } = {}) {
  function getPrimaryConfig() {
    return buildPrimaryConfig(getGeminiApiKey);
  }

  function getFallbackConfig(primaryConfig) {
    if (primaryConfig.provider !== "openrouter") {
      return {
        provider: "gemini",
        role: "fallback",
        configured: false,
        apiKey: "",
        baseUrl: "",
        models: resolveModels("gemini", { useEnvOverrides: false }),
        maxTokenKind: "forecast",
      };
    }

    return buildGeminiFallbackConfig(getGeminiApiKey);
  }

  async function callProvider(config, params) {
    const configWithBudget = {
      ...config,
      maxTokenKind: params.maxTokenKind || config.maxTokenKind || "forecast",
    };

    if (config.provider === "gemini") {
      return callGemini(configWithBudget, params);
    }
    return callOpenRouter(configWithBudget, params);
  }

  async function callProviderWithFallback(primaryConfig, params) {
    const fallbackConfig = getFallbackConfig(primaryConfig);

    try {
      return await callProvider(primaryConfig, params);
    } catch (error) {
      const primaryError = normalizeProviderException(primaryConfig.provider, error);
      if (!shouldAttemptFallback(primaryConfig, fallbackConfig, primaryError)) {
        throw primaryError;
      }

      try {
        const fallbackModelKind = params.modelKind || params.maxTokenKind || "forecast";
        return await callProvider(fallbackConfig, {
          ...params,
          model: fallbackConfig.models[fallbackModelKind] || fallbackConfig.models.forecast,
        });
      } catch (fallbackError) {
        const normalizedFallbackError = normalizeProviderException(fallbackConfig.provider, fallbackError);
        throw buildFallbackFailureError(primaryConfig, fallbackConfig, primaryError, normalizedFallbackError);
      }
    }
  }

  async function generateText({
    modelKind = "forecast",
    prompt = "",
    systemInstruction = "",
    messages = [],
    temperature,
    maxTokens,
  }) {
    const primaryConfig = getPrimaryConfig();
    const model = primaryConfig.models[modelKind] || primaryConfig.models.forecast;
    const builtMessages = buildMessages({ systemInstruction, prompt, messages });
    const result = await callProviderWithFallback(primaryConfig, {
      model,
      messages: builtMessages,
      expectJson: false,
      temperature,
      maxTokens,
      modelKind,
      maxTokenKind: modelKind,
    });
    return result.text;
  }

  async function repairJsonResponse(config, { modelKind, originalMessages, responseText, jsonStage }) {
    const model = config.models[modelKind] || config.models.copy || config.models.forecast;
    const repairMessages = [
      {
        role: "system",
        content:
          `You repair malformed JSON for Crystal. Return only valid JSON with no markdown, no commentary, and no wrapper text.\n${getJsonRepairContract(
            jsonStage
          )}`,
      },
      {
        role: "user",
        content: `Repair this malformed JSON response so it becomes valid JSON for the "${safeText(
          jsonStage,
          "generic"
        )}" stage.\n\nOriginal request context:\n${messagesToPlainText(
          originalMessages
        )}\n\nMalformed response:\n${responseText}\n\nReturn one JSON object only.`,
      },
    ];
    const repairParams = {
      model,
      messages: repairMessages,
      expectJson: true,
      temperature: 0,
      modelKind,
      maxTokenKind: "repair",
    };
    const repaired =
      config.role === "primary" ? await callProviderWithFallback(config, repairParams) : await callProvider(config, repairParams);
    return repaired.text;
  }

  async function generateJson({
    modelKind = "forecast",
    prompt = "",
    systemInstruction = "",
    messages = [],
    temperature,
    maxTokens,
    jsonStage = "",
    responseSchema = null,
    preferTextMode = false,
  }) {
    const primaryConfig = getPrimaryConfig();
    const builtMessages = buildMessages({ systemInstruction, prompt, messages });
    const primaryModel = primaryConfig.models[modelKind] || primaryConfig.models.forecast;
    const response = await callProviderWithFallback(primaryConfig, {
      model: primaryModel,
      messages: builtMessages,
      expectJson: !preferTextMode,
      temperature,
      maxTokens,
      modelKind,
      maxTokenKind: modelKind,
      responseSchema: preferTextMode ? null : responseSchema,
    });

    try {
      return extractJsonCandidate(response.text, { jsonStage });
    } catch (error) {
      const effectiveConfig =
        response.provider === primaryConfig.provider
          ? {
              ...primaryConfig,
              maxTokenKind: modelKind,
            }
          : {
              ...getFallbackConfig(primaryConfig),
              maxTokenKind: modelKind,
            };
      const repairedText = await repairJsonResponse(effectiveConfig, {
        modelKind,
        originalMessages: builtMessages,
        responseText: response.text,
        jsonStage,
      });

      try {
        return extractJsonCandidate(repairedText, { jsonStage });
      } catch (repairError) {
        throw createRuntimeError(
          "Unable to generate the forecast right now. The model returned invalid JSON twice.",
          "provider-upstream-error",
          503,
          {
            provider: effectiveConfig.provider,
            stage: "json-repair",
            json_stage: safeText(jsonStage, "generic"),
            model: primaryModel,
            reason: error instanceof Error ? error.message : String(error),
            raw_excerpt: buildExcerpt(response.text),
            repair_excerpt: buildExcerpt(repairedText),
            raw_failures: Array.isArray(error?.details?.failures) ? error.details.failures : [],
            repair_failures: Array.isArray(repairError?.details?.failures) ? repairError.details.failures : [],
          }
        );
      }
    }
  }

  function getRuntimeMetadata() {
    const primaryConfig = getPrimaryConfig();
    const fallbackConfig = getFallbackConfig(primaryConfig);
    const available = primaryConfig.configured || fallbackConfig.configured;

    return {
      provider: primaryConfig.provider,
      configured: available,
      available,
      primaryConfigured: primaryConfig.configured,
      fallbackProvider: fallbackConfig.provider,
      fallbackConfigured: fallbackConfig.configured,
      mode: primaryConfig.configured ? "live" : fallbackConfig.configured ? "limited" : "preview",
      model: primaryConfig.models.forecast,
      models: { ...primaryConfig.models },
      baseUrl: primaryConfig.provider === "openrouter" ? primaryConfig.baseUrl : undefined,
      structuredOutputs:
        primaryConfig.provider === "gemini"
          ? "gemini-json+repair"
          : fallbackConfig.configured
            ? "openrouter-json_object+repair+gemini-fallback"
            : "openrouter-json_object+repair",
    };
  }

  return {
    generateText,
    generateJson,
    getRuntimeMetadata,
  };
}

module.exports = {
  createLlmRuntime,
  isRetryableRuntimeError,
};
