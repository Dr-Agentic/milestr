/**
 * The first persisted dashboard shape predates executable/data version checks.
 * It already has the current task/KPI structure, so this migration only
 * normalizes the legacy payload. The registry runner stamps the target version.
 */
export function migrateLegacyDashboard(data: Record<string, unknown>): Record<string, unknown> {
  const meta = data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)
    ? data.meta as Record<string, unknown>
    : {};

  return {
    ...data,
    meta: { ...meta }
  };
}
