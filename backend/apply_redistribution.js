/**
 * Apply Redistribution Transfers across 5 Shops
 * Brings deficit items back to target safe levels
 */
const storage = require("./storage");

const COMMODITIES = ["Rice", "Sugar", "Wheat", "Toor Dal", "Palm Oil"];
const COMMODITY_CONFIG = {
    "Rice": { baseMin: 10, targetBuffer: 5, unit: "kg" },
    "Sugar": { baseMin: 5, targetBuffer: 3, unit: "kg" },
    "Wheat": { baseMin: 8, targetBuffer: 4, unit: "kg" },
    "Toor Dal": { baseMin: 5, targetBuffer: 3, unit: "kg" },
    "Palm Oil": { baseMin: 5, targetBuffer: 3, unit: "L" }
};

const DEFAULT_SHOPS = [
    "Shop 1 (Central Hub)",
    "Shop 2 (North Market)",
    "Shop 3 (South Depot)",
    "Shop 4 (East District)",
    "Shop 5 (West Center)"
];

async function applyRedistribution() {
    console.log("====================================================");
    console.log(" Applying Redistribution Logistics across 5 Shops");
    console.log("====================================================");

    const now = new Date().toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rawData = await storage.getReadingsSince(twentyFourHoursAgo);

    const latestByPair = {};
    for (const r of rawData) {
        const key = `${r.device_id}|${r.item_name}`;
        latestByPair[key] = Number(r.weight);
    }

    const updates = [];
    for (const shop of DEFAULT_SHOPS) {
        for (const item of COMMODITIES) {
            const key = `${shop}|${item}`;
            const curr = latestByPair[key];
            const config = COMMODITY_CONFIG[item];
            const safeLevel = config.baseMin + config.targetBuffer;

            if (curr !== undefined && curr < config.baseMin) {
                updates.push({
                    device_id: shop,
                    item_name: item,
                    weight: safeLevel,
                    created_at: now
                });
                console.log(`  🚚 Stock transfer applied: ${shop} - ${item} replenished from ${curr} ${config.unit} -> ${safeLevel} ${config.unit}`);
            }
        }
    }

    if (updates.length > 0) {
        await storage.insertReadings(updates);
        console.log(`\nSuccessfully applied ${updates.length} stock replenishment transfers!`);
    } else {
        console.log("\nAll shop items are already at or above safe threshold levels!");
    }
}

applyRedistribution().catch(err => {
    console.error("Failed to apply redistribution:", err);
    process.exit(1);
});
