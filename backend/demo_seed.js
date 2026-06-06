/**
 * Demo Seed Script - via Local Server
 * Posts sample data through the running Node backend at localhost:3000
 * to demonstrate Normal and High Risk scenarios.
 */

const BASE = "http://localhost:3000/api/fooddata";

async function post(data) {
    const res = await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    return json;
}

async function seed() {
    console.log("=== Seeding demo data via local server ===\n");

    // ─── CENTER A: NORMAL (Healthy stock, moderate consumption) ───
    console.log("Inserting Center A data (NORMAL mode)...");
    const centerA = [
        { total_weight: 100, consumed_weight: 0,  weight: 100 },
        { total_weight: 100, consumed_weight: 5,  weight: 95  },
        { total_weight: 100, consumed_weight: 10, weight: 90  },
        { total_weight: 100, consumed_weight: 15, weight: 85  },
        { total_weight: 100, consumed_weight: 20, weight: 80  },
        { total_weight: 100, consumed_weight: 25, weight: 75  },
        { total_weight: 100, consumed_weight: 30, weight: 70  },
    ];

    for (const step of centerA) {
        await post({ device_id: "Center A", ...step });
        console.log(`  Center A -> weight: ${step.weight} kg`);
    }

    // ─── CENTER B: HIGH RISK (Stock critically low) ───
    console.log("\nInserting Center B data (HIGH RISK mode)...");
    const centerB = [
        { total_weight: 50, consumed_weight: 0,  weight: 50 },
        { total_weight: 50, consumed_weight: 10, weight: 40 },
        { total_weight: 50, consumed_weight: 20, weight: 30 },
        { total_weight: 50, consumed_weight: 30, weight: 20 },
        { total_weight: 50, consumed_weight: 38, weight: 12 },
        { total_weight: 50, consumed_weight: 43, weight: 7  },
        { total_weight: 50, consumed_weight: 46, weight: 4  },
        { total_weight: 50, consumed_weight: 48, weight: 2  },
    ];

    for (const step of centerB) {
        await post({ device_id: "Center B", ...step });
        console.log(`  Center B -> weight: ${step.weight} kg`);
    }

    console.log("\n=== Done! ===");
    console.log("  Center A: NORMAL    (70 kg remaining, steady consumption)");
    console.log("  Center B: HIGH RISK (2 kg remaining, rapid consumption)");
    console.log("\nRefresh the dashboard at http://localhost:5000 to see it.");
}

seed().catch(err => console.error("Error:", err));
