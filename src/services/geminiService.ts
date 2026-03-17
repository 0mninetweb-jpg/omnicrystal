import { GoogleGenAI, Type } from '@google/genai';
import { auth } from '../firebase';
import { SUPPORTED_DOMAINS } from '../data/domains';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

type ServerRequestContext = {
  sourceView?: string;
  meteredAction?: string;
};

let activeRequestContext: ServerRequestContext | null = null;

class BackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

function looksLikeHtml(text: string) {
  return /<!doctype html>|<html[\s>]/i.test(text);
}

async function parseServerResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload?.error || payload?.message || `HTTP ${response.status}`) as Error & {
        code?: string;
        details?: unknown;
      };
      error.code = payload?.code;
      error.details = payload?.details;
      throw error;
    }
    return payload;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (looksLikeHtml(text)) {
    throw new BackendUnavailableError('Backend API non disponibile.');
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

async function requestServer<T>(
  path: string,
  {
    method = 'POST',
    body,
    requireAuth = true,
  }: {
    method?: 'GET' | 'POST';
    body?: unknown;
    requireAuth?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (activeRequestContext?.sourceView) {
    headers['X-Crystal-Source-View'] = activeRequestContext.sourceView;
  }

  if (activeRequestContext?.meteredAction) {
    headers['X-Crystal-Metered-Action'] = activeRequestContext.meteredAction;
  }

  if (requireAuth) {
    if (!auth.currentUser) {
      throw new Error('Devi accedere per usare questa funzione.');
    }
    const token = await auth.currentUser.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (_error) {
    throw new BackendUnavailableError('Backend API non raggiungibile.');
  }

  return parseServerResponse(response) as Promise<T>;
}

let cachedClientApiKey: string | null = null;

export async function withServerRequestContext<T>(context: ServerRequestContext, fn: () => Promise<T>) {
  const previousContext = activeRequestContext;
  activeRequestContext = { ...previousContext, ...context };
  try {
    return await fn();
  } finally {
    activeRequestContext = previousContext;
  }
}

async function getClientAI() {
  if (cachedClientApiKey) {
    return new GoogleGenAI({ apiKey: cachedClientApiKey });
  }

  let apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey === 'undefined') {
    apiKey = process.env.GEMINI_API_KEY;
  }

  if (!apiKey || apiKey === 'undefined') {
    throw new Error(
      'Nessuna chiave Gemini disponibile. Configura VITE_GEMINI_API_KEY oppure attiva il backend Firebase Functions.'
    );
  }

  cachedClientApiKey = apiKey;
  return new GoogleGenAI({ apiKey });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const message = error?.message || '';
    const isQuotaError = message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
    if (isQuotaError && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

function canFallbackToClient(error: unknown, options?: { metered?: boolean }) {
  if (!(error instanceof BackendUnavailableError)) {
    return false;
  }

  if (options?.metered) {
    return import.meta.env.DEV || import.meta.env.VITE_ALLOW_CLIENT_AI_FALLBACK === 'true';
  }

  return true;
}

async function compileQueryClient(query: string) {
  const ai = await getClientAI();

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Convert the following user query into a Crystal B2C QueryPlan JSON object.

Query: "${query}"

Extract the intent, domain, entities, horizons, and required card types based on the Crystal B2C Blueprint.

CRITICAL: The domain_id MUST be chosen from the following list of supported domains:
${SUPPORTED_DOMAINS.join(', ')}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plan_version: { type: Type.STRING },
            domain_id: { type: Type.STRING },
            mode: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['predict_only', 'predict_action'] },
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
                      'prediction_summary',
                      'scenario_set',
                      'ranked_list',
                      'tradeoff_plan',
                      'drivers_breakdown',
                      'risk_band',
                    ],
                  },
                },
              },
            },
          },
          required: ['plan_version', 'domain_id', 'mode', 'entities', 'horizons', 'card_types'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  });
}

async function predictClient(query: string, queryPlan: any, userContext?: any) {
  const ai = await getClientAI();

  let contextString = '';
  if (userContext) {
    contextString = `
CONTESTO UTENTE:
- Posizione: ${userContext.location || 'Non specificata'}
- Professione: ${userContext.profession || 'Non specificata'}
- Interessi: ${userContext.interests?.join(', ') || 'Non specificati'}
`;
  }

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: `Sei il motore predittivo di Crystal B2C.
L'utente ha chiesto: "${query}"
Il Query Plan generato dal sistema e: ${JSON.stringify(queryPlan)}
${contextString}

Genera un oggetto JSON CrystalCard.

Regole:
1. Usa Google Search per verificare i fatti che cambiano rapidamente.
2. Non inventare dati: se i dati non bastano, segnalalo nel trust layer.
3. Fornisci verdetto, scenari, driver e azioni pratiche in modo leggibile.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
      },
    });

    const card = JSON.parse(response.text || '{}');
    return { ...card, _source: 'live-client' };
  });
}

async function chatWithProfileBotClient(messages: { role: string; content: string }[]) {
  const ai = await getClientAI();
  const formattedMessages = messages.map((message) => ({
    role: message.role === 'user' ? 'user' : 'model',
    parts: [{ text: message.content }],
  }));

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: formattedMessages,
      config: {
        systemInstruction: `Sei un assistente AI di Crystal.
Raccogli con naturalezza tre informazioni:
1. Posizione geografica
2. Professione o settore
3. Interessi o asset

Fai una domanda alla volta. Quando hai raccolto tutto, restituisci anche un riepilogo JSON in un blocco markdown.`,
      },
    });
    return response.text;
  });
}

async function generateNextletterClient(interests: string[], userContext?: any) {
  const ai = await getClientAI();

  let contextString = '';
  if (userContext) {
    contextString = `
User Context:
- Location: ${userContext.location || 'Unknown'}
- Profession: ${userContext.profession || 'Unknown'}
- General Interests: ${userContext.interests ? userContext.interests.join(', ') : 'Unknown'}
`;
  }

  const prompt = `
Sei "The Crystal Times", il quotidiano d'inchiesta predittiva del 2045.
Scrivi una Nextletter per un utente del presente.

REGOLE:
1. Usa dati reali attuali con Google Search.
2. Cita almeno un parallelo storico.
3. Chiudi ogni sezione con un'azione concreta.

ARGOMENTI: ${interests.join(', ')}
CONTESTO: ${contextString}

OUTPUT JSON con title, subtitle e sections.`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        tools: [{ googleSearch: {} }],
      },
    });
    return JSON.parse(response.text || '{}');
  });
}

async function generateCrystalQuotesClient() {
  const ai = await getClientAI();
  const currentDate = new Date().toLocaleDateString('it-IT');

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
      "date": "${currentDate}",
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

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        tools: [{ googleSearch: {} }],
      },
    });
    return JSON.parse(response.text || '{}');
  });
}

async function getLocalInsightsClient(query: string, entities: any[]) {
  const ai = await getClientAI();
  const locationEntity = entities?.find((entity: any) =>
    entity.entity_type === 'city' || entity.entity_type === 'location' || entity.entity_type === 'country'
  );
  const locationContext = locationEntity ? `nella zona di ${locationEntity.label}` : '';

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Fornisci un breve approfondimento locale relativo a questa query: "${query}" ${locationContext}. Menziona luoghi, attivita o recensioni se rilevanti. Sii conciso.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return { text: response.text, chunks };
  });
}

export async function compileQuery(query: string) {
  try {
    return await requestServer<any>('compile-query', { body: { query } });
  } catch (error) {
    if (canFallbackToClient(error)) {
      return compileQueryClient(query);
    }
    throw error;
  }
}

export async function predict(query: string, queryPlan: any, userContext?: any) {
  try {
    return await requestServer<any>('predict', { body: { query, queryPlan, userContext } });
  } catch (error) {
    if (canFallbackToClient(error, { metered: true })) {
      return predictClient(query, queryPlan, userContext);
    }
    throw error;
  }
}

export async function chatWithProfileBot(messages: { role: string; content: string }[]) {
  try {
    const response = await requestServer<{ text: string }>('profile-chat', { body: { messages } });
    return response.text;
  } catch (error) {
    if (canFallbackToClient(error, { metered: true })) {
      return chatWithProfileBotClient(messages);
    }
    throw error;
  }
}

export async function generateNextletter(interests: string[], userContext?: any) {
  try {
    return await requestServer<any>('nextletter', { body: { interests, userContext } });
  } catch (error) {
    if (canFallbackToClient(error, { metered: true })) {
      return generateNextletterClient(interests, userContext);
    }
    throw error;
  }
}

export async function generateCrystalQuotes() {
  try {
    return await requestServer<any>('quotes', { method: 'GET', requireAuth: false });
  } catch (error) {
    if (canFallbackToClient(error)) {
      return generateCrystalQuotesClient();
    }
    throw error;
  }
}

export async function getLocalInsights(query: string, entities: any[]) {
  try {
    return await requestServer<any>('local-insights', { body: { query, entities } });
  } catch (error) {
    if (canFallbackToClient(error, { metered: true })) {
      return getLocalInsightsClient(query, entities);
    }
    throw error;
  }
}

export async function getPolymarketPulse(query: string, queryPlan: any) {
  return requestServer<any>('polymarket/pulse', {
    body: {
      query,
      queryPlan,
    },
  });
}

export async function createWorldSimJob(query: string, queryPlan: any, userContext?: any, source = 'manual', sourceRef = 'manual') {
  return requestServer<any>('worldsim/jobs', {
    body: {
      query,
      queryPlan,
      userContext,
      source,
      sourceRef,
    },
  });
}

export async function getWorldSimJob(jobId: string) {
  return requestServer<any>(`worldsim/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
  });
}

export async function getWorldSimJobResult(jobId: string) {
  return requestServer<any>(`worldsim/jobs/${encodeURIComponent(jobId)}/result`, {
    method: 'GET',
  });
}

export async function cancelWorldSimJob(jobId: string) {
  return requestServer<any>(`worldsim/jobs/${encodeURIComponent(jobId)}/cancel`, {
    body: {},
  });
}

export async function createMatrixSimulationJob(
  baselineQuery: string,
  queryPlan: any,
  intervention: any,
  options?: {
    branchParentId?: string | null;
    source?: string;
    sourceRef?: string;
    userContext?: any;
  }
) {
  return requestServer<any>('worldsim/interventions', {
    body: {
      baselineQuery,
      queryPlan,
      intervention,
      branchParentId: options?.branchParentId || null,
      source: options?.source || 'matrix-simulation',
      sourceRef: options?.sourceRef || 'worldsim-chamber',
      userContext: options?.userContext || null,
    },
  });
}

export async function getMatrixSimulationJob(jobId: string) {
  return requestServer<any>(`worldsim/interventions/${encodeURIComponent(jobId)}`, {
    method: 'GET',
  });
}

export async function getMatrixSimulationJobResult(jobId: string) {
  return requestServer<any>(`worldsim/interventions/${encodeURIComponent(jobId)}/result`, {
    method: 'GET',
  });
}

export async function cancelMatrixSimulationJob(jobId: string) {
  return requestServer<any>(`worldsim/interventions/${encodeURIComponent(jobId)}/cancel`, {
    body: {},
  });
}
