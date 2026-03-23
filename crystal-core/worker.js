const admin = require("firebase-admin");

const { createCrystalCoreRuntime } = require("../functions/crystalCore/runtime");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const runtime = createCrystalCoreRuntime({
  db,
  admin,
  getGeminiApiKey: () => process.env.GEMINI_API_KEY || "",
});

async function main() {
  const mode = process.env.CRYSTAL_CORE_EVAL_MODE || "resolution";
  const lookbackDays = process.env.CRYSTAL_CORE_EVAL_LOOKBACK_DAYS ? Number(process.env.CRYSTAL_CORE_EVAL_LOOKBACK_DAYS) : undefined;
  const limit = process.env.CRYSTAL_CORE_EVAL_LIMIT ? Number(process.env.CRYSTAL_CORE_EVAL_LIMIT) : undefined;
  const reportType = process.env.CRYSTAL_CORE_EVAL_REPORT_TYPE || undefined;

  const result = await runtime.runOfflineEvaluationMode({
    mode,
    lookbackDays,
    limit,
    reportType,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("crystal-core worker failed", error);
  process.exit(1);
});
