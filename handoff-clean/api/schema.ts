import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  timestamp, 
  decimal, 
  integer, 
  boolean,
  json,
  uuid,
  real
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Clients (tenants)
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// User profiles (linked to auth.users)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // auth.users.id
  role: text("role").notNull().default("client"), // "admin" | "client"
  displayName: text("display_name"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Client-user assignments
export const clientUsers = pgTable("client_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  userId: uuid("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
});
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

// Vehicle Status Enum
export const vehicleStatusEnum = z.enum(["Active", "Idle", "Maintenance", "Out of Service"]);
export type VehicleStatus = z.infer<typeof vehicleStatusEnum>;

// Efficiency Rating Enum
export const efficiencyRatingEnum = z.enum(["Excellent", "Good", "Poor"]);
export type EfficiencyRating = z.infer<typeof efficiencyRatingEnum>;

// Fuel Event Type Enum
export const fuelEventTypeEnum = z.enum(["refill", "theft", "consumption", "leak"]);
export type FuelEventType = z.infer<typeof fuelEventTypeEnum>;

// Currency Enum
export const currencyEnum = z.enum(["KES", "UGX", "USD"]);
export type Currency = z.infer<typeof currencyEnum>;

// System Reliability Enum
export const systemReliabilityEnum = z.enum(["Excellent", "Good", "Warning", "Critical"]);
export type SystemReliability = z.infer<typeof systemReliabilityEnum>;

// Aggregate Scope Enum
export const aggregateScopeEnum = z.enum(["fleet", "vehicle", "period"]);
export type AggregateScope = z.infer<typeof aggregateScopeEnum>;

// =============================================================================
// FLEET MANAGEMENT SCHEMAS
// =============================================================================

// Core Vehicle/Fleet Asset Entity
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  assetId: text("asset_id").notNull().unique(), // e.g., "SEM - 12346"
  vehiclePlate: text("vehicle_plate").notNull(),
  driverName: text("driver_name").notNull(),
  status: text("status").notNull().$type<VehicleStatus>(), // "Active", "Idle", "Maintenance"
  currentFuelLevel: real("current_fuel_level").notNull(), // Liters
  tankCapacity: real("tank_capacity").notNull().default(300), // Liters
  fuelEfficiency: real("fuel_efficiency").notNull(), // L/100km
  efficiencyRating: text("efficiency_rating").notNull().$type<EfficiencyRating>(), // "Excellent", "Good", "Poor"
  totalDistance: real("total_distance").notNull().default(0), // Kilometers
  totalEngineHours: real("total_engine_hours").notNull().default(0), // Hours
  totalFuelUsed: real("total_fuel_used").notNull().default(0), // Liters
  workingDays: integer("working_days").notNull().default(0), // This period
  parkingDays: integer("parking_days").notNull().default(0), // This period
  lastMaintenanceDate: timestamp("last_maintenance_date"),
  maintenanceStatus: text("maintenance_status").notNull().default("Next week"), // e.g., "Next week", "Overdue"
  theftIncidents: integer("theft_incidents").notNull().default(0),
  costPerKm: real("cost_per_km").notNull().default(15.5), // KES per km
  systemReliability: text("system_reliability").notNull().default("Excellent").$type<SystemReliability>(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`)
});

// Fuel Events (Refills, Thefts, Consumption)
export const fuelEvents = pgTable("fuel_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id).notNull(),
  eventType: text("event_type").notNull().$type<FuelEventType>(), // "refill", "theft", "consumption"
  volumeLiters: real("volume_liters").notNull(), // Positive for refill, negative for theft/consumption
  costKES: real("cost_kes"), // Cost in Kenyan Shillings
  costUGX: real("cost_ugx"), // Cost in Ugandan Shillings  
  location: text("location"),
  notes: text("notes"),
  eventTimestamp: timestamp("event_timestamp").notNull().default(sql`now()`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`)
});

// Daily Performance Metrics for Charts
export const dailyMetrics = pgTable("daily_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id),
  metricDate: timestamp("metric_date").notNull(),
  totalFuelConsumed: real("total_fuel_consumed").notNull().default(0), // Liters
  totalDistanceTraveled: real("total_distance_traveled").notNull().default(0), // Kilometers
  totalEngineHours: real("total_engine_hours").notNull().default(0), // Hours
  idleTimeHours: real("idle_time_hours").notNull().default(0), // Hours
  numberOfRefills: integer("number_of_refills").notNull().default(0),
  numberOfThefts: integer("number_of_thefts").notNull().default(0),
  operatingCostKES: real("operating_cost_kes").notNull().default(0),
  operatingCostUGX: real("operating_cost_ugx").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`)
});

// KPI Aggregates (for Dashboard Cards) - With Global Filter Context
export const kpiAggregates = pgTable("kpi_aggregates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Filter Context - Links aggregates to specific filter selections
  vehicleId: varchar("vehicle_id").references(() => vehicles.id), // null = all vehicles
  rangeStart: timestamp("range_start").notNull(), // Start of aggregation period
  rangeEnd: timestamp("range_end").notNull(), // End of aggregation period
  aggregateScope: text("aggregate_scope").notNull().$type<AggregateScope>(), // "fleet", "vehicle", "period"
  
  // KPI Metrics
  totalEngineHours: real("total_engine_hours").notNull().default(0),
  totalDistance: real("total_distance").notNull().default(0), // Kilometers
  totalFuelUsed: real("total_fuel_used").notNull().default(0), // Liters
  systemReliabilityScore: real("system_reliability_score").notNull().default(85.2), // Percentage
  totalRefills: integer("total_refills").notNull().default(0),
  totalRefillVolume: real("total_refill_volume").notNull().default(0), // Liters
  totalFuelThefts: integer("total_fuel_thefts").notNull().default(0),
  totalTheftVolume: real("total_theft_volume").notNull().default(0), // Liters
  averageEfficiency: real("average_efficiency").notNull().default(0), // L/100km
  fleetUtilization: real("fleet_utilization").notNull().default(0), // Percentage
  totalOperatingCostKES: real("total_operating_cost_kes").notNull().default(0),
  totalOperatingCostUGX: real("total_operating_cost_ugx").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`)
});

// =============================================================================
// ZOD SCHEMAS & TYPES
// =============================================================================

// Vehicle schemas with enum enforcement
export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  status: vehicleStatusEnum,
  efficiencyRating: efficiencyRatingEnum,
  systemReliability: systemReliabilityEnum
});

export const selectVehicleSchema = createSelectSchema(vehicles).extend({
  status: vehicleStatusEnum,
  efficiencyRating: efficiencyRatingEnum,
  systemReliability: systemReliabilityEnum
});

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;

// Fuel Event schemas with enum enforcement
export const insertFuelEventSchema = createInsertSchema(fuelEvents).omit({
  id: true,
  createdAt: true
}).extend({
  eventType: fuelEventTypeEnum
});

export const selectFuelEventSchema = createSelectSchema(fuelEvents).extend({
  eventType: fuelEventTypeEnum
});

export type InsertFuelEvent = z.infer<typeof insertFuelEventSchema>;
export type FuelEvent = typeof fuelEvents.$inferSelect;

// Daily Metrics schemas
export const insertDailyMetricsSchema = createInsertSchema(dailyMetrics).omit({
  id: true,
  createdAt: true
});

export type InsertDailyMetrics = z.infer<typeof insertDailyMetricsSchema>;
export type DailyMetrics = typeof dailyMetrics.$inferSelect;

// KPI Aggregates schemas with enum enforcement
export const insertKpiAggregatesSchema = createInsertSchema(kpiAggregates).omit({
  id: true,
  createdAt: true
}).extend({
  aggregateScope: aggregateScopeEnum
});

export const selectKpiAggregatesSchema = createSelectSchema(kpiAggregates).extend({
  aggregateScope: aggregateScopeEnum
});

export type InsertKpiAggregates = z.infer<typeof insertKpiAggregatesSchema>;
export type KpiAggregates = typeof kpiAggregates.$inferSelect;

// Complete Select Schemas for remaining tables
export const selectDailyMetricsSchema = createSelectSchema(dailyMetrics);

// =============================================================================
// GLOBAL FILTER & DATE RANGE SCHEMAS
// =============================================================================

// Date Range Picker Schema
export const dateRangeSchema = z.object({
  preset: z.enum(["today", "yesterday", "week_to_date", "month_to_date", "last_7_days", "last_30_days", "custom"]).optional(),
  startDate: z.string().datetime().optional(), // ISO string
  endDate: z.string().datetime().optional(), // ISO string
  label: z.string().optional() // Display label like "Last 7 Days"
});

export type DateRange = z.infer<typeof dateRangeSchema>;

// Global Filter State Schema
export const globalFilterSchema = z.object({
  selectedVehicles: z.array(z.string()).default([]), // Vehicle IDs, empty = all vehicles
  dateRange: dateRangeSchema,
  currency: currencyEnum.default("KES"),
  fuelCostPerLiter: z.number().default(145.50), // Cost per liter in selected currency
  refreshInterval: z.number().default(30000) // Milliseconds
});

export type GlobalFilter = z.infer<typeof globalFilterSchema>;

// Chart Data Schemas
export const chartDataPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD or day name
  value: z.number(),
  label: z.string().optional(),
  color: z.string().optional()
});

export const chartDataSchema = z.object({
  title: z.string(),
  data: z.array(chartDataPointSchema),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  chartType: z.enum(["bar", "line", "area"]).default("bar")
});

export type ChartDataPoint = z.infer<typeof chartDataPointSchema>;
export type ChartData = z.infer<typeof chartDataSchema>;

// Currency Formatting Schema
export const currencyFormatSchema = z.object({
  amount: z.number(),
  currency: currencyEnum,
  locale: z.string().default("en-KE") // or "en-UG"
});

export type CurrencyFormat = z.infer<typeof currencyFormatSchema>;

// Event Summary Schema (for Focused Asset Performance)
export const eventSummarySchema = z.object({
  refillEvents: z.number().default(0),
  refillVolume: z.number().default(0), // Liters
  theftEvents: z.number().default(0),
  theftVolume: z.number().default(0), // Liters
  idlingEvents: z.number().default(0),
  idlingHours: z.number().default(0),
  overspeedingEvents: z.number().default(0),
  maintenanceEvents: z.number().default(0),
  dateRange: dateRangeSchema
});

export type EventSummary = z.infer<typeof eventSummarySchema>;

// =============================================================================
// REPORTS SCHEMAS
// =============================================================================

// Daily Movement Reports
export const dailyMovementReports = pgTable("trip_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportDate: timestamp("report_date").notNull(),
  clientId: uuid("client_id").references(() => clients.id),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id),
  assetDescription: varchar("asset_description", { length: 100 }),
  registrationNumber: varchar("registration_number", { length: 30 }),
  assetId: integer("asset_id"),
  siteName: varchar("site_name", { length: 100 }).default('ADT Africa Ltd.'),
  departureDate: timestamp("departure_date"),
  driver: varchar("driver", { length: 100 }),
  departureTime: timestamp("departure_time"),
  departedFrom: text("departed_from"),
  drivingTime: text("driving_time"), // INTERVAL stored as text (hh:mm:ss)
  standingTime: text("standing_time"), // INTERVAL stored as text (hh:mm:ss)
  distanceKm: decimal("distance_km", { precision: 10, scale: 6 }),
  maxSpeedKmh: integer("max_speed_kmh"),
  arrivalTime: timestamp("arrival_time"),
  arrivedAt: text("arrived_at"),
  nextDeparture: timestamp("next_departure"),
  standingTimeAtLocation: text("standing_time_at_location"), // INTERVAL stored as text (hh:mm:ss)
  fuelUsedLitres: decimal("fuel_used_litres", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`)
});

// Fuel/Temperature Reports
export const fuelTemperatureReports = pgTable("fuel_temperature_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportDate: timestamp("report_date").notNull(),
  clientId: uuid("client_id").references(() => clients.id),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id),
  reportTitle: varchar("report_title", { length: 255 }).default('Sensor / Fuel / Temperature'),
  assetName: varchar("asset_name", { length: 100 }).default('Howo Demo'),
  fromDatetime: timestamp("from_datetime"),
  toDatetime: timestamp("to_datetime"),
  generatedOn: timestamp("generated_on"),
  totalDistanceKm: decimal("total_distance_km", { precision: 10, scale: 2 }),
  totalRefillsL: decimal("total_refills_l", { precision: 10, scale: 2 }),
  totalDrainsL: decimal("total_drains_l", { precision: 10, scale: 2 }),
  fuelUsedL: decimal("fuel_used_l", { precision: 10, scale: 2 }),
  fuelConsumptionKmL: decimal("fuel_consumption_km_l", { precision: 10, scale: 2 }),
  dataPoints: json("data_points").$type<any[]>(), // Stores the fuel graph data points
  createdAt: timestamp("created_at").notNull().default(sql`now()`)
});

// Refuel Events
export const refuelEvents = pgTable("refuel_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fuelReportId: varchar("fuel_report_id").references(() => fuelTemperatureReports.id),
  eventTime: timestamp("event_time"),
  initialFuel: decimal("initial_fuel", { precision: 10, scale: 2 }),
  finalFuel: decimal("final_fuel", { precision: 10, scale: 2 }),
  refilled: decimal("refilled", { precision: 10, scale: 2 }),
  location: text("location"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`)
});

// Raw Sensor Data
export const rawSensorData = pgTable("raw_sensor_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fuelReportId: varchar("fuel_report_id").references(() => fuelTemperatureReports.id),
  timestamp: timestamp("timestamp"),
  fuel: decimal("fuel", { precision: 10, scale: 2 }),
  altitude: decimal("altitude", { precision: 10, scale: 2 }),
  odometer: decimal("odometer", { precision: 10, scale: 2 }),
  speed: decimal("speed", { precision: 10, scale: 2 }),
  temperature: decimal("temperature", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`)
});

// Reports schemas and types
export const insertDailyMovementReportSchema = createInsertSchema(dailyMovementReports).omit({
  id: true,
  createdAt: true
});

export const selectDailyMovementReportSchema = createSelectSchema(dailyMovementReports);

export const insertFuelTemperatureReportSchema = createInsertSchema(fuelTemperatureReports).omit({
  id: true,
  createdAt: true
});

export const selectFuelTemperatureReportSchema = createSelectSchema(fuelTemperatureReports);

export const insertRefuelEventSchema = createInsertSchema(refuelEvents).omit({
  id: true,
  createdAt: true
});

export const selectRefuelEventSchema = createSelectSchema(refuelEvents);

export const insertRawSensorDataSchema = createInsertSchema(rawSensorData).omit({
  id: true,
  createdAt: true
});

export const selectRawSensorDataSchema = createSelectSchema(rawSensorData);

export type InsertDailyMovementReport = z.infer<typeof insertDailyMovementReportSchema>;
export type DailyMovementReport = typeof dailyMovementReports.$inferSelect;

export type InsertFuelTemperatureReport = z.infer<typeof insertFuelTemperatureReportSchema>;
export type FuelTemperatureReport = typeof fuelTemperatureReports.$inferSelect;

export type InsertRefuelEvent = z.infer<typeof insertRefuelEventSchema>;
export type RefuelEvent = typeof refuelEvents.$inferSelect;

export type InsertRawSensorData = z.infer<typeof insertRawSensorDataSchema>;
export type RawSensorData = typeof rawSensorData.$inferSelect;
