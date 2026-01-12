import { createContext, useContext, useReducer, useEffect, ReactNode } from "react";
import { type GlobalFilter, type DateRange, globalFilterSchema } from "@shared/schema";

// =============================================================================
// GLOBAL FILTER STATE MANAGEMENT
// =============================================================================

interface GlobalFilterState extends GlobalFilter {
  isLoading: boolean;
  lastUpdated: Date;
}

type GlobalFilterAction =
  | { type: "SET_SELECTED_VEHICLES"; payload: string[] }
  | { type: "SET_DATE_RANGE"; payload: DateRange }
  | { type: "SET_CURRENCY"; payload: "KES" | "UGX" | "USD" }
  | { type: "SET_FUEL_COST_PER_LITER"; payload: number }
  | { type: "SET_REFRESH_INTERVAL"; payload: number }
  | { type: "TOGGLE_LOADING"; payload: boolean }
  | { type: "UPDATE_TIMESTAMP" }
  | { type: "RESET_FILTERS" };

// Initialize with proper date boundaries
const getInitialDateRange = () => {
  const { startDate, endDate } = getDateRangeFromPreset("last_7_days");
  return {
    preset: "last_7_days" as const,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    label: "Last 7 Days"
  };
};

const initialState: GlobalFilterState = {
  selectedVehicles: [], // Empty array means "all vehicles"
  dateRange: getInitialDateRange(),
  currency: "KES",
  fuelCostPerLiter: 145.50,
  refreshInterval: 30000, // 30 seconds
  isLoading: false,
  lastUpdated: new Date()
};

function globalFilterReducer(state: GlobalFilterState, action: GlobalFilterAction): GlobalFilterState {
  switch (action.type) {
    case "SET_SELECTED_VEHICLES":
      return {
        ...state,
        selectedVehicles: action.payload,
        lastUpdated: new Date()
      };
    
    case "SET_DATE_RANGE":
      return {
        ...state,
        dateRange: action.payload,
        lastUpdated: new Date()
      };
    
    case "SET_CURRENCY":
      return {
        ...state,
        currency: action.payload,
        lastUpdated: new Date()
      };
    
    case "SET_FUEL_COST_PER_LITER":
      return {
        ...state,
        fuelCostPerLiter: action.payload,
        lastUpdated: new Date()
      };
    
    case "SET_REFRESH_INTERVAL":
      return {
        ...state,
        refreshInterval: action.payload,
        lastUpdated: new Date()
      };
    
    case "TOGGLE_LOADING":
      return {
        ...state,
        isLoading: action.payload
      };
    
    case "UPDATE_TIMESTAMP":
      return {
        ...state,
        lastUpdated: new Date()
      };
    
    case "RESET_FILTERS":
      return {
        ...state,
        selectedVehicles: [],
        dateRange: getInitialDateRange(),
        lastUpdated: new Date()
      };
    
    default:
      return state;
  }
}

// =============================================================================
// CONTEXT CREATION
// =============================================================================

interface GlobalFilterContextType {
  state: GlobalFilterState;
  actions: {
    setSelectedVehicles: (vehicles: string[]) => void;
    setDateRange: (dateRange: DateRange) => void;
    setCurrency: (currency: "KES" | "UGX" | "USD") => void;
    setFuelCostPerLiter: (cost: number) => void;
    setRefreshInterval: (interval: number) => void;
    toggleLoading: (loading: boolean) => void;
    updateTimestamp: () => void;
    resetFilters: () => void;
  };
  // Computed values for convenience
  computed: {
    isAllVehiclesSelected: boolean;
    hasActiveFilters: boolean;
    filterSummary: string;
    dateRangeLabel: string;
  };
}

const GlobalFilterContext = createContext<GlobalFilterContextType | undefined>(undefined);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

interface GlobalFilterProviderProps {
  children: ReactNode;
}

export function GlobalFilterProvider({ children }: GlobalFilterProviderProps) {
  const [state, dispatch] = useReducer(globalFilterReducer, initialState);

  // Load saved filters from localStorage on mount
  useEffect(() => {
    try {
      const savedFilters = localStorage.getItem("fleet-sentinel-filters");
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        const validated = globalFilterSchema.safeParse(parsed);
        
        if (validated.success) {
          dispatch({ type: "SET_SELECTED_VEHICLES", payload: validated.data.selectedVehicles });
          dispatch({ type: "SET_DATE_RANGE", payload: validated.data.dateRange });
          dispatch({ type: "SET_CURRENCY", payload: validated.data.currency });
          dispatch({ type: "SET_FUEL_COST_PER_LITER", payload: validated.data.fuelCostPerLiter });
          dispatch({ type: "SET_REFRESH_INTERVAL", payload: validated.data.refreshInterval });
        }
      }
    } catch (error) {
      console.warn("Failed to load saved filters:", error);
    }
  }, []);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    try {
      const filtersToSave = {
        selectedVehicles: state.selectedVehicles,
        dateRange: state.dateRange,
        currency: state.currency,
        fuelCostPerLiter: state.fuelCostPerLiter,
        refreshInterval: state.refreshInterval
      };
      localStorage.setItem("fleet-sentinel-filters", JSON.stringify(filtersToSave));
    } catch (error) {
      console.warn("Failed to save filters:", error);
    }
  }, [state.selectedVehicles, state.dateRange, state.currency, state.fuelCostPerLiter, state.refreshInterval]);

  // Action creators
  const actions = {
    setSelectedVehicles: (vehicles: string[]) => {
      dispatch({ type: "SET_SELECTED_VEHICLES", payload: vehicles });
    },
    
    setDateRange: (dateRange: DateRange) => {
      dispatch({ type: "SET_DATE_RANGE", payload: dateRange });
    },
    
    setCurrency: (currency: "KES" | "UGX" | "USD") => {
      dispatch({ type: "SET_CURRENCY", payload: currency });
    },
    
    setFuelCostPerLiter: (cost: number) => {
      dispatch({ type: "SET_FUEL_COST_PER_LITER", payload: cost });
    },
    
    setRefreshInterval: (interval: number) => {
      dispatch({ type: "SET_REFRESH_INTERVAL", payload: interval });
    },
    
    toggleLoading: (loading: boolean) => {
      dispatch({ type: "TOGGLE_LOADING", payload: loading });
    },
    
    updateTimestamp: () => {
      dispatch({ type: "UPDATE_TIMESTAMP" });
    },
    
    resetFilters: () => {
      dispatch({ type: "RESET_FILTERS" });
    }
  };

  // Computed values
  const computed = {
    isAllVehiclesSelected: state.selectedVehicles.length === 0,
    
    hasActiveFilters: 
      state.selectedVehicles.length > 0 || 
      (state.dateRange.preset !== "last_7_days" && Boolean(state.dateRange.startDate) && Boolean(state.dateRange.endDate)),
    
    filterSummary: (() => {
      const parts: string[] = [];
      
      if (state.selectedVehicles.length > 0) {
        if (state.selectedVehicles.length === 1) {
          parts.push("1 vehicle");
        } else {
          parts.push(`${state.selectedVehicles.length} vehicles`);
        }
      } else {
        parts.push("All vehicles");
      }
      
      parts.push(state.dateRange.label || "Custom range");
      
      return parts.join(" • ");
    })(),
    
    dateRangeLabel: state.dateRange.label || "Custom range"
  };

  const contextValue: GlobalFilterContextType = {
    state,
    actions,
    computed
  };

  return (
    <GlobalFilterContext.Provider value={contextValue}>
      {children}
    </GlobalFilterContext.Provider>
  );
}

// =============================================================================
// CUSTOM HOOK
// =============================================================================

export function useGlobalFilter() {
  const context = useContext(GlobalFilterContext);
  
  if (context === undefined) {
    throw new Error("useGlobalFilter must be used within a GlobalFilterProvider");
  }
  
  return context;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function getDateRangeFromPreset(preset: string, customRange?: { startDate: string; endDate: string }): { startDate: Date; endDate: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (preset) {
    case "today":
      return {
        startDate: today,
        endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      };
    
    case "yesterday":
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return {
        startDate: yesterday,
        endDate: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
      };
    
    case "week_to_date":
      const weekStart = new Date(today.getTime() - (today.getDay() * 24 * 60 * 60 * 1000));
      return {
        startDate: weekStart,
        endDate: now
      };
    
    case "month_to_date":
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: monthStart,
        endDate: now
      };
    
    case "last_7_days":
      return {
        startDate: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000),
        endDate: now
      };
    
    case "last_30_days":
      return {
        startDate: new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000),
        endDate: now
      };
    
    case "custom":
      if (customRange?.startDate && customRange?.endDate) {
        return {
          startDate: new Date(customRange.startDate),
          endDate: new Date(customRange.endDate)
        };
      }
      // Fallback to last 7 days if custom range is invalid
      return {
        startDate: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000),
        endDate: now
      };
    
    default:
      // Default to last 7 days
      return {
        startDate: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000),
        endDate: now
      };
  }
}