import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const docsDir = path.join(repoRoot, "docs");

function latestArtifact(prefix) {
  const matches = fs
    .readdirSync(docsDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .sort();
  assert(matches.length > 0, `Missing artifact with prefix ${prefix}`);
  return path.join(docsDir, matches[matches.length - 1]);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

const sportsProbePath = latestArtifact("sports-probe-");
const sportsCalibrationPath = latestArtifact("sports-calibration-");
const closeoutPath = latestArtifact("phase-a-closeout-");

const sportsProbe = readJson(sportsProbePath);
const sportsCalibration = readJson(sportsCalibrationPath);
const closeout = readJson(closeoutPath);

assert.equal(sportsProbe?.summary?.local_remote_green, true, "Sports probe local/remote must be green.");
assert.equal(sportsProbe?.summary?.winner_mismatch_rate, 0, "Sports probe winner mismatch rate must stay at 0.");
assert.equal(sportsProbe?.summary?.stale_evidence_failures, 0, "Sports probe should not report stale evidence failures once ready.");

const calibrationStatus =
  sportsCalibration?.artifact_status ||
  sportsCalibration?.summary?.artifact_status ||
  (sportsCalibration?.summary ? "warming_up" : null);
assert(["unavailable", "warming_up", "active"].includes(calibrationStatus), "Sports calibration artifact must declare unavailable, warming_up, or active.");
const sampleSize = Number(sportsCalibration?.summary?.sample_size || 0);
if (calibrationStatus === "active") {
  assert(sampleSize >= 30, "Active sports calibration must meet the sample floor.");
} else if (calibrationStatus === "warming_up") {
  assert(sampleSize >= 0 && sampleSize < 30, "Warming-up sports calibration must stay below the active sample floor.");
} else {
  assert.equal(sportsCalibration?.summary?.operational, false, "Unavailable sports calibration must expose operational=false.");
}

if (sampleSize > 0) {
  assert.notEqual(
    sportsCalibration?.summary?.favorite_vs_edge_confusion_rate,
    null,
    "Sports calibration should compute favorite_vs_edge_confusion_rate once samples exist."
  );
}

assert.equal(closeout?.gates?.sports_parity_closed, true, "Closeout must see sports parity as closed.");
assert.equal(
  closeout?.gates?.sports_calibration_status,
  calibrationStatus,
  "Closeout must consume the same sports calibration status exposed by the artifact."
);

console.log("Sports calibration QA passed.");
