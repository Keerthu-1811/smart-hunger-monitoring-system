require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function seed() {
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    
    // Create data for Center A: Sudden Drop (Medium Risk)
    // Starts at 12kg, drops slowly, then suddenly drops below 6kg
    let centerAData = [
        { device_id: "Center A", weight: 12, created_at: new Date(now - 10 * hour).toISOString() },
        { device_id: "Center A", weight: 11, created_at: new Date(now - 8 * hour).toISOString() },
        { device_id: "Center A", weight: 10, created_at: new Date(now - 6 * hour).toISOString() },
        { device_id: "Center A", weight: 4, created_at: new Date(now - 1 * hour).toISOString() } // Sudden drop
    ];

    // Create data for Center B: Surplus
    // Stays well above 10kg
    let centerBData = [
        { device_id: "Center B", weight: 18, created_at: new Date(now - 10 * hour).toISOString() },
        { device_id: "Center B", weight: 17, created_at: new Date(now - 5 * hour).toISOString() },
        { device_id: "Center B", weight: 15, created_at: new Date(now).toISOString() }
    ];

    // Create data for Center C: Critical Shortage (High Risk)
    // Drops below 3kg
    let centerCData = [
        { device_id: "Center C", weight: 8, created_at: new Date(now - 10 * hour).toISOString() },
        { device_id: "Center C", weight: 5, created_at: new Date(now - 5 * hour).toISOString() },
        { device_id: "Center C", weight: 2, created_at: new Date(now).toISOString() }
    ];

    const allData = [...centerAData, ...centerBData, ...centerCData];

    console.log("Inserting test data...");
    const { error } = await supabase.from('Food_Stock_Data').insert(allData);
    
    if (error) {
        console.error("Error inserting data:", error);
    } else {
        console.log("Successfully seeded mock data.");
    }
}

seed();
