import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Filter, RotateCcw, Truck, X, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VehicleMultiSelect } from "./VehicleMultiSelect";
import { DateRangePicker } from "./DateRangePicker";
import { useGlobalFilter, getDateRangeFromPreset } from "./GlobalFilterContext";
import { useAuth } from "./AuthProvider";
import { type DateRange, type Vehicle } from "@shared/schema";
import { api } from "../lib/api";

interface FilterControlsProps {
  className?: string;
  dateRangeOverride?: DateRange;
  onDateRangeOverrideChange?: (dateRange: DateRange) => void;
  defaultDatePreset?: Exclude<NonNullable<DateRange["preset"]>, "custom">;
  compact?: boolean;
  vehicleSelectionMode?: "single" | "multiple";
}

const DATE_PRESET_LABELS: Record<Exclude<NonNullable<DateRange["preset"]>, "custom">, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week_to_date: "Week to Date",
  month_to_date: "Month to Date",
  last_7_days: "Last 7 Days",
  last_30_days: "Last 30 Days",
};

function buildDateRangeFromPreset(
  preset: Exclude<NonNullable<DateRange["preset"]>, "custom">
): DateRange {
  const { startDate, endDate } = getDateRangeFromPreset(preset);
  return {
    preset,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    label: DATE_PRESET_LABELS[preset],
  };
}

function getVehicleDisplayLabel(vehicle: Partial<Vehicle>) {
  const plate = typeof vehicle.vehiclePlate === "string" ? vehicle.vehiclePlate.trim() : "";
  if (plate) return plate;
  const asset = typeof vehicle.assetId === "string" ? vehicle.assetId.trim() : "";
  if (asset) return asset;
  const driver = typeof vehicle.driverName === "string" ? vehicle.driverName.trim() : "";
  if (driver) return driver;
  const id = typeof vehicle.id === "string" ? vehicle.id : "";
  return id ? `Vehicle ${id.slice(0, 8)}` : "Unknown Vehicle";
}

function formatDateRangeWindow(dateRange: DateRange): string {
  const startValue = dateRange.startDate;
  const endValue = dateRange.endDate;
  if (!startValue || !endValue) return "Custom range";

  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Custom range";

  const formatLong = (date: Date) =>
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return formatLong(start);
  return `${formatLong(start)} - ${formatLong(end)}`;
}

function compactLabel(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
}

export function FilterControls({
  className = "",
  dateRangeOverride,
  onDateRangeOverrideChange,
  defaultDatePreset = "last_7_days",
  compact = false,
  vehicleSelectionMode = "multiple",
}: FilterControlsProps) {
  const { state, actions } = useGlobalFilter();
  const { isAdmin, clients: assignedClients } = useAuth();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: adminClients = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/admin/clients", "filter-controls"],
    queryFn: () => api.getAdminClients(),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const availableClients = useMemo(() => {
    const raw = (isAdmin ? adminClients : assignedClients) || [];
    const deduped = new Map<string, { id: string; name: string }>();

    raw.forEach((client: any) => {
      const id = String(client?.id || "").trim();
      if (!id) return;
      const name = String(client?.name || id).trim();
      deduped.set(id, { id, name: name || id });
    });

    return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [isAdmin, adminClients, assignedClients]);

  const selectedClientName = useMemo(() => {
    if (state.selectedClientId === "all") return "All clients";
    return availableClients.find((client) => client.id === state.selectedClientId)?.name || "Selected client";
  }, [availableClients, state.selectedClientId]);

  useEffect(() => {
    if (state.selectedClientId === "all") return;
    if (availableClients.length === 0) return;
    const isValid = availableClients.some((client) => client.id === state.selectedClientId);
    if (!isValid) {
      actions.setSelectedClientId("all");
    }
  }, [actions, availableClients, state.selectedClientId]);

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles", state.selectedClientId],
    queryFn: () =>
      api.getVehicles({
        clientId: state.selectedClientId !== "all" ? state.selectedClientId : undefined,
      }),
    staleTime: 5 * 60 * 1000,
  });
  const activeDateRange = dateRangeOverride ?? state.dateRange;
  const setDateRange = onDateRangeOverrideChange ?? actions.setDateRange;
  const hasClientFilter = state.selectedClientId !== "all";
  const hasDateRangeFilter =
    activeDateRange.preset !== defaultDatePreset &&
    Boolean(activeDateRange.startDate) &&
    Boolean(activeDateRange.endDate);
  const hasActiveFilters = hasClientFilter || state.selectedVehicles.length > 0 || hasDateRangeFilter;
  const dateRangeLabel = activeDateRange.label || "Custom range";
  const dateRangeWindow = formatDateRangeWindow(activeDateRange);
  const selectedVehicleLabels = useMemo(() => {
    if (state.selectedVehicles.length === 0) return [];
    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    return state.selectedVehicles.map((id) => {
      const vehicle = vehicleById.get(id);
      return vehicle ? getVehicleDisplayLabel(vehicle) : `Vehicle ${id.slice(0, 8)}`;
    });
  }, [state.selectedVehicles, vehicles]);
  const visibleVehicleLabels = selectedVehicleLabels.slice(0, 3);
  const hiddenVehicleCount = Math.max(0, selectedVehicleLabels.length - visibleVehicleLabels.length);
  const clientChipLabel = compactLabel(selectedClientName, 24);
  const dateRangeWindowChipLabel = compactLabel(dateRangeWindow, 26);
  const compactVehicleLabel =
    selectedVehicleLabels.length === 0
      ? "All vehicles"
      : selectedVehicleLabels.length === 1
        ? compactLabel(selectedVehicleLabels[0], 18)
        : `${selectedVehicleLabels.length} vehicles`;

  const resetFilters = () => {
    if (!dateRangeOverride) {
      actions.resetFilters();
      return;
    }
    actions.setSelectedClientId("all");
    actions.setSelectedVehicles([]);
    setDateRange(buildDateRangeFromPreset(defaultDatePreset));
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 sm:gap-3 ${className}`}>
      {/* Main Filter Button */}
      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="hover-elevate bg-card/40 backdrop-blur-sm border-border/30 relative"
            data-testid="button-global-filters"
          >
            <Filter className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
            )}
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-[min(92vw,500px)] p-0" align="start">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Global Filters</h3>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  data-testid="button-reset-filters"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {/* Client Selection */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Client Scope
                </label>
                <Select
                  value={state.selectedClientId}
                  onValueChange={(value) => actions.setSelectedClientId(value)}
                >
                  <SelectTrigger className="h-9" data-testid="select-client-scope">
                    <Building2 className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Select client scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {availableClients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Vehicle Selection */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Vehicle Selection
                </label>
                <VehicleMultiSelect
                  selectedVehicleIds={state.selectedVehicles}
                  onSelectionChange={actions.setSelectedVehicles}
                  selectionMode={vehicleSelectionMode}
                />
              </div>

              {/* Date Range */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Date Range
                </label>
                <DateRangePicker
                  value={activeDateRange}
                  onChange={setDateRange}
                />
              </div>

            </div>

            <Separator className="my-4" />
            <div className="space-y-2 rounded-lg border border-border/30 bg-card/30 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Current Filters
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Building2 className="mt-0.5 h-3.5 w-3.5 text-primary" />
                <div className="font-medium text-foreground">{selectedClientName}</div>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <CalendarDays className="mt-0.5 h-3.5 w-3.5 text-primary" />
                <div>
                  <div className="font-medium text-foreground">{dateRangeLabel}</div>
                  <div className="text-muted-foreground">{dateRangeWindow}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Truck className="mt-0.5 h-3.5 w-3.5 text-primary" />
                <div className="space-y-1">
                  {selectedVehicleLabels.length === 0 ? (
                    <div className="font-medium text-foreground">All vehicles</div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {selectedVehicleLabels.slice(0, 6).map((label, index) => (
                        <Badge key={`${label}-${index}`} variant="secondary" className="text-[10px]">
                          {label}
                        </Badge>
                      ))}
                      {selectedVehicleLabels.length > 6 && (
                        <Badge variant="secondary" className="text-[10px]">
                          +{selectedVehicleLabels.length - 6} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {compact ? (
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant="secondary"
            className="max-w-[150px] truncate text-[10px]"
            data-testid="badge-selected-client-compact"
          >
            <Building2 className="mr-1 h-3 w-3" />
            {clientChipLabel}
          </Badge>
          <Badge
            variant="outline"
            className="max-w-[190px] truncate border-border/40 bg-background/40 text-[10px]"
            data-testid="badge-date-range-compact"
          >
            <CalendarDays className="mr-1 h-3 w-3" />
            {compactLabel(`${dateRangeLabel} | ${dateRangeWindowChipLabel}`, 28)}
          </Badge>
          <Badge
            variant="secondary"
            className="max-w-[130px] truncate text-[10px]"
            data-testid="badge-selected-vehicles-compact"
          >
            <Truck className="mr-1 h-3 w-3" />
            {compactVehicleLabel}
          </Badge>
        </div>
      ) : (
        <>
          {/* Applied Filters Strip - Mobile */}
          <div className="w-full md:hidden">
            <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border/30 bg-card/30 px-3 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Applied
              </span>
              <Badge variant="secondary" className="max-w-[165px] flex-shrink-0 truncate text-[10px]">
                <Building2 className="h-3 w-3 mr-1" />
                {clientChipLabel}
              </Badge>
              <Badge variant="secondary" className="max-w-[140px] flex-shrink-0 truncate text-[10px]">
                <CalendarDays className="h-3 w-3 mr-1" />
                {dateRangeLabel}
              </Badge>
              <Badge variant="outline" className="max-w-[180px] flex-shrink-0 truncate text-[10px] border-border/40 bg-background/40">
                {dateRangeWindowChipLabel}
              </Badge>

          {visibleVehicleLabels.length === 0 ? (
            <Badge variant="secondary" className="flex-shrink-0 text-[10px]">
              <Truck className="h-3 w-3 mr-1" />
              All vehicles
            </Badge>
          ) : (
            <>
              {visibleVehicleLabels.map((label, index) => (
                <Badge
                  key={`mobile-${label}-${index}`}
                  variant="secondary"
                  className="max-w-[145px] flex-shrink-0 truncate text-[10px]"
                >
                  {compactLabel(label, 18)}
                </Badge>
              ))}
              {hiddenVehicleCount > 0 && (
                <Badge variant="outline" className="flex-shrink-0 text-[10px] border-border/40 bg-background/40">
                  +{hiddenVehicleCount} more
                </Badge>
              )}
            </>
          )}

          {state.selectedVehicles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => actions.setSelectedVehicles([])}
              className="h-6 flex-shrink-0 px-2 text-[10px] text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3 mr-1" />
              Clear Vehicles
            </Button>
          )}

          {hasClientFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => actions.setSelectedClientId("all")}
              className="h-6 flex-shrink-0 px-2 text-[10px] text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3 mr-1" />
              All Clients
            </Button>
          )}

          {hasDateRangeFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDateRange(buildDateRangeFromPreset(defaultDatePreset))}
              className="h-6 flex-shrink-0 px-2 text-[10px] text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3 mr-1" />
              Reset Range
            </Button>
          )}

            </div>
          </div>

          {/* Applied Filters Strip */}
          <div className="hidden max-w-[960px] items-center gap-2 overflow-x-auto rounded-xl border border-border/30 bg-card/30 px-3 py-1.5 md:flex [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Applied</span>
            <Badge
              variant="secondary"
              className="max-w-[220px] truncate text-xs"
              data-testid="badge-selected-client"
            >
              <Building2 className="h-3 w-3" />
              {clientChipLabel}
            </Badge>
            <Badge
              variant="secondary"
              className="flex items-center gap-1 text-xs"
              data-testid="badge-date-range"
            >
              <CalendarDays className="h-3 w-3" />
              {dateRangeLabel}
            </Badge>
            <Badge variant="outline" className="max-w-[220px] truncate text-xs border-border/40 bg-background/40">
              {dateRangeWindowChipLabel}
            </Badge>

            {visibleVehicleLabels.length === 0 ? (
              <Badge variant="secondary" className="flex items-center gap-1 text-xs" data-testid="badge-selected-vehicles">
                <Truck className="h-3 w-3" />
                All vehicles
              </Badge>
            ) : (
              <>
                {visibleVehicleLabels.map((label, index) => (
                  <Badge
                    key={`${label}-${index}`}
                    variant="secondary"
                    className="max-w-[170px] truncate text-xs"
                    data-testid={index === 0 ? "badge-selected-vehicles" : undefined}
                  >
                    {compactLabel(label, 20)}
                  </Badge>
                ))}
                {hiddenVehicleCount > 0 && (
                  <Badge variant="outline" className="text-xs border-border/40 bg-background/40">
                    +{hiddenVehicleCount} more
                  </Badge>
                )}
              </>
            )}

            {state.selectedVehicles.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => actions.setSelectedVehicles([])}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                data-testid="button-clear-vehicle-filter"
              >
                <X className="h-3 w-3 mr-1" />
                Clear Vehicles
              </Button>
            )}

            {hasClientFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => actions.setSelectedClientId("all")}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                data-testid="button-clear-client-filter"
              >
                <X className="h-3 w-3 mr-1" />
                All Clients
              </Button>
            )}

            {hasDateRangeFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDateRange(buildDateRangeFromPreset(defaultDatePreset))}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                data-testid="button-reset-date-range"
              >
                <X className="h-3 w-3 mr-1" />
                Reset Range
              </Button>
            )}
          </div>

          {/* Loading Indicator */}
          {state.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="hidden sm:inline">Updating...</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}


