// GENERATED from OnlyWorlds canonical schema YAML -- do not hand-edit. Regenerate: python codegen/generate_types.py
//
// One interface per element type, extending OwElementBase. Field shapes are the v2
// wire shapes: single-links are `string | null`, multi-links `string[]`, ints
// `number | null`. Link fields use bare schema names (no `_ids` suffix). The four
// server-managed fields (type, created_at, updated_at, change_seq) and the
// extension index signature live on OwElementBase.

/** Every element carries these. The extension index signature admits namespaced
 *  pass-through fields (atlas_* / shadow_* / x_*) returned verbatim by the server. */
export interface OwElementBase {
  /** Element type slug (server-managed, read-only). */
  type: string;
  /** Unique identifier, uuidv7 format. */
  id: string;
  /** Name of the element. */
  name: string;
  /** Any kind of details about the element. */
  description?: string;
  /** The top level category to which the element belongs. */
  supertype?: string;
  /** The sub level category through which the element is further classified. */
  subtype?: string;
  /** URL to an image representing the element. */
  image_url?: string;
  /** Creation timestamp (server-managed, read-only). */
  created_at?: string;
  /** Last-update timestamp (server-managed, read-only). */
  updated_at?: string;
  /** Per-world change cursor, stamped on every write (server-managed, read-only). */
  change_seq?: number;
  /** Namespaced extension fields (atlas_* / shadow_* / x_*), returned verbatim. */
  [ext: string]: unknown;
}


export type ElementType = 'ability' | 'character' | 'collective' | 'construct' | 'creature' | 'event' | 'family' | 'institution' | 'language' | 'law' | 'location' | 'map' | 'marker' | 'narrative' | 'object' | 'phenomenon' | 'pin' | 'relation' | 'species' | 'title' | 'trait' | 'zone';

export const ELEMENT_TYPES: ElementType[] = ['ability', 'character', 'collective', 'construct', 'creature', 'event', 'family', 'institution', 'language', 'law', 'location', 'map', 'marker', 'narrative', 'object', 'phenomenon', 'pin', 'relation', 'species', 'title', 'trait', 'zone'];

/** The four semantic families (colour carries the family; ELEMENT_ICONS carries the type). */
export type ElementFamily = 'agents' | 'world' | 'abstract' | 'temporal';

/** Per-type semantic family. Source: keel's PRESENTATION-WRAPPER schema key `family:`
 *  (first-party rendering metadata, keel-only — NOT part of the council-governed
 *  OnlyWorlds standard; see keel/schema-pipeline.md "The wrapper layer"). */
export const ELEMENT_FAMILIES: Record<ElementType, ElementFamily> = {
  ability: 'abstract',
  character: 'agents',
  collective: 'agents',
  construct: 'world',
  creature: 'agents',
  event: 'temporal',
  family: 'agents',
  institution: 'agents',
  language: 'abstract',
  law: 'abstract',
  location: 'world',
  map: 'world',
  marker: 'world',
  narrative: 'temporal',
  object: 'world',
  phenomenon: 'temporal',
  pin: 'world',
  relation: 'temporal',
  species: 'agents',
  title: 'abstract',
  trait: 'abstract',
  zone: 'world',
};

/** Material Symbols icon name per type. Source: keel's PRESENTATION-WRAPPER key `icon:` (keel 56c124a). */
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
};

/** Field grouping for display. DERIVED from the canonical schema's own document
 *  structure (top-level property groups, document order = display order). */
export interface SectionInfo { name: string; order: number; fields: string[]; }

export const ELEMENT_SECTIONS: Record<ElementType, SectionInfo[]> = {
  ability: [
    { name: 'Mechanics', order: 1, fields: ['activation', 'duration', 'potency', 'range', 'effects', 'challenges', 'talents', 'requisites'] },
    { name: 'World', order: 2, fields: ['prevalence', 'tradition', 'source', 'locus', 'instruments', 'systems'] },
  ],
  character: [
    { name: 'Constitution', order: 1, fields: ['physicality', 'mentality', 'height', 'weight', 'species', 'traits', 'abilities'] },
    { name: 'Origins', order: 2, fields: ['background', 'motivations', 'birth_date', 'birthplace', 'languages'] },
    { name: 'World', order: 3, fields: ['reputation', 'location', 'objects', 'institutions'] },
    { name: 'Personality', order: 4, fields: ['charisma', 'coercion', 'competence', 'compassion', 'creativity', 'courage'] },
    { name: 'Social', order: 5, fields: ['family', 'friends', 'rivals'] },
    { name: 'TTRPG', order: 6, fields: ['level', 'hit_points', 'STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
  ],
  collective: [
    { name: 'Formation', order: 1, fields: ['composition', 'count', 'formation_date', 'operator', 'equipment'] },
    { name: 'Dynamics', order: 2, fields: ['activity', 'disposition', 'state', 'abilities', 'symbolism'] },
    { name: 'World', order: 3, fields: ['species', 'characters', 'creatures', 'phenomena'] },
  ],
  construct: [
    { name: 'Nature', order: 1, fields: ['rationale', 'history', 'status', 'reach', 'start_date', 'end_date', 'founder', 'custodian'] },
    { name: 'Involves', order: 2, fields: ['characters', 'objects', 'locations', 'species', 'creatures', 'institutions', 'traits', 'collectives', 'zones', 'abilities', 'phenomena', 'languages', 'families', 'relations', 'titles', 'constructs', 'events', 'narratives'] },
  ],
  creature: [
    { name: 'Biology', order: 1, fields: ['appearance', 'weight', 'height', 'species'] },
    { name: 'Behavior', order: 2, fields: ['habits', 'demeanor', 'traits', 'abilities', 'languages'] },
    { name: 'World', order: 3, fields: ['status', 'birth_date', 'location', 'zone'] },
    { name: 'TTRPG', order: 4, fields: ['challenge_rating', 'hit_points', 'armor_class', 'speed', 'actions'] },
  ],
  event: [
    { name: 'Nature', order: 1, fields: ['history', 'challenges', 'consequences', 'start_date', 'end_date', 'triggers'] },
    { name: 'Involves', order: 2, fields: ['characters', 'objects', 'locations', 'species', 'creatures', 'institutions', 'traits', 'collectives', 'zones', 'abilities', 'phenomena', 'languages', 'families', 'relations', 'titles', 'constructs'] },
  ],
  family: [
    { name: 'Identity', order: 1, fields: ['spirit', 'history', 'traditions', 'traits', 'abilities', 'languages', 'ancestors'] },
    { name: 'World', order: 2, fields: ['reputation', 'estates', 'governs', 'heirlooms', 'creatures'] },
  ],
  institution: [
    { name: 'Foundation', order: 1, fields: ['doctrine', 'founding_date', 'parent_institution'] },
    { name: 'Claims', order: 2, fields: ['zones', 'objects', 'creatures'] },
    { name: 'World', order: 3, fields: ['status', 'allies', 'adversaries', 'constructs'] },
  ],
  language: [
    { name: 'Structure', order: 1, fields: ['phonology', 'grammar', 'lexicon', 'writing', 'classification'] },
    { name: 'World', order: 2, fields: ['status', 'spread', 'dialects'] },
  ],
  law: [
    { name: 'Code', order: 1, fields: ['declaration', 'purpose', 'date', 'parent_law', 'penalties'] },
    { name: 'World', order: 2, fields: ['author', 'locations', 'zones', 'prohibitions', 'adjudicators', 'enforcers'] },
  ],
  location: [
    { name: 'Setting', order: 1, fields: ['form', 'function', 'founding_date', 'parent_location', 'populations'] },
    { name: 'Politics', order: 2, fields: ['political_climate', 'primary_power', 'governing_title', 'secondary_powers', 'zone', 'rival', 'partner'] },
    { name: 'World', order: 3, fields: ['customs', 'founders', 'cults', 'delicacies'] },
    { name: 'Production', order: 4, fields: ['extraction_methods', 'extraction_goods', 'industry_methods', 'industry_goods'] },
    { name: 'Commerce', order: 5, fields: ['infrastructure', 'extraction_markets', 'industry_markets', 'currencies'] },
    { name: 'Construction', order: 6, fields: ['architecture', 'buildings', 'building_methods'] },
    { name: 'Defense', order: 7, fields: ['defensibility', 'elevation', 'fighters', 'defensive_objects'] },
  ],
  map: [
    { name: 'Details', order: 1, fields: ['background_color', 'hierarchy', 'width', 'height', 'depth', 'parent_map', 'location'] },
  ],
  marker: [
    { name: 'Details', order: 1, fields: ['map', 'zone', 'x', 'y', 'z', 'order'] },
  ],
  narrative: [
    { name: 'Context', order: 1, fields: ['story', 'consequences', 'start_date', 'end_date', 'order', 'parent_narrative', 'protagonist', 'antagonist', 'narrator', 'conservator'] },
    { name: 'Involves', order: 2, fields: ['events', 'characters', 'objects', 'locations', 'species', 'creatures', 'institutions', 'traits', 'collectives', 'zones', 'abilities', 'phenomena', 'languages', 'families', 'relations', 'titles', 'constructs', 'laws'] },
  ],
  object: [
    { name: 'Form', order: 1, fields: ['aesthetics', 'weight', 'amount', 'parent_object', 'materials', 'technology'] },
    { name: 'Function', order: 2, fields: ['utility', 'effects', 'abilities', 'consumes'] },
    { name: 'World', order: 3, fields: ['origins', 'location', 'language', 'affinities'] },
  ],
  phenomenon: [
    { name: 'Mechanics', order: 1, fields: ['expression', 'effects', 'duration', 'catalysts', 'empowerments'] },
    { name: 'World', order: 2, fields: ['mythology', 'system', 'triggers', 'wielders', 'environments'] },
  ],
  pin: [
    { name: 'Details', order: 1, fields: ['map', 'element', 'x', 'y', 'z'] },
  ],
  relation: [
    { name: 'Nature', order: 1, fields: ['background', 'start_date', 'end_date', 'intensity', 'actor', 'events'] },
    { name: 'Involves', order: 2, fields: ['characters', 'objects', 'locations', 'species', 'creatures', 'institutions', 'traits', 'collectives', 'zones', 'abilities', 'phenomena', 'languages', 'families', 'titles', 'constructs', 'events', 'narratives'] },
  ],
  species: [
    { name: 'Biology', order: 1, fields: ['appearance', 'life_span', 'weight', 'nourishment', 'reproduction', 'adaptations'] },
    { name: 'Psychology', order: 2, fields: ['instincts', 'sociality', 'temperament', 'communication', 'aggression', 'traits'] },
    { name: 'World', order: 3, fields: ['role', 'parent_species', 'locations', 'zones', 'affinities'] },
  ],
  title: [
    { name: 'Mandate', order: 1, fields: ['authority', 'eligibility', 'grant_date', 'revoke_date', 'issuer', 'body', 'superior_title', 'holders', 'symbols'] },
    { name: 'World', order: 2, fields: ['status', 'history', 'characters', 'institutions', 'families', 'zones', 'locations', 'objects', 'constructs', 'laws', 'collectives', 'creatures', 'phenomena', 'species', 'languages'] },
  ],
  trait: [
    { name: 'Qualitative', order: 1, fields: ['social_effects', 'physical_effects', 'functional_effects', 'personality_effects', 'behaviour_effects'] },
    { name: 'Quantitative', order: 2, fields: ['charisma', 'coercion', 'competence', 'compassion', 'creativity', 'courage'] },
    { name: 'World', order: 3, fields: ['significance', 'anti_trait', 'empowered_abilities'] },
  ],
  zone: [
    { name: 'Scope', order: 1, fields: ['role', 'start_date', 'end_date', 'phenomena', 'linked_zones'] },
    { name: 'World', order: 2, fields: ['context', 'populations', 'titles', 'principles'] },
  ],
};

/** Single-link field names per type (bare schema names). */
export const SINGLE_LINK_FIELDS: Record<ElementType, string[]> = {
  ability: ['tradition', 'source', 'locus'],
  character: ['birthplace', 'location'],
  collective: ['operator'],
  construct: ['founder', 'custodian'],
  creature: ['location', 'zone'],
  event: [],
  family: [],
  institution: ['parent_institution'],
  language: ['classification'],
  law: ['parent_law', 'author'],
  location: ['parent_location', 'primary_power', 'governing_title', 'zone', 'rival', 'partner'],
  map: ['parent_map', 'location'],
  marker: ['map', 'zone'],
  narrative: ['parent_narrative', 'protagonist', 'antagonist', 'narrator', 'conservator'],
  object: ['parent_object', 'location', 'language'],
  phenomenon: ['system'],
  pin: ['map'],
  relation: ['actor'],
  species: ['parent_species'],
  title: ['issuer', 'body', 'superior_title'],
  trait: ['anti_trait'],
  zone: [],
};

/** Multi-link field names per type (bare schema names). */
export const MULTI_LINK_FIELDS: Record<ElementType, string[]> = {
  ability: ['effects', 'talents', 'requisites', 'instruments', 'systems'],
  character: ['species', 'traits', 'abilities', 'languages', 'objects', 'institutions', 'family', 'friends', 'rivals'],
  collective: ['equipment', 'abilities', 'symbolism', 'species', 'characters', 'creatures', 'phenomena'],
  construct: ['characters', 'objects', 'locations', 'species', 'creatures', 'institutions', 'traits', 'collectives', 'zones', 'abilities', 'phenomena', 'languages', 'families', 'relations', 'titles', 'constructs', 'events', 'narratives'],
  creature: ['species', 'traits', 'abilities', 'languages', 'actions'],
  event: ['triggers', 'characters', 'objects', 'locations', 'species', 'creatures', 'institutions', 'traits', 'collectives', 'zones', 'abilities', 'phenomena', 'languages', 'families', 'relations', 'titles', 'constructs'],
  family: ['traditions', 'traits', 'abilities', 'languages', 'ancestors', 'estates', 'governs', 'heirlooms', 'creatures'],
  institution: ['zones', 'objects', 'creatures', 'allies', 'adversaries', 'constructs'],
  language: ['spread', 'dialects'],
  law: ['penalties', 'locations', 'zones', 'prohibitions', 'adjudicators', 'enforcers'],
  location: ['populations', 'secondary_powers', 'founders', 'cults', 'delicacies', 'extraction_methods', 'extraction_goods', 'industry_methods', 'industry_goods', 'extraction_markets', 'industry_markets', 'currencies', 'buildings', 'building_methods', 'fighters', 'defensive_objects'],
  map: [],
  marker: [],
  narrative: ['events', 'characters', 'objects', 'locations', 'species', 'creatures', 'institutions', 'traits', 'collectives', 'zones', 'abilities', 'phenomena', 'languages', 'families', 'relations', 'titles', 'constructs', 'laws'],
  object: ['materials', 'technology', 'effects', 'abilities', 'consumes', 'affinities'],
  phenomenon: ['catalysts', 'empowerments', 'triggers', 'wielders', 'environments'],
  pin: [],
  relation: ['events', 'characters', 'objects', 'locations', 'species', 'creatures', 'institutions', 'traits', 'collectives', 'zones', 'abilities', 'phenomena', 'languages', 'families', 'titles', 'constructs', 'narratives'],
  species: ['nourishment', 'reproduction', 'adaptations', 'traits', 'locations', 'zones', 'affinities'],
  title: ['holders', 'symbols', 'characters', 'institutions', 'families', 'zones', 'locations', 'objects', 'constructs', 'laws', 'collectives', 'creatures', 'phenomena', 'species', 'languages'],
  trait: ['empowered_abilities'],
  zone: ['phenomena', 'linked_zones', 'populations', 'titles', 'principles'],
};

export interface AbilityV2 extends OwElementBase {
  type: "ability";
  /** Method or conditions under which the ability is activated */
  activation?: string;
  /** Length of time the ability remains active or its effects persist, measured in TIME units */
  duration: number | null;
  /** Relative measure of the ability's inherent potency or force, used for scaling or comparison purposes */
  potency: number | null;
  /** Effective reach or distance at which the ability can be used, measured in DISTANCE units */
  range: number | null;
  /** Describes specific difficulties or constraints that make the ability hard to master or use effectively */
  challenges?: string;
  /** How widely the ability is known or practiced, and potential clues to its origins and cultural diffusion */
  prevalence?: string;
  /** A construct that expresses the conceptual, social, or institutional system this ability operates within */
  tradition: string | null;  // -> construct
  /** The phenomenon that serves as the enabling force or condition that allows this ability to function */
  source: string | null;  // -> phenomenon
  /** Location where the ability is most strongly rooted, developed, or traditionally practiced */
  locus: string | null;  // -> location
  /** Phenomena that result from the ability's use, such as environmental changes or sensory effects */
  effects: string[];  // -> phenomenon
  /** Traits that naturally enhance or improve performance with this ability */
  talents: string[];  // -> trait
  /** Constructs that must be satisfied for the ability to be used, such as rituals, permissions, or required roles */
  requisites: string[];  // -> construct
  /** Objects or tools required to activate, channel, or perform the ability */
  instruments: string[];  // -> object
  /** Magic frameworks or structures that the ability associates with */
  systems: string[];  // -> construct
}

export interface CollectiveV2 extends OwElementBase {
  type: "collective";
  /** Internal structure or demographic makeup of the collective */
  composition?: string;
  /** Number of members in the collective (approximate or exact) */
  count: number | null;
  /** Date the collective was formed, using world TIME units */
  formation_date: number | null;
  /** Primary behaviors or actions the collective engages in */
  activity?: string;
  /** Emotional control or volatility expressed by the collective */
  disposition?: string;
  /** Current condition or operational status of the collective */
  state?: string;
  /** Institution that manages or directs the collective */
  operator: string | null;  // -> institution
  /** Tools or gear in possession of and/or regularly used by the collective */
  equipment: string[];  // -> object
  /** Abilities commonly shared among members of the collective, or abilities of that collective as a whole */
  abilities: string[];  // -> ability
  /** Cultural expressions, rituals, or symbols that unify or distinguish the collective */
  symbolism: string[];  // -> construct
  /** Species that compose or participate in the collective */
  species: string[];  // -> species
  /** Characters who are members of the collective */
  characters: string[];  // -> character
  /** Creatures associated with or included in the collective */
  creatures: string[];  // -> creature
  /** Phenomena that influence or characterize the collective */
  phenomena: string[];  // -> phenomenon
}

export interface CharacterV2 extends OwElementBase {
  type: "character";
  /** The character's visible physical features and body attributes */
  physicality?: string;
  /** The character's mindset, emotional tone, and style of thinking */
  mentality?: string;
  /** The character's approximate or exact height, using world LENGTH units */
  height: number | null;
  /** The character's approximate or exact weight, using world MASS units */
  weight: number | null;
  /** History, upbringing, or formative experiences of the character */
  background?: string;
  /** Core desires, goals, or values that drive the character's choices and behavior */
  motivations?: string;
  /** Moment of birth, expressed in the world's TIME units */
  birth_date: number | null;
  /** Brief summary of the character's current condition, role, or predicament */
  reputation?: string;
  /** Ability to attract, inspire, and influence others */
  charisma: number | null;
  /** Capacity to dominate, intimidate, or apply force to shape outcomes */
  coercion: number | null;
  /** Skill in planning, understanding, and managing complex systems or situations */
  competence: number | null;
  /** Willingness to empathize with and care for others */
  compassion: number | null;
  /** Ability to generate novel ideas, perspectives, or solutions */
  creativity: number | null;
  /** Readiness to face danger, risk, or adversity */
  courage: number | null;
  /** Progression rank of the character in a game system */
  level: number | null;
  /** Total health available to the character */
  hit_points: number | null;
  /** Physical force and carrying capacity */
  STR: number | null;
  /** Agility, coordination, and reflexes */
  DEX: number | null;
  /** Endurance and resistance to strain */
  CON: number | null;
  /** Reasoning, memory, and learning */
  INT: number | null;
  /** Intuition, awareness, and judgment */
  WIS: number | null;
  /** Persuasiveness and personal magnetism */
  CHA: number | null;
  /** Location where the character was born */
  birthplace: string | null;  // -> location
  /** The character's present physical location */
  location: string | null;  // -> location
  /** Species the character might belong to */
  species: string[];  // -> species
  /** Traits for notable behavioral, physical, or systemic characteristics */
  traits: string[];  // -> trait
  /** Abilities the character might perform, control, or invoke */
  abilities: string[];  // -> ability
  /** Languages the character can understand, speak, or use for communication */
  languages: string[];  // -> language
  /** Key objects owned by or symbolically linked to the character */
  objects: string[];  // -> object
  /** Institutions the character is affiliated with */
  institutions: string[];  // -> institution
  /** Families the character belongs to by blood or adoption */
  family: string[];  // -> family
  /** Characters the character considers close allies or companions */
  friends: string[];  // -> character
  /** Characters the character is in active opposition or competition with */
  rivals: string[];  // -> character
}

export interface ConstructV2 extends OwElementBase {
  type: "construct";
  /** The internal reasoning, structure, or justification of how the construct functions or makes sense within the world */
  rationale?: string;
  /** The historical development or ideation of the construct, and its place in wider historical contexts */
  history?: string;
  /** The present condition or operational status of the construct */
  status?: string;
  /** The geographic, cultural, or political extent of the construct's influence */
  reach?: string;
  /** The point in time when the construct began or was first established (uses world's TIME definition) */
  start_date: number | null;
  /** The point in time when the construct ceased to function or lost its meaning */
  end_date: number | null;
  /** Character who conceived or initiated the construct */
  founder: string | null;  // -> character
  /** Institution maintaining, enforcing, or exploiting the construct */
  custodian: string | null;  // -> institution
  /** Characters relevant to the construct */
  characters: string[];  // -> character
  /** Objects relevant to the construct */
  objects: string[];  // -> object
  /** Locations relevant to the construct */
  locations: string[];  // -> location
  /** Species relevant to the construct */
  species: string[];  // -> species
  /** Creatures relevant to the construct */
  creatures: string[];  // -> creature
  /** Institutions relevant to the construct */
  institutions: string[];  // -> institution
  /** Traits relevant to the construct */
  traits: string[];  // -> trait
  /** Collectives relevant to the construct */
  collectives: string[];  // -> collective
  /** Zones relevant to the construct */
  zones: string[];  // -> zone
  /** Abilities relevant to the construct */
  abilities: string[];  // -> ability
  /** Phenomena relevant to the construct */
  phenomena: string[];  // -> phenomenon
  /** Languages relevant to the construct */
  languages: string[];  // -> language
  /** Families relevant to the construct */
  families: string[];  // -> family
  relations: string[];  // -> relation
  /** Titles relevant to the construct */
  titles: string[];  // -> title
  /** Other constructs relevant to the construct */
  constructs: string[];  // -> construct
  /** Events relevant to the construct */
  events: string[];  // -> event
  /** Narratives relevant to the construct */
  narratives: string[];  // -> narrative
}

export interface CreatureV2 extends OwElementBase {
  type: "creature";
  /** Visual description of the creature */
  appearance?: string;
  /** Approximate or exact weight of the creature, using world MASS units */
  weight: number | null;
  /** Approximate height of the creature, using the world's defined LENGTH units */
  height: number | null;
  /** Typical behaviors, instincts, or recurring actions the creature tends to display */
  habits?: string;
  /** The emotional tone or attitude the creature conveys through posture, expression, or aggression */
  demeanor?: string;
  /** Current situation or classification of the creature */
  status?: string;
  /** The time of the creature's birth, recorded in the world's defined TIME unit */
  birth_date: number | null;
  /** Difficulty or threat level of the creature in a gameplay context */
  challenge_rating: number | null;
  /** Total health or durability value in combat */
  hit_points: number | null;
  /** Defense rating against physical attacks or effects */
  armor_class: number | null;
  /** Typical movement speed, measured in the world's DISTANCE unit per round */
  speed: number | null;
  /** Specific location where the creature is currently found or most associated with */
  location: string | null;  // -> location
  /** Larger area or region commonly inhabited or currently claimed by the creature */
  zone: string | null;  // -> zone
  /** Species this creature belongs to */
  species: string[];  // -> species
  /** Traits that influence the creature's behavior, capabilities, or appearance */
  traits: string[];  // -> trait
  /** Innate or learned abilities the creature can perform or activate */
  abilities: string[];  // -> ability
  /** Languages the creature can understand, speak, or otherwise use to communicate */
  languages: string[];  // -> language
  /** Combat or tactical abilities the creature can perform or use */
  actions: string[];  // -> ability
}

export interface EventV2 extends OwElementBase {
  type: "event";
  /** Historical context and background of the event */
  history?: string;
  /** Adversity or difficulties faced during the event */
  challenges?: string;
  /** Outcomes and impacts resulting from the event */
  consequences?: string;
  /** Date on which the event began */
  start_date: number | null;
  /** Date on which the event concluded */
  end_date: number | null;
  /** Events that eventuated the event */
  triggers: string[];  // -> event
  /** Key characters relevant to the event */
  characters: string[];  // -> character
  /** Objects relevant to the event */
  objects: string[];  // -> object
  /** Locations relevant to the event */
  locations: string[];  // -> location
  /** Species relevant to the event */
  species: string[];  // -> species
  /** Creatures relevant to the event */
  creatures: string[];  // -> creature
  /** Institutions relevant to the event */
  institutions: string[];  // -> institution
  /** Traits relevant to the event */
  traits: string[];  // -> trait
  /** Groups or collectives relevant to the event */
  collectives: string[];  // -> collective
  /** Zones relevant to the event */
  zones: string[];  // -> zone
  /** Abilities relevant to the event */
  abilities: string[];  // -> ability
  /** Natural or supernatural phenomena relevant to the event */
  phenomena: string[];  // -> phenomenon
  languages: string[];  // -> language
  /** Families relevant to the event */
  families: string[];  // -> family
  /** Interpersonal or political relations relevant to the event */
  relations: string[];  // -> relation
  /** Titles relevant to the event */
  titles: string[];  // -> title
  /** Concepts, laws, or built entities relevant to the event */
  constructs: string[];  // -> construct
}

export interface FamilyV2 extends OwElementBase {
  type: "family";
  /** The core values or shared ethos that the family embodies */
  spirit?: string;
  /** Background or origin story of the family */
  history?: string;
  /** Current social, political, or general standing of the family */
  reputation?: string;
  /** Cultural practices, symbols, or customs overseen by the family */
  traditions: string[];  // -> construct
  /** Traits possibly found among members of the family */
  traits: string[];  // -> trait
  /** Abilities or special qualities possibly present in the family */
  abilities: string[];  // -> ability
  /** Languages spoken by, or associated with the family */
  languages: string[];  // -> language
  /** Notable forebears or historic characters in the family's lineage */
  ancestors: string[];  // -> character
  /** Key locations owned, governed, or symbolically tied to the family */
  estates: string[];  // -> location
  /** Institutions administered or managed by the family */
  governs: string[];  // -> institution
  /** Important objects or artifacts handed down by the family */
  heirlooms: string[];  // -> object
  /** Creatures owned, bonded to, or representing the family */
  creatures: string[];  // -> creature
}

export interface InstitutionV2 extends OwElementBase {
  type: "institution";
  /** Core belief, mission, or purpose that drives the institution */
  doctrine?: string;
  /** Date when the institution was established, in the world's TIME format */
  founding_date: number | null;
  /** Current political, cultural, or functional standing of the institution in the world */
  status?: string;
  /** Institution that governs, embodies, or originated this one */
  parent_institution: string | null;  // -> institution
  /** Areas the institution controls or claims authority over */
  zones: string[];  // -> zone
  /** Significant objects owned or tied to the institution's operations, holdings, or identity */
  objects: string[];  // -> object
  /** Creatures under the institution's protection, use, or symbolic control */
  creatures: string[];  // -> creature
  /** Institutions this one actively cooperates or aligns with */
  allies: string[];  // -> institution
  /** Institutions this one opposes, competes with, or is in conflict with */
  adversaries: string[];  // -> institution
  /** Conceptual, procedural, or structural systems created or maintained by the institution */
  constructs: string[];  // -> construct
}

export interface LanguageV2 extends OwElementBase {
  type: "language";
  /** The language's sound systems, including phonemes, tone, and pronunciation rules */
  phonology?: string;
  /** Rules governing syntax, morphology, and sentence structure */
  grammar?: string;
  /** Vocabulary principles or full word lists used in the language */
  lexicon?: string;
  /** Script or notation system used to represent the language in written form */
  writing?: string;
  /** Current vitality, reputation, or dominance of the language */
  status?: string;
  /** Linguistic group or typological category the language belongs to */
  classification: string | null;  // -> construct
  /** Geographical areas where the language is used or spoken */
  spread: string[];  // -> location
  /** Variants or dialect languages derived from the language */
  dialects: string[];  // -> language
}

export interface LawV2 extends OwElementBase {
  type: "law";
  /** The formal wording, expression, or decree of the law */
  declaration?: string;
  /** The intent, motivation, or justification for the law's creation */
  purpose?: string;
  /** Date the law was formally established, in world TIME units */
  date: number | null;
  /** A law that this law derives from, modifies, or enhances */
  parent_law: string | null;  // -> law
  /** The institution that created or issued the law */
  author: string | null;  // -> institution
  /** Consequences intended to beapplied when the law is contravened */
  penalties: string[];  // -> construct
  /** Locations where the law is supported or enforced */
  locations: string[];  // -> location
  /** Zones where the law is supported or enforced */
  zones: string[];  // -> zone
  /** Things that the law explicitly or effectively forbids */
  prohibitions: string[];  // -> construct
  /** Titles responsible for interpreting or ruling on the law's application and jurisdiction */
  adjudicators: string[];  // -> title
  /** Titles responsible for enforcing or imposing the law */
  enforcers: string[];  // -> title
}

export interface LocationV2 extends OwElementBase {
  type: "location";
  /** Visual and environmental aspects of the location */
  form?: string;
  /** Main use, role, or purpose of the location within the world */
  function?: string;
  /** Date on which the location was founded, established, or designated */
  founding_date: number | null;
  /** Political structure, stability, and dynamics of the location */
  political_climate?: string;
  /** Cultural practices, habits, or festivals */
  customs?: string;
  /** Roads, ports, and other physical systems that enable the movement of goods and people */
  infrastructure?: string;
  /** Look, form, and materials used in the built environment and location design */
  architecture?: string;
  /** Qualities of natural, constructed, and implemented defenses at the location */
  defensibility?: string;
  /** Height or elevation of the location relative to surrounding terrain, defined in world DISTANCE units */
  elevation: number | null;
  /** Wider location that this location is part of */
  parent_location: string | null;  // -> location
  /** Institution that has the highest degree of political control over the location */
  primary_power: string | null;  // -> institution
  /** Governing figure assigned by the location's primary power */
  governing_title: string | null;  // -> title
  /** Zone of interest that is associated with the location */
  zone: string | null;  // -> zone
  /** Locations with active, traditional, or historical rivalries */
  rival: string | null;  // -> location
  /** Locations with active, cooperative, or historical ties */
  partner: string | null;  // -> location
  /** Distinct collective groups or communities residing within the location */
  populations: string[];  // -> collective
  /** Institutions with significant political control */
  secondary_powers: string[];  // -> institution
  /** Individual(s) who founded or named the location */
  founders: string[];  // -> character
  /** Significant religious constructs practiced or recognized at the location */
  cults: string[];  // -> construct
  /** Organisms or other species locally consumed or celebrated as specialty foods */
  delicacies: string[];  // -> species
  /** Techniques or strategies used to gather natural resources */
  extraction_methods: string[];  // -> construct
  /** Products and materials that are gathered or obtained */
  extraction_goods: string[];  // -> construct
  /** Techniques or workflows used to refine or manufacture goods */
  industry_methods: string[];  // -> construct
  /** Products and materials that are refined or manufactured */
  industry_goods: string[];  // -> construct
  /** Locations that receive extracted goods through trade, interchange, or seizure */
  extraction_markets: string[];  // -> location
  /** Locations that receive industrial goods through trade, interchange, or seizure */
  industry_markets: string[];  // -> location
  /** Trade media recognized or circulated at the location */
  currencies: string[];  // -> construct
  /** Notable structural objects at the location */
  buildings: string[];  // -> object
  /** Techniques or systems used to construct structures at the location */
  building_methods: string[];  // -> construct
  /** Military units or forces responsible for defending the location */
  fighters: string[];  // -> construct
  /** Objects or installations for defending the location */
  defensive_objects: string[];  // -> object
}

export interface MapV2 extends OwElementBase {
  type: "map";
  /** Color of the space around the map when zoomed out */
  background_color?: string;
  /** To associate or differentiate between maps with a common parent */
  hierarchy: number | null;
  /** In pixels */
  width: number | null;
  /** In pixels */
  height: number | null;
  /** In pixels */
  depth: number | null;
  /** Map within which this map is contained */
  parent_map: string | null;  // -> map
  /** Location element that this map represents */
  location: string | null;  // -> location
}

export interface MarkerV2 extends OwElementBase {
  type: "marker";
  /** x coordinate, from bottom left of the map */
  x: number | null;
  /** y coordinate, from bottom left of the map */
  y: number | null;
  /** z coordinate, in case of depth */
  z: number | null;
  /** Sequence position when markers define a polygon or line (0 = first point) */
  order: number | null;
  /** Map this marker is placed on */
  map: string | null;  // -> map
  /** Zone that is defined by this marker */
  zone: string | null;  // -> zone
}

export interface NarrativeV2 extends OwElementBase {
  type: "narrative";
  /** Content of the narrative, as told or remembered */
  story?: string;
  /** Outcomes or legacy of the narrative */
  consequences?: string;
  /** Date when the narrative begins, measured in world TIME units */
  start_date: number | null;
  /** Date when the narrative ends, measured in world TIME units */
  end_date: number | null;
  /** Position of this narrative within a parent narrative's sequence */
  order: number | null;
  /** Larger narrative that this narrative takes place in */
  parent_narrative: string | null;  // -> narrative
  /** Primary character of the narrative */
  protagonist: string | null;  // -> character
  /** Opposing character of the narrative */
  antagonist: string | null;  // -> character
  /** Character credited with telling or recording the narrative */
  narrator: string | null;  // -> character
  /** Institution that preserves or curates the narrative */
  conservator: string | null;  // -> institution
  /** Events relevant to the narrative */
  events: string[];  // -> event
  /** Characters relevant to the narrative */
  characters: string[];  // -> character
  /** Objects relevant to the narrative */
  objects: string[];  // -> object
  /** Locations relevant to the narrative */
  locations: string[];  // -> location
  /** Species relevant to the narrative */
  species: string[];  // -> species
  /** Creatures relevant to the narrative */
  creatures: string[];  // -> creature
  /** Institutions relevant to the narrative */
  institutions: string[];  // -> institution
  /** Traits relevant to the narrative */
  traits: string[];  // -> trait
  /** Groups relevant to the narrative */
  collectives: string[];  // -> collective
  /** Zones relevant to the narrative */
  zones: string[];  // -> zone
  /** Abilities relevant to the narrative */
  abilities: string[];  // -> ability
  /** Phenomena relevant to the narrative */
  phenomena: string[];  // -> phenomenon
  /** Languages relevant to the narrative */
  languages: string[];  // -> language
  /** Families relevant to the narrative */
  families: string[];  // -> family
  /** Relationships relevant to the narrative */
  relations: string[];  // -> relation
  /** Titles relevant to the narrative */
  titles: string[];  // -> title
  /** Constructs relevant to the narrative */
  constructs: string[];  // -> construct
  /** Laws relevant to the narrative */
  laws: string[];  // -> law
}

export interface ObjectV2 extends OwElementBase {
  type: "object";
  /** Appearance, design, or visual presentation of the object */
  aesthetics?: string;
  /** Approximate or exact mass of the object, defined by world MASS units */
  weight: number | null;
  /** The number of identical units in this object entry */
  amount: number | null;
  /** Intended purpose or primary use of the object */
  utility?: string;
  /** Background or history of the object */
  origins?: string;
  /** Larger object that this one is part of or contained within */
  parent_object: string | null;  // -> object
  /** Physical place where the object is currently located or stored */
  location: string | null;  // -> location
  /** Required to read, understand, or activate the object */
  language: string | null;  // -> language
  /** The phyiscal matter that constitutes the object */
  materials: string[];  // -> construct
  /** Mechanisms relating the object's design or operation */
  technology: string[];  // -> construct
  /** Phenomena potentially triggered or emitted on object use */
  effects: string[];  // -> phenomenon
  /** Abilities that the object grant or enables */
  abilities: string[];  // -> ability
  /** What might be used or depleted on object use */
  consumes: string[];  // -> construct
  /** Traits that resonate with or enhance the object's use, function, or effects */
  affinities: string[];  // -> trait
}

export interface PhenomenonV2 extends OwElementBase {
  type: "phenomenon";
  /** How the phenomenon manifests or takes shape in the world */
  expression?: string;
  /** The primary outcomes or changes caused by the phenomenon */
  effects?: string;
  /** The amount of time the phenomenon lasts, measured in world TIME units */
  duration: number | null;
  /** Cultural, religious, or narrative meaning associated with the phenomenon */
  mythology?: string;
  /** Broader phenomenon that this one is part of or linked to */
  system: string | null;  // -> phenomenon
  /** Objects or materials that initiate or enhance the phenomenon */
  catalysts: string[];  // -> object
  /** Abilities that initiate or enhance the phenomenon, or are initiated or enhanced by it */
  empowerments: string[];  // -> ability
  /** Conceptual mechanisms or patterns that cause the phenomenon to activate */
  triggers: string[];  // -> construct
  /** Characters capable of intentionally directing or controlling the phenomenon */
  wielders: string[];  // -> character
  /** Locations where the phenomenon occurs or is known to manifest */
  environments: string[];  // -> location
}

export interface PinV2 extends OwElementBase {
  type: "pin";
  /** x coordinate, from bottom left of the map */
  x: number | null;
  /** y coordinate, from bottom left of the map */
  y: number | null;
  /** z coordinate, in case of depth (optional) */
  z: number | null;
  /** Map that the pin is placed on */
  map: string | null;  // -> map
  /** Link to any Element (managed by ContentType + UUID) (type discriminator half of the generic link). */
  element_type: string | null;
  /** Link to any Element (managed by ContentType + UUID) (UUID half of the generic link). */
  element_id: string | null;
}

export interface RelationV2 extends OwElementBase {
  type: "relation";
  /** History and origin of the relation */
  background?: string;
  /** Date when the relation began, defined in world TIME units */
  start_date: number | null;
  /** Date when the relation ended if any, defined in world TIME units */
  end_date: number | null;
  /** Significance of the relation, on a relative scale of 0 to 100 */
  intensity: number | null;
  /** Primary character defining the relation */
  actor: string | null;  // -> character
  /** Events where the relation is involved or relevant */
  events: string[];  // -> event
  /** Characters relevant to the relation */
  characters: string[];  // -> character
  /** Objects relevant to the relation */
  objects: string[];  // -> object
  /** Locations relevant to the relation */
  locations: string[];  // -> location
  /** Species relevant to the relation */
  species: string[];  // -> species
  /** Creatures relevant to the relation */
  creatures: string[];  // -> creature
  /** Institutions relevant to the relation */
  institutions: string[];  // -> institution
  /** Traits relevant to the relation */
  traits: string[];  // -> trait
  /** Collectives relevant to the relation */
  collectives: string[];  // -> collective
  /** Zones relevant to the relation */
  zones: string[];  // -> zone
  /** Abilities relevant to the relation */
  abilities: string[];  // -> ability
  /** Phenomena relevant to the relation */
  phenomena: string[];  // -> phenomenon
  /** Languages relevant to the relation */
  languages: string[];  // -> language
  /** Families relevant to the relation */
  families: string[];  // -> family
  /** Titles relevant to the relation */
  titles: string[];  // -> title
  /** Concepts, contracts, or principles relevant to the relation */
  constructs: string[];  // -> construct
  /** Narratives relevant to the relation */
  narratives: string[];  // -> narrative
}

export interface SpeciesV2 extends OwElementBase {
  type: "species";
  /** Typical physical or form features of the species */
  appearance?: string;
  /** Average or typical life expectancy of an individual, defined in world TIME units */
  life_span: number | null;
  /** Average or typical adult weight, defined in world MASS units */
  weight: number | null;
  /** Innate behavioral drives and survival tendencies */
  instincts?: string;
  /** Typical patterns of social behavior */
  sociality?: string;
  /** Overall behavioral disposition */
  temperament?: string;
  /** Typical methods and approaches of interaction */
  communication?: string;
  /** General aggressiveness level, on relative scale of 0 to 100 */
  aggression: number | null;
  /** The species' ecological or cultural function in the world */
  role?: string;
  /** Species that the species is considered a subspecies of */
  parent_species: string | null;  // -> species
  /** Other species consumed as food sources */
  nourishment: string[];  // -> species
  /** Reproductive method(s) of the species */
  reproduction: string[];  // -> construct
  /** Special physiological or evolutionary abilities */
  adaptations: string[];  // -> ability
  /** Behavioral patterns associated with the species */
  traits: string[];  // -> trait
  /** Locations associated with the species or its habitat */
  locations: string[];  // -> location
  /** Zones associated with the species or its habitat */
  zones: string[];  // -> zone
  /** Phenomena associated with the species or its behavior */
  affinities: string[];  // -> phenomenon
}

export interface TitleV2 extends OwElementBase {
  type: "title";
  /** Rights or powers granted by the title */
  authority?: string;
  /** Conditions or qualifications for receiving or holding the title */
  eligibility?: string;
  /** Date on which the title was granted, defined in world TIME units */
  grant_date: number | null;
  /** Date on which the title ended or was revoked, defined in world TIME units */
  revoke_date: number | null;
  /** Current state or general condition of the title */
  status?: string;
  /** Background information on the title's origin, evolution, or significance */
  history?: string;
  /** Institution that formally created or granted the title */
  issuer: string | null;  // -> institution
  /** Institution in which the title functions or holds relevance */
  body: string | null;  // -> institution
  /** Another title that has authority over this one */
  superior_title: string | null;  // -> title
  /** Characters who currently hold or represent the title */
  holders: string[];  // -> character
  /** Objects that symbolize or authorize the title */
  symbols: string[];  // -> object
  /** Characters otherwise relevant to the title */
  characters: string[];  // -> character
  /** Institutions relevant to the title */
  institutions: string[];  // -> institution
  /** Families relevant to the title */
  families: string[];  // -> family
  /** Zones relevant to the title */
  zones: string[];  // -> zone
  /** Locations relevant to the title */
  locations: string[];  // -> location
  /** Objects otherwise relevant to the title */
  objects: string[];  // -> object
  /** Constructs relevant to the title */
  constructs: string[];  // -> construct
  /** Laws relevant to the title */
  laws: string[];  // -> law
  /** Collectives relevant to the title */
  collectives: string[];  // -> collective
  /** Creatures relevant to the title */
  creatures: string[];  // -> creature
  /** Phenomena relevant to the title */
  phenomena: string[];  // -> phenomenon
  /** Species relevant to the title */
  species: string[];  // -> species
  /** Languages relevant to the title */
  languages: string[];  // -> language
}

export interface TraitV2 extends OwElementBase {
  type: "trait";
  /** Relating to social relationships, reputation, or interaction dynamics */
  social_effects?: string;
  /** Relating to physical changes, limitations, or enhancements */
  physical_effects?: string;
  /** Relating to practical or learned performance or aptitude */
  functional_effects?: string;
  /** Relating to temperament, mental state, or personality expression */
  personality_effects?: string;
  /** Relating to visible aspects and patterns of behavior */
  behaviour_effects?: string;
  /** Affecting a character's charisma score */
  charisma: number | null;
  /** Affecting a character's coercion score */
  coercion: number | null;
  /** Affecting a character's competence score */
  competence: number | null;
  /** Affecting a character's compassion score */
  compassion: number | null;
  /** Affecting a character's creativity score */
  creativity: number | null;
  /** Affecting a character's courage score */
  courage: number | null;
  /** Describes the trait's societal, symbolic, or systemic presence */
  significance?: string;
  /** Opposing trait that contradicts or nullifies the trait */
  anti_trait: string | null;  // -> trait
  /** Abilities strengthened or enabled by the trait */
  empowered_abilities: string[];  // -> ability
}

export interface ZoneV2 extends OwElementBase {
  type: "zone";
  /** The operational function or intent of the zone */
  role?: string;
  /** Date when the zone becomes extant or relevant, defined in world TIME units */
  start_date: number | null;
  /** Date when the zone ceases to be meaningful or enforced, defined in world TIME units */
  end_date: number | null;
  /** Historical and key knowledge about the zone */
  context?: string;
  /** Phenomena that affect, define, or occur within the zone */
  phenomena: string[];  // -> phenomenon
  /** Other zones that are associated with the zone */
  linked_zones: string[];  // -> zone
  /** Distinct collective groups or communities residing within the zone */
  populations: string[];  // -> collective
  /** Titles assigned to represent, manage, or protect the zone */
  titles: string[];  // -> title
  /** Influential mechanics acted within, upon, or by the zone */
  principles: string[];  // -> construct
}
