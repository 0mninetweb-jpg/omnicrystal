import { auth } from '../firebase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

type ServerRequestContext = {
  sourceView?: string;
  meteredAction?: string;
};

let activeRequestContext: ServerRequestContext | null = null;
let clientFallbackModulePromise: Promise<typeof import('./geminiClientFallback')> | null = null;

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

  if (options?.metered) {
    return import.meta.env.DEV || import.meta.env.VITE_ALLOW_CLIENT_AI_FALLBACK === 'true';
  }

  return true;
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
