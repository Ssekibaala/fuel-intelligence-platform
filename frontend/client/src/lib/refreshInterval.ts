import { config } from "./config";

const EDGE_FUNCTION_API_BASE_PATTERN = /\/functions\/v1\/public-api\/?$/i;

export const EDGE_FUNCTION_MIN_REFRESH_INTERVAL_MS = 60_000;
export const STANDARD_MIN_REFRESH_INTERVAL_MS = 15_000;

function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");
}

export function isEdgeFunctionApiBase(baseUrl = getApiBaseUrl()) {
  return EDGE_FUNCTION_API_BASE_PATTERN.test(baseUrl);
}

export const DEFAULT_REFRESH_INTERVAL_MS = isEdgeFunctionApiBase()
  ? EDGE_FUNCTION_MIN_REFRESH_INTERVAL_MS
  : STANDARD_MIN_REFRESH_INTERVAL_MS;

export function normalizeRefreshInterval(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return DEFAULT_REFRESH_INTERVAL_MS;
  }

  if (numeric === 0) {
    return 0;
  }

  const minimumRefreshInterval = isEdgeFunctionApiBase()
    ? EDGE_FUNCTION_MIN_REFRESH_INTERVAL_MS
    : STANDARD_MIN_REFRESH_INTERVAL_MS;

  return Math.max(numeric, minimumRefreshInterval);
}
