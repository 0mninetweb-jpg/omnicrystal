export type FeatureFlagKey =
  | 'v1_shell'
  | 'public_forecast_guest'
  | 'beta_nextletter'
  | 'beta_watchlist'
  | 'internal_coverage';

function readBooleanFlag(value: string | boolean | undefined, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

const defaults: Record<FeatureFlagKey, boolean> = {
  v1_shell: true,
  public_forecast_guest: true,
  beta_nextletter: true,
  beta_watchlist: true,
  internal_coverage: true,
};

export const FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  v1_shell: readBooleanFlag(import.meta.env.VITE_FLAG_V1_SHELL, defaults.v1_shell),
  public_forecast_guest: readBooleanFlag(
    import.meta.env.VITE_FLAG_PUBLIC_FORECAST_GUEST,
    defaults.public_forecast_guest
  ),
  beta_nextletter: readBooleanFlag(import.meta.env.VITE_FLAG_BETA_NEXTLETTER, defaults.beta_nextletter),
  beta_watchlist: readBooleanFlag(import.meta.env.VITE_FLAG_BETA_WATCHLIST, defaults.beta_watchlist),
  internal_coverage: readBooleanFlag(import.meta.env.VITE_FLAG_INTERNAL_COVERAGE, defaults.internal_coverage),
};

export function isFeatureEnabled(flag: FeatureFlagKey) {
  return FEATURE_FLAGS[flag];
}
