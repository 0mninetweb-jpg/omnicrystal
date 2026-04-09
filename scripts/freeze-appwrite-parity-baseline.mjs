import fs from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);

function readOption(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const repoRoot = path.resolve('.');
const inputPath = path.resolve(repoRoot, readOption('input', 'docs/parity-report-appwrite-latest.json'));
const outputPath = path.resolve(repoRoot, readOption('output', 'docs/golden-parity-baseline.json'));

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function mapRow(row) {
  return {
    query_id: safeText(row.query_id),
    status: safeText(row.appwrite_status, 'completed'),
    transport: safeText(row.appwrite_transport),
    winner: safeText(row.appwrite_winner),
    band: safeText(row.appwrite_band),
    probability: Number.isFinite(Number(row.appwrite_probability)) ? Number(row.appwrite_probability) : null,
    card_state: safeText(row.appwrite_card_state),
    pick_state: safeText(row.appwrite_pick_state),
    fixture_window_state: safeText(row.appwrite_fixture_window_state),
    sportsbook_readiness_state: safeText(row.appwrite_sportsbook_readiness_state),
    sports_ready: Boolean(row.appwrite_sports_ready),
    sports_grounded: Boolean(row.appwrite_sports_grounded),
    sports_semantic_ready: Boolean(row.appwrite_sports_semantic_ready),
    publish_gate_ready: Boolean(row.appwrite_publish_gate_ready),
    provider_configured: Boolean(row.appwrite_provider_configured),
    fixture_resolved: Boolean(row.appwrite_fixture_resolved),
    reason: safeText(row.appwrite_reason),
    overlay_blocker_reason: safeText(row.appwrite_overlay_blocker_reason),
    side_a: safeText(row.appwrite_side_a),
    side_b: safeText(row.appwrite_side_b),
    fixture_window_open: Boolean(row.appwrite_fixture_window_open),
    operational: Boolean(row.appwrite_operational),
  };
}

async function main() {
  const report = await readJson(inputPath);
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  if (!rows.length) {
    throw new Error(`No rows found in parity report: ${inputPath}`);
  }

  const incompleteRows = rows.filter((row) => safeText(row.appwrite_status) !== 'completed');
  if (incompleteRows.length) {
    throw new Error(
      `Cannot freeze baseline while Appwrite rows are incomplete: ${incompleteRows.map((row) => safeText(row.query_id)).join(', ')}`
    );
  }

  const invalidBinaryRows = rows.filter((row) => row.expects_binary && !safeText(row.appwrite_winner));
  if (invalidBinaryRows.length) {
    throw new Error(
      `Cannot freeze baseline with missing binary winners: ${invalidBinaryRows.map((row) => safeText(row.query_id)).join(', ')}`
    );
  }

  const payload = {
    metadata: {
      generated_at: new Date().toISOString(),
      source_report_path: inputPath,
      source_report_generated_at: safeText(report.generated_at),
      endpoint: safeText(report.endpoint),
      project_id: safeText(report.project_id),
      site_url: safeText(report?.site?.url),
      baseline_kind: 'appwrite_golden',
      row_count: rows.length,
    },
    rows: rows.map(mapRow),
  };

  await ensureDirectory(outputPath);
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
  console.log(`Frozen Appwrite baseline written to ${outputPath}`);
}

await main();
