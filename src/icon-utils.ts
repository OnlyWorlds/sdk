// Icon utilities for OnlyWorlds SDK
// Bridges the gap between plural SDK client names and singular ElementType keys

import { ElementType, ELEMENT_ICONS } from './types';

/**
 * Maps plural SDK client names to singular ElementType values
 * Handles irregular plurals (phenomena, species)
 */
const PLURAL_TO_SINGULAR: Record<string, ElementType> = {
  abilities: ElementType.Ability,
  characters: ElementType.Character,
  collectives: ElementType.Collective,
  constructs: ElementType.Construct,
  creatures: ElementType.Creature,
  events: ElementType.Event,
  families: ElementType.Family,
  institutions: ElementType.Institution,
  languages: ElementType.Language,
  laws: ElementType.Law,
  locations: ElementType.Location,
  maps: ElementType.Map,
  markers: ElementType.Marker,
  narratives: ElementType.Narrative,
  objects: ElementType.Object,
  phenomena: ElementType.Phenomenon,  // irregular plural
  pins: ElementType.Pin,
  relations: ElementType.Relation,
  species: ElementType.Species,       // same singular/plural
  titles: ElementType.Title,
  traits: ElementType.Trait,
  zones: ElementType.Zone,
};

/**
 * Get Material Design icon name for an element type
 * Accepts multiple formats: 'character', 'characters', 'Character', etc.
 *
 * @param type - Element type in any format (singular, plural, any case)
 * @returns Material icon name (e.g., 'person', 'castle', 'thunderstorm')
 *
 * @example
 * getElementIcon('character')   // 'person'
 * getElementIcon('characters')  // 'person'
 * getElementIcon('Character')   // 'person'
 * getElementIcon('phenomena')   // 'thunderstorm'
 */
export function getElementIcon(type: string): string {
  const lower = type.toLowerCase();

  // Check if it's a plural SDK client name
  if (lower in PLURAL_TO_SINGULAR) {
    return ELEMENT_ICONS[PLURAL_TO_SINGULAR[lower]];
  }

  // Check if it's a singular ElementType name (case-insensitive)
  const singular = Object.values(ElementType).find(
    (et) => et.toLowerCase() === lower
  );
  if (singular) {
    return ELEMENT_ICONS[singular as ElementType];
  }

  return 'help_outline';
}

// Re-export ELEMENT_ICONS for direct access
export { ELEMENT_ICONS } from './types';
