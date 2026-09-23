// Runs Shopify's theme-check (same engine as `shopify theme check`) and prints
// a compact report. Exits non-zero on any error-severity offense.
//   node tools/theme-check.mjs            # whole theme
//   node tools/theme-check.mjs pl-        # only files whose path contains "pl-"
import { themeCheckRun } from '@shopify/theme-check-node';
import { fileURLToPath } from 'node:url';

const filter = process.argv[2];
const root = fileURLToPath(new URL('..', import.meta.url));
const { offenses } = await themeCheckRun(root, undefined, () => {});
const sev = ['error', 'warning', 'info'];
const shown = offenses.filter((o) => !filter || o.uri.includes(filter));
for (const o of shown) {
  const file = decodeURIComponent(o.uri).split(/[\/]/).slice(-2).join('/');
  console.log(`${sev[o.severity]}\t${file}:${o.start.line + 1}\t${o.check}\t${o.message}`);
}
const errors = shown.filter((o) => o.severity === 0).length;
console.log(`\n${shown.length} offenses (${errors} errors)`);
process.exit(errors ? 1 : 0);
