import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Search, Filter, Download, AlertTriangle, Fuel, MapPin, Route, SortAsc, SortDesc } from "lucide-react";
import { useGlobalFilter } from "./GlobalFilterContext";
import { api, globalFilterToApiParams } from "../lib/api";
import { DB_TIMEZONE_LABELS, formatDateTimeEAT } from "../lib/dateTime";

type TabKey = "drains" | "thefts" | "trips";

type DrainRow = {
  id: string;
  asset: string;
  date: string;
  volume: number;
  location: string;
  status: string;
  type: string;
  eventTime: string;
};

type TripRow = {
  id: string;
  asset: string;
  date: string;
  distance: number;
  fuelUsed: number;
  engineHours: number;
  efficiency: number;
  location: string;
  status: string;
};

interface DataVisualizationTablesProps {
  initialTab?: TabKey;
}

const toDate = (value: unknown) => {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: unknown) => {
  const parsed = toDate(value);
  return parsed ? formatDateTimeEAT(parsed) : "Unknown";
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getStatusColor = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes("theft")) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (normalized.includes("leak") || normalized.includes("drain")) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (normalized.includes("recorded") || normalized.includes("refill")) return "bg-green-500/20 text-green-400 border-green-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
};

export function DataVisualizationTables({ initialTab = "drains" }: DataVisualizationTablesProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { state: filterState } = useGlobalFilter();

  const filters = globalFilterToApiParams(filterState);
  const refreshIntervalMs = filterState.refreshInterval > 0 ? filterState.refreshInterval : false;

  const { data: vehiclesData = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ["/api/vehicles", filters.clientId, filters.vehicleIds],
    queryFn: () =>
      api.getVehicles({
        clientId: filters.clientId,
      }),
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: false,
  });

  const { data: fuelEventsData = [], isLoading: fuelEventsLoading } = useQuery({
    queryKey: ["/api/fuel-events", filters.clientId, filters.vehicleIds, filters.startDate, filters.endDate],
    queryFn: () => api.getFuelEvents(filters),
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: false,
  });

  const { data: dailyMetricsData = [], isLoading: dailyMetricsLoading } = useQuery({
    queryKey: ["/api/daily-metrics", filters.clientId, filters.vehicleIds, filters.startDate, filters.endDate],
    queryFn: () => api.getDailyMetrics(filters),
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: false,
  });

  const isLoading = vehiclesLoading || fuelEventsLoading || dailyMetricsLoading;

  const vehicleLabelById = useMemo(() => {
    return new Map(
      (vehiclesData as any[]).map((vehicle: any) => [
        vehicle.id,
        vehicle.vehiclePlate || vehicle.assetId || vehicle.id,
      ])
    );
  }, [vehiclesData]);

  const latestLocationByVehicle = useMemo(() => {
    const map = new Map<string, { timestamp: number; location: string }>();

    (fuelEventsData as any[]).forEach((event: any) => {
      const vehicleId = String(event?.vehicleId || "");
      if (!vehicleId) return;

      const time = toDate(event?.eventTimestamp)?.getTime() || 0;
      const location = String(event?.location || "").trim();
      if (!location) return;

      const current = map.get(vehicleId);
      if (!current || time > current.timestamp) {
        map.set(vehicleId, { timestamp: time, location });
      }
    });

    return new Map(Array.from(map.entries()).map(([vehicleId, value]) => [vehicleId, value.location]));
  }, [fuelEventsData]);

  const drainsData = useMemo<DrainRow[]>(() => {
    return (fuelEventsData as any[])
      .filter((event: any) => {
        const type = String(event?.eventType || "").toLowerCase();
        return type === "drain" || type === "leak";
      })
      .map((event: any, index: number) => {
        const vehicleId = String(event?.vehicleId || "");
        const status = String(event?.eventType || "drain");
        return {
          id: String(event?.id || `${vehicleId}-drain-${index}`),
          asset: vehicleLabelById.get(vehicleId) || vehicleId || "Unknown",
          date: formatDate(event?.eventTimestamp),
          volume: Math.abs(toNumber(event?.volumeLiters)),
          location: String(event?.location || latestLocationByVehicle.get(vehicleId) || "Unknown"),
          status,
          type: status,
          eventTime: formatDate(event?.eventTimestamp),
        };
      });
  }, [fuelEventsData, vehicleLabelById, latestLocationByVehicle]);

  const theftsData = useMemo<DrainRow[]>(() => {
    return (fuelEventsData as any[])
      .filter((event: any) => String(event?.eventType || "").toLowerCase() === "theft")
      .map((event: any, index: number) => {
        const vehicleId = String(event?.vehicleId || "");
        return {
          id: String(event?.id || `${vehicleId}-theft-${index}`),
          asset: vehicleLabelById.get(vehicleId) || vehicleId || "Unknown",
          date: formatDate(event?.eventTimestamp),
          volume: Math.abs(toNumber(event?.volumeLiters)),
          location: String(event?.location || latestLocationByVehicle.get(vehicleId) || "Unknown"),
          status: "theft",
          type: "theft",
          eventTime: formatDate(event?.eventTimestamp),
        };
      });
  }, [fuelEventsData, vehicleLabelById, latestLocationByVehicle]);

  const tripsData = useMemo<TripRow[]>(() => {
    return (dailyMetricsData as any[]).map((metric: any, index: number) => {
      const vehicleId = String(metric?.vehicleId || "");
      const distance = toNumber(metric?.totalDistanceTraveled);
      const fuelUsed = toNumber(metric?.totalFuelConsumed);
      const engineHours = toNumber(metric?.totalEngineHours);
      const efficiency = fuelUsed > 0 ? distance / fuelUsed : 0;

      return {
        id: String(metric?.id || `${vehicleId}-trip-${index}`),
        asset: vehicleLabelById.get(vehicleId) || vehicleId || "Unknown",
        date: formatDate(metric?.metricDate),
        distance,
        fuelUsed,
        engineHours,
        efficiency,
        location: latestLocationByVehicle.get(vehicleId) || "Unknown",
        status: distance > 0 ? "recorded" : "idle",
      };
    });
  }, [dailyMetricsData, vehicleLabelById, latestLocationByVehicle]);

  const currentData = useMemo(() => {
    if (activeTab === "drains") return drainsData;
    if (activeTab === "thefts") return theftsData;
    return tripsData;
  }, [activeTab, drainsData, theftsData, tripsData]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(currentData.map((item: any) => String(item.status || "unknown"))));
  }, [currentData]);

  const processedData = useMemo(() => {
    let data = [...currentData] as any[];

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      data = data.filter((item) =>
        Object.values(item).some((value) => String(value).toLowerCase().includes(query))
      );
    }

    if (statusFilter !== "all") {
      data = data.filter((item) => String(item.status) === statusFilter);
    }

    if (sortField) {
      data.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }
        return sortDirection === "asc"
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });
    }

    return data;
  }, [currentData, searchTerm, statusFilter, sortField, sortDirection]);

  const chartData = useMemo(() => {
    const grouped = new Map<string, number>();
    processedData.forEach((item: any) => {
      const key = String(item.asset || "Unknown");
      const value = activeTab === "trips" ? toNumber(item.distance) : toNumber(item.volume);
      grouped.set(key, (grouped.get(key) || 0) + value);
    });

    return Array.from(grouped.entries())
      .map(([asset, value]) => ({ asset, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [processedData, activeTab]);

  const pieData = useMemo(() => {
    const statusCounts = processedData.reduce((acc, item: any) => {
      const key = String(item.status || "unknown");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusCounts).map(([name, value], index) => ({
      name,
      value,
      fill: ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"][index % 5],
    }));
  }, [processedData]);

  const heatmapLocations = useMemo(() => {
    return Array.from(new Set(processedData.map((item: any) => String(item.location || "Unknown")))).slice(0, 6);
  }, [processedData]);

  const heatmapRows = useMemo(() => {
    const assets = Array.from(new Set(processedData.map((item: any) => String(item.asset || "Unknown"))));
    return assets.map((asset) => {
      const cells = heatmapLocations.map((location) => {
        const total = processedData
          .filter((item: any) => item.asset === asset && item.location === location)
          .reduce((sum: number, item: any) => {
            const value = activeTab === "trips" ? toNumber(item.distance) : toNumber(item.volume);
            return sum + value;
          }, 0);
        return total;
      });
      return { asset, cells };
    });
  }, [processedData, heatmapLocations, activeTab]);

  const maxHeatValue = useMemo(() => {
    let max = 0;
    heatmapRows.forEach((row) => row.cells.forEach((value) => {
      if (value > max) max = value;
    }));
    return max;
  }, [heatmapRows]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("desc");
  };

  const exportCurrentData = () => {
    if (!processedData.length) return;

    const rows = processedData.map((row: any) => {
      if (activeTab === "trips") {
        return {
          asset: row.asset,
          date: row.date,
          distance_km: row.distance,
          fuel_used_l: row.fuelUsed,
          engine_hours: row.engineHours,
          efficiency_km_per_l: row.efficiency,
          location: row.location,
          status: row.status,
        };
      }

      return {
        asset: row.asset,
        date: row.date,
        event_time: row.eventTime,
        volume_l: row.volume,
        event_type: row.type,
        location: row.location,
        status: row.status,
      };
    });

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = String((row as any)[header] ?? "");
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `data-intelligence-${activeTab}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Data Intelligence Hub</h1>
          <p className="text-muted-foreground mt-2">Live backend data for drains, thefts, and trips</p>
        </div>
        <Button variant="outline" className="flex items-center gap-2" onClick={exportCurrentData} disabled={!processedData.length}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search assets, locations, dates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="drains" className="flex items-center gap-2">
            <Fuel className="w-4 h-4" />
            Fuel Drains
          </TabsTrigger>
          <TabsTrigger value="thefts" className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Fuel Thefts
          </TabsTrigger>
          <TabsTrigger value="trips" className="flex items-center gap-2">
            <Route className="w-4 h-4" />
            Trip Analytics
          </TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-4">
              {activeTab === "trips" ? "Distance by Asset" : "Volume by Asset"}
            </h3>
            <ChartContainer config={{}} className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="asset" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    content={<ChartTooltipContent />}
                    formatter={(value: any) => [`${Number(value).toFixed(1)} ${activeTab === "trips" ? "km" : "L"}`, "Value"]}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-4">Status Distribution</h3>
            <ChartContainer config={{}} className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`pie-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </GlassCard>
        </div>

        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-4">Location Heatmap</h3>
          <div className="overflow-x-auto">
            <div className="min-w-full">
              <div className={`grid gap-2 mb-4`} style={{ gridTemplateColumns: `minmax(180px, 1fr) repeat(${heatmapLocations.length}, minmax(110px, 1fr))` }}>
                <div className="text-sm font-medium text-muted-foreground">Asset</div>
                {heatmapLocations.map((location) => (
                  <div key={location} className="text-sm font-medium text-muted-foreground text-center truncate" title={location}>
                    {location}
                  </div>
                ))}
              </div>
              {heatmapRows.map((row) => (
                <div key={row.asset} className="grid gap-2 mb-2" style={{ gridTemplateColumns: `minmax(180px, 1fr) repeat(${heatmapLocations.length}, minmax(110px, 1fr))` }}>
                  <div className="text-sm font-medium text-foreground truncate" title={row.asset}>{row.asset}</div>
                  {row.cells.map((value, index) => {
                    const intensity = maxHeatValue > 0 ? value / maxHeatValue : 0;
                    return (
                      <div
                        key={`${row.asset}-${index}`}
                        className="h-8 rounded flex items-center justify-center text-xs font-medium text-white"
                        style={{ backgroundColor: `rgba(59,130,246,${Math.max(0.15, intensity * 0.85)})` }}
                        title={`${value.toFixed(1)} ${activeTab === "trips" ? "km" : "L"}`}
                      >
                        {value > 0 ? value.toFixed(1) : "-"}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              {activeTab === "drains" ? "Fuel Drains Data" : activeTab === "thefts" ? "Fuel Thefts Data" : "Trip Analytics Data"}
            </h3>
            <div className="text-sm text-muted-foreground">{processedData.length} records</div>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading live data...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium">
                      <Button variant="ghost" size="sm" onClick={() => handleSort("asset")} className="h-auto p-0 font-medium">
                        Asset
                        {sortField === "asset" && (sortDirection === "asc" ? <SortAsc className="w-3 h-3 ml-1" /> : <SortDesc className="w-3 h-3 ml-1" />)}
                      </Button>
                    </th>
                    <th className="text-left p-3 font-medium">
                      <Button variant="ghost" size="sm" onClick={() => handleSort("date")} className="h-auto p-0 font-medium">
                        Date / Time (DB {DB_TIMEZONE_LABELS.webhookLocal})
                        {sortField === "date" && (sortDirection === "asc" ? <SortAsc className="w-3 h-3 ml-1" /> : <SortDesc className="w-3 h-3 ml-1" />)}
                      </Button>
                    </th>
                    {activeTab === "trips" ? (
                      <>
                        <th className="text-left p-3 font-medium">Distance (km)</th>
                        <th className="text-left p-3 font-medium">Fuel Used (L)</th>
                        <th className="text-left p-3 font-medium">Efficiency (km/L)</th>
                        <th className="text-left p-3 font-medium">Engine Hours</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left p-3 font-medium">Event Time (DB {DB_TIMEZONE_LABELS.webhookLocal})</th>
                        <th className="text-left p-3 font-medium">Volume (L)</th>
                        <th className="text-left p-3 font-medium">Type</th>
                      </>
                    )}
                    <th className="text-left p-3 font-medium">Location</th>
                    <th className="text-left p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {processedData.map((item: any) => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-card/50">
                      <td className="p-3 font-medium">{item.asset}</td>
                      <td className="p-3">{item.date}</td>
                      {activeTab === "trips" ? (
                        <>
                          <td className="p-3">{item.distance.toFixed(2)}</td>
                          <td className="p-3">{item.fuelUsed.toFixed(2)}</td>
                          <td className="p-3">{item.efficiency.toFixed(2)}</td>
                          <td className="p-3">{item.engineHours.toFixed(2)}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-3">{item.eventTime}</td>
                          <td className="p-3">{item.volume.toFixed(2)}</td>
                          <td className="p-3">{item.type}</td>
                        </>
                      )}
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="truncate max-w-[220px]" title={item.location}>{item.location}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={getStatusColor(String(item.status || "unknown"))}>{item.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {processedData.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">No records found for selected filters.</div>
              )}
            </div>
          )}
        </GlassCard>
      </Tabs>
    </div>
  );
}
