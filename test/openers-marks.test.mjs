/**
 * The Open with menu reads an element's marks as worldGraph does: on every element of the lens fixture's
 * worlds (the vendored dist's profiles/lens.fixture.json, 133 at serial 102), a door that skips one word is
 * left out exactly when the graph reader, asked about that element alone, says it carries that mark. The
 * graph is the reference here, never the menu's own code: room, hidden and proposed from a node's marks
 * with every flag on, map space from the cut with that one flag off, a reading aid from the one kind no
 * flag brings back. An element under the world's hidden list carries `hidden: true`, as the owner is served
 * it. Runs against the compiled bundle (dist).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openersFor, worldGraph } from '../dist/index.js';

const LENS = fileURLToPath(new URL('../codegen/schema-dist/profiles/lens.fixture.json', import.meta.url));
const WORDS = ['room', 'hidden', 'proposed', 'map_space', 'reading_aid'];
const ALL = { rooms: true, hidden: true, proposed: true, mapSpace: true };

const door = (word) => ({
  id: `skip-${word.replace('_', '-')}`, name: word, url: 'https://x.example', client: null, rung: 'listed',
  open: { world: 'https://x.example/#/w/{world}', element: 'https://x.example/#/w/{world}/e/{id}', needs: null, element_skips: [word] },
});
const TOOLS = WORDS.map(door);

/** The marks the graph reader gives one element, read from worldGraph alone. */
function graphMarks(el) {
  const owner = { rung: 'owner' };
  const all = worldGraph({ elements: [el] }, owner, ALL);
  const marks = new Set(all.nodes[0]?.marks ?? []);
  const noMap = worldGraph({ elements: [el] }, owner, { ...ALL, mapSpace: false });
  if (all.nodes.length === 1 && noMap.nodes.length === 0 && noMap.cut.map_space === 1) marks.add('map_space');
  if (all.nodes.length === 0 && all.cut.reading_aid === 1) marks.add('reading_aid');
  return marks;
}

test('every skip word leaves a door out exactly when worldGraph reads that mark on the element', () => {
  const doc = JSON.parse(readFileSync(LENS, 'utf8'));
  const worlds = Object.values(doc.worlds);
  let n = 0;
  const seen = new Set();
  const wrong = [];
  for (const w of worlds) {
    const hidden = new Set(w.hidden ?? []);
    for (const raw of w.elements) {
      const el = hidden.has(raw.id) ? { ...raw, hidden: true } : raw;
      const want = graphMarks(el);
      for (const m of want) seen.add(m);
      const rows = openersFor(TOOLS, 'element', { form: 'human', world: w.id, type: String(el.type).toLowerCase(), id: el.id }, { audience: 'member' }, { element: el });
      for (const word of WORDS) {
        const gone = !rows.some((r) => r.id === door(word).id);
        if (gone !== want.has(word)) wrong.push(`${w.name} ${el.type} ${el.name ?? el.id}: ${word} ${gone ? 'skipped' : 'kept'}, the graph ${want.has(word) ? 'marks it' : 'does not'}`);
      }
      n++;
    }
  }
  for (const line of wrong) console.log(line);
  assert.deepEqual(wrong, []);
  assert.ok(n >= 100, `read ${n} elements`);
  // Every word met at least once, so no check passes for want of a case.
  assert.deepEqual([...seen].sort(), [...WORDS].sort());
});
