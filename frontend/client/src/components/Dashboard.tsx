import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "./PageHeader";
import { KPICard } from "./KPICard";
import { NotificationCard } from "./NotificationCard";
import { PredictiveAlert } from "./PredictiveAlert";
import { AssetList } from "./AssetList";
import { FuelOrb } from "./FuelOrb";
import { GlassCard } from "./GlassCard";
import { OptimizationCard } from "./OptimizationCard";
import { Truck, Fuel, DollarSign, Zap, Clock, TrendingUp, Activity, MapPin, Lightbulb, Shield, CheckCircle, AlertTriangle, DropletIcon, AlertOctagon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FilterControls } from "./FilterControls";
// Dynamic import for asset to avoid TypeScript module resolution issues
const dashboardImage = new URL('../../attached_assets/image_1758968057026.png', import.meta.url).href;
import { CountUpAnimation, CountUpCurrency, CountUpPercentage } from "./CountUpAnimation";
import { useGlobalFilter } from "./GlobalFilterContext";

interface DashboardProps {
  selectedVehicle?: string;
  pageId?: string;
}

export function Dashboard({ selectedVehicle, pageId }: DashboardProps) {
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [efficiencyUnit, setEfficiencyUnit] = useState<"L/Hr" | "L/100km">("L/Hr");
  const [animationTrigger, setAnimationTrigger] = useState(false);
  const { state: filterState } = useGlobalFilter();

  // Fetch dashboard KPIs from API
  const { data: kpis, isLoading: kpisLoading, error: kpisError } = useQuery({
    queryKey: ["/api/dashboard/kpis"],
    queryFn: async () => {
      const response = await fetch('http://localhost:5000/api/dashboard/kpis');
      if (!response.ok) {
        throw new Error('Failed to fetch KPIs');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  console.log('KPIs data:', kpis);
  console.log('KPIs loading:', kpisLoading);
  console.log('KPIs error:', kpisError);

  // Fuel Intelligence Dashboard Metrics (fallback to mock data if API fails)
  const dashboardMetrics = kpis ? {
    fleetHealthScore: 87.0, // Mock for now
    totalFuelUsed: kpis.totalFuelUsed || 0,
    totalDistance: kpis.totalDistance || 0,
    avgEfficiency: 12.3, // Mock
    totalAssets: kpis.totalVehicles || 0,
    activeAssets: kpis.activeVehicles || 0,
    totalFuelCost: Math.round((kpis.totalFuelUsed || 0) * filterState.fuelCostPerLiter),
    estimatedLoss: 53020.8, // Mock
    potentialSavings: 38174.4, // Mock
    reliabilityScore: 94 // Mock
  } : {
    fleetHealthScore: 87.0,
    totalFuelUsed: 2456,
    totalDistance: 18432,
    avgEfficiency: 12.3,
    totalAssets: 42,
    activeAssets: 38,
    totalFuelCost: Math.round(2456 * filterState.fuelCostPerLiter),
    estimatedLoss: 53020.8,
    potentialSavings: 38174.4,
    reliabilityScore: 94
  };

  // todo: remove mock data - predictive alert
  const predictiveAlert = {
    id: "alert-1",
    title: "Potential Fuel System Issue",
    detail: "Vehicle ABC-123 showing irregular consumption patterns. Possible fuel system degradation.",
    confidence: 87,
    type: "maintenance" as const,
    actionRequired: true
  };

  // todo: remove mock data - notifications
  const notifications = [
    {
      id: "1",
      type: "theft" as const,
      title: "Potential Fuel Theft Detected",
      message: "Vehicle ABC-123 shows unusual fuel level drop during parking",
      time: "2 min ago",
      severity: "high" as const
    },
    {
      id: "2",
      type: "refill" as const,
      title: "Fuel Refill Completed",
      message: "Vehicle XYZ-789 refueled 45L at Central Station",
      time: "15 min ago",
      severity: "low" as const
    },
    {
      id: "3",
      type: "alert" as const,
      title: "Route Deviation Alert",
      message: "Vehicle DEF-456 deviated from planned route",
      time: "1 hour ago",
      severity: "medium" as const
    }
  ];

  // Optimization Opportunities - Apple/Tesla inspired
  const optimizationOpportunities = [
    {
      assetId: "SEM-12346",
      inefficiencyDriver: "Excessive Idling",
      expectedSavings: 15200,
      severity: "High" as const,
      trend: 12
    },
    {
      assetId: "KCF-234M",
      inefficiencyDriver: "Route Optimization",
      expectedSavings: 8500,
      severity: "Medium" as const,
      trend: -3
    },
    {
      assetId: "NAR-567B",
      inefficiencyDriver: "Fuel System Check",
      expectedSavings: 22100,
      severity: "High" as const,
      trend: 18
    }
  ];

  const handleInvestigateNotification = (notification: any) => {
    console.log('Investigating notification:', notification.title);
    // todo: open investigation modal
  };

  const handleDeploySensor = () => {
    console.log('Deploy sensor triggered');
    // todo: deploy sensor workflow
  };

  const handleInvestigateAlert = (alert: any) => {
    console.log('Investigating alert:', alert.title);
    // todo: open investigation panel
  };

  const handleAssetClick = (asset: any) => {
    console.log('Asset clicked:', asset.name);
    setSelectedAsset(asset);
    // todo: show asset details
  };

  // Calculate additional metrics for professional dashboard
  const totalEngineHours = 1247;
  const estimatedOperatingCost = dashboardMetrics.totalFuelCost * 1.2; // Operating cost includes fuel + maintenance
  const sevenDayDistanceTrend = [15200, 16800, 14900, 18100, 17600, 19200, 18432]; // Last 7 days distance
  const systemROI = 15; // System ROI percentage
  
  // New KPI metrics for Task 8
  const totalRefills = kpis?.totalRefills || 0; // Total refill events
  const fuelThefts = kpis?.totalThefts || 0; // Total fuel theft incidents
  
  // Fetch chart data from API
  const { data: fuelConsumptionData } = useQuery({
    queryKey: ["/api/charts/fuel-consumption", filterState.selectedVehicles, filterState.dateRange],
    queryFn: async () => {
      const response = await fetch('http://localhost:5000/api/charts/fuel-consumption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleIds: filterState.selectedVehicles,
          dateRange: filterState.dateRange
        })
      });
      if (!response.ok) {
        throw new Error('Failed to fetch fuel consumption data');
      }
      return response.json();
    },
    staleTime: 30 * 1000,
  });

  const { data: performanceData } = useQuery({
    queryKey: ["/api/charts/performance-metrics", filterState.selectedVehicles, filterState.dateRange],
    queryFn: async () => {
      const response = await fetch('http://localhost:5000/api/charts/performance-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleIds: filterState.selectedVehicles,
          dateRange: filterState.dateRange
        })
      });
      if (!response.ok) {
        throw new Error('Failed to fetch performance data');
      }
      return response.json();
    },
    staleTime: 30 * 1000,
  });

  // Data for charts - use API data if available, otherwise mock
  const getFilteredChartData = () => {
    if (fuelConsumptionData && performanceData) {
      // Use API data
      return fuelConsumptionData.map((item: any, index: number) => ({
        day: item.day,
        consumption: item.consumption,
        distance: performanceData[index]?.distance || item.distance,
        target: 85
      }));
    }

    // Generate last 7 days as dates
    const generateLast7Days = () => {
      const dates = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      }
      return dates;
    };

    const last7Days = generateLast7Days();

    // Mock data that would typically come from API based on global filters
    const baseConsumptionData = [
      { day: last7Days[0], consumption: 285, distance: 145, target: 85 },
      { day: last7Days[1], consumption: 320, distance: 162, target: 85 },
      { day: last7Days[2], consumption: 298, distance: 138, target: 85 },
      { day: last7Days[3], consumption: 342, distance: 178, target: 85 },
      { day: last7Days[4], consumption: 315, distance: 152, target: 85 },
      { day: last7Days[5], consumption: 289, distance: 134, target: 85 },
      { day: last7Days[6], consumption: 306, distance: 156, target: 85 }
    ];

    // Filter data based on selected vehicles and date range
    // In real implementation, this would call API with filter parameters
    return filterState.selectedVehicles.length > 0
      ? baseConsumptionData.map(d => ({
          ...d,
          consumption: Math.round(d.consumption * (0.8 + (filterState.selectedVehicles.length / 10)))
        }))
      : baseConsumptionData;
  };

  const chartData = getFilteredChartData();
  
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
    target: {
      label: "Target",
      color: "hsl(var(--muted-foreground))",
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

  // Asset-specific fuel level time series data
  const getAssetFuelData = (assetId: string) => {
    const fuelDataMap: Record<string, number[]> = {
      "KCF-234M": [85, 78, 72, 68, 45, 42, 38, 65, 88, 82, 79, 73, 69, 65], // Asset with refills
      "NAR-567B": [92, 88, 84, 79, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30], // Steady decline
      "SEM-346L": [78, 76, 74, 72, 90, 87, 84, 81, 78, 75, 72, 69, 66, 63], // One refill
    };
    return fuelDataMap[assetId] || [60, 58, 55, 52, 48, 45, 42, 39, 36, 33, 30, 27, 24, 21]; // Default pattern
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header with Filter Controls */}
      <div className="flex items-center justify-between">
        <PageHeader pageId={pageId || "dashboard"} />
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
          <div className="text-xs text-muted-foreground">Est. Cost: {filterState.currency} <CountUpAnimation value={estimatedOperatingCost} trigger={animationTrigger} /></div>
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
            <div className="flex items-end gap-px h-3 opacity-60">
              {sevenDayDistanceTrend.slice(-5).map((value, index) => {
                const height = ((value / Math.max(...sevenDayDistanceTrend)) * 100);
                return (
                  <div 
                    key={index} 
                    className="w-1 bg-primary rounded-sm" 
                    style={{ height: `${Math.max(height, 15)}%` }}
                  />
                );
              })}
            </div>
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
          <div className="text-xs text-muted-foreground">Cost: {filterState.currency} <CountUpAnimation value={dashboardMetrics.totalFuelCost} trigger={animationTrigger} /></div>
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
          <div className="text-xs text-primary font-medium">This Month</div>
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
          <div className="text-xs text-destructive font-medium">Detected</div>
        </GlassCard>
      </div>
      {/* Refill events overlay */}
                 <div className="absolute top-4 right-4 flex items-center gap-2 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full border border-border/30">
                   <div className="w-2 h-2 bg-primary rounded-full"></div>
                   <span>2 Refill Events</span>
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
                  formatter={(value: any) => [`<strong>${value} L</strong>`, "Daily Fuel Used"]}
                  labelFormatter={(label) => `<strong>${label}</strong>`}
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
                  domain={[0, 200]}
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  data-testid="performance-y-axis"
                />
                <Tooltip
                  content={<ChartTooltipContent />}
                  formatter={(value: any) => [`<strong>${value} km</strong>`, "Daily Distance Traveled"]}
                  labelFormatter={(label) => `<strong>${label}</strong>`}
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
                data={chartData.map(d => ({
                  day: d.day,
                  value: efficiencyUnit === "L/Hr" 
                    ? Number((d.consumption / 25).toFixed(1)) // Mock efficiency calculation
                    : Number((d.consumption / 20).toFixed(1))
                }))} 
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

      {/* Row 3: Proactive Intelligence and Action Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
      </div>


      {/* Selected Asset Detail */}
      {selectedAsset && (
        <div className="mt-6">
          <GlassCard className="p-6">
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0">
                <FuelOrb 
                  percentage={selectedAsset?.fuelLevel || 50} 
                  estimatedTime="2h 45min"
                  size="lg"
                />
              </div>
              
              <div className="flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">{selectedAsset?.name ?? "Unknown Asset"}</h2>
                    <p className="text-muted-foreground">{selectedAsset?.plate ?? "N/A"}</p>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Status</div>
                    <div className="text-lg font-semibold text-chart-2 capitalize">
                      {selectedAsset?.status ?? "Unknown"}
                    </div>
                  </div>
                </div>
                
                {/* High-Density KPI Strip for Focused Asset */}
                <div className="mt-6 border-t border-border/30 pt-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Asset Performance Metrics</h3>
                  
                  {/* High-Density KPI Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
                    <div className="p-3 rounded-lg bg-card/10 border border-border/20 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Working Days</div>
                      <div className="text-lg font-bold text-primary">{selectedAsset.workingDays || 23}</div>
                      <div className="text-xs text-muted-foreground">This month</div>
                    </div>
                    
                    <div className="p-3 rounded-lg bg-card/10 border border-border/20 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Total Fuel Used</div>
                      <div className="text-lg font-bold text-accent-foreground">{selectedAsset.totalFuelUsed || 342}L</div>
                      <div className="text-xs text-muted-foreground">This month</div>
                    </div>
                    
                    <div className="p-3 rounded-lg bg-card/10 border border-border/20 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Distance Covered</div>
                      <div className="text-lg font-bold text-primary">{selectedAsset.distanceCovered || 2847}km</div>
                      <div className="text-xs text-muted-foreground">This month</div>
                    </div>
                    
                    <div className="p-3 rounded-lg bg-card/10 border border-border/20 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Engine Hours</div>
                      <div className="text-lg font-bold text-accent-foreground">{selectedAsset.engineHours || 156.4}hr</div>
                      <div className="text-xs text-muted-foreground">Running time</div>
                    </div>
                    
                    <div className="p-3 rounded-lg bg-card/10 border border-border/20 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Refill Count</div>
                      <div className="text-lg font-bold text-accent-foreground">{selectedAsset.refillCount || 4}</div>
                      <div className="text-xs text-muted-foreground">This month</div>
                    </div>
                  </div>
                </div>

                {/* Fuel Levels VS Date and Time Graph - Primary Visual Element */}
                <div className="border-t border-border/30 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-foreground">Fuel Levels Over Time</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Last 7 Days</span>
                    </div>
                  </div>
                  
                  {/* Time Series Graph */}
                  <div className="h-64 relative bg-card/10 rounded-lg border border-border/20 p-4">
                    {/* Y-axis labels */}
                    <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-muted-foreground py-4">
                      <span>100%</span>
                      <span>80%</span>
                      <span>60%</span>
                      <span>40%</span>
                      <span>20%</span>
                      <span>0%</span>
                    </div>
                    
                    {/* Graph area */}
                    <div className="ml-8 h-full relative">
                      {/* Data points */}
                      {(() => {
                        const fuelData = getAssetFuelData(selectedAsset?.assetId || selectedAsset?.name || "default");
                        const width = 100;
                        const segments = fuelData.length - 1;
                        
                        return fuelData.map((level, index) => {
                          const x = (index / segments) * width;
                          const y = 100 - level;
                          return (
                            <circle
                              key={index}
                              cx={`${x}%`}
                              cy={`${y}%`}
                              r="4"
                              fill="hsl(var(--primary))"
                              stroke="hsl(var(--background))"
                              strokeWidth="2"
                              className="hover:r-6 transition-all duration-200"
                            />
                          );
                        });
                      })()}
                    </div>
                    {/* X-axis labels */}
                    <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-muted-foreground pt-2">
                      <span>Mon</span>
                      <span>Tue</span>
                      <span>Wed</span>
                      <span>Thu</span>
                      <span>Fri</span>
                      <span>Sat</span>
                      <span>Sun</span>
                    </div>
                  </div>
                  
                  {/* Enhenced Asset Performance Analytics */}
                  <div className="space-y-6 mt-6">
                    {/* Performance Metrics Dashboard */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg bg-card/20 border border-border/30 hover-elevate motion-premium" data-testid="avg-daily-usage">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-foreground">Avg. Daily Usage</div>
                          <Activity className="w-4 h-4 text-primary" />
                        </div>
                        <CountUpPercentage value={12.3} trigger={animationTrigger} className="text-2xl font-bold text-primary" />
                        <div className="text-xs text-primary font-medium mt-1">+2.1% vs last week</div>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-card/20 border border-border/30 hover-elevate motion-premium" data-testid="next-refill-due">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-foreground">Next Refill Due</div>
                          <Clock className="w-4 h-4 text-accent-foreground" />
                        </div>
                        <div className="text-2xl font-bold text-accent-foreground">Tomorrow</div>
                        <div className="text-xs text-muted-foreground mt-1">Predicted: 18:30</div>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-card/20 border border-border/30 hover-elevate motion-premium" data-testid="fuel-efficiency">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-foreground">Fuel Efficiency</div>
                          <TrendingUp className="w-4 h-4 text-primary" />
                        </div>
                        <div className="text-2xl font-bold text-primary">Excellent</div>
                        <div className="text-xs text-primary font-medium mt-1">98% optimal</div>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-card/20 border border-border/30 hover-elevate motion-premium" data-testid="maintenance-score">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-foreground">Health Score</div>
                          <Shield className="w-4 h-4 text-accent-foreground" />
                        </div>
                        <CountUpPercentage value={94.2} trigger={animationTrigger} className="text-2xl font-bold text-accent-foreground" />
                        <div className="text-xs text-accent-foreground font-medium mt-1">Excellent condition</div>
                      </div>
                    </div>
                    
                    {/* Maintenance Alerts & Predictive Insights */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Maintenance Alert System */}
                      <GlassCard className="p-6" data-testid="maintenance-alerts">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-semibold text-foreground">Maintenance Alerts</h4>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                            <span className="text-xs text-muted-foreground">All Systems Optimal</span>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20" data-testid="engine-status">
                            <div className="flex items-center gap-3">
                              <CheckCircle className="w-5 h-5 text-primary" />
                              <div>
                                <div className="font-medium text-foreground">Engine Performance</div>
                                <div className="text-xs text-muted-foreground">Last service: 15 days ago</div>
                              </div>
                            </div>
                            <div className="text-primary font-medium">Optimal</div>
                          </div>
                          
                          <div className="flex items-center justify-between p-3 rounded-lg bg-accent/10 border border-accent/20" data-testid="filter-status">
                            <div className="flex items-center gap-3">
                              <AlertTriangle className="w-5 h-5 text-accent-foreground" />
                              <div>
                                <div className="font-medium text-foreground">Air Filter</div>
                                <div className="text-xs text-muted-foreground">Next service due: 12 days</div>
                              </div>
                            </div>
                            <div className="text-accent-foreground font-medium">Due Soon</div>
                          </div>
                          
                          <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20" data-testid="tires-status">
                            <div className="flex items-center gap-3">
                              <CheckCircle className="w-5 h-5 text-accent-foreground" />
                              <div>
                                <div className="font-medium text-foreground">Tire Condition</div>
                                <div className="text-xs text-muted-foreground">Pressure optimal: 98%</div>
                              </div>
                            </div>
                            <div className="text-accent-foreground font-medium">Good</div>
                          </div>
                        </div>
                      </GlassCard>
                      
                      {/* Predictive Insights Panel */}
                      <GlassCard className="p-6" data-testid="predictive-insights">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-semibold text-foreground">Predictive Insights</h4>
                          <div className="flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-primary" />
                            <span className="text-xs text-muted-foreground">AI-Powered</span>
                          </div>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20" data-testid="fuel-optimization">
                            <div className="flex items-start gap-3">
                              <Fuel className="w-5 h-5 text-primary mt-0.5" />
                              <div className="flex-1">
                                <div className="font-medium text-foreground mb-1">Fuel Optimization</div>
                                <div className="text-sm text-muted-foreground mb-2">
                                  Route efficiency can be improved by 8% with alternative paths during peak hours.
                                </div>
                                <div className="text-xs text-primary font-medium">Potential savings: 45L/week</div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="p-4 rounded-lg bg-accent/10 border border-accent/20" data-testid="usage-pattern">
                            <div className="flex items-start gap-3">
                              <TrendingUp className="w-5 h-5 text-accent-foreground mt-0.5" />
                              <div className="flex-1">
                                <div className="font-medium text-foreground mb-1">Usage Pattern Alert</div>
                                <div className="text-sm text-muted-foreground mb-2">
                                  Increased idle time detected. Consider optimizing work schedules.
                                </div>
                                <div className="text-xs text-accent-foreground font-medium">Impact: -12% efficiency</div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20" data-testid="performance-trend">
                            <div className="flex items-start gap-3">
                              <Activity className="w-5 h-5 text-primary mt-0.5" />
                              <div className="flex-1">
                                <div className="font-medium text-foreground mb-1">Performance Trend</div>
                                <div className="text-sm text-muted-foreground mb-2">
                                  Vehicle shows consistent optimal performance over the last 30 days.
                                </div>
                                <div className="text-xs text-primary font-medium">Reliability: 96.8%</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </GlassCard>
                    </div>
                    
                    {/* Individual Vehicle Analytics */}
                    <GlassCard className="p-6" data-testid="vehicle-analytics">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="text-lg font-semibold text-foreground">Detailed Vehicle Analytics</h4>
                        <div className="flex items-center gap-4">
                          <div className="text-sm text-muted-foreground">
                            Vehicle ID: <span className="font-mono text-foreground">{selectedAsset?.name || "FLEET-001"}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Last Update: <span className="text-foreground">2 min ago</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="text-center" data-testid="total-distance">
                          <div className="text-sm text-muted-foreground mb-2">Total Distance</div>
                          <CountUpAnimation value={28847} suffix=" km" trigger={animationTrigger} className="text-2xl font-bold text-foreground" />
                          <div className="text-xs text-primary font-medium mt-1">This month: +1,247 km</div>
                        </div>
                        
                        <div className="text-center" data-testid="fuel-consumed">
                          <div className="text-sm text-muted-foreground mb-2">Fuel Consumed</div>
                          <CountUpAnimation value={3420} suffix=" L" trigger={animationTrigger} className="text-2xl font-bold text-foreground" />
                          <div className="text-xs text-primary font-medium mt-1">Efficiency: +5.2%</div>
                        </div>
                        
                        <div className="text-center" data-testid="engine-hours">
                          <div className="text-sm text-muted-foreground mb-2">Engine Hours</div>
                          <CountUpAnimation value={156.4} decimals={1} suffix=" hrs" trigger={animationTrigger} className="text-2xl font-bold text-foreground" />
                          <div className="text-xs text-accent-foreground font-medium mt-1">Optimal usage</div>
                        </div>
                        
                        <div className="text-center" data-testid="cost-efficiency">
                          <div className="text-sm text-muted-foreground mb-2">Cost Efficiency</div>
                          <CountUpCurrency value={1250} trigger={animationTrigger} className="text-2xl font-bold text-foreground" />
                          <div className="text-xs text-primary font-medium mt-1">Saved: UGX 320</div>
                        </div>
                      </div>
                    </GlassCard>
                  </div>
                </div>
              </div>
            </div>
            </GlassCard>
        </div>
      )}
    </div>
  );
}