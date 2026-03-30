"use strict";

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

const COMMON_MOJIBAKE_REPLACEMENTS = [
  ["Ã€", "À"],
  ["Ãˆ", "È"],
  ["Ã‰", "É"],
  ["ÃŒ", "Ì"],
  ["Ã’", "Ò"],
  ["Ã™", "Ù"],
  ["Ã ", "à"],
  ["Ã¨", "è"],
  ["Ã©", "é"],
  ["Ã¬", "ì"],
  ["Ã²", "ò"],
  ["Ã¹", "ù"],
  ["Ã‡", "Ç"],
  ["Ã§", "ç"],
  ["Ã±", "ñ"],
  ["Ã‘", "Ñ"],
  ["â€™", "'"],
  ["â€˜", "'"],
  ["â€œ", "\""],
  ["â€", "\""],
  ["â€“", "-"],
  ["â€”", "-"],
  ["â€¦", "..."],
  ["Â°", "°"],
  ["Â·", "·"],
  ["Â ", " "],
];

const CORRUPTION_PATTERN = /[\u25C6\uFFFD]|Ã|â€|Â/;
const FIELD_KEYS_TO_SANITIZE = [
  "title",
  "summary",
  "verdict",
  "primary_call",
  "entity_label",
  "topic_label",
  "domain_label",
  "geography_label",
];

function tryLatin1Utf8Repair(value = "") {
  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8");
    return safeText(repaired, value);
  } catch (_error) {
    return value;
  }
}

function replaceCommonMojibake(value = "") {
  return COMMON_MOJIBAKE_REPLACEMENTS.reduce((text, [search, replacement]) => text.split(search).join(replacement), value);
}

function repairReplacementGlyphs(value = "") {
  return value
    .replace(/([A-Z])[\u25C6\uFFFD](?=\s|$|[?!.,;:])/g, "$1À")
    .replace(/([a-z])[\u25C6\uFFFD](?=\s|$|[?!.,;:])/g, "$1à")
    .replace(/[\u25C6\uFFFD]+/g, "");
}

function normalizeWhitespace(value = "") {
  return value.replace(/\s+/g, " ").replace(/\s+([?!.,;:])/g, "$1").trim();
}

function sanitizePublishedText(value, fallback = "") {
  const raw = safeText(value, fallback);
  if (!raw) return fallback;

  let next = raw.normalize("NFKC");
  next = replaceCommonMojibake(next);

  if (CORRUPTION_PATTERN.test(next)) {
    const repaired = tryLatin1Utf8Repair(next);
    if (repaired && repaired !== next) {
      next = replaceCommonMojibake(repaired);
    }
  }

  next = repairReplacementGlyphs(next);
  next = normalizeWhitespace(next);

  return safeText(next, fallback);
}

function containsCorruptedPublishedText(value) {
  return CORRUPTION_PATTERN.test(safeText(value));
}

function sanitizePublishedArtifactFields(record = {}) {
  if (!record || typeof record !== "object") return { sanitized: {}, changed: false, changedFields: [] };

  const sanitized = { ...record };
  const changedFields = [];
  for (const field of FIELD_KEYS_TO_SANITIZE) {
    if (typeof sanitized[field] !== "string") continue;
    const nextValue = sanitizePublishedText(sanitized[field], sanitized[field]);
    if (nextValue !== sanitized[field]) {
      sanitized[field] = nextValue;
      changedFields.push(field);
    }
  }

  if (typeof sanitized.topic_label === "string") {
    const sanitizedTopic = sanitizePublishedText(sanitized.topic_label, sanitized.topic_label);
    if (sanitizedTopic !== sanitized.topic_label) {
      sanitized.topic_label = sanitizedTopic;
      if (!changedFields.includes("topic_label")) changedFields.push("topic_label");
    }
  }

  return {
    sanitized,
    changed: changedFields.length > 0,
    changedFields,
  };
}

module.exports = {
  sanitizePublishedText,
  sanitizePublishedArtifactFields,
  containsCorruptedPublishedText,
  FIELD_KEYS_TO_SANITIZE,
};
