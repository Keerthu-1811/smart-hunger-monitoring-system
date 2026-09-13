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
// 9. BOOTSTRAP
// ==========================================
loadData();
window.lookupBeneficiary("TN-PDS-1001");
setInterval(loadData, 5000);