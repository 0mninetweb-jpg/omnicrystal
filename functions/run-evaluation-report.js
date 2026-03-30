const admin = require("firebase-admin");
const { generateEvaluationReport } = require("./crystalCore/evaluation");

function parseArgs(argv = []) {
  const options = {
    reportType: "daily",
    lookbackDays: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === "--reportType" && next) {
      options.reportType = next.trim();
      index += 1;
      continue;
    }
    if (item === "--lookbackDays" && next) {
      const parsed = Number(next);
      options.lookbackDays = Number.isFinite(parsed) ? parsed : null;
      index += 1;
    }
  }

  return options;
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  const options = parseArgs(process.argv.slice(2));
  const result = await generateEvaluationReport(
    {
      db,
      admin,
    },
    {
      reportType: options.reportType,
      lookbackDays: options.lookbackDays,
    }
  );

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
