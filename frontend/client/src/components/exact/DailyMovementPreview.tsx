import React from 'react';
import { DB_TIMEZONE_LABELS } from '@/lib/dateTime';

// --- Interfaces (Updated to match template) ---
interface DailyMovementData {
  asset_description: string;
  registration_number: string;
  asset_id: number;
  site_name: string;
  departure_date: string; // DD/MM/YYYY
  driver: string;
  departure_time: string; // HH:MM:SS
  departed_from: string;
  driving_time: string; // hh:mm:ss
  standing_time: string; // hh:mm:ss
  distance_km: number;
  max_speed_kmh: number;
  arrival_time: string; // HH:MM:SS
  arrived_at: string;
  next_departure: string; // DD/MM/YYYY HH:MM or empty
  standing_time_at_location: string; // hh:mm:ss
  fuel_used_litres: number | null;
}

interface AssetGroup {
  asset: Omit<DailyMovementData, 'departure_date' | 'driver' | 'departure_time' | 'departed_from' | 'driving_time' | 'standing_time' | 'distance_km' | 'max_speed_kmh' | 'arrival_time' | 'arrived_at' | 'next_departure' | 'standing_time_at_location' | 'fuel_used_litres'>;
  trips: DailyMovementData[];
  totals: {
    drivingTime: string;
    distance: number;
    standingTime: string;
  };
  averages: {
    drivingTime: string;
    distance: number;
    standingTime: string;
  };
}

interface DailyMovementPreviewProps {
  date: string; // YYYY-MM-DD
  data: AssetGroup[];
  companyName?: string;
}

// Helper function to convert standing time from various formats to HH:MM:SS
const formatStandingTime = (standingTime: string): string => {
  // If already in HH:MM:SS format, return as-is
  if (/^\d{2}:\d{2}:\d{2}$/.test(standingTime)) {
    return standingTime;
  }
  
  // Handle formats like "00027AR" (27 seconds)
  // or "00637-42" (637 minutes and 42 seconds)
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
  
  // Default fallback
  return standingTime;
};

// Helper function for conditional formatting based on standing time
const getStandingTimeColor = (standingTime: string): string => {
  // Parse time string to seconds
  const formattedTime = formatStandingTime(standingTime);
  const [hours, minutes, seconds] = formattedTime.split(':').map(Number);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  
  // 5-10 minutes: Amber (#ffc000)
  if (totalSeconds >= 300 && totalSeconds <= 600) {
    return '#ffc000';
  }
  // > 10 minutes: Red (#ff0000)
  if (totalSeconds > 600) {
    return '#ff0000';
  }
  // < 5 minutes: Green (#00b050)
  return '#00b050';
};

export function DailyMovementPreview({ date, data, companyName }: DailyMovementPreviewProps) {
  const displayCompanyName = companyName || "Africa MixEA - Teletrac Fleet Solutions - ADT Africa Limited";
  const formattedDate = new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).replace(/\//g, '/'); // Ensure dd/mm/yyyy

  return (
    <div className="excel-container" style={{
      fontFamily: 'Calibri, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      margin: 0,
      padding: 0,
      backgroundColor: 'white',
      color: '#000',
      width: '100%',
      maxWidth: '1400px'
    }}>
      
      {/* --- REPORT HEADER SECTION --- */}
      <div className="report-header-block" style={{
        display: 'grid',
        gridTemplateColumns: '3fr 1fr',
        padding: '10px 8px'
      }}>
        <div className="title-section">
          <h1 style={{ fontSize: '18pt', fontWeight: 'bold', margin: 0, lineHeight: 1.1 }}>
            Daily Movement Report
          </h1>
          <p style={{ fontSize: '10pt', margin: 0, fontWeight: 'normal' }}>
            {displayCompanyName}
          </p>
        </div>
        <div className="logo-section" style={{ textAlign: 'right', alignSelf: 'center' }}>
          <p style={{ fontSize: '10pt', margin: 0, padding: 0 }}>unity</p>
          <span style={{ color: '#00b050', fontSize: '18pt', fontWeight: 600 }}>
            On-Road IoT
          </span>
        </div>
      </div>
      
      <div className="date-row" style={{ fontSize: '10pt', margin: '5px 8px 10px 8px', fontStyle: 'italic', paddingBottom: '5px' }}>
        From {formattedDate} 00:00 To {formattedDate} 23:59
      </div>

      {/* --- MAIN TABLE --- */}
      <table id="movement-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', border: '1px solid #ccc' }}>
        <thead>
          {/* Empty thead as in template */}
        </thead>
        <tbody>
          {data.map((group, groupIdx) => {
            const { asset, trips, totals, averages } = group;
            
            return (
              <React.Fragment key={groupIdx}>
                {/* --- ASSET GROUP HEADER --- */}
                <tr className="asset-group-label group-start-border">
                  <td style={{ backgroundColor: '#D9F5EF', fontWeight: 'bold', padding: '4px 8px', borderTop: '1px solid #ccc', borderBottom: 'none', width: '18%' }}>
                    Registration Number
                  </td>
                  <td colSpan={11} style={{ backgroundColor: '#D9F5EF', fontWeight: 'bold', padding: '4px 8px', borderTop: '1px solid #ccc', borderBottom: 'none' }}>
                    {asset.registration_number}
                  </td>
                </tr>
                <tr className="asset-group-label group-end">
                  <td style={{ backgroundColor: '#D9F5EF', fontWeight: 'bold', padding: '4px 8px', borderBottom: '1px solid #ccc' }}>
                    Site Name
                  </td>
                  <td colSpan={11} style={{ backgroundColor: '#D9F5EF', fontWeight: 'bold', padding: '4px 8px', borderBottom: '1px solid #ccc' }}>
                    {asset.site_name}
                  </td>
                </tr>

                {/* --- COLUMN HEADERS --- */}
                <tr className="data-column-header">
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'left', border: '1px solid #ccc', padding: '5px 8px' }}>Driver</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'left', border: '1px solid #ccc', padding: '5px 8px' }}>Departure Date</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'left', border: '1px solid #ccc', padding: '5px 8px' }}>Departure Time (DB {DB_TIMEZONE_LABELS.webhookLocal})</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'left', border: '1px solid #ccc', padding: '5px 8px' }}>Departed From</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'right', border: '1px solid #ccc', padding: '5px 8px' }}>Driving Time<br/>(hh:mm:ss)</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'right', border: '1px solid #ccc', padding: '5px 8px' }}>Distance<br/>(km)</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'right', border: '1px solid #ccc', padding: '5px 8px' }}>Max Speed<br/>(km/h)</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'left', border: '1px solid #ccc', padding: '5px 8px' }}>Arrival Time (DB {DB_TIMEZONE_LABELS.webhookLocal})</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'left', border: '1px solid #ccc', padding: '5px 8px' }}>Arrived At</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'left', border: '1px solid #ccc', padding: '5px 8px' }}>Next Departure (DB {DB_TIMEZONE_LABELS.webhookLocal})</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'center', border: '1px solid #ccc', padding: '5px 8px' }}>Standing Time at Location<br/>(hh:mm:ss)</th>
                  <th style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', textAlign: 'right', border: '1px solid #ccc', padding: '5px 8px' }}>Fuel Used (Litres)</th>
                </tr>

                {/* --- DATA ROWS --- */}
                {trips.map((trip, tripIdx) => {
                  const standingTimeColor = getStandingTimeColor(trip.standing_time_at_location);
                  const isOrange = standingTimeColor === '#ffc000';
                  const isRed = standingTimeColor === '#ff0000';
                  const isGreen = standingTimeColor === '#00b050';
                  
                  return (
                    <tr key={tripIdx} className="data-row">
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'left' }}>{trip.driver}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'left' }}>{trip.departure_date}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'left' }}>{trip.departure_time}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'left' }}>{trip.departed_from}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>{trip.driving_time}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>{trip.distance_km.toFixed(2)}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>{trip.max_speed_kmh}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'left' }}>{trip.arrival_time}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'left' }}>{trip.arrived_at}</td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'left' }}>{trip.next_departure}</td>
                      <td 
                        style={{
                          border: '1px solid #ccc', 
                          padding: '5px 8px', 
                          textAlign: 'center',
                          backgroundColor: standingTimeColor,
                          fontWeight: 'bold',
                          color: isRed ? 'white' : 'inherit'
                        }}
                      >
                        {formatStandingTime(trip.standing_time_at_location)}
                      </td>
                      <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>
                        {trip.fuel_used_litres !== null ? trip.fuel_used_litres.toFixed(2) : ''}
                      </td>
                    </tr>
                  );
                })}

                {/* --- TOTALS ROW --- */}
                <tr className="summary-row">
                  <td colSpan={4} style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2', border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>Totals</td>
                  <td style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2', border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>{totals.drivingTime}</td>
                  <td style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2', border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>{totals.distance.toFixed(2)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}></td>
                  <td colSpan={3} style={{ border: '1px solid #ccc', padding: '5px 8px' }}></td>
                  <td style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2', border: '1px solid #ccc', padding: '5px 8px', textAlign: 'center' }}>{totals.standingTime}</td>
                  <td style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2', border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}></td>
                </tr>

                {/* --- AVERAGES ROW --- */}
                <tr className="summary-row">
                  <td colSpan={4} style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2', border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>Averages</td>
                  <td style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2', border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>{averages.drivingTime}</td>
                  <td style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2', border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right' }}>{averages.distance.toFixed(2)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}></td>
                  <td colSpan={3} style={{ border: '1px solid #ccc', padding: '5px 8px' }}></td>
                  <td style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2', border: '1px solid #ccc', padding: '5px 8px', textAlign: 'center' }}>{averages.standingTime}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}></td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          {/* Empty tfoot to maintain structure */}
        </tfoot>
      </table>
    </div>
  );
}


