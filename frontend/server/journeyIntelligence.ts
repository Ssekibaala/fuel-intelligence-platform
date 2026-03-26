import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabase";
import { storage } from "./storage";

const MOVEMENT_REPORT_TABLES = ["trip_reports", "daily_movement_reports"] as const;
const PAGE_SIZE = 1000;

type JourneyClientScope = {
  isAdmin: boolean;
  clientIds?: string[];
};

type JourneyAnalysisFilters = {
  departureLocation: string;
  destinationLocation: string;
  routePattern?: "round_trip" | "one_way";
  startDate?: string;
  endDate?: string;
  startDay?: string;
  endDay?: string;
  clientIds?: string[];
  vehicleIds?: string[];
  skipAvailabilityLookup?: boolean;
};

type MovementRow = {
  id: string;
  client_id: string | null;
  vehicle_id: string | null;
  asset_description: string | null;
  registration_number: string | null;
  departure_time: string | null;
  departure_date: string | null;
  departed_from: string | null;
  driving_time: string | null;
  distance_km: number | string | null;
  max_speed_kmh: number | null;
  arrival_time: string | null;
  arrived_at: string | null;
  fuel_used_litres: number | string | null;
  report_date: string | null;
};

type LocationSuggestion = {
  location: string;
  normalizedLocation: string;
  usageCount: number;
  lastSeenAt: string | null;
};

type RouteOccurrence = {
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
};

type IncompleteOccurrence = {
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
};

type JourneySavedRoute = {
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
};

type JourneyAnalysisResult = {
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
  occurrences: RouteOccurrence[];
  incompleteOccurrences: IncompleteOccurrence[];
  vehiclePerformance: Array<{
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
  }>;
  trends: Array<{
    dateKey: string;
    tripCount: number;
    totalDistanceKm: number;
    totalFuelUsedLitres: number;
    averageDurationHours: number;
    averageRouteEfficiency: number;
  }>;
  exceptions: Array<{
    type: "incomplete_return" | "high_fuel" | "long_duration" | "long_dwell";
    occurrenceId?: string;
    vehicleLabel: string;
    message: string;
    departureTime: string;
  }>;
};

function parseStringParam(value: unknown): string | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw).trim();
  return text.length > 0 ? text : undefined;
}

function parseStringListParam(value: unknown): string[] | undefined {
  if (!value) return undefined;
  const rawList = Array.isArray(value) ? value : [value];
  const items = rawList
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (items.length === 0) return undefined;
  return Array.from(new Set(items));
}

function parseDayKey(value: unknown): string | undefined {
  const parsed = parseStringParam(value);
  if (!parsed) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : undefined;
}

function parseDate(value: unknown): Date | undefined {
  const parsed = parseStringParam(value);
  if (!parsed) return undefined;
  const date = new Date(parsed);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getRequestedClientId(req: Request): string | undefined {
  return parseStringParam(req.query.clientId || req.query.client_id);
}

function getJourneyClientScope(req: Request, res: Response): JourneyClientScope | null {
  const isAdmin = req.auth?.profile?.role === "admin";
  const requestedClientId = getRequestedClientId(req);

  if (isAdmin) {
    return {
      isAdmin,
      clientIds: requestedClientId ? [requestedClientId] : undefined,
    };
  }

  const clientIds = req.auth?.clientIds || [];
  if (clientIds.length === 0) {
    res.status(403).json({ error: "No client assigned" });
    return null;
  }

  if (requestedClientId) {
    if (!clientIds.includes(requestedClientId)) {
      res.status(403).json({ error: "Requested client is not assigned to this user" });
      return null;
    }

    return { isAdmin, clientIds: [requestedClientId] };
  }

  return { isAdmin, clientIds };
}

function isMissingRelationError(error: any, tableName: string): boolean {
  const code = String(error?.code ?? "");
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return code === "42P01" || (message.includes("relation") && message.includes(tableName.toLowerCase()) && message.includes("does not exist"));
}

function normalizeLocation(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function locationMatches(actual: string | null | undefined, expected: string): boolean {
  return normalizeLocation(actual || "") === normalizeLocation(expected);
}

function isMeaningfulDepartureFrom(row: MovementRow, originLocation: string): boolean {
  if (!locationMatches(row.departed_from, originLocation)) return false;
  const arrivalLocation = String(row.arrived_at || "").trim();
  if (!arrivalLocation) return false;
  return !locationMatches(arrivalLocation, originLocation);
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDurationHours(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;

  const hhmmss = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmmss) {
    const hours = Number(hhmmss[1] || 0);
    const minutes = Number(hhmmss[2] || 0);
    const seconds = Number(hhmmss[3] || 0);
    return hours + minutes / 60 + seconds / 3600;
  }

  let totalHours = 0;
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*day/i);
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h(?:our|r)?/i);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*m(?:in|inute)?/i);
  const secondMatch = text.match(/(\d+(?:\.\d+)?)\s*s(?:ec|econd)?/i);

  if (dayMatch) totalHours += Number(dayMatch[1]) * 24;
  if (hourMatch) totalHours += Number(hourMatch[1]);
  if (minuteMatch) totalHours += Number(minuteMatch[1]) / 60;
  if (secondMatch) totalHours += Number(secondMatch[1]) / 3600;

  return totalHours > 0 ? totalHours : null;
}

function buildDateWindow(filters: JourneyAnalysisFilters) {
  const startDay = parseDayKey(filters.startDay);
  const endDay = parseDayKey(filters.endDay);
  const startDate = parseDate(filters.startDate);
  const endDate = parseDate(filters.endDate);

  if (startDay || endDay) {
    const safeStartDay = startDay || endDay!;
    const safeEndDay = endDay || startDay!;
    const start = new Date(`${safeStartDay}T00:00:00.000Z`);
    const endExclusive = new Date(`${safeEndDay}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return {
      startIso: start.toISOString(),
      endIso: endExclusive.toISOString(),
      startDate: start,
      endExclusive,
    };
  }

  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date();
  const startFloor = new Date(start);
  startFloor.setUTCHours(0, 0, 0, 0);
  const endExclusive = new Date(end);
  endExclusive.setUTCHours(0, 0, 0, 0);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    startIso: startFloor.toISOString(),
    endIso: endExclusive.toISOString(),
    startDate: startFloor,
    endExclusive,
  };
}

async function fetchMovementRowsByDirection(params: {
  departureLocation: string;
  destinationLocation: string;
  startIso: string;
  endIso: string;
  clientIds?: string[];
  vehicleIds?: string[];
}): Promise<MovementRow[]> {
  let lastMissingTableError: any = null;

  for (const tableName of MOVEMENT_REPORT_TABLES) {
    let offset = 0;
    const rows: MovementRow[] = [];

    while (true) {
      let query = supabaseAdmin
        .from(tableName)
        .select(
          "id, client_id, vehicle_id, asset_description, registration_number, departure_time, departure_date, departed_from, driving_time, distance_km, max_speed_kmh, arrival_time, arrived_at, fuel_used_litres, report_date"
        )
        .gte("report_date", params.startIso)
        .lt("report_date", params.endIso)
        .eq("departed_from", params.departureLocation)
        .eq("arrived_at", params.destinationLocation)
        .order("vehicle_id", { ascending: true })
        .order("departure_time", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (params.clientIds?.length) {
        query = query.in("client_id", params.clientIds);
      }

      if (params.vehicleIds?.length) {
        query = query.in("vehicle_id", params.vehicleIds);
      }

      const { data, error } = await query;
      if (error) {
        if (isMissingRelationError(error, tableName)) {
          lastMissingTableError = error;
          break;
        }
        throw error;
      }

      const page = (data || []) as MovementRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) {
        return rows;
      }

      offset += PAGE_SIZE;
    }
  }

  if (lastMissingTableError) throw lastMissingTableError;
  return [];
}

async function fetchMovementRowsForScope(params: {
  startIso: string;
  endIso: string;
  clientIds?: string[];
  vehicleIds?: string[];
}): Promise<MovementRow[]> {
  let lastMissingTableError: any = null;

  for (const tableName of MOVEMENT_REPORT_TABLES) {
    let offset = 0;
    const rows: MovementRow[] = [];

    while (true) {
      let query = supabaseAdmin
        .from(tableName)
        .select(
          "id, client_id, vehicle_id, asset_description, registration_number, departure_time, departure_date, departed_from, driving_time, distance_km, max_speed_kmh, arrival_time, arrived_at, fuel_used_litres, report_date"
        )
        .gte("report_date", params.startIso)
        .lt("report_date", params.endIso)
        .not("departure_time", "is", null)
        .not("arrival_time", "is", null)
        .order("vehicle_id", { ascending: true })
        .order("departure_time", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (params.clientIds?.length) {
        query = query.in("client_id", params.clientIds);
      }

      if (params.vehicleIds?.length) {
        query = query.in("vehicle_id", params.vehicleIds);
      }

      const { data, error } = await query;
      if (error) {
        if (isMissingRelationError(error, tableName)) {
          lastMissingTableError = error;
          break;
        }
        throw error;
      }

      const page = (data || []) as MovementRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) {
        return rows;
      }

      offset += PAGE_SIZE;
    }
  }

  if (lastMissingTableError) throw lastMissingTableError;
  return [];
}

async function queryLocationColumn(params: {
  column: "departed_from" | "arrived_at";
  q?: string;
  clientIds?: string[];
}): Promise<Array<{ location: string; reportDate: string | null }>> {
  let lastMissingTableError: any = null;

  for (const tableName of MOVEMENT_REPORT_TABLES) {
    let query = supabaseAdmin
      .from(tableName)
      .select(`${params.column}, report_date`)
      .not(params.column, "is", null)
      .order("report_date", { ascending: false })
      .limit(25);

    if (params.clientIds?.length) {
      query = query.in("client_id", params.clientIds);
    }

    if (params.q) {
      query = query.ilike(params.column, `%${params.q}%`);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingRelationError(error, tableName)) {
        lastMissingTableError = error;
        continue;
      }
      throw error;
    }

    return (data || [])
      .map((row: any) => ({
        location: String(row?.[params.column] || "").trim(),
        reportDate: row?.report_date || null,
      }))
      .filter((row) => row.location.length > 0);
  }

  if (lastMissingTableError) throw lastMissingTableError;
  return [];
}

function sumDailyContext(params: {
  vehicleId: string | null;
  startDay: string;
  endDay: string;
  metrics: Array<{
    vehicleId: string | null;
    metricDate: Date;
    totalFuelConsumed: number;
    totalDistanceTraveled: number;
    totalEngineHours: number;
    idleTimeHours: number;
    numberOfRefills: number;
    numberOfThefts: number;
  }>;
}) {
  if (!params.vehicleId) {
    return {
      contextualFuelUsedLitres: 0,
      contextualDistanceKm: 0,
      contextualEngineHours: 0,
      contextualIdleHours: 0,
      contextualRefills: 0,
      contextualDrains: 0,
    };
  }

  return params.metrics.reduce(
    (acc, metric) => {
      if (metric.vehicleId !== params.vehicleId) return acc;
      const dateKey = toDayKey(metric.metricDate);
      if (dateKey < params.startDay || dateKey > params.endDay) return acc;

      acc.contextualFuelUsedLitres += Number(metric.totalFuelConsumed || 0);
      acc.contextualDistanceKm += Number(metric.totalDistanceTraveled || 0);
      acc.contextualEngineHours += Number(metric.totalEngineHours || 0);
      acc.contextualIdleHours += Number(metric.idleTimeHours || 0);
      acc.contextualRefills += Number(metric.numberOfRefills || 0);
      acc.contextualDrains += Number(metric.numberOfThefts || 0);
      return acc;
    },
    {
      contextualFuelUsedLitres: 0,
      contextualDistanceKm: 0,
      contextualEngineHours: 0,
      contextualIdleHours: 0,
      contextualRefills: 0,
      contextualDrains: 0,
    }
  );
}

function mapSavedRouteRow(row: any): JourneySavedRoute {
  return {
    id: String(row.id),
    clientId: row.client_id ? String(row.client_id) : null,
    name: String(row.name || "").trim(),
    departureLocation: String(row.departure_location || "").trim(),
    destinationLocation: String(row.destination_location || "").trim(),
    filters: row.filters_json && typeof row.filters_json === "object" ? row.filters_json : {},
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    isArchived: Boolean(row.is_archived),
  };
}

export async function listJourneyLocations(params: {
  q?: string;
  clientIds?: string[];
}): Promise<LocationSuggestion[]> {
  const q = params.q?.trim();
  const [departureMatches, arrivalMatches] = await Promise.all([
    queryLocationColumn({ column: "departed_from", q, clientIds: params.clientIds }),
    queryLocationColumn({ column: "arrived_at", q, clientIds: params.clientIds }),
  ]);

  const merged = new Map<string, LocationSuggestion>();
  [...departureMatches, ...arrivalMatches].forEach((row) => {
    const normalized = normalizeLocation(row.location);
    if (!normalized) return;

    const current = merged.get(normalized) ?? {
      location: row.location,
      normalizedLocation: normalized,
      usageCount: 0,
      lastSeenAt: null,
    };

    current.usageCount += 1;
    if (!current.lastSeenAt || (row.reportDate && row.reportDate > current.lastSeenAt)) {
      current.location = row.location;
      current.lastSeenAt = row.reportDate;
    }
    merged.set(normalized, current);
  });

  return Array.from(merged.values())
    .sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      if ((b.lastSeenAt || "") !== (a.lastSeenAt || "")) return (b.lastSeenAt || "").localeCompare(a.lastSeenAt || "");
      return a.location.localeCompare(b.location);
    })
    .slice(0, 10);
}

export async function analyzeJourneyRoute(filters: JourneyAnalysisFilters): Promise<JourneyAnalysisResult> {
  const departureLocation = filters.departureLocation.trim();
  const destinationLocation = filters.destinationLocation.trim();
  const routePattern = filters.routePattern || "round_trip";
  const finalLocation = routePattern === "round_trip" ? departureLocation : destinationLocation;
  if (!departureLocation || !destinationLocation) {
    throw new Error("Departure and destination locations are required.");
  }
  if (normalizeLocation(departureLocation) === normalizeLocation(destinationLocation)) {
    throw new Error("Departure and destination must be different locations.");
  }

  const { startIso, endIso, startDate, endExclusive } = buildDateWindow(filters);
  const movementRows = await fetchMovementRowsForScope({
    startIso,
    endIso,
    clientIds: filters.clientIds,
    vehicleIds: filters.vehicleIds,
  });

  const vehicleIds = Array.from(
    new Set(
      movementRows
        .map((row) => row.vehicle_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [vehicles, dailyMetrics] = await Promise.all([
    vehicleIds.length ? storage.getVehicles({ vehicleIds }) : Promise.resolve([]),
    vehicleIds.length
      ? storage.getDailyMetrics({
          vehicleIds,
          startDate,
          endDate: new Date(endExclusive.getTime() - 1),
          startDay: toDayKey(startDate),
          endDay: toDayKey(new Date(endExclusive.getTime() - 1)),
        })
      : Promise.resolve([]),
  ]);

  const vehicleLabelLookup = new Map<string, { label: string; registrationNumber: string | null }>();
  vehicles.forEach((vehicle) => {
    vehicleLabelLookup.set(vehicle.id, {
      label: vehicle.vehiclePlate || vehicle.assetId || vehicle.id,
      registrationNumber: vehicle.vehiclePlate || null,
    });
  });

  const candidateLegs = movementRows
    .filter((row) => parseIso(row.departure_time) && parseIso(row.arrival_time))
    .sort((a, b) => {
      const vehicleA = `${a.vehicle_id || ""}|${a.registration_number || ""}|${a.asset_description || ""}`;
      const vehicleB = `${b.vehicle_id || ""}|${b.registration_number || ""}|${b.asset_description || ""}`;
      if (vehicleA !== vehicleB) return vehicleA.localeCompare(vehicleB);
      return (a.departure_time || "").localeCompare(b.departure_time || "");
    });

  const legsByVehicle = candidateLegs.reduce((map, row) => {
    const vehicleKey = String(row.vehicle_id || row.registration_number || row.asset_description || row.id);
    const current = map.get(vehicleKey) || [];
    current.push(row);
    map.set(vehicleKey, current);
    return map;
  }, new Map<string, MovementRow[]>());

  const occurrences: RouteOccurrence[] = [];
  const incomplete: IncompleteOccurrence[] = [];

  legsByVehicle.forEach((vehicleRows, vehicleKey) => {
    for (let startIndex = 0; startIndex < vehicleRows.length; startIndex += 1) {
      const initialRow = vehicleRows[startIndex];
      if (!locationMatches(initialRow.departed_from, departureLocation)) continue;

      const scanStartDeparture = parseIso(initialRow.departure_time);
      if (!scanStartDeparture) continue;

      let destinationArrivalIndex = -1;
      for (let i = startIndex; i < vehicleRows.length; i += 1) {
        const arrival = parseIso(vehicleRows[i].arrival_time);
        if (!arrival || arrival.getTime() < scanStartDeparture.getTime()) continue;
        if (locationMatches(vehicleRows[i].arrived_at, destinationLocation)) {
          destinationArrivalIndex = i;
          break;
        }
      }

      if (destinationArrivalIndex === -1) continue;

      let actualStartIndex = -1;
      for (let i = startIndex; i <= destinationArrivalIndex; i += 1) {
        if (isMeaningfulDepartureFrom(vehicleRows[i], departureLocation)) {
          actualStartIndex = i;
        }
      }

      if (actualStartIndex === -1) {
        startIndex = destinationArrivalIndex;
        continue;
      }

      const startRow = vehicleRows[actualStartIndex];
      const outboundDeparture = parseIso(startRow.departure_time);
      if (!outboundDeparture) {
        startIndex = destinationArrivalIndex;
        continue;
      }

      const destinationArrivalRow = vehicleRows[destinationArrivalIndex];
      const destinationArrival = parseIso(destinationArrivalRow.arrival_time)!;

      let finalArrivalIndex = destinationArrivalIndex;
      if (routePattern !== "one_way") {
        finalArrivalIndex = -1;
        for (let i = destinationArrivalIndex + 1; i < vehicleRows.length; i += 1) {
          const arrival = parseIso(vehicleRows[i].arrival_time);
          if (!arrival || arrival.getTime() < destinationArrival.getTime()) continue;
          if (locationMatches(vehicleRows[i].arrived_at, finalLocation)) {
            finalArrivalIndex = i;
            break;
          }
        }

        if (finalArrivalIndex === -1) {
          const vehicleId = startRow.vehicle_id || null;
          const vehicleLookup = vehicleId ? vehicleLabelLookup.get(vehicleId) : null;
          incomplete.push({
            id: `${routePattern}:${vehicleKey}:${startRow.id}`,
            routePattern,
            vehicleId,
            vehicleKey,
            vehicleLabel:
              vehicleLookup?.label || startRow.registration_number || startRow.asset_description || vehicleKey,
            registrationNumber: startRow.registration_number || null,
            departureLocation,
            destinationLocation,
            departureTime: outboundDeparture.toISOString(),
            destinationArrivalTime: destinationArrival.toISOString(),
            routeDistanceKm: vehicleRows
              .slice(actualStartIndex, destinationArrivalIndex + 1)
              .reduce((sum, row) => sum + toNumber(row.distance_km), 0),
            routeFuelUsedLitres: vehicleRows
              .slice(actualStartIndex, destinationArrivalIndex + 1)
              .reduce((sum, row) => sum + toNumber(row.fuel_used_litres), 0),
          });
          startIndex = destinationArrivalIndex;
          continue;
        }
      }

      const finalArrivalRow = vehicleRows[finalArrivalIndex];
      const finalArrival = parseIso(finalArrivalRow.arrival_time)!;
      let lastDepartureFromB: Date | null = null;

      if (routePattern !== "one_way") {
        for (let i = destinationArrivalIndex + 1; i <= finalArrivalIndex; i += 1) {
          const departure = parseIso(vehicleRows[i].departure_time);
          if (!departure || departure.getTime() < destinationArrival.getTime()) continue;
          if (isMeaningfulDepartureFrom(vehicleRows[i], destinationLocation)) {
            lastDepartureFromB = departure;
          }
        }
      }

      const segmentRows = vehicleRows.slice(actualStartIndex, finalArrivalIndex + 1);
      const contextStartDay = toDayKey(outboundDeparture);
      const contextEndDay = toDayKey(finalArrival);
      const vehicleId = startRow.vehicle_id || finalArrivalRow.vehicle_id || null;
      const vehicleLookup = vehicleId ? vehicleLabelLookup.get(vehicleId) : null;
      const vehicleLabel =
        vehicleLookup?.label ||
        startRow.registration_number ||
        startRow.asset_description ||
        finalArrivalRow.registration_number ||
        finalArrivalRow.asset_description ||
        vehicleKey;

      const contextMetrics = sumDailyContext({
        vehicleId,
        startDay: contextStartDay,
        endDay: contextEndDay,
        metrics: dailyMetrics,
      });

      const routeDistanceKm = segmentRows.reduce((sum, row) => sum + toNumber(row.distance_km), 0);
      const routeFuelUsedLitres = segmentRows.reduce((sum, row) => sum + toNumber(row.fuel_used_litres), 0);
      const routeDrivingHours = segmentRows.reduce((sum, row) => sum + (parseDurationHours(row.driving_time) || 0), 0);
      const maxSpeedKmh = segmentRows.reduce((max, row) => Math.max(max, toNumber(row.max_speed_kmh)), 0) || null;
      const outboundLegDurationHours = (destinationArrival.getTime() - outboundDeparture.getTime()) / 3_600_000;
      const destinationDwellHours =
        routePattern === "one_way"
          ? null
          : lastDepartureFromB && lastDepartureFromB.getTime() > destinationArrival.getTime()
            ? (lastDepartureFromB.getTime() - destinationArrival.getTime()) / 3_600_000
            : null;
      const returnLegDurationHours =
        routePattern === "one_way"
          ? null
          : lastDepartureFromB && finalArrival.getTime() > lastDepartureFromB.getTime()
            ? (finalArrival.getTime() - lastDepartureFromB.getTime()) / 3_600_000
            : null;
      const roundTripDurationHours = (finalArrival.getTime() - outboundDeparture.getTime()) / 3_600_000;

      occurrences.push({
        id: `${routePattern}:${vehicleKey}:${startRow.id}:${finalArrivalRow.id}`,
        routePattern,
        vehicleId,
        vehicleKey,
        vehicleLabel,
        registrationNumber: startRow.registration_number || finalArrivalRow.registration_number || null,
        outboundTripId: String(startRow.id),
        returnTripId: routePattern === "one_way" ? null : String(finalArrivalRow.id),
        departureLocation,
        destinationLocation,
        departureTime: outboundDeparture.toISOString(),
        destinationArrivalTime: destinationArrival.toISOString(),
        returnDepartureTime: lastDepartureFromB ? lastDepartureFromB.toISOString() : null,
        returnArrivalTime: finalArrival.toISOString(),
        outboundLegDurationHours,
        roundTripDurationHours,
        destinationDwellHours,
        returnLegDurationHours,
        routeDistanceKm,
        routeFuelUsedLitres,
        routeEfficiency: routeFuelUsedLitres > 0 ? routeDistanceKm / routeFuelUsedLitres : null,
        routeDrivingHours: routeDrivingHours > 0 ? routeDrivingHours : null,
        maxSpeedKmh,
        contextStartDay,
        contextEndDay,
        ...contextMetrics,
      });

      startIndex = finalArrivalIndex;
    }
  });

  const occurrenceCount = occurrences.length;
  const average = <T extends keyof RouteOccurrence>(key: T) =>
    occurrenceCount > 0
      ? occurrences.reduce((sum, occurrence) => sum + toNumber(occurrence[key]), 0) / occurrenceCount
      : 0;

  const vehiclePerformance = Array.from(
    occurrences.reduce((map, occurrence) => {
      const current = map.get(occurrence.vehicleKey) || {
        vehicleId: occurrence.vehicleId,
        vehicleKey: occurrence.vehicleKey,
        vehicleLabel: occurrence.vehicleLabel,
        registrationNumber: occurrence.registrationNumber,
        routePattern: occurrence.routePattern,
        tripCount: 0,
        distanceSum: 0,
        fuelSum: 0,
        outboundLegSum: 0,
        durationSum: 0,
        dwellSum: 0,
        returnLegSum: 0,
        efficiencySum: 0,
        contextualIdleSum: 0,
        lastDepartureTime: occurrence.departureTime,
      };

      current.tripCount += 1;
      current.distanceSum += occurrence.routeDistanceKm;
      current.fuelSum += occurrence.routeFuelUsedLitres;
      current.outboundLegSum += occurrence.outboundLegDurationHours;
      current.durationSum += occurrence.roundTripDurationHours;
      current.dwellSum += occurrence.destinationDwellHours || 0;
      current.returnLegSum += occurrence.returnLegDurationHours || 0;
      current.efficiencySum += occurrence.routeEfficiency || 0;
      current.contextualIdleSum += occurrence.contextualIdleHours;
      if (occurrence.departureTime > current.lastDepartureTime) {
        current.lastDepartureTime = occurrence.departureTime;
      }
      map.set(occurrence.vehicleKey, current);
      return map;
    }, new Map<string, any>())
  )
    .map(([, value]) => ({
      vehicleId: value.vehicleId,
      vehicleKey: value.vehicleKey,
      vehicleLabel: value.vehicleLabel,
      registrationNumber: value.registrationNumber,
      tripCount: value.tripCount,
      averageDistanceKm: value.distanceSum / value.tripCount,
      averageFuelUsedLitres: value.fuelSum / value.tripCount,
      averageOutboundLegHours: value.outboundLegSum / value.tripCount,
      averageDurationHours: value.durationSum / value.tripCount,
      averageDestinationDwellHours: value.dwellSum / value.tripCount,
      averageReturnLegHours: value.returnLegSum / value.tripCount,
      averageRouteEfficiency: value.efficiencySum / value.tripCount,
      averageContextIdleHours: value.contextualIdleSum / value.tripCount,
      lastDepartureTime: value.lastDepartureTime,
    }))
    .sort((a, b) => {
      if (b.tripCount !== a.tripCount) return b.tripCount - a.tripCount;
      return a.averageRouteEfficiency - b.averageRouteEfficiency;
    });

  const trends = Array.from(
    occurrences.reduce((map, occurrence) => {
      const dateKey = occurrence.departureTime.slice(0, 10);
      const current = map.get(dateKey) || {
        dateKey,
        tripCount: 0,
        totalDistanceKm: 0,
        totalFuelUsedLitres: 0,
        totalDurationHours: 0,
        totalEfficiency: 0,
      };

      current.tripCount += 1;
      current.totalDistanceKm += occurrence.routeDistanceKm;
      current.totalFuelUsedLitres += occurrence.routeFuelUsedLitres;
      current.totalDurationHours += occurrence.roundTripDurationHours;
      current.totalEfficiency += occurrence.routeEfficiency || 0;
      map.set(dateKey, current);
      return map;
    }, new Map<string, any>())
  )
    .map(([, value]) => ({
      dateKey: value.dateKey,
      tripCount: value.tripCount,
      totalDistanceKm: value.totalDistanceKm,
      totalFuelUsedLitres: value.totalFuelUsedLitres,
      averageDurationHours: value.totalDurationHours / value.tripCount,
      averageRouteEfficiency: value.totalEfficiency / value.tripCount,
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const averageFuel = average("routeFuelUsedLitres");
  const averageDuration = average("roundTripDurationHours");
  const averageDwell = average("destinationDwellHours");

  const exceptions: JourneyAnalysisResult["exceptions"] = [
    ...incomplete.map((entry) => ({
      type: "incomplete_return" as const,
      vehicleLabel: entry.vehicleLabel,
      message:
        routePattern === "round_trip"
          ? `${entry.vehicleLabel} reached ${destinationLocation} but has no detected return path to ${departureLocation} in the selected range.`
          : `${entry.vehicleLabel} started from ${departureLocation} but the one-way journey to ${destinationLocation} did not complete in the selected range.`,
      departureTime: entry.departureTime,
    })),
    ...occurrences.flatMap((occurrence) => {
      const items: JourneyAnalysisResult["exceptions"] = [];
      if (averageFuel > 0 && occurrence.routeFuelUsedLitres > averageFuel * 1.25) {
        items.push({
          type: "high_fuel",
          occurrenceId: occurrence.id,
          vehicleLabel: occurrence.vehicleLabel,
          message: `${occurrence.vehicleLabel} used ${occurrence.routeFuelUsedLitres.toFixed(1)} L, materially above the route average.`,
          departureTime: occurrence.departureTime,
        });
      }
      if (averageDuration > 0 && occurrence.roundTripDurationHours > averageDuration * 1.25) {
        items.push({
          type: "long_duration",
          occurrenceId: occurrence.id,
          vehicleLabel: occurrence.vehicleLabel,
          message: `${occurrence.vehicleLabel} took ${occurrence.roundTripDurationHours.toFixed(1)} h, materially longer than the route average.`,
          departureTime: occurrence.departureTime,
        });
      }
      if (averageDwell > 0 && (occurrence.destinationDwellHours || 0) > averageDwell * 1.4) {
        items.push({
          type: "long_dwell",
          occurrenceId: occurrence.id,
          vehicleLabel: occurrence.vehicleLabel,
          message: `${occurrence.vehicleLabel} stayed unusually long at ${destinationLocation} before returning.`,
          departureTime: occurrence.departureTime,
        });
      }
      return items;
    }),
  ]
    .sort((a, b) => b.departureTime.localeCompare(a.departureTime))
    .slice(0, 12);

  let routeAvailability: JourneyAnalysisResult["routeAvailability"] = null;
  if (!filters.skipAvailabilityLookup && occurrenceCount === 0) {
    const broaderStartDate = new Date(endExclusive);
    broaderStartDate.setUTCDate(broaderStartDate.getUTCDate() - 365);

    const broaderAnalysis = await analyzeJourneyRoute({
      ...filters,
      startDate: broaderStartDate.toISOString(),
      endDate: new Date(endExclusive.getTime() - 1).toISOString(),
      startDay: undefined,
      endDay: undefined,
      skipAvailabilityLookup: true,
    });

    if (broaderAnalysis.occurrences.length > 0) {
      const chronologicallySorted = broaderAnalysis.occurrences
        .slice()
        .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
      const firstOccurrence = chronologicallySorted[0];
      const lastOccurrence = chronologicallySorted[chronologicallySorted.length - 1];

      routeAvailability = {
        hasMatchesOutsideSelectedRange: true,
        totalOccurrences: broaderAnalysis.occurrences.length,
        firstDepartureTime: firstOccurrence?.departureTime || null,
        lastArrivalTime: lastOccurrence?.returnArrivalTime || null,
        suggestedStartDate: firstOccurrence?.departureTime || null,
        suggestedEndDate: lastOccurrence?.returnArrivalTime || null,
      };
    }
  }

  return {
    route: {
      routePattern,
      departureLocation,
      destinationLocation,
      startDate: startDate.toISOString(),
      endDate: new Date(endExclusive.getTime() - 1).toISOString(),
    },
    routeAvailability,
    summary: {
      totalRoundTrips: occurrenceCount,
      incompleteTrips: incomplete.length,
      uniqueVehicles: new Set(occurrences.map((occurrence) => occurrence.vehicleKey)).size,
      averageDistanceKm: average("routeDistanceKm"),
      averageFuelUsedLitres: averageFuel,
      averageOutboundLegHours: average("outboundLegDurationHours"),
      averageDurationHours: averageDuration,
      averageDestinationDwellHours: averageDwell,
      averageReturnLegHours: average("returnLegDurationHours"),
      averageRouteEfficiency: average("routeEfficiency"),
      averageContextIdleHours: average("contextualIdleHours"),
      completionRate: occurrenceCount + incomplete.length > 0 ? occurrenceCount / (occurrenceCount + incomplete.length) : 0,
    },
    occurrences: occurrences.sort((a, b) => b.departureTime.localeCompare(a.departureTime)),
    incompleteOccurrences: incomplete.sort((a, b) => b.departureTime.localeCompare(a.departureTime)),
    vehiclePerformance,
    trends,
    exceptions,
  };
}

export async function listSavedJourneyRoutes(params: {
  createdBy: string;
}): Promise<JourneySavedRoute[]> {
  const { data, error } = await supabaseAdmin
    .from("journey_saved_routes")
    .select("*")
    .eq("created_by", params.createdBy)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(mapSavedRouteRow);
}

export async function createSavedJourneyRoute(params: {
  createdBy: string;
  clientId?: string;
  name: string;
  departureLocation: string;
  destinationLocation: string;
  filters?: Record<string, unknown>;
}): Promise<JourneySavedRoute> {
  const payload = {
    created_by: params.createdBy,
    client_id: params.clientId || null,
    name: params.name.trim(),
    departure_location: params.departureLocation.trim(),
    destination_location: params.destinationLocation.trim(),
    filters_json: params.filters || {},
  };

  const { data, error } = await supabaseAdmin
    .from("journey_saved_routes")
    .insert([payload])
    .select("*")
    .single();

  if (error) throw error;
  return mapSavedRouteRow(data);
}

export async function archiveSavedJourneyRoute(params: {
  id: string;
  createdBy: string;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("journey_saved_routes")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("created_by", params.createdBy)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

export function setupJourneyIntelligenceRoutes(app: Express) {
  app.get("/api/journey-intelligence/locations", async (req, res) => {
    try {
      const scope = getJourneyClientScope(req, res);
      if (!scope) return;

      const suggestions = await listJourneyLocations({
        q: parseStringParam(req.query.q),
        clientIds: scope.clientIds,
      });

      res.json(suggestions);
    } catch (error: any) {
      console.error("GET /api/journey-intelligence/locations failed", error);
      res.status(500).json({ error: error?.message || "Failed to fetch journey locations" });
    }
  });

  app.get("/api/journey-intelligence/analysis", async (req, res) => {
    try {
      const scope = getJourneyClientScope(req, res);
      if (!scope) return;

      const departureLocation = parseStringParam(req.query.departureLocation || req.query.departure_location);
      const destinationLocation = parseStringParam(req.query.destinationLocation || req.query.destination_location);
      if (!departureLocation || !destinationLocation) {
        return res.status(400).json({ error: "departureLocation and destinationLocation are required" });
      }

      const requestedVehicleIds = parseStringListParam(req.query.vehicleIds || req.query.vehicle_ids);
      const allowedVehicles = await storage.getVehicles({ clientIds: scope.clientIds });
      const allowedVehicleIds = new Set(allowedVehicles.map((vehicle) => vehicle.id));
      const scopedVehicleIds = requestedVehicleIds?.filter((id) => allowedVehicleIds.has(id));
      const routePatternRaw = parseStringParam(req.query.routePattern || req.query.route_pattern);
      const routePattern = routePatternRaw === "one_way" ? "one_way" : "round_trip";

      const analysis = await analyzeJourneyRoute({
        departureLocation,
        destinationLocation,
        routePattern,
        startDate: parseStringParam(req.query.startDate || req.query.start_date),
        endDate: parseStringParam(req.query.endDate || req.query.end_date),
        startDay: parseDayKey(req.query.startDay || req.query.start_day),
        endDay: parseDayKey(req.query.endDay || req.query.end_day),
        clientIds: scope.clientIds,
        vehicleIds: scopedVehicleIds,
      });

      res.json(analysis);
    } catch (error: any) {
      console.error("GET /api/journey-intelligence/analysis failed", error);
      res.status(500).json({ error: error?.message || "Failed to analyze journey intelligence" });
    }
  });

  app.get("/api/journey-intelligence/saved-routes", async (req, res) => {
    try {
      if (!req.auth?.user?.id) return res.status(401).json({ error: "Unauthorized" });
      const routes = await listSavedJourneyRoutes({ createdBy: req.auth.user.id });
      res.json(routes);
    } catch (error: any) {
      console.error("GET /api/journey-intelligence/saved-routes failed", error);
      res.status(500).json({ error: error?.message || "Failed to fetch saved routes" });
    }
  });

  app.post("/api/journey-intelligence/saved-routes", async (req, res) => {
    try {
      if (!req.auth?.user?.id) return res.status(401).json({ error: "Unauthorized" });
      const scope = getJourneyClientScope(req, res);
      if (!scope) return;

      const name = parseStringParam(req.body?.name);
      const departureLocation = parseStringParam(req.body?.departureLocation || req.body?.departure_location);
      const destinationLocation = parseStringParam(req.body?.destinationLocation || req.body?.destination_location);
      const filters = req.body?.filters && typeof req.body.filters === "object" ? req.body.filters : {};
      const requestedClientId = parseStringParam(req.body?.clientId || req.body?.client_id);

      if (!name || !departureLocation || !destinationLocation) {
        return res.status(400).json({ error: "name, departureLocation, and destinationLocation are required" });
      }

      if (requestedClientId && scope.clientIds?.length && !scope.clientIds.includes(requestedClientId)) {
        return res.status(403).json({ error: "Requested client is not assigned to this user" });
      }

      const clientId = requestedClientId || (scope.clientIds?.length === 1 ? scope.clientIds[0] : undefined);

      const route = await createSavedJourneyRoute({
        createdBy: req.auth.user.id,
        clientId,
        name,
        departureLocation,
        destinationLocation,
        filters,
      });

      res.status(201).json(route);
    } catch (error: any) {
      console.error("POST /api/journey-intelligence/saved-routes failed", error);
      res.status(500).json({ error: error?.message || "Failed to save route" });
    }
  });

  app.delete("/api/journey-intelligence/saved-routes/:id", async (req, res) => {
    try {
      if (!req.auth?.user?.id) return res.status(401).json({ error: "Unauthorized" });
      const archived = await archiveSavedJourneyRoute({
        id: req.params.id,
        createdBy: req.auth.user.id,
      });
      if (!archived) {
        return res.status(404).json({ error: "Saved route not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("DELETE /api/journey-intelligence/saved-routes/:id failed", error);
      res.status(500).json({ error: error?.message || "Failed to archive saved route" });
    }
  });
}
