import type { HealthResponse } from './types';

export type HealthStatus = 'connected' | 'degraded' | 'disconnected';

/**
 * Classify API health based on the response (or lack thereof).
 * - null response with fetchError → disconnected
 * - response with warnings → degraded
 * - response.ok true, no warnings → connected
 * - response.ok false → degraded
 */
export function classifyHealth(
  response: HealthResponse | null,
  fetchError: boolean,
): HealthStatus {
  if (fetchError || response == null) return 'disconnected';
  if (!response.ok || response.warnings.length > 0) return 'degraded';
  return 'connected';
}
