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
  | {
    ok: true;
    clientIds?: string[];
    vehicleIds?: string[];
    vehicleImeis?: string[];
    vehicleRefs?: Array<{ id: string; imei: string | null }>;
  }
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

const TRIP_REPORT_TABLE = "trip_reports";
const LEGACY_DAILY_MOVEMENT_TABLE = "daily_movement_reports";
const TRIP_REPORT_TABLE_CANDIDATES = [TRIP_REPORT_TABLE, LEGACY_DAILY_MOVEMENT_TABLE] as const;

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

const NODE_ENV = (Deno.env.get("NODE_ENV") ?? Deno.env.get("ENV") ?? "").toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production" || Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

const ALLOWED_ORIGINS = (Deno.env.get("FRONTEND_ORIGINS") ?? (IS_PRODUCTION ? "" : "*"))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const ALLOW_ANY_ORIGIN = ALLOWED_ORIGINS.includes("*");

function resolveAllowedOrigin(origin: string | null): string | null {
  if (ALLOW_ANY_ORIGIN) return origin ?? "*";
  if (!origin) return null;
  const normalized = origin.replace(/\/+$/, "");
  const isAllowed = ALLOWED_ORIGINS.some((entry) => entry.replace(/\/+$/, "") === normalized);
  return isAllowed ? origin : null;
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  return resolveAllowedOrigin(origin) !== null;
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin = resolveAllowedOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowedOrigin ?? "null",
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

function dedupeRows(rows: any[]): any[] {
  const seen = new Set<string>();
  const deduped: any[] = [];

  for (const row of rows) {
    const fallbackKey = [
      row?.vehicle_id ?? "",
      row?.imei_number ?? "",
      row?.metric_day ?? row?.metric_date ?? row?.date ?? row?.timestamp ?? row?.created_at ?? "",
    ].join("|");
    const key = String(row?.id ?? fallbackKey);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
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

function hasFuelTankCapacity(vehicle: { tankCapacity?: unknown }) {
  const capacity = Number(vehicle.tankCapacity ?? 0);
  return Number.isFinite(capacity) && capacity > 10;
}

const BRANDING_LOGO_BUCKET = "client-branding";
const BRANDING_LOGO_OBJECT_NAME = "heading-logo";
const BRANDING_LOGO_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;
const BRANDING_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_BRANDING_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

let brandingBucketReady = false;

function normalizeImeiValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digitsOnly = String(value).replace(/\D/g, "");
  return digitsOnly.length > 0 ? digitsOnly : null;
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
  const totalSeconds = values.reduce((sum: number, value) => sum + parseDurationToSeconds(value), 0);
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

function isMissingRelationError(error: unknown, relationName: string): boolean {
  const code = String((error as any)?.code ?? "");
  const message = String((error as any)?.message ?? "");
  const details = String((error as any)?.details ?? "");
  const hint = String((error as any)?.hint ?? "");
  const combined = `${message} ${details} ${hint}`.toLowerCase();
  return (
    code === "42P01" ||
    (combined.includes("relation") &&
      combined.includes(relationName.toLowerCase()) &&
      combined.includes("does not exist"))
  );
}

function mapVehicleRow(row: any) {
  const consumptionKml = toOptionalNumber(row.consumption_kml);
  const totalDistance = toOptionalNumber(row.total_distance);
  const totalEngineHours = toOptionalNumber(row.total_engine_hours);
  const totalFuelUsed = toOptionalNumber(row.total_fuel_used);
  const theftIncidents = toInt(row.theft_incidents ?? row.total_thefts ?? row.number_of_thefts ?? row.drain_count, 0);
  const refillCount = toInt(row.refill_count ?? row.total_refills ?? row.number_of_refills, 0);
  return {
    id: row.id,
    clientId: row.client_id,
    assetId: row.asset_id || row.imei || row.id,
    vehiclePlate: row.vehicle_plate || row.asset_id || row.imei || row.id,
    driverName: row.last_driver_id ? String(row.last_driver_id) : "Unassigned",
    status: row.status || (row.last_ignition_on ? "Active" : "Idle"),
    currentFuelLevel: toNumber(row.current_fuel_level),
    tankCapacity: toOptionalNumber(row.tank_capacity),
    consumptionKml,
    efficiencyRating: consumptionKml === null
      ? "N/A"
      : consumptionKml > 0 && consumptionKml < 0.4
        ? "Excellent"
        : consumptionKml > 0 && consumptionKml < 0.7
          ? "Good"
          : "Poor",
    totalDistance,
    totalEngineHours,
    totalFuelUsed,
    lastGpsAt: row.last_gps_at ?? null,
    lastRoadName: row.last_road_name ?? null,
    workingDays: 0,
    parkingDays: 0,
    lastMaintenanceDate: null,
    maintenanceStatus: "N/A",
    theftIncidents,
    refillCount,
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

function mapRawSensorRow(row: any) {
  const timestamp = row.date ?? row.timestamp ?? row.created_at ?? null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id ?? null,
    imeiNumber: normalizeImeiValue(row.imei_number),
    timestamp,
    // Canonical mapping:
    // af = calibrated fuel, rf = raw fuel (before spike logic).
    fuel: toOptionalNumber(row.af ?? row.fuel ?? row.rf),
    rawFuel: toOptionalNumber(row.rf ?? row.raw_fuel ?? row.af ?? row.fuel),
    altitude: toOptionalNumber(row.alt ?? row.altitude),
    odometer: toOptionalNumber(row.odo ?? row.odometer),
    speed: toOptionalNumber(row.spid ?? row.speed),
    temperature: toOptionalNumber(row.temperature),
    engineHours: toOptionalNumber(row.hrs ?? row.engine_hours),
    ignition: toInt(row.ign ?? row.ignition, 0),
    createdAt: row.created_at ?? null,
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

function brandingObjectPath(clientId: string): string {
  return `${clientId}/${BRANDING_LOGO_OBJECT_NAME}`;
}

function isStorageAlreadyExistsError(error: unknown): boolean {
  const statusCode = Number((error as any)?.statusCode ?? (error as any)?.status ?? 0);
  const message = String((error as any)?.message ?? "").toLowerCase();
  return statusCode === 409 || message.includes("already exists");
}

async function ensureBrandingBucket() {
  if (brandingBucketReady) return;
  const { error } = await supabaseAdmin.storage.createBucket(BRANDING_LOGO_BUCKET, {
    public: false,
    fileSizeLimit: BRANDING_LOGO_MAX_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_BRANDING_MIME_TYPES),
  });
  if (error && !isStorageAlreadyExistsError(error)) throw error;
  brandingBucketReady = true;
}

async function fetchBrandingLogo(clientId: string) {
  await ensureBrandingBucket();

  const { data: objects, error: listError } = await supabaseAdmin.storage
    .from(BRANDING_LOGO_BUCKET)
    .list(clientId, { limit: 100 });
  if (listError) throw listError;

  const logoObject = (objects ?? []).find((entry: any) => entry.name === BRANDING_LOGO_OBJECT_NAME);
  if (!logoObject) {
    return {
      logoUrl: null as string | null,
      updatedAt: null as string | null,
    };
  }

  const fullPath = brandingObjectPath(clientId);
  const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
    .from(BRANDING_LOGO_BUCKET)
    .createSignedUrl(fullPath, BRANDING_LOGO_SIGNED_URL_TTL_SECONDS);
  if (signedUrlError) throw signedUrlError;

  return {
    logoUrl: signedUrlData?.signedUrl ?? null,
    updatedAt: logoObject.updated_at ?? logoObject.created_at ?? null,
  };
}

function resolveBrandingClientId(auth: AuthContext, requestedClientId?: string): {
  clientId: string | null;
  status?: number;
  error?: string;
} {
  const isAdmin = auth.profile.role === "admin";
  const assignedClientIds = auth.clientIds ?? [];

  if (requestedClientId) {
    if (!isAdmin && !assignedClientIds.includes(requestedClientId)) {
      return { clientId: null, status: 403, error: "Requested client is not assigned to this user" };
    }
    return { clientId: requestedClientId };
  }

  if (!isAdmin && assignedClientIds.length === 1) {
    return { clientId: assignedClientIds[0] };
  }

  return { clientId: null };
}

function normalizeClientName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function syncClientsFromVehicles(): Promise<void> {
  let hasClientNameColumn = true;
  let vehicles: any[] = [];

  const { data: vehicleRows, error: vehiclesError } = await supabaseAdmin
    .from("vehicles")
    .select("id, client_id, client_name");

  if (vehiclesError) {
    if (!isMissingColumnError(vehiclesError, "client_name")) throw vehiclesError;
    hasClientNameColumn = false;
    const { data: fallbackVehicles, error: fallbackVehiclesError } = await supabaseAdmin
      .from("vehicles")
      .select("id, client_id");
    if (fallbackVehiclesError) throw fallbackVehiclesError;
    vehicles = fallbackVehicles ?? [];
  } else {
    vehicles = vehicleRows ?? [];
  }

  const { data: existingClients, error: existingClientsError } = await supabaseAdmin
    .from("clients")
    .select("id, name");
  if (existingClientsError) throw existingClientsError;

  const clientsByName = new Map<string, { id: string; name: string }>();
  for (const client of existingClients ?? []) {
    const normalized = normalizeClientName(client.name);
    if (!normalized) continue;
    clientsByName.set(normalized.toLowerCase(), client);
  }

  if (hasClientNameColumn) {
    const clientNames = Array.from(
      new Set(
        vehicles
          .map((vehicle: any) => normalizeClientName(vehicle.client_name))
          .filter((name): name is string => Boolean(name))
      )
    );

    const missingClientRows = clientNames
      .filter((name) => !clientsByName.has(name.toLowerCase()))
      .map((name) => ({ name }));

    if (missingClientRows.length > 0) {
      const { data: insertedClients, error: insertClientsError } = await supabaseAdmin
        .from("clients")
        .insert(missingClientRows)
        .select("id, name");
      if (insertClientsError) throw insertClientsError;

      for (const client of insertedClients ?? []) {
        const normalized = normalizeClientName(client.name);
        if (!normalized) continue;
        clientsByName.set(normalized.toLowerCase(), client);
      }
    }
  }

  const vehicleIdsByClientId = new Map<string, string[]>();
  const referencedClientIds = new Set<string>();
  for (const vehicle of vehicles) {
    let targetClientId: string | null = null;

    if (hasClientNameColumn) {
      const normalizedName = normalizeClientName(vehicle.client_name);
      const mappedClient = normalizedName ? clientsByName.get(normalizedName.toLowerCase()) : null;
      if (mappedClient?.id) targetClientId = mappedClient.id;
    }

    if (!targetClientId && vehicle.client_id) {
      targetClientId = String(vehicle.client_id);
    }

    if (!targetClientId) continue;
    referencedClientIds.add(targetClientId);

    if (String(vehicle.client_id ?? "") === targetClientId) continue;

    const list = vehicleIdsByClientId.get(targetClientId) ?? [];
    list.push(String(vehicle.id));
    vehicleIdsByClientId.set(targetClientId, list);
  }

  for (const [clientId, vehicleIds] of vehicleIdsByClientId.entries()) {
    const { error: updateVehiclesError } = await supabaseAdmin
      .from("vehicles")
      .update({ client_id: clientId })
      .in("id", vehicleIds);
    if (updateVehiclesError) throw updateVehiclesError;
  }

  const staleClientIds = (existingClients ?? [])
    .map((client: any) => String(client.id))
    .filter((id) => id.length > 0 && !referencedClientIds.has(id));

  if (staleClientIds.length > 0) {
    const batchSize = 200;
    for (let i = 0; i < staleClientIds.length; i += batchSize) {
      const batch = staleClientIds.slice(i, i + batchSize);
      const { error: deleteClientsError } = await supabaseAdmin
        .from("clients")
        .delete()
        .in("id", batch);
      if (deleteClientsError) throw deleteClientsError;
    }
  }
}

async function getClientsUsedByVehicles() {
  const { data: vehicleClientRows, error: vehicleClientError } = await supabaseAdmin
    .from("vehicles")
    .select("client_id");
  if (vehicleClientError) throw vehicleClientError;

  const clientIds = Array.from(
    new Set(
      (vehicleClientRows ?? [])
        .map((row: any) => String(row.client_id ?? ""))
        .filter((id) => id.length > 0)
    )
  );

  if (clientIds.length === 0) return [];

  const { data: clients, error: clientsError } = await supabaseAdmin
    .from("clients")
    .select("id, name, created_at")
    .in("id", clientIds)
    .order("created_at", { ascending: false });
  if (clientsError) throw clientsError;

  return clients ?? [];
}

async function getScopedVehicleIds(
  url: URL,
  auth: AuthContext,
  requestedVehicleIds?: string[]
): Promise<ScopedVehicleIdsResult> {
  const scope = getClientScope(url, auth);
  if (!scope.ok) return scope;

  let vehiclesQuery = supabaseAdmin
    .from("vehicles")
    .select("id, imei, tank_capacity");

  if (scope.clientIds?.length) {
    vehiclesQuery = vehiclesQuery.in("client_id", scope.clientIds);
  }

  const { data, error } = await vehiclesQuery;

  if (error) {
    return { ok: false, status: 500, error: "Failed to resolve vehicle scope" };
  }

  const allowedRows = (data ?? []).map((row: any) => ({
    id: String(row.id),
    imei: normalizeImeiValue(row.imei),
    tankCapacity: toOptionalNumber(row.tank_capacity),
  })).filter((row) => hasFuelTankCapacity({ tankCapacity: row.tankCapacity }));
  const requestedSet = new Set(requestedVehicleIds ?? []);
  const vehicleRefs = requestedVehicleIds?.length
    ? allowedRows.filter((row) => requestedSet.has(row.id))
    : allowedRows;
  const vehicleIds = vehicleRefs.map((row) => row.id);
  const vehicleImeis = Array.from(
    new Set(vehicleRefs.map((row) => row.imei).filter((value): value is string => Boolean(value)))
  );

  return {
    ok: true,
    clientIds: scope.clientIds,
    vehicleIds,
    vehicleImeis,
    vehicleRefs,
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
  vehicleImeis?: string[];
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { vehicleIds, vehicleImeis, startDate, endDate } = args;
  const scopeVehicleIds = (vehicleIds ?? []).filter(Boolean);
  const scopeVehicleImeis = (vehicleImeis ?? []).filter(Boolean);
  const hasScopedFilter = vehicleIds !== undefined || vehicleImeis !== undefined;
  if (hasScopedFilter && scopeVehicleIds.length === 0 && scopeVehicleImeis.length === 0) {
    return [];
  }

  const startDay = parseDateOnly(startDate ?? null);
  let endDay = parseDateOnly(endDate ?? null);
  if (startDay && endDay && startDate && endDate) {
    const rangeMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    // Handle local day presets serialized to UTC (e.g. Yesterday in US timezones).
    if (rangeMs >= 0 && rangeMs < 24 * 60 * 60 * 1000 && endDay !== startDay) {
      endDay = startDay;
    }
  }

  for (const dateColumn of ["metric_day", "metric_date", "created_at"]) {
    const startValue = dateColumn === "metric_day" ? startDay : startDate;
    const endValue = dateColumn === "metric_day" ? endDay : endDate;

    const applyDateRange = (query: any) => {
      if (startValue) query = query.gte(dateColumn, startValue);
      if (endValue) query = query.lte(dateColumn, endValue);
      return query.order(dateColumn, { ascending: false });
    };

    if (!hasScopedFilter) {
      const { data, error } = await applyDateRange(supabaseAdmin.from("daily_metrics").select("*"));
      if (!error) return data ?? [];
      if (isMissingColumnError(error, dateColumn)) continue;
      throw error;
    }

    let hasUsableScopeColumn = false;
    let missingDateColumn = false;
    const rows: any[] = [];

    if (scopeVehicleIds.length > 0) {
      const { data, error } = await applyDateRange(
        supabaseAdmin.from("daily_metrics").select("*").in("vehicle_id", scopeVehicleIds)
      );
      if (!error) {
        hasUsableScopeColumn = true;
        rows.push(...(data ?? []));
      } else if (isMissingColumnError(error, dateColumn)) {
        missingDateColumn = true;
      } else if (!isMissingColumnError(error, "vehicle_id")) {
        throw error;
      }
    }

    if (missingDateColumn) continue;

    if (scopeVehicleImeis.length > 0) {
      const { data, error } = await applyDateRange(
        supabaseAdmin.from("daily_metrics").select("*").in("imei_number", scopeVehicleImeis)
      );
      if (!error) {
        hasUsableScopeColumn = true;
        rows.push(...(data ?? []));
      } else if (isMissingColumnError(error, dateColumn)) {
        missingDateColumn = true;
      } else if (!isMissingColumnError(error, "imei_number")) {
        throw error;
      }
    }

    if (missingDateColumn) continue;
    if (hasUsableScopeColumn) return dedupeRows(rows);
  }

  if (!hasScopedFilter) {
    const { data, error } = await supabaseAdmin.from("daily_metrics").select("*");
    if (error) throw error;
    return data ?? [];
  }

  const fallbackRows: any[] = [];
  let hasUsableScopeColumn = false;

  if (scopeVehicleIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("daily_metrics")
      .select("*")
      .in("vehicle_id", scopeVehicleIds);
    if (!error) {
      hasUsableScopeColumn = true;
      fallbackRows.push(...(data ?? []));
    } else if (!isMissingColumnError(error, "vehicle_id")) {
      throw error;
    }
  }

  if (scopeVehicleImeis.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("daily_metrics")
      .select("*")
      .in("imei_number", scopeVehicleImeis);
    if (!error) {
      hasUsableScopeColumn = true;
      fallbackRows.push(...(data ?? []));
    } else if (!isMissingColumnError(error, "imei_number")) {
      throw error;
    }
  }

  if (!hasUsableScopeColumn) return [];
  return dedupeRows(fallbackRows);
}

async function fetchRawSensorRows(args: {
  vehicleIds?: string[];
  vehicleImeis?: string[];
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { vehicleIds, vehicleImeis, startDate, endDate } = args;
  const scopeVehicleIds = (vehicleIds ?? []).filter(Boolean);
  const scopeVehicleImeis = (vehicleImeis ?? []).filter(Boolean);
  const hasScopedFilter = vehicleIds !== undefined || vehicleImeis !== undefined;
  if (hasScopedFilter && scopeVehicleIds.length === 0 && scopeVehicleImeis.length === 0) {
    return [];
  }

  for (const timeColumn of ["date", "timestamp", "created_at"]) {
    const applyTimeRange = (query: any) => {
      if (startDate) query = query.gte(timeColumn, startDate);
      if (endDate) query = query.lte(timeColumn, endDate);
      return query.order(timeColumn, { ascending: true });
    };

    if (!hasScopedFilter) {
      const { data, error } = await applyTimeRange(supabaseAdmin.from("raw_sensor_data").select("*"));
      if (!error) return data ?? [];
      if (isMissingColumnError(error, timeColumn)) continue;
      throw error;
    }

    let hasUsableScopeColumn = false;
    let missingTimeColumn = false;
    const rows: any[] = [];

    if (scopeVehicleIds.length > 0) {
      const { data, error } = await applyTimeRange(
        supabaseAdmin.from("raw_sensor_data").select("*").in("vehicle_id", scopeVehicleIds)
      );
      if (!error) {
        hasUsableScopeColumn = true;
        rows.push(...(data ?? []));
      } else if (isMissingColumnError(error, timeColumn)) {
        missingTimeColumn = true;
      } else if (!isMissingColumnError(error, "vehicle_id")) {
        throw error;
      }
    }

    if (missingTimeColumn) continue;

    if (scopeVehicleImeis.length > 0) {
      const { data, error } = await applyTimeRange(
        supabaseAdmin.from("raw_sensor_data").select("*").in("imei_number", scopeVehicleImeis)
      );
      if (!error) {
        hasUsableScopeColumn = true;
        rows.push(...(data ?? []));
      } else if (isMissingColumnError(error, timeColumn)) {
        missingTimeColumn = true;
      } else if (!isMissingColumnError(error, "imei_number")) {
        throw error;
      }
    }

    if (missingTimeColumn) continue;
    if (hasUsableScopeColumn) return dedupeRows(rows);
  }

  const fetchFallbackRows = async (column: "vehicle_id" | "imei_number", values: string[]) => {
    let { data, error } = await supabaseAdmin
      .from("raw_sensor_data")
      .select("*")
      .in(column, values)
      .order("created_at", { ascending: true });

    if (error && isMissingColumnError(error, "created_at")) {
      const fallback = await supabaseAdmin.from("raw_sensor_data").select("*").in(column, values);
      data = fallback.data;
      error = fallback.error;
    }

    return { data, error };
  };

  if (!hasScopedFilter) {
    let { data, error } = await supabaseAdmin
      .from("raw_sensor_data")
      .select("*")
      .order("created_at", { ascending: true });
    if (error && isMissingColumnError(error, "created_at")) {
      const fallback = await supabaseAdmin.from("raw_sensor_data").select("*");
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    return data ?? [];
  }

  const fallbackRows: any[] = [];
  let hasUsableScopeColumn = false;

  if (scopeVehicleIds.length > 0) {
    const { data, error } = await fetchFallbackRows("vehicle_id", scopeVehicleIds);
    if (!error) {
      hasUsableScopeColumn = true;
      fallbackRows.push(...(data ?? []));
    } else if (!isMissingColumnError(error, "vehicle_id")) {
      throw error;
    }
  }

  if (scopeVehicleImeis.length > 0) {
    const { data, error } = await fetchFallbackRows("imei_number", scopeVehicleImeis);
    if (!error) {
      hasUsableScopeColumn = true;
      fallbackRows.push(...(data ?? []));
    } else if (!isMissingColumnError(error, "imei_number")) {
      throw error;
    }
  }

  if (!hasUsableScopeColumn) return [];
  return dedupeRows(fallbackRows);
}

function normalizeMovementRows(rows: any[]) {
  return rows.map((row) => ({
    report_date: row.report_date,
    vehicle_id: row.vehicle_id,
    source_imei: row.source_imei,
    company_name: row.client_name || "Teletrac Fuel",
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

  const buildBaseQuery = (tableName: string) => {
    let query = supabaseAdmin
      .from(tableName)
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

  let lastMissingTableError: any = null;

  for (const tableName of TRIP_REPORT_TABLE_CANDIDATES) {
    let query = buildBaseQuery(tableName);
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
      let fallbackQuery = buildBaseQuery(tableName);
      if (filters.registrationNumber) {
        fallbackQuery = fallbackQuery.eq("registration_number", filters.registrationNumber);
      }
      const fallback = await fallbackQuery;
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      if (isMissingRelationError(error, tableName)) {
        lastMissingTableError = error;
        continue;
      }
      throw error;
    }

    return normalizeMovementRows(data ?? []);
  }

  if (lastMissingTableError) throw lastMissingTableError;
  return [];
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
  const companyName = movementRows.find((row) => row?.company_name)?.company_name || "Teletrac Fuel";

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

  return {
    rows: [],
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
        fuel: toOptionalNumber(row.af ?? row.fuel ?? row.rf),
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

  if (!isOriginAllowed(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, origin);
  }

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

    if (req.method === "GET" && route === "/api/settings/branding/logo") {
      const requestedClientId = parseStringParam(url.searchParams.get("clientId") ?? url.searchParams.get("client_id"));
      const resolved = resolveBrandingClientId(auth, requestedClientId);
      if (resolved.error) {
        return jsonResponse({ error: resolved.error }, resolved.status ?? 403, origin);
      }

      if (!resolved.clientId) {
        return jsonResponse(
          {
            clientId: null,
            logoUrl: null,
            updatedAt: null,
            requiresClientSelection: true,
          },
          200,
          origin
        );
      }

      try {
        const logo = await fetchBrandingLogo(resolved.clientId);
        return jsonResponse(
          {
            clientId: resolved.clientId,
            logoUrl: logo.logoUrl,
            updatedAt: logo.updatedAt,
            requiresClientSelection: false,
          },
          200,
          origin
        );
      } catch (error: any) {
        return jsonResponse({ error: error?.message || "Failed to fetch branding logo" }, 500, origin);
      }
    }

    if (req.method === "POST" && route === "/api/settings/branding/logo") {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return jsonResponse({ error: "Invalid multipart form data" }, 400, origin);
      }

      const uploaded = formData.get("file");
      if (!(uploaded instanceof File)) {
        return jsonResponse({ error: "Logo file is required." }, 400, origin);
      }

      if (!ALLOWED_BRANDING_MIME_TYPES.has(uploaded.type)) {
        return jsonResponse({ error: "Unsupported logo format. Use PNG, JPG, WEBP, or SVG." }, 400, origin);
      }

      if (uploaded.size > BRANDING_LOGO_MAX_BYTES) {
        return jsonResponse({ error: "Logo must be 2MB or smaller." }, 400, origin);
      }

      const requestedClientId = parseStringParam(
        String(formData.get("clientId") ?? formData.get("client_id") ?? "")
      );
      const resolved = resolveBrandingClientId(auth, requestedClientId);
      if (resolved.error) {
        return jsonResponse({ error: resolved.error }, resolved.status ?? 403, origin);
      }
      if (!resolved.clientId) {
        return jsonResponse({ error: "Select a specific client before uploading a logo." }, 400, origin);
      }

      try {
        await ensureBrandingBucket();
        const fileBytes = new Uint8Array(await uploaded.arrayBuffer());
        const { error: uploadError } = await supabaseAdmin.storage
          .from(BRANDING_LOGO_BUCKET)
          .upload(brandingObjectPath(resolved.clientId), fileBytes, {
            upsert: true,
            contentType: uploaded.type,
            cacheControl: "3600",
          });
        if (uploadError) throw uploadError;

        const logo = await fetchBrandingLogo(resolved.clientId);
        return jsonResponse(
          {
            clientId: resolved.clientId,
            logoUrl: logo.logoUrl,
            updatedAt: logo.updatedAt,
            requiresClientSelection: false,
          },
          200,
          origin
        );
      } catch (error: any) {
        return jsonResponse({ error: error?.message || "Failed to upload branding logo" }, 400, origin);
      }
    }

    if (req.method === "DELETE" && route === "/api/settings/branding/logo") {
      const requestedClientId = parseStringParam(url.searchParams.get("clientId") ?? url.searchParams.get("client_id"));
      const resolved = resolveBrandingClientId(auth, requestedClientId);
      if (resolved.error) {
        return jsonResponse({ error: resolved.error }, resolved.status ?? 403, origin);
      }
      if (!resolved.clientId) {
        return jsonResponse({ error: "Select a specific client before resetting a logo." }, 400, origin);
      }

      try {
        await ensureBrandingBucket();
        const { error: removeError } = await supabaseAdmin.storage
          .from(BRANDING_LOGO_BUCKET)
          .remove([brandingObjectPath(resolved.clientId)]);
        if (removeError) throw removeError;

        return jsonResponse(
          {
            clientId: resolved.clientId,
            logoUrl: null,
            updatedAt: null,
            requiresClientSelection: false,
          },
          200,
          origin
        );
      } catch (error: any) {
        return jsonResponse({ error: error?.message || "Failed to reset branding logo" }, 400, origin);
      }
    }

    if (req.method === "GET" && route === "/api/admin/clients") {
      const adminGuard = requireAdmin(auth, origin);
      if (adminGuard) return adminGuard;

      try {
        await syncClientsFromVehicles();
        const clients = await getClientsUsedByVehicles();
        return jsonResponse(clients, 200, origin);
      } catch (error: any) {
        return jsonResponse({ error: error?.message || "Failed to fetch clients" }, 500, origin);
      }
    }

    if (req.method === "POST" && route === "/api/admin/clients") {
      const adminGuard = requireAdmin(auth, origin);
      if (adminGuard) return adminGuard;

      return jsonResponse(
        {
          error:
            "Manual client creation is disabled. Clients are auto-created from unique vehicle client names.",
        },
        405,
        origin
      );
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

    if (req.method === "POST" && route === "/api/admin/users") {
      const adminGuard = requireAdmin(auth, origin);
      if (adminGuard) return adminGuard;

      const body = await req.json().catch(() => null);
      const email = parseStringParam(body?.email ?? null);
      const password = parseStringParam(body?.password ?? null);
      const roleInput = parseStringParam(body?.role ?? null);
      const displayName = parseStringParam(body?.displayName ?? body?.display_name ?? null);
      const role = roleInput === "admin" ? "admin" : "client";

      const rawClientIds = Array.isArray(body?.clientIds)
        ? body.clientIds
        : Array.isArray(body?.client_ids)
          ? body.client_ids
          : [];
      const clientIds: string[] = Array.from(
        new Set(rawClientIds.map((value: any) => String(value)).filter(Boolean))
      );

      if (!email || !password) {
        return jsonResponse({ error: "Email and password are required" }, 400, origin);
      }

      const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createUserError || !createdUser?.user) {
        return jsonResponse({ error: createUserError?.message || "Failed to create user" }, 500, origin);
      }

      const userId = createdUser.user.id;

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          [
            {
              id: userId,
              role,
              display_name: displayName || email,
            },
          ],
          { onConflict: "id" }
        );
      if (profileError) return jsonResponse({ error: profileError.message }, 500, origin);

      if (clientIds.length > 0) {
        const assignmentRows = clientIds.map((clientId: string) => ({
          user_id: userId,
          client_id: clientId,
        }));

        const { error: assignmentError } = await supabaseAdmin.from("client_users").insert(assignmentRows);
        if (assignmentError) return jsonResponse({ error: assignmentError.message }, 500, origin);
      }

      return jsonResponse({ id: userId, email }, 201, origin);
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

    if (req.method === "POST" && route === "/api/admin/assignments") {
      const adminGuard = requireAdmin(auth, origin);
      if (adminGuard) return adminGuard;

      const body = await req.json().catch(() => null);
      const userId = parseStringParam(body?.userId ?? body?.user_id ?? null);
      const clientId = parseStringParam(body?.clientId ?? body?.client_id ?? null);

      if (!userId || !clientId) {
        return jsonResponse({ error: "userId and clientId are required" }, 400, origin);
      }

      const { data, error } = await supabaseAdmin
        .from("client_users")
        .insert([{ user_id: userId, client_id: clientId }])
        .select("id, user_id, client_id")
        .single();

      if (error) {
        if ((error as any)?.code === "23505") {
          return jsonResponse({ error: "Assignment already exists" }, 409, origin);
        }
        return jsonResponse({ error: error.message }, 500, origin);
      }

      return jsonResponse(data, 201, origin);
    }

    const assignmentIdMatch = route.match(/^\/api\/admin\/assignments\/([^/]+)$/);
    if (req.method === "DELETE" && assignmentIdMatch) {
      const adminGuard = requireAdmin(auth, origin);
      if (adminGuard) return adminGuard;

      const assignmentId = decodeURIComponent(assignmentIdMatch[1]);
      const { error } = await supabaseAdmin.from("client_users").delete().eq("id", assignmentId);
      if (error) return jsonResponse({ error: error.message }, 500, origin);

      return emptyResponse(204, origin);
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

      const vehicles = (data ?? [])
        .map(mapVehicleRow)
        .filter(hasFuelTankCapacity);
      return jsonResponse(vehicles, 200, origin);
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
      if (!hasFuelTankCapacity(mapVehicleRow(vehicle))) {
        return jsonResponse({ error: "Vehicle not found" }, 404, origin);
      }

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

    if (req.method === "GET" && route === "/api/raw-sensor-data") {
      const requestedVehicleIds = parseRequestedVehicleIds(url);
      const scoped = await getScopedVehicleIds(url, auth, requestedVehicleIds);
      if (!scoped.ok) return jsonResponse({ error: scoped.error }, scoped.status, origin);

      const startDate = parseIsoDate(url.searchParams.get("startDate") ?? url.searchParams.get("start_date"));
      const endDate = parseIsoDate(url.searchParams.get("endDate") ?? url.searchParams.get("end_date"));

      const rows = await fetchRawSensorRows({
        vehicleIds: scoped.vehicleIds,
        vehicleImeis: scoped.vehicleImeis,
        startDate,
        endDate,
      });

      const imeiToVehicleId = new Map<string, string>();
      for (const ref of scoped.vehicleRefs ?? []) {
        if (!ref.imei) continue;
        imeiToVehicleId.set(ref.imei, ref.id);
      }

      const rowsWithVehicleId = rows.map((row: any) => {
        if (row?.vehicle_id) return row;
        const normalizedImei = normalizeImeiValue(row?.imei_number);
        if (!normalizedImei) return row;
        const vehicleId = imeiToVehicleId.get(normalizedImei);
        if (!vehicleId) return row;
        return { ...row, vehicle_id: vehicleId };
      });

      return jsonResponse(rowsWithVehicleId.map(mapRawSensorRow), 200, origin);
    }

    if (req.method === "GET" && route === "/api/daily-metrics") {
      const requestedVehicleIds = parseRequestedVehicleIds(url);
      const scoped = await getScopedVehicleIds(url, auth, requestedVehicleIds);
      if (!scoped.ok) return jsonResponse({ error: scoped.error }, scoped.status, origin);

      const startDate = parseIsoDate(url.searchParams.get("startDate") ?? url.searchParams.get("start_date"));
      const endDate = parseIsoDate(url.searchParams.get("endDate") ?? url.searchParams.get("end_date"));

      const rows = await fetchDailyMetricsRows({
        vehicleIds: scoped.vehicleIds,
        vehicleImeis: scoped.vehicleImeis,
        startDate,
        endDate,
      });

      const imeiToVehicleId = new Map<string, string>();
      for (const ref of scoped.vehicleRefs ?? []) {
        if (!ref.imei) continue;
        imeiToVehicleId.set(ref.imei, ref.id);
      }

      const rowsWithVehicleId = rows.map((row: any) => {
        if (row?.vehicle_id) return row;
        const normalizedImei = normalizeImeiValue(row?.imei_number);
        if (!normalizedImei) return row;
        const vehicleId = imeiToVehicleId.get(normalizedImei);
        if (!vehicleId) return row;
        return { ...row, vehicle_id: vehicleId };
      });

      return jsonResponse(rowsWithVehicleId.map(mapDailyMetricRow), 200, origin);
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
      const vehicleImeis = Array.from(
        new Set(
          scopedVehicles
            .map((vehicle: any) => normalizeImeiValue(vehicle?.imei))
            .filter((value: string | null): value is string => Boolean(value))
        )
      );

      const startDate = parseIsoDate(url.searchParams.get("startDate") ?? url.searchParams.get("start_date"));
      const endDate = parseIsoDate(url.searchParams.get("endDate") ?? url.searchParams.get("end_date"));

      const fuelEvents = await fetchFuelEventsRows({
        vehicleIds,
        startDate,
        endDate,
      });

      const dailyMetricRows = await fetchDailyMetricsRows({
        vehicleIds,
        vehicleImeis,
        startDate,
        endDate,
      });
      const dailyMetrics = dailyMetricRows.map(mapDailyMetricRow);

      const totalVehicles = scopedVehicles.length;
      const activeVehicles = scopedVehicles.filter((vehicle: any) =>
        vehicle.status === "Active" || vehicle.last_ignition_on === true
      ).length;
      const totalFuelUsed = dailyMetrics.reduce(
        (sum: number, metric: any) => sum + toNumber(metric.totalFuelConsumed),
        0
      );
      const totalDistance = dailyMetrics.reduce(
        (sum: number, metric: any) => sum + toNumber(metric.totalDistanceTraveled),
        0
      );
      const totalEngineHours = dailyMetrics.reduce(
        (sum: number, metric: any) => sum + toNumber(metric.totalEngineHours),
        0
      );
      const consumptionLPerKm = totalDistance > 0 ? totalFuelUsed / totalDistance : null;

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
          consumptionLPerKm,
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
