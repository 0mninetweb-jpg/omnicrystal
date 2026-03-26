import { writeProviderFoundationReport } from "./provider-foundation-benchmark.mjs";

const currentDate = new Date().toISOString().slice(0, 10);
const { markdownPath, jsonPath, report } = await writeProviderFoundationReport({ currentDate });

console.log(`Provider foundation report written to ${markdownPath}`);
console.log(`Provider foundation JSON written to ${jsonPath}`);
console.log(
  `Summary: verdict=${report.summary.verdict}, synthetic_smoke_verdict=${report.summary.synthetic_smoke_verdict}, runtime_config_blockers=${report.summary.runtime_config_blocker_count}`
);
