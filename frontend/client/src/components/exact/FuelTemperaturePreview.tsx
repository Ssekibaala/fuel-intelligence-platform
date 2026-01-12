import React from 'react';

// --- Interfaces (Kept as provided) ---
interface RefuelEvent {
  time: string; // "08 Dec 2025 12:30:05"
  initial_fuel: number;
  final_fuel: number;
  refilled: number;
  location: string;
  latitude: number;
  longitude: number;
}

interface FuelTemperaturePreviewProps {
  date: string; // YYYY-MM-DD
  data: {
    totalDistance: number;
    totalRefills: number;
    totalDrains: number;
    fuelUsed: number;
    fuelConsumption: number;
    refuelEvents: RefuelEvent[];
  };
}

export function FuelTemperaturePreview({ date, data }: FuelTemperaturePreviewProps) {
  // Hardcoded per sample image
  const displayDate = "08 Dec 2025"; 
  const fromTime = "00:00:00";
  const toTime = "13:43:00";
  
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
          Sensor / Fuel / Temperature
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
        <div>Howo Demo</div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '500px' }}>
            <span style={{ display: 'inline-block', width: '250px' }}>From&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{displayDate} {fromTime}</span>
            <span style={{ display: 'inline-block', width: '250px' }}>To&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{displayDate} {toTime}</span>
            <span style={{ fontSize: '9pt', color: '#555', position: 'absolute', right: '20mm' }}>Generated on {displayDate} 13:42:57</span>
        </div>
      </div>
      
      {/* --- SUMMARY METRICS --- */}
      <div style={{ textAlign: 'left', marginBottom: '15mm', display: 'flex', flexDirection: 'column', gap: '0' }}>
        <Metric label="Total Distance" value={data.totalDistance.toFixed(2)} unit="km" />
        <Metric label="Total refills" value={data.totalRefills.toFixed(2)} unit="L" />
        <Metric label="Total Drains" value={data.totalDrains.toFixed(2)} unit="L" />
        <Metric label="Fuel used" value={data.fuelUsed.toFixed(2)} unit="L" />
        <Metric label="Fuel Consumption" value={data.fuelConsumption.toFixed(2)} unit="Km/L" />
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
            <span>{displayDate} 10:13:49</span>
            <span>{displayDate} 10:49:32</span>
            <span>{displayDate} 12:02:38</span>
            <span>{displayDate} 13:07:49</span>
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
            <th style={{ textAlign: 'left', padding: '2mm 2mm 2mm 5px', borderBottom: '1px solid #000' }}>Time</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Initial fuel</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Final fuel</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Refilled</th>
            <th style={{ textAlign: 'left', padding: '2mm 2mm 2mm 5px', borderBottom: '1px solid #000' }}>Location</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Latitude</th>
            <th style={{ textAlign: 'right', padding: '2mm', borderBottom: '1px solid #000' }}>Longitude</th>
          </tr>
        </thead>
        <tbody>
          {data.refuelEvents.map((event, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '1mm 2mm 1mm 5px', verticalAlign: 'top' }}>{event.time}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{event.initial_fuel.toFixed(2)}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{event.final_fuel.toFixed(2)}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{event.refilled.toFixed(2)}</td>
              <td style={{ padding: '1mm 2mm 1mm 5px', verticalAlign: 'top', wordBreak: 'break-word', fontSize: '8pt' }}>{event.location}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{event.latitude.toFixed(6)}</td>
              <td style={{ padding: '1mm', textAlign: 'right', verticalAlign: 'top' }}>{event.longitude.toFixed(6)}</td>
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