import { useState } from "react";
import { Filter, RotateCcw, DollarSign, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VehicleMultiSelect } from "./VehicleMultiSelect";
import { DateRangePicker } from "./DateRangePicker";
import { useGlobalFilter } from "./GlobalFilterContext";

interface FilterControlsProps {
  className?: string;
}

export function FilterControls({ className = "" }: FilterControlsProps) {
  const { state, actions, computed } = useGlobalFilter();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleCurrencyChange = (currency: "KES" | "UGX" | "USD") => {
    actions.setCurrency(currency);
  };

  const handleRefreshIntervalChange = (interval: string) => {
    actions.setRefreshInterval(parseInt(interval));
  };

  const getCurrencyIcon = (currency: string) => {
    switch (currency) {
      case "KES": return "KES";
      case "UGX": return "UGX";
      case "USD": return "USD";
      default: return "KES";
    }
  };

  const getRefreshIntervalLabel = (interval: number) => {
    if (interval < 60000) return `${interval / 1000}s`;
    return `${interval / 60000}m`;
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
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
            {computed.hasActiveFilters && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
            )}
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-[500px] p-0" align="start">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Global Filters</h3>
              {computed.hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={actions.resetFilters}
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  data-testid="button-reset-filters"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {/* Vehicle Selection */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Vehicle Selection
                </label>
                <VehicleMultiSelect
                  selectedVehicleIds={state.selectedVehicles}
                  onSelectionChange={actions.setSelectedVehicles}
                />
              </div>

              {/* Date Range */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Date Range
                </label>
                <DateRangePicker
                  value={state.dateRange}
                  onChange={actions.setDateRange}
                />
              </div>

              <Separator />

              {/* Settings */}
              <div className="grid grid-cols-2 gap-4">
                {/* Currency */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">
                    Currency
                  </label>
                  <Select value={state.currency} onValueChange={handleCurrencyChange}>
                    <SelectTrigger className="h-9" data-testid="select-currency">
                      <DollarSign className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="KES">Kenyan Shilling (KES)</SelectItem>
                      <SelectItem value="UGX">Ugandan Shilling (UGX)</SelectItem>
                      <SelectItem value="USD">US Dollar (USD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Refresh Interval */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">
                    Auto Refresh
                  </label>
                  <Select 
                    value={state.refreshInterval.toString()} 
                    onValueChange={handleRefreshIntervalChange}
                  >
                    <SelectTrigger className="h-9" data-testid="select-refresh-interval">
                      <Settings2 className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15000">15 seconds</SelectItem>
                      <SelectItem value="30000">30 seconds</SelectItem>
                      <SelectItem value="60000">1 minute</SelectItem>
                      <SelectItem value="300000">5 minutes</SelectItem>
                      <SelectItem value="0">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Filter Summary */}
            {computed.hasActiveFilters && (
              <>
                <Separator className="my-4" />
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Active filters:</span> {computed.filterSummary}
                </div>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Currency Display */}
      <Badge 
        variant="outline" 
        className="hidden sm:flex items-center gap-1 bg-card/40 backdrop-blur-sm border-border/30"
        data-testid="badge-currency"
      >
        <DollarSign className="h-3 w-3" />
        {getCurrencyIcon(state.currency)}
      </Badge>

      {/* Active Filters Summary (when filters are active) */}
      {computed.hasActiveFilters && (
        <div className="hidden md:flex items-center gap-2">
          <Separator orientation="vertical" className="h-4" />
          
          {/* Vehicle count */}
          {state.selectedVehicles.length > 0 && (
            <Badge 
              variant="secondary" 
              className="flex items-center gap-1 text-xs"
              data-testid="badge-selected-vehicles"
            >
              {state.selectedVehicles.length} vehicle{state.selectedVehicles.length !== 1 ? "s" : ""}
              <button
                onClick={() => actions.setSelectedVehicles([])}
                className="ml-1 hover:bg-destructive/20 rounded-sm p-0.5"
                data-testid="button-clear-vehicle-filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {/* Date range */}
          {state.dateRange.preset !== "last_7_days" && (
            <Badge 
              variant="secondary" 
              className="flex items-center gap-1 text-xs"
              data-testid="badge-date-range"
            >
              {computed.dateRangeLabel}
              <button
                onClick={() => actions.setDateRange({ 
                  preset: "last_7_days", 
                  label: "Last 7 Days" 
                })}
                className="ml-1 hover:bg-destructive/20 rounded-sm p-0.5"
                data-testid="button-reset-date-range"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Refresh Indicator */}
      {state.refreshInterval > 0 && (
        <Badge 
          variant="outline" 
          className="hidden lg:flex items-center gap-1 bg-card/40 backdrop-blur-sm border-border/30 text-xs animate-pulse"
          data-testid="badge-auto-refresh"
        >
          <Settings2 className="h-3 w-3" />
          Auto: {getRefreshIntervalLabel(state.refreshInterval)}
        </Badge>
      )}

      {/* Loading Indicator */}
      {state.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="hidden sm:inline">Updating...</span>
        </div>
      )}
    </div>
  );
}