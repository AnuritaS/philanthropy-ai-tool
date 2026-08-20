/**
 * PCS taxonomy tests, run against the pinned November 2024 release rather than
 * fixtures — a taxonomy that only passes against its own mock is worthless.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FACETS, loadFacet, lookup, labelFor, ancestors, children, roots,
  rollUp, leaves, validateCodes, facetOf, normalizeCode, version,
} from '../src/taxonomy/index.js';

test('the pinned release is recorded with its source and licence', () => {
  assert.equal(version.release, 'November 2024');
  assert.equal(version.license, 'CC BY 4.0');
  assert.match(version.sourceUrl, /^https:\/\/taxonomy\.candid\.org\//);
  assert.match(version.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test('every facet loads with the code count recorded in version.json', () => {
  for (const facet of FACETS) {
    const map = loadFacet(facet);
    assert.ok(map.size > 0, `${facet} is empty`);
    assert.equal(map.size, version.counts[facet], `${facet} count drifted from version.json`);
  }
});

test('an unknown facet throws, but an unknown code never does', () => {
  assert.throws(() => loadFacet('nonsense'), /Unknown PCS facet/);
  assert.equal(lookup('nonsense', 'SB'), null);
  assert.equal(lookup('subjects', 'ZZ999999'), null);
  assert.equal(lookup('subjects', null), null);
  assert.equal(lookup('subjects', ''), null);
});

test('codes resolve to their real labels', () => {
  assert.equal(labelFor('subjects', 'SB050200'), 'Undergraduate education');
  assert.equal(labelFor('support-strategy', 'UA000000'), 'General support');
  assert.equal(labelFor('transaction-type', 'TA000000'), 'Cash grants');
});

test('a level-1 priority written as its two-character prefix still resolves', () => {
  // BUILD_SPEC declares priorities as ['SB','SC'], and rollUp returns that form.
  assert.equal(normalizeCode('SB'), 'SB000000');
  assert.equal(lookup('subjects', 'SB').label, 'Education');
  assert.equal(labelFor('subjects', 'SB'), 'Education');
});

test('an unmapped code is shown as itself rather than blank', () => {
  assert.equal(labelFor('subjects', 'ZZ999999'), 'ZZ999999');
  assert.equal(labelFor('subjects', 'zz999999'), 'ZZ999999');
});

test('ancestry walks to the root, root first', () => {
  const chain = ancestors('subjects', 'SB050200');
  assert.deepEqual(chain.map((n) => n.code), ['SB000000', 'SB050000']);
  assert.equal(chain[0].label, 'Education');
  assert.equal(ancestors('subjects', 'SB000000').length, 0, 'a root has no ancestors');
  assert.deepEqual(ancestors('subjects', 'ZZ999999'), []);
});

test('every declared parent exists in its own facet', () => {
  for (const facet of FACETS) {
    const map = loadFacet(facet);
    for (const node of map.values()) {
      if (node.parent) assert.ok(map.has(node.parent), `${facet}: ${node.code} parent ${node.parent} missing`);
    }
  }
});

test('level always matches the depth encoded in the code', () => {
  for (const facet of FACETS) {
    for (const node of loadFacet(facet).values()) {
      const pairs = [node.code.slice(2, 4), node.code.slice(4, 6), node.code.slice(6, 8)];
      let expected = 1;
      for (const p of pairs) { if (p === '00') break; expected += 1; }
      assert.equal(node.level, expected, `${node.code} level mismatch`);
    }
  }
});

test('children and roots partition a facet', () => {
  const kids = children('subjects', 'SB');
  assert.ok(kids.length > 0);
  assert.ok(kids.every((n) => n.parent === 'SB000000'));
  assert.ok(kids.every((n) => n.level === 2));

  const top = roots('subjects');
  assert.ok(top.every((n) => n.level === 1 && n.parent === null));
  assert.equal(top.length, version.counts.subjects - [...loadFacet('subjects').values()].filter((n) => n.parent).length);
});

test('rollUp truncates to the prefix form used by strategy declarations', () => {
  assert.equal(rollUp('subjects', 'SB050200', 1), 'SB');
  assert.equal(rollUp('subjects', 'SB050200', 2), 'SB05');
  assert.equal(rollUp('subjects', 'SB050200', 3), 'SB0502');
  assert.equal(rollUp('subjects', 'SB050200', 4), 'SB050200');
  // Depth is clamped rather than throwing on nonsense input.
  assert.equal(rollUp('subjects', 'SB050200', 0), 'SB');
  assert.equal(rollUp('subjects', 'SB050200', 99), 'SB050200');
  assert.equal(rollUp('subjects', null, 1), null);
});

test('a rolled-up code is a prefix of the original, which is what core ancestry tests', () => {
  for (const node of [...loadFacet('subjects').values()].slice(0, 200)) {
    for (let depth = 1; depth <= 4; depth += 1) {
      assert.ok(node.code.startsWith(rollUp('subjects', node.code, depth)));
    }
  }
});

test('leaves have no children and are a strict subset of the facet', () => {
  const all = loadFacet('subjects');
  const ls = leaves('subjects');
  assert.ok(ls.length > 0 && ls.length < all.size);
  for (const leaf of ls.slice(0, 50)) assert.equal(children('subjects', leaf.code).length, 0);
});

test('validateCodes splits a declared priority list', () => {
  const { valid, unknown } = validateCodes('subjects', ['SB', 'SB050200', 'NOPE', '', null]);
  assert.deepEqual(valid, ['SB000000', 'SB050200']);
  assert.deepEqual(unknown, ['NOPE', '', 'null']);
});

test('facetOf infers the facet from the code prefix', () => {
  assert.equal(facetOf('SB050200'), 'subjects');
  assert.equal(facetOf('PA010000'), 'populations');
  assert.equal(facetOf('UA000000'), 'support-strategy');
  assert.equal(facetOf('TA000000'), 'transaction-type');
  assert.equal(facetOf('QQ000000'), null);
});

test('the known source quirk is documented rather than silently corrected', () => {
  const quirk = version.knownSourceQuirks.find((q) => q.code === 'TA010000');
  assert.ok(quirk, 'TA010000 quirk should be recorded in version.json');
  // The code is authoritative: Block grants is a child of Cash grants.
  assert.equal(lookup('transaction-type', 'TA010000').parent, 'TA000000');
  assert.equal(lookup('transaction-type', 'TA010000').level, 2);
});
