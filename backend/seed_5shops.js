/**
 * Seed 5 Shops x 5 Commodities Baseline
 * Generates realistic 24h history for all 5 shops and 5 items
 */
const storage = require("./storage");

const COMMODITIES = ["Rice", "Sugar", "Wheat", "Toor Dal", "Palm Oil"];

const profiles = [
    {
        shop: "Shop 1 (Central Hub)",
        items: {
            "Rice": { total: 120, consumed: 35, weight: 85 },     // Big Surplus
            "Sugar": { total: 50, consumed: 20, weight: 30 },     // Healthy
            "Wheat": { total: 70, consumed: 25, weight: 45 },     // Healthy
            "Toor Dal": { total: 60, consumed: 15, weight: 45 },  // Big Surplus
            "Palm Oil": { total: 40, consumed: 15, weight: 25 }   // Healthy
        }
    },
    {
        shop: "Shop 2 (North Market)",
        items: {
            "Rice": { total: 100, consumed: 20, weight: 80 },     // Big Surplus
            "Sugar": { total: 60, consumed: 15, weight: 45 },     // Surplus
            "Wheat": { total: 80, consumed: 25, weight: 55 },     // Surplus
            "Toor Dal": { total: 40, consumed: 20, weight: 20 },  // Normal
            "Palm Oil": { total: 50, consumed: 15, weight: 35 }   // Surplus
        }
    },
    {
        shop: "Shop 3 (South Depot)",
        items: {
            "Rice": { total: 80, consumed: 72, weight: 8 },       // Critical Shortage (<10 kg)
            "Sugar": { total: 40, consumed: 22, weight: 18 },     // Normal
            "Wheat": { total: 60, consumed: 40, weight: 20 },     // Normal
            "Toor Dal": { total: 35, consumed: 31, weight: 4 },   // Critical Shortage (<5 kg)
            "Palm Oil": { total: 30, consumed: 18, weight: 12 }   // Normal
        }
    },
    {
        shop: "Shop 4 (East District)",
        items: {
            "Rice": { total: 90, consumed: 45, weight: 45 },      // Normal
            "Sugar": { total: 35, consumed: 31, weight: 4 },      // Critical Shortage (<5 kg)
            "Wheat": { total: 50, consumed: 32, weight: 18 },     // Rapid Consumption
            "Toor Dal": { total: 40, consumed: 22, weight: 18 },  // Normal
            "Palm Oil": { total: 40, consumed: 20, weight: 20 }   // Normal
        }
    },
    {
        shop: "Shop 5 (West Center)",
        items: {
            "Rice": { total: 85, consumed: 45, weight: 40 },      // Normal
            "Sugar": { total: 45, consumed: 20, weight: 25 },     // Normal
            "Wheat": { total: 70, consumed: 64, weight: 6 },      // Critical Shortage (<8 kg)
            "Toor Dal": { total: 35, consumed: 20, weight: 15 },  // Normal
            "Palm Oil": { total: 35, consumed: 32, weight: 3 }    // Critical Shortage (<5 L)
        }
    }
];

async function seed() {
    console.log("====================================================");
    console.log(" Seeding 5 Shops x 5 Commodities Baseline Data...");
    console.log("====================================================");

    await storage.clearAllReadings();
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const readings = [];

    for (const p of profiles) {
        console.log(`\nGenerating stream for ${p.shop}:`);
        for (const [commodity, target] of Object.entries(p.items)) {
            const initWeight = target.weight + 15;
            const midWeight1 = target.weight + 10;
            const midWeight2 = target.weight + 4;
            const finalWeight = target.weight;

            readings.push({
                device_id: p.shop,
                item_name: commodity,
                total_weight: target.total,
                consumed_weight: Math.max(0, target.consumed - 15),
                weight: initWeight,
                created_at: new Date(now - 12 * hour).toISOString()
            });
            readings.push({
                device_id: p.shop,
                item_name: commodity,
                total_weight: target.total,
                consumed_weight: Math.max(0, target.consumed - 10),
                weight: midWeight1,
                created_at: new Date(now - 8 * hour).toISOString()
            });
            readings.push({
                device_id: p.shop,
                item_name: commodity,
                total_weight: target.total,
                consumed_weight: Math.max(0, target.consumed - 4),
                weight: midWeight2,
                created_at: new Date(now - 3 * hour).toISOString()
            });
            readings.push({
                device_id: p.shop,
                item_name: commodity,
                total_weight: target.total,
                consumed_weight: target.consumed,
                weight: finalWeight,
                created_at: new Date(now).toISOString()
            });

            console.log(`  • ${commodity.padEnd(10)}: Final weight = ${finalWeight} kg/L (Total: ${target.total}, Consumed: ${target.consumed})`);
        }
    }

    const res = await storage.insertReadings(readings);
    console.log(`\nSuccessfully inserted ${res.count} inventory readings!`);
    console.log(`Storage used: ${res.storage}`);
    console.log("\nReady! Launch the server with 'npm start' and open the dashboard.");
}

seed().catch(err => {
    console.error("Seeding failed:", err);
    process.exit(1);
});
