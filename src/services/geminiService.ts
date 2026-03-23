import { auth } from '../firebase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

type ServerRequestContext = {
  sourceView?: string;
  meteredAction?: string;
};

let activeRequestContext: ServerRequestContext | null = null;
let clientFallbackModulePromise: Promise<typeof import('./geminiClientFallback')> | null = null;
const GUEST_ROLLOUT_KEY_STORAGE = 'crystal-core-guest-rollout-key';

class BackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

function looksLikeHtml(text: string) {
  return /<!doctype html>|<html[\s>]/i.test(text);
}

function getGuestRolloutKey() {
  if (typeof window === 'undefined') return '';
  const existing = window.sessionStorage.getItem(GUEST_ROLLOUT_KEY_STORAGE);
  if (existing) return existing;
  const next = `guest_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  window.sessionStorage.setItem(GUEST_ROLLOUT_KEY_STORAGE, next);
  return next;
}

function getFriendlyServerErrorMessage(
  status: number,
  payload: {
    code?: unknown;
    error?: unknown;
    message?: unknown;
  }
) {
  const code = typeof payload?.code === 'string' ? payload.code : '';

  switch (code) {
    case 'forecast-runtime-not-configured':
      return 'Forecast temporarily unavailable. The server runtime is not configured correctly.';
    case 'provider-credits-exhausted':
      return 'Forecast temporarily unavailable. The primary provider ran out of credits and the backup could not complete the request.';
    case 'provider-rate-limited':
      return 'Forecast temporarily unavailable. The provider is rate limited right now. Please retry in a moment.';
    case 'provider-upstream-error':
      return 'Unable to generate the forecast right now. Please retry in a moment.';
    case 'provider-request-rejected':
      return 'The forecast request could not be completed by the provider.';
    case 'provider-fallback-failed':
      return 'Forecast temporarily unavailable. The Gemini backup could not complete the request.';
    default:
      if (status >= 500) {
        return 'Unable to generate the forecast right now.';
      }
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
      if (typeof payload?.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
      return `HTTP ${status}`;
  }
}

async function parseServerResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(getFriendlyServerErrorMessage(response.status, payload)) as Error & {
        code?: string;
        details?: unknown;
        status?: number;
      };
      error.code = payload?.code;
      error.details = payload?.details;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  const text = await response.text();
  if (!response.ok) {
    if (looksLikeHtml(text)) {
      throw new BackendUnavailableError('Backend API non disponibile.');
    }
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
  } else {
    const guestRolloutKey = getGuestRolloutKey();
    if (guestRolloutKey) {
      headers['X-Crystal-Guest-Key'] = guestRolloutKey;
    }
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

export async function withServerRequestContext<T>(context: ServerRequestContext, fn: () => Promise<T>) {
  const previousContext = activeRequestContext;
  activeRequestContext = { ...previousContext, ...context };
  try {
    return await fn();
  } finally {
    activeRequestContext = previousContext;
  }
}

function canFallbackToClient(error: unknown, options?: { metered?: boolean }) {
  if (!(error instanceof BackendUnavailableError)) {
    return false;
  }

  if (import.meta.env.VITE_ALLOW_CLIENT_AI_FALLBACK !== 'true') {
    return false;
  }

  if (options?.metered) {
    return import.meta.env.DEV || import.meta.env.VITE_ALLOW_CLIENT_AI_FALLBACK === 'true';
  }

  return import.meta.env.DEV || import.meta.env.VITE_ALLOW_CLIENT_AI_FALLBACK === 'true';
}

async function loadClientFallbackModule() {
  if (!clientFallbackModulePromise) {
    clientFallbackModulePromise = import('./geminiClientFallback');
  }

  return clientFallbackModulePromise;
}

export async function compileQuery(query: string) {
  try {
    return await requestServer<any>('compile-query', { body: { query } });
  } catch (error) {
    if (canFallbackToClient(error)) {
      const { compileQueryClient } = await loadClientFallbackModule();
      return compileQueryClient(query);
    }
    throw error;
  }
}

export async function compileQueryPublic(query: string) {
  try {
    return await requestServer<any>('public/compile-query', { body: { query }, requireAuth: false });
  } catch (error) {
    if (canFallbackToClient(error)) {
      const { compileQueryClient } = await loadClientFallbackModule();
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
      const { predictClient } = await loadClientFallbackModule();
      return predictClient(query, queryPlan, userContext);
    }
    throw error;
  }
}

export async function predictPublic(query: string, queryPlan: any) {
  try {
    return await requestServer<any>('public/predict', {
      body: { query, queryPlan },
      requireAuth: false,
    });
  } catch (error) {
    if (canFallbackToClient(error)) {
      const { predictClient } = await loadClientFallbackModule();
      return predictClient(query, queryPlan, null);
    }
    throw error;
  }
}

export async function getForecastRun(runId: string) {
  return requestServer<any>(`forecast-runs/${encodeURIComponent(runId)}`, {
    method: 'GET',
  });
}

export async function getPublicForecastRun(runId: string, token: string) {
  return requestServer<any>(`public/forecast-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    requireAuth: false,
  });
}

export async function cancelForecastRun(runId: string) {
  return requestServer<any>(`forecast-runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  });
}

export async function chatWithProfileBot(messages: { role: string; content: string }[]) {
  try {
    const response = await requestServer<{ text: string }>('profile-chat', { body: { messages } });
    return response.text;
  } catch (error) {
    if (canFallbackToClient(error, { metered: true })) {
      const { chatWithProfileBotClient } = await loadClientFallbackModule();
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
      const { generateNextletterClient } = await loadClientFallbackModule();
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
      const { generateCrystalQuotesClient } = await loadClientFallbackModule();
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
      const { getLocalInsightsClient } = await loadClientFallbackModule();
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

export async function getCatalogRegistry() {
  return requestServer<any>('registry/catalog', {
    method: 'GET',
    requireAuth: false,
  });
}

export async function getSourceRegistry() {
  return requestServer<any>('registry/sources', {
    method: 'GET',
    requireAuth: false,
  });
}

export async function getCoverageSnapshot() {
  return requestServer<any>('coverage/snapshot', {
    method: 'GET',
    requireAuth: false,
  });
}

export async function getCoverageLedger() {
  return requestServer<any>('coverage/ledger', {
    method: 'GET',
    requireAuth: false,
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
