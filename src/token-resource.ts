/**
 * Token Management Resource
 *
 * Provides access to the OnlyWorlds token rating system API.
 * Based on the working implementation in base-tool/src/llm/token-service.ts
 */

import type { OnlyWorldsClient } from './client';
import type {
  TokenStatus,
  TokenConsumeResponse,
  TokenConsumeParams,
  AccessKeyResponse,
  EncryptionInfo,
  RevokeSessionResponse,
  RevokeAllSessionsResponse,
} from './token-types';

/**
 * Token Management Resource
 *
 * Handles token status checking, consumption tracking, and encrypted key access
 * for AI integration features.
 *
 * All endpoints require authentication (API-Key + API-Pin headers).
 *
 * Example usage:
 * ```typescript
 * const client = new OnlyWorldsClient({ apiKey, apiPin });
 *
 * // Check token status
 * const status = await client.tokens.getStatus();
 * console.log(`${status.tokens_available_today}/${status.token_rating} tokens available`);
 *
 * // Consume tokens
 * await client.tokens.consume({
 *   amount: 500,
 *   service: 'my_tool',
 *   metadata: { feature: 'chat', model: 'gpt-4' }
 * });
 * ```
 */
export class TokenResource {
  constructor(private client: OnlyWorldsClient) {}

  /**
   * Get current token status for authenticated user
   *
   * Returns daily token allowance, usage, and availability.
   * Matches base-tool's checkStatus() pattern.
   *
   * @returns Current token status
   * @example
   * ```typescript
   * const status = await client.tokens.getStatus();
   * console.log(`Available: ${status.tokens_available_today}/${status.token_rating}`);
   * console.log(`Used today: ${status.tokens_used_today}`);
   * console.log(`Active sessions: ${status.sessions_active}`);
   * ```
   */
  async getStatus(): Promise<TokenStatus> {
    return this.client.request<TokenStatus>('GET', '/tokens/status/');
  }

  /**
   * Consume tokens for service usage
   *
   * Reports token consumption to track daily usage. Allows consumption even if
   * exceeds available tokens (tracks as debt), but warns via error field.
   * Matches base-tool's reportUsage() pattern.
   *
   * @param params - Token consumption parameters
   * @returns Consumption result with updated balance
   * @example
   * ```typescript
   * const result = await client.tokens.consume({
   *   amount: 500,
   *   service: 'worldbuilding_tool',
   *   metadata: {
   *     feature: 'character_generation',
   *     model: 'gpt-4',
   *     prompt_tokens: 300,
   *     completion_tokens: 200
   *   }
   * });
   *
   * if (result.error) {
   *   console.warn('Token warning:', result.error);
   * }
   * console.log(`${result.tokens_remaining} tokens remaining`);
   * ```
   */
  async consume(params: TokenConsumeParams): Promise<TokenConsumeResponse> {
    return this.client.request<TokenConsumeResponse>('POST', '/tokens/consume/', {
      body: {
        amount: params.amount,
        service: params.service || 'sdk_client',
        session_id: params.sessionId ?? null,
        metadata: params.metadata ?? null,
      },
    });
  }

  /**
   * Get encrypted OpenAI API key (advanced use case)
   *
   * Requires minimum 100 tokens available. Creates a 1-hour session for tracking.
   * Returns encrypted key that must be decrypted client-side using Fernet.
   *
   * See base-tool/src/llm/token-service.ts:99-155 for full implementation example
   * including client-side decryption with the 'fernet' npm package.
   *
   * @returns Encrypted access key and session info
   * @throws Error if insufficient tokens (< 100)
   * @example
   * ```typescript
   * // Get encrypted key
   * const access = await client.tokens.getAccessKey();
   *
   * // Decrypt using fernet library (see base-tool for full example)
   * // 1. Derive key from world ID using SHA-256
   * // 2. Use 'fernet' npm package to decrypt
   * // 3. Use decrypted OpenAI key for direct API calls
   * // 4. Report usage with access.session_id
   *
   * console.log('Session:', access.session_id);
   * console.log('Expires:', access.expires_at);
   * ```
   */
  async getAccessKey(): Promise<AccessKeyResponse> {
    return this.client.request<AccessKeyResponse>('GET', '/tokens/access-key/');
  }

  /**
   * Revoke a specific token session
   *
   * Invalidates the session ID obtained from getAccessKey().
   * Use when cleaning up or on logout.
   *
   * @param sessionId - Session ID to revoke
   * @returns Revocation result
   * @example
   * ```typescript
   * await client.tokens.revokeSession('session-id-here');
   * ```
   */
  async revokeSession(sessionId: string): Promise<RevokeSessionResponse> {
    return this.client.request<RevokeSessionResponse>(
      'POST',
      `/tokens/revoke-session/?session_id=${encodeURIComponent(sessionId)}`
    );
  }

  /**
   * Revoke all active sessions (emergency use)
   *
   * Invalidates all token sessions for the authenticated user.
   * Use for security cleanup or when sessions are stuck.
   *
   * @returns Revocation result with count of revoked sessions
   * @example
   * ```typescript
   * const result = await client.tokens.revokeAllSessions();
   * console.log(`Revoked ${result.sessions_revoked} sessions`);
   * ```
   */
  async revokeAllSessions(): Promise<RevokeAllSessionsResponse> {
    return this.client.request<RevokeAllSessionsResponse>('POST', '/tokens/revoke-all-sessions/');
  }

  /**
   * Get public encryption info (no auth required)
   *
   * Returns algorithm details and example code for client-side decryption.
   * Public endpoint - can be called without authentication.
   *
   * @returns Encryption algorithm and implementation details
   * @example
   * ```typescript
   * const info = await client.tokens.getEncryptionInfo();
   * console.log('Algorithm:', info.algorithm);
   * console.log('Key derivation:', info.key_derivation);
   * console.log(info.javascript_example);
   * ```
   */
  async getEncryptionInfo(): Promise<EncryptionInfo> {
    // This endpoint doesn't require authentication, but we'll use the standard request
    // method since it handles the URL construction properly
    return this.client.request<EncryptionInfo>('GET', '/tokens/encryption-info/');
  }
}
