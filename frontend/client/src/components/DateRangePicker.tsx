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

export type DatePresetOption = {
  value: string;
  label: string;
  getRange?: () => { startDate: Date; endDate: Date };
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
    value.preset && value.preset !== "custom" ? "presets" : "custom"
  );
  const [selectionPhase, setSelectionPhase] = useState<"start" | "end">("start");
  
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
      setSelectionPhase("start");
    }
  }, [open, selectedTab]);

  useEffect(() => {
    if (value.preset === "custom") {
      setSelectedTab("custom");
      return;
    }
    if (value.preset) {
      setSelectedTab("presets");
    }
  }, [value.preset]);

  const handlePresetSelect = (preset: string) => {
    const presetConfig = availablePresets.find(p => p.value === preset);
    if (presetConfig) {
      const { startDate, endDate } = presetConfig.getRange
        ? presetConfig.getRange()
        : getDateRangeFromPreset(preset);
      
      onChange({
        preset: presetConfig.getRange ? "custom" : preset as any,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        label: presetConfig.label
      });
      
      setOpen(false);
    }
  };

  const handleCustomDayClick = (day: Date, disabled: boolean) => {
    if (disabled) return;

    const clickedDate = new Date(day.getFullYear(), day.getMonth(), day.getDate());

    if (selectionPhase === "start" || !customRange.from || customRange.to) {
      setCustomRange({ from: clickedDate, to: undefined });
      setSelectionPhase("end");
      return;
    }

    const startDate = customRange.from;
    if (clickedDate.getTime() >= startDate.getTime()) {
      setCustomRange({ from: startDate, to: clickedDate });
    } else {
      setCustomRange({ from: clickedDate, to: startDate });
    }
    setSelectionPhase("start");
  };

  const applyCustomRange = () => {
    if (!customRange.from || !customRange.to) return;
    const start = new Date(
      customRange.from.getFullYear(),
      customRange.from.getMonth(),
      customRange.from.getDate(),
      0,
      0,
      0,
      0
    );
    const end = new Date(
      customRange.to.getFullYear(),
      customRange.to.getMonth(),
      customRange.to.getDate(),
      23,
      59,
      59,
      999
    );

    onChange({
      preset: "custom",
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label: `${format(customRange.from, "MMM d")} - ${format(customRange.to, "MMM d, yyyy")}`,
    });

    setOpen(false);
  };

  const clearCustomRange = () => {
    setCustomRange({ from: undefined, to: undefined });
    setSelectionPhase("start");
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
    const presetConfig = availablePresets.find((option) => option.value === preset);
    const { startDate, endDate } = presetConfig?.getRange
      ? presetConfig.getRange()
      : getDateRangeFromPreset(preset);
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
      
      <PopoverContent className="w-[min(96vw,390px)] p-0" align="start">
        <div className="flex">
          {/* Tab Navigation */}
          <div className="flex w-24 flex-col border-r border-border/20">
            <Button
              variant={selectedTab === "presets" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSelectedTab("presets")}
              className="h-8 justify-start rounded-none px-2 text-xs"
              data-testid="tab-date-presets"
            >
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              Presets
            </Button>
            <Button
              variant={selectedTab === "custom" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSelectedTab("custom")}
              className="h-8 justify-start rounded-none px-2 text-xs"
              data-testid="tab-date-custom"
            >
              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
              Custom
            </Button>
          </div>

          {/* Content Area */}
          <div className="flex-1">
            {selectedTab === "presets" ? (
              <div className="p-2.5">
                <div className="grid grid-cols-2 gap-1.5">
                  {availablePresets.map((preset) => {
                    const isSelected = preset.getRange
                      ? value.preset === "custom" && value.label === preset.label
                      : value.preset === preset.value;
                    
                    return (
                      <button
                        key={preset.value}
                        onClick={() => handlePresetSelect(preset.value)}
                        className={`w-full rounded-md border p-2 text-left transition-all hover-elevate ${
                          isSelected 
                            ? "bg-primary/10 border-primary/20 text-primary" 
                            : "bg-card/20 border-border/20 hover:bg-card/40"
                        }`}
                        data-testid={`preset-${preset.value}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium leading-tight">{preset.label}</span>
                          {isSelected && (
                            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {getPresetSummary(preset.value)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium">Custom Range</div>
                  <Badge variant="outline" className="h-5 text-[10px]">
                    {selectionPhase === "start" ? "Pick start" : "Pick end"}
                  </Badge>
                </div>
                <Calendar
                  mode="range"
                  defaultMonth={customRange.from}
                  selected={customRange}
                  onDayClick={(day, modifiers) => handleCustomDayClick(day, Boolean(modifiers?.disabled))}
                  numberOfMonths={1}
                  className="rounded-md border border-border/20 !p-1"
                  classNames={{
                    day_selected:
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_range_middle:
                      "aria-selected:bg-primary/15 aria-selected:text-foreground",
                    head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[10px]",
                    row: "flex w-full mt-1",
                    cell:
                      "h-8 w-8 text-center text-xs p-0 relative [&:has([aria-selected])]:bg-primary/10 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: "h-8 w-8 p-0 text-xs",
                  }}
                  data-testid="calendar-custom-range"
                />

                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-[10px] text-muted-foreground">
                    {customRange.from && customRange.to
                      ? `Selected: ${format(customRange.from, "MMM d, yyyy")} - ${format(customRange.to, "MMM d, yyyy")}`
                      : customRange.from
                        ? `Start: ${format(customRange.from, "MMM d, yyyy")} | pick end date`
                        : "Pick start date, then end date"}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCustomRange}
                      disabled={!customRange.from && !customRange.to}
                      className="h-7 px-2 text-xs"
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={applyCustomRange}
                      disabled={!customRange.from || !customRange.to}
                      className="h-7 px-2 text-xs"
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
