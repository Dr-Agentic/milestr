/**
 * No-op schema migration: v1.3.0 → v1.3.1.
 *
 * v1.3.1 is the first release cut via npm Trusted Publishing (OIDC). The
 * on-disk schema is byte-compatible with v1.3.0 — no view, action, or schema
 * change since v1.3.0. This migration exists so the registry has an explicit
 * entry for the new version, satisfying the `check-migrations` CI contract.
 */
export function migrateOneThreeOne(data: Record<string, unknown>): Record<string, unknown> {
  // Pass-through. The OIDC rollout did not touch data.json.
  return { ...data };
}