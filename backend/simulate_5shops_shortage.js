/**
 * Simulate Critical Shortages across 5 Shops
 */
const storage = require("./storage");

async function simulateShortage() {
    console.log("====================================================");
    console.log(" Injecting Emergency Shortage Spikes across 5 Shops");
    console.log("====================================================");

    const now = new Date().toISOString();
    const shortageReadings = [
        // Shop 3: Rice drops to 3.0 kg, Toor Dal drops to 1.5 kg
        { device_id: "Shop 3 (South Depot)", item_name: "Rice", weight: 3.0, total_weight: 80, consumed_weight: 77, created_at: now },
        { device_id: "Shop 3 (South Depot)", item_name: "Toor Dal", weight: 1.5, total_weight: 35, consumed_weight: 33.5, created_at: now },
        // Shop 4: Sugar drops to 2.0 kg
        { device_id: "Shop 4 (East District)", item_name: "Sugar", weight: 2.0, total_weight: 35, consumed_weight: 33, created_at: now },
        // Shop 5: Wheat drops to 3.0 kg, Palm Oil drops to 1.0 L
        { device_id: "Shop 5 (West Center)", item_name: "Wheat", weight: 3.0, total_weight: 70, consumed_weight: 67, created_at: now },
        { device_id: "Shop 5 (West Center)", item_name: "Palm Oil", weight: 1.0, total_weight: 35, consumed_weight: 34, created_at: now }
    ];

    const res = await storage.insertReadings(shortageReadings);
    console.log(`Inserted ${res.count} shortage events:`);
    shortageReadings.forEach(s => {
        console.log(`  🚨 ${s.device_id} -> ${s.item_name} dropped to ${s.weight} kg/L`);
    });
    console.log("\nRefresh or check the dashboard to view the elevated HIGH RISK alerts and redistribution transfers!");
}

simulateShortage().catch(err => {
    console.error("Shortage simulation failed:", err);
    process.exit(1);
});
