import { DB_TIMEZONE_LABELS } from "@/lib/dateTime";
import { saveBlobToFile } from "@/lib/fileSave";

const MAX_CAPTURE_PIXELS = 24_000_000;
const MAX_CAPTURE_RATIO = 2;
const MIN_CAPTURE_RATIO = 0.9;
const EXCEL_COLUMN_WIDTH = 8.43;
const EXCEL_COLUMN_PIXELS = 64;
const EXCEL_ROW_HEIGHT = 15;
const EXCEL_ROW_PIXELS = 20;
const PDF_MAX_PAGE_HEIGHT = 1600;

type SnapshotFormat = "pdf" | "excel";

type ExportPreviewOptions = {
  element: HTMLElement;
  filename: string;
  format: SnapshotFormat;
  worksheetName?: string;
  fileHandle?: any;
  excelData?: ExcelWorkbookData;
};

type DailyMovementExcelGroup = {
  asset: {
    asset_description: string;
    registration_number: string;
    asset_id: number;
    site_name: string;
  };
  trips: Array<{
    departure_date?: string;
    departure_date_time?: string;
    driver?: string;
    departure_time?: string;
    departed_from?: string;
    driving_time?: string;
    standing_time?: string;
    distance_km?: number;
    max_speed_kmh?: number;
    arrival_date_time?: string;
    arrival_time?: string;
    arrived_at?: string;
    next_departure?: string;
    standing_time_at_location?: string;
    fuel_used_litres?: number | null;
  }>;
  totals: {
    drivingTime?: string;
    distance?: number;
    standingTime?: string;
    standingTimeAtLocation?: string;
  };
  averages: {
    drivingTime?: string;
    distance?: number;
    standingTime?: string;
    standingTimeAtLocation?: string;
  };
};

type DailyMovementExcelReport = {
  dateLabel: string;
  companyName?: string;
  groups: DailyMovementExcelGroup[];
};

type FuelTemperatureExcelReport = {
  reportTitle?: string;
  assetName?: string;
  reportDate?: string;
  fromDatetime?: string | null;
  toDatetime?: string | null;
  generatedOn?: string | null;
  totalDistance?: number;
  totalRefills?: number;
  totalDrains?: number;
  fuelUsed?: number;
  fuelConsumption?: number;
  refuelEvents?: Array<{
    time?: string;
    initial_fuel?: number | string | null;
    final_fuel?: number | string | null;
    refilled?: number | string | null;
    location?: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
  }>;
  rawSensorData?: Array<{
    timestamp?: string;
    fuel?: number | string | null;
    altitude?: number | string | null;
    odometer?: number | string | null;
    speed?: number | string | null;
    temperature?: number | string | null;
  }>;
};

type ExcelWorkbookData =
  | {
      type: "daily-movement";
      report: DailyMovementExcelReport;
    }
  | {
      type: "fuel-temperature";
      report: FuelTemperatureExcelReport;
    };

function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForExportLayout() {
  if ("fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font readiness failures and still attempt export.
    }
  }

  await nextFrame();
  await nextFrame();
}

function resolveElementSize(element: HTMLElement) {
  return {
    width: Math.max(1, Math.ceil(element.scrollWidth)),
    height: Math.max(1, Math.ceil(element.scrollHeight)),
  };
}

function resolveCaptureRatio(width: number, height: number) {
  const totalPixels = width * height;
  if (!Number.isFinite(totalPixels) || totalPixels <= 0) {
    return 1;
  }

  const ratio = Math.sqrt(MAX_CAPTURE_PIXELS / totalPixels);
  return Math.min(MAX_CAPTURE_RATIO, Math.max(MIN_CAPTURE_RATIO, ratio));
}

async function capturePreviewCanvas(element: HTMLElement) {
  await waitForExportLayout();

  const { toCanvas } = await import("html-to-image");
  const { width, height } = resolveElementSize(element);
  const pixelRatio = resolveCaptureRatio(width, height);

  return toCanvas(element, {
    cacheBust: true,
    backgroundColor: "#ffffff",
    pixelRatio,
    width,
    height,
    canvasWidth: Math.max(1, Math.round(width * pixelRatio)),
    canvasHeight: Math.max(1, Math.round(height * pixelRatio)),
  });
}

function canvasSlice(source: HTMLCanvasElement, offsetY: number, sliceHeight: number) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = sliceHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to prepare PDF page slice.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    source,
    0,
    offsetY,
    source.width,
    sliceHeight,
    0,
    0,
    source.width,
    sliceHeight,
  );

  return canvas;
}

async function exportCanvasToPdf(canvas: HTMLCanvasElement, filename: string, fileHandle?: any) {
  const { jsPDF } = await import("jspdf");

  const pageWidth = canvas.width;
  const defaultPageHeight = Math.round(pageWidth * Math.SQRT2);
  const firstPageHeight = Math.min(
    canvas.height,
    Math.max(900, Math.min(PDF_MAX_PAGE_HEIGHT, defaultPageHeight)),
  );
  const firstOrientation = pageWidth >= firstPageHeight ? "landscape" : "portrait";

  const pdf = new jsPDF({
    orientation: firstOrientation,
    unit: "px",
    format: [pageWidth, firstPageHeight],
    compress: true,
  });

  let offsetY = 0;
  let isFirstPage = true;

  while (offsetY < canvas.height) {
    const sliceHeight = Math.min(firstPageHeight, canvas.height - offsetY);
    const slice = canvasSlice(canvas, offsetY, sliceHeight);

    if (!isFirstPage) {
      const orientation = pageWidth >= sliceHeight ? "landscape" : "portrait";
      pdf.addPage([pageWidth, sliceHeight], orientation);
    }

    pdf.addImage(slice, "PNG", 0, 0, pageWidth, sliceHeight, undefined, "FAST");
    offsetY += sliceHeight;
    isFirstPage = false;
  }

  const blob = pdf.output("blob");
  await saveBlobToFile(blob, filename, fileHandle);
}

function seedExcelViewport(worksheet: any, width: number, height: number) {
  const columnCount = Math.max(1, Math.ceil(width / EXCEL_COLUMN_PIXELS));
  const rowCount = Math.max(1, Math.ceil(height / EXCEL_ROW_PIXELS));

  for (let index = 1; index <= columnCount; index += 1) {
    worksheet.getColumn(index).width = EXCEL_COLUMN_WIDTH;
  }

  for (let index = 1; index <= rowCount; index += 1) {
    worksheet.getRow(index).height = EXCEL_ROW_HEIGHT;
  }
}

function sanitizeWorksheetName(value: string) {
  const cleaned = value.replace(/[\\/*?:[\]]/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

function styleWorksheetHeader(worksheet: any) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 24;

  headerRow.eachCell((cell: any) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
  });

  worksheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  if (worksheet.columnCount > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount },
    };
  }
}

function applyNumberFormat(worksheet: any, columnKey: string, format = "0.00") {
  const column = worksheet.getColumn(columnKey);
  column.numFmt = format;
}

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeConsumption(distanceKm: unknown, fuelUsedLitres: unknown) {
  const distance = safeNumber(distanceKm);
  const fuel = safeNumber(fuelUsedLitres);
  if (distance <= 0 || fuel <= 0) return null;
  return Number((distance / fuel).toFixed(2));
}

function formatReportRangeLabel(value: string) {
  if (!value) return "";
  const [startRaw, endRaw] = value.split(" to ").map((part) => part.trim());
  const formatDate = (dateText: string) => {
    const match = dateText.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return dateText;
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  };

  const start = formatDate(startRaw);
  const end = formatDate(endRaw || startRaw);
  return `From ${start} 00:00 To ${end} 23:59`;
}

function normalizeDurationText(value?: string) {
  if (!value) return "00:00:00";
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value;

  const dashMatch = value.match(/^(\d{3})(\d{2})-(\d{2})/);
  if (dashMatch) {
    const minutes = parseInt(dashMatch[1], 10);
    const seconds = parseInt(dashMatch[2], 10);
    const additionalSeconds = parseInt(dashMatch[3], 10);
    return formatSecondsAsClock(minutes * 60 + seconds + additionalSeconds);
  }

  const compactMatch = value.match(/^(\d{3})(\d{2})/);
  if (compactMatch) {
    const baseSeconds = parseInt(compactMatch[1], 10);
    const additionalSeconds = parseInt(compactMatch[2], 10);
    return formatSecondsAsClock(baseSeconds + additionalSeconds);
  }

  return value;
}

function parseDurationToSeconds(value?: string) {
  const normalized = normalizeDurationText(value);
  const [hours, minutes, seconds] = normalized.split(":").map(Number);
  if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) {
    return 0;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function formatSecondsAsClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDurationCompact(value?: string) {
  const totalSeconds = parseDurationToSeconds(value);
  if (totalSeconds <= 0) return "--";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatDistance(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(1)} km` : "--";
}

function formatSpeed(value: number) {
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(0)} km/h` : "--";
}

function formatLitres(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(Number(value))
    ? "--"
    : `${Number(value).toFixed(1)} L`;
}

function formatKmPerL(distance: number, fuel: number | null | undefined) {
  if (fuel === null || fuel === undefined || fuel <= 0 || distance <= 0) return "--";
  return `${(distance / fuel).toFixed(2)} km/L`;
}

function uniqueDrivers(trips: DailyMovementExcelGroup["trips"]) {
  return Array.from(new Set(trips.map((trip) => String(trip.driver || "").trim()).filter(Boolean)));
}

function sumFuel(trips: DailyMovementExcelGroup["trips"]) {
  return trips.reduce((sum, trip) => sum + (trip.fuel_used_litres ?? 0), 0);
}

function countFuelTrips(trips: DailyMovementExcelGroup["trips"]) {
  return trips.filter((trip) => trip.fuel_used_litres !== null && trip.fuel_used_litres !== undefined).length;
}

function standingTone(value?: string) {
  const totalSeconds = parseDurationToSeconds(value);
  if (totalSeconds > 600) {
    return { background: "FFFEE2E2", foreground: "FF991B1B", border: "FFFECACA" };
  }
  if (totalSeconds >= 300) {
    return { background: "FFFEF3C7", foreground: "FF92400E", border: "FFFDE68A" };
  }
  return { background: "FFDCFCE7", foreground: "FF166534", border: "FFBBF7D0" };
}

function applyRangeStyle(
  worksheet: any,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  style: {
    fill?: string;
    font?: Record<string, unknown>;
    alignment?: Record<string, unknown>;
    borderColor?: string;
  } = {},
) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      if (style.fill) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: style.fill },
        };
      }
      if (style.font) cell.font = style.font;
      if (style.alignment) cell.alignment = style.alignment;
      cell.border = {
        top: { style: "thin", color: { argb: style.borderColor || "FFE2E8F0" } },
        left: { style: "thin", color: { argb: style.borderColor || "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: style.borderColor || "FFE2E8F0" } },
        right: { style: "thin", color: { argb: style.borderColor || "FFE2E8F0" } },
      };
    }
  }
}

function mergeLabelValueRow(
  worksheet: any,
  row: number,
  startCol: number,
  endCol: number,
  value: string,
  font: Record<string, unknown>,
) {
  worksheet.mergeCells(row, startCol, row, endCol);
  const cell = worksheet.getCell(row, startCol);
  cell.value = value;
  cell.font = font;
  cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
}

function renderInfoCard(
  worksheet: any,
  startRow: number,
  startCol: number,
  endCol: number,
  label: string,
  value: string,
  detail: string,
  fill: string,
  accent = "FF0F766E",
) {
  applyRangeStyle(worksheet, startRow, startCol, startRow + 2, endCol, {
    fill,
    borderColor: "FFDDE7ED",
  });

  for (let row = startRow; row <= startRow + 2; row += 1) {
    const cell = worksheet.getCell(row, startCol);
    cell.border = {
      ...cell.border,
      left: { style: "medium", color: { argb: accent } },
    };
  }

  mergeLabelValueRow(worksheet, startRow, startCol, endCol, label.toUpperCase(), {
    size: 10,
    bold: true,
    color: { argb: accent },
  });
  mergeLabelValueRow(worksheet, startRow + 1, startCol, endCol, value, {
    size: 16,
    bold: true,
    color: { argb: "FF0F172A" },
  });
  mergeLabelValueRow(worksheet, startRow + 2, startCol, endCol, detail, {
    size: 10,
    color: { argb: "FF64748B" },
  });
}

function configureDailyMovementWorksheet(worksheet: any) {
  worksheet.columns = [
    { width: 12 }, { width: 12 }, { width: 12 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
    { width: 11 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 },
  ];
  worksheet.views = [{ showGridLines: false }];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0,
      footer: 0,
    },
  };
}

function buildDailyMovementReportWorksheet(
  worksheet: any,
  report: DailyMovementExcelReport,
) {
  configureDailyMovementWorksheet(worksheet);

  const groups = report.groups;
  const allTrips = groups.flatMap((group) => group.trips);
  const totalDistance = groups.reduce((sum, group) => sum + safeNumber(group.totals.distance), 0);
  const totalDriveSeconds = groups.reduce(
    (sum, group) => sum + parseDurationToSeconds(group.totals.drivingTime),
    0,
  );
  const totalStandingSeconds = groups.reduce(
    (sum, group) => sum + parseDurationToSeconds(group.totals.standingTimeAtLocation),
    0,
  );
  const totalFuelUsed = sumFuel(allTrips);
  const fuelCoverageTrips = countFuelTrips(allTrips);
  const peakSpeed = allTrips.reduce(
    (max, trip) => Math.max(max, safeNumber(trip.max_speed_kmh)),
    0,
  );
  const mostMobileAsset = [...groups].sort((a, b) => safeNumber(b.totals.distance) - safeNumber(a.totals.distance))[0];
  const longestStandTrip = [...allTrips].sort(
    (a, b) => parseDurationToSeconds(b.standing_time_at_location) - parseDurationToSeconds(a.standing_time_at_location),
  )[0];

  applyRangeStyle(worksheet, 1, 1, 5, 19, { fill: "FFF8FAFC", borderColor: "FFE2E8F0" });
  worksheet.mergeCells(1, 1, 1, 19);
  worksheet.getCell(1, 1).value = "Operational Report";
  worksheet.getCell(1, 1).font = { size: 10, bold: true, color: { argb: "FF0F766E" } };

  worksheet.mergeCells(2, 1, 3, 19);
  worksheet.getCell(2, 1).value = "Daily Movement Report";
  worksheet.getCell(2, 1).font = { size: 22, bold: true, color: { argb: "FF0F172A" } };
  worksheet.getCell(2, 1).alignment = { vertical: "middle", horizontal: "left" };

  worksheet.mergeCells(4, 1, 4, 19);
  worksheet.getCell(4, 1).value = report.companyName || "Teletrac Fuel";
  worksheet.getCell(4, 1).font = { size: 11, color: { argb: "FF475569" } };

  worksheet.mergeCells(5, 1, 5, 9);
  worksheet.getCell(5, 1).value = formatReportRangeLabel(report.dateLabel);
  worksheet.getCell(5, 1).font = { size: 10, color: { argb: "FF475569" } };
  worksheet.mergeCells(5, 10, 5, 13);
  worksheet.getCell(5, 10).value = `DB ${DB_TIMEZONE_LABELS.webhookLocal}`;
  worksheet.getCell(5, 10).font = { size: 10, color: { argb: "FF475569" } };
  worksheet.mergeCells(5, 14, 5, 19);
  worksheet.getCell(5, 14).value = "Only live columns with populated data are shown";
  worksheet.getCell(5, 14).font = { size: 10, color: { argb: "FF475569" } };

  renderInfoCard(worksheet, 7, 1, 6, "Active Assets", String(groups.length), `${allTrips.length} movement legs tracked in scope`, "FFFFFFFF");
  renderInfoCard(worksheet, 7, 7, 12, "Fuel Coverage", `${fuelCoverageTrips}/${allTrips.length}`, "Trips with captured fuel usage values", "FFFFFFFF");
  renderInfoCard(worksheet, 7, 13, 19, "Distance", formatDistance(totalDistance), `Most distance: ${mostMobileAsset?.asset.registration_number || "--"}`, "FFF0FDFA", "FF0F766E");
  renderInfoCard(worksheet, 11, 1, 6, "Drive Time", formatDurationCompact(formatSecondsAsClock(totalDriveSeconds)), "Total time in motion across the report", "FFFFFFFF", "FF64748B");
  renderInfoCard(worksheet, 11, 7, 12, "Stand to Next Departure", formatDurationCompact(formatSecondsAsClock(totalStandingSeconds)), "Time between arrival and the next departure", "FFFFFFFF", "FF64748B");
  renderInfoCard(worksheet, 11, 13, 19, "Efficiency", formatKmPerL(totalDistance, totalFuelUsed), `Fuel ${formatLitres(totalFuelUsed)} • Peak ${formatSpeed(peakSpeed)} • Longest stand ${longestStandTrip ? formatDurationCompact(longestStandTrip.standing_time_at_location) : "--"}`, "FFFFFFFF", "FF64748B");

  let currentRow = 16;

  groups.forEach((group) => {
    const drivers = uniqueDrivers(group.trips);
    const groupFuelTrips = countFuelTrips(group.trips);
    const groupFuelUsed = sumFuel(group.trips);
    const groupPeakSpeed = group.trips.reduce((max, trip) => Math.max(max, safeNumber(trip.max_speed_kmh)), 0);
    const showFuelColumn = groupFuelTrips > 0;
    const assetLabel =
      group.asset.asset_description && group.asset.asset_description !== group.asset.registration_number
        ? group.asset.asset_description
        : group.asset.registration_number;

    renderInfoCard(
      worksheet,
      currentRow,
      1,
      7,
      "Asset Story",
      group.asset.registration_number,
      `${assetLabel} • ${group.asset.site_name || "No site captured"} • ${drivers.length > 0 ? (drivers.length === 1 ? drivers[0] : `${drivers.length} drivers`) : "No driver"} • Fuel on ${groupFuelTrips}/${group.trips.length} trips`,
      "FFFFFFFF",
    );
    renderInfoCard(
      worksheet,
      currentRow,
      8,
      10,
      "Distance",
      formatDistance(safeNumber(group.totals.distance)),
      `Avg leg ${formatDistance(safeNumber(group.averages.distance))}`,
      "FFFFFFFF",
      "FF64748B",
    );
    renderInfoCard(
      worksheet,
      currentRow,
      11,
      13,
      "Drive Time",
      formatDurationCompact(group.totals.drivingTime),
      `Avg ${formatDurationCompact(group.averages.drivingTime)}`,
      "FFFFFFFF",
      "FF64748B",
    );
    renderInfoCard(
      worksheet,
      currentRow,
      14,
      16,
      "Stand to Next Departure",
      formatDurationCompact(group.totals.standingTimeAtLocation),
      `Avg ${formatDurationCompact(group.averages.standingTimeAtLocation)}`,
      "FFFFFFFF",
      "FF64748B",
    );
    renderInfoCard(
      worksheet,
      currentRow,
      17,
      19,
      showFuelColumn ? "Fuel & Speed" : "Speed",
      showFuelColumn ? formatLitres(groupFuelUsed) : formatSpeed(groupPeakSpeed),
      showFuelColumn
        ? `${formatKmPerL(safeNumber(group.totals.distance), groupFuelUsed)} overall • peak ${formatSpeed(groupPeakSpeed)}`
        : `Peak ${formatSpeed(groupPeakSpeed)}`,
      "FFFFFFFF",
      "FF64748B",
    );

    currentRow += 4;

    const lastTableCol = showFuelColumn ? 19 : 17;
    applyRangeStyle(worksheet, currentRow, 1, currentRow, lastTableCol, {
      fill: "FFF1F5F9",
      font: { size: 10, bold: true, color: { argb: "FF64748B" } },
      alignment: { vertical: "middle", horizontal: "center", wrapText: true },
    });

    mergeLabelValueRow(worksheet, currentRow, 1, 3, "Journey Window", { size: 10, bold: true, color: { argb: "FF64748B" } });
    mergeLabelValueRow(worksheet, currentRow, 4, 8, "From", { size: 10, bold: true, color: { argb: "FF64748B" } });
    mergeLabelValueRow(worksheet, currentRow, 9, 13, "To", { size: 10, bold: true, color: { argb: "FF64748B" } });
    worksheet.getCell(currentRow, 14).value = "Drive";
    worksheet.getCell(currentRow, 15).value = "Stand";
    worksheet.getCell(currentRow, 16).value = "Dist";
    worksheet.getCell(currentRow, 17).value = "Max";
    if (showFuelColumn) {
      worksheet.getCell(currentRow, 18).value = "Fuel";
      worksheet.getCell(currentRow, 19).value = "Cons.";
    }

    currentRow += 1;

    group.trips.forEach((trip) => {
      const departureStamp =
        trip.departure_date_time || [trip.departure_date, trip.departure_time].filter(Boolean).join(" ");
      const arrivalStamp = trip.arrival_date_time || trip.arrival_time || "--";
      const journeyParts = [departureStamp, `to ${arrivalStamp}`];
      if (trip.driver) journeyParts.push(String(trip.driver));

      applyRangeStyle(worksheet, currentRow, 1, currentRow, lastTableCol, {
        fill: "FFFFFFFF",
        borderColor: "FFE2E8F0",
      });

      worksheet.mergeCells(currentRow, 1, currentRow, 3);
      worksheet.getCell(currentRow, 1).value = journeyParts.join("\n");
      worksheet.getCell(currentRow, 1).font = { size: 10, color: { argb: "FF0F172A" } };
      worksheet.getCell(currentRow, 1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };

      worksheet.mergeCells(currentRow, 4, currentRow, 8);
      worksheet.getCell(currentRow, 4).value = trip.departed_from || "--";
      worksheet.getCell(currentRow, 4).font = { size: 10, color: { argb: "FF334155" } };
      worksheet.getCell(currentRow, 4).alignment = { vertical: "middle", horizontal: "left", wrapText: true };

      worksheet.mergeCells(currentRow, 9, currentRow, 13);
      worksheet.getCell(currentRow, 9).value = trip.arrived_at || "--";
      worksheet.getCell(currentRow, 9).font = { size: 10, color: { argb: "FF334155" } };
      worksheet.getCell(currentRow, 9).alignment = { vertical: "middle", horizontal: "left", wrapText: true };

      worksheet.getCell(currentRow, 14).value = normalizeDurationText(trip.driving_time);
      worksheet.getCell(currentRow, 15).value = normalizeDurationText(trip.standing_time_at_location);
      worksheet.getCell(currentRow, 16).value = safeNumber(trip.distance_km);
      worksheet.getCell(currentRow, 17).value = safeNumber(trip.max_speed_kmh);

      [14, 15, 16, 17].forEach((col) => {
        worksheet.getCell(currentRow, col).alignment = { vertical: "middle", horizontal: "right" };
        worksheet.getCell(currentRow, col).font = { size: 10, color: { argb: "FF0F172A" } };
      });

      worksheet.getCell(currentRow, 16).numFmt = "0.0";
      worksheet.getCell(currentRow, 17).numFmt = "0";

      const tone = standingTone(trip.standing_time_at_location);
      worksheet.getCell(currentRow, 15).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: tone.background },
      };
      worksheet.getCell(currentRow, 15).font = {
        size: 10,
        bold: true,
        color: { argb: tone.foreground },
      };
      worksheet.getCell(currentRow, 15).border = {
        top: { style: "thin", color: { argb: tone.border } },
        left: { style: "thin", color: { argb: tone.border } },
        bottom: { style: "thin", color: { argb: tone.border } },
        right: { style: "thin", color: { argb: tone.border } },
      };

      if (showFuelColumn) {
        worksheet.getCell(currentRow, 18).value =
          trip.fuel_used_litres === null || trip.fuel_used_litres === undefined
            ? "--"
            : safeNumber(trip.fuel_used_litres);
        worksheet.getCell(currentRow, 19).value =
          trip.fuel_used_litres === null || trip.fuel_used_litres === undefined
            ? "--"
            : formatKmPerL(safeNumber(trip.distance_km), trip.fuel_used_litres);
        worksheet.getCell(currentRow, 18).alignment = { vertical: "middle", horizontal: "right" };
        worksheet.getCell(currentRow, 18).font = { size: 10, color: { argb: "FF0F172A" } };
        if (typeof worksheet.getCell(currentRow, 18).value === "number") {
          worksheet.getCell(currentRow, 18).numFmt = "0.0";
        }
        worksheet.getCell(currentRow, 19).alignment = { vertical: "middle", horizontal: "right" };
        worksheet.getCell(currentRow, 19).font = { size: 10, color: { argb: "FF0F172A" } };
      }

      worksheet.getRow(currentRow).height = 40;
      currentRow += 1;
    });

    currentRow += 1;
    renderInfoCard(
      worksheet,
      currentRow,
      1,
      7,
      "Movement Summary",
      `${group.trips.length} trips`,
      formatDistance(safeNumber(group.totals.distance)),
      "FFF8FAFC",
      "FF64748B",
    );
    renderInfoCard(
      worksheet,
      currentRow,
      8,
      13,
      "Average Leg",
      formatDistance(safeNumber(group.averages.distance)),
      formatDurationCompact(group.averages.drivingTime),
      "FFF8FAFC",
      "FF64748B",
    );
    renderInfoCard(
      worksheet,
      currentRow,
      14,
      19,
      "Operational Read",
      showFuelColumn
        ? formatKmPerL(safeNumber(group.totals.distance), groupFuelUsed)
        : `${drivers.length || 0} driver${drivers.length === 1 ? "" : "s"} on record`,
      showFuelColumn ? "Overall efficiency from this asset section" : "Driver coverage in this asset section",
      "FFF8FAFC",
      "FF64748B",
    );

    currentRow += 5;
  });
}

function appendFuelTemperatureSheets(workbook: any, report: FuelTemperatureExcelReport) {
  const summarySheet = workbook.addWorksheet(sanitizeWorksheetName("Summary Data"));
  summarySheet.columns = [
    { header: "Field", key: "field", width: 26 },
    { header: "Value", key: "value", width: 42 },
  ];

  [
    ["Report Title", report.reportTitle || ""],
    ["Asset Name", report.assetName || ""],
    ["Report Date", report.reportDate || ""],
    ["From", report.fromDatetime || ""],
    ["To", report.toDatetime || ""],
    ["Generated On", report.generatedOn || ""],
    ["Total Distance (km)", safeNumber(report.totalDistance)],
    ["Total Refills (L)", safeNumber(report.totalRefills)],
    ["Total Drains (L)", safeNumber(report.totalDrains)],
    ["Fuel Used (L)", safeNumber(report.fuelUsed)],
    ["Fuel Consumption (km/L)", safeNumber(report.fuelConsumption)],
  ].forEach(([field, value]) => {
    summarySheet.addRow({ field, value });
  });

  styleWorksheetHeader(summarySheet);
  applyNumberFormat(summarySheet, "value");

  const refuelSheet = workbook.addWorksheet(sanitizeWorksheetName("Refuel Events"));
  refuelSheet.columns = [
    { header: "Time", key: "time", width: 24 },
    { header: "Initial Fuel", key: "initialFuel", width: 14 },
    { header: "Final Fuel", key: "finalFuel", width: 14 },
    { header: "Refilled", key: "refilled", width: 14 },
    { header: "Location", key: "location", width: 36 },
    { header: "Latitude", key: "latitude", width: 14 },
    { header: "Longitude", key: "longitude", width: 14 },
  ];

  (report.refuelEvents || []).forEach((event) => {
    refuelSheet.addRow({
      time: event.time || "",
      initialFuel: event.initial_fuel === null || event.initial_fuel === undefined ? "" : safeNumber(event.initial_fuel),
      finalFuel: event.final_fuel === null || event.final_fuel === undefined ? "" : safeNumber(event.final_fuel),
      refilled: event.refilled === null || event.refilled === undefined ? "" : safeNumber(event.refilled),
      location: event.location || "",
      latitude: event.latitude === null || event.latitude === undefined ? "" : safeNumber(event.latitude),
      longitude: event.longitude === null || event.longitude === undefined ? "" : safeNumber(event.longitude),
    });
  });

  styleWorksheetHeader(refuelSheet);
  applyNumberFormat(refuelSheet, "initialFuel");
  applyNumberFormat(refuelSheet, "finalFuel");
  applyNumberFormat(refuelSheet, "refilled");
  applyNumberFormat(refuelSheet, "latitude", "0.000000");
  applyNumberFormat(refuelSheet, "longitude", "0.000000");

  if ((report.rawSensorData || []).length > 0) {
    const rawSheet = workbook.addWorksheet(sanitizeWorksheetName("Raw Sensor Data"));
    rawSheet.columns = [
      { header: "Timestamp", key: "timestamp", width: 24 },
      { header: "Fuel", key: "fuel", width: 12 },
      { header: "Altitude", key: "altitude", width: 12 },
      { header: "Odometer", key: "odometer", width: 14 },
      { header: "Speed", key: "speed", width: 12 },
      { header: "Temperature", key: "temperature", width: 14 },
    ];

    report.rawSensorData?.forEach((row) => {
      rawSheet.addRow({
        timestamp: row.timestamp || "",
        fuel: row.fuel === null || row.fuel === undefined ? "" : safeNumber(row.fuel),
        altitude: row.altitude === null || row.altitude === undefined ? "" : safeNumber(row.altitude),
        odometer: row.odometer === null || row.odometer === undefined ? "" : safeNumber(row.odometer),
        speed: row.speed === null || row.speed === undefined ? "" : safeNumber(row.speed),
        temperature:
          row.temperature === null || row.temperature === undefined ? "" : safeNumber(row.temperature),
      });
    });

    styleWorksheetHeader(rawSheet);
    applyNumberFormat(rawSheet, "fuel");
    applyNumberFormat(rawSheet, "altitude");
    applyNumberFormat(rawSheet, "odometer");
    applyNumberFormat(rawSheet, "speed");
    applyNumberFormat(rawSheet, "temperature");
  }
}

function appendStructuredExcelSheets(workbook: any, excelData?: ExcelWorkbookData) {
  if (!excelData || excelData.type !== "fuel-temperature") return;
  appendFuelTemperatureSheets(workbook, excelData.report);
}

async function exportDailyMovementExcel(
  filename: string,
  worksheetName: string,
  fileHandle: any,
  report: DailyMovementExcelReport,
) {
  const { default: ExcelJS } = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Fuel Platform";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(sanitizeWorksheetName(worksheetName));
  buildDailyMovementReportWorksheet(worksheet, report);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  await saveBlobToFile(blob, filename, fileHandle);
}

async function exportCanvasToExcel(
  canvas: HTMLCanvasElement,
  filename: string,
  worksheetName = "Report Preview",
  fileHandle?: any,
  excelData?: ExcelWorkbookData,
) {
  const { default: ExcelJS } = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Fuel Platform";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(sanitizeWorksheetName(worksheetName));
  worksheet.views = [{ showGridLines: false }];
  worksheet.pageSetup = {
    orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.25,
      bottom: 0.25,
      header: 0,
      footer: 0,
    },
  };

  seedExcelViewport(worksheet, canvas.width, canvas.height);

  const imageId = workbook.addImage({
    base64: canvas.toDataURL("image/png"),
    extension: "png",
  });

  worksheet.addImage(imageId, {
    tl: { col: 0, row: 0 },
    ext: { width: canvas.width, height: canvas.height },
    editAs: "absolute",
  });

  appendStructuredExcelSheets(workbook, excelData);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  await saveBlobToFile(blob, filename, fileHandle);
}

export async function exportPreviewSnapshot({
  element,
  filename,
  format,
  worksheetName,
  fileHandle,
  excelData,
}: ExportPreviewOptions) {
  if (format === "excel" && excelData?.type === "daily-movement") {
    await exportDailyMovementExcel(
      filename,
      worksheetName || "Daily Movement Report",
      fileHandle,
      excelData.report,
    );
    return;
  }

  const canvas = await capturePreviewCanvas(element);

  if (format === "pdf") {
    await exportCanvasToPdf(canvas, filename, fileHandle);
    return;
  }

  await exportCanvasToExcel(canvas, filename, worksheetName, fileHandle, excelData);
}
