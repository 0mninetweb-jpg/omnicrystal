import { writeMarketsAssetsReport } from "./markets-assets-benchmark.mjs";

const currentDate = new Date().toISOString().slice(0, 10);
const { markdownPath, jsonPath, report } = await writeMarketsAssetsReport({ currentDate });

console.log(`Markets quality report written to ${markdownPath}`);
console.log(`Markets quality JSON written to ${jsonPath}`);
console.log(
  `Summary: verdict=${report.summary.verdict}, total_cases=${report.summary.total_cases}, general_fallback_rate=${report.summary.general_fallback_rate}`
);
