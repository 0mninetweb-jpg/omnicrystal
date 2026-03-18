export interface RuntimeCapabilities {
  isChecking: boolean;
  apiAvailable: boolean;
  forecastAvailable: boolean;
  worldSimAvailable: boolean;
  worldSimBetaAvailable: boolean;
  billingEnabled: boolean;
  billingMode: 'live' | 'disabled';
  billingMessage?: string;
  runtimeMode: 'live' | 'limited' | 'preview';
  forecastMode: 'live' | 'limited' | 'preview';
  worldSimMode: 'live' | 'limited' | 'preview';
  statusLabel: string;
  statusDetail: string;
  worldSimStatusLabel: string;
  worldSimStatusDetail: string;
  forecastProvider?: string;
  forecastModel?: string;
  forecastModels?: {
    query?: string;
    forecast?: string;
    chat?: string;
    copy?: string;
  };
  worldSimProvider?: string;
  worldSimAdapterMode?: string;
  worldSimModels?: {
    default?: string;
    graph?: string;
    simulation?: string;
    report?: string;
  };
  message?: string;
}
