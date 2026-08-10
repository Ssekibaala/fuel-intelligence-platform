/**
 * Probe the gpsiot.net Web API to decide whether the webhook -> polling
 * migration is viable, and specifically whether report50 can survive it.
 *
 * BACKGROUND
 * ----------
 * Today four "scheduled report" webhooks feed raw_telemetry_inbound:
 *
 *   report0   live position          -> maps cleanly to GetDevicesCurrentData
 *   report137 trip listing           -> maps cleanly to GetTrips / GetTripDetails
 *   report147 fuel summary per asset -> AssetFuelInfo + GetClientAssetsMileage
 *   report50  fuel telemetry         -> THE OPEN QUESTION
 *
 * report50 delivers a ~30-second-interval series:
 *     { af, rf, alt, hrs, ign, odo, rpm, spid, date }
 * which is exploded into raw_sensor_data and rendered by the fuel/temperature
 * charts (see rawSensorData in supabase/functions/public-api/index.ts).
 *
 * The polling API's GetFuelTelemetry returns drain/refill *events* plus
 * start/end sensor readings - NOT the series. So the question this script
 * answers is: can Events/v2/GetTelemetry reconstruct that series at comparable
 * cadence and with a usable fuel value?
 *
 * If yes  -> polling is a clean win, migrate everything.
 * If no   -> report50 either keeps its webhook, or the fuel charts lose
 *            resolution and that is a product decision, not a technical one.
 *
 * USAGE
 * -----
 *   cd frontend
 *   export GPSIOT_API_KEY='...'      # vendor "Web API Key"
 *   export GPSIOT_API_SECRET='...'   # vendor "API Secret Key"
 *   npx tsx scripts/probe-gpsiot-api.ts
 *
 * Credentials are read from the environment only - never hardcode them here,
 * and rotate the pair with the vendor if it has ever been pasted into a chat,
 * an issue, or a commit.
 *
 * Raw responses are written to ./probe-output/ so you can inspect the exact
 * shapes rather than trusting this script's summary.
 */

import fs from "node:fs";
import path from "node:path";

const BASE_URL = "https://api.gpsiot.net";
const OUT_DIR = path.resolve(process.cwd(), "probe-output");

const API_KEY = process.env.GPSIOT_API_KEY;
const API_SECRET = process.env.GPSIOT_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error(
    "Missing credentials. Set GPSIOT_API_KEY and GPSIOT_API_SECRET, then re-run."
  );
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

function save(name: string, data: unknown): void {
  const file = path.join(OUT_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`   saved -> ${path.relative(process.cwd(), file)}`);
}

type ProbeResult = {
  ok: boolean;
  status: number;
  body: any;
};

async function call(
  method: "GET" | "POST",
  routePath: string,
  token: string,
  options: { body?: unknown; query?: Record<string, string> } = {}
): Promise<ProbeResult> {
  const url = new URL(routePath, BASE_URL);
  for (const [k, v] of Object.entries(options.query ?? {})) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* leave as text so non-JSON errors stay readable */
  }
  return { ok: res.ok, status: res.status, body };
}

/** OAuth2 password grant. Form-encoded, unlike every other call. */
async function authenticate(): Promise<string> {
  const res = await fetch(new URL("/token", BASE_URL), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: API_KEY!,
      password: API_SECRET!,
      grant_type: "password",
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Auth failed (${res.status}): ${JSON.stringify(body).slice(0, 400)}`
    );
  }

  console.log(
    `   token acquired, expires_in=${body.expires_in}s (~${Math.round(
      (body.expires_in ?? 0) / 60
    )} min)`
  );
  return body.access_token as string;
}

function yesterdayWindow(): { start: string; end: string } {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 0);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  return { start: fmt(start), end: fmt(end) };
}

/** Field names that plausibly carry a fuel level, across response shapes. */
const FUEL_HINTS = ["af", "an1", "a1", "fuel", "sensor", "analog", "level"];

function looksLikeFuelField(key: string): boolean {
  const k = key.toLowerCase();
  return FUEL_HINTS.some((h) => k.includes(h));
}

/** Median gap in seconds between consecutive timestamped samples. */
function cadenceSeconds(records: any[], dateKeys: string[]): number | null {
  const times = records
    .map((r) => {
      for (const k of dateKeys) {
        if (r?.[k]) {
          const t = Date.parse(String(r[k]).replace(" ", "T"));
          if (!Number.isNaN(t)) return t;
        }
      }
      return null;
    })
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);

  if (times.length < 3) return null;

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 1000);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

async function main(): Promise<void> {
  const { start, end } = yesterdayWindow();
  console.log(`\ngpsiot.net API probe`);
  console.log(`window: ${start} .. ${end} (UTC, 24h - the documented maximum)\n`);

  console.log("[1] Authenticating (POST /token, password grant)");
  const token = await authenticate();

  // --------------------------------------------------------------------
  // report0 equivalent: bulk current data for the whole fleet in one call.
  // This is the call that lets report0 stop writing staging rows entirely.
  // --------------------------------------------------------------------
  console.log("\n[2] POST /api/Asset/GetDevicesCurrentData  (report0 equivalent)");
  const current = await call("POST", "/api/Asset/GetDevicesCurrentData", token, {
    body: {},
  });
  console.log(`   status ${current.status}`);
  save("02-GetDevicesCurrentData", current.body);

  const devices: any[] = Array.isArray(current.body)
    ? current.body
    : current.body?.data ?? current.body?.Status ?? [];

  const imeis = devices
    .map((d) => d?.ImeiNumber ?? d?.imei ?? d?.Imei)
    .filter(Boolean)
    .map(String);

  console.log(`   devices returned: ${devices.length}`);
  if (devices.length) {
    console.log(`   fields: ${Object.keys(devices[0]).join(", ")}`);
    console.log(`   sample IMEIs: ${imeis.slice(0, 3).join(", ")}`);
  }

  if (!imeis.length) {
    console.log(
      "\n   No IMEIs returned - cannot continue to the fuel probes.\n" +
        "   If this account is a reseller, try GET /api/Asset/GetResellerDevicesCurrentData,\n" +
        "   or supply a ClientID in the request body."
    );
    return;
  }

  const imei = imeis[0];
  console.log(`\n   Using IMEI ${imei} for the remaining probes.`);

  // --------------------------------------------------------------------
  // Does the vendor still pre-compute drains/refills when polled?
  // If yes we do NOT need to reimplement that detection ourselves.
  // --------------------------------------------------------------------
  console.log("\n[3] POST /api/Fuel/GetFuelTelemetry  (drain/refill events)");
  const fuelTel = await call("POST", "/api/Fuel/GetFuelTelemetry", token, {
    body: { start_date: start, end_date: end, imei_array: [imei] },
  });
  console.log(`   status ${fuelTel.status}`);
  save("03-GetFuelTelemetry", fuelTel.body);

  const fuelEntry = (fuelTel.body?.data ?? [])[0];
  if (fuelEntry) {
    const events = fuelEntry.events ?? [];
    const readings = fuelEntry.sensor_readings ?? [];
    console.log(`   events: ${events.length}  sensor_readings: ${readings.length}`);
    if (events.length) {
      const drains = events.filter((e: any) => e?.is_drain === true).length;
      console.log(
        `   -> vendor pre-computes drain/refill: ${drains} drains, ` +
          `${events.length - drains} fills. No need to reimplement detection.`
      );
    }
  }

  // --------------------------------------------------------------------
  // report147 inputs.
  // --------------------------------------------------------------------
  console.log("\n[4] POST /api/fuel/AssetFuelInfo  (report147 equivalent)");
  const fuelInfo = await call("POST", "/api/fuel/AssetFuelInfo", token, {
    body: { start_date: start, end_date: end, imei: imei },
  });
  console.log(`   status ${fuelInfo.status}`);
  save("04-AssetFuelInfo", fuelInfo.body);

  // --------------------------------------------------------------------
  // report137 inputs.
  // --------------------------------------------------------------------
  console.log("\n[5] POST /api/Trip/GetTrips/  (report137 equivalent)");
  const trips = await call("POST", "/api/Trip/GetTrips/", token, {
    body: { start_date: start, end_date: end, imei: imei },
  });
  console.log(`   status ${trips.status}`);
  save("05-GetTrips", trips.body);

  // --------------------------------------------------------------------
  // THE DECIDING TEST.
  // Can we rebuild report50's ~30s series {af, rf, odo, ign, spid} ?
  // Parameter names here are a best guess from the vendor doc; if this 400s,
  // check probe-output/06-*.json for the error and adjust the query keys.
  // --------------------------------------------------------------------
  console.log("\n[6] GET /api/Events/v2/GetTelemetry  <-- decides report50");
  const series = await call("GET", "/api/Events/v2/GetTelemetry", token, {
    query: {
      imei,
      start_date: start,
      end_date: end,
      TimeZone: "E. Africa Standard Time",
    },
  });
  console.log(`   status ${series.status}`);
  save("06-EventsGetTelemetry", series.body);

  const rows: any[] = Array.isArray(series.body)
    ? series.body
    : series.body?.data ?? [];

  console.log("\n" + "=".repeat(70));
  console.log("VERDICT — can polling reproduce report50's fuel series?");
  console.log("=".repeat(70));

  if (!series.ok || !rows.length) {
    console.log(
      `\n  INCONCLUSIVE — endpoint returned ${series.status} with ${rows.length} rows.\n` +
        `  Inspect probe-output/06-EventsGetTelemetry.json. The query parameter\n` +
        `  names are the least certain part of this script; the vendor doc does\n` +
        `  not spell them out. Try 'imei_no', 'ImeiNumber', 'from'/'to', or ask\n` +
        `  the vendor for one worked example of this call.`
    );
  } else {
    const cadence = cadenceSeconds(rows, ["date", "GPSDate", "utc_date"]);
    const keys = Object.keys(rows[0]);
    const fuelKeys = keys.filter(looksLikeFuelField);

    // Fuel may be nested inside a JSON-encoded string (the vendor does this for
    // SensorData / Attributes on other endpoints), so look one level deeper.
    let nestedFuelKeys: string[] = [];
    for (const k of ["attributes", "Attributes", "SensorData", "sensor_data"]) {
      const raw = rows[0]?.[k];
      if (typeof raw === "string" && raw.trim().startsWith("{")) {
        try {
          nestedFuelKeys = Object.keys(JSON.parse(raw)).filter(looksLikeFuelField);
        } catch {
          /* ignore malformed */
        }
      }
    }

    console.log(`\n  rows returned : ${rows.length}`);
    console.log(`  median cadence: ${cadence === null ? "unknown" : cadence + "s"}   (report50 is ~30s)`);
    console.log(`  top-level keys: ${keys.join(", ")}`);
    console.log(`  fuel-ish keys : ${fuelKeys.length ? fuelKeys.join(", ") : "(none at top level)"}`);
    if (nestedFuelKeys.length) {
      console.log(`  nested fuel   : ${nestedFuelKeys.join(", ")}  (inside a JSON-encoded string field)`);
    }

    const hasFuel = fuelKeys.length > 0 || nestedFuelKeys.length > 0;
    const denseEnough = cadence !== null && cadence <= 120;

    console.log("");
    if (hasFuel && denseEnough) {
      console.log(
        "  GO — a fuel value is present at a cadence close to the webhook feed.\n" +
          "  report50 can be rebuilt from polling. Proceed with the full migration."
      );
    } else if (hasFuel && !denseEnough) {
      console.log(
        "  PARTIAL — fuel values are present but sampled more coarsely than the\n" +
          "  webhook feed. Charts would still render, at lower resolution. Decide\n" +
          "  whether that is acceptable before migrating report50; the other three\n" +
          "  reports are unaffected and can migrate regardless."
      );
    } else {
      console.log(
        "  NO-GO for report50 — no fuel value in this response. Keep report50 on\n" +
          "  its webhook and migrate the other three, or accept losing the\n" +
          "  fine-grained fuel chart. Everything else still moves to polling."
      );
    }
  }

  console.log(
    `\nRaw responses in ${path.relative(process.cwd(), OUT_DIR)}/ ` +
      `— worth reading directly before acting on the verdict above.\n`
  );
}

main().catch((err) => {
  console.error("\nProbe failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
