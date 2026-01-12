import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupReportsRoutes } from "./reports";
import {
  insertVehicleSchema,
  selectVehicleSchema,
  insertFuelEventSchema,
  insertDailyMetricsSchema,
  insertUserSettingsSchema,
  updateUserSettingsSchema,
  insertKpiAggregatesSchema,
  vehicleStatusEnum,
  fuelEventTypeEnum,
  globalFilterSchema,
  dateRangeSchema
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // =============================================================================
  // VEHICLES API ROUTES
  // =============================================================================

  // GET /api/vehicles - Get all vehicles with optional filtering
  app.get("/api/vehicles", async (req, res) => {
    try {
      const { status, efficiencyRating, driverName } = req.query;

      const filters: any = {};
      if (status && vehicleStatusEnum.safeParse(status).success) {
        filters.status = status;
      }
      if (efficiencyRating) {
        filters.efficiencyRating = efficiencyRating;
      }
      if (driverName) {
        filters.driverName = driverName;
      }

      const vehicles = await storage.getVehicles(filters);
      res.json(vehicles);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vehicles" });
    }
  });

  // GET /api/vehicles/:id - Get vehicle by ID
  app.get("/api/vehicles/:id", async (req, res) => {
    try {
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      res.json(vehicle);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vehicle" });
    }
  });

  // POST /api/vehicles - Create new vehicle
  app.post("/api/vehicles", async (req, res) => {
    try {
      const validatedData = insertVehicleSchema.parse(req.body);
      const vehicle = await storage.createVehicle(validatedData);
      res.status(201).json(vehicle);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid vehicle data", details: error.message });
    }
  });

  // PUT /api/vehicles/:id - Update vehicle
  app.put("/api/vehicles/:id", async (req, res) => {
    try {
      const validatedData = insertVehicleSchema.partial().parse(req.body);
      const vehicle = await storage.updateVehicle(req.params.id, validatedData);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      res.json(vehicle);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid vehicle data", details: error.message });
    }
  });

  // DELETE /api/vehicles/:id - Delete vehicle
  app.delete("/api/vehicles/:id", async (req, res) => {
    try {
      const success = await storage.deleteVehicle(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete vehicle" });
    }
  });

  // =============================================================================
  // FUEL EVENTS API ROUTES
  // =============================================================================

  // GET /api/fuel-events - Get fuel events with optional filtering
  app.get("/api/fuel-events", async (req, res) => {
    try {
      const { vehicleId, vehicleIds, eventType, startDate, endDate, limit } = req.query;

      const filters: any = {};
      if (vehicleId) filters.vehicleId = vehicleId;
      if (vehicleIds) filters.vehicleIds = Array.isArray(vehicleIds) ? vehicleIds : [vehicleIds];
      if (eventType && fuelEventTypeEnum.safeParse(eventType).success) {
        filters.eventType = eventType;
      }
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (limit) filters.limit = parseInt(limit as string);

      const events = await storage.getFuelEvents(filters);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch fuel events" });
    }
  });

  // POST /api/fuel-events - Create new fuel event
  app.post("/api/fuel-events", async (req, res) => {
    try {
      const validatedData = insertFuelEventSchema.parse(req.body);
      const event = await storage.createFuelEvent(validatedData);
      res.status(201).json(event);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid fuel event data", details: error.message });
    }
  });

  // PUT /api/fuel-events/:id - Update fuel event
  app.put("/api/fuel-events/:id", async (req, res) => {
    try {
      const validatedData = insertFuelEventSchema.partial().parse(req.body);
      const event = await storage.updateFuelEvent(req.params.id, validatedData);
      if (!event) {
        return res.status(404).json({ error: "Fuel event not found" });
      }
      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid fuel event data", details: error.message });
    }
  });

  // DELETE /api/fuel-events/:id - Delete fuel event
  app.delete("/api/fuel-events/:id", async (req, res) => {
    try {
      const success = await storage.deleteFuelEvent(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Fuel event not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete fuel event" });
    }
  });

  // =============================================================================
  // DAILY METRICS API ROUTES
  // =============================================================================

  // GET /api/daily-metrics - Get daily metrics with optional filtering
  app.get("/api/daily-metrics", async (req, res) => {
    try {
      const { vehicleId, vehicleIds, startDate, endDate } = req.query;

      const filters: any = {};
      if (vehicleId) filters.vehicleId = vehicleId;
      if (vehicleIds) filters.vehicleIds = Array.isArray(vehicleIds) ? vehicleIds : [vehicleIds];
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const metrics = await storage.getDailyMetrics(filters);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch daily metrics" });
    }
  });

  // POST /api/daily-metrics - Create new daily metric
  app.post("/api/daily-metrics", async (req, res) => {
    try {
      const validatedData = insertDailyMetricsSchema.parse(req.body);
      const metric = await storage.createDailyMetric(validatedData);
      res.status(201).json(metric);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid daily metric data", details: error.message });
    }
  });

  // GET /api/daily-metrics/aggregated - Get aggregated daily metrics
  app.get("/api/daily-metrics/aggregated", async (req, res) => {
    try {
      const { vehicleIds, startDate, endDate } = req.query;

      const filters: any = {};
      if (vehicleIds) filters.vehicleIds = Array.isArray(vehicleIds) ? vehicleIds : [vehicleIds];
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const aggregated = await storage.aggregateDailyMetrics(filters);
      res.json(aggregated);
    } catch (error) {
      res.status(500).json({ error: "Failed to aggregate daily metrics" });
    }
  });

  // =============================================================================
  // USER SETTINGS API ROUTES
  // =============================================================================

  // GET /api/user-settings/:userId - Get user settings
  app.get("/api/user-settings/:userId", async (req, res) => {
    try {
      const settings = await storage.getUserSettings(req.params.userId);
      if (!settings) {
        return res.status(404).json({ error: "User settings not found" });
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user settings" });
    }
  });

  // PUT /api/user-settings - Update user settings
  app.put("/api/user-settings", async (req, res) => {
    try {
      const validatedData = updateUserSettingsSchema.parse(req.body);
      const settings = await storage.updateUserSettings(validatedData);
      if (!settings) {
        return res.status(404).json({ error: "User settings not found" });
      }
      res.json(settings);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid user settings data", details: error.message });
    }
  });

  // =============================================================================
  // KPI AGGREGATES API ROUTES
  // =============================================================================

  // GET /api/kpi-aggregates - Get KPI aggregates with filtering
  app.get("/api/kpi-aggregates", async (req, res) => {
    try {
      const { vehicleId, vehicleIds, startDate, endDate, scope } = req.query;

      const filters: any = {};
      if (vehicleId) filters.vehicleId = vehicleId;
      if (vehicleIds) filters.vehicleIds = Array.isArray(vehicleIds) ? vehicleIds : [vehicleIds];
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (scope) filters.scope = scope;

      const aggregates = await storage.getKpiAggregates(filters);
      res.json(aggregates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch KPI aggregates" });
    }
  });

  // POST /api/kpi-aggregates - Create new KPI aggregate
  app.post("/api/kpi-aggregates", async (req, res) => {
    try {
      const validatedData = insertKpiAggregatesSchema.parse(req.body);
      const aggregate = await storage.createKpiAggregate(validatedData);
      res.status(201).json(aggregate);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid KPI aggregate data", details: error.message });
    }
  });

  // =============================================================================
  // DASHBOARD & ANALYTICS API ROUTES
  // =============================================================================

  // POST /api/dashboard/kpis - Get computed fleet KPIs for dashboard
  app.post("/api/dashboard/kpis", async (req, res) => {
    try {
      const { vehicleIds, dateRange, currency } = req.body;

      const filters = {
        vehicleIds: vehicleIds || [],
        dateRange: dateRange || { preset: "last_7_days" },
        currency: currency || "KES"
      };

      const kpis = await storage.computeFleetKpis(filters);
      res.json(kpis);
    } catch (error) {
      res.status(500).json({ error: "Failed to compute fleet KPIs" });
    }
  });

  // POST /api/charts/fuel-consumption - Get fuel consumption chart data
  app.post("/api/charts/fuel-consumption", async (req, res) => {
    try {
      const { vehicleIds, dateRange } = req.body;

      const filters = {
        vehicleIds: vehicleIds || [],
        dateRange: dateRange || { preset: "last_7_days" }
      };

      const chartData = await storage.getChartData("fuel-consumption", filters);
      res.json(chartData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch fuel consumption chart data" });
    }
  });

  // POST /api/charts/performance-metrics - Get performance metrics chart data
  app.post("/api/charts/performance-metrics", async (req, res) => {
    try {
      const { vehicleIds, dateRange } = req.body;

      const filters = {
        vehicleIds: vehicleIds || [],
        dateRange: dateRange || { preset: "last_7_days" }
      };

      const chartData = await storage.getChartData("performance-metrics", filters);
      res.json(chartData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch performance metrics chart data" });
    }
  });

  // GET /api/focused-asset/:vehicleId/summary - Get focused asset performance summary
  app.get("/api/focused-asset/:vehicleId/summary", async (req, res) => {
    try {
      const { dateRange } = req.query;

      const parsedDateRange = dateRange
        ? JSON.parse(dateRange as string)
        : { preset: "last_7_days" };

      const summary = await storage.getFocusedAssetSummary(req.params.vehicleId, parsedDateRange);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch focused asset summary" });
    }
  });

  // =============================================================================
  // GLOBAL FILTER VALIDATION ROUTE
  // =============================================================================

  // POST /api/validate-filters - Validate global filter payload
  app.post("/api/validate-filters", async (req, res) => {
    try {
      const validatedFilters = globalFilterSchema.parse(req.body);
      res.json({ valid: true, filters: validatedFilters });
    } catch (error: any) {
      res.status(400).json({ valid: false, error: "Invalid filter data", details: error.message });
    }
  });

  // Setup reports routes
  setupReportsRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}