import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { RUNTIME_COPY, WORLD_SIM_BRAND } from '../content/brand';
import type { RuntimeCapabilities } from '../types/runtime';
import { invokeCrystalApi } from '../platform/appwriteFunctionApi';

const defaultCapabilities: RuntimeCapabilities = {
  isChecking: true,
  apiAvailable: false,
  forecastAvailable: false,
  worldSimAvailable: false,
  worldSimBetaAvailable: false,
  billingEnabled: false,
  billingMode: 'disabled',
  billingMessage: RUNTIME_COPY.runtimePreviewDetail,
  runtimeMode: 'preview',
  forecastMode: 'preview',
  worldSimMode: 'preview',
  statusLabel: RUNTIME_COPY.runtimePreviewTitle,
  statusDetail: RUNTIME_COPY.runtimePreviewDetail,
  worldSimStatusLabel: WORLD_SIM_BRAND.previewName,
  worldSimStatusDetail: RUNTIME_COPY.worldSimPreview,
  message: RUNTIME_COPY.forecastPreview,
};

const AppRuntimeContext = createContext<RuntimeCapabilities>(defaultCapabilities);

let cachedCapabilities: RuntimeCapabilities | null = null;
let runtimeRequest: Promise<RuntimeCapabilities> | null = null;

function hasClientForecastFallback() {
  const clientKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  return Boolean(clientKey && clientKey !== 'undefined');
}

function formatProviderLabel(provider?: string | null) {
  const normalized = (provider || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'local-fallback') return 'local fallback';
  if (normalized === 'openrouter') return 'OpenRouter';
  if (normalized === 'gemini' || normalized === 'gemini-client') return 'Gemini';
  return provider || '';
}

function buildWorldSimStatus(options: {
  worldSimMode: RuntimeCapabilities['worldSimMode'];
  betaAvailable: boolean;
  worldSimProvider?: string;
  worldSimAdapterMode?: string;
  worldSimModels?: RuntimeCapabilities['worldSimModels'];
}) {
  const providerLabel = formatProviderLabel(options.worldSimProvider) || 'the adapter';
  const reportModel = options.worldSimModels?.report;

  if (options.worldSimMode === 'live') {
    return {
      label: 'WorldSim Live',
      detail: reportModel
        ? `WorldSim is live through ${providerLabel}. Report synthesis is currently handled by ${reportModel}.`
        : `WorldSim is live through ${providerLabel}.`,
    };
  }

  if (options.betaAvailable) {
    return {
      label: 'WorldSim Beta (Validating runtime)',
      detail: reportModel
        ? `WorldSim Beta is reachable through ${providerLabel}. Crystal is still validating a clean non-fallback original-runtime run before promoting it to live. Report synthesis is currently handled by ${reportModel}.`
        : `WorldSim Beta is reachable through ${providerLabel}. Crystal is still validating a clean non-fallback original-runtime run before promoting it to live.`,
    };
  }

  if (options.worldSimAdapterMode === 'degraded') {
    return {
      label: WORLD_SIM_BRAND.previewName,
      detail: 'WorldSim is configured, but the runtime is not responding right now. Crystal stays on preview simulation layers until the adapter comes back.',
    };
  }

  if (options.worldSimAdapterMode === 'unconfigured') {
    return {
      label: WORLD_SIM_BRAND.previewName,
      detail: RUNTIME_COPY.worldSimPreview,
    };
  }

  return {
    label: WORLD_SIM_BRAND.previewName,
    detail: RUNTIME_COPY.worldSimPreview,
  };
}

function buildRuntimeDetail(options: {
  runtimeMode: RuntimeCapabilities['runtimeMode'];
  apiAvailable: boolean;
  clientFallback: boolean;
  forecastProvider?: string;
  worldSimStatusDetail: string;
}) {
  const forecastLabel = formatProviderLabel(options.forecastProvider) || 'Forecast';

  if (options.runtimeMode === 'live') {
    return `Forecast runs on ${forecastLabel}. ${options.worldSimStatusDetail}`;
  }

  if (options.runtimeMode === 'limited') {
    if (!options.apiAvailable && options.clientFallback) {
      return `The live forecast backend is not reachable right now. Crystal can still answer in a lighter ${forecastLabel} fallback mode, while WorldSim drops back to preview surfaces.`;
    }

    return `Forecast runs on ${forecastLabel}. ${options.worldSimStatusDetail}`;
  }

  return RUNTIME_COPY.runtimePreviewDetail;
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
      healthPayload = await invokeCrystalApi<any>('health', {
        method: 'GET',
        requireAuth: false,
        headers: { Accept: 'application/json' },
      });
      apiAvailable = healthPayload?.ok === true;
    } catch (_error) {
      apiAvailable = false;
    }

    const worldSimFlag = import.meta.env.VITE_WORLDSIM_AVAILABLE === 'true';
    const forecastConfigured = healthPayload?.forecast?.available !== false;
    const forecastAvailable = (apiAvailable && forecastConfigured) || clientFallback;
    const forecastProvider =
      (typeof healthPayload?.forecast?.provider === 'string' && healthPayload.forecast.provider) ||
      (apiAvailable ? 'openrouter' : clientFallback ? 'gemini-client' : undefined);
    const forecastModel = typeof healthPayload?.forecast?.model === 'string' ? healthPayload.forecast.model : undefined;
    const forecastModels =
      healthPayload?.forecast?.models && typeof healthPayload.forecast.models === 'object'
        ? {
            query: typeof healthPayload.forecast.models.query === 'string' ? healthPayload.forecast.models.query : undefined,
            forecast:
              typeof healthPayload.forecast.models.forecast === 'string' ? healthPayload.forecast.models.forecast : undefined,
            chat: typeof healthPayload.forecast.models.chat === 'string' ? healthPayload.forecast.models.chat : undefined,
            copy: typeof healthPayload.forecast.models.copy === 'string' ? healthPayload.forecast.models.copy : undefined,
          }
        : undefined;
    const worldSimProvider = typeof healthPayload?.worldSim?.provider === 'string' ? healthPayload.worldSim.provider : undefined;
    const sportsProvider = typeof healthPayload?.sports?.provider === 'string' ? healthPayload.sports.provider : undefined;
    const sportsAvailable = Boolean(healthPayload?.sports?.available);
    const sportsMode = healthPayload?.sports?.mode === 'live' ? 'live' : 'preview';
    const worldSimAdapterMode =
      typeof healthPayload?.worldSim?.adapterMode === 'string' ? healthPayload.worldSim.adapterMode : undefined;
    const worldSimModels =
      healthPayload?.worldSim?.models && typeof healthPayload.worldSim.models === 'object'
        ? {
            default:
              typeof healthPayload.worldSim.models.default === 'string' ? healthPayload.worldSim.models.default : undefined,
            graph: typeof healthPayload.worldSim.models.graph === 'string' ? healthPayload.worldSim.models.graph : undefined,
            simulation:
              typeof healthPayload.worldSim.models.simulation === 'string'
                ? healthPayload.worldSim.models.simulation
                : undefined,
            report:
              typeof healthPayload.worldSim.models.report === 'string' ? healthPayload.worldSim.models.report : undefined,
          }
        : undefined;
    const adapterReachable = Boolean(healthPayload?.worldSim?.adapterReachable);
    const adapterConfigured = Boolean(healthPayload?.worldSim?.adapterConfigured);
    const reportedWorldSimMode =
      healthPayload?.worldSim?.mode === 'live' || healthPayload?.worldSim?.mode === 'limited'
        ? healthPayload.worldSim.mode
        : worldSimFlag === true
          ? 'live'
          : 'preview';
    const worldSimBetaAvailable =
      apiAvailable &&
      Boolean(
        healthPayload?.worldSim?.betaAvailable === true ||
          ((reportedWorldSimMode === 'live' || reportedWorldSimMode === 'limited') && adapterReachable && adapterConfigured)
      );
    const worldSimAvailable = apiAvailable && reportedWorldSimMode === 'live';
    const worldSimStatus = buildWorldSimStatus({
      worldSimMode: reportedWorldSimMode,
      betaAvailable: worldSimBetaAvailable,
      worldSimProvider,
      worldSimAdapterMode,
      worldSimModels,
    });
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
      buildRuntimeDetail({
        runtimeMode,
        apiAvailable,
        clientFallback,
        forecastProvider,
        worldSimStatusDetail: worldSimStatus.detail,
      }) ||
      (runtimeMode === 'live'
        ? RUNTIME_COPY.runtimeLiveDetail
        : runtimeMode === 'limited'
          ? RUNTIME_COPY.runtimeLimitedDetail
          : RUNTIME_COPY.runtimePreviewDetail);
    const billingEnabled = healthPayload?.billing?.enabled !== false;
    const billingMode: RuntimeCapabilities['billingMode'] = billingEnabled ? 'live' : 'disabled';
    const billingMessage =
      typeof healthPayload?.billing?.message === 'string' && healthPayload.billing.message
        ? healthPayload.billing.message
        : undefined;
    const registryVersionId =
      typeof healthPayload?.registry?.catalogVersionId === 'string' ? healthPayload.registry.catalogVersionId : undefined;
    const registryPolicyProfile =
      typeof healthPayload?.registry?.policyProfile === 'string' ? healthPayload.registry.policyProfile : undefined;
    const catalogDomains = Number.isFinite(Number(healthPayload?.registry?.domains))
      ? Number(healthPayload.registry.domains)
      : undefined;
    const coverageUnits = Number.isFinite(Number(healthPayload?.coverage?.totals?.coverage_units))
      ? Number(healthPayload.coverage.totals.coverage_units)
      : undefined;
    const coverageScore = Number.isFinite(Number(healthPayload?.coverage?.scores?.coverage_score))
      ? Number(healthPayload.coverage.scores.coverage_score)
      : undefined;
    const depthScore = Number.isFinite(Number(healthPayload?.coverage?.scores?.depth_score))
      ? Number(healthPayload.coverage.scores.depth_score)
      : undefined;
    const freshnessScore = Number.isFinite(Number(healthPayload?.coverage?.scores?.freshness_score))
      ? Number(healthPayload.coverage.scores.freshness_score)
      : undefined;
    const publishedDomains = Number.isFinite(Number(healthPayload?.coverage?.totals?.published_domains))
      ? Number(healthPayload.coverage.totals.published_domains)
      : undefined;
    const limitedDomains = Number.isFinite(Number(healthPayload?.coverage?.totals?.limited_domains))
      ? Number(healthPayload.coverage.totals.limited_domains)
      : undefined;
    const blockedDomains = Number.isFinite(Number(healthPayload?.coverage?.totals?.blocked_domains))
      ? Number(healthPayload.coverage.totals.blocked_domains)
      : undefined;

    const capabilities: RuntimeCapabilities = {
      isChecking: false,
      apiAvailable,
      forecastAvailable,
      worldSimAvailable,
      worldSimBetaAvailable,
      billingEnabled,
      billingMode,
      billingMessage,
      runtimeMode,
      forecastMode: apiAvailable && forecastConfigured ? 'live' : clientFallback ? 'limited' : 'preview',
      worldSimMode: reportedWorldSimMode,
      statusLabel,
      statusDetail,
      worldSimStatusLabel: worldSimStatus.label,
      worldSimStatusDetail: worldSimStatus.detail,
      forecastProvider,
      forecastModel,
      forecastModels,
      sportsProvider,
      sportsAvailable,
      sportsMode,
      registryVersionId,
      registryPolicyProfile,
      catalogDomains,
      coverageUnits,
      coverageScore,
      depthScore,
      freshnessScore,
      publishedDomains,
      limitedDomains,
      blockedDomains,
      worldSimProvider,
      worldSimAdapterMode,
      worldSimModels,
      message: worldSimAvailable ? RUNTIME_COPY.worldSimLive : worldSimBetaAvailable ? RUNTIME_COPY.worldSimBeta : runtimeMode === 'limited' ? RUNTIME_COPY.forecastLimited : RUNTIME_COPY.forecastPreview,
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
            worldSimStatusLabel: WORLD_SIM_BRAND.previewName,
            worldSimStatusDetail: RUNTIME_COPY.worldSimPreview,
            message: RUNTIME_COPY.forecastPreview,
            billingEnabled: false,
            billingMode: 'disabled',
            billingMessage: RUNTIME_COPY.runtimePreviewDetail,
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
