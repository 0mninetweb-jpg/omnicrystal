const { GoogleGenAI } = require("@google/genai");

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_PROVIDER = "openrouter";

const OPENROUTER_MODELS = {
  query: "openai/gpt-4.1-mini",
  forecast: "openai/gpt-4.1",
  chat: "openai/gpt-4.1-mini",
  copy: "openai/gpt-4.1-mini",
};

const GEMINI_MODELS = {
  query: "gemini-3-flash-preview",
  forecast: "gemini-3.1-pro-preview",
  chat: "gemini-3-flash-preview",
  copy: "gemini-3-flash-preview",
};

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function resolveModels(provider) {
  const defaults = getDefaultModels(provider);
  return {
    query: safeText(process.env.LLM_MODEL_QUERY, defaults.query),
    forecast: safeText(process.env.LLM_MODEL_FORECAST, defaults.forecast),
    chat: safeText(process.env.LLM_MODEL_CHAT, defaults.chat),
    copy: safeText(process.env.LLM_MODEL_COPY, defaults.copy),
  };
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

function ensureConfigured(config) {
  if (!config.configured) {
    if (config.provider === "gemini") {
      throw new Error("Forecast runtime not configured: GEMINI_API_KEY is missing.");
    }
    throw new Error(`Forecast runtime not configured: ${config.provider.toUpperCase()} LLM_API_KEY is missing.`);
  }
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
  if (Number.isFinite(Number(maxTokens))) {
    requestConfig.maxOutputTokens = Math.max(128, Math.trunc(Number(maxTokens)));
  }

  const response = await ai.models.generateContent({
    model,
    contents: toGeminiContents(messages),
    config: requestConfig,
  });

  return {
    text: safeText(response?.text),
    raw: response,
  };
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
  };

  if (expectJson) {
    payload.response_format = { type: "json_object" };
  }
  if (typeof temperature === "number") {
    payload.temperature = temperature;
  }
  if (Number.isFinite(Number(maxTokens))) {
    payload.max_tokens = Math.max(128, Math.trunc(Number(maxTokens)));
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${message}`);
  }

  const data = await response.json();
  const text = data?.choices
    ?.map((choice) => contentToString(choice?.message?.content))
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return {
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

function createLlmRuntime({ getGeminiApiKey } = {}) {
  function getConfig() {
    const provider = normalizeProvider(process.env.LLM_PROVIDER);
    if (provider === "gemini") {
      const apiKey = safeText(process.env.LLM_API_KEY) || safeText(getGeminiApiKey?.());
      return {
        provider,
        configured: Boolean(apiKey),
        apiKey,
        baseUrl: "",
        models: resolveModels(provider),
      };
    }

    const apiKey = safeText(process.env.LLM_API_KEY);
    return {
      provider,
      configured: Boolean(apiKey),
      apiKey,
      baseUrl: stripTrailingSlash(process.env.LLM_BASE_URL || DEFAULT_OPENROUTER_BASE_URL) || DEFAULT_OPENROUTER_BASE_URL,
      models: resolveModels(provider),
    };
  }

  async function callProvider(config, params) {
    if (config.provider === "gemini") {
      return callGemini(config, params);
    }
    return callOpenRouter(config, params);
  }

  async function generateText({
    modelKind = "forecast",
    prompt = "",
    systemInstruction = "",
    messages = [],
    temperature,
    maxTokens,
  }) {
    const config = getConfig();
    const model = config.models[modelKind] || config.models.forecast;
    const builtMessages = buildMessages({ systemInstruction, prompt, messages });
    const result = await callProvider(config, {
      model,
      messages: builtMessages,
      expectJson: false,
      temperature,
      maxTokens,
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
    const repaired = await callProvider(config, {
      model,
      messages: repairMessages,
      expectJson: true,
      temperature: 0,
    });
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
    const config = getConfig();
    const model = config.models[modelKind] || config.models.forecast;
    const builtMessages = buildMessages({ systemInstruction, prompt, messages });
    const response = await callProvider(config, {
      model,
      messages: builtMessages,
      expectJson: true,
      temperature,
      maxTokens,
    });

    try {
      return extractJsonCandidate(response.text);
    } catch (error) {
      const repairedText = await repairJsonResponse(config, {
        modelKind,
        originalMessages: builtMessages,
        responseText: response.text,
      });

      try {
        return extractJsonCandidate(repairedText);
      } catch (_repairError) {
        throw new Error(
          `Model returned malformed JSON and repair failed. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  function getRuntimeMetadata() {
    const config = getConfig();
    return {
      provider: config.provider,
      configured: config.configured,
      model: config.models.forecast,
      models: { ...config.models },
      baseUrl: config.provider === "openrouter" ? config.baseUrl : undefined,
      structuredOutputs:
        config.provider === "gemini" ? "gemini-json+repair" : "openrouter-json_object+repair",
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
