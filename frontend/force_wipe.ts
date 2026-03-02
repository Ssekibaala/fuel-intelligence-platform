import "dotenv/config";
import { supabaseAdmin } from "./server/supabase.js";

async function forceWipeAllData() {
    console.log("Checking for ANY vehicles...");
    const { data: vehicles } = await supabaseAdmin.from("vehicles").select("id, asset_id");

    if (!vehicles || vehicles.length === 0) {
        console.log("No vehicles found at all in the database.");
        return;
    }

    console.log(`Found ${vehicles.length} vehicles. Asset IDs:`, vehicles.map(v => v.asset_id).join(", "));

    const ids = vehicles.map(v => v.id);

    console.log("Wiping all metrics...");
    await supabaseAdmin.from("daily_metrics").delete().in("vehicle_id", ids);

    console.log("Wiping all fuel events...");
    await supabaseAdmin.from("fuel_events").delete().in("vehicle_id", ids);

    console.log("Wiping all trip reports & fuel configs...");
    await supabaseAdmin.from("trip_reports").delete().in("vehicle_id", ids);
    await supabaseAdmin.from("fuel_temperature_reports").delete().in("vehicle_id", ids);

    console.log("Wiping all vehicles...");
    await supabaseAdmin.from("vehicles").delete().in("id", ids);

    console.log("All data successfully wiped!");
}

forceWipeAllData().catch(console.error);
