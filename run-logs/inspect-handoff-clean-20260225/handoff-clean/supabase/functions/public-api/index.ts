import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AuthContext = {
  user: {
    id: string;
    email: string | null;
  };
  profile: {
    id: string;
    role: string;
    display_name: string | null;
  };
  clientIds: string[];
};

type ClientScopeResult =
  | { ok: true; clientIds?: string[] }
  | { ok: false; status: number; error: string };

type ScopedVehicleIdsResult =
  | { ok: true; clientIds?: string[]; vehicleIds?: string[] }
  | { ok: false; status: number; error: string };

type DailyMovementFilters = {
  vehicleId?: string;
  vehicleIds?: string[];
  assetId?: string;
  registrationNumber?: string;
  clientIds?: string[];
};

type FuelTemperatureFilters = {
  vehicleId?: string;
  vehicleIds?: string[];
  assetName?: string;
  clientIds?: string[];
};

type FuelTemperatureData = {
  reportDate?: string | null;
  reportTitle: string;
  assetName: string;
  fromDatetime?: string | null;
  toDatetime?: string | null;
  generatedOn?: string | null;
  totalDistanceKm?: number | null;
  totalRefillsL?: number | null;
  totalDrainsL?: number | null;
  fuelUsedL?: number | null;
  fuelConsumptionKmL?: number | null;
  refuelEvents: Array<{
    time?: string | null;
    initial?: number | null;
    final?: number | null;
    refilled?: number | null;
    location?: string | null;
    lat?: number | null;
    lng?: number | null;
  }>;
  rawSensorData: Array<{
    timestamp?: string | null;
    fuel?: number | null;
    altitude?: number | null;
    odometer?: number | null;
    speed?: number | null;
    temperature?: number | null;
  }>;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const ALLOWED_ORIGINS = (Deno.env.get("FRONTEND_ORIGINS") ?? "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function resolveAllowedOrigin(origin: string | null): string {
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  if (!origin) return ALLOWED_ORIGINS[0] ?? "*";
  const normalized = origin.replace(/\/+$/, "");
  const isAllowed = ALLOWED_ORIGINS.some((entry) => entry.replace(/\/+$/, "") === normalized);
  return isAllowed ? origin : ALLOWED_ORIGINS[0] ?? "*";
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(origin),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

function textResponse(
  body: string,
  status: number,
  origin: string | null,
  contentType = "text/plain; charset=utf-8",
  extraHeaders?: HeadersInit
): Response {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": contentType,
      ...(extraHeaders ?? {}),
    },
  });
}

function emptyResponse(status: number, origin: string | null): Response {
  return new Response(null, {
    status,
    headers: corsHeaders(origin),
  });
}

function getRequestPath(req: Request): string {
  const url = new URL(req.url);
  const prefixes = ["/functions/v1/public-api", "/public-api"];
  for (const prefix of prefixes) {
    if (url.pathname === prefix) return "/";
    if (url.pathname.startsWith(`${prefix}/`)) {
      return url.pathname.slice(prefix.length);
    }
  }
  return url.pathname || "/";
}

function normalizePath(path: string): string {
  if (!path) return "/";
  const normalized = path.replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : "/";
}

function parseListParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseStringParam(value: string | null): string | undefined {
  if (!value) return undefined;
  const parsed = value.trim();
  return parsed.length > 0 ? parsed : undefined;
}

function parseIsoDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseDateOnly(value: string | null): string | null {
  const iso = parseIsoDate(value);
  return iso ? iso.slice(0, 10) : null;
}

function parseRequestedVehicleIds(url: URL): string[] {
  const values = [
    ...parseListParam(url.searchParams.get("vehicleIds")),
    ...parseListParam(url.searchParams.get("vehicle_ids")),
    ...parseListParam(url.searchParams.get("vehicleId")),
    ...parseListParam(url.searchParams.get("vehicle_id")),
  ];
  return Array.from(new Set(values.filter(Boolean)));
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = toOptionalNumber(value);
  if (parsed === null) return fallback;
  return Math.trunc(parsed);
}

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => csvEscape((row as Record<string, unknown>)[header]))
        .join(",")
    ),
  ];
  return lines.join("\n");
}

function parseDurationToSeconds(value: unknown): number {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  if (/^\d{1,3}:\d{1,2}:\d{1,2}$/.test(raw)) {
    const [h, m, s] = raw.split(":").map((segment) => Number(segment));
    return (h * 3600) + (m * 60) + s;
  }

  const hours = Number((raw.match(/(\d+)\s*h/i) || [])[1] || 0);
  const minutes = Number((raw.match(/(\d+)\s*min/i) || [])[1] || 0);
  const seconds = Number((raw.match(/(\d+)\s*sec/i) || [])[1] || 0);

  if (hours || minutes || seconds) {
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  return 0;
}

function formatDurationSeconds(totalSecondsRaw: number): string {
  const totalSeconds = Math.max(0, Math.trunc(totalSecondsRaw));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function sumDurations(values: unknown[]): string {
  const totalSeconds = values.reduce((sum, value) => sum + parseDurationToSeconds(value), 0);
  return formatDurationSeconds(totalSeconds);
}

function averageDurations(values: unknown[]): string {
  const parsed = values.map((value) => parseDurationToSeconds(value)).filter((seconds) => seconds > 0);
  if (parsed.length === 0) return "00:00:00";
  const avg = Math.round(parsed.reduce((sum, value) => sum + value, 0) / parsed.length);
  return formatDurationSeconds(avg);
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const message = String((error as any)?.message ?? "");
  const details = String((error as any)?.details ?? "");
  const hint = String((error as any)?.hint ?? "");
  const combined = `${message} ${details} ${hint}`.toLowerCase();
  return combined.includes("column") && combined.includes(columnName.toLowerCase()) && combined.includes("exist");
}

function mapVehicleRow(row: any) {
  const fuelEfficiency = toNumber(row.fuel_efficiency);
  return {
    id: row.id,
    clientId: row.client_id,
    assetId: row.asset_id || row.imei || row.id,
    vehiclePlate: row.vehicle_plate || row.asset_id || row.imei || row.id,
    driverName: row.last_driver_id ? String(row.last_driver_id) : "Unassigned",
    status: row.status || (row.last_ignition_on ? "Active" : "Idle"),
    currentFuelLevel: toNumber(row.current_fuel_level),
    tankCapacity: toNumber(row.tank_capacity),
    fuelEfficiency,
    efficiencyRating: fuelEfficiency > 0 && fuelEfficiency < 0.4
      ? "Excellent"
      : fuelEfficiency > 0 && fuelEfficiency < 0.7
      ? "Good"
      : "Poor",
    totalDistance: toNumber(row.total_distance, toNumber(row.last_odometer_km)),
    totalEngineHours: toNumber(row.total_engine_hours, toNumber(row.last_engine_hours)),
    totalFuelUsed: toNumber(row.total_fuel_used),
    workingDays: 0,
    parkingDays: 0,
    lastMaintenanceDate: null,
    maintenanceStatus: "N/A",
    theftIncidents: 0,
    costPerKm: 0,
    systemReliability: "Good",
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

function mapFuelEventRow(row: any) {
  const rawType = String(row.event_type ?? "").toLowerCase();
  const eventType = rawType === "drain" ? "theft" : (rawType || "refill");
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    eventType,
    volumeLiters: toNumber(row.volume_liters, toNumber(row.refilled, toNumber(row.fuel_volume_litres))),
    costKES: toOptionalNumber(row.cost_kes),
    costUGX: toOptionalNumber(row.cost_ugx),
    location: row.location ?? null,
    notes: row.notes ?? null,
    eventTimestamp: row.event_timestamp ?? row.event_time ?? row.created_at ?? new Date().toISOString(),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapDailyMetricRow(row: any) {
  const metricDate = row.metric_day ?? row.metric_date ?? row.generated_at ?? row.created_at;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    metricDate,
    totalFuelConsumed: toNumber(row.total_fuel_consumed),
    totalDistanceTraveled: toNumber(row.total_distance_traveled),
    totalEngineHours: toNumber(row.total_engine_hours),
    idleTimeHours: toNumber(row.idle_time_hours),
    numberOfRefills: toInt(row.refill_count ?? row.number_of_refills),
    numberOfThefts: toInt(row.drain_count ?? row.number_of_thefts),
    operatingCostKES: toNumber(row.operating_cost_kes),
    operatingCostUGX: toNumber(row.operating_cost_ugx),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function getDateRangeBounds(startDate: string, endDate?: string) {
  const startInput = new Date(startDate);
  if (Number.isNaN(startInput.getTime())) {
    throw new Error("Invalid start_date provided");
  }

  const endInput = new Date(endDate || startDate);
  if (Number.isNaN(endInput.getTime())) {
    throw new Error("Invalid end_date provided");
  }
  if (endInput < startInput) {
    throw new Error("end_date cannot be before start_date");
  }

  const start = new Date(startInput);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(endInput);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

async function requireAuth(
  req: Request,
  origin: string | null
): Promise<{ ok: true; auth: AuthContext } | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return { ok: false, response: jsonResponse({ error: "Missing Authorization token" }, 401, origin) };
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, response: jsonResponse({ error: "Invalid or expired token" }, 401, origin) };
  }

  const user = data.user;

  let profile: any = null;
  const { data: profileData } = await supabaseAdmin
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profileData) {
    const { data: createdProfile, error: createProfileError } = await supabaseAdmin
      .from("profiles")
      .insert([
        {
          id: user.id,
          role: "client",
          display_name: user.email || "User",
        },
      ])
      .select("id, role, display_name")
      .single();

    if (createProfileError || !createdProfile) {
      return { ok: false, response: jsonResponse({ error: "Failed to create profile" }, 500, origin) };
    }
    profile = createdProfile;
  } else {
    profile = profileData;
  }

  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .from("client_users")
    .select("client_id")
    .eq("user_id", user.id);

  if (assignmentsError) {
    return { ok: false, response: jsonResponse({ error: "Failed to load client assignments" }, 500, origin) };
  }

  const clientIds = (assignments ?? []).map((row: any) => row.client_id).filter(Boolean);

  return {
    ok: true,
    auth: {
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      profile: {
        id: profile.id,
        role: profile.role,
        display_name: profile.display_name ?? null,
      },
      clientIds,
    },
  };
}

function getClientScope(url: URL, auth: AuthContext): ClientScopeResult {
  const isAdmin = auth.profile.role === "admin";
  if (isAdmin) {
    const requestedClientId = parseStringParam(url.searchParams.get("client_id") ?? url.searchParams.get("clientId"));
    return {
      ok: true,
      clientIds: requestedClientId ? [requestedClientId] : undefined,
    };
  }

  if (!auth.clientIds.length) {
    return { ok: false, status: 403, error: "No client assigned" };
  }

  return {
    ok: true,
    clientIds: auth.clientIds,
  };
}

function requireAdmin(auth: AuthContext, origin: string | null): Response | null {
  if (auth.profile.role !== "admin") {
    return jsonResponse({ error: "Admin access required" }, 403, origin);
  }
  return null;
}

async function getScopedVehicleIds(
  url: URL,
  auth: AuthContext,
  requestedVehicleIds?: string[]
): Promise<ScopedVehicleIdsResult> {
  const scope = getClientScope(url, auth);
  if (!scope.ok) return scope;

  if (!scope.clientIds?.length) {
    return {
      ok: true,
      clientIds: undefined,
      vehicleIds: requestedVehicleIds?.length ? requestedVehicleIds : undefined,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .select("id")
    .in("client_id", scope.clientIds);

  if (error) {
    return { ok: false, status: 500, error: "Failed to resolve vehicle scope" };
  }

  const allowedIds = (data ?? []).map((row: any) => String(row.id));
  const vehicleIds = requestedVehicleIds?.length
    ? requestedVehicleIds.filter((id) => allowedIds.includes(id))
    : allowedIds;

  return {
    ok: true,
    clientIds: scope.clientIds,
    vehicleIds,
  };
}
async function fetchFuelEventsRows(args: {
  vehicleIds?: string[];
  eventType?: string;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { vehicleIds, eventType, startDate, endDate } = args;
  const timeColumns = ["event_time", "event_timestamp", "created_at"];

  for (const timeColumn of timeColumns) {
    let query = supabaseAdmin.from("fuel_events").select("*");

    if (vehicleIds) {
      if (vehicleIds.length > 0) query = query.in("vehicle_id", vehicleIds);
      else query = query.eq("vehicle_id", "__none__");
    }

    const normalizedEventType = eventType?.trim().toLowerCase();
    if (normalizedEventType) {
      if (normalizedEventType === "drain") {
        query = query.or("event_type.eq.drain,event_type.eq.theft");
      } else {
        query = query.eq("event_type", normalizedEventType);
      }
    }

    if (startDate) query = query.gte(timeColumn, startDate);
    if (endDate) query = query.lte(timeColumn, endDate);
    query = query.order(timeColumn, { ascending: false });

    const { data, error } = await query;
    if (!error) return data ?? [];
    if (!isMissingColumnError(error, timeColumn)) throw error;
  }

  let fallbackQuery = supabaseAdmin.from("fuel_events").select("*");
  if (vehicleIds) {
    if (vehicleIds.length > 0) fallbackQuery = fallbackQuery.in("vehicle_id", vehicleIds);
    else fallbackQuery = fallbackQuery.eq("vehicle_id", "__none__");
  }

  const normalizedEventType = eventType?.trim().toLowerCase();
  if (normalizedEventType) {
    if (normalizedEventType === "drain") {
      fallbackQuery = fallbackQuery.or("event_type.eq.drain,event_type.eq.theft");
    } else {
      fallbackQuery = fallbackQuery.eq("event_type", normalizedEventType);
    }
  }

  const { data, error } = await fallbackQuery;
  if (error) throw error;
  return data ?? [];
}

async function fetchDailyMetricsRows(args: {
  vehicleIds?: string[];
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { vehicleIds, startDate, endDate } = args;
  const startDay = startDate ? startDate.slice(0, 10) : null;
  const endDay = endDate ? endDate.slice(0, 10) : null;

  for (const dateColumn of ["metric_day", "metric_date", "created_at"]) {
    let query = supabaseAdmin.from("daily_metrics").select("*");

    if (vehicleIds) {
      if (vehicleIds.length > 0) query = query.in("vehicle_id", vehicleIds);
      else query = query.eq("vehicle_id", "__none__");
    }

    const startValue = dateColumn === "metric_day" ? startDay : startDate;
    const endValue = dateColumn === "metric_day" ? endDay : endDate;
    if (startValue) query = query.gte(dateColumn, startValue);
    if (endValue) query = query.lte(dateColumn, endValue);
    query = query.order(dateColumn, { ascending: false });

    const { data, error } = await query;
    if (!error) return data ?? [];
    if (!isMissingColumnError(error, dateColumn)) throw error;
  }

  let fallbackQuery = supabaseAdmin.from("daily_metrics").select("*");
  if (vehicleIds) {
    if (vehicleIds.length > 0) fallbackQuery = fallbackQuery.in("vehicle_id", vehicleIds);
    else fallbackQuery = fallbackQuery.eq("vehicle_id", "__none__");
  }
  const { data, error } = await fallbackQuery;
  if (error) throw error;
  return data ?? [];
}

function normalizeMovementRows(rows: any[]) {
  return rows.map((row) => ({
    report_date: row.report_date,
    vehicle_id: row.vehicle_id,
    source_imei: row.source_imei,
    company_name: row.client_name || "Fleet Sentinel",
    asset_description: row.asset_description || row.source_assigned_asset || row.registration_number || row.source_imei || "Unknown Asset",
    registration_number: row.registration_number,
    asset_id: row.source_imei || row.source_assigned_asset || row.vehicle_id || row.id,
    site_name: row.site_name || "",
    departure_date: row.departure_date || row.report_date,
    driver: row.driver,
    departure_time: row.departure_time,
    departed_from: row.departed_from,
    driving_time: row.driving_time,
    standing_time: row.standing_time || "",
    distance_km: toNumber(row.distance_km),
    max_speed_kmh: toNumber(row.max_speed_kmh),
    arrival_time: row.arrival_time,
    arrived_at: row.arrived_at,
    next_departure: row.next_departure || "",
    standing_time_at_location: row.standing_time_at_location || "",
    fuel_used_litres: toNumber(row.fuel_used_litres),
    is_total_row: Boolean(row.is_total_row),
    is_average_row: Boolean(row.is_average_row),
  }));
}

async function fetchDailyMovementRows(startDate: string, endDate: string | undefined, filters: DailyMovementFilters) {
  const { startIso, endIso } = getDateRangeBounds(startDate, endDate);

  const buildBaseQuery = () => {
    let query = supabaseAdmin
      .from("daily_movement_reports")
      .select("*")
      .gte("report_date", startIso)
      .lt("report_date", endIso)
      .order("report_date", { ascending: true })
      .order("departure_time", { ascending: true });

    if (filters.clientIds && filters.clientIds.length > 0) {
      query = query.in("client_id", filters.clientIds);
    }
    return query;
  };

  let query = buildBaseQuery();
  if (filters.vehicleIds && filters.vehicleIds.length > 0) {
    query = query.in("vehicle_id", filters.vehicleIds);
  } else if (filters.vehicleId) {
    query = query.eq("vehicle_id", filters.vehicleId);
  } else if (filters.assetId !== undefined) {
    query = query.eq("source_imei", filters.assetId);
  } else if (filters.registrationNumber) {
    query = query.eq("registration_number", filters.registrationNumber);
  }

  let { data, error } = await query;
  if (error && filters.assetId !== undefined && isMissingColumnError(error, "source_imei")) {
    let fallbackQuery = buildBaseQuery();
    if (filters.registrationNumber) {
      fallbackQuery = fallbackQuery.eq("registration_number", filters.registrationNumber);
    }
    const fallback = await fallbackQuery;
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;
  return normalizeMovementRows(data ?? []);
}

function groupByAssetForPreview(rows: any[]) {
  const groups: Array<{
    asset: {
      asset_description: string;
      registration_number: string;
      asset_id: string;
      site_name: string;
    };
    trips: any[];
    totals: {
      drivingTime: string;
      distance: number;
      standingTime: string;
    };
    averages: {
      drivingTime: string;
      distance: number;
      standingTime: string;
    };
  }> = [];

  const assetsMap = new Map<string, { asset: any; trips: any[] }>();
  for (const row of rows) {
    if (row.is_total_row || row.is_average_row) continue;
    const key = row.registration_number || row.asset_description || row.asset_id || row.vehicle_id || row.id;
    if (!assetsMap.has(key)) {
      assetsMap.set(key, {
        asset: {
          asset_description: row.asset_description,
          registration_number: row.registration_number,
          asset_id: row.asset_id,
          site_name: row.site_name || "",
        },
        trips: [],
      });
    }
    assetsMap.get(key)!.trips.push(row);
  }

  for (const group of assetsMap.values()) {
    const distance = group.trips.reduce((sum, trip) => sum + toNumber(trip.distance_km), 0);
    const drivingTime = sumDurations(group.trips.map((trip) => trip.driving_time));
    const standingTime = sumDurations(group.trips.map((trip) => trip.standing_time_at_location || trip.standing_time));

    groups.push({
      asset: group.asset,
      trips: group.trips,
      totals: {
        drivingTime,
        distance,
        standingTime,
      },
      averages: {
        drivingTime: averageDurations(group.trips.map((trip) => trip.driving_time)),
        distance: group.trips.length > 0 ? distance / group.trips.length : 0,
        standingTime: averageDurations(group.trips.map((trip) => trip.standing_time_at_location || trip.standing_time)),
      },
    });
  }

  return groups;
}

function buildDailyMovementPreview(dateLabel: string, movementRows: any[]) {
  const assetGroups = groupByAssetForPreview(movementRows);
  const companyName = movementRows.find((row) => row?.company_name)?.company_name || "Fleet Sentinel";

  return {
    date: dateLabel,
    companyName,
    reports: assetGroups.map((group) => ({
      assetDescription: group.asset.asset_description,
      registrationNumber: group.asset.registration_number,
      assetId: group.asset.asset_id,
      siteName: group.asset.site_name,
      movements: group.trips.map((trip: any) => ({
        departureDate: trip.departure_date,
        driver: trip.driver,
        departureTime: trip.departure_time,
        departedFrom: trip.departed_from,
        drivingTime: trip.driving_time,
        standingTime: trip.standing_time,
        distanceKm: trip.distance_km,
        maxSpeedKmh: trip.max_speed_kmh,
        arrivalTime: trip.arrival_time,
        arrivedAt: trip.arrived_at,
        nextDeparture: trip.next_departure,
        standingTimeAtLocation: trip.standing_time_at_location,
        fuelUsedLitres: trip.fuel_used_litres,
      })),
      totals: {
        totalDrivingTime: group.totals.drivingTime,
        totalStandingTime: group.totals.standingTime,
        totalDistance: group.totals.distance,
        totalStandingAtLocation: group.totals.standingTime,
      },
      averages: {
        avgDrivingTime: group.averages.drivingTime,
        avgStandingTime: group.averages.standingTime,
        avgDistance: group.averages.distance,
        avgStandingAtLocation: group.averages.standingTime,
      },
    })),
  };
}

async function fetchFuelTemperatureReports(startDate: string, endDate: string | undefined, filters: FuelTemperatureFilters) {
  const { startIso, endIso } = getDateRangeBounds(startDate, endDate);

  const buildBaseQuery = () => {
    let query = supabaseAdmin
      .from("fuel_temperature_reports")
      .select("*")
      .gte("report_date", startIso)
      .lt("report_date", endIso)
      .order("report_date", { ascending: true });

    if (filters.clientIds && filters.clientIds.length > 0) {
      query = query.in("client_id", filters.clientIds);
    }
    return query;
  };

  let query = buildBaseQuery();
  if (filters.vehicleIds && filters.vehicleIds.length > 0) {
    query = query.in("vehicle_id", filters.vehicleIds);
  } else if (filters.vehicleId) {
    query = query.eq("vehicle_id", filters.vehicleId);
  } else if (filters.assetName) {
    query = query.eq("asset_name", filters.assetName);
  }

  let { data, error } = await query;
  if (!error && (!data || data.length === 0) && filters.vehicleId && filters.assetName) {
    const fallback = await buildBaseQuery().eq("asset_name", filters.assetName);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;
  return data ?? [];
}

async function fetchRelatedRowsByReportIds(
  table: "fuel_events" | "raw_sensor_data",
  reportIds: string[],
  relationColumns: string[],
  orderColumns: string[]
) {
  for (const relationColumn of relationColumns) {
    for (const orderColumn of orderColumns) {
      let query = supabaseAdmin
        .from(table)
        .select("*")
        .in(relationColumn, reportIds);

      query = query.order(orderColumn, { ascending: false });

      const { data, error } = await query;
      if (!error) {
        return {
          rows: data ?? [],
          relationColumn,
        };
      }

      if (!isMissingColumnError(error, relationColumn) && !isMissingColumnError(error, orderColumn)) {
        throw error;
      }
    }
  }

  const { data, error } = await supabaseAdmin.from(table).select("*");
  if (error) throw error;
  return {
    rows: data ?? [],
    relationColumn: "",
  };
}

async function getFuelTemperatureDataRange(
  startDate: string,
  endDate: string | undefined,
  filters: FuelTemperatureFilters
): Promise<FuelTemperatureData[]> {
  const reports = await fetchFuelTemperatureReports(startDate, endDate, filters);
  if (!reports.length) return [];

  const reportIds = reports.map((row: any) => String(row.id)).filter(Boolean);
  if (!reportIds.length) return [];

  const [fuelEventsResult, rawSensorResult] = await Promise.all([
    fetchRelatedRowsByReportIds("fuel_events", reportIds, ["temperature_report_id", "fuel_report_id"], ["event_time", "event_timestamp", "created_at"]),
    fetchRelatedRowsByReportIds("raw_sensor_data", reportIds, ["temperature_report_id", "fuel_report_id"], ["date", "timestamp", "created_at"]),
  ]);

  const fuelEventsByReport = new Map<string, any[]>();
  for (const row of fuelEventsResult.rows) {
    const reportId = fuelEventsResult.relationColumn ? String((row as any)[fuelEventsResult.relationColumn] ?? "") : "";
    if (!reportId) continue;
    if (!fuelEventsByReport.has(reportId)) fuelEventsByReport.set(reportId, []);
    fuelEventsByReport.get(reportId)!.push(row);
  }

  const rawSensorByReport = new Map<string, any[]>();
  for (const row of rawSensorResult.rows) {
    const reportId = rawSensorResult.relationColumn ? String((row as any)[rawSensorResult.relationColumn] ?? "") : "";
    if (!reportId) continue;
    if (!rawSensorByReport.has(reportId)) rawSensorByReport.set(reportId, []);
    rawSensorByReport.get(reportId)!.push(row);
  }

  return reports.map((report: any) => {
    const reportId = String(report.id);
    const reportFuelEvents = fuelEventsByReport.get(reportId) ?? [];
    const reportRawSensorRows = rawSensorByReport.get(reportId) ?? [];

    return {
      reportDate: report.report_date,
      reportTitle: report.report_title || "Sensor / Fuel / Temperature",
      assetName: report.asset_name || report.registration_number || "Asset",
      fromDatetime: report.from_datetime,
      toDatetime: report.to_datetime,
      generatedOn: report.generated_on,
      totalDistanceKm: toOptionalNumber(report.total_distance_km),
      totalRefillsL: toOptionalNumber(report.total_refills_l),
      totalDrainsL: toOptionalNumber(report.total_drains_l),
      fuelUsedL: toOptionalNumber(report.fuel_used_l),
      fuelConsumptionKmL: toOptionalNumber(report.fuel_consumption_km_l),
      refuelEvents: reportFuelEvents.map((row: any) => ({
        time: row.event_time ?? row.event_timestamp ?? row.created_at ?? null,
        initial: toOptionalNumber(row.initial_fuel),
        final: toOptionalNumber(row.final_fuel),
        refilled: toOptionalNumber(row.refilled ?? row.volume_liters ?? row.fuel_volume_litres),
        location: row.location ?? null,
        lat: toOptionalNumber(row.latitude ?? row.lat),
        lng: toOptionalNumber(row.longitude ?? row.lon),
      })),
      rawSensorData: reportRawSensorRows.map((row: any) => ({
        timestamp: row.date ?? row.timestamp ?? row.created_at ?? null,
        fuel: toOptionalNumber(row.rf ?? row.af ?? row.fuel),
        altitude: toOptionalNumber(row.alt ?? row.altitude),
        odometer: toOptionalNumber(row.odo ?? row.odometer),
        speed: toOptionalNumber(row.spid ?? row.speed),
        temperature: toOptionalNumber(row.temperature),
      })),
    };
  });
}

function buildFuelTemperaturePreview(dateLabel: string, data: FuelTemperatureData) {
  return {
    date: dateLabel,
    reportDate: data.reportDate ?? null,
    reportTitle: data.reportTitle,
    assetName: data.assetName,
    fromDatetime: data.fromDatetime ?? null,
    toDatetime: data.toDatetime ?? null,
    generatedOn: data.generatedOn ?? null,
    totalDistance: data.totalDistanceKm ?? 0,
    totalRefills: data.totalRefillsL ?? 0,
    totalDrains: data.totalDrainsL ?? 0,
    fuelUsed: data.fuelUsedL ?? 0,
    fuelConsumption: data.fuelConsumptionKmL ?? 0,
    refuelEvents: data.refuelEvents.map((event) => ({
      time: event.time ?? null,
      initial_fuel: event.initial ?? 0,
      final_fuel: event.final ?? 0,
      refilled: event.refilled ?? 0,
      location: event.location ?? "",
      latitude: event.lat ?? 0,
      longitude: event.lng ?? 0,
    })),
    rawSensorData: data.rawSensorData.map((row) => ({
      timestamp: row.timestamp ?? null,
      fuel: row.fuel ?? 0,
      altitude: row.altitude ?? 0,
      odometer: row.odometer ?? 0,
      speed: row.speed ?? 0,
      temperature: row.temperature ?? 0,
    })),
  };
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return emptyResponse(204, origin);
  }

  try {
    const route = normalizePath(getRequestPath(req));
    const url = new URL(req.url);

    if (req.method === "GET" && route === "/health") {
      return jsonResponse({ status: "OK", message: "Fuel Platform API ready" }, 200, origin);
    }

    if (req.method === "GET" && route === "/api/onboarding/status") {
      const { count: adminCount, error: adminError } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (adminError) return jsonResponse({ error: adminError.message }, 500, origin);

      const { count: clientCount, error: clientError } = await supabaseAdmin
        .from("clients")
        .select("id", { count: "exact", head: true });
      if (clientError) return jsonResponse({ error: clientError.message }, 500, origin);

      return jsonResponse(
        {
          hasAdmin: (adminCount || 0) > 0,
          hasClient: (clientCount || 0) > 0,
          needsOnboarding: (adminCount || 0) === 0,
        },
        200,
        origin
      );
    }
    if (req.method === "POST" && route === "/api/onboarding/bootstrap") {
      const body = await req.json().catch(() => null);
      const email = parseStringParam(body?.email ?? null);
      const password = parseStringParam(body?.password ?? null);
      const displayName = parseStringParam(body?.displayName ?? body?.display_name ?? null);
      const clientName = parseStringParam(body?.clientName ?? body?.client_name ?? null);

      if (!email || !password || !clientName) {
        return jsonResponse({ error: "email, password, and clientName are required" }, 400, origin);
      }

      const { count: adminCount, error: adminCountError } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");

      if (adminCountError) return jsonResponse({ error: adminCountError.message }, 500, origin);
      if ((adminCount || 0) > 0) return jsonResponse({ error: "Admin already exists" }, 409, origin);

      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (userError || !userData?.user) {
        return jsonResponse({ error: userError?.message || "Failed to create admin user" }, 500, origin);
      }

      const adminId = userData.user.id;

      const { data: clientData, error: clientError } = await supabaseAdmin
        .from("clients")
        .insert([{ name: clientName }])
        .select("id, name")
        .single();
      if (clientError || !clientData) {
        return jsonResponse({ error: clientError?.message || "Failed to create client" }, 500, origin);
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").insert([
        {
          id: adminId,
          role: "admin",
          display_name: displayName || email,
        },
      ]);
      if (profileError) return jsonResponse({ error: profileError.message }, 500, origin);

      const { error: assignmentError } = await supabaseAdmin.from("client_users").insert([
        {
          user_id: adminId,
          client_id: clientData.id,
        },
      ]);
      if (assignmentError) return jsonResponse({ error: assignmentError.message }, 500, origin);

      return jsonResponse(
        {
          success: true,
          adminId,
          clientId: clientData.id,
          clientName: clientData.name,
        },
        201,
        origin
      );
    }

    if (!route.startsWith("/api")) {
      return jsonResponse({ error: "Not found" }, 404, origin);
    }

    const authResult = await requireAuth(req, origin);
    if (!authResult.ok) return authResult.response;
    const auth = authResult.auth;

    if (req.method === "GET" && route === "/api/me") {
      let clients: any[] = [];
      if (auth.clientIds.length > 0) {
        const { data: clientsData, error: clientsError } = await supabaseAdmin
          .from("clients")
          .select("id, name")
          .in("id", auth.clientIds);
        if (clientsError) return jsonResponse({ error: "Failed to load user profile" }, 500, origin);
        clients = clientsData ?? [];
      }

      return jsonResponse(
        {
          user: auth.user,
          profile: auth.profile,
          clientIds: auth.clientIds,
          clients,
        },
        200,
        origin
      );
    }

    if (req.method === "GET" && route === "/api/admin/clients") {
      const adminGuard = requireAdmin(auth, origin);
      if (adminGuard) return adminGuard;

      const { data, error } = await supabaseAdmin
        .from("clients")
        .select("id, name, created_at")
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500, origin);
      return jsonResponse(data ?? [], 200, origin);
    }

    if (req.method === "GET" && route === "/api/admin/users") {
      const adminGuard = requireAdmin(auth, origin);
      if (adminGuard) return adminGuard;

      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
      if (usersError) return jsonResponse({ error: usersError.message }, 500, origin);

      const { data: profilesData, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, role, display_name");
      if (profilesError) return jsonResponse({ error: profilesError.message }, 500, origin);

      const { data: assignmentsData, error: assignmentsError } = await supabaseAdmin
        .from("client_users")
        .select("user_id, client_id");
      if (assignmentsError) return jsonResponse({ error: assignmentsError.message }, 500, origin);

      const profileMap = new Map((profilesData ?? []).map((profile: any) => [profile.id, profile]));
      const assignmentMap = new Map<string, string[]>();
      for (const assignment of assignmentsData ?? []) {
        const list = assignmentMap.get(assignment.user_id) ?? [];
        list.push(assignment.client_id);
        assignmentMap.set(assignment.user_id, list);
      }

      const users = (usersData?.users ?? []).map((user: any) => ({
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at ?? null,
        role: profileMap.get(user.id)?.role || "client",
        displayName: profileMap.get(user.id)?.display_name || user.email || null,
        clientIds: assignmentMap.get(user.id) ?? [],
      }));

      return jsonResponse(users, 200, origin);
    }

    if (req.method === "GET" && route === "/api/admin/assignments") {
      const adminGuard = requireAdmin(auth, origin);
      if (adminGuard) return adminGuard;

      const userId = parseStringParam(url.searchParams.get("userId") ?? url.searchParams.get("user_id"));
      const clientId = parseStringParam(url.searchParams.get("clientId") ?? url.searchParams.get("client_id"));

      let query = supabaseAdmin
        .from("client_users")
        .select("id, user_id, client_id, created_at")
        .order("created_at", { ascending: false });

      if (userId) query = query.eq("user_id", userId);
      if (clientId) query = query.eq("client_id", clientId);

      const { data: assignments, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500, origin);

      const clientIds = Array.from(
        new Set((assignments ?? []).map((item: any) => item.client_id).filter(Boolean))
      );

      let clientsById = new Map<string, { name: string }>();
      if (clientIds.length > 0) {
        const { data: clients, error: clientsError } = await supabaseAdmin
          .from("clients")
          .select("id, name")
          .in("id", clientIds);
        if (clientsError) return jsonResponse({ error: clientsError.message }, 500, origin);
        clientsById = new Map((clients ?? []).map((client: any) => [client.id, { name: client.name }]));
      }

      const result = (assignments ?? []).map((assignment: any) => ({
        ...assignment,
        clients: clientsById.get(assignment.client_id) ?? null,
      }));

      return jsonResponse(result, 200, origin);
    }

    if (req.method === "GET" && route === "/api/vehicles") {
      const scope = getClientScope(url, auth);
      if (!scope.ok) return jsonResponse({ error: scope.error }, scope.status, origin);

      let query = supabaseAdmin.from("vehicles").select("*");
      if (scope.clientIds?.length) {
        query = query.in("client_id", scope.clientIds);
      }

      const status = parseStringParam(url.searchParams.get("status"));
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) return jsonResponse({ error: "Failed to fetch vehicles" }, 500, origin);

      return jsonResponse((data ?? []).map(mapVehicleRow), 200, origin);
    }

    const vehicleIdMatch = route.match(/^\/api\/vehicles\/([^/]+)$/);
    if (req.method === "GET" && vehicleIdMatch) {
      const vehicleId = decodeURIComponent(vehicleIdMatch[1]);
      const { data: vehicle, error } = await supabaseAdmin
        .from("vehicles")
        .select("*")
        .eq("id", vehicleId)
        .maybeSingle();

      if (error) return jsonResponse({ error: "Failed to fetch vehicle" }, 500, origin);
      if (!vehicle) return jsonResponse({ error: "Vehicle not found" }, 404, origin);

      if (auth.profile.role !== "admin" && !auth.clientIds.includes(vehicle.client_id)) {
        return jsonResponse({ error: "Vehicle not found" }, 404, origin);
      }

      return jsonResponse(mapVehicleRow(vehicle), 200, origin);
    }

    if (req.method === "GET" && route === "/api/fuel-events") {
      const requestedVehicleIds = parseRequestedVehicleIds(url);
      const scoped = await getScopedVehicleIds(url, auth, requestedVehicleIds);
      if (!scoped.ok) return jsonResponse({ error: scoped.error }, scoped.status, origin);

      const startDate = parseIsoDate(url.searchParams.get("startDate") ?? url.searchParams.get("start_date"));
      const endDate = parseIsoDate(url.searchParams.get("endDate") ?? url.searchParams.get("end_date"));
      const eventType = parseStringParam(url.searchParams.get("eventType") ?? url.searchParams.get("event_type"));

      const events = await fetchFuelEventsRows({
        vehicleIds: scoped.vehicleIds,
        eventType,
        startDate,
        endDate,
      });

      return jsonResponse(events.map(mapFuelEventRow), 200, origin);
    }

    if (req.method === "GET" && route === "/api/daily-metrics") {
      const requestedVehicleIds = parseRequestedVehicleIds(url);
      const scoped = await getScopedVehicleIds(url, auth, requestedVehicleIds);
      if (!scoped.ok) return jsonResponse({ error: scoped.error }, scoped.status, origin);

      const startDate = parseIsoDate(url.searchParams.get("startDate") ?? url.searchParams.get("start_date"));
      const endDate = parseIsoDate(url.searchParams.get("endDate") ?? url.searchParams.get("end_date"));

      const rows = await fetchDailyMetricsRows({
        vehicleIds: scoped.vehicleIds,
        startDate,
        endDate,
      });

      return jsonResponse(rows.map(mapDailyMetricRow), 200, origin);
    }

    if (req.method === "GET" && route === "/api/dashboard/kpis") {
      const scope = getClientScope(url, auth);
      if (!scope.ok) return jsonResponse({ error: scope.error }, scope.status, origin);

      const requestedVehicleIds = parseListParam(
        url.searchParams.get("vehicleIds") ?? url.searchParams.get("vehicle_ids")
      );

      let vehiclesQuery = supabaseAdmin.from("vehicles").select("*");
      if (scope.clientIds?.length) {
        vehiclesQuery = vehiclesQuery.in("client_id", scope.clientIds);
      }
      if (requestedVehicleIds.length > 0) {
        vehiclesQuery = vehiclesQuery.in("id", requestedVehicleIds);
      }

      const { data: vehicles, error: vehiclesError } = await vehiclesQuery;
      if (vehiclesError) return jsonResponse({ error: "Failed to fetch dashboard data" }, 500, origin);

      const scopedVehicles = vehicles ?? [];
      const vehicleIds = scopedVehicles.map((vehicle: any) => vehicle.id).filter(Boolean);

      const startDate = parseIsoDate(url.searchParams.get("startDate") ?? url.searchParams.get("start_date"));
      const endDate = parseIsoDate(url.searchParams.get("endDate") ?? url.searchParams.get("end_date"));

      const fuelEvents = await fetchFuelEventsRows({
        vehicleIds,
        startDate,
        endDate,
      });

      const totalVehicles = scopedVehicles.length;
      const activeVehicles = scopedVehicles.filter((vehicle: any) =>
        vehicle.status === "Active" || vehicle.last_ignition_on === true
      ).length;
      const totalFuelUsed = scopedVehicles.reduce((sum: number, vehicle: any) => sum + toNumber(vehicle.total_fuel_used), 0);
      const totalDistance = scopedVehicles.reduce((sum: number, vehicle: any) => sum + toNumber(vehicle.total_distance), 0);
      const totalEngineHours = scopedVehicles.reduce((sum: number, vehicle: any) => sum + toNumber(vehicle.total_engine_hours), 0);

      const totalRefills = fuelEvents.filter((event: any) => String(event.event_type).toLowerCase() === "refill").length;
      const totalThefts = fuelEvents.filter((event: any) => {
        const eventType = String(event.event_type).toLowerCase();
        return eventType === "theft" || eventType === "drain";
      }).length;

      return jsonResponse(
        {
          totalVehicles,
          activeVehicles,
          totalRefills,
          totalThefts,
          totalFuelUsed,
          totalDistance,
          totalEngineHours,
          fleetUtilization: Math.round((activeVehicles || 0) / Math.max(totalVehicles, 1) * 100),
          lastUpdated: new Date().toISOString(),
        },
        200,
        origin
      );
    }

    const previewDailyMovementMatch = route.match(/^\/api\/reports\/preview-daily-movement\/([^/]+)$/);
    if (req.method === "GET" && previewDailyMovementMatch) {
      const date = decodeURIComponent(previewDailyMovementMatch[1]);
      if (!parseIsoDate(date)) return jsonResponse({ error: "Invalid start date provided" }, 400, origin);

      const endDate = parseStringParam(url.searchParams.get("end_date") ?? url.searchParams.get("endDate"));
      if (endDate && !parseIsoDate(endDate)) return jsonResponse({ error: "Invalid end date provided" }, 400, origin);
      if (endDate && new Date(endDate) < new Date(date)) {
        return jsonResponse({ error: "end_date cannot be before start_date" }, 400, origin);
      }

      const scope = getClientScope(url, auth);
      if (!scope.ok) return jsonResponse({ error: scope.error }, scope.status, origin);

      const movementRows = await fetchDailyMovementRows(date, endDate, {
        vehicleId: parseStringParam(url.searchParams.get("vehicle_id") ?? url.searchParams.get("vehicleId")),
        vehicleIds: parseListParam(url.searchParams.get("vehicle_ids") ?? url.searchParams.get("vehicleIds")),
        assetId: parseStringParam(url.searchParams.get("asset_id") ?? url.searchParams.get("assetId")),
        registrationNumber: parseStringParam(url.searchParams.get("registration_number") ?? url.searchParams.get("registrationNumber")),
        clientIds: scope.clientIds,
      });

      if (!movementRows.length) {
        return jsonResponse({ error: "No daily movement data found for the selected date range" }, 404, origin);
      }

      const previewLabel = endDate && endDate !== date ? `${date} to ${endDate}` : date;
      return jsonResponse(buildDailyMovementPreview(previewLabel, movementRows), 200, origin);
    }

    const previewFuelTemperatureMatch = route.match(/^\/api\/reports\/preview-fuel-temperature\/([^/]+)$/);
    if (req.method === "GET" && previewFuelTemperatureMatch) {
      const date = decodeURIComponent(previewFuelTemperatureMatch[1]);
      if (!parseIsoDate(date)) return jsonResponse({ error: "Invalid start date provided" }, 400, origin);

      const endDate = parseStringParam(url.searchParams.get("end_date") ?? url.searchParams.get("endDate"));
      if (endDate && !parseIsoDate(endDate)) return jsonResponse({ error: "Invalid end date provided" }, 400, origin);
      if (endDate && new Date(endDate) < new Date(date)) {
        return jsonResponse({ error: "end_date cannot be before start_date" }, 400, origin);
      }

      const scope = getClientScope(url, auth);
      if (!scope.ok) return jsonResponse({ error: scope.error }, scope.status, origin);

      const reports = await getFuelTemperatureDataRange(date, endDate || date, {
        vehicleId: parseStringParam(url.searchParams.get("vehicle_id") ?? url.searchParams.get("vehicleId")),
        vehicleIds: parseListParam(url.searchParams.get("vehicle_ids") ?? url.searchParams.get("vehicleIds")),
        assetName: parseStringParam(url.searchParams.get("asset_name") ?? url.searchParams.get("assetName")),
        clientIds: scope.clientIds,
      });

      if (!reports.length) {
        return jsonResponse({ error: "No fuel/temperature data found for the selected date range" }, 404, origin);
      }

      const previewLabel = endDate && endDate !== date ? `${date} to ${endDate}` : date;
      return jsonResponse(buildFuelTemperaturePreview(previewLabel, reports[reports.length - 1]), 200, origin);
    }

    if (req.method === "GET" && route === "/api/reports/generate") {
      const format = (parseStringParam(url.searchParams.get("format")) ?? "preview").toLowerCase();
      const reportType = (parseStringParam(url.searchParams.get("report_type") ?? url.searchParams.get("reportType")) ??
        "daily-movement")
        .toLowerCase();

      const startDate = parseStringParam(
        url.searchParams.get("start_date") ?? url.searchParams.get("startDate") ?? url.searchParams.get("date")
      );
      const endDate = parseStringParam(url.searchParams.get("end_date") ?? url.searchParams.get("endDate"));

      if (!startDate) return jsonResponse({ error: "start_date is required" }, 400, origin);
      if (!parseIsoDate(startDate)) return jsonResponse({ error: "Invalid start_date provided" }, 400, origin);
      if (endDate && !parseIsoDate(endDate)) return jsonResponse({ error: "Invalid end_date provided" }, 400, origin);
      if (endDate && new Date(endDate) < new Date(startDate)) {
        return jsonResponse({ error: "end_date cannot be before start_date" }, 400, origin);
      }

      const normalizedEndDate = endDate || startDate;
      const dateLabel = normalizedEndDate !== startDate ? `${startDate} to ${normalizedEndDate}` : startDate;
      const fileRangeLabel = normalizedEndDate !== startDate ? `${startDate}_${normalizedEndDate}` : startDate;

      const scope = getClientScope(url, auth);
      if (!scope.ok) return jsonResponse({ error: scope.error }, scope.status, origin);

      if (reportType === "fuel-temperature") {
        const reports = await getFuelTemperatureDataRange(startDate, normalizedEndDate, {
          vehicleId: parseStringParam(url.searchParams.get("vehicle_id") ?? url.searchParams.get("vehicleId")),
          vehicleIds: parseListParam(url.searchParams.get("vehicle_ids") ?? url.searchParams.get("vehicleIds")),
          assetName: parseStringParam(url.searchParams.get("asset_name") ?? url.searchParams.get("assetName")),
          clientIds: scope.clientIds,
        });

        if (!reports.length) {
          return jsonResponse({ error: "No fuel/temperature data found for the selected date range" }, 404, origin);
        }

        if (format === "preview") {
          return jsonResponse(buildFuelTemperaturePreview(dateLabel, reports[reports.length - 1]), 200, origin);
        }

        if (format === "csv") {
          const headers = [
            "report_date",
            "asset_name",
            "report_title",
            "from_datetime",
            "to_datetime",
            "generated_on",
            "total_distance_km",
            "total_refills_l",
            "total_drains_l",
            "fuel_used_l",
            "fuel_consumption_km_l",
            "vehicle_id",
            "client_id",
          ];

          const rows = reports.map((report) => ({
            report_date: report.reportDate ?? "",
            asset_name: report.assetName ?? "",
            report_title: report.reportTitle ?? "",
            from_datetime: report.fromDatetime ?? "",
            to_datetime: report.toDatetime ?? "",
            generated_on: report.generatedOn ?? "",
            total_distance_km: report.totalDistanceKm ?? "",
            total_refills_l: report.totalRefillsL ?? "",
            total_drains_l: report.totalDrainsL ?? "",
            fuel_used_l: report.fuelUsedL ?? "",
            fuel_consumption_km_l: report.fuelConsumptionKmL ?? "",
            vehicle_id: "",
            client_id: "",
          }));

          const csv = toCsv(headers, rows);
          return textResponse(
            csv,
            200,
            origin,
            "text/csv; charset=utf-8",
            { "Content-Disposition": `attachment; filename=fuel_temperature_${fileRangeLabel}.csv` }
          );
        }

        return jsonResponse(
          { error: "Format not supported on public-api edge function. Use format=preview or format=csv." },
          501,
          origin
        );
      }

      const movementRows = await fetchDailyMovementRows(startDate, normalizedEndDate, {
        vehicleId: parseStringParam(url.searchParams.get("vehicle_id") ?? url.searchParams.get("vehicleId")),
        vehicleIds: parseListParam(url.searchParams.get("vehicle_ids") ?? url.searchParams.get("vehicleIds")),
        assetId: parseStringParam(url.searchParams.get("asset_id") ?? url.searchParams.get("assetId")),
        registrationNumber: parseStringParam(url.searchParams.get("registration_number") ?? url.searchParams.get("registrationNumber")),
        clientIds: scope.clientIds,
      });

      if (!movementRows.length) {
        return jsonResponse({ error: "No daily movement data found for the selected date range" }, 404, origin);
      }

      if (format === "preview") {
        return jsonResponse(buildDailyMovementPreview(dateLabel, movementRows), 200, origin);
      }

      if (format === "csv") {
        const headers = [
          "report_date",
          "driver",
          "departure_date",
          "departure_time",
          "departed_from",
          "driving_time",
          "distance_km",
          "max_speed_kmh",
          "arrival_time",
          "arrived_at",
          "next_departure",
          "standing_time_at_location",
          "fuel_used_litres",
        ];

        const csv = toCsv(
          headers,
          movementRows.map((row) => ({
            report_date: row.report_date ?? "",
            driver: row.driver ?? "",
            departure_date: row.departure_date ?? "",
            departure_time: row.departure_time ?? "",
            departed_from: row.departed_from ?? "",
            driving_time: row.driving_time ?? "",
            distance_km: row.distance_km ?? "",
            max_speed_kmh: row.max_speed_kmh ?? "",
            arrival_time: row.arrival_time ?? "",
            arrived_at: row.arrived_at ?? "",
            next_departure: row.next_departure ?? "",
            standing_time_at_location: row.standing_time_at_location ?? "",
            fuel_used_litres: row.fuel_used_litres ?? "",
          }))
        );

        return textResponse(
          csv,
          200,
          origin,
          "text/csv; charset=utf-8",
          { "Content-Disposition": `attachment; filename=daily_movement_${fileRangeLabel}.csv` }
        );
      }

      return jsonResponse(
        { error: "Format not supported on public-api edge function. Use format=preview or format=csv." },
        501,
        origin
      );
    }

    return jsonResponse({ error: "Not found" }, 404, origin);
  } catch (error: any) {
    console.error("public-api error", error);
    return jsonResponse({ error: error?.message || "Internal server error" }, 500, origin);
  }
});
