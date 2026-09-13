const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const beneficiaries = require("./beneficiaries");

const DATA_DIR = path.join(__dirname, "data");
const TRANSACTIONS_FILE = path.join(DATA_DIR, "transactions.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

function readTransactions() {
    try {
        if (!fs.existsSync(TRANSACTIONS_FILE)) {
            return [];
        }
        const data = fs.readFileSync(TRANSACTIONS_FILE, "utf-8");
        return JSON.parse(data || "[]");
    } catch (e) {
        console.error("[Transactions] Error reading file:", e.message);
        return [];
    }
}

function writeTransactions(data) {
    try {
        fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
        console.error("[Transactions] Error writing file:", e.message);
    }
}

/**
 * Computes SHA-256 hash of previous hash + canonical transaction data string
 */
function calculateHash(prevHash, txData) {
    const canonicalString = `${prevHash}|${txData.id}|${txData.timestamp}|${txData.card_no}|${txData.shop_id}|${txData.claimed_commodity}|${txData.measured_weight}|${txData.vision_commodity}|${txData.status}`;
    return crypto.createHash("sha256").update(canonicalString).digest("hex");
}

/**
 * MODULE M4: 3-Way Rule Engine
 * Verifies consistency across:
 * 1. M1: Beneficiary Quota Entitlement
 * 2. M2: Physical Scale Weight
 * 3. M3: AI Vision Classifier
 * 4. Shop Inventory Availability
 */
function verifyThreeWayAgreement(params, shopCurrentStock = 999) {
    const {
        card_no,
        shop_id,
        claimed_commodity,
        claimed_amount,
        measured_weight,
        vision_commodity,
        vision_confidence = 99.0
    } = params;

    const violations = [];
    const checks = {
        vision_match: false,
        quota_valid: false,
        weight_valid: false,
        stock_available: false
    };

    // 1. Resolve Beneficiary (M1)
    const beneficiary = beneficiaries.getBeneficiaryByCard(card_no);
    if (!beneficiary) {
        violations.push({
            rule: "BENEFICIARY_NOT_FOUND",
            severity: "CRITICAL",
            message: `Ration Card '${card_no}' is not registered in the PDS registry.`
        });
    }

    const quota = beneficiary?.monthly_quota?.[claimed_commodity] || 0;
    const lifted = beneficiary?.current_month_lifted?.[claimed_commodity] || 0;
    const remainingQuota = Math.max(0, Number((quota - lifted).toFixed(1)));

    // 2. Physical Scale Weight Check (M2)
    const weight = Number(measured_weight);
    if (isNaN(weight) || weight <= 0) {
        violations.push({
            rule: "INVALID_WEIGHT_READING",
            severity: "HIGH",
            message: `Scale weight reading must be greater than 0. Measured: ${weight} kg/L.`
        });
    } else if (weight > 50) {
        violations.push({
            rule: "EXCESSIVE_SINGLE_TRANSACTION",
            severity: "MEDIUM",
            message: `Scale reading ${weight} kg exceeds maximum single dispense safety threshold (50 kg).`
        });
    } else {
        checks.weight_valid = true;
    }

    // 3. AI Vision Classifier Agreement Check (M3)
    const normClaim = (claimed_commodity || "").trim().toLowerCase();
    const normVision = (vision_commodity || "").trim().toLowerCase();

    if (normClaim && normVision && normClaim === normVision) {
        checks.vision_match = true;
    } else {
        violations.push({
            rule: "COMMODITY_MISMATCH",
            severity: "CRITICAL",
            message: `Visual Fraud Alert! Optical classifier detected '${vision_commodity || "Unknown"}' (${vision_confidence}%), but claimed commodity is '${claimed_commodity}'.`
        });
    }

    // 4. Beneficiary Entitlement Quota Check (M1 vs M2)
    if (beneficiary) {
        if (weight > remainingQuota + 0.05) { // 0.05kg tolerance for digital scale drift
            violations.push({
                rule: "EXCEEDS_MONTHLY_QUOTA",
                severity: "CRITICAL",
                message: `Household entitlement exceeded! Remaining quota for ${claimed_commodity} is ${remainingQuota} kg/L, but ${weight} kg/L is placed on scale.`
            });
        } else {
            checks.quota_valid = true;
        }
    }

    // 5. Shop Inventory Check
    if (shopCurrentStock !== undefined && shopCurrentStock !== null) {
        if (weight > shopCurrentStock) {
            violations.push({
                rule: "INSUFFICIENT_SHOP_INVENTORY",
                severity: "HIGH",
                message: `${shop_id} only has ${shopCurrentStock.toFixed(1)} of ${claimed_commodity} in stock (requested: ${weight.toFixed(1)}).`
            });
        } else {
            checks.stock_available = true;
        }
    } else {
        checks.stock_available = true;
    }

    const isVerified = violations.length === 0;

    return {
        verified: isVerified,
        status: isVerified ? "APPROVED" : "FLAGGED",
        checks,
        violations,
        beneficiary_summary: beneficiary ? {
            name: beneficiary.family_head_name,
            card_type: beneficiary.card_type,
            monthly_quota: quota,
            current_lifted: lifted,
            remaining_quota: remainingQuota
        } : null
    };
}

/**
 * MODULE M5: Tamper-Evident SHA-256 Chained Hash Log
 * Appends a new verified or flagged transaction to the local cryptographic chain.
 */
function recordTransaction(entry) {
    const list = readTransactions();
    const prevHash = list.length > 0 ? list[list.length - 1].current_hash : GENESIS_HASH;

    const id = `TX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const timestamp = new Date().toISOString();

    const txRecord = {
        id,
        timestamp,
        card_no: entry.card_no,
        beneficiary_name: entry.beneficiary_name || "Unknown",
        shop_id: entry.shop_id,
        claimed_commodity: entry.claimed_commodity,
        claimed_amount: Number(entry.claimed_amount || entry.measured_weight),
        measured_weight: Number(entry.measured_weight),
        vision_commodity: entry.vision_commodity,
        vision_confidence: Number(entry.vision_confidence || 99.0),
        status: entry.status || "APPROVED",
        violations: entry.violations || [],
        prev_hash: prevHash,
        current_hash: ""
    };

    txRecord.current_hash = calculateHash(prevHash, txRecord);

    list.push(txRecord);
    writeTransactions(list);

    return txRecord;
}

/**
 * Returns all transactions with pagination/limit
 */
function getAllTransactions(limit = 50) {
    const list = readTransactions();
    return list.slice(-limit).reverse();
}

/**
 * MODULE M5 Integrity Verification
 * Re-computes the entire SHA-256 hash chain from genesis block to check for tampering.
 */
function verifyChainIntegrity() {
    const list = readTransactions();
    if (list.length === 0) {
        return { valid: true, count: 0, message: "Chain is empty (Genesis state)." };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < list.length; i++) {
        const tx = list[i];

        // Check if prev_hash matches
        if (tx.prev_hash !== expectedPrevHash) {
            return {
                valid: false,
                tampered_at_index: i,
                tampered_tx_id: tx.id,
                message: `Hash chain broken at index ${i} (TX: ${tx.id}). Expected prev_hash: ${expectedPrevHash}, found: ${tx.prev_hash}`
            };
        }

        // Recompute current hash
        const computed = calculateHash(expectedPrevHash, tx);
        if (computed !== tx.current_hash) {
            return {
                valid: false,
                tampered_at_index: i,
                tampered_tx_id: tx.id,
                message: `Data tampering detected at index ${i} (TX: ${tx.id})! Current hash does not match payload.`
            };
        }

        expectedPrevHash = tx.current_hash;
    }

    return {
        valid: true,
        count: list.length,
        latest_hash: expectedPrevHash,
        message: `Hash chain intact across all ${list.length} transaction records.`
    };
}

/**
 * Clear all transactions
 */
function clearTransactions() {
    writeTransactions([]);
    return { success: true, count: 0 };
}

module.exports = {
    verifyThreeWayAgreement,
    recordTransaction,
    getAllTransactions,
    verifyChainIntegrity,
    clearTransactions,
    GENESIS_HASH
};
