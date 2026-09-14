// Smart Hunger IoT - Frontend Dashboard Logic
let currentData = null;
let activeCommodityFilter = "ALL";
let currentRole = 'SHOP';
let activeOperatorShop = 'Shop 1 (Central Hub)';
let allBeneficiariesCache = [];

const COMMODITY_ICONS = {
    "Rice": "🍚",
    "Sugar": "🍬",
    "Wheat": "🌾",
    "Toor Dal": "🥣",
    "Palm Oil": "🛢️"
};

// ==========================================
// ROLE-BASED NAVIGATION & MULTI-VIEW ARCHITECTURE
// ==========================================
window.switchRoleView = function(role) {
    currentRole = role;

    // 1. Update tab active state
    document.querySelectorAll(".role-tab").forEach(tab => {
        if (tab.getAttribute("data-role") === role) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    // 2. Update context banner
    const badgeEl = document.getElementById("roleBadge");
    const descEl = document.getElementById("roleDesc");
    const controlsSlot = document.getElementById("roleControlsSlot");

    if (role === 'SHOP') {
        if (badgeEl) {
            badgeEl.className = "context-badge badge-shop";
            badgeEl.textContent = "🏪 Role: Ration Shop Operator";
        }
        if (descEl) {
            descEl.textContent = "Point-of-Sale counter dispensing, beneficiary quota verification, and local store inventory.";
        }
        if (controlsSlot) {
            controlsSlot.innerHTML = `
                <div class="operator-shop-picker-wrap">
                    <label for="operatorShopPicker">Operating Center:</label>
                    <select id="operatorShopPicker" onchange="onOperatorShopChange(this.value)">
                        <option value="Shop 1 (Central Hub)" ${activeOperatorShop === 'Shop 1 (Central Hub)' ? 'selected' : ''}>Shop 1 (Central Hub)</option>
                        <option value="Shop 2 (North Market)" ${activeOperatorShop === 'Shop 2 (North Market)' ? 'selected' : ''}>Shop 2 (North Market)</option>
                        <option value="Shop 3 (South Depot)" ${activeOperatorShop === 'Shop 3 (South Depot)' ? 'selected' : ''}>Shop 3 (South Depot)</option>
                        <option value="Shop 4 (East District)" ${activeOperatorShop === 'Shop 4 (East District)' ? 'selected' : ''}>Shop 4 (East District)</option>
                        <option value="Shop 5 (West Center)" ${activeOperatorShop === 'Shop 5 (West Center)' ? 'selected' : ''}>Shop 5 (West Center)</option>
                    </select>
                </div>
            `;
        }
    } else if (role === 'AUTHORITY') {
        if (badgeEl) {
            badgeEl.className = "context-badge badge-authority";
            badgeEl.textContent = "🏛️ Role: Central Civil Supplies Authority";
        }
        if (descEl) {
            descEl.textContent = "District-wide 5-shop multi-commodity monitoring, emergency shortage simulations, and autonomous redistribution.";
        }
        if (controlsSlot) {
            controlsSlot.innerHTML = `<span style="font-size: 0.82rem; color: #10b981; font-weight: 700; display: flex; align-items: center; gap: 0.4rem;">● Central Overseer Mode</span>`;
        }
    } else if (role === 'OFFICER') {
        if (badgeEl) {
            badgeEl.className = "context-badge badge-officer";
            badgeEl.textContent = "🕵️ Role: Vigilance & Inspecting Officer";
        }
        if (descEl) {
            descEl.textContent = "Cryptographic SHA-256 tamper-evident ledger validation, anomaly investigation notes, and audit drill-downs.";
        }
        if (controlsSlot) {
            controlsSlot.innerHTML = `<span style="font-size: 0.82rem; color: #f59e0b; font-weight: 700; display: flex; align-items: center; gap: 0.4rem;">● Cryptographic Auditor Mode</span>`;
        }
    }

    // 3. Toggle role views
    const viewShop = document.getElementById("viewShop");
    const viewAuth = document.getElementById("viewAuthority");
    const viewOff = document.getElementById("viewOfficer");

    if (viewShop) viewShop.style.display = role === 'SHOP' ? 'block' : 'none';
    if (viewAuth) viewAuth.style.display = role === 'AUTHORITY' ? 'block' : 'none';
    if (viewOff) viewOff.style.display = role === 'OFFICER' ? 'block' : 'none';

    // 4. Trigger target refreshes
    if (role === 'SHOP') {
        renderShopOperatorView();
    } else if (role === 'AUTHORITY') {
        loadData();
    } else if (role === 'OFFICER') {
        loadAuditTransactions();
    }
};

window.onOperatorShopChange = async function(selectedShop) {
    activeOperatorShop = selectedShop;
    
    // Update shop title in operator panel
    const titleEl = document.getElementById("opShopNameTitle");
    if (titleEl) titleEl.textContent = selectedShop;
    const labelEl = document.getElementById("opReceiptsShopLabel");
    if (labelEl) labelEl.textContent = selectedShop;

    // Filter beneficiaries to prioritize or select assigned cardholders
    await filterStationBeneficiariesByShop(selectedShop);

    // Refresh operator local inventory & receipts
    await renderShopOperatorView();
};

async function filterStationBeneficiariesByShop(shopName) {
    const select = document.getElementById("dispenseCardSelect");
    if (!select || !allBeneficiariesCache.length) return;

    const shopMatches = allBeneficiariesCache.filter(b => b.assigned_shop_id === shopName);
    const others = allBeneficiariesCache.filter(b => b.assigned_shop_id !== shopName);

    let html = "";
    if (shopMatches.length > 0) {
        html += `<optgroup label="${shopName} Registered Beneficiaries">`;
        html += shopMatches.map(b => `<option value="${b.ration_card_no}">${b.ration_card_no} - ${b.family_head_name} (${b.card_type})</option>`).join('');
        html += `</optgroup>`;
    }
    if (others.length > 0) {
        html += `<optgroup label="Other Center Registered Beneficiaries (Portability)">`;
        html += others.map(b => `<option value="${b.ration_card_no}">${b.ration_card_no} - ${b.family_head_name} (${b.card_type}) [${b.assigned_shop_id}]</option>`).join('');
        html += `</optgroup>`;
    }
    select.innerHTML = html;

    // Pick first matching cardholder
    if (shopMatches.length > 0) {
        select.value = shopMatches[0].ration_card_no;
        const lookupInput = document.getElementById("cardLookupInput");
        if (lookupInput) lookupInput.value = shopMatches[0].ration_card_no;
        if (window.lookupBeneficiary) {
            window.lookupBeneficiary(shopMatches[0].ration_card_no);
        }
    }
    await onStationBeneficiaryChange();
}

window.renderShopOperatorView = async function() {
    const grid = document.getElementById("operatorLocalStockGrid");
    const receiptsContainer = document.getElementById("operatorReceiptsTableContainer");
    if (!grid) return;

    // 1. Render Local Stock Grid for activeOperatorShop
    if (currentData && currentData.shops) {
        const shopData = currentData.shops.find(s => s.shop_name === activeOperatorShop);
        if (shopData && shopData.items) {
            grid.innerHTML = shopData.items.map(item => {
                const icon = COMMODITY_ICONS[item.item_name] || "📦";
                const riskClass = item.risk_level === "HIGH RISK" ? "high-risk" : (item.risk_level === "MEDIUM RISK" ? "medium-risk" : "safe");
                const fillClass = item.risk_level === "HIGH RISK" ? "high" : (item.risk_level === "MEDIUM RISK" ? "medium" : "safe");
                const percent = Math.min(100, Math.max(0, (item.current_weight / 250) * 100)).toFixed(0);

                return `
                    <div class="operator-item-card ${riskClass}">
                        <div class="operator-item-top">
                            <span class="operator-item-name">${icon} ${item.item_name}</span>
                            <span class="status-badge ${item.risk_level === 'HIGH RISK' ? 'status-HIGH' : (item.risk_level === 'MEDIUM RISK' ? 'status-MEDIUM' : 'status-NORMAL')}">
                                ${item.risk_level}
                            </span>
                        </div>
                        <div>
                            <span class="operator-item-weight">${item.current_weight !== null ? item.current_weight.toFixed(1) : '--'}</span>
                            <span class="operator-item-unit">${item.unit}</span>
                        </div>
                        <div class="operator-meter-bar">
                            <div class="operator-meter-fill ${fillClass}" style="width: ${percent}%;"></div>
                        </div>
                        <div class="operator-stats-row">
                            <span>Safe Buffer: <strong>${item.safe_buffer} ${item.unit}</strong></span>
                            <span>Delivered: <strong>${item.total_weight} ${item.unit}</strong></span>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            grid.innerHTML = `<p class="empty-state">No inventory metrics found for ${activeOperatorShop}.</p>`;
        }
    }

    // 2. Render Local Receipts for activeOperatorShop
    if (receiptsContainer) {
        try {
            const shortShop = activeOperatorShop.split(' ')[0] + ' ' + (activeOperatorShop.split(' ')[1] || '');
            const res = await fetch(`http://localhost:3000/api/transactions?shop_id=${encodeURIComponent(shortShop.trim())}`);
            const data = await res.json();
            const txs = data.transactions || [];

            if (txs.length === 0) {
                receiptsContainer.innerHTML = `
                    <div class="empty-state" style="padding: 1.5rem 1rem;">
                        <p>No recent dispense transactions recorded for ${activeOperatorShop}.</p>
                        <span style="font-size: 0.8rem; color: #64748b;">Execute a verified counter dispense above to log a receipt.</span>
                    </div>
                `;
            } else {
                const rows = txs.slice(0, 10).map(tx => {
                    const time = new Date(tx.timestamp).toLocaleTimeString();
                    const isApproved = tx.status === "APPROVED";
                    const isTampered = tx.is_tampered || tx.hash_valid === false;
                    const isOfficerApproved = tx.officer_resolution === "APPROVED_BY_OFFICER" || tx.investigation_status === "RESOLVED_EXPLAINED";

                    let statusBadge = "";
                    if (isTampered) {
                        statusBadge = `<span class="status-badge status-HIGH">🚨 TAMPERED</span>`;
                    } else if (isOfficerApproved && !isApproved) {
                        statusBadge = `<span class="status-badge status-NORMAL">✅ RESOLVED</span>`;
                    } else if (tx.officer_resolution === "PENALIZED_FRAUD") {
                        statusBadge = `<span class="status-badge status-HIGH">⚖️ PENALIZED</span>`;
                    } else if (isApproved) {
                        statusBadge = `<span class="status-badge status-NORMAL">APPROVED</span>`;
                    } else {
                        statusBadge = `<span class="status-badge status-HIGH">FLAGGED</span>`;
                    }

                    return `
                        <tr>
                            <td><strong style="color: #38bdf8; font-family: monospace;">${tx.id}</strong></td>
                            <td style="font-size: 0.78rem; color: #94a3b8;">${time}</td>
                            <td><strong>${tx.card_no}</strong></td>
                            <td>${COMMODITY_ICONS[tx.claimed_commodity] || '📦'} ${tx.claimed_commodity} (${tx.claimed_amount} ${tx.unit})</td>
                            <td>${statusBadge}</td>
                            <td>
                                <button class="btn-chip" onclick="openTxDrillDown('${tx.id}')">Inspect 🔍</button>
                            </td>
                        </tr>
                    `;
                }).join('');

                receiptsContainer.innerHTML = `
                    <table class="audit-table">
                        <thead>
                            <tr>
                                <th>Receipt ID</th>
                                <th>Timestamp</th>
                                <th>Beneficiary Card</th>
                                <th>Commodity Lifted</th>
                                <th>Verdict</th>
                                <th>Drill-Down</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                `;
            }
        } catch (e) {
            receiptsContainer.innerHTML = `<p class="empty-state" style="color: #f43f5e;">Failed to load shop receipts: ${e.message}</p>`;
        }
    }
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

        if (typeof renderShopOperatorView === "function") {
            renderShopOperatorView();
        }
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

                <!-- Customer Quota Management Actions -->
                <div style="margin-top: 1.25rem; padding-top: 0.85rem; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
                    <span style="font-size: 0.8rem; color: #94a3b8; font-weight: 600;">Customer Quota Actions:</span>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="btn-chip" onclick="refillCustomerQuota('${b.ration_card_no}', 'Rice', 5)">➕ Add 5kg Rice Quota</button>
                        <button class="btn-chip" onclick="refillCustomerQuota('${b.ration_card_no}', 'Sugar', 2)">➕ Add 2kg Sugar Quota</button>
                        <button class="btn-chip" style="color: #34d399; border-color: rgba(16, 185, 129, 0.4);" onclick="resetCustomerQuota('${b.ration_card_no}')">🔄 Reset Monthly Lifted</button>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div class="empty-state" style="color: #f43f5e;">❌ Network error: ${e.message}</div>`;
    }
};

window.refillCustomerQuota = async function(cardNo, item, amount) {
    showToast(`⏳ Adding ${amount} kg to ${item} quota for ${cardNo}...`);
    try {
        const res = await fetch("http://localhost:3000/api/beneficiaries/add-quota", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ card_no: cardNo, item, amount })
        });
        const data = await res.json();
        showToast(`✅ ${data.message}`);

        // Update all customer parts
        await window.lookupBeneficiary(cardNo);
        await onStationBeneficiaryChange();
        const wrap = document.getElementById("registryTableContainer");
        if (wrap && wrap.style.display !== "none") {
            await loadBeneficiariesRegistry();
        }
    } catch (e) {
        showToast(`❌ Failed to add quota: ${e.message}`, true);
    }
};

window.resetCustomerQuota = async function(cardNo) {
    showToast(`⏳ Resetting lifted amounts for ${cardNo}...`);
    try {
        const res = await fetch("http://localhost:3000/api/beneficiaries/reset-customer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ card_no: cardNo })
        });
        const data = await res.json();
        showToast(`✅ ${data.message}`);

        // Update all customer parts
        await window.lookupBeneficiary(cardNo);
        await onStationBeneficiaryChange();
        const wrap = document.getElementById("registryTableContainer");
        if (wrap && wrap.style.display !== "none") {
            await loadBeneficiariesRegistry();
        }
    } catch (e) {
        showToast(`❌ Failed to reset quota: ${e.message}`, true);
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
// 9. MODULE M2 & M3 REPLICATORS + 3-WAY VERIFICATION (M4)
// ==========================================

let currentStationBeneficiary = null;

async function initStation() {
    try {
        const res = await fetch("http://localhost:3000/api/beneficiaries");
        const data = await res.json();
        allBeneficiariesCache = data.beneficiaries || [];
        await filterStationBeneficiariesByShop(activeOperatorShop);
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
    const unit = item === "Palm Oil" ? "L" : "kg";
    const unitBadge = document.getElementById("scaleInputUnit");
    if (unitBadge) unitBadge.innerText = unit;
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

// --- M2 Weight Controls ---
window.setStationWeight = function(w) {
    const input = document.getElementById("m2WeightInput");
    if (input) input.value = w.toFixed(1);
};

window.tareScale = function() {
    const input = document.getElementById("m2WeightInput");
    if (input) input.value = "0.0";
};

// --- M3 Vision Controls ---
window.syncVisionWithClaim = function() {
    const claim = document.getElementById("dispenseCommoditySelect").value;
    const visionSelect = document.getElementById("m3VisionSelect");
    if (visionSelect) {
        visionSelect.value = claim;
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
    } else if (type === "VISION_MISMATCH") {
        cardSelect.value = "TN-PDS-1001";
        await onStationBeneficiaryChange();
        itemSelect.value = "Rice";
        onStationCommodityChange();
        setStationWeight(5.0);
        visionSelect.value = "Sugar"; // Intentional camera fraud simulation
    } else if (type === "QUOTA_EXCEEDED") {
        cardSelect.value = "TN-PDS-1003"; // NPHH card: only 12kg quota
        await onStationBeneficiaryChange();
        itemSelect.value = "Rice";
        onStationCommodityChange();
        setStationWeight(30.0); // 30kg exceeds 12kg quota
        visionSelect.value = "Rice";
    } else if (type === "ZERO_WEIGHT") {
        cardSelect.value = "TN-PDS-1001";
        await onStationBeneficiaryChange();
        itemSelect.value = "Rice";
        onStationCommodityChange();
        tareScale(); // 0.0 weight
        visionSelect.value = "Rice";
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

        // Refresh all connected dashboard panels (Stock matrix, Customer Quotas, Registry, and Audit)
        await loadData();
        await onStationBeneficiaryChange();
        if (window.lookupBeneficiary) {
            await window.lookupBeneficiary(payload.card_no);
        }
        const wrap = document.getElementById("registryTableContainer");
        if (wrap && wrap.style.display !== "none") {
            await loadBeneficiariesRegistry();
        }
        await loadAuditTransactions();
        if (typeof renderShopOperatorView === "function") {
            await renderShopOperatorView();
        }
    } catch (e) {
        verdictBox.innerHTML = `<div class="violation-box">❌ Dispense failed: ${e.message}</div>`;
    }
};

function getStationPayload() {
    const card_no = document.getElementById("dispenseCardSelect").value;
    const claimed_commodity = document.getElementById("dispenseCommoditySelect").value;
    const measured_weight = parseFloat(document.getElementById("m2WeightInput").value) || 0;
    const vision_commodity = document.getElementById("m3VisionSelect").value;
    const shop_id = activeOperatorShop || currentStationBeneficiary?.assigned_shop_id || "Shop 1 (Central Hub)";

    return {
        card_no,
        shop_id,
        claimed_commodity,
        claimed_amount: measured_weight,
        measured_weight,
        vision_commodity,
        vision_confidence: 99.0
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
// 10. MODULE M5 & M6: SHA-256 AUDIT LOG & INSPECTING OFFICER SUITE
// ==========================================
let currentAuditStatus = 'ALL';

window.setAuditStatusFilter = function(status) {
    currentAuditStatus = status;
    document.querySelectorAll(".audit-filter-btn").forEach(btn => {
        if (btn.getAttribute("data-status") === status) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    loadAuditTransactions();
};

window.loadAuditTransactions = async function() {
    const container = document.getElementById("transactionsTableContainer");
    const badge = document.getElementById("chainIntegrityBadge");
    const alertBanner = document.getElementById("chainAlertBanner");
    const flaggedBadge = document.getElementById("flaggedCountBadge");
    const shopFilter = document.getElementById("auditShopFilter")?.value || "";
    const searchFilter = document.getElementById("auditSearchInput")?.value || "";

    const params = new URLSearchParams();
    if (currentAuditStatus && currentAuditStatus !== "ALL") {
        params.append("status", currentAuditStatus);
    }
    if (shopFilter) {
        params.append("shop_id", shopFilter);
    }
    if (searchFilter) {
        params.append("search", searchFilter);
    }

    try {
        const res = await fetch(`http://localhost:3000/api/transactions?${params.toString()}`);
        const data = await res.json();

        // Update Flagged Count Badge in Filter Bar
        if (flaggedBadge) {
            flaggedBadge.innerText = data.flagged_count !== undefined ? data.flagged_count : 0;
        }

        // Update Chain Integrity Badge & Alert Banner
        if (data.chain_integrity?.valid) {
            badge.className = "chain-status-badge";
            badge.innerHTML = `<span class="status-dot green"></span> Chain Intact (${data.chain_integrity.count} Blocks)`;
            if (alertBanner) {
                alertBanner.style.display = "none";
            }
        } else {
            badge.className = "chain-status-badge broken";
            badge.innerHTML = `<span class="status-dot" style="background: #f43f5e;"></span> Chain Broken! Tamper Detected`;
            if (alertBanner) {
                alertBanner.className = "chain-alert-banner danger";
                alertBanner.style.display = "flex";
                alertBanner.innerHTML = `
                    <div style="font-size: 1.5rem; line-height: 1;">🚨</div>
                    <div>
                        <strong>SECURITY ALERT: LEDGER TAMPER DETECTED BY SHA-256 CHAIN ENGINE!</strong><br>
                        <span>${data.chain_integrity?.message || 'Data integrity verification failed across historical blocks.'}</span><br>
                        <span style="font-size: 0.75rem; opacity: 0.9;">Tampered block index: <strong>#${data.chain_integrity?.tampered_at_index ?? '-'}</strong> | Transaction: <code>${data.chain_integrity?.tampered_tx_id ?? '-'}</code></span>
                    </div>
                `;
            }
        }

        if (!data.transactions || data.transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 2.5rem 1rem;">
                    <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">No transaction records match the current filter.</p>
                    <span style="font-size: 0.8rem; color: #64748b;">Filter active: Status=${currentAuditStatus}${shopFilter ? ', Shop=' + shopFilter : ''}${searchFilter ? ', Search="' + searchFilter + '"' : ''}</span>
                </div>
            `;
            return;
        }

        const rows = data.transactions.map(tx => {
            const time = new Date(tx.timestamp).toLocaleTimeString();
            const isApproved = tx.status === "APPROVED";
            const isTampered = tx.is_tampered || tx.hash_valid === false;
            const isOfficerApproved = tx.officer_resolution === "APPROVED_BY_OFFICER" || tx.investigation_status === "RESOLVED_EXPLAINED";

            // Rule Verdict Badge: Reflects IoT check and Inspecting Officer resolution
            let statusBadge = "";
            if (isTampered) {
                statusBadge = `<span class="status-badge status-HIGH" style="background: #dc2626; color: #fff; font-weight: 800;">🚨 TAMPERED</span>`;
            } else if (isOfficerApproved && !isApproved) {
                statusBadge = `<span class="status-badge status-NORMAL" style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399;" title="Originally FLAGGED by rule engine, resolved as legitimate by Inspecting Officer">✅ RESOLVED (NORMAL)</span>`;
            } else if (tx.officer_resolution === "PENALIZED_FRAUD") {
                statusBadge = `<span class="status-badge status-HIGH" style="background: rgba(220, 38, 38, 0.2); border: 1px solid #dc2626; color: #f87171;">⚖️ PENALIZED</span>`;
            } else if (isApproved) {
                statusBadge = `<span class="status-badge status-NORMAL">APPROVED</span>`;
            } else {
                statusBadge = `<span class="status-badge status-HIGH">FLAGGED</span>`;
            }

            // Audit Status Badge: Never show "VERIFIED NORMAL" on a tampered block
            const invStatus = isTampered ? "TAMPER_DETECTED" : (tx.investigation_status || (isApproved ? "VERIFIED_NORMAL" : "PENDING_REVIEW"));
            let invBadgeClass = "normal";
            let invBadgeText = invStatus.replace(/_/g, ' ');
            if (invStatus === "TAMPER_DETECTED") {
                invBadgeClass = "tampered";
                invBadgeText = "🚨 TAMPER DETECTED";
            } else if (invStatus === "PENDING_REVIEW") {
                invBadgeClass = "pending";
                invBadgeText = "⏳ PENDING REVIEW";
            } else if (invStatus.startsWith("RESOLVED")) {
                invBadgeClass = "resolved";
                invBadgeText = invStatus === "RESOLVED_PENALIZED" ? "⚖️ PENALIZED" : "✅ RESOLVED (LEGIT)";
            } else if (invStatus === "UNDER_INVESTIGATION") {
                invBadgeClass = "investigating";
                invBadgeText = "🔍 INVESTIGATING";
            } else if (invStatus === "VERIFIED_NORMAL") {
                invBadgeClass = "normal";
                invBadgeText = "✔️ VERIFIED NORMAL";
            }

            const violationsChip = tx.violations && tx.violations.length > 0
                ? `<div style="font-size: 0.68rem; color: #fb7185; margin-top: 0.2rem;">⚠️ ${tx.violations.map(v => v.rule).join(", ")}</div>`
                : "";

            const rowHighlight = isTampered ? 'style="background: rgba(239, 68, 68, 0.12);"' : '';

            return `
                <tr ${rowHighlight} onclick="openTxModal('${tx.id}')" title="Click to view full cryptographic proof & officer notes">
                    <td>
                        <strong>${tx.id}</strong><br>
                        <span style="font-size: 0.68rem; color: #64748b;">${time}</span>
                    </td>
                    <td>
                        <strong>${tx.card_no}</strong><br>
                        <span style="font-size: 0.72rem; color: #94a3b8;">${tx.beneficiary_name}</span>
                    </td>
                    <td><span style="font-size: 0.8rem;">${tx.shop_id}</span></td>
                    <td><strong>${tx.claimed_commodity}</strong></td>
                    <td><strong style="color: #38bdf8;">${tx.measured_weight} kg/L</strong></td>
                    <td>
                        ${tx.vision_commodity}
                        <span style="font-size: 0.68rem; color: #a855f7;">(${tx.vision_confidence}%)</span>
                    </td>
                    <td>
                        ${statusBadge}
                        ${violationsChip}
                    </td>
                    <td>
                        <span class="inv-badge ${invBadgeClass}">${invBadgeText}</span>
                    </td>
                    <td>
                        <span class="hash-chip" title="SHA-256 Current Hash: ${tx.current_hash}">${tx.current_hash.substring(0, 16)}...</span><br>
                        <span style="font-size: 0.65rem; color: #64748b;">Prev: ${tx.prev_hash.substring(0, 10)}...</span>
                    </td>
                    <td>
                        <button class="btn-inspect" onclick="event.stopPropagation(); openTxModal('${tx.id}')">🔍 Inspect</button>
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
                        <th>Shop Center</th>
                        <th>Claimed</th>
                        <th>Scale (M2)</th>
                        <th>Vision (M3)</th>
                        <th>Rule Verdict</th>
                        <th>Audit Status</th>
                        <th>SHA-256 Chained Hash</th>
                        <th>Action</th>
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

// --- M6 Tamper Simulation & Repair Demo ---
window.triggerTamperDemo = async function() {
    showToast("⚠️ Injecting unauthorized data tampering into historical block...");
    try {
        const res = await fetch("http://localhost:3000/api/transactions/tamper-demo", { method: "POST" });
        const data = await res.json();
        if (data.success) {
            showToast(`🚨 Tamper simulated on Block #${data.tampered_index} (TX: ${data.tampered_tx_id})!`, true);
        } else {
            showToast(`⚠️ ${data.message || 'No records available to tamper'}`);
        }
        await loadAuditTransactions();
    } catch (e) {
        showToast(`❌ Tamper demo failed: ${e.message}`, true);
    }
};

window.triggerRepairDemo = async function() {
    showToast("⏳ Restoring ledger from verified pre-tamper snapshot...");
    try {
        const res = await fetch("http://localhost:3000/api/transactions/repair-demo", { method: "POST" });
        const data = await res.json();
        showToast(`🛡️ ${data.message}`);
        await loadAuditTransactions();
    } catch (e) {
        showToast(`❌ Repair failed: ${e.message}`, true);
    }
};

// --- M6 Inspecting Officer Drill-Down Modal ---
window.openTxModal = async function(txId) {
    const modal = document.getElementById("txDrillDownModal");
    const modalBody = document.getElementById("modalTxBody");
    const modalTitle = document.getElementById("modalTxId");
    const modalTime = document.getElementById("modalTxTime");

    if (!modal || !modalBody) return;

    modal.style.display = "flex";
    modalTitle.innerText = `Loading ${txId}...`;
    modalTime.innerText = "";
    modalBody.innerHTML = `<p class="empty-state">⏳ Fetching cryptographic proof and officer records...</p>`;

    try {
        const res = await fetch(`http://localhost:3000/api/transactions/${encodeURIComponent(txId)}`);
        if (!res.ok) {
            modalBody.innerHTML = `<div class="empty-state" style="color: #f43f5e;">Transaction not found.</div>`;
            return;
        }

        const tx = await res.json();
        modalTitle.innerText = `Transaction ${tx.id}`;
        modalTime.innerText = `Recorded: ${new Date(tx.timestamp).toLocaleString()} • Chain Block #${tx.chain_index}`;

        const isApproved = tx.status === "APPROVED";
        const isValidSignature = tx.hash_valid;
        const isTampered = tx.is_tampered || !isValidSignature;
        const isOfficerApproved = tx.officer_resolution === "APPROVED_BY_OFFICER" || tx.investigation_status === "RESOLVED_EXPLAINED";

        // Dynamic Rule Verdict Badge for Modal
        let verdictBadge = isApproved ? '✅ APPROVED' : '🚨 FLAGGED';
        let verdictColor = isApproved ? '#34d399' : '#fb7185';
        if (isTampered) {
            verdictBadge = '🚨 TAMPERED (INVALID HASH)';
            verdictColor = '#f43f5e';
        } else if (isOfficerApproved && !isApproved) {
            verdictBadge = '✅ RESOLVED (NORMAL - APPROVED)';
            verdictColor = '#34d399';
        } else if (tx.officer_resolution === 'PENALIZED_FRAUD') {
            verdictBadge = '⚖️ PENALIZED (FRAUD CONFIRMED)';
            verdictColor = '#fb7185';
        }

        // Violations block
        let violationsHtml = "";
        if (tx.violations && tx.violations.length > 0) {
            violationsHtml = `
                <div>
                    <span class="modal-section-title">🚨 Identified Rule Violations</span>
                    <div class="violation-box" style="margin-top: 0.35rem;">
                        ${tx.violations.map(v => `<div>• <strong>[${v.rule}]</strong>: ${v.message}</div>`).join('')}
                    </div>
                </div>
            `;
        }

        // Tamper Warning Banner inside modal
        let tamperBannerHtml = "";
        if (isTampered) {
            tamperBannerHtml = `
                <div class="chain-alert-banner danger" style="margin-bottom: 0.75rem;">
                    <div style="font-size: 1.3rem; line-height: 1;">🚨</div>
                    <div>
                        <strong>CRYPTOGRAPHIC HASH MISMATCH DETECTED:</strong><br>
                        <span>This block's recorded hash does not match recalculation from its canonical payload. Raw database tampering occurred.</span><br>
                        <span style="font-size: 0.75rem; opacity: 0.9;">To restore mathematical integrity, use the <strong>'🛡️ Repair / Restore Chain'</strong> button on the dashboard.</span>
                    </div>
                </div>
            `;
        }

        modalBody.innerHTML = `
            ${tamperBannerHtml}

            <!-- 1. Metadata Grid -->
            <div>
                <span class="modal-section-title">📦 Transaction & Dispense Metadata</span>
                <div class="tx-meta-grid">
                    <div class="tx-meta-item">
                        <span class="lbl">Beneficiary Card</span>
                        <span class="val">${tx.card_no} (${tx.beneficiary_name})</span>
                    </div>
                    <div class="tx-meta-item">
                        <span class="lbl">Distribution Center</span>
                        <span class="val">${tx.shop_id}</span>
                    </div>
                    <div class="tx-meta-item">
                        <span class="lbl">Claimed Commodity</span>
                        <span class="val">${tx.claimed_commodity} (${tx.claimed_amount} kg/L)</span>
                    </div>
                    <div class="tx-meta-item">
                        <span class="lbl">Scale Measurement (M2)</span>
                        <span class="val" style="color: #38bdf8;">${tx.measured_weight} kg/L</span>
                    </div>
                    <div class="tx-meta-item">
                        <span class="lbl">Vision Detection (M3)</span>
                        <span class="val" style="color: #c084fc;">${tx.vision_commodity} (${tx.vision_confidence}%)</span>
                    </div>
                    <div class="tx-meta-item">
                        <span class="lbl">Rule Verdict</span>
                        <span class="val" style="color: ${verdictColor}; font-weight: 800;">
                            ${verdictBadge}
                        </span>
                    </div>
                </div>
            </div>

            ${violationsHtml}

            <!-- 2. Cryptographic Proof Breakdown -->
            <div>
                <span class="modal-section-title">🔐 Cryptographic Ledger Proof (SHA-256 Chained)</span>
                <div class="crypto-proof-box">
                    <div class="signature-verdict-banner ${isValidSignature ? 'valid' : 'tampered'}">
                        <span>${isValidSignature ? '✅ CRYPTOGRAPHIC SIGNATURE MATCH - UNBROKEN INTEGRITY' : '🚨 SIGNATURE MISMATCH - DATA TAMPERING DETECTED!'}</span>
                        <span>Block #${tx.chain_index}</span>
                    </div>

                    <div class="crypto-field">
                        <label>Previous Block Hash (<code>prev_hash</code>):</label>
                        <div class="crypto-code">${tx.prev_hash}</div>
                    </div>

                    <div class="crypto-field">
                        <label>Canonical Payload String (Input to SHA-256):</label>
                        <div class="crypto-code">${tx.canonical_string}</div>
                    </div>

                    <div class="crypto-field">
                        <label>Recorded Block Hash (<code>current_hash</code>):</label>
                        <div class="crypto-code" style="color: ${isValidSignature ? '#38bdf8' : '#fb7185'};">${tx.current_hash}</div>
                    </div>

                    <div class="crypto-field">
                        <label>Live Recomputed Hash (from payload & prev_hash):</label>
                        <div class="crypto-code" style="color: ${isValidSignature ? '#38bdf8' : '#fb7185'};">${tx.computed_hash}</div>
                    </div>
                </div>
            </div>

            <!-- 3. Inspecting Officer Investigation Case Management -->
            <div>
                <span class="modal-section-title">📋 Inspecting Officer Audit Notes & Case Resolution</span>
                <div class="officer-form-group">
                    <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
                        <label style="font-size: 0.78rem; font-weight: 700; color: #94a3b8;">Case Resolution Status:</label>
                        <select id="modalInvStatus" class="form-select-sm" style="flex: 1; max-width: 340px;">
                            ${isTampered ? `<option value="TAMPER_DETECTED" ${tx.investigation_status === 'TAMPER_DETECTED' ? 'selected' : ''}>🚨 Tamper Detected (Corrupted Block)</option>` : ''}
                            <option value="PENDING_REVIEW" ${tx.investigation_status === 'PENDING_REVIEW' ? 'selected' : ''}>⏳ Pending Officer Review</option>
                            <option value="UNDER_INVESTIGATION" ${tx.investigation_status === 'UNDER_INVESTIGATION' ? 'selected' : ''}>🔍 Under Investigation</option>
                            <option value="RESOLVED_EXPLAINED" ${tx.investigation_status === 'RESOLVED_EXPLAINED' ? 'selected' : ''}>✅ Resolved: Legitimate Dispense Verified</option>
                            <option value="RESOLVED_PENALIZED" ${tx.investigation_status === 'RESOLVED_PENALIZED' ? 'selected' : ''}>⚖️ Resolved: Quota Fraud Penalized</option>
                            <option value="VERIFIED_NORMAL" ${tx.investigation_status === 'VERIFIED_NORMAL' ? 'selected' : ''}>✔️ Verified Normal Dispense</option>
                        </select>
                    </div>

                    <label style="font-size: 0.78rem; font-weight: 700; color: #94a3b8; margin-top: 0.25rem;">Officer Case Notes & Audit Findings:</label>
                    <textarea id="modalOfficerNotes" class="officer-notes-textarea" placeholder="Enter findings, physical scale calibration verification, customer interview notes, or disciplinary actions...">${tx.officer_notes || ''}</textarea>

                    <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem;">
                        <button class="btn btn-secondary btn-sm" onclick="closeTxModal()">Close</button>
                        <button class="btn btn-primary btn-sm" onclick="saveInvestigationNotes('${tx.id}')">💾 Save Investigation Notes</button>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        modalBody.innerHTML = `<div class="empty-state" style="color: #f43f5e;">Failed to load transaction: ${e.message}</div>`;
    }
};

window.closeTxModal = function() {
    const modal = document.getElementById("txDrillDownModal");
    if (modal) modal.style.display = "none";
};

window.saveInvestigationNotes = async function(txId) {
    const status = document.getElementById("modalInvStatus")?.value;
    const notes = document.getElementById("modalOfficerNotes")?.value || "";

    showToast("⏳ Saving officer case notes...");
    try {
        const res = await fetch(`http://localhost:3000/api/transactions/${encodeURIComponent(txId)}/investigate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, notes })
        });
        const data = await res.json();

        // 1. Auto-close the modal dialog
        closeTxModal();

        // 2. Alert success toast
        showToast("✅ " + data.message);

        // 3. Immediately refresh table so updated verdict and audit status are displayed
        await loadAuditTransactions();
    } catch (e) {
        showToast(`❌ Failed to save notes: ${e.message}`, true);
    }
};

// Close modal when clicking backdrop
document.getElementById("txDrillDownModal")?.addEventListener("click", function(e) {
    if (e.target === this) {
        closeTxModal();
    }
});

window.clearAuditLog = async function() {
    if (!confirm("Are you sure you want to clear the entire SHA-256 transaction audit log?")) return;
    try {
        await fetch("http://localhost:3000/api/transactions/clear", { method: "POST" });
        await loadAuditTransactions();
        showToast("🗑️ Audit log cleared.");
    } catch (e) {
        alert("Failed to clear log: " + e.message);
    }
};

// ==========================================
// 11. BOOTSTRAP
// ==========================================
switchRoleView('SHOP');
loadData();
window.lookupBeneficiary("TN-PDS-1001");
initStation();
loadAuditTransactions();
setInterval(loadData, 5000);