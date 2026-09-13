const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const storage = require("./storage");
const beneficiaries = require("./beneficiaries");

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

/**
 * Core Analytics and Matchmaking Calculation Engine
 */
function computeAnalyticsAndTransfers(rawData) {
    // Group data by [shop_id][item_name]
    const grouped = {};
    for (const row of rawData) {
        const shop = normalizeShop(row.device_id);
        const item = normalizeCommodity(row.item_name);

        if (!grouped[shop]) grouped[shop] = {};
        if (!grouped[shop][item]) grouped[shop][item] = [];
        grouped[shop][item].push(row);
    }

    const allShopKeys = Array.from(new Set([...DEFAULT_SHOPS, ...Object.keys(grouped)])).sort();

    const shopsData = [];
    const alerts = [];
    const flatItemsList = [];
    const latestWeights = {};

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

            readings.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            const latest = readings[readings.length - 1];
            const currentWeight = Number(latest.weight);
            const totalWeight = Number(latest.total_weight || 0);
            const consumedWeight = Number(latest.consumed_weight || 0);

            latestWeights[`${shopId}|${commodity}`] = currentWeight;

            // Recent consumption rate
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

    // Item-Aware Matchmaking Transfers
    const redistributions = [];
    let recId = 1;

    for (const commodity of COMMODITIES) {
        const deficits = deficitsByItem[commodity] || [];
        const surpluses = surplusesByItem[commodity] || [];

        deficits.sort((a, b) => b.needed - a.needed);
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

    const highRiskCount = flatItemsList.filter(i => i.risk_level === "HIGH RISK").length;
    const mediumRiskCount = flatItemsList.filter(i => i.risk_level === "MEDIUM RISK").length;
    const normalCount = flatItemsList.filter(i => i.risk_level === "NORMAL").length;

    return {
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
        latestWeights
    };
}

// ==========================================
// 1. INGESTION ENDPOINT: POST /api/fooddata
// ==========================================
app.post("/api/fooddata", async (req, res) => {
    try {
        const payload = req.body || [];
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
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const rawData = await storage.getReadingsSince(twentyFourHoursAgo);
        const result = computeAnalyticsAndTransfers(rawData);

        res.json({
            ...result,
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
 * Populates a 100% HEALTHY baseline (all green NORMAL) across all 5 shops and 5 commodities.
 */
app.post("/api/test/seed", async (req, res) => {
    try {
        await storage.clearAllReadings();
        const now = Date.now();
        const hour = 60 * 60 * 1000;
        const readings = [];

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

        // 4-step progressive history over 12 hours
        for (const p of healthyProfiles) {
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
            }
        }

        await storage.insertReadings(readings);
        res.json({
            message: "Successfully seeded healthy baseline across all 5 shops & 5 commodities! All systems normal.",
            totalReadings: readings.length,
            shops: healthyProfiles.map(p => p.shop),
            commodities: COMMODITIES
        });
    } catch (err) {
        console.error("Error seeding baseline:", err);
        res.status(500).json({ error: "Failed to seed baseline", details: err.message });
    }
});

/**
 * POST /api/test/shortage
 * Simulates severe emergency shortages on specific items to test alert generation and matchmaking.
 */
app.post("/api/test/shortage", async (req, res) => {
    try {
        const now = new Date().toISOString();
        const shortageReadings = [
            // Shop 3: Rice drops to 4.0 kg (Safe min: 10 kg), Toor Dal drops to 2.0 kg (Safe min: 5 kg)
            { device_id: "Shop 3 (South Depot)", item_name: "Rice", weight: 4.0, total_weight: 80, consumed_weight: 76, created_at: now },
            { device_id: "Shop 3 (South Depot)", item_name: "Toor Dal", weight: 2.0, total_weight: 40, consumed_weight: 38, created_at: now },
            // Shop 4: Sugar drops to 2.5 kg (Safe min: 5 kg)
            { device_id: "Shop 4 (East District)", item_name: "Sugar", weight: 2.5, total_weight: 45, consumed_weight: 42.5, created_at: now },
            // Shop 5: Wheat drops to 3.5 kg (Safe min: 8 kg), Palm Oil drops to 1.5 L (Safe min: 5 L)
            { device_id: "Shop 5 (West Center)", item_name: "Wheat", weight: 3.5, total_weight: 65, consumed_weight: 61.5, created_at: now },
            { device_id: "Shop 5 (West Center)", item_name: "Palm Oil", weight: 1.5, total_weight: 40, consumed_weight: 38.5, created_at: now }
        ];

        await storage.insertReadings(shortageReadings);
        res.json({
            message: "Emergency shortage spikes injected across 5 commodities! Critical alerts and transfer recommendations generated.",
            shortagesTriggered: shortageReadings
        });
    } catch (err) {
        console.error("Error simulating shortage:", err);
        res.status(500).json({ error: "Failed to simulate shortage", details: err.message });
    }
});

/**
 * POST /api/test/apply-transfer
 * Executes redistribution transfers: supports single transfer OR all active recommendations.
 */
app.post("/api/test/apply-transfer", async (req, res) => {
    try {
        const body = req.body || {};
        const { source_shop, target_shop, item_name, amount } = body;
        const now = new Date().toISOString();

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const rawData = await storage.getReadingsSince(twentyFourHoursAgo);

        // CASE A: Execute Single Specified Transfer
        if (source_shop && target_shop && item_name && amount) {
            const srcReadings = rawData.filter(r => normalizeShop(r.device_id) === normalizeShop(source_shop) && normalizeCommodity(r.item_name) === normalizeCommodity(item_name));
            const tgtReadings = rawData.filter(r => normalizeShop(r.device_id) === normalizeShop(target_shop) && normalizeCommodity(r.item_name) === normalizeCommodity(item_name));

            const srcCurrent = srcReadings.length > 0 ? Number(srcReadings[srcReadings.length - 1].weight) : 50;
            const tgtCurrent = tgtReadings.length > 0 ? Number(tgtReadings[tgtReadings.length - 1].weight) : 0;

            const transferAmt = Number(amount);
            const newSrcWeight = Math.max(0, Number((srcCurrent - transferAmt).toFixed(1)));
            const newTgtWeight = Number((tgtCurrent + transferAmt).toFixed(1));

            await storage.insertReadings([
                { device_id: source_shop, item_name, weight: newSrcWeight, created_at: now },
                { device_id: target_shop, item_name, weight: newTgtWeight, created_at: now }
            ]);

            return res.json({
                message: `Applied transfer of ${transferAmt} ${item_name} from ${source_shop} to ${target_shop}.`,
                appliedCount: 1,
                source_new_weight: newSrcWeight,
                target_new_weight: newTgtWeight
            });
        }

        // CASE B: Execute ALL Active Recommended Transfers via Matchmaking Engine
        const analytics = computeAnalyticsAndTransfers(rawData);
        const { redistributions } = analytics;

        if (!redistributions || redistributions.length === 0) {
            return res.json({
                message: "No active transfers needed. All commodities are already at or above safe threshold levels.",
                appliedCount: 0
            });
        }

        // Apply every active transfer recommendation
        const updates = [];
        const runningWeights = { ...analytics.latestWeights };

        for (const rec of redistributions) {
            const srcKey = `${rec.source_shop}|${rec.item}`;
            const tgtKey = `${rec.target_shop}|${rec.item}`;

            const currentSrc = runningWeights[srcKey] !== undefined ? runningWeights[srcKey] : 50;
            const currentTgt = runningWeights[tgtKey] !== undefined ? runningWeights[tgtKey] : 0;

            const newSrc = Math.max(0, Number((currentSrc - rec.amount).toFixed(1)));
            const newTgt = Number((currentTgt + rec.amount).toFixed(1));

            runningWeights[srcKey] = newSrc;
            runningWeights[tgtKey] = newTgt;

            updates.push({
                device_id: rec.source_shop,
                item_name: rec.item,
                weight: newSrc,
                created_at: now
            });
            updates.push({
                device_id: rec.target_shop,
                item_name: rec.item,
                weight: newTgt,
                created_at: now
            });
        }

        if (updates.length > 0) {
            await storage.insertReadings(updates);
        }

        res.json({
            message: `Successfully executed ${redistributions.length} redistribution transfers across the network! All deficits replenished.`,
            appliedCount: redistributions.length,
            transfers: redistributions
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
        const body = req.body || {};
        const { device_id, item_name, weight, total_weight, consumed_weight } = body;
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
// 4. MODULE M1: ENTITLEMENT & BENEFICIARY API
// ==========================================

/**
 * GET /api/beneficiaries
 * List all beneficiaries (supports optional ?shop_id=... or ?card_type=...)
 */
app.get("/api/beneficiaries", (req, res) => {
    try {
        const { shop_id, card_type } = req.query;
        let list = beneficiaries.getAllBeneficiaries();

        if (shop_id) {
            list = list.filter(b => b.assigned_shop_id.toLowerCase().includes(shop_id.toLowerCase().trim()));
        }
        if (card_type) {
            list = list.filter(b => b.card_type.toLowerCase() === card_type.toLowerCase().trim());
        }

        res.json({
            count: list.length,
            beneficiaries: list
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch beneficiaries", details: err.message });
    }
});

/**
 * GET /api/beneficiaries/:cardNo
 * Fetch exact beneficiary entitlement quota, amount lifted this month, and balance remaining
 */
app.get("/api/beneficiaries/:cardNo", (req, res) => {
    try {
        const { cardNo } = req.params;
        const b = beneficiaries.getBeneficiaryByCard(cardNo);

        if (!b) {
            return res.status(404).json({ error: `Beneficiary with Ration Card '${cardNo}' not found.` });
        }

        // Calculate remaining quota for each commodity
        const remaining = {};
        COMMODITIES.forEach(item => {
            const quota = Number((b.monthly_quota && b.monthly_quota[item]) || 0);
            const lifted = Number((b.current_month_lifted && b.current_month_lifted[item]) || 0);
            remaining[item] = Math.max(0, Number((quota - lifted).toFixed(1)));
        });

        res.json({
            ...b,
            remaining_quota: remaining
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch beneficiary details", details: err.message });
    }
});

/**
 * POST /api/beneficiaries/reset
 * Resets beneficiaries list to factory defaults
 */
app.post("/api/beneficiaries/reset", (req, res) => {
    try {
        const resetList = beneficiaries.resetBeneficiaries();
        res.json({ message: "Beneficiary database reset to default state.", count: resetList.length });
    } catch (err) {
        res.status(500).json({ error: "Failed to reset beneficiaries", details: err.message });
    }
});

// ==========================================
// 5. SERVER START
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