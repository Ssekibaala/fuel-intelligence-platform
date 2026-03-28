import { useState, useEffect, useMemo } from "react";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Car,
  Fuel,
  MapPin,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Filter,
  ChevronRight,
  Activity,
  Eye,
  Bell,
  BarChart3,
  Shield,
  Gauge,
  Route,
  Timer,
  Droplet,
  AlertCircle,
  CheckCircle,
  Zap,
  Target,
  Settings2,
  RefreshCw,
  Download,
  Info,
  Truck
} from "lucide-react";
import { useGlobalFilter, getDateRangeFromPreset } from "./GlobalFilterContext";
import { FilterControls } from "./FilterControls";
import { HeadingLogo } from "./HeadingLogo";
import { api, globalFilterToApiParams } from "../lib/api";
import { queryClient } from "../lib/queryClient";
import { DB_TIMEZONE_LABELS, formatDateTimeEAT } from "../lib/dateTime";
import {
  deriveConsumption,
  deriveHoursPerLiter,
  getTodayLocalDayKey,
  rangeIncludesToday as rangeEndsToday,
} from "../lib/fleetMetrics";
import { useQuery } from "@tanstack/react-query";
import { type DateRange } from "@shared/schema";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  LineChart,
  Line,
  Brush,
  Scatter
} from "recharts";

interface VehiclesPageProps {
  pageId?: string;
  selectedVehicle?: string;
  onVehicleChange?: (vehicleId: string) => void;
}

type PreviewSensorPoint = {
  id: string;
  time: string;
  displayTime: string;
  fuel: number | null;
  rawFuel: number | null;
};

const getVehicleLabel = (vehicle?: any) => {
  if (!vehicle) return "Unknown Asset";
  if (vehicle.vehiclePlate) return vehicle.vehiclePlate;
  if (vehicle.assetId) return vehicle.assetId;
  if (vehicle.driverName) return vehicle.driverName;
  if (vehicle.id) return `Vehicle ${String(vehicle.id).slice(0, 8)}`;
  return "Unknown Asset";
};

const formatMetricNumber = (value: number | null | undefined, decimals = 1): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(decimals);
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toDate = (value: unknown): Date | null => {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value: unknown): string => {
  const parsed = toDate(value);
  return parsed ? parsed.toLocaleDateString() : "Unknown";
};

function getTodayRangeIso() {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

function getLast7DaysRange(): DateRange {
  const { startDate, endDate } = getDateRangeFromPreset("last_7_days");
  return {
    preset: "last_7_days",
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    label: "Last 7 Days",
  };
}

const eatDayKeyFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const eatTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const eatDayLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  month: "short",
  day: "2-digit",
});

const toEatDayKey = (value: unknown): string | null => {
  const parsed = toDate(value);
  return parsed ? eatDayKeyFormatter.format(parsed) : null;
};

const DEFAULT_SENSOR_CONFIG = {
  tankCapacity: 600,
  useTankCapacity: true,
  averaging: 20,
  ignoreOffIgnition: true,
  spikeStart: 5,
  spikeDuration: 10,
  spikeReturn: 10,
  calibrationType: "incremental",
  suddenIncrease: 35,
  suddenDecrease: 20,
  rangeLow: 100,
  rangeHigh: 450,
  rangeViolationCount: 10,
  sensorEventsEnabled: true,
};

function getRangeFromPreset(preset: "today" | "week" | "month") {
  const end = new Date();
  let start = new Date();

  if (preset === "today") {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
  } else if (preset === "week") {
    start.setDate(end.getDate() - 7);
  } else {
    start.setDate(end.getDate() - 30);
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

const VehiclesPage: React.FC<VehiclesPageProps> = ({ selectedVehicle, onVehicleChange }) => {
  const { state: filterState, actions: filterActions } = useGlobalFilter();
  const [fleetDateRange, setFleetDateRange] = useState<DateRange>(() => {
    const todayRange = getTodayRangeIso();
    return {
      preset: "today" as const,
      startDate: todayRange.startDate,
      endDate: todayRange.endDate,
      label: "Today",
    };
  });
  const fleetFilterState = useMemo(
    () => ({ ...filterState, dateRange: fleetDateRange }),
    [filterState, fleetDateRange]
  );
  const refreshIntervalMs = filterState.refreshInterval > 0 ? filterState.refreshInterval : false;
  const isTodaySelected = fleetDateRange.preset === "today";
  const rangeIncludesToday = useMemo(
    () => rangeEndsToday(fleetDateRange.endDate, isTodaySelected),
    [fleetDateRange.endDate, isTodaySelected]
  );
  const fleetFilterSignature = useMemo(
    () =>
      JSON.stringify({
        clientId: filterState.selectedClientId,
        selectedVehicles: [...filterState.selectedVehicles].sort(),
        startDate: fleetDateRange.startDate,
        endDate: fleetDateRange.endDate,
        preset: fleetDateRange.preset,
      }),
    [
      filterState.selectedClientId,
      filterState.selectedVehicles,
      fleetDateRange.startDate,
      fleetDateRange.endDate,
      fleetDateRange.preset,
    ]
  );
  const consumptionUnitLabel = filterState.consumptionUnit === "KM/L" ? "Km/L" : "Hrs/L";
  const [currentVehicle, setCurrentVehicle] = useState(selectedVehicle || "");
  const [viewMode, setViewMode] = useState<"table" | "focused">("table");
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [selectedAssetLocation, setSelectedAssetLocation] = useState<string | null>(null);
  const [sensorConfigOpen, setSensorConfigOpen] = useState(false);
  const [previewPanelOpen, setPreviewPanelOpen] = useState(false);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [previewDateRange, setPreviewDateRange] = useState<"today" | "week" | "month">("today");
  const [tempSensorConfig, setTempSensorConfig] = useState<any>(null);
  const [sensitivityLevel, setSensitivityLevel] = useState<"aggressive" | "medium" | "soft" | "none">("medium");
  const [showRawLine, setShowRawLine] = useState(false);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [forcedTooltip, setForcedTooltip] = useState<any | null>(null);
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [sensorConfigs, setSensorConfigs] = useState<Record<string, any>>({});

  const activateFocusedVehicle = (vehicleId: string) => {
    setCurrentVehicle(vehicleId);
    onVehicleChange?.(vehicleId);
    filterActions.setSelectedVehicles([vehicleId]);
    setViewMode("focused");
  };

  useEffect(() => {
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const firstKey = query.queryKey?.[0];
        if (typeof firstKey !== "string") return false;
        return (
          firstKey === "/api/daily-metrics" ||
          firstKey === "/api/fuel-events" ||
          firstKey === "/api/raw-sensor-data"
        );
      },
      refetchType: "active",
    });
  }, [fleetFilterSignature]);

  // Get current sensor config for the selected vehicle
  const sensorConfig = sensorConfigs[currentVehicle] || DEFAULT_SENSOR_CONFIG;

  // Fetch vehicles data with filters
  const { data: vehiclesData, isLoading: vehiclesLoading } = useQuery({
    queryKey: ["/api/vehicles", filterState.selectedClientId, filterState.selectedVehicles],
    queryFn: async () => {
      return api.getVehicles({
        clientId: filterState.selectedClientId !== "all" ? filterState.selectedClientId : undefined,
        vehicleIds: filterState.selectedVehicles.length > 0 ? filterState.selectedVehicles : undefined,
      });
    },
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  // For focused view, fetch detailed data for the selected vehicle
  const { data: focusedVehicleData } = useQuery({
    queryKey: ["/api/vehicles", currentVehicle],
    queryFn: async () => {
      if (!currentVehicle) return null;
      return api.getVehicle(currentVehicle);
    },
    enabled: !!currentVehicle && viewMode === 'focused',
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  // Fleet-wide daily metrics (respects global filters)
  const { data: fleetDailyMetricsData = [] } = useQuery({
    queryKey: ["/api/daily-metrics", filterState.selectedClientId, filterState.selectedVehicles, fleetDateRange],
    queryFn: async () => {
      const params = globalFilterToApiParams(fleetFilterState);
      return api.getDailyMetrics(params);
    },
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  // Fleet-wide fuel events (respects global filters)
  const { data: fleetFuelEventsData = [] } = useQuery({
    queryKey: ["/api/fuel-events", filterState.selectedClientId, filterState.selectedVehicles, fleetDateRange],
    queryFn: async () => {
      const params = globalFilterToApiParams(fleetFilterState);
      return api.getFuelEvents(params);
    },
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  // Focused-vehicle raw sensor telemetry (for fuel line chart)
  const { data: focusedRawSensorData = [] } = useQuery({
    queryKey: ["/api/raw-sensor-data", currentVehicle, fleetDateRange],
    queryFn: async () => {
      if (!currentVehicle) return [];
      return api.getRawSensorData({
        vehicleIds: [currentVehicle],
        startDate: fleetDateRange.startDate,
        endDate: fleetDateRange.endDate,
      });
    },
    enabled: !!currentVehicle && viewMode === "focused",
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  const previewDateBounds = useMemo(
    () => getRangeFromPreset(previewDateRange),
    [previewDateRange]
  );

  const { data: previewRawSensorData = [] } = useQuery({
    queryKey: ["/api/raw-sensor-data", "preview", previewAssetId, previewDateBounds.startDate, previewDateBounds.endDate],
    queryFn: async () => {
      if (!previewAssetId) return [];
      return api.getRawSensorData({
        vehicleIds: [previewAssetId],
        startDate: previewDateBounds.startDate,
        endDate: previewDateBounds.endDate,
      });
    },
    enabled: previewPanelOpen && !!previewAssetId,
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  const dailyMetricsByVehicle = useMemo(() => {
    const map = new Map<
      string,
      { distance: number; engineHours: number; fuelUsed: number; refills: number; thefts: number; lastMetricTime?: string }
    >();
    fleetDailyMetricsData.forEach((metric: any) => {
      if (!metric?.vehicleId) return;
      const metricDate = metric?.metricDate ? new Date(metric.metricDate) : null;
      const metricDayKey = metricDate
        ? `${metricDate.getFullYear()}-${String(metricDate.getMonth() + 1).padStart(2, "0")}-${String(metricDate.getDate()).padStart(2, "0")}`
        : null;
      if (!isTodaySelected && rangeIncludesToday && metricDayKey === getTodayLocalDayKey()) {
        return;
      }
      const entry = map.get(metric.vehicleId) || {
        distance: 0,
        engineHours: 0,
        fuelUsed: 0,
        refills: 0,
        thefts: 0,
        lastMetricTime: undefined,
      };
      entry.distance += Number(metric.totalDistanceTraveled || 0);
      entry.engineHours += Number(metric.totalEngineHours || 0);
      entry.fuelUsed += Number(metric.totalFuelConsumed || 0);
      entry.refills += Number(metric.numberOfRefills || 0);
      entry.thefts += Number(metric.numberOfThefts || 0);
      if (metric.metricDate) {
        const metricTime = new Date(metric.metricDate).getTime();
        const currentLatest = entry.lastMetricTime ? new Date(entry.lastMetricTime).getTime() : 0;
        if (!entry.lastMetricTime || metricTime > currentLatest) {
          entry.lastMetricTime = metric.metricDate;
        }
      }
      map.set(metric.vehicleId, entry);
    });
    return map;
  }, [fleetDailyMetricsData, isTodaySelected, rangeIncludesToday]);

  const fuelEventsByVehicle = useMemo(() => {
    const map = new Map<string, { refills: number; thefts: number; refillVolume: number; theftVolume: number; lastEventTime?: string; lastLocation?: string }>();
    fleetFuelEventsData.forEach((event: any) => {
      if (!event?.vehicleId) return;
      const entry = map.get(event.vehicleId) || { refills: 0, thefts: 0, refillVolume: 0, theftVolume: 0 };
      const volume = Math.abs(Number(event.volumeLiters || 0));
      if (event.eventType === "refill") {
        entry.refills += 1;
        entry.refillVolume += volume;
      }
      if (event.eventType === "theft" || event.eventType === "leak" || event.eventType === "drain") {
        entry.thefts += 1;
        entry.theftVolume += volume;
      }
      if (!entry.lastEventTime || new Date(event.eventTimestamp).getTime() > new Date(entry.lastEventTime).getTime()) {
        entry.lastEventTime = event.eventTimestamp;
        entry.lastLocation = event.location || entry.lastLocation;
      }
      map.set(event.vehicleId, entry);
    });
    return map;
  }, [fleetFuelEventsData]);

  const focusedVehicle = useMemo(() => {
    if (focusedVehicleData) return focusedVehicleData;
    return (vehiclesData || []).find((vehicle: any) => vehicle.id === currentVehicle) || null;
  }, [focusedVehicleData, vehiclesData, currentVehicle]);

  const focusedDailyMetrics = useMemo(() => {
    if (!currentVehicle) return [];
    return fleetDailyMetricsData.filter((metric: any) => metric.vehicleId === currentVehicle);
  }, [fleetDailyMetricsData, currentVehicle]);

  const focusedFuelEvents = useMemo(() => {
    if (!currentVehicle) return [];
    return fleetFuelEventsData.filter((event: any) => event.vehicleId === currentVehicle);
  }, [fleetFuelEventsData, currentVehicle]);

  const focusedRawSensorPoints = useMemo(() => {
    const parsed = (focusedRawSensorData || [])
      .map((row: any) => {
        const rawTimestamp =
          row?.timestamp ??
          row?.date ??
          row?.createdAt ??
          row?.created_at ??
          row?.payload?.timestamp ??
          row?.payload?.date ??
          row?.payload?.event_time;
        if (!rawTimestamp) return null;

        const timestamp = new Date(rawTimestamp);
        if (Number.isNaN(timestamp.getTime())) return null;

        // Canonical mapping: af = calibrated fuel, rf = raw fuel (no spike algorithm).
        const fuelValue = Number(
          row?.af ??
          row?.fuel ??
          row?.payload?.af ??
          row?.payload?.fuel
        );
        const rawFuelValue = Number(
          row?.rf ??
          row?.rawFuel ??
          row?.payload?.rf ??
          row?.payload?.rawFuel
        );

        return {
          time: timestamp.toISOString(),
          displayTime: formatDateTimeEAT(timestamp),
          dateKey: timestamp.toISOString().slice(0, 10),
          timestampMs: timestamp.getTime(),
          rawFuel: Number.isFinite(rawFuelValue) ? rawFuelValue : null,
          fuel: Number.isFinite(fuelValue) ? fuelValue : null,
          speed: toFiniteNumber(row?.speed ?? row?.spid ?? row?.payload?.speed ?? row?.payload?.spid),
          odometer: toFiniteNumber(row?.odometer ?? row?.odo ?? row?.payload?.odometer ?? row?.payload?.odo),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.timestampMs - b.timestampMs);

    if (parsed.length <= 720) return parsed;

    const step = Math.ceil(parsed.length / 720);
    const downsampled = parsed.filter((_: any, index: number) => index % step === 0);
    const lastPoint = parsed[parsed.length - 1];
    if (downsampled[downsampled.length - 1]?.time !== lastPoint.time) {
      downsampled.push(lastPoint);
    }

    return downsampled;
  }, [focusedRawSensorData]);

  const previewRawSensorPoints = useMemo<PreviewSensorPoint[]>(() => {
    return (previewRawSensorData || [])
      .map((row: any, index: number) => {
        const timestamp = toDate(
          row?.timestamp ??
          row?.date ??
          row?.createdAt ??
          row?.created_at ??
          row?.payload?.timestamp ??
          row?.payload?.date
        );
        if (!timestamp) return null;

        const fuelValue = Number(
          row?.af ??
          row?.fuel ??
          row?.payload?.af ??
          row?.payload?.fuel
        );
        const rawFuelValue = Number(
          row?.rf ??
          row?.rawFuel ??
          row?.payload?.rf ??
          row?.payload?.rawFuel
        );

        return {
          id: row?.id || `preview-${index}`,
          time: timestamp.toISOString(),
          displayTime: formatDateTimeEAT(timestamp),
          fuel: Number.isFinite(fuelValue) ? fuelValue : null,
          rawFuel: Number.isFinite(rawFuelValue) ? rawFuelValue : null,
        };
      })
      .filter((point: PreviewSensorPoint | null): point is PreviewSensorPoint => point !== null)
      .sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [previewRawSensorData]);

  const previewAssetLabel = useMemo(() => {
    if (!previewAssetId) return "Asset";
    const match = (vehiclesData as any[]).find((vehicle: any) => vehicle.id === previewAssetId);
    return getVehicleLabel(match) || previewAssetId;
  }, [previewAssetId, vehiclesData]);

  const focusedTotals = useMemo(
    () =>
      focusedDailyMetrics.reduce(
        (acc: { distance: number; engineHours: number; fuelUsed: number }, metric: any) => ({
          distance: acc.distance + Number(metric.totalDistanceTraveled || 0),
          engineHours: acc.engineHours + Number(metric.totalEngineHours || 0),
          fuelUsed: acc.fuelUsed + Number(metric.totalFuelConsumed || 0),
        }),
        { distance: 0, engineHours: 0, fuelUsed: 0 }
      ),
    [focusedDailyMetrics]
  );

  const focusedVehicleTodayDistance = toFiniteNumber(focusedVehicle?.totalDistance);
  const focusedVehicleTodayEngineHours = toFiniteNumber(focusedVehicle?.totalEngineHours);
  const focusedVehicleTodayFuelUsed = toFiniteNumber(focusedVehicle?.totalFuelUsed);
  const focusedMetricDistance = isTodaySelected
    ? (focusedVehicleTodayDistance ?? 0)
    : focusedTotals.distance + (rangeIncludesToday ? (focusedVehicleTodayDistance ?? 0) : 0);
  const focusedMetricEngineHours = isTodaySelected
    ? (focusedVehicleTodayEngineHours ?? 0)
    : focusedTotals.engineHours + (rangeIncludesToday ? (focusedVehicleTodayEngineHours ?? 0) : 0);
  const focusedMetricFuelUsed = isTodaySelected
    ? (focusedVehicleTodayFuelUsed ?? 0)
    : focusedTotals.fuelUsed + (rangeIncludesToday ? (focusedVehicleTodayFuelUsed ?? 0) : 0);

  const focusedRefillEvents = useMemo(
    () => focusedFuelEvents.filter((event: any) => event.eventType === "refill"),
    [focusedFuelEvents]
  );

  const focusedTheftEvents = useMemo(
    () => focusedFuelEvents.filter((event: any) => event.eventType === "theft" || event.eventType === "leak" || event.eventType === "drain"),
    [focusedFuelEvents]
  );

  const focusedMetricEventCounts = useMemo(
    () =>
      focusedDailyMetrics.reduce(
        (acc: { refills: number; thefts: number }, metric: any) => ({
          refills: acc.refills + Math.max(0, Math.trunc(Number(metric?.numberOfRefills || 0))),
          thefts: acc.thefts + Math.max(0, Math.trunc(Number(metric?.numberOfThefts || 0))),
        }),
        { refills: 0, thefts: 0 }
      ),
    [focusedDailyMetrics]
  );

  const focusedRefillVolume = focusedRefillEvents.reduce((sum: number, event: any) => sum + Math.abs(Number(event.volumeLiters || 0)), 0);
  const focusedTheftVolume = focusedTheftEvents.reduce((sum: number, event: any) => sum + Math.abs(Number(event.volumeLiters || 0)), 0);

  const fuelKPIs = useMemo(() => {
    const distance = focusedMetricDistance;
    const engineHours = focusedMetricEngineHours;
    const fuelUsed = focusedMetricFuelUsed;
    const derivedConsumptionKmPerL = deriveConsumption(distance, fuelUsed) ?? 0;
    const derivedConsumptionHrsPerL = deriveHoursPerLiter(engineHours, fuelUsed) ?? 0;
    const consumption = filterState.consumptionUnit === "KM/L"
      ? derivedConsumptionKmPerL
      : derivedConsumptionHrsPerL;
    return {
      currentFuel: Number(focusedVehicle?.currentFuelLevel || 0),
      fuelUsed,
      consumption,
      drainsCount: focusedTheftEvents.length,
      drainsVolume: focusedTheftVolume,
    };
  }, [
    focusedMetricDistance,
    focusedMetricEngineHours,
    focusedMetricFuelUsed,
    filterState.consumptionUnit,
    focusedVehicle,
    focusedTheftEvents.length,
    focusedTheftVolume,
  ]);

  const assetData = useMemo(() => {
    return {
      assetLabel: getVehicleLabel(focusedVehicle),
      workingDays: focusedVehicle?.workingDays || 0,
      parkingDays: focusedVehicle?.parkingDays || 0,
      totalDistance: focusedMetricDistance,
      totalEngineHours: focusedMetricEngineHours,
      totalFuelUsed: focusedMetricFuelUsed,
      totalRefillCounts: Math.max(focusedRefillEvents.length, focusedMetricEventCounts.refills),
      totalFuelTheftCounts: Math.max(focusedTheftEvents.length, focusedMetricEventCounts.thefts),
      totalRefills: focusedRefillVolume,
      totalThefts: focusedTheftVolume,
    };
  }, [
    focusedVehicle,
    focusedMetricDistance,
    focusedMetricEngineHours,
    focusedMetricFuelUsed,
    focusedRefillEvents.length,
    focusedTheftEvents.length,
    focusedMetricEventCounts,
    focusedRefillVolume,
    focusedTheftVolume,
  ]);

  const focusedTankCapacityValue =
    typeof focusedVehicle?.tankCapacity === "number" && Number.isFinite(focusedVehicle.tankCapacity)
      ? focusedVehicle.tankCapacity
      : null;
  const focusedTankCapacity = focusedTankCapacityValue ?? 0;
  const focusedConsumptionThresholds = useMemo(() => ({
    excellent: Number(filterState.consumptionExcellentThreshold || 0),
    acceptable: Number(filterState.consumptionAcceptableThreshold || 0),
    alert: Number(filterState.consumptionAlertThreshold || 0),
  }), [
    filterState.consumptionExcellentThreshold,
    filterState.consumptionAcceptableThreshold,
    filterState.consumptionAlertThreshold,
  ]);
  const focusedConsumptionBand = useMemo(() => {
    const value = fuelKPIs.consumption;
    if (!Number.isFinite(value)) {
      return {
        label: "No data",
        valueClass: "text-muted-foreground",
        chipClass: "border-border/30 bg-background/70 text-muted-foreground",
        panelClass: "border-border/20 bg-gradient-to-br from-muted/10 via-muted/5 to-transparent",
        iconClass: "text-muted-foreground",
      };
    }
    if (value >= focusedConsumptionThresholds.excellent) {
      return {
        label: "Efficient",
        valueClass: "text-emerald-700 dark:text-emerald-300",
        chipClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        panelClass: "border-emerald-500/15 bg-gradient-to-br from-emerald-500/12 via-teal-500/6 to-transparent",
        iconClass: "text-emerald-700 dark:text-emerald-300",
      };
    }
    if (value >= focusedConsumptionThresholds.acceptable) {
      return {
        label: "Average",
        valueClass: "text-amber-700 dark:text-amber-300",
        chipClass: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        panelClass: "border-amber-500/15 bg-gradient-to-br from-amber-500/12 via-orange-500/6 to-transparent",
        iconClass: "text-amber-700 dark:text-amber-300",
      };
    }
    if (value >= focusedConsumptionThresholds.alert) {
      return {
        label: "Watch",
        valueClass: "text-orange-700 dark:text-orange-300",
        chipClass: "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300",
        panelClass: "border-orange-500/15 bg-gradient-to-br from-orange-500/12 via-amber-500/6 to-transparent",
        iconClass: "text-orange-700 dark:text-orange-300",
      };
    }
    return {
      label: "Critical",
      valueClass: "text-destructive",
      chipClass: "border-destructive/20 bg-destructive/10 text-destructive",
      panelClass: "border-destructive/15 bg-gradient-to-br from-destructive/12 via-destructive/6 to-transparent",
      iconClass: "text-destructive",
    };
  }, [fuelKPIs.consumption, focusedConsumptionThresholds]);

  const fuelLevelChartData = useMemo(() => {
    const eventByDate = new Map<string, { refills: number; thefts: number }>();
    focusedFuelEvents.forEach((event: any) => {
      const dateKey = new Date(event.eventTimestamp).toISOString().split("T")[0];
      const entry = eventByDate.get(dateKey) || { refills: 0, thefts: 0 };
      if (event.eventType === "refill") entry.refills += Math.abs(Number(event.volumeLiters || 0));
      if (event.eventType === "theft" || event.eventType === "leak" || event.eventType === "drain") entry.thefts += Math.abs(Number(event.volumeLiters || 0));
      eventByDate.set(dateKey, entry);
    });

    if (!focusedVehicle) return [];

    if (focusedRawSensorPoints.length > 0) {
      const tankCapacity = Number(focusedVehicle.tankCapacity || 0);
      return focusedRawSensorPoints.map((point: any) => {
        const rawValue = point.rawFuel ?? point.fuel ?? 0;
        const fuelValue = point.fuel ?? point.rawFuel ?? rawValue;
        const raw = tankCapacity > 0 ? Math.max(0, Math.min(tankCapacity, rawValue)) : Math.max(0, rawValue);
        const fuel = tankCapacity > 0 ? Math.max(0, Math.min(tankCapacity, fuelValue)) : Math.max(0, fuelValue);
        return {
          time: point.time,
          displayTime: point.displayTime,
          dateKey: point.dateKey,
          timestampMs: point.timestampMs,
          raw,
          fuel,
          actualFuel: fuel,
          refillVolume: 0,
          theftVolume: 0,
          refillMarker: null,
          theftMarker: null,
        };
      });
    }

    if (focusedDailyMetrics.length === 0) {
      if (!isTodaySelected) return [];

      const currentFuel = Number(focusedVehicle?.currentFuelLevel ?? 0);
      if (!Number.isFinite(currentFuel)) return [];

      const time = new Date(fleetDateRange.endDate || new Date().toISOString());
      if (Number.isNaN(time.getTime())) return [];

      return [
        {
          time: time.toISOString(),
          displayTime: formatDateTimeEAT(time),
          dateKey: time.toISOString().slice(0, 10),
          timestampMs: time.getTime(),
          raw: currentFuel,
          fuel: currentFuel,
          actualFuel: currentFuel,
          refillVolume: 0,
          theftVolume: 0,
          refillMarker: null,
          theftMarker: null,
        },
      ];
    }

    const byDate = new Map<string, number>();
    focusedDailyMetrics.forEach((metric: any) => {
      const dateKey = new Date(metric.metricDate).toISOString().slice(0, 10);
      byDate.set(dateKey, (byDate.get(dateKey) || 0) + (metric.totalFuelConsumed || 0));
    });

    const dates = Array.from(byDate.keys()).sort();
    let runningFuel = Number(focusedVehicle.currentFuelLevel || 0);
    const fuelByDate = new Map<string, number>();

    for (let i = dates.length - 1; i >= 0; i--) {
      const dateKey = dates[i];
      fuelByDate.set(dateKey, runningFuel);
      const consumed = byDate.get(dateKey) || 0;
      const events = eventByDate.get(dateKey);
      runningFuel = runningFuel + consumed - (events?.refills || 0) + (events?.thefts || 0);
    }

    return dates.map((dateKey) => {
      const events = eventByDate.get(dateKey);
      const date = new Date(dateKey);
      const fuelLevel = Math.max(0, Math.min(Number(focusedVehicle.tankCapacity || 0) || fuelByDate.get(dateKey) || 0, fuelByDate.get(dateKey) || 0));
      const refillVolume = events?.refills || 0;
      const theftVolume = events?.thefts || 0;
      return {
        time: date.toISOString(),
        displayTime: formatDateTimeEAT(date),
        dateKey,
        timestampMs: date.getTime(),
        raw: fuelLevel,
        fuel: fuelLevel,
        actualFuel: fuelLevel,
        refillVolume,
        theftVolume,
        refillMarker: refillVolume > 0 ? fuelLevel : null,
        theftMarker: theftVolume > 0 ? fuelLevel : null,
      };
    });
  }, [focusedVehicle, focusedDailyMetrics, focusedFuelEvents, focusedRawSensorPoints, isTodaySelected, fleetDateRange.endDate]);

  const timeIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    fuelLevelChartData.forEach((row: any, index: number) => {
      map.set(row.time, index);
    });
    return map;
  }, [fuelLevelChartData]);

  const fuelByDateLabel = useMemo(() => {
    const map = new Map<string, number>();
    fuelLevelChartData.forEach((row: any) => {
      map.set(row.time, row.fuel || 0);
    });
    return map;
  }, [fuelLevelChartData]);

  const distanceByDateLabel = useMemo(() => {
    const map = new Map<string, number>();
    focusedDailyMetrics.forEach((metric: any) => {
      const date = new Date(metric.metricDate);
      if (Number.isNaN(date.getTime())) return;
      const dateKey = date.toISOString().slice(0, 10);
      map.set(dateKey, (map.get(dateKey) || 0) + Number(metric.totalDistanceTraveled || 0));
    });
    return map;
  }, [focusedDailyMetrics]);

  const chartMaxFuel = useMemo(() => {
    return fuelLevelChartData.reduce((max: number, row: any) => Math.max(max, row.fuel || 0), 0);
  }, [fuelLevelChartData]);

  const focusedChartTickFormatter = useMemo(() => {
    const distinctDays = new Set(
      fuelLevelChartData
        .map((point: any) => toEatDayKey(point.time))
        .filter((value: string | null): value is string => Boolean(value))
    );
    const multiDayRange = distinctDays.size > 1;

    return (value: unknown, index?: number): string => {
      const parsed = toDate(value);
      if (!parsed) return String(value ?? "");

      const currentDay = toEatDayKey(parsed);
      const previousDay =
        typeof index === "number" && index > 0 ? toEatDayKey(fuelLevelChartData[index - 1]?.time) : null;

      const timeLabel = eatTimeFormatter.format(parsed);
      if (!multiDayRange) return timeLabel;
      if (index === 0 || currentDay !== previousDay) {
        return `${eatDayLabelFormatter.format(parsed)} ${timeLabel}`;
      }
      return timeLabel;
    };
  }, [fuelLevelChartData]);

  const tripWindows = useMemo(() => {
    if (focusedRawSensorPoints.length < 2) return [];

    const windows: Array<{
      start: string;
      end: string;
      startLabel: string;
      endLabel: string;
      distanceKm: number;
      peakSpeedKph: number;
      durationMinutes: number;
    }> = [];

    let activeStartIndex: number | null = null;
    let peakSpeed = 0;

    const pointLooksMobile = (point: any, previousPoint?: any) => {
      const speed = Number(point?.speed ?? 0);
      const odo = Number(point?.odometer ?? 0);
      const prevOdo = Number(previousPoint?.odometer ?? odo);
      const odometerDelta = Number.isFinite(odo) && Number.isFinite(prevOdo) ? odo - prevOdo : 0;
      return speed >= 5 || odometerDelta > 0.05;
    };

    for (let index = 0; index < focusedRawSensorPoints.length; index += 1) {
      const point = focusedRawSensorPoints[index];
      const previousPoint = index > 0 ? focusedRawSensorPoints[index - 1] : null;
      const mobile = pointLooksMobile(point, previousPoint ?? undefined);
      peakSpeed = mobile ? Math.max(peakSpeed, Number(point?.speed ?? 0)) : peakSpeed;

      if (mobile && activeStartIndex === null) {
        activeStartIndex = index;
        peakSpeed = Math.max(0, Number(point?.speed ?? 0));
        continue;
      }

      if (!mobile && activeStartIndex !== null) {
        const startPoint = focusedRawSensorPoints[activeStartIndex];
        const endPoint = focusedRawSensorPoints[Math.max(activeStartIndex, index - 1)];
        const startOdo = Number(startPoint?.odometer ?? 0);
        const endOdo = Number(endPoint?.odometer ?? startOdo);
        const durationMinutes = Math.max(1, Math.round((Number(endPoint?.timestampMs ?? 0) - Number(startPoint?.timestampMs ?? 0)) / 60000));
        windows.push({
          start: startPoint.time,
          end: endPoint.time,
          startLabel: startPoint.displayTime,
          endLabel: endPoint.displayTime,
          distanceKm: Math.max(0, endOdo - startOdo),
          peakSpeedKph: peakSpeed,
          durationMinutes,
        });
        activeStartIndex = null;
        peakSpeed = 0;
      }
    }

    if (activeStartIndex !== null) {
      const startPoint = focusedRawSensorPoints[activeStartIndex];
      const endPoint = focusedRawSensorPoints[focusedRawSensorPoints.length - 1];
      const startOdo = Number(startPoint?.odometer ?? 0);
      const endOdo = Number(endPoint?.odometer ?? startOdo);
      const durationMinutes = Math.max(1, Math.round((Number(endPoint?.timestampMs ?? 0) - Number(startPoint?.timestampMs ?? 0)) / 60000));
      windows.push({
        start: startPoint.time,
        end: endPoint.time,
        startLabel: startPoint.displayTime,
        endLabel: endPoint.displayTime,
        distanceKm: Math.max(0, endOdo - startOdo),
        peakSpeedKph: peakSpeed,
        durationMinutes,
      });
    }

    return windows.filter((window) => window.durationMinutes >= 3 || window.distanceKm >= 0.2);
  }, [focusedRawSensorPoints]);

  const tripWindowByTime = useMemo(() => {
    const index = new Map<string, {
      start: string;
      end: string;
      startLabel: string;
      endLabel: string;
      distanceKm: number;
      peakSpeedKph: number;
      durationMinutes: number;
    }>();

    if (!tripWindows.length) return index;

    fuelLevelChartData.forEach((point: any) => {
      const pointTime = Number(point?.timestampMs ?? 0);
      const activeWindow = tripWindows.find((window) => {
        const start = Number(new Date(window.start).getTime());
        const end = Number(new Date(window.end).getTime());
        return pointTime >= start && pointTime <= end;
      });
      if (activeWindow) {
        index.set(point.time, activeWindow);
      }
    });

    return index;
  }, [fuelLevelChartData, tripWindows]);

  const behaviorBands = useMemo(() => {
    if (fuelLevelChartData.length < 2) return [];
    const tankCapacity = focusedTankCapacity || 0;
    const moderateDrop = tankCapacity > 0 ? tankCapacity * 0.08 : 10;
    const highDrop = tankCapacity > 0 ? tankCapacity * 0.15 : 20;

    const theftTimes = (
      focusedFuelEvents
        .filter((event: any) => event.eventType === "theft" || event.eventType === "leak" || event.eventType === "drain")
        .map((event: any) => new Date(event.eventTimestamp).getTime())
        .filter((value: number) => Number.isFinite(value))
    );

    const bands: Array<{ start: string; end: string; type: "normal" | "high" | "suspicious" | "theft" }> = [];
    let currentType: "normal" | "high" | "suspicious" | "theft" = "normal";
    let currentStart = fuelLevelChartData[0].time;

    for (let i = 1; i < fuelLevelChartData.length; i++) {
      const prev = fuelLevelChartData[i - 1];
      const curr = fuelLevelChartData[i];
      const delta = (prev.fuel || 0) - (curr.fuel || 0);
      const prevTime = Number(prev.timestampMs || 0);
      const currTime = Number(curr.timestampMs || 0);
      const hasTheftEvent = theftTimes.some((eventTime: number) => eventTime > prevTime && eventTime <= currTime);
      let type: "normal" | "high" | "suspicious" | "theft" = "normal";

      if (hasTheftEvent) {
        type = "theft";
      } else if (delta >= highDrop) {
        type = "suspicious";
      } else if (delta >= moderateDrop) {
        type = "high";
      }

      if (i === 1) {
        currentType = type;
      }

      if (type !== currentType) {
        bands.push({ start: currentStart, end: prev.time, type: currentType });
        currentStart = prev.time;
        currentType = type;
      }

      if (i === fuelLevelChartData.length - 1) {
        bands.push({ start: currentStart, end: curr.time, type: currentType });
      }
    }

    return bands;
  }, [fuelLevelChartData, focusedFuelEvents, focusedTankCapacity]);

  const eventMarkers = useMemo(() => {
    const offset = focusedTankCapacity > 0 ? focusedTankCapacity * 0.03 : 4;

    return focusedFuelEvents
      .filter((event: any) => event.eventType === "refill" || event.eventType === "theft" || event.eventType === "leak" || event.eventType === "drain")
      .map((event: any, index: number) => {
        const eventTime = new Date(event.eventTimestamp).getTime();
        if (!Number.isFinite(eventTime)) return null;

        let nearestPoint: any = null;
        let nearestDelta = Number.POSITIVE_INFINITY;
        for (const point of fuelLevelChartData) {
          const pointTime = Number(point.timestampMs || 0);
          const delta = Math.abs(pointTime - eventTime);
          if (delta < nearestDelta) {
            nearestDelta = delta;
            nearestPoint = point;
          }
        }

        if (!nearestPoint) return null;
        const baseFuel = Number(nearestPoint.fuel || 0);
        const isTheft = event.eventType === "theft" || event.eventType === "leak" || event.eventType === "drain";
        const jitter = (index % 3) * 1.6;
        const markerY = isTheft
          ? Math.max(baseFuel - offset - jitter, 0)
          : Math.min(baseFuel + offset + jitter, focusedTankCapacity || baseFuel + offset);

        return {
          id: event.id,
          time: nearestPoint.time,
          displayTime: nearestPoint.displayTime,
          dateKey: nearestPoint.dateKey,
          timestamp: event.eventTimestamp,
          markerY,
          fuelAtEvent: baseFuel,
          eventType: isTheft ? "theft" : "refill",
          volume: Math.abs(Number(event.volumeLiters || 0)),
          location: event.location || "Unknown location",
          notes: event.notes,
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        time: string;
        timestamp: string;
        markerY: number;
        fuelAtEvent: number;
        eventType: "refill" | "theft";
        volume: number;
        location: string;
        notes?: string;
      }>;
  }, [focusedFuelEvents, fuelLevelChartData, focusedTankCapacity]);

  const refillMarkers = useMemo(
    () => eventMarkers.filter((marker) => marker.eventType === "refill"),
    [eventMarkers]
  );

  const theftMarkers = useMemo(
    () => eventMarkers.filter((marker) => marker.eventType === "theft"),
    [eventMarkers]
  );

  const mostRecentRefill = refillMarkers
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  const mostRecentTheft = theftMarkers
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  const animateBrushTo = (targetStart: number, targetEnd: number) => {
    if (fuelLevelChartData.length === 0) return;
    const currentStart = brushRange?.startIndex ?? 0;
    const currentEnd = brushRange?.endIndex ?? fuelLevelChartData.length - 1;
    const steps = 6;
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      const nextStart = Math.round(currentStart + (targetStart - currentStart) * progress);
      const nextEnd = Math.round(currentEnd + (targetEnd - currentEnd) * progress);
      setTimeout(() => {
        setBrushRange({ startIndex: nextStart, endIndex: nextEnd });
      }, step * 60);
    }
  };

  const focusOnEvent = (event: typeof mostRecentRefill | typeof mostRecentTheft | null) => {
    if (!event) return;
    const index = timeIndexMap.get(event.time);
    if (index === undefined) return;

    const windowSize = Math.min(8, Math.max(4, fuelLevelChartData.length - 1));
    const startIndex = Math.max(0, index - Math.floor(windowSize / 2));
    const endIndex = Math.min(fuelLevelChartData.length - 1, startIndex + windowSize);

    animateBrushTo(startIndex, endIndex);
    setHighlightedEventId(event.id);
    setSelectedEvent(event);
    setForcedTooltip({ time: (event as any).displayTime || event.time, event });
    setTimeout(() => setHighlightedEventId(null), 3500);
    setTimeout(() => setForcedTooltip(null), 6000);
  };

  const handleMarkerEnter = (payload: any) => {
    if (!payload) return;
    setForcedTooltip({ time: payload.displayTime || payload.time, event: payload });
  };

  const handleMarkerLeave = (payload: any) => {
    if (selectedEvent && payload?.id === selectedEvent.id) return;
    setForcedTooltip(null);
  };


  const refuelEvents = useMemo(() => {
    return focusedRefillEvents.map((event: any) => ({
      time: formatDateTimeEAT(event.eventTimestamp),
      location: event.location || "Unknown location",
      volume: Math.abs(Number(event.volumeLiters || 0)),
      cost: filterState.currency === "UGX" ? event.costUGX : event.costKES,
    }));
  }, [focusedRefillEvents, filterState.currency]);

  const drainEvents = useMemo(() => {
    return focusedTheftEvents.map((event: any) => ({
      time: formatDateTimeEAT(event.eventTimestamp),
      location: event.location || "Unknown location",
      volume: Math.abs(Number(event.volumeLiters || 0)),
    }));
  }, [focusedTheftEvents]);

  const tripData = useMemo(() => {
    const location = focusedVehicle?.lastRoadName || "Unknown location";
    return focusedDailyMetrics.map((metric: any) => ({
      date: formatDate(metric?.metricDate),
      startTime: "--",
      endTime: "--",
      startLocation: location,
      endLocation: location,
      duration: `${toNumber(metric?.totalEngineHours).toFixed(2)} hr`,
      distance: toNumber(metric?.totalDistanceTraveled),
      fuelUsed: toNumber(metric?.totalFuelConsumed),
    }));
  }, [focusedDailyMetrics, focusedVehicle]);

  // Sync with selectedVehicle prop changes
  useEffect(() => {
    if (selectedVehicle && selectedVehicle !== currentVehicle) {
      setCurrentVehicle(selectedVehicle);
    }
  }, [selectedVehicle, currentVehicle]);

  // Initialize current vehicle from API data
  useEffect(() => {
    if (!currentVehicle && vehiclesData && vehiclesData.length > 0) {
      setCurrentVehicle(vehiclesData[0].id);
    }
  }, [currentVehicle, vehiclesData]);

  // Follow explicit single-vehicle selections from the global filter.
  // In focused mode this allows the page-level filter to switch assets cleanly.
  useEffect(() => {
    if (filterState.selectedVehicles.length !== 1) return;
    const selectedId = filterState.selectedVehicles[0];
    if (selectedId && selectedId !== currentVehicle) {
      setCurrentVehicle(selectedId);
    }
  }, [filterState.selectedVehicles, currentVehicle]);

  // Entering focused view defaults to a 7-day time window when coming from the table default ("today").
  useEffect(() => {
    if (viewMode !== "focused") return;
    if (fleetDateRange.preset !== "today") return;
    setFleetDateRange(getLast7DaysRange());
  }, [viewMode, fleetDateRange.preset]);

  // Focused view filter is single-asset only.
  useEffect(() => {
    if (viewMode !== "focused") return;
    const allowedIds = new Set(((vehiclesData as any[]) || []).map((vehicle: any) => vehicle.id));
    const currentIsValid = !!currentVehicle && allowedIds.has(currentVehicle);

    if (!currentIsValid) {
      const fallbackVehicleId = filterState.selectedVehicles.find((id) => allowedIds.has(id)) ?? (vehiclesData as any[])?.[0]?.id ?? "";
      if (fallbackVehicleId && fallbackVehicleId !== currentVehicle) {
        setCurrentVehicle(fallbackVehicleId);
      }
      if (fallbackVehicleId && (filterState.selectedVehicles.length !== 1 || filterState.selectedVehicles[0] !== fallbackVehicleId)) {
        filterActions.setSelectedVehicles([fallbackVehicleId]);
      }
      return;
    }

    if (filterState.selectedVehicles.length === 1 && filterState.selectedVehicles[0] === currentVehicle) return;
    filterActions.setSelectedVehicles([currentVehicle]);
  }, [viewMode, currentVehicle, filterState.selectedVehicles, filterActions, vehiclesData]);

  // Helper function to handle preview configuration changes
  const handlePreviewConfigChange = (field: string, value: any) => {
    if (tempSensorConfig) {
      setTempSensorConfig({
        ...tempSensorConfig,
        [field]: value
      });
    }
  };

  // Get fuel level chart data for preview from backend raw sensor stream.
  const getFuelLevelChartData = (_vehicleId: string, _dateRange: string, _config: any) => {
    return previewRawSensorPoints.map((reading: PreviewSensorPoint, index: number) => ({
      time: reading.displayTime,
      raw: reading.rawFuel ?? reading.fuel ?? 0,
      fuel: reading.fuel ?? reading.rawFuel ?? 0,
      timestamp: index,
    }));
  };

  // Detect refills from AF (calibrated fuel) in backend telemetry.
  const getRefuelEvents = (vehicleId: string, _dateRange: string, config: any) => {
    const fallbackLocation = fuelEventsByVehicle.get(vehicleId)?.lastLocation || "Unknown location";
    return previewRawSensorPoints
      .map((reading: PreviewSensorPoint, index: number) => {
        if (index === 0) return null;
        const prevReading = previewRawSensorPoints[index - 1];
        const currentFuel = Number(reading.fuel ?? 0);
        const previousFuel = Number(prevReading.fuel ?? 0);
        const change = currentFuel - previousFuel;
        if (change > config.suddenIncrease) {
          return {
            time: reading.displayTime,
            location: fallbackLocation,
            initialLiters: previousFuel,
            finalLiters: currentFuel,
            refilledLiters: change,
          } as const;
        }
        return null;
      })
      .filter((event): event is { time: string; location: string; initialLiters: number; finalLiters: number; refilledLiters: number } => event !== null);
  };

  // Detect drains from AF (calibrated fuel) in backend telemetry.
  const getFuelEventsPreview = (vehicleId: string, _dateRange: string, config: any) => {
    const fallbackLocation = fuelEventsByVehicle.get(vehicleId)?.lastLocation || "Unknown location";
    const drains: Array<{ time: string; location: string; initialFuel: number; finalFuel: number; amount: number }> = [];

    for (let i = 1; i < previewRawSensorPoints.length; i++) {
      const currentFuel = Number(previewRawSensorPoints[i].fuel ?? 0);
      const previousFuel = Number(previewRawSensorPoints[i - 1].fuel ?? 0);
      const diff = currentFuel - previousFuel;
      if (diff < -config.suddenDecrease) {
        drains.push({
          time: previewRawSensorPoints[i].displayTime,
          location: fallbackLocation,
          initialFuel: previousFuel,
          finalFuel: currentFuel,
          amount: Math.abs(diff),
        });
      }
    }

    return { drains };
  };

  // Helper functions
  const handleLocationClick = (location: string) => {
    setSelectedAssetLocation(location);
    setMapModalOpen(true);
  };

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return "No live update";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No live update";

    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60_000) return "Just now";

    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Moving":
        return "text-emerald-700 border-emerald-600 bg-emerald-50";
      case "Idling":
        return "text-amber-700 border-amber-500 bg-amber-50";
      case "Parked":
        return "text-slate-700 border-slate-400 bg-slate-50";
      case "Maintenance":
        return "text-orange-700 border-orange-500 bg-orange-50";
      case "Out of Service":
        return "text-red-700 border-red-500 bg-red-50";
      default: return "text-gray-600 border-gray-400 bg-gray-50";
    }
  };

  const getEfficiencyColor = (rating: string) => {
    switch (rating) {
      case "Excellent": return "text-green-600 border-green-600";
      case "Good": return "text-blue-600 border-blue-600";
      case "Poor": return "text-red-600 border-red-600";
      default: return "text-gray-600 border-gray-600";
    }
  };

  // Fleet overview data - all assets with key metrics (database-driven)
  const fleetAssets = useMemo(() => {
    const sourceVehicles = (vehiclesData as any[]) || [];
    return sourceVehicles.map((vehicle: any) => {
      const metrics = dailyMetricsByVehicle.get(vehicle.id);
      const events = fuelEventsByVehicle.get(vehicle.id);
      const tankCapacityValue =
        typeof vehicle.tankCapacity === "number" && Number.isFinite(vehicle.tankCapacity)
          ? vehicle.tankCapacity
          : null;
      const tankCapacity = tankCapacityValue ?? 0;
      const currentFuel = Number(vehicle.currentFuelLevel || 0);
      const fuelLevel = tankCapacity > 0 ? Math.round((currentFuel / tankCapacity) * 100) : 0;
      const vehicleDistanceToday = toFiniteNumber(vehicle.totalDistance);
      const vehicleEngineHoursToday = toFiniteNumber(vehicle.totalEngineHours);
      const vehicleFuelUsedToday = toFiniteNumber(vehicle.totalFuelUsed);
      const vehicleRefillCountToday = toFiniteNumber(
        vehicle.refillCount ?? vehicle.totalRefills ?? vehicle.totalRefillCounts ?? vehicle.numberOfRefills
      );
      const vehicleRefillVolumeToday = toFiniteNumber(
        vehicle.totalRefillVolume ?? vehicle.totalRefillsL ?? vehicle.refillVolume
      );
      const vehicleTheftCountToday = toFiniteNumber(
        vehicle.drainCount ?? vehicle.theftIncidents ?? vehicle.totalThefts ?? vehicle.totalFuelTheftCounts ?? vehicle.numberOfThefts
      );
      const vehicleTheftVolumeToday = toFiniteNumber(
        vehicle.totalDrainVolume ?? vehicle.totalTheftVolume ?? vehicle.theftVolume
      );

      const metricsDistance = metrics ? Number(metrics.distance) : null;
      const metricsEngineHours = metrics ? Number(metrics.engineHours) : null;
      const metricsFuelUsed = metrics ? Number(metrics.fuelUsed) : null;

      const distance = isTodaySelected
        ? vehicleDistanceToday
        : (metricsDistance ?? 0) + (rangeIncludesToday ? (vehicleDistanceToday ?? 0) : 0);
      const engineHours = isTodaySelected
        ? vehicleEngineHoursToday
        : (metricsEngineHours ?? 0) + (rangeIncludesToday ? (vehicleEngineHoursToday ?? 0) : 0);
      const fuelUsed = isTodaySelected
        ? vehicleFuelUsedToday
        : (metricsFuelUsed ?? 0) + (rangeIncludesToday ? (vehicleFuelUsedToday ?? 0) : 0);
      const derivedConsumptionKmPerL = deriveConsumption(distance, fuelUsed);
      const derivedConsumptionHrsPerL = deriveHoursPerLiter(engineHours, fuelUsed);

      const consumptionKmPerL = derivedConsumptionKmPerL;
      const consumptionHrsPerL = derivedConsumptionHrsPerL;
      const metricRefillCount = Math.max(0, Math.trunc(Number(metrics?.refills ?? 0)));
      const metricTheftCount = Math.max(0, Math.trunc(Number(metrics?.thefts ?? 0)));
      const refillCount = isTodaySelected
        ? Math.max(
          events?.refills ?? 0,
          Math.max(0, Math.trunc(vehicleRefillCountToday ?? 0))
        )
        : Math.max(events?.refills ?? 0, metricRefillCount);
      const theftIncidents = isTodaySelected
        ? Math.max(
          events?.thefts ?? 0,
          Math.max(0, Math.trunc(vehicleTheftCountToday ?? 0))
        )
        : Math.max(events?.thefts ?? 0, metricTheftCount);
      const refillVolume = isTodaySelected
        ? Math.max(events?.refillVolume ?? 0, Math.max(0, Number(vehicleRefillVolumeToday ?? 0)))
        : (events?.refillVolume ?? 0);
      const theftVolume = isTodaySelected
        ? Math.max(events?.theftVolume ?? 0, Math.max(0, Number(vehicleTheftVolumeToday ?? 0)))
        : (events?.theftVolume ?? 0);
      const liveRoadName = typeof vehicle.lastRoadName === "string" && vehicle.lastRoadName.trim().length > 0
        ? vehicle.lastRoadName.trim()
        : "Unknown";
      const liveGpsAtValue = vehicle.lastGpsAt ? new Date(vehicle.lastGpsAt) : null;
      const hasLiveGpsTimestamp = !!liveGpsAtValue && !Number.isNaN(liveGpsAtValue.getTime());

      return {
        id: vehicle.id,
        label: getVehicleLabel(vehicle),
        driver: vehicle.driverName || 'Unassigned',
        status: vehicle.status || 'Unknown',
        fuelLevel,
        fuelCapacity: tankCapacityValue,
        efficiency: consumptionKmPerL || 0,
        efficiencyRating: vehicle.efficiencyRating || 'Unknown',
        distance,
        engineHours,
        fuelUsed,
        consumptionKmPerL,
        consumptionHrsPerL,
        refillCount,
        theftIncidents,
        refillVolume,
        theftVolume,
        // Always use report_type=0 live snapshot fields for location and freshness.
        location: liveRoadName,
        lastUpdateAt: hasLiveGpsTimestamp ? liveGpsAtValue.toISOString() : null,
        lastUpdate: hasLiveGpsTimestamp ? formatDateTimeEAT(liveGpsAtValue) : "No live update",
      };
    });
  }, [vehiclesData, dailyMetricsByVehicle, fuelEventsByVehicle, isTodaySelected, rangeIncludesToday]);

  const fleetVehicleTodayTotals = useMemo(() => {
    return ((vehiclesData as any[]) || []).reduce(
      (
        acc: {
          refillCount: number;
          refillVolume: number;
          theftCount: number;
          theftVolume: number;
        },
        vehicle: any
      ) => {
        acc.refillCount += Math.max(
          0,
          Math.trunc(
            Number(vehicle?.refillCount ?? vehicle?.totalRefills ?? vehicle?.totalRefillCounts ?? vehicle?.numberOfRefills ?? 0)
          )
        );
        acc.refillVolume += Math.max(
          0,
          Number(vehicle?.totalRefillVolume ?? vehicle?.totalRefillsL ?? vehicle?.refillVolume ?? 0)
        );
        acc.theftCount += Math.max(
          0,
          Math.trunc(
            Number(vehicle?.drainCount ?? vehicle?.theftIncidents ?? vehicle?.totalThefts ?? vehicle?.totalFuelTheftCounts ?? vehicle?.numberOfThefts ?? 0)
          )
        );
        acc.theftVolume += Math.max(
          0,
          Number(vehicle?.totalDrainVolume ?? vehicle?.totalTheftVolume ?? vehicle?.theftVolume ?? 0)
        );
        return acc;
      },
      { refillCount: 0, refillVolume: 0, theftCount: 0, theftVolume: 0 }
    );
  }, [vehiclesData]);

  const fleetEventTotals = useMemo(() => {
    return fleetFuelEventsData.reduce(
      (
        acc: {
          refillCount: number;
          refillVolume: number;
          theftCount: number;
          theftVolume: number;
        },
        event: any
      ) => {
        const eventType = String(event?.eventType || "").toLowerCase();
        const volume = Math.max(0, Math.abs(Number(event?.volumeLiters || 0)));

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
    );
  }, [fleetFuelEventsData]);

  // Fleet-wide metrics for Proactive Scorecard
  const getFleetMetrics = () => {
    const movingAssets = fleetAssets.filter(asset => asset.status === "Moving").length;
    const parkedAssets = fleetAssets.filter(asset => asset.status === "Parked").length;
    const idlingAssets = fleetAssets.filter(asset => asset.status === "Idling").length;
    const totalFuelUsedInRange = fleetAssets.reduce((sum, asset) => sum + Math.max(0, Number(asset.fuelUsed || 0)), 0);

    const assetRefillCountTotal = fleetAssets.reduce((sum, asset) => sum + Math.max(0, Math.trunc(Number(asset.refillCount || 0))), 0);
    const assetRefillVolumeTotal = fleetAssets.reduce((sum, asset) => sum + Math.max(0, Number(asset.refillVolume || 0)), 0);
    const assetTheftCountTotal = fleetAssets.reduce((sum, asset) => sum + Math.max(0, Math.trunc(Number(asset.theftIncidents || 0))), 0);
    const assetTheftVolumeTotal = fleetAssets.reduce((sum, asset) => sum + Math.max(0, Number(asset.theftVolume || 0)), 0);

    const totalRefillsInRange = isTodaySelected
      ? Math.max(fleetVehicleTodayTotals.refillCount, fleetEventTotals.refillCount, assetRefillCountTotal)
      : (fleetEventTotals.refillCount || assetRefillCountTotal);
    const totalRefillVolumeInRange = isTodaySelected
      ? Math.max(fleetVehicleTodayTotals.refillVolume, fleetEventTotals.refillVolume, assetRefillVolumeTotal)
      : (fleetEventTotals.refillVolume || assetRefillVolumeTotal);
    const totalTheftsInRange = isTodaySelected
      ? Math.max(fleetVehicleTodayTotals.theftCount, fleetEventTotals.theftCount, assetTheftCountTotal)
      : (fleetEventTotals.theftCount || assetTheftCountTotal);
    const totalTheftVolumeInRange = isTodaySelected
      ? Math.max(fleetVehicleTodayTotals.theftVolume, fleetEventTotals.theftVolume, assetTheftVolumeTotal)
      : (fleetEventTotals.theftVolume || assetTheftVolumeTotal);

    return {
      movingAssets,
      idlingAssets,
      parkedAssets,
      totalFuelUsedInRange,
      totalRefillsInRange,
      totalRefillVolumeInRange,
      totalTheftsInRange,
      totalTheftVolumeInRange
    };
  };

  const fleetMetrics = getFleetMetrics();
  const selectedRangeLabel = fleetDateRange.label || "Selected Range";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Fleet Assets Header */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2 md:hidden">
          <div className="flex items-start gap-3">
            <HeadingLogo className="shrink-0" />
            <div className="space-y-1">
              <h1 className="text-2xl font-bold leading-tight text-foreground md:text-3xl">
                {viewMode === "table" ? "Fleet Assets" : "Focused Asset Performance"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {viewMode === "table"
                  ? "High-density overview of all fleet vehicles with key performance metrics"
                  : `Active Asset: ${assetData.assetLabel} | Real-time Health Monitor`
                }
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-card/20 p-1 backdrop-blur-sm">
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-7 px-2.5 py-1 text-[11px]"
            >
              Table View
            </Button>
            <Button
              variant={viewMode === "focused" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("focused")}
              className="h-7 px-2.5 py-1 text-[11px]"
            >
              Focused View
            </Button>
          </div>

          {/* Filter Controls - Moved from first row to replace period filter */}
          <FilterControls
            dateRangeOverride={fleetDateRange}
            onDateRangeOverrideChange={setFleetDateRange}
            defaultDatePreset={viewMode === "focused" ? "last_7_days" : "today"}
            vehicleSelectionMode={viewMode === "focused" ? "single" : "multiple"}
            compact
          />
        </div>
      </div>

      {viewMode === "table" ? (
        <>
          {/* Teletrac Fuel - Operational Command Center Redesign */}

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[11px] font-medium text-muted-foreground">
              Fleet overview for <span className="font-semibold text-foreground">{selectedRangeLabel}</span>
            </div>
            <Badge variant="outline" className="h-6 px-2 text-[10px] font-medium">
              Live DB-backed metrics
            </Badge>
          </div>

          {/* Proactive Scorecard (KPI Cards) */}
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <GlassCard className="card-surface-premium motion-premium p-4" data-testid="kpi-total-assets">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Total Assets</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {/* TODO: Focus Funnel to Focused Asset Performance */ }}
                  className="h-5 w-5 p-0 text-primary hover:bg-primary/20"
                  data-testid="focus-funnel-total-assets"
                >
                  <Target className="w-3 h-3" />
                </Button>
              </div>
              <div className="mb-1.5 text-3xl font-bold text-primary">
                {fleetAssets.length}
              </div>
              <div className="text-xs text-muted-foreground">All Fleet Vehicles</div>
            </GlassCard>

            <GlassCard className="card-surface-premium motion-premium p-4" data-testid="kpi-moving-assets">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Moving</span>
                </div>
              </div>
              <div className="mb-1.5 text-3xl font-bold text-primary">
                {fleetMetrics.movingAssets}
              </div>
              <div className="text-xs text-muted-foreground">Vehicles in motion</div>
            </GlassCard>

            <GlassCard className="card-surface-premium motion-premium p-4" data-testid="kpi-parked-assets">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Timer className="h-5 w-5 text-accent-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Parked</span>
                </div>
              </div>
              <div className="mb-1.5 text-3xl font-bold text-accent-foreground">
                {fleetMetrics.parkedAssets}
              </div>
              <div className="text-xs text-muted-foreground">
                {fleetMetrics.idlingAssets} idling
              </div>
            </GlassCard>

            <GlassCard className="card-surface-premium motion-premium p-4" data-testid="kpi-thefts-validation">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span className="text-xs font-medium text-muted-foreground">Thefts</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-destructive hover:bg-destructive/20"
                  onClick={() => {/* TODO: Focus Funnel to Focused Asset Performance */ }}
                  data-testid="focus-funnel-thefts"
                >
                  <Target className="w-3 h-3" />
                </Button>
              </div>
              <div className="mb-1 text-2xl font-bold text-destructive">
                {fleetMetrics.totalTheftsInRange}
              </div>
              <div className="text-xs text-muted-foreground">
                {fleetMetrics.totalTheftVolumeInRange.toFixed(1)} L loss volume
              </div>
            </GlassCard>

            <GlassCard className="card-surface-premium motion-premium p-4" data-testid="kpi-refills-validation">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Droplet className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Refills</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-primary hover:bg-primary/20"
                  onClick={() => {/* TODO: Focus Funnel to Focused Asset Performance */ }}
                  data-testid="focus-funnel-refills"
                >
                  <Target className="w-3 h-3" />
                </Button>
              </div>
              <div className="mb-1 text-2xl font-bold text-primary">
                {fleetMetrics.totalRefillsInRange}
              </div>
              <div className="text-xs text-muted-foreground">
                {fleetMetrics.totalRefillVolumeInRange.toFixed(1)} L refill volume
              </div>
            </GlassCard>
          </div>


          {/* Fleet Assets Table */}
          <GlassCard className="p-4" hover={false}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-base font-bold text-foreground">Fleet Assets</h3>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
                  {selectedRangeLabel}
                </Badge>
              </div>
              <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </div>

            {/* Fleet Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px] border-separate [border-spacing:0_6px]">
                <thead>
                  <tr className="border-b border-border/20 bg-muted/20">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Asset</th>
                    <th className="min-w-[280px] px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Alerts</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dist</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Hours</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fuel</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cons. ({consumptionUnitLabel})</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Location</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Updated (DB {DB_TIMEZONE_LABELS.report0Utc})</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Act.</th>
                  </tr>
                </thead>
                <tbody className="[&_tr>td]:align-top [&_tr>td]:bg-card/85 [&_tr>td]:border-y [&_tr>td]:border-border/30 [&_tr>td:first-child]:rounded-l-2xl [&_tr>td:first-child]:border-l [&_tr>td:last-child]:rounded-r-2xl [&_tr>td:last-child]:border-r [&_tr:hover>td]:bg-card [&_tr[data-active='true']>td]:border-primary/30 [&_tr[data-active='true']>td]:bg-primary/5">
                  {fleetAssets.map((asset) => (
                    <tr
                      key={asset.id}
                      data-active={currentVehicle === asset.id}
                      className="cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                      onClick={() => {
                        activateFocusedVehicle(asset.id);
                      }}
                    >
                      <td className="min-w-[290px] px-4 py-3">
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                                <Car className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <div className="font-semibold text-foreground text-sm">{asset.label}</div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">Fuel Snapshot</div>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] whitespace-nowrap ${getStatusColor(asset.status)}`}
                            >
                              {asset.status}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 font-semibold text-primary">
                              <Fuel className="h-3 w-3" />
                              {asset.fuelCapacity === null ? "N/A" : `${Math.round((asset.fuelLevel / 100) * asset.fuelCapacity)} L`}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1 font-semibold text-foreground">
                              Level {asset.fuelLevel}%
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1 font-semibold text-foreground">
                              Capacity {asset.fuelCapacity === null ? "--" : `${formatMetricNumber(asset.fuelCapacity, 0)} L`}
                            </span>
                          </div>

                          <div className="h-1.5 w-full rounded-full bg-border/50">
                            <div
                              className="h-1.5 rounded-full bg-primary transition-all duration-300"
                              style={{ width: `${asset.fuelLevel}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      {/* Alert Intelligence Column */}
                      <td className="min-w-[300px] px-3 py-2 text-center">
                        {(() => {
                          const refillCount = Math.max(0, Math.trunc(asset.refillCount ?? 0));
                          const theftCount = Math.max(0, Math.trunc(asset.theftIncidents ?? 0));
                          const refillTotal = Math.max(0, Number(asset.refillVolume ?? 0));
                          const theftTotal = Math.max(0, Number(asset.theftVolume ?? 0));
                          const pressureLabel =
                            theftTotal > 0 && refillTotal > 0
                              ? `${formatMetricNumber(refillTotal / Math.max(theftTotal, 1), 1)}x cover`
                              : refillTotal > 0
                                ? "Positive stock"
                                : theftTotal > 0
                                  ? "Loss only"
                                  : "No events";

                          return (
                            <div className="mx-auto w-full max-w-[320px]">
                              <div className="rounded-lg border border-border/30 bg-gradient-to-br from-card/90 via-card/75 to-muted/20 px-2.5 py-1 text-left shadow-[inset_0_1px_0_hsl(var(--background)/0.35)]">
                                <div className="mb-1 flex items-center justify-end">
                                  <div className="rounded-full border border-border/25 bg-background/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-foreground">
                                    {pressureLabel}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="grid grid-cols-[minmax(0,1fr)_34px_auto] items-center gap-2">
                                    <div className="min-w-0 rounded-md border border-primary/15 bg-primary/5 px-2 py-0.5">
                                      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                        <Droplet className="h-2.5 w-2.5" />
                                        <span>Refills</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-center">
                                      <div className="text-center text-xs font-semibold leading-none text-foreground">
                                        {refillCount}
                                      </div>
                                    </div>
                                    <div className="text-right leading-none">
                                      <div className="text-sm font-bold text-primary">
                                        {formatMetricNumber(refillTotal, 1)} L
                                      </div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-[minmax(0,1fr)_34px_auto] items-center gap-2 border-t border-border/20 pt-1">
                                    <div className="min-w-0 rounded-md border border-destructive/15 bg-destructive/5 px-2 py-0.5">
                                      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                                        <AlertTriangle className="h-2.5 w-2.5" />
                                        <span>Thefts</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-center">
                                      <div className="text-center text-xs font-semibold leading-none text-foreground">
                                        {theftCount}
                                      </div>
                                    </div>
                                    <div className="text-right leading-none">
                                      <div className="text-sm font-bold text-destructive">
                                        {formatMetricNumber(theftTotal, 1)} L
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="space-y-1">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Distance</div>
                          <div className="text-sm font-bold text-foreground">
                            {asset.distance === null ? "--" : `${formatMetricNumber(asset.distance, 1)} km`}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="space-y-1">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Working Hours</div>
                          <div className="text-sm font-bold text-foreground">
                            {asset.engineHours === null ? "--" : `${formatMetricNumber(asset.engineHours, 1)} hrs`}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="space-y-1">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fuel Used</div>
                          <div className="text-sm font-bold text-foreground">
                            {asset.fuelUsed === null || !Number.isFinite(asset.fuelUsed) ? "--" : `${formatMetricNumber(asset.fuelUsed, 1)} L`}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {(() => {
                          const selectedConsumption =
                            filterState.consumptionUnit === "KM/L"
                              ? asset.consumptionKmPerL
                              : asset.consumptionHrsPerL;
                          const consumption = typeof selectedConsumption === "number" && Number.isFinite(selectedConsumption)
                            ? selectedConsumption
                            : null;
                          const excellentThreshold = Number(filterState.consumptionExcellentThreshold || 0);
                          const acceptableThreshold = Number(filterState.consumptionAcceptableThreshold || 0);
                          const alertThreshold = Number(filterState.consumptionAlertThreshold || 0);
                          const valueTone =
                            consumption === null
                              ? "text-muted-foreground"
                              : consumption >= excellentThreshold
                                ? "text-emerald-700 dark:text-emerald-300"
                                : consumption >= acceptableThreshold
                                  ? "text-amber-700 dark:text-amber-300"
                                  : consumption >= alertThreshold
                                    ? "text-orange-600 dark:text-orange-300"
                                  : "text-destructive";
                          const bandLabel =
                            consumption === null
                              ? "No data"
                              : consumption >= excellentThreshold
                                ? "Efficient"
                                : consumption >= acceptableThreshold
                                  ? "Average"
                                  : consumption >= alertThreshold
                                    ? "Watch"
                                    : "Critical";

                          return (
                            <div className="mx-auto flex max-w-[180px] flex-col items-center gap-1 text-center">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Consumption</div>
                              <div className={`text-lg font-extrabold leading-none ${valueTone}`}>
                                {consumption === null ? "--" : formatMetricNumber(consumption, 3)}
                              </div>
                              <div className="text-[10px] font-medium text-muted-foreground">{bandLabel} | {consumptionUnitLabel}</div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="mx-auto w-full max-w-[200px] px-1 text-left">
                          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            Live Location
                          </div>
                          <div className="truncate text-xs font-semibold text-foreground">{asset.location}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="mx-auto w-full max-w-[165px] px-1 text-left">
                          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Last Update
                          </div>
                          <div className="text-xs font-semibold text-foreground">{asset.lastUpdate}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {formatRelativeTime(asset.lastUpdateAt)}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="mx-auto inline-flex items-center justify-center gap-1 p-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              activateFocusedVehicle(asset.id);
                            }}
                            className="h-7 w-7 rounded-md p-0 hover:bg-primary/10"
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPreviewAssetId(asset.id);
                              setTempSensorConfig(sensorConfigs[asset.id] || { ...DEFAULT_SENSOR_CONFIG });
                              setPreviewPanelOpen(true);
                            }}
                            className="h-7 w-7 rounded-md p-0 hover:bg-primary/10"
                          >
                            <Settings2 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLocationClick(asset.location)}
                            className="h-7 w-7 rounded-md p-0 hover:bg-primary/10"
                          >
                            <MapPin className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      ) : (
        <>
          {/* Focused Asset Performance View */}
          <div className="space-y-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium text-muted-foreground">
                Focused asset overview for <span className="font-semibold text-foreground">{selectedRangeLabel}</span>
              </div>
              <Badge variant="outline" className="h-6 px-2 text-[10px] font-medium">
                Live DB-backed metrics
              </Badge>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
              <GlassCard className="card-surface-premium motion-premium overflow-hidden p-4" data-testid="status-card">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{assetData.assetLabel}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                    {focusedVehicle?.status || "Unknown"}
                  </Badge>
                </div>
                <div className="rounded-xl border border-primary/10 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Current Fuel</div>
                      <div className="mt-1 text-3xl font-bold text-primary">{fuelKPIs.currentFuel.toFixed(0)}<span className="ml-1 text-base font-semibold">L</span></div>
                    </div>
                    <div className="space-y-1 text-right">
                      <div className="rounded-full border border-border/30 bg-background/70 px-2.5 py-1 text-xs font-semibold text-foreground">
                        {focusedTankCapacity > 0 ? ((fuelKPIs.currentFuel / focusedTankCapacity) * 100).toFixed(1) : "0.0"}%
                      </div>
                      <div className="text-[11px] font-medium text-muted-foreground">
                        Capacity{" "}
                        <span className="font-semibold text-foreground">
                          {focusedTankCapacityValue === null ? "N/A" : `${focusedTankCapacityValue} L`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/50">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-sky-400 transition-all duration-300"
                      style={{
                        width: `${Math.max(0, Math.min(100, focusedTankCapacity > 0 ? (fuelKPIs.currentFuel / focusedTankCapacity) * 100 : 0))}%`,
                      }}
                    />
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="card-surface-premium motion-premium overflow-hidden p-4" data-testid="consumption-card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Consumption</span>
                  <Gauge className={`h-4 w-4 ${focusedConsumptionBand.iconClass}`} />
                </div>
                <div className={`rounded-xl border p-3 ${focusedConsumptionBand.panelClass}`}>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Efficiency</div>
                      <div className={`mt-1 text-3xl font-bold ${focusedConsumptionBand.valueClass}`}>
                        {fuelKPIs.consumption.toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-full border border-border/30 bg-background/70 px-2.5 py-1 text-[11px] font-semibold text-foreground">
                      {consumptionUnitLabel}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {filterState.consumptionUnit === "KM/L" ? "Distance per liter" : "Engine hours per liter"}
                  </div>
                  <div className={`rounded-full border px-2 py-1 text-[10px] font-medium ${focusedConsumptionBand.chipClass}`}>
                    {focusedConsumptionBand.label}
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="card-surface-premium motion-premium overflow-hidden p-4" data-testid="focused-fuel-used-card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Fuel Used</span>
                  <Fuel className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-xl border border-primary/10 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Drawdown</div>
                  <div className="mt-1 text-3xl font-bold text-primary">{assetData.totalFuelUsed.toFixed(1)}<span className="ml-1 text-base font-semibold">L</span></div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">Aggregate consumption in scope</div>
              </GlassCard>

              <GlassCard className="card-surface-premium motion-premium overflow-hidden p-4" data-testid="total-distance-card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Distance</span>
                  <Route className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-xl border border-primary/10 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Coverage</div>
                  <div className="mt-1 text-3xl font-bold text-sky-700 dark:text-sky-300">{assetData.totalDistance.toFixed(1)}<span className="ml-1 text-base font-semibold">km</span></div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">Distance traveled in scope</div>
              </GlassCard>

              <GlassCard className="card-surface-premium motion-premium overflow-hidden p-4" data-testid="active-hours-card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Engine Hours</span>
                  <Clock className="h-4 w-4 text-accent-foreground" />
                </div>
                <div className="rounded-xl border border-accent/10 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Runtime</div>
                  <div className="mt-1 text-3xl font-bold text-amber-700 dark:text-amber-300">{assetData.totalEngineHours.toFixed(1)}<span className="ml-1 text-base font-semibold">hrs</span></div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">Engine running time in scope</div>
              </GlassCard>

              <GlassCard className="card-surface-premium motion-premium overflow-hidden p-4" data-testid="fuel-events-card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Fuel Events</span>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </div>
                <div className="rounded-xl border border-border/25 bg-gradient-to-br from-slate-500/10 via-card/95 to-muted/25 p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Event Balance</div>
                    <div className="rounded-full border border-border/25 bg-background/60 px-2 py-0.5 text-[10px] font-medium text-foreground">
                      {assetData.totalRefillCounts + fuelKPIs.drainsCount} tracked
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-primary/12 bg-gradient-to-br from-primary/[0.10] via-primary/[0.06] to-transparent px-2.5 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-primary dark:text-primary-foreground">Refills</div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{assetData.totalRefillCounts}</span>
                        <span className="text-base font-bold text-primary">{assetData.totalRefills.toFixed(1)} L</span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-destructive/12 bg-gradient-to-br from-destructive/[0.10] via-destructive/[0.06] to-transparent px-2.5 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-destructive dark:text-red-300">Drains</div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{fuelKPIs.drainsCount}</span>
                        <span className="text-base font-bold text-destructive">{fuelKPIs.drainsVolume.toFixed(1)} L</span>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Interactive Fuel Level Chart */}
            <GlassCard className="p-6" hover={false}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Actual Fuel Level Monitoring</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-2 py-1">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      Actual fuel level
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/15 bg-sky-500/5 px-2 py-1">
                      <span className="h-2 w-2 rounded-full bg-sky-400" />
                      Trip window
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/15 bg-destructive/5 px-2 py-1">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      Drain marker
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Raw sensor stream: DB {DB_TIMEZONE_LABELS.report0Utc} • Trip and fuel-event markers: DB {DB_TIMEZONE_LABELS.webhookLocal}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={showRawLine ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowRawLine((value) => !value)}
                  >
                    {showRawLine ? "Hide raw overlay" : "Show raw overlay"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => focusOnEvent(mostRecentTheft)}
                    disabled={!mostRecentTheft}
                  >
                    <AlertTriangle className="w-3 h-3 mr-2 text-destructive" />
                    Jump to Theft
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => focusOnEvent(mostRecentRefill)}
                    disabled={!mostRecentRefill}
                  >
                    <Fuel className="w-3 h-3 mr-2 text-primary" />
                    Jump to Refill
                  </Button>
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fuelLevelChartData} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="2 5" stroke="hsl(var(--border))" strokeOpacity={0.28} vertical={false} />
                    <XAxis
                      dataKey="time"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      minTickGap={32}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={focusedChartTickFormatter}
                    />
                    <YAxis
                      domain={[0, focusedTankCapacity || 1]}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tickFormatter={(value: number) => `${Math.round(Number(value) || 0)}L`}
                      label={{ value: 'Fuel (L)', angle: -90, position: 'insideLeft' }}
                    />
                    {tripWindows.map((window, index) => (
                      <ReferenceArea
                        key={`trip-${window.start}-${index}`}
                        ifOverflow="extendDomain"
                        x1={window.start}
                        x2={window.end}
                        y1={0}
                        y2={focusedTankCapacity || chartMaxFuel || undefined}
                        stroke="transparent"
                        fill="url(#tripWindowGradient)"
                        isFront={false}
                      />
                    ))}
                    {behaviorBands.map((band, index) => {
                      const fillColor =
                        band.type === "theft"
                          ? "rgba(239,68,68,0.14)"
                          : band.type === "suspicious"
                            ? "rgba(249,115,22,0.14)"
                            : band.type === "high"
                              ? "rgba(234,179,8,0.14)"
                              : "rgba(34,197,94,0.10)";

                      return (
                        <ReferenceArea
                          key={`${band.start}-${band.end}-${index}`}
                          ifOverflow="extendDomain"
                          x1={band.start}
                          x2={band.end}
                          y1={0}
                          y2={focusedTankCapacity || chartMaxFuel || undefined}
                          stroke="transparent"
                          fill={fillColor}
                          isFront={false}
                        />
                      );
                    })}
                    <Tooltip
                      active={forcedTooltip ? true : undefined}
                      content={({ active, payload, label }) => {
                        const forced = forcedTooltip?.event || null;
                        const showPayload = forced ? null : payload;
                        const row = forced
                          ? {
                            dateKey: (forced as any).dateKey,
                            refillVolume: forced.eventType === "refill" ? forced.volume : 0,
                            theftVolume: forced.eventType === "theft" ? forced.volume : 0,
                          }
                          : (showPayload?.[0]?.payload || {});
                        const showLabel = forced
                          ? forcedTooltip.time
                          : (row.displayTime ?? label);
                        if ((!active || !showPayload || showPayload.length === 0) && !forced) return null;

                        const distance =
                          row?.dateKey && typeof row.dateKey === "string"
                            ? distanceByDateLabel.get(row.dateKey)
                            : undefined;
                        const refillVolume = row.refillVolume || 0;
                        const theftVolume = row.theftVolume || 0;
                        const activeTripWindow = forced
                          ? tripWindowByTime.get(forcedTooltip?.time ?? "")
                          : tripWindowByTime.get(row.time ?? String(label ?? ""));
                        return (
                          <div className="w-[260px] rounded-xl border border-border/60 bg-card/95 px-3 py-3 text-xs shadow-xl backdrop-blur-sm">
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                  {forced ? "Event focus" : "Fuel reading"}
                                </div>
                                <div className="mt-1 font-semibold text-foreground">{showLabel}</div>
                              </div>
                              <div className="rounded-full border border-border/25 bg-background/70 px-2 py-1 text-[10px] font-medium text-foreground">
                                {forced ? "Pinned" : "Live"}
                              </div>
                            </div>
                            <div className="space-y-2">
                              {!forced &&
                                payload
                                  ?.filter((item) => item.dataKey === "raw" || item.dataKey === "fuel")
                                  .map((item) => (
                                    <div key={item.dataKey} className="flex items-center justify-between gap-3 rounded-lg border border-border/25 bg-background/40 px-2.5 py-2">
                                      <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Fuel className={`h-3 w-3 ${item.dataKey === "raw" ? "text-muted-foreground" : "text-primary"}`} />
                                        {item.dataKey === "raw" ? "Raw overlay" : "Actual fuel"}
                                      </span>
                                      <span className={`font-mono font-semibold ${item.dataKey === "raw" ? "text-muted-foreground" : "text-foreground"}`}>
                                        {Number(item.value).toFixed(1)} L
                                      </span>
                                    </div>
                                  ))}
                              {typeof distance === "number" && (
                                <div className="flex items-center justify-between gap-2 rounded-lg border border-border/25 bg-background/40 px-2.5 py-2">
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Route className="h-3 w-3" />
                                    Distance
                                  </span>
                                  <span className="font-mono font-semibold text-foreground">{distance.toFixed(1)} km</span>
                                </div>
                              )}
                              {activeTripWindow && (
                                <>
                                  <div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.06] px-2.5 py-2">
                                    <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Trip window</div>
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">Window</span>
                                        <span className="font-medium text-sky-700 dark:text-sky-300">
                                          {activeTripWindow.startLabel} to {activeTripWindow.endLabel}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">Distance</span>
                                        <span className="font-mono font-semibold text-foreground">
                                          {activeTripWindow.distanceKm.toFixed(1)} km
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">Duration</span>
                                        <span className="font-mono font-semibold text-foreground">
                                          {activeTripWindow.durationMinutes} min
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">Peak speed</span>
                                        <span className="font-mono font-semibold text-foreground">
                                          {activeTripWindow.peakSpeedKph.toFixed(0)} km/h
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                              {refillVolume > 0 && (
                                <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/15 bg-primary/[0.06] px-2.5 py-2">
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Fuel className="h-3 w-3 text-primary" />
                                    Refills
                                  </span>
                                  <span className="font-mono font-semibold text-primary">+{refillVolume.toFixed(1)} L</span>
                                </div>
                              )}
                              {theftVolume > 0 && (
                                <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/15 bg-destructive/[0.06] px-2.5 py-2">
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <AlertTriangle className="h-3 w-3 text-destructive" />
                                    Drains
                                  </span>
                                  <span className="font-mono font-semibold text-destructive">-{theftVolume.toFixed(1)} L</span>
                                </div>
                              )}
                              {forced && (
                                <>
                                  <div className="rounded-lg border border-border/25 bg-background/40 px-2.5 py-2 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Event</span>
                                    <span className="font-medium text-foreground capitalize">{forced.eventType}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Time ({DB_TIMEZONE_LABELS.webhookLocal})</span>
                                    <span className="font-medium text-foreground">
                                      {formatDateTimeEAT(forced.timestamp)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Fuel Change</span>
                                    <span className={forced.eventType === "theft" ? "font-medium text-destructive" : "font-medium text-primary"}>
                                      {forced.eventType === "theft" ? "-" : "+"}{forced.volume.toFixed(1)} L
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Location</span>
                                    <span className="font-medium text-foreground">{forced.location}</span>
                                  </div>
                                  </div>
                                  <div className="text-muted-foreground italic">
                                    {forced.eventType === "theft"
                                      ? "Unusual drain pattern detected."
                                      : "Refill recorded with normal behavior."}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <defs>
                      <linearGradient id="tripWindowGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="actualFuelAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.42} />
                        <stop offset="45%" stopColor="#38bdf8" stopOpacity={0.24} />
                        <stop offset="70%" stopColor="#2563eb" stopOpacity={0.14} />
                        <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="actualFuelStrokeGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="50%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#2563eb" />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="actualFuel"
                      stroke="url(#actualFuelStrokeGradient)"
                      strokeWidth={3.25}
                      fill="url(#actualFuelAreaGradient)"
                      fillOpacity={1}
                      dot={false}
                      name="Actual fuel level"
                      isAnimationActive
                      animationDuration={550}
                      animationEasing="ease-out"
                    />
                    {showRawLine && (
                      <Line
                        type="monotone"
                        dataKey="raw"
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth={1.15}
                        strokeDasharray="5 5"
                        dot={false}
                        name="Raw sensor overlay"
                        isAnimationActive
                        animationDuration={550}
                        animationEasing="ease-out"
                      />
                    )}
                    <Scatter
                      data={refillMarkers}
                      fill="hsl(var(--primary))"
                      shape={(props: any) => {
                        const { cx, cy, payload } = props;
                        const isHighlighted = payload?.id === highlightedEventId;
                        return (
                          <g transform={`translate(${cx}, ${cy})`} cursor="pointer">
                            {isHighlighted && (
                              <circle r={11} fill="rgba(59,130,246,0.22)" className="animate-ping" />
                            )}
                            <circle r={9} fill="rgba(59,130,246,0.18)" stroke="rgba(59,130,246,0.45)" strokeWidth={1} />
                            <circle r={5.5} fill="rgba(255,255,255,0.92)" />
                            <Fuel className="w-3.5 h-3.5 text-primary" x={-7} y={-7} />
                          </g>
                        );
                      }}
                      name="Refill"
                      isAnimationActive
                      onClick={(data: any) => {
                        if (data?.payload) {
                          setSelectedEvent(data.payload);
                          setForcedTooltip({ time: data.payload.displayTime || data.payload.time, event: data.payload });
                          setHighlightedEventId(data.payload.id);
                          setTimeout(() => setHighlightedEventId(null), 3500);
                        }
                      }}
                      onMouseEnter={(data: any) => handleMarkerEnter(data?.payload)}
                      onMouseLeave={(data: any) => handleMarkerLeave(data?.payload)}
                    />
                    <Scatter
                      data={theftMarkers}
                      fill="hsl(var(--destructive))"
                      shape={(props: any) => {
                        const { cx, cy, payload } = props;
                        const isHighlighted = payload?.id === highlightedEventId;
                        return (
                          <g transform={`translate(${cx}, ${cy})`} cursor="pointer">
                            {isHighlighted && (
                              <circle r={11} fill="rgba(239,68,68,0.22)" className="animate-ping" />
                            )}
                            <circle r={9} fill="rgba(239,68,68,0.18)" stroke="rgba(239,68,68,0.45)" strokeWidth={1} />
                            <circle r={5.5} fill="rgba(255,255,255,0.92)" />
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive" x={-7} y={-7} />
                          </g>
                        );
                      }}
                      name="Theft"
                      isAnimationActive
                      onClick={(data: any) => {
                        if (data?.payload) {
                          setSelectedEvent(data.payload);
                          setForcedTooltip({ time: data.payload.displayTime || data.payload.time, event: data.payload });
                          setHighlightedEventId(data.payload.id);
                          setTimeout(() => setHighlightedEventId(null), 3500);
                        }
                      }}
                      onMouseEnter={(data: any) => handleMarkerEnter(data?.payload)}
                      onMouseLeave={(data: any) => handleMarkerLeave(data?.payload)}
                    />
                    <Brush
                      dataKey="time"
                      height={30}
                      stroke="hsl(var(--primary))"
                      startIndex={brushRange?.startIndex}
                      endIndex={brushRange?.endIndex}
                      onChange={(range) => {
                        if (!range) return;
                        setBrushRange({
                          startIndex: range.startIndex ?? 0,
                          endIndex: range.endIndex ?? fuelLevelChartData.length - 1,
                        });
                        setForcedTooltip(null);
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {/* Refuels Table */}
            <GlassCard className="p-6" hover={false}>
              <div className="flex items-center gap-2 mb-6">
                <Fuel className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Refuel Events</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/20">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Time (DB {DB_TIMEZONE_LABELS.webhookLocal})
                        </div>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          Location
                        </div>
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-foreground">Volume (L)</th>
                      <th className="text-center py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-primary" />
                          Cost ({filterState.currency})
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {refuelEvents.map((event: any, index: number) => (
                      <tr key={index} className="border-b border-border/10 ">
                        <td className="py-3 px-4 text-sm text-foreground">{event.time}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">{event.location}</td>
                        <td className="py-3 px-4 text-center text-sm font-medium">{event.volume.toFixed(1)}</td>
                        <td className="py-3 px-4 text-center text-sm font-bold text-primary">
                          {event.cost ? Number(event.cost).toLocaleString() : "-"}
                        </td>
                      </tr>
                    ))}
                    {refuelEvents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          No refuel events recorded
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>

            {/* Drains Table */}
            <GlassCard className="p-6" hover={false}>
              <div className="flex items-center gap-2 mb-6">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <h3 className="text-lg font-bold text-foreground">Fuel Drain Events</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/20">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Time (DB {DB_TIMEZONE_LABELS.webhookLocal})
                        </div>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          Location
                        </div>
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="w-4 h-4 text-destructive" />
                          Volume (L)
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {drainEvents.map((event: any, index: number) => (
                      <tr key={index} className="border-b border-border/10 ">
                        <td className="py-3 px-4 text-sm text-foreground">{event.time}</td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">{event.location}</td>
                        <td className="py-3 px-4 text-center text-sm font-bold text-destructive">-{event.volume.toFixed(1)}</td>
                      </tr>
                    ))}
                    {drainEvents.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-muted-foreground">
                          No drain events recorded
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>

            {/* Completed Trips Table */}
            <GlassCard className="p-6" hover={false}>
              <div className="flex items-center gap-2 mb-6">
                <Route className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Completed Trips</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/20">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Date
                        </div>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          Route
                        </div>
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Duration
                        </div>
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <Route className="w-4 h-4" />
                          Distance
                        </div>
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <Fuel className="w-4 h-4" />
                          Fuel Used
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripData.map((trip: any, index: number) => (
                      <tr key={index} className="border-b border-border/10 ">
                        <td className="py-3 px-4">
                          <div className="text-sm font-medium text-foreground">{trip.date}</div>
                          <div className="text-xs text-muted-foreground">{trip.startTime} - {trip.endTime}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-foreground">{trip.startLocation}</div>
                            <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            <div className="text-sm font-medium text-foreground">{trip.endLocation}</div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center text-sm font-medium text-accent-foreground">{trip.duration}</td>
                        <td className="py-3 px-4 text-center text-sm font-medium">{trip.distance.toFixed(1)} km</td>
                        <td className="py-3 px-4 text-center text-sm font-medium">{trip.fuelUsed.toFixed(1)} L</td>
                      </tr>
                    ))}
                    {tripData.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          No trip data available for the selected range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        </>
      )}

      {/* Sensor Configuration Modal */}
      <Dialog open={sensorConfigOpen} onOpenChange={setSensorConfigOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              Sensor Configuration - {assetData.assetLabel}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Tank Capacity Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Tank Capacity</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tankCapacity">Tank Capacity (L)</Label>
                  <Input
                    id="tankCapacity"
                    type="number"
                    value={sensorConfig.tankCapacity}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        tankCapacity: parseInt(e.target.value) || 600
                      }
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="useTankCapacity">Use Tank Capacity</Label>
                  <div className="flex items-center space-x-2 pt-2">
                    <Switch
                      id="useTankCapacity"
                      checked={sensorConfig.useTankCapacity}
                      onCheckedChange={(checked) => setSensorConfigs(prev => ({
                        ...prev,
                        [currentVehicle]: {
                          ...prev[currentVehicle],
                          useTankCapacity: checked
                        }
                      }))}
                    />
                    <span className="text-sm text-muted-foreground">
                      {sensorConfig.useTankCapacity ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Averaging and Filtering */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Data Processing</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="averaging">Averaging Window</Label>
                  <Input
                    id="averaging"
                    type="number"
                    value={sensorConfig.averaging}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        averaging: parseInt(e.target.value) || 20
                      }
                    }))}
                  />
                  <p className="text-xs text-muted-foreground">Data points to average</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ignoreOffIgnition">Ignore Off Ignition</Label>
                  <div className="flex items-center space-x-2 pt-2">
                    <Switch
                      id="ignoreOffIgnition"
                      checked={sensorConfig.ignoreOffIgnition}
                      onCheckedChange={(checked) => setSensorConfigs(prev => ({
                        ...prev,
                        [currentVehicle]: {
                          ...prev[currentVehicle],
                          ignoreOffIgnition: checked
                        }
                      }))}
                    />
                    <span className="text-sm text-muted-foreground">
                      {sensorConfig.ignoreOffIgnition ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Spike Detection */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Spike Detection</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="spikeStart">Spike Start (%)</Label>
                  <Input
                    id="spikeStart"
                    type="number"
                    value={sensorConfig.spikeStart}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        spikeStart: parseInt(e.target.value) || 5
                      }
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spikeDuration">Duration (min)</Label>
                  <Input
                    id="spikeDuration"
                    type="number"
                    value={sensorConfig.spikeDuration}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        spikeDuration: parseInt(e.target.value) || 10
                      }
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spikeReturn">Return (%)</Label>
                  <Input
                    id="spikeReturn"
                    type="number"
                    value={sensorConfig.spikeReturn}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        spikeReturn: parseInt(e.target.value) || 10
                      }
                    }))}
                  />
                </div>
              </div>
            </div>

            {/* Calibration Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Calibration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="calibrationType">Calibration Type</Label>
                  <Select
                    value={sensorConfig.calibrationType}
                    onValueChange={(value) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        calibrationType: value as "incremental" | "absolute"
                      }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="incremental">Incremental</SelectItem>
                      <SelectItem value="absolute">Absolute</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sensorEventsEnabled">Sensor Events</Label>
                  <div className="flex items-center space-x-2 pt-2">
                    <Switch
                      id="sensorEventsEnabled"
                      checked={sensorConfig.sensorEventsEnabled}
                      onCheckedChange={(checked) => setSensorConfigs(prev => ({
                        ...prev,
                        [currentVehicle]: {
                          ...prev[currentVehicle],
                          sensorEventsEnabled: checked
                        }
                      }))}
                    />
                    <span className="text-sm text-muted-foreground">
                      {sensorConfig.sensorEventsEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Threshold Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Event Thresholds</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="suddenIncrease">Sudden Increase (L)</Label>
                  <Input
                    id="suddenIncrease"
                    type="number"
                    value={sensorConfig.suddenIncrease}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        suddenIncrease: parseInt(e.target.value) || 35
                      }
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="suddenDecrease">Sudden Decrease (L)</Label>
                  <Input
                    id="suddenDecrease"
                    type="number"
                    value={sensorConfig.suddenDecrease}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        suddenDecrease: parseInt(e.target.value) || 20
                      }
                    }))}
                  />
                </div>
              </div>
            </div>

            {/* Range Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Valid Range</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rangeLow">Low (L)</Label>
                  <Input
                    id="rangeLow"
                    type="number"
                    value={sensorConfig.rangeLow}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        rangeLow: parseInt(e.target.value) || 100
                      }
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rangeHigh">High (L)</Label>
                  <Input
                    id="rangeHigh"
                    type="number"
                    value={sensorConfig.rangeHigh}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        rangeHigh: parseInt(e.target.value) || 450
                      }
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rangeViolationCount">Violation Count</Label>
                  <Input
                    id="rangeViolationCount"
                    type="number"
                    value={sensorConfig.rangeViolationCount}
                    onChange={(e) => setSensorConfigs(prev => ({
                      ...prev,
                      [currentVehicle]: {
                        ...prev[currentVehicle],
                        rangeViolationCount: parseInt(e.target.value) || 10
                      }
                    }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setSensorConfigOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                setSensorConfigs(prev => ({
                  ...prev,
                  [currentVehicle]: sensorConfig
                }));
                setSensorConfigOpen(false);
              }}>
                Save Configuration
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enhanced Sensor Configuration Preview Panel */}
      {previewPanelOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="fixed inset-0 z-50 flex">
            {/* Left Panel - Settings */}
            <div className="w-1/2 bg-card border-r border-border overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-6 h-6 text-primary" />
                    <h2 className="text-2xl font-bold text-foreground">Sensor Configuration</h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewPanelOpen(false)}
                    className="h-8 w-8 p-0"
                  >
                    <span className="sr-only">Close</span>
                    ×
                  </Button>
                </div>

                {previewAssetId && tempSensorConfig && (
                  <div className="space-y-6">
                    {/* Asset Info */}
                    <GlassCard className="p-4">
                      <h3 className="text-lg font-semibold text-foreground mb-3">{previewAssetLabel}</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Tank Capacity:</span>
                          <span className="font-medium ml-2">{tempSensorConfig.tankCapacity}L</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Calibration:</span>
                          <span className="font-medium ml-2 capitalize">{tempSensorConfig.calibrationType}</span>
                        </div>
                      </div>
                    </GlassCard>

                    {/* Date Range Selector */}
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold">Preview Date Range</Label>
                      <Select value={previewDateRange} onValueChange={(value) => setPreviewDateRange(value as "today" | "week" | "month")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="today">Today</SelectItem>
                          <SelectItem value="week">Last 7 Days</SelectItem>
                          <SelectItem value="month">Last 30 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Tank Capacity Settings */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-foreground">Tank Configuration</h4>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="previewTankCapacity">Tank Capacity (L)</Label>
                          <Input
                            id="previewTankCapacity"
                            type="number"
                            value={tempSensorConfig.tankCapacity}
                            onChange={(e) => handlePreviewConfigChange('tankCapacity', parseInt(e.target.value) || 600)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="previewUseTankCapacity">Use Tank Capacity</Label>
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="previewUseTankCapacity"
                              checked={tempSensorConfig.useTankCapacity}
                              onCheckedChange={(checked) => handlePreviewConfigChange('useTankCapacity', checked)}
                            />
                            <span className="text-sm text-muted-foreground">
                              {tempSensorConfig.useTankCapacity ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Data Processing */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-foreground">Data Processing</h4>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="previewAveraging">Averaging Window</Label>
                          <Input
                            id="previewAveraging"
                            type="number"
                            value={tempSensorConfig.averaging}
                            onChange={(e) => handlePreviewConfigChange('averaging', parseInt(e.target.value) || 20)}
                          />
                          <p className="text-xs text-muted-foreground">Number of data points to average for smoothing</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="previewIgnoreOffIgnition">Ignore Off Ignition</Label>
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="previewIgnoreOffIgnition"
                              checked={tempSensorConfig.ignoreOffIgnition}
                              onCheckedChange={(checked) => handlePreviewConfigChange('ignoreOffIgnition', checked)}
                            />
                            <span className="text-sm text-muted-foreground">
                              {tempSensorConfig.ignoreOffIgnition ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">Skip fuel readings when ignition is off</p>
                        </div>
                      </div>
                    </div>

                    {/* Event Thresholds */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-foreground">Event Detection Thresholds</h4>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="previewSuddenIncrease">Refill Threshold (L)</Label>
                          <Input
                            id="previewSuddenIncrease"
                            type="number"
                            value={tempSensorConfig.suddenIncrease}
                            onChange={(e) => handlePreviewConfigChange('suddenIncrease', parseInt(e.target.value) || 35)}
                          />
                          <p className="text-xs text-muted-foreground">Minimum fuel increase to detect refill event</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="previewSuddenDecrease">Drain Threshold (L)</Label>
                          <Input
                            id="previewSuddenDecrease"
                            type="number"
                            value={tempSensorConfig.suddenDecrease}
                            onChange={(e) => handlePreviewConfigChange('suddenDecrease', parseInt(e.target.value) || 20)}
                          />
                          <p className="text-xs text-muted-foreground">Minimum fuel decrease to detect drain event</p>
                        </div>
                      </div>
                    </div>

                    {/* Calibration Settings */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-foreground">Calibration</h4>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="previewCalibrationType">Calibration Type</Label>
                          <Select
                            value={tempSensorConfig.calibrationType}
                            onValueChange={(value) => handlePreviewConfigChange('calibrationType', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="incremental">Incremental</SelectItem>
                              <SelectItem value="absolute">Absolute</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">Incremental: relative changes, Absolute: fixed values</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="previewSensorEventsEnabled">Sensor Events</Label>
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="previewSensorEventsEnabled"
                              checked={tempSensorConfig.sensorEventsEnabled}
                              onCheckedChange={(checked) => handlePreviewConfigChange('sensorEventsEnabled', checked)}
                            />
                            <span className="text-sm text-muted-foreground">
                              {tempSensorConfig.sensorEventsEnabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">Enable/disable fuel event detection</p>
                        </div>
                      </div>
                    </div>

                    {/* Valid Range */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-foreground">Valid Sensor Range</h4>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="previewRangeLow">Low Threshold (L)</Label>
                          <Input
                            id="previewRangeLow"
                            type="number"
                            value={tempSensorConfig.rangeLow}
                            onChange={(e) => handlePreviewConfigChange('rangeLow', parseInt(e.target.value) || 100)}
                          />
                          <p className="text-xs text-muted-foreground">Minimum acceptable fuel reading</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="previewRangeHigh">High Threshold (L)</Label>
                          <Input
                            id="previewRangeHigh"
                            type="number"
                            value={tempSensorConfig.rangeHigh}
                            onChange={(e) => handlePreviewConfigChange('rangeHigh', parseInt(e.target.value) || 450)}
                          />
                          <p className="text-xs text-muted-foreground">Maximum acceptable fuel reading</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="previewRangeViolationCount">Violation Count</Label>
                          <Input
                            id="previewRangeViolationCount"
                            type="number"
                            value={tempSensorConfig.rangeViolationCount}
                            onChange={(e) => handlePreviewConfigChange('rangeViolationCount', parseInt(e.target.value) || 10)}
                          />
                          <p className="text-xs text-muted-foreground">Consecutive violations before alert</p>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-6 border-t">
                      <Button variant="outline" onClick={() => setPreviewPanelOpen(false)} className="flex-1">
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          if (previewAssetId && tempSensorConfig) {
                            setSensorConfigs(prev => ({
                              ...prev,
                              [previewAssetId]: tempSensorConfig
                            }));
                            setPreviewPanelOpen(false);
                          }
                        }}
                        className="flex-1"
                      >
                        Apply Configuration
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Live Preview */}
            <div className="w-1/2 bg-background overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Eye className="w-6 h-6 text-primary" />
                  <h2 className="text-2xl font-bold text-foreground">Live Preview</h2>
                </div>

                {previewAssetId && tempSensorConfig && (
                  <div className="space-y-6">
                    {/* Fuel Level Visualization */}
                    <GlassCard className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-foreground">Fuel Level Visualization</h3>
                        <div className="text-sm text-muted-foreground">
                          {previewDateRange === 'today' ? 'Today' : previewDateRange === 'week' ? 'Last 7 Days' : 'Last 30 Days'}
                        </div>
                      </div>
                      <div className="h-80 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={getFuelLevelChartData(previewAssetId, previewDateRange, tempSensorConfig)}
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                            <YAxis
                              domain={[0, tempSensorConfig.tankCapacity]}
                              stroke="hsl(var(--muted-foreground))"
                              fontSize={12}
                              label={{ value: 'Fuel Level (L)', angle: -90, position: 'insideLeft' }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px"
                              }}
                              formatter={(value: any, name: string) => [
                                `${value.toFixed(1)}L`,
                                name === 'raw' ? 'Raw Sensor' : 'Calibrated Fuel'
                              ]}
                              labelFormatter={(label) => `Time: ${label}`}
                            />
                            <Line
                              type="monotone"
                              dataKey="raw"
                              stroke="hsl(var(--muted-foreground))"
                              strokeWidth={1}
                              strokeDasharray="5 5"
                              dot={false}
                              name="Raw Sensor"
                            />
                            <Line
                              type="monotone"
                              dataKey="fuel"
                              stroke="url(#fuelGradient)"
                              strokeWidth={3}
                              dot={false}
                              name="Calibrated Fuel"
                            />
                            {/* Threshold Lines */}
                            <ReferenceLine
                              y={tempSensorConfig.rangeHigh}
                              stroke="hsl(var(--destructive))"
                              strokeDasharray="5 5"
                              label={{ value: `High: ${tempSensorConfig.rangeHigh}L`, position: 'insideTopRight', fill: 'hsl(var(--destructive))', fontSize: 10 }}
                            />
                            <ReferenceLine
                              y={tempSensorConfig.rangeLow}
                              stroke="hsl(var(--warning))"
                              strokeDasharray="5 5"
                              label={{ value: `Low: ${tempSensorConfig.rangeLow}L`, position: 'insideTopRight', fill: 'hsl(var(--warning))', fontSize: 10 }}
                            />
                            <defs>
                              <linearGradient id="fuelGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                                <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8} />
                              </linearGradient>
                            </defs>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-0.5 bg-muted-foreground border-dashed border-t-2"></div>
                            <span className="text-sm text-muted-foreground">Raw Sensor</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-primary rounded-full"></div>
                            <span className="text-sm text-muted-foreground">Calibrated Fuel</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-0.5 bg-destructive border-dashed border-t-2"></div>
                            <span className="text-sm text-muted-foreground">High Threshold</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-0.5 bg-warning border-dashed border-t-2"></div>
                            <span className="text-sm text-muted-foreground">Low Threshold</span>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tank: {tempSensorConfig.tankCapacity}L
                        </div>
                      </div>
                    </GlassCard>

                    {/* Fuel Events Summary */}
                    <GlassCard className="p-6">
                      <h3 className="text-lg font-bold text-foreground mb-4">Fuel Events Summary</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-primary/5 rounded-lg">
                          <div className="text-2xl font-bold text-primary mb-1">
                            {getRefuelEvents(previewAssetId, previewDateRange, tempSensorConfig).length}
                          </div>
                          <div className="text-sm text-muted-foreground">Refill Events</div>
                          <div className="text-xs text-primary mt-1">
                            +{getRefuelEvents(previewAssetId, previewDateRange, tempSensorConfig).reduce((sum: number, refill: any) => sum + refill.refilledLiters, 0).toFixed(1)}L total
                          </div>
                        </div>
                        <div className="text-center p-4 bg-destructive/5 rounded-lg">
                          <div className="text-2xl font-bold text-destructive mb-1">
                            {getFuelEventsPreview(previewAssetId, previewDateRange, tempSensorConfig).drains.length}
                          </div>
                          <div className="text-sm text-muted-foreground">Drain Events</div>
                          <div className="text-xs text-destructive mt-1">
                            -{getFuelEventsPreview(previewAssetId, previewDateRange, tempSensorConfig).drains.reduce((sum, drain) => sum + drain.amount, 0).toFixed(1)}L total
                          </div>
                        </div>
                      </div>
                    </GlassCard>

                    {/* Detailed Events Section */}
                    <GlassCard className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-foreground">Detailed Fuel Events</h3>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm">
                            <Filter className="w-4 h-4 mr-2" />
                            Filter
                          </Button>
                        </div>
                      </div>

                      {/* Refuel Events */}
                      <div className="mb-6">
                        <h4 className="text-md font-semibold text-primary mb-3 flex items-center gap-2">
                          <Droplet className="w-4 h-4" />
                          Refuel Events
                        </h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {getRefuelEvents(previewAssetId, previewDateRange, tempSensorConfig).map((event: any, index: number) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="text-sm font-medium text-primary">
                                  {event.time}
                                </div>
                                <div className="text-xs text-muted-foreground">{event.location}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-primary">
                                  +{event.refilledLiters.toFixed(1)}L
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {event.initialLiters.toFixed(1)} → {event.finalLiters.toFixed(1)}L
                                </div>
                              </div>
                            </div>
                          ))}
                          {getRefuelEvents(previewAssetId, previewDateRange, tempSensorConfig).length === 0 && (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                              No refuel events detected
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Drain Events */}
                      <div>
                        <h4 className="text-md font-semibold text-destructive mb-3 flex items-center gap-2">
                          <TrendingDown className="w-4 h-4" />
                          Drain Events
                        </h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {getFuelEventsPreview(previewAssetId, previewDateRange, tempSensorConfig).drains.map((event, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="text-sm font-medium text-destructive">
                                  {event.time}
                                </div>
                                <div className="text-xs text-muted-foreground">{event.location}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-destructive">
                                  -{event.amount.toFixed(1)}L
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {event.initialFuel.toFixed(1)} → {event.finalFuel.toFixed(1)}L
                                </div>
                              </div>
                            </div>
                          ))}
                          {getFuelEventsPreview(previewAssetId, previewDateRange, tempSensorConfig).drains.length === 0 && (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                              No drain events detected
                            </div>
                          )}
                        </div>
                      </div>
                    </GlassCard>

                    {/* Event Capture Mechanism Explanation */}
                    <GlassCard className="p-6">
                      <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                        <Info className="w-5 h-5" />
                        Event Capture Mechanism
                      </h3>
                      <div className="space-y-4 text-sm">
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Data Sources</h4>
                          <ul className="text-muted-foreground space-y-1 ml-4">
                            <li>• <strong>Fuel Sensor:</strong> Analog voltage readings converted to fuel volume</li>
                            <li>• <strong>GPS/Location:</strong> Geographic coordinates for event context</li>
                            <li>• <strong>Ignition Status:</strong> Engine on/off state for filtering</li>
                            <li>• <strong>Timestamp:</strong> Event timing displayed in EAT for operational review</li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Detection Triggers</h4>
                          <ul className="text-muted-foreground space-y-1 ml-4">
                            <li>• <strong>Refill Events:</strong> Fuel increase ≥ {tempSensorConfig.suddenIncrease}L within short time</li>
                            <li>• <strong>Drain Events:</strong> Fuel decrease ≥ {tempSensorConfig.suddenDecrease}L excluding normal consumption</li>
                            <li>• <strong>Range Violations:</strong> Readings outside {tempSensorConfig.rangeLow}-{tempSensorConfig.rangeHigh}L range</li>
                            <li>• <strong>Spike Detection:</strong> Sudden changes ≥ {tempSensorConfig.spikeStart}% with validation period</li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Processing Logic</h4>
                          <ul className="text-muted-foreground space-y-1 ml-4">
                            <li>• <strong>Data Averaging:</strong> {tempSensorConfig.averaging} readings averaged for noise reduction</li>
                            <li>• <strong>Calibration:</strong> {tempSensorConfig.calibrationType} method applied for accuracy</li>
                            <li>• <strong>Filtering:</strong> Ignition-off readings {tempSensorConfig.ignoreOffIgnition ? 'ignored' : 'included'}</li>
                            <li>• <strong>Validation:</strong> Events verified against historical patterns</li>
                          </ul>
                        </div>
                      </div>
                    </GlassCard>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Modal */}
      <Dialog open={mapModalOpen} onOpenChange={setMapModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Asset Location - {selectedAssetLocation}
            </DialogTitle>
          </DialogHeader>
          <div className="h-96 bg-card/20 rounded-lg flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Interactive map would be displayed here</p>
              <p className="text-sm">Location: {selectedAssetLocation}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export { VehiclesPage };

