# 🥣 Smart Hunger IoT Monitoring System

An end-to-end IoT-driven inventory management and resource redistribution system. This platform dynamically monitors food stock levels at multiple distribution centers, predicts hunger shortage risks in real-time, and recommends redistribution logisitics to optimize food supply chains.

> 📖 **Comprehensive Documentation**: For full architecture diagrams, hardware pinouts, dynamic risk formulas, matchmaking transfer algorithms, and complete file inventories, see **[COMPREHENSIVE_PROJECT_OVERVIEW.md](COMPREHENSIVE_PROJECT_OVERVIEW.md)**.

---

## 🚀 Key Features

*   **Multi-Commodity Tracking (5 Items)**: Tracks independent inventory lines for **Rice 🍚, Sugar 🍬, Wheat 🌾, Toor Dal 🥣, and Palm Oil 🛢️** with custom threshold dynamics.
*   **5 Monitored Distribution Shops**: Full network visibility across Shop 1 (Central Hub) through Shop 5 (West Center).
*   **Dynamic Shortage Risk Prediction**: Evaluates 24-hour sliding averages of consumption rates per commodity to assign risk levels (`NORMAL`, `MEDIUM RISK`, `HIGH RISK`).
*   **Item-Aware Intelligent Redistribution**: Recommends point-to-point transfers matching surplus commodities directly to deficit centers without mixing food types.
*   **1-Click In-Dashboard Testing Suite**: Full interactive testing controls in the UI to seed baseline data, simulate emergency shortages, and execute transfers on the fly.
*   **Resilient Dual Storage**: Cloud Supabase PostgreSQL with automated fallback to local JSON database (`backend/data/stock_data.json`).

---

## 📐 System Architecture

The following diagram illustrates the flow of data from the IoT microcontrollers at the edge, through the Express gateway, into the Supabase database, and finally served to the web dashboard.

```mermaid
graph TD
    subgraph Edge Devices [IoT Edge Nodes]
        A[ESP8266 - Center A]
        B[ESP32 Node 1 - Center B]
        C[ESP32 Node 2 - Center C]
    end

    subgraph Server [Backend Gateway & Engine]
        NodeServer[Node.js / Express Server]
        RedistEngine[Redistribution & Analytics Engine]
    end

    subgraph Cloud [Data Layer]
        Supabase[(Supabase PostgreSQL)]
    end

    subgraph Client [Frontend UI]
        Dashboard[Web Dashboard]
    end

    %% Data Flow
    A -- "HTTP POST (JSON) /api/fooddata" --> NodeServer
    B -- "HTTP POST (JSON) /api/fooddata" --> NodeServer
    C -- "HTTP POST (JSON) /api/fooddata" --> NodeServer
    
    NodeServer -- "Store Stock Record" --> Supabase
    Dashboard -- "HTTP GET (5s Poll) /api/data" --> NodeServer
    NodeServer -- "Query Last 24h Readings" --> Supabase
    NodeServer --> RedistEngine
    RedistEngine -- "Format Analytics, Alerts, & Transfers" --> Dashboard
```

---

## 📁 Repository Structure

```text
smart-hunger-iot/
├── backend/
│   ├── .env.example             # Template for API credentials
│   ├── apply_redistribution.js  # Script to apply item-aware transfers
│   ├── seed_5shops.js           # Baseline generator for 5 shops x 5 items
│   ├── server.js                # Express gateway & analytics engine
│   ├── simulate_5shops_shortage.js # Injects emergency shortage spikes
│   └── storage.js               # Resilient storage adapter (Supabase + Local JSON)
├── database/
│   ├── 01_add_stock_columns.sql # Base schema migration
│   └── 02_add_item_support.sql  # Multi-commodity column migration
├── devices/
│   ├── esp32_food_sensor/
│   │   ├── esp32_food_sensor.ino # Firmware for ESP32 nodes (Center B & C)
│   │   └── README.md             # ESP32 specific wiring & setup docs
│   └── esp8266/
│       ├── esp8266_food_sensor.ino # Firmware for ESP8266 node (Center A)
│       └── README.md             # ESP8266 specific wiring & setup docs
├── frontend/
│   ├── dashboard.js             # Core frontend polling and rendering logic
│   ├── index.html               # Main dashboard UI structure
│   └── style.css                # Premium modern dark-theme dashboard styles
├── package.json                 # Node dependencies and execution scripts
├── COMPREHENSIVE_PROJECT_OVERVIEW.md # Complete architectural & implementation guide
├── DOCUMENTATION.md             # Supplemental cleanup & system notes
├── Software_Requirements_Smart_Hunger_System.docx # Formal SRS document
└── project_report.txt           # Extensive hardware/performance analysis report
```

---

## 🔌 Hardware Setup & Wiring

### 1. ESP8266 Node (`Center A`)
*   **Hardware**: ESP8266 NodeMCU.
*   **Pins**:
    *   `D5` -> Push Button (Add Stock, +10 kg)
    *   `D6` -> Push Button (Consume Stock, +5 kg)
*   **Wiring**: Active-LOW layout. Connect buttons to the designated digital pins and `GND`. Built-in internal pull-up (`INPUT_PULLUP`) is configured in code.

### 2. ESP32 Nodes (`Center B` and `Center C`)
*   **Hardware**: ESP32 Development Board.
*   **Node Index Configuration**: Adjust `ESP32_NODE_INDEX` in the firmware header:
    *   `1` -> **Center B**
    *   `2` -> **Center C**
*   **Pins**:
    *   `GPIO 18` -> Push Button (Add Stock, +10 kg)
    *   `GPIO 19` -> Push Button (Consume Stock, +5 kg)
*   **Wiring**: Active-LOW layout. Connect buttons to the designated GPIO pins and `GND`.

---

## 💾 Database Setup (Supabase)

The system stores logs in a Supabase PostgreSQL database under the table name `Food_Stock_Data`.

1. **Table Schema**: Create the table in your Supabase SQL Editor with the following structure:
    ```sql
    CREATE TABLE public."Food_Stock_Data" (
        id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        device_id text NOT NULL,
        weight numeric NOT NULL,
        total_weight numeric DEFAULT 0,
        consumed_weight numeric DEFAULT 0,
        created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
    );
    ```
2. **Database Migration**: Run the migration query located in [01_add_stock_columns.sql](file:///d:/VSC/smart-hunger-iot/database/01_add_stock_columns.sql) to add the weight tracking column support.

---

## ⚙️ Software Setup & Execution

### 1. Backend Gateway Installation
Navigate to the root directory, install the required packages, and copy the environment template:
```bash
# Install dependencies
npm install

# Set up local environment credentials
cp backend/.env.example backend/.env
```
Open `backend/.env` and replace the placeholder values with your live Supabase credentials:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-supabase-anon-or-service-role-key
```

### 2. Run the Server
Launch the Express gateway server:
```bash
npm start
```
The server will boot and listen for incoming HTTP posts from IoT devices and dashboard fetch requests at `http://localhost:3000`.

### 3. Open the Frontend Dashboard
To run the dashboard, you can open `frontend/index.html` directly in a browser, or run a local web server from the project directory:
```bash
npx serve frontend
```
The dashboard is configured to poll `http://localhost:3000/api/data` every 5 seconds to draw live comparison tables, highlight active risk alerts, and display calculated transfers.

---

## 🧪 Simulation and Testing Suite

To verify dashboard visuals and item-aware redistribution algorithms without physical microcontrollers, you can use **either** the web interface or the terminal:

### 1. In-Dashboard Testing (Recommended)
Open the dashboard (`http://localhost:3000`) and use the **🧪 Simulation & Testing Control Center** at the top of the page:
- **🌱 Seed 5 Shops Baseline**: Injects 24h realistic curves for all 5 shops and 5 commodities (25 streams).
- **🚨 Simulate Emergency Shortages**: Triggers critical drops on Rice, Sugar, Wheat, Toor Dal, and Palm Oil.
- **🚚 Execute All Transfers**: Automatically executes the point-to-point redistribution recommendations.
- **⚡ Apply Single Transfer**: Execute any individual transfer directly on its recommendation card.
- **✏️ Manual Stock Injection**: Input any custom weight for any shop and commodity.

### 2. Command-Line Simulation Scripts
*   **Seed 5 Shops x 5 Items Baseline**:
    ```bash
    npm run seed
    # or: npm run seed-5shops
    ```
*   **Trigger Critical Shortages**:
    ```bash
    npm run simulate-shortage
    ```
*   **Execute Item-Aware Redistribution Logistics**:
    ```bash
    npm run apply-redistribution
    ```

---

## 📊 Analytics & Redistribution Logic

### Hunger Risk Prediction
Rather than static alert levels, safety thresholds are calculated dynamically:
$$\text{Safe Buffer} = \max(3\text{ kg}, \text{Average 24h Consumption Rate})$$
$$\text{Target Safe Level} = \text{Safe Buffer} + 2\text{ kg}$$

*   **HIGH RISK**: Current stock weight is $\le$ Safe Buffer.
*   **MEDIUM RISK**: Stock is consumed at a rate exceeding the 24h average while remaining stock is $\le$ Target Safe Level.

### Matchmaking Transfers
Deficits and surpluses are sorted dynamically:
1.  **Deficits**: Centers with current stock $<$ Safe Buffer. The shortage quantity needed is computed as: $\text{needed} = \text{Target Safe Level} - \text{current\_weight}$.
2.  **Surpluses**: Centers with current stock $>$ Target Safe Level and having `NORMAL` risk. The available transfer stock is: $\text{available} = \text{current\_weight} - \text{Target Safe Level}$.
3.  **Redistribution**: Matches surplus nodes with deficit nodes sequentially, printing exact kg transfer directives.
