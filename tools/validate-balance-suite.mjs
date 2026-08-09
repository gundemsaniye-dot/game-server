import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(projectRoot, 'outputs', 'qa', 'balance-suite-latest.json');

let payload;
try {
  payload = JSON.parse(await readFile(reportPath, 'utf8'));
} catch (error) {
  console.error(`Balance suite report is missing or invalid: ${reportPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const summary = payload?.summary;
if (!summary || summary.completedMatches !== 305) {
  console.error(`Balance suite is incomplete: ${summary?.completedMatches ?? 0}/305 matches`);
  process.exit(1);
}

console.log(
  `Balance suite ${summary.passed ? 'PASS' : 'FAIL'}: ` +
  `${summary.primaryMatches}/300 primary, ${summary.supplementalMatches}/5 supplemental, ` +
  `${summary.failures.length} failure(s)`,
);
if (!summary.passed) {
  for (const failure of summary.failures) console.error(`- ${failure}`);
  process.exit(1);
}
