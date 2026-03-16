export const BACKEND_CONFIG = {
  cardServerUrl: import.meta.env.VITE_CARD_SERVER_URL || process.env.VITE_CARD_SERVER_URL || '/api/cardServer',
  enableCache: true,
  cacheFallbackToLive: true,
  cacheTimeout: 15000, // Increased timeout for TimeGPT and Gemini
};
