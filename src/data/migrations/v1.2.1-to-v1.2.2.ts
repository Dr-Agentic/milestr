/**
 * No-op schema migration: v1.2.1 → v1.2.2.
 *
 * v1.2.2 introduces the `update <id> --field <name> --value <v>` action with a
 * Zod-validated allowlist. No on-disk schema change — the task and KPI shapes
 * are byte-compatible with v1.2.1. This migration exists so the registry has
 * an explicit entry for the new version, satisfying the
 * `check-migrations` CI contract (verified 2026-08-29, first time the
 * migration-contract guard fired for a no-op release).
 */
export function migrateOneTwoTwo(data: Record<string, unknown>): Record<string, unknown> {
  // Pass-through. New fields added by v1.2.2 (none yet) would be defaulted
  // here in a real release; future field additions get a real migration.
  return { ...data };
}