# Metals Department Dashboard - Operating Instructions & Data Format

## 🎯 Primary Principle: Single Source of Truth
All dashboard data and updates rely **exclusively on the daily exported production CSV sheet** provided by the department (`Cable_Production_Records_*.csv`). No external files (`wip001_pp.xls`, `wip002_pr.xls`, or external databases) are required.

---

## 📋 Standard Daily Sheet Format (`Cable_Production_Records`)
Any sheet dragged & dropped into the dashboard or passed to the update script must follow this exact structure:

| Column Header | Description | Example Values |
| :--- | :--- | :--- |
| **Record #** | Unique record sequence ID | `808`, `807` |
| **Order No** | Work order number (`W.O`) | `1990/26/02`, `1264/26/04` |
| **Operation** | Process operation | `Stranding`, `Drawing` |
| **Machine** | Target machine (10 core machines) | `RS01`, `RS02`, `RS03`, `RS04`, `RS05`, `RS06`, `CS01`, `CS02`, `DS01`, `CN` (or `CN01`) |
| **Send Card** | Source card identifier | `25050`, empty |
| **Receive Card**| Take-up / receive card number | `3808`, `15372` |
| **Take-Up Drum**| Drum / package serial | `Z-149`, `T-23`, `SR-102` |
| **Conductor Metal** | Primary conductor metal | `AL` (Aluminum), `CU` (Copper) |
| **Size (mm²)** | Wire / conductor cross-section | `4x1x240`, `3x240`, `1x400`, `35*2`, `120` |
| **Conductor Shape** | Conductor geometry | `Circular`, `Compacted`, `Sector` |
| **Stranding Angle** | Geometric angle / shape | `دائري`, `مضغوط` |
| **Cores Count** | Number of cores | `1`, `3`, `4` |
| **Length (m)** | Measured production length in meters | `6300`, `1100`, `2500` |
| **Weight (Ton)**| Total weight in metric tons | `16.366`, `1.152`, `0.581` |
| **CU** | Copper tonnage | `0`, `7.14` |
| **AL** | Aluminum tonnage | `16.366`, `1.152` |
| **Operator Code / Name** | Machine operator name | `حازم حامد وهبه`, `احمد عبده السيد` |
| **Shift Code** | Production shift | `S1`, `S2`, `S3` |
| **Logged By** | Supervisor / engineer | `Ahmed Samy` |
| **Registration Date** | Production record date | `11/1/2026`, `2026-11-01` |

---

## 🚀 How to Update the Dashboard

### Method 1: Instant Drag & Drop (In Browser)
1. Open [`index.html`](file:///C:/Users/mahmoud.mohamed/Desktop/METAL/index.html) in your browser (Google Chrome or Microsoft Edge).
2. Drag and drop any `Cable_Production_Records_*.csv` file directly onto the dashboard window.
3. The dashboard will instantly:
   * Parse the 10 metals machines (`RS01` to `RS06`, `CS01`, `CS02`, `DS01`, `CN`).
   * Clean and normalize wire sizes (`cleanSize`).
   * Add the new day's production to the dataset without overwriting historical records.
   * Update the Machine Productivity table, KPI cards, and charts in real-time.
   * Save the state locally to browser `localStorage`.

### Method 2: Python Script (Local or GitHub Deploy)
Place the new daily file in the project folder and run:
```bash
python update_daily_data.py Cable_Production_Records_2026-11-02.csv
```
Or simply double-click:
```
تحديث_البيانات.bat
```

---

## 📊 Machine Productivity Table Structure
The main machines table displays columns in this exact sequence:
1. **Machine**: Machine identifier (`RS01` to `RS06`, `CS01`, `CS02`, `DS01`, `CN`).
2. **W.O**: Work order numbers executed on this machine during the period.
3. **Cable Size**: Conductor cross-section(s) produced.
4. **Conductor**: Material badge (`AL` or `CU`).
5. **Target/day**: Standard daily target in km (`Target/day`).
6. **Shift 1**: Shift 1 production in km.
7. **Shift 2**: Shift 2 production in km.
8. **Shift 3**: Shift 3 production in km.
9. **Production km/day**: Total daily production output in **km/day**.
10. **Cable Type**: Cable category / Family ID (`LV`, `MV`, `HV`).
