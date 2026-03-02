import ExcelJS from "exceljs";
import { createHash } from "crypto";
import { supabaseAdmin } from "./supabase";

type SupportedReportType = "137_trip_listing" | "daily_movement_trip_report";

type ParsedUpload = {
  matrix: string[][];
  headers: string[];
  rows: Array<Record<string, string>>;
};

type VehicleRef = {
  id: string;
  clientId: string | null;
  assetId: string | null;
  vehiclePlate: string | null;
  driverName: string | null;
  imei: string | null;
  clientName: string | null;
};

type InferredRow = {
  vehicle: VehicleRef;
  assetName: string;
  dateOnly: Date;
  dateText: string | null;
  startTimeSeconds: number | null;
  endTimeSeconds: number | null;
  durationText: string | null;
  durationHours: number;
  distanceKm: number | null;
  maxSpeedKmh: number | null;
  departureLocation: string | null;
  arrivalLocation: string | null;
  fuelUsedEventLiters: number | null;
  dailyFuelUsedLiters: number | null;
  totalDistanceKm: number | null;
  totalFuelUsedLiters: number | null;
  averageConsumptionKmL: number | null;
};

type ExtractedRowsResult = {
  inferredRows: InferredRow[];
  uniqueAssetsInFile: Set<string>;
  unmatchedAssets: Set<string>;
  inFileRows: number;
};

type DailyMovementHeaderIndexes = {
  driver: number;
  departureDate: number;
  departureTime: number;
  departedFrom: number;
  drivingTime: number;
  distance: number;
  maxSpeed: number;
  arrivalTime: number;
  arrivedAt: number;
  fuelUsed: number | null;
};

type TableDelta = {
  deleted: number;
  inserted: number;
};

type PeriodColumnOption = {
  column: string;
  start: string;
  end: string;
};

export type SourceOfTruthImportResult = {
  mode: "preview" | "apply";
  fingerprint: string;
  detectedReportType: SupportedReportType;
  fileName: string;
  period: {
    startDate: string;
    endDate: string;
  };
  assets: {
    inFile: number;
    matched: number;
    unmatched: string[];
  };
  rows: {
    inFile: number;
    matched: number;
  };
  tables: {
    tripReports: TableDelta;
    dailyMetrics: TableDelta;
    fuelEvents: TableDelta;
  };
  preview: {
    tripReports: Array<{
      registrationNumber: string | null;
      departureTime: string | null;
      arrivalTime: string | null;
      distanceKm: number | null;
      fuelUsedLitres: number | null;
      sourceTripKey: string | null;
    }>;
    dailyMetrics: Array<{
      metricDay: string;
      registrationNumber: string | null;
      totalDistanceTraveled: number;
      totalFuelConsumed: number;
      totalEngineHours: number;
      refillCount: number;
      theftCount: number;
    }>;
    fuelEvents: Array<{
      registrationNumber: string | null;
      eventType: string;
      volumeLiters: number;
      eventTime: string | null;
      location: string | null;
    }>;
  };
  notes: string[];
};

type SourceOfTruthImportOptions = {
  dryRun?: boolean;
  previewLimit?: number;
  expectedFingerprint?: string;
};

function canonicalKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeAsset(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseNumeric(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

function parseClockToSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
  return (hours * 3600) + (minutes * 60) + seconds;
}

function parseDurationToHours(value: string | null | undefined): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const clock = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3]);
    return ((hours * 3600) + (minutes * 60) + seconds) / 3600;
  }

  let totalSeconds = 0;
  const tokenRegex = /(\d+(?:\.\d+)?)\s*(hr|hrs|hour|hours|min|mins|minute|minutes|sec|secs|second|seconds)\b/gi;
  let tokenMatch: RegExpExecArray | null = null;
  while ((tokenMatch = tokenRegex.exec(trimmed)) !== null) {
    const valueNumber = Number(tokenMatch[1]);
    const unit = tokenMatch[2].toLowerCase();
    if (!Number.isFinite(valueNumber)) continue;
    if (unit.startsWith("hr") || unit.startsWith("hour")) totalSeconds += Math.round(valueNumber * 3600);
    if (unit.startsWith("min")) totalSeconds += Math.round(valueNumber * 60);
    if (unit.startsWith("sec")) totalSeconds += Math.round(valueNumber);
  }

  if (totalSeconds > 0) return totalSeconds / 3600;
  return 0;
}

function secondsToClock(value: number): string {
  const totalSeconds = Math.max(0, Math.trunc(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function combineDateAndSeconds(dateOnly: Date, seconds: number | null): string {
  const startOfDay = new Date(Date.UTC(dateOnly.getUTCFullYear(), dateOnly.getUTCMonth(), dateOnly.getUTCDate(), 0, 0, 0, 0));
  const totalSeconds = seconds ?? 0;
  return new Date(startOfDay.getTime() + (totalSeconds * 1000)).toISOString();
}

function toIsoTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeImei(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function buildTripSourceKey(params: {
  imei: string | null;
  asset: string | null;
  departureIso: string | null;
  arrivalIso: string | null;
  distanceKm: number | null;
  durationText: string | null;
}): string {
  const parts = [
    params.imei ?? "",
    params.asset ?? "",
    params.departureIso ?? "",
    params.arrivalIso ?? "",
    "",
    "",
    params.distanceKm === null ? "" : String(params.distanceKm),
    params.durationText ?? "",
  ];
  return parts.join("|");
}

function looksLikeTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\d{1,2}:\d{2}/.test(value) || value.includes("T");
}

function computeImportFingerprint(params: {
  detectedReportType: SupportedReportType;
  fileName: string;
  period: { startDate: string; endDate: string };
  vehicleIds: string[];
  tripReportRows: Record<string, any>[];
  dailyMetricRows: Record<string, any>[];
  fuelEventRows: Record<string, any>[];
}): string {
  const hash = createHash("sha256");
  hash.update(`report=${params.detectedReportType}\n`);
  hash.update(`file=${params.fileName}\n`);
  hash.update(`period=${params.period.startDate}|${params.period.endDate}\n`);
  hash.update(`vehicles=${[...params.vehicleIds].sort().join(",")}\n`);

  for (const row of params.tripReportRows) {
    hash.update(
      `trip|${row.vehicle_id ?? ""}|${row.source_trip_key ?? ""}|${row.departure_time ?? ""}|${row.arrival_time ?? ""}|${row.distance_km ?? ""}|${row.fuel_used_litres ?? ""}\n`
    );
  }
  for (const row of params.dailyMetricRows) {
    hash.update(
      `metric|${row.vehicle_id ?? ""}|${row.metric_day ?? ""}|${row.total_distance_traveled ?? ""}|${row.total_fuel_consumed ?? ""}|${row.total_engine_hours ?? ""}|${row.refill_count ?? row.number_of_refills ?? ""}|${row.drain_count ?? row.number_of_thefts ?? ""}\n`
    );
  }
  for (const row of params.fuelEventRows) {
    hash.update(
      `event|${row.vehicle_id ?? ""}|${row.event_type ?? ""}|${row.event_time ?? row.event_timestamp ?? ""}|${row.volume_liters ?? ""}\n`
    );
  }

  return hash.digest("hex");
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function extractMissingColumn(error: any, tableName: string): string | null {
  const message = String(error?.message ?? "");
  const details = String(error?.details ?? "");
  const hint = String(error?.hint ?? "");
  const combined = `${message}\n${details}\n${hint}`;

  const postgrestMatch = combined.match(
    /Could not find the '([^']+)' column of '([^']+)' in the schema cache/i
  );
  if (postgrestMatch) {
    const [, column, relation] = postgrestMatch;
    if (relation?.toLowerCase() === tableName.toLowerCase()) return column;
  }

  const relationMatch = combined.match(
    new RegExp(`column\\s+"?([a-zA-Z0-9_]+)"?\\s+of\\s+relation\\s+"?${tableName}"?\\s+does not exist`, "i")
  );
  if (relationMatch?.[1]) return relationMatch[1];

  const genericMatch = combined.match(/column\s+("?)([a-zA-Z0-9_.]+)\1\s+does not exist/i);
  if (genericMatch?.[2]) {
    const token = genericMatch[2];
    const pieces = token.split(".");
    return pieces[pieces.length - 1] ?? null;
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
    if (!error) return { data, error: null, finalPayload: payload };

    const missingColumn = extractMissingColumn(error, tableName);
    if (!missingColumn) return { data, error, finalPayload: payload };

    const removed = removeColumnFromPayload(payload, missingColumn);
    if (!removed) return { data, error, finalPayload: payload };
  }

  return {
    data: null,
    error: new Error(`Could not resolve schema mismatch for ${tableName} within fallback attempts.`),
    finalPayload: payload,
  };
}

function isMissingColumnError(error: any, tableName: string, column: string): boolean {
  const extracted = extractMissingColumn(error, tableName);
  return extracted ? extracted.toLowerCase() === column.toLowerCase() : false;
}

function describeError(error: any): string {
  if (!error) return "unknown error";
  const message = String(error?.message ?? "").trim();
  const details = String(error?.details ?? "").trim();
  const hint = String(error?.hint ?? "").trim();
  const parts = [message, details, hint].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(" | ") : JSON.stringify(error);
}

async function resolvePeriodColumn(
  tableName: "trip_reports" | "daily_metrics" | "fuel_events",
  options: PeriodColumnOption[]
): Promise<PeriodColumnOption> {
  let lastError: any = null;

  for (const option of options) {
    const { error } = await supabaseAdmin
      .from(tableName)
      .select("id", { head: true, count: "exact" })
      .order(option.column, { ascending: false })
      .limit(1);
    if (!error) return option;
    lastError = error;

    const blankMessage = String(error?.message ?? "").trim().length === 0;
    if (isMissingColumnError(error, tableName, option.column) || blankMessage) continue;

    throw new Error(
      `Failed resolving period column ${tableName}.${option.column}: ${describeError(error)}`
    );
  }

  const tried = options.map((option) => option.column).join(", ");
  throw new Error(
    `No usable period column found on ${tableName}. Tried: ${tried}. Last error: ${describeError(lastError)}`
  );
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") {
          currentCell += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentCell.trim());
      const hasAnyValue = currentRow.some((cell) => cell.length > 0);
      if (hasAnyValue) rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (char === "\r") continue;
    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    const hasAnyValue = currentRow.some((cell) => cell.length > 0);
    if (hasAnyValue) rows.push(currentRow);
  }

  return rows;
}

function readWorksheetAsMatrix(worksheet: ExcelJS.Worksheet): string[][] {
  const matrix: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1).map((value) => {
      if (value === null || value === undefined) return "";
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "object") {
        const richText = (value as any)?.richText;
        if (Array.isArray(richText)) {
          return richText.map((part: any) => String(part?.text || "")).join("");
        }
        if (typeof (value as any)?.text === "string") return (value as any).text;
        if ((value as any)?.result !== undefined && (value as any)?.result !== null) return String((value as any).result);
      }
      return String(value);
    });

    if (values.some((cell) => cell.trim().length > 0)) {
      matrix.push(values.map((cell) => cell.trim()));
    }
  });
  return matrix;
}

function buildRecordsFromHeaderRow(matrix: string[][], headerRowIndex = 0): { headers: string[]; rows: Array<Record<string, string>> } {
  const headerRow = matrix[headerRowIndex] || [];
  const headers = headerRow.map((header) => canonicalKey(String(header || "").trim()));
  const rows = matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => cell && cell.trim().length > 0))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (!header) return;
        record[header] = (row[index] || "").trim();
      });
      return record;
    });

  return { headers, rows };
}

async function parseUploadFile(fileName: string, buffer: Buffer): Promise<ParsedUpload> {
  const lowerName = fileName.toLowerCase();
  let matrix: string[][];

  if (lowerName.endsWith(".csv")) {
    matrix = parseCsvMatrix(buffer.toString("utf8"));
  } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("No worksheet found in the uploaded Excel file.");
    matrix = readWorksheetAsMatrix(worksheet);
  } else {
    throw new Error("Unsupported file format. Upload CSV or XLSX.");
  }

  if (!matrix.length) throw new Error("The uploaded file is empty.");
  const parsedRecords = buildRecordsFromHeaderRow(matrix, 0);
  return {
    matrix,
    headers: parsedRecords.headers,
    rows: parsedRecords.rows,
  };
}

function findIndexContaining(values: string[], token: string): number {
  const idx = values.findIndex((value) => value.includes(token));
  return idx >= 0 ? idx : -1;
}

function detectDailyMovementHeaderIndexes(row: string[]): DailyMovementHeaderIndexes | null {
  const normalized = row.map((cell) => canonicalKey(cell));

  const driver = findIndexContaining(normalized, "driver");
  const departureDate = findIndexContaining(normalized, "departuredate");
  const departureTime = findIndexContaining(normalized, "departuretime");
  const departedFrom = findIndexContaining(normalized, "departedfrom");
  const drivingTime = findIndexContaining(normalized, "drivingtime");
  const distance = findIndexContaining(normalized, "distance");
  const maxSpeed = findIndexContaining(normalized, "maxspeed");
  const arrivalTime = findIndexContaining(normalized, "arrivaltime");
  const arrivedAt = findIndexContaining(normalized, "arrivedat");

  if (
    driver < 0 ||
    departureDate < 0 ||
    departureTime < 0 ||
    departedFrom < 0 ||
    drivingTime < 0 ||
    distance < 0 ||
    maxSpeed < 0 ||
    arrivalTime < 0 ||
    arrivedAt < 0
  ) {
    return null;
  }

  const fuelUsed = findIndexContaining(normalized, "fuelused");
  return {
    driver,
    departureDate,
    departureTime,
    departedFrom,
    drivingTime,
    distance,
    maxSpeed,
    arrivalTime,
    arrivedAt,
    fuelUsed: fuelUsed >= 0 ? fuelUsed : null,
  };
}

function detectReportType(parsed: ParsedUpload): SupportedReportType {
  const headerSet = new Set(parsed.headers);
  const looksLikeTripListing =
    headerSet.has("assetname") &&
    headerSet.has("date") &&
    headerSet.has("start") &&
    headerSet.has("end") &&
    headerSet.has("distance") &&
    headerSet.has("duration");

  if (looksLikeTripListing) return "137_trip_listing";

  const hasDailyMovementHeader = parsed.matrix.some((row) => detectDailyMovementHeaderIndexes(row) !== null);
  if (hasDailyMovementHeader) return "daily_movement_trip_report";

  throw new Error("Unsupported headers. Upload a fuel trip listing or daily movement trip report file.");
}

function getRecordValue(record: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const normalized = canonicalKey(key);
    const value = record[normalized];
    if (value !== undefined && value !== null && value.trim().length > 0) return value.trim();
  }
  return null;
}

function dateRangeForDayKeys(dayKeys: string[]): { startIso: string; endIso: string; startDate: string; endDate: string } {
  const sorted = [...dayKeys].sort();
  const startDate = sorted[0];
  const endDate = sorted[sorted.length - 1];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate,
    endDate,
  };
}

function buildVehicleLookup(vehicles: VehicleRef[]): Map<string, VehicleRef> {
  const lookup = new Map<string, VehicleRef>();
  for (const vehicle of vehicles) {
    const candidates = [vehicle.assetId, vehicle.vehiclePlate, vehicle.id];
    for (const candidate of candidates) {
      if (!candidate) continue;
      lookup.set(normalizeAsset(candidate), vehicle);
    }
  }
  return lookup;
}

function extractFromTripListing(
  rows: Array<Record<string, string>>,
  vehicleLookup: Map<string, VehicleRef>,
  notes: string[]
): ExtractedRowsResult {
  const uniqueAssetsInFile = new Set<string>();
  const unmatchedAssets = new Set<string>();
  const inferredRows: InferredRow[] = [];

  for (const row of rows) {
    const assetName = getRecordValue(row, ["asset_name", "asset", "asset_id", "registration_number", "vehicle_plate"]);
    if (!assetName) continue;
    uniqueAssetsInFile.add(assetName);

    const matchedVehicle = vehicleLookup.get(normalizeAsset(assetName));
    if (!matchedVehicle) {
      unmatchedAssets.add(assetName);
      continue;
    }

    const dateText = getRecordValue(row, ["date", "report_date"]);
    const dateOnly = parseDateOnly(dateText);
    if (!dateOnly) {
      notes.push(`Skipped row for asset ${assetName}: invalid date "${dateText || ""}".`);
      continue;
    }

    inferredRows.push({
      vehicle: matchedVehicle,
      assetName,
      dateOnly,
      dateText,
      startTimeSeconds: parseClockToSeconds(getRecordValue(row, ["start", "departure_time"])),
      endTimeSeconds: parseClockToSeconds(getRecordValue(row, ["end", "arrival_time"])),
      durationText: getRecordValue(row, ["duration", "driving_time"]),
      durationHours: parseDurationToHours(getRecordValue(row, ["duration", "driving_time"])),
      distanceKm: parseNumeric(getRecordValue(row, ["distance", "distance_km"])),
      maxSpeedKmh: parseNumeric(getRecordValue(row, ["max_speed", "max_speed_kmh"])),
      departureLocation: getRecordValue(row, ["from", "departed_from"]),
      arrivalLocation: getRecordValue(row, ["to", "arrived_at"]),
      fuelUsedEventLiters: parseNumeric(getRecordValue(row, ["fuel_used", "fuel_used_litres"])),
      dailyFuelUsedLiters: parseNumeric(getRecordValue(row, ["fuel_used_daily", "total_fuel_used"])),
      totalDistanceKm: parseNumeric(getRecordValue(row, ["total_distance"])),
      totalFuelUsedLiters: parseNumeric(getRecordValue(row, ["total_fuel_used"])),
      averageConsumptionKmL: parseNumeric(
        getRecordValue(row, [
          "avg_fuel_consumption",
          "fuel_consumption_daily",
          "avg_fuel_consumption_daily",
          "consumption",
        ])
      ),
    });
  }

  return {
    inferredRows,
    uniqueAssetsInFile,
    unmatchedAssets,
    inFileRows: rows.length,
  };
}

function extractFromDailyMovementTripReport(
  matrix: string[][],
  vehicleLookup: Map<string, VehicleRef>,
  notes: string[]
): ExtractedRowsResult {
  const uniqueAssetsInFile = new Set<string>();
  const unmatchedAssets = new Set<string>();
  const inferredRows: InferredRow[] = [];
  let inFileRows = 0;

  let currentAssetName: string | null = null;
  let currentHeader: DailyMovementHeaderIndexes | null = null;

  for (const row of matrix) {
    const firstCell = row[0] || "";
    const firstToken = canonicalKey(firstCell);

    if (firstToken === "registrationnumber" || firstToken === "assetdescription") {
      const nextAssetValue = row.find((cell, index) => index > 0 && String(cell || "").trim().length > 0) || null;
      currentAssetName = nextAssetValue ? nextAssetValue.trim() : null;
      if (currentAssetName) uniqueAssetsInFile.add(currentAssetName);
      currentHeader = null;
      continue;
    }

    const headerCandidate = detectDailyMovementHeaderIndexes(row);
    if (headerCandidate) {
      currentHeader = headerCandidate;
      continue;
    }

    if (!currentHeader) continue;

    if (firstToken === "totals" || firstToken === "averages") continue;
    if (firstToken === "sitename") continue;
    if (firstToken === "registrationnumber" || firstToken === "assetdescription") continue;

    const departureDate = row[currentHeader.departureDate] || "";
    const departureTime = row[currentHeader.departureTime] || "";
    const arrivalTime = row[currentHeader.arrivalTime] || "";
    const distanceRaw = row[currentHeader.distance] || "";
    const hasDataSignal = Boolean(departureDate || departureTime || arrivalTime || distanceRaw);
    if (!hasDataSignal) continue;

    inFileRows += 1;

    if (!currentAssetName) {
      notes.push(`Skipped movement row ${inFileRows}: no Registration Number context found in file section.`);
      continue;
    }

    const matchedVehicle = vehicleLookup.get(normalizeAsset(currentAssetName));
    if (!matchedVehicle) {
      unmatchedAssets.add(currentAssetName);
      continue;
    }

    const dateOnly = parseDateOnly(departureDate);
    if (!dateOnly) {
      notes.push(`Skipped movement row for asset ${currentAssetName}: invalid Departure Date "${departureDate}".`);
      continue;
    }

    const fuelUsedRaw =
      currentHeader.fuelUsed !== null && currentHeader.fuelUsed >= 0
        ? row[currentHeader.fuelUsed] || ""
        : "";

    inferredRows.push({
      vehicle: matchedVehicle,
      assetName: currentAssetName,
      dateOnly,
      dateText: departureDate || null,
      startTimeSeconds: parseClockToSeconds(departureTime),
      endTimeSeconds: parseClockToSeconds(arrivalTime),
      durationText: (row[currentHeader.drivingTime] || "").trim() || null,
      durationHours: parseDurationToHours(row[currentHeader.drivingTime] || ""),
      distanceKm: parseNumeric(distanceRaw),
      maxSpeedKmh: parseNumeric(row[currentHeader.maxSpeed] || ""),
      departureLocation: (row[currentHeader.departedFrom] || "").trim() || null,
      arrivalLocation: (row[currentHeader.arrivedAt] || "").trim() || null,
      fuelUsedEventLiters: parseNumeric(fuelUsedRaw),
      dailyFuelUsedLiters: null,
      totalDistanceKm: null,
      totalFuelUsedLiters: null,
      averageConsumptionKmL: null,
    });
  }

  return {
    inferredRows,
    uniqueAssetsInFile,
    unmatchedAssets,
    inFileRows,
  };
}

function extractInferredRows(
  parsed: ParsedUpload,
  reportType: SupportedReportType,
  vehicleLookup: Map<string, VehicleRef>,
  notes: string[]
): ExtractedRowsResult {
  if (reportType === "137_trip_listing") {
    return extractFromTripListing(parsed.rows, vehicleLookup, notes);
  }
  return extractFromDailyMovementTripReport(parsed.matrix, vehicleLookup, notes);
}

async function countRowsByPeriod(
  tableName: "trip_reports" | "daily_metrics" | "fuel_events",
  vehicleIds: string[],
  periodColumn: PeriodColumnOption
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(tableName)
    .select("id", { head: true, count: "exact" })
    .in("vehicle_id", vehicleIds)
    .gte(periodColumn.column, periodColumn.start)
    .lte(periodColumn.column, periodColumn.end);

  if (error) throw error;
  return count || 0;
}

async function deleteRowsByPeriod(
  tableName: "trip_reports" | "daily_metrics" | "fuel_events",
  vehicleIds: string[],
  periodColumn: PeriodColumnOption
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .in("vehicle_id", vehicleIds)
    .gte(periodColumn.column, periodColumn.start)
    .lte(periodColumn.column, periodColumn.end);

  if (error) throw error;
}

async function fetchRowsByPeriod(
  tableName: "trip_reports" | "daily_metrics" | "fuel_events",
  vehicleIds: string[],
  periodColumn: PeriodColumnOption
): Promise<Record<string, any>[]> {
  const { data, error } = await supabaseAdmin
    .from(tableName)
    .select("*")
    .in("vehicle_id", vehicleIds)
    .gte(periodColumn.column, periodColumn.start)
    .lte(periodColumn.column, periodColumn.end);
  if (error) throw error;
  return (data || []) as Record<string, any>[];
}

async function insertRowsInBatches(tableName: string, rows: Record<string, any>[], batchSize = 400): Promise<void> {
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

export async function importSourceOfTruthFile(
  fileName: string,
  buffer: Buffer,
  options: SourceOfTruthImportOptions = {}
): Promise<SourceOfTruthImportResult> {
  const dryRun = options.dryRun === true;
  const previewLimit = typeof options.previewLimit === "number" && Number.isFinite(options.previewLimit)
    ? Math.max(1, Math.trunc(options.previewLimit))
    : 8;
  const expectedFingerprint = options.expectedFingerprint?.trim() || null;

  const parsed = await parseUploadFile(fileName, buffer);
  const detectedReportType = detectReportType(parsed);

  const { data: vehicleRows, error: vehiclesError } = await supabaseAdmin
    .from("vehicles")
    .select("*");
  if (vehiclesError) throw vehiclesError;

  const vehicles: VehicleRef[] = (vehicleRows || []).map((row: any) => ({
    id: String(row.id),
    clientId: row.client_id ? String(row.client_id) : null,
    assetId: row.asset_id ? String(row.asset_id) : null,
    vehiclePlate: row.vehicle_plate ? String(row.vehicle_plate) : null,
    driverName: row.driver_name ? String(row.driver_name) : null,
    imei: normalizeImei(row.imei ? String(row.imei) : null),
    clientName: row.client_name ? String(row.client_name) : null,
  }));
  const vehicleLookup = buildVehicleLookup(vehicles);

  const notes: string[] = [];
  const extracted = extractInferredRows(parsed, detectedReportType, vehicleLookup, notes);
  const { inferredRows, uniqueAssetsInFile, unmatchedAssets, inFileRows } = extracted;

  if (!inferredRows.length) {
    throw new Error("No rows matched existing assets. Ensure asset names/plates in file exist in Vehicles.");
  }

  const vehicleIds = Array.from(new Set(inferredRows.map((row) => row.vehicle.id)));
  const dayKeys = Array.from(new Set(inferredRows.map((row) => row.dateOnly.toISOString().slice(0, 10))));
  const range = dateRangeForDayKeys(dayKeys);

  const reportTitle =
    detectedReportType === "137_trip_listing"
      ? "Fuel Trip Listing Report"
      : "Daily Movement Trip Report";

  const tripRowsByKey = new Map<string, Record<string, any>>();
  for (const row of inferredRows) {
    const dayKey = row.dateOnly.toISOString().slice(0, 10);
    const reportDateFallback = `${dayKey}T00:00:00.000Z`;
    const reportTimestamp = looksLikeTimestamp(row.dateText)
      ? (toIsoTimestamp(row.dateText) ?? reportDateFallback)
      : reportDateFallback;
    const departureTimestamp = combineDateAndSeconds(row.dateOnly, row.startTimeSeconds);
    const arrivalTimestamp = combineDateAndSeconds(row.dateOnly, row.endTimeSeconds ?? row.startTimeSeconds);
    const durationText = row.durationText ?? secondsToClock(Math.round(row.durationHours * 3600));
    const sourceTripKey = buildTripSourceKey({
      imei: row.vehicle.imei,
      asset: row.assetName,
      departureIso: departureTimestamp,
      arrivalIso: arrivalTimestamp,
      distanceKm: row.distanceKm,
      durationText,
    });

    const reportName = `${reportTitle}|${row.vehicle.clientName || "Source Of Truth"}`;
    const payload = {
      raw_inbound_id: null,
      applied_mapping_version: 2,
      source_trip_key: sourceTripKey,
      report_name: reportName,
      source_imei: row.vehicle.imei,
      source_assigned_asset: row.assetName,
      client_name: row.vehicle.clientName,
      report_date: reportTimestamp,
      client_id: row.vehicle.clientId,
      vehicle_id: row.vehicle.id,
      asset_description: row.assetName,
      registration_number: row.assetName,
      departure_date: reportDateFallback,
      driver: row.vehicle.driverName || "Unknown",
      departure_time: departureTimestamp,
      departed_from: row.departureLocation,
      driving_time: durationText,
      standing_time: "00:00:00",
      distance_km: row.distanceKm,
      max_speed_kmh: row.maxSpeedKmh !== null ? Math.round(row.maxSpeedKmh) : null,
      arrival_time: arrivalTimestamp,
      arrived_at: row.arrivalLocation,
      next_departure: null,
      standing_time_at_location: "00:00:00",
      fuel_used_litres: row.fuelUsedEventLiters,
    };

    tripRowsByKey.set(`${row.vehicle.id}|${sourceTripKey}`, payload);
  }

  const tripReportRows = Array.from(tripRowsByKey.values());
  if (tripReportRows.length < inferredRows.length) {
    notes.push(
      `Deduplicated ${inferredRows.length - tripReportRows.length} trip row(s) using report_type 137 source_trip_key logic.`
    );
  }

  const fuelEventRowsRaw = inferredRows
    .filter((row) => row.fuelUsedEventLiters !== null && Math.abs(row.fuelUsedEventLiters) > 0)
    .map((row) => {
      const value = row.fuelUsedEventLiters as number;
      const eventType = value >= 0 ? "refill" : "theft";
      const eventTimestamp = combineDateAndSeconds(row.dateOnly, row.endTimeSeconds ?? row.startTimeSeconds);
      return {
        raw_inbound_id: null,
        temperature_report_id: null,
        vehicle_id: row.vehicle.id,
        imei_number: row.vehicle.imei,
        client_name: row.vehicle.clientName,
        registration_number: row.assetName,
        event_type: eventType,
        volume_liters: Math.abs(value),
        refilled: eventType === "refill" ? Math.abs(value) : -Math.abs(value),
        location: row.arrivalLocation || row.departureLocation,
        notes: `Source-of-truth backfill (${fileName})`,
        event_timestamp: eventTimestamp,
        event_time: eventTimestamp,
      };
    });

  const fuelEventRowsByKey = new Map<string, Record<string, any>>();
  for (const fuelEventRow of fuelEventRowsRaw) {
    const dedupeKey = [
      fuelEventRow.vehicle_id ?? "",
      fuelEventRow.event_type ?? "",
      fuelEventRow.event_timestamp ?? fuelEventRow.event_time ?? "",
      Number(fuelEventRow.volume_liters ?? 0).toFixed(3),
      String(fuelEventRow.location ?? "").trim().toLowerCase(),
    ].join("|");
    fuelEventRowsByKey.set(dedupeKey, fuelEventRow);
  }
  const fuelEventRows = Array.from(fuelEventRowsByKey.values());
  if (fuelEventRows.length < fuelEventRowsRaw.length) {
    notes.push(`Deduplicated ${fuelEventRowsRaw.length - fuelEventRows.length} fuel event row(s) from source file.`);
  }

  const dailyMetricMap = new Map<
    string,
    {
      vehicleId: string;
      metricDateTime: string;
      metricDay: string;
      imei: string | null;
      clientName: string | null;
      registrationNumber: string | null;
      totalDistance: number;
      totalEngineHours: number;
      dailyFuelUsed: number | null;
      refillCount: number;
      theftCount: number;
    }
  >();

  for (const row of inferredRows) {
    const dayKey = row.dateOnly.toISOString().slice(0, 10);
    const mapKey = `${row.vehicle.id}|${dayKey}`;
    const existing = dailyMetricMap.get(mapKey) || {
      vehicleId: row.vehicle.id,
      metricDateTime: `${dayKey}T00:00:00.000Z`,
      metricDay: dayKey,
      imei: row.vehicle.imei,
      clientName: row.vehicle.clientName,
      registrationNumber: row.assetName,
      totalDistance: 0,
      totalEngineHours: 0,
      dailyFuelUsed: null,
      refillCount: 0,
      theftCount: 0,
    };

    if (!existing.imei && row.vehicle.imei) existing.imei = row.vehicle.imei;
    if (!existing.clientName && row.vehicle.clientName) existing.clientName = row.vehicle.clientName;
    if (!existing.registrationNumber && row.assetName) existing.registrationNumber = row.assetName;

    existing.totalDistance += row.distanceKm ?? 0;
    existing.totalEngineHours += row.durationHours;
    if (row.dailyFuelUsedLiters !== null) {
      existing.dailyFuelUsed = existing.dailyFuelUsed === null
        ? row.dailyFuelUsedLiters
        : Math.max(existing.dailyFuelUsed, row.dailyFuelUsedLiters);
    }

    if (row.fuelUsedEventLiters !== null && Math.abs(row.fuelUsedEventLiters) > 0) {
      if (row.fuelUsedEventLiters >= 0) existing.refillCount += 1;
      if (row.fuelUsedEventLiters < 0) existing.theftCount += 1;
    }

    dailyMetricMap.set(mapKey, existing);
  }

  const dailyMetricRows = Array.from(dailyMetricMap.values()).map((metric) => ({
    raw_inbound_id: null,
    vehicle_id: metric.vehicleId,
    metric_date: metric.metricDateTime,
    metric_day: metric.metricDay,
    imei_number: metric.imei,
    client_name: metric.clientName,
    registration_number: metric.registrationNumber,
    report_type: "137",
    generated_at: new Date().toISOString(),
    total_fuel_consumed: metric.dailyFuelUsed ?? 0,
    total_distance_traveled: Number(metric.totalDistance.toFixed(3)),
    total_engine_hours: Number(metric.totalEngineHours.toFixed(3)),
    idle_time_hours: 0,
    refill_count: metric.refillCount,
    drain_count: metric.theftCount,
    number_of_refills: metric.refillCount,
    number_of_thefts: metric.theftCount,
    operating_cost_kes: 0,
    operating_cost_ugx: 0,
  }));

  const fingerprint = computeImportFingerprint({
    detectedReportType,
    fileName,
    period: { startDate: range.startDate, endDate: range.endDate },
    vehicleIds,
    tripReportRows,
    dailyMetricRows,
    fuelEventRows,
  });

  if (expectedFingerprint && expectedFingerprint !== fingerprint) {
    throw new Error("Preview/apply fingerprint mismatch. Run preview again before apply.");
  }

  const tripPeriodColumn = await resolvePeriodColumn("trip_reports", [
    { column: "report_date", start: range.startIso, end: range.endIso },
    { column: "departure_date", start: range.startIso, end: range.endIso },
  ]);
  const dailyMetricPeriodColumn = await resolvePeriodColumn("daily_metrics", [
    { column: "metric_date", start: range.startDate, end: range.endDate },
    { column: "metric_day", start: range.startDate, end: range.endDate },
  ]);
  const fuelEventPeriodColumn = await resolvePeriodColumn("fuel_events", [
    { column: "event_timestamp", start: range.startIso, end: range.endIso },
    { column: "event_time", start: range.startIso, end: range.endIso },
  ]);

  const [tripReportsToDelete, dailyMetricsToDelete, fuelEventsToDelete] = await Promise.all([
    countRowsByPeriod("trip_reports", vehicleIds, tripPeriodColumn),
    countRowsByPeriod("daily_metrics", vehicleIds, dailyMetricPeriodColumn),
    countRowsByPeriod("fuel_events", vehicleIds, fuelEventPeriodColumn),
  ]);

  const preview = {
    tripReports: tripReportRows.slice(0, previewLimit).map((row) => ({
      registrationNumber: row.registration_number ?? null,
      departureTime: row.departure_time ?? null,
      arrivalTime: row.arrival_time ?? null,
      distanceKm: row.distance_km ?? null,
      fuelUsedLitres: row.fuel_used_litres ?? null,
      sourceTripKey: row.source_trip_key ?? null,
    })),
    dailyMetrics: dailyMetricRows.slice(0, previewLimit).map((row) => ({
      metricDay: String(row.metric_day ?? "").slice(0, 10),
      registrationNumber: row.registration_number ?? null,
      totalDistanceTraveled: Number(row.total_distance_traveled ?? 0),
      totalFuelConsumed: Number(row.total_fuel_consumed ?? 0),
      totalEngineHours: Number(row.total_engine_hours ?? 0),
      refillCount: Number(row.refill_count ?? row.number_of_refills ?? 0),
      theftCount: Number(row.drain_count ?? row.number_of_thefts ?? 0),
    })),
    fuelEvents: fuelEventRows.slice(0, previewLimit).map((row) => ({
      registrationNumber: row.registration_number ?? null,
      eventType: String(row.event_type ?? ""),
      volumeLiters: Number(row.volume_liters ?? 0),
      eventTime: row.event_time ?? row.event_timestamp ?? null,
      location: row.location ?? null,
    })),
  };

  const vehicleSummary = new Map<
    string,
    {
      distance: number | null;
      fuelUsed: number | null;
      consumption: number | null;
    }
  >();
  for (const row of inferredRows) {
    const existing = vehicleSummary.get(row.vehicle.id) || {
      distance: null,
      fuelUsed: null,
      consumption: null,
    };

    if (row.totalDistanceKm !== null) {
      existing.distance = existing.distance === null ? row.totalDistanceKm : Math.max(existing.distance, row.totalDistanceKm);
    }
    if (row.totalFuelUsedLiters !== null) {
      existing.fuelUsed = existing.fuelUsed === null ? row.totalFuelUsedLiters : Math.max(existing.fuelUsed, row.totalFuelUsedLiters);
    }
    if (row.averageConsumptionKmL !== null) {
      existing.consumption = existing.consumption === null ? row.averageConsumptionKmL : Math.max(existing.consumption, row.averageConsumptionKmL);
    }

    vehicleSummary.set(row.vehicle.id, existing);
  }

  if (!dryRun) {
    const [tripBackupRows, dailyBackupRows, fuelBackupRows] = await Promise.all([
      fetchRowsByPeriod("trip_reports", vehicleIds, tripPeriodColumn),
      fetchRowsByPeriod("daily_metrics", vehicleIds, dailyMetricPeriodColumn),
      fetchRowsByPeriod("fuel_events", vehicleIds, fuelEventPeriodColumn),
    ]);

    const { data: vehicleBackupData, error: vehicleBackupError } = await supabaseAdmin
      .from("vehicles")
      .select("id,total_distance,total_fuel_used,consumption_kml,updated_at")
      .in("id", vehicleIds);
    if (vehicleBackupError) throw vehicleBackupError;

    const vehicleBackups = (vehicleBackupData || []).map((vehicle) => ({
      id: String((vehicle as any).id),
      total_distance: (vehicle as any).total_distance,
      total_fuel_used: (vehicle as any).total_fuel_used,
      consumption_kml: (vehicle as any).consumption_kml,
      updated_at: (vehicle as any).updated_at,
    }));

    try {
      await deleteRowsByPeriod("trip_reports", vehicleIds, tripPeriodColumn);
      await deleteRowsByPeriod("daily_metrics", vehicleIds, dailyMetricPeriodColumn);
      await deleteRowsByPeriod("fuel_events", vehicleIds, fuelEventPeriodColumn);

      await insertRowsInBatches("trip_reports", tripReportRows);
      await insertRowsInBatches("fuel_events", fuelEventRows);
      await insertRowsInBatches("daily_metrics", dailyMetricRows);

      for (const [vehicleId, summary] of vehicleSummary.entries()) {
        const patch: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (summary.distance !== null) patch.total_distance = summary.distance;
        if (summary.fuelUsed !== null) patch.total_fuel_used = summary.fuelUsed;
        if (summary.consumption !== null) patch.consumption_kml = summary.consumption;
        if (Object.keys(patch).length <= 1) continue;

        const { error: updateVehicleError } = await supabaseAdmin
          .from("vehicles")
          .update(patch)
          .eq("id", vehicleId);
        if (updateVehicleError) {
          throw new Error(`Vehicle ${vehicleId} totals update failed: ${updateVehicleError.message}`);
        }
      }
    } catch (applyError: any) {
      try {
        await deleteRowsByPeriod("trip_reports", vehicleIds, tripPeriodColumn);
        await deleteRowsByPeriod("daily_metrics", vehicleIds, dailyMetricPeriodColumn);
        await deleteRowsByPeriod("fuel_events", vehicleIds, fuelEventPeriodColumn);

        await insertRowsInBatches("trip_reports", tripBackupRows);
        await insertRowsInBatches("daily_metrics", dailyBackupRows);
        await insertRowsInBatches("fuel_events", fuelBackupRows);

        for (const backup of vehicleBackups) {
          const { error: restoreVehicleError } = await supabaseAdmin
            .from("vehicles")
            .update({
              total_distance: backup.total_distance,
              total_fuel_used: backup.total_fuel_used,
              consumption_kml: backup.consumption_kml,
              updated_at: backup.updated_at,
            })
            .eq("id", backup.id);
          if (restoreVehicleError) throw restoreVehicleError;
        }
      } catch (rollbackError: any) {
        throw new Error(
          `Apply failed and rollback failed. apply_error="${String(applyError?.message || applyError)}" rollback_error="${String(rollbackError?.message || rollbackError)}"`
        );
      }

      throw new Error(`Apply failed. Previous data restored. ${String(applyError?.message || applyError)}`);
    }
  } else {
    notes.push("Dry run only: no rows were deleted, inserted, or updated.");
  }

  return {
    mode: dryRun ? "preview" : "apply",
    fingerprint,
    detectedReportType,
    fileName,
    period: {
      startDate: range.startDate,
      endDate: range.endDate,
    },
    assets: {
      inFile: uniqueAssetsInFile.size,
      matched: uniqueAssetsInFile.size - unmatchedAssets.size,
      unmatched: Array.from(unmatchedAssets).sort(),
    },
    rows: {
      inFile: inFileRows,
      matched: inferredRows.length,
    },
    tables: {
      tripReports: {
        deleted: tripReportsToDelete,
        inserted: tripReportRows.length,
      },
      dailyMetrics: {
        deleted: dailyMetricsToDelete,
        inserted: dailyMetricRows.length,
      },
      fuelEvents: {
        deleted: fuelEventsToDelete,
        inserted: fuelEventRows.length,
      },
    },
    preview,
    notes,
  };
}
