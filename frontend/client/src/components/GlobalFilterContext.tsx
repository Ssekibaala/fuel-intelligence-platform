import { createContext, useContext, useReducer, useEffect, ReactNode } from "react";
import { type GlobalFilter, type DateRange, type ConsumptionUnit, globalFilterSchema } from "@shared/schema";

// =============================================================================
// GLOBAL FILTER STATE MANAGEMENT
// =============================================================================

interface GlobalFilterState extends GlobalFilter {
  isLoading: boolean;
  lastUpdated: Date;
}

type GlobalFilterAction =
  | { type: "SET_SELECTED_CLIENT"; payload: string }
  | { type: "SET_SELECTED_VEHICLES"; payload: string[] }
  | { type: "SET_DATE_RANGE"; payload: DateRange }
  | { type: "SET_CURRENCY"; payload: "KES" | "UGX" | "USD" }
  | { type: "SET_FUEL_COST_PER_LITER"; payload: number }
  | { type: "SET_CONSUMPTION_UNIT"; payload: ConsumptionUnit }
  | {
    type: "SET_CONSUMPTION_THRESHOLDS";
    payload: { excellent: number; acceptable: number; alert: number };
  }
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
  selectedClientId: "all", // "all" or a specific client id
  selectedVehicles: [], // Empty array means "all vehicles"
  dateRange: getInitialDateRange(),
  currency: "UGX",
  fuelCostPerLiter: 145.50,
  consumptionUnit: "KM/L",
  consumptionExcellentThreshold: 3.0,
  consumptionAcceptableThreshold: 1.5,
  consumptionAlertThreshold: 1.0,
  refreshInterval: 10000, // 10 seconds
  isLoading: false,
  lastUpdated: new Date()
};

function globalFilterReducer(state: GlobalFilterState, action: GlobalFilterAction): GlobalFilterState {
  switch (action.type) {
    case "SET_SELECTED_CLIENT":
      return {
        ...state,
        selectedClientId: action.payload,
        selectedVehicles: [], // prevent cross-client stale vehicle selections
        lastUpdated: new Date()
      };

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

    case "SET_CONSUMPTION_UNIT":
      return {
        ...state,
        consumptionUnit: action.payload,
        lastUpdated: new Date()
      };

    case "SET_CONSUMPTION_THRESHOLDS":
      return {
        ...state,
        consumptionExcellentThreshold: action.payload.excellent,
        consumptionAcceptableThreshold: action.payload.acceptable,
        consumptionAlertThreshold: action.payload.alert,
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
        selectedClientId: "all",
        selectedVehicles: [],
        dateRange: getInitialDateRange(),
        consumptionUnit: "KM/L",
        consumptionExcellentThreshold: 3.0,
        consumptionAcceptableThreshold: 1.5,
        consumptionAlertThreshold: 1.0,
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
    setSelectedClientId: (clientId: string) => void;
    setSelectedVehicles: (vehicles: string[]) => void;
    setDateRange: (dateRange: DateRange) => void;
    setCurrency: (currency: "KES" | "UGX" | "USD") => void;
    setFuelCostPerLiter: (cost: number) => void;
    setConsumptionUnit: (unit: ConsumptionUnit) => void;
    setConsumptionThresholds: (thresholds: { excellent: number; acceptable: number; alert: number }) => void;
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
          dispatch({ type: "SET_SELECTED_CLIENT", payload: validated.data.selectedClientId });
          dispatch({ type: "SET_SELECTED_VEHICLES", payload: validated.data.selectedVehicles });
          dispatch({ type: "SET_DATE_RANGE", payload: validated.data.dateRange });
          dispatch({ type: "SET_CURRENCY", payload: validated.data.currency });
          dispatch({ type: "SET_FUEL_COST_PER_LITER", payload: validated.data.fuelCostPerLiter });
          dispatch({ type: "SET_CONSUMPTION_UNIT", payload: validated.data.consumptionUnit });
          dispatch({
            type: "SET_CONSUMPTION_THRESHOLDS",
            payload: {
              excellent: validated.data.consumptionExcellentThreshold,
              acceptable: validated.data.consumptionAcceptableThreshold,
              alert: validated.data.consumptionAlertThreshold
            }
          });
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
        selectedClientId: state.selectedClientId,
        selectedVehicles: state.selectedVehicles,
        dateRange: state.dateRange,
        currency: state.currency,
        fuelCostPerLiter: state.fuelCostPerLiter,
        consumptionUnit: state.consumptionUnit,
        consumptionExcellentThreshold: state.consumptionExcellentThreshold,
        consumptionAcceptableThreshold: state.consumptionAcceptableThreshold,
        consumptionAlertThreshold: state.consumptionAlertThreshold,
        refreshInterval: state.refreshInterval
      };
      localStorage.setItem("fleet-sentinel-filters", JSON.stringify(filtersToSave));
    } catch (error) {
      console.warn("Failed to save filters:", error);
    }
  }, [
    state.selectedClientId,
    state.selectedVehicles,
    state.dateRange,
    state.currency,
    state.fuelCostPerLiter,
    state.consumptionUnit,
    state.consumptionExcellentThreshold,
    state.consumptionAcceptableThreshold,
    state.consumptionAlertThreshold,
    state.refreshInterval
  ]);

  // Action creators
  const actions = {
    setSelectedClientId: (clientId: string) => {
      dispatch({ type: "SET_SELECTED_CLIENT", payload: clientId });
    },

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

    setConsumptionUnit: (unit: ConsumptionUnit) => {
      dispatch({ type: "SET_CONSUMPTION_UNIT", payload: unit });
    },

    setConsumptionThresholds: (thresholds: { excellent: number; acceptable: number; alert: number }) => {
      dispatch({ type: "SET_CONSUMPTION_THRESHOLDS", payload: thresholds });
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
      state.selectedClientId !== "all" ||
      state.selectedVehicles.length > 0 ||
      (state.dateRange.preset !== "last_7_days" && Boolean(state.dateRange.startDate) && Boolean(state.dateRange.endDate)),

    filterSummary: (() => {
      const parts: string[] = [];

      if (state.selectedClientId !== "all") {
        parts.push("1 client");
      } else {
        parts.push("All clients");
      }

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
  const MS_DAY = 24 * 60 * 60 * 1000;
  const startOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
  const endOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
  const todayLocalMidnight = startOfLocalDay(now);

  switch (preset) {
    case "today":
      return {
        startDate: todayLocalMidnight,
        endDate: endOfLocalDay(now)
      };

    case "yesterday": {
      const yesterday = new Date(todayLocalMidnight.getTime() - MS_DAY);
      return {
        startDate: yesterday,
        endDate: endOfLocalDay(yesterday)
      };
    }

    case "week_to_date": {
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const weekStart = new Date(todayLocalMidnight.getTime() - dayOfWeek * MS_DAY);
      return {
        startDate: weekStart,
        endDate: now
      };
    }

    case "month_to_date": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return {
        startDate: monthStart,
        endDate: now
      };
    }

    case "last_7_days":
      return {
        startDate: new Date(todayLocalMidnight.getTime() - 6 * MS_DAY),
        endDate: now
      };

    case "last_30_days":
      return {
        startDate: new Date(todayLocalMidnight.getTime() - 29 * MS_DAY),
        endDate: now
      };

    case "custom":
      if (customRange?.startDate && customRange?.endDate) {
        const customStart = new Date(customRange.startDate);
        const customEnd = new Date(customRange.endDate);
        return {
          startDate: startOfLocalDay(customStart),
          endDate: endOfLocalDay(customEnd)
        };
      }
      // Fallback to last 7 days if custom range is invalid
      return {
        startDate: new Date(todayLocalMidnight.getTime() - 6 * MS_DAY),
        endDate: now
      };

    default:
      return {
        startDate: new Date(todayLocalMidnight.getTime() - 6 * MS_DAY),
        endDate: now
      };
  }
}
