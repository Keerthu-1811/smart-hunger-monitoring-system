require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function injectLiveData() {
    const now = new Date().toISOString();
    
    // We are going to simulate new live readings that drastically change the state.
    
    // Center A goes from 5kg -> 2kg (Now Critical)
    const newA = { device_id: "Center A", weight: 2, created_at: now };
    
    // Center B goes from 15kg -> 12kg (Still surplus, but drop)
    const newB = { device_id: "Center B", weight: 12, created_at: now };
    
    // Center C gets refilled! 2kg -> 14kg (Now Surplus)
    const newC = { device_id: "Center C", weight: 14, created_at: now };

    const newData = [newA, newB, newC];

    console.log("Injecting live real-time data to trigger dashboard refresh...");
    const { error } = await supabase.from('Food_Stock_Data').insert(newData);
    
    if (error) {
        console.error("Error inserting live data:", error);
    } else {
        console.log("Successfully injected live data.");
    }
}

injectLiveData();
