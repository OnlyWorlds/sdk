/**
 * World lookup: find the elements a plain-language question is about, in a
 * world held in memory, with no model and no network. Ported from Assembly's
 * Lantern Ask trial (`dossiers/lantern-ask/lookup.mjs`, round 2), with the
 * same ranking, so the trial's measurements on two real worlds describe this
 * code. Pure: runs in a browser and in Node alike.
 *
 *   const index = buildWorldIndex(elements);           // API elements or a world folder's files
 *   const hits  = lookupWorld(index, question);        // ranked, best first, each with its reasons
 *   const text  = renderElement(hits[0].element, index); // a compact text card, links by name
 *
 * Each element needs `id` and `type` (a world folder's files may lack `type`:
 * set it from the folder name), and usually `name`.
 *
 * LINKS: a field is a link when `FIELD_SCHEMA` says so for the element's type,
 * or when its value is an id-shaped string or an array of them. The second
 * rule is the trial's own, and it is kept because real data links outside the
 * schema's names: a world folder's pins and markers carry `map_id` and
 * `zone_id`, and extension fields (`x_*`) hold references. A link to an id
 * outside the set is kept as unresolved, so a card can say a link exists.
 *
 * RANKING (higher score first; ties: shorter name, then id):
 *  0. Question and names are normalised: lower case, diacritics stripped,
 *     possessive 's dropped, "7,875" read as 7875; letters and digits of any
 *     script are kept, anything else is a space. A content word has 3+
 *     characters and is no English stopword; a word holding a non-Latin letter
 *     always counts (a CJK name is often one or two characters). Words are
 *     split on spaces and punctuation only, so a CJK name is found when the
 *     question sets it apart that way.
 *  1. Name phrase: the whole name appears in the question -> 100 + 10 per word.
 *  2. Alias phrase: a short form appears -> 80 + 10 per word. Short forms: the
 *     name without a leading "the"; the part before ":" or "("; for characters
 *     also the part before " of " or "," and the first word.
 *  3. Name words: question words (3+ letters, not stopwords) equal to a name
 *     word, or sharing a 5+ letter prefix with it -> 20 + 40 x the
 *     rarity-weighted share of the name's words matched. Kept only when better
 *     than 1-2.
 *  4. Kind: +15 when a question word matches the supertype or subtype (a word
 *     the name already used does not count again).
 *  5. One link step from the 12 best direct hits, both directions: a linked-to
 *     element scores 0.6 x the hit, a linking element 0.45 x; x1.5 when the
 *     field fits a question word ("where" -> location fields, "rules" ->
 *     primary_power, ...). Every reason is kept; the best score counts.
 *  6. Text: question words (and numbers) found in the element's other text and
 *     number fields add 3 x their summed rarity. An element found only this
 *     way scores under 19, so below every name hit.
 *  7. Map furniture (pin, marker, zone, map) x0.85, so a pin never outranks
 *     its location; it carries no text.
 */

import { FIELD_SCHEMA } from './v2/constants';

/** What the lookup reads from an element: `id`, `type`, `name`, and any other fields. `OwElement` fits. */
export interface OwLookupElement {
  id: string;
  type: string;
  name?: string;
  [field: string]: unknown;
}

/** One link between two elements of the index, by field. */
export interface OwLookupLink {
  field: string;
  id: string;
}

/**
 * The index `lookupWorld` and `renderElement` read, built once per world by
 * `buildWorldIndex`. `byId` is the elements by id; the other tables are the
 * lookup's working state: read them if useful, but their shape may change.
 */
export interface OwWorldIndex<T extends OwLookupElement = OwLookupElement> {
  byId: ReadonlyMap<string, T>;
  /** Links each element holds to elements in the set. */
  out: ReadonlyMap<string, readonly OwLookupLink[]>;
  /** Links pointing at each element, with the holder's id. */
  inn: ReadonlyMap<string, readonly OwLookupLink[]>;
  /** Links each element holds to ids not in the set. */
  unresolved: ReadonlyMap<string, readonly OwLookupLink[]>;
  phrase: ReadonlyMap<string, readonly { id: string; kind: 'name' | 'alias' }[]>;
  tokenIds: ReadonlyMap<string, ReadonlySet<string>>;
  nameWords: ReadonlyMap<string, readonly string[]>;
  idf: ReadonlyMap<string, number>;
  textIds: ReadonlyMap<string, ReadonlySet<string>>;
  textIdf: ReadonlyMap<string, number>;
}

/** Why an element matched: by its name or a short form of it, by name words, by other text, or by one link. */
export type OwLookupReason =
  | { kind: 'name' | 'alias' | 'word' | 'text'; text: string }
  | { kind: 'link'; dir: 'out' | 'in'; field: string; from: string | undefined; fromId: string };

/** One ranked result. `dir: 'out'` on a link reason: the hit `from` links to this element; `'in'`: this element links to it. */
export interface OwLookupHit<T extends OwLookupElement = OwLookupElement> {
  element: T;
  /** Rounded to one decimal; comparable within one lookup only. */
  score: number;
  reasons: OwLookupReason[];
}

export interface OwLookupOptions {
  /** How many hits to return (default 8). */
  limit?: number;
}

export interface OwRenderOptions {
  /** Description characters kept (default 500). */
  descMax?: number;
  /** Linked names listed per field (default 12). */
  linkMax?: number;
  /** Incoming names listed per type and field (default 10). */
  incomingMax?: number;
}

// an array literal, not a split string: the bundler can only drop a set it can prove pure
// (a .split() call kept these 451 bytes in every app importing the SDK; Temper, h17 #4247)
const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with',
  'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'who', 'whom', 'whose', 'what', 'which',
  'where', 'when', 'why', 'how', 'does', 'do', 'did', 'doesn', 'has', 'have', 'had', 'it', 'its',
  'this', 'that', 'these', 'those', 'there', 'their', 'they', 'them', 'he', 'she', 'his', 'her',
  'him', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'about', 'tell', 'know', 'any', 'some', 'all',
  'can', 'could', 'would', 'should', 'will', 'not', 'no', 'yes', 'than', 'then', 'so', 'if', 'into',
  'out', 'up', 'down', 'over', 'under', 'one', 'two', 'own', 'same', 'other', 'more', 'most',
  'much', 'many', 'very', 'just', 'also', 'only', 's', 't', 'don', 'isn']);

const SPATIAL = new Set(['pin', 'marker', 'zone', 'map']);

// question word -> link fields it points at (step 5)
const FIELD_HINTS: Record<string, string[]> = {
  where: ['location', 'parent_location', 'birthplace', 'locations', 'estates', 'element_id'],
  live: ['location', 'locations', 'populations'], lives: ['location', 'locations', 'populations'],
  located: ['location', 'parent_location'], location: ['location', 'parent_location'],
  born: ['birthplace'], birthplace: ['birthplace'],
  species: ['species', 'parent_species'], race: ['species'], people: ['species', 'populations'],
  rules: ['primary_power', 'governs', 'operator'], rule: ['primary_power', 'governs', 'operator'],
  ruled: ['primary_power', 'governs'], holds: ['primary_power', 'governs'], realm: ['primary_power'],
  govern: ['primary_power', 'governs'], governs: ['primary_power', 'governs'], controls: ['primary_power', 'operator'],
  culture: ['populations'], cultures: ['populations'], folk: ['populations'],
  ally: ['allies', 'friends'], allies: ['allies', 'friends'], allied: ['allies'], friends: ['friends'], friend: ['friends'],
  enemy: ['adversaries', 'rivals'], enemies: ['adversaries', 'rivals'], rival: ['rivals'], rivals: ['rivals'],
  fought: ['institutions'], war: ['institutions'], fight: ['institutions'],
  family: ['family'], house: ['family'], clan: ['family'],
  member: ['characters', 'institutions', 'family'], members: ['characters', 'institutions', 'family'],
  belong: ['characters', 'institutions', 'family'], belongs: ['characters', 'institutions', 'family'],
  ancestor: ['ancestors'], ancestors: ['ancestors'],
  region: ['parent_location'], part: ['parent_location', 'parent_species'], parent: ['parent_location', 'parent_species'],
};

// not text for step 6
const TEXT_SKIP = new Set(['id', 'name', 'type', 'image_url', 'created_at', 'updated_at', 'local_updated_at',
  'server_updated_at', 'world', 'image_media_id', 'element_type']);

// not shown as plain fields on a card
const RENDER_SKIP = new Set(['id', 'name', 'description', 'type', 'supertype', 'subtype', 'image_url',
  'created_at', 'updated_at', 'local_updated_at', 'server_updated_at', 'world', 'image_media_id']);

const ID_SHAPE = /^[0-9a-f-]{32,36}$/i;

// built from char codes: literal combining marks do not survive every editor
const MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const POSSESSIVE = new RegExp(`['${String.fromCharCode(0x2019)}]s\\b`, 'g');

function normalize(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(MARKS, '')
    .toLowerCase()
    .replace(POSSESSIVE, '')
    .replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
const words = (s: string): string[] => (s ? s.split(' ') : []);
const NON_LATIN = /[^\p{Script=Latin}\p{N}]/u;
const isContent = (w: string): boolean => (w.length >= 3 && !STOP.has(w)) || NON_LATIN.test(w);

let schemaLinks: Map<string, Set<string>> | undefined;
/** Link field names per type, from FIELD_SCHEMA (built on first use). */
function linkFieldsOf(type: unknown): Set<string> | undefined {
  if (!schemaLinks) {
    schemaLinks = new Map();
    for (const [t, fields] of Object.entries(FIELD_SCHEMA as Record<string, Record<string, { type: string }>>)) {
      const s = new Set<string>();
      for (const [f, info] of Object.entries(fields)) if (info.type === 'single_link' || info.type === 'multi_link') s.add(f);
      schemaLinks.set(t, s);
    }
  }
  return typeof type === 'string' ? schemaLinks.get(type) : undefined;
}

function aliasesOf(el: OwLookupElement): string[] {
  const raw = String(el.name ?? '');
  const full = normalize(raw);
  const out = new Set<string>();
  const add = (s: string) => { const n = normalize(s); if (n && n !== full && words(n).some(isContent)) out.add(n); };
  if (/^the\s/i.test(raw)) add(raw.replace(/^the\s+/i, ''));
  if (/[:(]/.test(raw)) add(raw.split(/[:(]/)[0]);
  if (el.type === 'character') {
    if (/\sof\s/i.test(raw)) add(raw.split(/\sof\s/i)[0]);
    if (raw.includes(',')) add(raw.split(',')[0]);
    const first = words(full)[0];
    if (first && isContent(first)) add(first);
  }
  return [...out];
}

/**
 * Index a world's elements for `lookupWorld` and `renderElement`. Elements
 * without an `id` are left out; a repeated id keeps the last. Build it once
 * per world and again after the world changes.
 */
export function buildWorldIndex<T extends OwLookupElement>(elements: Iterable<T>): OwWorldIndex<T> {
  const byId = new Map<string, T>();
  for (const el of elements) if (el && el.id) byId.set(el.id, el);
  const out = new Map<string, OwLookupLink[]>(), inn = new Map<string, OwLookupLink[]>();
  const unresolved = new Map<string, OwLookupLink[]>();
  const phrase = new Map<string, { id: string; kind: 'name' | 'alias' }[]>();
  const tokenIds = new Map<string, Set<string>>();
  const nameWords = new Map<string, string[]>();
  const textIds = new Map<string, Set<string>>();
  const pushTo = <V>(m: Map<string, V[]>, k: string, v: V) => { if (!m.has(k)) m.set(k, []); m.get(k)!.push(v); };

  for (const el of byId.values()) {
    const schema = linkFieldsOf(el.type);
    const linkFields = new Set<string>();
    for (const [field, v] of Object.entries(el)) {
      if (field === 'id') continue;
      const vals = Array.isArray(v) ? v : [v];
      if (!vals.length) continue;
      if (schema?.has(field)) {
        const ids = vals.filter((x): x is string => typeof x === 'string' && x !== '');
        if (!ids.length) continue;
        linkFields.add(field);
        for (const id of ids) {
          if (byId.has(id)) { pushTo(out, el.id, { field, id }); pushTo(inn, id, { field, id: el.id }); }
          else pushTo(unresolved, el.id, { field, id });
        }
        continue;
      }
      if (!vals.every((x) => typeof x === 'string' && ID_SHAPE.test(x))) continue;
      for (const id of vals as string[]) {
        if (byId.has(id)) { pushTo(out, el.id, { field, id }); pushTo(inn, id, { field, id: el.id }); }
        else pushTo(unresolved, el.id, { field, id });
      }
    }
    // step 6: the element's other text and numbers
    if (!SPATIAL.has(el.type)) {
      const tw = new Set<string>();
      for (const [field, v] of Object.entries(el)) {
        if (TEXT_SKIP.has(field) || linkFields.has(field) || field.startsWith('atlas_')) continue;
        const vals = Array.isArray(v) ? v : [v];
        for (const x of vals) {
          if (typeof x === 'number' && Number.isFinite(x)) tw.add(String(x));
          else if (typeof x === 'string' && x && !ID_SHAPE.test(x)) {
            for (const w of words(normalize(x))) if (isContent(w) || /^\d+$/.test(w)) tw.add(w);
          }
        }
      }
      for (const w of tw) { if (!textIds.has(w)) textIds.set(w, new Set()); textIds.get(w)!.add(el.id); }
    }
    const full = normalize(el.name);
    if (!full) continue;
    pushTo(phrase, full, { id: el.id, kind: 'name' as const });
    for (const a of aliasesOf(el)) pushTo(phrase, a, { id: el.id, kind: 'alias' as const });
    const cw = [...new Set(words(full).filter(isContent))];
    nameWords.set(el.id, cw);
    for (const w of cw) { if (!tokenIds.has(w)) tokenIds.set(w, new Set()); tokenIds.get(w)!.add(el.id); }
  }
  const N = byId.size || 1;
  const idf = new Map<string, number>();
  for (const [w, ids] of tokenIds) idf.set(w, Math.log(1 + N / ids.size));
  const textIdf = new Map<string, number>();
  for (const [w, ids] of textIds) textIdf.set(w, Math.log(1 + N / ids.size));
  return { byId, out, inn, unresolved, phrase, tokenIds, nameWords, idf, textIds, textIdf };
}

function similarWords(w: string, vocab: ReadonlyMap<string, unknown>): string[] {
  const res: string[] = [];
  if (vocab.has(w)) res.push(w);
  if (w.length >= 5 && !/^\d+$/.test(w)) {
    for (const t of vocab.keys()) {
      if (t === w || t.length < 5) continue;
      const p = Math.min(w.length, t.length);
      if (p >= 5 && Math.abs(w.length - t.length) <= 3 && (t.startsWith(w) || w.startsWith(t))) res.push(t);
    }
  }
  return res;
}

interface Candidate { score: number; direct: number; reasons: OwLookupReason[]; kinded?: boolean }

/**
 * The elements a question is most likely about, best first (`limit`, default
 * 8). Names rank first, then elements one link away from a named one, then
 * elements whose other text holds the question's words. An empty question
 * returns no hits.
 */
export function lookupWorld<T extends OwLookupElement>(
  index: OwWorldIndex<T>, question: string, { limit = 8 }: OwLookupOptions = {},
): OwLookupHit<T>[] {
  const seeds = 12;
  const q = words(normalize(question));
  const qSet = new Set(q);
  const cand = new Map<string, Candidate>();
  const bump = (id: string, score: number, reason: OwLookupReason, direct: boolean) => {
    const c = cand.get(id) || { score: 0, direct: 0, reasons: [] };
    c.reasons.push(reason);
    if (score > c.score) c.score = score;
    if (direct && score > c.direct) c.direct = score;
    cand.set(id, c);
  };
  const qUsed = new Map<string, Set<string>>(); // question words an element's name already matched
  const useWords = (id: string, ws: string[]) => {
    if (!qUsed.has(id)) qUsed.set(id, new Set());
    for (const w of ws) qUsed.get(id)!.add(w);
  };

  // 1-2: phrases (n-grams of the question, up to 8 words)
  for (let n = Math.min(8, q.length); n >= 1; n--) {
    for (let i = 0; i + n <= q.length; i++) {
      const g = q.slice(i, i + n);
      if (n === 1 && !isContent(g[0])) continue;
      const hits = index.phrase.get(g.join(' '));
      if (!hits) continue;
      for (const h of hits) {
        const base = h.kind === 'name' ? 100 : 80;
        bump(h.id, base + 10 * n, { kind: h.kind, text: g.join(' ') }, true);
        useWords(h.id, g);
      }
    }
  }
  // 3: name words
  const matched = new Map<string, Set<string>>();
  for (const w of qSet) {
    if (!isContent(w)) continue;
    for (const t of similarWords(w, index.tokenIds)) {
      for (const id of index.tokenIds.get(t)!) {
        if (!matched.has(id)) matched.set(id, new Set());
        matched.get(id)!.add(t);
        useWords(id, [w]);
      }
    }
  }
  for (const [id, ws] of matched) {
    const nw = index.nameWords.get(id) || [];
    const tot = nw.reduce((s, w) => s + index.idf.get(w)!, 0) || 1;
    const got = [...ws].reduce((s, w) => s + index.idf.get(w)!, 0);
    const score = 20 + 40 * (got / tot);
    const c = cand.get(id);
    if (!c || c.direct < score) bump(id, score, { kind: 'word', text: [...ws].join(' ') }, true);
  }
  // 4 (direct hits): kind bonus before seeding
  const kindBonus = (id: string): number => {
    const el = index.byId.get(id)!;
    const kw = new Set(words(normalize(`${el.supertype ?? ''} ${el.subtype ?? ''}`)).filter(isContent));
    const used = qUsed.get(id);
    for (const w of qSet) {
      if (used?.has(w)) continue;
      if (kw.has(w) || [...kw].some((k) => k.length >= 5 && w.length >= 5 && (k.startsWith(w) || w.startsWith(k)))) {
        useWords(id, [w]);
        return 15;
      }
    }
    return 0;
  };
  for (const [id, c] of cand) { const b = kindBonus(id); if (b) { c.score += b; c.direct += b; c.kinded = true; } }

  // 5: one link step from the best direct hits
  const hintFields = new Set<string>();
  for (const w of qSet) for (const f of FIELD_HINTS[w] || []) hintFields.add(f);
  const seedList = [...cand.entries()].filter(([, c]) => c.direct > 0)
    .sort((a, b) => b[1].direct - a[1].direct).slice(0, seeds);
  for (const [sid, sc] of seedList) {
    const sname = index.byId.get(sid)!.name;
    for (const { field, id } of index.out.get(sid) || []) {
      const m = hintFields.has(field) ? 1.5 : 1;
      bump(id, sc.direct * 0.6 * m, { kind: 'link', dir: 'out', field, from: sname, fromId: sid }, false);
    }
    for (const { field, id } of index.inn.get(sid) || []) {
      const m = hintFields.has(field) ? 1.5 : 1;
      bump(id, sc.direct * 0.45 * m, { kind: 'link', dir: 'in', field, from: sname, fromId: sid }, false);
    }
  }
  for (const [id, c] of cand) {
    if (!c.kinded) { const b = kindBonus(id); if (b && c.direct === 0) c.score += b; }
  }
  // 6: text and numbers beyond the name
  const textHits = new Map<string, Map<string, number>>(); // id -> question word -> rarity
  for (const w of qSet) {
    if (!isContent(w) && !/^\d+$/.test(w)) continue;
    for (const t of similarWords(w, index.textIds)) {
      const f = index.textIdf.get(t)!;
      for (const id of index.textIds.get(t)!) {
        if (!textHits.has(id)) textHits.set(id, new Map());
        const m = textHits.get(id)!;
        if (!((m.get(w) ?? NaN) >= f)) m.set(w, f);
      }
    }
  }
  for (const [id, m] of textHits) {
    const used = qUsed.get(id);
    const ws = [...m.keys()].filter((w) => !used?.has(w));
    if (!ws.length) continue;
    const raw = 3 * ws.reduce((s, w) => s + m.get(w)!, 0);
    const reason: OwLookupReason = { kind: 'text', text: ws.join(' ') };
    const c = cand.get(id);
    if (c) { c.score += raw; c.reasons.push(reason); }
    else cand.set(id, { score: 19 * (1 - Math.exp(-raw / 30)), direct: 0, reasons: [reason] });
  }
  // 7: map furniture
  for (const [id, c] of cand) if (SPATIAL.has(index.byId.get(id)!.type)) c.score *= 0.85;
  return [...cand.entries()]
    .map(([id, c]) => ({ element: index.byId.get(id)!, score: Math.round(c.score * 10) / 10, reasons: c.reasons }))
    .sort((a, b) => b.score - a.score
      || String(a.element.name).length - String(b.element.name).length || (a.element.id < b.element.id ? -1 : 1))
    .slice(0, limit);
}

/**
 * A compact text card for one element, for a person or a model: name, type,
 * kind, description, its fields, its links by name (or how many point outside
 * the data), and what links to it.
 */
export function renderElement<T extends OwLookupElement>(
  element: T, index: OwWorldIndex<T>, { descMax = 500, linkMax = 12, incomingMax = 10 }: OwRenderOptions = {},
): string {
  const el = element;
  const name = (id: string): string => index.byId.get(id)?.name ?? '?';
  const kind = [el.supertype, el.subtype].filter((x) => x && x !== 'undefined').join(' / ');
  const lines = [`${el.name} (${el.type}${kind ? `; ${kind}` : ''})`];
  if (el.description) {
    const d = String(el.description);
    lines.push(`description: ${d.length > descMax ? d.slice(0, descMax) + '...' : d}`);
  }
  const outBy = new Map<string, string[]>();
  for (const { field, id } of index.out.get(el.id) || []) {
    if (!outBy.has(field)) outBy.set(field, []);
    outBy.get(field)!.push(name(id));
  }
  const unres = new Map<string, number>();
  for (const { field } of index.unresolved.get(el.id) || []) unres.set(field, (unres.get(field) || 0) + 1);
  for (const [field, v] of Object.entries(el)) {
    if (RENDER_SKIP.has(field) || field.startsWith('atlas_')) continue;
    // a custom field reads by its own name: Atlas and Lantern store "Eye colour" as x_eye_colour
    const custom = field.startsWith('x_');
    const label = custom ? field.slice(2).replace(/_/g, ' ') : field;
    if (outBy.has(field) || unres.has(field)) {
      const names = outBy.get(field) || [];
      let s = names.slice(0, linkMax).join(', ');
      if (names.length > linkMax) s += ` (+${names.length - linkMax} more)`;
      const u = unres.get(field);
      if (u) s += `${s ? '; ' : ''}${u} linked element(s) not present in the world data`;
      lines.push(`${label}: ${s}`);
      continue;
    }
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v))) continue;
    const s = Array.isArray(v) ? v.join(', ') : String(v);
    lines.push(`${label}: ${custom && s.length > descMax ? s.slice(0, descMax) + '...' : s}`);
  }
  const inBy = new Map<string, (string | undefined)[]>();
  for (const { field, id } of index.inn.get(el.id) || []) {
    const src = index.byId.get(id)!;
    if (SPATIAL.has(src.type)) continue;
    const k = `${src.type}.${field}`;
    if (!inBy.has(k)) inBy.set(k, []);
    inBy.get(k)!.push(src.name);
  }
  for (const [k, names] of inBy) {
    let s = names.slice(0, incomingMax).join(', ');
    if (names.length > incomingMax) s += ` (+${names.length - incomingMax} more)`;
    lines.push(`linked from (${k}): ${s}`);
  }
  return lines.join('\n');
}
