/**
 * Field labels: the one rule for turning a field name into the words a tool shows.
 *
 * Presentation, not the standard: the schema never carries a label. The house rule
 * (OW Style, the Captain 2026-10-20, h63 #8074; Studio/style/RULES.md) is sentence case
 * with acronyms kept: "birth_date" → "Birth date", "image_url" → "Image URL". Seeded
 * from Atlas's humanizeFieldName as of 1.59.1 (Temper, h63 #8119), so Atlas, Lantern
 * and Council read one copy instead of three.
 */

/** Words shown in capitals wherever they fall in a label. */
export const FIELD_ACRONYMS: readonly string[] = Object.freeze([
  'url', 'id', 'api', 'ui', 'ip', 'html', 'http', 'dns', 'uuid', 'sdk', 'pin', 'gps',
]);

const ACRONYM_SET = new Set(FIELD_ACRONYMS);

/**
 * A field name as a label: split on `_`, the first word capitalised, every other word
 * lowercase, an acronym in capitals wherever it falls ("image_url" → "Image URL",
 * "url" → "URL", "time_range_current" → "Time range current").
 *
 * The name is taken as given: a tool that hides an extension prefix (`atlas_`, `x_`,
 * `shadow_`) drops it before calling this.
 */
export function fieldLabel(name: string): string {
  return name
    .split('_')
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (ACRONYM_SET.has(lower)) return lower.toUpperCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}
