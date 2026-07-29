// Ported from the v1 tables 2026-07-23 (4.0 Wave 2); keyed on the v2 slug union;
// contents byte-identical except number→integer normalization (see CHANGELOG
// migration note). NEXT: these become codegen-emitted when the corresponding keel
// wrapper keys land (icons:/sections: — like family:).

import type { ElementType } from './types.generated';
import { ELEMENT_TYPES, ELEMENT_ICONS, ELEMENT_SECTIONS, ONLYWORLDS_VERSION, FIELD_SCHEMA } from './types.generated';
// Icons + sections are GENERATED since 4.0: icon: is a keel wrapper key (56c124a),
// sections derive from the canonical document structure (Skeld ruling 2026-07-23).
// FIELD_SCHEMA joined them on 2026-07-29 — it was the last hand-maintained table
// in this file and the only publicly-exported one with no comparison to schema.
export { ELEMENT_ICONS, ELEMENT_SECTIONS, ONLYWORLDS_VERSION, FIELD_SCHEMA };
export type { SectionInfo, FieldType, FieldInfo } from './types.generated';



/**
 * Current OnlyWorlds version
 * Synced with https://github.com/OnlyWorlds/OnlyWorlds/blob/main/VERSION
 */
// ONLYWORLDS_VERSION is generated since 4.0 (canonical VERSION file via keel schema/).

export const ELEMENT_LABELS: Record<ElementType, string> = {
  ability: 'Abilities',
  character: 'Characters',
  collective: 'Collectives',
  construct: 'Constructs',
  creature: 'Creatures',
  event: 'Events',
  family: 'Families',
  institution: 'Institutions',
  language: 'Languages',
  law: 'Laws',
  location: 'Locations',
  map: 'Maps',
  marker: 'Markers',
  narrative: 'Narratives',
  object: 'Objects',
  phenomenon: 'Phenomena',
  pin: 'Pins',
  relation: 'Relations',
  species: 'Species',
  title: 'Titles',
  trait: 'Traits',
  zone: 'Zones',
} as const;



/**
 * Maps plural SDK client names to singular ElementType values
 * Handles irregular plurals (phenomena, species)
 */
const PLURAL_TO_SINGULAR: Record<string, ElementType> = {
  abilities: 'ability',
  characters: 'character',
  collectives: 'collective',
  constructs: 'construct',
  creatures: 'creature',
  events: 'event',
  families: 'family',
  institutions: 'institution',
  languages: 'language',
  laws: 'law',
  locations: 'location',
  maps: 'map',
  markers: 'marker',
  narratives: 'narrative',
  objects: 'object',
  phenomena: 'phenomenon',  // irregular plural
  pins: 'pin',
  relations: 'relation',
  species: 'species',       // same singular/plural
  titles: 'title',
  traits: 'trait',
  zones: 'zone',
};

/**
 * Get Material Design icon name for an element type
 * Accepts multiple formats: 'character', 'characters', 'Character', etc.
 *
 * @param type - Element type in any format (singular, plural, any case)
 * @returns Material icon name (e.g., 'person', 'castle', 'thunderstorm')
 */
export function getElementIcon(type: string): string {
  const lower = type.toLowerCase();

  // Check if it's a plural SDK client name
  if (lower in PLURAL_TO_SINGULAR) {
    return ELEMENT_ICONS[PLURAL_TO_SINGULAR[lower]];
  }

  // Check if it's a singular ElementType name (case-insensitive)
  const singular = ELEMENT_TYPES.find((et) => et.toLowerCase() === lower);
  if (singular) {
    return ELEMENT_ICONS[singular];
  }

  return 'help_outline';
}


/** Plural display label for an element type (e.g. phenomenon → "Phenomena"). */
export function getElementLabel(elementType: ElementType): string {
  return ELEMENT_LABELS[elementType];
}
