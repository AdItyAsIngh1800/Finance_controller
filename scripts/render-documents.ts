/**
 * Renders settlement statements to PDF and degraded images.
 *
 * Deferred here from Phase 2 deliberately: the rendering approach depends on
 * what the extraction stage actually needs, and that was not knowable until the
 * model was in hand.
 *
 * Uses headless Chrome, already present on the machine, rather than adding a
 * browser dependency to the project — and `sharp`, already installed, for the
 * degraded variants. Net new dependencies: none.
 *
 * The degraded set is the point. A clean render proves the model can read;
 * only a bad scan shows whether its *confidence* falls when it should, which is
 * the property the whole review gate depends on.
 *
 * Usage: `npm run render:documents`
 *
 * @see docs/EVALUATION.md §3.4 — confidence calibration
 * @module
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { settlementStatementHtml } from '../src/core/generate/documents';
import { generateSettlementDataset, SHOWCASE_ORDER_REF } from '../src/core/generate/settlement';

/** Where rendered documents are written. Gitignored, like all fixtures. */
const OUTPUT_DIR = join('fixtures', 'documents');

/** Chrome locations to try, in order. */
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

/** Locates a usable Chrome binary. */
function findChrome(): string {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(
    'No Chrome or Chromium binary found. Rendering test documents needs one; ' +
      'install Chrome or set one of: ' + CHROME_CANDIDATES.join(', '),
  );
}

/**
 * Runs one headless Chrome task and waits for its output file.
 *
 * Chrome writes the file and then, in recent versions, declines to exit. The
 * call is therefore bounded and a timeout is not treated as failure — what
 * matters is whether the artefact appeared, which is checked directly.
 * `--virtual-time-budget` makes it settle the page rather than waiting on
 * network idle that will never come for a local file.
 */
function runChrome(chrome: string, args: readonly string[], expectedFile: string): void {
  try {
    execFileSync(
      chrome,
      [
        '--headless=old',
        '--disable-gpu',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--hide-scrollbars',
        '--virtual-time-budget=4000',
        `--user-data-dir=${join(OUTPUT_DIR, '.chrome-profile')}`,
        ...args,
      ],
      { stdio: 'ignore', timeout: 30_000, killSignal: 'SIGKILL' },
    );
  } catch {
    // Fall through: the file check below is the real success condition.
  }
  if (!existsSync(expectedFile)) {
    throw new Error(`Chrome produced no output at ${expectedFile}`);
  }
}

/** Renders an HTML file to PDF and to a PNG. */
function renderWithChrome(chrome: string, htmlPath: string, stem: string): void {
  runChrome(chrome, [`--print-to-pdf=${stem}.pdf`, '--no-pdf-header-footer', htmlPath], `${stem}.pdf`);
  runChrome(chrome, [`--screenshot=${stem}.png`, '--window-size=1000,1400', htmlPath], `${stem}.png`);
}

/**
 * Produces a deliberately poor scan of a rendered page.
 *
 * Each step corresponds to something that actually happens to documents in the
 * wild: a low-resolution scan, a page fed in crooked, washed-out toner, and
 * sensor noise from a phone camera.
 */
async function degrade(sourcePng: string, destination: string): Promise<void> {
  const noise = Buffer.from(
    `<svg width="1000" height="1400" xmlns="http://www.w3.org/2000/svg">
       <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3"/></filter>
       <rect width="1000" height="1400" filter="url(#n)" opacity="0.22"/>
     </svg>`,
  );

  await sharp(sourcePng)
    .resize({ width: 620 })            // scanned at low resolution
    .rotate(1.6, { background: '#ffffff' }) // fed in slightly crooked
    .modulate({ brightness: 1.18 })    // washed-out toner
    .linear(0.72, 26)                  // reduced contrast
    .blur(1.5)                         // soft focus
    .composite([{ input: noise, blend: 'multiply' }])
    .jpeg({ quality: 38 })             // heavy compression artefacts
    .toFile(destination);
}

async function main(): Promise<void> {
  const chrome = findChrome();
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const dataset = generateSettlementDataset();

  // The showcase order plus a small sample, so extraction accuracy is measured
  // over more than one document without spending minutes rendering.
  const showcase = dataset.source.find((record) => record.externalRef === SHOWCASE_ORDER_REF);
  const sample = [
    ...(showcase === undefined ? [] : [showcase]),
    ...dataset.source.filter((record) => record.externalRef !== SHOWCASE_ORDER_REF).slice(0, 4),
  ];

  const rendered: string[] = [];
  for (const record of sample) {
    const stem = join(OUTPUT_DIR, record.externalRef);
    const htmlPath = `${stem}.html`;
    writeFileSync(htmlPath, settlementStatementHtml(record), 'utf8');
    renderWithChrome(chrome, htmlPath, stem);
    rendered.push(record.externalRef);
  }

  // One degraded variant, of the showcase order, so the confidence gate has a
  // document it should visibly struggle with.
  const degradedOf = rendered[0];
  if (degradedOf !== undefined) {
    await degrade(join(OUTPUT_DIR, `${degradedOf}.png`), join(OUTPUT_DIR, `${degradedOf}.degraded.jpg`));
  }

  // The expected values, so extraction can be scored rather than eyeballed.
  const expected = sample.map((record) => ({
    reference: record.externalRef,
    date: record.date,
    netMinor: record.amountMinor.toString(),
    detail: record.detail,
  }));
  const asJson = JSON.stringify(
    expected,
    (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  );
  writeFileSync(join(OUTPUT_DIR, 'expected.json'), `${asJson}\n`, 'utf8');

  rmSync(join(OUTPUT_DIR, '.chrome-profile'), { recursive: true, force: true });

  const files = readdirSync(OUTPUT_DIR).filter((name) => !name.endsWith('.html'));
  process.stdout.write(
    `Rendered ${rendered.length} statements to ${OUTPUT_DIR}/\n` +
      `  ${files.sort().join('\n  ')}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
