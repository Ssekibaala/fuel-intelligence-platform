import "dotenv/config";
import { supabaseAdmin } from "./server/supabase.js";

async function clearDemoData() {
    console.log("Locating demo vehicles...");

    // Find all DEMO vehicles from the seed script + the two specific FAW/HOWO ones
    const { data: vehicles } = await supabaseAdmin
        .from("vehicles")
        .select("id, asset_id")
        .or("asset_id.like.DEMO-TRK-%,asset_id.in.(HOWO-UBG002K,HOWO-UBG003K,FAW-UBL433L)");

    if (!vehicles || vehicles.length === 0) {
        console.log("No demo vehicles found.");
        return;
    }

    const ids = vehicles.map(v => v.id);
    console.log(`Found ${ids.length} demo vehicles to delete.`);

    console.log("Deleting associated daily_metrics...");
    await supabaseAdmin.from("daily_metrics").delete().in("vehicle_id", ids);

    console.log("Deleting associated fuel_events...");
    await supabaseAdmin.from("fuel_events").delete().in("vehicle_id", ids);

    console.log("Deleting associated kpi_aggregates...");
    await supabaseAdmin.from("kpi_aggregates").delete().in("vehicle_id", ids);

    // Note: fks cascade is usually set, but we do it manually to be safe
    console.log("Deleting vehicles...");
    await supabaseAdmin.from("vehicles").delete().in("id", ids);

    console.log("Demo data cleared successfully.");
}

clearDemoData().catch(console.error);
