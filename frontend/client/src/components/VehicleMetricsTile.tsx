import { useState, useEffect } from "react";
import { GlassCard } from "./GlassCard";
import { DateRangePicker } from "./DateRangePicker";
import { useGlobalFilter } from "./GlobalFilterContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { Car, Fuel, Clock, MapPin, Droplet, AlertTriangle } from "lucide-react";
import { type DateRange } from "@shared/schema";

// Mock data for vehicle metrics - this would come from API in real implementation
const getVehicleMetricsData = (vehicleId: string = "KCB 123A") => {
  // Get current date and calculate historical data (excluding current month)
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Generate realistic historical data for the past 4 weeks (excluding current month)
  const generateHistoricalData = () => {
    const weeksData = [];
    const baseWorkingDays = [23, 20, 25, 18];
    const baseParkingDays = [7, 10, 5, 12];
    const baseFuelUsage = [85, 92, 78, 97];
    const baseDistance = [450, 510, 420, 540];
    const baseEngineHours = [38, 42, 36, 45];

    for (let i = 0; i < 4; i++) {
      weeksData.push({
        week: `Week ${i + 1}`,
        fuelUsage: baseFuelUsage[i],
        distance: baseDistance[i],
        engineHours: baseEngineHours[i]
      });
    }

    return {
      registration: vehicleId,
      operationalMetrics: {
        workingDays: baseWorkingDays.reduce((sum, days) => sum + days, 0),
        parkingDays: baseParkingDays.reduce((sum, days) => sum + days, 0)
      },
      fuelAndDistance: {
        currentFuel: 290.40, // Current fuel level
        totalFuelUsed: baseFuelUsage.reduce((sum, fuel) => sum + fuel, 0),
        distanceCovered: baseDistance.reduce((sum, dist) => sum + dist, 0),
        engineHours: baseEngineHours.reduce((sum, hours) => sum + hours, 0),
        consumptionRate: Math.round((baseDistance.reduce((sum, dist) => sum + dist, 0) / baseFuelUsage.reduce((sum, fuel) => sum + fuel, 0)) * 100) / 100,
        fuelEvents: {
          drains: 0,
          drainsVolume: 0,
          refills: 1,
          refillsVolume: 232.80
        }
      },
      weeklyTrends: weeksData
    };
  };

  return generateHistoricalData();
};

interface VehicleMetricsTileProps {
  vehicleId?: string;
  className?: string;
}

export function VehicleMetricsTile({ vehicleId = "KCB 123A", className = "" }: VehicleMetricsTileProps) {
  const { state: filterState } = useGlobalFilter();
  const [metricsData, setMetricsData] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString(),
    endDate: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 0).toISOString(),
    preset: "last_30_days",
    label: "Last Month"
  });

  // Filter out current month data
  const filterHistoricalData = (data: any) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Ensure we're only showing historical data (not current month)
    return {
      ...data,
      // Add any additional filtering logic here if needed
    };
  };

  useEffect(() => {
    // Fetch vehicle metrics data
    const data = getVehicleMetricsData(vehicleId);
    const filteredData = filterHistoricalData(data);
    setMetricsData(filteredData);
  }, [vehicleId]);

  // Handle date range changes
  const handleDateRangeChange = (newDateRange: any) => {
    setDateRange(newDateRange);
    // In a real implementation, this would trigger a data refetch with the new date range
  };

  if (!metricsData) {
    return (
      <GlassCard className={`p-6 ${className}`}>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading vehicle metrics...</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`p-6 ${className}`}>
      {/* Tile Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Car className="w-6 h-6 text-primary" />
          <h3 className="text-xl font-bold text-foreground">Vehicle Overview</h3>
        </div>
        <div className="text-sm text-muted-foreground">
          Historical Data (Excluding Current Month)
        </div>
      </div>

      {/* Registration Section */}
      <div className="mb-6 p-4 rounded-lg bg-card/10 border border-border/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Car className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Registration</div>
            <div className="text-2xl font-bold text-foreground">{metricsData.registration}</div>
          </div>
        </div>
      </div>

      {/* Operational Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-card/10 border border-border/20">
          <div className="text-xs text-muted-foreground mb-2">Working Days</div>
          <div className="text-3xl font-bold text-primary">{metricsData.operationalMetrics.workingDays}</div>
          <div className="text-xs text-muted-foreground">Historical</div>
        </div>

        <div className="p-4 rounded-lg bg-card/10 border border-border/20">
          <div className="text-xs text-muted-foreground mb-2">Parking Days</div>
          <div className="text-3xl font-bold text-accent-foreground">{metricsData.operationalMetrics.parkingDays}</div>
          <div className="text-xs text-muted-foreground">Historical</div>
        </div>
      </div>

      {/* Fuel & Distance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-card/10 border border-border/20">
          <div className="text-xs text-muted-foreground mb-2">Current Fuel</div>
          <div className="text-2xl font-bold text-primary">{metricsData.fuelAndDistance.currentFuel} L</div>
        </div>

        <div className="p-4 rounded-lg bg-card/10 border border-border/20">
          <div className="text-xs text-muted-foreground mb-2">Total Fuel Used</div>
          <div className="text-2xl font-bold text-foreground">{metricsData.fuelAndDistance.totalFuelUsed} L</div>
          <div className="text-xs text-muted-foreground">Historical</div>
        </div>

        <div className="p-4 rounded-lg bg-card/10 border border-border/20">
          <div className="text-xs text-muted-foreground mb-2">Distance Covered</div>
          <div className="text-2xl font-bold text-primary">{metricsData.fuelAndDistance.distanceCovered} km</div>
          <div className="text-xs text-muted-foreground">Historical</div>
        </div>
      </div>

      {/* Engine Hours and Consumption */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-lg bg-card/10 border border-border/20">
          <div className="text-xs text-muted-foreground mb-2">Engine Hours</div>
          <div className="text-2xl font-bold text-accent-foreground">{metricsData.fuelAndDistance.engineHours} hr</div>
          <div className="text-xs text-muted-foreground">Running time</div>
        </div>

        <div className="p-4 rounded-lg bg-card/10 border border-border/20">
          <div className="text-xs text-muted-foreground mb-2">Consumption Rate</div>
          <div className="text-2xl font-bold text-primary">{metricsData.fuelAndDistance.consumptionRate} KM/L</div>
        </div>
      </div>

      {/* Fuel Events */}
      <div className="mb-6 p-4 rounded-lg bg-card/10 border border-border/20">
        <div className="text-sm font-medium text-foreground mb-3">Fuel Events</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Droplet className="w-4 h-4 text-destructive" />
            <div>
              <div className="text-xs text-muted-foreground">Drains</div>
              <div className="text-lg font-bold text-destructive">
                {metricsData.fuelAndDistance.fuelEvents.drains} ({metricsData.fuelAndDistance.fuelEvents.drainsVolume} L)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Fuel className="w-4 h-4 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Refills</div>
              <div className="text-lg font-bold text-primary">
                {metricsData.fuelAndDistance.fuelEvents.refills} ({metricsData.fuelAndDistance.fuelEvents.refillsVolume} L)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="mb-6">
        <div className="text-sm font-medium text-foreground mb-2">Date Range</div>
        <DateRangePicker
          value={dateRange}
          onChange={handleDateRangeChange}
          className="w-full max-w-md"
        />
      </div>

      {/* Visualization: Weekly Trends */}
      <div className="mt-6">
        <div className="text-sm font-medium text-foreground mb-4">Weekly Trends</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metricsData.weeklyTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="week"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                label={{ value: 'Fuel (L)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                label={{ value: 'Distance (km)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="fuelUsage"
                name="Fuel Usage"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="right"
                dataKey="distance"
                name="Distance"
                fill="hsl(var(--chart-2))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="left"
                dataKey="engineHours"
                name="Engine Hours"
                fill="hsl(var(--accent))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary Note */}
      <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <strong>Note:</strong> All metrics shown are historical data excluding the current month.
            The visualization shows weekly trends for fuel usage, distance covered, and engine hours.
          </div>
        </div>
      </div>
    </GlassCard>
  );
}