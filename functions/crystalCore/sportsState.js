const DEFAULT_SPORTS_RELEASE_MODE = "observe";

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function normalizeSportsReleaseMode(value = "") {
  const normalized = safeText(value, DEFAULT_SPORTS_RELEASE_MODE).toLowerCase();
  if (["off", "observe", "a29_live", "a29_b36_live"].includes(normalized)) return normalized;
  return DEFAULT_SPORTS_RELEASE_MODE;
}

function getSportsReleaseMode(value = process.env.SPORTS_RELEASE_MODE) {
  return normalizeSportsReleaseMode(value);
}

function sportsA29LiveEnabled(value = process.env.SPORTS_RELEASE_MODE) {
  return ["a29_live", "a29_b36_live"].includes(getSportsReleaseMode(value));
}

function sportsB36LiveEnabled(value = process.env.SPORTS_RELEASE_MODE) {
  return getSportsReleaseMode(value) === "a29_b36_live";
}

function computeSportsContractState({
  sportsGrounding = {},
  sportsContext = {},
  semanticOverlay = null,
} = {}) {
  const grounded = Boolean(
    sportsContext?.grounded === true ||
      sportsGrounding?.sports_grounded === true ||
      (sportsGrounding?.fixture_resolved === true && sportsGrounding?.provider_configured === true)
  );
  const sportsPickState = safeText(
    sportsContext?.pick_state || sportsGrounding?.sports_pick_state,
    grounded ? "grounded_lean" : "hold"
  );
  const sportsPublishGateReady =
    sportsContext?.publish_gate_ready === true ||
    sportsGrounding?.publish_gate_ready === true ||
    semanticOverlay?.publish_gate_ready === true ||
    sportsPickState === "publishable_controlled" ||
    sportsPickState === "publishable_full";
  const fixtureWindowState = safeText(
    sportsContext?.fixture_window_state || sportsGrounding?.fixture_window_state || semanticOverlay?.fixture_window_state,
    grounded ? "resolved" : "unresolved"
  );
  const fixtureWindowOpen =
    sportsContext?.fixture_window_open === true ||
    sportsGrounding?.fixture_window_open === true ||
    semanticOverlay?.fixture_window_open === true;
  const sportsConfidenceTier = safeText(
    sportsContext?.sports_confidence_tier || sportsGrounding?.sports_confidence_tier,
    sportsPublishGateReady ? "controlled" : grounded ? "lean" : "hold"
  );
  const sportsExtractionProvenance = uniqueStrings(
    []
      .concat(Array.isArray(sportsContext?.sports_extraction_provenance) ? sportsContext.sports_extraction_provenance : [])
      .concat(Array.isArray(sportsGrounding?.sports_extraction_provenance) ? sportsGrounding.sports_extraction_provenance : [])
      .concat(Array.isArray(semanticOverlay?.extraction_provenance) ? semanticOverlay.extraction_provenance : [])
  );
  const publicationState = sportsPublishGateReady ? "published" : grounded ? "limited" : "blocked";

  return {
    sportsGrounded: grounded,
    sportsPickState,
    sportsPublishGateReady,
    fixtureWindowState,
    fixtureWindowOpen,
    sportsConfidenceTier,
    sportsExtractionProvenance,
    publicationState,
  };
}

module.exports = {
  DEFAULT_SPORTS_RELEASE_MODE,
  computeSportsContractState,
  getSportsReleaseMode,
  normalizeSportsReleaseMode,
  sportsA29LiveEnabled,
  sportsB36LiveEnabled,
};
