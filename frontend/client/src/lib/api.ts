import { GlobalFilter } from "@shared/schema";
import { config } from "./config";
import { getAuthToken } from "./authToken";
import { supabase } from "./supabaseClient";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");

function buildUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${BASE_URL}${path}`;
}

function buildLocalApiUrl(path: string) {
  if (path.startsWith("http")) return path;
  return path;
}

class ApiRequestError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`${status}: ${body}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

function resolveCredentials(url: string): RequestCredentials {
  try {
    const requestOrigin = new URL(url, window.location.origin).origin;
    return requestOrigin === window.location.origin ? "include" : "omit";
  } catch {
    return "same-origin";
  }
}

// Helper function to build query parameters
function buildQueryParams(params?: Record<string, any>): string {
  if (!params) return "";

  const queryParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        if (value.length > 0) {
          queryParams.append(key, value.join(","));
        }
      } else if (value instanceof Date) {
        queryParams.append(key, value.toISOString());
      } else {
        queryParams.append(key, String(value));
      }
    }
  });

  return queryParams.toString();
}

// Helper function to make API requests and return parsed JSON
async function apiRequest(method: string, url: string, data?: unknown): Promise<any> {
  const token = getAuthToken();
  const isFormData = data instanceof FormData;
  const requestUrl = buildUrl(url);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data && !isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(requestUrl, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: data ? (isFormData ? data : JSON.stringify(data)) : undefined,
    credentials: resolveCredentials(requestUrl),
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new ApiRequestError(res.status, text);
  }

  if (res.status === 204) return null;

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  return res.text();
}

async function apiRequestLocal(method: string, url: string, data?: unknown): Promise<any> {
  const token = getAuthToken();
  const isFormData = data instanceof FormData;
  const requestUrl = buildLocalApiUrl(url);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data && !isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(requestUrl, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: data ? (isFormData ? data : JSON.stringify(data)) : undefined,
    credentials: resolveCredentials(requestUrl),
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new ApiRequestError(res.status, text);
  }

  if (res.status === 204) return null;

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  return res.text();
}

async function apiRequestLocalJson(method: string, url: string, data?: unknown): Promise<any> {
  const token = getAuthToken();
  const isFormData = data instanceof FormData;
  const requestUrl = buildLocalApiUrl(url);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data && !isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(requestUrl, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: data ? (isFormData ? data : JSON.stringify(data)) : undefined,
    credentials: resolveCredentials(requestUrl),
  });

  const contentType = res.headers.get("content-type") || "";
  const bodyText = await res.text();

  if (!res.ok) {
    throw new ApiRequestError(res.status, bodyText || res.statusText);
  }

  if (res.status === 204) return null;

  const looksLikeJson = bodyText.trim().startsWith("{") || bodyText.trim().startsWith("[");
  if (contentType.includes("application/json") || looksLikeJson) {
    try {
      return bodyText ? JSON.parse(bodyText) : null;
    } catch {
      throw new Error(`Invalid JSON response from ${requestUrl} (status ${res.status}).`);
    }
  }

  throw new Error(
    `Expected JSON from ${requestUrl} but got content-type "${contentType || "unknown"}" (status ${res.status}).`
  );
}

function shouldUseAssignmentsFallback(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false;
  return error.status === 404 || error.status === 405 || error.status === 501;
}

async function createAssignmentWithSupabaseFallback(data: { userId: string; clientId: string }) {
  const { data: created, error } = await supabase
    .from("client_users")
    .insert([
      {
        user_id: data.userId,
        client_id: data.clientId,
      },
    ])
    .select("id, user_id, client_id")
    .single();

  if (error) throw new Error(`Supabase fallback failed: ${error.message}`);
  return created;
}

async function deleteAssignmentWithSupabaseFallback(id: string) {
  const { error } = await supabase.from("client_users").delete().eq("id", id);
  if (error) throw new Error(`Supabase fallback failed: ${error.message}`);
  return null;
}

// Helper to convert global filter to API parameters
export function globalFilterToApiParams(filterState: GlobalFilter) {
  const buildLocalDayKey = (value?: string) => {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  return {
    clientId: filterState.selectedClientId !== "all" ? filterState.selectedClientId : undefined,
    vehicleIds: filterState.selectedVehicles.length > 0 ? filterState.selectedVehicles : undefined,
    startDate: filterState.dateRange.startDate,
    endDate: filterState.dateRange.endDate,
    startDay: buildLocalDayKey(filterState.dateRange.startDate),
    endDay: buildLocalDayKey(filterState.dateRange.endDate),
  };
}

export interface JourneyLocationSuggestion {
  location: string;
  normalizedLocation: string;
  usageCount: number;
  lastSeenAt: string | null;
}

export interface JourneyOccurrence {
  id: string;
  routePattern: "round_trip" | "one_way";
  vehicleId: string | null;
  vehicleKey: string;
  vehicleLabel: string;
  registrationNumber: string | null;
  outboundTripId: string;
  returnTripId: string | null;
  departureLocation: string;
  destinationLocation: string;
  departureTime: string;
  destinationArrivalTime: string;
  returnDepartureTime: string | null;
  returnArrivalTime: string;
  outboundLegDurationHours: number;
  roundTripDurationHours: number;
  destinationDwellHours: number | null;
  returnLegDurationHours: number | null;
  routeDistanceKm: number;
  routeFuelUsedLitres: number;
  routeEfficiency: number | null;
  routeDrivingHours: number | null;
  maxSpeedKmh: number | null;
  contextStartDay: string;
  contextEndDay: string;
  contextualFuelUsedLitres: number;
  contextualDistanceKm: number;
  contextualEngineHours: number;
  contextualIdleHours: number;
  contextualRefills: number;
  contextualDrains: number;
}

export interface JourneyIncompleteOccurrence {
  id: string;
  routePattern: "round_trip" | "one_way";
  vehicleId: string | null;
  vehicleKey: string;
  vehicleLabel: string;
  registrationNumber: string | null;
  departureLocation: string;
  destinationLocation: string;
  departureTime: string;
  destinationArrivalTime: string;
  routeDistanceKm: number;
  routeFuelUsedLitres: number;
}

export interface JourneyVehiclePerformance {
  vehicleId: string | null;
  vehicleKey: string;
  vehicleLabel: string;
  registrationNumber: string | null;
  tripCount: number;
  averageDistanceKm: number;
  averageFuelUsedLitres: number;
  averageOutboundLegHours: number;
  averageDurationHours: number;
  averageDestinationDwellHours: number;
  averageReturnLegHours: number;
  averageRouteEfficiency: number;
  averageContextIdleHours: number;
  lastDepartureTime: string | null;
}

export interface JourneyTrendPoint {
  dateKey: string;
  tripCount: number;
  totalDistanceKm: number;
  totalFuelUsedLitres: number;
  averageDurationHours: number;
  averageRouteEfficiency: number;
}

export interface JourneyException {
  type: "incomplete_return" | "high_fuel" | "long_duration" | "long_dwell";
  occurrenceId?: string;
  vehicleLabel: string;
  message: string;
  departureTime: string;
}

export interface JourneySavedRoute {
  id: string;
  clientId: string | null;
  name: string;
  departureLocation: string;
  destinationLocation: string;
  filters: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
}

export interface JourneyAnalysis {
  route: {
    routePattern: "round_trip" | "one_way";
    departureLocation: string;
    destinationLocation: string;
    startDate: string | null;
    endDate: string | null;
  };
  routeAvailability: {
    hasMatchesOutsideSelectedRange: boolean;
    totalOccurrences: number;
    firstDepartureTime: string | null;
    lastArrivalTime: string | null;
    suggestedStartDate: string | null;
    suggestedEndDate: string | null;
  } | null;
  summary: {
    totalRoundTrips: number;
    incompleteTrips: number;
    uniqueVehicles: number;
    averageDistanceKm: number;
    averageFuelUsedLitres: number;
    averageOutboundLegHours: number;
    averageDurationHours: number;
    averageDestinationDwellHours: number;
    averageReturnLegHours: number;
    averageRouteEfficiency: number;
    averageContextIdleHours: number;
    completionRate: number;
  };
  occurrences: JourneyOccurrence[];
  incompleteOccurrences: JourneyIncompleteOccurrence[];
  vehiclePerformance: JourneyVehiclePerformance[];
  trends: JourneyTrendPoint[];
  exceptions: JourneyException[];
}

export const api = {
  // Basic HTTP methods
  get: (url: string) => apiRequest("GET", url),
  post: (url: string, data?: any) => apiRequest("POST", url, data),
  put: (url: string, data?: any) => apiRequest("PUT", url, data),
  delete: (url: string) => apiRequest("DELETE", url),

  getMe: () => apiRequest("GET", "/api/me"),
  getPublicBrandingLogo: () => apiRequestLocal("GET", "/api/public/branding/logo"),

  // Dashboard API with filters
  getDashboardKPIs: (filters?: { clientId?: string; vehicleIds?: string[]; startDate?: string; endDate?: string }) =>
    apiRequest("GET", `/api/dashboard/kpis?${buildQueryParams(filters)}`),

  // Vehicles API with filters
  getVehicles: (filters?: { status?: string; efficiencyRating?: string; driverName?: string; vehicleIds?: string[]; clientId?: string }) =>
    apiRequest("GET", `/api/vehicles?${buildQueryParams(filters)}`),

  getVehicle: (id: string) => apiRequest("GET", `/api/vehicles/${id}`),
  createVehicle: (data: any) => apiRequest("POST", "/api/vehicles", data),
  updateVehicle: (id: string, data: any) => apiRequest("PUT", `/api/vehicles/${id}`, data),
  deleteVehicle: (id: string) => apiRequest("DELETE", `/api/vehicles/${id}`),

  // Fuel Events API with filters
  getFuelEvents: (filters?: {
    vehicleId?: string;
    vehicleIds?: string[];
    eventType?: string;
    startDate?: string;
    endDate?: string;
    clientId?: string;
  }) => apiRequest("GET", `/api/fuel-events?${buildQueryParams(filters)}`),
  createFuelEvent: (data: any) => apiRequest("POST", "/api/fuel-events", data),
  updateFuelEvent: (id: string, data: any) => apiRequest("PUT", `/api/fuel-events/${id}`, data),
  deleteFuelEvent: (id: string) => apiRequest("DELETE", `/api/fuel-events/${id}`),

  // Daily Metrics API with filters
  getDailyMetrics: (filters?: {
    clientId?: string;
    vehicleId?: string;
    vehicleIds?: string[];
    startDate?: string;
    endDate?: string;
  }) => apiRequest("GET", `/api/daily-metrics?${buildQueryParams(filters)}`),

  // Raw sensor telemetry API with filters
  getRawSensorData: (filters?: {
    vehicleId?: string;
    vehicleIds?: string[];
    startDate?: string;
    endDate?: string;
    clientId?: string;
  }) => apiRequest("GET", `/api/raw-sensor-data?${buildQueryParams(filters)}`),

  getJourneyLocations: (filters?: { q?: string; clientId?: string }) =>
    apiRequest("GET", `/api/journey-intelligence/locations?${buildQueryParams(filters)}`) as Promise<JourneyLocationSuggestion[]>,

  getJourneyAnalysis: (filters: {
    departureLocation: string;
    destinationLocation: string;
    routePattern?: "round_trip" | "one_way";
    clientId?: string;
    vehicleIds?: string[];
    startDate?: string;
    endDate?: string;
    startDay?: string;
    endDay?: string;
  }) =>
    apiRequest("GET", `/api/journey-intelligence/analysis?${buildQueryParams(filters)}`) as Promise<JourneyAnalysis>,

  getJourneySavedRoutes: () =>
    apiRequest("GET", "/api/journey-intelligence/saved-routes") as Promise<JourneySavedRoute[]>,

  createJourneySavedRoute: (data: {
    name: string;
    departureLocation: string;
    destinationLocation: string;
    clientId?: string;
    filters?: Record<string, unknown>;
  }) =>
    apiRequest("POST", "/api/journey-intelligence/saved-routes", data) as Promise<JourneySavedRoute>,

  deleteJourneySavedRoute: (id: string) =>
    apiRequest("DELETE", `/api/journey-intelligence/saved-routes/${id}`),

  // Chart data APIs (for backward compatibility)
  getFuelConsumptionChart: (filters?: { vehicleIds?: string[]; dateRange?: any }) =>
    apiRequest("POST", `/api/charts/fuel-consumption`, filters),

  getPerformanceMetricsChart: (filters?: { vehicleIds?: string[]; dateRange?: any }) =>
    apiRequest("POST", `/api/charts/performance-metrics`, filters),

  // Admin APIs
  getAdminClients: () => apiRequest("GET", "/api/admin/clients"),
  createAdminClient: (data: { name: string }) => apiRequest("POST", "/api/admin/clients", data),
  getAdminUsers: () => apiRequest("GET", "/api/admin/users"),
  createAdminUser: (data: {
    email: string;
    password: string;
    role: string;
    displayName?: string;
    clientIds?: string[];
  }) => apiRequest("POST", "/api/admin/users", data),
  deleteAdminUser: (id: string) => apiRequest("DELETE", `/api/admin/users/${id}`),
  getAdminAssignments: (filters?: { userId?: string; clientId?: string }) =>
    apiRequest("GET", `/api/admin/assignments?${buildQueryParams(filters)}`),
  createAdminAssignment: async (data: { userId: string; clientId: string }) => {
    try {
      return await apiRequest("POST", "/api/admin/assignments", data);
    } catch (error) {
      if (!shouldUseAssignmentsFallback(error)) throw error;
      return createAssignmentWithSupabaseFallback(data);
    }
  },
  deleteAdminAssignment: async (id: string) => {
    try {
      return await apiRequest("DELETE", `/api/admin/assignments/${id}`);
    } catch (error) {
      if (!shouldUseAssignmentsFallback(error)) throw error;
      return deleteAssignmentWithSupabaseFallback(id);
    }
  },
  getBrandingLogo: (filters?: { clientId?: string }) =>
    apiRequest("GET", `/api/settings/branding/logo?${buildQueryParams(filters)}`),
  getDefaultBrandingLogo: () =>
    apiRequest("GET", "/api/settings/branding/default-logo"),
  uploadBrandingLogo: (formData: FormData) =>
    apiRequest("POST", "/api/settings/branding/logo", formData),
  uploadDefaultBrandingLogo: (formData: FormData) =>
    apiRequest("POST", "/api/settings/branding/default-logo", formData),
  deleteBrandingLogo: (filters?: { clientId?: string }) =>
    apiRequest("DELETE", `/api/settings/branding/logo?${buildQueryParams(filters)}`),
  deleteDefaultBrandingLogo: () =>
    apiRequest("DELETE", "/api/settings/branding/default-logo"),
  uploadAdminSourceOfTruth: (formData: FormData) =>
    apiRequestLocalJson("POST", "/api/admin/source-of-truth/upload", formData),
  previewAdminSourceOfTruth: (formData: FormData) =>
    apiRequestLocalJson("POST", "/api/admin/source-of-truth/preview", formData),
};
