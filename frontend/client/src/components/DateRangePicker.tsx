import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { type DateRange } from "@shared/schema";
import { getDateRangeFromPreset } from "./GlobalFilterContext";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (dateRange: DateRange) => void;
  presets?: ReadonlyArray<DatePresetOption>;
  className?: string;
}

type DatePresetOption = {
  value: "today" | "yesterday" | "week_to_date" | "month_to_date" | "last_7_days" | "last_30_days";
  label: string;
};

const DEFAULT_PRESETS: ReadonlyArray<DatePresetOption> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week_to_date", label: "Week to Date" },
  { value: "month_to_date", label: "Month to Date" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
];

export function DateRangePicker({
  value,
  onChange,
  presets,
  className = ""
}: DateRangePickerProps) {
  const availablePresets = presets && presets.length > 0 ? presets : DEFAULT_PRESETS;
  const [open, setOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"presets" | "custom">(
    value.preset ? "presets" : "custom"
  );
  const [resetOnNextSelection, setResetOnNextSelection] = useState(false);
  
  // Custom range state
  const [customRange, setCustomRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>(() => {
    if (value.startDate && value.endDate) {
      return {
        from: new Date(value.startDate),
        to: new Date(value.endDate)
      };
    }
    return { from: undefined, to: undefined };
  });

  useEffect(() => {
    if (value.startDate && value.endDate) {
      setCustomRange({
        from: new Date(value.startDate),
        to: new Date(value.endDate),
      });
    }
  }, [value.startDate, value.endDate]);

  useEffect(() => {
    if (open && selectedTab === "custom") {
      setResetOnNextSelection(true);
    }
  }, [open, selectedTab]);

  const handlePresetSelect = (preset: string) => {
    const presetConfig = availablePresets.find(p => p.value === preset);
    if (presetConfig) {
      const { startDate, endDate } = getDateRangeFromPreset(preset);
      
      onChange({
        preset: preset as any,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        label: presetConfig.label
      });
      
      setOpen(false);
    }
  };

  const handleCustomRangeSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range) return;
    
    if (resetOnNextSelection && range.from) {
      setCustomRange({ from: range.from, to: undefined });
      setResetOnNextSelection(false);
      return;
    }

    setCustomRange({ from: range.from, to: range.to });
  };

  const applyCustomRange = () => {
    if (!customRange.from || !customRange.to) return;

    onChange({
      preset: "custom",
      startDate: customRange.from.toISOString(),
      endDate: customRange.to.toISOString(),
      label: `${format(customRange.from, "MMM d")} - ${format(customRange.to, "MMM d, yyyy")}`,
    });

    setOpen(false);
  };

  const clearCustomRange = () => {
    setCustomRange({ from: undefined, to: undefined });
    setResetOnNextSelection(true);
  };

  const getDisplayText = () => {
    if (value.label) {
      return value.label;
    }
    
    if (value.startDate && value.endDate) {
      const start = new Date(value.startDate);
      const end = new Date(value.endDate);
      return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
    }
    
    return "Select date range";
  };

  const getPresetSummary = (preset: string) => {
    const { startDate, endDate } = getDateRangeFromPreset(preset);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return `${days} ${days === 1 ? "day" : "days"}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`justify-between hover-elevate bg-card/40 backdrop-blur-sm border-border/30 ${className}`}
          data-testid="button-date-range-picker"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate text-sm">{getDisplayText()}</span>
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[420px] p-0" align="start">
        <div className="flex">
          {/* Tab Navigation */}
          <div className="flex flex-col w-32 border-r border-border/20">
            <Button
              variant={selectedTab === "presets" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSelectedTab("presets")}
              className="justify-start rounded-none h-10 px-3"
              data-testid="tab-date-presets"
            >
              <Clock className="h-4 w-4 mr-2" />
              Presets
            </Button>
            <Button
              variant={selectedTab === "custom" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSelectedTab("custom")}
              className="justify-start rounded-none h-10 px-3"
              data-testid="tab-date-custom"
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              Custom
            </Button>
          </div>

          {/* Content Area */}
          <div className="flex-1">
            {selectedTab === "presets" ? (
              <div className="p-3">
                <div className="space-y-1">
                  {availablePresets.map((preset) => {
                    const isSelected = value.preset === preset.value;
                    
                    return (
                      <button
                        key={preset.value}
                        onClick={() => handlePresetSelect(preset.value)}
                        className={`w-full text-left p-3 rounded-lg border transition-all hover-elevate ${
                          isSelected 
                            ? "bg-primary/10 border-primary/20 text-primary" 
                            : "bg-card/20 border-border/20 hover:bg-card/40"
                        }`}
                        data-testid={`preset-${preset.value}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{preset.label}</span>
                          {isSelected && (
                            <Badge variant="secondary" className="text-xs">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {getPresetSummary(preset.value)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-3">
                <div className="text-sm font-medium mb-3">Select Custom Range</div>
                <Calendar
                  mode="range"
                  defaultMonth={customRange.from}
                  selected={customRange}
                  onSelect={handleCustomRangeSelect}
                  numberOfMonths={1}
                  className="rounded-md border border-border/20 !p-1"
                  classNames={{
                    day_selected:
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_range_middle:
                      "aria-selected:bg-primary/15 aria-selected:text-foreground",
                    cell:
                      "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-primary/10 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                  }}
                  data-testid="calendar-custom-range"
                />

                <Separator className="my-3" />
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground">
                    {customRange.from && customRange.to
                      ? `Selected: ${format(customRange.from, "MMM d, yyyy")} - ${format(customRange.to, "MMM d, yyyy")}`
                      : "Pick a start and end date"}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCustomRange}
                      disabled={!customRange.from && !customRange.to}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={applyCustomRange}
                      disabled={!customRange.from || !customRange.to}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
