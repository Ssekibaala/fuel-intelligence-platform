import type { Express, Request, Response } from "express";
import ExcelJS from 'exceljs';
import { supabaseAdmin } from "./supabase";
import { requireAuth } from "./auth";

const isDev = process.env.NODE_ENV !== "production";
const debugLog = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args);
  }
};

function getDateRangeBounds(startDate: string, endDate?: string) {
  const startInput = new Date(startDate);
  if (Number.isNaN(startInput.getTime())) {
    throw new Error("Invalid start_date provided");
  }

  const endInput = new Date(endDate || startDate);
  if (Number.isNaN(endInput.getTime())) {
    throw new Error("Invalid end_date provided");
  }

  const start = new Date(startInput);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endInput);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: startInput,
    endDate: endInput,
  };
}

function parseAssetId(value: any): number | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringParam(value: any): string | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw).trim();
  return text.length > 0 ? text : undefined;
}

function parseStringListParam(value: any): string[] | undefined {
  if (!value) return undefined;
  const rawList = Array.isArray(value) ? value : [value];
  const items = rawList
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (items.length === 0) return undefined;
  return Array.from(new Set(items));
}

type ReportScope = {
  isAdmin: boolean;
  clientIds?: string[];
};

function getReportScope(req: Request, res: Response): ReportScope | null {
  const isAdmin = req.auth?.profile?.role === "admin";
  if (isAdmin) {
    const requestedClientId = parseStringParam(req.query.client_id || req.query.clientId);
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

  return { isAdmin, clientIds };
}

type DailyMovementFilters = {
  vehicleId?: string;
  vehicleIds?: string[];
  assetId?: number;
  registrationNumber?: string;
  clientIds?: string[];
};

const MOVEMENT_REPORT_TABLES = ["trip_reports", "daily_movement_reports"] as const;

function isMissingRelationError(error: any, tableName: string): boolean {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");
  const details = String(error?.details ?? "");
  const hint = String(error?.hint ?? "");
  const combined = `${message} ${details} ${hint}`.toLowerCase();
  return (
    code === "42P01" ||
    (combined.includes("relation") &&
      combined.includes(tableName.toLowerCase()) &&
      combined.includes("does not exist"))
  );
}

// Daily Movement Report Generator
class DailyMovementGenerator {
  async generateExcel(startDate: string, filters: DailyMovementFilters = {}, endDate?: string) {
    debugLog('🔍 DEBUG: Starting Excel workbook creation');
    
    const workbook = new ExcelJS.Workbook();
    debugLog('🔍 DEBUG: Workbook created successfully');
    
    const worksheet = workbook.addWorksheet('Daily Movement Report');
    debugLog('🔍 DEBUG: Worksheet added successfully');
    
    // Disable gridlines for clean, professional appearance matching preview
    worksheet.views = [
      {
        showGridLines: false
      }
    ];

    // Set column widths to match template
    worksheet.columns = [
      { header: 'Driver', key: 'driver', width: 20 },
      { header: 'Departure Date', key: 'departureDate', width: 15 },
      { header: 'Departure Time', key: 'departureTime', width: 15 },
      { header: 'Departed From', key: 'departedFrom', width: 30 },
      { header: 'Driving Time', key: 'drivingTime', width: 20 },
      { header: 'Distance', key: 'distance', width: 15 },
      { header: 'Max Speed', key: 'maxSpeed', width: 15 },
      { header: 'Arrival Time', key: 'arrivalTime', width: 15 },
      { header: 'Arrived At', key: 'arrivedAt', width: 30 },
      { header: 'Next Departure', key: 'nextDeparture', width: 20 },
      { header: 'Standing Time at Location', key: 'standingTimeAtLocation', width: 25 },
      { header: 'Fuel Used', key: 'fuelUsed', width: 15 }
    ];

    // Row 1: Report title
    const titleRow = worksheet.addRow(['Daily Movement Report']);
    titleRow.getCell(1).font = { size: 18, bold: true };
    worksheet.mergeCells('A1:L1');

    // Row 2: Company info - FIXED to match screenshot
    const companyRow = worksheet.addRow(['Airica MbEA - Telerax: Fleet Solutions - AOT Africa Limited']);
    companyRow.getCell(1).font = { size: 10 };
    worksheet.mergeCells('A2:L2');

    // Row 3: Date range - FIXED to match screenshot format
    const rangeEnd = endDate && endDate !== startDate ? endDate : startDate;
    const dateRow = worksheet.addRow([`From ${startDate} 00:00 to ${rangeEnd} 23:59`]);
    dateRow.getCell(1).font = { size: 10, italic: true };
    worksheet.mergeCells('A3:L3');

    // Row 4: Empty spacer
    worksheet.addRow([]);

    // Get data from database
    const data = await this.getMovementData(startDate, filters, endDate);
    if (!data.length) {
      throw new Error("No daily movement data found for the selected date");
    }

    let currentRow = 5;

    // Use the same asset grouping as the preview - group by registration_number
    const assets = this.groupByAssetForPreview(data);

    for (const assetGroup of assets) {
      const { asset, trips } = assetGroup;
      
      // Asset Registration Number header
      const regRow = worksheet.addRow(['Registration Number', '', asset.registration_number]);
      regRow.getCell(1).font = { bold: true };
      regRow.getCell(3).value = asset.registration_number;
      worksheet.mergeCells(`B${currentRow}:L${currentRow}`);
      regRow.eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9F5EF' }
        };
      });
      currentRow++;

      // Asset Site Name header
      const siteRow = worksheet.addRow(['Site Name', '', asset.site_name]);
      siteRow.getCell(1).font = { bold: true };
      siteRow.getCell(3).value = asset.site_name;
      worksheet.mergeCells(`B${currentRow}:L${currentRow}`);
      siteRow.eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9F5EF' }
        };
      });
      currentRow++;

      // Column headers (matching screenshot exactly)
      const headersRow = worksheet.addRow([
        'Driver',
        'Departure Date',
        'Departure Time',
        'Departed From',
        'Driving Time\n(Revenues)', // FIXED: Match screenshot
        'Distance\n(km)',
        'Max Speed\n(km/h)',
        'Arrival Time',
        'Arrived At',
        'Next Departure',
        'Standing Time at Location\n(Revenues)', // FIXED: Match screenshot
        'Fuel Used (Street)' // FIXED: Match screenshot
      ]);

      headersRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F0F0' }
        };
      });

      currentRow++;

      // Data rows (matching template column order)
      for (const trip of trips) {
        // Convert all data to proper string formats for Excel
        const safeData = {
          driver: this.safeString(trip.driver),
          departure_date: this.safeString(trip.departure_date),
          departure_time: this.safeString(trip.departure_time),
          departed_from: this.safeString(trip.departed_from),
          driving_time: this.safeString(trip.driving_time),
          distance_km: this.safeNumber(trip.distance_km),
          max_speed_kmh: this.safeNumber(trip.max_speed_kmh),
          arrival_time: this.safeString(trip.arrival_time),
          arrived_at: this.safeString(trip.arrived_at),
          next_departure: this.safeString(trip.next_departure),
          standing_time_at_location: this.formatStandingTimeForExcel(trip.standing_time_at_location),
          fuel_used_litres: this.safeNumber(trip.fuel_used_litres)
        };
        
        debugLog('🔍 DEBUG: Processing trip data (safe):', safeData);
        
        const dataRow = worksheet.addRow([
          safeData.driver, // Driver
          safeData.departure_date, // Departure Date
          safeData.departure_time, // Departure Time
          safeData.departed_from, // Departed From
          safeData.driving_time, // Driving Time
          safeData.distance_km, // Distance
          safeData.max_speed_kmh, // Max Speed
          safeData.arrival_time, // Arrival Time
          safeData.arrived_at, // Arrived At
          safeData.next_departure, // Next Departure
          safeData.standing_time_at_location, // Standing Time at Location (formatted)
          safeData.fuel_used_litres // Fuel Used
        ]);
        
        debugLog('🔍 DEBUG: Data row added successfully');

        // Apply conditional formatting based on standing time
        const standingTimeCell = dataRow.getCell(11); // Standing Time at Location column
        if (standingTimeCell.value) {
          const timeStr = standingTimeCell.value.toString();
          const [hours, minutes, seconds] = timeStr.split(':').map(Number);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;

          // 5-10 minutes: Amber
          if (totalSeconds >= 300 && totalSeconds <= 600) {
            standingTimeCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFC000' }
            };
            standingTimeCell.font = { bold: true };
          }
          // > 10 minutes: Red
          else if (totalSeconds > 600) {
            standingTimeCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFF0000' }
            };
            standingTimeCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          }
          // < 5 minutes: Green
          else {
            standingTimeCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF00B050' }
            };
            standingTimeCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          }
        }

        // Format numeric cells
        [6, 7, 12].forEach(col => { // Distance, Max Speed, Fuel Used
          const cell = dataRow.getCell(col);
          cell.numFmt = '0.00';
          cell.alignment = { horizontal: 'right' };
        });

        // Format time cells
        [5, 11].forEach(col => { // Driving Time, Standing Time at Location
          const cell = dataRow.getCell(col);
          cell.alignment = { horizontal: 'center' };
        });

        currentRow++;
      }

      // Add totals row (matching template structure)
      const totalsRow = worksheet.addRow([
        '', '', '', '', // Empty cells 1-4
        this.safeString(assetGroup.totals.drivingTime), // Driving Time
        this.safeNumber(assetGroup.totals.distance), // Distance
        '', // Max Speed (empty)
        '', '', '', // Arrival Time, Arrived At, Next Departure (empty)
        this.safeString(assetGroup.totals.standingTime), // Standing Time at Location
        '' // Fuel Used (empty)
      ]);
      
      // Format totals row
      totalsRow.getCell(1).value = 'Totals';
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const totalsMergeCell = worksheet.getCell(`A${currentRow}`);
      totalsMergeCell.value = 'Totals';
      totalsMergeCell.font = { bold: true };
      totalsMergeCell.alignment = { horizontal: 'right' };
      
      // Apply formatting to all cells in totals row
      for (let col = 1; col <= 12; col++) {
        const cell = totalsRow.getCell(col);
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
        
        // Right align numeric cells
        if ([6, 12].includes(col)) { // Distance, Fuel Used
          cell.alignment = { horizontal: 'right' };
          cell.numFmt = '0.00';
        }
        
        // Center align time cells
        if ([5, 11].includes(col)) { // Driving Time, Standing Time at Location
          cell.alignment = { horizontal: 'center' };
        }
      }

      currentRow++;

      // Add averages row (matching template structure)
      const averagesRow = worksheet.addRow([
        '', '', '', '', // Empty cells 1-4
        this.safeString(assetGroup.averages.drivingTime), // Driving Time
        this.safeNumber(assetGroup.averages.distance), // Distance
        '', // Max Speed (empty)
        '', '', '', // Arrival Time, Arrived At, Next Departure (empty)
        this.safeString(assetGroup.averages.standingTime), // Standing Time at Location
        '' // Fuel Used (empty)
      ]);
      
      // Format averages row
      averagesRow.getCell(1).value = 'Averages';
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const averagesMergeCell = worksheet.getCell(`A${currentRow}`);
      averagesMergeCell.value = 'Averages';
      averagesMergeCell.font = { bold: true };
      averagesMergeCell.alignment = { horizontal: 'right' };
      
      // Apply formatting to all cells in averages row
      for (let col = 1; col <= 12; col++) {
        const cell = averagesRow.getCell(col);
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
        
        // Right align numeric cells
        if ([6, 12].includes(col)) { // Distance, Fuel Used
          cell.alignment = { horizontal: 'right' };
          cell.numFmt = '0.00';
        }
        
        // Center align time cells
        if ([5, 11].includes(col)) { // Driving Time, Standing Time at Location
          cell.alignment = { horizontal: 'center' };
        }
      }

      currentRow += 2;
    }

    // Save to buffer
    debugLog('🔍 DEBUG: Attempting to generate Excel buffer...');
    try {
      const buffer = (await workbook.xlsx.writeBuffer()) as any;
      debugLog('🔍 DEBUG: Excel buffer generated successfully, size:', buffer?.length || 0);
      debugLog('🔍 DEBUG: Buffer is valid Buffer:', Buffer.isBuffer(buffer));
      return buffer;
    } catch (writeError: any) {
      console.error('🔍 ERROR: Failed to write Excel buffer:', writeError);
      console.error('🔍 ERROR: Write error stack:', writeError?.stack);
      throw writeError;
    }
  }

  addAssetSection(worksheet: ExcelJS.Worksheet, startRow: number, assetName: string, firstMovement: any) {
    // Asset Description
    const assetRow = worksheet.addRow(['Asset Description', '', assetName]);
    worksheet.mergeCells(`A${startRow}:C${startRow}`);

    // Registration Number
    const regRow = worksheet.addRow(['Registration Number', '', firstMovement.registration_number]);
    worksheet.mergeCells(`A${startRow + 1}:C${startRow + 1}`);

    // Asset ID
    const assetIdRow = worksheet.addRow(['Asset ID', '', firstMovement.asset_id]);
    worksheet.mergeCells(`A${startRow + 2}:C${startRow + 2}`);

    // Site Name
    const siteRow = worksheet.addRow(['Site Name', '', firstMovement.site_name]);
    worksheet.mergeCells(`A${startRow + 3}:C${startRow + 3}`);
  }

  groupByAsset(data: any[]) {
    const groups: Record<string, any[]> = {};
    for (const item of data) {
      if (!item.is_total_row && !item.is_average_row) {
        const key = item.asset_description || item.registration_number;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      }
    }
    return groups;
  }

  // New method to group data exactly like the preview
  groupByAssetForPreview(data: any[]) {
    const groups: any[] = [];
    const assetsMap = new Map<string, any>();

    // First, collect all unique assets
    for (const item of data) {
      if (!item.is_total_row && !item.is_average_row) {
        const key = item.registration_number;
        if (!assetsMap.has(key)) {
          assetsMap.set(key, {
            asset: {
              asset_description: item.asset_description,
              registration_number: item.registration_number,
              asset_id: item.asset_id,
              site_name: item.site_name
            },
            trips: []
          });
        }
        assetsMap.get(key).trips.push(item);
      }
    }

    // Calculate totals and averages for each asset group
    for (const assetGroup of assetsMap.values()) {
      const totals = this.calculateTotalsForPreview(assetGroup.trips);
      const averages = this.calculateAveragesForPreview(assetGroup.trips);
      groups.push({
        ...assetGroup,
        totals,
        averages
      });
    }

    return groups;
  }

  calculateTotalsForPreview(trips: any[]) {
    return {
      drivingTime: this.sumTimes(trips.map(t => t.driving_time)),
      distance: trips.reduce((sum, t) => sum + (t.distance_km || 0), 0),
      standingTime: this.sumTimes(trips.map(t => t.standing_time_at_location))
    };
  }

  calculateAveragesForPreview(trips: any[]) {
    return {
      drivingTime: this.averageTimes(trips.map(t => t.driving_time)),
      distance: trips.reduce((sum, t) => sum + (t.distance_km || 0), 0) / trips.length,
      standingTime: this.averageTimes(trips.map(t => t.standing_time_at_location))
    };
  }

  calculateTotals(movements: any[]) {
    const regularMovements = movements.filter(m => !m.is_total_row && !m.is_average_row);

    return {
      total_driving_time: this.sumTimes(regularMovements.map(m => m.driving_time)),
      total_standing_time: this.sumTimes(regularMovements.map(m => m.standing_time)),
      total_distance: regularMovements.reduce((sum, m) => sum + (m.distance_km || 0), 0),
      total_standing_at_location: this.sumTimes(regularMovements.map(m => m.standing_time_at_location)),
      avg_driving_time: this.averageTimes(regularMovements.map(m => m.driving_time)),
      avg_standing_time: this.averageTimes(regularMovements.map(m => m.standing_time)),
      avg_distance: regularMovements.length > 0 ?
        regularMovements.reduce((sum, m) => sum + (m.distance_km || 0), 0) / regularMovements.length : 0,
      avg_standing_at_location: this.averageTimes(regularMovements.map(m => m.standing_time_at_location))
    };
  }

  sumTimes(timeStrings: string[]) {
    let totalSeconds = 0;
    for (const timeStr of timeStrings) {
      if (timeStr) {
        const [h, m, s] = timeStr.split(':').map(Number);
        totalSeconds += (h * 3600) + (m * 60) + s;
      }
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  averageTimes(timeStrings: string[]) {
    const validTimes = timeStrings.filter(t => t);
    if (validTimes.length === 0) return '00:00:00';

    let totalSeconds = 0;
    for (const timeStr of validTimes) {
      const [h, m, s] = timeStr.split(':').map(Number);
      totalSeconds += (h * 3600) + (m * 60) + s;
    }
    const avgSeconds = Math.round(totalSeconds / validTimes.length);
    const hours = Math.floor(avgSeconds / 3600);
    const minutes = Math.floor((avgSeconds % 3600) / 60);
    const seconds = avgSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Helper method to safely convert values to strings for Excel
  safeString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      return value.toISOString().replace('T', ' ').substring(0, 19);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }
  
  // Helper method to safely convert values to numbers for Excel
  safeNumber(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    return 0;
  }
  
  // Helper method to format standing time for Excel export
  formatStandingTimeForExcel(standingTime: string): string {
    // If already in HH:MM:SS format, return as-is
    if (/^\d{2}:\d{2}:\d{2}$/.test(standingTime)) {
      return standingTime;
    }
     
    // Handle formats like "00027AR" (27 seconds)
    const timeMatch = standingTime.match(/^(\d{3})(\d{2})/);
    if (timeMatch) {
      const totalSeconds = parseInt(timeMatch[1]);
      const additionalSeconds = parseInt(timeMatch[2]);
      const total = totalSeconds + additionalSeconds;
       
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
       
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
     
    // Handle formats like "00637-42" (637 minutes and 42 seconds)
    const dashMatch = standingTime.match(/^(\d{3})(\d{2})-(\d{2})/);
    if (dashMatch) {
      const minutes = parseInt(dashMatch[1]);
      const seconds = parseInt(dashMatch[2]);
      const additionalSeconds = parseInt(dashMatch[3]);
      const totalSeconds = minutes * 60 + seconds + additionalSeconds;
       
      const hours = Math.floor(totalSeconds / 3600);
      const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
      const remainingSeconds = totalSeconds % 60;
       
      return `${hours.toString().padStart(2, '0')}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
     
    // Default fallback - ensure it's a string
    return this.safeString(standingTime);
  }

  // Pull daily movement data for the requested date
  async getMovementData(startDate: string, filters: DailyMovementFilters = {}, endDate?: string) {
    const { start, end } = getDateRangeBounds(startDate, endDate);
    const buildBaseQuery = (tableName: string) => {
      let query = supabaseAdmin
        .from(tableName)
        .select("*")
        .gte("report_date", start)
        .lt("report_date", end)
        .order("report_date", { ascending: true })
        .order("departure_time", { ascending: true });

      if (filters.clientIds && filters.clientIds.length > 0) {
        query = query.in("client_id", filters.clientIds);
      }

      return query;
    };

    let lastMissingTableError: any = null;

    for (const tableName of MOVEMENT_REPORT_TABLES) {
      let query = buildBaseQuery(tableName);

      if (filters.vehicleIds && filters.vehicleIds.length > 0) {
        query = query.in("vehicle_id", filters.vehicleIds);
      } else if (filters.vehicleId) {
        query = query.eq("vehicle_id", filters.vehicleId);
      } else if (filters.assetId !== undefined) {
        query = query.eq("asset_id", filters.assetId);
      } else if (filters.registrationNumber) {
        query = query.eq("registration_number", filters.registrationNumber);
      }

      const { data, error } = await query;
      if (error) {
        if (isMissingRelationError(error, tableName)) {
          lastMissingTableError = error;
          continue;
        }
        throw error;
      }

      let rows = data || [];
      if (filters.vehicleId && rows.length === 0 && (filters.assetId !== undefined || filters.registrationNumber)) {
        let fallbackQuery = buildBaseQuery(tableName);
        if (filters.assetId !== undefined) {
          fallbackQuery = fallbackQuery.eq("asset_id", filters.assetId);
        } else if (filters.registrationNumber) {
          fallbackQuery = fallbackQuery.eq("registration_number", filters.registrationNumber);
        }

        const { data: fallbackData, error: fallbackError } = await fallbackQuery;
        if (fallbackError) throw fallbackError;
        rows = fallbackData || [];
      }

      return rows.map((row: any) => ({
        report_date: row.report_date,
        company_name: row.client_name || row.company_name || "Teletrac Fuel",
        asset_description: row.asset_description,
        registration_number: row.registration_number,
        asset_id: row.asset_id,
        site_name: row.site_name,
        departure_date: row.departure_date || row.report_date,
        driver: row.driver,
        departure_time: row.departure_time,
        departed_from: row.departed_from,
        driving_time: row.driving_time,
        standing_time: row.standing_time,
        distance_km: row.distance_km,
        max_speed_kmh: row.max_speed_kmh,
        arrival_time: row.arrival_time,
        arrived_at: row.arrived_at,
        next_departure: row.next_departure,
        standing_time_at_location: row.standing_time_at_location,
        fuel_used_litres: row.fuel_used_litres,
        is_total_row: Boolean(row.is_total_row),
        is_average_row: Boolean(row.is_average_row),
      }));
    }

    if (lastMissingTableError) throw lastMissingTableError;
    return [];
  }
}

// Fuel/Temperature Report Generator
type FuelTemperatureData = {
  reportDate?: string | null;
  reportTitle: string;
  assetName: string;
  fromDatetime?: string | null;
  toDatetime?: string | null;
  generatedOn?: string | null;
  totalDistanceKm?: number | null;
  totalRefillsL?: number | null;
  totalDrainsL?: number | null;
  fuelUsedL?: number | null;
  fuelConsumptionKmL?: number | null;
  refuelEvents: Array<{
    time?: string | null;
    initial?: string | number | null;
    final?: string | number | null;
    refilled?: string | number | null;
    location?: string | null;
    lat?: string | number | null;
    lng?: string | number | null;
  }>;
  rawSensorData: Array<{
    timestamp?: string | null;
    fuel?: string | number | null;
    altitude?: string | number | null;
    odometer?: string | number | null;
    speed?: string | number | null;
  }>;
};

type FuelTemperatureFilters = {
  vehicleId?: string;
  vehicleIds?: string[];
  assetName?: string;
  clientIds?: string[];
};

class FuelTemperatureGenerator {
  async fetchFuelTemperatureReports(
    startDate: string,
    endDate?: string,
    filters: FuelTemperatureFilters = {}
  ) {
    const { start, end } = getDateRangeBounds(startDate, endDate);
    const buildBaseQuery = () => {
      let query = supabaseAdmin
        .from("fuel_temperature_reports")
        .select("*")
        .gte("report_date", start)
        .lt("report_date", end)
        .order("report_date", { ascending: true });

      if (filters.clientIds && filters.clientIds.length > 0) {
        query = query.in("client_id", filters.clientIds);
      }

      return query;
    };

    let query = buildBaseQuery();

    if (filters.vehicleIds && filters.vehicleIds.length > 0) {
      query = query.in("vehicle_id", filters.vehicleIds);
    } else if (filters.vehicleId) {
      query = query.eq("vehicle_id", filters.vehicleId);
    } else if (filters.assetName) {
      query = query.eq("asset_name", filters.assetName);
    }

    let { data, error } = await query;

    if (!error && (!data || data.length === 0) && filters.vehicleId && filters.assetName) {
      const fallbackQuery = buildBaseQuery().eq("asset_name", filters.assetName);
      const fallbackResult = await fallbackQuery;
      data = fallbackResult.data ?? [];
      error = fallbackResult.error ?? null;
    }

    if (error) throw error;
    return data || [];
  }

  async getFuelTemperatureDataRange(
    startDate: string,
    endDate?: string,
    filters: FuelTemperatureFilters = {}
  ): Promise<FuelTemperatureData[]> {
    const reports = await this.fetchFuelTemperatureReports(startDate, endDate, filters);
    if (!reports.length) return [];

    const reportIds = reports.map((row: any) => row.id).filter(Boolean);
    if (reportIds.length === 0) return [];

    const [
      { data: refuelEvents, error: refuelError },
      { data: rawSensorData, error: rawError },
    ] = await Promise.all([
      supabaseAdmin
        .from("refuel_events")
        .select("*")
        .in("fuel_report_id", reportIds)
        .order("event_time", { ascending: false }),
      supabaseAdmin
        .from("raw_sensor_data")
        .select("*")
        .in("fuel_report_id", reportIds)
        .order("timestamp", { ascending: false }),
    ]);

    if (refuelError) throw refuelError;
    if (rawError) throw rawError;

    const refuelByReport = new Map<string, any[]>();
    (refuelEvents || []).forEach((row: any) => {
      const reportId = row.fuel_report_id;
      if (!refuelByReport.has(reportId)) {
        refuelByReport.set(reportId, []);
      }
      refuelByReport.get(reportId)!.push(row);
    });

    const rawByReport = new Map<string, any[]>();
    (rawSensorData || []).forEach((row: any) => {
      const reportId = row.fuel_report_id;
      if (!rawByReport.has(reportId)) {
        rawByReport.set(reportId, []);
      }
      rawByReport.get(reportId)!.push(row);
    });

    return reports.map((data: any) => ({
      reportDate: data.report_date,
      reportTitle: data.report_title || "Sensor / Fuel / Temperature",
      assetName: data.asset_name || "Asset",
      fromDatetime: data.from_datetime,
      toDatetime: data.to_datetime,
      generatedOn: data.generated_on,
      totalDistanceKm: data.total_distance_km,
      totalRefillsL: data.total_refills_l,
      totalDrainsL: data.total_drains_l,
      fuelUsedL: data.fuel_used_l,
      fuelConsumptionKmL: data.fuel_consumption_km_l,
      refuelEvents: (refuelByReport.get(data.id) || []).map((row: any) => ({
        time: row.event_time,
        initial: row.initial_fuel,
        final: row.final_fuel,
        refilled: row.refilled,
        location: row.location,
        lat: row.latitude,
        lng: row.longitude,
      })),
      rawSensorData: (rawByReport.get(data.id) || []).map((row: any) => ({
        timestamp: row.timestamp,
        fuel: row.fuel,
        altitude: row.altitude,
        odometer: row.odometer,
        speed: row.speed,
      })),
    }));
  }

  async getFuelTemperatureData(
    date: string,
    filters: FuelTemperatureFilters = {}
  ): Promise<FuelTemperatureData | null> {
    const reports = await this.getFuelTemperatureDataRange(date, date, filters);
    if (!reports.length) return null;
    return reports[reports.length - 1] || null;
  }

  async generatePdf(date: string, filters: FuelTemperatureFilters = {}) {
    return this.generatePdfRange(date, date, filters);
  }

  async generatePdfRange(startDate: string, endDate?: string, filters: FuelTemperatureFilters = {}) {
    const reportDataList = await this.getFuelTemperatureDataRange(startDate, endDate, filters);
    if (!reportDataList.length) {
      throw new Error("No fuel/temperature report data found for the selected date range");
    }

    const { default: PDFDocument } = await import("pdfkit");
    return new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const buffer = Buffer.concat(buffers);
        resolve(buffer);
      });

      reportDataList.forEach((reportData, index) => {
        if (index > 0) {
          doc.addPage();
        }
        this.addPage1(doc, reportData);
        this.addPage2(doc, reportData);
      });

      doc.end();
    });
  }

  async generateExcelRange(startDate: string, endDate?: string, filters: FuelTemperatureFilters = {}) {
    const reportDataList = await this.getFuelTemperatureDataRange(startDate, endDate, filters);
    if (!reportDataList.length) {
      throw new Error("No fuel/temperature report data found for the selected date range");
    }

    const workbook = new ExcelJS.Workbook();

    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "Report Date", key: "reportDate", width: 20 },
      { header: "Asset Name", key: "assetName", width: 25 },
      { header: "From", key: "fromDatetime", width: 22 },
      { header: "To", key: "toDatetime", width: 22 },
      { header: "Generated On", key: "generatedOn", width: 22 },
      { header: "Total Distance (km)", key: "totalDistanceKm", width: 18 },
      { header: "Total Refills (L)", key: "totalRefillsL", width: 18 },
      { header: "Total Drains (L)", key: "totalDrainsL", width: 18 },
      { header: "Fuel Used (L)", key: "fuelUsedL", width: 16 },
      { header: "Fuel Consumption (Km/L)", key: "fuelConsumptionKmL", width: 22 },
    ];

    reportDataList.forEach((report) => {
      summarySheet.addRow({
        reportDate: report.reportDate ?? "",
        assetName: report.assetName ?? "",
        fromDatetime: report.fromDatetime ?? "",
        toDatetime: report.toDatetime ?? "",
        generatedOn: report.generatedOn ?? "",
        totalDistanceKm: report.totalDistanceKm ?? 0,
        totalRefillsL: report.totalRefillsL ?? 0,
        totalDrainsL: report.totalDrainsL ?? 0,
        fuelUsedL: report.fuelUsedL ?? 0,
        fuelConsumptionKmL: report.fuelConsumptionKmL ?? 0,
      });
    });

    const refuelSheet = workbook.addWorksheet("Refuel Events");
    refuelSheet.columns = [
      { header: "Report Date", key: "reportDate", width: 20 },
      { header: "Asset Name", key: "assetName", width: 25 },
      { header: "Time", key: "time", width: 22 },
      { header: "Initial Fuel", key: "initial", width: 14 },
      { header: "Final Fuel", key: "final", width: 14 },
      { header: "Refilled", key: "refilled", width: 12 },
      { header: "Location", key: "location", width: 30 },
      { header: "Latitude", key: "lat", width: 14 },
      { header: "Longitude", key: "lng", width: 14 },
    ];

    reportDataList.forEach((report) => {
      report.refuelEvents.forEach((event) => {
        refuelSheet.addRow({
          reportDate: report.reportDate ?? "",
          assetName: report.assetName ?? "",
          time: event.time ?? "",
          initial: event.initial ?? "",
          final: event.final ?? "",
          refilled: event.refilled ?? "",
          location: event.location ?? "",
          lat: event.lat ?? "",
          lng: event.lng ?? "",
        });
      });
    });

    const rawSheet = workbook.addWorksheet("Raw Sensor Data");
    rawSheet.columns = [
      { header: "Report Date", key: "reportDate", width: 20 },
      { header: "Asset Name", key: "assetName", width: 25 },
      { header: "Timestamp", key: "timestamp", width: 22 },
      { header: "Fuel", key: "fuel", width: 12 },
      { header: "Altitude", key: "altitude", width: 12 },
      { header: "Odometer", key: "odometer", width: 14 },
      { header: "Speed", key: "speed", width: 10 },
    ];

    reportDataList.forEach((report) => {
      report.rawSensorData.forEach((row) => {
        rawSheet.addRow({
          reportDate: report.reportDate ?? "",
          assetName: report.assetName ?? "",
          timestamp: row.timestamp ?? "",
          fuel: row.fuel ?? "",
          altitude: row.altitude ?? "",
          odometer: row.odometer ?? "",
          speed: row.speed ?? "",
        });
      });
    });

    const buffer = (await workbook.xlsx.writeBuffer()) as any;
    return buffer;
  }

  private parseDate(value?: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatDate(value?: string | null) {
    const parsed = this.parseDate(value);
    if (!parsed) return null;
    return parsed.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  private formatTime(value?: string | null) {
    const parsed = this.parseDate(value);
    if (!parsed) return null;
    return parsed.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  private formatDateTime(value?: string | null) {
    const date = this.formatDate(value);
    const time = this.formatTime(value);
    if (!date || !time) return null;
    return `${date} ${time}`;
  }

  private formatMetric(value: number | string | null | undefined, digits = 2) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(digits) : "0.00";
  }

  addPage1(doc: PDFKit.PDFDocument, data: FuelTemperatureData) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const top = doc.page.margins.top;
    const contentWidth = right - left;

    const reportTitle = data.reportTitle || "Sensor / Fuel / Temperature";
    const assetName = data.assetName || "Asset";
    const fromLabel = this.formatDateTime(data.fromDatetime);
    const toLabel = this.formatDateTime(data.toDatetime);
    const generatedLabel = this.formatDateTime(data.generatedOn);

    // Header
    doc.fillColor("#000");
    doc.font("Helvetica-Bold").fontSize(16).text(reportTitle, left, top, { width: contentWidth });
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#00AEEF")
      .text("TELETROC", right - 120, top, { width: 120, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor("#555")
      .text("Hewi Solutions Ltd", right - 120, top + 14, { width: 120, align: "right" });
    doc.fillColor("#000");

    let y = top + 40;

    // Assets and date range
    doc.font("Helvetica-Bold").fontSize(10).text("Assets", left, y);
    y += 14;
    doc.font("Helvetica").fontSize(10).text(assetName, left, y);
    y += 16;

    const fromText = `From      ${fromLabel ?? "-"}`;
    const toText = `To        ${toLabel ?? "-"}`;
    const generatedText = generatedLabel ? `Generated on ${generatedLabel}` : "";

    doc.font("Helvetica").fontSize(10);
    doc.text(fromText, left, y, { width: 240 });
    doc.text(toText, left + 250, y, { width: 240 });
    if (generatedText) {
      doc.fontSize(9).fillColor("#555")
        .text(generatedText, right - 180, y - 2, { width: 180, align: "right" });
      doc.fillColor("#000");
    }

    y += 28;

    // Summary metrics
    const metricLabelWidth = 120;
    const metricValueWidth = 70;
    const metricUnitWidth = 50;
    const metricRowHeight = 14;

    const drawMetric = (label: string, value: string, unit: string) => {
      doc.font("Helvetica").fontSize(10).text(label, left, y, { width: metricLabelWidth });
      doc.font("Helvetica-Bold").fontSize(10)
        .text(value, left + metricLabelWidth, y, { width: metricValueWidth, align: "right" });
      doc.font("Helvetica").fontSize(10)
        .text(unit, left + metricLabelWidth + metricValueWidth + 5, y, { width: metricUnitWidth });
      y += metricRowHeight;
    };

    drawMetric("Total Distance", this.formatMetric(data.totalDistanceKm), "km");
    drawMetric("Total refills", this.formatMetric(data.totalRefillsL), "L");
    drawMetric("Total Drains", this.formatMetric(data.totalDrainsL), "L");
    drawMetric("Fuel used", this.formatMetric(data.fuelUsedL), "L");
    drawMetric("Fuel Consumption", this.formatMetric(data.fuelConsumptionKmL), "Km/L");

    y += 14;

    // Fuel graph
    const chartX = left;
    const chartY = y;
    const chartHeight = 220;
    const chartWidth = contentWidth;
    const chartPaddingLeft = 34;
    const plotX = chartX + chartPaddingLeft;
    const plotWidth = chartWidth - chartPaddingLeft;

    doc.lineWidth(1).strokeColor("#ccc").rect(chartX, chartY, chartWidth, chartHeight).stroke();

    const gridLines = 7;
    for (let i = 0; i <= gridLines; i += 1) {
      const lineY = chartY + (chartHeight / gridLines) * i;
      doc.strokeColor(i === gridLines ? "#000" : "#eee")
        .moveTo(chartX, lineY)
        .lineTo(chartX + chartWidth, lineY)
        .stroke();
    }

    // Y-axis labels
    doc.font("Helvetica").fontSize(8).fillColor("#000");
    const maxFuel = 700;
    for (let i = 0; i <= gridLines; i += 1) {
      const labelValue = maxFuel - (maxFuel / gridLines) * i;
      const labelY = chartY + (chartHeight / gridLines) * i - 4;
      doc.text(String(Math.round(labelValue)), chartX + 2, labelY, { width: chartPaddingLeft - 6, align: "right" });
    }

    // Plot line + fill
    const rawPoints = [...(data.rawSensorData || [])]
      .filter((entry) => entry.timestamp && entry.fuel !== null && entry.fuel !== undefined)
      .sort((a, b) => new Date(a.timestamp as string).getTime() - new Date(b.timestamp as string).getTime());

    const sampledPoints = rawPoints.length > 60
      ? rawPoints.filter((_, idx) => idx % Math.ceil(rawPoints.length / 60) === 0)
      : rawPoints;

    if (sampledPoints.length > 1) {
      const points = sampledPoints.map((point, idx) => {
        const fuel = Math.max(0, Math.min(maxFuel, Number(point.fuel) || 0));
        const x = plotX + (plotWidth * idx) / (sampledPoints.length - 1);
        const yVal = chartY + chartHeight - (fuel / maxFuel) * chartHeight;
        return { x, y: yVal };
      });

      doc.save();
      doc.fillColor("#B3D9FF");
      doc.moveTo(points[0].x, chartY + chartHeight);
      points.forEach((p) => doc.lineTo(p.x, p.y));
      doc.lineTo(points[points.length - 1].x, chartY + chartHeight);
      doc.closePath().fill();
      doc.restore();

      doc.save();
      doc.strokeColor("#00AEEF").lineWidth(1.5);
      doc.moveTo(points[0].x, points[0].y);
      points.forEach((p) => doc.lineTo(p.x, p.y));
      doc.stroke();
      doc.restore();
    }

    // X-axis labels
    const xLabelY = chartY + chartHeight + 6;
    const labelPoints = sampledPoints.length >= 4
      ? [0, Math.floor(sampledPoints.length / 3), Math.floor((sampledPoints.length * 2) / 3), sampledPoints.length - 1]
      : sampledPoints.map((_, idx) => idx);
    const uniqueLabelPoints = Array.from(new Set(labelPoints));
    doc.font("Helvetica").fontSize(8).fillColor("#000");
    uniqueLabelPoints.forEach((idx) => {
      const point = sampledPoints[idx];
      if (!point) return;
      const label = this.formatDateTime(point.timestamp as string) || String(point.timestamp);
      const x = plotX + (plotWidth * idx) / Math.max(1, sampledPoints.length - 1);
      doc.text(label, x - 40, xLabelY, { width: 80, align: "center" });
    });

    // Legend line
    const legendY = xLabelY + 22;
    doc.font("Helvetica").fontSize(7).fillColor("#555")
      .text("Raw Fuel      0      Fuel      0      XAltitude      0      Odometer      0      XSpeed      0",
        left, legendY, { width: contentWidth, align: "center" });

    doc.fillColor("#000");
  }

  addPage2(doc: PDFKit.PDFDocument, data: FuelTemperatureData) {
    doc.addPage();

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const top = doc.page.margins.top;
    const tableWidth = right - left;

    doc.font("Helvetica-Bold").fontSize(14).text("Refuels (L)", left, top);

    let y = top + 20;
    const headers = ["Time", "Initial fuel", "Final fuel", "Refilled", "Location", "Latitude", "Longitude"];
    const colWidths = [80, 55, 55, 55, tableWidth - 80 - 55 - 55 - 55 - 60 - 60, 60, 60];
    const headerHeight = 18;

    const drawHeader = () => {
      doc.rect(left, y, tableWidth, headerHeight).fill("#f0f0f0").stroke();
      let x = left;
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#000");
      headers.forEach((header, index) => {
        doc.text(header, x + 4, y + 4, { width: colWidths[index] - 8, align: index >= 1 && index <= 3 ? "right" : "left" });
        x += colWidths[index];
      });
      y += headerHeight;
    };

    drawHeader();

    doc.font("Helvetica").fontSize(8).fillColor("#000");
    const refuelData = data.refuelEvents || [];

    refuelData.forEach((row) => {
      const cells = [
        String(row.time ?? ""),
        this.formatMetric(row.initial, 2),
        this.formatMetric(row.final, 2),
        this.formatMetric(row.refilled, 2),
        String(row.location ?? ""),
        this.formatMetric(row.lat, 6),
        this.formatMetric(row.lng, 6),
      ];

      const rowHeights = cells.map((cell, index) => {
        const width = colWidths[index] - 8;
        return doc.heightOfString(cell, { width, align: index >= 1 && index <= 3 ? "right" : "left" });
      });
      const rowHeight = Math.max(14, ...rowHeights) + 6;

      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }

      let x = left;
      cells.forEach((cell, index) => {
        const align = index >= 1 && index <= 3 ? "right" : "left";
        doc.text(cell, x + 4, y + 3, { width: colWidths[index] - 8, align });
        x += colWidths[index];
      });

      doc.strokeColor("#eee")
        .moveTo(left, y + rowHeight)
        .lineTo(left + tableWidth, y + rowHeight)
        .stroke();

      y += rowHeight;
    });
  }
}



function buildDailyMovementPreview(date: string, movementData: any[]) {
  const assetGroups = dailyMovementGenerator.groupByAssetForPreview(movementData);
  const companyName = movementData.find((row) => row?.company_name)?.company_name
    || "Teletrac Fuel";

  return {
    date,
    companyName,
    reports: assetGroups.map(group => ({
      assetDescription: group.asset.asset_description,
      registrationNumber: group.asset.registration_number,
      assetId: group.asset.asset_id,
      siteName: group.asset.site_name,
      movements: group.trips.map((trip: any) => ({
        departureDate: trip.departure_date,
        driver: trip.driver,
        departureTime: trip.departure_time,
        departedFrom: trip.departed_from,
        drivingTime: trip.driving_time,
        standingTime: trip.standing_time,
        distanceKm: trip.distance_km,
        maxSpeedKmh: trip.max_speed_kmh,
        arrivalTime: trip.arrival_time,
        arrivedAt: trip.arrived_at,
        nextDeparture: trip.next_departure,
        standingTimeAtLocation: trip.standing_time_at_location,
        fuelUsedLitres: trip.fuel_used_litres
      })),
      totals: {
        totalDrivingTime: group.totals.drivingTime,
        totalStandingTime: group.totals.standingTime,
        totalDistance: group.totals.distance,
        totalStandingAtLocation: group.totals.standingTime
      },
      averages: {
        avgDrivingTime: group.averages.drivingTime,
        avgStandingTime: group.averages.standingTime,
        avgDistance: group.averages.distance,
        avgStandingAtLocation: group.averages.standingTime
      }
    }))
  };
}

function buildFuelTemperaturePreview(dateLabel: string, data: FuelTemperatureData) {
  return {
    date: dateLabel,
    reportDate: data.reportDate ?? null,
    reportTitle: data.reportTitle,
    assetName: data.assetName,
    fromDatetime: data.fromDatetime,
    toDatetime: data.toDatetime,
    generatedOn: data.generatedOn,
    totalDistance: data.totalDistanceKm ?? 0,
    totalRefills: data.totalRefillsL ?? 0,
    totalDrains: data.totalDrainsL ?? 0,
    fuelUsed: data.fuelUsedL ?? 0,
    fuelConsumption: data.fuelConsumptionKmL ?? 0,
    refuelEvents: data.refuelEvents.map(event => ({
      time: event.time,
      initial_fuel: event.initial ?? 0,
      final_fuel: event.final ?? 0,
      refilled: event.refilled ?? 0,
      location: event.location ?? "",
      latitude: event.lat ?? 0,
      longitude: event.lng ?? 0
    })),
    rawSensorData: data.rawSensorData.map((row) => ({
      timestamp: row.timestamp,
      fuel: row.fuel ?? 0,
      altitude: row.altitude ?? 0,
      odometer: row.odometer ?? 0,
      speed: row.speed ?? 0,
      temperature: 0
    }))
  };
}

// Initialize generators
const dailyMovementGenerator = new DailyMovementGenerator();
const fuelTemperatureGenerator = new FuelTemperatureGenerator();

// Export routes function
export function setupReportsRoutes(app: Express) {
  app.use("/api/reports", requireAuth);

  // Unified report generation endpoint used by the frontend
  app.get("/api/reports/generate", async (req, res) => {
    try {
      const format = (req.query.format as string | undefined)?.toLowerCase() || "excel";
      const startDate = (req.query.start_date || req.query.startDate || req.query.date) as string | undefined;
      const endDate = (req.query.end_date || req.query.endDate) as string | undefined;
      const reportType = (req.query.report_type || req.query.reportType) as string | undefined;
      const vehicleId = parseStringParam(req.query.vehicle_id || req.query.vehicleId);
      const vehicleIds = parseStringListParam(req.query.vehicle_ids || req.query.vehicleIds);
      const assetId = parseAssetId(req.query.asset_id || req.query.assetId);
      const registrationNumber = parseStringParam(req.query.registration_number || req.query.registrationNumber);
      const assetName = parseStringParam(req.query.asset_name || req.query.assetName);

      if (!startDate) {
        return res.status(400).json({ error: "start_date is required" });
      }
      const startValue = new Date(startDate);
      if (Number.isNaN(startValue.getTime())) {
        return res.status(400).json({ error: "Invalid start_date provided" });
      }
      if (endDate) {
        const endValue = new Date(endDate);
        if (Number.isNaN(endValue.getTime())) {
          return res.status(400).json({ error: "Invalid end_date provided" });
        }
        if (endValue < startValue) {
          return res.status(400).json({ error: "end_date cannot be before start_date" });
        }
      }

      const normalizedEndDate = endDate || startDate;
      const previewLabel = normalizedEndDate !== startDate
        ? `${startDate} to ${normalizedEndDate}`
        : startDate;
      const fileRangeLabel = normalizedEndDate !== startDate
        ? `${startDate}_${normalizedEndDate}`
        : startDate;

      const scope = getReportScope(req, res);
      if (!scope) return;

      const movementFilters: DailyMovementFilters = {
        vehicleId,
        vehicleIds,
        assetId,
        registrationNumber,
        clientIds: scope.clientIds,
      };
      const fuelFilters: FuelTemperatureFilters = {
        vehicleId,
        vehicleIds,
        assetName,
        clientIds: scope.clientIds,
      };

      if (format === "preview") {
        if (reportType === "fuel-temperature") {
          const reports = await fuelTemperatureGenerator.getFuelTemperatureDataRange(
            startDate,
            normalizedEndDate,
            fuelFilters
          );
          if (!reports.length) {
            return res.status(404).json({ error: "No fuel/temperature data found for the selected date range" });
          }
          const reportData = reports[reports.length - 1];
          return res.json(buildFuelTemperaturePreview(previewLabel, reportData));
        }

        const movementData = await dailyMovementGenerator.getMovementData(
          startDate,
          movementFilters,
          normalizedEndDate
        );
        if (!movementData.length) {
          return res.status(404).json({ error: "No daily movement data found for the selected date range" });
        }
        return res.json(buildDailyMovementPreview(previewLabel, movementData));
      }

      if (reportType === "fuel-temperature") {
        if (format === "excel") {
          const buffer = await fuelTemperatureGenerator.generateExcelRange(
            startDate,
            normalizedEndDate,
            fuelFilters
          );
          res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          res.setHeader(
            "Content-Disposition",
            `attachment; filename=fuel_temperature_${fileRangeLabel}.xlsx`
          );
          return res.send(buffer);
        }

        if (format === "csv") {
          const rows = await fuelTemperatureGenerator.fetchFuelTemperatureReports(
            startDate,
            normalizedEndDate,
            fuelFilters
          );
          if (!rows.length) {
            return res.status(404).json({ error: "No fuel/temperature data found for the selected date range" });
          }

          const headers = [
            "report_date",
            "asset_name",
            "report_title",
            "from_datetime",
            "to_datetime",
            "generated_on",
            "total_distance_km",
            "total_refills_l",
            "total_drains_l",
            "fuel_used_l",
            "fuel_consumption_km_l",
            "vehicle_id",
            "client_id",
          ];

          const lines = [
            headers.join(","),
            ...rows.map((row: any) =>
              headers
                .map((key) => {
                  const value = row[key] ?? "";
                  const text = String(value).replace(/"/g, "\"\"");
                  return `"${text}"`;
                })
                .join(",")
            ),
          ];

          const csv = lines.join("\n");
          res.setHeader("Content-Type", "text/csv");
          res.setHeader("Content-Disposition", `attachment; filename=fuel_temperature_${fileRangeLabel}.csv`);
          return res.send(csv);
        }

        const buffer = await fuelTemperatureGenerator.generatePdfRange(
          startDate,
          normalizedEndDate,
          fuelFilters
        );
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=fuel_temperature_${fileRangeLabel}.pdf`);
        return res.send(buffer);
      }

      if (format === "csv") {
        const data = await dailyMovementGenerator.getMovementData(
          startDate,
          movementFilters,
          normalizedEndDate
        );
        if (!data.length) {
          return res.status(404).json({ error: "No daily movement data found for the selected date range" });
        }
        const headers = [
          "report_date",
          "driver",
          "departure_date",
          "departure_time",
          "departed_from",
          "driving_time",
          "distance_km",
          "max_speed_kmh",
          "arrival_time",
          "arrived_at",
          "next_departure",
          "standing_time_at_location",
          "fuel_used_litres",
        ];

        const lines = [
          headers.join(","),
          ...data.map((row: any) =>
            headers
              .map((key) => {
                const value = key === "report_date" ? row.report_date ?? "" : row[key] ?? "";
                const text = String(value).replace(/"/g, "\"\"");
                return `"${text}"`;
              })
              .join(",")
          ),
        ];

        const csv = lines.join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=daily_movement_${fileRangeLabel}.csv`);
        return res.send(csv);
      }

      // Default to daily movement Excel
      const buffer = await dailyMovementGenerator.generateExcel(
        startDate,
        movementFilters,
        normalizedEndDate
      );
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=daily_movement_${fileRangeLabel}.xlsx`);
      res.send(buffer);
    } catch (error) {
      console.error("Report generation error:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // GET /api/reports/generate-daily-movement/:date - Generate daily movement Excel report
  app.get("/api/reports/generate-daily-movement/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const scope = getReportScope(req, res);
      if (!scope) return;

      const vehicleId = parseStringParam(req.query.vehicle_id || req.query.vehicleId);
      const vehicleIds = parseStringListParam(req.query.vehicle_ids || req.query.vehicleIds);
      const assetId = parseAssetId(req.query.asset_id || req.query.assetId);
      const registrationNumber = parseStringParam(req.query.registration_number || req.query.registrationNumber);
      const endDate = parseStringParam(req.query.end_date || req.query.endDate);
      const startValue = new Date(date);
      if (Number.isNaN(startValue.getTime())) {
        return res.status(400).json({ error: "Invalid start date provided" });
      }
      if (endDate) {
        const endValue = new Date(endDate);
        if (Number.isNaN(endValue.getTime())) {
          return res.status(400).json({ error: "Invalid end date provided" });
        }
        if (endValue < startValue) {
          return res.status(400).json({ error: "end_date cannot be before start_date" });
        }
      }
      debugLog('🔍 DEBUG: Starting Excel generation for date:', date);
      
      const reportBuffer = (await dailyMovementGenerator.generateExcel(date, {
        vehicleId,
        vehicleIds,
        assetId,
        registrationNumber,
        clientIds: scope.clientIds,
      }, endDate)) as any;
      
      debugLog('🔍 DEBUG: Excel buffer generated, size:', reportBuffer?.length || 0);
      debugLog('🔍 DEBUG: Buffer type:', typeof reportBuffer);
      debugLog('🔍 DEBUG: Buffer is Buffer:', Buffer.isBuffer(reportBuffer));
      
      // Check if buffer is valid
      if (!reportBuffer || reportBuffer.length === 0) {
        console.error('🔍 ERROR: Generated Excel buffer is empty or null');
        res.status(500).json({ error: 'Generated Excel file is empty' });
        return;
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const fileRangeLabel = endDate && endDate !== date ? `${date}_${endDate}` : date;
      res.setHeader('Content-Disposition', `attachment; filename=daily_movement_${fileRangeLabel}.xlsx`);
      res.setHeader('Content-Length', reportBuffer.length);
      
      debugLog('🔍 DEBUG: Sending response with headers:', {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=daily_movement_${fileRangeLabel}.xlsx`,
        'Content-Length': reportBuffer.length
      });
      
      res.send(reportBuffer);
      debugLog('🔍 DEBUG: Response sent successfully');
    } catch (error: any) {
      console.error('🔍 ERROR: Generation error:', error);
      console.error('🔍 ERROR: Error stack:', error?.stack);
      res.status(500).json({ error: 'Failed to generate daily movement report' });
    }
  });

  // GET /api/reports/generate-fuel-temperature/:date - Generate fuel/temperature PDF report
  app.get("/api/reports/generate-fuel-temperature/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const scope = getReportScope(req, res);
      if (!scope) return;

      const vehicleId = parseStringParam(req.query.vehicle_id || req.query.vehicleId);
      const vehicleIds = parseStringListParam(req.query.vehicle_ids || req.query.vehicleIds);
      const assetName = parseStringParam(req.query.asset_name || req.query.assetName);
      const endDate = parseStringParam(req.query.end_date || req.query.endDate);
      const startValue = new Date(date);
      if (Number.isNaN(startValue.getTime())) {
        return res.status(400).json({ error: "Invalid start date provided" });
      }
      if (endDate) {
        const endValue = new Date(endDate);
        if (Number.isNaN(endValue.getTime())) {
          return res.status(400).json({ error: "Invalid end date provided" });
        }
        if (endValue < startValue) {
          return res.status(400).json({ error: "end_date cannot be before start_date" });
        }
      }
      const reportBuffer = (await fuelTemperatureGenerator.generatePdfRange(date, endDate || date, {
        vehicleId,
        vehicleIds,
        assetName,
        clientIds: scope.clientIds,
      })) as any;

      const fileRangeLabel = endDate && endDate !== date ? `${date}_${endDate}` : date;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=fuel_temperature_${fileRangeLabel}.pdf`);
      res.send(reportBuffer);
    } catch (error) {
      console.error('Generation error:', error);
      res.status(500).json({ error: 'Failed to generate fuel temperature report' });
    }
  });

  // GET /api/reports/preview-daily-movement/:date - Get daily movement preview data
  app.get("/api/reports/preview-daily-movement/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const scope = getReportScope(req, res);
      if (!scope) return;

      const vehicleId = parseStringParam(req.query.vehicle_id || req.query.vehicleId);
      const vehicleIds = parseStringListParam(req.query.vehicle_ids || req.query.vehicleIds);
      const assetId = parseAssetId(req.query.asset_id || req.query.assetId);
      const registrationNumber = parseStringParam(req.query.registration_number || req.query.registrationNumber);
      const endDate = parseStringParam(req.query.end_date || req.query.endDate);
      const startValue = new Date(date);
      if (Number.isNaN(startValue.getTime())) {
        return res.status(400).json({ error: "Invalid start date provided" });
      }
      if (endDate) {
        const endValue = new Date(endDate);
        if (Number.isNaN(endValue.getTime())) {
          return res.status(400).json({ error: "Invalid end date provided" });
        }
        if (endValue < startValue) {
          return res.status(400).json({ error: "end_date cannot be before start_date" });
        }
      }
      const previewLabel = endDate && endDate !== date ? `${date} to ${endDate}` : date;
      const movementData = await dailyMovementGenerator.getMovementData(date, {
        vehicleId,
        vehicleIds,
        assetId,
        registrationNumber,
        clientIds: scope.clientIds,
      }, endDate);
      if (!movementData.length) {
        return res.status(404).json({ error: "No daily movement data found for the selected date range" });
      }

      res.json(buildDailyMovementPreview(previewLabel, movementData));
    } catch (error) {
      console.error('Preview error:', error);
      res.status(500).json({ error: 'Failed to get daily movement preview' });
    }
  });

  // GET /api/reports/preview-fuel-temperature/:date - Get fuel/temperature preview data
  app.get("/api/reports/preview-fuel-temperature/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const scope = getReportScope(req, res);
      if (!scope) return;

      const vehicleId = parseStringParam(req.query.vehicle_id || req.query.vehicleId);
      const vehicleIds = parseStringListParam(req.query.vehicle_ids || req.query.vehicleIds);
      const assetName = parseStringParam(req.query.asset_name || req.query.assetName);
      const endDate = parseStringParam(req.query.end_date || req.query.endDate);
      const startValue = new Date(date);
      if (Number.isNaN(startValue.getTime())) {
        return res.status(400).json({ error: "Invalid start date provided" });
      }
      if (endDate) {
        const endValue = new Date(endDate);
        if (Number.isNaN(endValue.getTime())) {
          return res.status(400).json({ error: "Invalid end date provided" });
        }
        if (endValue < startValue) {
          return res.status(400).json({ error: "end_date cannot be before start_date" });
        }
      }
      const previewLabel = endDate && endDate !== date ? `${date} to ${endDate}` : date;
      const reports = await fuelTemperatureGenerator.getFuelTemperatureDataRange(date, endDate || date, {
        vehicleId,
        vehicleIds,
        assetName,
        clientIds: scope.clientIds,
      });
      if (!reports.length) {
        return res.status(404).json({ error: "No fuel/temperature data found for the selected date range" });
      }

      const reportData = reports[reports.length - 1];
      res.json(buildFuelTemperaturePreview(previewLabel, reportData));
    } catch (error) {
      console.error('Preview error:', error);
      res.status(500).json({ error: 'Failed to get fuel temperature preview' });
    }
  });
}

