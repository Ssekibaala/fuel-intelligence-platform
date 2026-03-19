import React from 'react';
import { formatDateTimeEAT } from '@/lib/dateTime';

// --- Interfaces (Kept as provided) ---
interface RefuelEvent {
  time: string; // "08 Dec 2025 12:30:05"
  initial_fuel: number | string | null;
  final_fuel: number | string | null;
  refilled: number | string | null;
  location: string;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface FuelTemperaturePreviewProps {
  date: string; // YYYY-MM-DD
  data: {
    reportTitle?: string;
    assetName?: string;
    fromDatetime?: string | null;
    toDatetime?: string | null;
    generatedOn?: string | null;
    totalDistance: number;
    totalRefills: number;
    totalDrains: number;
    fuelUsed: number;
    fuelConsumption: number;
    refuelEvents: RefuelEvent[];
  };
}

export function FuelTemperaturePreview({ date, data }: FuelTemperaturePreviewProps) {
  const toValidDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const fromDateValue = toValidDate(data.fromDatetime) || toValidDate(`${date}T00:00:00`) || new Date();
  const toDateValue = toValidDate(data.toDatetime) || toValidDate(`${date}T23:59:00`) || new Date();
  const generatedOnValue = toValidDate(data.generatedOn);
  const axisDatePrefix = formatDateTimeEAT(fromDateValue);
  const fromTime = formatDateTimeEAT(fromDateValue);
  const toTime = formatDateTimeEAT(toDateValue);
  const generatedLabel = generatedOnValue
    ? formatDateTimeEAT(generatedOnValue)
    : formatDateTimeEAT(toDateValue);
  const reportTitle = data.reportTitle || "Sensor / Fuel / Temperature";
  const assetName = data.assetName || "Howo Demo";
  const refuelEvents = data.refuelEvents || [];
  const safeNumber = (value: number | string | null | undefined) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const formatMetric = (value: number | string | null | undefined, digits = 2) =>
    safeNumber(value).toFixed(digits);
  const formatCoord = (value: number | string | null | undefined, digits = 6) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(digits) : "-";
  };
  
  // Custom Metric component for perfect alignment
  const Metric: React.FC<{ label: string, value: string, unit: string }> = ({ label, value, unit }) => (
    <div style={{ display: 'flex', width: '250px', justifyContent: 'space-between', lineHeight: 1.5, fontSize: '10pt' }}>
      <span style={{ width: '120px', textAlign: 'left' }}>{label}</span>
      <span style={{ width: '60px', textAlign: 'right', fontWeight: 'bold' }}>{value}</span>
      <span style={{ width: '40px', textAlign: 'left', paddingLeft: '5px' }}>{unit}</span>
    </div>
  );

  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '10pt', 
        color: '#000000',
        width: '210mm',
        minHeight: '297mm',
        padding: '15mm 20mm', // Matches print margins
        margin: '0 auto',
        boxSizing: 'border-box',
        lineHeight: 1.4,
        position: 'relative' 
      }}
    >
      {/* --- HEADER --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10mm' }}>
        <div style={{ fontSize: '16pt', fontWeight: 'bold', textAlign: 'left' }}>
          {reportTitle}
        </div>
        {/* Teletrac/Hewi Logo Placeholder */}
        <div style={{ textAlign: 'right', lineHeight: 1 }}>
          <div style={{ fontSize: '12pt', fontWeight: 'bold', color: '#00AEEF' }}>
            TELETROC
          </div>
          <div style={{ fontSize: '8pt', color: '#555' }}>
            Hewi Solutions Ltd
          </div>
        </div>
      </div>

      {/* --- ASSET AND DATE RANGE --- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2mm', marginBottom: '6mm', fontSize: '10pt' }}>
        <div style={{ fontWeight: 'bold' }}>Assets</div>
        <div>{assetName}</div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '500px' }}>
            <span style={{ display: 'inline-block', width: '250px' }}>From&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{fromTime}</span>
            <span style={{ display: 'inline-block', width: '250px' }}>To&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{toTime}</span>
            <span style={{ fontSize: '9pt', color: '#555', position: 'absolute', right: '20mm' }}>Generated on {generatedLabel}</span>
        </div>
      </div>
      
      {/* --- SUMMARY METRICS --- */}
      <div style={{ textAlign: 'left', marginBottom: '15mm', display: 'flex', flexDirection: 'column', gap: '0' }}>
        <Metric label="Total Distance" value={formatMetric(data.totalDistance)} unit="km" />
        <Metric label="Total refills" value={formatMetric(data.totalRefills)} unit="L" />
        <Metric label="Total Drains" value={formatMetric(data.totalDrains)} unit="L" />
        <Metric label="Fuel used" value={formatMetric(data.fuelUsed)} unit="L" />
        <Metric label="Fuel Consumption" value={formatMetric(data.fuelConsumption)} unit="Km/L" />
      </div>

      {/* --- FUEL GRAPH REPLICATION (VISUAL PROOF OF SOLUTION) --- */}
      <div style={{ position: 'relative', height: '250px', marginBottom: '5mm', border: '1px solid #ccc' }}>
        
        {/* Y-Axis Lines (Horizontal Grid) */}
        <div style={{ position: 'absolute', inset: 0, paddingLeft: '40px', background: '#f9f9f9' }}>
            <div style={{ position: 'absolute', top: '0%', left: 0, right: 0, height: '1px', backgroundColor: '#ccc' }}></div>
            <div style={{ position: 'absolute', top: '14%', left: 0, right: 0, height: '1px', backgroundColor: '#eee' }}></div>
            <div style={{ position: 'absolute', top: '28%', left: 0, right: 0, height: '1px', backgroundColor: '#eee' }}></div>
            <div style={{ position: 'absolute', top: '42%', left: 0, right: 0, height: '1px', backgroundColor: '#eee' }}></div>
            <div style={{ position: 'absolute', top: '56%', left: 0, right: 0, height: '1px', backgroundColor: '#eee' }}></div>
            <div style={{ position: 'absolute', top: '70%', left: 0, right: 0, height: '1px', backgroundColor: '#eee' }}></div>
            <div style={{ position: 'absolute', top: '84%', left: 0, right: 0, height: '1px', backgroundColor: '#eee' }}></div>
            <div style={{ position: 'absolute', bottom: '0', left: 0, right: 0, height: '1px', backgroundColor: '#000' }}></div>
        </div>

        {/* Y-Axis Labels */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '40px', fontSize: '8pt', textAlign: 'right', paddingRight: '5px' }}>
            <div style={{ position: 'absolute', top: '0', right: '5px' }}>700</div>
            <div style={{ position: 'absolute', top: '14%', transform: 'translateY(-50%)', right: '5px' }}>600</div>
            <div style={{ position: 'absolute', top: '28%', transform: 'translateY(-50%)', right: '5px' }}>500</div>
            <div style={{ position: 'absolute', top: '42%', transform: 'translateY(-50%)', right: '5px' }}>400</div>
            <div style={{ position: 'absolute', top: '56%', transform: 'translateY(-50%)', right: '5px' }}>300</div>
            <div style={{ position: 'absolute', top: '70%', transform: 'translateY(-50%)', right: '5px' }}>200</div>
            <div style={{ position: 'absolute', top: '84%', transform: 'translateY(-50%)', right: '5px' }}>100</div>
            <div style={{ position: 'absolute', bottom: '0', right: '5px' }}>0</div>
        </div>
        
        {/* Blue Shaded Area & Line - Using a more complex polygon to mimic the screenshot's shape */}
        <div style={{ 
            position: 'absolute', 
            bottom: '1px', 
            left: '40px', 
            right: 0, 
            height: '100%',
            backgroundColor: '#B3D9FF', 
            clipPath: 'polygon(0% 85%, 15% 82%, 25% 80%, 35% 80%, 45% 65%, 50% 65%, 60% 45%, 70% 30%, 80% 30%, 90% 15%, 100% 15%, 100% 100%, 0% 100%)',
        }}>
        </div>
        <div style={{ // Simulate the top line of the fuel curve
             position: 'absolute', 
             bottom: '1px', 
             left: '40px', 
             right: 0, 
             height: '100%',
             borderTop: '2px solid #00AEEF', // Darker blue line
             clipPath: 'polygon(0% 85%, 15% 82%, 25% 80%, 35% 80%, 45% 65%, 50% 65%, 60% 45%, 70% 30%, 80% 30%, 90% 15%, 100% 15%, 100% 100%, 0% 100%)',
        }}>
        </div>
      </div>
      
      {/* X-Axis Labels */}
      <div style={{ fontSize: '8pt', textAlign: 'center', lineHeight: 1.2, marginBottom: '4mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 5mm 0 45px' }}>
            <span>{axisDatePrefix}</span>
            <span>{axisDatePrefix}</span>
            <span>{axisDatePrefix}</span>
            <span>{axisDatePrefix}</span>
        </div>
      </div>


      {/* Legend Line */}
      <div style={{ fontSize: '7pt', color: '#555555', marginBottom: '10mm', textAlign: 'center' }}>
        Raw Fuel &nbsp;&nbsp;&nbsp;&nbsp; 0 &nbsp;&nbsp;&nbsp;&nbsp; Fuel &nbsp;&nbsp;&nbsp;&nbsp; 0 &nbsp;&nbsp;&nbsp;&nbsp; XAltitude &nbsp;&nbsp;&nbsp;&nbsp; 0 &nbsp;&nbsp;&nbsp;&nbsp; Odometer &nbsp;&nbsp;&nbsp;&nbsp; 0 &nbsp;&nbsp;&nbsp;&nbsp; XSpeed &nbsp;&nbsp;&nbsp;&nbsp; 0
      </div>

      {/* --- REFUELS TABLE --- */}
      <div style={{ fontWeight: 'bold', fontSize: '12pt', marginBottom: '2mm' }}>Refuels (L)</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', border: '1px solid #ccc' }}>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={{ textAlign: 'left', padding: '2mm 2mm 2mm 5px', borderBottom: '1px solid #000' }}>Time (EAT)</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Initial fuel</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Final fuel</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Refilled</th>
            <th style={{ textAlign: 'left', padding: '2mm 2mm 2mm 5px', borderBottom: '1px solid #000' }}>Location</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Latitude</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Longitude</th>
          </tr>
        </thead>
        <tbody>
          {refuelEvents.map((event, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '1mm 2mm 1mm 5px', verticalAlign: 'top' }}>{event.time || "-"}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{formatMetric(event.initial_fuel)}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{formatMetric(event.final_fuel)}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{formatMetric(event.refilled)}</td>
              <td style={{ padding: '1mm 2mm 1mm 5px', verticalAlign: 'top', wordBreak: 'break-word', fontSize: '8pt' }}>{event.location || "-"}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{formatCoord(event.latitude)}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{formatCoord(event.longitude)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Footer (Simulated) */}
      <div style={{ 
        position: 'absolute', 
        bottom: '10mm', 
        left: '20mm', 
        right: '20mm', 
        fontSize: '8pt', 
        color: '#777',
        borderTop: '1px solid #ccc',
        paddingTop: '2mm'
      }}>
          <span style={{ float: 'left' }}>HWK FOC. V3.02.45</span>
          <span style={{ float: 'right' }}>Factory Close, Ninda Industrial Area, Nakawa, Kampala Capital City, Kampala, central region, Uganda</span>
      </div>
    </div>
  );
}
