const fs = require("node:fs/promises");
const path = require("node:path");
const admin = require("firebase-admin");
const { generateSportsCalibrationReport } = require("./crystalCore/evaluation");

function parseArgs(argv = []) {
  const options = {
    lookbackDays: 30,
    backfillLookbackDays: 365,
    outputDate: new Date().toISOString().slice(0, 10),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === "--lookbackDays" && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) options.lookbackDays = parsed;
      index += 1;
      continue;
    }
    if (item === "--outputDate" && next) {
      options.outputDate = next.trim();
      index += 1;
      continue;
    }
    if (item === "--backfillLookbackDays" && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) options.backfillLookbackDays = parsed;
      index += 1;
    }
  }

  return options;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return response.json();
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  const options = parseArgs(process.argv.slice(2));
  const report = await generateSportsCalibrationReport(
    {
      db,
      admin,
      fetchJson,
    },
    {
      lookbackDays: options.lookbackDays,
      backfillLookbackDays: options.backfillLookbackDays,
      runSweep: true,
    }
  );

  const outputPath = path.resolve(__dirname, "..", "docs", `sports-calibration-${options.outputDate}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath, summary: report.summary }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
