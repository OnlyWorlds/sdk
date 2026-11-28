import { FIELD_SCHEMA } from './types.generated';

/** One value of the wrong kind in a standard field (since 4.222.0): what `kindFaults` answers, field by field. */
export interface OwKindFault {
  /** The field's key, as the element holds it. */
  field: string;
  /** What the field takes: `integer` (a whole number) or `text` (a string). */
  kind: 'integer' | 'text';
  /** The value the element holds there, as it is. */
  value: unknown;
}

/**
 * A write refused before sending for a value of the wrong kind (since 4.223.0): what `create`, `upsert`,
 * `patch`, `bulk` and `propose` throw for the first fault `kindFaults` names. It extends TypeError, so a
 * catch of TypeError still holds it; `instanceof OwKindError` tells it from any other refusal, and from a
 * dropped connection, which the client throws as `OwNetworkError`. Nothing was sent.
 */
export class OwKindError extends TypeError {
  /** The element type the write was for, as passed. */
  readonly type: string;
  /** The first fault, as `kindFaults` names it. */
  readonly fault: OwKindFault;
  constructor(message: string, type: string, fault: OwKindFault) {
    super(message);
    this.name = 'OwKindError';
    this.type = type;
    this.fault = fault;
  }
}

/**
 * Every standard field of `element` that holds a value onlyworlds.com would store as something else
 * (since 4.222.0), in the element's own key order; `[]` when there is none. keel is lenient by design:
 * it stores `int(value)` for an integer field (`2.5` as `2`, `"7"` as `7`, `true` as `1`) and the text
 * of any other value in a text field (a list as `"['a', 'b']"`, `12` as `"12"`), each with a 200. So an
 * integer field takes a whole number (`2.0` is one; never a boolean or a string), a text field a string,
 * each or null; a NaN or an infinity is a fault of either. An extension, a link field and a type outside
 * the standard are not read. The writes (`create`, `upsert`, `patch`, `bulk`, `propose`) refuse the
 * first fault with an `OwKindError` (a TypeError) before sending; this names them all and never throws for a value, so a
 * tool can show which element and field before a write. `element` that is not an object answers `[]`.
 */
export function kindFaults(type: string, element: unknown): OwKindFault[] {
  const fields = (FIELD_SCHEMA as Record<string, Record<string, { type: string }> | undefined>)[type];
  if (!fields || !element || typeof element !== 'object' || Array.isArray(element)) return [];
  const faults: OwKindFault[] = [];
  for (const [field, value] of Object.entries(element as Record<string, unknown>)) {
    const kind = Object.prototype.hasOwnProperty.call(fields, field) ? fields[field]?.type : undefined;
    if (value === null || value === undefined) continue;
    if (kind === 'integer' && !(typeof value === 'number' && Number.isInteger(value))) faults.push({ field, kind, value });
    else if (kind === 'text' && typeof value !== 'string') faults.push({ field, kind, value });
  }
  return faults;
}
