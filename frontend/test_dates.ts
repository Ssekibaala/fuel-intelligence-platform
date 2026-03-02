const url = "http://localhost:3000/api/daily-metrics?startDate=2026-02-27T00:00:00.000Z&endDate=2026-02-27T23:59:59.999Z";

async function main() {
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log(`Found ${data.length} metrics for yesterday...`);
        if (data.length > 0) {
            console.log(JSON.stringify(data.slice(0, 3).map((d: any) => ({
                id: d.id,
                metricDate: d.metricDate,
            })), null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}
main();
