/**
 * No-op schema migration: v1.2.2 → v1.3.0.
 *
 * v1.3.0 is the dashboard view overhaul (light theme default, LTR tree,
 * detail drawer, kanban depth indicator, hierarchical list, achieved vs
 * upcoming timeline). The on-disk schema is unchanged — the task and KPI
 * shapes are byte-compatible with v1.2.2. This migration exists so the
 * registry has an explicit entry for the new version, satisfying the
 * `check-migrations` CI contract.
 */
export function migrateOneTwoThree(data: Record<string, unknown>): Record<string, unknown> {
  // Pass-through. View-layer changes don't touch data.json shape.
  return { ...data };
}
