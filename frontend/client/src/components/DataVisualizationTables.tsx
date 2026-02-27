import { useState, useMemo } from "react";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie } from "recharts";
import { Search, Filter, Download, TrendingUp, TrendingDown, AlertTriangle, Fuel, MapPin, Clock, Eye, SortAsc, SortDesc } from "lucide-react";

// Mock data for drains (fuel consumption anomalies)
const drainsData: any[] = [
  { id: 1, asset: "SEM-123", date: "2024-09-25", fuelDrained: 45, location: "Nairobi Central", severity: "high", status: "investigating" },
  { id: 2, asset: "KCF-234", date: "2024-09-24", fuelDrained: 32, location: "Mombasa Port", severity: "medium", status: "resolved" },
  { id: 3, asset: "NAR-567", date: "2024-09-23", fuelDrained: 67, location: "Kisumu Depot", severity: "high", status: "pending" },
  { id: 4, asset: "SEM-890", date: "2024-09-22", fuelDrained: 28, location: "Eldoret Station", severity: "low", status: "resolved" },
  { id: 5, asset: "KCF-345", date: "2024-09-21", fuelDrained: 52, location: "Nakuru Hub", severity: "high", status: "investigating" },
];

// Mock data for thefts
const theftsData: any[] = [
  { id: 1, asset: "SEM-123", date: "2024-09-25", theftAmount: 45, location: "Nairobi Central", time: "02:30", method: "siphon", status: "confirmed" },
  { id: 2, asset: "KCF-234", date: "2024-09-24", theftAmount: 32, location: "Mombasa Port", time: "01:15", method: "pump", status: "suspected" },
  { id: 3, asset: "NAR-567", date: "2024-09-23", theftAmount: 67, location: "Kisumu Depot", time: "03:45", method: "siphon", status: "confirmed" },
  { id: 4, asset: "SEM-890", date: "2024-09-22", theftAmount: 28, location: "Eldoret Station", time: "22:10", method: "tamper", status: "investigating" },
  { id: 5, asset: "KCF-345", date: "2024-09-21", theftAmount: 52, location: "Nakuru Hub", time: "04:20", method: "siphon", status: "confirmed" },
];

// Mock data for trips
const tripsData: any[] = [
  { id: 1, asset: "SEM-123", date: "2024-09-25", distance: 245, duration: "4h 32m", startLocation: "Nairobi", endLocation: "Mombasa", efficiency: 8.2, status: "completed" },
  { id: 2, asset: "KCF-234", date: "2024-09-24", distance: 189, duration: "3h 15m", startLocation: "Mombasa", endLocation: "Nairobi", efficiency: 9.1, status: "completed" },
  { id: 3, asset: "NAR-567", date: "2024-09-23", distance: 312, duration: "5h 48m", startLocation: "Kisumu", endLocation: "Eldoret", efficiency: 7.8, status: "completed" },
  { id: 4, asset: "SEM-890", date: "2024-09-22", distance: 156, duration: "2h 45m", startLocation: "Eldoret", endLocation: "Nakuru", efficiency: 8.9, status: "completed" },
  { id: 5, asset: "KCF-345", date: "2024-09-21", distance: 278, duration: "4h 12m", startLocation: "Nakuru", endLocation: "Nairobi", efficiency: 8.5, status: "in_progress" },
];

interface DataVisualizationTablesProps {
  initialTab?: "drains" | "thefts" | "trips";
}

export function DataVisualizationTables({ initialTab = "drains" }: DataVisualizationTablesProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Get current data based on active tab
  const getCurrentData = () => {
    switch (activeTab) {
      case "drains": return drainsData;
      case "thefts": return theftsData;
      case "trips": return tripsData;
      default: return drainsData;
    }
  };

  // Filtered and sorted data
  const processedData = useMemo(() => {
    let data: any[] = getCurrentData();

    // Apply search filter
    if (searchTerm) {
      data = data.filter(item =>
        Object.values(item).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      data = data.filter(item => item.status === statusFilter);
    }

    // Apply sorting
    if (sortField) {
      data = [...data].sort((a, b) => {
        const aVal = a[sortField as keyof typeof a];
        const bVal = b[sortField as keyof typeof b];

        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortDirection === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }

    return data;
  }, [activeTab, searchTerm, sortField, sortDirection, statusFilter]);

  // Handle sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "medium": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "low": return "bg-green-500/20 text-green-400 border-green-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "investigating": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "resolved": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "pending": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "suspected": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "completed": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "in_progress": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  // Chart data preparation
  const getChartData = () => {
    const data = getCurrentData();
    if (activeTab === "drains") {
      return data.map(item => ({
        asset: item.asset,
        value: item.fuelDrained,
        severity: item.severity
      }));
    } else if (activeTab === "thefts") {
      return data.map(item => ({
        asset: item.asset,
        value: item.theftAmount,
        method: item.method
      }));
    } else {
      return data.map(item => ({
        asset: item.asset,
        value: item.distance,
        efficiency: item.efficiency
      }));
    }
  };

  const chartData = getChartData() as any[];

  // Heatmap data for severity/frequency
  const getHeatmapData = () => {
    const data = getCurrentData();
    const locations = [...new Set(data.map(item => item.location))];
    const assets = [...new Set(data.map(item => item.asset))];

    return assets.map(asset => {
      const assetData = data.filter(item => item.asset === asset);
      const locationData = locations.map(location => {
        const locationItem = assetData.find(item => item.location === location);
        if (activeTab === "drains") {
          return locationItem ? locationItem.fuelDrained : 0;
        } else if (activeTab === "thefts") {
          return locationItem ? locationItem.theftAmount : 0;
        } else {
          return locationItem ? locationItem.distance : 0;
        }
      });
      return { asset, locations: locationData };
    });
  };

  const heatmapData = getHeatmapData();

  // Pie chart data for status distribution
  const getPieData = () => {
    const data = getCurrentData();
    const statusCounts = data.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusCounts).map(([status, count]) => ({
      name: status,
      value: count,
      fill: status === "confirmed" ? "#ef4444" : status === "resolved" ? "#22c55e" : "#3b82f6"
    }));
  };

  const pieData = getPieData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Data Intelligence Hub</h1>
          <p className="text-muted-foreground mt-2">Interactive visualization of drains, thefts, and trips data</p>
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export Data
        </Button>
      </div>

      {/* Filters and Search */}
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
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspected">Suspected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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
            <MapPin className="w-4 h-4" />
            Trip Analytics
          </TabsTrigger>
        </TabsList>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-4">
              {activeTab === "drains" ? "Fuel Drain Volume by Asset" :
               activeTab === "thefts" ? "Theft Amount by Asset" :
               "Trip Distance by Asset"}
            </h3>
            <ChartContainer config={{}} className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="asset" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    content={<ChartTooltipContent />}
                    formatter={(value: any) => [
                      `${value} ${activeTab === "trips" ? "km" : "L"}`,
                      activeTab === "drains" ? "Fuel Drained" : activeTab === "thefts" ? "Theft Amount" : "Distance"
                    ]}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          activeTab === "drains" ?
                            (entry.severity === "high" ? "#ef4444" : entry.severity === "medium" ? "#f59e0b" : "#22c55e") :
                          activeTab === "thefts" ?
                            (entry.method === "siphon" ? "#ef4444" : entry.method === "pump" ? "#f59e0b" : "#8b5cf6") :
                            (entry.efficiency > 9 ? "#22c55e" : entry.efficiency > 8 ? "#f59e0b" : "#ef4444")
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </GlassCard>

          {/* Pie Chart */}
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
                  />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </GlassCard>
        </div>

        {/* Heatmap */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            {activeTab === "drains" ? "Fuel Drain Heatmap" :
             activeTab === "thefts" ? "Theft Incident Heatmap" :
             "Trip Activity Heatmap"} by Location
          </h3>
          <div className="overflow-x-auto">
            <div className="min-w-full">
              <div className="grid grid-cols-6 gap-2 mb-4">
                <div className="text-sm font-medium text-muted-foreground">Asset</div>
                {[...new Set(getCurrentData().map(item => item.location))].map(location => (
                  <div key={location} className="text-sm font-medium text-muted-foreground text-center">
                    {location}
                  </div>
                ))}
              </div>
              {heatmapData.map((row, index) => (
                <div key={index} className="grid grid-cols-6 gap-2 mb-2">
                  <div className="text-sm font-medium text-foreground flex items-center">
                    {row.asset}
                  </div>
                  {row.locations.map((value, locIndex) => {
                    const intensity = Math.min(value / 70, 1); // Normalize to 0-1
                    return (
                      <div
                        key={locIndex}
                        className="h-8 rounded flex items-center justify-center text-xs font-medium text-white"
                        style={{
                          backgroundColor: `rgba(${activeTab === "drains" ? "239,68,68" : activeTab === "thefts" ? "139,92,246" : "34,197,94"}, ${intensity * 0.8 + 0.2})`,
                        }}
                        title={`${value} ${activeTab === "trips" ? "km" : "L"}`}
                      >
                        {value || "-"}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* Data Table */}
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              {activeTab === "drains" ? "Fuel Drains Data Table" :
               activeTab === "thefts" ? "Fuel Thefts Data Table" :
               "Trip Analytics Data Table"}
            </h3>
            <div className="text-sm text-muted-foreground">
              {processedData.length} records
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("asset")}
                      className="h-auto p-0 font-medium"
                    >
                      Asset
                      {sortField === "asset" && (
                        sortDirection === "asc" ? <SortAsc className="w-3 h-3 ml-1" /> : <SortDesc className="w-3 h-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-medium">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("date")}
                      className="h-auto p-0 font-medium"
                    >
                      Date
                      {sortField === "date" && (
                        sortDirection === "asc" ? <SortAsc className="w-3 h-3 ml-1" /> : <SortDesc className="w-3 h-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  {activeTab === "drains" && (
                    <>
                      <th className="text-left p-3 font-medium">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort("fuelDrained")}
                          className="h-auto p-0 font-medium"
                        >
                          Fuel Drained (L)
                          {sortField === "fuelDrained" && (
                            sortDirection === "asc" ? <SortAsc className="w-3 h-3 ml-1" /> : <SortDesc className="w-3 h-3 ml-1" />
                          )}
                        </Button>
                      </th>
                      <th className="text-left p-3 font-medium">Severity</th>
                    </>
                  )}
                  {activeTab === "thefts" && (
                    <>
                      <th className="text-left p-3 font-medium">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort("theftAmount")}
                          className="h-auto p-0 font-medium"
                        >
                          Theft Amount (L)
                          {sortField === "theftAmount" && (
                            sortDirection === "asc" ? <SortAsc className="w-3 h-3 ml-1" /> : <SortDesc className="w-3 h-3 ml-1" />
                          )}
                        </Button>
                      </th>
                      <th className="text-left p-3 font-medium">Time</th>
                      <th className="text-left p-3 font-medium">Method</th>
                    </>
                  )}
                  {activeTab === "trips" && (
                    <>
                      <th className="text-left p-3 font-medium">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort("distance")}
                          className="h-auto p-0 font-medium"
                        >
                          Distance (km)
                          {sortField === "distance" && (
                            sortDirection === "asc" ? <SortAsc className="w-3 h-3 ml-1" /> : <SortDesc className="w-3 h-3 ml-1" />
                          )}
                        </Button>
                      </th>
                      <th className="text-left p-3 font-medium">Duration</th>
                      <th className="text-left p-3 font-medium">Efficiency (L/100km)</th>
                    </>
                  )}
                  <th className="text-left p-3 font-medium">Location</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {processedData.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-card/50">
                    <td className="p-3 font-medium">{item.asset}</td>
                    <td className="p-3">{item.date}</td>
                    {activeTab === "drains" && (
                      <>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            item.fuelDrained > 50 ? "bg-red-500/20 text-red-400" :
                            item.fuelDrained > 30 ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-green-500/20 text-green-400"
                          }`}>
                            {item.fuelDrained}L
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge className={getSeverityColor(item.severity)}>
                            {item.severity}
                          </Badge>
                        </td>
                      </>
                    )}
                    {activeTab === "thefts" && (
                      <>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            item.theftAmount > 50 ? "bg-red-500/20 text-red-400" :
                            item.theftAmount > 30 ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-green-500/20 text-green-400"
                          }`}>
                            {item.theftAmount}L
                          </span>
                        </td>
                        <td className="p-3">{item.time}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {item.method}
                          </Badge>
                        </td>
                      </>
                    )}
                    {activeTab === "trips" && (
                      <>
                        <td className="p-3">{item.distance}km</td>
                        <td className="p-3">{item.duration}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            item.efficiency < 8 ? "bg-red-500/20 text-red-400" :
                            item.efficiency < 9 ? "bg-yellow-500/20 text-yellow-400" :
                            "bg-green-500/20 text-green-400"
                          }`}>
                            {item.efficiency}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="p-3">{item.location}</td>
                    <td className="p-3">
                      <Badge className={getStatusColor(item.status)}>
                        {item.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </Tabs>
    </div>
  );
}
