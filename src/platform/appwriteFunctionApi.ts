import { ExecutionMethod, Functions } from 'appwrite';
import { client, createCurrentUserJwt, ensureAuthBootstrap, getCurrentSessionUser } from './appwriteClient';

const functions = new Functions(client);

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const API_FUNCTION_ID =
  import.meta.env.VITE_APPWRITE_API_FUNCTION_ID || process.env.VITE_APPWRITE_API_FUNCTION_ID || '';

function looksLikeHtml(text: string) {
  return /<!doctype html>|<html[\s>]/i.test(text);
}

function parseResponseText(text: string) {
  if (!text) return {};
  if (looksLikeHtml(text)) {
    throw new Error('Backend API non disponibile.');
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

function mapExecutionMethod(method: 'GET' | 'POST') {
  return method === 'GET' ? ExecutionMethod.GET : ExecutionMethod.POST;
}

async function invokeViaHttp<T>(
  path: string,
  {
    method = 'POST',
    body,
    headers = {},
  }: {
    method?: 'GET' | 'POST';
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  const response = await fetch(`${API_BASE_URL}/${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = parseResponseText(await response.text());
  if (!response.ok) {
    throw new Error(String((payload as any)?.error || (payload as any)?.message || `HTTP ${response.status}`));
  }
  return payload as T;
}

export function hasAppwriteFunctionApiConfigured() {
  return Boolean(API_FUNCTION_ID);
}

export async function invokeCrystalApi<T>(
  path: string,
  {
    method = 'POST',
    body,
    headers = {},
    requireAuth = true,
  }: {
    method?: 'GET' | 'POST';
    body?: unknown;
    headers?: Record<string, string>;
    requireAuth?: boolean;
  } = {}
) {
  if (!API_FUNCTION_ID) {
    return invokeViaHttp<T>(path, { method, body, headers });
  }

  const nextHeaders = { ...headers };

  if (requireAuth) {
    await ensureAuthBootstrap();
    if (!getCurrentSessionUser()) {
      throw new Error('Devi accedere per usare questa funzione.');
    }
    nextHeaders.Authorization = `Bearer ${await createCurrentUserJwt()}`;
  }

  const execution = await functions.createExecution({
    functionId: API_FUNCTION_ID,
    body: body !== undefined ? JSON.stringify(body) : '',
    async: false,
    xpath: `/${String(path).replace(/^\/+/, '')}`,
    method: mapExecutionMethod(method),
    headers: nextHeaders,
  });

  const payload = parseResponseText(execution.responseBody || '');
  if ((execution.responseStatusCode || 200) >= 400) {
    throw new Error(String((payload as any)?.error || (payload as any)?.message || `HTTP ${execution.responseStatusCode}`));
  }

  return payload as T;
}
