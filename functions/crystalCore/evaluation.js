const crypto = require("node:crypto");

const { safeText, clamp01, buildBinaryContract, buildCompatibleProbabilitySplit } = require("../predictionCore");

const ACTIVE_CALIBRATION_SAMPLE_SIZE = 30;
const ACTIVE_CALIBRATION_MAX_AGE_DAYS = 7;
const DEFAULT_PUBLISH_THRESHOLDS = {
  published_min_confidence: 0.6,
  published_min_coverage: 0.58,
  max_conflict_for_published: 0.42,
};

function normalizeBinaryLabel(value) {
  return safeText(value).trim().toLowerCase().replace(/ì/g, "i");
}

function binaryLabelsMatch(left, right) {
  return Boolean(normalizeBinaryLabel(left) && normalizeBinaryLabel(left) === normalizeBinaryLabel(right));
}

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function toSerializable(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item)).filter((item) => item !== undefined);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : value;
  }
  if (!value || typeof value !== "object") return value;
  const ctorName = value.constructor?.name;
  if (ctorName && ctorName !== "Object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nestedValue]) => [key, toSerializable(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined)
  );
}

function horizonToDays(horizonId = "30d") {
  switch (safeText(horizonId, "30d")) {
    case "now":
    case "7d":
      return 7;
    case "14d":
      return 14;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "6m":
      return 180;
    case "12m":
      return 365;
    default:
      return 30;
  }
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function createResolutionHash(payload = {}) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 20);
}

function buildResolutionTarget({ normalizedQuery = {}, scorecard = {}, verifiedEvidencePack = {} }) {
  const horizonId = safeText(normalizedQuery?.horizons?.[0]?.horizon_id, safeText(normalizedQuery?.horizon?.horizon_id, "30d"));
  const horizonDays = horizonToDays(horizonId);
  const eventDateRaw = safeText(normalizedQuery?.event_date);
  const eventDate = eventDateRaw ? new Date(eventDateRaw) : null;
  const resolutionDueAt =
    eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate.toISOString() : addDays(new Date(), horizonDays).toISOString();
  const binaryFrame = normalizedQuery?.binary_frame || {};
  const marketFrame = verifiedEvidencePack?.prediction_market_frame || null;
  const binaryContract =
    scorecard?.binary_contract ||
    buildBinaryContract(
      {},
      {
        question_side_a: safeText(binaryFrame.question_side_a, safeText(scorecard?.probability_split?.primary_label)),
        question_side_b: safeText(binaryFrame.question_side_b, safeText(scorecard?.probability_split?.secondary_label)),
      },
      scorecard?.probability_split || null,
      scorecard?.primary_call,
      {
        publicationState: safeText(scorecard?.publication_state, "limited"),
        confidenceScore: clamp01(scorecard?.confidence_score, 0.58),
        evidenceQuality: scorecard?.publication_basis || {},
      }
    );
  const isBinary = Boolean(binaryFrame.asks_binary_question || binaryContract);
  const intentShape = safeText(normalizedQuery?.intent_shape, isBinary ? "binary_outcome" : "directional_range");
  const sourceType = marketFrame?.market_slug && isBinary ? "polymarket_binary" : intentShape === "binary_outcome" ? "binary_manual" : "directional_manual";
  const evaluationEligible = intentShape === "binary_outcome" || intentShape === "directional_range";

  return {
    resolution_id: `resolution_${createResolutionHash({
      domain: normalizedQuery?.primary_domain_id,
      horizonId,
      dueAt: resolutionDueAt,
      binaryFrame,
      marketSlug: marketFrame?.market_slug || "",
    })}`,
    target_type: isBinary ? "binary_outcome" : "directional_range",
    source_type: sourceType,
    resolution_due_at: resolutionDueAt,
    resolution_window_days: horizonDays,
    question_side_a: safeText(binaryContract?.question_side_a, safeText(binaryFrame.question_side_a, safeText(scorecard?.probability_split?.primary_label))),
    question_side_b: safeText(binaryContract?.question_side_b, safeText(binaryFrame.question_side_b, safeText(scorecard?.probability_split?.secondary_label))),
    market_slug: safeText(marketFrame?.market_slug) || null,
    market_id: safeText(marketFrame?.market_id) || null,
    event_date: eventDateRaw || null,
    evaluation_eligible: evaluationEligible,
  };
}

function logit(probability) {
  const bounded = Math.max(1e-6, Math.min(1 - 1e-6, clamp01(probability, 0.5)));
  return Math.log(bounded / (1 - bounded));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function buildReliabilityCurve(samples = [], bucketCount = 5) {
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    bucket_index: index,
    bucket_start: index / bucketCount,
    bucket_end: (index + 1) / bucketCount,
    sample_size: 0,
    avg_predicted_probability: 0,
    empirical_rate: 0,
  }));

  samples.forEach((sample) => {
    const probability = clamp01(sample?.predicted_probability, 0.5);
    const actual = Number(sample?.actual_outcome) === 1 ? 1 : 0;
    const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor(probability * bucketCount)));
    const bucket = buckets[bucketIndex];
    bucket.sample_size += 1;
    bucket.avg_predicted_probability += probability;
    bucket.empirical_rate += actual;
  });

  return buckets.map((bucket) => ({
    ...bucket,
    avg_predicted_probability: bucket.sample_size > 0 ? Number((bucket.avg_predicted_probability / bucket.sample_size).toFixed(4)) : 0,
    empirical_rate: bucket.sample_size > 0 ? Number((bucket.empirical_rate / bucket.sample_size).toFixed(4)) : 0,
  }));
}

function buildConfidenceAdjustment(samples = []) {
  const pairs = samples
    .map((sample) => ({
      x: logit(sample?.predicted_probability),
      y: Number(sample?.actual_outcome) === 1 ? 1 : 0,
    }))
    .filter((sample) => Number.isFinite(sample.x));

  if (pairs.length < 5) {
    return {
      slope: 1,
      intercept: 0,
      floor: 0.18,
      ceiling: 0.92,
    };
  }

  const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
  const numerator = pairs.reduce((sum, pair) => sum + (pair.x - meanX) * (pair.y - meanY), 0);
  const denominator = pairs.reduce((sum, pair) => sum + (pair.x - meanX) ** 2, 0) || 1;
  const slope = Math.max(0.4, Math.min(1.6, numerator / denominator || 1));
  const intercept = Math.max(-1.2, Math.min(1.2, meanY - slope * meanX));

  return {
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(4)),
    floor: 0.18,
    ceiling: 0.92,
  };
}

function buildPublishThresholds(metrics = {}) {
  const brier = Number(metrics?.brier_score);
  const deterministicCallRate = Number(metrics?.deterministic_call_rate);
  const pressure = Number.isFinite(brier) && brier > 0.24 ? 0.04 : Number.isFinite(deterministicCallRate) && deterministicCallRate < 0.75 ? 0.02 : 0;
  return {
    published_min_confidence: Number((DEFAULT_PUBLISH_THRESHOLDS.published_min_confidence + pressure).toFixed(3)),
    published_min_coverage: DEFAULT_PUBLISH_THRESHOLDS.published_min_coverage,
    max_conflict_for_published: Number((DEFAULT_PUBLISH_THRESHOLDS.max_conflict_for_published - pressure / 2).toFixed(3)),
  };
}

function isFreshCalibrationDoc(doc = {}) {
  const updated = doc?.updated_at?.toDate ? doc.updated_at.toDate() : doc?.updated_at ? new Date(doc.updated_at) : null;
  if (!updated || Number.isNaN(updated.getTime())) return false;
  const ageDays = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
  return Number(doc?.sample_size || 0) >= ACTIVE_CALIBRATION_SAMPLE_SIZE && ageDays <= ACTIVE_CALIBRATION_MAX_AGE_DAYS;
}

async function loadActiveCalibration(db, domainId) {
  if (!db || !safeText(domainId)) return null;
  const snapshot = await db.collection("domain_calibration").doc(domainId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() || null;
  return data && isFreshCalibrationDoc(data) ? data : null;
}

function applyCalibrationToScorecard(scorecard = {}, calibrationDoc = null) {
  if (!calibrationDoc) {
    return {
      scorecard,
      calibration_snapshot: {
        active: false,
        calibration_version: null,
      },
    };
  }

  const adjustment = calibrationDoc.confidence_adjustment || {};
  const thresholds = calibrationDoc.publish_thresholds || DEFAULT_PUBLISH_THRESHOLDS;
  const binaryContract = scorecard?.binary_contract || null;
  const rawProbability = clamp01(
    binaryContract?.winning_probability ?? scorecard?.probability_split?.primary_probability,
    Number.isFinite(Number(scorecard?.confidence_score)) ? Number(scorecard.confidence_score) : 0.5
  );
  const rawConfidence = clamp01(scorecard?.confidence_score, rawProbability);
  const calibratedProbability = Math.max(
    Number(adjustment.floor || 0.18),
    Math.min(
      Number(adjustment.ceiling || 0.92),
      sigmoid(Number(adjustment.intercept || 0) + Number(adjustment.slope || 1) * logit(rawProbability))
    )
  );
  const confidenceMultiplier = calibratedProbability >= rawProbability ? 1.02 : 0.97;
  const calibratedConfidence = Math.max(
    Number(adjustment.floor || 0.18),
    Math.min(Number(adjustment.ceiling || 0.92), clamp01(rawConfidence * confidenceMultiplier, rawConfidence))
  );

  const nextScorecard = {
    ...scorecard,
    confidence_score: Number(calibratedConfidence.toFixed(4)),
  };

  if (binaryContract) {
    const calibratedBinaryContract = buildBinaryContract(
      {
        ...binaryContract,
        question_side_a_probability: binaryLabelsMatch(binaryContract?.winning_side, binaryContract?.question_side_a)
          ? calibratedProbability
          : 1 - calibratedProbability,
        question_side_b_probability: binaryLabelsMatch(binaryContract?.winning_side, binaryContract?.question_side_b)
          ? calibratedProbability
          : 1 - calibratedProbability,
        winning_probability: calibratedProbability,
      },
      {
        question_side_a: safeText(binaryContract?.question_side_a),
        question_side_b: safeText(binaryContract?.question_side_b),
      },
      scorecard?.probability_split || null,
      scorecard?.primary_call,
      {
        fallbackProbability: binaryLabelsMatch(binaryContract?.winning_side, binaryContract?.question_side_a)
          ? calibratedProbability
          : 1 - calibratedProbability,
        publicationState: safeText(scorecard?.publication_state, "limited"),
        confidenceScore: calibratedConfidence,
        evidenceQuality: scorecard?.publication_basis || {},
      }
    );
    nextScorecard.binary_contract = calibratedBinaryContract;
    nextScorecard.probability_split = buildCompatibleProbabilitySplit(calibratedBinaryContract);
    nextScorecard.primary_call = safeText(calibratedBinaryContract?.display_call, safeText(nextScorecard.primary_call));
  } else if (scorecard?.probability_split) {
    nextScorecard.probability_split = {
      ...scorecard.probability_split,
      primary_probability: Number(calibratedProbability.toFixed(4)),
      secondary_probability: Number((1 - calibratedProbability).toFixed(4)),
    };
  }

  if (
    calibratedConfidence >= Number(thresholds.published_min_confidence || DEFAULT_PUBLISH_THRESHOLDS.published_min_confidence) &&
    Number(scorecard?.publication_basis?.coverage_score || 0) >=
      Number(thresholds.published_min_coverage || DEFAULT_PUBLISH_THRESHOLDS.published_min_coverage) &&
    Number(scorecard?.publication_basis?.conflict_score || 0) <=
      Number(thresholds.max_conflict_for_published || DEFAULT_PUBLISH_THRESHOLDS.max_conflict_for_published)
  ) {
    nextScorecard.publication_state = "published";
  } else if (safeText(nextScorecard.publication_state) !== "blocked") {
    nextScorecard.publication_state = "limited";
  }

  if (nextScorecard?.binary_contract) {
    const recalibratedBinaryContract = buildBinaryContract(
      {
        ...nextScorecard.binary_contract,
        question_side_a_probability: binaryLabelsMatch(nextScorecard.binary_contract?.winning_side, nextScorecard.binary_contract?.question_side_a)
          ? calibratedProbability
          : 1 - calibratedProbability,
        question_side_b_probability: binaryLabelsMatch(nextScorecard.binary_contract?.winning_side, nextScorecard.binary_contract?.question_side_b)
          ? calibratedProbability
          : 1 - calibratedProbability,
        winning_probability: calibratedProbability,
      },
      {
        question_side_a: safeText(nextScorecard.binary_contract?.question_side_a),
        question_side_b: safeText(nextScorecard.binary_contract?.question_side_b),
      },
      nextScorecard.probability_split || null,
      nextScorecard.primary_call,
      {
        fallbackProbability: binaryLabelsMatch(nextScorecard.binary_contract?.winning_side, nextScorecard.binary_contract?.question_side_a)
          ? calibratedProbability
          : 1 - calibratedProbability,
        publicationState: safeText(nextScorecard.publication_state, "limited"),
        confidenceScore: calibratedConfidence,
        evidenceQuality: nextScorecard.publication_basis || {},
      }
    );
    nextScorecard.binary_contract = recalibratedBinaryContract;
    nextScorecard.probability_split = buildCompatibleProbabilitySplit(recalibratedBinaryContract);
    nextScorecard.primary_call = safeText(recalibratedBinaryContract?.display_call, safeText(nextScorecard.primary_call));
  }

  const calibrationNote = `Domain calibration ${safeText(calibrationDoc.calibration_version, "active")} adjusted probability from ${Math.round(
    rawProbability * 100
  )}% to ${Math.round(calibratedProbability * 100)}%.`;
  nextScorecard.publication_basis = {
    ...(nextScorecard.publication_basis || {}),
    notes: uniqueStrings([...(Array.isArray(nextScorecard?.publication_basis?.notes) ? nextScorecard.publication_basis.notes : []), calibrationNote]).slice(0, 5),
  };

  return {
    scorecard: nextScorecard,
    calibration_snapshot: {
      active: true,
      calibration_version: safeText(calibrationDoc.calibration_version),
      raw_probability: Number(rawProbability.toFixed(4)),
      calibrated_probability: Number(calibratedProbability.toFixed(4)),
      raw_winning_probability: Number(rawProbability.toFixed(4)),
      calibrated_winning_probability: Number(calibratedProbability.toFixed(4)),
      raw_confidence: Number(rawConfidence.toFixed(4)),
      calibrated_confidence: Number(calibratedConfidence.toFixed(4)),
      band: safeText(nextScorecard?.binary_contract?.band),
      thresholds: toSerializable(thresholds),
      updated_at: toSerializable(calibrationDoc.updated_at),
    },
  };
}

function inferBinaryOutcomeFromMarket(signal = {}, target = {}) {
  const outcomes = Array.isArray(signal?.outcomes) ? signal.outcomes.map((item) => safeText(item)) : [];
  const outcomePrices = Array.isArray(signal?.outcome_prices) ? signal.outcome_prices.map((item) => Number(item)) : [];
  const yesIndex = outcomes.findIndex((item) => item.toLowerCase() === "yes");
  const noIndex = outcomes.findIndex((item) => item.toLowerCase() === "no");
  if (yesIndex < 0 || noIndex < 0) return null;

  const yesPrice = Number.isFinite(outcomePrices[yesIndex]) ? outcomePrices[yesIndex] : null;
  const noPrice = Number.isFinite(outcomePrices[noIndex]) ? outcomePrices[noIndex] : null;
  const closed = Boolean(signal?.closed);
  if (!closed) return null;
  if (yesPrice == null || noPrice == null) return null;

  if (yesPrice >= 0.97 || noPrice <= 0.03) {
    return {
      observed_outcome: safeText(target.question_side_a, "Yes"),
      actual_outcome: 1,
    };
  }

  if (noPrice >= 0.97 || yesPrice <= 0.03) {
    return {
      observed_outcome: safeText(target.question_side_b, "No"),
      actual_outcome: 0,
    };
  }

  return null;
}

async function fetchPolymarketResolution(fetchJson, target = {}) {
  if (!safeText(target.market_slug)) return null;
  const payload = await fetchJson(`https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(target.market_slug)}`);
  const outcomes = (() => {
    try {
      return JSON.parse(payload?.outcomes || "[]");
    } catch (_error) {
      return Array.isArray(payload?.outcomes) ? payload.outcomes : [];
    }
  })();
  const outcomePrices = (() => {
    try {
      return JSON.parse(payload?.outcomePrices || "[]");
    } catch (_error) {
      return Array.isArray(payload?.outcomePrices) ? payload.outcomePrices : [];
    }
  })();

  return inferBinaryOutcomeFromMarket(
    {
      closed: Boolean(payload?.closed || payload?.events?.[0]?.closed),
      outcomes,
      outcome_prices: outcomePrices,
    },
    target
  );
}

function getRunCompletedDate(runDoc = {}) {
  if (typeof runDoc?.completed_at?.toDate === "function") {
    return runDoc.completed_at.toDate();
  }
  const completed = runDoc?.completed_at ? new Date(runDoc.completed_at) : null;
  return completed && !Number.isNaN(completed.getTime()) ? completed : null;
}

function shouldResolveRun(runDoc = {}, now = new Date()) {
  if (safeText(runDoc?.status) !== "completed") return false;
  if (!runDoc?.evaluation_eligible) return false;
  if (safeText(runDoc?.resolution_status) === "resolved") return false;
  const due = runDoc?.resolution_target?.resolution_due_at ? new Date(runDoc.resolution_target.resolution_due_at) : getRunCompletedDate(runDoc);
  return due && !Number.isNaN(due.getTime()) ? due <= now : false;
}

async function runResolutionSweep(context, options = {}) {
  const { db, admin, fetchJson } = context;
  const limit = Math.max(1, Number(options.limit) || 100);
  const snapshot = await db.collection("forecast_runs").where("evaluation_eligible", "==", true).limit(limit).get();
  const now = new Date();
  const stats = {
    scanned: 0,
    due: 0,
    resolved: 0,
    skipped: 0,
  };

  for (const doc of snapshot.docs) {
    const runDoc = doc.data() || {};
    stats.scanned += 1;
    if (!shouldResolveRun(runDoc, now)) {
      continue;
    }
    stats.due += 1;
    const target = runDoc?.resolution_target || {};

    let resolution = null;
    try {
      if (safeText(target.source_type) === "polymarket_binary") {
        resolution = await fetchPolymarketResolution(fetchJson, target);
      }
    } catch (_error) {
      resolution = null;
    }

    if (!resolution) {
      stats.skipped += 1;
      await db.collection("forecast_runs").doc(doc.id).set(
        {
          resolution_status: "pending",
          resolution_last_checked_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      continue;
    }

    const resolutionId = safeText(target.resolution_id, `resolution_${doc.id}`);
    const resolutionPayload = {
      resolution_id: resolutionId,
      run_id: doc.id,
      lineage_id: safeText(runDoc?.result_card?.lineage_id, safeText(runDoc?.query_hash)),
      version_id: safeText(runDoc?.result_card?.version_id),
      domain_id: safeText(runDoc?.query_plan?.primary_domain_id || runDoc?.result_card?.domain),
      resolution_target: toSerializable(target),
      observed_outcome: resolution.observed_outcome,
      actual_outcome: resolution.actual_outcome,
      resolved_at: admin.firestore.FieldValue.serverTimestamp(),
      resolution_source: safeText(target.source_type, "manual"),
      resolution_quality: 0.78,
      predicted_label: safeText(
        runDoc?.result_card?.binary_contract?.winning_side,
        safeText(runDoc?.result_card?.probability_split?.primary_label, safeText(runDoc?.result_card?.primary_call))
      ),
      predicted_probability: clamp01(
        runDoc?.result_card?.calibration_snapshot?.calibrated_winning_probability ??
          runDoc?.result_card?.calibration_snapshot?.calibrated_probability ??
          runDoc?.result_card?.binary_contract?.winning_probability ??
          runDoc?.result_card?.probability_split?.primary_probability ??
          runDoc?.result_card?.trust_layer?.confidence_score,
        0.5
      ),
      raw_probability: clamp01(
        runDoc?.result_card?.calibration_snapshot?.raw_winning_probability ??
          runDoc?.result_card?.calibration_snapshot?.raw_probability ??
          runDoc?.result_card?.binary_contract?.winning_probability ??
          runDoc?.result_card?.probability_split?.primary_probability ??
          runDoc?.result_card?.trust_layer?.confidence_score,
        0.5
      ),
      card_state: safeText(runDoc?.result_card?.card_state, "limited"),
      runtime_transport: safeText(runDoc?.runtime_transport, "local"),
      rollout_bucket: safeText(runDoc?.rollout_bucket),
      core_version: safeText(runDoc?.core_version || runDoc?.core_runtime),
      scored: target.target_type === "binary_outcome",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("forecast_resolutions").doc(resolutionId).set(resolutionPayload, { merge: true });
    await db.collection("forecast_runs").doc(doc.id).set(
      {
        resolution_status: "resolved",
        resolution_id: resolutionId,
        observed_outcome: resolution.observed_outcome,
        resolution_last_checked_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    stats.resolved += 1;
  }

  return {
    mode: "resolution",
    timestamp: nowIso(),
    ...stats,
  };
}

async function listRecentRuns(db, sinceDate, limit = 400) {
  const snapshot = await db.collection("forecast_runs").limit(limit).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((runDoc) => {
      const completedAt = getRunCompletedDate(runDoc);
      const updatedAt = runDoc?.updated_at?.toDate ? runDoc.updated_at.toDate() : runDoc?.updated_at ? new Date(runDoc.updated_at) : null;
      const referenceDate = completedAt || updatedAt;
      return referenceDate && !Number.isNaN(referenceDate.getTime()) && referenceDate >= sinceDate;
    });
}

function getParityKey(runDoc = {}) {
  const explicit = safeText(runDoc?.query_hash);
  if (explicit) return explicit;
  return createResolutionHash({
    query_text: safeText(runDoc?.query_text).toLowerCase(),
    domain_id: safeText(runDoc?.query_plan?.primary_domain_id || runDoc?.result_card?.domain),
    question_side_a: safeText(runDoc?.result_card?.binary_contract?.question_side_a),
    question_side_b: safeText(runDoc?.result_card?.binary_contract?.question_side_b),
  });
}

function getTransportBucket(runtimeTransport = "") {
  const normalized = safeText(runtimeTransport).toLowerCase();
  if (normalized.startsWith("remote")) return "remote";
  if (normalized.startsWith("legacy")) return "legacy";
  if (normalized.startsWith("local_fallback")) return "local_core";
  if (normalized.startsWith("local_core")) return "local_core";
  return "other";
}

function getComparableBinaryRuns(recentRuns = []) {
  return recentRuns.filter((runDoc) => {
    const targetType = safeText(runDoc?.resolution_target?.target_type);
    return targetType === "binary_outcome" || Boolean(runDoc?.result_card?.binary_contract);
  });
}

function median(numbers = []) {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[midpoint - 1] + sorted[midpoint]) / 2).toFixed(4));
  }
  return Number(sorted[midpoint].toFixed(4));
}

function buildBinaryParitySummary(recentRuns = []) {
  const binaryRuns = getComparableBinaryRuns(recentRuns);
  const missingBinaryContractRate =
    binaryRuns.length > 0 ? binaryRuns.filter((runDoc) => !runDoc?.result_card?.binary_contract).length / binaryRuns.length : null;

  const grouped = new Map();
  for (const runDoc of binaryRuns.filter((item) => item?.result_card?.binary_contract)) {
    const parityKey = getParityKey(runDoc);
    const bucket = getTransportBucket(runDoc?.runtime_transport);
    if (!grouped.has(parityKey)) {
      grouped.set(parityKey, { remote: null, local_core: null });
    }
    if (bucket !== "remote" && bucket !== "local_core") {
      continue;
    }

    const current = grouped.get(parityKey);
    const completedAt = getRunCompletedDate(runDoc) || new Date(0);
    const existingCompletedAt = current[bucket] ? getRunCompletedDate(current[bucket]) || new Date(0) : new Date(0);
    if (!current[bucket] || completedAt >= existingCompletedAt) {
      current[bucket] = runDoc;
    }
  }

  const comparablePairs = [];
  for (const [parityKey, pair] of grouped.entries()) {
    if (pair.remote && pair.local_core) {
      const remoteCard = pair.remote.result_card?.binary_contract || {};
      const localCard = pair.local_core.result_card?.binary_contract || {};
      const probabilityDelta = Math.abs(
        clamp01(remoteCard.winning_probability, 0.5) - clamp01(localCard.winning_probability, 0.5)
      );
      comparablePairs.push({
        parity_key: parityKey,
        query_text: safeText(pair.remote.query_text, safeText(pair.local_core.query_text)),
        remote_transport: safeText(pair.remote.runtime_transport),
        local_transport: safeText(pair.local_core.runtime_transport),
        remote_winner: safeText(remoteCard.winning_side),
        local_winner: safeText(localCard.winning_side),
        remote_band: safeText(remoteCard.band),
        local_band: safeText(localCard.band),
        remote_publication_state: safeText(pair.remote.result_card?.card_state),
        local_publication_state: safeText(pair.local_core.result_card?.card_state),
        probability_delta: Number(probabilityDelta.toFixed(4)),
      });
    }
  }

  const winnerMismatchRate =
    comparablePairs.length > 0
      ? comparablePairs.filter((pair) => safeText(pair.remote_winner) !== safeText(pair.local_winner)).length / comparablePairs.length
      : null;
  const bandMismatchRate =
    comparablePairs.length > 0
      ? comparablePairs.filter((pair) => safeText(pair.remote_band) !== safeText(pair.local_band)).length / comparablePairs.length
      : null;
  const publicationStateMismatchRate =
    comparablePairs.length > 0
      ? comparablePairs.filter((pair) => safeText(pair.remote_publication_state) !== safeText(pair.local_publication_state)).length / comparablePairs.length
      : null;
  const probabilityDeltas = comparablePairs.map((pair) => pair.probability_delta).filter((value) => Number.isFinite(value));

  return {
    binary_runs_scanned: binaryRuns.length,
    comparable_pairs: comparablePairs.length,
    missing_binary_contract_rate: missingBinaryContractRate == null ? null : Number(missingBinaryContractRate.toFixed(4)),
    winner_mismatch_rate: winnerMismatchRate == null ? null : Number(winnerMismatchRate.toFixed(4)),
    band_mismatch_rate: bandMismatchRate == null ? null : Number(bandMismatchRate.toFixed(4)),
    publication_state_mismatch_rate:
      publicationStateMismatchRate == null ? null : Number(publicationStateMismatchRate.toFixed(4)),
    median_probability_delta: median(probabilityDeltas),
    max_probability_delta: probabilityDeltas.length ? Number(Math.max(...probabilityDeltas).toFixed(4)) : null,
    regressions: comparablePairs.sort((left, right) => right.probability_delta - left.probability_delta).slice(0, 10),
  };
}

function computeBinaryMetrics(samples = []) {
  if (!samples.length) {
    return {
      sample_size: 0,
      eligible_sample_size: 0,
      brier_score: null,
      log_loss: null,
      deterministic_call_rate: null,
      publish_precision: null,
      coverage_gap_rate: null,
      reliability_curve: buildReliabilityCurve([]),
      confidence_adjustment: buildConfidenceAdjustment([]),
      publish_thresholds: { ...DEFAULT_PUBLISH_THRESHOLDS },
    };
  }

  const epsilon = 1e-6;
  const brier = samples.reduce((sum, sample) => sum + (sample.predicted_probability - sample.actual_outcome) ** 2, 0) / samples.length;
  const logLoss =
    samples.reduce((sum, sample) => {
      const probability = Math.max(epsilon, Math.min(1 - epsilon, sample.predicted_probability));
      return sum - (sample.actual_outcome * Math.log(probability) + (1 - sample.actual_outcome) * Math.log(1 - probability));
    }, 0) / samples.length;
  const deterministicCallRate =
    samples.filter((sample) => sample.predicted_probability >= 0.55 || sample.predicted_probability <= 0.45).length / samples.length;
  const publishPrecision = samples.filter((sample) => sample.correct).length / samples.length;
  const coverageGapRate = samples.filter((sample) => sample.card_state === "blocked").length / samples.length;
  const metrics = {
    sample_size: samples.length,
    eligible_sample_size: samples.length,
    brier_score: Number(brier.toFixed(4)),
    log_loss: Number(logLoss.toFixed(4)),
    deterministic_call_rate: Number(deterministicCallRate.toFixed(4)),
    publish_precision: Number(publishPrecision.toFixed(4)),
    coverage_gap_rate: Number(coverageGapRate.toFixed(4)),
    reliability_curve: buildReliabilityCurve(samples),
    confidence_adjustment: buildConfidenceAdjustment(samples),
  };
  metrics.publish_thresholds = buildPublishThresholds(metrics);
  return metrics;
}

async function runEvaluationSweep(context, options = {}) {
  const { db, admin } = context;
  const lookbackDays = Math.max(1, Number(options.lookbackDays) || 30);
  const sinceDate = addDays(new Date(), -lookbackDays);
  const resolutionSnapshot = await db.collection("forecast_resolutions").where("scored", "==", true).limit(400).get();
  const resolutionDocs = resolutionSnapshot.docs
    .map((doc) => doc.data() || {})
    .filter((item) => {
      const resolvedAt = item?.resolved_at?.toDate ? item.resolved_at.toDate() : item?.resolved_at ? new Date(item.resolved_at) : null;
      return resolvedAt && !Number.isNaN(resolvedAt.getTime()) && resolvedAt >= sinceDate;
    });
  const recentRuns = await listRecentRuns(db, sinceDate);
  const byDomain = new Map();

  resolutionDocs.forEach((item) => {
    const domainId = safeText(item?.domain_id, "unknown");
    const predictedProbability = clamp01(item?.predicted_probability, 0.5);
    const actualOutcome = Number(item?.actual_outcome) === 1 ? 1 : 0;
    const predictedLabel = safeText(item?.predicted_label).toLowerCase();
    const observedOutcome = safeText(item?.observed_outcome).toLowerCase();
    const correct =
      predictedLabel && observedOutcome
        ? predictedLabel === observedOutcome
        : predictedProbability >= 0.5
          ? actualOutcome === 1
          : actualOutcome === 0;
    if (!byDomain.has(domainId)) {
      byDomain.set(domainId, []);
    }
    byDomain.get(domainId).push({
      predicted_probability: predictedProbability,
      actual_outcome: actualOutcome,
      correct,
      card_state: safeText(item?.card_state),
    });
  });

  const domainDocs = [];
  for (const [domainId, samples] of byDomain.entries()) {
    const metrics = computeBinaryMetrics(samples);
    const domainRunSet = recentRuns.filter((runDoc) => safeText(runDoc?.query_plan?.primary_domain_id || runDoc?.result_card?.domain) === domainId);
    const coverageGapRate =
      domainRunSet.length > 0
        ? domainRunSet.filter((runDoc) => safeText(runDoc?.result_card?.card_state) === "blocked").length / domainRunSet.length
        : metrics.coverage_gap_rate ?? 0;

    const docPayload = {
      calibration_version: `domain-calibration-${nowIso().slice(0, 10)}`,
      domain_id: domainId,
      window_start: sinceDate.toISOString(),
      window_end: nowIso(),
      sample_size: metrics.sample_size,
      eligible_sample_size: metrics.eligible_sample_size,
      brier_score: metrics.brier_score,
      log_loss: metrics.log_loss,
      deterministic_call_rate: metrics.deterministic_call_rate,
      publish_precision: metrics.publish_precision,
      coverage_gap_rate: Number(coverageGapRate.toFixed(4)),
      reliability_curve: metrics.reliability_curve,
      confidence_adjustment: metrics.confidence_adjustment,
      publish_thresholds: metrics.publish_thresholds,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection("domain_calibration").doc(domainId).set(docPayload, { merge: true });
    domainDocs.push({
      ...docPayload,
      updated_at: nowIso(),
    });
  }

  return {
    mode: "evaluation",
    timestamp: nowIso(),
    domains_updated: domainDocs.length,
    lookback_days: lookbackDays,
    domains: domainDocs,
  };
}

function buildRolloutRecommendation({
  remoteErrorRate = null,
  remotePendingRate = null,
  deterministicCallRate = null,
  a0GeneralRate = null,
  parityWinnerMismatchRate = null,
  parityMedianProbabilityDelta = null,
  missingBinaryContractRate = null,
}) {
  const blockers = [];
  if (remoteErrorRate != null && remoteErrorRate >= 0.02) blockers.push("remote_error_rate");
  if (remotePendingRate != null && remotePendingRate >= 0.08) blockers.push("pending_rate");
  if (deterministicCallRate != null && deterministicCallRate < 0.85) blockers.push("deterministic_call_rate");
  if (a0GeneralRate != null && a0GeneralRate >= 0.1) blockers.push("general_fallback_rate");
  if (parityWinnerMismatchRate != null && parityWinnerMismatchRate >= 0.05) blockers.push("binary_winner_parity");
  if (parityMedianProbabilityDelta != null && parityMedianProbabilityDelta >= 0.08) blockers.push("binary_probability_parity");
  if (missingBinaryContractRate != null && missingBinaryContractRate > 0) blockers.push("missing_binary_contract");

  return {
    blockers,
    next_step:
      blockers.length === 0
        ? "safe_to_consider_rollout_increase"
        : "hold_current_rollout_and_fix_regressions",
  };
}

async function generateEvaluationReport(context, options = {}) {
  const { db, admin } = context;
  const reportType = safeText(options.reportType, "daily");
  const lookbackDays = reportType === "weekly" ? 7 : Math.max(1, Number(options.lookbackDays) || 1);
  const sinceDate = addDays(new Date(), -lookbackDays);
  const recentRuns = await listRecentRuns(db, sinceDate, 500);
  const calibrationSnapshot = await db.collection("domain_calibration").get();
  const domainSummaries = calibrationSnapshot.docs.map((doc) => ({
    domain_id: doc.id,
    ...(doc.data() || {}),
    updated_at: toSerializable(doc.data()?.updated_at),
  }));

  const remoteRuns = recentRuns.filter((runDoc) => safeText(runDoc?.runtime_transport).startsWith("remote"));
  const remoteErrors =
    remoteRuns.length > 0 ? remoteRuns.filter((runDoc) => safeText(runDoc?.status) === "failed").length / remoteRuns.length : null;
  const remotePending =
    remoteRuns.length > 0
      ? remoteRuns.filter((runDoc) => safeText(runDoc?.pending_status || runDoc?.current_stage) === "pending").length / remoteRuns.length
      : null;
  const deterministicCallRate =
    recentRuns.length > 0
      ? recentRuns.filter((runDoc) => {
          const winningProbability = Number(
            runDoc?.result_card?.calibration_snapshot?.calibrated_winning_probability ??
              runDoc?.result_card?.binary_contract?.winning_probability ??
              runDoc?.result_card?.probability_split?.primary_probability
          );
          return Number.isFinite(winningProbability) && winningProbability >= 0.55;
        }).length / recentRuns.length
      : null;
  const generalRate =
    recentRuns.length > 0
      ? recentRuns.filter((runDoc) => safeText(runDoc?.query_plan?.primary_domain_id || runDoc?.result_card?.domain) === "A.0.general.general_forecast").length / recentRuns.length
      : null;
  const binaryParitySummary = buildBinaryParitySummary(recentRuns);

  const rolloutRecommendation = buildRolloutRecommendation({
    remoteErrorRate: remoteErrors,
    remotePendingRate: remotePending,
    deterministicCallRate,
    a0GeneralRate: generalRate,
    parityWinnerMismatchRate: binaryParitySummary.winner_mismatch_rate,
    parityMedianProbabilityDelta: binaryParitySummary.median_probability_delta,
    missingBinaryContractRate: binaryParitySummary.missing_binary_contract_rate,
  });

  const summaryLines = [
    `# Crystal evaluation report (${reportType})`,
    "",
    `Window: ${sinceDate.toISOString()} -> ${nowIso()}`,
    `Runs scanned: ${recentRuns.length}`,
    `Remote error rate: ${remoteErrors == null ? "n/a" : `${Math.round(remoteErrors * 100)}%`}`,
    `Remote pending pressure: ${remotePending == null ? "n/a" : `${Math.round(remotePending * 100)}%`}`,
    `Deterministic call rate: ${deterministicCallRate == null ? "n/a" : `${Math.round(deterministicCallRate * 100)}%`}`,
    `A.0.general rate: ${generalRate == null ? "n/a" : `${Math.round(generalRate * 100)}%`}`,
    `Binary parity comparable pairs: ${binaryParitySummary.comparable_pairs}`,
    `Binary winner mismatch: ${binaryParitySummary.winner_mismatch_rate == null ? "n/a" : `${Math.round(binaryParitySummary.winner_mismatch_rate * 100)}%`}`,
    `Binary median probability delta: ${binaryParitySummary.median_probability_delta == null ? "n/a" : `${Math.round(binaryParitySummary.median_probability_delta * 100)} pts`}`,
    "",
    `Recommendation: ${rolloutRecommendation.next_step}`,
  ];

  const reportId = `${reportType}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const reportPayload = {
    report_id: reportId,
    report_type: reportType,
    window_start: sinceDate.toISOString(),
    window_end: nowIso(),
    summary_markdown: summaryLines.join("\n"),
    overall_metrics: {
      runs_scanned: recentRuns.length,
      remote_error_rate: remoteErrors,
      remote_pending_rate: remotePending,
      deterministic_call_rate: deterministicCallRate,
      general_fallback_rate: generalRate,
      binary_parity: binaryParitySummary,
    },
    domain_summaries: domainSummaries.slice(0, 25),
    regressions: rolloutRecommendation.blockers,
    rollout_recommendation: rolloutRecommendation,
    status: "completed",
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection("evaluation_reports").doc(reportId).set(reportPayload, { merge: true });
  await db.collection("binary_parity_reports").doc(reportId).set(
    {
      report_id: reportId,
      report_type: reportType,
      window_start: sinceDate.toISOString(),
      window_end: nowIso(),
      summary: binaryParitySummary,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    mode: "report",
    timestamp: nowIso(),
    report_id: reportId,
    report: {
      ...reportPayload,
      updated_at: nowIso(),
    },
  };
}

async function runOfflineEvaluationMode(context, options = {}) {
  const mode = safeText(options.mode, safeText(process.env.CRYSTAL_CORE_EVAL_MODE, "resolution"));
  if (mode === "resolution") {
    return runResolutionSweep(context, options);
  }
  if (mode === "evaluation") {
    return runEvaluationSweep(context, options);
  }
  if (mode === "report") {
    return generateEvaluationReport(context, options);
  }
  throw new Error(`Unsupported evaluation mode: ${mode}`);
}

module.exports = {
  ACTIVE_CALIBRATION_MAX_AGE_DAYS,
  ACTIVE_CALIBRATION_SAMPLE_SIZE,
  buildResolutionTarget,
  buildBinaryParitySummary,
  applyCalibrationToScorecard,
  loadActiveCalibration,
  runResolutionSweep,
  runEvaluationSweep,
  generateEvaluationReport,
  runOfflineEvaluationMode,
};
