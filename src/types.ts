// Auto-generated TypeScript types for OnlyWorlds elements
// Generated from Django models

// ============================================================================
// BRANDED TYPES SYSTEM
// ============================================================================

/**
 * Modern branded types for type-safe element relationships
 * Provides compile-time safety while maintaining zero runtime overhead
 */
declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };

/**
 * Branded type for element IDs - ensures type safety for relationships
 * @template T The element type this ID references
 */
export type ElementId<T extends ElementType> = string & Brand<T>;

/**
 * Branded type for arrays of element IDs
 * @template T The element type these IDs reference
 */
export type ElementIds<T extends ElementType> = ElementId<T>[];

/**
 * Special type for IDs that can reference ANY element type
 * Used in cases like Pin.element_type where the target can be any OnlyWorlds element
 */
export type AnyElementId = ElementId<ElementType>;

/**
 * Base fields shared by all OnlyWorlds elements
 */
export interface BaseElement {
  id?: string;
  name: string;
  description?: string;
  image_url?: string;
  supertype?: string;
  subtype?: string;
  world?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * World element type
 */
export interface World {
  id?: string;
  api_key: string;
  name: string;
  description?: string;
  version?: string;
  image_url?: string;
  time_format_equivalents?: any[];
  time_format_names?: any[];
  time_basic_unit?: string;
  time_range_min?: number;
  time_range_max?: number;
  time_current?: number;
  user?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * World input type for creation/updates
 */
export interface WorldInput {
  name: string;
  description?: string;
  version?: string;
  image_url?: string;
  time_format_equivalents?: any[];
  time_format_names?: any[];
  time_basic_unit?: string;
  time_range_min?: number;
  time_range_max?: number;
  time_current?: number;
}

/**
 * Ability element type
 * Fields organized by sections: Mechanics, World
 */
export interface Ability extends BaseElement {
  // Mechanics
  activation?: string;
  duration?: number;
  potency?: number;
  range?: number;
  effects?: ElementIds<ElementType.Phenomenon>;
  challenges?: string;
  talents?: ElementIds<ElementType.Trait>;
  requisites?: ElementIds<ElementType.Construct>;

  // World
  prevalence?: string;
  tradition?: ElementId<ElementType.Construct>;
  source?: ElementId<ElementType.Phenomenon>;
  locus?: ElementId<ElementType.Location>;
  instruments?: ElementIds<ElementType.Object>;
  systems?: ElementIds<ElementType.Construct>;
}

/**
 * Object element type
 * Fields organized by sections: Form, Function, World
 */
export interface Object extends BaseElement {
  // Form
  aesthetics?: string;
  weight?: number;
  amount?: number;
  parent_object?: ElementId<ElementType.Object>;
  materials?: ElementIds<ElementType.Construct>;
  technology?: ElementIds<ElementType.Construct>;

  // Function
  utility?: string;
  effects?: ElementIds<ElementType.Phenomenon>;
  abilities?: ElementIds<ElementType.Ability>;
  consumes?: ElementIds<ElementType.Construct>;

  // World
  origins?: string;
  location?: ElementId<ElementType.Location>;
  language?: ElementId<ElementType.Language>;
  affinities?: ElementIds<ElementType.Trait>;
}

/**
 * Character element type
 * Fields organized by sections: Constitution, Origins, World, Personality, Social, TTRPG
 */
export interface Character extends BaseElement {
  // Constitution
  physicality?: string;
  mentality?: string;
  height?: number;
  weight?: number;
  species?: ElementIds<ElementType.Species>;
  traits?: ElementIds<ElementType.Trait>;
  abilities?: ElementIds<ElementType.Ability>;

  // Origins
  background?: string;
  motivations?: string;
  birth_date?: number;
  birthplace?: ElementId<ElementType.Location>;
  languages?: ElementIds<ElementType.Language>;

  // World
  reputation?: string;
  location?: ElementId<ElementType.Location>;
  objects?: ElementIds<ElementType.Object>;
  institutions?: ElementIds<ElementType.Institution>;

  // Personality
  charisma?: number;
  coercion?: number;
  competence?: number;
  compassion?: number;
  creativity?: number;
  courage?: number;

  // Social
  family?: ElementIds<ElementType.Family>;
  friends?: ElementIds<ElementType.Character>;
  rivals?: ElementIds<ElementType.Character>;

  // TTRPG
  level?: number;
  hit_points?: number;
  STR?: number;
  DEX?: number;
  CON?: number;
  INT?: number;
  WIS?: number;
  CHA?: number;
}

/**
 * Collective element type
 * Fields organized by sections: Formation, Dynamics, World
 */
export interface Collective extends BaseElement {
  // Formation
  composition?: string;
  count?: number;
  formation_date?: number;
  operator?: ElementId<ElementType.Institution>;
  equipment?: ElementIds<ElementType.Construct>;

  // Dynamics
  activity?: string;
  disposition?: string;
  state?: string;
  abilities?: ElementIds<ElementType.Ability>;
  symbolism?: ElementIds<ElementType.Construct>;

  // World
  species?: ElementIds<ElementType.Species>;
  characters?: ElementIds<ElementType.Character>;
  creatures?: ElementIds<ElementType.Creature>;
  phenomena?: ElementIds<ElementType.Phenomenon>;
}

/**
 * Construct element type
 * Fields organized by sections: Nature, Involves
 */
export interface Construct extends BaseElement {
  // Nature
  rationale?: string;
  history?: string;
  status?: string;
  reach?: string;
  start_date?: number;
  end_date?: number;
  founder?: ElementId<ElementType.Character>;
  custodian?: ElementId<ElementType.Institution>;

  // Involves
  characters?: ElementIds<ElementType.Character>;
  objects?: ElementIds<ElementType.Object>;
  locations?: ElementIds<ElementType.Location>;
  species?: ElementIds<ElementType.Species>;
  creatures?: ElementIds<ElementType.Creature>;
  institutions?: ElementIds<ElementType.Institution>;
  traits?: ElementIds<ElementType.Trait>;
  collectives?: ElementIds<ElementType.Collective>;
  zones?: ElementIds<ElementType.Zone>;
  abilities?: ElementIds<ElementType.Ability>;
  phenomena?: ElementIds<ElementType.Phenomenon>;
  languages?: ElementIds<ElementType.Language>;
  families?: ElementIds<ElementType.Family>;
  relations?: ElementIds<ElementType.Relation>;
  titles?: ElementIds<ElementType.Title>;
  constructs?: ElementIds<ElementType.Construct>;
  events?: ElementIds<ElementType.Event>;
  narratives?: ElementIds<ElementType.Narrative>;
}

/**
 * Creature element type
 * Fields organized by sections: Biology, Behaviour, World, TTRPG
 */
export interface Creature extends BaseElement {
  // Biology
  appearance?: string;
  weight?: number;
  height?: number;
  species?: ElementIds<ElementType.Species>;

  // Behaviour
  habits?: string;
  demeanor?: string;
  traits?: ElementIds<ElementType.Trait>;
  abilities?: ElementIds<ElementType.Ability>;
  languages?: ElementIds<ElementType.Language>;

  // World
  status?: string;
  birth_date?: number;
  location?: ElementId<ElementType.Location>;
  zone?: ElementId<ElementType.Zone>;

  // TTRPG
  challenge_rating?: number;
  hit_points?: number;
  armor_class?: number;
  speed?: number;
  actions?: ElementIds<ElementType.Ability>;
}

/**
 * Event element type
 * Fields organized by sections: Nature, Involves
 */
export interface Event extends BaseElement {
  // Nature
  history?: string;
  challenges?: string;
  consequences?: string;
  start_date?: number;
  end_date?: number;
  triggers?: ElementIds<ElementType.Event>;

  // Involves
  characters?: ElementIds<ElementType.Character>;
  objects?: ElementIds<ElementType.Object>;
  locations?: ElementIds<ElementType.Location>;
  species?: ElementIds<ElementType.Species>;
  creatures?: ElementIds<ElementType.Creature>;
  institutions?: ElementIds<ElementType.Institution>;
  traits?: ElementIds<ElementType.Trait>;
  collectives?: ElementIds<ElementType.Collective>;
  zones?: ElementIds<ElementType.Zone>;
  abilities?: ElementIds<ElementType.Ability>;
  phenomena?: ElementIds<ElementType.Phenomenon>;
  languages?: ElementIds<ElementType.Language>;
  families?: ElementIds<ElementType.Family>;
  relations?: ElementIds<ElementType.Relation>;
  titles?: ElementIds<ElementType.Title>;
  constructs?: ElementIds<ElementType.Construct>;
}

/**
 * Family element type
 * Fields organized by sections: Identity, World
 */
export interface Family extends BaseElement {
  // Identity
  spirit?: string;
  history?: string;
  traditions?: ElementIds<ElementType.Construct>;
  traits?: ElementIds<ElementType.Trait>;
  abilities?: ElementIds<ElementType.Ability>;
  languages?: ElementIds<ElementType.Language>;
  ancestors?: ElementIds<ElementType.Character>;

  // World
  reputation?: string;
  estates?: ElementIds<ElementType.Location>;
  governs?: ElementIds<ElementType.Institution>;
  heirlooms?: ElementIds<ElementType.Object>;
  creatures?: ElementIds<ElementType.Creature>;
}

/**
 * Institution element type
 * Fields organized by sections: Foundation, Claims, World
 */
export interface Institution extends BaseElement {
  // Foundation
  doctrine?: string;
  founding_date?: number;
  parent_institution?: ElementId<ElementType.Institution>;

  // Claims
  zones?: ElementIds<ElementType.Zone>;
  objects?: ElementIds<ElementType.Object>;
  creatures?: ElementIds<ElementType.Creature>;

  // World
  status?: string;
  allies?: ElementIds<ElementType.Institution>;
  adversaries?: ElementIds<ElementType.Institution>;
  constructs?: ElementIds<ElementType.Construct>;
}

/**
 * Language element type
 * Fields organized by sections: Structure, World
 */
export interface Language extends BaseElement {
  // Structure
  phonology?: string;
  grammar?: string;
  lexicon?: string;
  writing?: string;
  classification?: ElementId<ElementType.Construct>;

  // World
  status?: string;
  spread?: ElementIds<ElementType.Location>;
  dialects?: ElementIds<ElementType.Language>;
}

/**
 * Law element type
 * Fields organized by sections: Code, World
 */
export interface Law extends BaseElement {
  // Code
  declaration?: string;
  purpose?: string;
  date?: number;
  parent_law?: ElementId<ElementType.Law>;
  penalties?: ElementIds<ElementType.Construct>;

  // World
  author?: ElementId<ElementType.Institution>;
  locations?: ElementIds<ElementType.Location>;
  zones?: ElementIds<ElementType.Zone>;
  prohibitions?: ElementIds<ElementType.Construct>;
  adjudicators?: ElementIds<ElementType.Title>;
  enforcers?: ElementIds<ElementType.Title>;
}

/**
 * Location element type
 * Fields organized by sections: Setting, Politics, World, Production, Commerce, Construction, Defense
 */
export interface Location extends BaseElement {
  // Setting
  form?: string;
  function?: string;
  founding_date?: number;
  parent_location?: ElementId<ElementType.Location>;
  populations?: ElementIds<ElementType.Collective>;

  // Politics
  political_climate?: string;
  primary_power?: ElementId<ElementType.Institution>;
  governing_title?: ElementId<ElementType.Title>;
  secondary_powers?: ElementIds<ElementType.Institution>;
  zone?: ElementId<ElementType.Zone>;
  rival?: ElementId<ElementType.Location>;
  partner?: ElementId<ElementType.Location>;

  // World
  customs?: string;
  founders?: ElementIds<ElementType.Character>;
  cults?: ElementIds<ElementType.Construct>;
  delicacies?: ElementIds<ElementType.Species>;

  // Production
  extraction_methods?: ElementIds<ElementType.Construct>;
  extraction_goods?: ElementIds<ElementType.Construct>;
  industry_methods?: ElementIds<ElementType.Construct>;
  industry_goods?: ElementIds<ElementType.Construct>;

  // Commerce
  infrastructure?: string;
  extraction_markets?: ElementIds<ElementType.Location>;
  industry_markets?: ElementIds<ElementType.Location>;
  currencies?: ElementIds<ElementType.Construct>;

  // Construction
  architecture?: string;
  buildings?: ElementIds<ElementType.Object>;
  building_methods?: ElementIds<ElementType.Construct>;

  // Defense
  defensibility?: string;
  elevation?: number;
  fighters?: ElementIds<ElementType.Construct>;
  defensive_objects?: ElementIds<ElementType.Object>;
}

/**
 * Phenomenon element type
 * Fields organized by sections: Mechanics, World
 */
export interface Phenomenon extends BaseElement {
  // Mechanics
  expression?: string;
  effects?: string;
  duration?: number;
  catalysts?: ElementIds<ElementType.Object>;
  empowerments?: ElementIds<ElementType.Ability>;

  // World
  mythology?: string;
  system?: ElementId<ElementType.Phenomenon>;
  triggers?: ElementIds<ElementType.Construct>;
  wielders?: ElementIds<ElementType.Character>;
  environments?: ElementIds<ElementType.Location>;
}

/**
 * Relation element type
 * Fields organized by sections: Nature, Involves
 */
export interface Relation extends BaseElement {
  // Nature
  background?: string;
  start_date?: number;
  end_date?: number;
  intensity?: number;
  actor?: ElementId<ElementType.Character>;
  events?: ElementIds<ElementType.Event>;

  // Involves
  characters?: ElementIds<ElementType.Character>;
  objects?: ElementIds<ElementType.Object>;
  locations?: ElementIds<ElementType.Location>;
  species?: ElementIds<ElementType.Species>;
  creatures?: ElementIds<ElementType.Creature>;
  institutions?: ElementIds<ElementType.Institution>;
  traits?: ElementIds<ElementType.Trait>;
  collectives?: ElementIds<ElementType.Collective>;
  zones?: ElementIds<ElementType.Zone>;
  abilities?: ElementIds<ElementType.Ability>;
  phenomena?: ElementIds<ElementType.Phenomenon>;
  languages?: ElementIds<ElementType.Language>;
  families?: ElementIds<ElementType.Family>;
  titles?: ElementIds<ElementType.Title>;
  constructs?: ElementIds<ElementType.Construct>;
  narratives?: ElementIds<ElementType.Narrative>;
}

/**
 * Species element type
 * Fields organized by sections: Biology, Psychology, World
 */
export interface Species extends BaseElement {
  // Biology
  appearance?: string;
  life_span?: number;
  weight?: number;
  nourishment?: ElementIds<ElementType.Species>;
  reproduction?: ElementIds<ElementType.Construct>;
  adaptations?: ElementIds<ElementType.Ability>;

  // Psychology
  instincts?: string;
  sociality?: string;
  temperament?: string;
  communication?: string;
  aggression?: number;
  traits?: ElementIds<ElementType.Trait>;

  // World
  role?: string;
  parent_species?: ElementId<ElementType.Species>;
  locations?: ElementIds<ElementType.Location>;
  zones?: ElementIds<ElementType.Zone>;
  affinities?: ElementIds<ElementType.Phenomenon>;
}

/**
 * Zone element type
 * Fields organized by sections: Scope, World
 */
export interface Zone extends BaseElement {
  // Scope
  role?: string;
  start_date?: number;
  end_date?: number;
  phenomena?: ElementIds<ElementType.Phenomenon>;
  linked_zones?: ElementIds<ElementType.Zone>;

  // World
  context?: string;
  populations?: ElementIds<ElementType.Collective>;
  titles?: ElementIds<ElementType.Title>;
  principles?: ElementIds<ElementType.Construct>;
}

/**
 * Title element type
 * Fields organized by sections: Mandate, World
 */
export interface Title extends BaseElement {
  // Mandate
  authority?: string;
  eligibility?: string;
  grant_date?: number;
  revoke_date?: number;
  issuer?: ElementId<ElementType.Institution>;
  body?: ElementId<ElementType.Institution>;
  superior_title?: ElementId<ElementType.Title>;
  holders?: ElementIds<ElementType.Character>;
  symbols?: ElementIds<ElementType.Object>;

  // World
  status?: string;
  history?: string;
  characters?: ElementIds<ElementType.Character>;
  institutions?: ElementIds<ElementType.Institution>;
  families?: ElementIds<ElementType.Family>;
  zones?: ElementIds<ElementType.Zone>;
  locations?: ElementIds<ElementType.Location>;
  objects?: ElementIds<ElementType.Object>;
  constructs?: ElementIds<ElementType.Construct>;
  laws?: ElementIds<ElementType.Law>;
  collectives?: ElementIds<ElementType.Collective>;
  creatures?: ElementIds<ElementType.Creature>;
  phenomena?: ElementIds<ElementType.Phenomenon>;
  species?: ElementIds<ElementType.Species>;
  languages?: ElementIds<ElementType.Language>;
}

/**
 * Trait element type
 * Fields organized by sections: Qualitative, Quantitative, World
 */
export interface Trait extends BaseElement {
  // Qualitative
  social_effects?: string;
  physical_effects?: string;
  functional_effects?: string;
  personality_effects?: string;
  behaviour_effects?: string;

  // Quantitative
  charisma?: number;
  coercion?: number;
  competence?: number;
  compassion?: number;
  creativity?: number;
  courage?: number;

  // World
  significance?: string;
  anti_trait?: ElementId<ElementType.Trait>;
  empowered_abilities?: ElementIds<ElementType.Ability>;
}

/**
 * Narrative element type
 * Fields organized by sections: Context, Involves
 */
export interface Narrative extends BaseElement {
  // Context
  story?: string;
  consequences?: string;
  start_date?: number;
  end_date?: number;
  order?: number;
  parent_narrative?: ElementId<ElementType.Narrative>;
  protagonist?: ElementId<ElementType.Character>;
  antagonist?: ElementId<ElementType.Character>;
  narrator?: ElementId<ElementType.Character>;
  conservator?: ElementId<ElementType.Institution>;

  // Involves
  events?: ElementIds<ElementType.Event>;
  characters?: ElementIds<ElementType.Character>;
  objects?: ElementIds<ElementType.Object>;
  locations?: ElementIds<ElementType.Location>;
  species?: ElementIds<ElementType.Species>;
  creatures?: ElementIds<ElementType.Creature>;
  institutions?: ElementIds<ElementType.Institution>;
  traits?: ElementIds<ElementType.Trait>;
  collectives?: ElementIds<ElementType.Collective>;
  zones?: ElementIds<ElementType.Zone>;
  abilities?: ElementIds<ElementType.Ability>;
  phenomena?: ElementIds<ElementType.Phenomenon>;
  languages?: ElementIds<ElementType.Language>;
  families?: ElementIds<ElementType.Family>;
  relations?: ElementIds<ElementType.Relation>;
  titles?: ElementIds<ElementType.Title>;
  constructs?: ElementIds<ElementType.Construct>;
  laws?: ElementIds<ElementType.Law>;
}

/**
 * Map element type
 * Fields organized by sections: Details
 */
export interface Map extends BaseElement {
  // Details
  background_color?: string;
  hierarchy?: number;
  width?: number;
  height?: number;
  depth?: number;
  parent_map?: ElementId<ElementType.Map>;
  location?: ElementId<ElementType.Location>;
}

/**
 * Marker element type
 * Fields organized by sections: Details
 */
export interface Marker extends BaseElement {
  // Details
  map?: ElementId<ElementType.Map>;
  zone?: ElementId<ElementType.Zone>;
  x?: number;
  y?: number;
  z?: number;
  order?: number;
}

/**
 * Pin element type
 * Fields organized by sections: Details
 */
export interface Pin extends BaseElement {
  // Details
  map?: ElementId<ElementType.Map>;
  element_type?: ElementType;
  element_id?: AnyElementId;

  /**
   * X coordinate on map (must be integer)
   * The API requires integer values. Float coordinates from mouse events
   * or calculations should be rounded: Math.round(x)
   */
  x?: number;

  /**
   * Y coordinate on map (must be integer)
   * The API requires integer values. Float coordinates from mouse events
   * or calculations should be rounded: Math.round(y)
   */
  y?: number;

  /**
   * Z coordinate for 3D positioning (must be integer)
   * The API requires integer values. Float coordinates should be rounded: Math.round(z)
   */
  z?: number;
}

/**
 * Input types for API requests
 * Use field names without _id/_ids suffix - prepareRelations() handles conversion
 */
export interface AbilityInput extends Omit<Ability, 'tradition' | 'source' | 'locus' | 'effects' | 'talents' | 'requisites' | 'instruments' | 'systems'> {
  tradition?: string;
  source?: string;
  locus?: string;
  effects?: string[];
  talents?: string[];
  requisites?: string[];
  instruments?: string[];
  systems?: string[];
}

export interface ObjectInput extends Omit<Object, 'parent_object' | 'location' | 'language' | 'materials' | 'technology' | 'effects' | 'abilities' | 'consumes' | 'affinities'> {
  parent_object?: string;
  location?: string;
  language?: string;
  materials?: string[];
  technology?: string[];
  effects?: string[];
  abilities?: string[];
  consumes?: string[];
  affinities?: string[];
}

export interface CharacterInput extends Omit<Character, 'birthplace' | 'location' | 'species' | 'traits' | 'abilities' | 'languages' | 'objects' | 'institutions' | 'family' | 'friends' | 'rivals'> {
  // Single links - use field name, prepareRelations() adds _id suffix
  birthplace?: string;
  location?: string;
  // Multi links - use field name, prepareRelations() adds _ids suffix
  species?: string[];
  traits?: string[];
  abilities?: string[];
  languages?: string[];
  objects?: string[];
  institutions?: string[];
  family?: string[];
  friends?: string[];
  rivals?: string[];
}

export interface CollectiveInput extends Omit<Collective, 'operator' | 'equipment' | 'abilities' | 'symbolism' | 'species' | 'characters' | 'creatures' | 'phenomena'> {
  operator?: string;
  equipment?: string[];
  abilities?: string[];
  symbolism?: string[];
  species?: string[];
  characters?: string[];
  creatures?: string[];
  phenomena?: string[];
}

export interface ConstructInput extends Omit<Construct, 'founder' | 'custodian' | 'characters' | 'objects' | 'locations' | 'species' | 'creatures' | 'institutions' | 'traits' | 'collectives' | 'zones' | 'abilities' | 'phenomena' | 'languages' | 'families' | 'relations' | 'titles' | 'constructs' | 'events' | 'narratives'> {
  founder?: string;
  custodian?: string;
  characters?: string[];
  objects?: string[];
  locations?: string[];
  species?: string[];
  creatures?: string[];
  institutions?: string[];
  traits?: string[];
  collectives?: string[];
  zones?: string[];
  abilities?: string[];
  phenomena?: string[];
  languages?: string[];
  families?: string[];
  relations?: string[];
  titles?: string[];
  constructs?: string[];
  events?: string[];
  narratives?: string[];
}

export interface CreatureInput extends Omit<Creature, 'location' | 'zone' | 'species' | 'traits' | 'abilities' | 'languages' | 'actions'> {
  location?: string;
  zone?: string;
  species?: string[];
  traits?: string[];
  abilities?: string[];
  languages?: string[];
  actions?: string[];
}

export interface EventInput extends Omit<Event, 'triggers' | 'characters' | 'objects' | 'locations' | 'species' | 'creatures' | 'institutions' | 'traits' | 'collectives' | 'zones' | 'abilities' | 'phenomena' | 'languages' | 'families' | 'relations' | 'titles' | 'constructs'> {
  triggers?: string[];
  characters?: string[];
  objects?: string[];
  locations?: string[];
  species?: string[];
  creatures?: string[];
  institutions?: string[];
  traits?: string[];
  collectives?: string[];
  zones?: string[];
  abilities?: string[];
  phenomena?: string[];
  languages?: string[];
  families?: string[];
  relations?: string[];
  titles?: string[];
  constructs?: string[];
}

export interface FamilyInput extends Omit<Family, 'traditions' | 'traits' | 'abilities' | 'languages' | 'ancestors' | 'estates' | 'governs' | 'heirlooms' | 'creatures'> {
  traditions?: string[];
  traits?: string[];
  abilities?: string[];
  languages?: string[];
  ancestors?: string[];
  estates?: string[];
  governs?: string[];
  heirlooms?: string[];
  creatures?: string[];
}

export interface InstitutionInput extends Omit<Institution, 'parent_institution' | 'zones' | 'objects' | 'creatures' | 'allies' | 'adversaries' | 'constructs'> {
  parent_institution?: string;
  zones?: string[];
  objects?: string[];
  creatures?: string[];
  allies?: string[];
  adversaries?: string[];
  constructs?: string[];
}

export interface LanguageInput extends Omit<Language, 'classification' | 'spread' | 'dialects'> {
  classification?: string;
  spread?: string[];
  dialects?: string[];
}

export interface LawInput extends Omit<Law, 'parent_law' | 'author' | 'penalties' | 'locations' | 'zones' | 'prohibitions' | 'adjudicators' | 'enforcers'> {
  parent_law?: string;
  author?: string;
  penalties?: string[];
  locations?: string[];
  zones?: string[];
  prohibitions?: string[];
  adjudicators?: string[];
  enforcers?: string[];
}

export interface LocationInput extends Omit<Location, 'parent_location' | 'primary_power' | 'governing_title' | 'zone' | 'rival' | 'partner' | 'populations' | 'secondary_powers' | 'founders' | 'cults' | 'delicacies' | 'extraction_methods' | 'extraction_goods' | 'industry_methods' | 'industry_goods' | 'extraction_markets' | 'industry_markets' | 'currencies' | 'buildings' | 'building_methods' | 'fighters' | 'defensive_objects'> {
  parent_location?: string;
  primary_power?: string;
  governing_title?: string;
  zone?: string;
  rival?: string;
  partner?: string;
  populations?: string[];
  secondary_powers?: string[];
  founders?: string[];
  cults?: string[];
  delicacies?: string[];
  extraction_methods?: string[];
  extraction_goods?: string[];
  industry_methods?: string[];
  industry_goods?: string[];
  extraction_markets?: string[];
  industry_markets?: string[];
  currencies?: string[];
  buildings?: string[];
  building_methods?: string[];
  fighters?: string[];
  defensive_objects?: string[];
}

export interface PhenomenonInput extends Omit<Phenomenon, 'system' | 'catalysts' | 'empowerments' | 'triggers' | 'wielders' | 'environments'> {
  system?: string;
  catalysts?: string[];
  empowerments?: string[];
  triggers?: string[];
  wielders?: string[];
  environments?: string[];
}

export interface RelationInput extends Omit<Relation, 'actor' | 'characters' | 'objects' | 'locations' | 'species' | 'creatures' | 'institutions' | 'traits' | 'collectives' | 'zones' | 'abilities' | 'phenomena' | 'languages' | 'families' | 'titles' | 'constructs' | 'events' | 'narratives'> {
  actor?: string;
  characters?: string[];
  objects?: string[];
  locations?: string[];
  species?: string[];
  creatures?: string[];
  institutions?: string[];
  traits?: string[];
  collectives?: string[];
  zones?: string[];
  abilities?: string[];
  phenomena?: string[];
  languages?: string[];
  families?: string[];
  titles?: string[];
  constructs?: string[];
  events?: string[];
  narratives?: string[];
}

export interface SpeciesInput extends Omit<Species, 'parent_species' | 'nourishment' | 'reproduction' | 'adaptations' | 'traits' | 'locations' | 'zones' | 'affinities'> {
  parent_species?: string;
  nourishment?: string[];
  reproduction?: string[];
  adaptations?: string[];
  traits?: string[];
  locations?: string[];
  zones?: string[];
  affinities?: string[];
}

export interface ZoneInput extends Omit<Zone, 'phenomena' | 'linked_zones' | 'populations' | 'titles' | 'principles'> {
  phenomena?: string[];
  linked_zones?: string[];
  populations?: string[];
  titles?: string[];
  principles?: string[];
}

export interface TitleInput extends Omit<Title, 'issuer' | 'body' | 'superior_title' | 'holders' | 'symbols' | 'characters' | 'institutions' | 'families' | 'zones' | 'locations' | 'objects' | 'constructs' | 'laws' | 'collectives' | 'creatures' | 'phenomena' | 'species' | 'languages'> {
  issuer?: string;
  body?: string;
  superior_title?: string;
  holders?: string[];
  symbols?: string[];
  characters?: string[];
  institutions?: string[];
  families?: string[];
  zones?: string[];
  locations?: string[];
  objects?: string[];
  constructs?: string[];
  laws?: string[];
  collectives?: string[];
  creatures?: string[];
  phenomena?: string[];
  species?: string[];
  languages?: string[];
}

export interface TraitInput extends Omit<Trait, 'anti_trait' | 'empowered_abilities'> {
  anti_trait?: string;
  empowered_abilities?: string[];
}

export interface NarrativeInput extends Omit<Narrative, 'parent_narrative' | 'protagonist' | 'antagonist' | 'narrator' | 'conservator' | 'events' | 'characters' | 'objects' | 'locations' | 'species' | 'creatures' | 'institutions' | 'traits' | 'collectives' | 'zones' | 'abilities' | 'phenomena' | 'languages' | 'families' | 'relations' | 'titles' | 'constructs' | 'laws'> {
  parent_narrative?: string;
  protagonist?: string;
  antagonist?: string;
  narrator?: string;
  conservator?: string;
  events?: string[];
  characters?: string[];
  objects?: string[];
  locations?: string[];
  species?: string[];
  creatures?: string[];
  institutions?: string[];
  traits?: string[];
  collectives?: string[];
  zones?: string[];
  abilities?: string[];
  phenomena?: string[];
  languages?: string[];
  families?: string[];
  relations?: string[];
  titles?: string[];
  constructs?: string[];
  laws?: string[];
}

export interface MapInput extends Omit<Map, 'parent_map' | 'location'> {
  parent_map?: string;
  location?: string;
}

export interface MarkerInput extends Omit<Marker, 'map' | 'zone'> {
  map?: string;
  zone?: string;
}

export interface PinInput extends Omit<Pin, 'map' | 'element_id'> {
  map?: string;
  element_id?: string;
}

/**
 * All available element types in OnlyWorlds
 */
export enum ElementType {
  Ability = 'ability',
  Character = 'character',
  Collective = 'collective',
  Construct = 'construct',
  Creature = 'creature',
  Event = 'event',
  Family = 'family',
  Institution = 'institution',
  Language = 'language',
  Law = 'law',
  Location = 'location',
  Map = 'map',
  Marker = 'marker',
  Narrative = 'narrative',
  Object = 'object',
  Phenomenon = 'phenomenon',
  Pin = 'pin',
  Relation = 'relation',
  Species = 'species',
  Title = 'title',
  Trait = 'trait',
  Zone = 'zone',
}

/**
 * UI labels for element types - provides proper plural forms
 * Useful for displaying element type names in user interfaces
 */
export const ELEMENT_LABELS: Record<ElementType, string> = {
  [ElementType.Ability]: 'Abilities',
  [ElementType.Character]: 'Characters',
  [ElementType.Collective]: 'Collectives',
  [ElementType.Construct]: 'Constructs',
  [ElementType.Creature]: 'Creatures',
  [ElementType.Event]: 'Events',
  [ElementType.Family]: 'Families',
  [ElementType.Institution]: 'Institutions',
  [ElementType.Language]: 'Languages',
  [ElementType.Law]: 'Laws',
  [ElementType.Location]: 'Locations',
  [ElementType.Map]: 'Maps',
  [ElementType.Marker]: 'Markers',
  [ElementType.Narrative]: 'Narratives',
  [ElementType.Object]: 'Objects',
  [ElementType.Phenomenon]: 'Phenomena',
  [ElementType.Pin]: 'Pins',
  [ElementType.Relation]: 'Relations',
  [ElementType.Species]: 'Species',
  [ElementType.Title]: 'Titles',
  [ElementType.Trait]: 'Traits',
  [ElementType.Zone]: 'Zones',
} as const;

/**
 * Get the plural label for an element type
 * @param elementType The element type
 * @returns The plural label string
 */
export function getElementLabel(elementType: ElementType): string {
  return ELEMENT_LABELS[elementType];
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

/**
 * Element section definitions - provides organized field groupings for each element type
 * Enables UI components to display fields in logical sections with proper ordering
 */
export const ELEMENT_SECTIONS: Record<ElementType, SectionInfo[]> = {
  [ElementType.Ability]: [
    { name: 'Mechanics', order: 1, fields: ["activation", "duration", "potency", "range", "effects", "challenges", "talents", "requisites"] },
    { name: 'World', order: 2, fields: ["prevalence", "tradition", "source", "locus", "instruments", "systems"] },
  ],
  [ElementType.Character]: [
    { name: 'Constitution', order: 1, fields: ["physicality", "mentality", "height", "weight", "species", "traits", "abilities"] },
    { name: 'Origins', order: 2, fields: ["background", "motivations", "birth_date", "birthplace", "languages"] },
    { name: 'World', order: 3, fields: ["reputation", "location", "objects", "institutions"] },
    { name: 'Personality', order: 4, fields: ["charisma", "coercion", "competence", "compassion", "creativity", "courage"] },
    { name: 'Social', order: 5, fields: ["family", "friends", "rivals"] },
    { name: 'TTRPG', order: 6, fields: ["level", "hit_points", "STR", "DEX", "CON", "INT", "WIS", "CHA"] },
  ],
  [ElementType.Collective]: [
    { name: 'Formation', order: 1, fields: ["composition", "count", "formation_date", "operator", "equipment"] },
    { name: 'Dynamics', order: 2, fields: ["activity", "disposition", "state", "abilities", "symbolism"] },
    { name: 'World', order: 3, fields: ["species", "characters", "creatures", "phenomena"] },
  ],
  [ElementType.Construct]: [
    { name: 'Nature', order: 1, fields: ["rationale", "history", "status", "reach", "start_date", "end_date", "founder", "custodian"] },
    { name: 'Involves', order: 2, fields: ["characters", "objects", "locations", "species", "creatures", "institutions", "traits", "collectives", "zones", "abilities", "phenomena", "languages", "families", "relations", "titles", "constructs", "events", "narratives"] },
  ],
  [ElementType.Creature]: [
    { name: 'Biology', order: 1, fields: ["appearance", "weight", "height", "species"] },
    { name: 'Behaviour', order: 2, fields: ["habits", "demeanor", "traits", "abilities", "languages"] },
    { name: 'World', order: 3, fields: ["status", "birth_date", "location", "zone"] },
    { name: 'TTRPG', order: 4, fields: ["challenge_rating", "hit_points", "armor_class", "speed", "actions"] },
  ],
  [ElementType.Event]: [
    { name: 'Nature', order: 1, fields: ["history", "challenges", "consequences", "start_date", "end_date", "triggers"] },
    { name: 'Involves', order: 2, fields: ["characters", "objects", "locations", "species", "creatures", "institutions", "traits", "collectives", "zones", "abilities", "phenomena", "languages", "families", "relations", "titles", "constructs"] },
  ],
  [ElementType.Family]: [
    { name: 'Identity', order: 1, fields: ["spirit", "history", "traditions", "traits", "abilities", "languages", "ancestors"] },
    { name: 'World', order: 2, fields: ["reputation", "estates", "governs", "heirlooms", "creatures"] },
  ],
  [ElementType.Institution]: [
    { name: 'Foundation', order: 1, fields: ["doctrine", "founding_date", "parent_institution"] },
    { name: 'Claims', order: 2, fields: ["zones", "objects", "creatures"] },
    { name: 'World', order: 3, fields: ["status", "allies", "adversaries", "constructs"] },
  ],
  [ElementType.Language]: [
    { name: 'Structure', order: 1, fields: ["phonology", "grammar", "lexicon", "writing", "classification"] },
    { name: 'World', order: 2, fields: ["status", "spread", "dialects"] },
  ],
  [ElementType.Law]: [
    { name: 'Code', order: 1, fields: ["declaration", "purpose", "date", "parent_law", "penalties"] },
    { name: 'World', order: 2, fields: ["author", "locations", "zones", "prohibitions", "adjudicators", "enforcers"] },
  ],
  [ElementType.Location]: [
    { name: 'Setting', order: 1, fields: ["form", "function", "founding_date", "parent_location", "populations"] },
    { name: 'Politics', order: 2, fields: ["political_climate", "primary_power", "governing_title", "secondary_powers", "zone", "rival", "partner"] },
    { name: 'World', order: 3, fields: ["customs", "founders", "cults", "delicacies"] },
    { name: 'Production', order: 4, fields: ["extraction_methods", "extraction_goods", "industry_methods", "industry_goods"] },
    { name: 'Commerce', order: 5, fields: ["infrastructure", "extraction_markets", "industry_markets", "currencies"] },
    { name: 'Construction', order: 6, fields: ["architecture", "buildings", "building_methods"] },
    { name: 'Defense', order: 7, fields: ["defensibility", "elevation", "fighters", "defensive_objects"] },
  ],
  [ElementType.Map]: [
    { name: 'Details', order: 1, fields: ["background_color", "hierarchy", "width", "height", "depth", "parent_map", "location"] },
  ],
  [ElementType.Marker]: [
    { name: 'Details', order: 1, fields: ["map", "zone", "x", "y", "z", "order"] },
  ],
  [ElementType.Narrative]: [
    { name: 'Context', order: 1, fields: ["story", "consequences", "start_date", "end_date", "order", "parent_narrative", "protagonist", "antagonist", "narrator", "conservator"] },
    { name: 'Involves', order: 2, fields: ["events", "characters", "objects", "locations", "species", "creatures", "institutions", "traits", "collectives", "zones", "abilities", "phenomena", "languages", "families", "relations", "titles", "constructs", "laws"] },
  ],
  [ElementType.Object]: [
    { name: 'Form', order: 1, fields: ["aesthetics", "weight", "amount", "parent_object", "materials", "technology"] },
    { name: 'Function', order: 2, fields: ["utility", "effects", "abilities", "consumes"] },
    { name: 'World', order: 3, fields: ["origins", "location", "language", "affinities"] },
  ],
  [ElementType.Phenomenon]: [
    { name: 'Mechanics', order: 1, fields: ["expression", "effects", "duration", "catalysts", "empowerments"] },
    { name: 'World', order: 2, fields: ["mythology", "system", "triggers", "wielders", "environments"] },
  ],
  [ElementType.Pin]: [
    { name: 'Details', order: 1, fields: ["map", "element_type", "element_id", "element", "x", "y", "z"] },
  ],
  [ElementType.Relation]: [
    { name: 'Nature', order: 1, fields: ["background", "start_date", "end_date", "intensity", "actor", "events"] },
    { name: 'Involves', order: 2, fields: ["characters", "objects", "locations", "species", "creatures", "institutions", "traits", "collectives", "zones", "abilities", "phenomena", "languages", "families", "relations", "titles", "constructs", "events", "narratives"] },
  ],
  [ElementType.Species]: [
    { name: 'Biology', order: 1, fields: ["appearance", "life_span", "weight", "nourishment", "reproduction", "adaptations"] },
    { name: 'Psychology', order: 2, fields: ["instincts", "sociality", "temperament", "communication", "aggression", "traits"] },
    { name: 'World', order: 3, fields: ["role", "parent_species", "locations", "zones", "affinities"] },
  ],
  [ElementType.Title]: [
    { name: 'Mandate', order: 1, fields: ["authority", "eligibility", "grant_date", "revoke_date", "issuer", "body", "superior_title", "holders", "symbols"] },
    { name: 'World', order: 2, fields: ["status", "history", "characters", "institutions", "families", "zones", "locations", "objects", "constructs", "laws", "collectives", "creatures", "phenomena", "species", "languages"] },
  ],
  [ElementType.Trait]: [
    { name: 'Qualitative', order: 1, fields: ["social_effects", "physical_effects", "functional_effects", "personality_effects", "behaviour_effects"] },
    { name: 'Quantitative', order: 2, fields: ["charisma", "coercion", "competence", "compassion", "creativity", "courage"] },
    { name: 'World', order: 3, fields: ["significance", "anti_trait", "empowered_abilities"] },
  ],
  [ElementType.Zone]: [
    { name: 'Scope', order: 1, fields: ["role", "start_date", "end_date", "phenomena", "linked_zones"] },
    { name: 'World', order: 2, fields: ["context", "populations", "titles", "principles"] },
  ]
} as const;

/**
 * Get sections for an element type
 * @param elementType The element type
 * @returns Array of section information for the element type
 */
export function getElementSections(elementType: ElementType): SectionInfo[] {
  return ELEMENT_SECTIONS[elementType] || [];
}

/**
 * Current OnlyWorlds version
 * Synced with https://github.com/OnlyWorlds/OnlyWorlds/blob/main/VERSION
 */
export const ONLYWORLDS_VERSION = '00.30.00' as const;

/**
 * Material Design icons for element types
 * These are the uniform, monochrome icons used in the OnlyWorlds frontend
 * Compatible with Google Material Icons font
 */
export const ELEMENT_ICONS: Record<ElementType, string> = {
  [ElementType.Ability]: 'auto_fix_normal',
  [ElementType.Character]: 'person',
  [ElementType.Collective]: 'groups_3',
  [ElementType.Construct]: 'api',
  [ElementType.Creature]: 'bug_report',
  [ElementType.Event]: 'saved_search',
  [ElementType.Family]: 'supervisor_account',
  [ElementType.Institution]: 'business',
  [ElementType.Language]: 'edit_road',
  [ElementType.Law]: 'gpp_bad',
  [ElementType.Location]: 'castle',
  [ElementType.Map]: 'map',
  [ElementType.Marker]: 'place',
  [ElementType.Narrative]: 'menu_book',
  [ElementType.Object]: 'webhook',
  [ElementType.Phenomenon]: 'thunderstorm',
  [ElementType.Pin]: 'push_pin',
  [ElementType.Relation]: 'link',
  [ElementType.Species]: 'crib',
  [ElementType.Title]: 'military_tech',
  [ElementType.Trait]: 'flaky',
  [ElementType.Zone]: 'architecture',
} as const;

/**
 * Get Material Design icon for an element type
 * Returns the uniform monochrome icon used in OnlyWorlds frontend
 * @param elementType The element type
 * @returns Material icon name
 */
export function getElementIcon(elementType: ElementType): string {
  return ELEMENT_ICONS[elementType];
}

// ============================================================================
// COMPREHENSIVE FIELD SCHEMA METADATA
// ============================================================================

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
}

/**
 * Comprehensive field schema - provides complete metadata for all fields
 * Maps element types to their field definitions including types and cardinality
 */
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
    duration: { type: 'number' },
    potency: { type: 'number' },
    range: { type: 'number' },
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
    height: { type: 'number' },
    weight: { type: 'number' },
    species: { type: 'multi_link', target: 'species' },
    traits: { type: 'multi_link', target: 'trait' },
    abilities: { type: 'multi_link', target: 'ability' },
    // Origins
    background: { type: 'text' },
    motivations: { type: 'text' },
    birth_date: { type: 'number' },
    birthplace: { type: 'single_link', target: 'location' },
    languages: { type: 'multi_link', target: 'language' },
    // World
    reputation: { type: 'text' },
    location: { type: 'single_link', target: 'location' },
    objects: { type: 'multi_link', target: 'object' },
    institutions: { type: 'multi_link', target: 'institution' },
    // Personality
    charisma: { type: 'number' },
    coercion: { type: 'number' },
    competence: { type: 'number' },
    compassion: { type: 'number' },
    creativity: { type: 'number' },
    courage: { type: 'number' },
    // Social
    family: { type: 'multi_link', target: 'family' },
    friends: { type: 'multi_link', target: 'character' },
    rivals: { type: 'multi_link', target: 'character' },
    // TTRPG
    level: { type: 'number' },
    hit_points: { type: 'number' },
    STR: { type: 'number' },
    DEX: { type: 'number' },
    CON: { type: 'number' },
    INT: { type: 'number' },
    WIS: { type: 'number' },
    CHA: { type: 'number' }
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
    count: { type: 'number' },
    formation_date: { type: 'number' },
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
    start_date: { type: 'number' },
    end_date: { type: 'number' },
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
    weight: { type: 'number' },
    height: { type: 'number' },
    species: { type: 'multi_link', target: 'species' },
    // Behaviour
    habits: { type: 'text' },
    demeanor: { type: 'text' },
    traits: { type: 'multi_link', target: 'trait' },
    abilities: { type: 'multi_link', target: 'ability' },
    languages: { type: 'multi_link', target: 'language' },
    // World
    status: { type: 'text' },
    birth_date: { type: 'number' },
    location: { type: 'single_link', target: 'location' },
    zone: { type: 'single_link', target: 'zone' },
    // TTRPG
    challenge_rating: { type: 'number' },
    hit_points: { type: 'number' },
    armor_class: { type: 'number' },
    speed: { type: 'number' },
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
    start_date: { type: 'number' },
    end_date: { type: 'number' },
    triggers: { type: 'multi_link', target: 'construct' },
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
    founding_date: { type: 'number' },
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
    date: { type: 'number' },
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
    founding_date: { type: 'number' },
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
    elevation: { type: 'number' },
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
    hierarchy: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
    depth: { type: 'number' },
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
    map: { type: 'single_link', target: 'map' },
    zone: { type: 'single_link', target: 'zone' },
    x: { type: 'number' },
    y: { type: 'number' },
    z: { type: 'number' },
    order: { type: 'number' }
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
    start_date: { type: 'number' },
    end_date: { type: 'number' },
    order: { type: 'number' },
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
    weight: { type: 'number' },
    amount: { type: 'number' },
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
    duration: { type: 'number' },
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
    map: { type: 'single_link', target: 'map' },
    element_type: { type: 'text' }, // ElementType enum value
    element_id: { type: 'single_link', target: 'any' }, // Can reference any element
    x: { type: 'number' },
    y: { type: 'number' },
    z: { type: 'number' }
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
    start_date: { type: 'number' },
    end_date: { type: 'number' },
    intensity: { type: 'number' },
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
    life_span: { type: 'number' },
    weight: { type: 'number' },
    nourishment: { type: 'multi_link', target: 'species' },
    reproduction: { type: 'multi_link', target: 'construct' },
    adaptations: { type: 'multi_link', target: 'ability' },
    // Psychology
    instincts: { type: 'text' },
    sociality: { type: 'text' },
    temperament: { type: 'text' },
    communication: { type: 'text' },
    aggression: { type: 'number' },
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
    grant_date: { type: 'number' },
    revoke_date: { type: 'number' },
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
    charisma: { type: 'number' },
    coercion: { type: 'number' },
    competence: { type: 'number' },
    compassion: { type: 'number' },
    creativity: { type: 'number' },
    courage: { type: 'number' },
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
    start_date: { type: 'number' },
    end_date: { type: 'number' },
    phenomena: { type: 'multi_link', target: 'phenomenon' },
    linked_zones: { type: 'multi_link', target: 'zone' },
    // World
    context: { type: 'text' },
    populations: { type: 'multi_link', target: 'collective' },
    titles: { type: 'multi_link', target: 'title' },
    principles: { type: 'multi_link', target: 'construct' }
  }
} as const;

// ============================================================================
// TYPE ASSERTION HELPERS
// ============================================================================

/**
 * Creates a typed element ID from a string
 * @param id The string ID to brand
 * @returns Branded ElementId
 */
export function createElementId<T extends ElementType>(id: string): ElementId<T> {
  return id as ElementId<T>;
}

/**
 * Creates typed element IDs array from string array
 * @param ids The string IDs to brand
 * @returns Branded ElementIds array
 */
export function createElementIds<T extends ElementType>(ids: string[]): ElementIds<T> {
  return ids as ElementIds<T>;
}

/**
 * Creates an AnyElementId that can reference any element type
 * @param id The string ID to brand
 * @returns AnyElementId
 */
export function createAnyElementId(id: string): AnyElementId {
  return id as AnyElementId;
}
