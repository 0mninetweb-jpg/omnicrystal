export interface RuntimeCapabilities {
  isChecking: boolean;
  apiAvailable: boolean;
  forecastAvailable: boolean;
  worldSimAvailable: boolean;
  runtimeMode: 'live' | 'limited' | 'preview';
  forecastMode: 'live' | 'limited' | 'preview';
  worldSimMode: 'live' | 'preview';
  statusLabel: string;
  statusDetail: string;
  message?: string;
}
