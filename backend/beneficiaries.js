const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const DATA_DIR = path.join(__dirname, "data");
const BENEFICIARIES_FILE = path.join(DATA_DIR, "beneficiaries.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Standard PDS Card Types in India:
// AAY: Antyodaya Anna Yojana (Poorest households, highest quota)
// PHH: Priority Household (Standard subsidy quota)
// NPHH: Non-Priority Household (Basic quota)

const INITIAL_BENEFICIARIES = [
    // Shop 1 (Central Hub)
    {
        ration_card_no: "TN-PDS-1001",
        family_head_name: "Muthu Kumar S",
        aadhaar_last4: "4821",
        card_type: "AAY",
        assigned_shop_id: "Shop 1 (Central Hub)",
        family_members_count: 5,
        monthly_quota: { "Rice": 35.0, "Sugar": 5.0, "Wheat": 10.0, "Toor Dal": 2.0, "Palm Oil": 2.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },
    {
        ration_card_no: "TN-PDS-1002",
        family_head_name: "Lakshmi Narayanan",
        aadhaar_last4: "9312",
        card_type: "PHH",
        assigned_shop_id: "Shop 1 (Central Hub)",
        family_members_count: 4,
        monthly_quota: { "Rice": 20.0, "Sugar": 3.0, "Wheat": 8.0, "Toor Dal": 1.5, "Palm Oil": 1.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },
    {
        ration_card_no: "TN-PDS-1003",
        family_head_name: "Karthik Raja V",
        aadhaar_last4: "5540",
        card_type: "NPHH",
        assigned_shop_id: "Shop 1 (Central Hub)",
        family_members_count: 3,
        monthly_quota: { "Rice": 12.0, "Sugar": 2.0, "Wheat": 5.0, "Toor Dal": 1.0, "Palm Oil": 1.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },

    // Shop 2 (North Market)
    {
        ration_card_no: "TN-PDS-2001",
        family_head_name: "Selvi Shanmugam",
        aadhaar_last4: "7189",
        card_type: "AAY",
        assigned_shop_id: "Shop 2 (North Market)",
        family_members_count: 6,
        monthly_quota: { "Rice": 35.0, "Sugar": 5.0, "Wheat": 10.0, "Toor Dal": 2.0, "Palm Oil": 2.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },
    {
        ration_card_no: "TN-PDS-2002",
        family_head_name: "Rajesh Kannan M",
        aadhaar_last4: "3491",
        card_type: "PHH",
        assigned_shop_id: "Shop 2 (North Market)",
        family_members_count: 4,
        monthly_quota: { "Rice": 20.0, "Sugar": 4.0, "Wheat": 8.0, "Toor Dal": 1.5, "Palm Oil": 1.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },
    {
        ration_card_no: "TN-PDS-2003",
        family_head_name: "Meenakshi Sundaram",
        aadhaar_last4: "8820",
        card_type: "PHH",
        assigned_shop_id: "Shop 2 (North Market)",
        family_members_count: 3,
        monthly_quota: { "Rice": 15.0, "Sugar": 3.0, "Wheat": 6.0, "Toor Dal": 1.0, "Palm Oil": 1.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },

    // Shop 3 (South Depot)
    {
        ration_card_no: "TN-PDS-3001",
        family_head_name: "Arumugam P",
        aadhaar_last4: "1945",
        card_type: "AAY",
        assigned_shop_id: "Shop 3 (South Depot)",
        family_members_count: 5,
        monthly_quota: { "Rice": 35.0, "Sugar": 5.0, "Wheat": 10.0, "Toor Dal": 2.0, "Palm Oil": 2.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },
    {
        ration_card_no: "TN-PDS-3002",
        family_head_name: "Priya Balakrishnan",
        aadhaar_last4: "6234",
        card_type: "PHH",
        assigned_shop_id: "Shop 3 (South Depot)",
        family_members_count: 4,
        monthly_quota: { "Rice": 20.0, "Sugar": 4.0, "Wheat": 8.0, "Toor Dal": 1.5, "Palm Oil": 1.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },

    // Shop 4 (East District)
    {
        ration_card_no: "TN-PDS-4001",
        family_head_name: "Govindaraj T",
        aadhaar_last4: "8712",
        card_type: "PHH",
        assigned_shop_id: "Shop 4 (East District)",
        family_members_count: 4,
        monthly_quota: { "Rice": 20.0, "Sugar": 3.0, "Wheat": 8.0, "Toor Dal": 1.5, "Palm Oil": 1.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },
    {
        ration_card_no: "TN-PDS-4002",
        family_head_name: "Kavitha Ramesh",
        aadhaar_last4: "4098",
        card_type: "AAY",
        assigned_shop_id: "Shop 4 (East District)",
        family_members_count: 5,
        monthly_quota: { "Rice": 35.0, "Sugar": 5.0, "Wheat": 10.0, "Toor Dal": 2.0, "Palm Oil": 2.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },

    // Shop 5 (West Center)
    {
        ration_card_no: "TN-PDS-5001",
        family_head_name: "Suresh Babu K",
        aadhaar_last4: "5123",
        card_type: "PHH",
        assigned_shop_id: "Shop 5 (West Center)",
        family_members_count: 4,
        monthly_quota: { "Rice": 20.0, "Sugar": 4.0, "Wheat": 8.0, "Toor Dal": 1.5, "Palm Oil": 1.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    },
    {
        ration_card_no: "TN-PDS-5002",
        family_head_name: "Deepa Natarajan",
        aadhaar_last4: "7631",
        card_type: "NPHH",
        assigned_shop_id: "Shop 5 (West Center)",
        family_members_count: 3,
        monthly_quota: { "Rice": 12.0, "Sugar": 2.0, "Wheat": 5.0, "Toor Dal": 1.0, "Palm Oil": 1.0 },
        current_month_lifted: { "Rice": 0.0, "Sugar": 0.0, "Wheat": 0.0, "Toor Dal": 0.0, "Palm Oil": 0.0 },
        status: "ACTIVE"
    }
];

function readBeneficiaries() {
    try {
        if (!fs.existsSync(BENEFICIARIES_FILE)) {
            writeBeneficiaries(INITIAL_BENEFICIARIES);
            return INITIAL_BENEFICIARIES;
        }
        const data = fs.readFileSync(BENEFICIARIES_FILE, "utf-8");
        const parsed = JSON.parse(data || "[]");
        if (parsed.length === 0) {
            writeBeneficiaries(INITIAL_BENEFICIARIES);
            return INITIAL_BENEFICIARIES;
        }
        return parsed;
    } catch (e) {
        console.error("[Beneficiaries] Error reading file:", e.message);
        return INITIAL_BENEFICIARIES;
    }
}

function writeBeneficiaries(data) {
    try {
        fs.writeFileSync(BENEFICIARIES_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
        console.error("[Beneficiaries] Error writing file:", e.message);
    }
}

/**
 * Fetch all beneficiaries
 */
function getAllBeneficiaries() {
    return readBeneficiaries();
}

/**
 * Fetch single beneficiary by Ration Card No. (case-insensitive)
 */
function getBeneficiaryByCard(cardNo) {
    if (!cardNo) return null;
    const cleanNo = cardNo.trim().toUpperCase();
    const list = readBeneficiaries();
    return list.find(b => b.ration_card_no.toUpperCase() === cleanNo) || null;
}

/**
 * Fetch beneficiaries assigned to a specific shop
 */
function getBeneficiariesByShop(shopId) {
    const list = readBeneficiaries();
    if (!shopId) return list;
    return list.filter(b => b.assigned_shop_id.toLowerCase().includes(shopId.toLowerCase().trim()));
}

/**
 * Update lifted quota when a beneficiary receives commodities
 */
function updateLiftedQuota(cardNo, item, amount) {
    const list = readBeneficiaries();
    const beneficiary = list.find(b => b.ration_card_no.toUpperCase() === cardNo.trim().toUpperCase());
    if (!beneficiary) return { success: false, error: "Beneficiary not found" };

    if (!beneficiary.current_month_lifted) {
        beneficiary.current_month_lifted = { "Rice": 0, "Sugar": 0, "Wheat": 0, "Toor Dal": 0, "Palm Oil": 0 };
    }

    const currentLifted = Number(beneficiary.current_month_lifted[item] || 0);
    const quota = Number(beneficiary.monthly_quota[item] || 0);
    const added = Number(amount);
    const newLifted = currentLifted + added;

    beneficiary.current_month_lifted[item] = Number(newLifted.toFixed(1));
    writeBeneficiaries(list);

    return {
        success: true,
        beneficiary,
        remaining_quota: Math.max(0, Number((quota - newLifted).toFixed(1)))
    };
}

/**
 * Add / Refill monthly quota for a beneficiary
 */
function addCustomerQuota(cardNo, item, amount) {
    const list = readBeneficiaries();
    const beneficiary = list.find(b => b.ration_card_no.toUpperCase() === cardNo.trim().toUpperCase());
    if (!beneficiary) return { success: false, error: "Beneficiary not found" };

    if (!beneficiary.monthly_quota) {
        beneficiary.monthly_quota = { "Rice": 20, "Sugar": 5, "Wheat": 10, "Toor Dal": 2, "Palm Oil": 2 };
    }
    if (!beneficiary.current_month_lifted) {
        beneficiary.current_month_lifted = { "Rice": 0, "Sugar": 0, "Wheat": 0, "Toor Dal": 0, "Palm Oil": 0 };
    }

    const currentQuota = Number(beneficiary.monthly_quota[item] || 0);
    const newQuota = Number((currentQuota + Number(amount)).toFixed(1));
    beneficiary.monthly_quota[item] = newQuota;

    writeBeneficiaries(list);

    const lifted = Number(beneficiary.current_month_lifted[item] || 0);
    return {
        success: true,
        beneficiary,
        new_quota: newQuota,
        remaining_quota: Math.max(0, Number((newQuota - lifted).toFixed(1)))
    };
}

/**
 * Reset lifted amounts for a specific beneficiary (e.g. month rollover or replenishment)
 */
function resetCustomerLifted(cardNo) {
    const list = readBeneficiaries();
    const beneficiary = list.find(b => b.ration_card_no.toUpperCase() === cardNo.trim().toUpperCase());
    if (!beneficiary) return { success: false, error: "Beneficiary not found" };

    beneficiary.current_month_lifted = { "Rice": 0, "Sugar": 0, "Wheat": 0, "Toor Dal": 0, "Palm Oil": 0 };
    writeBeneficiaries(list);
    return { success: true, beneficiary };
}

/**
 * Reset beneficiaries to initial state
 */
function resetBeneficiaries() {
    writeBeneficiaries(INITIAL_BENEFICIARIES);
    return INITIAL_BENEFICIARIES;
}

module.exports = {
    getAllBeneficiaries,
    getBeneficiaryByCard,
    getBeneficiariesByShop,
    updateLiftedQuota,
    addCustomerQuota,
    resetCustomerLifted,
    resetBeneficiaries
};
