import { GlobalFilter } from "@shared/schema";
import { config } from "./config";
import { getAuthToken } from "./authToken";
import { supabase } from "./supabaseClient";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");

function buildUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${BASE_URL}${path}`;
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
  return {
    vehicleIds: filterState.selectedVehicles.length > 0 ? filterState.selectedVehicles : undefined,
    startDate: filterState.dateRange.startDate,
    endDate: filterState.dateRange.endDate,
  };
}

export const api = {
  // Basic HTTP methods
  get: (url: string) => apiRequest("GET", url),
  post: (url: string, data?: any) => apiRequest("POST", url, data),
  put: (url: string, data?: any) => apiRequest("PUT", url, data),
  delete: (url: string) => apiRequest("DELETE", url),

  getMe: () => apiRequest("GET", "/api/me"),

  // Dashboard API with filters
  getDashboardKPIs: (filters?: { vehicleIds?: string[]; startDate?: string; endDate?: string }) =>
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
};
