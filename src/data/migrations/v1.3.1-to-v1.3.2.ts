/**
 * No-op schema migration: v1.3.1 → v1.3.2.
 *
 * v1.3.2 adds the `healParentRollups()` self-heal pass on `loadData()`. The
 * pass only re-derives `progress` and `status` for parents from their children's
 * current state — it never adds, removes, or renames fields, and it never
 * persists. The on-disk schema is byte-compatible with v1.3.1.
 *
 * This migration exists so the registry has an explicit entry for the new
 * version, satisfying the `check-migrations` CI contract. See CR-SelfHeal
 * (issue #23) for the full rationale.
 */
export function migrateOneThreeTwo(data: Record<string, unknown>): Record<string, unknown> {
  // Pass-through. The self-heal pass operates on the in-memory object only
  // and does not require any data-shape change.
  return { ...data };
}
