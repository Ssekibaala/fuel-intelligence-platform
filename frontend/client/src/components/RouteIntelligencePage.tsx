import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Bookmark,
  Clock3,
  Droplets,
  Fuel,
  Loader2,
  MapPinned,
  Route,
  Search,
  Sparkles,
  TimerReset,
  Trash2,
  Truck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  type JourneyAnalysis,
  type JourneyException,
  type JourneyLocationSuggestion,
  type JourneyOccurrence,
  type JourneySavedRoute,
} from "../lib/api";
import { globalFilterToApiParams } from "../lib/api";
import { useGlobalFilter } from "./GlobalFilterContext";
import { PageHeader } from "./PageHeader";
import { GlassCard } from "./GlassCard";
import { FilterControls } from "./FilterControls";
import { VehicleMultiSelect } from "./VehicleMultiSelect";
import { formatDateTimeEAT } from "@/lib/dateTime";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface RouteIntelligencePageProps {
  pageId?: string;
}

type LocationSelection = JourneyLocationSuggestion | null;
type JourneyRoutePattern = "round_trip" | "one_way";

function normalizeLocation(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatDecimal(value: number | null | undefined, digits = 1) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "0.0";
}

function formatPercent(value: number | null | undefined, digits = 0) {
  const numeric = Number(value ?? 0);
  return `${(numeric * 100).toFixed(digits)}%`;
}

function formatDuration(hours: number | null | undefined) {
  const numeric = Number(hours ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0h";
  const totalMinutes = Math.round(numeric * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours === 0) return `${minutes}m`;
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
}

function compactDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

function formatSignedDelta(value: number, digits = 1, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

function getDeltaTone(delta: number) {
  if (delta > 0) return "text-amber-700 dark:text-amber-300";
  if (delta < 0) return "text-emerald-700 dark:text-emerald-300";
  return "text-muted-foreground";
}

function getExceptionTone(type: JourneyException["type"]) {
  if (type === "incomplete_return") return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (type === "high_fuel") return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

function routePathLabel(routePattern: JourneyRoutePattern, departureLocation: string, destinationLocation: string) {
  if (routePattern === "one_way") return `${departureLocation} → ${destinationLocation}`;
  return `${departureLocation} → ${destinationLocation} → ${departureLocation}`;
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Route;
}) {
  return (
    <GlassCard className="p-4" hover={false}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-background/70 p-2.5 text-primary shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </GlassCard>
  );
}

function LocationAutocomplete({
  label,
  placeholder,
  selected,
  onSelect,
  clientId,
  disabledLocation,
}: {
  label: string;
  placeholder: string;
  selected: LocationSelection;
  onSelect: (location: LocationSelection) => void;
  clientId?: string;
  disabledLocation?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(selected?.location ?? "");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setSearch(selected?.location ?? "");
  }, [selected?.location]);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["/api/journey-intelligence/locations", clientId, deferredSearch],
    queryFn: () =>
      api.getJourneyLocations({
        q: deferredSearch.trim() || undefined,
        clientId,
      }),
    staleTime: 60_000,
  });

  const validSelection =
    selected && normalizeLocation(selected.location) === normalizeLocation(search);
  const disabledNormalized = disabledLocation ? normalizeLocation(disabledLocation) : null;
  const filteredSuggestions = suggestions.filter((suggestion) => {
    if (!disabledNormalized) return true;
    return normalizeLocation(suggestion.location) !== disabledNormalized;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </label>
        {validSelection ? (
          <Badge variant="secondary" className="border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            DB matched
          </Badge>
        ) : null}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full justify-between border-border/50 bg-background/70 px-3 text-left shadow-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              <MapPinned className="h-4 w-4 text-muted-foreground" />
              <span className={`truncate text-sm ${search ? "text-foreground" : "text-muted-foreground"}`}>
                {search || placeholder}
              </span>
            </div>
            <Search className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[420px] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={placeholder}
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                if (selected && normalizeLocation(selected.location) !== normalizeLocation(value)) {
                  onSelect(null);
                }
              }}
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching route locations...
                </div>
              ) : null}
              {!isLoading ? (
                <CommandEmpty>
                  {deferredSearch.trim()
                    ? "This location does not exist in the database. Choose from the suggested list."
                    : "Start typing to search existing trip locations."}
                </CommandEmpty>
              ) : null}
              <CommandGroup heading="Available locations">
                {filteredSuggestions.map((suggestion) => (
                  <CommandItem
                    key={`${label}-${suggestion.normalizedLocation}`}
                    value={suggestion.location}
                    onSelect={() => {
                      onSelect(suggestion);
                      setSearch(suggestion.location);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{suggestion.location}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {suggestion.usageCount} matches in recent trip history
                        {suggestion.lastSeenAt ? ` • last seen ${compactDate(suggestion.lastSeenAt)}` : ""}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!validSelection && search.trim() ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Select an existing database location before running route analysis.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Autocomplete is sourced from live `trip_reports` locations only.
        </p>
      )}
    </div>
  );
}

export function RouteIntelligencePage({ pageId = "journeys" }: RouteIntelligencePageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { state: filterState } = useGlobalFilter();
  const [routePattern, setRoutePattern] = useState<JourneyRoutePattern>("round_trip");
  const [departureLocation, setDepartureLocation] = useState<LocationSelection>(null);
  const [destinationLocation, setDestinationLocation] = useState<LocationSelection>(null);
  const [localVehicleIds, setLocalVehicleIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const filterParams = globalFilterToApiParams(filterState);
  const clientId = filterState.selectedClientId !== "all" ? filterState.selectedClientId : undefined;
  const selectedVehicleIds = localVehicleIds.length > 0 ? localVehicleIds : filterState.selectedVehicles;

  const analysisEnabled = Boolean(departureLocation && destinationLocation);
  const analysisFilters = analysisEnabled
    ? {
        departureLocation: departureLocation!.location,
        destinationLocation: destinationLocation!.location,
        routePattern,
        clientId,
        vehicleIds: selectedVehicleIds.length > 0 ? selectedVehicleIds : undefined,
        startDate: filterParams.startDate,
        endDate: filterParams.endDate,
        startDay: filterParams.startDay,
        endDay: filterParams.endDay,
      }
    : undefined;

  const analysisQuery = useQuery({
    queryKey: ["/api/journey-intelligence/analysis", analysisFilters],
    queryFn: () => api.getJourneyAnalysis(analysisFilters!),
    enabled: analysisEnabled,
    staleTime: 60_000,
  });

  const savedRoutesQuery = useQuery({
    queryKey: ["/api/journey-intelligence/saved-routes"],
    queryFn: () => api.getJourneySavedRoutes(),
    staleTime: 30_000,
  });

  const saveRouteMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      departureLocation: string;
      destinationLocation: string;
      clientId?: string;
      filters?: Record<string, unknown>;
    }) => api.createJourneySavedRoute(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journey-intelligence/saved-routes"] });
      setSaveDialogOpen(false);
      setSaveName("");
      toast({
        title: "Route saved",
        description: "The route pair has been saved and will remain available in Journey Intelligence.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save route",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const archiveRouteMutation = useMutation({
    mutationFn: (routeId: string) => api.deleteJourneySavedRoute(routeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journey-intelligence/saved-routes"] });
      toast({
        title: "Saved route removed",
        description: "The route definition has been archived.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to archive route",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const analysis = analysisQuery.data;
  const mostActiveVehicle = analysis?.vehiclePerformance[0] ?? null;
  const routeAverageFuel = analysis?.summary.averageFuelUsedLitres ?? 0;
  const routeAverageDuration = analysis?.summary.averageDurationHours ?? 0;
  const mostFuelIntensiveTrip =
    analysis?.occurrences.reduce<JourneyOccurrence | null>((best, occurrence) => {
      if (!best || occurrence.routeFuelUsedLitres > best.routeFuelUsedLitres) return occurrence;
      return best;
    }, null) ?? null;

  const trendChartData =
    analysis?.trends.map((trend) => ({
      ...trend,
      label: compactDate(`${trend.dateKey}T00:00:00.000Z`),
    })) ?? [];

  const currentScopeSummary = [
    filterState.dateRange.label,
    clientId ? "Client scoped" : "All visible clients",
    selectedVehicleIds.length > 0 ? `${selectedVehicleIds.length} selected vehicle${selectedVehicleIds.length === 1 ? "" : "s"}` : "All visible vehicles",
  ].join(" • ");

  useEffect(() => {
    if (saveDialogOpen && departureLocation && destinationLocation && !saveName.trim()) {
      setSaveName(routePathLabel(routePattern, departureLocation.location, destinationLocation.location));
    }
  }, [departureLocation, destinationLocation, routePattern, saveDialogOpen, saveName]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <PageHeader pageId={pageId} className="mb-0 md:hidden" />
        <FilterControls compact />
      </div>

      <GlassCard className="overflow-hidden border-primary/15">
        <div className="border-b border-border/30 bg-gradient-to-r from-primary/10 via-background/95 to-sky-500/10 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Journey Intelligence
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                Route behaviour analysis from real trip history
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Select an origin and destination from existing database locations. The module can detect one-way
                journeys or full A → B → A cycles, surface every occurrence, and compare route behaviour over time.
              </p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/75 px-4 py-3 text-sm text-muted-foreground shadow-sm">
              {currentScopeSummary}
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Journey Mode
              </div>
              <div className="flex h-12 items-center gap-1 rounded-xl border border-border/50 bg-background/70 p-1 shadow-sm">
                <Button
                  type="button"
                  variant={routePattern === "round_trip" ? "default" : "ghost"}
                  className="h-10 flex-1"
                  onClick={() => setRoutePattern("round_trip")}
                >
                  Round Trip
                </Button>
                <Button
                  type="button"
                  variant={routePattern === "one_way" ? "default" : "ghost"}
                  className="h-10 flex-1"
                  onClick={() => setRoutePattern("one_way")}
                >
                  One Way
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {routePattern === "round_trip"
                  ? "Measures A → B → A, including dwell at B before the return reaches A."
                  : "Measures a one-way journey from the selected departure to the selected destination."}
              </p>
            </div>
            <LocationAutocomplete
              label="Departure Location"
              placeholder="Search departure location"
              selected={departureLocation}
              onSelect={setDepartureLocation}
              clientId={clientId}
              disabledLocation={destinationLocation?.location}
            />
            <LocationAutocomplete
              label={routePattern === "round_trip" ? "Location B" : "Destination Location"}
              placeholder="Search destination location"
              selected={destinationLocation}
              onSelect={setDestinationLocation}
              clientId={clientId}
              disabledLocation={departureLocation?.location}
            />
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Vehicle Focus
              </div>
              <VehicleMultiSelect
                selectedVehicleIds={localVehicleIds}
                onSelectionChange={setLocalVehicleIds}
                clientId={clientId}
                className="h-12"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to inherit the global vehicle scope.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-12 shrink-0 border-border/50 bg-background/70 px-4"
                onClick={() => {
                  setDepartureLocation(destinationLocation);
                  setDestinationLocation(departureLocation);
                }}
                disabled={!departureLocation || !destinationLocation}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Swap
              </Button>
              <Button
                type="button"
                className="h-12 shrink-0 px-5"
                onClick={() => {
                  if (!analysisEnabled) {
                    toast({
                      title: "Route selection incomplete",
                      description: "Choose both locations from the live suggestion lists before analysis.",
                      variant: "destructive",
                    });
                    return;
                  }
                  queryClient.invalidateQueries({ queryKey: ["/api/journey-intelligence/analysis"] });
                }}
                disabled={!analysisEnabled || analysisQuery.isFetching}
              >
                {analysisQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Analyze Route
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              className="border border-border/50 bg-background/70"
              onClick={() => setSaveDialogOpen(true)}
              disabled={!analysisEnabled}
            >
              <Bookmark className="mr-2 h-4 w-4" />
              Save Current Route
            </Button>
            {analysisEnabled ? (
              <div className="text-sm text-muted-foreground">
                Matching sequence required:{" "}
                <span className="font-medium text-foreground">
                  {routePathLabel(routePattern, departureLocation?.location || "", destinationLocation?.location || "")}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </GlassCard>

      {analysisEnabled && !analysisQuery.isLoading && !analysisQuery.isError && analysis ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={routePattern === "round_trip" ? "Completed Round Trips" : "Completed One-Way Journeys"}
              value={analysis.summary.totalRoundTrips.toString()}
              helper={`${analysis.summary.uniqueVehicles} vehicles detected on this route pair`}
              icon={Route}
            />
            <KpiCard
              label="Completion Rate"
              value={formatPercent(analysis.summary.completionRate)}
              helper={`${analysis.summary.incompleteTrips} outbound journey${analysis.summary.incompleteTrips === 1 ? "" : "s"} without a matched return`}
              icon={Activity}
            />
            <KpiCard
              label="Average Fuel Used"
              value={`${formatDecimal(analysis.summary.averageFuelUsedLitres)} L`}
              helper={`${formatDecimal(analysis.summary.averageDistanceKm)} km per completed round trip`}
              icon={Fuel}
            />
            <KpiCard
              label={routePattern === "round_trip" ? "Average Turnaround" : "Average Journey Time"}
              value={formatDuration(analysis.summary.averageDurationHours)}
              helper={
                routePattern === "round_trip"
                  ? `A→B ${formatDuration(analysis.summary.averageOutboundLegHours)} • dwell ${formatDuration(analysis.summary.averageDestinationDwellHours)} • B→A ${formatDuration(analysis.summary.averageReturnLegHours)}`
                  : `A→B ${formatDuration(analysis.summary.averageOutboundLegHours)} from first departure to arrival`
              }
              icon={Clock3}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <GlassCard className="p-5" hover={false}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Route Signals
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    What stands out on this route pair
                  </h3>
                </div>
                <Badge variant="secondary" className="border border-border/50 bg-background/80">
                  Real trip data only
                </Badge>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Truck className="h-4 w-4 text-primary" />
                    Most active vehicle
                  </div>
                  <div className="mt-3 text-lg font-semibold text-foreground">
                    {mostActiveVehicle?.vehicleLabel || "No matched vehicle yet"}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {mostActiveVehicle ? `${mostActiveVehicle.tripCount} completed round trips` : "Run a route analysis to populate this insight."}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Droplets className="h-4 w-4 text-primary" />
                    Highest route fuel draw
                  </div>
                  <div className="mt-3 text-lg font-semibold text-foreground">
                    {mostFuelIntensiveTrip ? `${formatDecimal(mostFuelIntensiveTrip.routeFuelUsedLitres)} L` : "No route occurrence yet"}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {mostFuelIntensiveTrip
                      ? `${mostFuelIntensiveTrip.vehicleLabel} • ${formatSignedDelta(mostFuelIntensiveTrip.routeFuelUsedLitres - routeAverageFuel, 1, " L")} vs route average`
                      : "A matched occurrence will appear here once found."}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <TimerReset className="h-4 w-4 text-primary" />
                    Longest turnaround
                  </div>
                  <div className="mt-3 text-lg font-semibold text-foreground">
                    {mostFuelIntensiveTrip ? formatDuration(mostFuelIntensiveTrip.roundTripDurationHours) : "No route occurrence yet"}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {mostFuelIntensiveTrip
                      ? `${mostFuelIntensiveTrip.vehicleLabel} • ${formatSignedDelta(mostFuelIntensiveTrip.roundTripDurationHours - routeAverageDuration, 1, " h")} vs route average`
                      : "Duration variance appears here after analysis."}
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5" hover={false}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Route Scope
              </div>
              <div className="mt-3 space-y-3 text-sm">
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <div className="text-muted-foreground">Selected path</div>
                  <div className="mt-2 font-medium text-foreground">
                    {analysis.route.departureLocation}
                  </div>
                  <div className="my-2 text-muted-foreground">to</div>
                  <div className="font-medium text-foreground">{analysis.route.destinationLocation}</div>
                  {analysis.route.routePattern === "round_trip" ? <div className="mt-2 text-xs text-muted-foreground">Return path is measured back to the departure location.</div> : null}
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                  <div className="text-muted-foreground">Date window in use</div>
                  <div className="mt-2 font-medium text-foreground">
                    {filterState.dateRange.label}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {analysis.route.startDate ? formatDateTimeEAT(analysis.route.startDate) : "Unknown"} to{" "}
                    {analysis.route.endDate ? formatDateTimeEAT(analysis.route.endDate) : "Unknown"}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-card/60 p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="occurrences">Occurrences</TabsTrigger>
              <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
              <TabsTrigger value="trends">Trends</TabsTrigger>
              <TabsTrigger value="saved">Saved Routes</TabsTrigger>
              <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
                <GlassCard className="p-5" hover={false}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Route cadence
                      </div>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">
                      {routePattern === "round_trip" ? "Completed round trips over time" : "Completed one-way journeys over time"}
                    </h3>
                    </div>
                    <Badge variant="secondary" className="border border-border/50 bg-background/80">
                      {analysis.trends.length} active day{analysis.trends.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="mt-5 h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="journeyTripsGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.45)" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                        <RechartsTooltip
                          formatter={(value: number, name) => [
                            name === "tripCount" ? `${value} trips` : value,
                            name === "tripCount" ? "Completed round trips" : name,
                          ]}
                          labelFormatter={(_, payload) => {
                            const point = payload?.[0]?.payload;
                            return point?.dateKey ? compactDate(`${point.dateKey}T00:00:00.000Z`) : "";
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="tripCount"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2.5}
                          fill="url(#journeyTripsGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>

                <GlassCard className="p-5" hover={false}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Latest occurrences
                  </div>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">
                      {routePattern === "round_trip" ? "Most recent completed round trips" : "Most recent completed one-way journeys"}
                    </h3>
                  <div className="mt-5 space-y-3">
                    {analysis.occurrences.slice(0, 5).map((occurrence) => {
                      const fuelDelta = occurrence.routeFuelUsedLitres - routeAverageFuel;
                      return (
                        <div key={occurrence.id} className="rounded-2xl border border-border/50 bg-background/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-foreground">{occurrence.vehicleLabel}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatDateTimeEAT(occurrence.departureTime)} to {formatDateTimeEAT(occurrence.returnArrivalTime)}
                              </div>
                            </div>
                            <Badge variant="secondary" className={getDeltaTone(fuelDelta)}>
                              {formatSignedDelta(fuelDelta, 1, " L")}
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                            <div>
                              <div className="text-muted-foreground">Distance</div>
                              <div className="mt-1 font-medium text-foreground">
                                {formatDecimal(occurrence.routeDistanceKm)} km
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Fuel</div>
                              <div className="mt-1 font-medium text-foreground">
                                {formatDecimal(occurrence.routeFuelUsedLitres)} L
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Duration</div>
                              <div className="mt-1 font-medium text-foreground">
                                {formatDuration(occurrence.roundTripDurationHours)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              </div>
            </TabsContent>

            <TabsContent value="occurrences">
              <GlassCard className="overflow-hidden" hover={false}>
                <div className="flex flex-col gap-2 border-b border-border/30 px-5 py-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Round-trip occurrences
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">
                      Every completed A → B → A event in the selected scope
                    </h3>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {analysis.occurrences.length} occurrence{analysis.occurrences.length === 1 ? "" : "s"} detected
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Departed</TableHead>
                        <TableHead>Reached destination</TableHead>
                        <TableHead>A→B</TableHead>
                        {routePattern === "round_trip" ? <TableHead>Dwell at B</TableHead> : null}
                        {routePattern === "round_trip" ? <TableHead>B→A</TableHead> : null}
                        <TableHead>{routePattern === "round_trip" ? "Returned" : "Journey end"}</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Distance</TableHead>
                        <TableHead>Fuel</TableHead>
                        <TableHead>Km/L</TableHead>
                        <TableHead>Idle context</TableHead>
                        <TableHead>Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.occurrences.map((occurrence) => {
                        const fuelDelta = occurrence.routeFuelUsedLitres - routeAverageFuel;
                        const durationDelta = occurrence.roundTripDurationHours - routeAverageDuration;
                        return (
                          <TableRow key={occurrence.id}>
                            <TableCell>
                              <div className="font-medium text-foreground">{occurrence.vehicleLabel}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {occurrence.registrationNumber || occurrence.vehicleKey}
                              </div>
                            </TableCell>
                            <TableCell>{formatDateTimeEAT(occurrence.departureTime)}</TableCell>
                            <TableCell>{formatDateTimeEAT(occurrence.destinationArrivalTime)}</TableCell>
                            <TableCell>{formatDuration(occurrence.outboundLegDurationHours)}</TableCell>
                            {routePattern === "round_trip" ? <TableCell>{formatDuration(occurrence.destinationDwellHours)}</TableCell> : null}
                            {routePattern === "round_trip" ? <TableCell>{formatDuration(occurrence.returnLegDurationHours)}</TableCell> : null}
                            <TableCell>{formatDateTimeEAT(occurrence.returnArrivalTime)}</TableCell>
                            <TableCell>{formatDuration(occurrence.roundTripDurationHours)}</TableCell>
                            <TableCell>{formatDecimal(occurrence.routeDistanceKm)} km</TableCell>
                            <TableCell>{formatDecimal(occurrence.routeFuelUsedLitres)} L</TableCell>
                            <TableCell>
                              {occurrence.routeEfficiency ? formatDecimal(occurrence.routeEfficiency, 2) : "--"}
                            </TableCell>
                            <TableCell>{formatDuration(occurrence.contextualIdleHours)}</TableCell>
                            <TableCell>
                              <div className="space-y-1 text-xs">
                                <div className={getDeltaTone(fuelDelta)}>
                                  Fuel {formatSignedDelta(fuelDelta, 1, " L")}
                                </div>
                                <div className={getDeltaTone(durationDelta)}>
                                  Time {formatSignedDelta(durationDelta, 1, " h")}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </GlassCard>
            </TabsContent>

            <TabsContent value="vehicles">
              <GlassCard className="overflow-hidden" hover={false}>
                <div className="border-b border-border/30 px-5 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Vehicle performance
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    Compare repeated route behaviour by vehicle
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Trips</TableHead>
                        <TableHead>Avg distance</TableHead>
                        <TableHead>Avg fuel</TableHead>
                        <TableHead>Avg A→B</TableHead>
                        <TableHead>Avg duration</TableHead>
                        {routePattern === "round_trip" ? <TableHead>Avg dwell</TableHead> : null}
                        {routePattern === "round_trip" ? <TableHead>Avg B→A</TableHead> : null}
                        <TableHead>Avg km/L</TableHead>
                        <TableHead>Idle context</TableHead>
                        <TableHead>Last departure</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.vehiclePerformance.map((vehicle) => (
                        <TableRow key={vehicle.vehicleKey}>
                          <TableCell>
                            <div className="font-medium text-foreground">{vehicle.vehicleLabel}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {vehicle.registrationNumber || vehicle.vehicleKey}
                            </div>
                          </TableCell>
                          <TableCell>{vehicle.tripCount}</TableCell>
                          <TableCell>{formatDecimal(vehicle.averageDistanceKm)} km</TableCell>
                          <TableCell>{formatDecimal(vehicle.averageFuelUsedLitres)} L</TableCell>
                          <TableCell>{formatDuration(vehicle.averageOutboundLegHours)}</TableCell>
                          <TableCell>{formatDuration(vehicle.averageDurationHours)}</TableCell>
                          {routePattern === "round_trip" ? <TableCell>{formatDuration(vehicle.averageDestinationDwellHours)}</TableCell> : null}
                          {routePattern === "round_trip" ? <TableCell>{formatDuration(vehicle.averageReturnLegHours)}</TableCell> : null}
                          <TableCell>{vehicle.averageRouteEfficiency ? formatDecimal(vehicle.averageRouteEfficiency, 2) : "--"}</TableCell>
                          <TableCell>{formatDuration(vehicle.averageContextIdleHours)}</TableCell>
                          <TableCell>{vehicle.lastDepartureTime ? formatDateTimeEAT(vehicle.lastDepartureTime) : "--"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </GlassCard>
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <GlassCard className="p-5" hover={false}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Fuel trend
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    Total route fuel used by active day
                  </h3>
                  <div className="mt-5 h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.45)" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} />
                        <RechartsTooltip
                          formatter={(value: number) => [`${formatDecimal(value)} L`, "Fuel used"]}
                          labelFormatter={(_, payload) => {
                            const point = payload?.[0]?.payload;
                            return point?.dateKey ? compactDate(`${point.dateKey}T00:00:00.000Z`) : "";
                          }}
                        />
                        <Bar dataKey="totalFuelUsedLitres" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>

                <GlassCard className="p-5" hover={false}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Efficiency trend
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    Average route efficiency by active day
                  </h3>
                  <div className="mt-5 h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="journeyEfficiencyGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.42} />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.45)" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} />
                        <RechartsTooltip
                          formatter={(value: number) => [`${formatDecimal(value, 2)} km/L`, "Average route efficiency"]}
                          labelFormatter={(_, payload) => {
                            const point = payload?.[0]?.payload;
                            return point?.dateKey ? compactDate(`${point.dateKey}T00:00:00.000Z`) : "";
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="averageRouteEfficiency"
                          stroke="#22c55e"
                          strokeWidth={2.5}
                          fill="url(#journeyEfficiencyGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              </div>
            </TabsContent>

            <TabsContent value="saved" className="space-y-4">
              <GlassCard className="p-5" hover={false}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Saved routes
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">
                      Reopen important route pairs without rebuilding the search
                    </h3>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setSaveDialogOpen(true)}
                    disabled={!analysisEnabled}
                  >
                    <Bookmark className="mr-2 h-4 w-4" />
                    Save current route
                  </Button>
                </div>
              </GlassCard>

              <div className="grid gap-4 xl:grid-cols-2">
                {(savedRoutesQuery.data || []).map((route) => {
                  const isCurrent =
                    departureLocation &&
                    destinationLocation &&
                    normalizeLocation(route.departureLocation) === normalizeLocation(departureLocation.location) &&
                    normalizeLocation(route.destinationLocation) === normalizeLocation(destinationLocation.location);
                  return (
                    <GlassCard key={route.id} className="p-5" hover={false}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-foreground">{route.name}</div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            {routePathLabel(
                              ((route.filters?.routePattern as JourneyRoutePattern) || "round_trip"),
                              route.departureLocation,
                              route.destinationLocation
                            )}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Saved {formatDateTimeEAT(route.updatedAt)}
                          </div>
                        </div>
                        {isCurrent ? (
                          <Badge variant="secondary" className="border border-primary/25 bg-primary/10 text-primary">
                            Active
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setDepartureLocation({
                              location: route.departureLocation,
                              normalizedLocation: normalizeLocation(route.departureLocation),
                              usageCount: 0,
                              lastSeenAt: null,
                            });
                            setDestinationLocation({
                              location: route.destinationLocation,
                              normalizedLocation: normalizeLocation(route.destinationLocation),
                              usageCount: 0,
                              lastSeenAt: null,
                            });
                            setRoutePattern(((route.filters?.routePattern as JourneyRoutePattern) || "round_trip"));
                            setActiveTab("overview");
                          }}
                        >
                          Open route
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-red-500/20 text-red-700 hover:text-red-700 dark:text-red-300"
                          onClick={() => archiveRouteMutation.mutate(route.id)}
                          disabled={archiveRouteMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </GlassCard>
                  );
                })}

                {(savedRoutesQuery.data || []).length === 0 ? (
                  <GlassCard className="p-8 text-center" hover={false}>
                    <Bookmark className="mx-auto h-8 w-8 text-muted-foreground" />
                    <div className="mt-4 text-lg font-semibold text-foreground">No saved routes yet</div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Save a route once it is selected so that repeated journey analysis remains one click away.
                    </div>
                  </GlassCard>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="exceptions" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <GlassCard className="p-5" hover={false}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Exception feed
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    Trips that need a second look
                  </h3>
                  <div className="mt-5 space-y-3">
                    {analysis.exceptions.length > 0 ? (
                      analysis.exceptions.map((exception) => (
                        <div key={`${exception.type}-${exception.occurrenceId || exception.departureTime}`} className="rounded-2xl border border-border/50 bg-background/70 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className={getExceptionTone(exception.type)}>
                              {exception.type.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-sm font-medium text-foreground">{exception.vehicleLabel}</span>
                          </div>
                          <div className="mt-3 text-sm text-muted-foreground">{exception.message}</div>
                          <div className="mt-3 text-xs text-muted-foreground">
                            {formatDateTimeEAT(exception.departureTime)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                        No route exceptions were detected in the current scope.
                      </div>
                    )}
                  </div>
                </GlassCard>

                <GlassCard className="p-5" hover={false}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Incomplete returns
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    {routePattern === "round_trip" ? "Outbound legs without a matched return" : "Incomplete journeys"}
                  </h3>
                  <div className="mt-5 space-y-3">
                    {analysis.incompleteOccurrences.length > 0 ? (
                      analysis.incompleteOccurrences.map((occurrence) => (
                        <div key={occurrence.id} className="rounded-2xl border border-border/50 bg-background/70 p-4">
                          <div className="font-medium text-foreground">{occurrence.vehicleLabel}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDateTimeEAT(occurrence.departureTime)}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-muted-foreground">Distance</div>
                              <div className="mt-1 font-medium text-foreground">
                                {formatDecimal(occurrence.routeDistanceKm)} km
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Fuel</div>
                              <div className="mt-1 font-medium text-foreground">
                                {formatDecimal(occurrence.routeFuelUsedLitres)} L
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                        {routePattern === "round_trip"
                          ? "Every detected outbound leg in this scope has a matched return."
                          : "No incomplete one-way journeys were detected in this scope."}
                      </div>
                    )}
                  </div>
                </GlassCard>
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : null}

      {analysisQuery.isLoading ? (
        <GlassCard className="p-8" hover={false}>
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Building route intelligence from live trip data...
          </div>
        </GlassCard>
      ) : null}

      {analysisQuery.isError ? (
        <GlassCard className="p-6" hover={false}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-300" />
            <div>
              <div className="font-semibold text-foreground">Journey analysis failed</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {analysisQuery.error instanceof Error ? analysisQuery.error.message : "The route analysis request failed."}
              </div>
            </div>
          </div>
        </GlassCard>
      ) : null}

      {!analysisEnabled && !analysisQuery.isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <GlassCard className="p-10 text-center" hover={false}>
            <Route className="mx-auto h-10 w-10 text-primary" />
            <div className="mt-4 text-xl font-semibold text-foreground">
              Choose a live route pair to begin
            </div>
            <div className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              Journey Intelligence only works with locations that already exist in the database. Select both ends from
              the autocomplete suggestions and the platform will assemble completed journeys, vehicle performance, route
              trends, and exception signals automatically.
            </div>
          </GlassCard>
          <GlassCard className="p-5" hover={false}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Saved routes
            </div>
            <h3 className="mt-2 text-lg font-semibold text-foreground">
              Reopen previous route pairs
            </h3>
            <div className="mt-5 space-y-3">
              {(savedRoutesQuery.data || []).slice(0, 4).map((route) => (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => {
                    setDepartureLocation({
                      location: route.departureLocation,
                      normalizedLocation: normalizeLocation(route.departureLocation),
                      usageCount: 0,
                      lastSeenAt: null,
                    });
                    setDestinationLocation({
                      location: route.destinationLocation,
                      normalizedLocation: normalizeLocation(route.destinationLocation),
                      usageCount: 0,
                      lastSeenAt: null,
                    });
                    setRoutePattern(((route.filters?.routePattern as JourneyRoutePattern) || "round_trip"));
                  }}
                  className="w-full rounded-2xl border border-border/50 bg-background/70 px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="font-medium text-foreground">{route.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {routePathLabel(
                      ((route.filters?.routePattern as JourneyRoutePattern) || "round_trip"),
                      route.departureLocation,
                      route.destinationLocation
                    )}
                  </div>
                </button>
              ))}
              {(savedRoutesQuery.data || []).length === 0 ? (
                <div className="rounded-2xl border border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
                  No saved route pairs yet.
                </div>
              ) : null}
            </div>
          </GlassCard>
        </div>
      ) : null}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this route</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Route name
              </div>
              <Input
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                placeholder="e.g. Movit loading → Nyanama return"
              />
            </div>
            {departureLocation && destinationLocation ? (
              <div className="rounded-2xl border border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
                This will save the route definition for:
                <div className="mt-2 font-medium text-foreground">
                  {routePathLabel(routePattern, departureLocation.location, destinationLocation.location)}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  The occurrences, trends, and variances will continue to be derived from live trip data whenever you
                  reopen it.
                </div>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!departureLocation || !destinationLocation || !saveName.trim()) {
                    toast({
                      title: "Route name required",
                      description: "Give the saved route a name before continuing.",
                      variant: "destructive",
                    });
                    return;
                  }

                  saveRouteMutation.mutate({
                    name: saveName.trim(),
                    departureLocation: departureLocation.location,
                    destinationLocation: destinationLocation.location,
                    clientId,
                    filters: {
                      startDate: filterParams.startDate,
                      endDate: filterParams.endDate,
                      startDay: filterParams.startDay,
                      endDay: filterParams.endDay,
                      vehicleIds: selectedVehicleIds,
                      routePattern,
                    },
                  });
                }}
                disabled={saveRouteMutation.isPending}
              >
                {saveRouteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bookmark className="mr-2 h-4 w-4" />}
                Save route
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
