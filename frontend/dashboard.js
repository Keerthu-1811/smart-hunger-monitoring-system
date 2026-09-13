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
    showToast("⏳ Seeding 5 shops with 5 items (24h baseline)...");
    try {
        const res = await fetch("http://localhost:3000/api/test/seed", { method: "POST" });
        const data = await res.json();
        showToast(`✅ ${data.message}`);
        await loadData();
    } catch (e) {
        showToast(`❌ Error: ${e.message}`, true);
    }
});

document.getElementById("btnShortage").addEventListener("click", async () => {
    showToast("⏳ Injecting emergency shortage spikes...");
    try {
        const res = await fetch("http://localhost:3000/api/test/shortage", { method: "POST" });
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
        const res = await fetch("http://localhost:3000/api/test/apply-transfer", { method: "POST" });
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
        const res = await fetch("http://localhost:3000/api/test/reset", { method: "POST" });
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
// 8. BOOTSTRAP
// ==========================================
loadData();
setInterval(loadData, 5000);