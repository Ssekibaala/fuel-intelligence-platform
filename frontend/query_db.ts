import "dotenv/config";
import { supabaseAdmin } from "./server/supabase.js";

async function queryDB() {
    const { data: metrics } = await supabaseAdmin
        .from("daily_metrics")
        .select("metric_date")
        .order("metric_date", { ascending: false })
        .limit(10);

    console.log("Latest 10 daily metrics dates in database:");
    console.log(metrics);

    const { data: events } = await supabaseAdmin
        .from("fuel_events")
        .select("event_timestamp")
        .order("event_timestamp", { ascending: false })
        .limit(10);

    console.log("Latest 10 fuel events dates in database:");
    console.log(events);
}

queryDB().catch(console.error);
