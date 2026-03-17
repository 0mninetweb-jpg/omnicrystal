export interface RuntimeCapabilities {
  isChecking: boolean;
  apiAvailable: boolean;
  forecastAvailable: boolean;
  worldSimAvailable: boolean;
  forecastMode: 'live' | 'limited' | 'preview';
  worldSimMode: 'live' | 'preview';
  message?: string;
}
