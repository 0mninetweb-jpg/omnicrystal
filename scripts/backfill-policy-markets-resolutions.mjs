import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require(path.resolve(process.cwd(), "functions", "node_modules", "firebase-admin"));

const DEFAULT_PROJECT_ID = "omnicrystal";
const DEFAULT_FIXTURE_PATH = path.resolve(process.cwd(), "scripts", "fixtures", "policy-markets-resolution-backfill.json");
const REQUIRED_MINIMUM = 30;

function parseArgs(argv = []) {
  const options = {
    projectId: DEFAULT_PROJECT_ID,
    fixturePath: DEFAULT_FIXTURE_PATH,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (item === "--projectId" && argv[index + 1]) {
      options.projectId = argv[index + 1];
      index += 1;
      continue;
    }
    if (item === "--fixture" && argv[index + 1]) {
      options.fixturePath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
    }
  }

  return options;
}

function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampProbability(value, fallback = 0.58) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.01, Math.min(0.99, numeric));
}

function buildResolutionRecord(domainId, tuple = []) {
  const [slug, queryText, predictedLabel, predictedProbability, actualOutcome, observedOutcome, cardState, resolvedAt] = tuple;
  const resolutionId = `backfill_${safeText(slug, "missing_slug")}`;
  const predicted = clampProbability(predictedProbability, 0.58);
  const rawProbability = Math.max(0.01, Math.min(0.99, predicted - 0.02));

  return {
    resolution_id: resolutionId,
    query_text: safeText(queryText, resolutionId),
    domain_id: safeText(domainId),
    predicted_label: safeText(predictedLabel),
    predicted_probability: Number(predicted.toFixed(4)),
    raw_probability: Number(rawProbability.toFixed(4)),
    actual_outcome: Number(actualOutcome) === 1 ? 1 : 0,
    observed_outcome: safeText(observedOutcome),
    card_state: safeText(cardState, "limited"),
    runtime_transport: "backfill_seed",
    resolution_source: "curated_backfill",
    resolution_target: {
      target_type: "binary_outcome",
    },
    scored: true,
    backfill_seed: true,
    resolved_at: safeText(resolvedAt),
    updated_at: safeText(resolvedAt),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixture = JSON.parse(await fs.readFile(options.fixturePath, "utf8"));
  const domains = fixture?.domains && typeof fixture.domains === "object" ? fixture.domains : {};
  const domainEntries = Object.entries(domains);

  for (const [domainId, tuples] of domainEntries) {
    const count = Array.isArray(tuples) ? tuples.length : 0;
    if (count < REQUIRED_MINIMUM) {
      throw new Error(`Fixture must contain at least ${REQUIRED_MINIMUM} entries for ${domainId}; found ${count}.`);
    }
  }

  const records = domainEntries.flatMap(([domainId, tuples]) =>
    (Array.isArray(tuples) ? tuples : []).map((tuple) => buildResolutionRecord(domainId, tuple))
  );

  if (options.dryRun) {
    const byDomain = Object.fromEntries(
      domainEntries.map(([domainId, tuples]) => [domainId, Array.isArray(tuples) ? tuples.length : 0])
    );
    console.log(JSON.stringify({ dry_run: true, project_id: options.projectId, total_records: records.length, by_domain: byDomain }, null, 2));
    return;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: options.projectId,
    });
  }

  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  const batchSize = 100;
  for (let index = 0; index < records.length; index += batchSize) {
    const batch = db.batch();
    const chunk = records.slice(index, index + batchSize);
    for (const record of chunk) {
      batch.set(
        db.collection("forecast_resolutions").doc(record.resolution_id),
        {
          ...record,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          resolved_at: record.resolved_at ? new Date(record.resolved_at) : admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  const byDomain = Object.fromEntries(
    domainEntries.map(([domainId, tuples]) => [domainId, Array.isArray(tuples) ? tuples.length : 0])
  );
  console.log(JSON.stringify({ dry_run: false, project_id: options.projectId, total_records: records.length, by_domain: byDomain }, null, 2));
}

await main();
