// Smart Hunger IoT - Frontend Dashboard Logic
let currentData = null;
let activeCommodityFilter = "ALL";

const COMMODITY_ICONS = {
    "Rice": "🍚",
    "Sugar": "🍬",
    "Wheat": "🌾",
    "Toor Dal": "🥣",
    "Palm Oil": "🛢️"
};

// ==========================================
// 1. DATA FETCHING & POLLING
// ==========================================
async function loadData() {
    try {
        const response = await fetch("http://localhost:3000/api/data");
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        
        const data = await response.json();
        currentData = data;

        updateHeaderStatus(true, data.storage);
        updateSummaryMetrics(data.summary);
        renderAlerts(data.alerts);
        renderRedistributions(data.redistributions);
        renderShopsMatrix(data.shops);
    } catch (err) {
        console.error("Error fetching data:", err);
        updateHeaderStatus(false, null);
    }
}

function updateHeaderStatus(isOnline, storageInfo) {
    const connEl = document.getElementById("connectionStatus");
    const storageEl = document.getElementById("storagePill");

    if (isOnline) {
        connEl.textContent = "Gateway Online";
        connEl.style.color = "#10b981";
        if (storageInfo) {
            storageEl.textContent = `Storage: ${storageInfo.mode}`;
            storageEl.title = `Records: ${storageInfo.localRecordsCount}`;
        }
    } else {
        connEl.textContent = "Gateway Offline / Reconnecting...";
        connEl.style.color = "#f43f5e";
        storageEl.textContent = "Storage: Disconnected";
    }
}

// ==========================================
// 2. SUMMARY METRICS
// ==========================================
function updateSummaryMetrics(summary) {
    if (!summary) return;
    document.getElementById("totalShopsVal").textContent = summary.total_shops || 5;
    document.getElementById("totalItemsVal").textContent = summary.total_inventory_lines || 25;
    document.getElementById("highRiskVal").textContent = summary.high_risk_count || 0;
    document.getElementById("mediumRiskVal").textContent = summary.medium_risk_count || 0;
    document.getElementById("redistCountVal").textContent = summary.active_transfers_count || 0;

    document.getElementById("redistCounterBadge").textContent = `${summary.active_transfers_count || 0} Directives`;
    const totalAlerts = (summary.high_risk_count || 0) + (summary.medium_risk_count || 0);
    document.getElementById("alertCounterBadge").textContent = `${totalAlerts} Active`;
}

// ==========================================
// 3. ALERTS RENDERING
// ==========================================
function renderAlerts(alerts) {
    const container = document.getElementById("alertsListContainer");
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="empty-state">✅ No active alerts. All commodities at safe levels.</div>';
        return;
    }

    container.innerHTML = alerts.map(a => {
        const isHigh = a.type === "HIGH RISK";
        const icon = COMMODITY_ICONS[a.item] || "📦";
        return `
            <div class="alert-card ${isHigh ? 'high-risk' : 'medium-risk'}">
                <div class="alert-header">
                    <span class="item-chip">${icon} ${a.item}</span>
                    <span class="alert-type-badge ${isHigh ? 'high' : 'medium'}">${a.type}</span>
                </div>
                <div class="alert-msg"><strong>${a.shop}:</strong> ${a.message}</div>
            </div>
        `;
    }).join('');
}

// ==========================================
// 4. REDISTRIBUTION RECOMMENDATIONS
// ==========================================
function renderRedistributions(redists) {
    const container = document.getElementById("redistListContainer");
    if (!redists || redists.length === 0) {
        container.innerHTML = '<div class="empty-state">No transfers needed. Inventory balances are currently optimal.</div>';
        return;
    }

    container.innerHTML = redists.map(r => {
        const icon = COMMODITY_ICONS[r.item] || "📦";
        return `
            <div class="redist-card">
                <div class="redist-card-top">
                    <span class="item-chip">${icon} ${r.item}</span>
                    <span class="redist-amount">${r.amount} ${r.unit}</span>
                </div>
                <div class="redist-flow">
                    <span>${r.source_shop}</span>
                    <span class="redist-arrow">➔</span>
                    <span>${r.target_shop}</span>
                </div>
                <div class="redist-reason">${r.reason}</div>
                <button class="btn-apply-single" onclick="applySingleTransfer('${escapeStr(r.source_shop)}', '${escapeStr(r.target_shop)}', '${escapeStr(r.item)}', ${r.amount})">
                    ⚡ Apply Transfer Now
                </button>
            </div>
        `;
    }).join('');
}

function escapeStr(str) {
    return (str || '').replace(/'/g, "\\'");
}

// ==========================================
// 5. MULTI-SHOP COMMODITY MATRIX
// ==========================================
function renderShopsMatrix(shops) {
    const container = document.getElementById("shopsContainer");
    if (!shops || shops.length === 0) {
        container.innerHTML = '<div class="empty-state">No inventory data available. Use the simulator above to seed baseline data.</div>';
        return;
    }

    container.innerHTML = shops.map(shop => {
        // Filter items based on active tab
        const filteredItems = shop.items.filter(item => {
            if (activeCommodityFilter === "ALL") return true;
            return item.item_name.toLowerCase() === activeCommodityFilter.toLowerCase();
        });

        if (filteredItems.length === 0) return '';

        // Shop high risk count
        const highCount = shop.items.filter(i => i.risk_level === "HIGH RISK").length;
        const mediumCount = shop.items.filter(i => i.risk_level === "MEDIUM RISK").length;

        let shopStatusBadge = '<span class="status-badge status-NORMAL">All Safe</span>';
        if (highCount > 0) {
            shopStatusBadge = `<span class="status-badge status-HIGH">${highCount} Critical</span>`;
        } else if (mediumCount > 0) {
            shopStatusBadge = `<span class="status-badge status-MEDIUM">${mediumCount} Warning</span>`;
        }

        const itemsHtml = filteredItems.map(item => {
            const icon = COMMODITY_ICONS[item.item_name] || "📦";
            const currentWeight = item.current_weight !== null ? item.current_weight : '--';
            const safeBuffer = item.safe_buffer || 5;
            const targetLevel = item.target_level || (safeBuffer + 3);

            // Calculate progress percent (max at 100%)
            const percent = item.current_weight !== null ? Math.min(100, Math.round((item.current_weight / (targetLevel * 1.5)) * 100)) : 0;
            
            let barColor = "#10b981"; // green
            let riskClass = "status-NORMAL";
            let boxBorderClass = "";

            if (item.risk_level === "HIGH RISK") {
                barColor = "#f43f5e";
                riskClass = "status-HIGH";
                boxBorderClass = "high-risk";
            } else if (item.risk_level === "MEDIUM RISK") {
                barColor = "#fbbf24";
                riskClass = "status-MEDIUM";
                boxBorderClass = "medium-risk";
            }

            return `
                <div class="item-box ${boxBorderClass}">
                    <div class="item-box-top">
                        <span class="item-name">${icon} ${item.item_name}</span>
                        <span class="status-badge ${riskClass}">${item.risk_level}</span>
                    </div>

                    <div class="item-weight-display">
                        <span class="weight-val">${currentWeight}</span>
                        <span class="weight-unit">${item.unit}</span>
                    </div>

                    <div class="weight-progress-bg">
                        <div class="weight-progress-bar" style="width: ${percent}%; background-color: ${barColor};"></div>
                    </div>

                    <div class="item-metrics-sub">
                        <div class="sub-metric">
                            <span class="sub-metric-lbl">Daily Total</span>
                            <span class="sub-metric-val">${item.total_weight} ${item.unit}</span>
                        </div>
                        <div class="sub-metric">
                            <span class="sub-metric-lbl">Consumed</span>
                            <span class="sub-metric-val">${item.consumed_weight} ${item.unit}</span>
                        </div>
                        <div class="sub-metric">
                            <span class="sub-metric-lbl">Recent Velocity</span>
                            <span class="sub-metric-val">${item.consumption_rate} ${item.unit}</span>
                        </div>
                        <div class="sub-metric">
                            <span class="sub-metric-lbl">Safe Min</span>
                            <span class="sub-metric-val">${safeBuffer} ${item.unit}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="shop-card">
                <div class="shop-card-header">
                    <div class="shop-name">
                        <span>🏬</span>
                        <span>${shop.shop_id}</span>
                    </div>
                    <div class="shop-status-summary">
                        ${shopStatusBadge}
                    </div>
                </div>
                <div class="items-grid">
                    ${itemsHtml}
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// 6. FILTER TAB HANDLERS
// ==========================================
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeCommodityFilter = btn.dataset.item;
        if (currentData) {
            renderShopsMatrix(currentData.shops);
        }
    });
});

// ==========================================
// 7. SIMULATION & TESTING CONTROLS
// ==========================================
function showToast(msg, isError = false) {
    const toast = document.getElementById("simToast");
    toast.textContent = msg;
    toast.style.color = isError ? "#f43f5e" : "#38bdf8";
    toast.style.borderColor = isError ? "rgba(244, 63, 94, 0.4)" : "rgba(56, 189, 248, 0.3)";
}

document.getElementById("btnSeed").addEventListener("click", async () => {
    showToast("⏳ Seeding 5 shops with 5 items (Healthy Baseline)...");
    try {
        const res = await fetch("http://localhost:3000/api/test/seed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const data = await res.json();
        showToast(`✅ ${data.message}`);
        await loadData();
    } catch (e) {
        showToast(`❌ Error: ${e.message}`, true);
    }
});

document.getElementById("btnShortage").addEventListener("click", async () => {
    showToast("⏳ Injecting emergency shortage spikes across 5 commodities...");
    try {
        const res = await fetch("http://localhost:3000/api/test/shortage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const data = await res.json();
        showToast(`🚨 ${data.message}`);
        await loadData();
    } catch (e) {
        showToast(`❌ Error: ${e.message}`, true);
    }
});

document.getElementById("btnApplyAll").addEventListener("click", async () => {
    showToast("⏳ Executing recommended redistribution transfers...");
    try {
        const res = await fetch("http://localhost:3000/api/test/apply-transfer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const data = await res.json();
        showToast(`🚚 ${data.message}`);
        await loadData();
    } catch (e) {
        showToast(`❌ Error: ${e.message}`, true);
    }
});

document.getElementById("btnReset").addEventListener("click", async () => {
    if (!confirm("Are you sure you want to reset all inventory records?")) return;
    showToast("⏳ Resetting all stock data...");
    try {
        const res = await fetch("http://localhost:3000/api/test/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const data = await res.json();
        showToast(`🔄 ${data.message}`);
        await loadData();
    } catch (e) {
        showToast(`❌ Error: ${e.message}`, true);
    }
});

// Single Transfer Execution
window.applySingleTransfer = async function(source_shop, target_shop, item_name, amount) {
    showToast(`⏳ Transferring ${amount} of ${item_name} from ${source_shop} to ${target_shop}...`);
    try {
        const res = await fetch("http://localhost:3000/api/test/apply-transfer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source_shop, target_shop, item_name, amount })
        });
        const data = await res.json();
        showToast(`✅ ${data.message}`);
        await loadData();
    } catch (e) {
        showToast(`❌ Transfer failed: ${e.message}`, true);
    }
};

// Custom Injection
document.getElementById("btnInject").addEventListener("click", async () => {
    const shop = document.getElementById("injectShopSelect").value;
    const item = document.getElementById("injectItemSelect").value;
    const weight = parseFloat(document.getElementById("injectWeightInput").value);

    if (isNaN(weight) || weight < 0) {
        showToast("Please enter a valid non-negative weight.", true);
        return;
    }

    showToast(`⏳ Injecting ${weight} kg/L for ${item} at ${shop}...`);
    try {
        const res = await fetch("http://localhost:3000/api/test/adjust", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: shop, item_name: item, weight: weight })
        });
        const data = await res.json();
        showToast(`✅ Stock updated: ${shop} -> ${item} = ${weight}`);
        await loadData();
    } catch (e) {
        showToast(`❌ Error: ${e.message}`, true);
    }
});

// Toggle Simulator Panel
document.getElementById("toggleSimBtn").addEventListener("click", () => {
    const body = document.getElementById("simulatorBody");
    const btn = document.getElementById("toggleSimBtn");
    if (body.style.display === "none") {
        body.style.display = "block";
        btn.textContent = "Hide Controls";
    } else {
        body.style.display = "none";
        btn.textContent = "Show Controls";
    }
});

// ==========================================
// 8. MODULE M1: BENEFICIARY ENTITLEMENT LOOKUP
// ==========================================
window.lookupBeneficiary = async function(cardNo) {
    const input = document.getElementById("cardLookupInput");
    if (cardNo) input.value = cardNo;
    const targetCard = (input.value || "TN-PDS-1001").trim();

    const container = document.getElementById("beneficiaryCardContainer");
    container.innerHTML = `<p class="empty-state">⏳ Fetching entitlement records for ${targetCard}...</p>`;

    try {
        const res = await fetch(`http://localhost:3000/api/beneficiaries/${encodeURIComponent(targetCard)}`);
        if (!res.ok) {
            const errData = await res.json();
            container.innerHTML = `<div class="empty-state" style="color: #f43f5e;">❌ ${errData.error || 'Beneficiary record not found.'}</div>`;
            return;
        }

        const b = await res.json();

        // Build Quota Boxes for all 5 Commodities
        const commoditiesList = ["Rice", "Sugar", "Wheat", "Toor Dal", "Palm Oil"];
        const quotaHtml = commoditiesList.map(item => {
            const icon = COMMODITY_ICONS[item] || "📦";
            const unit = item === "Palm Oil" ? "L" : "kg";
            const quota = b.monthly_quota ? (b.monthly_quota[item] || 0) : 0;
            const lifted = b.current_month_lifted ? (b.current_month_lifted[item] || 0) : 0;
            const remaining = b.remaining_quota ? (b.remaining_quota[item] !== undefined ? b.remaining_quota[item] : quota) : quota;

            const percent = quota > 0 ? Math.min(100, Math.round((remaining / quota) * 100)) : 100;
            const barColor = percent > 50 ? "#10b981" : (percent > 20 ? "#fbbf24" : "#f43f5e");

            return `
                <div class="quota-box">
                    <span class="quota-item-title">${icon} ${item}</span>
                    <div class="quota-remaining-val">${remaining} <span style="font-size: 0.75rem; color: #94a3b8;">${unit} left</span></div>
                    <div class="weight-progress-bg">
                        <div class="weight-progress-bar" style="width: ${percent}%; background-color: ${barColor};"></div>
                    </div>
                    <div class="quota-numbers">
                        <span>Quota: <strong>${quota} ${unit}</strong></span>
                        <span>Lifted: <strong>${lifted} ${unit}</strong></span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="beneficiary-card">
                <div class="beneficiary-header">
                    <div>
                        <h3 class="ben-head-name">${b.family_head_name}</h3>
                        <div class="ben-card-meta">
                            <span>💳 Ration Card: <strong style="color: #fff;">${b.ration_card_no}</strong></span>
                            <span>🔒 Aadhaar: •••• ${b.aadhaar_last4}</span>
                            <span>👨‍👩‍👧‍👦 Family: ${b.family_members_count} Members</span>
                        </div>
                        <div style="margin-top: 0.35rem; font-size: 0.82rem; color: #38bdf8;">
                            🏬 Registered Center: <strong>${b.assigned_shop_id}</strong>
                        </div>
                    </div>
                    <div>
                        <span class="card-badge ${b.card_type}">${b.card_type} Quota</span>
                    </div>
                </div>

                <div>
                    <h4 style="margin: 0 0 0.85rem; font-size: 0.9rem; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.04em;">
                        📋 Monthly Commodity Quotas & Current Balance
                    </h4>
                    <div class="quota-grid">
                        ${quotaHtml}
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color: #f43f5e;">❌ Network error: ${e.message}</div>`;
    }
};

document.getElementById("btnLookupCard").addEventListener("click", () => {
    window.lookupBeneficiary();
});

document.getElementById("cardLookupInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") window.lookupBeneficiary();
});

// Full Registry Toggle
let registryLoaded = false;
document.getElementById("btnToggleRegistry").addEventListener("click", async () => {
    const wrap = document.getElementById("registryTableContainer");
    const btn = document.getElementById("btnToggleRegistry");

    if (wrap.style.display === "none") {
        wrap.style.display = "block";
        btn.textContent = "Hide Beneficiary Registry";
        if (!registryLoaded) {
            await loadBeneficiariesRegistry();
            registryLoaded = true;
        }
    } else {
        wrap.style.display = "none";
        btn.textContent = "Show Full 5-Shop Beneficiary Registry (12 Households)";
    }
});

async function loadBeneficiariesRegistry() {
    const container = document.getElementById("registryTableContainer");
    try {
        const res = await fetch("http://localhost:3000/api/beneficiaries");
        const data = await res.json();

        if (!data.beneficiaries || data.beneficiaries.length === 0) {
            container.innerHTML = '<p class="empty-state">No beneficiaries found.</p>';
            return;
        }

        const rows = data.beneficiaries.map(b => `
            <tr>
                <td><strong>${b.ration_card_no}</strong></td>
                <td>${b.family_head_name}</td>
                <td><span class="card-badge ${b.card_type}">${b.card_type}</span></td>
                <td>${b.assigned_shop_id}</td>
                <td>${b.family_members_count}</td>
                <td>•••• ${b.aadhaar_last4}</td>
                <td>
                    ${b.monthly_quota.Rice}kg Rice • ${b.monthly_quota.Sugar}kg Sugar • ${b.monthly_quota.Wheat}kg Wheat
                </td>
                <td>
                    <button class="btn-chip" onclick="lookupBeneficiary('${b.ration_card_no}')">Inspect</button>
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <table class="registry-table">
                <thead>
                    <tr>
                        <th>Ration Card No.</th>
                        <th>Head of Family</th>
                        <th>Card Type</th>
                        <th>Assigned Shop</th>
                        <th>Family</th>
                        <th>Aadhaar</th>
                        <th>Key Quota</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    } catch (e) {
        container.innerHTML = `<p class="empty-state" style="color: #f43f5e;">Failed to load registry: ${e.message}</p>`;
    }
}

// ==========================================
// 9. MODULE M2 & M3 HARDWARE REPLICATORS + 3-WAY VERIFICATION (M4)
// ==========================================

let currentStationBeneficiary = null;

async function initStation() {
    try {
        const res = await fetch("http://localhost:3000/api/beneficiaries");
        const data = await res.json();
        const select = document.getElementById("dispenseCardSelect");
        if (!select) return;

        select.innerHTML = (data.beneficiaries || []).map(b => `
            <option value="${b.ration_card_no}">
                ${b.ration_card_no} - ${b.family_head_name} (${b.card_type})
            </option>
        `).join('');

        await onStationBeneficiaryChange();
        updateScaleDisplay(document.getElementById("m2WeightInput").value);
        updateVisionClassifierDisplay();
    } catch (e) {
        console.error("Error initializing verification station:", e);
    }
}

window.onStationBeneficiaryChange = async function() {
    const select = document.getElementById("dispenseCardSelect");
    if (!select) return;
    const cardNo = select.value;

    try {
        const res = await fetch(`http://localhost:3000/api/beneficiaries/${encodeURIComponent(cardNo)}`);
        if (!res.ok) return;
        currentStationBeneficiary = await res.json();

        document.getElementById("stHeadName").innerText = currentStationBeneficiary.family_head_name || "-";
        const typeBadge = document.getElementById("stCardType");
        typeBadge.innerText = currentStationBeneficiary.card_type || "-";
        typeBadge.className = `card-badge ${currentStationBeneficiary.card_type || ''}`;
        document.getElementById("stShopName").innerText = currentStationBeneficiary.assigned_shop_id || "-";

        updateStationQuotaPill();
    } catch (e) {
        console.error("Error updating station beneficiary:", e);
    }
};

window.onStationCommodityChange = function() {
    const item = document.getElementById("dispenseCommoditySelect").value;
    const unit = item === "Palm Oil" ? "L" : "KG";
    document.getElementById("lcdUnit").innerText = unit;
    updateStationQuotaPill();
};

function updateStationQuotaPill() {
    if (!currentStationBeneficiary) return;
    const item = document.getElementById("dispenseCommoditySelect").value;
    const unit = item === "Palm Oil" ? "L" : "kg";
    const rem = currentStationBeneficiary.remaining_quota?.[item] !== undefined
        ? currentStationBeneficiary.remaining_quota[item]
        : (currentStationBeneficiary.monthly_quota?.[item] || 0);
    document.getElementById("stQuotaVal").innerText = `${rem} ${unit}`;
}

// --- M2 Load Cell Scale Simulator ---
window.updateScaleDisplay = function(val) {
    const num = parseFloat(val);
    const digitsEl = document.getElementById("scaleDisplayDigits");
    if (isNaN(num) || num < 0) {
        digitsEl.innerText = "ERR.00";
        digitsEl.style.color = "#ef4444";
    } else {
        const formatted = (num < 10 ? "0" : "") + num.toFixed(2);
        digitsEl.innerText = formatted;
        digitsEl.style.color = "#34d399";
    }
};

window.setStationWeight = function(w) {
    const input = document.getElementById("m2WeightInput");
    input.value = w.toFixed(1);
    updateScaleDisplay(w);
};

window.tareScale = function() {
    const input = document.getElementById("m2WeightInput");
    input.value = "0.0";
    updateScaleDisplay(0.0);
};

// --- M3 AI Vision Classifier Simulator ---
window.updateVisionClassifierDisplay = function() {
    const item = document.getElementById("m3VisionSelect").value;
    const slider = document.getElementById("m3ConfidenceSlider");
    const conf = slider ? slider.value : 99;
    const label = document.getElementById("camOverlayLabel");
    const box = document.querySelector(".bounding-box");

    if (label) {
        label.innerText = `${item} [${conf}.0%]`;
    }

    if (box) {
        if (item.includes("Foreign") || item.includes("Obscured")) {
            box.style.borderColor = "#ef4444";
            box.style.background = "rgba(239, 68, 68, 0.15)";
            if (label) label.style.background = "#ef4444";
        } else {
            box.style.borderColor = "#a855f7";
            box.style.background = "rgba(168, 85, 247, 0.08)";
            if (label) label.style.background = "#a855f7";
        }
    }
};

window.syncVisionWithClaim = function() {
    const claim = document.getElementById("dispenseCommoditySelect").value;
    const visionSelect = document.getElementById("m3VisionSelect");
    if (visionSelect) {
        visionSelect.value = claim;
        updateVisionClassifierDisplay();
    }
};

// --- 1-Click Test Presets ---
window.loadTestPreset = async function(type) {
    const cardSelect = document.getElementById("dispenseCardSelect");
    const itemSelect = document.getElementById("dispenseCommoditySelect");
    const visionSelect = document.getElementById("m3VisionSelect");

    if (type === "VALID") {
        cardSelect.value = "TN-PDS-1001";
        await onStationBeneficiaryChange();
        itemSelect.value = "Rice";
        onStationCommodityChange();
        setStationWeight(5.0);
        visionSelect.value = "Rice";
        updateVisionClassifierDisplay();
    } else if (type === "VISION_MISMATCH") {
        cardSelect.value = "TN-PDS-1001";
        await onStationBeneficiaryChange();
        itemSelect.value = "Rice";
        onStationCommodityChange();
        setStationWeight(5.0);
        visionSelect.value = "Sugar"; // Intentional camera fraud simulation
        updateVisionClassifierDisplay();
    } else if (type === "QUOTA_EXCEEDED") {
        cardSelect.value = "TN-PDS-1003"; // NPHH card: only 12kg quota
        await onStationBeneficiaryChange();
        itemSelect.value = "Rice";
        onStationCommodityChange();
        setStationWeight(30.0); // 30kg exceeds 12kg quota
        visionSelect.value = "Rice";
        updateVisionClassifierDisplay();
    } else if (type === "ZERO_WEIGHT") {
        cardSelect.value = "TN-PDS-1001";
        await onStationBeneficiaryChange();
        itemSelect.value = "Rice";
        onStationCommodityChange();
        tareScale(); // 0.0 weight
        visionSelect.value = "Rice";
        updateVisionClassifierDisplay();
    }

    // Auto-run verification check to demonstrate result
    await runThreeWayVerification();
};

// --- 3-Way Rule Engine Verification ---
window.runThreeWayVerification = async function() {
    const payload = getStationPayload();
    const verdictBox = document.getElementById("verificationVerdictContainer");
    verdictBox.style.display = "block";
    verdictBox.innerHTML = `<p class="empty-state">⏳ Running 3-way cross-verification checks...</p>`;

    try {
        const res = await fetch("http://localhost:3000/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        renderVerdict(data);
    } catch (e) {
        verdictBox.innerHTML = `<div class="violation-box">❌ Verification request failed: ${e.message}</div>`;
    }
};

window.executePdsDispense = async function() {
    const payload = getStationPayload();
    const verdictBox = document.getElementById("verificationVerdictContainer");
    verdictBox.style.display = "block";
    verdictBox.innerHTML = `<p class="empty-state">⏳ Processing transaction through cryptographic pipeline...</p>`;

    try {
        const res = await fetch("http://localhost:3000/api/dispense", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        renderVerdict(data.verification, data);

        // Refresh all connected dashboard panels
        await loadData();
        await onStationBeneficiaryChange();
        if (window.lookupBeneficiary) {
            window.lookupBeneficiary(payload.card_no);
        }
        await loadAuditTransactions();
    } catch (e) {
        verdictBox.innerHTML = `<div class="violation-box">❌ Dispense failed: ${e.message}</div>`;
    }
};

function getStationPayload() {
    const card_no = document.getElementById("dispenseCardSelect").value;
    const claimed_commodity = document.getElementById("dispenseCommoditySelect").value;
    const measured_weight = parseFloat(document.getElementById("m2WeightInput").value) || 0;
    const vision_commodity = document.getElementById("m3VisionSelect").value;
    const vision_confidence = parseFloat(document.getElementById("m3ConfidenceSlider").value) || 99;
    const shop_id = currentStationBeneficiary?.assigned_shop_id || "Shop 1 (Central Hub)";

    return {
        card_no,
        shop_id,
        claimed_commodity,
        claimed_amount: measured_weight,
        measured_weight,
        vision_commodity,
        vision_confidence
    };
}

function renderVerdict(v, txResult = null) {
    const verdictBox = document.getElementById("verificationVerdictContainer");
    const isApproved = v.verified;

    verdictBox.className = `verdict-container ${isApproved ? 'approved' : 'flagged'}`;

    const checks = v.checks || {};
    const checkItem = (name, pass, text) => `
        <div class="check-item ${pass ? 'pass' : 'fail'}">
            <span>${pass ? '✅' : '❌'}</span>
            <div>
                <strong>${name}</strong>
                <div style="font-size: 0.7rem; opacity: 0.85;">${text}</div>
            </div>
        </div>
    `;

    const checksHtml = `
        <div class="verdict-checks-grid">
            ${checkItem("M3 Vision Match", checks.vision_match, checks.vision_match ? "Camera agrees with claim" : "Visual mismatch / fraud")}
            ${checkItem("M1 Quota Limit", checks.quota_valid, checks.quota_valid ? "Within monthly entitlement" : "Exceeds monthly quota")}
            ${checkItem("M2 Scale Reading", checks.weight_valid, checks.weight_valid ? "Valid physical weight" : "Zero / invalid scale reading")}
            ${checkItem("Shop Inventory", checks.stock_available, checks.stock_available ? "Sufficient store balance" : "Store inventory depleted")}
        </div>
    `;

    let violationsHtml = "";
    if (v.violations && v.violations.length > 0) {
        violationsHtml = `
            <div class="violation-box">
                <strong>🚨 Identified Rule Violations:</strong>
                ${v.violations.map(vi => `<div>• <strong>[${vi.rule}]</strong>: ${vi.message}</div>`).join('')}
            </div>
        `;
    }

    let txStatusMsg = "";
    if (txResult) {
        txStatusMsg = isApproved
            ? `<div style="margin-top: 0.75rem; font-weight: 700; color: #10b981;">🎉 ${txResult.message} (Logged in SHA-256 Ledger: ${txResult.transaction?.id})</div>`
            : `<div style="margin-top: 0.75rem; font-weight: 700; color: #fb7185;">⚠️ ${txResult.message} (Security Alert logged: ${txResult.transaction?.id})</div>`;
    }

    verdictBox.innerHTML = `
        <div class="verdict-header">
            <span class="verdict-title">
                ${isApproved ? '✅ TRANSACTION VERIFIED & APPROVED' : '🚨 TRANSACTION FLAGGED BY 3-WAY RULE ENGINE'}
            </span>
            <span class="col-tag ${isApproved ? 'm2-tag' : 'm1-tag'}">
                ${isApproved ? 'STATUS: APPROVED' : 'STATUS: FLAGGED'}
            </span>
        </div>
        ${checksHtml}
        ${violationsHtml}
        ${txStatusMsg}
    `;
}

// ==========================================
// 10. MODULE M5: SHA-256 AUDIT LOG VIEWER
// ==========================================
window.loadAuditTransactions = async function() {
    const container = document.getElementById("transactionsTableContainer");
    const badge = document.getElementById("chainIntegrityBadge");

    try {
        const res = await fetch("http://localhost:3000/api/transactions");
        const data = await res.json();

        // Update Chain Integrity Badge
        if (data.chain_integrity?.valid) {
            badge.className = "chain-status-badge";
            badge.innerHTML = `<span class="status-dot green"></span> Chain Intact (${data.chain_integrity.count} Blocks)`;
        } else {
            badge.className = "chain-status-badge broken";
            badge.innerHTML = `<span class="status-dot" style="background: #f43f5e;"></span> Chain Broken! Tamper Detected`;
        }

        if (!data.transactions || data.transactions.length === 0) {
            container.innerHTML = '<p class="empty-state">No transaction records in ledger yet. Perform a dispense above to mint the first block.</p>';
            return;
        }

        const rows = data.transactions.map(tx => {
            const time = new Date(tx.timestamp).toLocaleTimeString();
            const isApproved = tx.status === "APPROVED";
            const statusBadge = isApproved
                ? `<span class="status-badge status-NORMAL">APPROVED</span>`
                : `<span class="status-badge status-HIGH">FLAGGED</span>`;

            return `
                <tr>
                    <td><strong>${tx.id}</strong><br><span style="font-size: 0.68rem; color: #64748b;">${time}</span></td>
                    <td><strong>${tx.card_no}</strong><br><span style="font-size: 0.72rem; color: #94a3b8;">${tx.beneficiary_name}</span></td>
                    <td>${tx.shop_id}</td>
                    <td><strong>${tx.claimed_commodity}</strong></td>
                    <td><strong style="color: #38bdf8;">${tx.measured_weight}</strong></td>
                    <td>${tx.vision_commodity} <span style="font-size: 0.68rem; color: #a855f7;">(${tx.vision_confidence}%)</span></td>
                    <td>${statusBadge}</td>
                    <td>
                        <span class="hash-chip" title="SHA-256 Current Hash: ${tx.current_hash}">${tx.current_hash.substring(0, 16)}...</span><br>
                        <span style="font-size: 0.65rem; color: #64748b;">Prev: ${tx.prev_hash.substring(0, 10)}...</span>
                    </td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <table class="audit-table">
                <thead>
                    <tr>
                        <th>TX ID / Time</th>
                        <th>Beneficiary</th>
                        <th>Shop</th>
                        <th>Claimed</th>
                        <th>Scale (M2)</th>
                        <th>Vision (M3)</th>
                        <th>Verdict</th>
                        <th>SHA-256 Chained Hash</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    } catch (e) {
        container.innerHTML = `<p class="empty-state" style="color: #f43f5e;">Failed to load audit log: ${e.message}</p>`;
    }
};

window.clearAuditLog = async function() {
    if (!confirm("Are you sure you want to clear the entire SHA-256 transaction audit log?")) return;
    try {
        await fetch("http://localhost:3000/api/transactions/clear", { method: "POST" });
        await loadAuditTransactions();
    } catch (e) {
        alert("Failed to clear log: " + e.message);
    }
};

// ==========================================
// 11. BOOTSTRAP
// ==========================================
loadData();
window.lookupBeneficiary("TN-PDS-1001");
initStation();
loadAuditTransactions();
setInterval(loadData, 5000);