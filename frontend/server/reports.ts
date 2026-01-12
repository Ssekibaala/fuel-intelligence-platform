import type { Express } from "express";
import multer from 'multer';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Daily Movement Report Parser
class DailyMovementParser {
  async parseExcel(filePath: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      throw new Error('Could not find worksheet in Excel file');
    }
    const data = [];

    // Skip header rows (first 6 rows based on your Excel structure)
    for (let row = 8; row <= worksheet.rowCount; row++) {
      const rowData = worksheet.getRow(row);

      // Check if this is a totals row
      const isTotalRow = rowData.getCell(1).value?.toString().includes('Totals') || false;
      const isAverageRow = rowData.getCell(1).value?.toString().includes('Averages') || false;
      const isAssetRow = rowData.getCell(1).value?.toString().includes('Asset Description');

      if (isAssetRow) {
        // This is a new asset section
        continue;
      }

      const record = {
        asset_description: this.cleanValue(rowData.getCell(3).value),
        registration_number: this.cleanValue(rowData.getCell(3).value),
        asset_id: parseInt(this.cleanValue(rowData.getCell(3).value)),
        site_name: 'ADT Africa Ltd.',
        departure_date: this.parseDate(rowData.getCell(1).value),
        driver: this.cleanValue(rowData.getCell(2).value),
        departure_time: this.parseDateTime(rowData.getCell(3).value),
        departed_from: this.cleanValue(rowData.getCell(4).value),
        driving_time: this.parseTime(rowData.getCell(5).value),
        standing_time: this.parseTime(rowData.getCell(6).value),
        distance_km: parseFloat(this.cleanValue(rowData.getCell(7).value) || 0),
        max_speed_kmh: parseInt(this.cleanValue(rowData.getCell(8).value) || 0),
        arrival_time: this.parseDateTime(rowData.getCell(9).value),
        arrived_at: this.cleanValue(rowData.getCell(12).value),
        next_departure: this.parseDateTime(rowData.getCell(13).value),
        standing_time_at_location: this.parseTime(rowData.getCell(15).value),
        fuel_used_litres: parseFloat(this.cleanValue(rowData.getCell(16).value) || 0),
        is_total_row: isTotalRow,
        is_average_row: isAverageRow
      };

      data.push(record);
    }

    return data;
  }

  cleanValue(value: any) {
    if (!value) return null;
    if (typeof value === 'string') {
      return value.trim().replace(/[\n\r]/g, ' ');
    }
    return value;
  }

  parseDate(value: any) {
    if (!value) return null;
    if (typeof value === 'object' && value instanceof Date) {
      return value;
    }
    return new Date(value);
  }

  parseDateTime(value: any) {
    if (!value) return null;
    if (typeof value === 'object' && value instanceof Date) {
      return value;
    }
    return new Date(value);
  }

  parseTime(timeStr: any) {
    if (!timeStr) return null;
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return `${hours}:${minutes}:${seconds}`;
  }
}

// Daily Movement Report Generator
class DailyMovementGenerator {
  async generateExcel(date: string) {
    console.log('🔍 DEBUG: Starting Excel workbook creation');
    
    const workbook = new ExcelJS.Workbook();
    console.log('🔍 DEBUG: Workbook created successfully');
    
    const worksheet = workbook.addWorksheet('Daily Movement Report');
    console.log('🔍 DEBUG: Worksheet added successfully');
    
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
    const dateRow = worksheet.addRow([`From ${date} 00:00 to ${date} 23:59`]);
    dateRow.getCell(1).font = { size: 10, italic: true };
    worksheet.mergeCells('A3:L3');

    // Row 4: Empty spacer
    worksheet.addRow([]);

    // Get data from database (mock data for now)
    const data = await this.getMovementData(date);

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
        
        console.log('🔍 DEBUG: Processing trip data (safe):', safeData);
        
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
        
        console.log('🔍 DEBUG: Data row added successfully');

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
    console.log('🔍 DEBUG: Attempting to generate Excel buffer...');
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      console.log('🔍 DEBUG: Excel buffer generated successfully, size:', buffer?.length || 0);
      console.log('🔍 DEBUG: Buffer is valid Buffer:', Buffer.isBuffer(buffer));
      return buffer;
    } catch (writeError) {
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

  // Mock data method - replace with actual database call
  // This now matches the exact data structure used in the frontend preview
  async getMovementData(date: string) {
    // Use the same date format as preview (DD/MM/YYYY)
    const formattedDate = '07/12/2025'; // Match preview date format
    
    return [
      // Vehicle 1: HOWO-UBG002K - exactly matching preview data
      {
        asset_description: 'HOWO-UBG002K',
        registration_number: 'UR6000X', // Match preview registration number
        asset_id: 1,
        site_name: 'AOT Africa Ltd.', // Match preview site name
        departure_date: formattedDate,
        driver: 'Kasoona Hakim',
        departure_time: '04:06:23',
        departed_from: 'AT04, Kenya',
        driving_time: '00:08:28',
        standing_time: '00:00:00',
        distance_km: 2.41,
        max_speed_kmh: 55,
        arrival_time: '04:14:51',
        arrived_at: 'AT04, Kenya',
        next_departure: '14/12/2025, 04:22',
        standing_time_at_location: '00027AR', // Use preview format
        fuel_used_litres: 0.37,
        is_total_row: false,
        is_average_row: false
      },
      {
        asset_description: 'HOWO-UBG002K',
        registration_number: 'UR6000X',
        asset_id: 1,
        site_name: 'AOT Africa Ltd.',
        departure_date: formattedDate,
        driver: 'Kasoona Hakim',
        departure_time: '04:30:12',
        departed_from: 'JBN-JOF, AT04, Kenya',
        driving_time: '00:02:29',
        standing_time: '00:00:00',
        distance_km: 2.10,
        max_speed_kmh: 34,
        arrival_time: '04:32:39',
        arrived_at: 'JBN-JOF, AT04, Kenya',
        next_departure: '14/12/2025, 05:02',
        standing_time_at_location: '00637-42', // Use preview format
        fuel_used_litres: 0.44,
        is_total_row: false,
        is_average_row: false
      },
      // Vehicle 2: HOWO-UBG003K - Added to ensure minimum 2 vehicles
      {
        asset_description: 'HOWO-UBG003K',
        registration_number: 'UR6001X',
        asset_id: 2,
        site_name: 'AOT Africa Ltd.',
        departure_date: formattedDate,
        driver: 'Juma Alfred',
        departure_time: '05:00:00',
        departed_from: 'Nairobi Depot',
        driving_time: '01:15:30',
        standing_time: '00:10:00',
        distance_km: 15.50,
        max_speed_kmh: 65,
        arrival_time: '06:15:30',
        arrived_at: 'Kampala Hub',
        next_departure: '14/12/2025, 07:00',
        standing_time_at_location: '00125AR', // Use preview format
        fuel_used_litres: 2.8,
        is_total_row: false,
        is_average_row: false
      }
    ];
  }
}

// Fuel/Temperature Report Generator
class FuelTemperatureGenerator {
  async generatePdf(date: string) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const buffer = Buffer.concat(buffers);
        resolve(buffer);
      });

      // Page 1: EXACTLY like your PDF
      this.addPage1(doc, date);

      // Page 2: EXACTLY like your PDF
      this.addPage2(doc, date);

      doc.end();
    });
  }

  addPage1(doc: PDFKit.PDFDocument, date: string) {
    // Title
    doc.fontSize(20).font('Helvetica-Bold')
       .text('Sensor / Fuel / Temperature', { align: 'center' });

    doc.moveDown();

    // Assets section
    doc.fontSize(12).font('Helvetica-Bold').text('Assets');
    doc.fontSize(10).font('Helvetica')
       .text('• Howo Demo', { indent: 20 });
    doc.text(`  From: ${date} 00:00:00`, { indent: 40 });
    doc.text(`  To: ${date} 13:43:00`, { indent: 40 });

    doc.moveDown();

    // Generated on
    doc.fontSize(10).font('Helvetica').text('Generated on:', { continued: true });
    doc.font('Helvetica-Bold').text(` ${date} 13:42:57`);

    doc.moveDown(2);

    // Total Distance
    doc.fontSize(14).font('Helvetica-Bold').text('Total Distance', { underline: true });
    doc.fontSize(12).font('Helvetica')
       .text('• 18.59 km', { indent: 20 })
       .text('• Total refills: 556.80 L', { indent: 20 })
       .text('• Total Drains: 0.00 L', { indent: 20 })
       .text('• Fuel used: 31.20 L', { indent: 20 })
       .text('• Fuel Consumption: 0.60 Km/L', { indent: 20 });

    doc.moveDown(2);

    // Fuel Graph (text representation)
    doc.fontSize(12).font('Helvetica-Bold').text('Fuel Graph ( litres)', { underline: true });
    doc.moveDown();

    const graphLines = [
      '• 700',
      '• 600',
      '• 500',
      '• 400',
      '• 300',
      '• 200',
      '• 100'
    ];

    graphLines.forEach(line => {
      doc.fontSize(10).font('Helvetica').text(line, { indent: 20 });
    });

    doc.moveDown(2);

    // Timeline
    doc.fontSize(10).font('Helvetica').text('Oil Dec 2025 10:13:49');
    doc.text('08 Dec 2025 10:33:23');
    doc.text('08 Dec 2025 10:49:32');
    doc.text('08 Dec 2025 11:14:55');
    doc.text('08 Dec 2025 12:02:38');
    doc.text('08 Dec 2025 12:30:10');
    doc.text('08 Dec 2025 13:07:45');

    doc.moveDown(2);

    // Raw Fuel section
    doc.fontSize(12).font('Helvetica-Bold').text('Raw Fuel', { underline: true });
    const rawData = [
      { label: 'Fuel', value: '0' },
      { label: 'Altitude', value: '0' },
      { label: 'Odometer', value: '0' },
      { label: 'Speed', value: '0' }
    ];

    rawData.forEach(item => {
      doc.fontSize(10).font('Helvetica')
         .text(`• ${item.value}`, { indent: 20 })
         .text(`  ${item.label}`, { indent: 40 });
    });
  }

  addPage2(doc: PDFKit.PDFDocument, date: string) {
    doc.addPage();

    // Title
    doc.fontSize(16).font('Helvetica-Bold')
       .text('Refuels (L)', { align: 'center' });

    doc.moveDown();

    // Table headers
    const headers = ['Time', 'Initial fuel', 'Final fuel', 'Refilled', 'Location', 'Latitude', 'Longitude'];
    const colWidths = [80, 50, 50, 50, 120, 60, 60];
    const startY = doc.y;

    // Draw headers
    headers.forEach((header, i) => {
      doc.fontSize(8).font('Helvetica-Bold')
         .text(header, 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), startY);
    });

    // Draw horizontal line
    doc.moveTo(50, startY + 15)
       .lineTo(50 + colWidths.reduce((a, b) => a + b, 0), startY + 15)
       .stroke();

    // Sample data rows (EXACTLY like your PDF)
    const refuelData = [
      {
        time: '08 Dec 2025 12:30:05',
        initial: '544.80',
        final: '597.60',
        refilled: '52.80',
        location: 'Factory Close, Nitrida Industrial Area, Nakawa, Kampala Capital City, Kampala, Central Region, Uganda',
        lat: '0.33567',
        lng: '32.616355'
      },
      {
        time: '08 Dec 2025 11:56:45',
        initial: '40.80',
        final: '544.80',
        refilled: '504.00',
        location: 'Factory Close, Nitrida Industrial Area, Nakawa, Kampala Capital City, Kampala, Central Region, Uganda',
        lat: '0.335818',
        lng: '32.616806'
      }
    ];

    let currentY = startY + 25;

    refuelData.forEach((row, rowIndex) => {
      // Time
      doc.fontSize(8).font('Helvetica')
         .text(row.time, 50, currentY, { width: colWidths[0] });

      // Initial fuel
      doc.text(row.initial, 50 + colWidths[0], currentY, { width: colWidths[1] });

      // Final fuel
      doc.text(row.final, 50 + colWidths[0] + colWidths[1], currentY, { width: colWidths[2] });

      // Refilled
      doc.text(row.refilled, 50 + colWidths[0] + colWidths[1] + colWidths[2], currentY, { width: colWidths[3] });

      // Location (truncated)
      doc.text(row.location.substring(0, 40) + '...',
              50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
              currentY,
              { width: colWidths[4] });

      // Latitude
      doc.text(row.lat,
              50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4],
              currentY,
              { width: colWidths[5] });

      // Longitude
      doc.text(row.lng,
              50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5],
              currentY,
              { width: colWidths[6] });

      currentY += 20;
    });
  }
}

// Initialize generators
const dailyMovementParser = new DailyMovementParser();
const dailyMovementGenerator = new DailyMovementGenerator();
const fuelTemperatureGenerator = new FuelTemperatureGenerator();

// Export routes function
export function setupReportsRoutes(app: Express) {
  // POST /api/reports/upload-daily-movement - Upload daily movement Excel file
  app.post("/api/reports/upload-daily-movement", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filePath = req.file.path;
      const data = await dailyMovementParser.parseExcel(filePath);

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      // TODO: Save data to database
      // await saveDailyMovementData(data);

      res.json({ success: true, message: 'Daily Movement Report uploaded successfully', recordsProcessed: data.length });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload daily movement report' });
    }
  });

  // POST /api/reports/upload-fuel-temperature - Upload fuel/temperature PDF file
  app.post("/api/reports/upload-fuel-temperature", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // For PDF files, we would need a PDF parser library
      // For now, just acknowledge the upload
      const filePath = req.file.path;

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      res.json({ success: true, message: 'Fuel/Temperature Report uploaded successfully' });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload fuel temperature report' });
    }
  });

  // GET /api/reports/generate-daily-movement/:date - Generate daily movement Excel report
  app.get("/api/reports/generate-daily-movement/:date", async (req, res) => {
    try {
      const { date } = req.params;
      console.log('🔍 DEBUG: Starting Excel generation for date:', date);
      
      const reportBuffer = await dailyMovementGenerator.generateExcel(date);
      
      console.log('🔍 DEBUG: Excel buffer generated, size:', reportBuffer?.length || 0);
      console.log('🔍 DEBUG: Buffer type:', typeof reportBuffer);
      console.log('🔍 DEBUG: Buffer is Buffer:', Buffer.isBuffer(reportBuffer));
      
      // Check if buffer is valid
      if (!reportBuffer || reportBuffer.length === 0) {
        console.error('🔍 ERROR: Generated Excel buffer is empty or null');
        res.status(500).json({ error: 'Generated Excel file is empty' });
        return;
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=daily_movement_${date}.xlsx`);
      res.setHeader('Content-Length', reportBuffer.length);
      
      console.log('🔍 DEBUG: Sending response with headers:', {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=daily_movement_${date}.xlsx`,
        'Content-Length': reportBuffer.length
      });
      
      res.send(reportBuffer);
      console.log('🔍 DEBUG: Response sent successfully');
    } catch (error) {
      console.error('🔍 ERROR: Generation error:', error);
      console.error('🔍 ERROR: Error stack:', error?.stack);
      res.status(500).json({ error: 'Failed to generate daily movement report' });
    }
  });

  // GET /api/reports/generate-fuel-temperature/:date - Generate fuel/temperature PDF report
  app.get("/api/reports/generate-fuel-temperature/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const reportBuffer = await fuelTemperatureGenerator.generatePdf(date);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=fuel_temperature_${date}.pdf`);
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

      // Get the same data used for Excel export to ensure consistency
      const movementData = await dailyMovementGenerator.getMovementData(date);
      const assetGroups = dailyMovementGenerator.groupByAssetForPreview(movementData);

      // Convert to preview format
      const previewData = {
        date,
        companyName: 'Africa MixEA - Teletrac Fleet Solutions - ADT Africa Limited',
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

      res.json(previewData);
    } catch (error) {
      console.error('Preview error:', error);
      res.status(500).json({ error: 'Failed to get daily movement preview' });
    }
  });

  // GET /api/reports/preview-fuel-temperature/:date - Get fuel/temperature preview data
  app.get("/api/reports/preview-fuel-temperature/:date", async (req, res) => {
    try {
      const { date } = req.params;

      // Mock preview data - replace with actual database queries
      const previewData = {
        date,
        reportTitle: 'Sensor / Fuel / Temperature',
        assetName: 'Howo Demo',
        fromDatetime: `${date} 00:00:00`,
        toDatetime: `${date} 13:43:00`,
        generatedOn: `${date} 13:42:57`,
        totalDistanceKm: 18.59,
        totalRefillsL: 556.80,
        totalDrainsL: 0.00,
        fuelUsedL: 31.20,
        fuelConsumptionKmL: 0.60,
        dataPoints: [], // Fuel graph data points
        refuelEvents: [
          {
            time: '08 Dec 2025 12:30:05',
            initialFuel: 544.80,
            finalFuel: 597.60,
            refilled: 52.80,
            location: 'Factory Close, Nitrida Industrial Area, Nakawa, Kampala Capital City, Kampala, Central Region, Uganda',
            latitude: 0.33567,
            longitude: 32.616355
          },
          {
            time: '08 Dec 2025 11:56:45',
            initialFuel: 40.80,
            finalFuel: 544.80,
            refilled: 504.00,
            location: 'Factory Close, Nitrida Industrial Area, Nakawa, Kampala Capital City, Kampala, Central Region, Uganda',
            latitude: 0.335818,
            longitude: 32.616806
          }
        ],
        rawSensorData: [
          { timestamp: `${date}T10:13:49Z`, fuel: 0, altitude: 0, odometer: 0, speed: 0, temperature: 0 },
          { timestamp: `${date}T10:33:23Z`, fuel: 0, altitude: 0, odometer: 0, speed: 0, temperature: 0 }
        ]
      };

      res.json(previewData);
    } catch (error) {
      console.error('Preview error:', error);
      res.status(500).json({ error: 'Failed to get fuel temperature preview' });
    }
  });
}