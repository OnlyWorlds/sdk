/**
 * Every type a built entry declares is exported from that entry, or named below with its reason.
 * A type a public signature names but the entry does not export cannot be imported by a caller:
 * 4.134.0 named OwWorldKeyRow and OwWorldKeyMember in madeWorldKey's signature and its changelog,
 * and `import { type OwWorldKeyRow }` failed to compile until 4.134.1.
 *
 * Reads dist/*.d.ts as built (pretest builds): each declared interface and type alias against the
 * entry's own `export { ... }` list.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIST = new URL('../dist/', import.meta.url);

/** Declared and deliberately not exported, each with why a caller never needs the name. */
const NOT_EXPORTED = {
  'index.d.ts': {
    Members: 'an alias of readonly OwMessageMember[] | null | undefined; OwMessageMember is exported',
    DaySlot: "the calendar kernel's internal day slot, reached only through StepPosition",
    StepPosition: "weekdayForStep's internal cache parameter; no exported function makes one",
  },
  'waymark.d.ts': {
    OwElementMark: 'exported from the main entry',
    OwTool: 'exported from the main entry',
    OwToolNeeds: 'exported from the main entry',
    OwToolOpen: 'exported from the main entry',
  },
};

const entries = readdirSync(DIST).filter((f) => f.endsWith('.d.ts')).sort();

test('the built entries are the ones this test knows', () => {
  assert.deepEqual(entries, Object.keys(NOT_EXPORTED).sort());
});

for (const entry of entries) {
  test(`${entry}: every declared type is exported or named with its reason`, () => {
    const text = readFileSync(new URL(entry, DIST), 'utf8');
    const declared = new Set([...text.matchAll(/^(?:declare )?(?:interface|type) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
    const exported = new Set();
    for (const m of text.matchAll(/^export \{([^}]*)\}/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
        if (name) exported.add(name);
      }
    }
    assert.ok(declared.size > 0 && exported.size > 0, `${entry}: read no declarations or no export list`);
    const named = NOT_EXPORTED[entry] ?? {};
    const missing = [...declared].filter((n) => !exported.has(n) && !(n in named)).sort();
    assert.deepEqual(missing, [], `${entry} declares types it does not export: ${missing.join(', ')}`);
    const stale = Object.keys(named).filter((n) => !declared.has(n) || exported.has(n)).sort();
    assert.deepEqual(stale, [], `${entry}: named as not exported, but now exported or gone: ${stale.join(', ')}`);
  });
}
