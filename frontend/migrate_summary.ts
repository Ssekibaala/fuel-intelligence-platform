import process from 'process';
import pg from 'pg';
const { Client } = pg;

async function main() {
    const client = new Client({
        connectionString: "postgresql://postgres:Teletrac%40123@db.pkduhowdqvymmvboyivt.supabase.co:5432/postgres",
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log("Connecting...");
        await client.connect();

        console.log("Applying ALTER TABLE...");
        await client.query(`
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS refill_count INT NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS total_refill_volume REAL NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS drain_count INT NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS total_drain_volume REAL NOT NULL DEFAULT 0;
ALTER TABLE vehicles RENAME COLUMN fuel_efficiency TO consumption_kml;
    `);
        console.log("ALTER TABLE succeeded.");

        process.exit(0);
    } catch (err: any) {
        if (err.message.includes("does not exist") && err.message.includes("fuel_efficiency")) {
            console.log("fuel_efficiency already renamed!");
            process.exit(0);
        }
        console.error("Connection failed:", err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
