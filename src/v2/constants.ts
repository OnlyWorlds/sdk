// Ported from the v1 tables 2026-07-23 (4.0 Wave 2); keyed on the v2 slug union;
// contents byte-identical except number→integer normalization (see CHANGELOG
// migration note). NEXT: these become codegen-emitted when the corresponding keel
// wrapper keys land (icons:/sections: — like family:).

import type { ElementType } from './types.generated';
import { ELEMENT_TYPES } from './types.generated';



/**
 * Current OnlyWorlds version
 * Synced with https://github.com/OnlyWorlds/OnlyWorlds/blob/main/VERSION
 */
export const ONLYWORLDS_VERSION = '00.30.00' as const;

/**
 * Field type definitions for OnlyWorlds elements
 */
export type FieldType =
  | 'text'           // Text fields
  | 'integer'        // Positive integers
  | 'integer_max'    // Positive integers with max value
  | 'single_link'    // Single element reference
  | 'multi_link';    // Array of element references

/**
 * Field metadata structure
 */
export interface FieldInfo {
  type: FieldType;
  target?: string;    // For link fields: target element type
  max?: number;       // For integer_max fields: maximum value
  required?: boolean; // True if the field is required per canonical YAML schema
}

/**
 * Section metadata for OnlyWorlds elements
 * Source: sectioned_schema.json
 */
export interface SectionInfo {
  name: string;
  order: number;
  fields: string[];
}


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

export const ELEMENT_SECTIONS: Record<ElementType, SectionInfo[]> = {
  ability: [
    { name: 'Mechanics', order: 1, fields: ["activation", "duration", "potency", "range", "effects", "challenges", "talents", "requisites"] },
    { name: 'World', order: 2, fields: ["prevalence", "tradition", "source", "locus", "instruments", "systems"] },
  ],
  character: [
    { name: 'Constitution', order: 1, fields: ["physicality", "mentality", "height", "weight", "species", "traits", "abilities"] },
    { name: 'Origins', order: 2, fields: ["background", "motivations", "birth_date", "birthplace", "languages"] },
    { name: 'World', order: 3, fields: ["reputation", "location", "objects", "institutions"] },
    { name: 'Personality', order: 4, fields: ["charisma", "coercion", "competence", "compassion", "creativity", "courage"] },
    { name: 'Social', order: 5, fields: ["family", "friends", "rivals"] },
    { name: 'TTRPG', order: 6, fields: ["level", "hit_points", "STR", "DEX", "CON", "INT", "WIS", "CHA"] },
  ],
  collective: [
    { name: 'Formation', order: 1, fields: ["composition", "count", "formation_date", "operator", "equipment"] },
    { name: 'Dynamics', order: 2, fields: ["activity", "disposition", "state", "abilities", "symbolism"] },
    { name: 'World', order: 3, fields: ["species", "characters", "creatures", "phenomena"] },
  ],
  construct: [
    { name: 'Nature', order: 1, fields: ["rationale", "history", "status", "reach", "start_date", "end_date", "founder", "custodian"] },
    { name: 'Involves', order: 2, fields: ["characters", "objects", "locations", "species", "creatures", "institutions", "traits", "collectives", "zones", "abilities", "phenomena", "languages", "families", "relations", "titles", "constructs", "events", "narratives"] },
  ],
  creature: [
    { name: 'Biology', order: 1, fields: ["appearance", "weight", "height", "species"] },
    { name: 'Behaviour', order: 2, fields: ["habits", "demeanor", "traits", "abilities", "languages"] },
    { name: 'World', order: 3, fields: ["status", "birth_date", "location", "zone"] },
    { name: 'TTRPG', order: 4, fields: ["challenge_rating", "hit_points", "armor_class", "speed", "actions"] },
  ],
  event: [
    { name: 'Nature', order: 1, fields: ["history", "challenges", "consequences", "start_date", "end_date", "triggers"] },
    { name: 'Involves', order: 2, fields: ["characters", "objects", "locations", "species", "creatures", "institutions", "traits", "collectives", "zones", "abilities", "phenomena", "languages", "families", "relations", "titles", "constructs"] },
  ],
  family: [
    { name: 'Identity', order: 1, fields: ["spirit", "history", "traditions", "traits", "abilities", "languages", "ancestors"] },
    { name: 'World', order: 2, fields: ["reputation", "estates", "governs", "heirlooms", "creatures"] },
  ],
  institution: [
    { name: 'Foundation', order: 1, fields: ["doctrine", "founding_date", "parent_institution"] },
    { name: 'Claims', order: 2, fields: ["zones", "objects", "creatures"] },
    { name: 'World', order: 3, fields: ["status", "allies", "adversaries", "constructs"] },
  ],
  language: [
    { name: 'Structure', order: 1, fields: ["phonology", "grammar", "lexicon", "writing", "classification"] },
    { name: 'World', order: 2, fields: ["status", "spread", "dialects"] },
  ],
  law: [
    { name: 'Code', order: 1, fields: ["declaration", "purpose", "date", "parent_law", "penalties"] },
    { name: 'World', order: 2, fields: ["author", "locations", "zones", "prohibitions", "adjudicators", "enforcers"] },
  ],
  location: [
    { name: 'Setting', order: 1, fields: ["form", "function", "founding_date", "parent_location", "populations"] },
    { name: 'Politics', order: 2, fields: ["political_climate", "primary_power", "governing_title", "secondary_powers", "zone", "rival", "partner"] },
    { name: 'World', order: 3, fields: ["customs", "founders", "cults", "delicacies"] },
    { name: 'Production', order: 4, fields: ["extraction_methods", "extraction_goods", "industry_methods", "industry_goods"] },
    { name: 'Commerce', order: 5, fields: ["infrastructure", "extraction_markets", "industry_markets", "currencies"] },
    { name: 'Construction', order: 6, fields: ["architecture", "buildings", "building_methods"] },
    { name: 'Defense', order: 7, fields: ["defensibility", "elevation", "fighters", "defensive_objects"] },
  ],
  map: [
    { name: 'Details', order: 1, fields: ["background_color", "hierarchy", "width", "height", "depth", "parent_map", "location"] },
  ],
  marker: [
    { name: 'Details', order: 1, fields: ["map", "zone", "x", "y", "z", "order"] },
  ],
  narrative: [
    { name: 'Context', order: 1, fields: ["story", "consequences", "start_date", "end_date", "order", "parent_narrative", "protagonist", "antagonist", "narrator", "conservator"] },
    { name: 'Involves', order: 2, fields: ["events", "characters", "objects", "locations", "species", "creatures", "institutions", "traits", "collectives", "zones", "abilities", "phenomena", "languages", "families", "relations", "titles", "constructs", "laws"] },
  ],
  object: [
    { name: 'Form', order: 1, fields: ["aesthetics", "weight", "amount", "parent_object", "materials", "technology"] },
    { name: 'Function', order: 2, fields: ["utility", "effects", "abilities", "consumes"] },
    { name: 'World', order: 3, fields: ["origins", "location", "language", "affinities"] },
  ],
  phenomenon: [
    { name: 'Mechanics', order: 1, fields: ["expression", "effects", "duration", "catalysts", "empowerments"] },
    { name: 'World', order: 2, fields: ["mythology", "system", "triggers", "wielders", "environments"] },
  ],
  pin: [
    { name: 'Details', order: 1, fields: ["map", "element_type", "element_id", "element", "x", "y", "z"] },
  ],
  relation: [
    { name: 'Nature', order: 1, fields: ["background", "start_date", "end_date", "intensity", "actor", "events"] },
    { name: 'Involves', order: 2, fields: ["characters", "objects", "locations", "species", "creatures", "institutions", "traits", "collectives", "zones", "abilities", "phenomena", "languages", "families", "relations", "titles", "constructs", "events", "narratives"] },
  ],
  species: [
    { name: 'Biology', order: 1, fields: ["appearance", "life_span", "weight", "nourishment", "reproduction", "adaptations"] },
    { name: 'Psychology', order: 2, fields: ["instincts", "sociality", "temperament", "communication", "aggression", "traits"] },
    { name: 'World', order: 3, fields: ["role", "parent_species", "locations", "zones", "affinities"] },
  ],
  title: [
    { name: 'Mandate', order: 1, fields: ["authority", "eligibility", "grant_date", "revoke_date", "issuer", "body", "superior_title", "holders", "symbols"] },
    { name: 'World', order: 2, fields: ["status", "history", "characters", "institutions", "families", "zones", "locations", "objects", "constructs", "laws", "collectives", "creatures", "phenomena", "species", "languages"] },
  ],
  trait: [
    { name: 'Qualitative', order: 1, fields: ["social_effects", "physical_effects", "functional_effects", "personality_effects", "behaviour_effects"] },
    { name: 'Quantitative', order: 2, fields: ["charisma", "coercion", "competence", "compassion", "creativity", "courage"] },
    { name: 'World', order: 3, fields: ["significance", "anti_trait", "empowered_abilities"] },
  ],
  zone: [
    { name: 'Scope', order: 1, fields: ["role", "start_date", "end_date", "phenomena", "linked_zones"] },
    { name: 'World', order: 2, fields: ["context", "populations", "titles", "principles"] },
  ]
} as const;

export const ELEMENT_ICONS: Record<ElementType, string> = {
  ability: 'auto_fix_normal',
  character: 'person',
  collective: 'groups_3',
  construct: 'api',
  creature: 'bug_report',
  event: 'saved_search',
  family: 'supervisor_account',
  institution: 'business',
  language: 'edit_road',
  law: 'gpp_bad',
  location: 'castle',
  map: 'map',
  marker: 'place',
  narrative: 'menu_book',
  object: 'webhook',
  phenomenon: 'thunderstorm',
  pin: 'push_pin',
  relation: 'link',
  species: 'crib',
  title: 'military_tech',
  trait: 'flaky',
  zone: 'architecture',
} as const;

export const FIELD_SCHEMA = {
  ability: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Mechanics
    activation: { type: 'text' },
    duration: { type: 'integer' },
    potency: { type: 'integer' },
    range: { type: 'integer' },
    effects: { type: 'multi_link', target: 'phenomenon' },
    challenges: { type: 'text' },
    talents: { type: 'multi_link', target: 'trait' },
    requisites: { type: 'multi_link', target: 'construct' },
    // World
    prevalence: { type: 'text' },
    tradition: { type: 'single_link', target: 'construct' },
    source: { type: 'single_link', target: 'phenomenon' },
    locus: { type: 'single_link', target: 'location' },
    instruments: { type: 'multi_link', target: 'object' },
    systems: { type: 'multi_link', target: 'construct' }
  },
  character: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Constitution
    physicality: { type: 'text' },
    mentality: { type: 'text' },
    height: { type: 'integer' },
    weight: { type: 'integer' },
    species: { type: 'multi_link', target: 'species' },
    traits: { type: 'multi_link', target: 'trait' },
    abilities: { type: 'multi_link', target: 'ability' },
    // Origins
    background: { type: 'text' },
    motivations: { type: 'text' },
    birth_date: { type: 'integer' },
    birthplace: { type: 'single_link', target: 'location' },
    languages: { type: 'multi_link', target: 'language' },
    // World
    reputation: { type: 'text' },
    location: { type: 'single_link', target: 'location' },
    objects: { type: 'multi_link', target: 'object' },
    institutions: { type: 'multi_link', target: 'institution' },
    // Personality
    charisma: { type: 'integer' },
    coercion: { type: 'integer' },
    competence: { type: 'integer' },
    compassion: { type: 'integer' },
    creativity: { type: 'integer' },
    courage: { type: 'integer' },
    // Social
    family: { type: 'multi_link', target: 'family' },
    friends: { type: 'multi_link', target: 'character' },
    rivals: { type: 'multi_link', target: 'character' },
    // TTRPG
    level: { type: 'integer' },
    hit_points: { type: 'integer' },
    STR: { type: 'integer' },
    DEX: { type: 'integer' },
    CON: { type: 'integer' },
    INT: { type: 'integer' },
    WIS: { type: 'integer' },
    CHA: { type: 'integer' }
  },
  collective: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Formation
    composition: { type: 'text' },
    count: { type: 'integer' },
    formation_date: { type: 'integer' },
    operator: { type: 'single_link', target: 'institution' },
    equipment: { type: 'multi_link', target: 'construct' },
    // Dynamics
    activity: { type: 'text' },
    disposition: { type: 'text' },
    state: { type: 'text' },
    abilities: { type: 'multi_link', target: 'ability' },
    symbolism: { type: 'multi_link', target: 'construct' },
    // World
    species: { type: 'multi_link', target: 'species' },
    characters: { type: 'multi_link', target: 'character' },
    creatures: { type: 'multi_link', target: 'creature' },
    phenomena: { type: 'multi_link', target: 'phenomenon' }
  },
  construct: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Nature
    rationale: { type: 'text' },
    history: { type: 'text' },
    status: { type: 'text' },
    reach: { type: 'text' },
    start_date: { type: 'integer' },
    end_date: { type: 'integer' },
    founder: { type: 'single_link', target: 'character' },
    custodian: { type: 'single_link', target: 'institution' },
    // Involves
    characters: { type: 'multi_link', target: 'character' },
    objects: { type: 'multi_link', target: 'object' },
    locations: { type: 'multi_link', target: 'location' },
    species: { type: 'multi_link', target: 'species' },
    creatures: { type: 'multi_link', target: 'creature' },
    institutions: { type: 'multi_link', target: 'institution' },
    traits: { type: 'multi_link', target: 'trait' },
    collectives: { type: 'multi_link', target: 'collective' },
    zones: { type: 'multi_link', target: 'zone' },
    abilities: { type: 'multi_link', target: 'ability' },
    phenomena: { type: 'multi_link', target: 'phenomenon' },
    languages: { type: 'multi_link', target: 'language' },
    families: { type: 'multi_link', target: 'family' },
    relations: { type: 'multi_link', target: 'relation' },
    titles: { type: 'multi_link', target: 'title' },
    constructs: { type: 'multi_link', target: 'construct' },
    events: { type: 'multi_link', target: 'event' },
    narratives: { type: 'multi_link', target: 'narrative' }
  },
  creature: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Biology
    appearance: { type: 'text' },
    weight: { type: 'integer' },
    height: { type: 'integer' },
    species: { type: 'multi_link', target: 'species' },
    // Behaviour
    habits: { type: 'text' },
    demeanor: { type: 'text' },
    traits: { type: 'multi_link', target: 'trait' },
    abilities: { type: 'multi_link', target: 'ability' },
    languages: { type: 'multi_link', target: 'language' },
    // World
    status: { type: 'text' },
    birth_date: { type: 'integer' },
    location: { type: 'single_link', target: 'location' },
    zone: { type: 'single_link', target: 'zone' },
    // TTRPG
    challenge_rating: { type: 'integer' },
    hit_points: { type: 'integer' },
    armor_class: { type: 'integer' },
    speed: { type: 'integer' },
    actions: { type: 'multi_link', target: 'ability' }
  },
  event: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Nature
    history: { type: 'text' },
    challenges: { type: 'text' },
    consequences: { type: 'text' },
    start_date: { type: 'integer' },
    end_date: { type: 'integer' },
    triggers: { type: 'multi_link', target: 'event' },
    // Involves
    characters: { type: 'multi_link', target: 'character' },
    objects: { type: 'multi_link', target: 'object' },
    locations: { type: 'multi_link', target: 'location' },
    species: { type: 'multi_link', target: 'species' },
    creatures: { type: 'multi_link', target: 'creature' },
    institutions: { type: 'multi_link', target: 'institution' },
    traits: { type: 'multi_link', target: 'trait' },
    collectives: { type: 'multi_link', target: 'collective' },
    zones: { type: 'multi_link', target: 'zone' },
    abilities: { type: 'multi_link', target: 'ability' },
    phenomena: { type: 'multi_link', target: 'phenomenon' },
    languages: { type: 'multi_link', target: 'language' },
    families: { type: 'multi_link', target: 'family' },
    relations: { type: 'multi_link', target: 'relation' },
    titles: { type: 'multi_link', target: 'title' },
    constructs: { type: 'multi_link', target: 'construct' }
  },
  family: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Identity
    spirit: { type: 'text' },
    history: { type: 'text' },
    traditions: { type: 'multi_link', target: 'construct' },
    traits: { type: 'multi_link', target: 'trait' },
    abilities: { type: 'multi_link', target: 'ability' },
    languages: { type: 'multi_link', target: 'language' },
    ancestors: { type: 'multi_link', target: 'character' },
    // World
    reputation: { type: 'text' },
    estates: { type: 'multi_link', target: 'location' },
    governs: { type: 'multi_link', target: 'institution' },
    heirlooms: { type: 'multi_link', target: 'object' },
    creatures: { type: 'multi_link', target: 'creature' }
  },
  institution: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Foundation
    doctrine: { type: 'text' },
    founding_date: { type: 'integer' },
    parent_institution: { type: 'single_link', target: 'institution' },
    // Claims
    zones: { type: 'multi_link', target: 'zone' },
    objects: { type: 'multi_link', target: 'object' },
    creatures: { type: 'multi_link', target: 'creature' },
    // World
    status: { type: 'text' },
    allies: { type: 'multi_link', target: 'institution' },
    adversaries: { type: 'multi_link', target: 'institution' },
    constructs: { type: 'multi_link', target: 'construct' }
  },
  language: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Structure
    phonology: { type: 'text' },
    grammar: { type: 'text' },
    lexicon: { type: 'text' },
    writing: { type: 'text' },
    classification: { type: 'single_link', target: 'construct' },
    // World
    status: { type: 'text' },
    spread: { type: 'multi_link', target: 'location' },
    dialects: { type: 'multi_link', target: 'language' }
  },
  law: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Code
    declaration: { type: 'text' },
    purpose: { type: 'text' },
    date: { type: 'integer' },
    parent_law: { type: 'single_link', target: 'law' },
    penalties: { type: 'multi_link', target: 'construct' },
    // World
    author: { type: 'single_link', target: 'institution' },
    locations: { type: 'multi_link', target: 'location' },
    zones: { type: 'multi_link', target: 'zone' },
    prohibitions: { type: 'multi_link', target: 'construct' },
    adjudicators: { type: 'multi_link', target: 'title' },
    enforcers: { type: 'multi_link', target: 'title' }
  },
  location: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Setting
    form: { type: 'text' },
    function: { type: 'text' },
    founding_date: { type: 'integer' },
    parent_location: { type: 'single_link', target: 'location' },
    populations: { type: 'multi_link', target: 'collective' },
    // Politics
    political_climate: { type: 'text' },
    primary_power: { type: 'single_link', target: 'institution' },
    governing_title: { type: 'single_link', target: 'title' },
    secondary_powers: { type: 'multi_link', target: 'institution' },
    zone: { type: 'single_link', target: 'zone' },
    rival: { type: 'single_link', target: 'location' },
    partner: { type: 'single_link', target: 'location' },
    // World
    customs: { type: 'text' },
    founders: { type: 'multi_link', target: 'character' },
    cults: { type: 'multi_link', target: 'construct' },
    delicacies: { type: 'multi_link', target: 'species' },
    // Production
    extraction_methods: { type: 'multi_link', target: 'construct' },
    extraction_goods: { type: 'multi_link', target: 'construct' },
    industry_methods: { type: 'multi_link', target: 'construct' },
    industry_goods: { type: 'multi_link', target: 'construct' },
    // Commerce
    infrastructure: { type: 'text' },
    extraction_markets: { type: 'multi_link', target: 'location' },
    industry_markets: { type: 'multi_link', target: 'location' },
    currencies: { type: 'multi_link', target: 'construct' },
    // Construction
    architecture: { type: 'text' },
    buildings: { type: 'multi_link', target: 'object' },
    building_methods: { type: 'multi_link', target: 'construct' },
    // Defense
    defensibility: { type: 'text' },
    elevation: { type: 'integer' },
    fighters: { type: 'multi_link', target: 'construct' },
    defensive_objects: { type: 'multi_link', target: 'object' }
  },
  map: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Details
    background_color: { type: 'text' },
    hierarchy: { type: 'integer' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    depth: { type: 'integer' },
    parent_map: { type: 'single_link', target: 'map' },
    location: { type: 'single_link', target: 'location' }
  },
  marker: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Details
    map: { type: 'single_link', target: 'map', required: true },
    zone: { type: 'single_link', target: 'zone', required: true },
    x: { type: 'integer', required: true },
    y: { type: 'integer', required: true },
    z: { type: 'integer' },
    order: { type: 'integer', required: true }
  },
  narrative: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Context
    story: { type: 'text' },
    consequences: { type: 'text' },
    start_date: { type: 'integer' },
    end_date: { type: 'integer' },
    order: { type: 'integer' },
    parent_narrative: { type: 'single_link', target: 'narrative' },
    protagonist: { type: 'single_link', target: 'character' },
    antagonist: { type: 'single_link', target: 'character' },
    narrator: { type: 'single_link', target: 'character' },
    conservator: { type: 'single_link', target: 'institution' },
    // Involves
    events: { type: 'multi_link', target: 'event' },
    characters: { type: 'multi_link', target: 'character' },
    objects: { type: 'multi_link', target: 'object' },
    locations: { type: 'multi_link', target: 'location' },
    species: { type: 'multi_link', target: 'species' },
    creatures: { type: 'multi_link', target: 'creature' },
    institutions: { type: 'multi_link', target: 'institution' },
    traits: { type: 'multi_link', target: 'trait' },
    collectives: { type: 'multi_link', target: 'collective' },
    zones: { type: 'multi_link', target: 'zone' },
    abilities: { type: 'multi_link', target: 'ability' },
    phenomena: { type: 'multi_link', target: 'phenomenon' },
    languages: { type: 'multi_link', target: 'language' },
    families: { type: 'multi_link', target: 'family' },
    relations: { type: 'multi_link', target: 'relation' },
    titles: { type: 'multi_link', target: 'title' },
    constructs: { type: 'multi_link', target: 'construct' },
    laws: { type: 'multi_link', target: 'law' }
  },
  object: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Form
    aesthetics: { type: 'text' },
    weight: { type: 'integer' },
    amount: { type: 'integer' },
    parent_object: { type: 'single_link', target: 'object' },
    materials: { type: 'multi_link', target: 'construct' },
    technology: { type: 'multi_link', target: 'construct' },
    // Function
    utility: { type: 'text' },
    effects: { type: 'multi_link', target: 'phenomenon' },
    abilities: { type: 'multi_link', target: 'ability' },
    consumes: { type: 'multi_link', target: 'construct' },
    // World
    origins: { type: 'text' },
    location: { type: 'single_link', target: 'location' },
    language: { type: 'single_link', target: 'language' },
    affinities: { type: 'multi_link', target: 'trait' }
  },
  phenomenon: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Mechanics
    expression: { type: 'text' },
    effects: { type: 'text' },
    duration: { type: 'integer' },
    catalysts: { type: 'multi_link', target: 'object' },
    empowerments: { type: 'multi_link', target: 'ability' },
    // World
    mythology: { type: 'text' },
    system: { type: 'single_link', target: 'phenomenon' },
    triggers: { type: 'multi_link', target: 'construct' },
    wielders: { type: 'multi_link', target: 'character' },
    environments: { type: 'multi_link', target: 'location' }
  },
  pin: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Details
    map: { type: 'single_link', target: 'map', required: true },
    element_type: { type: 'text', required: true }, // ElementType enum value; YAML 'element' generic-link is split into _type + _id
    element_id: { type: 'single_link', target: 'any', required: true }, // Can reference any element
    x: { type: 'integer', required: true },
    y: { type: 'integer', required: true },
    z: { type: 'integer' }
  },
  relation: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Nature
    background: { type: 'text' },
    start_date: { type: 'integer' },
    end_date: { type: 'integer' },
    intensity: { type: 'integer' },
    actor: { type: 'single_link', target: 'character' },
    events: { type: 'multi_link', target: 'event' },
    // Involves
    characters: { type: 'multi_link', target: 'character' },
    objects: { type: 'multi_link', target: 'object' },
    locations: { type: 'multi_link', target: 'location' },
    species: { type: 'multi_link', target: 'species' },
    creatures: { type: 'multi_link', target: 'creature' },
    institutions: { type: 'multi_link', target: 'institution' },
    traits: { type: 'multi_link', target: 'trait' },
    collectives: { type: 'multi_link', target: 'collective' },
    zones: { type: 'multi_link', target: 'zone' },
    abilities: { type: 'multi_link', target: 'ability' },
    phenomena: { type: 'multi_link', target: 'phenomenon' },
    languages: { type: 'multi_link', target: 'language' },
    families: { type: 'multi_link', target: 'family' },
    relations: { type: 'multi_link', target: 'relation' },
    titles: { type: 'multi_link', target: 'title' },
    constructs: { type: 'multi_link', target: 'construct' },
    narratives: { type: 'multi_link', target: 'narrative' }
  },
  species: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Biology
    appearance: { type: 'text' },
    life_span: { type: 'integer' },
    weight: { type: 'integer' },
    nourishment: { type: 'multi_link', target: 'species' },
    reproduction: { type: 'multi_link', target: 'construct' },
    adaptations: { type: 'multi_link', target: 'ability' },
    // Psychology
    instincts: { type: 'text' },
    sociality: { type: 'text' },
    temperament: { type: 'text' },
    communication: { type: 'text' },
    aggression: { type: 'integer' },
    traits: { type: 'multi_link', target: 'trait' },
    // World
    role: { type: 'text' },
    parent_species: { type: 'single_link', target: 'species' },
    locations: { type: 'multi_link', target: 'location' },
    zones: { type: 'multi_link', target: 'zone' },
    affinities: { type: 'multi_link', target: 'phenomenon' }
  },
  title: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Mandate
    authority: { type: 'text' },
    eligibility: { type: 'text' },
    grant_date: { type: 'integer' },
    revoke_date: { type: 'integer' },
    issuer: { type: 'single_link', target: 'institution' },
    body: { type: 'single_link', target: 'institution' },
    superior_title: { type: 'single_link', target: 'title' },
    holders: { type: 'multi_link', target: 'character' },
    symbols: { type: 'multi_link', target: 'object' },
    // World
    status: { type: 'text' },
    history: { type: 'text' },
    characters: { type: 'multi_link', target: 'character' },
    institutions: { type: 'multi_link', target: 'institution' },
    families: { type: 'multi_link', target: 'family' },
    zones: { type: 'multi_link', target: 'zone' },
    locations: { type: 'multi_link', target: 'location' },
    objects: { type: 'multi_link', target: 'object' },
    constructs: { type: 'multi_link', target: 'construct' },
    laws: { type: 'multi_link', target: 'law' },
    collectives: { type: 'multi_link', target: 'collective' },
    creatures: { type: 'multi_link', target: 'creature' },
    phenomena: { type: 'multi_link', target: 'phenomenon' },
    species: { type: 'multi_link', target: 'species' },
    languages: { type: 'multi_link', target: 'language' }
  },
  trait: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Qualitative
    social_effects: { type: 'text' },
    physical_effects: { type: 'text' },
    functional_effects: { type: 'text' },
    personality_effects: { type: 'text' },
    behaviour_effects: { type: 'text' },
    // Quantitative
    charisma: { type: 'integer' },
    coercion: { type: 'integer' },
    competence: { type: 'integer' },
    compassion: { type: 'integer' },
    creativity: { type: 'integer' },
    courage: { type: 'integer' },
    // World
    significance: { type: 'text' },
    anti_trait: { type: 'single_link', target: 'trait' },
    empowered_abilities: { type: 'multi_link', target: 'ability' }
  },
  zone: {
    // Base fields (shared by all elements)
    name: { type: 'text', required: true },
    description: { type: 'text', required: false },
    supertype: { type: 'text', required: false },
    subtype: { type: 'text', required: false },
    image_url: { type: 'text', required: false },

        // Scope
    role: { type: 'text' },
    start_date: { type: 'integer' },
    end_date: { type: 'integer' },
    phenomena: { type: 'multi_link', target: 'phenomenon' },
    linked_zones: { type: 'multi_link', target: 'zone' },
    // World
    context: { type: 'text' },
    populations: { type: 'multi_link', target: 'collective' },
    titles: { type: 'multi_link', target: 'title' },
    principles: { type: 'multi_link', target: 'construct' }
  }
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
