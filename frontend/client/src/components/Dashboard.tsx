import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "./PageHeader";
import { GlassCard } from "./GlassCard";
import { Fuel, Clock, MapPin, Shield, DropletIcon, AlertOctagon, Gauge } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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

type ConsumptionBandKey = "efficient" | "average" | "watch" | "critical";
const consumptionBandLabels: Record<ConsumptionBandKey, string> = {
  efficient: "Efficient",
  average: "Average",
  watch: "Watch",
  critical: "Critical",
};

type EventSummary = { total: number; refills: number; thefts: number };

type FollowUpVehicle = {
  vehicleId: string;
  label: string;
  value: number;
  fuelUsedLiters: number;
  distanceKm: number;
  workingHours: number;
  events: EventSummary;
};

type ConsumptionBandEntry = {
  dateKey: string;
  day: string;
  value: number;
  fuelUsedLiters: number;
  distanceKm: number;
  workingHours: number;
  vehicleIds: string[];
  events: EventSummary;
  followUpVehicles: FollowUpVehicle[];
};

export function Dashboard({ selectedVehicle, pageId }: DashboardProps) {
  const [animationTrigger, setAnimationTrigger] = useState(false);
  const [activeConsumptionBand, setActiveConsumptionBand] = useState<ConsumptionBandKey | null>(null);
  const { state: filterState, actions } = useGlobalFilter();
  const consumptionUnitLabel = filterState.consumptionUnit === "KM/L" ? "KM/L" : "Hrs/L";

  const filterParams = globalFilterToApiParams(filterState);
  const refreshIntervalMs = filterState.refreshInterval > 0 ? filterState.refreshInterval : false;

  // Fetch dashboard KPIs from API with filters
  const { data: kpis } = useQuery({
    queryKey: ["/api/dashboard/kpis", filterState.selectedClientId, filterState.selectedVehicles, filterState.dateRange],
    queryFn: async () => api.getDashboardKPIs(filterParams),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["/api/vehicles", filterState.selectedClientId],
    queryFn: () =>
      api.getVehicles({
        clientId: filterState.selectedClientId !== "all" ? filterState.selectedClientId : undefined,
      }),
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  const { data: fuelEventsData = [] } = useQuery({
    queryKey: ["/api/fuel-events", filterState.selectedClientId, filterState.selectedVehicles, filterState.dateRange],
    queryFn: async () => api.getFuelEvents(filterParams),
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  const { data: dailyMetricsData = [] } = useQuery({
    queryKey: ["/api/daily-metrics", filterState.selectedClientId, filterState.selectedVehicles, filterState.dateRange],
    queryFn: async () => api.getDailyMetrics(filterParams),
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  const filteredVehicles = filterState.selectedVehicles.length > 0
    ? vehicles.filter((vehicle: any) => filterState.selectedVehicles.includes(vehicle.id))
    : vehicles;

  const vehicleLabelById = useMemo(() => {
    const map = new Map<string, string>();

    vehicles.forEach((vehicle: any) => {
      const vehicleId = String(vehicle?.id || "").trim();
      if (!vehicleId) return;

      const label = String(vehicle?.vehiclePlate || vehicle?.assetId || vehicleId).trim();
      map.set(vehicleId, label || vehicleId);
    });

    return map;
  }, [vehicles]);

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

  const isTodaySelected = filterState.dateRange.preset === "today";

  const totalFuelUsed = Math.max(0, isTodaySelected
    ? filteredVehicles.reduce((sum: number, v: any) => sum + (Number(v.totalFuelUsed) || 0), 0)
    : aggregatedDailyMetrics.fuel);

  const totalDistance = Math.max(0, isTodaySelected
    ? filteredVehicles.reduce((sum: number, v: any) => sum + (Number(v.totalDistance) || 0), 0)
    : aggregatedDailyMetrics.distance);

  const totalEngineHours = Math.max(0, isTodaySelected
    ? filteredVehicles.reduce((sum: number, v: any) => sum + (Number(v.totalEngineHours) || 0), 0)
    : aggregatedDailyMetrics.engineHours);
  const consumptionHrsPerL = totalFuelUsed > 0 ? totalEngineHours / totalFuelUsed : 0;
  const consumptionKmPerL = totalFuelUsed > 0 ? totalDistance / totalFuelUsed : 0;
  const selectedConsumptionValue =
    filterState.consumptionUnit === "KM/L" ? consumptionKmPerL : consumptionHrsPerL;
  const alternateConsumptionValue =
    filterState.consumptionUnit === "KM/L" ? consumptionHrsPerL : consumptionKmPerL;
  const alternateConsumptionUnitLabel = filterState.consumptionUnit === "KM/L" ? "Hrs/L" : "KM/L";

  const selectedConsumptionBand = useMemo(() => {
    const excellentThreshold = Number(filterState.consumptionExcellentThreshold || 0);
    const acceptableThreshold = Number(filterState.consumptionAcceptableThreshold || 0);
    const alertThreshold = Number(filterState.consumptionAlertThreshold || 0);

    if (!Number.isFinite(selectedConsumptionValue) || selectedConsumptionValue <= 0) {
      return { label: "No Data", className: "text-muted-foreground" };
    }

    if (selectedConsumptionValue >= excellentThreshold) {
      return { label: "Efficient", className: "text-emerald-600" };
    }

    if (selectedConsumptionValue >= acceptableThreshold) {
      return { label: "Average", className: "text-amber-500" };
    }

    if (selectedConsumptionValue >= alertThreshold) {
      return { label: "Watch", className: "text-orange-500" };
    }

    return { label: "Critical", className: "text-destructive" };
  }, [
    selectedConsumptionValue,
    filterState.consumptionExcellentThreshold,
    filterState.consumptionAcceptableThreshold,
    filterState.consumptionAlertThreshold,
  ]);
  const selectedConsumptionDisplay =
    selectedConsumptionBand.label === "No Data" ? "--" : selectedConsumptionValue.toFixed(2);
  const totalAssets = (kpis?.totalVehicles ?? filteredVehicles.length);
  const activeAssets = (kpis?.activeVehicles ?? filteredVehicles.filter((v: any) => v.status === "Active").length);
  const totalFuelCost = useMemo(() => {
    return Math.round(totalFuelUsed * (filterState.fuelCostPerLiter || 0));
  }, [totalFuelUsed, filterState.fuelCostPerLiter]);

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
    totalAssets,
    activeAssets,
    totalFuelCost,
    reliabilityScore,
  };

  const estimatedOperatingCost = dashboardMetrics.totalFuelCost * 1.2; // Operating cost includes fuel + maintenance

  const fuelEventTotals = useMemo(
    () =>
      fuelEventsData.reduce(
        (
          acc: { refillCount: number; refillVolume: number; theftCount: number; theftVolume: number },
          event: any
        ) => {
          const eventType = String(event?.eventType || "").toLowerCase();
          const volume = Math.abs(Number(event?.volumeLiters || 0));

          if (eventType === "refill") {
            acc.refillCount += 1;
            acc.refillVolume += volume;
          }

          if (eventType === "theft" || eventType === "leak" || eventType === "drain") {
            acc.theftCount += 1;
            acc.theftVolume += volume;
          }

          return acc;
        },
        { refillCount: 0, refillVolume: 0, theftCount: 0, theftVolume: 0 }
      ),
    [fuelEventsData]
  );

  const totalRefills = fuelEventTotals.refillCount;
  const totalRefillVolume = fuelEventTotals.refillVolume;
  const fuelThefts = fuelEventTotals.theftCount;
  const totalTheftVolume = fuelEventTotals.theftVolume;

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

  const consumptionTrendData = useMemo(() => {
    return chartData.map((entry) => {
      const value = filterState.consumptionUnit === "HRS/L"
        ? entry.consumption > 0
          ? entry.engineHours / entry.consumption
          : 0
        : entry.consumption > 0
          ? entry.distance / entry.consumption
          : 0;

      return {
        dateKey: entry.dateKey,
        day: entry.day,
        value: Number(value.toFixed(2)),
        fuelUsedLiters: Number(entry.consumption || 0),
        distanceKm: Number(entry.distance || 0),
        workingHours: Number(entry.engineHours || 0),
      };
    });
  }, [chartData, filterState.consumptionUnit]);

  const fuelEventSummaryByDate = useMemo(() => {
    const summary = new Map<string, { total: number; refills: number; thefts: number }>();

    fuelEventsData.forEach((event: any) => {
      const eventDate = new Date(event?.eventTimestamp);
      if (Number.isNaN(eventDate.getTime())) return;

      const dateKey = eventDate.toISOString().split("T")[0];
      const current = summary.get(dateKey) ?? { total: 0, refills: 0, thefts: 0 };
      const eventType = String(event?.eventType || "").toLowerCase();

      current.total += 1;
      if (eventType === "refill") current.refills += 1;
      if (eventType === "theft" || eventType === "leak" || eventType === "drain") current.thefts += 1;

      summary.set(dateKey, current);
    });

    return summary;
  }, [fuelEventsData]);

  const fuelEventSummaryByDateVehicle = useMemo(() => {
    const summary = new Map<string, EventSummary>();

    fuelEventsData.forEach((event: any) => {
      const eventDate = new Date(event?.eventTimestamp);
      if (Number.isNaN(eventDate.getTime())) return;

      const dateKey = eventDate.toISOString().split("T")[0];
      const vehicleId = String(event?.vehicleId || event?.assetId || "").trim();
      if (!vehicleId) return;

      const summaryKey = `${dateKey}::${vehicleId}`;
      const current = summary.get(summaryKey) ?? { total: 0, refills: 0, thefts: 0 };
      const eventType = String(event?.eventType || "").toLowerCase();

      current.total += 1;
      if (eventType === "refill") current.refills += 1;
      if (eventType === "theft" || eventType === "leak" || eventType === "drain") current.thefts += 1;

      summary.set(summaryKey, current);
    });

    return summary;
  }, [fuelEventsData]);

  const metricVehicleIdsByDate = useMemo(() => {
    const grouped = new Map<string, Set<string>>();

    dailyMetricsData.forEach((metric: any) => {
      const metricDate = new Date(metric?.metricDate);
      if (Number.isNaN(metricDate.getTime())) return;

      const dateKey = metricDate.toISOString().split("T")[0];
      const vehicleId = String(metric?.vehicleId || "").trim();
      if (!vehicleId) return;

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, new Set<string>());
      }
      grouped.get(dateKey)!.add(vehicleId);
    });

    return grouped;
  }, [dailyMetricsData]);

  const dailyVehiclePerformanceByDate = useMemo(() => {
    const totalsByDateVehicle = new Map<string, {
      dateKey: string;
      vehicleId: string;
      fuelUsedLiters: number;
      distanceKm: number;
      workingHours: number;
    }>();

    dailyMetricsData.forEach((metric: any) => {
      const metricDate = new Date(metric?.metricDate);
      if (Number.isNaN(metricDate.getTime())) return;

      const dateKey = metricDate.toISOString().split("T")[0];
      const vehicleId = String(metric?.vehicleId || "").trim();
      if (!vehicleId) return;

      const aggregateKey = `${dateKey}::${vehicleId}`;
      const current = totalsByDateVehicle.get(aggregateKey) ?? {
        dateKey,
        vehicleId,
        fuelUsedLiters: 0,
        distanceKm: 0,
        workingHours: 0,
      };

      current.fuelUsedLiters += Number(metric?.totalFuelConsumed || 0);
      current.distanceKm += Number(metric?.totalDistanceTraveled || 0);
      current.workingHours += Number(metric?.totalEngineHours || 0);

      totalsByDateVehicle.set(aggregateKey, current);
    });

    const grouped = new Map<string, FollowUpVehicle[]>();

    totalsByDateVehicle.forEach((aggregate, aggregateKey) => {
      if (aggregate.fuelUsedLiters <= 0) return;

      const numerator = filterState.consumptionUnit === "HRS/L" ? aggregate.workingHours : aggregate.distanceKm;
      if (!Number.isFinite(numerator) || numerator <= 0) return;

      const value = numerator / aggregate.fuelUsedLiters;
      if (!Number.isFinite(value) || value <= 0) return;

      const current = grouped.get(aggregate.dateKey) ?? [];
      current.push({
        vehicleId: aggregate.vehicleId,
        label: vehicleLabelById.get(aggregate.vehicleId) || aggregate.vehicleId,
        value: Number(value.toFixed(2)),
        fuelUsedLiters: aggregate.fuelUsedLiters,
        distanceKm: aggregate.distanceKm,
        workingHours: aggregate.workingHours,
        events: fuelEventSummaryByDateVehicle.get(aggregateKey) ?? { total: 0, refills: 0, thefts: 0 },
      });
      grouped.set(aggregate.dateKey, current);
    });

    grouped.forEach((vehiclesOnDate) => {
      vehiclesOnDate.sort((a, b) => {
        if (a.value !== b.value) return a.value - b.value;
        if (a.events.thefts !== b.events.thefts) return b.events.thefts - a.events.thefts;
        if (a.events.refills !== b.events.refills) return b.events.refills - a.events.refills;
        return b.fuelUsedLiters - a.fuelUsedLiters;
      });
    });

    return grouped;
  }, [dailyMetricsData, filterState.consumptionUnit, fuelEventSummaryByDateVehicle, vehicleLabelById]);

  const consumptionTrendSummary = useMemo(() => {
    const excellentThreshold = Number(filterState.consumptionExcellentThreshold || 0);
    const acceptableThreshold = Number(filterState.consumptionAcceptableThreshold || 0);
    const alertThreshold = Number(filterState.consumptionAlertThreshold || 0);

    return consumptionTrendData.reduce(
      (acc, entry) => {
        const value = Number(entry.value || 0);
        if (!Number.isFinite(value) || value <= 0) return acc;

        acc.total += 1;
        if (value >= excellentThreshold) {
          acc.efficient += 1;
        } else if (value >= acceptableThreshold) {
          acc.average += 1;
        } else if (value >= alertThreshold) {
          acc.watch += 1;
        } else {
          acc.critical += 1;
        }
        return acc;
      },
      { total: 0, efficient: 0, average: 0, watch: 0, critical: 0 }
    );
  }, [
    consumptionTrendData,
    filterState.consumptionExcellentThreshold,
    filterState.consumptionAcceptableThreshold,
    filterState.consumptionAlertThreshold,
  ]);

  const consumptionBandBreakdown = useMemo(() => {
    const excellentThreshold = Number(filterState.consumptionExcellentThreshold || 0);
    const acceptableThreshold = Number(filterState.consumptionAcceptableThreshold || 0);
    const alertThreshold = Number(filterState.consumptionAlertThreshold || 0);
    const emptyEventSummary: EventSummary = { total: 0, refills: 0, thefts: 0 };
    const grouped: Record<ConsumptionBandKey, ConsumptionBandEntry[]> = {
      efficient: [],
      average: [],
      watch: [],
      critical: [],
    };

    consumptionTrendData.forEach((entry) => {
      if (!Number.isFinite(entry.value) || entry.value <= 0) return;

      let band: ConsumptionBandKey = "critical";
      if (entry.value >= excellentThreshold) {
        band = "efficient";
      } else if (entry.value >= acceptableThreshold) {
        band = "average";
      } else if (entry.value >= alertThreshold) {
        band = "watch";
      }

      grouped[band].push({
        dateKey: entry.dateKey,
        day: entry.day,
        value: entry.value,
        fuelUsedLiters: entry.fuelUsedLiters,
        distanceKm: entry.distanceKm,
        workingHours: entry.workingHours,
        vehicleIds: Array.from(metricVehicleIdsByDate.get(entry.dateKey) ?? []),
        events: fuelEventSummaryByDate.get(entry.dateKey) ?? emptyEventSummary,
        followUpVehicles: (dailyVehiclePerformanceByDate.get(entry.dateKey) ?? []).slice(0, 3),
      });
    });

    (Object.keys(grouped) as ConsumptionBandKey[]).forEach((band) => {
      grouped[band].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    });

    return grouped;
  }, [
    consumptionTrendData,
    filterState.consumptionExcellentThreshold,
    filterState.consumptionAcceptableThreshold,
    filterState.consumptionAlertThreshold,
    fuelEventSummaryByDate,
    metricVehicleIdsByDate,
    dailyVehiclePerformanceByDate,
  ]);

  const activeConsumptionBandEntries = activeConsumptionBand
    ? consumptionBandBreakdown[activeConsumptionBand]
    : [];
  const activeConsumptionBandStats = useMemo(() => {
    return activeConsumptionBandEntries.reduce(
      (
        acc: {
          totalValue: number;
          totalFuel: number;
          totalDistance: number;
          totalHours: number;
          totalEvents: number;
          refillEvents: number;
          theftEvents: number;
        },
        entry
      ) => {
        acc.totalValue += entry.value;
        acc.totalFuel += entry.fuelUsedLiters;
        acc.totalDistance += entry.distanceKm;
        acc.totalHours += entry.workingHours;
        acc.totalEvents += entry.events.total;
        acc.refillEvents += entry.events.refills;
        acc.theftEvents += entry.events.thefts;
        return acc;
      },
      {
        totalValue: 0,
        totalFuel: 0,
        totalDistance: 0,
        totalHours: 0,
        totalEvents: 0,
        refillEvents: 0,
        theftEvents: 0,
      }
    );
  }, [activeConsumptionBandEntries]);
  const activeConsumptionBandAverage =
    activeConsumptionBandEntries.length > 0
      ? activeConsumptionBandStats.totalValue / activeConsumptionBandEntries.length
      : 0;
  const activeConsumptionBandLabel = activeConsumptionBand
    ? consumptionBandLabels[activeConsumptionBand]
    : "";

  const handleConsumptionBandClick = (band: ConsumptionBandKey) => {
    setActiveConsumptionBand((prev) => (prev === band ? null : band));
  };

  const thresholdPrecision = filterState.consumptionUnit === "KM/L" ? 1 : 2;
  const excellentThresholdLabel = Number(filterState.consumptionExcellentThreshold).toFixed(thresholdPrecision);
  const alertThresholdLabel = Number(filterState.consumptionAlertThreshold).toFixed(thresholdPrecision);
  const classifyConsumptionValue = (value: number) => {
    const excellentThreshold = Number(filterState.consumptionExcellentThreshold || 0);
    const acceptableThreshold = Number(filterState.consumptionAcceptableThreshold || 0);
    const alertThreshold = Number(filterState.consumptionAlertThreshold || 0);

    if (!Number.isFinite(value) || value <= 0) {
      return {
        label: "No data",
        badgeClassName: "border-border/40 bg-muted/40 text-muted-foreground",
      };
    }

    if (value >= excellentThreshold) {
      return {
        label: "Efficient",
        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    }

    if (value >= acceptableThreshold) {
      return {
        label: "Average",
        badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    }

    if (value >= alertThreshold) {
      return {
        label: "Watch",
        badgeClassName: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
      };
    }

    return {
      label: "Critical",
      badgeClassName: "border-destructive/30 bg-destructive/10 text-destructive",
    };
  };

  const getEventSignal = (events: EventSummary) => {
    if (events.thefts > 0) {
      return {
        label: "Theft/Leak signal",
        badgeClassName: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    }

    if (events.refills > 0) {
      return {
        label: "Refill activity",
        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    }

    return {
      label: "No event flags",
      badgeClassName: "border-border/40 bg-muted/40 text-muted-foreground",
    };
  };

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

  const formatFuelEventLocation = (location?: string | null) => {
    const rawLocation = String(location || "").trim();
    if (!rawLocation) return "Unknown location";

    const parts = rawLocation
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length <= 1) return parts[0] || "Unknown location";

    const first = parts[0];
    const last = parts[parts.length - 1];
    return first.toLowerCase() === last.toLowerCase() ? first : `${first}, ${last}`;
  };

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
      label: consumptionUnitLabel,
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

      {/* Redesigned KPI Cards Section - 7 Cards with Count-up Animations */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
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

        {/* NEW: Consumption Metrics */}
        <GlassCard className="p-3 hover-elevate motion-premium" data-testid="kpi-consumption-metrics">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Gauge className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Consumption</span>
            </div>
            <button
              type="button"
              onClick={() =>
                actions.setConsumptionUnit(filterState.consumptionUnit === "KM/L" ? "HRS/L" : "KM/L")
              }
              className="shrink-0 h-5 rounded border border-border/60 bg-background/40 px-1.5 text-[9px] font-semibold leading-none text-muted-foreground hover:text-foreground"
              data-testid="kpi-consumption-unit-toggle"
              aria-label="Switch consumption unit"
            >
              {filterState.consumptionUnit === "KM/L" ? "KM/L" : "H/L"}
            </button>
          </div>
          <div className="space-y-0.5 mb-1">
            <div className="text-lg font-bold text-foreground leading-tight">
              <CountUpAnimation
                value={selectedConsumptionValue}
                decimals={2}
                suffix={` ${consumptionUnitLabel}`}
                trigger={animationTrigger}
              />
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              Alt:{" "}
              <CountUpAnimation
                value={alternateConsumptionValue}
                decimals={2}
                suffix={` ${alternateConsumptionUnitLabel}`}
                trigger={animationTrigger}
              />
            </div>
          </div>
          <div className={`text-[11px] font-semibold ${selectedConsumptionBand.className}`}>
            {selectedConsumptionBand.label}: {selectedConsumptionDisplay}{selectedConsumptionBand.label === "No Data" ? "" : ` ${consumptionUnitLabel}`}
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
            <span className="ml-1 text-xs font-medium text-muted-foreground">events</span>
          </div>
          <div className="text-xs text-primary font-medium">
            Total: <CountUpAnimation value={totalRefillVolume} decimals={1} suffix=" L" trigger={animationTrigger} />
          </div>
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
            <span className="ml-1 text-xs font-medium text-muted-foreground">events</span>
          </div>
          <div className="text-xs text-destructive font-medium">
            Total: <CountUpAnimation value={totalTheftVolume} decimals={1} suffix=" L" trigger={animationTrigger} />
          </div>
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

          {/* Column 3: Fleet Consumption Trend */}
          <GlassCard className="p-6 hover-elevate motion-premium" data-testid="fleet-efficiency-chart">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Fleet Consumption Trend</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Unit:</span>
                <Select
                  value={filterState.consumptionUnit}
                  onValueChange={(value) => actions.setConsumptionUnit(value as "KM/L" | "HRS/L")}
                >
                  <SelectTrigger className="w-24 h-7 bg-card/40 backdrop-blur-sm border-border/30 text-xs" data-testid="select-efficiency-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HRS/L">Hrs/L</SelectItem>
                    <SelectItem value="KM/L">KM/L</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ChartContainer config={efficiencyChartConfig} className="h-48">
              <BarChart
                data={consumptionTrendData}
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
                  formatter={(value) => [`${value} ${consumptionUnitLabel}`, "Consumption"]}
                />
                <Bar
                  dataKey="value"
                  fill="var(--color-value)"
                  radius={[2, 2, 0, 0]}
                  data-testid="efficiency-trend-bars"
                />
              </BarChart>
            </ChartContainer>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleConsumptionBandClick("efficient")}
                className={`rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-left text-emerald-600 transition ${activeConsumptionBand === "efficient" ? "ring-1 ring-emerald-500/50 dark:text-emerald-200" : "dark:text-emerald-300"}`}
              >
                Efficient: {consumptionTrendSummary.efficient}
              </button>
              <button
                type="button"
                onClick={() => handleConsumptionBandClick("average")}
                className={`rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-left text-amber-600 transition ${activeConsumptionBand === "average" ? "ring-1 ring-amber-500/50 dark:text-amber-200" : "dark:text-amber-300"}`}
              >
                Average: {consumptionTrendSummary.average}
              </button>
              <button
                type="button"
                onClick={() => handleConsumptionBandClick("watch")}
                className={`rounded-md border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-left text-orange-600 transition ${activeConsumptionBand === "watch" ? "ring-1 ring-orange-500/50 dark:text-orange-200" : "dark:text-orange-300"}`}
              >
                Watch: {consumptionTrendSummary.watch}
              </button>
              <button
                type="button"
                onClick={() => handleConsumptionBandClick("critical")}
                className={`rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-left text-destructive transition ${activeConsumptionBand === "critical" ? "ring-1 ring-destructive/50" : ""}`}
              >
                Critical: {consumptionTrendSummary.critical}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Click a metric above to open detailed causes. Thresholds: Excellent at least {excellentThresholdLabel} {consumptionUnitLabel} | Alert below {alertThresholdLabel} {consumptionUnitLabel}
            </div>

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
                        {event.eventType || "event"}{" \u00B7 "}{vehicleLabel}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatFuelEventLocation(event.location)}</div>
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

      <Sheet
        open={Boolean(activeConsumptionBand)}
        onOpenChange={(open) => {
          if (!open) setActiveConsumptionBand(null);
        }}
      >
        <SheetContent side="right" className="w-[94vw] sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{activeConsumptionBandLabel} Consumption Drivers</SheetTitle>
            <SheetDescription>
              Daily values and fuel events behind the selected {activeConsumptionBandLabel.toLowerCase()} count.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border/30 bg-card/40 p-2">
                <div className="text-[10px] text-muted-foreground">Days in band</div>
                <div className="text-sm font-semibold text-foreground">{activeConsumptionBandEntries.length}</div>
              </div>
              <div className="rounded-md border border-border/30 bg-card/40 p-2">
                <div className="text-[10px] text-muted-foreground">Avg consumption</div>
                <div className="text-sm font-semibold text-primary">
                  {activeConsumptionBandAverage.toFixed(2)} {consumptionUnitLabel}
                </div>
              </div>
              <div className="rounded-md border border-border/30 bg-card/40 p-2">
                <div className="text-[10px] text-muted-foreground">Fuel events</div>
                <div className="text-sm font-semibold text-foreground">{activeConsumptionBandStats.totalEvents}</div>
              </div>
              <div className="rounded-md border border-border/30 bg-card/40 p-2">
                <div className="text-[10px] text-muted-foreground">Refill/Theft</div>
                <div className="text-sm font-semibold text-foreground">
                  {activeConsumptionBandStats.refillEvents} / {activeConsumptionBandStats.theftEvents}
                </div>
              </div>
            </div>

            {activeConsumptionBandEntries.length === 0 ? (
              <div className="rounded-md border border-border/30 bg-card/40 p-3 text-sm text-muted-foreground">
                No matching days for this band in the selected range.
              </div>
            ) : (
              <div className="space-y-2">
                {activeConsumptionBandEntries.map((entry) => {
                  const primaryVehicle = entry.followUpVehicles[0];
                  const secondaryVehicles = entry.followUpVehicles.slice(1);
                  const primaryBand = primaryVehicle
                    ? classifyConsumptionValue(primaryVehicle.value)
                    : null;
                  const primarySignal = primaryVehicle
                    ? getEventSignal(primaryVehicle.events)
                    : null;
                  const daySignal = getEventSignal(entry.events);

                  return (
                    <div
                      key={entry.dateKey}
                      className="rounded-xl border border-border/40 bg-gradient-to-b from-card/70 to-card/40 p-3.5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{entry.day}</div>
                          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Daily footprint</div>
                        </div>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px]">
                          {entry.value.toFixed(2)} {consumptionUnitLabel}
                        </Badge>
                      </div>

                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        <div className="rounded-md border border-border/30 bg-background/40 px-2 py-1">
                          <div className="text-[10px] text-muted-foreground">Fuel</div>
                          <div className="text-[11px] font-semibold text-foreground">{entry.fuelUsedLiters.toFixed(1)} L</div>
                        </div>
                        <div className="rounded-md border border-border/30 bg-background/40 px-2 py-1">
                          <div className="text-[10px] text-muted-foreground">Distance</div>
                          <div className="text-[11px] font-semibold text-foreground">{entry.distanceKm.toFixed(1)} km</div>
                        </div>
                        <div className="rounded-md border border-border/30 bg-background/40 px-2 py-1">
                          <div className="text-[10px] text-muted-foreground">Hours</div>
                          <div className="text-[11px] font-semibold text-foreground">{entry.workingHours.toFixed(2)}</div>
                        </div>
                      </div>

                      {primaryVehicle ? (
                        <div className="mt-2 rounded-lg border border-border/30 bg-background/50 p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Primary follow-up</div>
                            {primaryBand && (
                              <Badge variant="outline" className={`text-[10px] ${primaryBand.badgeClassName}`}>
                                {primaryBand.label}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-foreground">{primaryVehicle.label}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="text-[10px] border-border/40 bg-muted/20 text-foreground">
                              {primaryVehicle.value.toFixed(2)} {consumptionUnitLabel}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] ${primarySignal?.badgeClassName || "border-border/40 bg-muted/40 text-muted-foreground"}`}>
                              {primarySignal?.label || "No signal"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] border-border/40 bg-muted/20 text-muted-foreground">
                              Events {primaryVehicle.events.total} (R {primaryVehicle.events.refills} / T {primaryVehicle.events.thefts})
                            </Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1.5">
                            <div className="rounded-md border border-border/20 bg-muted/20 px-2 py-1">
                              <div className="text-[10px] text-muted-foreground">Fuel</div>
                              <div className="text-[11px] font-medium text-foreground">{primaryVehicle.fuelUsedLiters.toFixed(1)} L</div>
                            </div>
                            <div className="rounded-md border border-border/20 bg-muted/20 px-2 py-1">
                              <div className="text-[10px] text-muted-foreground">Distance</div>
                              <div className="text-[11px] font-medium text-foreground">{primaryVehicle.distanceKm.toFixed(1)} km</div>
                            </div>
                            <div className="rounded-md border border-border/20 bg-muted/20 px-2 py-1">
                              <div className="text-[10px] text-muted-foreground">Hours</div>
                              <div className="text-[11px] font-medium text-foreground">{primaryVehicle.workingHours.toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 rounded-lg border border-border/30 bg-background/30 p-2.5 text-[11px] text-muted-foreground">
                          Primary follow-up unavailable because no vehicle-level records had valid fuel and movement for this day.
                        </div>
                      )}

                      {secondaryVehicles.length > 0 && (
                        <div className="mt-2 rounded-lg border border-border/30 bg-muted/20 p-2.5">
                          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Next follow-up candidates</div>
                          <div className="mt-1 space-y-1">
                            {secondaryVehicles.map((vehicle) => {
                              const vehicleBand = classifyConsumptionValue(vehicle.value);
                              return (
                                <div key={`${entry.dateKey}-${vehicle.vehicleId}`} className="flex items-center justify-between gap-2 rounded-md border border-border/20 bg-background/40 px-2 py-1">
                                  <div className="min-w-0 text-[11px] font-medium text-foreground truncate">{vehicle.label}</div>
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant="outline" className={`text-[10px] ${vehicleBand.badgeClassName}`}>
                                      {vehicleBand.label}
                                    </Badge>
                                    <span className="text-[11px] font-semibold text-foreground">{vehicle.value.toFixed(2)} {consumptionUnitLabel}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px] border-border/40 bg-muted/20 text-muted-foreground">
                          Day events {entry.events.total}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] border-border/40 bg-muted/20 text-muted-foreground">
                          Refill {entry.events.refills}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${entry.events.thefts > 0 ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border/40 bg-muted/20 text-muted-foreground"}`}>
                          Theft/Leak {entry.events.thefts}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${daySignal.badgeClassName}`}>
                          {daySignal.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
