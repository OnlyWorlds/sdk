import type {
  World, WorldInput,
  Character, CharacterInput,
  Location, LocationInput,
  Object as ObjectElement, ObjectInput,
  Ability, AbilityInput,
  Species, SpeciesInput,
  Event, EventInput,
  Construct, ConstructInput,
  Creature, CreatureInput,
  Collective, CollectiveInput,
  Family, FamilyInput,
  Institution, InstitutionInput,
  Language, LanguageInput,
  Law, LawInput,
  Map, MapInput,
  Marker, MarkerInput,
  Narrative, NarrativeInput,
  Phenomenon, PhenomenonInput,
  Pin, PinInput,
  Relation, RelationInput,
  Title, TitleInput,
  Trait, TraitInput,
  Zone, ZoneInput
} from './types';
import { TokenResource } from './token-resource';

export interface OnlyWorldsConfig {
  apiKey: string;
  apiPin: string;
  baseUrl?: string;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  ordering?: string;
  search?: string;
  [key: string]: any; // Allow additional filters
}

export interface ApiResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Base resource class for CRUD operations
 */
class Resource<T, TInput> {
  constructor(
    private client: OnlyWorldsClient,
    private elementType: string
  ) {}

  async list(options?: ListOptions): Promise<ApiResponse<T>> {
    const response = await this.client.request<any>('GET', `/${this.elementType}/`, { params: options });

    // Backend returns raw arrays, normalize to { count, results } format
    if (Array.isArray(response)) {
      return {
        count: response.length,
        next: null,
        previous: null,
        results: response
      };
    }

    // Already in correct format (shouldn't happen per backend investigation)
    return response as ApiResponse<T>;
  }

  async get(id: string): Promise<T> {
    return this.client.request<T>('GET', `/${this.elementType}/${id}/`);
  }

  async create(data: TInput): Promise<T> {
    // Auto-round coordinates for Pin elements (API requires integers)
    const body = this.elementType === 'pin' ? this.roundPinCoordinates(data) : data;
    return this.client.request<T>('POST', `/${this.elementType}/`, { body });
  }

  async update(id: string, data: Partial<TInput>): Promise<T> {
    // Auto-round coordinates for Pin elements (API requires integers)
    const body = this.elementType === 'pin' ? this.roundPinCoordinates(data) : data;
    return this.client.request<T>('PATCH', `/${this.elementType}/${id}/`, { body });
  }

  async delete(id: string): Promise<void> {
    return this.client.request<void>('DELETE', `/${this.elementType}/${id}/`);
  }

  /**
   * Round Pin coordinates to integers (API requirement)
   * @private
   */
  private roundPinCoordinates(data: any): any {
    const rounded = { ...data };
    if (typeof rounded.x === 'number') rounded.x = Math.round(rounded.x);
    if (typeof rounded.y === 'number') rounded.y = Math.round(rounded.y);
    if (typeof rounded.z === 'number') rounded.z = Math.round(rounded.z);
    return rounded;
  }
}

/**
 * Special resource class for World endpoint
 * The /world/ endpoint returns a single World object directly (not paginated)
 * because API keys are world-scoped (one key = one world)
 */
class WorldResource {
  constructor(private client: OnlyWorldsClient) {}

  /**
   * Get the world associated with the current API key
   * Returns the world directly (not wrapped in pagination)
   */
  async get(): Promise<World> {
    return this.client.request<World>('GET', '/world/');
  }

  /**
   * Update the current world
   */
  async update(data: Partial<WorldInput>): Promise<World> {
    return this.client.request<World>('PATCH', '/world/', { body: data });
  }
}

/**
 * Main OnlyWorlds API client
 */
export class OnlyWorldsClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  // Resource accessors
  public worlds: WorldResource;
  public tokens: TokenResource;
  public abilities: Resource<Ability, AbilityInput>;
  public characters: Resource<Character, CharacterInput>;
  public collectives: Resource<Collective, CollectiveInput>;
  public constructs: Resource<Construct, ConstructInput>;
  public creatures: Resource<Creature, CreatureInput>;
  public events: Resource<Event, EventInput>;
  public families: Resource<Family, FamilyInput>;
  public institutions: Resource<Institution, InstitutionInput>;
  public languages: Resource<Language, LanguageInput>;
  public laws: Resource<Law, LawInput>;
  public locations: Resource<Location, LocationInput>;
  public maps: Resource<Map, MapInput>;
  public markers: Resource<Marker, MarkerInput>;
  public narratives: Resource<Narrative, NarrativeInput>;
  public objects: Resource<ObjectElement, ObjectInput>;
  public phenomena: Resource<Phenomenon, PhenomenonInput>;
  public pins: Resource<Pin, PinInput>;
  public relations: Resource<Relation, RelationInput>;
  public species: Resource<Species, SpeciesInput>;
  public titles: Resource<Title, TitleInput>;
  public traits: Resource<Trait, TraitInput>;
  public zones: Resource<Zone, ZoneInput>;

  constructor(config: OnlyWorldsConfig) {
    this.baseUrl = config.baseUrl || 'https://www.onlyworlds.com/api/worldapi';
    this.headers = {
      'Content-Type': 'application/json',
      'API-Key': config.apiKey,
      'API-Pin': config.apiPin,
    };

    // Initialize resources
    this.worlds = new WorldResource(this);
    this.tokens = new TokenResource(this);
    this.abilities = new Resource<Ability, AbilityInput>(this, 'ability');
    this.characters = new Resource<Character, CharacterInput>(this, 'character');
    this.collectives = new Resource<Collective, CollectiveInput>(this, 'collective');
    this.constructs = new Resource<Construct, ConstructInput>(this, 'construct');
    this.creatures = new Resource<Creature, CreatureInput>(this, 'creature');
    this.events = new Resource<Event, EventInput>(this, 'event');
    this.families = new Resource<Family, FamilyInput>(this, 'family');
    this.institutions = new Resource<Institution, InstitutionInput>(this, 'institution');
    this.languages = new Resource<Language, LanguageInput>(this, 'language');
    this.laws = new Resource<Law, LawInput>(this, 'law');
    this.locations = new Resource<Location, LocationInput>(this, 'location');
    this.maps = new Resource<Map, MapInput>(this, 'map');
    this.markers = new Resource<Marker, MarkerInput>(this, 'marker');
    this.narratives = new Resource<Narrative, NarrativeInput>(this, 'narrative');
    this.objects = new Resource<ObjectElement, ObjectInput>(this, 'object');
    this.phenomena = new Resource<Phenomenon, PhenomenonInput>(this, 'phenomenon');
    this.pins = new Resource<Pin, PinInput>(this, 'pin');
    this.relations = new Resource<Relation, RelationInput>(this, 'relation');
    this.species = new Resource<Species, SpeciesInput>(this, 'species');
    this.titles = new Resource<Title, TitleInput>(this, 'title');
    this.traits = new Resource<Trait, TraitInput>(this, 'trait');
    this.zones = new Resource<Zone, ZoneInput>(this, 'zone');
  }

  /**
   * Make a request to the OnlyWorlds API
   */
  async request<T>(
    method: string,
    path: string,
    options?: {
      params?: Record<string, any>;
      body?: any;
    }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    
    // Add query parameters
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: this.headers,
    };

    // Add body for POST/PATCH/PUT
    if (options?.body && ['POST', 'PATCH', 'PUT'].includes(method)) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url.toString(), fetchOptions);

    if (!response.ok) {
      let errorMessage = `API Error ${response.status}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          // Try to parse as JSON for better error messages
          try {
            const errorJson = JSON.parse(errorText);

            // Handle validation errors (array format)
            if (Array.isArray(errorJson.detail)) {
              const validationErrors = errorJson.detail
                .map((err: any) => {
                  const location = err.loc ? err.loc.join('.') : 'unknown';
                  return `${location}: ${err.msg}`;
                })
                .join('; ');
              errorMessage += `: ${validationErrors}`;
            }
            // Handle string/object error messages
            else {
              errorMessage += `: ${errorJson.detail || errorJson.error || errorText}`;
            }
          } catch {
            errorMessage += `: ${errorText}`;
          }
        }
      } catch {
        // If reading response fails, just use status
      }
      throw new Error(errorMessage);
    }

    // Handle DELETE (no content)
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return response.json();
  }

  /**
   * Helper to convert nested objects to _id/_ids format
   */
  static prepareInput<T extends Record<string, any>>(data: T): any {
    const result: any = { ...data };
    
    for (const [key, value] of Object.entries(result)) {
      // Convert single relationships
      if (value && typeof value === 'object' && 'id' in value) {
        delete result[key];
        result[`${key}_id`] = value.id;
      }
      // Convert multi relationships
      else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && 'id' in value[0]) {
        delete result[key];
        result[`${key}_ids`] = value.map(item => item.id);
      }
    }
    
    return result;
  }
}