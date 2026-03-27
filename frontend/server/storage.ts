import {
  type Vehicle,
  type InsertVehicle,
  type FuelEvent,
  type InsertFuelEvent,
  type DailyMetrics,
  type InsertDailyMetrics,
  type KpiAggregates,
  type InsertKpiAggregates,
  type DateRange,
  type VehicleStatus,
  type FuelEventType,
  type Currency,
} from "@shared/schema";
import { supabaseAdmin } from "./supabase";

// Helpers
const toIso = (value?: Date | string | null) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
};

/** Extract a YYYY-MM-DD key in UTC from any date-like value.
 *  Using UTC consistently prevents off-by-one day when the server is in a
 *  non-UTC timezone. Supabase timestamps are stored as UTC. */
const toUtcDateKey = (value?: Date | string | null): string => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const toSafeDayKey = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
};


const mapVehicleRow = (row: any): Vehicle => ({
  id: row.id,
  clientId: row.client_id,
  assetId: row.asset_id,
  vehiclePlate: row.vehicle_plate,
  driverName: row.driver_name,
  status: row.status,
  currentFuelLevel: row.current_fuel_level,
  tankCapacity: row.tank_capacity,
  consumptionKml: row.consumption_kml,
  refillCount: row.refill_count ?? 0,
  totalRefillVolume: row.total_refill_volume ?? 0,
  drainCount: row.drain_count ?? 0,
  totalDrainVolume: row.total_drain_volume ?? 0,
  efficiencyRating: row.efficiency_rating,
  totalDistance: row.total_distance,
  totalEngineHours: row.total_engine_hours,
  totalFuelUsed: row.total_fuel_used,
  lastGpsAt: row.last_gps_at ? new Date(row.last_gps_at) : null,
  lastRoadName: row.last_road_name ?? null,
  workingDays: row.working_days,
  parkingDays: row.parking_days,
  lastMaintenanceDate: row.last_maintenance_date ? new Date(row.last_maintenance_date) : null,
  maintenanceStatus: row.maintenance_status,
  theftIncidents: row.theft_incidents,
  costPerKm: row.cost_per_km,
  systemReliability: row.system_reliability,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
});

const hasFuelTankCapacity = (vehicle: { tankCapacity?: unknown }) => {
  const tankCapacity = Number(vehicle.tankCapacity ?? 0);
  return Number.isFinite(tankCapacity) && tankCapacity > 10;
};

const cleanPayload = (payload: Record<string, any>) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

const isMissingColumnError = (error: any) => {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return text.includes("column") && text.includes("does not exist");
};

const mapVehicleInsert = (vehicle: InsertVehicle) => ({
  client_id: (vehicle as any).clientId,
  asset_id: vehicle.assetId,
  vehicle_plate: vehicle.vehiclePlate,
  driver_name: vehicle.driverName,
  status: vehicle.status,
  current_fuel_level: vehicle.currentFuelLevel,
  tank_capacity: vehicle.tankCapacity,
  consumption_kml: vehicle.consumptionKml,
  efficiency_rating: vehicle.efficiencyRating,
  total_distance: vehicle.totalDistance,
  total_engine_hours: vehicle.totalEngineHours,
  total_fuel_used: vehicle.totalFuelUsed,
  working_days: vehicle.workingDays,
  parking_days: vehicle.parkingDays,
  last_maintenance_date: toIso(vehicle.lastMaintenanceDate),
  maintenance_status: vehicle.maintenanceStatus,
  theft_incidents: vehicle.theftIncidents,
  cost_per_km: vehicle.costPerKm,
  system_reliability: vehicle.systemReliability,
});

const mapFuelEventRow = (row: any): FuelEvent => ({
  id: row.id,
  vehicleId: row.vehicle_id,
  eventType: row.event_type,
  volumeLiters: row.volume_liters ?? row.refilled ?? 0,
  costKES: row.cost_kes,
  costUGX: row.cost_ugx,
  location: row.location,
  notes: row.notes,
  eventTimestamp: row.event_timestamp
    ? new Date(row.event_timestamp)
    : row.event_time
      ? new Date(row.event_time)
      : row.created_at
        ? new Date(row.created_at)
        : new Date(),
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

const mapFuelEventInsert = (event: InsertFuelEvent) => ({
  vehicle_id: event.vehicleId,
  event_type: event.eventType,
  volume_liters: event.volumeLiters,
  cost_kes: event.costKES,
  cost_ugx: event.costUGX,
  location: event.location,
  notes: event.notes,
  event_timestamp: toIso(event.eventTimestamp),
});

const mapDailyMetricsRow = (row: any): DailyMetrics => ({
  id: row.id,
  vehicleId: row.vehicle_id,
  metricDate: row.metric_date
    ? new Date(row.metric_date)
    : row.metric_day
      ? new Date(`${String(row.metric_day).slice(0, 10)}T00:00:00.000Z`)
      : row.generated_at
        ? new Date(row.generated_at)
        : row.created_at
          ? new Date(row.created_at)
          : new Date(),
  totalFuelConsumed: row.total_fuel_consumed,
  totalDistanceTraveled: row.total_distance_traveled,
  totalEngineHours: row.total_engine_hours,
  idleTimeHours: row.idle_time_hours,
  numberOfRefills: row.refill_count ?? row.number_of_refills ?? 0,
  numberOfThefts: row.drain_count ?? row.number_of_thefts ?? 0,
  operatingCostKES: row.operating_cost_kes,
  operatingCostUGX: row.operating_cost_ugx,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

const mapDailyMetricsInsert = (metric: InsertDailyMetrics) => ({
  vehicle_id: metric.vehicleId,
  metric_date: toIso(metric.metricDate),
  metric_day: toUtcDateKey(metric.metricDate),
  total_fuel_consumed: metric.totalFuelConsumed,
  total_distance_traveled: metric.totalDistanceTraveled,
  total_engine_hours: metric.totalEngineHours,
  idle_time_hours: metric.idleTimeHours,
  number_of_refills: metric.numberOfRefills,
  refill_count: metric.numberOfRefills,
  number_of_thefts: metric.numberOfThefts,
  drain_count: metric.numberOfThefts,
  operating_cost_kes: metric.operatingCostKES,
  operating_cost_ugx: metric.operatingCostUGX,
});

const mapKpiAggregatesRow = (row: any): KpiAggregates => ({
  id: row.id,
  vehicleId: row.vehicle_id,
  rangeStart: row.range_start ? new Date(row.range_start) : new Date(),
  rangeEnd: row.range_end ? new Date(row.range_end) : new Date(),
  aggregateScope: row.aggregate_scope,
  totalEngineHours: row.total_engine_hours,
  totalDistance: row.total_distance,
  totalFuelUsed: row.total_fuel_used,
  systemReliabilityScore: row.system_reliability_score,
  totalRefills: row.total_refills,
  totalRefillVolume: row.total_refill_volume,
  totalFuelThefts: row.total_fuel_thefts,
  totalTheftVolume: row.total_theft_volume,
  averageEfficiency: row.average_efficiency,
  fleetUtilization: row.fleet_utilization,
  totalOperatingCostKES: row.total_operating_cost_kes,
  totalOperatingCostUGX: row.total_operating_cost_ugx,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

const mapKpiAggregatesInsert = (aggregate: InsertKpiAggregates) => ({
  vehicle_id: aggregate.vehicleId,
  range_start: toIso(aggregate.rangeStart),
  range_end: toIso(aggregate.rangeEnd),
  aggregate_scope: aggregate.aggregateScope,
  total_engine_hours: aggregate.totalEngineHours,
  total_distance: aggregate.totalDistance,
  total_fuel_used: aggregate.totalFuelUsed,
  system_reliability_score: aggregate.systemReliabilityScore,
  total_refills: aggregate.totalRefills,
  total_refill_volume: aggregate.totalRefillVolume,
  total_fuel_thefts: aggregate.totalFuelThefts,
  total_theft_volume: aggregate.totalTheftVolume,
  average_efficiency: aggregate.averageEfficiency,
  fleet_utilization: aggregate.fleetUtilization,
  total_operating_cost_kes: aggregate.totalOperatingCostKES,
  total_operating_cost_ugx: aggregate.totalOperatingCostUGX,
});

// Comprehensive Fleet Management Storage Interface
export interface IStorage {
  // Vehicle/Fleet Management
  getVehicles(filters?: {
    status?: VehicleStatus;
    efficiencyRating?: string;
    driverName?: string;
    clientId?: string;
    clientIds?: string[];
    vehicleIds?: string[];
  }): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  getVehicleByAssetId(assetId: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: string, updates: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: string): Promise<boolean>;

  // Fuel Events Management
  getFuelEvents(filters?: {
    vehicleId?: string;
    vehicleIds?: string[];
    eventType?: FuelEventType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<FuelEvent[]>;
  getFuelEvent(id: string): Promise<FuelEvent | undefined>;
  createFuelEvent(event: InsertFuelEvent): Promise<FuelEvent>;
  updateFuelEvent(id: string, updates: Partial<InsertFuelEvent>): Promise<FuelEvent | undefined>;
  deleteFuelEvent(id: string): Promise<boolean>;

  // Daily Metrics Management
  getDailyMetrics(filters?: {
    vehicleId?: string;
    vehicleIds?: string[];
    startDate?: Date;
    endDate?: Date;
    startDay?: string;
    endDay?: string;
  }): Promise<DailyMetrics[]>;
  createDailyMetric(metric: InsertDailyMetrics): Promise<DailyMetrics>;
  aggregateDailyMetrics(filters: {
    vehicleIds?: string[];
    startDate?: Date;
    endDate?: Date;
    startDay?: string;
    endDay?: string;
  }): Promise<{
    totalFuelConsumed: number;
    totalDistance: number;
    totalEngineHours: number;
    averageEfficiency: number;
  }>;

  // KPI Aggregates Management
  getKpiAggregates(filters?: {
    vehicleId?: string;
    vehicleIds?: string[];
    startDate?: Date;
    endDate?: Date;
    scope?: string;
  }): Promise<KpiAggregates[]>;
  createKpiAggregate(aggregate: InsertKpiAggregates): Promise<KpiAggregates>;

  // Dashboard & Analytics Methods
  computeFleetKpis(filters: {
    vehicleIds?: string[];
    dateRange: DateRange;
    currency: Currency;
  }): Promise<{
    totalEngineHours: number;
    totalDistance: number;
    totalFuelUsed: number;
    systemReliability: number;
    totalRefills: number;
    totalFuelThefts: number;
  }>;

  getChartData(
    chartType: "fuel-consumption" | "performance-metrics",
    filters: {
      vehicleIds?: string[];
      dateRange: DateRange;
    }
  ): Promise<Array<{ date: string; value: number }>>;

  getFocusedAssetSummary(
    vehicleId: string,
    dateRange: DateRange
  ): Promise<{
    refillEvents: number;
    refillVolume: number;
    theftEvents: number;
    theftVolume: number;
    idlingEvents: number;
    idlingHours: number;
    overspeedingEvents: number;
    maintenanceEvents: number;
  }>;
}

export class SupabaseStorage implements IStorage {
  // =============================================================================
  // VEHICLE MANAGEMENT
  // =============================================================================

  async getVehicles(filters?: {
    status?: VehicleStatus;
    efficiencyRating?: string;
    driverName?: string;
    clientId?: string;
    clientIds?: string[];
    vehicleIds?: string[];
  }): Promise<Vehicle[]> {
    let query = supabaseAdmin.from("vehicles").select("*");

    if (filters?.vehicleIds?.length) {
      query = query.in("id", filters.vehicleIds);
    }
    if (filters?.clientId) {
      query = query.eq("client_id", filters.clientId);
    }
    if (filters?.clientIds?.length) {
      query = query.in("client_id", filters.clientIds);
    }
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.efficiencyRating) {
      query = query.eq("efficiency_rating", filters.efficiencyRating);
    }
    if (filters?.driverName) {
      query = query.ilike("driver_name", `%${filters.driverName}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(mapVehicleRow).filter(hasFuelTankCapacity);
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return undefined;
    const vehicle = mapVehicleRow(data);
    return hasFuelTankCapacity(vehicle) ? vehicle : undefined;
  }

  async getVehicleByAssetId(assetId: string): Promise<Vehicle | undefined> {
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("asset_id", assetId)
      .maybeSingle();
    if (error || !data) return undefined;
    const vehicle = mapVehicleRow(data);
    return hasFuelTankCapacity(vehicle) ? vehicle : undefined;
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    const payload = cleanPayload(mapVehicleInsert(vehicle));
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .insert([payload])
      .select("*")
      .single();
    if (error) throw error;
    return mapVehicleRow(data);
  }

  async updateVehicle(id: string, updates: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const payload = cleanPayload(mapVehicleInsert(updates as InsertVehicle));
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error || !data) return undefined;
    return mapVehicleRow(data);
  }

  async deleteVehicle(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin.from("vehicles").delete().eq("id", id);
    return !error;
  }

  // =============================================================================
  // FUEL EVENTS MANAGEMENT
  // =============================================================================

  async getFuelEvents(filters?: {
    vehicleId?: string;
    vehicleIds?: string[];
    eventType?: FuelEventType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<FuelEvent[]> {
    const timeColumns = ["event_timestamp", "event_time", "created_at"];
    let lastError: any = null;

    for (const timeColumn of timeColumns) {
      let query = supabaseAdmin
        .from("fuel_events")
        .select("*")
        .order(timeColumn, { ascending: false });

      if (filters?.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
      if (filters?.vehicleIds?.length) query = query.in("vehicle_id", filters.vehicleIds);
      if (filters?.eventType) query = query.eq("event_type", filters.eventType);
      if (filters?.startDate) query = query.gte(timeColumn, toIso(filters.startDate) as string);
      if (filters?.endDate) query = query.lte(timeColumn, toIso(filters.endDate) as string);
      if (filters?.limit) query = query.limit(filters.limit);

      const { data, error } = await query;
      if (!error) return (data || []).map(mapFuelEventRow);

      lastError = error;
      if (!isMissingColumnError(error)) throw error;
    }

    let fallbackQuery = supabaseAdmin.from("fuel_events").select("*");
    if (filters?.vehicleId) fallbackQuery = fallbackQuery.eq("vehicle_id", filters.vehicleId);
    if (filters?.vehicleIds?.length) fallbackQuery = fallbackQuery.in("vehicle_id", filters.vehicleIds);
    if (filters?.eventType) fallbackQuery = fallbackQuery.eq("event_type", filters.eventType);
    if (filters?.limit) fallbackQuery = fallbackQuery.limit(filters.limit);

    const { data, error } = await fallbackQuery;
    if (error) throw error ?? lastError;

    const startMs = filters?.startDate?.getTime();
    const endMs = filters?.endDate?.getTime();

    return (data || [])
      .map(mapFuelEventRow)
      .filter((row) => {
        const ts = row.eventTimestamp?.getTime?.() ?? NaN;
        if (!Number.isFinite(ts)) return false;
        if (Number.isFinite(startMs) && ts < (startMs as number)) return false;
        if (Number.isFinite(endMs) && ts > (endMs as number)) return false;
        return true;
      })
      .sort((a, b) => b.eventTimestamp.getTime() - a.eventTimestamp.getTime());
  }

  async getFuelEvent(id: string): Promise<FuelEvent | undefined> {
    const { data, error } = await supabaseAdmin
      .from("fuel_events")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return undefined;
    return mapFuelEventRow(data);
  }

  async createFuelEvent(event: InsertFuelEvent): Promise<FuelEvent> {
    const payload = cleanPayload(mapFuelEventInsert(event));
    const { data, error } = await supabaseAdmin
      .from("fuel_events")
      .insert([payload])
      .select("*")
      .single();
    if (error) throw error;
    return mapFuelEventRow(data);
  }

  async updateFuelEvent(id: string, updates: Partial<InsertFuelEvent>): Promise<FuelEvent | undefined> {
    const payload = cleanPayload(mapFuelEventInsert(updates as InsertFuelEvent));
    const { data, error } = await supabaseAdmin
      .from("fuel_events")
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error || !data) return undefined;
    return mapFuelEventRow(data);
  }

  async deleteFuelEvent(id: string): Promise<boolean> {
    const { error } = await supabaseAdmin.from("fuel_events").delete().eq("id", id);
    return !error;
  }

  // =============================================================================
  // DAILY METRICS MANAGEMENT
  // =============================================================================

  async getDailyMetrics(filters?: {
    vehicleId?: string;
    vehicleIds?: string[];
    startDate?: Date;
    endDate?: Date;
    startDay?: string;
    endDay?: string;
  }): Promise<DailyMetrics[]> {
    const dateCandidates = [
      { column: "metric_day", start: toSafeDayKey(filters?.startDay) ?? (filters?.startDate ? toUtcDateKey(filters.startDate) : undefined), end: toSafeDayKey(filters?.endDay) ?? (filters?.endDate ? toUtcDateKey(filters.endDate) : undefined) },
      { column: "metric_date", start: filters?.startDate ? toIso(filters.startDate) : undefined, end: filters?.endDate ? toIso(filters.endDate) : undefined },
      { column: "created_at", start: filters?.startDate ? toIso(filters.startDate) : undefined, end: filters?.endDate ? toIso(filters.endDate) : undefined },
    ];
    let lastError: any = null;

    for (const candidate of dateCandidates) {
      let query = supabaseAdmin
        .from("daily_metrics")
        .select("*")
        .order(candidate.column, { ascending: false });

      if (filters?.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
      if (filters?.vehicleIds?.length) query = query.in("vehicle_id", filters.vehicleIds);
      if (candidate.start) query = query.gte(candidate.column, candidate.start);
      if (candidate.end) query = query.lte(candidate.column, candidate.end);

      const { data, error } = await query;
      if (!error) return (data || []).map(mapDailyMetricsRow);

      lastError = error;
      if (!isMissingColumnError(error)) throw error;
    }

    let fallbackQuery = supabaseAdmin.from("daily_metrics").select("*");
    if (filters?.vehicleId) fallbackQuery = fallbackQuery.eq("vehicle_id", filters.vehicleId);
    if (filters?.vehicleIds?.length) fallbackQuery = fallbackQuery.in("vehicle_id", filters.vehicleIds);

    const { data, error } = await fallbackQuery;
    if (error) throw error ?? lastError;

    const startMs = filters?.startDate?.getTime();
    const endMs = filters?.endDate?.getTime();

    return (data || [])
      .map(mapDailyMetricsRow)
      .filter((row) => {
        const ts = row.metricDate?.getTime?.() ?? NaN;
        if (!Number.isFinite(ts)) return false;
        if (Number.isFinite(startMs) && ts < (startMs as number)) return false;
        if (Number.isFinite(endMs) && ts > (endMs as number)) return false;
        return true;
      })
      .sort((a, b) => b.metricDate.getTime() - a.metricDate.getTime());
  }

  async createDailyMetric(metric: InsertDailyMetrics): Promise<DailyMetrics> {
    const payload = cleanPayload(mapDailyMetricsInsert(metric));
    const { data, error } = await supabaseAdmin
      .from("daily_metrics")
      .insert([payload])
      .select("*")
      .single();
    if (error) throw error;
    return mapDailyMetricsRow(data);
  }

  async aggregateDailyMetrics(filters: {
    vehicleIds?: string[];
    startDate?: Date;
    endDate?: Date;
    startDay?: string;
    endDay?: string;
  }): Promise<{
    totalFuelConsumed: number;
    totalDistance: number;
    totalEngineHours: number;
    averageEfficiency: number;
  }> {
    const metrics = await this.getDailyMetrics(filters);

    const totals = metrics.reduce(
      (acc, metric) => ({
        totalFuelConsumed: acc.totalFuelConsumed + metric.totalFuelConsumed,
        totalDistance: acc.totalDistance + metric.totalDistanceTraveled,
        totalEngineHours: acc.totalEngineHours + metric.totalEngineHours,
      }),
      { totalFuelConsumed: 0, totalDistance: 0, totalEngineHours: 0 }
    );

    const averageEfficiency = totals.totalDistance > 0
      ? (totals.totalFuelConsumed / totals.totalDistance) * 100
      : 0;

    return { ...totals, averageEfficiency };
  }

  // =============================================================================
  // KPI AGGREGATES MANAGEMENT
  // =============================================================================

  async getKpiAggregates(filters?: {
    vehicleId?: string;
    vehicleIds?: string[];
    startDate?: Date;
    endDate?: Date;
    scope?: string;
  }): Promise<KpiAggregates[]> {
    let query = supabaseAdmin.from("kpi_aggregates").select("*");

    if (filters?.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
    if (filters?.vehicleIds?.length) query = query.in("vehicle_id", filters.vehicleIds);
    if (filters?.startDate) query = query.gte("range_start", toIso(filters.startDate) as string);
    if (filters?.endDate) query = query.lte("range_end", toIso(filters.endDate) as string);
    if (filters?.scope) query = query.eq("aggregate_scope", filters.scope);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapKpiAggregatesRow);
  }

  async createKpiAggregate(aggregate: InsertKpiAggregates): Promise<KpiAggregates> {
    const payload = cleanPayload(mapKpiAggregatesInsert(aggregate));
    const { data, error } = await supabaseAdmin
      .from("kpi_aggregates")
      .insert([payload])
      .select("*")
      .single();
    if (error) throw error;
    return mapKpiAggregatesRow(data);
  }

  // =============================================================================
  // DASHBOARD & ANALYTICS METHODS
  // =============================================================================

  async computeFleetKpis(filters: {
    vehicleIds?: string[];
    dateRange: DateRange;
    currency: Currency;
  }): Promise<{
    totalEngineHours: number;
    totalDistance: number;
    totalFuelUsed: number;
    systemReliability: number;
    totalRefills: number;
    totalFuelThefts: number;
  }> {
    const scopedVehicles = await this.getVehicles({
      vehicleIds: filters.vehicleIds?.length ? filters.vehicleIds : undefined,
    });

    const parsedStartDate = filters.dateRange.startDate ? new Date(filters.dateRange.startDate) : undefined;
    const parsedEndDate = filters.dateRange.endDate ? new Date(filters.dateRange.endDate) : undefined;

    const metricsTotals = (parsedStartDate && parsedEndDate)
      ? await this.aggregateDailyMetrics({
        vehicleIds: filters.vehicleIds,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
      })
      : null;

    const totals = metricsTotals
      ? {
        totalEngineHours: metricsTotals.totalEngineHours,
        totalDistance: metricsTotals.totalDistance,
        totalFuelUsed: metricsTotals.totalFuelConsumed,
      }
      : scopedVehicles.reduce(
        (acc, vehicle) => ({
          totalEngineHours: acc.totalEngineHours + (vehicle.totalEngineHours ?? 0),
          totalDistance: acc.totalDistance + (vehicle.totalDistance ?? 0),
          totalFuelUsed: acc.totalFuelUsed + (vehicle.totalFuelUsed ?? 0),
        }),
        { totalEngineHours: 0, totalDistance: 0, totalFuelUsed: 0 }
      );

    const systemReliability = scopedVehicles.length > 0
      ? scopedVehicles.reduce((sum, v) => {
        const score = v.systemReliability === "Excellent"
          ? 95
          : v.systemReliability === "Good"
            ? 80
            : v.systemReliability === "Warning"
              ? 60
              : 40;
        return sum + score;
      }, 0) / scopedVehicles.length
      : 85.2;

    const fuelEvents = await this.getFuelEvents({
      vehicleIds: scopedVehicles.map((v) => v.id),
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    });
    const totalRefills = fuelEvents.filter((e) => e.eventType === "refill").length;
    const totalThefts = fuelEvents.filter((e) => e.eventType === "theft" || e.eventType === "leak" || e.eventType === "drain").length;

    return {
      ...totals,
      systemReliability,
      totalRefills,
      totalFuelThefts: totalThefts,
    };
  }

  async getChartData(
    chartType: "fuel-consumption" | "performance-metrics",
    filters: {
      vehicleIds?: string[];
      dateRange: DateRange;
    }
  ): Promise<Array<{ date: string; value: number }>> {
    const parsedStartDate = filters.dateRange.startDate ? new Date(filters.dateRange.startDate) : undefined;
    const parsedEndDate = filters.dateRange.endDate ? new Date(filters.dateRange.endDate) : undefined;

    const metrics = await this.getDailyMetrics({
      vehicleIds: filters.vehicleIds,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    });

    const grouped = new Map<string, number>();
    metrics.forEach((metric) => {
      const dateKey = toUtcDateKey(metric.metricDate);
      const value = chartType === "fuel-consumption"
        ? metric.totalFuelConsumed
        : metric.totalDistanceTraveled;

      grouped.set(dateKey, (grouped.get(dateKey) || 0) + value);
    });

    return Array.from(grouped.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getFocusedAssetSummary(
    vehicleId: string,
    dateRange: DateRange
  ): Promise<{
    refillEvents: number;
    refillVolume: number;
    theftEvents: number;
    theftVolume: number;
    idlingEvents: number;
    idlingHours: number;
    overspeedingEvents: number;
    maintenanceEvents: number;
  }> {
    const parsedStartDate = dateRange.startDate ? new Date(dateRange.startDate) : undefined;
    const parsedEndDate = dateRange.endDate ? new Date(dateRange.endDate) : undefined;

    const fuelEvents = await this.getFuelEvents({
      vehicleId,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    });

    const refillEvents = fuelEvents.filter((e) => e.eventType === "refill");
    const theftEvents = fuelEvents.filter((e) => e.eventType === "theft" || e.eventType === "leak" || e.eventType === "drain");

    return {
      refillEvents: refillEvents.length,
      refillVolume: refillEvents.reduce((sum, e) => sum + e.volumeLiters, 0),
      theftEvents: theftEvents.length,
      theftVolume: Math.abs(theftEvents.reduce((sum, e) => sum + e.volumeLiters, 0)),
      idlingEvents: 0,
      idlingHours: 0,
      overspeedingEvents: 0,
      maintenanceEvents: 0,
    };
  }
}

export const storage = new SupabaseStorage();
