import crypto from 'node:crypto';

const USER_SCOPED_TABLES = ['cards', 'card_versions', 'watchlist_items', 'saved_quotes', 'product_events', 'credit_events'];

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeTimestampLike(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value.__type === 'timestamp' && safeText(value.iso)) {
    return value.iso;
  }
  return null;
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }
  if (value && typeof value === 'object') {
    const ts = normalizeTimestampLike(value);
    if (ts) return ts;
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, normalizeValue(nestedValue)]));
  }
  return value;
}

function firstIsoTimestamp(...values) {
  for (const value of values) {
    const iso = normalizeTimestampLike(value);
    if (iso) return iso;
  }
  return null;
}

function createRowId(pathKey) {
  return `r_${crypto.createHash('sha1').update(pathKey).digest('hex').slice(0, 34)}`;
}

export function resolveDocumentTarget(path) {
  if (!Array.isArray(path) || path.length === 0) return null;

  let target = null;

  if (path[0] === 'users' && path.length === 2) {
    target = { tableId: 'users', sourceId: path[1], userId: path[1], parentId: null, collectionKey: 'users' };
  } else if (path[0] === 'users' && path[2] === 'cards' && path.length === 4) {
    target = { tableId: 'cards', sourceId: path[3], userId: path[1], parentId: path[1], collectionKey: 'users.cards' };
  } else if (path[0] === 'users' && path[2] === 'cards' && path[4] === 'versions' && path.length === 6) {
    target = { tableId: 'card_versions', sourceId: path[5], userId: path[1], parentId: path[3], collectionKey: 'users.cards.versions' };
  } else if (path[0] === 'users' && path[2] === 'watchlist' && path.length === 4) {
    target = { tableId: 'watchlist_items', sourceId: path[3], userId: path[1], parentId: path[1], collectionKey: 'users.watchlist' };
  } else if (path[0] === 'users' && path[2] === 'saved_quotes' && path.length === 4) {
    target = { tableId: 'saved_quotes', sourceId: path[3], userId: path[1], parentId: path[1], collectionKey: 'users.saved_quotes' };
  } else if (path[0] === 'users' && path[2] === 'product_events' && path.length === 4) {
    target = { tableId: 'product_events', sourceId: path[3], userId: path[1], parentId: path[1], collectionKey: 'users.product_events' };
  } else if (path[0] === 'users' && path[2] === 'credit_events' && path.length === 4) {
    target = { tableId: 'credit_events', sourceId: path[3], userId: path[1], parentId: path[1], collectionKey: 'users.credit_events' };
  } else if (path[0] === 'public_forecasts' && path.length === 2) {
    target = { tableId: 'public_forecasts', sourceId: path[1], userId: null, parentId: null, slug: path[1], collectionKey: 'public_forecasts' };
  } else if (path[0] === 'forecast_runs' && path.length === 2) {
    target = { tableId: 'forecast_runs', sourceId: path[1], userId: null, parentId: null, collectionKey: 'forecast_runs' };
  } else if (path[0] === 'forecast_runs' && path[2] === 'artifacts' && path.length === 4) {
    target = { tableId: 'forecast_run_artifacts', sourceId: path[3], userId: null, parentId: path[1], collectionKey: 'forecast_runs.artifacts' };
  } else if (path[0] === 'worldsim_jobs' && path.length === 2) {
    target = { tableId: 'worldsim_jobs', sourceId: path[1], userId: null, parentId: null, collectionKey: 'worldsim_jobs' };
  } else if (path[0] === 'forecast_ledger' && path.length === 2) {
    target = { tableId: 'forecast_ledger', sourceId: path[1], userId: null, parentId: null, collectionKey: 'forecast_ledger' };
  } else if (path[0] === 'forecast_ledger' && path[2] === 'versions' && path.length === 4) {
    target = { tableId: 'forecast_ledger_versions', sourceId: path[3], userId: null, parentId: path[1], collectionKey: 'forecast_ledger.versions' };
  } else if (path[0] === 'historical_20y_summaries' && path.length === 2) {
    target = { tableId: 'historical_20y_summaries', sourceId: path[1], userId: null, parentId: null, collectionKey: 'historical_20y_summaries' };
  } else if (path[0] === 'world_sim_cache' && path.length === 2) {
    target = { tableId: 'world_sim_cache', sourceId: path[1], userId: null, parentId: null, collectionKey: 'world_sim_cache' };
  } else if (path[0] === 'polymarket_search_cache' && path.length === 2) {
    target = { tableId: 'polymarket_search_cache', sourceId: path[1], userId: null, parentId: null, collectionKey: 'polymarket_search_cache' };
  } else if (path[0] === 'polymarket_signal_cache' && path.length === 2) {
    target = { tableId: 'polymarket_signal_cache', sourceId: path[1], userId: null, parentId: null, collectionKey: 'polymarket_signal_cache' };
  } else if (path[0] === 'cached_cards' && path.length === 2) {
    target = {
      tableId: 'cached_cards',
      sourceId: path[1],
      userId: null,
      parentId: null,
      collectionKey: 'cached_cards',
    };
  } else if (path[0] === 'cached_cards' && path.length === 4) {
    target = {
      tableId: 'cached_cards',
      sourceId: path[3],
      userId: null,
      parentId: `${path[1]}__${path[2]}`,
      domain: path[1],
      city: path[2],
      collectionKey: 'cached_cards',
    };
  } else if (path[0] === 'pipeline_logs' && path.length === 2) {
    target = { tableId: 'pipeline_logs', sourceId: path[1], userId: null, parentId: null, collectionKey: 'pipeline_logs' };
  } else if (path[0] === 'system_cache' && path.length === 2) {
    target = { tableId: 'system_cache', sourceId: path[1], userId: null, parentId: null, collectionKey: 'system_cache' };
  } else if (path[0] === 'system_config' && path.length === 2) {
    target = { tableId: 'system_config', sourceId: path[1], userId: null, parentId: null, collectionKey: 'system_config' };
  } else if (path[0] === 'domain_calibration' && path.length === 2) {
    target = { tableId: 'domain_calibration', sourceId: path[1], userId: null, parentId: null, collectionKey: 'domain_calibration' };
  } else if (path[0] === 'evaluation_reports' && path.length === 2) {
    target = { tableId: 'evaluation_reports', sourceId: path[1], userId: null, parentId: null, collectionKey: 'evaluation_reports' };
  } else if (path[0] === 'binary_parity_reports' && path.length === 2) {
    target = { tableId: 'binary_parity_reports', sourceId: path[1], userId: null, parentId: null, collectionKey: 'binary_parity_reports' };
  } else if (path[0] === 'calibration_reports' && path.length === 2) {
    target = { tableId: 'calibration_reports', sourceId: path[1], userId: null, parentId: null, collectionKey: 'calibration_reports' };
  } else if (path[0] === 'forecast_resolutions' && path.length === 2) {
    target = { tableId: 'forecast_resolutions', sourceId: path[1], userId: null, parentId: null, collectionKey: 'forecast_resolutions' };
  } else if (path[0] === 'phase1_decision_ledger' && path.length === 2) {
    target = { tableId: 'phase1_decision_ledger', sourceId: path[1], userId: null, parentId: null, collectionKey: 'phase1_decision_ledger' };
  }

  if (!target) return null;

  const pathKey = path.join('/');
  return {
    ...target,
    pathKey,
    rowId: createRowId(pathKey),
  };
}

export function resolveCollectionTarget(path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  if (path[0] === 'users' && path[2] === 'cards' && path.length === 3) return { tableId: 'cards', userId: path[1], parentId: path[1], publicRead: false };
  if (path[0] === 'users' && path[2] === 'cards' && path[4] === 'versions' && path.length === 5) return { tableId: 'card_versions', userId: path[1], parentId: path[3], publicRead: false };
  if (path[0] === 'users' && path[2] === 'watchlist' && path.length === 3) return { tableId: 'watchlist_items', userId: path[1], parentId: path[1], publicRead: false };
  if (path[0] === 'users' && path[2] === 'saved_quotes' && path.length === 3) return { tableId: 'saved_quotes', userId: path[1], parentId: path[1], publicRead: false };
  if (path[0] === 'users' && path[2] === 'product_events' && path.length === 3) return { tableId: 'product_events', userId: path[1], parentId: path[1], publicRead: false };
  if (path[0] === 'public_forecasts' && path.length === 1) return { tableId: 'public_forecasts', publicRead: true };
  if (path[0] === 'cached_cards' && path.length === 1) return { tableId: 'cached_cards', publicRead: false };
  if (path[0] === 'cached_cards' && path.length === 3) return { tableId: 'cached_cards', domain: path[1], city: path[2], publicRead: false };
  if (path[0] === 'pipeline_logs' && path.length === 1) return { tableId: 'pipeline_logs', publicRead: false };
  return null;
}

export function isPublicCollectionPath(path) {
  return Array.isArray(path) && path[0] === 'public_forecasts';
}

export function isUserScopedTable(tableId) {
  return USER_SCOPED_TABLES.includes(tableId) || tableId === 'users';
}

export function buildRowData(target, data) {
  const normalized = normalizeValue(data || {});
  return {
    user_id: target.userId || null,
    parent_id: target.parentId || null,
    source_id: target.sourceId || null,
    path_key: target.pathKey,
    collection_key: target.collectionKey,
    slug: target.slug || safeText(normalized.public_slug),
    domain: target.domain || safeText(normalized.domain || normalized.domain_id || normalized.primary_domain_id),
    city: target.city || safeText(normalized.city || normalized.geography_label),
    query_text: safeText(normalized.query_text || normalized.query || normalized.query_origin),
    status: safeText(normalized.status || normalized.planStatus || normalized.card_state || normalized.resolution_status),
    sort_at: firstIsoTimestamp(
      normalized.createdAt,
      normalized.created_at,
      normalized.savedAt,
      normalized.generated_at,
      normalized.timestamp,
      normalized.updatedAt,
      normalized.updated_at,
      normalized.published_at,
      normalized.completedAt,
      normalized.completed_at,
      normalized.lastUpdatedAt
    ),
    ttl_at: firstIsoTimestamp(normalized.ttl),
    payload_json: JSON.stringify(normalized),
  };
}

export function decodeRow(row) {
  return row?.payload_json ? JSON.parse(row.payload_json) : null;
}

function getFieldValue(row, payload, field) {
  if (field === 'createdAt' || field === 'savedAt' || field === 'updatedAt' || field === 'generated_at' || field === 'timestamp') {
    return row.sort_at || firstIsoTimestamp(payload?.[field]);
  }
  if (field === 'ttl') {
    return row.ttl_at || firstIsoTimestamp(payload?.ttl);
  }
  if (field === 'query') {
    return row.query_text || safeText(payload?.query);
  }
  return payload?.[field];
}

export function filterRowsForCollection(rows, collectionTarget, constraints = []) {
  let items = rows
    .filter((row) => {
      if (collectionTarget.userId && row.user_id !== collectionTarget.userId) return false;
      if (collectionTarget.parentId && row.parent_id !== collectionTarget.parentId) return false;
      if (collectionTarget.domain && row.domain !== collectionTarget.domain) return false;
      if (collectionTarget.city && row.city !== collectionTarget.city) return false;
      return true;
    })
    .map((row) => ({
      row,
      payload: decodeRow(row),
    }));

  for (const constraint of constraints) {
    if (constraint?.kind === 'where') {
      items = items.filter(({ row, payload }) => {
        const left = getFieldValue(row, payload, constraint.field);
        const right = normalizeValue(constraint.value);
        switch (constraint.op) {
          case '==':
            return left === right;
          case '>':
            return safeText(left) > safeText(right);
          case '>=':
            return safeText(left) >= safeText(right);
          case '<':
            return safeText(left) < safeText(right);
          case '<=':
            return safeText(left) <= safeText(right);
          default:
            return true;
        }
      });
    }

    if (constraint?.kind === 'orderBy') {
      items = [...items].sort((left, right) => {
        const leftValue = getFieldValue(left.row, left.payload, constraint.field);
        const rightValue = getFieldValue(right.row, right.payload, constraint.field);
        if (leftValue === rightValue) return 0;
        const next = safeText(leftValue) < safeText(rightValue) ? -1 : 1;
        return constraint.direction === 'desc' ? next * -1 : next;
      });
    }

    if (constraint?.kind === 'limit') {
      items = items.slice(0, constraint.value);
    }
  }

  return items.map(({ row, payload }) => ({
    id: row.source_id,
    data: payload,
  }));
}

export function listBootstrapTables() {
  return [
    'users',
    'cards',
    'card_versions',
    'watchlist_items',
    'saved_quotes',
    'product_events',
    'credit_events',
    'public_forecasts',
    'forecast_runs',
    'forecast_run_artifacts',
    'forecast_ledger',
    'forecast_ledger_versions',
    'worldsim_jobs',
    'historical_20y_summaries',
    'world_sim_cache',
    'polymarket_search_cache',
    'polymarket_signal_cache',
    'cached_cards',
    'pipeline_logs',
    'system_cache',
    'system_config',
    'domain_calibration',
    'evaluation_reports',
    'binary_parity_reports',
    'calibration_reports',
    'forecast_resolutions',
    'phase1_decision_ledger',
  ];
}
