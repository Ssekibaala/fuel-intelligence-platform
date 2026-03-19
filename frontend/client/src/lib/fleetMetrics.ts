type NumericTotals = {
  fuel: number;
  distance: number;
  engineHours: number;
};

const toFiniteNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toLocalDayKey = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function rangeIncludesToday(endDate?: string | null, isTodaySelected = false): boolean {
  if (isTodaySelected) return true;
  const endDay = toLocalDayKey(endDate);
  if (!endDay) return false;
  return endDay === getTodayLocalDayKey();
}

export function sumVehicleTodayTotals(vehicles: any[]): NumericTotals {
  return vehicles.reduce(
    (acc, vehicle) => ({
      fuel: acc.fuel + toFiniteNumber(vehicle?.totalFuelUsed),
      distance: acc.distance + toFiniteNumber(vehicle?.totalDistance),
      engineHours: acc.engineHours + toFiniteNumber(vehicle?.totalEngineHours),
    }),
    { fuel: 0, distance: 0, engineHours: 0 }
  );
}

export function sumDailyMetricTotals(
  metrics: any[],
  options?: { excludeUtcDay?: string | null }
): NumericTotals {
  const excludeUtcDay = options?.excludeUtcDay ?? null;
  return metrics.reduce(
    (acc, metric) => {
      const metricDay = toLocalDayKey(metric?.metricDate);
      if (excludeUtcDay && metricDay === excludeUtcDay) return acc;
      return {
        fuel: acc.fuel + toFiniteNumber(metric?.totalFuelConsumed),
        distance: acc.distance + toFiniteNumber(metric?.totalDistanceTraveled),
        engineHours: acc.engineHours + toFiniteNumber(metric?.totalEngineHours),
      };
    },
    { fuel: 0, distance: 0, engineHours: 0 }
  );
}

export function combineMetricTotals(args: {
  isTodaySelected: boolean;
  includeToday: boolean;
  historical: NumericTotals;
  today: NumericTotals;
}): NumericTotals {
  if (args.isTodaySelected) return args.today;
  if (!args.includeToday) return args.historical;
  return {
    fuel: args.historical.fuel + args.today.fuel,
    distance: args.historical.distance + args.today.distance,
    engineHours: args.historical.engineHours + args.today.engineHours,
  };
}

export function deriveConsumption(distance: number | null | undefined, fuelUsed: number | null | undefined): number | null {
  const distanceValue = toFiniteNumber(distance);
  const fuelValue = toFiniteNumber(fuelUsed);
  if (fuelValue <= 0) return null;
  return distanceValue / fuelValue;
}

export function deriveHoursPerLiter(engineHours: number | null | undefined, fuelUsed: number | null | undefined): number | null {
  const hoursValue = toFiniteNumber(engineHours);
  const fuelValue = toFiniteNumber(fuelUsed);
  if (fuelValue <= 0) return null;
  return hoursValue / fuelValue;
}

export function getTodayLocalDayKey(): string {
  return toLocalDayKey(new Date()) || "";
}
