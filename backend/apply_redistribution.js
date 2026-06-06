require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function applyRedistribution() {
    const now = new Date().toISOString();
    
    // Previous State:
    // Center A: 2kg (Needed 8kg)
    // Center B: 12kg (Had 2kg surplus)
    // Center C: 14kg (Had 4kg surplus)
    
    // Recommendation was: Move 2kg from B to A, Move 4kg from C to A
    
    // Applying redistribution:
    // Center A gets +6kg => 8kg
    const newA = { device_id: "Center A", weight: 8, created_at: now };
    
    // Center B gives -2kg => 10kg
    const newB = { device_id: "Center B", weight: 10, created_at: now };
    
    // Center C gives -4kg => 10kg.
    // User also says: "And extra 4 kg resource is consumed from Center C"
    // Center C gives -4kg and is consumed -4kg => 10kg - 4kg = 6kg
    const newC = { device_id: "Center C", weight: 6, created_at: now };

    const newData = [newA, newB, newC];

    console.log("Applying redistribution logistics and additional consumption...");
    const { error } = await supabase.from('Food_Stock_Data').insert(newData);
    
    if (error) {
        console.error("Error inserting data:", error);
    } else {
        console.log("Successfully updated post-redistribution state.");
    }
}

applyRedistribution();
