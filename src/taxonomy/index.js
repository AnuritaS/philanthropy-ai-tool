/**
 * PCS taxonomy access: labels, navigation, and prompt construction.
 *
 * Deliberately NOT imported by src/core/. Core implements ancestry as a prefix
 * test and stays dependency-free; this module is for everything that needs to
 * know what a code *means* rather than merely how codes nest.
 *
 * Data is the pinned November 2024 release — see pcs/version.json and NOTICE.md.
 */

import subjects from './pcs/subjects.json' with { type: 'json' };
import populations from './pcs/populations.json' with { type: 'json' };
import supportStrategy from './pcs/support-strategy.json' with { type: 'json' };
import transactionType from './pcs/transaction-type.json' with { type: 'json' };
import versionInfo from './pcs/version.json' with { type: 'json' };

/** @typedef {{code:string,label:string,parent:string|null,definition:string,level:number}} PCSNode */

export const FACETS = ['subjects', 'populations', 'support-strategy', 'transaction-type'];

const RAW = {
  subjects,
  populations,
  'support-strategy': supportStrategy,
  'transaction-type': transactionType,
};

export const version = versionInfo;

const facetCache = new Map();
const childCache = new Map();

/**
 * Codes are eight characters, but level-1 priorities are conventionally written
 * as their two-character prefix — the strategy declaration in BUILD_SPEC uses
 * `['SB','SC']`, and rollUp returns the same short form. Padding here lets a
 * declared priority resolve to a real node without callers special-casing it.
 */
const SHORT_CODE = /^[A-Z]{2}(\d{2}){0,3}$/;

export function normalizeCode(code) {
  if (code === null || code === undefined) return null;
  const c = String(code).trim().toUpperCase();
  if (c === '') return null;
  if (!SHORT_CODE.test(c)) return c;
  return c.length === 8 ? c : c + '0'.repeat(8 - c.length);
}

function assertFacet(facet) {
  if (!RAW[facet]) throw new Error(`Unknown PCS facet "${facet}". Expected one of: ${FACETS.join(', ')}`);
}

/**
 * Load a pinned facet as a Map keyed by code.
 * @param {'subjects'|'populations'|'support-strategy'|'transaction-type'} facet
 * @returns {Map<string, PCSNode>}
 */
export function loadFacet(facet) {
  assertFacet(facet);
  if (!facetCache.has(facet)) {
    facetCache.set(facet, new Map(RAW[facet].map((n) => [n.code, n])));
  }
  return facetCache.get(facet);
}

/** Resolve a code to its node. Returns null for unknown codes — never throws. */
export function lookup(facet, code) {
  if (!RAW[facet]) return null;
  const c = normalizeCode(code);
  if (!c) return null;
  return loadFacet(facet).get(c) ?? null;
}

/** Human label for a code, for chart axes and findings prose. */
export function labelFor(facet, code) {
  const node = lookup(facet, code);
  if (node) return node.label;
  const c = normalizeCode(code);
  // An unmapped code is shown as itself rather than as a blank or a guess.
  return c ?? '';
}

/** Full ancestor chain, root first, excluding the code itself. */
export function ancestors(facet, code) {
  const node = lookup(facet, code);
  if (!node) return [];
  const chain = [];
  let current = node.parent ? lookup(facet, node.parent) : null;
  while (current) {
    chain.unshift(current);
    current = current.parent ? lookup(facet, current.parent) : null;
  }
  return chain;
}

/** Direct children, in code order. Used by the strategy declaration picker. */
export function children(facet, code) {
  if (!RAW[facet]) return [];
  if (!childCache.has(facet)) {
    const index = new Map();
    for (const n of RAW[facet]) {
      const key = n.parent ?? '__root__';
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(n);
    }
    for (const list of index.values()) list.sort((a, b) => a.code.localeCompare(b.code));
    childCache.set(facet, index);
  }
  const c = normalizeCode(code);
  return childCache.get(facet).get(c ?? '__root__') ?? [];
}

/** Top-level nodes of a facet. */
export function roots(facet) {
  return children(facet, null);
}

/**
 * Roll a code up to a given depth, returned as the short prefix form so the
 * result can be used directly as a priority or a grouping key.
 * Subject SB050200 at depth 1 → 'SB'.
 */
export function rollUp(facet, code, depth) {
  const c = normalizeCode(code);
  if (!c) return null;
  const d = Math.max(1, Math.min(4, Math.trunc(depth)));
  return c.slice(0, 2 + (d - 1) * 2);
}

/** Every leaf code — nodes with no children. Used to build classifier prompts. */
export function leaves(facet) {
  assertFacet(facet);
  const hasChildren = new Set(RAW[facet].map((n) => n.parent).filter(Boolean));
  return RAW[facet].filter((n) => !hasChildren.has(n.code));
}

/** Validate a user-declared priority list. Returns both sides of the split. */
export function validateCodes(facet, codes) {
  const valid = [];
  const unknown = [];
  for (const raw of codes ?? []) {
    const node = lookup(facet, raw);
    if (node) valid.push(node.code);
    else unknown.push(String(raw));
  }
  return { valid, unknown };
}

/** Facet a code belongs to, inferred from its leading letter. */
export function facetOf(code) {
  const c = normalizeCode(code);
  if (!c) return null;
  const byPrefix = { S: 'subjects', P: 'populations', U: 'support-strategy', T: 'transaction-type' };
  return byPrefix[c[0]] ?? null;
}
