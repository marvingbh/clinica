/**
 * Re-export of the generic AES-256-GCM helper, now living in `@/lib/crypto`.
 * Kept here so existing imports (`@/lib/bank-reconciliation/encryption` and the
 * `vi.mock(...)` paths in the NFS-e tests) keep resolving unchanged.
 */
export { encrypt, decrypt } from "@/lib/crypto/encryption"
