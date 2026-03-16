import fs from 'fs';

const content = fs.readFileSync('server-backend.ts', 'utf8');
const index = content.indexOf('export async function handleCardServer');
if (index !== -1) {
  const newContent = content.substring(0, index) + `export function startBackgroundTasks() {
  console.log("Starting Crystal background tasks...");
  // Run data collector immediately, then every 6 hours
  runDataCollector();
  setInterval(runDataCollector, 6 * 60 * 60 * 1000);
}
`;
  fs.writeFileSync('server-backend.ts', newContent);
  console.log("Truncated successfully");
} else {
  console.log("Not found");
}
