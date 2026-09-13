const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const storage = require("./storage");

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Serve static frontend files if requested directly from backend
app.use(express.static(path.join(__dirname, "..", "frontend")));

// System Constants
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

// Helper: normalize shop name
function normalizeShop(id) {
    if (!id) return DEFAULT_SHOPS[0];
    const match = DEFAULT_SHOPS.find(s => s.toLowerCase().startsWith(id.toLowerCase().trim()));
    return match || id.trim();
}

// Helper: normalize commodity name
function normalizeCommodity(name) {
    if (!name) return "Rice";
    const found = COMMODITIES.find(c => c.toLowerCase() === name.toLowerCase().trim());
    return found || "Rice";
}

// ==========================================
// 1. INGESTION ENDPOINT: POST /api/fooddata
// ==========================================
app.post("/api/fooddata", async (req, res) => {
    try {
        const payload = req.body;
        const readings = Array.isArray(payload) ? payload : [payload];

        const validReadings = [];
        for (const item of readings) {
            const { device_id, weight, total_weight, consumed_weight, item_name } = item;
            if (!device_id || weight === undefined) {
                return res.status(400).json({ error: "Missing device_id or weight in payload" });
            }
            validReadings.push({
                device_id: normalizeShop(device_id),
                item_name: normalizeCommodity(item_name),
                weight: Number(weight),
                total_weight: total_weight !== undefined ? Number(total_weight) : 0,
                consumed_weight: consumed_weight !== undefined ? Number(consumed_weight) : 0,
                created_at: item.created_at || new Date().toISOString()
            });
        }

        const result = await storage.insertReadings(validReadings);
        res.json({ message: "Data stored successfully", storedCount: result.count, storage: result.storage });
    } catch (err) {
        console.error("Error storing data:", err);
        res.status(500).json({ error: "Failed to store data", details: err.message });
    }
});

// ==========================================
// 2. ANALYTICS & REDISTRIBUTION: GET /api/data
// ==========================================
app.get("/api/data", async (req, res) => {
    try {
        // Query last 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const rawData = await storage.getReadingsSince(twentyFourHoursAgo);

        // Group data by [shop_id][item_name]
        const grouped = {};
        for (const row of rawData) {
            const shop = normalizeShop(row.device_id);
            const item = normalizeCommodity(row.item_name);

            if (!grouped[shop]) grouped[shop] = {};
            if (!grouped[shop][item]) grouped[shop][item] = [];
            grouped[shop][item].push(row);
        }

        // Active shops list: ensure default 5 shops exist or include all discovered
        const allShopKeys = Array.from(new Set([...DEFAULT_SHOPS, ...Object.keys(grouped)])).sort();

        const shopsData = [];
        const alerts = [];
        const flatItemsList = [];

        // Track surpluses and deficits by commodity item for matchmaking
        const surplusesByItem = {};
        const deficitsByItem = {};
        COMMODITIES.forEach(c => {
            surplusesByItem[c] = [];
            deficitsByItem[c] = [];
        });

        for (const shopId of allShopKeys) {
            const shopItems = [];

            for (const commodity of COMMODITIES) {
                const config = COMMODITY_CONFIG[commodity] || { baseMin: 5, targetBuffer: 3, unit: "kg" };
                const readings = (grouped[shopId] && grouped[shopId][commodity]) || [];

                if (readings.length === 0) {
                    // No reading yet for this item in this shop
                    shopItems.push({
                        item_name: commodity,
                        unit: config.unit,
                        current_weight: null,
                        total_weight: 0,
                        consumed_weight: 0,
                        consumption_rate: "0.00",
                        avg_consumption: "0.00",
                        safe_buffer: config.baseMin,
                        target_level: config.baseMin + config.targetBuffer,
                        risk_level: "NO DATA",
                        readings_count: 0
                    });
                    continue;
                }

                // Sort readings by timestamp ascending
                readings.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                const latest = readings[readings.length - 1];
                const currentWeight = Number(latest.weight);
                const totalWeight = Number(latest.total_weight || 0);
                const consumedWeight = Number(latest.consumed_weight || 0);

                // Recent consumption rate (difference between last 2 readings)
                let currentRate = 0;
                if (readings.length >= 2) {
                    const prev = readings[readings.length - 2];
                    if (Number(prev.weight) > currentWeight) {
                        currentRate = Number(prev.weight) - currentWeight;
                    }
                }

                // 24-hour average consumption drop
                let totalDrops = 0;
                let dropCount = 0;
                for (let i = 1; i < readings.length; i++) {
                    const diff = Number(readings[i - 1].weight) - Number(readings[i].weight);
                    if (diff > 0) {
                        totalDrops += diff;
                        dropCount++;
                    }
                }
                const avgConsumption = dropCount > 0 ? (totalDrops / dropCount) : 0;

                // Dynamic Safety Thresholds per commodity
                const safeBuffer = Math.max(config.baseMin, avgConsumption);
                const targetLevel = safeBuffer + config.targetBuffer;

                // Risk Evaluation
                let riskLevel = "NORMAL";
                if (currentWeight <= safeBuffer) {
                    riskLevel = "HIGH RISK";
                    alerts.push({
                        type: "HIGH RISK",
                        shop: shopId,
                        item: commodity,
                        weight: currentWeight,
                        unit: config.unit,
                        message: `Critical shortage of ${commodity} at ${shopId}! Current stock: ${currentWeight.toFixed(1)} ${config.unit} (Safe minimum: ${safeBuffer.toFixed(1)} ${config.unit}).`
                    });
                } else if (currentRate > avgConsumption && currentWeight <= targetLevel) {
                    riskLevel = "MEDIUM RISK";
                    alerts.push({
                        type: "MEDIUM RISK",
                        shop: shopId,
                        item: commodity,
                        weight: currentWeight,
                        unit: config.unit,
                        message: `Rapid consumption of ${commodity} at ${shopId}. Velocity (${currentRate.toFixed(1)} ${config.unit}) exceeds 24h average (${avgConsumption.toFixed(1)} ${config.unit}).`
                    });
                }

                // Matchmaking Buckets per Commodity
                if (currentWeight > targetLevel && riskLevel === "NORMAL") {
                    surplusesByItem[commodity].push({
                        shopId,
                        currentWeight,
                        targetLevel,
                        available: currentWeight - targetLevel,
                        unit: config.unit
                    });
                } else if (currentWeight < safeBuffer) {
                    deficitsByItem[commodity].push({
                        shopId,
                        currentWeight,
                        safeBuffer,
                        targetLevel,
                        needed: targetLevel - currentWeight,
                        unit: config.unit
                    });
                }

                const itemSummary = {
                    item_name: commodity,
                    unit: config.unit,
                    current_weight: currentWeight,
                    total_weight: totalWeight,
                    consumed_weight: consumedWeight,
                    consumption_rate: currentRate.toFixed(2),
                    avg_consumption: avgConsumption.toFixed(2),
                    safe_buffer: Number(safeBuffer.toFixed(1)),
                    target_level: Number(targetLevel.toFixed(1)),
                    risk_level: riskLevel,
                    readings_count: readings.length,
                    last_updated: latest.created_at
                };

                shopItems.push(itemSummary);
                flatItemsList.push({ shopId, ...itemSummary });
            }

            shopsData.push({
                shop_id: shopId,
                items: shopItems
            });
        }

        // ==========================================
        // ITEM-AWARE MATCHMAKING REDISTRIBUTION
        // ==========================================
        const redistributions = [];
        let recId = 1;

        for (const commodity of COMMODITIES) {
            const deficits = deficitsByItem[commodity] || [];
            const surpluses = surplusesByItem[commodity] || [];

            // Sort deficits by most needy first
            deficits.sort((a, b) => b.needed - a.needed);
            // Sort surpluses by largest available first
            surpluses.sort((a, b) => b.available - a.available);

            for (const deficit of deficits) {
                for (const surplus of surpluses) {
                    if (surplus.available > 0.01 && deficit.needed > 0.01) {
                        const amountToMove = Math.min(surplus.available, deficit.needed);
                        const roundedAmount = Number(amountToMove.toFixed(1));

                        if (roundedAmount > 0) {
                            redistributions.push({
                                id: `rec-${recId++}`,
                                item: commodity,
                                unit: surplus.unit,
                                source_shop: surplus.shopId,
                                target_shop: deficit.shopId,
                                amount: roundedAmount,
                                source_remaining: Number((surplus.currentWeight - roundedAmount).toFixed(1)),
                                target_new_total: Number((deficit.currentWeight + roundedAmount).toFixed(1)),
                                message: `Transfer ${roundedAmount} ${surplus.unit} of ${commodity} from ${surplus.shopId} to ${deficit.shopId}`,
                                reason: `${deficit.shopId} is critically low (${deficit.currentWeight.toFixed(1)} ${surplus.unit}). ${surplus.shopId} holds a safe surplus (${surplus.currentWeight.toFixed(1)} ${surplus.unit}).`
                            });

                            surplus.available -= roundedAmount;
                            deficit.needed -= roundedAmount;
                            surplus.currentWeight -= roundedAmount;
                            deficit.currentWeight += roundedAmount;
                        }
                    }
                }
            }
        }

        // Summary counts
        const highRiskCount = flatItemsList.filter(i => i.risk_level === "HIGH RISK").length;
        const mediumRiskCount = flatItemsList.filter(i => i.risk_level === "MEDIUM RISK").length;
        const normalCount = flatItemsList.filter(i => i.risk_level === "NORMAL").length;

        res.json({
            shops: shopsData,
            commodities: COMMODITIES,
            summary: {
                total_shops: allShopKeys.length,
                total_inventory_lines: flatItemsList.length,
                high_risk_count: highRiskCount,
                medium_risk_count: mediumRiskCount,
                normal_count: normalCount,
                active_transfers_count: redistributions.length
            },
            alerts,
            redistributions,
            storage: storage.getStorageStatus()
        });
    } catch (err) {
        console.error("Error generating analytics:", err);
        res.status(500).json({ error: "Failed to generate analytics", details: err.message });
    }
});

// ==========================================
// 3. TESTING & SIMULATION ENDPOINTS
// ==========================================

/**
 * POST /api/test/seed
 * Populates a 24-hour realistic baseline for all 5 shops and all 5 items.
 */
app.post("/api/test/seed", async (req, res) => {
    try {
        await storage.clearAllReadings();
        const now = Date.now();
        const hour = 60 * 60 * 1000;
        const readings = [];

        // Baseline profile configuration for the 5 shops across 5 items
        // Designed to showcase realistic distributions: some normal, some surplus, some approaching risk
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

        // Generate a 4-step progressive history over 12 hours for each item
        for (const p of profiles) {
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
            }
        }

        await storage.insertReadings(readings);
        res.json({
            message: "Successfully seeded 5 shops with 5 items (24h baseline created)",
            totalReadings: readings.length,
            shops: profiles.map(p => p.shop),
            commodities: COMMODITIES
        });
    } catch (err) {
        console.error("Error seeding baseline:", err);
        res.status(500).json({ error: "Failed to seed baseline", details: err.message });
    }
});

/**
 * POST /api/test/shortage
 * Simulates severe emergency shortages on specific items.
 */
app.post("/api/test/shortage", async (req, res) => {
    try {
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

        await storage.insertReadings(shortageReadings);
        res.json({
            message: "Emergency shortage spikes injected across multiple shops & commodities!",
            shortagesTriggered: shortageReadings
        });
    } catch (err) {
        console.error("Error simulating shortage:", err);
        res.status(500).json({ error: "Failed to simulate shortage", details: err.message });
    }
});

/**
 * POST /api/test/apply-transfer
 * Executes active redistribution transfer recommendations in the database.
 */
app.post("/api/test/apply-transfer", async (req, res) => {
    try {
        const { source_shop, target_shop, item_name, amount } = req.body;
        const now = new Date().toISOString();

        if (source_shop && target_shop && item_name && amount) {
            // Apply single specified transfer
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const rawData = await storage.getReadingsSince(twentyFourHoursAgo);

            // Find current weights
            const srcReadings = rawData.filter(r => normalizeShop(r.device_id) === normalizeShop(source_shop) && normalizeCommodity(r.item_name) === normalizeCommodity(item_name));
            const tgtReadings = rawData.filter(r => normalizeShop(r.device_id) === normalizeShop(target_shop) && normalizeCommodity(r.item_name) === normalizeCommodity(item_name));

            const srcCurrent = srcReadings.length > 0 ? Number(srcReadings[srcReadings.length - 1].weight) : 50;
            const tgtCurrent = tgtReadings.length > 0 ? Number(tgtReadings[tgtReadings.length - 1].weight) : 0;

            const transferAmt = Number(amount);
            const newSrcWeight = Math.max(0, srcCurrent - transferAmt);
            const newTgtWeight = tgtCurrent + transferAmt;

            await storage.insertReadings([
                { device_id: source_shop, item_name, weight: newSrcWeight, created_at: now },
                { device_id: target_shop, item_name, weight: newTgtWeight, created_at: now }
            ]);

            return res.json({
                message: `Applied transfer of ${transferAmt} ${item_name} from ${source_shop} to ${target_shop}.`,
                source_new_weight: newSrcWeight,
                target_new_weight: newTgtWeight
            });
        }

        // Apply automatic rebalancing: compute current recommendations and apply all
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const rawData = await storage.getReadingsSince(twentyFourHoursAgo);

        // Group latest weights
        const latestByPair = {};
        for (const r of rawData) {
            const key = `${normalizeShop(r.device_id)}|${normalizeCommodity(r.item_name)}`;
            latestByPair[key] = Number(r.weight);
        }

        // Apply safe rebalancing to bring deficit items up to safe target levels
        const updates = [];
        for (const shop of DEFAULT_SHOPS) {
            for (const item of COMMODITIES) {
                const key = `${shop}|${item}`;
                const curr = latestByPair[key];
                const config = COMMODITY_CONFIG[item];
                const safeLevel = config.baseMin + config.targetBuffer;

                if (curr !== undefined && curr < config.baseMin) {
                    // Brought up to safe target
                    updates.push({
                        device_id: shop,
                        item_name: item,
                        weight: safeLevel,
                        created_at: now
                    });
                }
            }
        }

        if (updates.length > 0) {
            await storage.insertReadings(updates);
        }

        res.json({
            message: `Redistribution transfers executed! Restored ${updates.length} deficit items to safe levels.`,
            appliedUpdates: updates
        });
    } catch (err) {
        console.error("Error applying transfers:", err);
        res.status(500).json({ error: "Failed to apply transfers", details: err.message });
    }
});

/**
 * POST /api/test/adjust
 * Allows custom manual stock injection from UI.
 */
app.post("/api/test/adjust", async (req, res) => {
    try {
        const { device_id, item_name, weight, total_weight, consumed_weight } = req.body;
        if (!device_id || weight === undefined) {
            return res.status(400).json({ error: "device_id and weight required" });
        }

        const reading = {
            device_id: normalizeShop(device_id),
            item_name: normalizeCommodity(item_name),
            weight: Number(weight),
            total_weight: total_weight !== undefined ? Number(total_weight) : Number(weight),
            consumed_weight: consumed_weight !== undefined ? Number(consumed_weight) : 0,
            created_at: new Date().toISOString()
        };

        await storage.insertReadings([reading]);
        res.json({ message: "Stock adjusted successfully", reading });
    } catch (err) {
        console.error("Error adjusting stock:", err);
        res.status(500).json({ error: "Failed to adjust stock", details: err.message });
    }
});

/**
 * POST /api/test/reset
 * Clears data for a fresh state.
 */
app.post("/api/test/reset", async (req, res) => {
    try {
        await storage.clearAllReadings();
        res.json({ message: "All stock history successfully reset." });
    } catch (err) {
        res.status(500).json({ error: "Failed to reset data", details: err.message });
    }
});

// ==========================================
// 4. SERVER START
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  Smart Hunger Monitoring Gateway running on port ${PORT}`);
    console.log(`  Storage: ${storage.getStorageStatus().mode}`);
    console.log(`  Supported Commodities: ${COMMODITIES.join(", ")}`);
    console.log(`  Monitored Shops: ${DEFAULT_SHOPS.length} shops`);
    console.log(`====================================================`);
});