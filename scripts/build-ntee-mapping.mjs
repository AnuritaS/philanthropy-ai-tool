/**
 * Derive an NTEE -> PCS subject mapping from Candid's own crosswalk column.
 *
 *   node scripts/build-ntee-mapping.mjs
 *
 * The PCS workbook records each subject's "Former GCS/NTEE Code". Inverting
 * that column gives a mapping sourced from Candid rather than invented here,
 * which matters: a hand-built crosswalk would be an unreviewed editorial claim
 * sitting underneath every concentration figure computed from NTEE-coded data.
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../src/taxonomy/mappings');
mkdirSync(OUT_DIR, { recursive: true });

const subjects = JSON.parse(readFileSync(resolve(HERE, '../src/taxonomy/pcs/subjects.json'), 'utf8'));
const version = JSON.parse(readFileSync(resolve(HERE, '../src/taxonomy/pcs/version.json'), 'utf8'));

/** NTEE codes are a letter plus two digits; some cells list several. */
const NTEE = /^[A-Z]\d{2}$/;

const map = new Map();
let skipped = 0;

for (const node of subjects) {
  const former = (node.formerCode ?? '').trim();
  if (!former || former.toUpperCase() === 'NEW') { skipped += 1; continue; }

  for (const partRaw of former.split(/[;,|]/)) {
    const part = partRaw.trim().toUpperCase();
    if (!NTEE.test(part)) { skipped += 1; continue; }
    if (!map.has(part)) map.set(part, []);
    map.get(part).push({ code: node.code, label: node.label, level: node.level });
  }
}

// Where one NTEE code crosswalks to several PCS codes, prefer the shallowest —
// the safest roll-up — and keep the alternatives visible rather than dropping them.
const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
const mapping = {};
const ambiguous = [];

for (const [ntee, targets] of entries) {
  targets.sort((a, b) => a.level - b.level || a.code.localeCompare(b.code));
  mapping[ntee] = targets[0].code;
  if (targets.length > 1) {
    ambiguous.push({ ntee, chosen: targets[0].code, alternatives: targets.slice(1).map((t) => t.code) });
  }
}

writeFileSync(
  resolve(OUT_DIR, 'ntee-to-pcs.json'),
  `${JSON.stringify(
    {
      facet: 'subjects',
      derivedFrom: 'PCS "Former GCS/NTEE Code" column',
      pcsRelease: version.release,
      generatedAt: new Date().toISOString().slice(0, 10),
      count: Object.keys(mapping).length,
      ambiguous,
      mapping,
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  `ntee-to-pcs.json  ${Object.keys(mapping).length} NTEE codes mapped, ` +
  `${ambiguous.length} ambiguous, ${skipped} subject rows without a usable former code\n`,
);
