# OnlyWorlds Schema Reference

**Source**: https://github.com/OnlyWorlds/schema-dist @ **v0.30.1-dist.13** — canonical schema **00.30.01**, published 2026-07-29.

GENERATED from the canonical schema YAML — do not hand-edit (regenerate: `python codegen/generate_types.py`).
Written for both humans and AI agents reading this package locally.

**The shape rules** (v2 wire dialect): every element carries `id` (UUID), `name`, optional
`description`/`supertype`/`subtype`/`image_url`, server-managed `type`/`created_at`/`updated_at`/`change_seq`,
and namespaced extension fields (`x_*` etc.) returned verbatim. Link fields use ONE bare
name in both read and write (no `_ids` suffix). Single links are `UUID | null`; multi links
are `UUID[]`. **Links are owned one-way**: the type listed below owns the field (e.g.
Character owns `abilities`; Ability has no `characters`). Sections and their order are the
canonical display grouping.

Families (colour semantics; icon carries the type): agents · world · abstract · temporal.


## ability  ·  family: abstract  ·  icon: auto_fix_normal


### Mechanics

- `activation` (text) — Method or conditions under which the ability is activated
- `duration` (integer) — Length of time the ability remains active or its effects persist, measured in TIME units
- `potency` (integer) — Relative measure of the ability's inherent potency or force, used for scaling or comparison purposes
- `range` (integer) — Effective reach or distance at which the ability can be used, measured in DISTANCE units
- `effects` (multi link → phenomenon) — Phenomena that result from the ability's use, such as environmental changes or sensory effects
- `challenges` (text) — Describes specific difficulties or constraints that make the ability hard to master or use effectively
- `talents` (multi link → trait) — Traits that naturally enhance or improve performance with this ability
- `requisites` (multi link → construct) — Constructs that must be satisfied for the ability to be used, such as rituals, permissions, or required roles

### World

- `prevalence` (text) — How widely the ability is known or practiced, and potential clues to its origins and cultural diffusion
- `tradition` (single link → construct) — A construct that expresses the conceptual, social, or institutional system this ability operates within
- `source` (single link → phenomenon) — The phenomenon that serves as the enabling force or condition that allows this ability to function
- `locus` (single link → location) — Location where the ability is most strongly rooted, developed, or traditionally practiced
- `instruments` (multi link → object) — Objects or tools required to activate, channel, or perform the ability
- `systems` (multi link → construct) — Magic frameworks or structures that the ability associates with


## character  ·  family: agents  ·  icon: person


### Constitution

- `physicality` (text) — The character's visible physical features and body attributes
- `mentality` (text) — The character's mindset, emotional tone, and style of thinking
- `height` (integer) — The character's approximate or exact height, using world LENGTH units
- `weight` (integer) — The character's approximate or exact weight, using world MASS units
- `species` (multi link → species) — Species the character might belong to
- `traits` (multi link → trait) — Traits for notable behavioral, physical, or systemic characteristics
- `abilities` (multi link → ability) — Abilities the character might perform, control, or invoke

### Origins

- `background` (text) — History, upbringing, or formative experiences of the character
- `motivations` (text) — Core desires, goals, or values that drive the character's choices and behavior
- `birth_date` (integer) — Moment of birth, expressed in the world's TIME units
- `birthplace` (single link → location) — Location where the character was born
- `languages` (multi link → language) — Languages the character can understand, speak, or use for communication

### World

- `reputation` (text) — Brief summary of the character's current condition, role, or predicament
- `location` (single link → location) — The character's present physical location
- `objects` (multi link → object) — Key objects owned by or symbolically linked to the character
- `institutions` (multi link → institution) — Institutions the character is affiliated with

### Personality

- `charisma` (integer) — Ability to attract, inspire, and influence others
- `coercion` (integer) — Capacity to dominate, intimidate, or apply force to shape outcomes
- `competence` (integer) — Skill in planning, understanding, and managing complex systems or situations
- `compassion` (integer) — Willingness to empathize with and care for others
- `creativity` (integer) — Ability to generate novel ideas, perspectives, or solutions
- `courage` (integer) — Readiness to face danger, risk, or adversity

### Social

- `family` (multi link → family) — Families the character belongs to by blood or adoption
- `friends` (multi link → character) — Characters the character considers close allies or companions
- `rivals` (multi link → character) — Characters the character is in active opposition or competition with

### TTRPG

- `level` (integer) — Progression rank of the character in a game system
- `hit_points` (integer) — Total health available to the character
- `STR` (integer) — Physical force and carrying capacity
- `DEX` (integer) — Agility, coordination, and reflexes
- `CON` (integer) — Endurance and resistance to strain
- `INT` (integer) — Reasoning, memory, and learning
- `WIS` (integer) — Intuition, awareness, and judgment
- `CHA` (integer) — Persuasiveness and personal magnetism


## collective  ·  family: agents  ·  icon: groups_3


### Formation

- `composition` (text) — Internal structure or demographic makeup of the collective
- `count` (integer) — Number of members in the collective (approximate or exact)
- `formation_date` (integer) — Date the collective was formed, using world TIME units
- `operator` (single link → institution) — Institution that manages or directs the collective
- `equipment` (multi link → object) — Tools or gear in possession of and/or regularly used by the collective

### Dynamics

- `activity` (text) — Primary behaviors or actions the collective engages in
- `disposition` (text) — Emotional control or volatility expressed by the collective
- `state` (text) — Current condition or operational status of the collective
- `abilities` (multi link → ability) — Abilities commonly shared among members of the collective, or abilities of that collective as a whole
- `symbolism` (multi link → construct) — Cultural expressions, rituals, or symbols that unify or distinguish the collective

### World

- `species` (multi link → species) — Species that compose or participate in the collective
- `characters` (multi link → character) — Characters who are members of the collective
- `creatures` (multi link → creature) — Creatures associated with or included in the collective
- `phenomena` (multi link → phenomenon) — Phenomena that influence or characterize the collective


## construct  ·  family: world  ·  icon: api


### Nature

- `rationale` (text) — The internal reasoning, structure, or justification of how the construct functions or makes sense within the world
- `history` (text) — The historical development or ideation of the construct, and its place in wider historical contexts
- `status` (text) — The present condition or operational status of the construct
- `reach` (text) — The geographic, cultural, or political extent of the construct's influence
- `start_date` (integer) — The point in time when the construct began or was first established (uses world's TIME definition)
- `end_date` (integer) — The point in time when the construct ceased to function or lost its meaning
- `founder` (single link → character) — Character who conceived or initiated the construct
- `custodian` (single link → institution) — Institution maintaining, enforcing, or exploiting the construct

### Involves

- `characters` (multi link → character) — Characters relevant to the construct
- `objects` (multi link → object) — Objects relevant to the construct
- `locations` (multi link → location) — Locations relevant to the construct
- `species` (multi link → species) — Species relevant to the construct
- `creatures` (multi link → creature) — Creatures relevant to the construct
- `institutions` (multi link → institution) — Institutions relevant to the construct
- `traits` (multi link → trait) — Traits relevant to the construct
- `collectives` (multi link → collective) — Collectives relevant to the construct
- `zones` (multi link → zone) — Zones relevant to the construct
- `abilities` (multi link → ability) — Abilities relevant to the construct
- `phenomena` (multi link → phenomenon) — Phenomena relevant to the construct
- `languages` (multi link → language) — Languages relevant to the construct
- `families` (multi link → family) — Families relevant to the construct
- `relations` (multi link → relation) — Relations relevant to the construct
- `titles` (multi link → title) — Titles relevant to the construct
- `constructs` (multi link → construct) — Other constructs relevant to the construct
- `events` (multi link → event) — Events relevant to the construct
- `narratives` (multi link → narrative) — Narratives relevant to the construct


## creature  ·  family: agents  ·  icon: bug_report


### Biology

- `appearance` (text) — Visual description of the creature
- `weight` (integer) — Approximate or exact weight of the creature, using world MASS units
- `height` (integer) — Approximate height of the creature, using the world's defined LENGTH units
- `species` (multi link → species) — Species this creature belongs to

### Behavior

- `habits` (text) — Typical behaviors, instincts, or recurring actions the creature tends to display
- `demeanor` (text) — The emotional tone or attitude the creature conveys through posture, expression, or aggression
- `traits` (multi link → trait) — Traits that influence the creature's behavior, capabilities, or appearance
- `abilities` (multi link → ability) — Innate or learned abilities the creature can perform or activate
- `languages` (multi link → language) — Languages the creature can understand, speak, or otherwise use to communicate

### World

- `status` (text) — Current situation or classification of the creature
- `birth_date` (integer) — The time of the creature's birth, recorded in the world's defined TIME unit
- `location` (single link → location) — Specific location where the creature is currently found or most associated with
- `zone` (single link → zone) — Larger area or region commonly inhabited or currently claimed by the creature

### TTRPG

- `challenge_rating` (integer) — Difficulty or threat level of the creature in a gameplay context
- `hit_points` (integer) — Total health or durability value in combat
- `armor_class` (integer) — Defense rating against physical attacks or effects
- `speed` (integer) — Typical movement speed, measured in the world's DISTANCE unit per round
- `actions` (multi link → ability) — Combat or tactical abilities the creature can perform or use


## event  ·  family: temporal  ·  icon: saved_search


### Nature

- `history` (text) — Historical context and background of the event
- `challenges` (text) — Adversity or difficulties faced during the event
- `consequences` (text) — Outcomes and impacts resulting from the event
- `start_date` (integer) — Date on which the event began
- `end_date` (integer) — Date on which the event concluded
- `triggers` (multi link → event) — Events that precipitated this event

### Involves

- `characters` (multi link → character) — Key characters relevant to the event
- `objects` (multi link → object) — Objects relevant to the event
- `locations` (multi link → location) — Locations relevant to the event
- `species` (multi link → species) — Species relevant to the event
- `creatures` (multi link → creature) — Creatures relevant to the event
- `institutions` (multi link → institution) — Institutions relevant to the event
- `traits` (multi link → trait) — Traits relevant to the event
- `collectives` (multi link → collective) — Groups or collectives relevant to the event
- `zones` (multi link → zone) — Zones relevant to the event
- `abilities` (multi link → ability) — Abilities relevant to the event
- `phenomena` (multi link → phenomenon) — Natural or supernatural phenomena relevant to the event
- `languages` (multi link → language) — Languages relevant to the event
- `families` (multi link → family) — Families relevant to the event
- `relations` (multi link → relation) — Interpersonal or political relations relevant to the event
- `titles` (multi link → title) — Titles relevant to the event
- `constructs` (multi link → construct) — Concepts, laws, or built entities relevant to the event


## family  ·  family: agents  ·  icon: supervisor_account


### Identity

- `spirit` (text) — The core values or shared ethos that the family embodies
- `history` (text) — Background or origin story of the family
- `traditions` (multi link → construct) — Cultural practices, symbols, or customs overseen by the family
- `traits` (multi link → trait) — Traits possibly found among members of the family
- `abilities` (multi link → ability) — Abilities or special qualities possibly present in the family
- `languages` (multi link → language) — Languages spoken by, or associated with the family
- `ancestors` (multi link → character) — Notable forebears or historic characters in the family's lineage

### World

- `reputation` (text) — Current social, political, or general standing of the family
- `estates` (multi link → location) — Key locations owned, governed, or symbolically tied to the family
- `governs` (multi link → institution) — Institutions administered or managed by the family
- `heirlooms` (multi link → object) — Important objects or artifacts handed down by the family
- `creatures` (multi link → creature) — Creatures owned, bonded to, or representing the family


## institution  ·  family: agents  ·  icon: business


### Foundation

- `doctrine` (text) — Core belief, mission, or purpose that drives the institution
- `founding_date` (integer) — Date when the institution was established, in the world's TIME format
- `parent_institution` (single link → institution) — Institution that governs, embodies, or originated this one

### Claims

- `zones` (multi link → zone) — Areas the institution controls or claims authority over
- `objects` (multi link → object) — Significant objects owned or tied to the institution's operations, holdings, or identity
- `creatures` (multi link → creature) — Creatures under the institution's protection, use, or symbolic control

### World

- `status` (text) — Current political, cultural, or functional standing of the institution in the world
- `allies` (multi link → institution) — Institutions this one actively cooperates or aligns with
- `adversaries` (multi link → institution) — Institutions this one opposes, competes with, or is in conflict with
- `constructs` (multi link → construct) — Conceptual, procedural, or structural systems created or maintained by the institution


## language  ·  family: abstract  ·  icon: edit_road


### Structure

- `phonology` (text) — The language's sound systems, including phonemes, tone, and pronunciation rules
- `grammar` (text) — Rules governing syntax, morphology, and sentence structure
- `lexicon` (text) — Vocabulary principles or full word lists used in the language
- `writing` (text) — Script or notation system used to represent the language in written form
- `classification` (single link → construct) — Linguistic group or typological category the language belongs to

### World

- `status` (text) — Current vitality, reputation, or dominance of the language
- `spread` (multi link → location) — Geographical areas where the language is used or spoken
- `dialects` (multi link → language) — Variants or dialect languages derived from the language


## law  ·  family: abstract  ·  icon: gpp_bad


### Code

- `declaration` (text) — The formal wording, expression, or decree of the law
- `purpose` (text) — The intent, motivation, or justification for the law's creation
- `date` (integer) — Date the law was formally established, in world TIME units
- `parent_law` (single link → law) — A law that this law derives from, modifies, or enhances
- `penalties` (multi link → construct) — Consequences intended to be applied when the law is contravened

### World

- `author` (single link → institution) — The institution that created or issued the law
- `locations` (multi link → location) — Locations where the law is supported or enforced
- `zones` (multi link → zone) — Zones where the law is supported or enforced
- `prohibitions` (multi link → construct) — Things that the law explicitly or effectively forbids
- `adjudicators` (multi link → title) — Titles responsible for interpreting or ruling on the law's application and jurisdiction
- `enforcers` (multi link → title) — Titles responsible for enforcing or imposing the law


## location  ·  family: world  ·  icon: castle


### Setting

- `form` (text) — Visual and environmental aspects of the location
- `function` (text) — Main use, role, or purpose of the location within the world
- `founding_date` (integer) — Date on which the location was founded, established, or designated
- `parent_location` (single link → location) — Wider location that this location is part of
- `populations` (multi link → collective) — Distinct collective groups or communities residing within the location

### Politics

- `political_climate` (text) — Political structure, stability, and dynamics of the location
- `primary_power` (single link → institution) — Institution that has the highest degree of political control over the location
- `governing_title` (single link → title) — Governing figure assigned by the location's primary power
- `secondary_powers` (multi link → institution) — Institutions with significant political control
- `zone` (single link → zone) — Zone of interest that is associated with the location
- `rival` (single link → location) — Locations with active, traditional, or historical rivalries
- `partner` (single link → location) — Locations with active, cooperative, or historical ties

### World

- `customs` (text) — Cultural practices, habits, or festivals
- `founders` (multi link → character) — Individual(s) who founded or named the location
- `cults` (multi link → construct) — Significant religious constructs practiced or recognized at the location
- `delicacies` (multi link → species) — Organisms or other species locally consumed or celebrated as specialty foods

### Production

- `extraction_methods` (multi link → construct) — Techniques or strategies used to gather natural resources
- `extraction_goods` (multi link → construct) — Products and materials that are gathered or obtained
- `industry_methods` (multi link → construct) — Techniques or workflows used to refine or manufacture goods
- `industry_goods` (multi link → construct) — Products and materials that are refined or manufactured

### Commerce

- `infrastructure` (text) — Roads, ports, and other physical systems that enable the movement of goods and people
- `extraction_markets` (multi link → location) — Locations that receive extracted goods through trade, interchange, or seizure
- `industry_markets` (multi link → location) — Locations that receive industrial goods through trade, interchange, or seizure
- `currencies` (multi link → construct) — Trade media recognized or circulated at the location

### Construction

- `architecture` (text) — Look, form, and materials used in the built environment and location design
- `buildings` (multi link → object) — Notable structural objects at the location
- `building_methods` (multi link → construct) — Techniques or systems used to construct structures at the location

### Defense

- `defensibility` (text) — Qualities of natural, constructed, and implemented defenses at the location
- `elevation` (integer) — Height or elevation of the location relative to surrounding terrain, defined in world DISTANCE units
- `fighters` (multi link → construct) — Military units or forces responsible for defending the location
- `defensive_objects` (multi link → object) — Objects or installations for defending the location


## map  ·  family: world  ·  icon: map


### Details

- `background_color` (text) — Color of the space around the map when zoomed out
- `hierarchy` (integer) — To associate or differentiate between maps with a common parent
- `width` (integer) — In pixels
- `height` (integer) — In pixels
- `depth` (integer) — In pixels
- `parent_map` (single link → map) — Map within which this map is contained
- `location` (single link → location) — Location element that this map represents


## marker  ·  family: world  ·  icon: place


### Details

- `map` (single link → map) — Map this marker is placed on
- `zone` (single link → zone) — Zone that is defined by this marker
- `x` (integer) — x coordinate, from bottom left of the map
- `y` (integer) — y coordinate, from bottom left of the map
- `z` (integer) — z coordinate, in case of depth
- `order` (integer) — Sequence position when markers define a polygon or line (0 = first point)


## narrative  ·  family: temporal  ·  icon: menu_book


### Context

- `story` (text) — Content of the narrative, as told or remembered
- `consequences` (text) — Outcomes or legacy of the narrative
- `start_date` (integer) — Date when the narrative begins, measured in world TIME units
- `end_date` (integer) — Date when the narrative ends, measured in world TIME units
- `order` (integer) — Position of this narrative within a parent narrative's sequence
- `parent_narrative` (single link → narrative) — Larger narrative that this narrative takes place in
- `protagonist` (single link → character) — Primary character of the narrative
- `antagonist` (single link → character) — Opposing character of the narrative
- `narrator` (single link → character) — Character credited with telling or recording the narrative
- `conservator` (single link → institution) — Institution that preserves or curates the narrative

### Involves

- `events` (multi link → event) — Events relevant to the narrative
- `characters` (multi link → character) — Characters relevant to the narrative
- `objects` (multi link → object) — Objects relevant to the narrative
- `locations` (multi link → location) — Locations relevant to the narrative
- `species` (multi link → species) — Species relevant to the narrative
- `creatures` (multi link → creature) — Creatures relevant to the narrative
- `institutions` (multi link → institution) — Institutions relevant to the narrative
- `traits` (multi link → trait) — Traits relevant to the narrative
- `collectives` (multi link → collective) — Groups relevant to the narrative
- `zones` (multi link → zone) — Zones relevant to the narrative
- `abilities` (multi link → ability) — Abilities relevant to the narrative
- `phenomena` (multi link → phenomenon) — Phenomena relevant to the narrative
- `languages` (multi link → language) — Languages relevant to the narrative
- `families` (multi link → family) — Families relevant to the narrative
- `relations` (multi link → relation) — Relationships relevant to the narrative
- `titles` (multi link → title) — Titles relevant to the narrative
- `constructs` (multi link → construct) — Constructs relevant to the narrative
- `laws` (multi link → law) — Laws relevant to the narrative


## object  ·  family: world  ·  icon: webhook


### Form

- `aesthetics` (text) — Appearance, design, or visual presentation of the object
- `weight` (integer) — Approximate or exact mass of the object, defined by world MASS units
- `amount` (integer) — The number of identical units in this object entry
- `parent_object` (single link → object) — Larger object that this one is part of or contained within
- `materials` (multi link → construct) — The physical matter that constitutes the object
- `technology` (multi link → construct) — Mechanisms relating to the object's design or operation

### Function

- `utility` (text) — Intended purpose or primary use of the object
- `effects` (multi link → phenomenon) — Phenomena potentially triggered or emitted on object use
- `abilities` (multi link → ability) — Abilities that the object grants or enables
- `consumes` (multi link → construct) — What might be used or depleted on object use

### World

- `origins` (text) — Background or history of the object
- `location` (single link → location) — Physical place where the object is currently located or stored
- `language` (single link → language) — Required to read, understand, or activate the object
- `affinities` (multi link → trait) — Traits that resonate with or enhance the object's use, function, or effects


## phenomenon  ·  family: temporal  ·  icon: thunderstorm


### Mechanics

- `expression` (text) — How the phenomenon manifests or takes shape in the world
- `effects` (text) — The primary outcomes or changes caused by the phenomenon
- `duration` (integer) — The amount of time the phenomenon lasts, measured in world TIME units
- `catalysts` (multi link → object) — Objects or materials that initiate or enhance the phenomenon
- `empowerments` (multi link → ability) — Abilities that initiate or enhance the phenomenon, or are initiated or enhanced by it

### World

- `mythology` (text) — Cultural, religious, or narrative meaning associated with the phenomenon
- `system` (single link → phenomenon) — Broader phenomenon that this one is part of or linked to
- `triggers` (multi link → construct) — Conceptual mechanisms or patterns that cause the phenomenon to activate
- `wielders` (multi link → character) — Characters capable of intentionally directing or controlling the phenomenon
- `environments` (multi link → location) — Locations where the phenomenon occurs or is known to manifest


## pin  ·  family: world  ·  icon: push_pin


### Details

- `map` (single link → map) — Map that the pin is placed on
- `element` (generic link (any element type)) — Link to any Element (managed by ContentType + UUID)
- `x` (integer) — x coordinate, from bottom left of the map
- `y` (integer) — y coordinate, from bottom left of the map
- `z` (integer) — z coordinate, in case of depth (optional)


## relation  ·  family: temporal  ·  icon: link


### Nature

- `background` (text) — History and origin of the relation
- `start_date` (integer) — Date when the relation began, defined in world TIME units
- `end_date` (integer) — Date when the relation ended if any, defined in world TIME units
- `intensity` (integer) — Significance of the relation, on a relative scale of 0 to 100
- `actor` (single link → character) — Primary character defining the relation
- `events` (multi link → event) — Events where the relation is involved or relevant

### Involves

- `characters` (multi link → character) — Characters relevant to the relation
- `objects` (multi link → object) — Objects relevant to the relation
- `locations` (multi link → location) — Locations relevant to the relation
- `species` (multi link → species) — Species relevant to the relation
- `creatures` (multi link → creature) — Creatures relevant to the relation
- `institutions` (multi link → institution) — Institutions relevant to the relation
- `traits` (multi link → trait) — Traits relevant to the relation
- `collectives` (multi link → collective) — Collectives relevant to the relation
- `zones` (multi link → zone) — Zones relevant to the relation
- `abilities` (multi link → ability) — Abilities relevant to the relation
- `phenomena` (multi link → phenomenon) — Phenomena relevant to the relation
- `languages` (multi link → language) — Languages relevant to the relation
- `families` (multi link → family) — Families relevant to the relation
- `titles` (multi link → title) — Titles relevant to the relation
- `constructs` (multi link → construct) — Concepts, contracts, or principles relevant to the relation
- `events` (multi link → event) — Events where the relation is involved or relevant
- `narratives` (multi link → narrative) — Narratives relevant to the relation


## species  ·  family: agents  ·  icon: crib


### Biology

- `appearance` (text) — Typical physical or form features of the species
- `life_span` (integer) — Average or typical life expectancy of an individual, defined in world TIME units
- `weight` (integer) — Average or typical adult weight, defined in world MASS units
- `nourishment` (multi link → species) — Other species consumed as food sources
- `reproduction` (multi link → construct) — Reproductive method(s) of the species
- `adaptations` (multi link → ability) — Special physiological or evolutionary abilities

### Psychology

- `instincts` (text) — Innate behavioral drives and survival tendencies
- `sociality` (text) — Typical patterns of social behavior
- `temperament` (text) — Overall behavioral disposition
- `communication` (text) — Typical methods and approaches of interaction
- `aggression` (integer) — General aggressiveness level, on relative scale of 0 to 100
- `traits` (multi link → trait) — Behavioral patterns associated with the species

### World

- `role` (text) — The species' ecological or cultural function in the world
- `parent_species` (single link → species) — Species that the species is considered a subspecies of
- `locations` (multi link → location) — Locations associated with the species or its habitat
- `zones` (multi link → zone) — Zones associated with the species or its habitat
- `affinities` (multi link → phenomenon) — Phenomena associated with the species or its behavior


## title  ·  family: abstract  ·  icon: military_tech


### Mandate

- `authority` (text) — Rights or powers granted by the title
- `eligibility` (text) — Conditions or qualifications for receiving or holding the title
- `grant_date` (integer) — Date on which the title was granted, defined in world TIME units
- `revoke_date` (integer) — Date on which the title ended or was revoked, defined in world TIME units
- `issuer` (single link → institution) — Institution that formally created or granted the title
- `body` (single link → institution) — Institution in which the title functions or holds relevance
- `superior_title` (single link → title) — Another title that has authority over this one
- `holders` (multi link → character) — Characters who currently hold or represent the title
- `symbols` (multi link → object) — Objects that symbolize or authorize the title

### World

- `status` (text) — Current state or general condition of the title
- `history` (text) — Background information on the title's origin, evolution, or significance
- `characters` (multi link → character) — Characters otherwise relevant to the title
- `institutions` (multi link → institution) — Institutions relevant to the title
- `families` (multi link → family) — Families relevant to the title
- `zones` (multi link → zone) — Zones relevant to the title
- `locations` (multi link → location) — Locations relevant to the title
- `objects` (multi link → object) — Objects otherwise relevant to the title
- `constructs` (multi link → construct) — Constructs relevant to the title
- `laws` (multi link → law) — Laws relevant to the title
- `collectives` (multi link → collective) — Collectives relevant to the title
- `creatures` (multi link → creature) — Creatures relevant to the title
- `phenomena` (multi link → phenomenon) — Phenomena relevant to the title
- `species` (multi link → species) — Species relevant to the title
- `languages` (multi link → language) — Languages relevant to the title


## trait  ·  family: abstract  ·  icon: flaky


### Qualitative

- `social_effects` (text) — Relating to social relationships, reputation, or interaction dynamics
- `physical_effects` (text) — Relating to physical changes, limitations, or enhancements
- `functional_effects` (text) — Relating to practical or learned performance or aptitude
- `personality_effects` (text) — Relating to temperament, mental state, or personality expression
- `behaviour_effects` (text) — Relating to visible aspects and patterns of behavior

### Quantitative

- `charisma` (integer) — Affecting a character's charisma score
- `coercion` (integer) — Affecting a character's coercion score
- `competence` (integer) — Affecting a character's competence score
- `compassion` (integer) — Affecting a character's compassion score
- `creativity` (integer) — Affecting a character's creativity score
- `courage` (integer) — Affecting a character's courage score

### World

- `significance` (text) — Describes the trait's societal, symbolic, or systemic presence
- `anti_trait` (single link → trait) — Opposing trait that contradicts or nullifies the trait
- `empowered_abilities` (multi link → ability) — Abilities strengthened or enabled by the trait


## zone  ·  family: world  ·  icon: architecture


### Scope

- `role` (text) — The operational function or intent of the zone
- `start_date` (integer) — Date when the zone becomes extant or relevant, defined in world TIME units
- `end_date` (integer) — Date when the zone ceases to be meaningful or enforced, defined in world TIME units
- `phenomena` (multi link → phenomenon) — Phenomena that affect, define, or occur within the zone
- `linked_zones` (multi link → zone) — Other zones that are associated with the zone

### World

- `context` (text) — Historical and key knowledge about the zone
- `populations` (multi link → collective) — Distinct collective groups or communities residing within the zone
- `titles` (multi link → title) — Titles assigned to represent, manage, or protect the zone
- `principles` (multi link → construct) — Influential mechanics acted within, upon, or by the zone

