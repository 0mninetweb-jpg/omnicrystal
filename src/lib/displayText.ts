function coerceText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function sanitizeDisplayText(value: unknown, fallback = '') {
  const text = coerceText(value, fallback);
  if (!text) return fallback;

  const normalized = text
    .replace(/Â·/g, ' / ')
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\u009d/g, '"')
    .replace(/â€“/g, '-')
    .replace(/â€”/g, '-')
    .replace(/([A-Z])◆(?=\s|$)/g, '$1À')
    .replace(/([a-z])◆(?=\s|$)/g, '$1à')
    .replace(/◆/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return normalized || fallback;
}
