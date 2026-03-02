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

const toDateOnly = (value?: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const toNumber = (value: any, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeEventType = (value: any): FuelEventType => {
  const raw = String(value || "").toLowerCase();
  if (raw === "drain") return "theft";
  if (raw === "refill" || raw === "theft" || raw === "consumption" || raw === "leak") {
    return raw;
  }
  return "refill";
};

const mapVehicleRow = (row: any): Vehicle => ({
  id: row.id,
  clientId: row.client_id,
  assetId: row.asset_id || row.imei || row.id,
  vehiclePlate: row.vehicle_plate || row.asset_id || row.imei || row.id,
  driverName: row.last_driver_id ? String(row.last_driver_id) : "Unassigned",
  status: row.status || (row.last_ignition_on ? "Active" : "Idle"),
  currentFuelLevel: toNumber(row.current_fuel_level),
  tankCapacity: toNumber(row.tank_capacity),
  fuelEfficiency: toNumber(row.fuel_efficiency),
  efficiencyRating: (toNumber(row.fuel_efficiency) > 0 && toNumber(row.fuel_efficiency) < 0.4)
    ? "Excellent"
    : (toNumber(row.fuel_efficiency) > 0 && toNumber(row.fuel_efficiency) < 0.7)
      ? "Good"
      : "Poor",
  totalDistance: toNumber(row.total_distance, toNumber(row.last_odometer_km)),
  totalEngineHours: toNumber(row.total_engine_hours, toNumber(row.last_engine_hours)),
  totalFuelUsed: toNumber(row.total_fuel_used),
  lastGpsAt: row.last_gps_at ? new Date(row.last_gps_at) : null,
  lastRoadName: row.last_road_name ?? null,
  workingDays: 0,
  parkingDays: 0,
  lastMaintenanceDate: null,
  maintenanceStatus: "N/A",
  theftIncidents: 0,
  costPerKm: 0,
  systemReliability: "Good",
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
});

const cleanPayload = (payload: Record<string, any>) =>
  Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

const mapVehicleInsert = (vehicle: InsertVehicle) => ({
  client_id: (vehicle as any).clientId,
  asset_id: vehicle.assetId || (vehicle as any).imei,
  vehicle_plate: vehicle.vehiclePlate || vehicle.assetId || (vehicle as any).imei,
  imei: (vehicle as any).imei || vehicle.assetId,
  client_name: (vehicle as any).clientName,
  status: vehicle.status || "Idle",
  current_fuel_level: toNumber(vehicle.currentFuelLevel),
  tank_capacity: toNumber(vehicle.tankCapacity),
  consumption_kml: toNumber(vehicle.consumptionKml),
  total_distance: toNumber(vehicle.totalDistance),
  total_engine_hours: toNumber(vehicle.totalEngineHours),
  total_fuel_used: toNumber(vehicle.totalFuelUsed),
});

const mapFuelEventRow = (row: any): FuelEvent => ({
  id: row.id,
  vehicleId: row.vehicle_id,
  eventType: normalizeEventType(row.event_type),
  volumeLiters: toNumber(row.refilled),
  costKES: null,
  costUGX: null,
  location: row.location,
  notes: row.payload?.notes || null,
  eventTimestamp: row.event_time ? new Date(row.event_time) : new Date(),
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

const mapFuelEventInsert = (event: InsertFuelEvent) => ({
  vehicle_id: event.vehicleId,
  event_type: event.eventType === "theft" ? "drain" : event.eventType,
  refilled: toNumber(event.volumeLiters),
  initial_fuel: null,
  final_fuel: null,
  location: event.location,
  payload: cleanPayload({
    notes: event.notes,
    cost_kes: event.costKES,
    cost_ugx: event.costUGX,
  }),
  event_time: toIso(event.eventTimestamp),
});

const mapDailyMetricsRow = (row: any): DailyMetrics => ({
  id: row.id,
  vehicleId: row.vehicle_id,
  metricDate: row.metric_day ? new Date(row.metric_day) : new Date(),
  totalFuelConsumed: toNumber(row.total_fuel_consumed),
  totalDistanceTraveled: toNumber(row.total_distance_traveled),
  totalEngineHours: toNumber(row.total_engine_hours),
  idleTimeHours: toNumber(row.idle_time_hours),
  numberOfRefills: toNumber(row.refill_count),
  numberOfThefts: toNumber(row.drain_count),
  operatingCostKES: toNumber(row.operating_cost_kes),
  operatingCostUGX: toNumber(row.operating_cost_ugx),
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

const mapDailyMetricsInsert = (metric: InsertDailyMetrics) => ({
  vehicle_id: metric.vehicleId,
  metric_day: toDateOnly(metric.metricDate),
  total_fuel_consumed: toNumber(metric.totalFuelConsumed),
  total_distance_traveled: toNumber(metric.totalDistanceTraveled),
  total_engine_hours: toNumber(metric.totalEngineHours),
  idle_time_hours: toNumber(metric.idleTimeHours),
  refill_count: toNumber(metric.numberOfRefills),
  drain_count: toNumber(metric.numberOfThefts),
  operating_cost_kes: toNumber(metric.operatingCostKES),
  operating_cost_ugx: toNumber(metric.operatingCostUGX),
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
  }): Promise<DailyMetrics[]>;
  createDailyMetric(metric: InsertDailyMetrics): Promise<DailyMetrics>;
  aggregateDailyMetrics(filters: {
    vehicleIds?: string[];
    startDate?: Date;
    endDate?: Date;
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

    const { data, error } = await query;
    if (error) throw error;
    let rows = (data || []).map(mapVehicleRow);

    // These two filters are kept for API compatibility but are now computed fields.
    if (filters?.efficiencyRating) {
      rows = rows.filter((row) => row.efficiencyRating === filters.efficiencyRating);
    }
    if (filters?.driverName) {
      const needle = filters.driverName.toLowerCase();
      rows = rows.filter((row) => String(row.driverName || "").toLowerCase().includes(needle));
    }

    return rows;
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return undefined;
    return mapVehicleRow(data);
  }

  async getVehicleByAssetId(assetId: string): Promise<Vehicle | undefined> {
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("asset_id", assetId)
      .maybeSingle();
    if (!error && data) return mapVehicleRow(data);

    const { data: imeiData, error: imeiError } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("imei", assetId)
      .maybeSingle();
    if (imeiError || !imeiData) return undefined;
    return mapVehicleRow(imeiData);
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
    let query = supabaseAdmin
      .from("fuel_events")
      .select("*")
      .order("event_time", { ascending: false });

    if (filters?.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
    if (filters?.vehicleIds?.length) query = query.in("vehicle_id", filters.vehicleIds);
    if (filters?.eventType) {
      if (filters.eventType === "theft") {
        query = query.in("event_type", ["drain", "theft"]);
      } else {
        query = query.eq("event_type", filters.eventType);
      }
    }
    if (filters?.startDate) query = query.gte("event_time", toIso(filters.startDate) as string);
    if (filters?.endDate) query = query.lte("event_time", toIso(filters.endDate) as string);
    if (filters?.limit) query = query.limit(filters.limit);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapFuelEventRow);
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
  }): Promise<DailyMetrics[]> {
    let query = supabaseAdmin
      .from("daily_metrics")
      .select("*")
      .order("metric_day", { ascending: false });

    if (filters?.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
    if (filters?.vehicleIds?.length) query = query.in("vehicle_id", filters.vehicleIds);
    if (filters?.startDate) query = query.gte("metric_day", toDateOnly(filters.startDate) as string);
    if (filters?.endDate) query = query.lte("metric_day", toDateOnly(filters.endDate) as string);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapDailyMetricsRow);
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
          totalEngineHours: acc.totalEngineHours + vehicle.totalEngineHours,
          totalDistance: acc.totalDistance + vehicle.totalDistance,
          totalFuelUsed: acc.totalFuelUsed + vehicle.totalFuelUsed,
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
    const totalFuelThefts = fuelEvents.filter((e) => e.eventType === "theft").length;

    return {
      ...totals,
      systemReliability,
      totalRefills,
      totalFuelThefts,
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
      const dateKey = new Date(metric.metricDate).toISOString().split("T")[0];
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
    const theftEvents = fuelEvents.filter((e) => e.eventType === "theft");

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
