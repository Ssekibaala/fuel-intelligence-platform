import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createClient } from "@supabase/supabase-js";

type TableName = "raw_telemetry_inbound" | "raw_sensor_data";

type Options = {
  tables: TableName[];
  inboundDays: number;
  sensorDays: number;
  batchSize: number;
  outputDir: string;
  deleteAfterArchive: boolean;
};

type TablePlan = {
  table: TableName;
  cutoffIso: string;
  orderColumn: string;
  count: number;
  filePath: string;
  manifestPath: string;
};

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

function parseArgs(argv: string[]): Options {
  const options: Options = {
    tables: ["raw_telemetry_inbound", "raw_sensor_data"],
    inboundDays: 30,
    sensorDays: 90,
    batchSize: 1000,
    outputDir: path.resolve(process.cwd(), "archives", "supabase"),
    deleteAfterArchive: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--table" && next) {
      const values = next
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (values.includes("all")) {
        options.tables = ["raw_telemetry_inbound", "raw_sensor_data"];
      } else {
        options.tables = values.filter(
          (value): value is TableName =>
            value === "raw_telemetry_inbound" || value === "raw_sensor_data",
        );
      }
      i += 1;
      continue;
    }

    if (arg === "--inbound-days" && next) {
      options.inboundDays = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--sensor-days" && next) {
      options.sensorDays = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--batch-size" && next) {
      options.batchSize = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--output-dir" && next) {
      options.outputDir = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }

    if (arg === "--delete") {
      options.deleteAfterArchive = true;
      continue;
    }
  }

  if (!options.tables.length) {
    throw new Error("No valid tables selected. Use --table raw_telemetry_inbound,raw_sensor_data");
  }
  if (!Number.isFinite(options.inboundDays) || options.inboundDays <= 0) {
    throw new Error("--inbound-days must be a positive number");
  }
  if (!Number.isFinite(options.sensorDays) || options.sensorDays <= 0) {
    throw new Error("--sensor-days must be a positive number");
  }
  if (!Number.isFinite(options.batchSize) || options.batchSize <= 0) {
    throw new Error("--batch-size must be a positive number");
  }

  return options;
}

function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function applyArchiveFilter(query: any, table: TableName, cutoff: string) {
  if (table === "raw_telemetry_inbound") {
    return query.eq("status", "processed").lt("processed_at", cutoff);
  }

  return query.lt("created_at", cutoff);
}

async function countRows(table: TableName, cutoff: string): Promise<number> {
  const query = supabase.schema("public").from(table).select("*", {
    count: "exact",
    head: true,
  });
  const { count, error } = await applyArchiveFilter(query, table, cutoff);
  if (error) throw error;
  return count ?? 0;
}

async function fetchBatch(
  table: TableName,
  cutoff: string,
  offset: number,
  batchSize: number,
  columns = "*",
) {
  let query = supabase
    .schema("public")
    .from(table)
    .select(columns)
    .order(table === "raw_telemetry_inbound" ? "processed_at" : "created_at", {
      ascending: true,
      nullsFirst: false,
    })
    .range(offset, offset + batchSize - 1);

  query = applyArchiveFilter(query, table, cutoff);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function writeArchive(table: TableName, cutoff: string, batchSize: number, filePath: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  const gzip = createGzip({ level: 9 });
  const output = fs.createWriteStream(filePath);
  const streamDone = pipeline(gzip, output);

  let offset = 0;
  let exported = 0;

  for (;;) {
    const rows = await fetchBatch(table, cutoff, offset, batchSize);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!gzip.write(`${JSON.stringify(row)}\n`)) {
        await new Promise<void>((resolve) => gzip.once("drain", resolve));
      }
    }

    exported += rows.length;
    offset += rows.length;
    console.log(`[archive] ${table}: exported ${exported} rows`);
  }

  gzip.end();
  await streamDone;
  return exported;
}

async function deleteArchivedRows(table: TableName, cutoff: string, batchSize: number) {
  let deleted = 0;
  let currentBatchSize = batchSize;

  for (;;) {
    const rows = await fetchBatch(table, cutoff, 0, currentBatchSize, "id");
    if (rows.length === 0) break;

    const ids = rows
      .map((row: any) => row.id)
      .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);

    if (ids.length === 0) break;

    const { error } = await supabase.schema("public").from(table).delete().in("id", ids);
    if (error) {
      if (String((error as any).code ?? "") === "57014" && currentBatchSize > 1) {
        currentBatchSize = Math.max(1, Math.floor(currentBatchSize / 2));
        console.warn(`[delete] ${table}: timeout, retrying with batch size ${currentBatchSize}`);
        continue;
      }
      throw error;
    }

    deleted += ids.length;
    console.log(`[delete] ${table}: deleted ${deleted} rows`);
  }

  return deleted;
}

async function buildPlan(options: Options): Promise<TablePlan[]> {
  const runStamp = stamp();
  const plans: TablePlan[] = [];

  for (const table of options.tables) {
    const cutoff =
      table === "raw_telemetry_inbound"
        ? cutoffIso(options.inboundDays)
        : cutoffIso(options.sensorDays);
    const count = await countRows(table, cutoff);
    const fileBase = `${table}-${runStamp}.jsonl.gz`;
    plans.push({
      table,
      cutoffIso: cutoff,
      orderColumn: table === "raw_telemetry_inbound" ? "processed_at" : "created_at",
      count,
      filePath: path.join(options.outputDir, fileBase),
      manifestPath: path.join(options.outputDir, `${fileBase}.manifest.json`),
    });
  }

  return plans;
}

async function writeManifest(plan: TablePlan, exported: number, deleted: number, options: Options) {
  await fs.promises.mkdir(path.dirname(plan.manifestPath), { recursive: true });

  const manifest = {
    table: plan.table,
    cutoffIso: plan.cutoffIso,
    archiveFile: plan.filePath,
    exportedRows: exported,
    deletedRows: deleted,
    deleteAfterArchive: options.deleteAfterArchive,
    batchSize: options.batchSize,
    generatedAt: new Date().toISOString(),
  };

  await fs.promises.writeFile(plan.manifestPath, JSON.stringify(manifest, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plans = await buildPlan(options);

  console.log(JSON.stringify({
    outputDir: options.outputDir,
    deleteAfterArchive: options.deleteAfterArchive,
    plans: plans.map((plan) => ({
      table: plan.table,
      cutoffIso: plan.cutoffIso,
      count: plan.count,
      filePath: plan.filePath,
    })),
  }, null, 2));

  for (const plan of plans) {
    if (plan.count === 0) {
      console.log(`[skip] ${plan.table}: no rows matched archive criteria`);
      await writeManifest(plan, 0, 0, options);
      continue;
    }

    const exported = await writeArchive(plan.table, plan.cutoffIso, options.batchSize, plan.filePath);
    let deleted = 0;

    if (options.deleteAfterArchive) {
      deleted = await deleteArchivedRows(plan.table, plan.cutoffIso, options.batchSize);
    }

    await writeManifest(plan, exported, deleted, options);
  }

  console.log("Archive run complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
