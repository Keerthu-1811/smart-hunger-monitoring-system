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
        investigation_status: entry.status === "FLAGGED" ? "PENDING_REVIEW" : "VERIFIED_NORMAL",
        officer_notes: "",
        prev_hash: prevHash,
        current_hash: ""
    };

    txRecord.current_hash = calculateHash(prevHash, txRecord);

    list.push(txRecord);
    writeTransactions(list);

    return txRecord;
}

/**
 * Returns all transactions with optional filtering and pagination
 */
function getAllTransactions(filter = {}) {
    let list = readTransactions();

    if (filter.status) {
        list = list.filter(t => t.status.toUpperCase() === filter.status.toUpperCase());
    }
    if (filter.shop_id) {
        list = list.filter(t => t.shop_id.toLowerCase().includes(filter.shop_id.toLowerCase().trim()));
    }
    if (filter.search) {
        const q = filter.search.toLowerCase().trim();
        list = list.filter(t =>
            t.card_no.toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q) ||
            t.beneficiary_name.toLowerCase().includes(q) ||
            t.claimed_commodity.toLowerCase().includes(q)
        );
    }

    const limit = Number(filter.limit || 50);
    return list.slice(-limit).reverse();
}

/**
 * Get single transaction by ID with full cryptographic verification breakdown
 */
function getTransactionById(txId) {
    const list = readTransactions();
    const index = list.findIndex(t => t.id === txId);
    if (index === -1) return null;

    const tx = list[index];
    const computedHash = calculateHash(tx.prev_hash, tx);
    const isValid = computedHash === tx.current_hash;

    const canonicalString = `${tx.prev_hash}|${tx.id}|${tx.timestamp}|${tx.card_no}|${tx.shop_id}|${tx.claimed_commodity}|${tx.measured_weight}|${tx.vision_commodity}|${tx.status}`;

    return {
        ...tx,
        chain_index: index,
        canonical_string: canonicalString,
        computed_hash: computedHash,
        hash_valid: isValid
    };
}

/**
 * MODULE M6: Inspecting Officer Case Management
 * Updates investigation notes and resolution status without altering the immutable physical dispense hash.
 */
function updateInvestigation(txId, status, notes) {
    const list = readTransactions();
    const tx = list.find(t => t.id === txId);
    if (!tx) return { success: false, error: "Transaction not found" };

    if (status) tx.investigation_status = status;
    if (notes !== undefined) tx.officer_notes = notes;
    tx.investigated_at = new Date().toISOString();

    writeTransactions(list);
    return { success: true, transaction: tx };
}

/**
 * MODULE M5/M6: Demonstration of Cryptographic Tamper Detection
 * Intentionally alters the payload of a past block in transactions.json without updating hashes.
 */
let backupForRepair = null;

function tamperWithTransaction(targetIndex = null) {
    const list = readTransactions();
    if (list.length === 0) {
        return { success: false, error: "No transactions in ledger to tamper with." };
    }

    backupForRepair = JSON.parse(JSON.stringify(list));

    const idx = targetIndex !== null && targetIndex >= 0 && targetIndex < list.length
        ? targetIndex
        : Math.max(0, list.length - 2); // Tamper with penultimate block or genesis

    const targetTx = list[idx];
    const originalWeight = targetTx.measured_weight;
    const tamperedWeight = originalWeight + 15.0; // Forge weight

    // Directly alter recorded weight in raw ledger file (simulating malicious database edit)
    targetTx.measured_weight = tamperedWeight;
    writeTransactions(list);

    return {
        success: true,
        tampered_index: idx,
        tampered_tx_id: targetTx.id,
        original_weight: originalWeight,
        tampered_weight: tamperedWeight,
        message: `Simulated malicious database modification on TX ${targetTx.id} at block index ${idx}! Weight changed from ${originalWeight}kg to ${tamperedWeight}kg.`
    };
}

/**
 * Repairs / restores chain after tamper demonstration
 */
function repairChain() {
    if (backupForRepair && Array.isArray(backupForRepair)) {
        writeTransactions(backupForRepair);
        backupForRepair = null;
        return { success: true, message: "Ledger restored from pre-tamper snapshot. Hash chain verified intact." };
    }

    // Otherwise recalculate valid hash chain
    const list = readTransactions();
    let prev = GENESIS_HASH;
    for (const tx of list) {
        tx.prev_hash = prev;
        tx.current_hash = calculateHash(prev, tx);
        prev = tx.current_hash;
    }
    writeTransactions(list);
    return { success: true, message: "Ledger cryptographic signatures re-anchored. Hash chain intact." };
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
                message: `Hash chain broken at index ${i} (TX: ${tx.id})! Expected prev_hash: ${expectedPrevHash.substring(0, 16)}..., found: ${tx.prev_hash.substring(0, 16)}...`
            };
        }

        // Recompute current hash
        const computed = calculateHash(expectedPrevHash, tx);
        if (computed !== tx.current_hash) {
            return {
                valid: false,
                tampered_at_index: i,
                tampered_tx_id: tx.id,
                message: `Data tampering detected at index ${i} (TX: ${tx.id})! Current hash (${tx.current_hash.substring(0, 16)}...) does not match canonical payload calculation (${computed.substring(0, 16)}...).`
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
 * Get count of flagged transactions in ledger
 */
function getFlaggedCount() {
    const list = readTransactions();
    return list.filter(t => t.status === "FLAGGED").length;
}

/**
 * Clear all transactions
 */
function clearTransactions() {
    writeTransactions([]);
    backupForRepair = null;
    return { success: true, count: 0 };
}

module.exports = {
    verifyThreeWayAgreement,
    recordTransaction,
    getAllTransactions,
    getTransactionById,
    updateInvestigation,
    tamperWithTransaction,
    repairChain,
    verifyChainIntegrity,
    getFlaggedCount,
    clearTransactions,
    GENESIS_HASH
};
