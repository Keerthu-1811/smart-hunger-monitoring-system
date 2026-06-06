const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(bodyParser.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_KEY. Please provide them in a .env file.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// API to receive data from ESP32
app.post("/api/fooddata", async (req, res) => {
    const data = req.body;
    
    const { device_id, weight, total_weight, consumed_weight } = data;
    
    if (!device_id || weight === undefined) {
         return res.status(400).json({ error: "Missing device_id or weight in payload" });
    }

    const { error } = await supabase
        .from('Food_Stock_Data')
        .insert([{ 
            device_id, 
            weight, 
            total_weight: total_weight !== undefined ? total_weight : 0, 
            consumed_weight: consumed_weight !== undefined ? consumed_weight : 0 
        }]);

    if (error) {
        console.error("Error inserting data into Supabase:", error);
        return res.status(500).json({ error: "Failed to store data" });
    }

    console.log("Data stored in Supabase successfully:", data);
    res.json({message: "Data stored successfully"});
});

// API to send data to dashboard
app.get("/api/data", async (req, res) => {
    // Fetch data from the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: rawData, error } = await supabase
        .from('Food_Stock_Data')
        .select('*')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Error fetching data from Supabase:", error);
        return res.status(500).json({ error: "Failed to fetch data" });
    }

    // Group by device_id
    const groupedData = {};
    rawData.forEach(reading => {
        if (!groupedData[reading.device_id]) {
            groupedData[reading.device_id] = [];
        }
        groupedData[reading.device_id].push(reading);
    });

    const centers = [];
    const alerts = [];
    const surpluses = [];
    const deficits = [];

    for (const [deviceId, readings] of Object.entries(groupedData)) {
        if (readings.length === 0) continue;
        
        const latestReading = readings[readings.length - 1];
        const currentWeight = latestReading.weight;
        const totalWeight = latestReading.total_weight || 0;
        const consumedWeight = latestReading.consumed_weight || 0;
        
        // Calculate Consumption Rate (difference between last two readings)
        let currentConsumptionRate = 0;
        if (readings.length >= 2) {
            const previousReading = readings[readings.length - 2];
            currentConsumptionRate = previousReading.weight > currentWeight ? previousReading.weight - currentWeight : 0;
        }

        // Calculate Average Consumption over last 24h
        let totalDrop = 0;
        let dropCount = 0;
        for (let i = 1; i < readings.length; i++) {
            const diff = readings[i - 1].weight - readings[i].weight;
            if (diff > 0) {
                totalDrop += diff;
                dropCount++;
            }
        }
        const avgConsumption = dropCount > 0 ? (totalDrop / dropCount) : 0;

        // We use the 24h average consumption to dynamically set safety thresholds
        // Minimum buffer is 3kg. Target safe level is (avgConsumption + 3kg)
        const safeBuffer = Math.max(3, avgConsumption); 
        const targetLevel = safeBuffer + 2; // Extra buffer after redistribution

        // Hunger Risk Prediction
        let riskLevel = "NORMAL";
        if (currentWeight <= safeBuffer) {
            riskLevel = "HIGH RISK";
            alerts.push(`Critical shortage at ${deviceId}. Current stock: ${currentWeight} kg.`);
        } else if (currentConsumptionRate > avgConsumption && currentWeight <= targetLevel) {
            riskLevel = "MEDIUM RISK";
            alerts.push(`Rapid consumption detected at ${deviceId}. Risk level elevated.`);
        }

        // Redistribution Logic Buckets
        if (currentWeight > targetLevel && riskLevel === "NORMAL") {
            surpluses.push({ deviceId, weight: currentWeight, available: currentWeight - targetLevel }); 
        } else if (currentWeight < safeBuffer) {
            deficits.push({ deviceId, weight: currentWeight, needed: targetLevel - currentWeight }); 
        }

        centers.push({
            device_id: deviceId,
            current_weight: currentWeight,
            total_weight: totalWeight,
            consumed_weight: consumedWeight,
            consumption_rate: currentConsumptionRate.toFixed(2),
            avg_consumption: avgConsumption.toFixed(2),
            risk_level: riskLevel,
            history: readings
        });
    }

    // Map Surplus to Deficit (Dynamic Redistribution Algorithm)
    const redistributions = [];
    for (const deficit of deficits) {
        for (const surplus of surpluses) {
            if (surplus.available > 0 && deficit.needed > 0) {
                const amountToMove = Math.min(surplus.available, deficit.needed);
                redistributions.push(`Move ${amountToMove.toFixed(2)} kg from ${surplus.deviceId} to ${deficit.deviceId}`);
                surplus.available -= amountToMove;
                deficit.needed -= amountToMove;
            }
        }
    }

    res.json({ centers, alerts, redistributions });
});

// START SERVER
app.listen(3000, () => {
    console.log("Server running on port 3000");
});