import "dotenv/config";

import { storage } from "../server/storage";
import {
  combineMetricTotals,
  deriveConsumption,
  deriveHoursPerLiter,
  getTodayUtcDayKey,
  rangeIncludesToday,
  sumDailyMetricTotals,
  sumVehicleTodayTotals,
} from "../client/src/lib/fleetMetrics";

type RangeDef = {
  label: string;
  startDate: Date;
  endDate: Date;
  isTodaySelected: boolean;
};

function utcMidnight(offsetDays = 0) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays, 0, 0, 0, 0));
}

function utcEndOfDay(offsetDays = 0) {
  return new Date(utcMidnight(offsetDays).getTime() + 24 * 60 * 60 * 1000 - 1);
}

async function main() {
  const now = new Date();
  const ranges: RangeDef[] = [
    {
      label: "today",
      startDate: utcMidnight(0),
      endDate: now,
      isTodaySelected: true,
    },
    {
      label: "yesterday",
      startDate: utcMidnight(-1),
      endDate: utcEndOfDay(-1),
      isTodaySelected: false,
    },
    {
      label: "last_7_days_including_today",
      startDate: utcMidnight(-6),
      endDate: now,
      isTodaySelected: false,
    },
  ];

  const vehicles = await storage.getVehicles();
  const todayVehicleTotals = sumVehicleTodayTotals(vehicles);

  const output: any[] = [];

  for (const range of ranges) {
    const dailyMetrics = await storage.getDailyMetrics({
      startDate: range.startDate,
      endDate: range.endDate,
    });

    const includesToday = rangeIncludesToday(range.endDate.toISOString(), range.isTodaySelected);
    const historicalTotals = sumDailyMetricTotals(dailyMetrics, {
      excludeUtcDay: includesToday && !range.isTodaySelected ? getTodayUtcDayKey() : null,
    });
    const totals = combineMetricTotals({
      isTodaySelected: range.isTodaySelected,
      includeToday: includesToday,
      historical: historicalTotals,
      today: todayVehicleTotals,
    });

    output.push({
      range: range.label,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      vehicleCount: vehicles.length,
      dailyMetricRowCount: dailyMetrics.length,
      totals,
      consumptionKmPerL: deriveConsumption(totals.distance, totals.fuel),
      consumptionHrsPerL: deriveHoursPerLiter(totals.engineHours, totals.fuel),
    });
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
