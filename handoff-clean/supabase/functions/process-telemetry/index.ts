import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ParsedFuelReportName = {
  report_name: string;
  imei_number: string | null;
  client_name: string | null;
  assigned_asset: string | null;
};

type FuelDerivedRecord = {
  parsed: ParsedFuelReportName;
  context: any;
  transformed: any;
};

type FuelSyncResult = {
  vehicleId: string | null;
  status: string;
  message: string | null;
};

type Trip137UpsertResult = {
  count: number;
  firstImei: string | null;
  firstReportName: string | null;
};

type Report0LiveResult = {
  status: "updated" | "stale_ignored" | "skipped";
  vehicleId: string | null;
  imei: string | null;
  reason: string | null;
};

type VehicleIdentity = {
  imei: string | null;
  clientName: string | null;
  assignedAsset: string | null;
};

type ProcessingDiagnostics = {
  duplicateNotes: string[];
};

type Report0PurgeSummary = {
  enabled: boolean;
  retentionHours: number;
  cutoffIso: string | null;
  batchSize: number;
  maxLoops: number;
  statuses: string[] | null;
  source: string | null;
  loops: number;
  deleted: number;
  error: string | null;
};

const TRIP_REPORT_TABLE = "trip_reports";
const TRIP_REPORT_TABLE_ALIASES = new Set(["trip_reports", "daily_movement_reports"]);

function noteDuplicateHandling(diag: ProcessingDiagnostics | null | undefined, note: string): void {
  const trimmed = toCleanString(note);
  if (!diag || !trimmed) return;
  if (!diag.duplicateNotes.includes(trimmed)) {
    diag.duplicateNotes.push(trimmed);
  }
}

function composeDuplicateInfoMessage(diag: ProcessingDiagnostics | null | undefined): string | null {
  if (!diag || !Array.isArray(diag.duplicateNotes) || diag.duplicateNotes.length === 0) return null;
  return `INFO: duplicate rows handled (${diag.duplicateNotes.join("; ")})`;
}

function normalizeTableName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isTripReportTableName(value: unknown): boolean {
  return TRIP_REPORT_TABLE_ALIASES.has(normalizeTableName(value));
}

function looksLikeTripRecord(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  return Boolean(
    toCleanString(value?.asset) ||
    toCleanString(value?.start_time) ||
    toCleanString(value?.end_time) ||
    toCleanString(value?.date) ||
    normalizeImei(value?.imei)
  );
}

type VehicleProfileItem = {
  asset: string;
  imei: string | null;
  clientName: string | null;
  assetType: string | null;
  makeModel: string | null;
  engineSize: number | null;
  distance: number | null;
  hours: number | null;
  sensor: string | null;
  fuelCapacity: number | null;
  initialReading: number | null;
  totalRefills: number | null;
  refillCount: number | null;
  totalDrains: number | null;
  drainCount: number | null;
  fuelUsed: number | null;
  finalFuelReading: number | null;
  consumptionText: string | null;
  consumptionNumeric: number | null;
  fuelEconomyDescription: string | null;
  fuelUnit: string | null;
  analogType: number | null;
  raw: any;
};

function transform(payload: any, mappingConfig: any): any {
  const result: any = {};
  const { fields, transforms, defaults } = mappingConfig ?? {};

  if (defaults) {
    Object.assign(result, defaults);
  }

  if (fields) {
    for (const [srcKey, targetKey] of Object.entries(fields)) {
      const val = String(srcKey)
        .split(".")
        .reduce((o, i) => o?.[i], payload);
      if (val !== undefined) {
        result[targetKey as string] = val;
      }
    }
  }

  if (transforms) {
    // Placeholder for custom transform logic.
  }

  return result;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function extractMissingColumn(error: any, tableName: string): string | null {
  const message = String(error?.message ?? "");
  const details = String(error?.details ?? "");
  const hint = String(error?.hint ?? "");
  const combined = `${message} ${details} ${hint}`;

  const patterns: RegExp[] = [
    new RegExp(`column\\s+${tableName}\\.([a-zA-Z0-9_]+)\\s+does not exist`, "i"),
    /column\s+[a-zA-Z0-9_]+\.([a-zA-Z0-9_]+)\s+does not exist/i,
    /column\s+"?([a-zA-Z0-9_]+)"?\s+of relation\s+"?[a-zA-Z0-9_]+"?\s+does not exist/i,
    /Could not find the ['"]([a-zA-Z0-9_]+)['"] column of ['"]([a-zA-Z0-9_]+)['"]/i
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (!match) continue;

    if (match.length >= 3 && pattern.source.includes("Could not find")) {
      const column = match[1];
      const table = match[2];
      if (table.toLowerCase() !== tableName.toLowerCase()) continue;
      return column;
    }

    const column = match[1];
    if (column) return column;
  }

  return null;
}

function removeColumnFromPayload(payload: any, column: string): boolean {
  if (Array.isArray(payload)) {
    let removed = false;
    for (const row of payload) {
      if (row && typeof row === "object" && column in row) {
        delete row[column];
        removed = true;
      }
    }
    return removed;
  }

  if (payload && typeof payload === "object" && column in payload) {
    delete payload[column];
    return true;
  }

  return false;
}

async function executeWithMissingColumnFallback<T>(
  tableName: string,
  sourcePayload: any,
  operation: (candidatePayload: any) => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; error: any; finalPayload: any }> {
  const payload = deepClone(sourcePayload);
  const maxAttempts = 25;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await operation(payload);
    if (!error) {
      return { data, error: null, finalPayload: payload };
    }

    const missingColumn = extractMissingColumn(error, tableName);
    if (!missingColumn) {
      return { data, error, finalPayload: payload };
    }

    const removed = removeColumnFromPayload(payload, missingColumn);
    if (!removed) {
      return { data, error, finalPayload: payload };
    }

    console.warn(`Schema fallback applied for ${tableName}: removed missing column "${missingColumn}"`);
  }

  return {
    data: null,
    error: new Error(`Could not resolve schema mismatch for ${tableName} within fallback attempts.`),
    finalPayload: payload
  };
}

function dedupeRecordsForUpsert(records: any[], upsertTarget: string | null | undefined): any[] {
  if (!Array.isArray(records) || records.length <= 1) return records;
  if (!upsertTarget) return records;

  const targetColumns = String(upsertTarget)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!targetColumns.length) return records;

  const deduped = new Map<string, any>();
  for (const record of records) {
    const key = targetColumns.map((column) => JSON.stringify(record?.[column] ?? null)).join("|");
    deduped.set(key, record);
  }
  return Array.from(deduped.values());
}

function normalizeRawSensorTimeKey(value: unknown): string | null {
  const text = toCleanString(value);
  if (!text) return null;
  return toIsoTimestamp(text) ?? text;
}

function dedupeRawSensorRowsForUpsert(rows: any[]): any[] {
  if (!Array.isArray(rows) || rows.length <= 1) return rows;

  const deduped = new Map<string, any>();
  let fallbackIndex = 0;

  for (const row of rows) {
    const imei = normalizeImei(row?.imei_number);
    const tsKey =
      normalizeRawSensorTimeKey(row?.date) ??
      normalizeRawSensorTimeKey(row?.timestamp);

    if (!imei || !tsKey) {
      deduped.set(`fallback:${fallbackIndex++}`, row);
      continue;
    }

    deduped.set(`${imei}|${tsKey}`, row);
  }

  return Array.from(deduped.values());
}

function isRawSensorUniqueViolation(error: any): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  const details = String(error?.details ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  return (
    code === "23505" ||
    message.includes("ux_raw_sensor_data_imei_ts") ||
    details.includes("ux_raw_sensor_data_imei_ts")
  );
}

async function deleteRawSensorByNaturalKey(
  supabaseAdmin: any,
  row: any,
  broadenMatch = false
): Promise<void> {
  const imei = normalizeImei(row?.imei_number);
  if (!imei) return;

  const dateKey = normalizeRawSensorTimeKey(row?.date);
  const timestampKey = normalizeRawSensorTimeKey(row?.timestamp);

  const plans = broadenMatch
    ? [
        { tsCol: "date", tsValue: dateKey },
        { tsCol: "timestamp", tsValue: timestampKey }
      ]
    : [
        { tsCol: "date", tsValue: dateKey },
        { tsCol: "timestamp", tsValue: timestampKey },
        { tsCol: "date", tsValue: timestampKey },
        { tsCol: "timestamp", tsValue: dateKey }
      ];

  let sawMissingColumn = false;

  for (const plan of plans) {
    if (!plan.tsValue) continue;

    const { error } = await supabaseAdmin
      .from("raw_sensor_data")
      .delete()
      .eq("imei_number", imei)
      .eq(plan.tsCol, plan.tsValue);

    if (!error) return;

    const missingColumn = extractMissingColumn(error, "raw_sensor_data");
    if (missingColumn) {
      sawMissingColumn = true;
      continue;
    }

    throw error;
  }

  if (sawMissingColumn && !broadenMatch) {
    await deleteRawSensorByNaturalKey(supabaseAdmin, row, true);
  }
}

async function upsertRawSensorRowsWithFallback(
  supabaseAdmin: any,
  rows: any[],
  batchSize = 1000,
  diagnostics?: ProcessingDiagnostics
): Promise<void> {
  if (!rows.length) return;

  const dedupedRows = dedupeRawSensorRowsForUpsert(rows);
  const payloadDuplicates = Math.max(0, rows.length - dedupedRows.length);
  if (payloadDuplicates > 0) {
    noteDuplicateHandling(diagnostics, `raw_sensor_data payload deduped ${payloadDuplicates}`);
  }
  const conflictTargets = ["imei_number,date", "imei_number,timestamp"];
  let skippedInsertDuplicates = 0;
  let usedInsertFallback = false;

  for (let i = 0; i < dedupedRows.length; i += batchSize) {
    const batch = dedupedRows.slice(i, i + batchSize);
    if (!batch.length) continue;

    const hasDate = batch.some((row) => toCleanString(row?.date));
    const hasTimestamp = batch.some((row) => toCleanString(row?.timestamp));
    const orderedTargets = conflictTargets.filter((target) =>
      target.endsWith("date") ? hasDate : hasTimestamp
    );
    if (!orderedTargets.length) {
      orderedTargets.push(...conflictTargets);
    }

    let upserted = false;
    let lastUpsertError: any = null;

    for (const onConflict of orderedTargets) {
      const { error } = await executeWithMissingColumnFallback(
        "raw_sensor_data",
        batch,
        async (candidatePayload) =>
          await supabaseAdmin.from("raw_sensor_data").upsert(candidatePayload, {
            onConflict
          })
      );

      if (!error) {
        upserted = true;
        break;
      }

      const missingColumn = extractMissingColumn(error, "raw_sensor_data");
      if (isNoUniqueConstraintError(error) || missingColumn) {
        lastUpsertError = error;
        continue;
      }

      throw error;
    }

    if (upserted) continue;

    // Last-resort insert path: skip known duplicate-key errors and keep processing.
    usedInsertFallback = true;
    for (const row of batch) {
      await deleteRawSensorByNaturalKey(supabaseAdmin, row);
      const { error } = await executeWithMissingColumnFallback(
        "raw_sensor_data",
        row,
        async (candidatePayload) => await supabaseAdmin.from("raw_sensor_data").insert(candidatePayload)
      );
      if (!error) continue;
      if (isRawSensorUniqueViolation(error)) {
        await deleteRawSensorByNaturalKey(supabaseAdmin, row, true);
        const retry = await executeWithMissingColumnFallback(
          "raw_sensor_data",
          row,
          async (candidatePayload) => await supabaseAdmin.from("raw_sensor_data").insert(candidatePayload)
        );
        if (!retry.error) continue;
        if (isRawSensorUniqueViolation(retry.error)) {
          skippedInsertDuplicates += 1;
          continue;
        }
        throw retry.error;
      }
      throw error;
    }

    if (lastUpsertError) {
      console.warn(
        `raw_sensor_data upsert used insert fallback for batch after conflict resolution issue: ${lastUpsertError.message ?? lastUpsertError}`
      );
    }
  }

  if (usedInsertFallback) {
    noteDuplicateHandling(diagnostics, "raw_sensor_data used conflict fallback");
  }
  if (skippedInsertDuplicates > 0) {
    noteDuplicateHandling(diagnostics, `raw_sensor_data skipped ${skippedInsertDuplicates} already-existing duplicates`);
  }
}

function normalizeFuelEventTimeKey(value: unknown): string | null {
  const text = toCleanString(value);
  if (!text) return null;
  return toIsoTimestamp(text) ?? text;
}

function normalizeFuelEventLocationKey(value: unknown): string {
  const text = toCleanString(value);
  return text ? text.toLowerCase() : "";
}

function dedupeFuelEventRowsForReplacement(rows: any[]): any[] {
  if (!Array.isArray(rows) || rows.length <= 1) return rows;

  const deduped = new Map<string, any>();
  let fallbackIndex = 0;

  for (const row of rows) {
    const vehicleId = toOriginalText(row?.vehicle_id);
    const eventType = toCleanString(row?.event_type);
    const timestamp =
      normalizeFuelEventTimeKey(row?.event_timestamp) ??
      normalizeFuelEventTimeKey(row?.event_time);
    const volume = toNumeric(row?.fuel_volume_litres ?? row?.refilled ?? row?.volume_liters);
    const locationKey = normalizeFuelEventLocationKey(row?.location);

    if (!vehicleId || !eventType || !timestamp) {
      deduped.set(`fallback:${fallbackIndex++}`, row);
      continue;
    }

    const key = [
      vehicleId,
      eventType,
      timestamp,
      volume === null ? "null" : Math.abs(volume).toFixed(3),
      locationKey
    ].join("|");
    deduped.set(key, row);
  }

  return Array.from(deduped.values());
}

async function deleteFuelEventByNaturalKey(
  supabaseAdmin: any,
  row: any,
  broadenMatch = false
): Promise<void> {
  const vehicleId = toOriginalText(row?.vehicle_id);
  const eventType = toCleanString(row?.event_type);
  const timestamp =
    normalizeFuelEventTimeKey(row?.event_timestamp) ??
    normalizeFuelEventTimeKey(row?.event_time);
  const volume = toNumeric(row?.fuel_volume_litres ?? row?.refilled ?? row?.volume_liters);
  const location = toOriginalText(row?.location);

  if (!vehicleId || !eventType || !timestamp) return;

  const plans = broadenMatch
    ? [
        { tsCol: "event_timestamp", volCol: null as string | null, includeLocation: false },
        { tsCol: "event_time", volCol: null as string | null, includeLocation: false }
      ]
    : [
        { tsCol: "event_timestamp", volCol: "fuel_volume_litres", includeLocation: true },
        { tsCol: "event_timestamp", volCol: "refilled", includeLocation: true },
        { tsCol: "event_time", volCol: "fuel_volume_litres", includeLocation: true },
        { tsCol: "event_time", volCol: "refilled", includeLocation: true },
        { tsCol: "event_timestamp", volCol: null as string | null, includeLocation: false },
        { tsCol: "event_time", volCol: null as string | null, includeLocation: false }
      ];

  let sawMissingColumn = false;
  let lastError: any = null;

  for (const plan of plans) {
    let query = supabaseAdmin
      .from("fuel_events")
      .delete()
      .eq("vehicle_id", vehicleId)
      .eq("event_type", eventType)
      .eq(plan.tsCol, timestamp);

    if (plan.volCol && volume !== null) {
      query = query.eq(plan.volCol, volume);
    }

    if (plan.includeLocation) {
      if (location) {
        query = query.eq("location", location);
      } else {
        query = query.is("location", null);
      }
    }

    const { error } = await query;
    if (!error) return;

    const missingColumn = extractMissingColumn(error, "fuel_events");
    if (missingColumn) {
      sawMissingColumn = true;
      lastError = error;
      continue;
    }

    throw error;
  }

  if (sawMissingColumn && !broadenMatch) {
    await deleteFuelEventByNaturalKey(supabaseAdmin, row, true);
    return;
  }

  if (lastError && !sawMissingColumn) {
    throw lastError;
  }
}

async function replaceFuelEventRowsWithFallback(
  supabaseAdmin: any,
  rows: any[],
  diagnostics?: ProcessingDiagnostics
): Promise<void> {
  if (!rows.length) return;

  const dedupedRows = dedupeFuelEventRowsForReplacement(rows);
  const payloadDuplicates = Math.max(0, rows.length - dedupedRows.length);
  if (payloadDuplicates > 0) {
    noteDuplicateHandling(diagnostics, `fuel_events payload deduped ${payloadDuplicates}`);
  }

  let overwriteRetries = 0;
  let skippedDuplicates = 0;

  for (const row of dedupedRows) {
    await deleteFuelEventByNaturalKey(supabaseAdmin, row);

    let { error: insertError } = await executeWithMissingColumnFallback(
      "fuel_events",
      row,
      async (candidatePayload) => await supabaseAdmin.from("fuel_events").insert(candidatePayload)
    );

    if (!insertError) continue;

    if (isUniqueViolationError(insertError)) {
      await deleteFuelEventByNaturalKey(supabaseAdmin, row, true);
      const retry = await executeWithMissingColumnFallback(
        "fuel_events",
        row,
        async (candidatePayload) => await supabaseAdmin.from("fuel_events").insert(candidatePayload)
      );

      if (!retry.error) {
        overwriteRetries += 1;
        continue;
      }

      if (isUniqueViolationError(retry.error)) {
        skippedDuplicates += 1;
        continue;
      }

      insertError = retry.error;
    }

    if (insertError) throw insertError;
  }

  if (overwriteRetries > 0) {
    noteDuplicateHandling(diagnostics, `fuel_events overwrite-retried ${overwriteRetries}`);
  }
  if (skippedDuplicates > 0) {
    noteDuplicateHandling(diagnostics, `fuel_events skipped ${skippedDuplicates} already-existing duplicates`);
  }
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const candidates = ["items", "rows", "data", "events", "refills", "drains", "telemetry"];
  for (const key of candidates) {
    if (Array.isArray((value as any)[key])) return (value as any)[key];
  }

  return [];
}

function getReport50DataContainer(context: any): any {
  if (context?.data && typeof context.data === "object" && !Array.isArray(context.data)) {
    return context.data;
  }
  return {};
}

async function insertRowsWithFallback(
  supabaseAdmin: any,
  tableName: string,
  rows: any[],
  batchSize = 1000
): Promise<void> {
  if (!rows.length) return;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await executeWithMissingColumnFallback(
      tableName,
      batch,
      async (candidatePayload) => await supabaseAdmin.from(tableName).insert(candidatePayload)
    );
    if (error) throw error;
  }
}

async function insertRowsSkippingUniqueViolations(
  supabaseAdmin: any,
  tableName: string,
  rows: any[]
): Promise<number> {
  if (!rows.length) return 0;

  let skippedDuplicates = 0;

  for (const row of rows) {
    const { error } = await executeWithMissingColumnFallback(
      tableName,
      row,
      async (candidatePayload) => await supabaseAdmin.from(tableName).insert(candidatePayload)
    );

    if (!error) continue;
    if (isUniqueViolationError(error)) {
      skippedDuplicates += 1;
      continue;
    }

    throw error;
  }

  return skippedDuplicates;
}

async function replaceRowsByConflictTarget(
  supabaseAdmin: any,
  tableName: string,
  rows: any[],
  upsertTarget: string
): Promise<number> {
  if (!rows.length) return 0;

  const baseColumns = String(upsertTarget)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!baseColumns.length) {
    return await insertRowsSkippingUniqueViolations(supabaseAdmin, tableName, rows);
  }

  let skippedDuplicates = 0;

  for (const row of rows) {
    let deleteColumns = [...baseColumns];
    let deleteAttempted = false;

    while (deleteColumns.length > 0) {
      let deleteQuery = supabaseAdmin.from(tableName).delete();
      let hasComparableColumn = false;

      for (const column of deleteColumns) {
        if (!Object.prototype.hasOwnProperty.call(row, column)) continue;
        hasComparableColumn = true;
        const value = row[column];
        if (value === null || value === undefined) {
          deleteQuery = deleteQuery.is(column, null);
        } else {
          deleteQuery = deleteQuery.eq(column, value);
        }
      }

      if (!hasComparableColumn) break;

      deleteAttempted = true;
      const { error: deleteError } = await deleteQuery;
      if (!deleteError) break;

      const missingColumn = extractMissingColumn(deleteError, tableName);
      if (missingColumn && deleteColumns.includes(missingColumn)) {
        deleteColumns = deleteColumns.filter((column) => column !== missingColumn);
        continue;
      }

      if (missingColumn) {
        break;
      }

      throw deleteError;
    }

    if (!deleteAttempted) {
      // No safe delete key available, so we still attempt insert to avoid dropping unique incoming rows.
    }

    const { error: insertError } = await executeWithMissingColumnFallback(
      tableName,
      row,
      async (candidatePayload) => await supabaseAdmin.from(tableName).insert(candidatePayload)
    );

    if (!insertError) continue;
    if (isUniqueViolationError(insertError)) {
      skippedDuplicates += 1;
      continue;
    }

    throw insertError;
  }

  return skippedDuplicates;
}

async function upsertDailyMetricsFromReport50(
  supabaseAdmin: any,
  row: any,
  payload: any,
  vehicleId: string | null,
  reportTimestamp: string,
  normalizedImei: string | null,
  clientName: string | null,
  registrationNumber: string | null,
  reportData: any,
  summary: any,
  refillDetails: any,
  drainDetails: any,
  diagnostics?: ProcessingDiagnostics
): Promise<void> {
  if (!vehicleId) return;

  const refills = asArray(refillDetails?.refills ?? refillDetails);
  const drains = asArray(drainDetails?.drains ?? drainDetails);
  const telemetryRows = asArray(reportData?.telemetry);

  const sumEventVolumes = (
    events: any[],
    keys: string[],
    mode: "absolute" | "signed" = "absolute"
  ): number | null => {
    let total = 0;
    let hasValue = false;
    for (const event of events) {
      if (!event || typeof event !== "object") continue;
      let value: number | null = null;
      for (const key of keys) {
        value = toNumeric((event as any)[key]);
        if (value !== null) break;
      }
      if (value === null) continue;
      hasValue = true;
      total += mode === "absolute" ? Math.abs(value) : value;
    }
    return hasValue ? total : null;
  };

  const telemetry = telemetryRows
    .map((point: any, index: number) => ({
      index,
      timestamp: toIsoTimestamp(point?.date ?? point?.timestamp ?? point?.event_time ?? point?.time),
      fuel: toNumeric(point?.rf ?? point?.af ?? point?.fuel ?? point?.fuel_level),
      odometer: toNumeric(point?.odo ?? point?.odometer)
    }))
    .filter((point) =>
      point.timestamp !== null ||
      point.fuel !== null ||
      point.odometer !== null
    );

  const sortedTelemetry = [...telemetry].sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      const tsDelta = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (!Number.isNaN(tsDelta) && tsDelta !== 0) return tsDelta;
    }
    return a.index - b.index;
  });

  const firstDefined = (selector: (point: any) => number | null): number | null => {
    for (const point of sortedTelemetry) {
      const value = selector(point);
      if (value !== null && Number.isFinite(value)) return value;
    }
    return null;
  };

  const lastDefined = (selector: (point: any) => number | null): number | null => {
    for (let i = sortedTelemetry.length - 1; i >= 0; i -= 1) {
      const value = selector(sortedTelemetry[i]);
      if (value !== null && Number.isFinite(value)) return value;
    }
    return null;
  };

  const metricDay = toDateOnly(payload?.end_date ?? payload?.start_date ?? reportTimestamp);

  const openingFuel = firstDefined((point) => point.fuel);
  const closingFuel = lastDefined((point) => point.fuel);

  const openingOdometer = firstDefined((point) => point.odometer);
  const closingOdometer = lastDefined((point) => point.odometer);

  const refillCount =
    toInteger(refillDetails?.refill_count ?? refillDetails?.refills_count ?? summary?.refill_count) ??
    refills.length ??
    0;
  const drainCount =
    toInteger(drainDetails?.drain_count ?? drainDetails?.drains_count ?? summary?.drain_count) ??
    drains.length ??
    0;

  const totalRefilledLitres =
    toNumeric(summary?.total_refilled ?? refillDetails?.total_refills ?? refillDetails?.totalRefills) ??
    sumEventVolumes(refills, ["refill", "refilled", "volume", "amount"], "absolute") ??
    0;
  const totalDrainedLitres =
    toNumeric(summary?.total_drained ?? drainDetails?.total_drains ?? drainDetails?.totalDrains) ??
    sumEventVolumes(drains, ["drain", "drained", "volume", "amount"], "absolute") ??
    0;

  const metricPayload = {
    raw_inbound_id: row.id,
    vehicle_id: vehicleId,
    metric_day: metricDay,
    total_fuel_consumed: toNumeric(summary?.fuel_used ?? summary?.fuelUsed ?? summary?.fuel_consumed) ?? 0,
    total_distance_traveled: toNumeric(summary?.total_distance ?? summary?.distance ?? summary?.total_distance_km) ?? 0,
    total_engine_hours: toNumeric(summary?.working_hours ?? summary?.engine_hours ?? summary?.total_engine_hours) ?? 0,
    idle_time_hours: toNumeric(summary?.idle_hours ?? summary?.idle_time_hours) ?? 0,
    refill_count: refillCount,
    drain_count: drainCount,
    operating_cost_kes: toNumeric(summary?.operating_cost_kes ?? summary?.cost_kes) ?? 0,
    operating_cost_ugx: toNumeric(summary?.operating_cost_ugx ?? summary?.cost_ugx) ?? 0,
    fuel_economy_km_l: toNumeric(summary?.fuel_economy ?? summary?.fuelEconomy),
    total_refilled_l: totalRefilledLitres,
    total_drained_l: totalDrainedLitres,
    fuel_level_open_l: openingFuel,
    fuel_level_close_l: closingFuel,
    odometer_open_km: openingOdometer,
    odometer_close_km: closingOdometer,
    generated_at:
      toIsoTimestamp(payload?.generated_date ?? reportTimestamp) ??
      toIsoTimestamp(reportTimestamp) ??
      new Date().toISOString(),
    imei_number: normalizedImei,
    client_name: clientName,
    registration_number: registrationNumber,
    report_type: "50"
  };

  const metricConflictTarget =
    normalizedImei && normalizedImei.length > 0
      ? "metric_day,imei_number"
      : "metric_day,vehicle_id";

  let { error: metricError } = await executeWithMissingColumnFallback(
    "daily_metrics",
    metricPayload,
    async (candidatePayload) =>
      await supabaseAdmin.from("daily_metrics").upsert(candidatePayload, {
        onConflict: metricConflictTarget
      })
  );

  if (
    metricError &&
    isNoUniqueConstraintError(metricError)
  ) {
    try {
      await replaceDailyMetricWithoutUniqueConstraint(
        supabaseAdmin,
        metricPayload,
        metricDay,
        normalizedImei,
        vehicleId
      );
      metricError = null;
      noteDuplicateHandling(diagnostics, "daily_metrics overwrite fallback used");
    } catch (fallbackError) {
      metricError = fallbackError;
    }
  }

  if (metricError) throw metricError;
}

function toCleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function toOriginalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str.trim().length > 0 ? str : null;
}

function normalizeImei(value: unknown): string | null {
  const raw = toCleanString(value);
  if (!raw) return null;
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.length > 0 ? digitsOnly : null;
}

function toIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDateOnly(value: unknown): string {
  const iso = toIsoTimestamp(value);
  if (iso) return iso.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function toDateOnlyStrict(value: unknown): string | null {
  const iso = toIsoTimestamp(value);
  return iso ? iso.slice(0, 10) : null;
}

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (text.length === 0) return null;
  const match = text.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function toInteger(value: unknown): number | null {
  const numeric = toNumeric(value);
  if (numeric === null) return null;
  return Math.trunc(numeric);
}

function toBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function parseDdMmYyyyHhMmSs(value: unknown): string | null {
  const raw = toCleanString(value);
  if (!raw) return null;

  const asIso = toIsoTimestamp(raw);
  if (asIso) return asIso;

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{1,2}):(\d{1,2}))?$/);
  if (!match) return null;

  const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = match;
  const isoCandidate = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${hh.padStart(2, "0")}:${mi.padStart(2, "0")}:${ss.padStart(2, "0")}Z`;
  return toIsoTimestamp(isoCandidate);
}

function isNoUniqueConstraintError(error: any): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("no unique or exclusion constraint");
}

function isUniqueViolationError(error: any): boolean {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "23505" || message.includes("duplicate key value violates unique constraint");
}

function addUtcDays(yyyyMmDd: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) return null;
  const parsed = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString();
}

function parseCsvValues(value: string | null | undefined): string[] | null {
  const raw = toCleanString(value);
  if (!raw) return null;
  const values = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return values.length > 0 ? values : null;
}

async function purgeOldReport0Rows(
  supabaseAdmin: any,
  options: {
    retentionHours: number;
    batchSize: number;
    maxLoops: number;
    statuses: string[] | null;
    source: string | null;
  }
): Promise<Report0PurgeSummary> {
  const retentionHours = Number.isFinite(options.retentionHours) ? options.retentionHours : 0;
  const batchSize = Math.max(1, Math.trunc(options.batchSize || 1));
  const maxLoops = Math.max(1, Math.trunc(options.maxLoops || 1));
  const statuses = Array.isArray(options.statuses) && options.statuses.length > 0 ? options.statuses : null;
  const source = toCleanString(options.source);

  if (retentionHours <= 0) {
    return {
      enabled: false,
      retentionHours,
      cutoffIso: null,
      batchSize,
      maxLoops,
      statuses,
      source,
      loops: 0,
      deleted: 0,
      error: null
    };
  }

  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();
  let deleted = 0;
  let loops = 0;

  try {
    for (let i = 0; i < maxLoops; i += 1) {
      let fetchQuery = supabaseAdmin
        .from("raw_telemetry_inbound")
        .select("id")
        .eq("report_type", "0")
        .lt("received_at", cutoffIso)
        .limit(batchSize);

      if (source) {
        fetchQuery = fetchQuery.eq("source", source);
      }

      if (statuses) {
        fetchQuery = fetchQuery.in("status", statuses);
      }

      const { data: rows, error: fetchError } = await fetchQuery;
      if (fetchError) throw fetchError;

      const ids = (rows ?? [])
        .map((row: any) => toCleanString(row?.id))
        .filter((id: string | null): id is string => Boolean(id));

      if (ids.length === 0) break;

      const { error: deleteError } = await supabaseAdmin
        .from("raw_telemetry_inbound")
        .delete()
        .in("id", ids);
      if (deleteError) throw deleteError;

      deleted += ids.length;
      loops += 1;

      if (ids.length < batchSize) break;
    }

    return {
      enabled: true,
      retentionHours,
      cutoffIso,
      batchSize,
      maxLoops,
      statuses,
      source,
      loops,
      deleted,
      error: null
    };
  } catch (err: any) {
    return {
      enabled: true,
      retentionHours,
      cutoffIso,
      batchSize,
      maxLoops,
      statuses,
      source,
      loops,
      deleted,
      error: String(err?.message ?? err)
    };
  }
}

async function replaceDailyMetricWithoutUniqueConstraint(
  supabaseAdmin: any,
  metricPayload: Record<string, any>,
  metricDay: string,
  normalizedImei: string | null,
  vehicleId: string | null
): Promise<void> {
  const tryDeleteByMetricDay = async (includeReportType: boolean) => {
    let query = supabaseAdmin.from("daily_metrics").delete();
    if (normalizedImei) {
      query = query.eq("imei_number", normalizedImei);
    } else if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }
    query = query.eq("metric_day", metricDay);
    if (includeReportType) query = query.eq("report_type", "50");
    return await query;
  };

  const dayStartIso = addUtcDays(metricDay, 0);
  const dayEndIso = addUtcDays(metricDay, 1);

  const tryDeleteByMetricDate = async (includeReportType: boolean) => {
    if (!dayStartIso || !dayEndIso) return { error: null };
    let query = supabaseAdmin
      .from("daily_metrics")
      .delete()
      .gte("metric_date", dayStartIso)
      .lt("metric_date", dayEndIso);
    if (normalizedImei) {
      query = query.eq("imei_number", normalizedImei);
    } else if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }
    if (includeReportType) query = query.eq("report_type", "50");
    return await query;
  };

  let deleted = false;
  const deleteAttempts: Array<() => Promise<{ error: any }>> = [
    () => tryDeleteByMetricDay(true),
    () => tryDeleteByMetricDay(false),
    () => tryDeleteByMetricDate(true),
    () => tryDeleteByMetricDate(false)
  ];

  for (const attempt of deleteAttempts) {
    const { error } = await attempt();
    if (!error) {
      deleted = true;
      break;
    }
    const missingColumn = extractMissingColumn(error, "daily_metrics");
    if (missingColumn) continue;
    throw error;
  }

  if (!deleted) {
    // If schema probing failed, continue with insert fallback; this still avoids hard failure.
    console.warn("daily_metrics duplicate replacement ran without a successful pre-delete attempt.");
  }

  const { error: insertError } = await executeWithMissingColumnFallback(
    "daily_metrics",
    metricPayload,
    async (candidatePayload) => await supabaseAdmin.from("daily_metrics").insert(candidatePayload)
  );
  if (insertError) throw insertError;
}

async function replaceTripRowsWithoutUniqueConstraint(
  supabaseAdmin: any,
  rows: any[]
): Promise<void> {
  if (!rows.length) return;

  const sourceTripKeys = Array.from(
    new Set(
      rows
        .map((record: any) => toOriginalText(record?.source_trip_key))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (sourceTripKeys.length > 0) {
    const vehicleIds = Array.from(
      new Set(
        rows
          .map((record: any) => toOriginalText(record?.vehicle_id))
          .filter((value): value is string => Boolean(value))
      )
    );

    let deleteQuery = supabaseAdmin.from(TRIP_REPORT_TABLE).delete().in("source_trip_key", sourceTripKeys);
    if (vehicleIds.length > 0) {
      deleteQuery = deleteQuery.in("vehicle_id", vehicleIds);
    }

    let { error: deleteError } = await deleteQuery;
    if (deleteError && extractMissingColumn(deleteError, TRIP_REPORT_TABLE) === "vehicle_id") {
      ({ error: deleteError } = await supabaseAdmin
        .from(TRIP_REPORT_TABLE)
        .delete()
        .in("source_trip_key", sourceTripKeys));
    }

    if (deleteError && extractMissingColumn(deleteError, TRIP_REPORT_TABLE) !== "source_trip_key") {
      throw deleteError;
    }
  }

  await insertRowsWithFallback(supabaseAdmin, TRIP_REPORT_TABLE, rows, 500);
}

function buildTripSourceKey(context: any, payload: any): string {
  const parts = [
    normalizeImei(context?.imei ?? context?.imei_number ?? payload?.imei ?? payload?.imei_number) ?? "",
    toOriginalText(context?.asset ?? context?.registration_number) ?? "",
    toIsoTimestamp(context?.start_time ?? context?.date) ?? "",
    toIsoTimestamp(context?.end_time ?? context?.arrival_time ?? context?.date) ?? "",
    String(toNumeric(context?.start_odometer) ?? ""),
    String(toNumeric(context?.end_odometer) ?? ""),
    String(toNumeric(context?.kilometers ?? context?.distance_km ?? context?.distance) ?? ""),
    toOriginalText(context?.duration ?? context?.distance_display) ?? ""
  ];
  return parts.join("|");
}

async function tryStartProcessingRunLog(supabaseAdmin: any, workerId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ingestion_processing_runs")
      .insert({
        worker_id: workerId,
        status: "running",
        started_at: new Date().toISOString()
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn(`Run-log start skipped: ${error.message ?? error}`);
      return null;
    }
    return data?.id ? String(data.id) : null;
  } catch (error: any) {
    console.warn(`Run-log start skipped: ${error?.message ?? error}`);
    return null;
  }
}

async function tryFinalizeProcessingRunLog(
  supabaseAdmin: any,
  runId: string | null,
  values: {
    status: string;
    claimed: number;
    processed: number;
    failed: number;
    skipped: number;
    error?: string | null;
  }
): Promise<void> {
  if (!runId) return;
  try {
    const { error } = await supabaseAdmin
      .from("ingestion_processing_runs")
      .update({
        status: values.status,
        claimed_count: values.claimed,
        processed_count: values.processed,
        failed_count: values.failed,
        skipped_count: values.skipped,
        error: values.error ?? null,
        finished_at: new Date().toISOString()
      })
      .eq("id", runId);
    if (error) {
      console.warn(`Run-log finalize skipped: ${error.message ?? error}`);
    }
  } catch (error: any) {
    console.warn(`Run-log finalize skipped: ${error?.message ?? error}`);
  }
}

async function tryLogProcessingFailure(
  supabaseAdmin: any,
  runId: string | null,
  row: any,
  errorMessage: string,
  nextRetryAt: string | null
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("ingestion_processing_failures").insert({
      run_id: runId,
      raw_inbound_id: row?.id ?? null,
      source: row?.source ?? null,
      report_type: row?.report_type ? String(row.report_type) : null,
      attempt_count: toInteger(row?.attempt_count) ?? null,
      error_message: errorMessage,
      next_retry_at: nextRetryAt
    });
    if (error) {
      console.warn(`Failure-log skipped for row ${row?.id ?? "unknown"}: ${error.message ?? error}`);
    }
  } catch (error: any) {
    console.warn(`Failure-log skipped for row ${row?.id ?? "unknown"}: ${error?.message ?? error}`);
  }
}

function extractImeiFromPayload(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;

  const directCandidates = [
    payload.imei,
    payload.imei_number,
    payload.imeiNumber,
    payload.source_imei,
    payload.sourceImei,
    payload.SourceImei,
    payload.device_imei,
    payload.deviceImei,
    payload.device?.imei,
    payload.device?.imei_number,
    payload.device?.imeiNumber
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeImei(candidate);
    if (normalized) return normalized;
  }

  if (Array.isArray(payload.data) && payload.data.length > 0) {
    const first = payload.data[0];
    const nested = normalizeImei(
      first?.imei ?? first?.imei_number ?? first?.imeiNumber ?? first?.source_imei ?? first?.sourceImei
    );
    if (nested) return nested;
  }

  return null;
}

function collectImeisFromPayload(
  value: any,
  bucket: Set<string>,
  seen: WeakSet<object>,
  depth = 0
): void {
  if (!value || depth > 8) return;
  if (typeof value !== "object") return;

  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImeisFromPayload(item, bucket, seen, depth + 1);
    }
    return;
  }

  for (const [rawKey, rawVal] of Object.entries(value)) {
    const key = String(rawKey).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (["imei", "imeinumber", "imeino", "sourceimei", "deviceimei"].includes(key)) {
      const normalized = normalizeImei(rawVal);
      if (normalized) bucket.add(normalized);
    }

    if (key === "reportname") {
      const parsed = parseFuelReportName(rawVal);
      if (parsed?.imei_number) bucket.add(parsed.imei_number);
    }

    if (rawVal && typeof rawVal === "object") {
      collectImeisFromPayload(rawVal, bucket, seen, depth + 1);
    }
  }
}

function extractSingleImeiFromPayload(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;

  const imeis = new Set<string>();
  collectImeisFromPayload(payload, imeis, new WeakSet<object>());
  if (imeis.size !== 1) return null;

  return Array.from(imeis)[0] ?? null;
}

function splitConcatenatedClientAsset(value: string | null): {
  clientName: string | null;
  assignedAsset: string | null;
} {
  const text = toOriginalText(value);
  if (!text) {
    return { clientName: null, assignedAsset: null };
  }

  // Handles malformed report names like:
  // "<imei>|Movit ProductsSCANIA_UAS239L_CAN" (missing separator before asset).
  const match = text.match(/^(.*?)([A-Z0-9]{3,}(?:[_-][A-Z0-9]{2,})+)$/);
  if (!match) {
    return { clientName: null, assignedAsset: null };
  }

  const clientName = toOriginalText(match[1]);
  const assignedAsset = toOriginalText(match[2]);
  if (!assignedAsset || !/[0-9]/.test(assignedAsset)) {
    return { clientName: null, assignedAsset: null };
  }

  return {
    clientName,
    assignedAsset
  };
}

function parseFuelReportName(reportNameValue: unknown): ParsedFuelReportName | null {
  const rawReportName = toOriginalText(reportNameValue);
  if (!rawReportName) return null;

  const parsed: ParsedFuelReportName = {
    report_name: rawReportName,
    imei_number: null,
    client_name: null,
    assigned_asset: null
  };

  const rawSegments = rawReportName.split("|");
  const segments = rawSegments.map((part) => part.trim()).filter((part) => part.length > 0);

  for (const segment of segments) {
    const match = segment.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (!match) continue;

    const normalizedKey = match[1].toLowerCase().replace(/[^a-z0-9]/g, "");
    const rawValue = toOriginalText(match[2]);
    if (!rawValue) continue;

    if (["imei", "imeinumber", "imeino"].includes(normalizedKey)) {
      parsed.imei_number = normalizeImei(rawValue);
      continue;
    }

    if (["client", "customer", "clientname", "company"].includes(normalizedKey)) {
      parsed.client_name = rawValue;
      continue;
    }

    if (
      [
        "asset",
        "assignedasset",
        "assignedassetstatic",
        "registration",
        "registrationnumber",
        "reg",
        "regnumber"
      ].includes(normalizedKey)
    ) {
      parsed.assigned_asset = rawValue;
    }
  }

  if (!parsed.imei_number && !parsed.client_name && !parsed.assigned_asset && rawSegments.length >= 3) {
    parsed.imei_number = normalizeImei(rawSegments[0]);
    parsed.client_name = toOriginalText(rawSegments[1]);
    parsed.assigned_asset = toOriginalText(rawSegments[2]);
  } else if (!parsed.imei_number && !parsed.client_name && !parsed.assigned_asset && rawSegments.length === 2) {
    parsed.imei_number = normalizeImei(rawSegments[0]);
    const secondSegment = toOriginalText(rawSegments[1]);
    const split = splitConcatenatedClientAsset(secondSegment);
    if (split.clientName || split.assignedAsset) {
      parsed.client_name = split.clientName;
      parsed.assigned_asset = split.assignedAsset;
    } else {
      parsed.client_name = secondSegment;
    }
  }

  return parsed;
}

function parseClientFromReportName(reportNameValue: unknown): string | null {
  const rawReportName = toOriginalText(reportNameValue);
  if (!rawReportName) return null;

  const parsedFuel = parseFuelReportName(rawReportName);
  if (parsedFuel?.client_name) return parsedFuel.client_name;

  const segments = rawReportName
    .split("|")
    .map((segment) => toOriginalText(segment))
    .filter((segment): segment is string => Boolean(segment));

  if (segments.length >= 2) return segments[1];
  return null;
}

async function fetchVehicleIdentityByImei(
  supabaseAdmin: any,
  imei: string | null
): Promise<VehicleIdentity | null> {
  const normalizedImei = normalizeImei(imei);
  if (!normalizedImei) return null;

  const selectColumns = "imei,client_name,asset_id,vehicle_plate";

  const lookupByColumn = async (column: "imei" | "asset_id" | "vehicle_plate", value: string) => {
    const { data, error } = await supabaseAdmin
      .from("vehicles")
      .select(selectColumns)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const vehicleMatch =
    (await lookupByColumn("imei", normalizedImei)) ??
    (await lookupByColumn("asset_id", normalizedImei)) ??
    (await lookupByColumn("vehicle_plate", normalizedImei));
  if (!vehicleMatch) return null;

  return {
    imei: normalizeImei(vehicleMatch.imei),
    clientName: toOriginalText(vehicleMatch.client_name),
    assignedAsset: toOriginalText(vehicleMatch.vehicle_plate) ?? toOriginalText(vehicleMatch.asset_id)
  };
}

async function fetchVehicleIdentityByAsset(
  supabaseAdmin: any,
  assignedAsset: string | null
): Promise<VehicleIdentity | null> {
  const cleanAsset = toOriginalText(assignedAsset);
  if (!cleanAsset) return null;

  const selectColumns = "imei,client_name,asset_id,vehicle_plate";
  const byAssetId = await supabaseAdmin
    .from("vehicles")
    .select(selectColumns)
    .eq("asset_id", cleanAsset)
    .limit(1)
    .maybeSingle();
  if (byAssetId.error) throw byAssetId.error;
  if (byAssetId.data) {
    return {
      imei: normalizeImei(byAssetId.data.imei),
      clientName: toOriginalText(byAssetId.data.client_name),
      assignedAsset: toOriginalText(byAssetId.data.vehicle_plate) ?? toOriginalText(byAssetId.data.asset_id)
    };
  }

  const byVehiclePlate = await supabaseAdmin
    .from("vehicles")
    .select(selectColumns)
    .eq("vehicle_plate", cleanAsset)
    .limit(1)
    .maybeSingle();
  if (byVehiclePlate.error) throw byVehiclePlate.error;
  if (!byVehiclePlate.data) return null;

  return {
    imei: normalizeImei(byVehiclePlate.data.imei),
    clientName: toOriginalText(byVehiclePlate.data.client_name),
    assignedAsset: toOriginalText(byVehiclePlate.data.vehicle_plate) ?? toOriginalText(byVehiclePlate.data.asset_id)
  };
}

async function fillVehicleIdentityGaps(
  supabaseAdmin: any,
  vehicleId: string | null,
  identity: {
    imei: string | null;
    clientName: string | null;
    assignedAsset: string | null;
  }
): Promise<void> {
  if (!vehicleId) return;
  if (!identity.imei && !identity.clientName && !identity.assignedAsset) return;

  const { data: vehicleRow, error: vehicleReadError } = await supabaseAdmin
    .from("vehicles")
    .select("imei,asset_id,vehicle_plate,client_name")
    .eq("id", vehicleId)
    .maybeSingle();
  if (vehicleReadError) throw vehicleReadError;
  if (!vehicleRow) return;

  const patch: any = { updated_at: new Date().toISOString() };
  let hasPatch = false;

  const existingImei = normalizeImei(vehicleRow.imei);
  const existingAssetId = toOriginalText(vehicleRow.asset_id);
  const existingVehiclePlate = toOriginalText(vehicleRow.vehicle_plate);
  const existingClientName = toOriginalText(vehicleRow.client_name);
  const incomingImei = normalizeImei(identity.imei);
  const incomingAsset = toOriginalText(identity.assignedAsset);
  const incomingClient = toOriginalText(identity.clientName);

  if (incomingImei && !existingImei) {
    patch.imei = incomingImei;
    hasPatch = true;
  }
  if (incomingImei && !existingAssetId) {
    patch.asset_id = incomingImei;
    hasPatch = true;
  }
  if (
    incomingAsset &&
    (!existingVehiclePlate || (existingImei !== null && normalizeImei(existingVehiclePlate) === existingImei))
  ) {
    patch.vehicle_plate = incomingAsset;
    hasPatch = true;
  }
  if (incomingClient && !existingClientName) {
    patch.client_name = incomingClient;
    hasPatch = true;
  }

  if (!hasPatch) return;

  const { error: vehiclePatchError } = await executeWithMissingColumnFallback(
    "vehicles",
    patch,
    async (candidatePayload) => await supabaseAdmin.from("vehicles").update(candidatePayload).eq("id", vehicleId)
  );
  if (vehiclePatchError) throw vehiclePatchError;
}

function ensureDailyMovementRequiredFields(transformed: any, context: any, payload: any) {
  if (!transformed.report_date) {
    transformed.report_date = toDateOnly(
      context?.report_date ??
      context?.date ??
      context?.generated_date ??
      context?.start_time ??
      payload?.generated_date ??
      payload?.start_date ??
      payload?.date
    );
  }

  if (!transformed.departure_time && context?.start_time) {
    transformed.departure_time = context.start_time;
  }
  if (!transformed.departure_date) {
    transformed.departure_date = toDateOnly(transformed.departure_time ?? context?.start_time ?? transformed.report_date);
  }
  if (!transformed.arrival_time && context?.end_time) {
    transformed.arrival_time = context.end_time;
  }
  if (!transformed.registration_number && context?.asset) {
    transformed.registration_number = context.asset;
  }
  if (!transformed.asset_description && context?.asset) {
    transformed.asset_description = context.asset;
  }

  const distanceKm = toNumeric(transformed.distance_km);
  transformed.distance_km = distanceKm;

  const fuelUsedLitres = toNumeric(transformed.fuel_used_litres);
  transformed.fuel_used_litres = fuelUsedLitres;

  const maxSpeed = toNumeric(transformed.max_speed_kmh);
  transformed.max_speed_kmh = maxSpeed !== null ? Math.round(maxSpeed) : null;
}

function enrichFuelRecordFromPayload(
  row: any,
  payload: any,
  context: any,
  transformed: any
): ParsedFuelReportName | null {
  if (String(row.report_type) !== "50") return null;

  const reportNameValue = transformed.report_name ?? context?.report_name ?? payload?.report_name ?? row.report_name;
  const fromReportName = parseFuelReportName(reportNameValue);
  const payloadImei = extractImeiFromPayload(context) ?? extractImeiFromPayload(payload) ?? normalizeImei(row.source_imei);

  const reportName = toOriginalText(fromReportName?.report_name ?? reportNameValue);
  const imei = payloadImei ?? fromReportName?.imei_number ?? null;
  const clientName =
    fromReportName?.client_name ??
    toOriginalText(context?.client_name) ??
    toOriginalText(context?.client) ??
    toOriginalText(payload?.client_name) ??
    toOriginalText(payload?.client);
  const assignedAsset =
    fromReportName?.assigned_asset ??
    toOriginalText(context?.registration_number) ??
    toOriginalText(context?.asset) ??
    toOriginalText(payload?.registration_number) ??
    toOriginalText(payload?.asset);

  if (!reportName && !imei && !clientName && !assignedAsset) return null;

  const parsed: ParsedFuelReportName = {
    report_name: reportName ?? [imei, clientName, assignedAsset].filter(Boolean).join("|"),
    imei_number: imei,
    client_name: clientName,
    assigned_asset: assignedAsset
  };

  transformed.report_name = parsed.report_name;
  if (parsed.imei_number) transformed.source_imei = parsed.imei_number;
  if (parsed.client_name) transformed.client_name = transformed.client_name ?? parsed.client_name;
  if (parsed.assigned_asset) transformed.source_assigned_asset = parsed.assigned_asset;

  if (!transformed.registration_number && parsed.assigned_asset) {
    transformed.registration_number = parsed.assigned_asset;
  }
  if (!transformed.asset_description && parsed.assigned_asset) {
    transformed.asset_description = parsed.assigned_asset;
  }
  return parsed;
}

function isVehicleProfileItem(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  const hasAsset = Boolean(
    toCleanString(
      value.asset ?? value.asset_id ?? value.assetId ?? value.registration_number ?? value.registrationNumber
    )
  );
  if (!hasAsset) return false;

  const profileMarkers = [
    value.asset_type,
    value.assetType,
    value.make_model,
    value.makeModel,
    value.asset_make,
    value.assetMake,
    value.engine_size,
    value.engineSize,
    value.distance,
    value.hours,
    value.hrs,
    value.sensor,
    value.sensor_name,
    value.sensorName,
    value.fuel_capacity,
    value.fuelCapacity,
    value.tank_capacity,
    value.tankCapacity,
    value.initial_reading,
    value.initialReading,
    value.initial_fuel,
    value.initialFuel,
    value.total_refills,
    value.totalRefills,
    value.total_refill,
    value.totalRefill,
    value.refill_count,
    value.refillCount,
    value.total_drains,
    value.totalDrains,
    value.total_drain,
    value.totalDrain,
    value.drain_count,
    value.drainCount,
    value.fuel_used,
    value.fuelUsed,
    value.final_fuel_reading,
    value.finalFuelReading,
    value.final_fuel,
    value.finalFuel,
    value.consumption,
    value.fuel_economy,
    value.fuelEconomy
  ];

  return profileMarkers.some((marker) => marker !== null && marker !== undefined);
}

function extractVehicleProfileItems(payload: any): VehicleProfileItem[] {
  if (!payload || typeof payload !== "object") return [];

  const data = payload.data;
  const candidateLists: any[][] = [];
  if (Array.isArray(data)) candidateLists.push(data);
  if (data && typeof data === "object") {
    for (const key of ["items", "rows", "assets", "profiles"]) {
      if (Array.isArray((data as any)[key])) {
        candidateLists.push((data as any)[key]);
      }
    }
  }

  const items: VehicleProfileItem[] = [];
  for (const list of candidateLists) {
    for (const entry of list) {
      if (!isVehicleProfileItem(entry)) continue;

      const asset = toCleanString(entry.asset ?? entry.asset_id ?? entry.assetId);
      if (!asset) continue;

      const consumptionText = toCleanString(entry.consumption ?? entry.consumption_text ?? entry.consumptionText);
      items.push({
        asset,
        imei: normalizeImei(entry.imei ?? entry.imei_number ?? entry.imeiNumber),
        clientName: toOriginalText(entry.client_name ?? entry.client ?? entry.company_name ?? entry.company),
        assetType: toCleanString(entry.asset_type ?? entry.assetType),
        makeModel: toOriginalText(entry.make_model ?? entry.makeModel ?? entry.asset_make ?? entry.assetMake),
        engineSize: toNumeric(entry.engine_size ?? entry.engineSize),
        distance: toNumeric(entry.distance),
        hours: toNumeric(entry.hours ?? entry.hrs ?? entry.engine_hours ?? entry.engineHours),
        sensor: toOriginalText(entry.sensor ?? entry.sensor_name ?? entry.sensorName),
        fuelCapacity: toNumeric(entry.fuel_capacity ?? entry.fuelCapacity ?? entry.tank_capacity ?? entry.tankCapacity),
        initialReading: toNumeric(entry.initial_reading ?? entry.initialReading ?? entry.initial_fuel ?? entry.initialFuel),
        totalRefills: toNumeric(entry.total_refills ?? entry.totalRefills ?? entry.total_refill ?? entry.totalRefill),
        refillCount: toNumeric(entry.refill_count ?? entry.refillCount),
        totalDrains: toNumeric(entry.total_drains ?? entry.totalDrains ?? entry.total_drain ?? entry.totalDrain),
        drainCount: toNumeric(entry.drain_count ?? entry.drainCount),
        fuelUsed: toNumeric(entry.fuel_used ?? entry.fuelUsed),
        finalFuelReading: toNumeric(entry.final_fuel_reading ?? entry.finalFuelReading ?? entry.final_fuel ?? entry.finalFuel),
        consumptionText: toOriginalText(
          consumptionText ?? entry.fuel_economy ?? entry.fuelEconomy ?? entry.fuel_econony_descr
        ),
        consumptionNumeric: toNumeric(consumptionText ?? entry.fuel_economy ?? entry.fuelEconomy),
        fuelEconomyDescription: toOriginalText(entry.fuel_econony_descr ?? entry.fuel_economy_descr),
        fuelUnit: toOriginalText(entry.fuel_unit ?? entry.fuelUnit),
        analogType: toInteger(entry.analog_type ?? entry.analogType),
        raw: entry
      });
    }
  }

  const unique = new Map<string, VehicleProfileItem>();
  for (const item of items) {
    unique.set(item.asset.toLowerCase(), item);
  }
  return Array.from(unique.values());
}

function makeFuelKey(parsed: ParsedFuelReportName): string {
  const parts = [
    normalizeImei(parsed.imei_number) ?? "",
    toOriginalText(parsed.client_name) ?? "",
    toOriginalText(parsed.assigned_asset) ?? ""
  ];
  return parts.join("|").toLowerCase();
}

async function syncFuelAssetsToVehicles(
  supabaseAdmin: any,
  parsedAssets: ParsedFuelReportName[]
): Promise<Map<string, FuelSyncResult>> {
  const results = new Map<string, FuelSyncResult>();
  if (!parsedAssets.length) return results;

  const uniqueByKey = new Map<string, ParsedFuelReportName>();
  for (const asset of parsedAssets) {
    uniqueByKey.set(makeFuelKey(asset), asset);
  }

  for (const [key, asset] of uniqueByKey.entries()) {
    let vehicleSyncStatus = "skipped";
    let vehicleSyncMessage: string | null = null;
    let vehicleId: string | null = null;

    if (asset.assigned_asset || asset.imei_number) {
      const { data: syncResult, error: syncError } = await supabaseAdmin.rpc("sync_vehicle_from_fuel_report", {
        p_assigned_asset: asset.assigned_asset,
        p_client_name: asset.client_name,
        p_imei_number: asset.imei_number
      });

      if (syncError) {
        vehicleSyncStatus = "error";
        vehicleSyncMessage = syncError.message;
      } else {
        vehicleSyncStatus = syncResult?.status ?? "unknown";
        vehicleSyncMessage = syncResult?.reason ?? syncResult?.error ?? null;
        if (syncResult?.vehicle_id !== null && syncResult?.vehicle_id !== undefined) {
          vehicleId = String(syncResult.vehicle_id);
        }
      }
    }

    results.set(key, {
      vehicleId,
      status: vehicleSyncStatus,
      message: vehicleSyncMessage
    });
  }

  return results;
}

function extractSensorRows(
  context: any,
  rawInboundId: string,
  temperatureReportId: string,
  vehicleId: string | null,
  metadata: {
    imeiNumber: string | null;
    clientName: string | null;
    registrationNumber: string | null;
  }
) {
  const rows: any[] = [];
  const reportData = getReport50DataContainer(context);
  const telemetryRows = asArray(reportData?.telemetry ?? context?.telemetry);

  const appendMetadata = (row: any) => ({
    ...row,
    imei_number: metadata.imeiNumber,
    client_name: metadata.clientName,
    registration_number: metadata.registrationNumber
  });

  for (const point of telemetryRows) {
    if (!point || typeof point !== "object") continue;

    const fuelValue = toNumeric(point?.rf ?? point?.af ?? point?.fuel ?? point?.fuel_level);
    const altitude = toNumeric(point?.alt ?? point?.altitude);
    const odometer = toNumeric(point?.odo ?? point?.odometer);
    const speed = toNumeric(point?.spid ?? point?.speed);
    if (fuelValue === null && altitude === null && odometer === null && speed === null) {
      continue;
    }

    rows.push(
      appendMetadata({
        temperature_report_id: temperatureReportId,
        raw_inbound_id: rawInboundId,
        vehicle_id: vehicleId,
        af: toNumeric(point?.af),
        telemetry_id: toInteger(point?.id),
        alt: altitude,
        hrs: toNumeric(point?.hrs),
        ign: toInteger(point?.ign),
        odo: odometer,
        rpm: toNumeric(point?.rpm),
        date: toOriginalText(point?.date ?? point?.timestamp ?? point?.event_time ?? point?.time),
        spid: speed,
        rf: toNumeric(point?.rf) ?? fuelValue,
        payload: point
      })
    );
  }

  if (rows.length > 0) return rows;

  const summary = {
    fuel: toNumeric(
      context?.fuel ??
      context?.fuel_level ??
      context?.fuelUsed ??
      context?.fuel_used ??
      context?.final_fuel_reading ??
      context?.initial_reading
    ),
    altitude: toNumeric(context?.altitude),
    odometer: toNumeric(context?.odometer ?? context?.kilometers ?? context?.distance),
    speed: toNumeric(context?.speed)
  };

  if (Object.values(summary).some((value) => value !== null)) {
    rows.push(
      appendMetadata({
        temperature_report_id: temperatureReportId,
        raw_inbound_id: rawInboundId,
        vehicle_id: vehicleId,
        af: null,
        telemetry_id: null,
        alt: summary.altitude,
        hrs: null,
        ign: null,
        odo: summary.odometer,
        rpm: null,
        date: toOriginalText(context?.date ?? context?.timestamp),
        spid: summary.speed,
        rf: summary.fuel,
        payload: context
      })
    );
  }

  if (Array.isArray(context?.sensors)) {
    for (const sensor of context.sensors) {
      const sensorName = toCleanString(sensor?.name ?? sensor?.key ?? sensor?.type);
      const sensorValue = sensor?.value;
      if (!sensorName || sensorValue === null || sensorValue === undefined || sensorValue === "") continue;

      const normalizedName = sensorName.toLowerCase();
      const numericValue = toNumeric(sensorValue);

      rows.push(
        appendMetadata({
          temperature_report_id: temperatureReportId,
          raw_inbound_id: rawInboundId,
          vehicle_id: vehicleId,
          af: null,
          telemetry_id: null,
          alt: normalizedName.includes("alt") ? numericValue : null,
          hrs: null,
          ign: null,
          odo: normalizedName.includes("odo") ? numericValue : null,
          rpm: normalizedName.includes("rpm") ? numericValue : null,
          date: toOriginalText(sensor?.timestamp),
          spid: normalizedName.includes("speed") ? numericValue : null,
          rf: normalizedName.includes("fuel") ? numericValue : null,
          payload: sensor
        })
      );
    }
  }

  return rows;
}

async function upsertFuelNormalizedTables(
  supabaseAdmin: any,
  row: any,
  payload: any,
  derivedRecords: FuelDerivedRecord[],
  syncResults: Map<string, FuelSyncResult>,
  diagnostics?: ProcessingDiagnostics
) {
  if (!derivedRecords.length) return;

  const { error: cleanupSensorsError } = await supabaseAdmin.from("raw_sensor_data").delete().eq("raw_inbound_id", row.id);
  if (cleanupSensorsError && extractMissingColumn(cleanupSensorsError, "raw_sensor_data") !== "raw_inbound_id") {
    throw cleanupSensorsError;
  }

  const { error: cleanupRefuelError } = await supabaseAdmin.from("fuel_events").delete().eq("raw_inbound_id", row.id);
  if (cleanupRefuelError && extractMissingColumn(cleanupRefuelError, "fuel_events") !== "raw_inbound_id") {
    throw cleanupRefuelError;
  }

  for (const entry of derivedRecords) {
    const sync = syncResults.get(makeFuelKey(entry.parsed));
    const vehicleId = sync?.vehicleId ?? null;

    const reportTimestamp =
      toIsoTimestamp(
        entry.context?.date ??
        entry.context?.generated_date ??
        entry.context?.start_time ??
        payload?.date ??
        payload?.generated_date ??
        payload?.start_time ??
        row.request_timestamp ??
        row.received_at
      ) ?? new Date().toISOString();

    const normalizedImei =
      entry.parsed.imei_number ??
      extractImeiFromPayload(entry.context) ??
      extractImeiFromPayload(payload) ??
      normalizeImei(row.source_imei);

    const registrationNumber =
      entry.parsed.assigned_asset ??
      toOriginalText(entry.context?.registration_number) ??
      toOriginalText(entry.context?.asset) ??
      null;

    const clientName =
      entry.parsed.client_name ??
      toOriginalText(entry.context?.client_name) ??
      toOriginalText(entry.context?.client) ??
      null;

    const reportData = getReport50DataContainer(entry.context);
    const summary = reportData?.summary && typeof reportData.summary === "object" ? reportData.summary : {};
    const refillDetails =
      reportData?.refill_details && typeof reportData.refill_details === "object"
        ? reportData.refill_details
        : entry.context?.refill_details ?? {};
    const drainDetails =
      reportData?.drain_details && typeof reportData.drain_details === "object"
        ? reportData.drain_details
        : entry.context?.drain_details ?? {};

    const fromDatetime =
      toIsoTimestamp(
        entry.context?.from_datetime ??
        entry.context?.start_time ??
        payload?.from_datetime ??
        payload?.start_time ??
        payload?.start_date
      ) ?? reportTimestamp;
    const toDatetime =
      toIsoTimestamp(
        entry.context?.to_datetime ?? entry.context?.end_time ?? payload?.to_datetime ?? payload?.end_time ?? payload?.end_date
      ) ?? reportTimestamp;
    const totalDistanceKm = toNumeric(
      summary?.total_distance ?? entry.context?.kilometers ?? entry.context?.distance ?? entry.context?.odometer
    );
    const fuelUsedLitres = toNumeric(
      summary?.fuel_used ??
      entry.context?.fuelUsed ??
      entry.context?.fuel_used_litres ??
      entry.context?.fuel_used ??
      entry.context?.refuel_volume_litres
    );
    const totalRefillsLitres = toNumeric(
      summary?.total_refilled ??
      refillDetails?.total_refills ??
      entry.context?.total_refills ??
      entry.context?.refilled ??
      entry.context?.refill_volume_litres ??
      fuelUsedLitres
    );
    const totalDrainsLitres = toNumeric(
      summary?.total_drained ?? drainDetails?.total_drains ?? entry.context?.total_drains ?? entry.context?.drain_volume_litres ?? 0
    );
    const fuelConsumption =
      totalDistanceKm !== null && fuelUsedLitres !== null && fuelUsedLitres > 0
        ? Number((totalDistanceKm / fuelUsedLitres).toFixed(6))
        : null;

    await upsertDailyMetricsFromReport50(
      supabaseAdmin,
      row,
      payload,
      vehicleId,
      reportTimestamp,
      normalizedImei,
      clientName,
      registrationNumber,
      reportData,
      summary,
      refillDetails,
      drainDetails,
      diagnostics
    );

    const temperaturePayload = {
      raw_inbound_id: row.id,
      vehicle_id: vehicleId,
      imei_number: normalizedImei,
      client_name: clientName,
      registration_number: registrationNumber,
      report_name: entry.parsed.report_name,
      report_type: "50",
      report_timestamp: reportTimestamp,
      source_payload: entry.context,
      report_date: reportTimestamp,
      report_title: "Sensor / Fuel / Temperature",
      asset_name: registrationNumber ?? entry.parsed.assigned_asset ?? null,
      from_datetime: fromDatetime,
      to_datetime: toDatetime,
      generated_on:
        toIsoTimestamp(entry.context?.generated_on ?? entry.context?.generated_date ?? payload?.generated_on ?? payload?.generated_date) ??
        reportTimestamp,
      total_distance_km: totalDistanceKm,
      total_refills_l: totalRefillsLitres,
      total_drains_l: totalDrainsLitres,
      fuel_used_l: fuelUsedLitres,
      fuel_consumption_km_l: fuelConsumption,
      data_points: Array.isArray(reportData?.telemetry)
        ? reportData.telemetry.slice(0, 500)
        : Array.isArray(entry.context?.data_points)
          ? entry.context.data_points
          : null,
      client_id: toCleanString(entry.context?.client_id ?? payload?.client_id)
    };

    const { data: temperatureRow, error: temperatureError } = await executeWithMissingColumnFallback<{ id: string | number }>(
      "fuel_temperature_reports",
      temperaturePayload,
      async (candidatePayload) =>
        await supabaseAdmin
          .from("fuel_temperature_reports")
          .upsert(candidatePayload, {
            onConflict: "raw_inbound_id"
          })
          .select("id")
          .single()
    );

    if (temperatureError) throw temperatureError;
    const temperatureReportId = String(temperatureRow?.id ?? "");
    if (!temperatureReportId) throw new Error("fuel_temperature_reports upsert returned no id");

    const refills = asArray(refillDetails?.refills ?? refillDetails);
    const drains = asArray(drainDetails?.drains ?? drainDetails);
    const telemetryRows = asArray(reportData?.telemetry ?? entry.context?.telemetry);
    let usedBulkSql = false;

    if (telemetryRows.length > 0 || refills.length > 0 || drains.length > 0) {
      const { error: bulkError } = await supabaseAdmin.rpc("process_report50_details", {
        p_raw_inbound_id: row.id,
        p_temperature_report_id: temperatureReportId,
        p_vehicle_id: vehicleId,
        p_imei_number: normalizedImei,
        p_client_name: clientName,
        p_registration_number: registrationNumber,
        p_report_timestamp: reportTimestamp
      });

      if (!bulkError) {
        usedBulkSql = true;
      } else {
        if (isUniqueViolationError(bulkError)) {
          noteDuplicateHandling(diagnostics, "report50 SQL bulk path hit duplicates and switched to overwrite fallback");
        }
        console.warn(`Falling back to JS detail inserts for raw row ${row.id}: ${bulkError.message ?? bulkError}`);
      }
    }

    if (!usedBulkSql) {
      const refuelRows: any[] = [];

      const pushFuelEvent = (eventType: "refill" | "drain", event: any) => {
        const amountRaw =
          eventType === "refill"
            ? event?.refill ?? event?.refilled ?? event?.volume ?? event?.amount
            : event?.drain ?? event?.drained ?? event?.volume ?? event?.amount;
        const amount = toNumeric(amountRaw);
        if (amount === null) return;

        const signedAmount = eventType === "drain" ? -Math.abs(amount) : Math.abs(amount);
        const eventTimestamp =
          toIsoTimestamp(event?.timestamp ?? event?.date ?? event?.event_time ?? event?.time) ?? reportTimestamp;

        refuelRows.push({
          temperature_report_id: temperatureReportId,
          raw_inbound_id: row.id,
          vehicle_id: vehicleId,
          imei_number: normalizedImei,
          client_name: clientName,
          registration_number: registrationNumber,
          event_type: eventType,
          event_timestamp: eventTimestamp,
          event_time: eventTimestamp,
          fuel_volume_litres: signedAmount,
          refilled: signedAmount,
          odometer_km: toNumeric(event?.odometer ?? event?.odo ?? event?.kilometers),
          initial_fuel: toNumeric(event?.initial_fuel),
          final_fuel: toNumeric(event?.final_fuel),
          location: toOriginalText(event?.location),
          latitude: toNumeric(event?.lat ?? event?.latitude),
          longitude: toNumeric(event?.lon ?? event?.longitude),
          payload: {
            event_type: eventType,
            ...event
          }
        });
      };

      for (const refill of refills) {
        pushFuelEvent("refill", refill);
      }
      for (const drain of drains) {
        pushFuelEvent("drain", drain);
      }

      if (!refuelRows.length) {
        const fallbackFuelVolume = toNumeric(
          entry.context?.fuelUsed ??
          entry.context?.fuel_used_litres ??
          entry.context?.fuel_used ??
          entry.context?.refuel_volume_litres
        );
        if (fallbackFuelVolume !== null) {
          refuelRows.push({
            temperature_report_id: temperatureReportId,
            raw_inbound_id: row.id,
            vehicle_id: vehicleId,
            imei_number: normalizedImei,
            client_name: clientName,
            registration_number: registrationNumber,
            event_type: "summary",
            event_timestamp: reportTimestamp,
            event_time: reportTimestamp,
            fuel_volume_litres: fallbackFuelVolume,
            refilled: fallbackFuelVolume,
            odometer_km: toNumeric(entry.context?.kilometers ?? entry.context?.odometer),
            initial_fuel: toNumeric(entry.context?.initial_fuel ?? entry.context?.initial_reading),
            final_fuel: toNumeric(entry.context?.final_fuel ?? entry.context?.final_fuel_reading),
            location: toOriginalText(entry.context?.location),
            latitude: toNumeric(entry.context?.lat ?? entry.context?.latitude),
            longitude: toNumeric(entry.context?.lon ?? entry.context?.longitude),
            payload: entry.context
          });
        }
      }

      if (refuelRows.length > 0) {
        await replaceFuelEventRowsWithFallback(supabaseAdmin, refuelRows, diagnostics);
      }

      const sensorRows = extractSensorRows(entry.context, row.id, temperatureReportId, vehicleId, {
        imeiNumber: normalizedImei,
        clientName,
        registrationNumber
      });
      if (sensorRows.length > 0) {
        await upsertRawSensorRowsWithFallback(supabaseAdmin, sensorRows, 1000, diagnostics);
      }
    }
  }
}

async function resolveIdentityForProfileItem(
  supabaseAdmin: any,
  item: VehicleProfileItem,
  fallbackClient: string | null,
  assetIdentityCache: Map<string, VehicleIdentity>
): Promise<{ imei: string | null; clientName: string | null }> {
  let resolvedImei = item.imei;
  let resolvedClient = item.clientName ?? fallbackClient;

  const imeiKey = resolvedImei ? `imei:${resolvedImei}` : null;
  if ((!resolvedClient || !resolvedImei) && imeiKey) {
    let imeiIdentity = assetIdentityCache.get(imeiKey);
    if (!imeiIdentity) {
      imeiIdentity = (await fetchVehicleIdentityByImei(supabaseAdmin, resolvedImei)) ?? {
        imei: null,
        clientName: null,
        assignedAsset: null
      };
      assetIdentityCache.set(imeiKey, imeiIdentity);
    }

    resolvedImei = resolvedImei ?? imeiIdentity.imei;
    resolvedClient = resolvedClient ?? imeiIdentity.clientName;
  }

  const assetKey = item.asset ? `asset:${item.asset.toLowerCase()}` : null;
  if ((!resolvedImei || !resolvedClient) && assetKey) {
    let assetIdentity = assetIdentityCache.get(assetKey);
    if (!assetIdentity) {
      assetIdentity = (await fetchVehicleIdentityByAsset(supabaseAdmin, item.asset)) ?? {
        imei: null,
        clientName: null,
        assignedAsset: null
      };
      assetIdentityCache.set(assetKey, assetIdentity);
    }

    resolvedImei = resolvedImei ?? assetIdentity.imei;
    resolvedClient = resolvedClient ?? assetIdentity.clientName;
  }

  return {
    imei: resolvedImei,
    clientName: resolvedClient
  };
}

async function upsertVehiclesFromProfilePayload(supabaseAdmin: any, row: any, payload: any): Promise<number> {
  const reportType = String(row.report_type ?? payload?.report_type ?? "");
  if (reportType !== "50" && reportType !== "147") return 0;

  const items = extractVehicleProfileItems(payload);
  if (!items.length) return 0;

  const parsedFromReportName = parseFuelReportName(payload?.report_name ?? row.report_name);
  const fallbackClient =
    parsedFromReportName?.client_name ??
    toOriginalText(payload?.client_name) ??
    toOriginalText(payload?.client) ??
    parseClientFromReportName(payload?.report_name ?? row.report_name);
  const reportGeneratedAt =
    toIsoTimestamp(payload?.generated_date ?? payload?.end_date ?? payload?.start_date ?? row.received_at) ??
    new Date().toISOString();
  const reportEndDate = toDateOnlyStrict(payload?.end_date);
  const todayDate = new Date().toISOString().slice(0, 10);
  const isReport147ForToday = reportType === "147" && reportEndDate === todayDate;

  const nowIso = new Date().toISOString();
  let upserted = 0;
  const assetIdentityCache = new Map<string, VehicleIdentity>();

  for (const item of items) {
    const resolvedIdentity = await resolveIdentityForProfileItem(
      supabaseAdmin,
      item,
      fallbackClient,
      assetIdentityCache
    );

    const { data: syncResult, error: syncError } = await supabaseAdmin.rpc("sync_vehicle_from_fuel_report", {
      p_assigned_asset: item.asset,
      p_client_name: resolvedIdentity.clientName,
      p_imei_number: resolvedIdentity.imei
    });
    if (syncError) throw syncError;

    const vehicleId =
      syncResult?.vehicle_id !== null && syncResult?.vehicle_id !== undefined
        ? String(syncResult.vehicle_id)
        : null;

    if (!vehicleId) continue;

    if (reportType === "147" && reportGeneratedAt) {
      const { data: freshnessRow, error: freshnessError } = await supabaseAdmin
        .from("vehicles")
        .select("last_summary_generated_at")
        .eq("id", vehicleId)
        .maybeSingle();

      if (freshnessError) throw freshnessError;

      const lastGeneratedAt = toIsoTimestamp(freshnessRow?.last_summary_generated_at);
      if (lastGeneratedAt) {
        const incomingTime = new Date(reportGeneratedAt).getTime();
        const existingTime = new Date(lastGeneratedAt).getTime();
        if (!Number.isNaN(incomingTime) && !Number.isNaN(existingTime) && incomingTime <= existingTime) {
          continue;
        }
      }
    }

    const vehiclePatch: any = {
      updated_at: nowIso,
      source_last_raw_inbound_id: row.id,
      source_profile_json: item.raw,
      source_asset_type: item.assetType,
      source_make_model: item.makeModel,
      source_engine_size: item.engineSize,
      source_sensor: item.sensor,
      source_consumption: item.consumptionText
    };

    if (reportType === "147") {
      vehiclePatch.source_summary_report_id = toInteger(payload?.report_id);
      vehiclePatch.source_summary_payload = item.raw;
      vehiclePatch.last_summary_generated_at = reportGeneratedAt;
    }

    if (item.asset) {
      vehiclePatch.vehicle_plate = item.asset;
    }
    if (resolvedIdentity.imei) {
      vehiclePatch.imei = resolvedIdentity.imei;
    }
    if (resolvedIdentity.clientName) {
      vehiclePatch.client_name = resolvedIdentity.clientName;
    }
    if (reportType === "147" && item.fuelCapacity !== null) {
      vehiclePatch.tank_capacity = item.fuelCapacity;
    }
    if (item.finalFuelReading !== null) {
      vehiclePatch.current_fuel_level = item.finalFuelReading;
    } else if (item.initialReading !== null) {
      vehiclePatch.current_fuel_level = item.initialReading;
    }
    if (reportType === "147") {
      if (isReport147ForToday) {
        vehiclePatch.total_distance = item.distance;
        vehiclePatch.total_engine_hours = item.hours;
        vehiclePatch.total_fuel_used = item.fuelUsed;
        vehiclePatch.consumption_kml = item.consumptionNumeric;
        vehiclePatch.refill_count = item.refillCount ?? 0;
        vehiclePatch.total_refill_volume = item.totalRefills ?? 0;
        vehiclePatch.drain_count = item.drainCount ?? 0;
        vehiclePatch.total_drain_volume = item.totalDrains ?? 0;
      } else {
        vehiclePatch.total_distance = null;
        vehiclePatch.total_engine_hours = null;
        vehiclePatch.total_fuel_used = null;
        vehiclePatch.consumption_kml = null;
        vehiclePatch.refill_count = 0;
        vehiclePatch.total_refill_volume = 0;
        vehiclePatch.drain_count = 0;
        vehiclePatch.total_drain_volume = 0;
      }
    }

    const { error: vehicleUpdateError } = await executeWithMissingColumnFallback(
      "vehicles",
      vehiclePatch,
      async (candidatePayload) => await supabaseAdmin.from("vehicles").update(candidatePayload).eq("id", vehicleId)
    );
    if (vehicleUpdateError) throw vehicleUpdateError;
    upserted += 1;
  }

  return items.length > 0 ? Math.max(upserted, 1) : 0;
}

async function upsertVehicleLatestFromReport0(
  supabaseAdmin: any,
  row: any,
  payload: any
): Promise<Report0LiveResult> {
  const reportNameImei = parseFuelReportName(payload?.report_name ?? row.report_name)?.imei_number ?? null;
  const payloadSingleImei = extractSingleImeiFromPayload(payload);

  const imei =
    normalizeImei(
      payload?.Imei ??
      payload?.imei ??
      payload?.imei_number ??
      payload?.imeiNumber ??
      payload?.source_imei ??
      extractImeiFromPayload(payload) ??
      payloadSingleImei ??
      reportNameImei ??
      row.source_imei
    ) ??
    null;

  if (!imei) {
    return {
      status: "skipped",
      vehicleId: null,
      imei: null,
      reason: "missing_imei"
    };
  }

  const vehicleIdentity = await fetchVehicleIdentityByImei(supabaseAdmin, imei);
  const clientName =
    toOriginalText(payload?.client_name ?? payload?.client) ??
    vehicleIdentity?.clientName ??
    parseClientFromReportName(payload?.report_name ?? row.report_name);
  const assignedAsset =
    toOriginalText(
      payload?.asset ??
      payload?.Asset ??
      payload?.registration_number ??
      payload?.vehicle_plate ??
      payload?.VehiclePlate
    ) ??
    vehicleIdentity?.assignedAsset ??
    imei;
  const gpsAt =
    parseDdMmYyyyHhMmSs(
      payload?.GPSDate ?? payload?.gps_date ?? payload?.date ?? payload?.timestamp ?? payload?.generated_date
    ) ??
    toIsoTimestamp(row.request_timestamp ?? row.received_at);

  if (!gpsAt) {
    return {
      status: "skipped",
      vehicleId: null,
      imei,
      reason: "missing_gps_date"
    };
  }

  const { data, error } = await supabaseAdmin.rpc("upsert_vehicle_live_state", {
    p_imei: imei,
    p_assigned_asset: assignedAsset,
    p_client_name: clientName,
    p_gps_at: gpsAt,
    p_engine_hours: toNumeric(payload?.EngineHours ?? payload?.engine_hours ?? payload?.hrs),
    p_is_ignition_on: toBoolean(payload?.IsIgnitionOn ?? payload?.is_ignition_on ?? payload?.ignition),
    p_vehicle_speed: toNumeric(payload?.VehicleSpeed ?? payload?.vehicle_speed ?? payload?.speed),
    p_driver_id: toOriginalText(payload?.DriverID ?? payload?.driver_id),
    p_latitude: toNumeric(payload?.Latitude ?? payload?.latitude),
    p_longitude: toNumeric(payload?.Longitude ?? payload?.longitude),
    p_odometer: toNumeric(payload?.Odometer ?? payload?.odometer),
    p_road_name: toOriginalText(payload?.RoadName ?? payload?.road_name),
    p_event_name: toOriginalText(payload?.EventName ?? payload?.event_name ?? payload?.event),
    p_event_id: toOriginalText(payload?.EventID ?? payload?.event_id),
    p_raw_inbound_id: row.id
  });

  if (error) throw error;

  const status = String(data?.status ?? "updated");
  const vehicleId = data?.vehicle_id ? String(data.vehicle_id) : null;

  await fillVehicleIdentityGaps(supabaseAdmin, vehicleId, {
    imei,
    clientName,
    assignedAsset
  });

  if (status === "stale_ignored") {
    return { status: "stale_ignored", vehicleId, imei, reason: null };
  }
  if (status === "skipped") {
    return {
      status: "skipped",
      vehicleId,
      imei,
      reason: toCleanString(data?.reason) ?? "skipped"
    };
  }

  return { status: "updated", vehicleId, imei, reason: null };
}

async function upsertDailyMovementFromTripReport(
  supabaseAdmin: any,
  row: any,
  payload: any,
  mapping: any,
  diagnostics?: ProcessingDiagnostics
): Promise<Trip137UpsertResult> {
  const reportType = String(row.report_type ?? payload?.report_type ?? "");
  if (reportType !== "137") return { count: 0, firstImei: null, firstReportName: null };

  const itemsFromData = asArray(payload?.data);
  const items = itemsFromData.length > 0 ? itemsFromData : looksLikeTripRecord(payload) ? [payload] : [];
  if (!items.length) return { count: 0, firstImei: null, firstReportName: null };

  const reportName = toOriginalText(payload?.report_name ?? row.report_name);
  const fallbackClient =
    toOriginalText(payload?.client_name ?? payload?.client) ??
    parseClientFromReportName(reportName ?? row.report_name);
  const identityCache = new Map<string, string | null>();
  const imeiIdentityCache = new Map<string, VehicleIdentity | null>();
  const tripRows: any[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const context = { ...payload, ...item };
    const transformed = mapping ? transform(context, mapping.mapping_config) : {};

    transformed.raw_inbound_id = row.id;
    transformed.applied_mapping_version = mapping?.version ?? null;
    ensureDailyMovementRequiredFields(transformed, context, payload);

    const imei =
      normalizeImei(
        context?.imei ??
        context?.imei_number ??
        context?.imeiNumber ??
        context?.source_imei ??
        context?.sourceImei ??
        transformed?.source_imei ??
        transformed?.sourceImei
      ) ??
      extractImeiFromPayload(context) ??
      extractSingleImeiFromPayload(context) ??
      extractImeiFromPayload(item) ??
      extractSingleImeiFromPayload(item) ??
      null;
    let imeiIdentity: VehicleIdentity | null = null;
    if (imei) {
      if (imeiIdentityCache.has(imei)) {
        imeiIdentity = imeiIdentityCache.get(imei) ?? null;
      } else {
        imeiIdentity = await fetchVehicleIdentityByImei(supabaseAdmin, imei);
        imeiIdentityCache.set(imei, imeiIdentity);
      }
    }

    const clientName =
      toOriginalText(context?.client_name ?? context?.client) ??
      imeiIdentity?.clientName ??
      fallbackClient;
    const registrationNumber =
      toOriginalText(context?.registration_number) ??
      toOriginalText(context?.asset) ??
      toOriginalText(transformed.registration_number) ??
      toOriginalText(transformed.asset_description) ??
      imeiIdentity?.assignedAsset ??
      null;

    const vehicleIdentityKey = `${imei ?? ""}|${clientName ?? ""}|${registrationNumber ?? ""}`;
    let vehicleId = identityCache.get(vehicleIdentityKey);

    if (vehicleId === undefined) {
      vehicleId = null;
      if (imei || registrationNumber) {
        const { data: syncResult, error: syncError } = await supabaseAdmin.rpc("sync_vehicle_from_fuel_report", {
          p_assigned_asset: registrationNumber,
          p_client_name: clientName,
          p_imei_number: imei
        });
        if (syncError) throw syncError;
        if (syncResult?.vehicle_id !== null && syncResult?.vehicle_id !== undefined) {
          vehicleId = String(syncResult.vehicle_id);
        }
      }
      identityCache.set(vehicleIdentityKey, vehicleId);

      await fillVehicleIdentityGaps(supabaseAdmin, vehicleId, {
        imei,
        clientName,
        assignedAsset: registrationNumber
      });
    }

    transformed.source_trip_key = toOriginalText(transformed.source_trip_key) ?? buildTripSourceKey(context, payload);
    transformed.report_name = transformed.report_name ?? reportName;
    transformed.source_imei = imei ?? transformed.source_imei ?? null;
    transformed.client_name = transformed.client_name ?? clientName;
    transformed.source_assigned_asset = transformed.source_assigned_asset ?? registrationNumber;
    transformed.vehicle_id = transformed.vehicle_id ?? vehicleId;
    transformed.asset_description = transformed.asset_description ?? registrationNumber;
    transformed.registration_number = transformed.registration_number ?? registrationNumber;
    transformed.report_date =
      toIsoTimestamp(context?.date ?? context?.start_time ?? payload?.generated_date ?? payload?.start_date ?? row.received_at) ??
      transformed.report_date;
    transformed.departure_time = transformed.departure_time ?? toIsoTimestamp(context?.start_time);
    transformed.departure_date = transformed.departure_date ?? toDateOnly(transformed.departure_time ?? transformed.report_date);
    transformed.arrival_time = transformed.arrival_time ?? toIsoTimestamp(context?.end_time);
    transformed.departed_from = transformed.departed_from ?? toOriginalText(context?.start_Location ?? context?.start_location);
    transformed.arrived_at = transformed.arrived_at ?? toOriginalText(context?.endLocation ?? context?.end_location);
    transformed.driving_time = transformed.driving_time ?? toOriginalText(context?.duration);
    transformed.distance_km = toNumeric(context?.kilometers ?? context?.distance ?? context?.distance_km ?? transformed.distance_km);
    transformed.max_speed_kmh = toInteger(context?.max_Speed ?? context?.max_speed ?? transformed.max_speed_kmh);
    transformed.fuel_used_litres = toNumeric(context?.fuelUsed ?? context?.fuel_used ?? transformed.fuel_used_litres);

    if (!transformed.source_trip_key) continue;
    tripRows.push(transformed);
  }

  if (!tripRows.length) return { count: 0, firstImei: null, firstReportName: reportName };

  const deduped = dedupeRecordsForUpsert(tripRows, "source_trip_key");
  const payloadDuplicates = Math.max(0, tripRows.length - deduped.length);
  if (payloadDuplicates > 0) {
    noteDuplicateHandling(diagnostics, `trip_reports payload deduped ${payloadDuplicates}`);
  }

  const { error: cleanupError } = await supabaseAdmin.from(TRIP_REPORT_TABLE).delete().eq("raw_inbound_id", row.id);
  if (cleanupError && extractMissingColumn(cleanupError, TRIP_REPORT_TABLE) !== "raw_inbound_id") {
    throw cleanupError;
  }

  let { error: upsertError } = await executeWithMissingColumnFallback(
    TRIP_REPORT_TABLE,
    deduped,
    async (candidatePayload) =>
      await supabaseAdmin.from(TRIP_REPORT_TABLE).upsert(candidatePayload, {
        onConflict: "raw_inbound_id,source_trip_key"
      })
  );

  if (isNoUniqueConstraintError(upsertError)) {
    try {
      await replaceTripRowsWithoutUniqueConstraint(supabaseAdmin, deduped);
      upsertError = null;
      noteDuplicateHandling(diagnostics, "trip_reports overwrite fallback used");
    } catch (fallbackError) {
      upsertError = fallbackError;
    }
  }

  if (upsertError) throw upsertError;

  return {
    count: deduped.length,
    firstImei: deduped.find((record) => normalizeImei(record?.source_imei))?.source_imei ?? null,
    firstReportName: reportName
  };
}

async function resolveActiveMapping(supabaseAdmin: any, row: any) {
  const reportType = String(row.report_type ?? "");
  const source = toCleanString(row.source) ?? "unknown";

  const exact = await supabaseAdmin
    .from("ingestion_mappings")
    .select("*")
    .eq("source", source)
    .eq("report_type", reportType)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (exact.error) throw exact.error;
  if (exact.data) return exact.data;

  if (source === "unknown") {
    const teletracFallback = await supabaseAdmin
      .from("ingestion_mappings")
      .select("*")
      .eq("source", "teletrac")
      .eq("report_type", reportType)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (teletracFallback.error) throw teletracFallback.error;
    if (teletracFallback.data) return teletracFallback.data;
  }

  const typeOnly = await supabaseAdmin
    .from("ingestion_mappings")
    .select("*")
    .eq("report_type", reportType)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (typeOnly.error) throw typeOnly.error;
  return typeOnly.data ?? null;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  const processSecret = Deno.env.get("PROCESS_SECRET");
  if (processSecret) {
    const url = new URL(req.url);
    const incomingSecret = req.headers.get("X-Process-Secret") || url.searchParams.get("secret");
    if (!incomingSecret || incomingSecret !== processSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const workerId = `worker-${crypto.randomUUID()}`;
  const configuredBatchSize = toInteger(Deno.env.get("PROCESS_BATCH_SIZE") ?? "1") ?? 1;
  const batchSize = Math.max(1, configuredBatchSize);
  const report0RetentionHours = toNumeric(Deno.env.get("REPORT0_RETENTION_HOURS") ?? "6") ?? 6;
  const report0PurgeBatchSize = Math.max(1, toInteger(Deno.env.get("REPORT0_PURGE_BATCH_SIZE") ?? "200") ?? 200);
  const report0PurgeMaxLoops = Math.max(1, toInteger(Deno.env.get("REPORT0_PURGE_MAX_LOOPS") ?? "25") ?? 25);
  const report0PurgeStatuses = parseCsvValues(Deno.env.get("REPORT0_PURGE_STATUSES"));
  const report0PurgeSource = toCleanString(Deno.env.get("REPORT0_PURGE_SOURCE"));
  const runId = await tryStartProcessingRunLog(supabaseAdmin, workerId);

  try {
    const purgeSummary = await purgeOldReport0Rows(supabaseAdmin, {
      retentionHours: report0RetentionHours,
      batchSize: report0PurgeBatchSize,
      maxLoops: report0PurgeMaxLoops,
      statuses: report0PurgeStatuses,
      source: report0PurgeSource
    });
    if (purgeSummary.error) {
      console.error("Report0 purge failed:", purgeSummary.error);
    } else if (purgeSummary.deleted > 0) {
      console.log(
        `Report0 purge deleted ${purgeSummary.deleted} rows older than ${purgeSummary.retentionHours}h (loops=${purgeSummary.loops})`
      );
    }

    const { data: batch, error: claimError } = await supabaseAdmin.rpc("claim_ingestion_batch", {
      p_worker_id: workerId,
      p_batch_size: batchSize
    });
    if (claimError) throw claimError;
    if (!batch || batch.length === 0) {
      await tryFinalizeProcessingRunLog(supabaseAdmin, runId, {
        status: "completed",
        claimed: 0,
        processed: 0,
        failed: 0,
        skipped: 0
      });
      return new Response(JSON.stringify({ message: "No pending rows found.", run_id: runId, report0_purge: purgeSummary }), {
        headers: { "content-type": "application/json" }
      });
    }

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const row of batch) {
      try {
        const payload = row.payload_json ?? {};
        const diagnostics: ProcessingDiagnostics = { duplicateNotes: [] };
        const reportType = String(row.report_type ?? "");
        const isFuelType50 = reportType === "50";
        let builtInHandled = false;

        if (reportType === "0") {
          const liveResult = await upsertVehicleLatestFromReport0(supabaseAdmin, row, payload);
          const processedUpdate: any = {
            status: "processed",
            processed_at: new Date().toISOString(),
            last_error: null,
            error_code: null,
            locked_at: null,
            locked_by: null
          };

          if (liveResult.imei) {
            processedUpdate.source_imei = liveResult.imei;
          }

          if (liveResult.status === "skipped") {
            skippedCount += 1;
            processedUpdate.last_error = liveResult.reason ?? "report_type 0 skipped";
            processedUpdate.error_code = "SKIPPED_REPORT0_INVALID";
          } else {
            successCount += 1;
          }

          await supabaseAdmin.from("raw_telemetry_inbound").update(processedUpdate).eq("id", row.id);
          continue;
        }

        const vehicleProfileCount = await upsertVehiclesFromProfilePayload(supabaseAdmin, row, payload);
        if (vehicleProfileCount > 0) builtInHandled = true;

        const mapping = await resolveActiveMapping(supabaseAdmin, row);
        const parsedFuelAssets: ParsedFuelReportName[] = [];
        const derivedFuelRows: FuelDerivedRecord[] = [];
        const itemsToProcess = Array.isArray(payload?.data) ? payload.data : [payload];

        const finalRecords = itemsToProcess.map((item: any) => {
          const context = { ...payload, ...item };
          const transformed = mapping ? transform(context, mapping.mapping_config) : {};

          transformed.raw_inbound_id = row.id;
          if (mapping?.version !== undefined && mapping?.version !== null) {
            transformed.applied_mapping_version = mapping.version;
          }

          if (isTripReportTableName(mapping?.target_table)) {
            ensureDailyMovementRequiredFields(transformed, context, payload);
          }

          const resolvedReportName = toOriginalText(
            transformed.report_name ?? context?.report_name ?? payload?.report_name ?? row.report_name
          );
          if (resolvedReportName && isTripReportTableName(mapping?.target_table)) {
            transformed.report_name = transformed.report_name ?? resolvedReportName;
          }

          const resolvedClientName =
            toOriginalText(
              transformed.client_name ??
              transformed.source_client_name ??
              transformed.company_name ??
              context?.client_name ??
              context?.client ??
              payload?.client_name ??
              payload?.client
            ) ?? parseClientFromReportName(resolvedReportName);

          if (resolvedClientName) {
            transformed.client_name = transformed.client_name ?? resolvedClientName;
          }

          const parsedFuel = enrichFuelRecordFromPayload(row, payload, context, transformed);
          if (parsedFuel) {
            parsedFuelAssets.push(parsedFuel);
            derivedFuelRows.push({ parsed: parsedFuel, context, transformed });
          }

          return transformed;
        });

        let trip137Result: Trip137UpsertResult | null = null;
        if (reportType === "137") {
          trip137Result = await upsertDailyMovementFromTripReport(supabaseAdmin, row, payload, mapping, diagnostics);
          builtInHandled = true;
          if (trip137Result.count === 0) {
            skippedCount += 1;
          }
        }

        if (mapping && reportType !== "50" && reportType !== "137") {
          const upsertOptions: any = {};
          if (mapping.upsert_target) {
            upsertOptions.onConflict = mapping.upsert_target;
          }
          const upsertRecords = dedupeRecordsForUpsert(finalRecords, mapping.upsert_target);
          const dedupedCount = Math.max(0, finalRecords.length - upsertRecords.length);
          if (dedupedCount > 0) {
            noteDuplicateHandling(
              diagnostics,
              `${mapping.target_table} payload deduped ${dedupedCount}`
            );
          }

          const runMappingUpsert = async (records: any[]) =>
            await executeWithMissingColumnFallback(mapping.target_table, records, async (candidatePayload) =>
              await supabaseAdmin.from(mapping.target_table).upsert(candidatePayload, upsertOptions)
            );

          let { error: upsertError } = await runMappingUpsert(upsertRecords);

          if (
            upsertError &&
            mapping.target_table === "telemetry_alerts" &&
            String(upsertError.message ?? "").includes("telemetry_alerts_report_id_key")
          ) {
            const withoutReportId = upsertRecords.map((record: any) => {
              const copy = { ...record };
              delete copy.report_id;
              return copy;
            });
            ({ error: upsertError } = await runMappingUpsert(withoutReportId));
          }

          if (upsertError && isNoUniqueConstraintError(upsertError) && mapping.upsert_target) {
            const skippedDuplicates = await replaceRowsByConflictTarget(
              supabaseAdmin,
              mapping.target_table,
              upsertRecords,
              mapping.upsert_target
            );
            if (skippedDuplicates > 0) {
              noteDuplicateHandling(
                diagnostics,
                `${mapping.target_table} overwrite fallback skipped ${skippedDuplicates} residual duplicates`
              );
            } else {
              noteDuplicateHandling(diagnostics, `${mapping.target_table} overwrite fallback used`);
            }
            upsertError = null;
          }

          if (upsertError && isUniqueViolationError(upsertError)) {
            const skippedDuplicates = await insertRowsSkippingUniqueViolations(
              supabaseAdmin,
              mapping.target_table,
              upsertRecords
            );
            if (skippedDuplicates > 0) {
              noteDuplicateHandling(
                diagnostics,
                `${mapping.target_table} skipped ${skippedDuplicates} already-existing duplicates`
              );
            } else {
              noteDuplicateHandling(diagnostics, `${mapping.target_table} used duplicate fallback`);
            }
            upsertError = null;
          }

          if (upsertError && isNoUniqueConstraintError(upsertError) && !mapping.upsert_target) {
            const skippedDuplicates = await insertRowsSkippingUniqueViolations(
              supabaseAdmin,
              mapping.target_table,
              upsertRecords
            );
            if (skippedDuplicates > 0) {
              noteDuplicateHandling(
                diagnostics,
                `${mapping.target_table} skipped ${skippedDuplicates} already-existing duplicates`
              );
            } else {
              noteDuplicateHandling(diagnostics, `${mapping.target_table} insert fallback used`);
            }
            upsertError = null;
          }

          if (upsertError) throw upsertError;
          builtInHandled = true;
        }

        if (isFuelType50 && parsedFuelAssets.length > 0) {
          const syncResults = await syncFuelAssetsToVehicles(supabaseAdmin, parsedFuelAssets);
          await upsertFuelNormalizedTables(supabaseAdmin, row, payload, derivedFuelRows, syncResults, diagnostics);
          builtInHandled = true;
        }

        if (!builtInHandled && !mapping) {
          skippedCount += 1;
          await supabaseAdmin
            .from("raw_telemetry_inbound")
            .update({
              status: "processed",
              processed_at: new Date().toISOString(),
              last_error: "No mapping configured for this source/report_type",
              error_code: "SKIPPED_NO_MAPPING",
              locked_at: null,
              locked_by: null
            })
            .eq("id", row.id);
          continue;
        }

        const processedUpdate: any = {
          status: "processed",
          processed_at: new Date().toISOString(),
          last_error: null,
          error_code: null,
          locked_at: null,
          locked_by: null
        };

        if (reportType === "50" && parsedFuelAssets.length > 0) {
          const firstImei = parsedFuelAssets.find((asset) => asset.imei_number)?.imei_number;
          const firstReportName = parsedFuelAssets.find((asset) => asset.report_name)?.report_name;
          if (firstImei) processedUpdate.source_imei = firstImei;
          if (firstReportName && !row.report_name) processedUpdate.report_name = firstReportName;
        }

        if (reportType === "137" && trip137Result) {
          processedUpdate.source_imei = null;
          if (trip137Result.firstReportName && !row.report_name) {
            processedUpdate.report_name = trip137Result.firstReportName;
          }
          if (trip137Result.count === 0) {
            processedUpdate.last_error = "No trip rows extracted from report_type 137 payload";
            processedUpdate.error_code = "SKIPPED_EMPTY_TRIP_DATA";
          }
        }

        const duplicateInfo = composeDuplicateInfoMessage(diagnostics);
        if (duplicateInfo) {
          if (processedUpdate.last_error) {
            processedUpdate.last_error = `${processedUpdate.last_error} | ${duplicateInfo}`;
          } else {
            processedUpdate.last_error = duplicateInfo;
          }
          if (!processedUpdate.error_code) {
            processedUpdate.error_code = "INFO_DUPLICATES_HANDLED";
          }
        }

        await supabaseAdmin.from("raw_telemetry_inbound").update(processedUpdate).eq("id", row.id);
        successCount += 1;
      } catch (err: any) {
        failedCount += 1;
        console.error(`Error processing row ${row.id}:`, err.message);

        const backoffSchedule = [1, 5, 15, 60, 360];
        const attempt = Number(row.attempt_count ?? 1);
        const backoffMinutes = backoffSchedule[Math.max(attempt - 1, 0)] || 360;

        const nextRetry = new Date();
        nextRetry.setMinutes(nextRetry.getMinutes() + backoffMinutes);
        const nextRetryIso = nextRetry.toISOString();

        await supabaseAdmin
          .from("raw_telemetry_inbound")
          .update({
            status: attempt >= 5 ? "dead_letter" : "pending",
            last_error: err.message,
            next_retry_at: nextRetryIso,
            locked_at: null,
            locked_by: null
          })
          .eq("id", row.id);

        await tryLogProcessingFailure(supabaseAdmin, runId, row, String(err?.message ?? "Unknown processing error"), nextRetryIso);
      }
    }

    await tryFinalizeProcessingRunLog(supabaseAdmin, runId, {
      status: failedCount > 0 ? "completed_with_errors" : "completed",
      claimed: batch.length,
      processed: successCount,
      failed: failedCount,
      skipped: skippedCount
    });

    return new Response(
      JSON.stringify({
        worker: workerId,
        run_id: runId,
        claimed: batch.length,
        processed: successCount,
        failed: failedCount,
        skipped: skippedCount,
        report0_purge: purgeSummary
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Worker fatal error:", err.message);
    await tryFinalizeProcessingRunLog(supabaseAdmin, runId, {
      status: "fatal",
      claimed: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
      error: String(err?.message ?? err)
    });
    return new Response(JSON.stringify({ error: err.message, run_id: runId }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});
