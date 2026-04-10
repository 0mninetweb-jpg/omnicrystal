import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_APPWRITE_ENDPOINT,
  DEFAULT_APPWRITE_PROJECT_ID,
  DEFAULT_APPWRITE_SITE_URL,
  appwriteJson,
  createAppwriteUser,
  createEmailSession,
  createJwtWithCookie,
  deleteAppwriteUser,
  deleteCurrentSession,
  ensureDirectory,
  executeFunction,
  getAccountWithCookie,
  median,
  resolveProjectKey,
  sleep,
} from './lib/appwrite-admin.mjs';

const argv = process.argv.slice(2);

function readOption(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function readFlag(name) {
  return argv.includes(`--${name}`);
}

const repoRoot = path.resolve('.');
const endpoint = (readOption('endpoint', process.env.APPWRITE_ENDPOINT || DEFAULT_APPWRITE_ENDPOINT) || DEFAULT_APPWRITE_ENDPOINT).replace(/\/$/, '');
const projectId = readOption('project', process.env.APPWRITE_PROJECT_ID || DEFAULT_APPWRITE_PROJECT_ID) || DEFAULT_APPWRITE_PROJECT_ID;
const functionId = readOption('function', 'api') || 'api';
const legacyApiBase = (readOption('legacy-base', process.env.LEGACY_CRYSTAL_API_BASE || 'https://api-paaqyfwena-ew.a.run.app') || '').replace(/\/$/, '');
const fixturesPath = path.resolve(repoRoot, readOption('fixtures', 'scripts/fixtures/parity-benchmark-cases.json'));
const outputJsonPath = path.resolve(repoRoot, readOption('output-json', 'docs/parity-report-appwrite-latest.json'));
const outputMarkdownPath = path.resolve(repoRoot, readOption('output-md', 'docs/parity-report-appwrite-latest.md'));
const frozenBaselinePath = path.resolve(repoRoot, readOption('frozen-baseline', 'docs/golden-parity-baseline.json'));
const siteUrlOption = (readOption('site-url', process.env.CRYSTAL_SITE_URL || '') || '').replace(/\/$/, '');
const siteId = readOption('site', 'crystal-web') || 'crystal-web';
const siteDeploymentId = readOption('deployment', '');
const gateRuns = Math.max(1, Number(readOption('runs', '3')) || 3);
const strictMode = !readFlag('allow-soft-fail');
const baselineMode = safeText(readOption('baseline-mode', process.env.CRYSTAL_PARITY_BASELINE_MODE || 'auto'), 'auto').toLowerCase();

let siteUrl = siteUrlOption;

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeBaselineMode(value) {
  return ['auto', 'live', 'frozen'].includes(value) ? value : 'auto';
}

function readJson(filePath) {
  return fs.readFile(filePath, 'utf8').then((text) => JSON.parse(text));
}

async function loadFrozenBaseline(filePath) {
  try {
    const payload = await readJson(filePath);
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    return {
      ok: rows.length > 0,
      path: filePath,
      rowsById: new Map(rows.map((row) => [safeText(row.query_id), row])),
      metadata: payload?.metadata || {},
    };
  } catch (_error) {
    return {
      ok: false,
      path: filePath,
      rowsById: new Map(),
      metadata: {},
    };
  }
}

function summarizeBaselineUsage(rows, requestedMode, frozenBaseline) {
  const normalizedRequestedMode = normalizeBaselineMode(requestedMode);
  const frozenRowCount = rows.filter((row) => row.baseline_source === 'frozen').length;
  const liveRowCount = rows.filter((row) => row.baseline_source === 'live').length;
  const effectiveMode =
    frozenRowCount > 0 && liveRowCount === 0
      ? 'frozen'
      : liveRowCount > 0 && frozenRowCount === 0
        ? 'live'
        : frozenRowCount > 0 && liveRowCount > 0
          ? 'mixed'
          : normalizedRequestedMode;

  return {
    requested_mode: normalizedRequestedMode,
    effective_mode: effectiveMode,
    frozen_available: Boolean(frozenBaseline?.ok),
    frozen_path: frozenBaseline?.path || frozenBaselinePath,
    frozen_metadata: frozenBaseline?.metadata || {},
    live_rows: liveRowCount,
    frozen_rows: frozenRowCount,
  };
}

async function legacyJson(route, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${legacyApiBase}${route}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `Legacy request ${route} failed with ${response.status}.`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function resolveActiveSiteDeploymentId({ adminKey }) {
  const site = await appwriteJson(`/sites/${siteId}`, {
    endpoint,
    projectId,
    key: adminKey,
  });
  return site?.deploymentId || site?.latestDeploymentId || '';
}

async function resolveDeploymentDomain({ adminKey, deploymentId }) {
  const payload = await appwriteJson('/proxy/rules', {
    endpoint,
    projectId,
    key: adminKey,
  });
  const rules = Array.isArray(payload?.rules) ? payload.rules : [];
  const rule = rules.find(
    (entry) =>
      entry.deploymentResourceType === 'site' &&
      entry.deploymentResourceId === siteId &&
      (!deploymentId || entry.deploymentId === deploymentId) &&
      entry.status === 'verified'
  );
  return rule?.domain ? `https://${rule.domain}` : '';
}

async function resolveSiteUrl(adminKey) {
  if (siteUrl) return siteUrl;
  const activeDeploymentId = siteDeploymentId || (await resolveActiveSiteDeploymentId({ adminKey }));
  siteUrl = (await resolveDeploymentDomain({ adminKey, deploymentId: activeDeploymentId })) || DEFAULT_APPWRITE_SITE_URL;
  return siteUrl;
}

async function appwriteApi(route, { method = 'GET', body, headers = {}, key, timeoutMs = 120000 } = {}) {
  const result = await executeFunction({
    functionId,
    routePath: route,
    httpMethod: method,
    body,
    headers,
    endpoint,
    projectId,
    key,
    timeoutMs,
  });
  if (result.statusCode >= 400) {
    const message =
      typeof result.payload === 'string'
        ? result.payload
        : result.payload?.message || result.payload?.error || `Appwrite route ${route} returned ${result.statusCode}`;
    const error = new Error(message);
    error.status = result.statusCode;
    error.execution = result.execution;
    error.payload = result.payload;
    throw error;
  }
  return result.payload;
}

function applyFrozenBaseline(row, baselineRow) {
  if (!baselineRow) return row;
  const legacyOperational = Boolean(baselineRow.operational);
  const isA29 = row.query_id === 'sports_a29_probe';
  const isB36 = row.query_id === 'sports_b36_probe';
  return {
    ...row,
    legacy_status: safeText(baselineRow.status, 'completed'),
    legacy_transport: safeText(baselineRow.transport),
    legacy_winner: safeText(baselineRow.winner),
    legacy_band: safeText(baselineRow.band),
    legacy_probability: Number.isFinite(Number(baselineRow.probability)) ? Number(baselineRow.probability) : null,
    legacy_card_state: safeText(baselineRow.card_state),
    legacy_pick_state: safeText(baselineRow.pick_state),
    legacy_fixture_window_state: safeText(baselineRow.fixture_window_state),
    legacy_sportsbook_readiness_state: safeText(baselineRow.sportsbook_readiness_state),
    legacy_sports_ready: Boolean(baselineRow.sports_ready),
    legacy_sports_grounded: Boolean(baselineRow.sports_grounded),
    legacy_sports_semantic_ready: Boolean(baselineRow.sports_semantic_ready),
    legacy_publish_gate_ready: Boolean(baselineRow.publish_gate_ready),
    legacy_provider_configured: Boolean(baselineRow.provider_configured),
    legacy_fixture_resolved: Boolean(baselineRow.fixture_resolved),
    legacy_reason: safeText(baselineRow.reason),
    legacy_overlay_blocker_reason: safeText(baselineRow.overlay_blocker_reason),
    legacy_side_a: safeText(baselineRow.side_a),
    legacy_side_b: safeText(baselineRow.side_b),
    legacy_fixture_window_open: Boolean(baselineRow.fixture_window_open),
    legacy_operational: legacyOperational,
    a29_operational: isA29 ? row.appwrite_operational && legacyOperational : row.a29_operational,
    b36_operational: isB36 ? row.appwrite_operational && legacyOperational : row.b36_operational,
    baseline_source: 'frozen',
  };
}

function getQueryPlan(response) {
  if (!response) return null;
  return response.query_plan || response.queryPlan || response;
}

function getBinaryContract(card) {
  return card?.binary_contract || null;
}

function getBinaryWinner(card) {
  return safeText(getBinaryContract(card)?.winning_side);
}

function getBinaryBand(card) {
  return safeText(getBinaryContract(card)?.band);
}

function getBinaryProbability(card) {
  const value = getBinaryContract(card)?.winning_probability;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getSportsGrounding(card) {
  return card?.sports_grounding || null;
}

function getPublicationBasis(card) {
  return card?.publication_basis || null;
}

function getSportsSemanticOverlay(card) {
  return card?.sports_semantic_overlay || null;
}

function getSportsMarketOverlay(card) {
  return card?.sports_market_overlay || null;
}

function getSportsGrounded(card) {
  const grounding = getSportsGrounding(card);
  const publicationBasis = getPublicationBasis(card);
  if (card?.sports_grounded) return true;
  if (grounding?.sports_grounded) return true;
  if (publicationBasis?.sports_grounded) return true;
  return Boolean(grounding?.provider_configured && grounding?.fixture_resolved);
}

function getSportsParityReady(card) {
  const grounding = getSportsGrounding(card);
  return Boolean(
    grounding?.provider_required &&
      grounding?.provider_configured &&
      grounding?.fixture_resolved &&
      grounding?.parity_ready
  );
}

function getSportsSemanticReady(card) {
  return Boolean(card?.sports_semantic_ready || getSportsSemanticOverlay(card)?.ready);
}

function getSportsPublishGateReady(card) {
  if (typeof card?.sports_publish_gate_ready === 'boolean') return card.sports_publish_gate_ready;
  return Boolean(getSportsGrounding(card)?.publish_gate_ready);
}

function getSportsGroundingFlag(card, name) {
  return Boolean(getSportsGrounding(card)?.[name]);
}

function getSportsGroundingReason(card) {
  return safeText(getSportsGrounding(card)?.reason);
}

function getSportsOverlayBlockerReason(card) {
  return (
    safeText(card?.sports_overlay_blocker_reason) ||
    safeText(getPublicationBasis(card)?.sports_overlay_blocker_reason) ||
    safeText(getSportsGrounding(card)?.overlay_blocker_reason) ||
    safeText(getSportsSemanticOverlay(card)?.blocker_reason)
  );
}

function getSportsbookReadinessState(card) {
  return (
    safeText(card?.sportsbook_readiness_state) ||
    safeText(getPublicationBasis(card)?.sportsbook_readiness_state) ||
    safeText(getSportsGrounding(card)?.sportsbook_readiness_state) ||
    safeText(getSportsMarketOverlay(card)?.sportsbook_readiness_state)
  );
}

function getCardState(card) {
  return safeText(card?.card_state);
}

function getSportsPickState(card) {
  const direct =
    safeText(card?.sports_pick_state) ||
    safeText(getSportsGrounding(card)?.sports_pick_state) ||
    safeText(getPublicationBasis(card)?.sports_pick_state);
  if (direct) return direct;
  return getSportsGrounded(card) ? 'grounded_lean' : 'hold';
}

function getFixtureWindowState(card) {
  const direct =
    safeText(card?.fixture_window_state) ||
    safeText(getSportsGrounding(card)?.fixture_window_state) ||
    safeText(getPublicationBasis(card)?.fixture_window_state) ||
    safeText(getSportsSemanticOverlay(card)?.fixture_window_state);
  if (direct) return direct;
  return getSportsGrounded(card) ? 'resolved' : 'unresolved';
}

function getFixtureWindowOpen(card) {
  return Boolean(
    card?.fixture_window_open ||
      getSportsGrounding(card)?.fixture_window_open ||
      getPublicationBasis(card)?.fixture_window_open ||
      getSportsSemanticOverlay(card)?.fixture_window_open
  );
}

function getSportsSideA(card) {
  return safeText(getSportsGrounding(card)?.question_side_a || getBinaryContract(card)?.question_side_a);
}

function getSportsSideB(card) {
  return safeText(getSportsGrounding(card)?.question_side_b || getBinaryContract(card)?.question_side_b);
}

function testBinaryContractPresent(card) {
  const contract = getBinaryContract(card);
  return Boolean(
    contract &&
      safeText(contract.question_side_a) &&
      safeText(contract.question_side_b) &&
      safeText(contract.winning_side)
  );
}

function testSportsOperationalCard(card, mode = 'forecast') {
  if (!getSportsParityReady(card)) return false;
  if (!testBinaryContractPresent(card)) return false;
  const cardState = getCardState(card);
  if (!['limited', 'published'].includes(cardState)) return false;
  const pickState = getSportsPickState(card);
  if (!['grounded_lean', 'publishable_controlled', 'publishable_full'].includes(pickState)) return false;
  if (mode === 'probability') {
    return ['probability_mode_preview', 'probability_mode_live'].includes(getSportsbookReadinessState(card));
  }
  return true;
}

function buildFailure(message, extra = {}) {
  return {
    ok: false,
    message,
    blockers: [message],
    ...extra,
  };
}

async function fetchSiteSmoke() {
  const targetUrl = siteUrl || DEFAULT_APPWRITE_SITE_URL;
  const response = await fetch(targetUrl, { redirect: 'follow' });
  const html = await response.text();
  return {
    ok: response.ok && /crystal/i.test(html),
    status: response.status,
    url: targetUrl,
  };
}

async function collectHealth(adminKey) {
  const payload = await appwriteApi('/health', { key: adminKey, timeoutMs: 120000 });
  return {
    ok: Boolean(payload?.ok && payload?.runtime?.available),
    payload,
  };
}

async function pollForecastCard(initialCard, adminKey, timeoutMs = 180000) {
  const pendingRun = initialCard?.pending_run || null;
  const runId = safeText(pendingRun?.run_id);
  if (!runId) {
    return initialCard;
  }
  const visibility = safeText(pendingRun?.visibility, 'public');
  const accessToken = safeText(pendingRun?.access_token);
  const route =
    visibility === 'public'
      ? `/public/forecast-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(accessToken)}`
      : `/forecast-runs/${encodeURIComponent(runId)}`;

  const startedAt = Date.now();
  let pollAfterMs = Math.max(750, Number(pendingRun?.poll_after_ms) || 2500);

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollAfterMs);
    const response = await appwriteApi(route, {
      method: 'GET',
      key: adminKey,
      timeoutMs: 120000,
    });
    const run = response?.run || null;
    const card = response?.card || null;

    if (card && (!card.pending_run || safeText(card.pending_run.status) !== 'running')) {
      return card;
    }
    if (safeText(run?.status) === 'failed' || safeText(run?.status) === 'canceled') {
      throw new Error(safeText(run?.error_message, `Forecast run ${runId} ${run?.status}.`));
    }
    if (card?.pending_run?.status === 'running') {
      pollAfterMs = Math.min(Math.max(750, Number(card.pending_run.poll_after_ms) || pollAfterMs), 10000);
      continue;
    }
    pollAfterMs = Math.min(Math.max(750, Number(run?.pending_poll_after_ms) || pollAfterMs), 10000);
  }

  throw new Error(`Timed out waiting for forecast run ${runId}.`);
}

async function compareQuery(queryId, query, expectsBinary, adminKey, options = {}) {
  const normalizedBaselineMode = normalizeBaselineMode(options.baselineMode);
  const frozenBaselineRow = options?.frozenBaseline?.rowsById?.get(queryId) || null;
  const appwriteGuestKey = `parity-appwrite-${crypto.randomUUID().slice(0, 8)}`;
  const legacyGuestKey = `parity-legacy-${crypto.randomUUID().slice(0, 8)}`;
  let appwriteCompile = null;
  let legacyCompile = null;
  let appwriteCard = null;
  let legacyCard = null;
  const failures = [];

  try {
    appwriteCompile = await appwriteApi('/public/compile-query', {
      method: 'POST',
      body: { query },
      key: adminKey,
      timeoutMs: 120000,
    });
  } catch (error) {
    failures.push(`appwrite compile failed: ${error.message}`);
  }

  if (normalizedBaselineMode !== 'frozen') {
    try {
      legacyCompile = await legacyJson('/public/compile-query', {
        method: 'POST',
        body: { query },
      });
    } catch (error) {
      failures.push(`legacy compile failed: ${error.message}`);
    }
  }

  if (appwriteCompile) {
    try {
      appwriteCard = await appwriteApi('/public/predict', {
        method: 'POST',
        body: {
          query,
          queryPlan: getQueryPlan(appwriteCompile),
        },
        headers: {
          'x-crystal-guest-key': appwriteGuestKey,
        },
        key: adminKey,
        timeoutMs: 180000,
      });
      if (appwriteCard?.pending_run?.run_id) {
        appwriteCard = await pollForecastCard(appwriteCard, adminKey, 180000);
      }
    } catch (error) {
      failures.push(`appwrite predict failed: ${error.message}`);
    }
  }

  if (legacyCompile) {
    try {
      legacyCard = await legacyJson('/public/predict', {
        method: 'POST',
        headers: {
          'X-Crystal-Guest-Key': legacyGuestKey,
        },
        body: {
          query,
          queryPlan: getQueryPlan(legacyCompile),
        },
      });
    } catch (error) {
      failures.push(`legacy predict failed: ${error.message}`);
    }
  }

  const usingFrozenBaseline = Boolean(frozenBaselineRow && (!legacyCard || normalizedBaselineMode === 'frozen'));
  const legacyProbabilityValue = usingFrozenBaseline ? Number(frozenBaselineRow?.probability) : getBinaryProbability(legacyCard);
  const probabilityDelta =
    appwriteCard && Number.isFinite(getBinaryProbability(appwriteCard)) && Number.isFinite(legacyProbabilityValue)
      ? Number(Math.abs(getBinaryProbability(appwriteCard) - legacyProbabilityValue).toFixed(4))
      : null;

  const sportsProbe = ['sports_a29_probe', 'sports_b36_probe', 'sports_hold_regression'].includes(queryId);
  const a29Probe = queryId === 'sports_a29_probe';
  const b36Probe = queryId === 'sports_b36_probe';
  const appwriteOperational =
    a29Probe && appwriteCard
      ? testSportsOperationalCard(appwriteCard, 'forecast')
      : b36Probe && appwriteCard
        ? testSportsOperationalCard(appwriteCard, 'probability')
        : false;
  const legacyOperational =
    a29Probe && legacyCard
      ? testSportsOperationalCard(legacyCard, 'forecast')
      : b36Probe && legacyCard
        ? testSportsOperationalCard(legacyCard, 'probability')
        : false;

  const row = {
    query_id: queryId,
    query,
    expects_binary: Boolean(expectsBinary),
    appwrite_status: appwriteCard ? 'completed' : 'failed',
    legacy_status: legacyCard ? 'completed' : 'failed',
    appwrite_transport: safeText(appwriteCard?.runtime_transport),
    legacy_transport: safeText(legacyCard?.runtime_transport),
    appwrite_winner: getBinaryWinner(appwriteCard),
    legacy_winner: getBinaryWinner(legacyCard),
    appwrite_band: getBinaryBand(appwriteCard),
    legacy_band: getBinaryBand(legacyCard),
    appwrite_probability: getBinaryProbability(appwriteCard),
    legacy_probability: getBinaryProbability(legacyCard),
    probability_delta: probabilityDelta,
    appwrite_card_state: getCardState(appwriteCard),
    legacy_card_state: getCardState(legacyCard),
    appwrite_pick_state: getSportsPickState(appwriteCard),
    legacy_pick_state: getSportsPickState(legacyCard),
    appwrite_fixture_window_state: getFixtureWindowState(appwriteCard),
    legacy_fixture_window_state: getFixtureWindowState(legacyCard),
    appwrite_sportsbook_readiness_state: getSportsbookReadinessState(appwriteCard),
    legacy_sportsbook_readiness_state: getSportsbookReadinessState(legacyCard),
    appwrite_sports_ready: sportsProbe ? getSportsParityReady(appwriteCard) : false,
    legacy_sports_ready: sportsProbe ? getSportsParityReady(legacyCard) : false,
    appwrite_sports_grounded: sportsProbe ? getSportsGrounded(appwriteCard) : false,
    legacy_sports_grounded: sportsProbe ? getSportsGrounded(legacyCard) : false,
    appwrite_sports_semantic_ready: sportsProbe ? getSportsSemanticReady(appwriteCard) : false,
    legacy_sports_semantic_ready: sportsProbe ? getSportsSemanticReady(legacyCard) : false,
    appwrite_publish_gate_ready: sportsProbe ? getSportsPublishGateReady(appwriteCard) : false,
    legacy_publish_gate_ready: sportsProbe ? getSportsPublishGateReady(legacyCard) : false,
    appwrite_provider_configured: sportsProbe ? getSportsGroundingFlag(appwriteCard, 'provider_configured') : false,
    legacy_provider_configured: sportsProbe ? getSportsGroundingFlag(legacyCard, 'provider_configured') : false,
    appwrite_fixture_resolved: sportsProbe ? getSportsGroundingFlag(appwriteCard, 'fixture_resolved') : false,
    legacy_fixture_resolved: sportsProbe ? getSportsGroundingFlag(legacyCard, 'fixture_resolved') : false,
    appwrite_reason: sportsProbe ? getSportsGroundingReason(appwriteCard) : '',
    legacy_reason: sportsProbe ? getSportsGroundingReason(legacyCard) : '',
    appwrite_overlay_blocker_reason: sportsProbe ? getSportsOverlayBlockerReason(appwriteCard) : '',
    legacy_overlay_blocker_reason: sportsProbe ? getSportsOverlayBlockerReason(legacyCard) : '',
    appwrite_side_a: sportsProbe ? getSportsSideA(appwriteCard) : '',
    legacy_side_a: sportsProbe ? getSportsSideA(legacyCard) : '',
    appwrite_side_b: sportsProbe ? getSportsSideB(appwriteCard) : '',
    legacy_side_b: sportsProbe ? getSportsSideB(legacyCard) : '',
    appwrite_fixture_window_open: sportsProbe ? getFixtureWindowOpen(appwriteCard) : false,
    legacy_fixture_window_open: sportsProbe ? getFixtureWindowOpen(legacyCard) : false,
    appwrite_operational: appwriteOperational,
    legacy_operational: legacyOperational,
    a29_operational: a29Probe ? appwriteOperational && legacyOperational : false,
    b36_operational: b36Probe ? appwriteOperational && legacyOperational : false,
    baseline_source: legacyCard ? 'live' : '',
    failures,
  };

  if (usingFrozenBaseline) {
    return applyFrozenBaseline(
      {
        ...row,
        failures: failures.filter((entry) => !entry.startsWith('legacy ')),
      },
      frozenBaselineRow
    );
  }

  return row;
}

function summarizeForecastRun(rows) {
  const binaryRows = rows.filter((row) => row.expects_binary);
  const comparableBinaryRows = binaryRows.filter(
    (row) =>
      row.appwrite_status === 'completed' &&
      row.legacy_status === 'completed' &&
      row.appwrite_winner &&
      row.legacy_winner
  );
  const binaryWinnerMismatches = comparableBinaryRows.filter((row) => row.appwrite_winner !== row.legacy_winner).length;
  const missingBinaryContracts = binaryRows.filter((row) => !row.appwrite_winner || !row.legacy_winner).length;
  const probabilityDeltas = comparableBinaryRows
    .map((row) => row.probability_delta)
    .filter((value) => Number.isFinite(value));
  const medianProbabilityDelta = median(probabilityDeltas);
  const appwriteFailures = rows.filter((row) => row.appwrite_status !== 'completed').length;
  const legacyFailures = rows.filter((row) => row.legacy_status !== 'completed').length;
  const legacyAvailable = legacyFailures < rows.length;

  const a29 = rows.find((row) => row.query_id === 'sports_a29_probe');
  const b36 = rows.find((row) => row.query_id === 'sports_b36_probe');
  const stateRegressions = rows
    .filter((row) => ['sports_a29_probe', 'sports_b36_probe'].includes(row.query_id))
    .flatMap((row) => {
      const issues = [];
      if (row.appwrite_card_state !== row.legacy_card_state) issues.push(`${row.query_id}: card_state mismatch`);
      if (row.appwrite_pick_state !== row.legacy_pick_state) issues.push(`${row.query_id}: sports_pick_state mismatch`);
      if (row.appwrite_fixture_window_state !== row.legacy_fixture_window_state) issues.push(`${row.query_id}: fixture_window_state mismatch`);
      if (row.appwrite_sportsbook_readiness_state !== row.legacy_sportsbook_readiness_state) {
        issues.push(`${row.query_id}: sportsbook_readiness_state mismatch`);
      }
      return issues;
    });

  const blockers = [];
  if (appwriteFailures !== 0) blockers.push('appwrite forecast failure');
  if (!legacyAvailable) {
    blockers.push('legacy baseline unavailable');
  } else {
    if (comparableBinaryRows.length === 0) blockers.push('binary parity unavailable');
    if ((comparableBinaryRows.length > 0 ? Number((binaryWinnerMismatches / comparableBinaryRows.length).toFixed(4)) : 1) !== 0) {
      blockers.push('binary winner mismatch');
    }
    if ((binaryRows.length > 0 ? Number((missingBinaryContracts / binaryRows.length).toFixed(4)) : 1) !== 0) {
      blockers.push('missing binary contract');
    }
    if (!a29?.a29_operational) blockers.push('A.29 sports probe not green');
    if (!b36?.b36_operational) blockers.push('B.3.6 sports probe not green');
    if (stateRegressions.length) blockers.push('sports state regression');
    if (medianProbabilityDelta === null || medianProbabilityDelta > 0.03) blockers.push('median probability delta above 0.03');
  }

  return {
    comparable_binary_count: comparableBinaryRows.length,
    binary_winner_mismatch_count: binaryWinnerMismatches,
    binary_winner_mismatch_rate: comparableBinaryRows.length > 0 ? Number((binaryWinnerMismatches / comparableBinaryRows.length).toFixed(4)) : null,
    missing_binary_contract_count: missingBinaryContracts,
    missing_binary_contract_rate: binaryRows.length > 0 ? Number((missingBinaryContracts / binaryRows.length).toFixed(4)) : null,
    median_probability_delta: medianProbabilityDelta,
    appwrite_failure_count: appwriteFailures,
    legacy_failure_count: legacyFailures,
    legacy_baseline_available: legacyAvailable,
    appwrite_a29_ready: Boolean(a29?.appwrite_operational),
    appwrite_b36_ready: Boolean(b36?.appwrite_operational),
    a29_ready: Boolean(a29?.a29_operational),
    b36_ready: Boolean(b36?.b36_operational),
    state_regressions: stateRegressions,
    ok: blockers.length === 0,
    blockers,
  };
}

async function pollWorldSimResult(kind, jobId, jwt, adminKey, timeoutMs = 180000) {
  const routePrefix = kind === 'matrix' ? '/worldsim/interventions' : '/worldsim/jobs';
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const payload = await appwriteApi(`${routePrefix}/${encodeURIComponent(jobId)}/result`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      key: adminKey,
      timeoutMs: 180000,
    });
    const job = payload?.job || null;
    const completed = job?.status === 'completed' && (payload?.digest || payload?.matrix || payload?.card || payload?.section);
    if (completed) {
      return payload;
    }
    if (job?.status === 'failed' || job?.status === 'canceled') {
      throw new Error(`${kind} WorldSim job ${jobId} ended with status "${job.status}".`);
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for ${kind} WorldSim job ${jobId}.`);
}

async function runWorldSimLifecycle(adminKey) {
  const tempUserId = `parity_${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
  const tempEmail = `${tempUserId}@crystal.local`;
  const tempPassword = `Parity!${crypto.randomUUID()}A9`;

  let auth = null;
  let account = null;

  await createAppwriteUser({
    userId: tempUserId,
    email: tempEmail,
    password: tempPassword,
    name: 'Crystal Parity Gate',
    endpoint,
    projectId,
    key: adminKey,
  });

  try {
    auth = await createEmailSession({
      email: tempEmail,
      password: tempPassword,
      endpoint,
      projectId,
    });
    account = await getAccountWithCookie({ cookieHeader: auth.cookieHeader, endpoint, projectId });
    const jwt = await createJwtWithCookie({ cookieHeader: auth.cookieHeader, endpoint, projectId });

    const compileQuery = 'Will housing pressure worsen in Rome over the next 90 days?';
    const queryPlanPayload = await appwriteApi('/public/compile-query', {
      method: 'POST',
      body: { query: compileQuery },
      key: adminKey,
      timeoutMs: 120000,
    });
    const queryPlan = getQueryPlan(queryPlanPayload);

    const observeCreated = await appwriteApi('/worldsim/jobs', {
      method: 'POST',
      body: {
        query: compileQuery,
        queryPlan,
        userContext: {
          location: 'Rome, Italy',
          profession: 'Founder',
          interests: ['macro', 'housing'],
        },
        source: 'parity-gate',
        sourceRef: `observe-${Date.now()}`,
        plan: 'free',
      },
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      key: adminKey,
      timeoutMs: 120000,
    });
    const observeJobId = safeText(observeCreated?.job?.jobId);
    const observeResult = await pollWorldSimResult('observe', observeJobId, jwt, adminKey);

    const matrixCreated = await appwriteApi('/worldsim/interventions', {
      method: 'POST',
      body: {
        baselineQuery: compileQuery,
        queryPlan,
        userContext: {
          location: 'Rome, Italy',
          profession: 'Founder',
          interests: ['macro', 'housing'],
        },
        intervention: {
          label: 'Housing tax credit pilot',
          category: 'policy_regulation',
          intensity: 0.56,
          geography: 'Rome metro',
          duration: '45d',
          targetAudience: 'Renters and landlords',
          timing: 'Immediately',
        },
        source: 'parity-gate',
        sourceRef: `matrix-${Date.now()}`,
        plan: 'free',
      },
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      key: adminKey,
      timeoutMs: 120000,
    });
    const matrixJobId = safeText(matrixCreated?.job?.jobId);
    const matrixResult = await pollWorldSimResult('matrix', matrixJobId, jwt, adminKey);

    const cancelObserveCreated = await appwriteApi('/worldsim/jobs', {
      method: 'POST',
      body: {
        query: `${compileQuery} [cancel-observe]`,
        queryPlan,
        source: 'parity-gate',
        sourceRef: `cancel-observe-${Date.now()}`,
        plan: 'free',
      },
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      key: adminKey,
      timeoutMs: 120000,
    });
    const cancelObserve = await appwriteApi(
      `/worldsim/jobs/${encodeURIComponent(safeText(cancelObserveCreated?.job?.jobId))}/cancel`,
      {
        method: 'POST',
        body: {},
        headers: {
          authorization: `Bearer ${jwt}`,
        },
        key: adminKey,
        timeoutMs: 120000,
      }
    );

    const cancelMatrixCreated = await appwriteApi('/worldsim/interventions', {
      method: 'POST',
      body: {
        baselineQuery: `${compileQuery} [cancel-matrix]`,
        queryPlan,
        intervention: {
          label: 'Short test cancel',
          category: 'media_narrative',
          intensity: 0.44,
        },
        source: 'parity-gate',
        sourceRef: `cancel-matrix-${Date.now()}`,
        plan: 'free',
      },
      headers: {
        authorization: `Bearer ${jwt}`,
      },
      key: adminKey,
      timeoutMs: 120000,
    });
    const cancelMatrix = await appwriteApi(
      `/worldsim/interventions/${encodeURIComponent(safeText(cancelMatrixCreated?.job?.jobId))}/cancel`,
      {
        method: 'POST',
        body: {},
        headers: {
          authorization: `Bearer ${jwt}`,
        },
        key: adminKey,
        timeoutMs: 120000,
      }
    );

    const summary = {
      account_id: safeText(account?.$id),
      auth_mode: 'temp_email',
      session_email: tempEmail,
      observe: {
        job_id: observeJobId,
        status: safeText(observeResult?.job?.status),
        result_available: Boolean(observeResult?.job?.resultAvailable),
        digest: Boolean(observeResult?.digest),
      },
      matrix: {
        job_id: matrixJobId,
        status: safeText(matrixResult?.job?.status),
        result_available: Boolean(matrixResult?.job?.resultAvailable),
        digest: Boolean(matrixResult?.digest),
        matrix: Boolean(matrixResult?.matrix),
      },
      cancel_observe: {
        status: safeText(cancelObserve?.job?.status),
      },
      cancel_matrix: {
        status: safeText(cancelMatrix?.job?.status),
      },
    };

    const blockers = [];
    if (!summary.account_id) blockers.push('auth bootstrap failed');
    if (summary.observe.status !== 'completed' || !summary.observe.result_available || !summary.observe.digest) {
      blockers.push('observe lifecycle failed');
    }
    if (
      summary.matrix.status !== 'completed' ||
      !summary.matrix.result_available ||
      !summary.matrix.digest ||
      !summary.matrix.matrix
    ) {
      blockers.push('matrix lifecycle failed');
    }
    if (summary.cancel_observe.status !== 'canceled') blockers.push('observe cancel failed');
    if (summary.cancel_matrix.status !== 'canceled') blockers.push('matrix cancel failed');

    return {
      ok: blockers.length === 0,
      blockers,
      summary,
    };
  } finally {
    if (auth?.cookieHeader) {
      await deleteCurrentSession({ cookieHeader: auth.cookieHeader, endpoint, projectId }).catch(() => null);
    }
    await deleteAppwriteUser({
      userId: tempUserId,
      endpoint,
      projectId,
      key: adminKey,
    }).catch(() => null);
  }
}

function buildMarkdown(report) {
  const lines = [
    '# Appwrite Parity Gate',
    '',
    `- Generated: ${report.generated_at}`,
    `- Site URL: ${report.site.url}`,
    `- Site smoke: ${report.site.ok ? 'green' : 'red'}`,
    `- Health: ${report.health.ok ? 'green' : 'red'}`,
    `- WorldSim lifecycle: ${report.worldsim.ok ? 'green' : 'red'}`,
    `- Baseline mode: ${report.baseline?.effective_mode || 'unknown'} (requested: ${report.baseline?.requested_mode || 'unknown'})`,
    `- Gate verdict: ${report.summary.verdict}`,
    '',
    '## Summary',
    '',
    `- Consecutive green runs required: ${report.summary.required_runs}`,
    `- Consecutive green runs achieved: ${report.summary.green_runs}`,
    `- Live baseline rows: ${report.baseline?.live_rows ?? 0}`,
    `- Frozen baseline rows: ${report.baseline?.frozen_rows ?? 0}`,
    `- Binary mismatch rate: ${report.summary.binary_winner_mismatch_rate ?? 'n/a'}`,
    `- Missing binary contract rate: ${report.summary.missing_binary_contract_rate ?? 'n/a'}`,
    `- Median probability delta: ${report.summary.median_probability_delta ?? 'n/a'}`,
    `- Sports A.29 ready: ${report.summary.a29_ready}`,
    `- Sports B.3.6 ready: ${report.summary.b36_ready}`,
    '',
    '## Blockers',
    '',
  ];

  if (!report.summary.blockers.length) {
    lines.push('- none');
  } else {
    for (const blocker of report.summary.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push('', '## Forecast Rows', '');
  for (const row of report.rows) {
    lines.push(
      `- ${row.query_id}: appwrite=${row.appwrite_status}, legacy=${row.legacy_status}, winner=${row.appwrite_winner || 'n/a'} vs ${row.legacy_winner || 'n/a'}, delta=${row.probability_delta ?? 'n/a'}`
    );
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const adminKey = await resolveProjectKey({ endpoint });
  const fixtures = await readJson(fixturesPath);
  const frozenBaseline = await loadFrozenBaseline(frozenBaselinePath);
  await resolveSiteUrl(adminKey);
  const health = await collectHealth(adminKey);
  const site = await fetchSiteSmoke();
  const runs = [];
  let greenRuns = 0;

  for (let index = 0; index < gateRuns; index += 1) {
    const rows = [];
    for (const query of fixtures.queries || []) {
      rows.push(
        await compareQuery(query.id, query.query, query.expects_binary, adminKey, {
          baselineMode,
          frozenBaseline,
        })
      );
    }
    const forecast = summarizeForecastRun(rows);
    const run = {
      index: index + 1,
      ok: forecast.ok,
      forecast,
      rows,
    };
    runs.push(run);
    if (run.ok) {
      greenRuns += 1;
    } else if (strictMode) {
      break;
    }
  }

  const worldsim = await runWorldSimLifecycle(adminKey).catch((error) => buildFailure(error.message));
  const allRows = runs.flatMap((run) => run.rows || []);
  const baseline = summarizeBaselineUsage(allRows, baselineMode, frozenBaseline);
  const lastForecast = runs[runs.length - 1]?.forecast || {
    binary_winner_mismatch_rate: null,
    missing_binary_contract_rate: null,
    median_probability_delta: null,
    a29_ready: false,
    b36_ready: false,
    blockers: ['forecast parity did not run'],
  };

  const blockers = [
    ...(site.ok ? [] : ['site smoke failed']),
    ...(health.ok ? [] : ['health route failed']),
    ...(baseline.requested_mode === 'frozen' && !baseline.frozen_available ? ['frozen baseline unavailable'] : []),
    ...(health.payload?.runtime?.legacy_proxy?.crystal_core_base_url === false &&
    health.payload?.runtime?.legacy_proxy?.mirofish_base_url === false
      ? []
      : ['legacy proxy still configured']),
    ...lastForecast.blockers,
    ...worldsim.blockers,
  ];

  const report = {
    generated_at: new Date().toISOString(),
    endpoint,
    project_id: projectId,
    site,
    health,
    worldsim,
    baseline,
    runs,
    rows: allRows,
    summary: {
      required_runs: gateRuns,
      green_runs: greenRuns,
      binary_winner_mismatch_rate: lastForecast.binary_winner_mismatch_rate,
      missing_binary_contract_rate: lastForecast.missing_binary_contract_rate,
      median_probability_delta: lastForecast.median_probability_delta,
      a29_ready: lastForecast.a29_ready,
      b36_ready: lastForecast.b36_ready,
      blockers,
      verdict: greenRuns >= gateRuns && blockers.length === 0 ? 'green' : 'red',
    },
  };

  await ensureDirectory(outputJsonPath);
  await ensureDirectory(outputMarkdownPath);
  await fs.writeFile(outputJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(outputMarkdownPath, buildMarkdown(report));

  console.log(`Appwrite parity JSON written to ${outputJsonPath}`);
  console.log(`Appwrite parity markdown written to ${outputMarkdownPath}`);
  console.log(`Verdict: ${report.summary.verdict}`);
  if (report.summary.blockers.length) {
    for (const blocker of report.summary.blockers) {
      console.log(`- blocker: ${blocker}`);
    }
  }

  if (report.summary.verdict !== 'green' && strictMode) {
    process.exitCode = 1;
  }
}

await main();
