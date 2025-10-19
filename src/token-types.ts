/**
 * OnlyWorlds Token Management API Types
 *
 * Types for the token rating system that provides daily token allowances
 * for API usage and AI integration features.
 */

/**
 * Current token status for the authenticated user
 */
export interface TokenStatus {
  /** Remaining tokens available for today */
  tokens_available_today: number;
  /** User's daily token allowance (default: 10000) */
  token_rating: number;
  /** Tokens consumed so far today */
  tokens_used_today: number;
  /** Date of last reset (ISO format) */
  last_reset: string;
  /** Number of active token sessions */
  sessions_active: number;
}

/**
 * Response from token consumption endpoint
 */
export interface TokenConsumeResponse {
  /** Whether the consumption was successful */
  success: boolean;
  /** Actual tokens consumed */
  tokens_consumed: number;
  /** Updated token balance */
  tokens_remaining: number;
  /** User's daily allowance */
  token_rating: number;
  /** Warning message if insufficient tokens (consumption still succeeds but tracks debt) */
  error?: string | null;
}

/**
 * Parameters for consuming tokens
 */
export interface TokenConsumeParams {
  /** Number of tokens to consume (required) */
  amount: number;
  /** Service identifier (default: "sdk_client") */
  service?: string;
  /** Session ID from access key response (optional) */
  sessionId?: string | null;
  /** Additional metadata for analytics (optional) */
  metadata?: Record<string, any> | null;
}

/**
 * Response from getting encrypted access key (advanced use case)
 */
export interface AccessKeyResponse {
  /** Base64 encoded encrypted OpenAI key */
  encrypted_key: string;
  /** Key expiration timestamp (ISO format) */
  expires_at: string;
  /** Session ID for tracking usage */
  session_id: string;
  /** Current token balance */
  tokens_available: number;
  /** User's token allowance */
  token_rating: number;
  /** Encryption algorithm used */
  encryption_method: string;
}

/**
 * Public encryption information for client-side decryption
 */
export interface EncryptionInfo {
  /** Encryption algorithm (e.g., "Fernet") */
  algorithm: string;
  /** Key derivation method (e.g., "SHA256") */
  key_derivation: string;
  /** Public salt used in key derivation */
  salt: string;
  /** Format description */
  format: string;
  /** Human-readable description */
  description: string;
  /** Example JavaScript implementation */
  javascript_example: string;
}

/**
 * Response from session revocation
 */
export interface RevokeSessionResponse {
  /** Whether revocation was successful */
  success: boolean;
  /** Status message */
  message: string;
}

/**
 * Response from revoking all sessions
 */
export interface RevokeAllSessionsResponse {
  /** Whether revocation was successful */
  success: boolean;
  /** Number of sessions revoked */
  sessions_revoked: number;
}

/**
 * Game tier / subscription level
 * (affects future features, currently all tiers get same token rating)
 */
export enum GameTier {
  FREE = 'free',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
  DIAMOND = 'diamond',
  DELUXE = 'deluxe',
}
