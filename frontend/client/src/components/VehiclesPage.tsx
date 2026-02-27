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
import { useGlobalFilter } from "./GlobalFilterContext";
import { FilterControls } from "./FilterControls";
import { HeadingLogo } from "./HeadingLogo";
import { api, globalFilterToApiParams } from "../lib/api";
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
  Legend,
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

function getTodayRangeIso() {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

const VehiclesPage: React.FC<VehiclesPageProps> = ({ selectedVehicle, onVehicleChange }) => {
  const { state: filterState } = useGlobalFilter();
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
  const isTodaySelected = fleetDateRange.preset === "today";
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
  const [showRawLine, setShowRawLine] = useState(true);
  const [showFuelLine, setShowFuelLine] = useState(true);
  const [showRefillMarkers, setShowRefillMarkers] = useState(true);
  const [showTheftMarkers, setShowTheftMarkers] = useState(true);
  const [smoothFuelLine, setSmoothFuelLine] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [forcedTooltip, setForcedTooltip] = useState<any | null>(null);
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [sensorConfigs, setSensorConfigs] = useState<Record<string, any>>({
    "SEM - 12346": {
      tankCapacity: 600,
      useTankCapacity: false,
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
      sensorEventsEnabled: true
    },
    "KCF - 234M": {
      tankCapacity: 550,
      useTankCapacity: true,
      averaging: 15,
      ignoreOffIgnition: false,
      spikeStart: 8,
      spikeDuration: 12,
      spikeReturn: 8,
      calibrationType: "absolute",
      suddenIncrease: 40,
      suddenDecrease: 25,
      rangeLow: 80,
      rangeHigh: 420,
      rangeViolationCount: 8,
      sensorEventsEnabled: true
    },
    "NAR - 567B": {
      tankCapacity: 580,
      useTankCapacity: false,
      averaging: 25,
      ignoreOffIgnition: true,
      spikeStart: 6,
      spikeDuration: 15,
      spikeReturn: 12,
      calibrationType: "incremental",
      suddenIncrease: 30,
      suddenDecrease: 18,
      rangeLow: 120,
      rangeHigh: 480,
      rangeViolationCount: 12,
      sensorEventsEnabled: false
    },
    "DEF - 789X": {
      tankCapacity: 620,
      useTankCapacity: true,
      averaging: 18,
      ignoreOffIgnition: false,
      spikeStart: 4,
      spikeDuration: 8,
      spikeReturn: 6,
      calibrationType: "incremental",
      suddenIncrease: 45,
      suddenDecrease: 22,
      rangeLow: 90,
      rangeHigh: 460,
      rangeViolationCount: 15,
      sensorEventsEnabled: true
    },
    "GHI - 456Y": {
      tankCapacity: 540,
      useTankCapacity: false,
      averaging: 30,
      ignoreOffIgnition: true,
      spikeStart: 10,
      spikeDuration: 20,
      spikeReturn: 15,
      calibrationType: "absolute",
      suddenIncrease: 50,
      suddenDecrease: 28,
      rangeLow: 110,
      rangeHigh: 440,
      rangeViolationCount: 6,
      sensorEventsEnabled: true
    }
  });

  // Get current sensor config for the selected vehicle
  const sensorConfig = sensorConfigs[currentVehicle] || sensorConfigs["SEM - 12346"];

  // Fetch vehicles data with filters
  const { data: vehiclesData, isLoading: vehiclesLoading } = useQuery({
    queryKey: ["/api/vehicles", filterState.selectedVehicles],
    queryFn: async () => {
      // If specific vehicles are selected, fetch only those
      if (filterState.selectedVehicles.length > 0) {
        // Note: The backend API needs to support fetching specific vehicles by ID
        // For now, we'll fetch all and filter client-side
        const allVehicles = await api.getVehicles();
        return allVehicles.filter((vehicle: any) =>
          filterState.selectedVehicles.includes(vehicle.id)
        );
      }
      return api.getVehicles();
    },
    staleTime: 30 * 1000,
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
  });

  // Fleet-wide daily metrics (respects global filters)
  const { data: fleetDailyMetricsData = [] } = useQuery({
    queryKey: ["/api/daily-metrics", filterState.selectedVehicles, fleetDateRange],
    queryFn: async () => {
      const params = globalFilterToApiParams(fleetFilterState);
      return api.getDailyMetrics(params);
    },
    staleTime: 30 * 1000,
  });

  // Fleet-wide fuel events (respects global filters)
  const { data: fleetFuelEventsData = [] } = useQuery({
    queryKey: ["/api/fuel-events", filterState.selectedVehicles, fleetDateRange],
    queryFn: async () => {
      const params = globalFilterToApiParams(fleetFilterState);
      return api.getFuelEvents(params);
    },
    staleTime: 30 * 1000,
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
  });

  const dailyMetricsByVehicle = useMemo(() => {
    const map = new Map<
      string,
      { distance: number; engineHours: number; fuelUsed: number; refills: number; thefts: number; lastMetricTime?: string }
    >();
    fleetDailyMetricsData.forEach((metric: any) => {
      if (!metric?.vehicleId) return;
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
  }, [fleetDailyMetricsData]);

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
      if (event.eventType === "theft" || event.eventType === "leak") {
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

        const rawFuelValue = Number(
          row?.rawFuel ??
          row?.af ??
          row?.rf ??
          row?.fuel ??
          row?.payload?.af ??
          row?.payload?.rf ??
          row?.payload?.fuel
        );
        const fuelValue = Number(
          row?.fuel ??
          row?.rf ??
          row?.af ??
          row?.rawFuel ??
          row?.payload?.fuel ??
          row?.payload?.rf ??
          row?.payload?.af
        );

        return {
          time: timestamp.toISOString(),
          displayTime: timestamp.toLocaleString(),
          dateKey: timestamp.toISOString().slice(0, 10),
          timestampMs: timestamp.getTime(),
          rawFuel: Number.isFinite(rawFuelValue) ? rawFuelValue : null,
          fuel: Number.isFinite(fuelValue) ? fuelValue : null,
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
  const focusedVehicleTodayConsumption = toFiniteNumber(focusedVehicle?.fuelEfficiency);

  const focusedMetricDistance = isTodaySelected
    ? (focusedVehicleTodayDistance ?? 0)
    : focusedTotals.distance;
  const focusedMetricEngineHours = isTodaySelected
    ? (focusedVehicleTodayEngineHours ?? 0)
    : focusedTotals.engineHours;
  const focusedMetricFuelUsed = isTodaySelected
    ? (focusedVehicleTodayFuelUsed ?? 0)
    : focusedTotals.fuelUsed;

  const focusedRefillEvents = useMemo(
    () => focusedFuelEvents.filter((event: any) => event.eventType === "refill"),
    [focusedFuelEvents]
  );

  const focusedTheftEvents = useMemo(
    () => focusedFuelEvents.filter((event: any) => event.eventType === "theft" || event.eventType === "leak"),
    [focusedFuelEvents]
  );

  const focusedRefillVolume = focusedRefillEvents.reduce((sum: number, event: any) => sum + Math.abs(Number(event.volumeLiters || 0)), 0);
  const focusedTheftVolume = focusedTheftEvents.reduce((sum: number, event: any) => sum + Math.abs(Number(event.volumeLiters || 0)), 0);

  const fuelKPIs = useMemo(() => {
    const distance = focusedMetricDistance;
    const fuelUsed = focusedMetricFuelUsed;
    const derivedConsumption = distance > 0 ? (fuelUsed / distance) : 0;
    const consumption = isTodaySelected
      ? (focusedVehicleTodayConsumption ?? derivedConsumption)
      : derivedConsumption;
    return {
      currentFuel: Number(focusedVehicle?.currentFuelLevel || 0),
      fuelUsed,
      consumption,
      drainsCount: focusedTheftEvents.length,
      drainsVolume: focusedTheftVolume,
    };
  }, [
    focusedMetricDistance,
    focusedMetricFuelUsed,
    focusedVehicleTodayConsumption,
    isTodaySelected,
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
      totalRefillCounts: focusedRefillEvents.length,
      totalFuelTheftCounts: focusedTheftEvents.length,
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
    focusedRefillVolume,
    focusedTheftVolume,
  ]);

  const focusedTankCapacityValue =
    typeof focusedVehicle?.tankCapacity === "number" && Number.isFinite(focusedVehicle.tankCapacity)
      ? focusedVehicle.tankCapacity
      : null;
  const focusedTankCapacity = focusedTankCapacityValue ?? 0;

  const fuelLevelChartData = useMemo(() => {
    const eventByDate = new Map<string, { refills: number; thefts: number }>();
    focusedFuelEvents.forEach((event: any) => {
      const dateKey = new Date(event.eventTimestamp).toISOString().split("T")[0];
      const entry = eventByDate.get(dateKey) || { refills: 0, thefts: 0 };
      if (event.eventType === "refill") entry.refills += Math.abs(Number(event.volumeLiters || 0));
      if (event.eventType === "theft" || event.eventType === "leak") entry.thefts += Math.abs(Number(event.volumeLiters || 0));
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
          displayTime: time.toLocaleString(),
          dateKey: time.toISOString().slice(0, 10),
          timestampMs: time.getTime(),
          raw: currentFuel,
          fuel: currentFuel,
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
        displayTime: date.toLocaleDateString(),
        dateKey,
        timestampMs: date.getTime(),
        raw: fuelLevel,
        fuel: fuelLevel,
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

  const behaviorBands = useMemo(() => {
    if (fuelLevelChartData.length < 2) return [];
    const tankCapacity = focusedTankCapacity || 0;
    const moderateDrop = tankCapacity > 0 ? tankCapacity * 0.08 : 10;
    const highDrop = tankCapacity > 0 ? tankCapacity * 0.15 : 20;

    const theftTimes = (
      focusedFuelEvents
        .filter((event: any) => event.eventType === "theft" || event.eventType === "leak")
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
      .filter((event: any) => event.eventType === "refill" || event.eventType === "theft" || event.eventType === "leak")
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
        const isTheft = event.eventType === "theft" || event.eventType === "leak";
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
      time: new Date(event.eventTimestamp).toLocaleString(),
      location: event.location || "Unknown location",
      volume: Math.abs(Number(event.volumeLiters || 0)),
      cost: filterState.currency === "UGX" ? event.costUGX : event.costKES,
    }));
  }, [focusedRefillEvents, filterState.currency]);

  const drainEvents = useMemo(() => {
    return focusedTheftEvents.map((event: any) => ({
      time: new Date(event.eventTimestamp).toLocaleString(),
      location: event.location || "Unknown location",
      volume: Math.abs(Number(event.volumeLiters || 0)),
    }));
  }, [focusedTheftEvents]);

  // Fuel telemetry time-series data with fuel values only
  const getFuelTelemetryData = (vehicleId: string, dateRange: string) => {
    const baseData = {
      "SEM - 12346": {
        today: [
          { time: "00:04:14", fuel: 69.60, ignition: "off", odometer: 80040 },
          { time: "06:29:14", fuel: 69.60, ignition: "on", odometer: 80040 },
          { time: "07:42:23", fuel: 69.60, ignition: "on", odometer: 80055 },
          { time: "09:39:16", fuel: 69.60, ignition: "on", odometer: 80078 },
          { time: "10:13:55", fuel: 302.40, ignition: "on", odometer: 80085 },
          { time: "10:40:21", fuel: 302.40, ignition: "on", odometer: 80095 },
          { time: "11:30:54", fuel: 296.80, ignition: "on", odometer: 80110 },
          { time: "12:17:38", fuel: 290.40, ignition: "on", odometer: 80124 }
        ],
        week: [
          { time: "Mon 08:00", fuel: 235.00, ignition: "on", odometer: 79800 },
          { time: "Mon 18:00", fuel: 168.00, ignition: "off", odometer: 79920 },
          { time: "Tue 08:00", fuel: 168.00, ignition: "on", odometer: 79920 },
          { time: "Tue 18:00", fuel: 112.00, ignition: "off", odometer: 80010 },
          { time: "Wed 08:00", fuel: 328.00, ignition: "on", odometer: 80010 },
          { time: "Wed 18:00", fuel: 262.00, ignition: "off", odometer: 80085 },
          { time: "Thu 08:00", fuel: 262.00, ignition: "on", odometer: 80085 },
          { time: "Thu 18:00", fuel: 206.00, ignition: "off", odometer: 80160 }
        ],
        month: [
          { time: "Week 1", fuel: 375.00, ignition: "on", odometer: 78500 },
          { time: "Week 2", fuel: 300.00, ignition: "on", odometer: 79200 },
          { time: "Week 3", fuel: 262.00, ignition: "on", odometer: 79800 },
          { time: "Week 4", fuel: 290.40, ignition: "on", odometer: 80124 }
        ]
      },
      "KCF - 234M": {
        today: [
          { time: "00:00:00", fuel: 168.00, ignition: "off", odometer: 52000 },
          { time: "07:30:00", fuel: 168.00, ignition: "on", odometer: 52000 },
          { time: "10:00:00", fuel: 140.00, ignition: "on", odometer: 52085 },
          { time: "14:00:00", fuel: 112.00, ignition: "on", odometer: 52150 }
        ],
        week: [
          { time: "Mon 08:00", fuel: 206.00, ignition: "on", odometer: 51500 },
          { time: "Wed 12:00", fuel: 140.00, ignition: "on", odometer: 51850 },
          { time: "Fri 18:00", fuel: 93.00, ignition: "off", odometer: 52150 }
        ],
        month: [
          { time: "Week 1", fuel: 234.00, ignition: "on", odometer: 50500 },
          { time: "Week 4", fuel: 112.00, ignition: "on", odometer: 52150 }
        ]
      }
    };

    const vehicleData = baseData[vehicleId as keyof typeof baseData];
    if (!vehicleData) return baseData["SEM - 12346"].today;
    return vehicleData[dateRange as keyof typeof vehicleData] || vehicleData.today;
  };

  // Fuel KPI metrics derived from telemetry data
  const getFuelKPIMetrics = (vehicleId: string, dateRange: string) => {
    const telemetry = getFuelTelemetryData(vehicleId, dateRange);
    const firstReading = telemetry[0];
    const lastReading = telemetry[telemetry.length - 1];

    const distance = lastReading.odometer - firstReading.odometer;
    const currentFuel = lastReading.fuel;
    const fuelUsed = Math.max(0, firstReading.fuel - lastReading.fuel + (lastReading.fuel > firstReading.fuel ? lastReading.fuel - firstReading.fuel : 0));
    const consumption = distance > 0 ? (fuelUsed / distance).toFixed(3) : "0.000";

    // Calculate drains
    let drainsCount = 0;
    let drainsVolume = 0;

    for (let i = 1; i < telemetry.length; i++) {
      const diff = telemetry[i].fuel - telemetry[i-1].fuel;
      if (diff < -sensorConfig.suddenDecrease) {
        drainsCount++;
        drainsVolume += Math.abs(diff);
      }
    }

    return {
      distance: distance.toFixed(2),
      currentFuel: currentFuel.toFixed(2),
      fuelUsed: fuelUsed.toFixed(2),
      consumption,
      drainsCount,
      drainsVolume: drainsVolume.toFixed(2)
    };
  };

  // Event data (drains) extracted from telemetry
  const getFuelEvents = (vehicleId: string, dateRange: string) => {
    const telemetry = getFuelTelemetryData(vehicleId, dateRange);
    const drains: { time: string; location: string; initialFuel: number; finalFuel: number; amount: number }[] = [];

    for (let i = 1; i < telemetry.length; i++) {
      const diff = telemetry[i].fuel - telemetry[i-1].fuel;
      if (diff < -sensorConfig.suddenDecrease) {
        drains.push({
          time: telemetry[i].time,
          location: "Highway KM 45",
          initialFuel: telemetry[i-1].fuel,
          finalFuel: telemetry[i].fuel,
          amount: Math.abs(diff)
        });
      }
    }

    return { drains };
  };

  // Trip data can be sourced from telematics when available
  const tripData: any[] = [];

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

  // Focused view is single-asset: keep the selected asset in sync with global filter when one is chosen.
  useEffect(() => {
    if (filterState.selectedVehicles.length !== 1) return;
    const selectedId = filterState.selectedVehicles[0];
    if (selectedId && selectedId !== currentVehicle) {
      setCurrentVehicle(selectedId);
    }
  }, [filterState.selectedVehicles, currentVehicle]);

  // Helper function to handle preview configuration changes
  const handlePreviewConfigChange = (field: string, value: any) => {
    if (tempSensorConfig) {
      setTempSensorConfig({
        ...tempSensorConfig,
        [field]: value
      });
    }
  };

  // Get fuel level chart data for preview
  const getFuelLevelChartData = (vehicleId: string, dateRange: string, config: any) => {
    const telemetry = getFuelTelemetryData(vehicleId, dateRange);
    return telemetry.map((reading, index) => ({
      time: reading.time,
      fuel: reading.fuel,
      timestamp: new Date(`2024-01-01 ${reading.time}`).getTime()
    }));
  };

  // Get refuel events for preview
  const getRefuelEvents = (vehicleId: string, dateRange: string, config: any) => {
    const telemetry = getFuelTelemetryData(vehicleId, dateRange);
    return telemetry
      .map((reading, index) => {
        if (index === 0) return null;
        const prevReading = telemetry[index - 1];
        const change = reading.fuel - prevReading.fuel;
        if (change > config.suddenIncrease) {
          return {
            time: reading.time,
            location: "Fuel Station KM 45",
            initialLiters: prevReading.fuel,
            finalLiters: reading.fuel,
            refilledLiters: change
          };
        }
        return null;
      })
      .filter(event => event !== null);
  };

  // Get fuel events for preview
  const getFuelEventsPreview = (vehicleId: string, dateRange: string, config: any) => {
    const telemetry = getFuelTelemetryData(vehicleId, dateRange);
    const drains = [];

    for (let i = 1; i < telemetry.length; i++) {
      const diff = telemetry[i].fuel - telemetry[i-1].fuel;
      if (diff < -config.suddenDecrease) {
        drains.push({
          time: telemetry[i].time,
          location: "Highway KM 45",
          initialFuel: telemetry[i-1].fuel,
          finalFuel: telemetry[i].fuel,
          amount: Math.abs(diff)
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active":
      case "Moving":
        return "text-green-600 border-green-600";
      case "Idle":
      case "Parked":
        return "text-yellow-600 border-yellow-600";
      case "Maintenance":
        return "text-orange-600 border-orange-600";
      case "Out of Service":
        return "text-red-600 border-red-600";
      default: return "text-gray-600 border-gray-600";
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

  // Centralized data filtering helper - differentiated by vehicle and period
  const getAssetData = (vehicleId: string, period: string) => {
    // Vehicle-specific base data
    const vehicleBaseData = {
      "SEM - 12346": {
        week: {
          vehicleId: vehicleId,
          workingDays: 7,
          parkingDays: 1,
          avgFuelConsumption: 8.34,
          totalRefillCounts: 2,
          totalFuelTheftCounts: 1,
          totalDistance: 19.85,
          totalEngineHours: 19.6,
          totalFuelUsed: 163,
          totalRefills: 455,
          totalThefts: 112,
        },
        today: {
          vehicleId: vehicleId,
          workingDays: 1,
          parkingDays: 0,
          avgFuelConsumption: 8.5,
          totalRefillCounts: 0,
          totalFuelTheftCounts: 0,
          totalDistance: 2.8,
          totalEngineHours: 2.8,
          totalFuelUsed: 23,
          totalRefills: 65,
          totalThefts: 0,
        },
        month: {
          vehicleId: vehicleId,
          workingDays: 28,
          parkingDays: 3,
          avgFuelConsumption: 8.1,
          totalRefillCounts: 8,
          totalFuelTheftCounts: 3,
          totalDistance: 78.5,
          totalEngineHours: 78.2,
          totalFuelUsed: 652,
          totalRefills: 1820,
          totalThefts: 448,
        }
      },
      "KCF - 234M": {
        week: {
          vehicleId: vehicleId,
          workingDays: 5,
          parkingDays: 2,
          avgFuelConsumption: 9.2,
          totalRefillCounts: 1,
          totalFuelTheftCounts: 0,
          totalDistance: 15.6,
          totalEngineHours: 16.1,
          totalFuelUsed: 142,
          totalRefills: 380,
          totalThefts: 0,
        },
        today: {
          vehicleId: vehicleId,
          workingDays: 1,
          parkingDays: 0,
          avgFuelConsumption: 9.5,
          totalRefillCounts: 0,
          totalFuelTheftCounts: 0,
          totalDistance: 3.2,
          totalEngineHours: 3.1,
          totalFuelUsed: 29,
          totalRefills: 45,
          totalThefts: 0,
        },
        month: {
          vehicleId: vehicleId,
          workingDays: 22,
          parkingDays: 9,
          avgFuelConsumption: 8.9,
          totalRefillCounts: 4,
          totalFuelTheftCounts: 0,
          totalDistance: 65.2,
          totalEngineHours: 68.4,
          totalFuelUsed: 578,
          totalRefills: 1520,
          totalThefts: 0,
        }
      },
      "NAR - 567B": {
        week: {
          vehicleId: vehicleId,
          workingDays: 6,
          parkingDays: 1,
          avgFuelConsumption: 7.8,
          totalRefillCounts: 0,
          totalFuelTheftCounts: 1,
          totalDistance: 22.3,
          totalEngineHours: 21.8,
          totalFuelUsed: 178,
          totalRefills: 245,
          totalThefts: 89,
        },
        today: {
          vehicleId: vehicleId,
          workingDays: 1,
          parkingDays: 0,
          avgFuelConsumption: 7.5,
          totalRefillCounts: 0,
          totalFuelTheftCounts: 0,
          totalDistance: 4.1,
          totalEngineHours: 4.0,
          totalFuelUsed: 31,
          totalRefills: 35,
          totalThefts: 0,
        },
        month: {
          vehicleId: vehicleId,
          workingDays: 25,
          parkingDays: 6,
          avgFuelConsumption: 7.6,
          totalRefillCounts: 2,
          totalFuelTheftCounts: 2,
          totalDistance: 89.2,
          totalEngineHours: 87.3,
          totalFuelUsed: 712,
          totalRefills: 980,
          totalThefts: 178,
        }
      }
    };

    const vehicleData = vehicleBaseData[vehicleId as keyof typeof vehicleBaseData];
    if (!vehicleData) return vehicleBaseData["SEM - 12346"].week;

    return vehicleData[period as keyof typeof vehicleData] || vehicleData.week;
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
      const vehicleConsumptionToday = toFiniteNumber(vehicle.fuelEfficiency);
      const vehicleRefillCountToday = toFiniteNumber(
        vehicle.refillCount ?? vehicle.totalRefills ?? vehicle.totalRefillCounts ?? vehicle.numberOfRefills
      );
      const vehicleTheftCountToday = toFiniteNumber(
        vehicle.theftIncidents ?? vehicle.totalThefts ?? vehicle.totalFuelTheftCounts ?? vehicle.numberOfThefts
      );

      const metricsDistance = metrics ? Number(metrics.distance) : null;
      const metricsEngineHours = metrics ? Number(metrics.engineHours) : null;
      const metricsFuelUsed = metrics ? Number(metrics.fuelUsed) : null;

      const distance = isTodaySelected ? vehicleDistanceToday : metricsDistance;
      const engineHours = isTodaySelected ? vehicleEngineHoursToday : metricsEngineHours;
      const fuelUsed = isTodaySelected ? vehicleFuelUsedToday : metricsFuelUsed;
      const derivedConsumption =
        typeof distance === "number" &&
        Number.isFinite(distance) &&
        distance > 0 &&
        typeof fuelUsed === "number" &&
        Number.isFinite(fuelUsed)
          ? fuelUsed / distance
          : null;
      const consumptionLPerKm =
        isTodaySelected
          ? (vehicleConsumptionToday ?? derivedConsumption)
          : derivedConsumption;
      const refillCount = isTodaySelected
        ? Math.max(0, Math.trunc(vehicleRefillCountToday ?? 0))
        : events?.refills ?? 0;
      const theftIncidents = isTodaySelected
        ? Math.max(0, Math.trunc(vehicleTheftCountToday ?? 0))
        : events?.thefts ?? 0;

      return {
        id: vehicle.id,
        label: getVehicleLabel(vehicle),
        driver: vehicle.driverName || 'Unassigned',
        status: vehicle.status || 'Unknown',
        fuelLevel,
        fuelCapacity: tankCapacityValue,
        efficiency: vehicle.fuelEfficiency || 0,
        efficiencyRating: vehicle.efficiencyRating || 'Unknown',
        distance,
        engineHours,
        fuelUsed,
        consumptionLPerKm,
        refillCount,
        theftIncidents,
        location: events?.lastLocation || 'Unknown',
        lastUpdate: events?.lastEventTime
          ? new Date(events.lastEventTime).toLocaleString()
          : metrics?.lastMetricTime
          ? new Date(metrics.lastMetricTime).toLocaleString()
          : "No updates in range",
      };
    });
  }, [vehiclesData, dailyMetricsByVehicle, fuelEventsByVehicle, isTodaySelected]);

// Fleet-wide metrics for Proactive Scorecard
  const getFleetMetrics = () => {
    const movingAssets = fleetAssets.filter(asset => asset.status === "Active").length;
    const parkedAssets = fleetAssets.filter(asset => asset.status === "Idle").length;

    const totalRefillsInRange = fleetFuelEventsData
      .filter((event: any) => event.eventType === "refill")
      .length;
    const totalRefillVolumeInRange = fleetFuelEventsData
      .filter((event: any) => event.eventType === "refill")
      .reduce((sum: number, event: any) => sum + Math.abs(Number(event.volumeLiters || 0)), 0);
    const totalTheftsInRange = fleetFuelEventsData
      .filter((event: any) => event.eventType === "theft" || event.eventType === "leak")
      .length;
    const totalTheftVolumeInRange = fleetFuelEventsData
      .filter((event: any) => event.eventType === "theft" || event.eventType === "leak")
      .reduce((sum: number, event: any) => sum + Math.abs(Number(event.volumeLiters || 0)), 0);

    return {
      movingAssets,
      parkedAssets,
      totalRefillsInRange,
      totalRefillVolumeInRange,
      totalTheftsInRange,
      totalTheftVolumeInRange
    };
  };

  const fleetMetrics = getFleetMetrics();
  const selectedRangeLabel = fleetDateRange.label || "Selected Range";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Fleet Assets Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-foreground">
            {viewMode === "table" ? "Fleet Assets" : "Focused Asset Performance"}
          </h1>
          <p className="text-muted-foreground">
            {viewMode === "table"
              ? "High-density overview of all fleet vehicles with key performance metrics"
              : `Active Asset: ${assetData.assetLabel} | Real-time Health Monitor`
            }
          </p>
          <HeadingLogo />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-card/20 backdrop-blur-sm rounded-lg p-1">
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="text-xs px-3 py-1 h-8"
            >
              Table View
            </Button>
            <Button
              variant={viewMode === "focused" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("focused")}
              className="text-xs px-3 py-1 h-8"
            >
              Focused View
            </Button>
          </div>

          {/* Filter Controls - Moved from first row to replace period filter */}
          <FilterControls
            dateRangeOverride={fleetDateRange}
            onDateRangeOverrideChange={setFleetDateRange}
            defaultDatePreset="today"
          />
        </div>
      </div>

      {viewMode === "table" ? (
        <>
          {/* Teletrac Fuel - Operational Command Center Redesign */}

          {/* Proactive Scorecard (KPI Cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            <GlassCard className="p-6 card-surface-premium motion-premium" data-testid="kpi-total-assets">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Truck className="w-6 h-6 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">Total Assets</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {/* TODO: Focus Funnel to Focused Asset Performance */}}
                  className="h-6 w-6 p-0 text-primary hover:bg-primary/20"
                  data-testid="focus-funnel-total-assets"
                >
                  <Target className="w-3 h-3" />
                </Button>
              </div>
              <div className="text-4xl font-bold text-primary mb-2">
                {fleetAssets.length}
              </div>
              <div className="text-xs text-muted-foreground">All Fleet Vehicles</div>
            </GlassCard>

            <GlassCard className="p-6 card-surface-premium motion-premium" data-testid="kpi-moving-assets">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Activity className="w-6 h-6 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">Moving</span>
                </div>
              </div>
              <div className="text-4xl font-bold text-primary mb-2">
                {fleetMetrics.movingAssets}
              </div>
              <div className="text-xs text-muted-foreground">Active Assets</div>
            </GlassCard>

            <GlassCard className="p-6 card-surface-premium motion-premium" data-testid="kpi-parked-assets">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Timer className="w-6 h-6 text-accent-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Parked</span>
                </div>
              </div>
              <div className="text-4xl font-bold text-accent-foreground mb-2">
                {fleetMetrics.parkedAssets}
              </div>
              <div className="text-xs text-muted-foreground">Idle Assets</div>
            </GlassCard>

            {/* Solution Validation Metrics (Refill/Theft - Last 30 Days) */}

            <GlassCard className="p-6 card-surface-premium motion-premium" data-testid="kpi-thefts-validation">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                  <span className="text-sm font-medium text-muted-foreground">Thefts</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:bg-destructive/20"
                  onClick={() => {/* TODO: Focus Funnel to Focused Asset Performance */}}
                  data-testid="focus-funnel-thefts"
                >
                  <Target className="w-3 h-3" />
                </Button>
              </div>
              <div className="text-3xl font-bold text-destructive mb-1">
                {fleetMetrics.totalTheftsInRange}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedRangeLabel} Volume: {fleetMetrics.totalTheftVolumeInRange.toFixed(1)}L
              </div>
            </GlassCard>

            <GlassCard className="p-6 card-surface-premium motion-premium" data-testid="kpi-refills-validation">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Droplet className="w-6 h-6 text-primary" />
                  <span className="text-sm font-medium text-muted-foreground">Refills</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-primary hover:bg-primary/20"
                  onClick={() => {/* TODO: Focus Funnel to Focused Asset Performance */}}
                  data-testid="focus-funnel-refills"
                >
                  <Target className="w-3 h-3" />
                </Button>
              </div>
              <div className="text-3xl font-bold text-primary mb-1">
                {fleetMetrics.totalRefillsInRange}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedRangeLabel} Volume: {fleetMetrics.totalRefillVolumeInRange.toFixed(1)}L
              </div>
            </GlassCard>
          </div>


          {/* Fleet Assets Table */}
          <GlassCard className="p-6" hover={false}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground">Fleet Assets Overview</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>

            {/* Fleet Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="border-b border-border/20">
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Asset</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Status</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Current Liters</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Fuel Level</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Tank Capacity (L)</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Consumption (L/km, {selectedRangeLabel})</th>
                    <th className="min-w-[220px] text-center py-3 px-4 font-semibold text-foreground whitespace-nowrap">Alert Intelligence</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Distance ({selectedRangeLabel})</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Engine Hours ({selectedRangeLabel})</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Location</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Last Update</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fleetAssets.map((asset) => (
                    <tr
                      key={asset.id}
                      className="border-b border-border/10 hover:bg-primary/5 cursor-pointer transition-colors duration-200"
                      onClick={() => {
                        setCurrentVehicle(asset.id);
                        setViewMode("focused");
                      }}
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                            <Car className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-sm">{asset.label}</div>
                            {/* Compact Fuel Information Module */}
                            <div className="flex items-center gap-2 mt-1">
                              <div className="relative group">
                                <Fuel className="w-3 h-3 text-primary" />
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-card border border-border rounded-lg shadow-lg text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium text-primary">{asset.fuelLevel}%</span>
                                    <span className="text-muted-foreground">of</span>
                                    <span className="font-medium text-primary">
                                      {asset.fuelCapacity === null ? "N/A" : `${asset.fuelCapacity}L`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStatusColor(asset.status)}`}
                        >
                          {asset.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="text-sm font-bold text-primary">
                          {asset.fuelCapacity === null ? "N/A" : `${Math.round((asset.fuelLevel / 100) * asset.fuelCapacity)} L`}
                        </div>
                      </td>
                      <td className="w-[220px] py-4 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="text-sm font-bold text-primary">{asset.fuelLevel}%</div>
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full">
                            <div
                              className="h-1.5 bg-primary rounded-full transition-all duration-300"
                              style={{ width: `${asset.fuelLevel}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="text-sm font-medium text-foreground">
                          {asset.fuelCapacity === null ? "--" : `${formatMetricNumber(asset.fuelCapacity, 0)} L`}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="text-sm font-medium text-foreground">
                          {formatMetricNumber(asset.consumptionLPerKm, 3)}
                        </div>
                      </td>
                      {/* Alert Intelligence Column */}
                      <td className="py-4 px-4 text-center">
                        {(() => {
                          const refillCount = Math.max(0, Math.trunc(asset.refillCount ?? 0));
                          const theftCount = Math.max(0, Math.trunc(asset.theftIncidents ?? 0));
                          const hasTheft = theftCount > 0;
                          const hasActivity = refillCount > 0 || theftCount > 0;

                          const statusClasses = hasTheft
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : hasActivity
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border/40 bg-muted/30 text-muted-foreground";

                          return (
                            <div className="mx-auto flex w-fit flex-nowrap items-center justify-center gap-1.5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClasses}`}>
                                {hasTheft ? (
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                ) : hasActivity ? (
                                  <AlertCircle className="h-2.5 w-2.5" />
                                ) : (
                                  <CheckCircle className="h-2.5 w-2.5" />
                                )}
                                {hasTheft ? "Attention" : hasActivity ? "Active" : "Clear"}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                <Droplet className="h-2.5 w-2.5" />
                                {refillCount}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {theftCount}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="text-sm font-medium text-foreground">
                          {asset.distance === null ? "--" : `${formatMetricNumber(asset.distance, 1)} km`}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="text-sm font-medium text-foreground">
                          {asset.engineHours === null ? "--" : `${formatMetricNumber(asset.engineHours, 1)} hrs`}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{asset.location}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="text-xs text-muted-foreground">{asset.lastUpdate}</div>
                      </td>
                      <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCurrentVehicle(asset.id);
                              setViewMode("focused");
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPreviewAssetId(asset.label);
                              setTempSensorConfig(sensorConfigs[asset.label]);
                              setPreviewPanelOpen(true);
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <Settings2 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLocationClick(asset.location)}
                            className="h-8 w-8 p-0"
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
            {/* Main KPI Section - Updated with new cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
              {/* Status Card with Tank Level Percentage Bar and Asset Name */}
              <GlassCard className="p-6" data-testid="status-card">
                <h3 className="text-lg font-bold text-foreground mb-2">{assetData.assetLabel}</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Tank Size:</span>
                    <span className="font-bold text-foreground">
                      {focusedTankCapacityValue === null ? "N/A" : `${focusedTankCapacityValue}L`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Current Fuel:</span>
                    <span className="font-bold text-primary">{fuelKPIs.currentFuel.toFixed(1)}L</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Fuel Level:</span>
                    <span className="font-bold text-primary">
                      {focusedTankCapacity > 0 ? ((fuelKPIs.currentFuel / focusedTankCapacity) * 100).toFixed(1) : "0.0"}%
                    </span>
                  </div>
                  {/* Tank Level Percentage Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${focusedTankCapacity > 0 ? (fuelKPIs.currentFuel / focusedTankCapacity) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </GlassCard>

              {/* Consumption L/km Card - Moved to first row with better space utilization */}
              <GlassCard className="p-6" data-testid="consumption-card">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-accent-foreground" />
                  Consumption ({selectedRangeLabel})
                </h3>
                <div className="flex items-center justify-center h-24">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-accent-foreground mb-1">{fuelKPIs.consumption.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">L/km</div>
                    <div className="text-xs text-muted-foreground mt-2">Fuel used per kilometer</div>
                    <div className="mt-3 pt-2 border-t border-border/20">
                      <div className="text-sm font-bold text-primary">{fuelKPIs.fuelUsed.toFixed(1)}L</div>
                      <div className="text-xs text-muted-foreground">Total fuel used ({selectedRangeLabel.toLowerCase()})</div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Total Distance Card with better space utilization */}
              <GlassCard className="p-6" data-testid="total-distance-card">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Route className="w-5 h-5 text-primary" />
                  Total Distance ({selectedRangeLabel})
                </h3>
                <div className="flex items-center justify-center h-24">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-1">{assetData.totalDistance.toFixed(1)}</div>
                    <div className="text-sm text-muted-foreground">km</div>
                    <div className="text-xs text-muted-foreground mt-2">Distance traveled</div>
                  </div>
                </div>
              </GlassCard>

              {/* Active Hours Card with better space utilization */}
              <GlassCard className="p-6" data-testid="active-hours-card">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-accent-foreground" />
                  Engine Hours ({selectedRangeLabel})
                </h3>
                <div className="flex items-center justify-center h-24">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-accent-foreground mb-1">{assetData.totalEngineHours.toFixed(1)}</div>
                    <div className="text-sm text-muted-foreground">hrs</div>
                    <div className="text-xs text-muted-foreground mt-2">Engine running time</div>
                  </div>
                </div>
              </GlassCard>

              {/* Combined Refills and Drains Card */}
              <GlassCard className="p-6" data-testid="fuel-events-card">
                <h3 className="text-lg font-bold text-foreground mb-4">Fuel Events</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Droplet className="w-4 h-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Refills:</span>
                    </div>
                    <span className="font-bold text-primary">{assetData.totalRefillCounts} events</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-destructive" />
                      <span className="text-sm text-muted-foreground">Drains:</span>
                    </div>
                    <span className="font-bold text-destructive">{fuelKPIs.drainsCount} events</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-xs text-muted-foreground">Total Refills Volume:</span>
                    <span className="text-xs font-bold text-primary">{assetData.totalRefills.toFixed(1)}L</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Total Drains Volume:</span>
                    <span className="text-xs font-bold text-destructive">{fuelKPIs.drainsVolume.toFixed(1)}L</span>
                  </div>
                </div>
              </GlassCard>

              {/* Working Days Card */}
              <GlassCard className="p-6" data-testid="working-days-card">
                <h3 className="text-lg font-bold text-foreground mb-4">Working Days</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Working:</span>
                    </div>
                    <span className="font-bold text-primary">{assetData.workingDays}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Timer className="w-4 h-4 text-accent-foreground" />
                      <span className="text-sm text-muted-foreground">Parked:</span>
                    </div>
                    <span className="font-bold text-accent-foreground">{assetData.parkingDays || 0}</span>
                  </div>
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    Total days: {assetData.workingDays + (assetData.parkingDays || 0)}
                  </div>
                </div>
              </GlassCard>

            </div>

            {/* Interactive Fuel Level Chart */}
            <GlassCard className="p-6" hover={false}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-foreground">Fuel Level Monitoring</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="showRaw"
                      checked={showRawLine}
                      onChange={(e) => setShowRawLine(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="showRaw" className="text-sm text-muted-foreground">Raw Data</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="showFuel"
                      checked={showFuelLine}
                      onChange={(e) => setShowFuelLine(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="showFuel" className="text-sm text-muted-foreground">Processed Fuel</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="showRefills"
                      checked={showRefillMarkers}
                      onChange={(e) => setShowRefillMarkers(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="showRefills" className="text-sm text-muted-foreground">Refills</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="showThefts"
                      checked={showTheftMarkers}
                      onChange={(e) => setShowTheftMarkers(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="showThefts" className="text-sm text-muted-foreground">Thefts</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="smoothFuel"
                      checked={smoothFuelLine}
                      onChange={(e) => setSmoothFuelLine(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="smoothFuel" className="text-sm text-muted-foreground">Smooth Line</label>
                  </div>
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fuelLevelChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" strokeOpacity={0.35} />
                    <XAxis
                      dataKey="time"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(value) => {
                        const date = new Date(String(value));
                        if (Number.isNaN(date.getTime())) return String(value);
                        if (fuelLevelChartData.length > 48) {
                          return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                        }
                        return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                      }}
                    />
                    <YAxis
                      domain={[0, focusedTankCapacity || 1]}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      label={{ value: 'Fuel Level (L)', angle: -90, position: 'insideLeft' }}
                    />
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
                        return (
                          <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-xs shadow-lg">
                            <div className="mb-2 font-medium text-foreground">Date: {showLabel}</div>
                            <div className="space-y-1">
                              {!forced &&
                                payload
                                  ?.filter((item) => item.dataKey === "raw" || item.dataKey === "fuel")
                                  .map((item) => (
                                    <div key={item.dataKey} className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <Fuel className="h-3 w-3" />
                                        {item.dataKey === "raw" ? "Raw Sensor" : "Processed Fuel"}
                                      </span>
                                      <span className="font-mono font-medium text-foreground">
                                        {Number(item.value).toFixed(1)} L
                                      </span>
                                    </div>
                                  ))}
                              {typeof distance === "number" && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Route className="h-3 w-3" />
                                    Distance
                                  </span>
                                  <span className="font-mono font-medium text-foreground">{distance.toFixed(1)} km</span>
                                </div>
                              )}
                              {refillVolume > 0 && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Fuel className="h-3 w-3 text-primary" />
                                    Refills
                                  </span>
                                  <span className="font-mono font-medium text-primary">+{refillVolume.toFixed(1)} L</span>
                                </div>
                              )}
                              {theftVolume > 0 && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <AlertTriangle className="h-3 w-3 text-destructive" />
                                    Thefts
                                  </span>
                                  <span className="font-mono font-medium text-destructive">-{theftVolume.toFixed(1)} L</span>
                                </div>
                              )}
                              {forced && (
                                <>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Event</span>
                                    <span className="font-medium text-foreground capitalize">{forced.eventType}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">Time</span>
                                    <span className="font-medium text-foreground">
                                      {new Date(forced.timestamp).toLocaleString()}
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
                    <Legend />
                    {showRawLine && (
                      <Line
                        type={smoothFuelLine ? "monotone" : "linear"}
                        dataKey="raw"
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth={1}
                        strokeDasharray="5 5"
                        dot={false}
                        name="Raw Sensor"
                        isAnimationActive
                        animationDuration={650}
                        animationEasing="ease-out"
                      />
                    )}
                    {showFuelLine && (
                      <Line
                        type={smoothFuelLine ? "monotone" : "linear"}
                        dataKey="fuel"
                        stroke="url(#fuelGradient)"
                        strokeWidth={3}
                        dot={false}
                        name="Processed Fuel"
                        isAnimationActive
                        animationDuration={650}
                        animationEasing="ease-out"
                        style={{ filter: "drop-shadow(0 0 6px rgba(59,130,246,0.35))" }}
                      />
                    )}
                    {showRefillMarkers && (
                      <Scatter
                        data={refillMarkers}
                        fill="hsl(var(--primary))"
                        shape={(props: any) => {
                          const { cx, cy, payload } = props;
                          const isHighlighted = payload?.id === highlightedEventId;
                          return (
                            <g transform={`translate(${cx}, ${cy})`} cursor="pointer">
                              {isHighlighted && (
                                <circle r={12} fill="rgba(59,130,246,0.35)" className="animate-ping" />
                              )}
                              <circle r={8} fill="rgba(59,130,246,0.2)" />
                              <Fuel className="w-3 h-3 text-primary" x={-6} y={-6} />
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
                    )}
                    {showTheftMarkers && (
                      <Scatter
                        data={theftMarkers}
                        fill="hsl(var(--destructive))"
                        shape={(props: any) => {
                          const { cx, cy, payload } = props;
                          const isHighlighted = payload?.id === highlightedEventId;
                          return (
                            <g transform={`translate(${cx}, ${cy})`} cursor="pointer">
                              {isHighlighted && (
                                <circle r={12} fill="rgba(239,68,68,0.35)" className="animate-ping" />
                              )}
                              <circle r={8} fill="rgba(239,68,68,0.2)" />
                              <AlertTriangle className="w-3 h-3 text-destructive" x={-6} y={-6} />
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
                    )}
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
                  <defs>
                    <linearGradient id="fuelGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.95}/>
                      <stop offset="60%" stopColor="#3b82f6" stopOpacity={0.85}/>
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.75}/>
                    </linearGradient>
                  </defs>
                </LineChart>
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
                          Time
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
                          Time
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
                    {tripData.map((trip, index) => (
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
                      <h3 className="text-lg font-semibold text-foreground mb-3">{previewAssetId}</h3>
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
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8}/>
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
                            +{getRefuelEvents(previewAssetId, previewDateRange, tempSensorConfig).reduce((sum, refill) => sum + refill.refilledLiters, 0).toFixed(1)}L total
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
                          {getRefuelEvents(previewAssetId, previewDateRange, tempSensorConfig).map((event, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="text-sm font-medium text-primary">
                                  {new Date(`2024-01-01 ${event.time}`).toLocaleString()}
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
                                  {new Date(`2024-01-01 ${event.time}`).toLocaleString()}
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
                            <li>• <strong>Timestamp:</strong> Precise UTC timestamps for event sequencing</li>
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

