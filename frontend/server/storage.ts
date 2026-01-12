import {
  type User,
  type InsertUser,
  type Vehicle,
  type InsertVehicle,
  type FuelEvent,
  type InsertFuelEvent,
  type DailyMetrics,
  type InsertDailyMetrics,
  type UserSettings,
  type InsertUserSettings,
  type UpdateUserSettings,
  type KpiAggregates,
  type InsertKpiAggregates,
  type GlobalFilter,
  type DateRange,
  type VehicleStatus,
  type FuelEventType,
  type Currency,
  type DailyMovementReport,
  type InsertDailyMovementReport,
  type FuelTemperatureReport,
  type InsertFuelTemperatureReport,
  type RefuelEvent,
  type InsertRefuelEvent,
  type RawSensorData,
  type InsertRawSensorData
} from "@shared/schema";
import { randomUUID } from "crypto";

// Comprehensive Fleet Management Storage Interface
export interface IStorage {
  // User Management
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Vehicle/Fleet Management
  getVehicles(filters?: {
    status?: VehicleStatus;
    efficiencyRating?: string;
    driverName?: string;
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

  // User Settings Management
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(updates: UpdateUserSettings): Promise<UserSettings | undefined>;

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

  getChartData(chartType: 'fuel-consumption' | 'performance-metrics', filters: {
    vehicleIds?: string[];
    dateRange: DateRange;
  }): Promise<Array<{ date: string; value: number; }>>;

  getFocusedAssetSummary(vehicleId: string, dateRange: DateRange): Promise<{
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

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private vehicles: Map<string, Vehicle>;
  private fuelEvents: Map<string, FuelEvent>;
  private dailyMetrics: Map<string, DailyMetrics>;
  private userSettings: Map<string, UserSettings>;
  private kpiAggregates: Map<string, KpiAggregates>;

  constructor() {
    this.users = new Map();
    this.vehicles = new Map();
    this.fuelEvents = new Map();
    this.dailyMetrics = new Map();
    this.userSettings = new Map();
    this.kpiAggregates = new Map();

    // Initialize with sample data for demo
    this.initializeSampleData();
  }

  // =============================================================================
  // USER MANAGEMENT
  // =============================================================================

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // =============================================================================
  // VEHICLE MANAGEMENT
  // =============================================================================

  async getVehicles(filters?: {
    status?: VehicleStatus;
    efficiencyRating?: string;
    driverName?: string;
  }): Promise<Vehicle[]> {
    let vehicles = Array.from(this.vehicles.values());
    
    if (filters?.status) {
      vehicles = vehicles.filter(v => v.status === filters.status);
    }
    if (filters?.efficiencyRating) {
      vehicles = vehicles.filter(v => v.efficiencyRating === filters.efficiencyRating);
    }
    if (filters?.driverName) {
      vehicles = vehicles.filter(v => 
        v.driverName.toLowerCase().includes(filters.driverName!.toLowerCase())
      );
    }
    
    return vehicles;
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    return this.vehicles.get(id);
  }

  async getVehicleByAssetId(assetId: string): Promise<Vehicle | undefined> {
    return Array.from(this.vehicles.values()).find(v => v.assetId === assetId);
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    const id = randomUUID();
    const now = new Date();
    const newVehicle: Vehicle = {
      ...vehicle,
      id,
      createdAt: now,
      updatedAt: now,
      lastMaintenanceDate: vehicle.lastMaintenanceDate ?? null,
      maintenanceStatus: vehicle.maintenanceStatus ?? "Next week",
      tankCapacity: vehicle.tankCapacity ?? 300,
      totalDistance: vehicle.totalDistance ?? 0,
      totalEngineHours: vehicle.totalEngineHours ?? 0,
      totalFuelUsed: vehicle.totalFuelUsed ?? 0,
      workingDays: vehicle.workingDays ?? 0,
      parkingDays: vehicle.parkingDays ?? 0,
      theftIncidents: vehicle.theftIncidents ?? 0,
      costPerKm: vehicle.costPerKm ?? 15.5
    };
    this.vehicles.set(id, newVehicle);
    return newVehicle;
  }

  async updateVehicle(id: string, updates: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const existing = this.vehicles.get(id);
    if (!existing) return undefined;
    
    const updated: Vehicle = { 
      ...existing, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.vehicles.set(id, updated);
    return updated;
  }

  async deleteVehicle(id: string): Promise<boolean> {
    return this.vehicles.delete(id);
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
    let events = Array.from(this.fuelEvents.values());
    
    if (filters?.vehicleId) {
      events = events.filter(e => e.vehicleId === filters.vehicleId);
    }
    if (filters?.vehicleIds?.length) {
      events = events.filter(e => filters.vehicleIds!.includes(e.vehicleId));
    }
    if (filters?.eventType) {
      events = events.filter(e => e.eventType === filters.eventType);
    }
    if (filters?.startDate) {
      events = events.filter(e => new Date(e.eventTimestamp) >= filters.startDate!);
    }
    if (filters?.endDate) {
      events = events.filter(e => new Date(e.eventTimestamp) <= filters.endDate!);
    }
    
    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.eventTimestamp).getTime() - new Date(a.eventTimestamp).getTime());
    
    if (filters?.limit) {
      events = events.slice(0, filters.limit);
    }
    
    return events;
  }

  async getFuelEvent(id: string): Promise<FuelEvent | undefined> {
    return this.fuelEvents.get(id);
  }

  async createFuelEvent(event: InsertFuelEvent): Promise<FuelEvent> {
    const id = randomUUID();
    const now = new Date();
    const newEvent: FuelEvent = { 
      ...event,
      id,
      createdAt: now,
      costKES: event.costKES ?? null,
      costUGX: event.costUGX ?? null,
      location: event.location ?? null,
      notes: event.notes ?? null,
      eventTimestamp: event.eventTimestamp ?? now
    };
    this.fuelEvents.set(id, newEvent);
    return newEvent;
  }

  async updateFuelEvent(id: string, updates: Partial<InsertFuelEvent>): Promise<FuelEvent | undefined> {
    const existing = this.fuelEvents.get(id);
    if (!existing) return undefined;
    
    const updated: FuelEvent = { ...existing, ...updates };
    this.fuelEvents.set(id, updated);
    return updated;
  }

  async deleteFuelEvent(id: string): Promise<boolean> {
    return this.fuelEvents.delete(id);
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
    let metrics = Array.from(this.dailyMetrics.values());
    
    if (filters?.vehicleId) {
      metrics = metrics.filter(m => m.vehicleId === filters.vehicleId);
    }
    if (filters?.vehicleIds?.length) {
      metrics = metrics.filter(m => m.vehicleId && filters.vehicleIds!.includes(m.vehicleId));
    }
    if (filters?.startDate) {
      metrics = metrics.filter(m => new Date(m.metricDate) >= filters.startDate!);
    }
    if (filters?.endDate) {
      metrics = metrics.filter(m => new Date(m.metricDate) <= filters.endDate!);
    }
    
    return metrics.sort((a, b) => new Date(b.metricDate).getTime() - new Date(a.metricDate).getTime());
  }

  async createDailyMetric(metric: InsertDailyMetrics): Promise<DailyMetrics> {
    const id = randomUUID();
    const now = new Date();
    const newMetric: DailyMetrics = { 
      ...metric,
      id,
      createdAt: now,
      vehicleId: metric.vehicleId ?? null,
      totalFuelConsumed: metric.totalFuelConsumed ?? 0,
      totalDistanceTraveled: metric.totalDistanceTraveled ?? 0,
      totalEngineHours: metric.totalEngineHours ?? 0,
      idleTimeHours: metric.idleTimeHours ?? 0,
      numberOfRefills: metric.numberOfRefills ?? 0,
      numberOfThefts: metric.numberOfThefts ?? 0,
      operatingCostKES: metric.operatingCostKES ?? 0,
      operatingCostUGX: metric.operatingCostUGX ?? 0
    };
    this.dailyMetrics.set(id, newMetric);
    return newMetric;
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
    
    const totals = metrics.reduce((acc, metric) => ({
      totalFuelConsumed: acc.totalFuelConsumed + metric.totalFuelConsumed,
      totalDistance: acc.totalDistance + metric.totalDistanceTraveled,
      totalEngineHours: acc.totalEngineHours + metric.totalEngineHours,
    }), { totalFuelConsumed: 0, totalDistance: 0, totalEngineHours: 0 });
    
    const averageEfficiency = totals.totalDistance > 0 
      ? (totals.totalFuelConsumed / totals.totalDistance) * 100 
      : 0;
    
    return { ...totals, averageEfficiency };
  }

  // =============================================================================
  // USER SETTINGS MANAGEMENT
  // =============================================================================

  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    return Array.from(this.userSettings.values()).find(s => s.userId === userId);
  }

  async createUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const id = randomUUID();
    const now = new Date();
    const newSettings: UserSettings = {
      ...settings,
      id,
      updatedAt: now,
      defaultDateRange: settings.defaultDateRange ?? "Last 7 Days",
      selectedVehicles: Array.isArray(settings.selectedVehicles) ? settings.selectedVehicles : [],
      dashboardLayout: typeof settings.dashboardLayout === 'object' ? settings.dashboardLayout : {},
      notifications: settings.notifications ?? true
    };
    this.userSettings.set(id, newSettings);
    return newSettings;
  }

  async updateUserSettings(updates: UpdateUserSettings): Promise<UserSettings | undefined> {
    const existing = Array.from(this.userSettings.values()).find(s => s.userId === updates.userId);
    if (!existing) return undefined;
    
    const updated: UserSettings = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
      selectedVehicles: updates.selectedVehicles !== undefined
        ? (Array.isArray(updates.selectedVehicles) ? updates.selectedVehicles : [])
        : existing.selectedVehicles,
      dashboardLayout: updates.dashboardLayout !== undefined
        ? (typeof updates.dashboardLayout === 'object' ? updates.dashboardLayout : {})
        : existing.dashboardLayout
    };
    this.userSettings.set(existing.id, updated);
    return updated;
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
    let aggregates = Array.from(this.kpiAggregates.values());
    
    if (filters?.vehicleId) {
      aggregates = aggregates.filter(a => a.vehicleId === filters.vehicleId);
    }
    if (filters?.vehicleIds?.length) {
      aggregates = aggregates.filter(a => 
        a.vehicleId && filters.vehicleIds!.includes(a.vehicleId)
      );
    }
    if (filters?.startDate) {
      aggregates = aggregates.filter(a => new Date(a.rangeStart) >= filters.startDate!);
    }
    if (filters?.endDate) {
      aggregates = aggregates.filter(a => new Date(a.rangeEnd) <= filters.endDate!);
    }
    if (filters?.scope) {
      aggregates = aggregates.filter(a => a.aggregateScope === filters.scope);
    }
    
    return aggregates;
  }

  async createKpiAggregate(aggregate: InsertKpiAggregates): Promise<KpiAggregates> {
    const id = randomUUID();
    const now = new Date();
    const newAggregate: KpiAggregates = { 
      ...aggregate,
      id,
      createdAt: now,
      vehicleId: aggregate.vehicleId ?? null,
      totalEngineHours: aggregate.totalEngineHours ?? 0,
      totalDistance: aggregate.totalDistance ?? 0,
      totalFuelUsed: aggregate.totalFuelUsed ?? 0,
      systemReliabilityScore: aggregate.systemReliabilityScore ?? 85.2,
      totalRefills: aggregate.totalRefills ?? 0,
      totalRefillVolume: aggregate.totalRefillVolume ?? 0,
      totalFuelThefts: aggregate.totalFuelThefts ?? 0,
      totalTheftVolume: aggregate.totalTheftVolume ?? 0,
      averageEfficiency: aggregate.averageEfficiency ?? 0,
      fleetUtilization: aggregate.fleetUtilization ?? 0,
      totalOperatingCostKES: aggregate.totalOperatingCostKES ?? 0,
      totalOperatingCostUGX: aggregate.totalOperatingCostUGX ?? 0
    };
    this.kpiAggregates.set(id, newAggregate);
    return newAggregate;
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
    // Get vehicles in scope
    const vehicles = filters.vehicleIds?.length 
      ? Array.from(this.vehicles.values()).filter(v => filters.vehicleIds!.includes(v.id))
      : Array.from(this.vehicles.values());

    // Aggregate vehicle totals
    const totals = vehicles.reduce((acc, vehicle) => ({
      totalEngineHours: acc.totalEngineHours + vehicle.totalEngineHours,
      totalDistance: acc.totalDistance + vehicle.totalDistance,
      totalFuelUsed: acc.totalFuelUsed + vehicle.totalFuelUsed,
    }), { totalEngineHours: 0, totalDistance: 0, totalFuelUsed: 0 });

    // Calculate system reliability (average of all vehicles)
    const systemReliability = vehicles.length > 0 
      ? vehicles.reduce((sum, v) => {
          const score = v.systemReliability === "Excellent" ? 95 : 
                       v.systemReliability === "Good" ? 80 : 
                       v.systemReliability === "Warning" ? 60 : 40;
          return sum + score;
        }, 0) / vehicles.length
      : 85.2;

    // Count fuel events
    const vehicleIds = vehicles.map(v => v.id);
    const fuelEvents = await this.getFuelEvents({ vehicleIds });
    
    const totalRefills = fuelEvents.filter(e => e.eventType === "refill").length;
    const totalFuelThefts = fuelEvents.filter(e => e.eventType === "theft").length;

    return {
      ...totals,
      systemReliability,
      totalRefills,
      totalFuelThefts
    };
  }

  async getChartData(chartType: 'fuel-consumption' | 'performance-metrics', filters: {
    vehicleIds?: string[];
    dateRange: DateRange;
  }): Promise<Array<{ date: string; value: number; }>> {
    const metrics = await this.getDailyMetrics({ vehicleIds: filters.vehicleIds });
    
    // Group by date and sum values
    const grouped = new Map<string, number>();
    
    metrics.forEach(metric => {
      const dateKey = new Date(metric.metricDate).toISOString().split('T')[0];
      const value = chartType === 'fuel-consumption' 
        ? metric.totalFuelConsumed 
        : metric.totalDistanceTraveled;
      
      grouped.set(dateKey, (grouped.get(dateKey) || 0) + value);
    });
    
    return Array.from(grouped.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getFocusedAssetSummary(vehicleId: string, dateRange: DateRange): Promise<{
    refillEvents: number;
    refillVolume: number;
    theftEvents: number;
    theftVolume: number;
    idlingEvents: number;
    idlingHours: number;
    overspeedingEvents: number;
    maintenanceEvents: number;
  }> {
    const fuelEvents = await this.getFuelEvents({ vehicleId });
    
    const refillEvents = fuelEvents.filter(e => e.eventType === "refill");
    const theftEvents = fuelEvents.filter(e => e.eventType === "theft");
    
    return {
      refillEvents: refillEvents.length,
      refillVolume: refillEvents.reduce((sum, e) => sum + e.volumeLiters, 0),
      theftEvents: theftEvents.length,
      theftVolume: Math.abs(theftEvents.reduce((sum, e) => sum + e.volumeLiters, 0)),
      idlingEvents: 12, // Mock data
      idlingHours: 8.5,
      overspeedingEvents: 3,
      maintenanceEvents: 1
    };
  }

  // =============================================================================
  // SAMPLE DATA INITIALIZATION
  // =============================================================================

  private initializeSampleData(): void {
    // Create sample vehicles with luxury fleet data
    const sampleVehicles: InsertVehicle[] = [
      {
        assetId: "SEM - 12346",
        vehiclePlate: "KDQ 123A",
        driverName: "James Kimani",
        status: "Active",
        currentFuelLevel: 180,
        tankCapacity: 300,
        fuelEfficiency: 8.5,
        efficiencyRating: "Excellent",
        totalDistance: 15420,
        totalEngineHours: 285,
        totalFuelUsed: 1310,
        workingDays: 22,
        parkingDays: 3,
        lastMaintenanceDate: new Date("2024-08-15"),
        maintenanceStatus: "Next week",
        theftIncidents: 0,
        costPerKm: 15.5,
        systemReliability: "Excellent"
      },
      {
        assetId: "SEM - 12347",
        vehiclePlate: "KDQ 456B",
        driverName: "Mary Wanjiku",
        status: "Active",
        currentFuelLevel: 220,
        tankCapacity: 300,
        fuelEfficiency: 9.2,
        efficiencyRating: "Good",
        totalDistance: 12800,
        totalEngineHours: 240,
        totalFuelUsed: 1176,
        workingDays: 20,
        parkingDays: 5,
        lastMaintenanceDate: new Date("2024-07-20"),
        maintenanceStatus: "Overdue",
        theftIncidents: 1,
        costPerKm: 16.2,
        systemReliability: "Good"
      },
      {
        assetId: "SEM - 12348",
        vehiclePlate: "KDQ 789C",
        driverName: "Peter Mwangi",
        status: "Maintenance",
        currentFuelLevel: 45,
        tankCapacity: 300,
        fuelEfficiency: 12.1,
        efficiencyRating: "Poor",
        totalDistance: 8600,
        totalEngineHours: 180,
        totalFuelUsed: 1041,
        workingDays: 15,
        parkingDays: 10,
        lastMaintenanceDate: new Date("2024-09-01"),
        maintenanceStatus: "In progress",
        theftIncidents: 2,
        costPerKm: 18.8,
        systemReliability: "Warning"
      }
    ];

    // Create vehicles
    sampleVehicles.forEach(vehicle => {
      this.createVehicle(vehicle);
    });
  }
}

export const storage = new MemStorage();
