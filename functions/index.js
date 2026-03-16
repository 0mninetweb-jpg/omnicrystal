const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { GoogleGenAI, Type } = require("@google/genai");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const googleTrends = require("google-trends-api");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const NIXTLA_API_KEY = defineSecret("NIXTLA_API_KEY");

const SUPPORTED_DOMAINS = [
  "A.1.macro.gdp_growth",
  "A.1.macro.interest_rates",
  "A.1.macro.unemployment_rate",
  "A.2.markets.equity_indices",
  "A.2.markets.crypto_volatility",
  "A.2.markets.commodity_prices",
  "A.3.real_estate.residential_prices",
  "A.3.real_estate.commercial_rents",
  "A.3.real_estate.mortgage_rates",
  "A.4.climate.extreme_weather_risk",
  "A.4.climate.temperature_anomalies",
  "A.4.climate.precipitation_forecast",
  "A.5.energy.gas_prices",
  "A.5.energy.electricity_costs",
  "A.5.energy.renewable_transition",
  "A.6.tech.ai_adoption_rate",
  "A.6.tech.cybersecurity_threats",
  "A.6.tech.semiconductor_supply",
  "A.7.city_pulse.micro_area_change",
  "A.7.city_pulse.gentrification_index",
  "A.7.city_pulse.crime_rate_trends",
  "A.8.health.pandemic_risk",
  "A.8.health.healthcare_capacity",
  "A.8.health.drug_shortages",
  "A.9.travel.disruption_risk",
  "A.9.travel.tourism_intensity",
  "A.9.travel.flight_cancellations",
  "A.10.consumer.retail_spending",
  "A.10.consumer.ecommerce_growth",
  "A.10.consumer.consumer_confidence",
  "A.11.geopolitics.trade_tensions",
  "A.11.geopolitics.supply_chain_disruption",
  "A.11.geopolitics.election_volatility",
  "A.12.cost_of_living.inflation_pressure",
  "A.12.cost_of_living.grocery_basket_cost",
  "A.12.cost_of_living.housing_affordability",
];

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_error) {
      return {};
    }
  }
  return req.body;
}

function stripApiPrefix(pathname) {
  const path = pathname || "/";
  return path.startsWith("/api/") ? path.slice(4) : path === "/api" ? "/" : path;
}

function respondJson(res, status, payload) {
  res.status(status);
  res.set("Cache-Control", "no-store");
  res.set("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

function sanitizeSegment(value, fallback = "global") {
  const normalized = String(value || fallback).trim().toLowerCase();
  const safe = normalized.replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || fallback;
}

function createQueryHash(queryText) {
  return crypto.createHash("sha256").update(queryText.trim().toLowerCase()).digest("hex");
}

function clamp01(value, fallback = 0.5) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function sanitizeList(list) {
  return Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim()) : [];
}

function normalizeCard(card, queryPlan) {
  const nowIso = new Date().toISOString();
  const domain = typeof card?.domain === "string" && card.domain ? card.domain : queryPlan?.domain_id || "general";
  const scenarioSet = Array.isArray(card?.scenario_set)
    ? card.scenario_set.map((scenario, index) => ({
        scenario_id: scenario?.scenario_id || `scenario_${index + 1}`,
        label: scenario?.label || `Scenario ${index + 1}`,
        probability: clamp01(scenario?.probability, 0.33),
      }))
    : [];
  const soWhat = Array.isArray(card?.so_what)
    ? card.so_what.map((option, index) => ({
        option_id: option?.option_id || `option_${index + 1}`,
        label: option?.label || `Azione ${index + 1}`,
        tradeoff_note: option?.tradeoff_note || "Valuta pro e contro in base al tuo contesto.",
      }))
    : [];
  const drivers = Array.isArray(card?.drivers)
    ? card.drivers.map((driver, index) => ({
        feature_key: driver?.feature_key || `driver_${index + 1}`,
        direction: ["up", "down", "flat"].includes(driver?.direction) ? driver.direction : "flat",
        contribution: Number.isFinite(Number(driver?.contribution)) ? Number(driver.contribution) : 0.33,
        historical_trend: Array.isArray(driver?.historical_trend)
          ? driver.historical_trend
              .filter((point) => Number.isFinite(Number(point?.year)) && Number.isFinite(Number(point?.value)))
              .map((point) => ({
                year: Number(point.year),
                value: Number(point.value),
              }))
          : undefined,
      }))
    : [];

  return {
    card_id: card?.card_id || crypto.randomUUID(),
    card_type: card?.card_type || "prediction_summary",
    domain,
    stakes_level: ["low", "medium", "high", "imminent"].includes(card?.stakes_level) ? card.stakes_level : "medium",
    risk_band: ["low", "medium", "high", "extreme"].includes(card?.risk_band) ? card.risk_band : "medium",
    title: card?.title || "Crystal Forecast",
    summary: card?.summary || "Crystal ha generato una previsione basata sui segnali disponibili.",
    verdict: card?.verdict || card?.summary || "Scenario in evoluzione.",
    personal_output: typeof card?.personal_output === "string" ? card.personal_output : "",
    scenario_set: scenarioSet,
    so_what: soWhat,
    ranked_list: Array.isArray(card?.ranked_list)
      ? card.ranked_list.map((item, index) => ({
          item_id: item?.item_id || `item_${index + 1}`,
          label: item?.label || `Elemento ${index + 1}`,
          score: clamp01(item?.score, 0.5),
          rank: Number.isFinite(Number(item?.rank)) ? Number(item.rank) : index + 1,
          note: typeof item?.note === "string" ? item.note : "",
        }))
      : [],
    drivers,
    trust_layer: {
      confidence_score: clamp01(card?.trust_layer?.confidence_score, 0.62),
      confidence_tier: ["low", "medium", "high"].includes(card?.trust_layer?.confidence_tier)
        ? card.trust_layer.confidence_tier
        : "medium",
      data_sufficiency_flag: ["insufficient", "partial", "sufficient"].includes(card?.trust_layer?.data_sufficiency_flag)
        ? card.trust_layer.data_sufficiency_flag
        : "partial",
      freshness: {
        staleness_bucket: ["fresh", "stale", "unknown"].includes(card?.trust_layer?.freshness?.staleness_bucket)
          ? card.trust_layer.freshness.staleness_bucket
          : "fresh",
        as_of_utc: typeof card?.trust_layer?.freshness?.as_of_utc === "string" ? card.trust_layer.freshness.as_of_utc : nowIso,
      },
      provenance_summary: {
        verification_level: ["unverified", "partially_verified", "verified", "official"].includes(
          card?.trust_layer?.provenance_summary?.verification_level
        )
          ? card.trust_layer.provenance_summary.verification_level
          : "partially_verified",
        license_summary: sanitizeList(card?.trust_layer?.provenance_summary?.license_summary),
      },
    },
  };
}

function normalizeQuotePayload(payload) {
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const today = new Date().toLocaleDateString("it-IT");
  return {
    quotes: quotes.map((quote, index) => ({
      quote_id: quote?.quote_id || `quote_${index + 1}`,
      text: quote?.text || "Il segnale non e ancora abbastanza chiaro.",
      author: quote?.author || "Crystal Intelligence",
      context: quote?.context || "General",
      date: quote?.date || today,
      analysis: {
        title: quote?.analysis?.title || "Analisi Crystal",
        full_text: quote?.analysis?.full_text || "Analisi non disponibile.",
        drivers: sanitizeList(quote?.analysis?.drivers),
        impact: quote?.analysis?.impact || "Impatto in valutazione.",
        historical_parallel: quote?.analysis?.historical_parallel || "Nessun parallelo disponibile.",
      },
    })),
  };
}

function getGemini() {
  const apiKey = GEMINI_API_KEY.value();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY non configurata per Firebase Functions.");
  }
  return new GoogleGenAI({ apiKey });
}

async function requireUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    throw new Error("Authentication required.");
  }
  return admin.auth().verifyIdToken(token);
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${message}`);
  }
  return response.json();
}

async function withRetry(fn, retries = 2, delayMs = 2000) {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaError = message.includes("429") || message.includes("RESOURCE_EXHAUSTED");
    if (isQuotaError && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
    throw error;
  }
}

async function fetchCachedCard(queryText, domain, city) {
  const safeDomain = sanitizeSegment(domain, "general");
  const safeCity = sanitizeSegment(city, "global");
  const queryHash = createQueryHash(queryText);
  const docRef = db.doc(`cached_cards/${safeDomain}/${safeCity}/${queryHash}`);
  const snapshot = await docRef.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  const ttl = data?.ttl?.toDate ? data.ttl.toDate() : null;
  if (!ttl || ttl <= new Date()) return null;
  return data.card_data || null;
}

async function saveCachedCard(card, queryText, domain, city) {
  const safeDomain = sanitizeSegment(domain, "general");
  const safeCity = sanitizeSegment(city, "global");
  const queryHash = createQueryHash(queryText);
  const ttl = new Date();
  ttl.setHours(ttl.getHours() + 24);
  await db.doc(`cached_cards/${safeDomain}/${safeCity}/${queryHash}`).set(
    {
      card_id: card.card_id,
      domain,
      city,
      query: queryText,
      query_hash: queryHash,
      card_data: card,
      generated_at: admin.firestore.FieldValue.serverTimestamp(),
      ttl: admin.firestore.Timestamp.fromDate(ttl),
    },
    { merge: true }
  );
}

async function get20YearHistoricalContext(domain, city, ai) {
  const docId = sanitizeSegment(`${domain}_${city || "global"}`, "global");
  const docRef = db.collection("historical_20y_summaries").doc(docId);
  const snapshot = await docRef.get();
  if (snapshot.exists) {
    return snapshot.data()?.summary || "";
  }

  const prompt = `Genera un riassunto storico fattuale e analitico degli ultimi 20 anni per il dominio "${domain}"${
    city ? ` con focus specifico sull'area di ${city}` : " a livello globale"
  }.
Includi:
1. Principali cicli di mercato o trend.
2. Cambiamenti strutturali e normativi.
3. Eventi cigno nero o shock esogeni.
4. Benchmark storici rilevanti.
Sii conciso, usa elenchi puntati, massimo 250 parole.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
  });

  const summary = response.text || "Nessun dato storico disponibile.";
  await docRef.set({
    domain,
    city: city || "global",
    summary,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return summary;
}

async function fetchHistoricalDataForTimeGPT(domain, city) {
  if (domain === "markets_and_assets" || domain === "crypto" || domain.includes("crypto")) {
    const klines = await fetchJson("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=90");
    const series = {};
    for (const item of klines) {
      series[new Date(item[0]).toISOString().split("T")[0]] = Number(item[4]);
    }
    return series;
  }

  if (domain === "weather" || domain === "climate_impact" || domain.includes("climate")) {
    let lat = 41.9028;
    let lon = 12.4964;
    if (city) {
      const geocode = await fetchJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
      );
      if (Array.isArray(geocode?.results) && geocode.results.length > 0) {
        lat = geocode.results[0].latitude;
        lon = geocode.results[0].longitude;
      }
    }
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 90);
    const weather = await fetchJson(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${
        startDate.toISOString().split("T")[0]
      }&end_date=${endDate.toISOString().split("T")[0]}&daily=temperature_2m_mean`
    );
    const series = {};
    const times = weather?.daily?.time || [];
    const values = weather?.daily?.temperature_2m_mean || [];
    times.forEach((time, index) => {
      if (values[index] !== null && values[index] !== undefined) {
        series[time] = Number(values[index]);
      }
    });
    return series;
  }

  const keyword = city ? `${domain.replace(/_/g, " ")} ${city}` : domain.replace(/_/g, " ");
  const trendRaw = await googleTrends.interestOverTime({
    keyword,
    startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  });
  const trend = JSON.parse(trendRaw);
  const series = {};
  for (const item of trend?.default?.timelineData || []) {
    series[new Date(Number(item.time) * 1000).toISOString().split("T")[0]] = Number(item.value?.[0] || 0);
  }
  return series;
}

async function fetchTimeGptForecast(domain, city, fh) {
  const nixtlaKey = NIXTLA_API_KEY.value();
  if (!nixtlaKey) return null;
  try {
    const historical = await fetchHistoricalDataForTimeGPT(domain, city);
    if (Object.keys(historical).length < 2) return null;
    const response = await fetchJson("https://api.nixtla.io/forecast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nixtlaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "timegpt-1",
        y: historical,
        fh,
        level: [80, 90],
      }),
    });
    return response?.value ? response : null;
  } catch (error) {
    console.error("TimeGPT unavailable:", error);
    return null;
  }
}

async function compileQuery(queryText) {
  const ai = getGemini();
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Convert the following user query into a Crystal B2C QueryPlan JSON object.

Query: "${queryText}"

Extract the intent, domain, entities, horizons, and required card types based on the Crystal B2C Blueprint.

CRITICAL: The domain_id MUST be chosen from the following list of supported domains:
${SUPPORTED_DOMAINS.join(", ")}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plan_version: { type: Type.STRING },
            domain_id: { type: Type.STRING },
            mode: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["predict_only", "predict_action"] },
              },
            },
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  entity_id: { type: Type.STRING },
                  entity_type: { type: Type.STRING },
                  label: { type: Type.STRING },
                },
              },
            },
            horizons: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  horizon_id: { type: Type.STRING },
                },
              },
            },
            card_types: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  card_type_id: {
                    type: Type.STRING,
                    enum: [
                      "prediction_summary",
                      "scenario_set",
                      "ranked_list",
                      "tradeoff_plan",
                      "drivers_breakdown",
                      "risk_band",
                    ],
                  },
                },
              },
            },
          },
          required: ["plan_version", "domain_id", "mode", "entities", "horizons", "card_types"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  });
}

async function predict(queryText, queryPlan, userContext) {
  const domain = queryPlan?.domain || queryPlan?.domain_id || "";
  const city =
    queryPlan?.filters?.location ||
    queryPlan?.entities?.find((entity) => entity.entity_type === "city" || entity.entity_type === "location")?.label ||
    "";

  if (domain && city) {
    const cached = await fetchCachedCard(queryText, domain, city);
    if (cached) {
      return { ...cached, _source: "cache" };
    }
  }

  const ai = getGemini();
  let contextString = "";
  if (userContext) {
    contextString = `
CONTESTO UTENTE:
- Posizione: ${userContext.location || "Non specificata"}
- Professione: ${userContext.profession || "Non specificata"}
- Interessi: ${Array.isArray(userContext.interests) ? userContext.interests.join(", ") : "Non specificati"}
`;
  }

  let historicalContext = "";
  if (domain) {
    const summary = await get20YearHistoricalContext(domain, city, ai);
    if (summary) {
      historicalContext = `
BASELINE STORICA 20 ANNI:
${summary}
`;
    }
  }

  let timeGptContext = "";
  if (domain) {
    let fh = 7;
    if (Array.isArray(queryPlan?.horizons) && queryPlan.horizons.length > 0) {
      const horizonId = queryPlan.horizons[0]?.horizon_id;
      if (horizonId === "30d") fh = 30;
      else if (horizonId === "14d") fh = 14;
      else if (horizonId === "12w") fh = 84;
    }
    const forecast = await fetchTimeGptForecast(domain, city, fh);
    if (forecast) {
      timeGptContext = `
DATI PREVISIONALI TIMEGPT:
- Orizzonte: ${forecast.value.length} periodi
- Valori previsti: ${JSON.stringify(forecast.value)}
- Timestamp: ${JSON.stringify(forecast.timestamp)}
Usa questi numeri come base quantitativa della previsione.
`;
    }
  }

  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Sei il motore predittivo di Crystal B2C.
L'utente ha chiesto: "${queryText}"
Il Query Plan generato dal sistema e: ${JSON.stringify(queryPlan)}
${contextString}
${historicalContext}
${timeGptContext}

Il tuo compito e generare un oggetto JSON CrystalCard finale.

REGOLE FONDAMENTALI:
1. Prima di ogni analisi usa Google Search per verificare i fatti che cambiano rapidamente.
2. Non inventare dati. Se i dati non bastano, segnalalo nel trust layer.
3. Usa il contesto storico solo per calibrare pattern, mai per sovrascrivere i fatti di oggi.
4. Fornisci un verdetto diretto e azioni pratiche.
5. Mantieni il testo leggibile e ben formattato.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            card_id: { type: Type.STRING },
            card_type: { type: Type.STRING },
            domain: { type: Type.STRING },
            stakes_level: { type: Type.STRING, enum: ["low", "medium", "high", "imminent"] },
            risk_band: { type: Type.STRING, enum: ["low", "medium", "high", "extreme"] },
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            verdict: { type: Type.STRING },
            personal_output: { type: Type.STRING },
            scenario_set: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  scenario_id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  probability: { type: Type.NUMBER },
                },
                required: ["scenario_id", "label", "probability"],
              },
            },
            so_what: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  option_id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  tradeoff_note: { type: Type.STRING },
                },
                required: ["option_id", "label", "tradeoff_note"],
              },
            },
            ranked_list: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item_id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  rank: { type: Type.INTEGER },
                  note: { type: Type.STRING },
                },
                required: ["item_id", "label", "score", "rank"],
              },
            },
            drivers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  feature_key: { type: Type.STRING },
                  direction: { type: Type.STRING, enum: ["up", "down", "flat"] },
                  contribution: { type: Type.NUMBER },
                },
                required: ["feature_key", "direction", "contribution"],
              },
            },
            trust_layer: {
              type: Type.OBJECT,
              properties: {
                confidence_score: { type: Type.NUMBER },
                confidence_tier: { type: Type.STRING, enum: ["low", "medium", "high"] },
                data_sufficiency_flag: { type: Type.STRING, enum: ["insufficient", "partial", "sufficient"] },
                freshness: {
                  type: Type.OBJECT,
                  properties: {
                    staleness_bucket: { type: Type.STRING, enum: ["fresh", "stale", "unknown"] },
                    as_of_utc: { type: Type.STRING },
                  },
                },
                provenance_summary: {
                  type: Type.OBJECT,
                  properties: {
                    verification_level: { type: Type.STRING, enum: ["unverified", "partially_verified", "verified", "official"] },
                    license_summary: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
          required: ["card_id", "card_type", "domain", "stakes_level", "title", "summary", "trust_layer"],
        },
      },
    })
  );

  const card = normalizeCard(JSON.parse(response.text || "{}"), queryPlan);
  if (domain && city) {
    await saveCachedCard(card, queryText, domain, city);
  }
  return { ...card, _source: "live-server" };
}

async function chatWithProfileBot(messages) {
  const ai = getGemini();
  const formattedMessages = Array.isArray(messages)
    ? messages.map((message) => ({
        role: message.role === "user" ? "user" : "model",
        parts: [{ text: message.content || "" }],
      }))
    : [];

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: formattedMessages,
      config: {
        systemInstruction: `Sei un assistente AI di Crystal.
Il tuo obiettivo e raccogliere con naturalezza tre informazioni:
1. Posizione geografica
2. Professione o settore
3. Interessi o asset

Fai una domanda alla volta. Quando hai tutto, restituisci anche un riepilogo JSON in un blocco markdown.`,
      },
    });
    return response.text || "";
  });
}

async function generateNextletter(interests, userContext) {
  const ai = getGemini();
  const topics = Array.isArray(interests) ? interests.filter(Boolean) : [];
  let contextString = "";
  if (userContext) {
    contextString = `
User Context:
- Location: ${userContext.location || "Unknown"}
- Profession: ${userContext.profession || "Unknown"}
- General Interests: ${Array.isArray(userContext.interests) ? userContext.interests.join(", ") : "Unknown"}
`;
  }

  const prompt = `
Sei "The Crystal Times", il quotidiano d'inchiesta predittiva piu autorevole del 2045.
Scrivi una Nextletter per un utente del presente.

REGOLE:
1. Usa dati reali attuali con Google Search.
2. Cita un parallelo storico.
3. Chiudi ogni sezione con un'azione concreta.

ARGOMENTI: ${topics.join(", ")}
CONTESTO: ${contextString}

OUTPUT JSON:
{
  "title": "string",
  "subtitle": "string",
  "sections": [
    {
      "topic": "string",
      "icon": "string",
      "title": "string",
      "content": "string",
      "historical_context": "string",
      "probability": 85,
      "horizon": "15d",
      "impact": "High",
      "so_what": "string",
      "query_suggestion": "string"
    }
  ]
}`;

  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
      },
    })
  );
  return JSON.parse(response.text || "{}");
}

async function generateCrystalQuotes() {
  const today = new Date().toLocaleDateString("it-IT");
  const cacheKey = `quotes_${today.replace(/\//g, "-")}`;
  const cacheRef = db.collection("system_cache").doc(cacheKey);
  const snapshot = await cacheRef.get();
  if (snapshot.exists) {
    return snapshot.data();
  }

  const ai = getGemini();
  const prompt = `
Genera 5 Crystal Quotes per la settimana corrente.
Basati solo su trend reali e attuali usando Google Search.

OUTPUT JSON:
{
  "quotes": [
    {
      "quote_id": "string",
      "text": "string",
      "author": "string",
      "context": "string",
      "date": "${today}",
      "analysis": {
        "title": "string",
        "full_text": "string",
        "drivers": ["string"],
        "impact": "string",
        "historical_parallel": "string"
      }
    }
  ]
}`;

  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
      },
    })
  );

  const payload = normalizeQuotePayload(JSON.parse(response.text || "{}"));
  await cacheRef.set(
    {
      ...payload,
      generated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return payload;
}

async function getLocalInsights(queryText, entities) {
  const ai = getGemini();
  const locationEntity = Array.isArray(entities)
    ? entities.find((entity) => ["city", "location", "country"].includes(entity?.entity_type))
    : null;
  const locationContext = locationEntity ? `nella zona di ${locationEntity.label}` : "";

  const response = await withRetry(async () =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Fornisci un breve approfondimento locale relativo a questa query: "${queryText}" ${locationContext}. Menziona luoghi o attivita se rilevanti. Massimo 3-4 frasi.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    })
  );

  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return {
    text: response.text || "",
    chunks,
  };
}

exports.api = onRequest(
  {
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "1GiB",
    secrets: [GEMINI_API_KEY, NIXTLA_API_KEY],
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.status(204).send("");
      return;
    }

    const route = stripApiPrefix(req.path || "/");
    const body = getBody(req);

    try {
      if (req.method === "GET" && route === "/health") {
        respondJson(res, 200, { ok: true, timestamp: new Date().toISOString() });
        return;
      }

      if (req.method === "GET" && route === "/quotes") {
        const quotes = await generateCrystalQuotes();
        respondJson(res, 200, quotes);
        return;
      }

      await requireUser(req);

      if (req.method === "POST" && route === "/compile-query") {
        const plan = await compileQuery(body.query || "");
        respondJson(res, 200, plan);
        return;
      }

      if (req.method === "POST" && route === "/predict") {
        const card = await predict(body.query || "", body.queryPlan || {}, body.userContext || null);
        respondJson(res, 200, card);
        return;
      }

      if (req.method === "POST" && route === "/profile-chat") {
        const text = await chatWithProfileBot(body.messages || []);
        respondJson(res, 200, { text });
        return;
      }

      if (req.method === "POST" && route === "/nextletter") {
        const letter = await generateNextletter(body.interests || [], body.userContext || null);
        respondJson(res, 200, letter);
        return;
      }

      if (req.method === "POST" && route === "/local-insights") {
        const insights = await getLocalInsights(body.query || "", body.entities || []);
        respondJson(res, 200, insights);
        return;
      }

      respondJson(res, 404, { error: `Unknown route: ${route}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error.";
      const status = message === "Authentication required." ? 401 : 500;
      console.error("API error:", error);
      respondJson(res, status, { error: message });
    }
  }
);
