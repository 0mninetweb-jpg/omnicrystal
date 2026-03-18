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
  query: "gemini-3-flash-preview",
  forecast: "gemini-3.1-pro-preview",
  chat: "gemini-3-flash-preview",
  copy: "gemini-3-flash-preview",
};

const DEFAULT_MAX_TOKENS = {
  query: 384,
  forecast: 1600,
  chat: 640,
  copy: 1200,
  repair: 512,
};

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

function resolveModels(provider, options = {}) {
  const defaults = getDefaultModels(provider);
  if (options.useEnvOverrides === false) {
    return { ...defaults };
  }

  return {
    query: safeText(process.env.LLM_MODEL_QUERY, defaults.query),
    forecast: safeText(process.env.LLM_MODEL_FORECAST, defaults.forecast),
    chat: safeText(process.env.LLM_MODEL_CHAT, defaults.chat),
    copy: safeText(process.env.LLM_MODEL_COPY, defaults.copy),
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

function normalizeProviderException(provider, error) {
  if (error?.code && error?.status) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("resource_exhausted") || normalized.includes("quota")) {
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

async function callGemini(config, { model, messages, expectJson = false, temperature, maxTokens }) {
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

  const data = await response.json();
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
  return safeText(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonCandidate(text) {
  const trimmed = stripCodeFence(text);
  if (!trimmed) {
    throw new Error("Empty JSON response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    // Keep trying with extracted object below.
  }

  const candidates = [];
  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(trimmed.slice(firstObject, lastObject + 1));
  }
  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    candidates.push(trimmed.slice(firstArray, lastArray + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      // Try next candidate.
    }
  }

  throw new Error("Model returned malformed JSON.");
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
    const apiKey = safeText(process.env.LLM_API_KEY) || getSecretValue(getGeminiApiKey);
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

  async function repairJsonResponse(config, { modelKind, originalMessages, responseText }) {
    const model = config.models[modelKind] || config.models.copy || config.models.forecast;
    const repairMessages = [
      {
        role: "system",
        content:
          "You repair malformed JSON. Return only valid JSON. Do not add commentary, markdown fences, or extra keys unless needed to make the payload syntactically valid.",
      },
      {
        role: "user",
        content: `Repair this malformed JSON response so it becomes valid JSON.\n\nOriginal request context:\n${messagesToPlainText(
          originalMessages
        )}\n\nMalformed response:\n${responseText}`,
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
  }) {
    const primaryConfig = getPrimaryConfig();
    const builtMessages = buildMessages({ systemInstruction, prompt, messages });
    const primaryModel = primaryConfig.models[modelKind] || primaryConfig.models.forecast;
    const response = await callProviderWithFallback(primaryConfig, {
      model: primaryModel,
      messages: builtMessages,
      expectJson: true,
      temperature,
      maxTokens,
      modelKind,
      maxTokenKind: modelKind,
    });

    try {
      return extractJsonCandidate(response.text);
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
      });

      try {
        return extractJsonCandidate(repairedText);
      } catch (_repairError) {
        throw createRuntimeError(
          "Unable to generate the forecast right now. The model returned invalid JSON twice.",
          "provider-upstream-error",
          503,
          {
            provider: effectiveConfig.provider,
            stage: "json-repair",
            reason: error instanceof Error ? error.message : String(error),
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
};
