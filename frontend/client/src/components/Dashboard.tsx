import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "./PageHeader";
import { GlassCard } from "./GlassCard";
import { Fuel, Clock, MapPin, Shield, DropletIcon, AlertOctagon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { FilterControls } from "./FilterControls";
import { CountUpAnimation } from "./CountUpAnimation";
import { useGlobalFilter } from "./GlobalFilterContext";
import { api, globalFilterToApiParams } from "../lib/api";

interface DashboardProps {
  selectedVehicle?: string;
  pageId?: string;
}

export function Dashboard({ selectedVehicle, pageId }: DashboardProps) {
  const [efficiencyUnit, setEfficiencyUnit] = useState<"L/Hr" | "L/100km">("L/Hr");
  const [animationTrigger, setAnimationTrigger] = useState(false);
  const { state: filterState } = useGlobalFilter();

  const filterParams = globalFilterToApiParams(filterState);

  // Fetch dashboard KPIs from API with filters
  const { data: kpis } = useQuery({
    queryKey: ["/api/dashboard/kpis", filterState.selectedVehicles, filterState.dateRange],
    queryFn: async () => api.getDashboardKPIs(filterParams),
    staleTime: 30 * 1000, // 30 seconds
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["/api/vehicles"],
    queryFn: () => api.getVehicles(),
    staleTime: 30 * 1000,
  });

  const { data: fuelEventsData = [] } = useQuery({
    queryKey: ["/api/fuel-events", filterState.selectedVehicles, filterState.dateRange],
    queryFn: async () => api.getFuelEvents(filterParams),
    staleTime: 30 * 1000,
  });

  const { data: dailyMetricsData = [] } = useQuery({
    queryKey: ["/api/daily-metrics", filterState.selectedVehicles, filterState.dateRange],
    queryFn: async () => api.getDailyMetrics(filterParams),
    staleTime: 30 * 1000,
  });

  const filteredVehicles = filterState.selectedVehicles.length > 0
    ? vehicles.filter((vehicle: any) => filterState.selectedVehicles.includes(vehicle.id))
    : vehicles;

  const aggregatedDailyMetrics = useMemo(
    () =>
      dailyMetricsData.reduce(
        (acc: { fuel: number; distance: number; engineHours: number }, metric: any) => ({
          fuel: acc.fuel + Number(metric.totalFuelConsumed || 0),
          distance: acc.distance + Number(metric.totalDistanceTraveled || 0),
          engineHours: acc.engineHours + Number(metric.totalEngineHours || 0),
        }),
        { fuel: 0, distance: 0, engineHours: 0 }
      ),
    [dailyMetricsData]
  );

  const totalFuelUsed = Math.max(0, aggregatedDailyMetrics.fuel);
  const totalDistance = Math.max(0, aggregatedDailyMetrics.distance);
  const totalEngineHours = Math.max(0, aggregatedDailyMetrics.engineHours);
  const totalAssets = (kpis?.totalVehicles ?? filteredVehicles.length);
  const activeAssets = (kpis?.activeVehicles ?? filteredVehicles.filter((v: any) => v.status === "Active").length);
  const totalFuelCost = useMemo(() => {
    return Math.round(totalFuelUsed * (filterState.fuelCostPerLiter || 0));
  }, [totalFuelUsed, filterState.fuelCostPerLiter]);
  const avgEfficiency = totalDistance > 0 ? (totalFuelUsed / totalDistance) * 100 : 0;

  const reliabilityLookup: Record<string, number> = {
    Excellent: 95,
    Good: 80,
    Warning: 60,
    Critical: 40,
  };

  const reliabilityScore = filteredVehicles.length > 0
    ? Math.round(
        filteredVehicles.reduce((sum: number, v: any) => sum + (reliabilityLookup[v.systemReliability] ?? 70), 0) /
          filteredVehicles.length
      )
    : 0;

  // Fuel Intelligence Dashboard Metrics (fully derived from database data)
  const dashboardMetrics = {
    fleetHealthScore: reliabilityScore,
    totalFuelUsed,
    totalDistance,
    avgEfficiency,
    totalAssets,
    activeAssets,
    totalFuelCost,
    reliabilityScore,
  };

  const estimatedOperatingCost = dashboardMetrics.totalFuelCost * 1.2; // Operating cost includes fuel + maintenance

  const totalRefills = kpis?.totalRefills ?? 0; // Total refill events
  const fuelThefts = kpis?.totalThefts ?? 0; // Total fuel theft incidents

  function transformDailyMetricsToChartData(dailyMetrics: any[]) {
    if (!dailyMetrics || dailyMetrics.length === 0) {
      return [];
    }

    const groupedByDate = new Map<string, { consumption: number; distance: number; engineHours: number }>();

    dailyMetrics.forEach((metric) => {
      if (!metric?.metricDate) return;
      const metricDate = new Date(metric.metricDate);
      if (Number.isNaN(metricDate.getTime())) return;

      const dateKey = metricDate.toISOString().split("T")[0];
      const current = groupedByDate.get(dateKey) || { consumption: 0, distance: 0, engineHours: 0 };

      groupedByDate.set(dateKey, {
        consumption: current.consumption + Number(metric.totalFuelConsumed || 0),
        distance: current.distance + Number(metric.totalDistanceTraveled || 0),
        engineHours: current.engineHours + Number(metric.totalEngineHours || 0),
      });
    });

    return Array.from(groupedByDate.entries())
      .map(([dateKey, values]) => ({
        dateKey,
        day: new Date(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        consumption: values.consumption,
        distance: values.distance,
        engineHours: values.engineHours,
      }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }

  const chartData = useMemo(() => transformDailyMetricsToChartData(dailyMetricsData), [dailyMetricsData]);

  const efficiencyChartData = useMemo(() => {
    return chartData.map((entry) => {
      const value = efficiencyUnit === "L/Hr"
        ? entry.engineHours > 0
          ? entry.consumption / entry.engineHours
          : 0
        : entry.distance > 0
          ? (entry.consumption / entry.distance) * 100
          : 0;

      return { day: entry.day, value: Number(value.toFixed(1)) };
    });
  }, [chartData, efficiencyUnit]);

  const distanceTrend = chartData.map((entry) => entry.distance);
  const distanceTrendMax = distanceTrend.length ? Math.max(...distanceTrend) : 0;

  const fuelByVehicle = useMemo(() => {
    const totals = new Map<string, number>();
    dailyMetricsData.forEach((metric: any) => {
      if (!metric?.vehicleId) return;
      totals.set(metric.vehicleId, (totals.get(metric.vehicleId) || 0) + Number(metric.totalFuelConsumed || 0));
    });

    return vehicles
      .map((vehicle: any) => ({
        id: vehicle.id,
        label: vehicle.vehiclePlate || vehicle.assetId || vehicle.id,
        fuelUsed: totals.get(vehicle.id) || 0,
        status: vehicle.status,
      }))
      .filter((entry: { fuelUsed: number }) => entry.fuelUsed > 0);
  }, [dailyMetricsData, vehicles]);

  const topVehiclesByFuel = useMemo(() => {
    return [...fuelByVehicle].sort((a, b) => b.fuelUsed - a.fuelUsed).slice(0, 5);
  }, [fuelByVehicle]);

  const maxFuelUsed = topVehiclesByFuel.length
    ? Math.max(...topVehiclesByFuel.map((entry) => entry.fuelUsed))
    : 0;

  const recentFuelEvents = useMemo(() => {
    return [...fuelEventsData]
      .sort((a: any, b: any) => new Date(b.eventTimestamp).getTime() - new Date(a.eventTimestamp).getTime())
      .slice(0, 6);
  }, [fuelEventsData]);

  const formatEventTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
  };

  const vehicleLabelById = useMemo(() => {
    return new Map(
      vehicles.map((vehicle: any) => [
        vehicle.id,
        vehicle.vehiclePlate || vehicle.assetId || vehicle.id,
      ])
    );
  }, [vehicles]);
  
  // Chart configurations for proper theming and accessibility
  const consumptionChartConfig: ChartConfig = {
    consumption: {
      label: "Daily Consumption",
      color: "hsl(var(--primary))",
    },
  };
  
  const performanceChartConfig: ChartConfig = {
    distance: {
      label: "Distance Traveled",
      color: "hsl(var(--chart-2))",
    },
  };
  
  const efficiencyChartConfig: ChartConfig = {
    value: {
      label: efficiencyUnit,
      color: "hsl(var(--primary))",
    },
  };
  
  // Trigger count-up animations on filter changes or initial load
  useEffect(() => {
    setAnimationTrigger(prev => !prev); // Toggle to re-trigger animations
  }, [filterState.selectedVehicles, filterState.dateRange, filterState.lastUpdated]);
  
  // Initial animation trigger on component mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationTrigger(true);
    }, 500); // Slight delay for better UX
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header with Filter Controls */}
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <PageHeader pageId={pageId || "dashboard"} className="mb-0" />
        <FilterControls />
      </div>

      {/* Redesigned KPI Cards Section - 6 Cards with Count-up Animations */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Engine Hours - Enhanced */}
        <GlassCard className="p-4 hover-elevate motion-premium" data-testid="kpi-engine-hours">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Engine Hours</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mb-2">
            <CountUpAnimation value={totalEngineHours} suffix=" Hr" trigger={animationTrigger} />
          </div>
          <div className="text-xs text-muted-foreground">
            Est. Cost: {filterState.currency}{" "}
            <CountUpAnimation value={estimatedOperatingCost} trigger={animationTrigger} />
          </div>
        </GlassCard>

        {/* Total Distance - Enhanced with Trend */}
        <GlassCard className="p-4 hover-elevate motion-premium" data-testid="kpi-total-distance">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Distance</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mb-2">
            <CountUpAnimation value={dashboardMetrics.totalDistance} suffix=" Km" trigger={animationTrigger} />
          </div>
          <div className="flex items-center gap-2">
            {distanceTrend.length > 0 ? (
              <div className="flex items-end gap-px h-3 opacity-60">
                {distanceTrend.slice(-5).map((value, index) => {
                  const height = distanceTrendMax ? (value / distanceTrendMax) * 100 : 0;
                  return (
                    <div
                      key={index}
                      className="w-1 bg-primary rounded-sm"
                      style={{ height: `${Math.max(height, 15)}%` }}
                    />
                  );
                })}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No trend data</span>
            )}
            <span className="text-xs text-muted-foreground">Trend</span>
          </div>
        </GlassCard>

        {/* Total Fuel Used - Enhanced */}
        <GlassCard className="p-4 hover-elevate motion-premium" data-testid="kpi-fuel-used">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Fuel Used</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mb-2">
            <CountUpAnimation value={dashboardMetrics.totalFuelUsed} suffix=" L" trigger={animationTrigger} />
          </div>
          <div className="text-xs text-muted-foreground">
            Cost: {filterState.currency}{" "}
            <CountUpAnimation value={dashboardMetrics.totalFuelCost} trigger={animationTrigger} />
          </div>
        </GlassCard>

        {/* Total Vehicles Monitored - Enhanced */}
        <GlassCard className="p-4 hover-elevate motion-premium" data-testid="kpi-total-vehicles-monitored">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Total Vehicles Monitored</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mb-2">
            <CountUpAnimation value={dashboardMetrics.totalAssets} trigger={animationTrigger} />
          </div>
          <div className="text-xs text-primary font-medium">Active Fleet</div>
        </GlassCard>

        {/* NEW: Total Refills */}
        <GlassCard className="p-4 hover-elevate motion-premium" data-testid="kpi-total-refills">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DropletIcon className="w-5 h-5 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Total Refills</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mb-2">
            <CountUpAnimation value={totalRefills} trigger={animationTrigger} />
          </div>
          <div className="text-xs text-primary font-medium">Filtered range</div>
        </GlassCard>

        {/* NEW: Fuel Thefts */}
        <GlassCard className="p-4 hover-elevate motion-premium" data-testid="kpi-fuel-thefts">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Fuel Thefts</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-destructive mb-2">
            <CountUpAnimation value={fuelThefts} trigger={animationTrigger} />
          </div>
          <div className="text-xs text-destructive font-medium">Filtered range</div>
        </GlassCard>
      </div>

      {/* NEW: Row 2 - 3-Column Visualization Layout */}
      <div className="mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1: Daily Fuel Consumption */}
          <GlassCard className="p-6 hover-elevate motion-premium" data-testid="daily-fuel-consumption-chart">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-semibold text-foreground">Daily Fuel Used</h3>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <span className="text-xs text-muted-foreground">Liters</span>
              </div>
            </div>
            
            <ChartContainer config={consumptionChartConfig} className="h-48">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="day" 
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  data-testid="consumption-x-axis"
                />
                <YAxis 
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  data-testid="consumption-y-axis"
                />
                <Tooltip
                  content={<ChartTooltipContent />}
                  formatter={(value: any) => (
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-muted-foreground">Fuel Used</span>
                      <span className="font-mono font-medium">{Number(value).toLocaleString()} L</span>
                    </div>
                  )}
                />
                <Bar 
                  dataKey="consumption" 
                  fill="var(--color-consumption)"
                  radius={[2, 2, 0, 0]}
                  data-testid="consumption-bars"
                />
              </BarChart>
            </ChartContainer>
            
          </GlassCard>

          {/* Column 2: Daily Distance Traveled */}
          <GlassCard className="p-6 hover-elevate motion-premium" data-testid="daily-performance-chart">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Daily Distance Traveled</h3>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <span className="text-xs text-muted-foreground">Kilometers</span>
              </div>
            </div>
            
            <ChartContainer config={performanceChartConfig} className="h-48">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="day" 
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  data-testid="performance-x-axis"
                />
                <YAxis
                  domain={[0, (dataMax: number) => Math.max(dataMax, 10)]}
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  data-testid="performance-y-axis"
                />
                <Tooltip
                  content={<ChartTooltipContent />}
                  formatter={(value: any) => (
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-muted-foreground">Distance</span>
                      <span className="font-mono font-medium">{Number(value).toLocaleString()} km</span>
                    </div>
                  )}
                />
                <Bar
                  dataKey="distance"
                  fill="var(--color-distance)"
                  radius={[2, 2, 0, 0]}
                  data-testid="distance-bars"
                />
              </BarChart>
            </ChartContainer>
            
          </GlassCard>

          {/* Column 3: Fleet Efficiency Trends */}
          <GlassCard className="p-6 hover-elevate motion-premium" data-testid="fleet-efficiency-chart">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Fleet Efficiency Trends</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Unit:</span>
                <Select value={efficiencyUnit} onValueChange={(value) => setEfficiencyUnit(value as "L/Hr" | "L/100km")}>
                  <SelectTrigger className="w-20 h-7 bg-card/40 backdrop-blur-sm border-border/30 text-xs" data-testid="select-efficiency-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L/Hr">L/Hr</SelectItem>
                    <SelectItem value="L/100km">L/100km</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <ChartContainer config={efficiencyChartConfig} className="h-48">
              <BarChart 
                data={efficiencyChartData} 
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="day" 
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  data-testid="efficiency-x-axis"
                />
                <YAxis 
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  data-testid="efficiency-y-axis"
                />
                <Tooltip 
                  content={<ChartTooltipContent />}
                  formatter={(value) => [`${value} ${efficiencyUnit}`, "Efficiency"]}
                />
                <Bar 
                  dataKey="value" 
                  fill="var(--color-value)"
                  radius={[2, 2, 0, 0]}
                  data-testid="efficiency-trend-bars"
                />
              </BarChart>
            </ChartContainer>
            
          </GlassCard>
        </div>
      </div>

      {/* Row 3: Advanced Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top Vehicles by Fuel Use */}
        <GlassCard className="p-6" data-testid="top-vehicles-fuel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Top Vehicles by Fuel Use</h3>
            <div className="text-xs text-muted-foreground">Filtered range</div>
          </div>

          {topVehiclesByFuel.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground border border-border/30 rounded-lg">
              No fuel usage data yet.
            </div>
          ) : (
            <div className="space-y-4">
              {topVehiclesByFuel.map((vehicle) => {
                const percent = maxFuelUsed ? Math.round((vehicle.fuelUsed / maxFuelUsed) * 100) : 0;
                return (
                  <div key={vehicle.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-medium text-foreground">{vehicle.label}</div>
                      <div className="text-muted-foreground">{Math.round(vehicle.fuelUsed)} L</div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(percent, 5)}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">Status: {vehicle.status || "Unknown"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* Recent Fuel Events */}
        <GlassCard className="p-6" data-testid="recent-fuel-events">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Recent Fuel Events</h3>
            <div className="text-xs text-muted-foreground">Latest activity</div>
          </div>

          {recentFuelEvents.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground border border-border/30 rounded-lg">
              No recent fuel events yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentFuelEvents.map((event: any) => {
                const vehicleLabel = vehicleLabelById.get(event.vehicleId) || "Vehicle";
                return (
                  <div key={event.id} className="flex items-start justify-between gap-4 border border-border/20 rounded-lg p-3">
                    <div>
                      <div className="text-sm font-medium text-foreground capitalize">
                        {event.eventType || "event"} · {vehicleLabel}
                      </div>
                      <div className="text-xs text-muted-foreground">{event.location || "Unknown location"}</div>
                      <div className="text-xs text-muted-foreground">{formatEventTime(event.eventTimestamp)}</div>
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {Math.abs(Number(event.volumeLiters || 0)).toFixed(1)} L
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

    </div>
  );
}
