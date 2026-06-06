let chart;

async function loadData() {
    try {
        const response = await fetch("http://localhost:3000/api/data");
        const data = await response.json();
        
        renderAlerts(data.alerts);
        renderRedistributions(data.redistributions);

        // Sort centers alphabetically by device_id
        const sortedCenters = (data.centers || []).sort((a, b) => 
            a.device_id.localeCompare(b.device_id)
        );

        renderCenters(sortedCenters);
    } catch(err) {
        console.error("Error fetching data:", err);
    }
}

function renderAlerts(alerts) {
    const alertsList = document.getElementById("alertsList");
    if (!alerts || alerts.length === 0) {
        alertsList.innerHTML = '<li>No active alerts. Systems normal.</li>';
        return;
    }
    alertsList.innerHTML = alerts.map(alert => `<li>${alert}</li>`).join('');
}

function renderRedistributions(redists) {
    const list = document.getElementById("redistList");
    if (!redists || redists.length === 0) {
        list.innerHTML = '<li>No redistribution recommendations at this time.</li>';
        return;
    }
    list.innerHTML = redists.map(r => `<li>${r}</li>`).join('');
}

function renderCenters(centers) {
    const container = document.getElementById("centersTableContainer");
    
    if(!centers || centers.length === 0){
        container.innerHTML = '<p>No data available yet. Please wait for sensor readings.</p>';
        return;
    }

    let html = `<table class="comparison-table">
        <thead>
            <tr>
                <th>Center Metrics</th>
                ${centers.map(c => `<th>${c.device_id}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Daily Total Stock</td>
                ${centers.map(c => `<td><strong>${c.total_weight || 0} kg</strong></td>`).join('')}
            </tr>
            <tr>
                <td>Total Consumed</td>
                ${centers.map(c => `<td><strong>${c.consumed_weight || 0} kg</strong></td>`).join('')}
            </tr>
            <tr>
                <td>Remaining Stock</td>
                ${centers.map(c => `<td><strong style="color: #2196F3;">${c.current_weight} kg</strong></td>`).join('')}
            </tr>
            <tr>
                <td>Recent Consumption Rate</td>
                ${centers.map(c => `<td><strong>${c.consumption_rate} kg</strong></td>`).join('')}
            </tr>
            <tr>
                <td>Avg Consumption (24h)</td>
                ${centers.map(c => `<td><strong>${c.avg_consumption} kg</strong></td>`).join('')}
            </tr>
            <tr>
                <td>Status</td>
                ${centers.map(c => {
                    let riskClass = "status-NORMAL";
                    if(c.risk_level === "HIGH RISK") riskClass = "status-HIGH";
                    else if(c.risk_level === "MEDIUM RISK") riskClass = "status-MEDIUM";
                    return `<td><div class="status-badge ${riskClass}">${c.risk_level}</div></td>`;
                }).join('')}
            </tr>
        </tbody>
    </table>`;

    container.innerHTML = html;
}

setInterval(loadData, 5000);
loadData();