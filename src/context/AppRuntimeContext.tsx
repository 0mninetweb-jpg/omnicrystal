import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { RUNTIME_COPY } from '../content/brand';
import type { RuntimeCapabilities } from '../types/runtime';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

const defaultCapabilities: RuntimeCapabilities = {
  isChecking: true,
  apiAvailable: false,
  forecastAvailable: false,
  worldSimAvailable: false,
  runtimeMode: 'preview',
  forecastMode: 'preview',
  worldSimMode: 'preview',
  statusLabel: RUNTIME_COPY.runtimePreviewTitle,
  statusDetail: RUNTIME_COPY.runtimePreviewDetail,
  message: RUNTIME_COPY.forecastPreview,
};

const AppRuntimeContext = createContext<RuntimeCapabilities>(defaultCapabilities);

let cachedCapabilities: RuntimeCapabilities | null = null;
let runtimeRequest: Promise<RuntimeCapabilities> | null = null;

function hasClientForecastFallback() {
  const clientKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  return Boolean(clientKey && clientKey !== 'undefined');
}

function looksLikeHtml(text: string) {
  return /<!doctype html>|<html[\s>]/i.test(text);
}

async function probeRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  if (runtimeRequest) {
    return runtimeRequest;
  }

  runtimeRequest = (async () => {
    const clientFallback = hasClientForecastFallback();
    let apiAvailable = false;
    let healthPayload: any = null;

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('application/json')) {
          healthPayload = await response.json();
          apiAvailable = healthPayload?.ok === true;
        } else if (response.ok) {
          const text = await response.text();
          apiAvailable = !looksLikeHtml(text);
        }
      } finally {
        window.clearTimeout(timeout);
      }
    } catch (_error) {
      apiAvailable = false;
    }

    const forecastAvailable = apiAvailable || clientFallback;
    const worldSimFlag = import.meta.env.VITE_WORLDSIM_AVAILABLE === 'true';
    const worldSimAvailable = apiAvailable && (healthPayload?.worldSim?.asyncJobs === true || worldSimFlag);
    const runtimeMode: RuntimeCapabilities['runtimeMode'] = worldSimAvailable
      ? 'live'
      : forecastAvailable
        ? 'limited'
        : 'preview';
    const statusLabel =
      runtimeMode === 'live'
        ? RUNTIME_COPY.runtimeLiveTitle
        : runtimeMode === 'limited'
          ? RUNTIME_COPY.runtimeLimitedTitle
          : RUNTIME_COPY.runtimePreviewTitle;
    const statusDetail =
      runtimeMode === 'live'
        ? RUNTIME_COPY.runtimeLiveDetail
        : runtimeMode === 'limited'
          ? RUNTIME_COPY.runtimeLimitedDetail
          : RUNTIME_COPY.runtimePreviewDetail;

    const capabilities: RuntimeCapabilities = {
      isChecking: false,
      apiAvailable,
      forecastAvailable,
      worldSimAvailable,
      runtimeMode,
      forecastMode: apiAvailable ? 'live' : clientFallback ? 'limited' : 'preview',
      worldSimMode: worldSimAvailable ? 'live' : 'preview',
      statusLabel,
      statusDetail,
      message:
        runtimeMode === 'live'
          ? RUNTIME_COPY.worldSimLive
          : runtimeMode === 'limited'
            ? RUNTIME_COPY.forecastLimited
            : RUNTIME_COPY.forecastPreview,
    };

    cachedCapabilities = capabilities;
    runtimeRequest = null;
    return capabilities;
  })();

  return runtimeRequest;
}

export function AppRuntimeProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities>(cachedCapabilities || defaultCapabilities);

  useEffect(() => {
    let active = true;

    void probeRuntimeCapabilities()
      .then((nextCapabilities) => {
        if (active) {
          setCapabilities(nextCapabilities);
        }
      })
      .catch(() => {
        if (active) {
          setCapabilities({
            ...defaultCapabilities,
            isChecking: false,
            runtimeMode: 'preview',
            statusLabel: RUNTIME_COPY.runtimePreviewTitle,
            statusDetail: RUNTIME_COPY.runtimePreviewDetail,
            message: RUNTIME_COPY.forecastPreview,
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => capabilities, [capabilities]);

  return <AppRuntimeContext.Provider value={value}>{children}</AppRuntimeContext.Provider>;
}

export function useAppRuntime() {
  return useContext(AppRuntimeContext);
}
