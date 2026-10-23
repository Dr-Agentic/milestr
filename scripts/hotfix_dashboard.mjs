#!/usr/bin/env node
/**
 * Hotfix a Milestr dashboard HTML in place: replace the broken inline
 * <script> body with the known-good one from src/ui/dashboardScript.ts.
 *
 * Why: the live dashboards (3 of them) were published from the broken v1.3.0
 * generator. Their instance directories are not on this machine anymore, so we
 * cannot re-run `milestr export` for them. But the inline <script> block is
 * self-contained and byte-identical across all of them, so swapping in the
 * fixed script repairs every feature without touching any other markup.
 *
 * Safety:
 *  - Only the FIRST non-JSON <script> block is replaced.
 *  - The replacement is validated: it must parse, and the old one must NOT
 *    parse (otherwise there is nothing to fix and we bail out).
 *  - The script body is taken verbatim from src/ui/dashboardScript.ts, so it
 *    is exactly what the fixed generator emits.
 */
import fs from 'node:fs';

const target = process.argv[2];
if (!target) {
  console.error('usage: hotfix_dashboard.mjs <dashboard.html>');
  process.exit(2);
}

const fixedScript = fs.readFileSync(
  new URL('../src/ui/dashboardScript.ts', import.meta.url),
  'utf8'
);

// Extract the DASHBOARD_SCRIPT template literal body.
const start = fixedScript.indexOf('export const DASHBOARD_SCRIPT = `');
if (start === -1) throw new Error('DASHBOARD_SCRIPT not found in dashboardScript.ts');
const bodyStart = fixedScript.indexOf('`', start) + 1;
const bodyEnd = fixedScript.indexOf('`', bodyStart);
if (bodyStart === 1 || bodyEnd === -1) throw new Error('could not read DASHBOARD_SCRIPT body');
const newBody = fixedScript.slice(bodyStart, bodyEnd);

try {
  new Function(newBody);
} catch (e) {
  throw new Error(`fixed script does not parse: ${e.message}`);
}

const html = fs.readFileSync(target, 'utf8');
const re = /<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/;
const m = re.exec(html);
if (!m) {
  console.log(`${target}: no inline script found - nothing to do`);
  process.exit(0);
}

const oldBody = m[1];
let oldParses = true;
try {
  new Function(oldBody);
} catch {
  oldParses = false;
}

if (oldParses) {
  console.log(`${target}: inline script already parses - nothing to do`);
  process.exit(0);
}

const out = html.slice(0, m.index) + m[0].replace(oldBody, newBody) + html.slice(m.index + m[0].length);
fs.writeFileSync(target, out, 'utf8');

// Verify the written file.
const check = fs.readFileSync(target, 'utf8');
const m2 = re.exec(check);
if (!m2) throw new Error('verification failed: no inline script after write');
try {
  new Function(m2[1]);
} catch (e) {
  throw new Error(`verification failed: written script still broken: ${e.message}`);
}
console.log(`${target}: FIXED (inline script now parses)`);
