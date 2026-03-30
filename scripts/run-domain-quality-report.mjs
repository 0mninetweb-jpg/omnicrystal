import path from "node:path";
import { writeDomainQualityMatrixReport } from "./domain-quality-matrix.mjs";

const currentDate = new Date().toISOString().slice(0, 10);
const docsDir = path.resolve(process.cwd(), "docs");

const { markdownPath, jsonPath, report } = await writeDomainQualityMatrixReport({
  currentDate,
  docsDir,
});

console.log(`Domain quality markdown written to ${markdownPath}`);
console.log(`Domain quality JSON written to ${jsonPath}`);
console.log(
  `Summary: verdict=${report.summary.verdict}, total_domains=${report.summary.total_domains}, top3_miss_count=${report.summary.top3_miss_count}`
);
