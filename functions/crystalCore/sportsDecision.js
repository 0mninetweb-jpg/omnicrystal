const SPORTS_DECISION_STATES = ["hold", "grounded_lean", "no_bet", "lean", "edge"];
const SPORTS_PROBABILITY_MODE_DOMAIN = "B.3.6.sports_outcomes_probability_mode";

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num > 1) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function roundMaybe(value, digits = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(digits));
}

function normalizeSportsDecisionState(value = "", fallback = "hold") {
  const normalized = safeText(value, fallback).toLowerCase();
  return SPORTS_DECISION_STATES.includes(normalized) ? normalized : fallback;
}

function normalizeProbabilityNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? clamp01(num, null) : null;
}

function normalizeProbabilityTriple(probabilities = {}, labels = {}) {
  const home = normalizeProbabilityNumber(
    probabilities?.home ?? probabilities?.question_side_a_probability ?? probabilities?.home_probability
  );
  const draw = normalizeProbabilityNumber(probabilities?.draw ?? probabilities?.draw_probability);
  const away = normalizeProbabilityNumber(
    probabilities?.away ?? probabilities?.question_side_b_probability ?? probabilities?.away_probability
  );
  const values = [home, draw, away].filter((value) => value != null);
  if (values.length < 3) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const normalized = {
    home: roundMaybe(home / total),
    draw: roundMaybe(draw / total),
    away: roundMaybe(away / total),
    home_label: safeText(labels?.home_label || labels?.question_side_a, "Home"),
    draw_label: "Draw",
    away_label: safeText(labels?.away_label || labels?.question_side_b, "Away"),
  };
  const top = [
    { key: "home", label: normalized.home_label, probability: normalized.home },
    { key: "draw", label: normalized.draw_label, probability: normalized.draw },
    { key: "away", label: normalized.away_label, probability: normalized.away },
  ].sort((left, right) => right.probability - left.probability)[0];
  normalized.favorite_key = top.key;
  normalized.favorite_label = top.label;
  normalized.favorite_probability = top.probability;
  return normalized;
}

function buildFairPrices(probabilities = null) {
  if (!probabilities) return null;
  const toPrice = (value) => {
    const probability = Number(value);
    if (!Number.isFinite(probability) || probability <= 0) return null;
    return Number((1 / probability).toFixed(2));
  };
  return {
    home: toPrice(probabilities.home),
    draw: toPrice(probabilities.draw),
    away: toPrice(probabilities.away),
    home_label: probabilities.home_label,
    draw_label: probabilities.draw_label,
    away_label: probabilities.away_label,
  };
}

function distributeModelProbabilities({
  questionSideA = "",
  questionSideB = "",
  winningSide = "",
  winningProbability = null,
  marketProbabilities = null,
} = {}) {
  const sideA = safeText(questionSideA, "Home");
  const sideB = safeText(questionSideB, "Away");
  const winner = safeText(winningSide);
  const normalizedMarket = normalizeProbabilityTriple(marketProbabilities, {
    question_side_a: sideA,
    question_side_b: sideB,
  });
  const drawSeed =
    normalizedMarket?.draw != null
      ? normalizedMarket.draw
      : normalizedMarket
        ? 0.24
        : 0.26;
  const winnerProbability = clamp01(winningProbability, 0.58);
  let home = 0.37;
  let draw = drawSeed;
  let away = 0.37;
  if (winner && winner === sideA) {
    home = winnerProbability;
    away = Math.max(0.08, 1 - home - draw);
  } else if (winner && winner === sideB) {
    away = winnerProbability;
    home = Math.max(0.08, 1 - away - draw);
  } else {
    const fallbackWinner = Math.max(home, away);
    const remainder = 1 - fallbackWinner - draw;
    home = 0.38 + remainder / 2;
    away = 0.38 + remainder / 2;
  }

  const normalized = normalizeProbabilityTriple(
    {
      home,
      draw,
      away,
    },
    {
      question_side_a: sideA,
      question_side_b: sideB,
    }
  );
  return {
    model_probabilities: normalized,
    market_probabilities: normalizedMarket,
    fair_prices: buildFairPrices(normalized),
  };
}

function computeSportsEdgeDelta({ modelProbabilities = null, marketProbabilities = null } = {}) {
  if (!modelProbabilities || !marketProbabilities) return null;
  const home = roundMaybe(modelProbabilities.home - marketProbabilities.home);
  const draw = roundMaybe(modelProbabilities.draw - marketProbabilities.draw);
  const away = roundMaybe(modelProbabilities.away - marketProbabilities.away);
  const candidates = [
    { key: "home", label: modelProbabilities.home_label, delta: home },
    { key: "draw", label: modelProbabilities.draw_label, delta: draw },
    { key: "away", label: modelProbabilities.away_label, delta: away },
  ].filter((item) => item.delta != null);
  if (!candidates.length) return null;
  const best = [...candidates].sort((left, right) => right.delta - left.delta)[0];
  return {
    home,
    draw,
    away,
    best_key: best.key,
    best_label: best.label,
    best_delta: best.delta,
  };
}

function applyFavoriteProbabilityDelta(probabilities = null, delta = 0, cap = 0.08) {
  if (!probabilities || !delta) return probabilities;
  const boundedDelta = Math.max(-cap, Math.min(cap, Number(delta) || 0));
  if (!boundedDelta) return probabilities;
  const favoriteKey = safeText(probabilities.favorite_key);
  if (!favoriteKey || !["home", "draw", "away"].includes(favoriteKey)) return probabilities;
  const adjusted = {
    home: probabilities.home,
    draw: probabilities.draw,
    away: probabilities.away,
  };
  adjusted[favoriteKey] = Math.max(0.02, Math.min(0.94, adjusted[favoriteKey] + boundedDelta));
  const otherKeys = ["home", "draw", "away"].filter((key) => key !== favoriteKey);
  const otherTotal = otherKeys.reduce((sum, key) => sum + adjusted[key], 0) || 1;
  const remainder = Math.max(0.06, 1 - adjusted[favoriteKey]);
  otherKeys.forEach((key) => {
    adjusted[key] = Math.max(0.02, remainder * (adjusted[key] / otherTotal));
  });
  return normalizeProbabilityTriple(adjusted, probabilities);
}

function buildSportsDecisionFrame({
  sportsGrounding = {},
  sportsMarketOverlay = {},
  sportsSemanticOverlay = {},
  sportsContractState = {},
  domainId = "",
  simulationTuning = {},
} = {}) {
  const sportsGrounded = sportsContractState?.sportsGrounded === true || sportsGrounding?.sports_grounded === true;
  const fixtureWindowOpen = sportsContractState?.fixtureWindowOpen === true || sportsGrounding?.fixture_window_open === true;
  const sportsPickState = safeText(
    sportsContractState?.sportsPickState || sportsGrounding?.sports_pick_state,
    sportsGrounded ? "grounded_lean" : "hold"
  );
  const sportsPublishGateReady =
    sportsContractState?.sportsPublishGateReady === true ||
    sportsGrounding?.publish_gate_ready === true ||
    sportsPickState === "publishable_controlled" ||
    sportsPickState === "publishable_full";
  const semanticReady = sportsGrounding?.semantic_ready === true || sportsSemanticOverlay?.ready === true;
  const marketFrame = sportsGrounding?.market_frame || sportsMarketOverlay?.market_frame || null;
  const marketSource = safeText(
    sportsGrounding?.sports_market_source || sportsMarketOverlay?.sports_market_source || marketFrame?.source
  );
  const marketSourceClass = safeText(
    sportsGrounding?.sports_market_source_class || sportsMarketOverlay?.sports_market_source_class || marketFrame?.source_class,
    "none"
  ).toLowerCase();
  const marketQualityTier = safeText(
    sportsGrounding?.sports_market_quality_tier || sportsMarketOverlay?.sports_market_quality_tier || marketFrame?.market_quality_tier,
    marketSourceClass || "none"
  );
  const marketTruthConfidence = clamp01(
    sportsMarketOverlay?.market_truth_confidence ??
      sportsGrounding?.market_consensus_strength ??
      sportsMarketOverlay?.market_consensus_strength ??
      (marketSourceClass === "sharp" ? 0.78 : null),
    0
  );
  const marketDisagreement = clamp01(
    sportsGrounding?.market_disagreement_score ?? sportsMarketOverlay?.market_disagreement_score,
    0
  );
  const narrativeHype = clamp01(
    sportsGrounding?.narrative_hype_score ?? sportsMarketOverlay?.narrative_hype_score,
    0
  );
  const retailSentimentPressure = clamp01(
    sportsMarketOverlay?.retail_sentiment_pressure ?? narrativeHype,
    0
  );
  const retailBiasRisk = clamp01(
    sportsMarketOverlay?.retail_bias_risk ??
      (retailSentimentPressure * ((marketSourceClass === "sharp" || sportsGrounding?.market_probabilities) ? 0.42 : 0.82)),
    0
  );
  const sharpMarketAvailable = marketSourceClass === "sharp";
  const proxyMarketAvailable = marketSourceClass === "proxy";
  const contradictionScore = clamp01(sportsSemanticOverlay?.contradiction_score, 0);
  const lineupUncertainty = clamp01(sportsSemanticOverlay?.lineup_uncertainty, 0);
  const injuryPressure = clamp01(sportsSemanticOverlay?.injury_pressure, 0);
  const priceFrame = distributeModelProbabilities({
    questionSideA: safeText(sportsGrounding?.question_side_a),
    questionSideB: safeText(sportsGrounding?.question_side_b),
    winningSide: safeText(sportsGrounding?.winning_side),
    winningProbability: normalizeProbabilityNumber(sportsGrounding?.winning_probability),
    marketProbabilities: sportsGrounding?.market_probabilities || null,
  });

  const highCoherence =
    sharpMarketAvailable &&
    marketTruthConfidence >= 0.62 &&
    marketDisagreement <= 0.24 &&
    retailBiasRisk <= 0.52 &&
    (semanticReady || sportsPublishGateReady);
  const adjustedModelProbabilities = applyFavoriteProbabilityDelta(
    priceFrame.model_probabilities,
    Number(simulationTuning?.probability_delta) || 0,
    highCoherence ? 0.12 : 0.08
  );
  const marketProbabilities = priceFrame.market_probabilities;
  const modelProbabilities = adjustedModelProbabilities || priceFrame.model_probabilities;
  const fairPrices = buildFairPrices(modelProbabilities);
  const edgeDelta = computeSportsEdgeDelta({
    modelProbabilities,
    marketProbabilities,
  });
  const marketReady = Boolean(marketProbabilities) && sharpMarketAvailable;
  const fragilityScore = Number(
    clamp01(
      contradictionScore * 0.28 +
        lineupUncertainty * 0.18 +
        injuryPressure * 0.14 +
        marketDisagreement * 0.22 +
        clamp01(modelProbabilities?.draw, 0.2) * 0.1 +
        retailBiasRisk * 0.08,
      sportsGrounded ? 0.34 : 0
    ).toFixed(3)
  );
  const simulationConfidence = Number(
    clamp01(
      (sportsGrounding?.overlay_confidence || sportsSemanticOverlay?.confidence || 0) * 0.38 +
        marketTruthConfidence * 0.24 +
        clamp01(simulationTuning?.quality_score, 0.55) * 0.2 +
        clamp01(simulationTuning?.agent_convergence, 0.5) * 0.12 +
        clamp01(simulationTuning?.graph_coverage, 0.55) * 0.06 -
        retailBiasRisk * 0.1,
      sportsGrounded ? 0.28 : 0
    ).toFixed(3)
  );
  const modelFavorite = safeText(modelProbabilities?.favorite_label);
  const marketFavorite = safeText(marketProbabilities?.favorite_label);
  const favoriteProbability = normalizeProbabilityNumber(modelProbabilities?.favorite_probability);
  const upsetRate = favoriteProbability == null ? null : Number((1 - favoriteProbability).toFixed(3));
  const drawVolatility = modelProbabilities?.draw != null ? Number(modelProbabilities.draw.toFixed(3)) : null;
  const noBetByDefault = safeText(domainId) === SPORTS_PROBABILITY_MODE_DOMAIN;
  let decisionState = normalizeSportsDecisionState(
    sportsGrounded ? (sportsPickState === "hold" ? (noBetByDefault ? "no_bet" : "grounded_lean") : "grounded_lean") : "hold"
  );
  let decisionReason = sportsGrounded
    ? "Crystal grounded the fixture and can now separate favorite from price-sensitive decision quality."
    : "Crystal still needs a grounded fixture before it can make a sports decision call.";
  let noBetReason = "";

  if (!sportsGrounded) {
    decisionState = "hold";
  } else if (!fixtureWindowOpen) {
    decisionState = "grounded_lean";
    decisionReason = "Crystal has the matchup grounded, but it is still waiting for an active fixture window before upgrading the call.";
  } else if (marketSourceClass === "retail" && retailSentimentPressure >= 0.4) {
    decisionState = noBetByDefault ? "no_bet" : "grounded_lean";
    noBetReason = noBetByDefault
      ? "Public attention is elevated, but Crystal does not treat retail sentiment as price truth without a harder market reference."
      : "";
    decisionReason =
      noBetReason || "Crystal can keep a grounded lean alive, but public sentiment alone is not enough to price this match like a whale would.";
  } else if (proxyMarketAvailable) {
    const bestDelta = Number(edgeDelta?.best_delta || 0);
    if (bestDelta >= 0.03 && fragilityScore < 0.58 && simulationConfidence >= 0.52 && retailBiasRisk < 0.64) {
      decisionState = "lean";
      decisionReason = `${safeText(edgeDelta?.best_label, modelFavorite)} has a small model-vs-proxy gap, but Crystal still treats proxy pricing as a lean only, not a full edge.`;
    } else {
      decisionState = "no_bet";
      noBetReason = "Crystal has a proxy market frame, but without sharp odds truth it would rather keep this as no bet than force an edge.";
      decisionReason = noBetReason;
    }
  } else if (!marketReady) {
    decisionState = noBetByDefault ? "no_bet" : "grounded_lean";
    noBetReason = noBetByDefault ? "Market context is still too thin to convert the grounded read into a bettable probability call." : "";
    decisionReason = noBetReason || "Crystal can keep a grounded lean alive, but it still lacks a clean market frame.";
  } else if (!sportsPublishGateReady && !semanticReady) {
    decisionState = noBetByDefault ? "no_bet" : "grounded_lean";
    noBetReason = noBetByDefault ? "The fixture is grounded, but semantic and market coherence are still too thin for a stronger play." : "";
    decisionReason = noBetReason || "Crystal is still waiting for stronger match-specific semantic convergence.";
  } else {
    const bestDelta = Number(edgeDelta?.best_delta || 0);
    const fairlyPricedFavorite =
      modelFavorite && marketFavorite && modelFavorite === marketFavorite && bestDelta <= 0.03 && marketDisagreement <= 0.28;
    if (
      fairlyPricedFavorite ||
      bestDelta <= 0.03 ||
      fragilityScore >= 0.62 ||
      simulationConfidence < 0.48 ||
      retailBiasRisk >= 0.68
    ) {
      decisionState = "no_bet";
      noBetReason = fairlyPricedFavorite
        ? `${modelFavorite} still looks like the favorite, but the market is already pricing that edge close to Crystal's fair value.`
        : retailBiasRisk >= 0.68
          ? "Retail/public narrative is running too hot relative to the harder market evidence, so Crystal would rather stand down than chase the crowd."
        : fragilityScore >= 0.62
          ? "The matchup is still too fragile across lineups, contradiction pressure, or draw volatility to justify a bet."
          : "Crystal sees a read here, but the current model-vs-market gap is still too small to count as an edge.";
      decisionReason = noBetReason;
    } else if (
      bestDelta >= 0.05 &&
      simulationConfidence >= 0.66 &&
      fragilityScore < 0.55 &&
      highCoherence &&
      retailBiasRisk < 0.58
    ) {
      decisionState = "edge";
      decisionReason = `${safeText(edgeDelta?.best_label, modelFavorite)} looks underpriced by about ${Math.round(bestDelta * 100)} implied points versus Crystal's fair price.`;
    } else {
      decisionState = "lean";
      decisionReason = `${safeText(edgeDelta?.best_label, modelFavorite)} holds a modest but usable gap over the current market frame.`;
    }
  }

  return {
    market_ready: marketReady,
    sharp_market_available: sharpMarketAvailable,
    proxy_market_available: proxyMarketAvailable,
    market_source: marketSource || null,
    market_source_class: marketSourceClass,
    market_quality_tier: marketQualityTier,
    market_truth_confidence: marketTruthConfidence,
    retail_sentiment_pressure: retailSentimentPressure,
    retail_bias_risk: retailBiasRisk,
    decision_state: decisionState,
    decision_reason: decisionReason,
    no_bet_reason: noBetReason || null,
    model_probabilities: modelProbabilities,
    market_probabilities: marketProbabilities,
    fair_prices: fairPrices,
    edge_delta: edgeDelta,
    upset_rate: upsetRate,
    draw_volatility: drawVolatility,
    fragility_score: fragilityScore,
    flip_conditions: uniqueStrings(sportsGrounding?.invalidators || []).slice(0, 4),
    simulation_confidence: simulationConfidence,
    model_favorite: modelFavorite || null,
    market_favorite: marketFavorite || null,
    favorite_but_no_bet: decisionState === "no_bet" && Boolean(modelFavorite),
    notes: uniqueStrings(
      []
        .concat(Array.isArray(simulationTuning?.notes) ? simulationTuning.notes : [])
        .concat(noBetReason ? [noBetReason] : [])
    ).slice(0, 4),
  };
}

function shouldTriggerSportsDecisionSimulation({
  sportsGrounding = {},
  sportsMarketOverlay = {},
  sportsSemanticOverlay = {},
  sportsContractState = {},
  domainId = "",
} = {}) {
  const decisionFrame = buildSportsDecisionFrame({
    sportsGrounding,
    sportsMarketOverlay,
    sportsSemanticOverlay,
    sportsContractState,
    domainId,
  });
  const sportsGrounded = sportsContractState?.sportsGrounded === true || sportsGrounding?.sports_grounded === true;
  const fixtureWindowOpen = sportsContractState?.fixtureWindowOpen === true || sportsGrounding?.fixture_window_open === true;
  const semanticThinCritically =
    sportsSemanticOverlay?.enabled === true &&
    (Number(sportsSemanticOverlay?.entity_alignment_score || 0) < 0.62 ||
      Number(sportsSemanticOverlay?.contradiction_score || 0) > 0.52);
  return sportsGrounded && fixtureWindowOpen && decisionFrame.market_ready === true && !semanticThinCritically;
}

module.exports = {
  SPORTS_DECISION_STATES,
  SPORTS_PROBABILITY_MODE_DOMAIN,
  buildFairPrices,
  buildSportsDecisionFrame,
  computeSportsEdgeDelta,
  distributeModelProbabilities,
  normalizeProbabilityTriple,
  normalizeSportsDecisionState,
  shouldTriggerSportsDecisionSimulation,
};
