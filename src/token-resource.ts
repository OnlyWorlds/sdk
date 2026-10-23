/**
 * Token Management Resource
 *
 * Provides access to the OnlyWorlds token rating system API.
 * Based on the working implementation in base-tool/src/llm/token-service.ts
 */

/**
 * Minimal transport the token resource needs — structurally satisfied by
 * `OwV2Client` (its `request()` is public since 4.0): `new TokenResource(client)`.
 * Wire ruling (2026-07-23): keel keeps the /tokens/* economy long-term
 * (Tangle ratings write it, Council voting reads it) — port, don't delete.
 * Since then keel mounts only `status/` and `encryption-info/` under /tokens/
 * (`accounts/token_api.py`; consume, access-key and both revokes answer 404 on
 * production, 2026-10-14), and spending moved server-side: the Council spends
 * through keel's council proxy (keel #274, Skeld's ruling h37 #4632), and
 * `OwV2Client.allowance()` reads the token rating. The four dead methods are
 * deprecated in 4.23.0 and leave in 5.0.
 */
export interface TokenTransport {
  request<T>(method: string, path: string, opts?: { body?: unknown }): Promise<T>;
}

import type {
  TokenStatus,
  TokenConsumeResponse,
  TokenConsumeParams,
  AccessKeyResponse,
  EncryptionInfo,
  RevokeSessionResponse,
  RevokeAllSessionsResponse,
} from './token-types';
import { refuseUnknownOptions } from './options';

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
 * const client = new OwV2Client({ apiKey: "ow_w_...", apiPin: "1234" });
 * const tokens = new TokenResource(client);
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
  constructor(private client: TokenTransport) {}

  /**
   * All token routes go through here: a 404 on /tokens/* means keel does not
   * serve that route, not "user has no tokens". Annotate so the failure reads
   * correctly.
   */
  private async req<T>(method: string, path: string, opts?: { body?: unknown }): Promise<T> {
    try {
      return await this.client.request<T>(method, path, opts);
    } catch (err) {
      if (err && typeof err === 'object' && (err as { status?: number }).status === 404) {
        (err as { message: string }).message +=
          ' [keel serves only /tokens/status/ and /tokens/encryption-info/; this method is deprecated (4.23.0). The token rating: OwV2Client.allowance()]';
      }
      throw err;
    }
  }

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
    return this.req<TokenStatus>('GET', '/tokens/status/');
  }

  /**
   * Consume tokens for service usage
   *
   * @deprecated keel serves no consume route (404 on production since 2026-10;
   * no client decides what its act costs, Skeld's ruling, keel #274): spending
   * happens server-side in the route that does the work. Removed in 5.0.
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
    refuseUnknownOptions('consume', params, ['amount', 'service', 'sessionId', 'metadata'], 'Nothing was sent.');
    return this.req<TokenConsumeResponse>('POST', '/tokens/consume/', {
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
   * @deprecated keel serves no access-key route (404 on production since
   * 2026-10). AI answers come from keel's own proxy: `OwV2Client.ask()` and
   * `sort()`. Removed in 5.0.
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
    return this.req<AccessKeyResponse>('GET', '/tokens/access-key/');
  }

  /**
   * Revoke a specific token session
   *
   * @deprecated keel serves no revoke-session route (404 on production since
   * 2026-10); sessions came from getAccessKey(), which is gone too. Removed in 5.0.
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
    return this.req<RevokeSessionResponse>(
      'POST',
      `/tokens/revoke-session/?session_id=${encodeURIComponent(sessionId)}`
    );
  }

  /**
   * Revoke all active sessions (emergency use)
   *
   * @deprecated keel serves no revoke-all-sessions route (404 on production
   * since 2026-10). Removed in 5.0.
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
    return this.req<RevokeAllSessionsResponse>('POST', '/tokens/revoke-all-sessions/');
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
    return this.req<EncryptionInfo>('GET', '/tokens/encryption-info/');
  }
}
