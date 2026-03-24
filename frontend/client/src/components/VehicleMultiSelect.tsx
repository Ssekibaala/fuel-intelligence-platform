import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, X, Truck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { type Vehicle } from "@shared/schema";
import { api } from "../lib/api";

interface VehicleMultiSelectProps {
  selectedVehicleIds: string[];
  onSelectionChange: (vehicleIds: string[]) => void;
  className?: string;
  selectionMode?: "single" | "multiple";
  clientId?: string;
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

export function VehicleMultiSelect({ 
  selectedVehicleIds, 
  onSelectionChange,
  className = "",
  selectionMode = "multiple",
  clientId
}: VehicleMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const isSingleSelection = selectionMode === "single";

  // Fetch vehicles from API
  const { data: vehicles = [], isLoading, error } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles", clientId],
    staleTime: 5 * 60 * 1000, // 5 minutes
    queryFn: () =>
      api.getVehicles({
        clientId,
      }),
  });

  // Filter vehicles based on search query
  const filteredVehicles = vehicles.filter(vehicle => 
    getVehicleDisplayLabel(vehicle).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (vehicle.assetId || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (vehicle.vehiclePlate || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (vehicle.driverName || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get selected vehicles for display
  const selectedVehicles = vehicles.filter(vehicle => 
    selectedVehicleIds.includes(vehicle.id)
  );

  const handleSelectVehicle = (vehicleId: string) => {
    const isSelected = selectedVehicleIds.includes(vehicleId);
    
    if (isSelected) {
      // Remove from selection
      onSelectionChange(selectedVehicleIds.filter(id => id !== vehicleId));
      if (isSingleSelection) {
        setOpen(false);
      }
    } else {
      if (isSingleSelection) {
        onSelectionChange([vehicleId]);
        setOpen(false);
      } else {
        // Add to selection
        onSelectionChange([...selectedVehicleIds, vehicleId]);
      }
    }
  };

  const handleSelectAll = () => {
    if (isSingleSelection) return;
    if (selectedVehicleIds.length === vehicles.length) {
      // Deselect all
      onSelectionChange([]);
    } else {
      // Select all
      onSelectionChange(vehicles.map(v => v.id));
    }
  };

  const handleClearSelection = () => {
    onSelectionChange([]);
    setOpen(false);
  };

  const getDisplayText = () => {
    if (selectedVehicleIds.length === 0) {
      if (isSingleSelection) return "Select vehicle";
      return "All vehicles";
    } else if (selectedVehicleIds.length === 1) {
      const vehicle = selectedVehicles[0];
      return vehicle ? getVehicleDisplayLabel(vehicle) : "1 vehicle";
    } else {
      return `${selectedVehicleIds.length} vehicles`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-primary/20 text-primary border-primary/30";
      case "Idle": return "bg-accent/20 text-accent-foreground border-accent/30";
      case "Maintenance": return "bg-accent/20 text-accent-foreground border-accent/30";
      case "Out of Service": return "bg-destructive/20 text-destructive border-destructive/30";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  if (error) {
    return (
      <div className={`flex items-center gap-2 p-3 border border-destructive/20 rounded-lg bg-destructive/5 ${className}`}>
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">Failed to load vehicles</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-full justify-between hover-elevate bg-card/40 backdrop-blur-sm border-border/30 ${className}`}
          data-testid="button-vehicle-multiselect"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate text-sm">{getDisplayText()}</span>
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput 
            placeholder="Search vehicles..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-9"
          />
          
          <div className="flex items-center justify-between p-2 border-b border-border/20">
            <div className="text-xs text-muted-foreground">
              {selectedVehicleIds.length} of {vehicles.length} selected
            </div>
            <div className="flex gap-1">
              {!isSingleSelection && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-7 text-xs"
                  data-testid="button-select-all-vehicles"
                >
                  {selectedVehicleIds.length === vehicles.length ? "Deselect All" : "Select All"}
                </Button>
              )}
              {selectedVehicleIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  data-testid="button-clear-vehicle-selection"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <CommandList>
            {isLoading ? (
              <div className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Loading vehicles...
                </div>
              </div>
            ) : (
              <>
                <CommandEmpty>No vehicles found.</CommandEmpty>
                <CommandGroup>
                  {filteredVehicles.map((vehicle) => {
                    const isSelected = selectedVehicleIds.includes(vehicle.id);
                    return (
                      <CommandItem
                        key={vehicle.id}
                        value={vehicle.id}
                        onSelect={() => handleSelectVehicle(vehicle.id)}
                        className="cursor-pointer hover-elevate"
                        data-testid={`option-vehicle-${getVehicleDisplayLabel(vehicle)}`}
                      >
                        <div className="flex items-center justify-between w-full gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-4 h-4 border-2 border-primary rounded-sm flex items-center justify-center">
                              {isSelected && <Check className="h-3 w-3 text-primary" />}
                            </div>
                            
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{getVehicleDisplayLabel(vehicle)}</span>
                                <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getStatusColor(vehicle.status)}`}>
                                  {vehicle.status}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {(vehicle.assetId || "-")} • {(vehicle.driverName || "Unassigned")}
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                            <div>{vehicle.efficiencyRating}</div>
                            <div>{Math.round(vehicle.currentFuelLevel)}L</div>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>

        {/* Selected vehicles summary */}
        {selectedVehicles.length > 0 && selectedVehicles.length <= 3 && (
          <>
            <Separator />
            <div className="p-3 max-h-32 overflow-y-auto">
              <div className="text-xs font-medium text-muted-foreground mb-2">Selected:</div>
              <div className="flex flex-wrap gap-1">
                {selectedVehicles.map((vehicle) => (
                  <Badge
                    key={vehicle.id}
                    variant="secondary"
                    className="text-xs py-1 pl-2 pr-1 flex items-center gap-1"
                  >
                    {getVehicleDisplayLabel(vehicle)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectVehicle(vehicle.id);
                      }}
                      className="ml-1 hover:bg-destructive/20 rounded-sm p-0.5"
                      data-testid={`button-remove-vehicle-${getVehicleDisplayLabel(vehicle)}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}


