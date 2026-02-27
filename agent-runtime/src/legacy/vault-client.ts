/**
 * @deprecated
 * Vault Client - DEPRECATED
 * 
 * This module is deprecated and kept only for backwards compatibility reference.
 * 
 * Migration Guide:
 * - Use SecureKeyManager from '../services/secure-key-manager' instead
 * - Private key should be loaded from environment variables or .env file
 * - No external Vault service dependency
 * 
 * Removal Timeline:
 * - Phase 1 (Current): Moved to legacy/, functional but deprecated
 * - Phase 2 (Future): Complete removal
 * 
 * Reason for Deprecation:
 * PetriLabs follows the "Wild Release" principle - agents should be fully autonomous
 * without external dependencies like Vault services. Private keys are injected via
 * environment variables at startup and exist only in memory.
 */

// Re-export from original location for backwards compatibility
// This file will be removed in a future version

import { VaultClient as OriginalVaultClient } from '../services/vault-client';

export { OriginalVaultClient as VaultClient };
export default OriginalVaultClient;

// Log deprecation warning when imported
console.warn(
  '[DEPRECATED] VaultClient is deprecated. ' +
  'Use SecureKeyManager from "../services/secure-key-manager" instead. ' +
  'See migration guide in legacy/vault-client.ts'
);
