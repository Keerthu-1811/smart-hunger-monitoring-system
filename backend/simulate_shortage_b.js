require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function simulateShortageB() {
    const now = new Date().toISOString();
    
    // Simulate Center B dropping to a critical level (e.g., 1.5 kg)
    // Other centers remain stable for this snapshot.
    const newB = { device_id: "Center B", weight: 1.5, created_at: now };
    const newA = { device_id: "Center A", weight: 8.0, created_at: now };
    const newC = { device_id: "Center C", weight: 6.0, created_at: now };

    const newData = [newA, newB, newC];

    console.log("Simulating shortage at Center B...");
    const { error } = await supabase.from('Food_Stock_Data').insert(newData);
    
    if (error) {
        console.error("Error inserting data:", error);
    } else {
        console.log("Successfully injected shortage state for Center B.");
    }
}

simulateShortageB();
