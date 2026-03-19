import { GlobalFilter } from "@shared/schema";

function toLocalDayKey(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildApiUrl(
  baseUrl: string,
  filters?: {
    vehicleIds?: string[],
    startDate?: string,
    endDate?: string,
    [key: string]: any
  }
): string {
  if (!filters) return baseUrl;

  const params = new URLSearchParams();

  // Handle vehicle IDs
  if (filters.vehicleIds && filters.vehicleIds.length > 0) {
    params.append('vehicle_ids', filters.vehicleIds.join(','));
  }

  // Handle date range
  if (filters.startDate) {
    params.append('start_date', filters.startDate);
  }
  if (filters.endDate) {
    params.append('end_date', filters.endDate);
  }

  // Handle other filters
  Object.entries(filters).forEach(([key, value]) => {
    if (key !== 'vehicleIds' && key !== 'startDate' && key !== 'endDate') {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
  });

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

// Helper to convert global filter to API parameters
export function globalFilterToApiParams(filterState: GlobalFilter) {
  return {
    clientId: filterState.selectedClientId !== "all" ? filterState.selectedClientId : undefined,
    vehicleIds: filterState.selectedVehicles.length > 0 ? filterState.selectedVehicles : undefined,
    startDate: filterState.dateRange.startDate,
    endDate: filterState.dateRange.endDate,
    startDay: toLocalDayKey(filterState.dateRange.startDate),
    endDay: toLocalDayKey(filterState.dateRange.endDate),
  };
}
