import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { setupReportsRoutes } from "./reports";
import { requireAuth, requireAdmin } from "./auth";
import { supabaseAdmin } from "./supabase";
import { importSourceOfTruthFile } from "./sourceOfTruthImport";
import {
  insertVehicleSchema,
  insertFuelEventSchema,
  insertDailyMetricsSchema,
  insertKpiAggregatesSchema,
  vehicleStatusEnum,
  fuelEventTypeEnum,
  globalFilterSchema,
} from "@shared/schema";

const sourceOfTruthUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function parseList(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function parseDate(value: any): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

function isMissingColumnError(error: any): boolean {
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return text.includes("column") && text.includes("does not exist");
}

function normalizeImei(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function parseSensorTimestamp(row: any): string | null {
  const candidates = [
    row?.date,
    row?.timestamp,
    row?.created_at,
    row?.createdAt,
    row?.payload?.date,
    row?.payload?.timestamp,
    row?.payload?.event_time,
    row?.payload?.time,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(String(candidate));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

function hasFuelTankCapacity(vehicle: { tankCapacity?: unknown }) {
  const capacity = Number(vehicle.tankCapacity ?? 0);
  return Number.isFinite(capacity) && capacity > 0;
}

function getRequestedClientId(req: Request): string | undefined {
  const value = req.query.clientId || req.query.client_id;
  if (!value) return undefined;
  return Array.isArray(value) ? String(value[0]) : String(value);
}

async function getClientScope(req: Request, res: Response) {
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
    const hasAccess = clientIds.some((clientId) => String(clientId) === String(requestedClientId));
    if (!hasAccess) {
      res.status(403).json({ error: "Requested client is not assigned to this user" });
      return null;
    }

    return { isAdmin, clientIds: [requestedClientId] };
  }

  return { isAdmin, clientIds };
}

async function getScopedVehicleIds(
  req: Request,
  res: Response,
  requestedVehicleIds?: string[]
) {
  const scope = await getClientScope(req, res);
  if (!scope) return null;

  const vehicles = await storage.getVehicles({ clientIds: scope.clientIds });
  const allowedIds = vehicles.filter(hasFuelTankCapacity).map((v) => v.id);

  const vehicleIds = requestedVehicleIds?.length
    ? requestedVehicleIds.filter((id) => allowedIds.includes(id))
    : allowedIds;

  return {
    ...scope,
    vehicleIds,
  };
}

function normalizeClientName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function syncClientsFromVehicles() {
  let hasClientNameColumn = true;
  let vehicles: any[] = [];

  const { data: vehicleRows, error: vehiclesError } = await supabaseAdmin
    .from("vehicles")
    .select("id, client_id, client_name");

  if (vehiclesError) {
    const details = `${vehiclesError.message || ""} ${vehiclesError.details || ""}`.toLowerCase();
    if (!(details.includes("client_name") && details.includes("does not exist"))) {
      throw vehiclesError;
    }
    hasClientNameColumn = false;
    const { data: fallbackVehicles, error: fallbackVehiclesError } = await supabaseAdmin
      .from("vehicles")
      .select("id, client_id");
    if (fallbackVehiclesError) throw fallbackVehiclesError;
    vehicles = fallbackVehicles || [];
  } else {
    vehicles = vehicleRows || [];
  }

  const { data: existingClients, error: existingClientsError } = await supabaseAdmin
    .from("clients")
    .select("id, name");
  if (existingClientsError) throw existingClientsError;

  const clientsByName = new Map<string, { id: string; name: string }>();
  (existingClients || []).forEach((client: any) => {
    const normalized = normalizeClientName(client.name);
    if (!normalized) return;
    clientsByName.set(normalized.toLowerCase(), client);
  });

  if (hasClientNameColumn) {
    const uniqueNames = Array.from(
      new Set(
        vehicles
          .map((vehicle: any) => normalizeClientName(vehicle.client_name))
          .filter((name): name is string => Boolean(name))
      )
    );

    const missingClientRows = uniqueNames
      .filter((name) => !clientsByName.has(name.toLowerCase()))
      .map((name) => ({ name }));

    if (missingClientRows.length > 0) {
      const { data: insertedClients, error: insertClientsError } = await supabaseAdmin
        .from("clients")
        .insert(missingClientRows)
        .select("id, name");
      if (insertClientsError) throw insertClientsError;

      (insertedClients || []).forEach((client: any) => {
        const normalized = normalizeClientName(client.name);
        if (!normalized) return;
        clientsByName.set(normalized.toLowerCase(), client);
      });
    }
  }

  const vehicleIdsByClientId = new Map<string, string[]>();
  const referencedClientIds = new Set<string>();
  vehicles.forEach((vehicle: any) => {
    let targetClientId: string | null = null;

    if (hasClientNameColumn) {
      const normalizedName = normalizeClientName(vehicle.client_name);
      const targetClient = normalizedName ? clientsByName.get(normalizedName.toLowerCase()) : null;
      if (targetClient?.id) targetClientId = targetClient.id;
    }

    if (!targetClientId && vehicle.client_id) {
      targetClientId = String(vehicle.client_id);
    }
    if (!targetClientId) return;

    referencedClientIds.add(targetClientId);
    if (String(vehicle.client_id || "") === targetClientId) return;

    const list = vehicleIdsByClientId.get(targetClientId) || [];
    list.push(String(vehicle.id));
    vehicleIdsByClientId.set(targetClientId, list);
  });

  for (const [clientId, vehicleIds] of vehicleIdsByClientId.entries()) {
    const { error: updateError } = await supabaseAdmin
      .from("vehicles")
      .update({ client_id: clientId })
      .in("id", vehicleIds);
    if (updateError) throw updateError;
  }

  const staleClientIds = (existingClients || [])
    .map((client: any) => String(client.id))
    .filter((id: string) => id.length > 0 && !referencedClientIds.has(id));

  if (staleClientIds.length > 0) {
    const batchSize = 200;
    for (let i = 0; i < staleClientIds.length; i += batchSize) {
      const batch = staleClientIds.slice(i, i + batchSize);
      const { error: deleteError } = await supabaseAdmin
        .from("clients")
        .delete()
        .in("id", batch);
      if (deleteError) throw deleteError;
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
      (vehicleClientRows || [])
        .map((row: any) => String(row.client_id || ""))
        .filter((id: string) => id.length > 0)
    )
  );

  if (clientIds.length === 0) return [];

  const { data: clients, error: clientsError } = await supabaseAdmin
    .from("clients")
    .select("id, name, created_at")
    .in("id", clientIds)
    .order("created_at", { ascending: false });
  if (clientsError) throw clientsError;

  return clients || [];
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check (public)
  app.get("/health", (_req, res) => {
    res.json({ status: "OK", message: "Fuel Platform API ready" });
  });

  // Onboarding status (public)
  app.get("/api/onboarding/status", async (_req, res) => {
    try {
      const { count: adminCount, error: adminError } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (adminError) throw adminError;

      const { count: clientCount, error: clientError } = await supabaseAdmin
        .from("clients")
        .select("id", { count: "exact", head: true });
      if (clientError) throw clientError;

      const hasAdmin = (adminCount || 0) > 0;
      const hasClient = (clientCount || 0) > 0;

      res.json({ hasAdmin, hasClient, needsOnboarding: !hasAdmin });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to check onboarding status" });
    }
  });

  // Onboarding bootstrap (public - only allowed if no admin exists)
  app.post("/api/onboarding/bootstrap", async (req, res) => {
    try {
      const { email, password, displayName, clientName } = req.body || {};

      if (!email || !password || !clientName) {
        return res.status(400).json({ error: "email, password, and clientName are required" });
      }

      const { count: adminCount } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");

      if ((adminCount || 0) > 0) {
        return res.status(409).json({ error: "Admin already exists" });
      }

      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (userError || !userData.user) {
        throw userError || new Error("Failed to create admin user");
      }

      const adminId = userData.user.id;

      const { data: clientData, error: clientError } = await supabaseAdmin
        .from("clients")
        .insert([{ name: clientName }])
        .select("id, name")
        .single();

      if (clientError) throw clientError;

      await supabaseAdmin.from("profiles").insert([
        {
          id: adminId,
          role: "admin",
          display_name: displayName || email,
        },
      ]);

      await supabaseAdmin.from("client_users").insert([
        {
          user_id: adminId,
          client_id: clientData.id,
        },
      ]);

      res.status(201).json({
        success: true,
        adminId,
        clientId: clientData.id,
        clientName: clientData.name,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to bootstrap admin" });
    }
  });

  // Require auth for all API routes
  app.use("/api", requireAuth);

  // Current user profile
  app.get("/api/me", async (req, res) => {
    try {
      const clientIds = req.auth?.clientIds || [];
      const { data: clients } = await supabaseAdmin
        .from("clients")
        .select("id, name")
        .in("id", clientIds.length > 0 ? clientIds : ["00000000-0000-0000-0000-000000000000"]);

      res.json({
        user: req.auth?.user,
        profile: req.auth?.profile,
        clientIds,
        clients: clients || [],
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to load user profile" });
    }
  });

  // =============================================================================
  // ADMIN ROUTES
  // =============================================================================

  app.get("/api/admin/clients", requireAdmin, async (_req, res) => {
    try {
      await syncClientsFromVehicles();
      const clients = await getClientsUsedByVehicles();
      res.json(clients);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Failed to fetch clients" });
    }
  });

  app.post("/api/admin/clients", requireAdmin, async (_req, res) => {
    res.status(405).json({
      error: "Manual client creation is disabled. Clients are auto-created from unique vehicle client names.",
    });
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
      if (usersError) throw usersError;

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, role, display_name");

      const { data: assignments } = await supabaseAdmin
        .from("client_users")
        .select("user_id, client_id");

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
      const assignmentMap = new Map<string, string[]>();

      (assignments || []).forEach((a) => {
        const list = assignmentMap.get(a.user_id) || [];
        list.push(a.client_id);
        assignmentMap.set(a.user_id, list);
      });

      const users = (usersData.users || []).map((u) => ({
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        role: profileMap.get(u.id)?.role || "client",
        displayName: profileMap.get(u.id)?.display_name || u.email,
        clientIds: assignmentMap.get(u.id) || [],
      }));

      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to load users" });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const { email, password, role, displayName, clientIds } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error || !data.user) throw error;

      await supabaseAdmin
        .from("profiles")
        .insert([
          {
            id: data.user.id,
            role: role || "client",
            display_name: displayName || email,
          },
        ]);

      if (Array.isArray(clientIds) && clientIds.length > 0) {
        const rows = clientIds.map((clientId: string) => ({
          user_id: data.user!.id,
          client_id: clientId,
        }));
        await supabaseAdmin.from("client_users").insert(rows);
      }

      res.status(201).json({ id: data.user.id, email });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create user" });
    }
  });

  app.get("/api/admin/assignments", requireAdmin, async (req, res) => {
    const userId = req.query.userId || req.query.user_id;
    const clientId = req.query.clientId || req.query.client_id;

    let query = supabaseAdmin
      .from("client_users")
      .select("id, user_id, client_id, clients(name)")
      .order("created_at", { ascending: false });

    if (userId) query = query.eq("user_id", userId as string);
    if (clientId) query = query.eq("client_id", clientId as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/admin/assignments", requireAdmin, async (req, res) => {
    const { userId, clientId } = req.body || {};
    if (!userId || !clientId) {
      return res.status(400).json({ error: "userId and clientId are required" });
    }

    const { data, error } = await supabaseAdmin
      .from("client_users")
      .insert([{ user_id: userId, client_id: clientId }])
      .select("id, user_id, client_id")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  app.delete("/api/admin/assignments/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from("client_users").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
  });

  app.post(
    "/api/admin/source-of-truth/preview",
    requireAdmin,
    sourceOfTruthUpload.single("file"),
    async (req, res) => {
      try {
        const uploaded = req.file;
        if (!uploaded || !uploaded.buffer || !uploaded.originalname) {
          return res.status(400).json({ error: "File is required. Upload a CSV or XLSX file." });
        }

        const result = await importSourceOfTruthFile(uploaded.originalname, uploaded.buffer, {
          dryRun: true,
          previewLimit: 8,
        });
        res.json(result);
      } catch (error: any) {
        const message = error?.message || "Failed to preview source-of-truth upload";
        res.status(400).json({ error: message });
      }
    }
  );

  app.post(
    "/api/admin/source-of-truth/upload",
    requireAdmin,
    sourceOfTruthUpload.single("file"),
    async (req, res) => {
      try {
        const uploaded = req.file;
        if (!uploaded || !uploaded.buffer || !uploaded.originalname) {
          return res.status(400).json({ error: "File is required. Upload a CSV or XLSX file." });
        }

        const expectedFingerprint =
          typeof req.body?.expectedFingerprint === "string"
            ? req.body.expectedFingerprint.trim()
            : "";
        const result = await importSourceOfTruthFile(uploaded.originalname, uploaded.buffer, {
          expectedFingerprint: expectedFingerprint || undefined,
        });
        res.json(result);
      } catch (error: any) {
        const message = error?.message || "Failed to process source-of-truth upload";
        const statusCode = String(message).toLowerCase().includes("fingerprint mismatch") ? 409 : 400;
        res.status(statusCode).json({ error: message });
      }
    }
  );

  // =============================================================================
  // VEHICLES API ROUTES
  // =============================================================================

  app.get("/api/vehicles", async (req, res) => {
    try {
      const scope = await getClientScope(req, res);
      if (!scope) return;
      const clientIds = scope.clientIds;

      const status = req.query.status as string | undefined;
      const efficiencyRating = (req.query.efficiencyRating || req.query.efficiency_rating) as string | undefined;
      const driverName = (req.query.driverName || req.query.driver_name) as string | undefined;

      const vehicles = await storage.getVehicles({
        status: status && vehicleStatusEnum.safeParse(status).success ? (status as any) : undefined,
        efficiencyRating,
        driverName,
        clientIds,
      });

      res.json(vehicles.filter(hasFuelTankCapacity));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vehicles" });
    }
  });

  app.get("/api/vehicles/:id", async (req, res) => {
    try {
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      if (!hasFuelTankCapacity(vehicle)) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      const isAdmin = req.auth?.profile?.role === "admin";
      if (!isAdmin && !req.auth?.clientIds.includes(vehicle.clientId)) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      res.json(vehicle);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch vehicle" });
    }
  });

  app.post("/api/vehicles", requireAdmin, async (req, res) => {
    try {
      const isAdmin = req.auth?.profile?.role === "admin";
      const validatedData = insertVehicleSchema.parse(req.body);
      const clientId = (validatedData as any).clientId as string | undefined;

      if (!isAdmin) {
        if (!clientId || !req.auth?.clientIds.includes(clientId)) {
          return res.status(403).json({ error: "Invalid client assignment" });
        }
      }

      const vehicle = await storage.createVehicle(validatedData);
      res.status(201).json(vehicle);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid vehicle data", details: error.message });
    }
  });

  app.put("/api/vehicles/:id", requireAdmin, async (req, res) => {
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

  app.delete("/api/vehicles/:id", requireAdmin, async (req, res) => {
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

  app.get("/api/fuel-events", async (req, res) => {
    try {
      const requestedVehicleIds = parseList(
        req.query.vehicleIds || req.query.vehicle_ids || req.query.vehicleId || req.query.vehicle_id
      );
      const scoped = await getScopedVehicleIds(req, res, requestedVehicleIds);
      if (!scoped) return;
      const vehicleIdsFilter = scoped.vehicleIds;

      const eventType = req.query.eventType || req.query.event_type;
      const events = await storage.getFuelEvents({
        vehicleIds: vehicleIdsFilter,
        eventType: fuelEventTypeEnum.safeParse(eventType).success ? (eventType as any) : undefined,
        startDate: parseDate(req.query.startDate || req.query.start_date),
        endDate: parseDate(req.query.endDate || req.query.end_date),
      });

      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch fuel events" });
    }
  });

  app.post("/api/fuel-events", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertFuelEventSchema.parse(req.body);
      const event = await storage.createFuelEvent(validatedData);
      res.status(201).json(event);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid fuel event data", details: error.message });
    }
  });

  app.put("/api/fuel-events/:id", requireAdmin, async (req, res) => {
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

  app.delete("/api/fuel-events/:id", requireAdmin, async (req, res) => {
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

  app.get("/api/daily-metrics", async (req, res) => {
    try {
      const requestedVehicleIds = parseList(
        req.query.vehicleIds || req.query.vehicle_ids || req.query.vehicleId || req.query.vehicle_id
      );
      const scoped = await getScopedVehicleIds(req, res, requestedVehicleIds);
      if (!scoped) return;
      const vehicleIdsFilter = scoped.vehicleIds;

      const metrics = await storage.getDailyMetrics({
        vehicleIds: vehicleIdsFilter,
        startDate: parseDate(req.query.startDate || req.query.start_date),
        endDate: parseDate(req.query.endDate || req.query.end_date),
      });

      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch daily metrics" });
    }
  });

  app.post("/api/daily-metrics", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertDailyMetricsSchema.parse(req.body);
      const metric = await storage.createDailyMetric(validatedData);
      res.status(201).json(metric);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid daily metric data", details: error.message });
    }
  });

  app.get("/api/daily-metrics/aggregated", async (req, res) => {
    try {
      const requestedVehicleIds = parseList(req.query.vehicleIds || req.query.vehicle_ids);
      const scoped = await getScopedVehicleIds(req, res, requestedVehicleIds);
      if (!scoped) return;
      const aggregated = await storage.aggregateDailyMetrics({
        vehicleIds: scoped.vehicleIds,
        startDate: parseDate(req.query.startDate || req.query.start_date),
        endDate: parseDate(req.query.endDate || req.query.end_date),
      });
      res.json(aggregated);
    } catch (error) {
      res.status(500).json({ error: "Failed to aggregate daily metrics" });
    }
  });

  // =============================================================================
  // RAW SENSOR TELEMETRY API ROUTES
  // =============================================================================

  app.get("/api/raw-sensor-data", async (req, res) => {
    try {
      const requestedVehicleIds = parseList(
        req.query.vehicleIds || req.query.vehicle_ids || req.query.vehicleId || req.query.vehicle_id
      );
      const scoped = await getScopedVehicleIds(req, res, requestedVehicleIds);
      if (!scoped) return;

      const vehicleIdsFilter = scoped.vehicleIds || [];
      if (!vehicleIdsFilter.length) return res.json([]);

      const startDate = parseDate(req.query.startDate || req.query.start_date);
      const endDate = parseDate(req.query.endDate || req.query.end_date);
      const startIso = startDate?.toISOString();
      const endIso = endDate?.toISOString();

      let imeiRows: Array<{ id: string; imei?: string | null }> = [];
      const { data: vehiclesWithImei, error: vehicleImeiError } = await supabaseAdmin
        .from("vehicles")
        .select("id, imei")
        .in("id", vehicleIdsFilter);

      if (vehicleImeiError) {
        if (!isMissingColumnError(vehicleImeiError)) throw vehicleImeiError;
        const { data: fallbackVehicles, error: fallbackVehicleError } = await supabaseAdmin
          .from("vehicles")
          .select("id")
          .in("id", vehicleIdsFilter);
        if (fallbackVehicleError) throw fallbackVehicleError;
        imeiRows = (fallbackVehicles || []) as Array<{ id: string; imei?: string | null }>;
      } else {
        imeiRows = (vehiclesWithImei || []) as Array<{ id: string; imei?: string | null }>;
      }

      const imeiValues = Array.from(
        new Set(
          imeiRows
            .map((row) => normalizeImei(row.imei))
            .filter((value): value is string => Boolean(value))
        )
      );

      const idFilters = [
        { column: "vehicle_id", values: vehicleIdsFilter },
        { column: "imei_number", values: imeiValues },
      ].filter((entry) => entry.values.length > 0);

      let rows: any[] | null = null;
      let lastError: any = null;

      const dateColumns = ["date", "timestamp", "created_at"];
      for (const filter of idFilters) {
        if (rows !== null) break;

        for (const dateColumn of dateColumns) {
          let query = supabaseAdmin.from("raw_sensor_data").select("*").in(filter.column, filter.values);
          if (startIso) query = query.gte(dateColumn, startIso);
          if (endIso) query = query.lte(dateColumn, endIso);
          query = query.order(dateColumn, { ascending: true }).limit(10000);

          const { data, error } = await query;
          if (!error) {
            rows = data || [];
            break;
          }

          lastError = error;
          if (!isMissingColumnError(error)) break;
        }
      }

      // Final fallback if date columns were not available: fetch by id/imei and filter timestamps in JS.
      if (rows === null) {
        for (const filter of idFilters) {
          let query = supabaseAdmin.from("raw_sensor_data").select("*").in(filter.column, filter.values).limit(10000);
          const { data, error } = await query;
          if (!error) {
            rows = data || [];
            break;
          }

          lastError = error;
          if (!isMissingColumnError(error)) break;
        }
      }

      if (rows === null) {
        throw lastError || new Error("Unable to fetch raw sensor data");
      }

      const mapped = rows
        .map((row) => {
          const timestamp = parseSensorTimestamp(row);
          // Canonical sensor mapping:
          // - AF (or fuel alias) = calibrated fuel.
          // - RF (or rawFuel alias) = raw fuel without spike correction.
          const fuel = Number(
            row?.af ??
              row?.fuel ??
              row?.payload?.af ??
              row?.payload?.fuel
          );
          const rawFuel = Number(
            row?.rf ??
              row?.rawFuel ??
              row?.payload?.rf ??
              row?.payload?.rawFuel
          );
          const odometer = Number(row?.odo ?? row?.odometer ?? row?.payload?.odo ?? row?.payload?.odometer);
          const speed = Number(row?.spid ?? row?.speed ?? row?.payload?.spid ?? row?.payload?.speed);
          const altitude = Number(row?.alt ?? row?.altitude ?? row?.payload?.alt ?? row?.payload?.altitude);

          return {
            id: row?.id,
            vehicleId: row?.vehicle_id ?? null,
            imeiNumber: normalizeImei(row?.imei_number) ?? null,
            timestamp,
            fuel: Number.isFinite(fuel) ? fuel : null,
            rawFuel: Number.isFinite(rawFuel) ? rawFuel : null,
            odometer: Number.isFinite(odometer) ? odometer : null,
            speed: Number.isFinite(speed) ? speed : null,
            altitude: Number.isFinite(altitude) ? altitude : null,
          };
        })
        .filter((row) => {
          if (!row.timestamp) return false;
          const time = new Date(row.timestamp).getTime();
          if (Number.isNaN(time)) return false;
          if (startIso && time < new Date(startIso).getTime()) return false;
          if (endIso && time > new Date(endIso).getTime()) return false;
          return true;
        })
        .sort((a, b) => new Date(a.timestamp as string).getTime() - new Date(b.timestamp as string).getTime());

      res.json(mapped);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch raw sensor telemetry" });
    }
  });

  // =============================================================================
  // KPI AGGREGATES API ROUTES
  // =============================================================================

  app.get("/api/kpi-aggregates", async (req, res) => {
    try {
      const requestedVehicleIds = parseList(req.query.vehicleIds || req.query.vehicle_ids);
      const scoped = await getScopedVehicleIds(
        req,
        res,
        req.query.vehicleId ? [String(req.query.vehicleId)] : requestedVehicleIds
      );
      if (!scoped) return;

      const aggregates = await storage.getKpiAggregates({
        vehicleId: scoped.vehicleIds?.length === 1 ? scoped.vehicleIds[0] : undefined,
        vehicleIds: scoped.vehicleIds,
        startDate: parseDate(req.query.startDate || req.query.start_date),
        endDate: parseDate(req.query.endDate || req.query.end_date),
        scope: req.query.scope as string | undefined,
      });
      res.json(aggregates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch KPI aggregates" });
    }
  });

  app.post("/api/kpi-aggregates", requireAdmin, async (req, res) => {
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

  app.get("/api/dashboard/kpis", async (req, res) => {
    try {
      const scope = await getClientScope(req, res);
      if (!scope) return;
      const clientIds = scope.clientIds;

      const requestedVehicleIds = parseList(req.query.vehicleIds || req.query.vehicle_ids);
      let vehicleIdsFilter: string[] | undefined = requestedVehicleIds.length ? requestedVehicleIds : undefined;

      if (clientIds && clientIds.length > 0) {
        const vehicles = await storage.getVehicles({ clientIds });
        const allowedIds = vehicles.filter(hasFuelTankCapacity).map((v) => v.id);
        if (vehicleIdsFilter) {
          vehicleIdsFilter = vehicleIdsFilter.filter((id) => allowedIds.includes(id));
        } else {
          vehicleIdsFilter = allowedIds;
        }
      }

      const vehicles = (await storage.getVehicles({ clientIds })).filter(hasFuelTankCapacity);
      const scopedVehicles = vehicleIdsFilter?.length
        ? vehicles.filter((v) => vehicleIdsFilter!.includes(v.id))
        : vehicles;

      const totalVehicles = scopedVehicles.length;
      const activeVehicles = scopedVehicles.filter((v) => v.status === "Active").length;

      const fuelEvents = await storage.getFuelEvents({
        vehicleIds: scopedVehicles.map((v) => v.id),
        startDate: parseDate(req.query.startDate || req.query.start_date),
        endDate: parseDate(req.query.endDate || req.query.end_date),
      });

      const totalRefills = fuelEvents.filter((e) => e.eventType === "refill").length;
      const totalThefts = fuelEvents.filter((e) => e.eventType === "theft").length;

      const totalFuelUsed = scopedVehicles.reduce((sum, v) => sum + (v.totalFuelUsed ?? 0), 0);
      const totalDistance = scopedVehicles.reduce((sum, v) => sum + (v.totalDistance ?? 0), 0);
      const totalEngineHours = scopedVehicles.reduce((sum, v) => sum + (v.totalEngineHours ?? 0), 0);

      res.json({
        totalVehicles,
        activeVehicles,
        totalRefills,
        totalThefts,
        totalFuelUsed,
        totalDistance,
        totalEngineHours,
        fleetUtilization: Math.round((activeVehicles || 0) / (totalVehicles || 1) * 100),
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  app.post("/api/dashboard/kpis", async (req, res) => {
    try {
      const { vehicleIds, dateRange, currency } = req.body;

      const requestedVehicleIds = Array.isArray(vehicleIds) ? vehicleIds : [];
      const scoped = await getScopedVehicleIds(req, res, requestedVehicleIds);
      if (!scoped) return;

      const filters = {
        vehicleIds: scoped.vehicleIds || [],
        dateRange: dateRange || { preset: "last_7_days" },
        currency: currency || "KES",
      };

      const kpis = await storage.computeFleetKpis(filters);
      res.json(kpis);
    } catch (error) {
      res.status(500).json({ error: "Failed to compute fleet KPIs" });
    }
  });

  app.post("/api/charts/fuel-consumption", async (req, res) => {
    try {
      const { vehicleIds, dateRange } = req.body;
      const requestedVehicleIds = Array.isArray(vehicleIds) ? vehicleIds : [];
      const scoped = await getScopedVehicleIds(req, res, requestedVehicleIds);
      if (!scoped) return;

      const chartData = await storage.getChartData("fuel-consumption", {
        vehicleIds: scoped.vehicleIds || [],
        dateRange: dateRange || { preset: "last_7_days" },
      });
      res.json(chartData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch fuel consumption chart data" });
    }
  });

  app.post("/api/charts/performance-metrics", async (req, res) => {
    try {
      const { vehicleIds, dateRange } = req.body;
      const requestedVehicleIds = Array.isArray(vehicleIds) ? vehicleIds : [];
      const scoped = await getScopedVehicleIds(req, res, requestedVehicleIds);
      if (!scoped) return;

      const chartData = await storage.getChartData("performance-metrics", {
        vehicleIds: scoped.vehicleIds || [],
        dateRange: dateRange || { preset: "last_7_days" },
      });
      res.json(chartData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch performance metrics chart data" });
    }
  });

  app.get("/api/focused-asset/:vehicleId/summary", async (req, res) => {
    try {
      const scoped = await getScopedVehicleIds(req, res, [req.params.vehicleId]);
      if (!scoped) return;
      if (!scoped.vehicleIds || scoped.vehicleIds.length === 0) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      const parsedDateRange = req.query.dateRange
        ? JSON.parse(req.query.dateRange as string)
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

  app.post("/api/validate-filters", async (req, res) => {
    try {
      const validatedFilters = globalFilterSchema.parse(req.body);
      res.json({ valid: true, filters: validatedFilters });
    } catch (error: any) {
      res.status(400).json({ valid: false, error: "Invalid filter data", details: error.message });
    }
  });

  // Reports routes
  setupReportsRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}

