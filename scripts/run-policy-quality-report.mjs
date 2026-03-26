import path from "node:path";
import { writePolicyGovernanceReport } from "./policy-governance-benchmark.mjs";

const currentDate = new Date().toISOString().slice(0, 10);
const docsDir = path.resolve(process.cwd(), "docs");

const { markdownPath, jsonPath, report } = await writePolicyGovernanceReport({
  currentDate,
  docsDir,
});

console.log(`Policy quality report written to ${markdownPath}`);
console.log(`Policy quality JSON written to ${jsonPath}`);
console.log(
  `Summary: verdict=${report.summary.verdict}, total_cases=${report.summary.total_cases}, general_fallback_rate=${report.summary.general_fallback_rate}`
);
