/**
 * Seed 5 Shops x 5 Commodities Baseline
 * Generates realistic 24h history for all 5 shops and 5 items
 * 100% Healthy & Normal (all green, zero initial shortages)
 */
const storage = require("./storage");

const COMMODITIES = ["Rice", "Sugar", "Wheat", "Toor Dal", "Palm Oil"];

// 100% HEALTHY baseline profiles: every single commodity is well above safe thresholds
const healthyProfiles = [
    {
        shop: "Shop 1 (Central Hub)",
        items: {
            "Rice": { total: 120, consumed: 35, weight: 85 },     // Healthy / Large Surplus
            "Sugar": { total: 60, consumed: 20, weight: 40 },     // Healthy / Surplus
            "Wheat": { total: 70, consumed: 20, weight: 50 },     // Healthy / Surplus
            "Toor Dal": { total: 60, consumed: 15, weight: 45 },  // Healthy / Large Surplus
            "Palm Oil": { total: 50, consumed: 15, weight: 35 }   // Healthy / Surplus
        }
    },
    {
        shop: "Shop 2 (North Market)",
        items: {
            "Rice": { total: 110, consumed: 30, weight: 80 },     // Healthy / Large Surplus
            "Sugar": { total: 60, consumed: 15, weight: 45 },     // Healthy / Surplus
            "Wheat": { total: 80, consumed: 25, weight: 55 },     // Healthy / Surplus
            "Toor Dal": { total: 50, consumed: 15, weight: 35 },  // Healthy / Surplus
            "Palm Oil": { total: 50, consumed: 15, weight: 35 }   // Healthy / Surplus
        }
    },
    {
        shop: "Shop 3 (South Depot)",
        items: {
            "Rice": { total: 80, consumed: 40, weight: 40 },      // Healthy (Safe min: 10 kg)
            "Sugar": { total: 40, consumed: 18, weight: 22 },     // Healthy (Safe min: 5 kg)
            "Wheat": { total: 60, consumed: 30, weight: 30 },     // Healthy (Safe min: 8 kg)
            "Toor Dal": { total: 40, consumed: 18, weight: 22 },  // Healthy (Safe min: 5 kg)
            "Palm Oil": { total: 35, consumed: 15, weight: 20 }   // Healthy (Safe min: 5 L)
        }
    },
    {
        shop: "Shop 4 (East District)",
        items: {
            "Rice": { total: 90, consumed: 45, weight: 45 },      // Healthy
            "Sugar": { total: 45, consumed: 20, weight: 25 },     // Healthy
            "Wheat": { total: 55, consumed: 25, weight: 30 },     // Healthy
            "Toor Dal": { total: 40, consumed: 18, weight: 22 },  // Healthy
            "Palm Oil": { total: 40, consumed: 18, weight: 22 }   // Healthy
        }
    },
    {
        shop: "Shop 5 (West Center)",
        items: {
            "Rice": { total: 85, consumed: 40, weight: 45 },      // Healthy
            "Sugar": { total: 45, consumed: 20, weight: 25 },     // Healthy
            "Wheat": { total: 65, consumed: 30, weight: 35 },     // Healthy
            "Toor Dal": { total: 40, consumed: 20, weight: 20 },  // Healthy
            "Palm Oil": { total: 40, consumed: 18, weight: 22 }   // Healthy
        }
    }
];

async function seed() {
    console.log("====================================================");
    console.log(" Seeding 5 Shops x 5 Commodities Healthy Baseline...");
    console.log("====================================================");

    await storage.clearAllReadings();
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const readings = [];

    for (const p of healthyProfiles) {
        console.log(`\nGenerating healthy baseline stream for ${p.shop}:`);
        for (const [commodity, target] of Object.entries(p.items)) {
            const initWeight = target.weight + 12;
            const midWeight1 = target.weight + 8;
            const midWeight2 = target.weight + 3;
            const finalWeight = target.weight;

            readings.push({
                device_id: p.shop,
                item_name: commodity,
                total_weight: target.total,
                consumed_weight: Math.max(0, target.consumed - 12),
                weight: initWeight,
                created_at: new Date(now - 12 * hour).toISOString()
            });
            readings.push({
                device_id: p.shop,
                item_name: commodity,
                total_weight: target.total,
                consumed_weight: Math.max(0, target.consumed - 8),
                weight: midWeight1,
                created_at: new Date(now - 8 * hour).toISOString()
            });
            readings.push({
                device_id: p.shop,
                item_name: commodity,
                total_weight: target.total,
                consumed_weight: Math.max(0, target.consumed - 3),
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

            console.log(`  • ${commodity.padEnd(10)}: Baseline stock = ${finalWeight} kg/L (All Healthy)`);
        }
    }

    const res = await storage.insertReadings(readings);
    console.log(`\nSuccessfully inserted ${res.count} inventory readings!`);
    console.log(`Storage used: ${res.storage}`);
    console.log("\nAll 5 shops & 25 commodities are in 100% NORMAL state.");
    console.log("Ready! Use 'npm run simulate-shortage' to trigger emergency shortages.");
}

seed().catch(err => {
    console.error("Seeding failed:", err);
    process.exit(1);
});
