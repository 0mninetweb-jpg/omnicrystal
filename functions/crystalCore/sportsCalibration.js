const {
  fetchResolvedSportsFixtureOutcome,
  fetchResolvedSportsFixtureOutcomeByLabels,
} = require("../sportsData");

const SPORTS_DECISION_DOMAINS = new Set([
  "A.29.sports_performance_and_outcomes",
  "B.3.6.sports_outcomes_probability_mode",
]);
const SPORTS_CALIBRATION_ACTIVE_SAMPLE_SIZE = 30;

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clampProbability(value, fallback = null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1e-6, Math.min(1 - 1e-6, num));
}

function roundMaybe(value, digits = 4) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Number(num.toFixed(digits));
}

function toSerializable(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item) => toSerializable(item));
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nestedValue]) => [key, toSerializable(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== undefined)
  );
}

function nowIso() {
  return new Date().toISOString();
}

function currentRomeDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getRunCompletedDate(runDoc = {}) {
  const direct =
    runDoc?.completed_at?.toDate?.() ||
    (runDoc?.completed_at ? new Date(runDoc.completed_at) : null) ||
    runDoc?.updated_at?.toDate?.() ||
    (runDoc?.updated_at ? new Date(runDoc.updated_at) : null);
  return direct instanceof Date && !Number.isNaN(direct.getTime()) ? direct : null;
}

function getSportsGrounding(runDoc = {}) {
  return runDoc?.result_card?.sports_grounding || runDoc?.sports_grounding || {};
}

function getValidDate(value) {
  const date =
    value?.toDate?.() ||
    (value ? new Date(value) : null);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

function getSportsFixtureKickoffDate(runDoc = {}) {
  const sportsGrounding = getSportsGrounding(runDoc);
  return (
    getValidDate(sportsGrounding?.kickoff_utc) ||
    getValidDate(runDoc?.resolution_target?.event_date) ||
    getValidDate(runDoc?.query_plan?.event_date)
  );
}

function fixtureLikelyResolved(runDoc = {}, now = new Date()) {
  const kickoff = getSportsFixtureKickoffDate(runDoc);
  if (!kickoff) return false;
  return kickoff.getTime() <= now.getTime() - 6 * 60 * 60 * 1000;
}

function getSportsSides(runDoc = {}) {
  const sportsGrounding = getSportsGrounding(runDoc);
  return {
    sideA: safeText(
      sportsGrounding?.question_side_a,
      safeText(runDoc?.resolution_target?.question_side_a, safeText(runDoc?.query_plan?.question_side_a))
    ),
    sideB: safeText(
      sportsGrounding?.question_side_b,
      safeText(runDoc?.resolution_target?.question_side_b, safeText(runDoc?.query_plan?.question_side_b))
    ),
  };
}

function inferHorizonBucket(runDoc = {}) {
  const horizonId = safeText(runDoc?.query_plan?.horizons?.[0]?.horizon_id || runDoc?.query_plan?.horizon?.horizon_id);
  if (horizonId) return horizonId;
  const days = safeNumber(runDoc?.resolution_target?.resolution_window_days);
  if (!Number.isFinite(days)) return "unknown";
  if (days <= 7) return "7d";
  if (days <= 14) return "14d";
  if (days <= 30) return "30d";
  if (days <= 90) return "90d";
  if (days <= 180) return "6m";
  return "12m";
}

function isSportsDecisionDomain(domainId = "") {
  return SPORTS_DECISION_DOMAINS.has(safeText(domainId));
}

function normalizeSportsProbabilities(probabilities = null) {
  if (!probabilities || typeof probabilities !== "object") return null;
  const home = safeNumber(probabilities.home);
  const draw = safeNumber(probabilities.draw);
  const away = safeNumber(probabilities.away);
  if (![home, draw, away].every(Number.isFinite)) return null;
  const total = home + draw + away;
  if (!Number.isFinite(total) || total <= 0) return null;
  const normalized = {
    home: roundMaybe(home / total, 6),
    draw: roundMaybe(draw / total, 6),
    away: roundMaybe(away / total, 6),
    home_label: safeText(probabilities.home_label, "Home"),
    draw_label: safeText(probabilities.draw_label, "Draw"),
    away_label: safeText(probabilities.away_label, "Away"),
  };
  const favorite = [
    { key: "home", probability: normalized.home, label: normalized.home_label },
    { key: "draw", probability: normalized.draw, label: normalized.draw_label },
    { key: "away", probability: normalized.away, label: normalized.away_label },
  ].sort((left, right) => right.probability - left.probability)[0];
  normalized.favorite_key = favorite.key;
  normalized.favorite_label = favorite.label;
  normalized.favorite_probability = favorite.probability;
  return normalized;
}

function buildOutcomeVector(outcomeKey = "") {
  const normalized = safeText(outcomeKey).toLowerCase();
  return {
    home: normalized === "home" ? 1 : 0,
    draw: normalized === "draw" ? 1 : 0,
    away: normalized === "away" ? 1 : 0,
  };
}

function computeThreeWayBrierEntry(probabilities = null, outcomeKey = "") {
  if (!probabilities) return null;
  const actual = buildOutcomeVector(outcomeKey);
  const components = ["home", "draw", "away"].map((key) => (Number(probabilities[key]) - actual[key]) ** 2);
  return roundMaybe(components.reduce((sum, value) => sum + value, 0) / 3, 6);
}

function computeThreeWayLogLossEntry(probabilities = null, outcomeKey = "") {
  if (!probabilities) return null;
  const key = safeText(outcomeKey).toLowerCase();
  const probability = clampProbability(probabilities?.[key], null);
  if (probability == null) return null;
  return roundMaybe(-Math.log(probability), 6);
}

function averageMetric(values = []) {
  const filtered = values.map((value) => Number(value)).filter(Number.isFinite);
  if (!filtered.length) return null;
  return roundMaybe(filtered.reduce((sum, value) => sum + value, 0) / filtered.length, 6);
}

function buildSportsCalibrationArtifactMeta({ sampleSize = 0, operational = true, errorMessage = "" } = {}) {
  const normalizedSampleSize = Math.max(0, Number(sampleSize) || 0);
  if (!operational) {
    return {
      artifact_status: "unavailable",
      operational: false,
      statistically_mature: false,
      sample_floor: SPORTS_CALIBRATION_ACTIVE_SAMPLE_SIZE,
      status_reason: safeText(errorMessage, "Sports calibration job did not complete successfully."),
    };
  }

  return {
    artifact_status: normalizedSampleSize >= SPORTS_CALIBRATION_ACTIVE_SAMPLE_SIZE ? "active" : "warming_up",
    operational: true,
    statistically_mature: normalizedSampleSize >= SPORTS_CALIBRATION_ACTIVE_SAMPLE_SIZE,
    sample_floor: SPORTS_CALIBRATION_ACTIVE_SAMPLE_SIZE,
    status_reason:
      normalizedSampleSize >= SPORTS_CALIBRATION_ACTIVE_SAMPLE_SIZE
        ? "Calibration sample floor reached."
        : "Calibration artifact is operational, but it is still warming up toward the sample floor.",
  };
}

function buildFavoriteReliabilityBuckets(entries = [], bucketCount = 5) {
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    bucket_index: index,
    bucket_start: index / bucketCount,
    bucket_end: (index + 1) / bucketCount,
    sample_size: 0,
    avg_favorite_probability: 0,
    favorite_win_rate: 0,
  }));

  for (const entry of entries) {
    const probability = safeNumber(entry?.model_probabilities?.favorite_probability);
    if (!Number.isFinite(probability)) continue;
    const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor(probability * bucketCount)));
    const bucket = buckets[bucketIndex];
    bucket.sample_size += 1;
    bucket.avg_favorite_probability += probability;
    bucket.favorite_win_rate += safeText(entry?.actual_outcome_key) === safeText(entry?.model_favorite_key) ? 1 : 0;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    avg_favorite_probability:
      bucket.sample_size > 0 ? roundMaybe(bucket.avg_favorite_probability / bucket.sample_size, 4) : 0,
    favorite_win_rate: bucket.sample_size > 0 ? roundMaybe(bucket.favorite_win_rate / bucket.sample_size, 4) : 0,
  }));
}

function buildGroupedMetrics(entries = [], keyName = "league_name") {
  const groups = new Map();
  for (const entry of entries) {
    const key = safeText(entry?.[keyName], "unknown");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return Array.from(groups.entries())
    .map(([key, groupEntries]) => ({
      key,
      sample_size: groupEntries.length,
      brier_score: averageMetric(groupEntries.map((entry) => entry?.brier_score)),
      log_loss: averageMetric(groupEntries.map((entry) => entry?.log_loss)),
      no_bet_rate: roundMaybe(groupEntries.filter((entry) => safeText(entry?.decision_state) === "no_bet").length / groupEntries.length, 4),
    }))
    .sort((left, right) => right.sample_size - left.sample_size);
}

function buildSportsLedgerEntry({ runId = "", runDoc = {}, outcome = null }) {
  const card = runDoc?.result_card || {};
  const sportsGrounding = getSportsGrounding(runDoc);
  const modelProbabilities = normalizeSportsProbabilities(card?.sports_model_probabilities || sportsGrounding?.model_probabilities);
  const marketProbabilities = normalizeSportsProbabilities(card?.sports_market_probabilities || sportsGrounding?.market_probabilities);
  const decisionState = safeText(card?.sports_decision_state || card?.publication_basis?.sports_decision_state, "hold");
  const outcomeKey = safeText(outcome?.outcome_key).toLowerCase();
  const completedAt = getRunCompletedDate(runDoc) || getValidDate(outcome?.resolved_at);
  const ledgerId = `sports_${safeText(runId) || safeText(runDoc?.id) || safeText(sportsGrounding?.fixture_id)}`;
  return {
    ledger_id: ledgerId,
    run_id: safeText(runId, safeText(runDoc?.id)),
    domain_id: safeText(runDoc?.query_plan?.primary_domain_id || card?.domain),
    fixture_id: safeNumber(sportsGrounding?.fixture_id, safeNumber(outcome?.fixture_id)),
    fixture_label: safeText(sportsGrounding?.fixture_label, safeText(card?.title)),
    fixture_kickoff_utc:
      safeText(sportsGrounding?.kickoff_utc, safeText(runDoc?.resolution_target?.event_date, safeText(outcome?.resolved_at))) || null,
    league_name: safeText(outcome?.league_name, safeText(sportsGrounding?.league_name)),
    horizon_bucket: inferHorizonBucket(runDoc),
    completed_at: completedAt ? completedAt.toISOString() : null,
    market_source: safeText(card?.sports_market_source, safeText(sportsGrounding?.sports_market_source)) || null,
    market_source_class: safeText(card?.sports_market_source_class, safeText(sportsGrounding?.sports_market_source_class, "none")) || "none",
    sports_pick_state: safeText(card?.sports_pick_state, safeText(sportsGrounding?.sports_pick_state)) || null,
    decision_state: decisionState,
    no_bet_reason: safeText(card?.sports_no_bet_reason, safeText(card?.publication_basis?.sports_no_bet_reason)) || null,
    model_probabilities: modelProbabilities,
    market_probabilities: marketProbabilities,
    model_favorite_key: safeText(modelProbabilities?.favorite_key),
    model_favorite_label: safeText(modelProbabilities?.favorite_label),
    market_favorite_key: safeText(marketProbabilities?.favorite_key),
    market_favorite_label: safeText(marketProbabilities?.favorite_label),
    sports_edge_delta: toSerializable(card?.sports_edge_delta) || null,
    edge_delta_best: safeNumber(card?.sports_edge_delta?.best_delta),
    sports_fragility_score: safeNumber(card?.sports_fragility_score),
    sports_upset_rate: safeNumber(card?.sports_upset_rate),
    actual_outcome_key: outcomeKey || null,
    actual_home_goals: safeNumber(outcome?.home_goals),
    actual_away_goals: safeNumber(outcome?.away_goals),
    brier_score: computeThreeWayBrierEntry(modelProbabilities, outcomeKey),
    log_loss: computeThreeWayLogLossEntry(modelProbabilities, outcomeKey),
    created_at: nowIso(),
  };
}

async function listRecentSportsRuns(db, sinceDate, limit = 400, options = {}) {
  const scanLimit = Math.max(limit, Math.min(2500, Number(options.scanLimit) || limit * 6));
  let snapshot = null;
  try {
    snapshot = await db.collection("forecast_runs").orderBy("updated_at", "desc").limit(scanLimit).get();
  } catch (_error) {
    snapshot = await db.collection("forecast_runs").limit(scanLimit).get();
  }
  const now = new Date();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((runDoc) => {
      const completedAt = getRunCompletedDate(runDoc);
      const kickoff = getSportsFixtureKickoffDate(runDoc);
      const domainId = safeText(runDoc?.query_plan?.primary_domain_id || runDoc?.result_card?.domain);
      if (!isSportsDecisionDomain(domainId)) return false;
      const completedRecent = completedAt && !Number.isNaN(completedAt.getTime()) && completedAt >= sinceDate;
      const kickoffRecent = kickoff && !Number.isNaN(kickoff.getTime()) && kickoff >= sinceDate;
      return completedRecent || kickoffRecent;
    })
    .sort((left, right) => {
      const leftDate = getRunCompletedDate(left) || getSportsFixtureKickoffDate(left) || now;
      const rightDate = getRunCompletedDate(right) || getSportsFixtureKickoffDate(right) || now;
      return rightDate.getTime() - leftDate.getTime();
    })
    .slice(0, limit);
}

async function runSportsCalibrationSweep(context, options = {}) {
  const { db, admin, fetchJson } = context;
  const lookbackDays = Math.max(1, Number(options.lookbackDays) || 30);
  const backfillLookbackDays = Math.max(lookbackDays, Number(options.backfillLookbackDays) || 365);
  const limit = Math.max(1, Number(options.limit) || 400);
  const minLedgerCandidates = Math.max(6, Number(options.minLedgerCandidates) || 12);
  const sinceDate = addDays(new Date(), -lookbackDays);
  const backfillSinceDate = addDays(new Date(), -backfillLookbackDays);
  const recentRuns = await listRecentSportsRuns(db, sinceDate, limit, { scanLimit: Math.max(limit * 8, 1200) });
  let candidateRuns = recentRuns;
  const recentResolvedCandidates = recentRuns.filter((runDoc) => fixtureLikelyResolved(runDoc));
  if (candidateRuns.length < minLedgerCandidates || recentResolvedCandidates.length < minLedgerCandidates) {
    const historicalRuns = await listRecentSportsRuns(db, backfillSinceDate, Math.max(limit, minLedgerCandidates * 10), {
      scanLimit: Math.max(limit * 10, 2000),
    });
    const deduped = new Map();
    for (const runDoc of recentRuns.concat(historicalRuns)) {
      if (!runDoc?.id) continue;
      deduped.set(runDoc.id, runDoc);
    }
    candidateRuns = Array.from(deduped.values());
  }
  const stats = {
    mode: "sports_calibration_sweep",
    timestamp: nowIso(),
    scanned: candidateRuns.length,
    recent_scanned: recentRuns.length,
    ledger_written: 0,
    unresolved: 0,
    skipped: 0,
    pending_future_fixture: 0,
  };

  for (const runDoc of candidateRuns) {
    const card = runDoc?.result_card || {};
    const sportsGrounding = getSportsGrounding(runDoc);
    if (!fixtureLikelyResolved(runDoc)) {
      stats.pending_future_fixture += 1;
      continue;
    }
    const fixtureId = safeNumber(sportsGrounding?.fixture_id);
    let outcome = null;
    if (fixtureId) {
      outcome = await fetchResolvedSportsFixtureOutcome(
        fetchJson,
        fixtureId,
        safeText(sportsGrounding?.provider_source_id, "thesportsdb_public")
      );
    } else {
      const { sideA, sideB } = getSportsSides(runDoc);
      if (sideA && sideB) {
        const anchorDate =
          safeText(sportsGrounding?.kickoff_utc) ||
          safeText(runDoc?.resolution_target?.event_date) ||
          safeText(getRunCompletedDate(runDoc)?.toISOString());
        outcome = await fetchResolvedSportsFixtureOutcomeByLabels(fetchJson, sideA, sideB, anchorDate);
      }
    }
    if (!fixtureId && !outcome) {
      stats.skipped += 1;
      continue;
    }
    if (!outcome) {
      stats.unresolved += 1;
      continue;
    }
    const ledgerEntry = buildSportsLedgerEntry({
      runId: runDoc.id,
      runDoc,
      outcome,
    });
    await db.collection("sports_decision_ledger").doc(ledgerEntry.ledger_id).set(
      {
        ...toSerializable(ledgerEntry),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    stats.ledger_written += 1;
  }

  return stats;
}

async function loadSportsLedgerEntries(db, sinceDate, limit = 500) {
  let snapshot = null;
  try {
    snapshot = await db.collection("sports_decision_ledger").orderBy("updated_at", "desc").limit(limit).get();
  } catch (_error) {
    snapshot = await db.collection("sports_decision_ledger").limit(limit).get();
  }
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((entry) => {
      const createdAt = entry?.updated_at?.toDate?.() || (entry?.updated_at ? new Date(entry.updated_at) : null);
      const fallbackDate = entry?.completed_at ? new Date(entry.completed_at) : null;
      const reference = createdAt || fallbackDate;
      return reference && !Number.isNaN(reference.getTime()) && reference >= sinceDate;
    });
}

function buildSportsCalibrationSummary(entries = [], options = {}) {
  const sampleSize = entries.length;
  const confusionCount = entries.filter(
    (entry) => safeText(entry?.decision_state) === "edge" && (safeText(entry?.market_source_class) !== "sharp" || Number(entry?.edge_delta_best || 0) < 0.05)
  ).length;
  const upsetEntries = entries.filter(
    (entry) => safeText(entry?.actual_outcome_key) && safeText(entry?.actual_outcome_key) !== safeText(entry?.model_favorite_key)
  );
  const upsetHits = upsetEntries.filter(
    (entry) =>
      Number(entry?.sports_upset_rate || 0) >= 0.3 ||
      ["no_bet", "lean", "grounded_lean", "hold"].includes(safeText(entry?.decision_state))
  ).length;

  return {
    sample_size: sampleSize,
    brier_score: averageMetric(entries.map((entry) => entry?.brier_score)),
    log_loss: averageMetric(entries.map((entry) => entry?.log_loss)),
    favorite_vs_edge_confusion_rate: sampleSize > 0 ? roundMaybe(confusionCount / sampleSize, 4) : null,
    no_bet_rate:
      sampleSize > 0
        ? roundMaybe(entries.filter((entry) => safeText(entry?.decision_state) === "no_bet").length / sampleSize, 4)
        : null,
    upset_recall: upsetEntries.length > 0 ? roundMaybe(upsetHits / upsetEntries.length, 4) : null,
    favorite_reliability_buckets: buildFavoriteReliabilityBuckets(entries),
    by_league: buildGroupedMetrics(entries, "league_name"),
    by_horizon: buildGroupedMetrics(entries, "horizon_bucket"),
    ...buildSportsCalibrationArtifactMeta({
      sampleSize,
      operational: options.operational !== false,
      errorMessage: options.errorMessage,
    }),
  };
}

async function persistSportsCalibrationReport(db, admin, report = {}, options = {}) {
  if (!db) return null;
  const outputDate = safeText(options.outputDate, currentRomeDate());
  const reportId = `sports_${outputDate}`;
  const artifactMeta = buildSportsCalibrationArtifactMeta({
    sampleSize: report?.summary?.sample_size,
    operational: report?.summary?.operational !== false,
    errorMessage: report?.summary?.status_reason,
  });
  const artifact = {
    artifact_type: "sports_calibration",
    artifact_status: artifactMeta.artifact_status,
    operational: artifactMeta.operational,
    statistically_mature: artifactMeta.statistically_mature,
    generated_at: safeText(report?.generated_at, nowIso()),
    output_date: outputDate,
    lookback_days: Math.max(1, Number(report?.lookback_days) || Number(options.lookbackDays) || 30),
    backfill_lookback_days: Math.max(
      Math.max(1, Number(report?.lookback_days) || Number(options.lookbackDays) || 30),
      Number(report?.backfill_lookback_days || options.backfillLookbackDays) || 365
    ),
    summary: toSerializable({
      ...(report?.summary || {}),
      ...artifactMeta,
    }),
    favorite_reliability_buckets: toSerializable(report?.summary?.favorite_reliability_buckets || []),
    by_league: toSerializable(report?.summary?.by_league || []),
    by_horizon: toSerializable(report?.summary?.by_horizon || []),
    sweep: toSerializable(report?.sweep || null),
    source: "crystal-core-eval",
  };
  await db.collection("calibration_reports").doc(reportId).set(
    {
      ...artifact,
      updated_at: admin?.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : nowIso(),
    },
    { merge: true }
  );
  return artifact;
}

async function generateSportsCalibrationReport(context, options = {}) {
  const { db, admin } = context;
  const lookbackDays = Math.max(1, Number(options.lookbackDays) || 30);
  const backfillLookbackDays = Math.max(lookbackDays, Number(options.backfillLookbackDays) || 365);
  let sweepStats = null;
  if (options.runSweep !== false) {
    sweepStats = await runSportsCalibrationSweep(context, {
      ...options,
      lookbackDays,
      backfillLookbackDays,
    });
  }
  const sinceDate = addDays(new Date(), -lookbackDays);
  const entries = await loadSportsLedgerEntries(db, sinceDate, Math.max(50, Number(options.limit) || 500));
  const report = {
    generated_at: nowIso(),
    lookback_days: lookbackDays,
    backfill_lookback_days: backfillLookbackDays,
    sweep: sweepStats,
    summary: buildSportsCalibrationSummary(entries),
    ledger_entries: entries.map((entry) => toSerializable(entry)),
  };
  if (options.persistArtifact !== false) {
    const artifact = await persistSportsCalibrationReport(db, admin, report, options);
    report.firestore_artifact = artifact;
  }
  return report;
}

module.exports = {
  SPORTS_DECISION_DOMAINS,
  buildSportsCalibrationSummary,
  buildSportsCalibrationArtifactMeta,
  buildSportsLedgerEntry,
  currentRomeDate,
  generateSportsCalibrationReport,
  isSportsDecisionDomain,
  persistSportsCalibrationReport,
  runSportsCalibrationSweep,
  SPORTS_CALIBRATION_ACTIVE_SAMPLE_SIZE,
};
