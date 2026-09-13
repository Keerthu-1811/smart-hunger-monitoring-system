const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { createClient } = require("@supabase/supabase-js");

const DATA_DIR = path.join(__dirname, "data");
const LOCAL_FILE = path.join(DATA_DIR, "stock_data.json");

// Ensure local data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure local JSON file exists
if (!fs.existsSync(LOCAL_FILE)) {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify([]), "utf-8");
}

let supabase = null;
let supabaseHealthy = false;
let checkedSupabase = false;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
        });
    } catch (e) {
        console.warn("[Storage] Failed to initialize Supabase client:", e.message);
    }
}

async function checkSupabaseHealth() {
    if (!supabase) {
        supabaseHealthy = false;
        return false;
    }
    try {
        const { error } = await supabase
            .from("Food_Stock_Data")
            .select("id", { count: "exact", head: true })
            .limit(1);

        if (error) {
            console.warn(`[Storage] Supabase error (${error.message}). Falling back to local storage.`);
            supabaseHealthy = false;
        } else {
            supabaseHealthy = true;
        }
    } catch (err) {
        console.warn(`[Storage] Supabase unreachable (${err.code || err.message}). Operating in resilient Local JSON storage mode.`);
        supabaseHealthy = false;
    }
    checkedSupabase = true;
    return supabaseHealthy;
}

function readLocalData() {
    try {
        if (!fs.existsSync(LOCAL_FILE)) return [];
        const content = fs.readFileSync(LOCAL_FILE, "utf-8");
        return JSON.parse(content || "[]");
    } catch (e) {
        console.error("[Storage] Error reading local data file:", e.message);
        return [];
    }
}

function writeLocalData(data) {
    try {
        fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
        console.error("[Storage] Error writing local data file:", e.message);
    }
}

/**
 * Insert an array of readings.
 * Each reading: { device_id, item_name, weight, total_weight, consumed_weight, created_at }
 */
async function insertReadings(readings) {
    if (!Array.isArray(readings) || readings.length === 0) return { count: 0 };

    const formattedReadings = readings.map(r => ({
        device_id: r.device_id,
        item_name: r.item_name || "Rice",
        weight: Number(r.weight),
        total_weight: r.total_weight !== undefined ? Number(r.total_weight) : 0,
        consumed_weight: r.consumed_weight !== undefined ? Number(r.consumed_weight) : 0,
        created_at: r.created_at || new Date().toISOString()
    }));

    // Always mirror to local file for fast offline access and resilience
    const local = readLocalData();
    let nextId = local.length > 0 ? Math.max(...local.map(x => x.id || 0)) + 1 : 1;
    const withIds = formattedReadings.map(r => ({ id: nextId++, ...r }));
    writeLocalData([...local, ...withIds]);

    if (!checkedSupabase) {
        await checkSupabaseHealth();
    }

    if (supabaseHealthy) {
        try {
            const { error } = await supabase.from("Food_Stock_Data").insert(formattedReadings);
            if (error) {
                console.warn("[Storage] Supabase insert failed; saved locally:", error.message);
            }
        } catch (err) {
            console.warn("[Storage] Supabase insert exception; saved locally:", err.message);
            supabaseHealthy = false;
        }
    }

    return { count: formattedReadings.length, storage: supabaseHealthy ? "supabase+local" : "local-json" };
}

/**
 * Get readings created after a given ISO timestamp.
 */
async function getReadingsSince(isoTimestamp) {
    if (!checkedSupabase) {
        await checkSupabaseHealth();
    }

    if (supabaseHealthy) {
        try {
            const { data, error } = await supabase
                .from("Food_Stock_Data")
                .select("*")
                .gte("created_at", isoTimestamp)
                .order("created_at", { ascending: true });

            if (!error && Array.isArray(data) && data.length > 0) {
                return data;
            }
        } catch (err) {
            console.warn("[Storage] Error querying Supabase; using local records:", err.message);
            supabaseHealthy = false;
        }
    }

    // Local fallback query
    const targetDate = new Date(isoTimestamp).getTime();
    const local = readLocalData();
    return local
        .filter(row => new Date(row.created_at).getTime() >= targetDate)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

/**
 * Clear all data (useful for test resets).
 */
async function clearAllReadings() {
    writeLocalData([]);
    if (supabaseHealthy && supabase) {
        try {
            await supabase.from("Food_Stock_Data").delete().neq("id", 0);
        } catch (e) {
            // ignore
        }
    }
    return { success: true };
}

function getStorageStatus() {
    return {
        mode: supabaseHealthy ? "Cloud Supabase" : "Local Resilient Storage (JSON)",
        supabaseConfigured: !!(supabaseUrl && supabaseKey),
        supabaseHealthy,
        localRecordsCount: readLocalData().length
    };
}

module.exports = {
    insertReadings,
    getReadingsSince,
    clearAllReadings,
    getStorageStatus,
    checkSupabaseHealth
};
