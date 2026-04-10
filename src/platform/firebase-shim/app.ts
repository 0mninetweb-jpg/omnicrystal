export function initializeApp(config: Record<string, unknown> = {}) {
  return {
    __type: 'appwrite-compat-app',
    config,
  };
}
