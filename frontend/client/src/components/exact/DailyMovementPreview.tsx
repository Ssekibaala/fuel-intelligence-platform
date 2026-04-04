import React from "react";
import { DB_TIMEZONE_LABELS } from "@/lib/dateTime";

interface MovementTrip {
  asset_description: string;
  registration_number: string;
  asset_id: number;
  site_name: string;
  departure_date: string;
  departure_date_time?: string;
  driver: string;
  departure_time: string;
  departed_from: string;
  driving_time: string;
  standing_time: string;
  distance_km: number;
  max_speed_kmh: number;
  arrival_date_time?: string;
  arrival_time: string;
  arrived_at: string;
  next_departure: string;
  standing_time_at_location: string;
  fuel_used_litres: number | null;
}

interface AssetGroup {
  asset: {
    asset_description: string;
    registration_number: string;
    asset_id: number;
    site_name: string;
  };
  trips: MovementTrip[];
  totals: {
    drivingTime: string;
    distance: number;
    standingTime: string;
    standingTimeAtLocation: string;
  };
  averages: {
    drivingTime: string;
    distance: number;
    standingTime: string;
    standingTimeAtLocation: string;
  };
}

interface DailyMovementPreviewProps {
  date: string;
  data: AssetGroup[];
  companyName?: string;
}

const formatReportRangeLabel = (value: string): string => {
  if (!value) return "";
  const [startRaw, endRaw] = value.split(" to ").map((part) => part.trim());
  const formatDate = (dateText: string) => {
    const match = dateText.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return dateText;
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  };

  const start = formatDate(startRaw);
  const end = formatDate(endRaw || startRaw);
  return `From ${start} 00:00 To ${end} 23:59`;
};

const normalizeDurationText = (value: string): string => {
  if (!value) return "00:00:00";
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value;

  const dashMatch = value.match(/^(\d{3})(\d{2})-(\d{2})/);
  if (dashMatch) {
    const minutes = parseInt(dashMatch[1], 10);
    const seconds = parseInt(dashMatch[2], 10);
    const additionalSeconds = parseInt(dashMatch[3], 10);
    const totalSeconds = minutes * 60 + seconds + additionalSeconds;
    return formatSecondsAsClock(totalSeconds);
  }

  const compactMatch = value.match(/^(\d{3})(\d{2})/);
  if (compactMatch) {
    const baseSeconds = parseInt(compactMatch[1], 10);
    const additionalSeconds = parseInt(compactMatch[2], 10);
    return formatSecondsAsClock(baseSeconds + additionalSeconds);
  }

  return value;
};

const parseDurationToSeconds = (value: string): number => {
  const normalized = normalizeDurationText(value);
  const [hours, minutes, seconds] = normalized.split(":").map(Number);
  if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) {
    return 0;
  }
  return hours * 3600 + minutes * 60 + seconds;
};

const formatSecondsAsClock = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatDurationCompact = (value: string): string => {
  const totalSeconds = parseDurationToSeconds(value);
  if (totalSeconds <= 0) return "--";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatDistance = (value: number): string =>
  Number.isFinite(value) ? `${value.toFixed(1)} km` : "--";

const formatSpeed = (value: number): string =>
  Number.isFinite(value) && value > 0 ? `${value.toFixed(0)} km/h` : "--";

const formatLitres = (value: number | null | undefined): string =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "--"
    : `${Number(value).toFixed(1)} L`;

const formatKmPerL = (distance: number, fuel: number | null | undefined): string => {
  if (fuel === null || fuel === undefined || fuel <= 0 || distance <= 0) return "--";
  return `${(distance / fuel).toFixed(2)} km/L`;
};

const uniqueDrivers = (trips: MovementTrip[]) =>
  Array.from(new Set(trips.map((trip) => trip.driver?.trim()).filter(Boolean))) as string[];

const sumFuel = (trips: MovementTrip[]) =>
  trips.reduce((sum, trip) => sum + (trip.fuel_used_litres ?? 0), 0);

const countFuelTrips = (trips: MovementTrip[]) =>
  trips.filter((trip) => trip.fuel_used_litres !== null && trip.fuel_used_litres !== undefined).length;

const standingTone = (value: string) => {
  const totalSeconds = parseDurationToSeconds(value);
  if (totalSeconds > 600) {
    return {
      background: "#fee2e2",
      foreground: "#991b1b",
      border: "#fecaca",
    };
  }
  if (totalSeconds >= 300) {
    return {
      background: "#fef3c7",
      foreground: "#92400e",
      border: "#fde68a",
    };
  }
  return {
    background: "#dcfce7",
    foreground: "#166534",
    border: "#bbf7d0",
  };
};

const metricCardStyle = (accent: "teal" | "slate" = "slate"): React.CSSProperties => ({
  border: accent === "teal" ? "1px solid #99f6e4" : "1px solid #e2e8f0",
  background:
    accent === "teal"
      ? "linear-gradient(180deg, rgba(240, 253, 250, 1) 0%, rgba(255, 255, 255, 1) 100%)"
      : "linear-gradient(180deg, rgba(248, 250, 252, 1) 0%, rgba(255, 255, 255, 1) 100%)",
});

export function DailyMovementPreview({
  date,
  data,
  companyName,
}: DailyMovementPreviewProps) {
  const displayCompanyName = companyName || "Teletrac Fuel";
  const formattedDateRange = formatReportRangeLabel(date);
  const allTrips = data.flatMap((group) => group.trips);
  const totalDistance = data.reduce((sum, group) => sum + group.totals.distance, 0);
  const totalDriveSeconds = data.reduce(
    (sum, group) => sum + parseDurationToSeconds(group.totals.drivingTime),
    0,
  );
  const totalStandingSeconds = data.reduce(
    (sum, group) => sum + parseDurationToSeconds(group.totals.standingTimeAtLocation),
    0,
  );
  const totalFuelUsed = sumFuel(allTrips);
  const fuelCoverageTrips = countFuelTrips(allTrips);
  const peakSpeed = allTrips.reduce(
    (max, trip) => Math.max(max, Number.isFinite(trip.max_speed_kmh) ? trip.max_speed_kmh : 0),
    0,
  );
  const mostMobileAsset = [...data].sort((a, b) => b.totals.distance - a.totals.distance)[0];
  const longestStandTrip = [...allTrips].sort(
    (a, b) =>
      parseDurationToSeconds(b.standing_time_at_location) -
      parseDurationToSeconds(a.standing_time_at_location),
  )[0];

  return (
    <div
      style={{ width: 1160 }}
      className="bg-white text-slate-950"
    >
      <div className="border border-slate-200 rounded-[26px] overflow-hidden shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div
          className="px-8 py-7"
          style={{
            background:
              "linear-gradient(135deg, rgba(236,253,245,1) 0%, rgba(255,255,255,1) 42%, rgba(248,250,252,1) 100%)",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
                Operational Report
              </div>
              <h1 className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em] text-slate-950">
                Daily Movement Report
              </h1>
              <div className="mt-2 text-[13px] text-slate-600">{displayCompanyName}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-600">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  {formattedDateRange}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  DB {DB_TIMEZONE_LABELS.webhookLocal}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  Only live columns with populated data are shown
                </span>
              </div>
            </div>

            <div className="grid min-w-[420px] grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  Active Assets
                </div>
                <div className="mt-1 text-[24px] font-semibold leading-none text-slate-950">
                  {data.length}
                </div>
                <div className="mt-2 text-[12px] text-slate-500">
                  {allTrips.length} movement legs tracked in scope
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  Fuel Coverage
                </div>
                <div className="mt-1 text-[24px] font-semibold leading-none text-slate-950">
                  {fuelCoverageTrips}/{allTrips.length}
                </div>
                <div className="mt-2 text-[12px] text-slate-500">
                  Trips with captured fuel usage values
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-5 gap-3">
            <div className="rounded-2xl px-4 py-3" style={metricCardStyle("teal")}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-teal-700">Distance</div>
              <div className="mt-2 text-[22px] font-semibold leading-none text-slate-950">
                {formatDistance(totalDistance)}
              </div>
              <div className="mt-2 text-[12px] text-slate-500">
                Most distance: {mostMobileAsset?.asset.registration_number || "--"}
              </div>
            </div>

            <div className="rounded-2xl px-4 py-3" style={metricCardStyle()}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Drive Time</div>
              <div className="mt-2 text-[22px] font-semibold leading-none text-slate-950">
                {formatDurationCompact(formatSecondsAsClock(totalDriveSeconds))}
              </div>
              <div className="mt-2 text-[12px] text-slate-500">
                Total time in motion across the report
              </div>
            </div>

            <div className="rounded-2xl px-4 py-3" style={metricCardStyle()}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Stand to Next Departure</div>
              <div className="mt-2 text-[22px] font-semibold leading-none text-slate-950">
                {formatDurationCompact(formatSecondsAsClock(totalStandingSeconds))}
              </div>
              <div className="mt-2 text-[12px] text-slate-500">
                Time between arrival and the next departure
              </div>
            </div>

            <div className="rounded-2xl px-4 py-3" style={metricCardStyle()}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Fuel Used</div>
              <div className="mt-2 text-[22px] font-semibold leading-none text-slate-950">
                {fuelCoverageTrips > 0 ? formatLitres(totalFuelUsed) : "--"}
              </div>
              <div className="mt-2 text-[12px] text-slate-500">
                Captured from the movement rows only
              </div>
            </div>

            <div className="rounded-2xl px-4 py-3" style={metricCardStyle()}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Efficiency</div>
              <div className="mt-2 text-[22px] font-semibold leading-none text-slate-950">
                {formatKmPerL(totalDistance, totalFuelUsed)}
              </div>
              <div className="mt-2 text-[12px] text-slate-500">
                Peak {formatSpeed(peakSpeed)} • Longest stand{" "}
                {longestStandTrip ? formatDurationCompact(longestStandTrip.standing_time_at_location) : "--"}
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="space-y-5">
            {data.map((group, groupIdx) => {
              const drivers = uniqueDrivers(group.trips);
              const groupFuelTrips = countFuelTrips(group.trips);
              const groupFuelUsed = sumFuel(group.trips);
              const groupPeakSpeed = group.trips.reduce(
                (max, trip) =>
                  Math.max(max, Number.isFinite(trip.max_speed_kmh) ? trip.max_speed_kmh : 0),
                0,
              );
              const showFuelColumn = groupFuelTrips > 0;
              const assetLabel =
                group.asset.asset_description &&
                group.asset.asset_description !== group.asset.registration_number
                  ? group.asset.asset_description
                  : group.asset.registration_number;

              return (
                <section
                  key={`${group.asset.registration_number}-${groupIdx}`}
                  className="overflow-hidden rounded-[24px] border border-slate-200 bg-white"
                >
                  <div className="grid grid-cols-[2.2fr_repeat(4,minmax(0,1fr))] gap-3 border-b border-slate-200 bg-slate-50/70 p-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.14em] text-teal-700">
                            Asset Story
                          </div>
                          <div className="mt-1 text-[18px] font-semibold leading-tight text-slate-950">
                            {group.asset.registration_number}
                          </div>
                          <div className="mt-1 text-[13px] text-slate-600">{assetLabel}</div>
                        </div>
                        <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-700">
                          {group.trips.length} trips
                        </span>
                      </div>

                      <div
                        className="mt-3 text-[12px] leading-5 text-slate-600"
                        style={{ overflowWrap: "anywhere" }}
                      >
                        {group.asset.site_name || "No site captured"}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
                        {drivers.length > 0 ? (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-600">
                            {drivers.length === 1 ? drivers[0] : `${drivers.length} drivers`}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-600">
                          Fuel on {groupFuelTrips}/{group.trips.length} trips
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl px-4 py-3" style={metricCardStyle()}>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                        Distance
                      </div>
                      <div className="mt-2 text-[19px] font-semibold leading-none text-slate-950">
                        {formatDistance(group.totals.distance)}
                      </div>
                      <div className="mt-2 text-[12px] text-slate-500">
                        Avg leg {formatDistance(group.averages.distance)}
                      </div>
                    </div>

                    <div className="rounded-2xl px-4 py-3" style={metricCardStyle()}>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                        Drive Time
                      </div>
                      <div className="mt-2 text-[19px] font-semibold leading-none text-slate-950">
                        {formatDurationCompact(group.totals.drivingTime)}
                      </div>
                      <div className="mt-2 text-[12px] text-slate-500">
                        Avg {formatDurationCompact(group.averages.drivingTime)}
                      </div>
                    </div>

                    <div className="rounded-2xl px-4 py-3" style={metricCardStyle()}>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                        Stand to Next Departure
                      </div>
                      <div className="mt-2 text-[19px] font-semibold leading-none text-slate-950">
                        {formatDurationCompact(group.totals.standingTimeAtLocation)}
                      </div>
                      <div className="mt-2 text-[12px] text-slate-500">
                        Avg {formatDurationCompact(group.averages.standingTimeAtLocation)}
                      </div>
                    </div>

                    <div className="rounded-2xl px-4 py-3" style={metricCardStyle()}>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                        {showFuelColumn ? "Fuel & Speed" : "Speed"}
                      </div>
                      <div className="mt-2 text-[19px] font-semibold leading-none text-slate-950">
                        {showFuelColumn ? formatLitres(groupFuelUsed) : formatSpeed(groupPeakSpeed)}
                      </div>
                      <div className="mt-2 text-[12px] text-slate-500">
                        {showFuelColumn
                          ? `${formatKmPerL(group.totals.distance, groupFuelUsed)} overall • peak ${formatSpeed(groupPeakSpeed)}`
                          : `Peak ${formatSpeed(groupPeakSpeed)}`}
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-4">
                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                      <table className="w-full table-fixed border-collapse">
                        <thead>
                          <tr className="bg-slate-100/80 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                            <th className="px-3 py-3 text-left font-semibold">Journey Window</th>
                            <th className="w-[24%] px-3 py-3 text-left font-semibold">From</th>
                            <th className="w-[24%] px-3 py-3 text-left font-semibold">To</th>
                            <th className="w-[8%] px-3 py-3 text-right font-semibold">Drive</th>
                            <th className="w-[8%] px-3 py-3 text-right font-semibold">Stand</th>
                            <th className="w-[8%] px-3 py-3 text-right font-semibold">Dist</th>
                            <th className="w-[8%] px-3 py-3 text-right font-semibold">Max</th>
                            {showFuelColumn ? (
                              <>
                                <th className="w-[8%] px-3 py-3 text-right font-semibold">Fuel</th>
                                <th className="w-[8%] px-3 py-3 text-right font-semibold">Cons.</th>
                              </>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {group.trips.map((trip, tripIdx) => {
                            const tone = standingTone(trip.standing_time_at_location);
                            const departureStamp =
                              trip.departure_date_time ||
                              [trip.departure_date, trip.departure_time].filter(Boolean).join(" ");
                            const arrivalStamp = trip.arrival_date_time || trip.arrival_time || "--";

                            return (
                              <tr
                                key={`${group.asset.registration_number}-${tripIdx}`}
                                className="border-t border-slate-200 align-top text-[12px] text-slate-700"
                              >
                                <td className="px-3 py-3">
                                  <div className="font-semibold text-slate-900">{departureStamp}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">to {arrivalStamp}</div>
                                  {trip.driver ? (
                                    <div className="mt-2 text-[11px] uppercase tracking-[0.1em] text-slate-500">
                                      {trip.driver}
                                    </div>
                                  ) : null}
                                </td>
                                <td
                                  className="px-3 py-3 leading-5 text-slate-700"
                                  style={{ overflowWrap: "anywhere" }}
                                >
                                  {trip.departed_from || "--"}
                                </td>
                                <td
                                  className="px-3 py-3 leading-5 text-slate-700"
                                  style={{ overflowWrap: "anywhere" }}
                                >
                                  {trip.arrived_at || "--"}
                                </td>
                                <td className="px-3 py-3 text-right font-medium text-slate-900">
                                  {normalizeDurationText(trip.driving_time)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <span
                                    className="inline-flex min-w-[84px] justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                                    style={{
                                      backgroundColor: tone.background,
                                      color: tone.foreground,
                                      borderColor: tone.border,
                                    }}
                                  >
                                    {normalizeDurationText(trip.standing_time_at_location)}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-right font-medium text-slate-900">
                                  {trip.distance_km.toFixed(1)}
                                </td>
                                <td className="px-3 py-3 text-right font-medium text-slate-900">
                                  {trip.max_speed_kmh.toFixed(0)}
                                </td>
                                {showFuelColumn ? (
                                  <>
                                    <td className="px-3 py-3 text-right font-medium text-slate-900">
                                      {trip.fuel_used_litres !== null && trip.fuel_used_litres !== undefined
                                        ? trip.fuel_used_litres.toFixed(1)
                                        : "--"}
                                    </td>
                                    <td className="px-3 py-3 text-right font-medium text-slate-900">
                                      {formatKmPerL(trip.distance_km, trip.fuel_used_litres)}
                                    </td>
                                  </>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                          Movement Summary
                        </div>
                        <div className="mt-2 font-medium text-slate-900">
                          {group.trips.length} trips • {formatDistance(group.totals.distance)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                          Average Leg
                        </div>
                        <div className="mt-2 font-medium text-slate-900">
                          {formatDistance(group.averages.distance)} • {formatDurationCompact(group.averages.drivingTime)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                          Operational Read
                        </div>
                        <div className="mt-2 font-medium text-slate-900">
                          {showFuelColumn
                            ? `${formatKmPerL(group.totals.distance, groupFuelUsed)} overall`
                            : `${drivers.length || 0} driver${drivers.length === 1 ? "" : "s"} on record`}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
