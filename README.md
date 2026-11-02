# Metals Department Productivity Dashboard 📊

An advanced, interactive productivity dashboard for tracking the 10 production machines of the Metals Department, measuring output performance (m & km/day), and monitoring shifts (S1, S2, S3) and materials (Aluminum & Copper).

---

## ⚡ Main Machine Table Columns
The primary machine productivity view displays columns in this exact order:
```
Machine | W.O | Cable Size | Conductor | Target/day | Shift 1 | Shift 2 | Shift 3 | Production km/day | Cable Type
```

* **Machine:** 10 core department machines (`RS01`–`RS06`, `CS01`, `CS02`, `DS01`, `CN`).
* **W.O:** Active work orders executed on the machine.
* **Cable Size:** Conductor cross-section(s) (e.g. `240`, `400`, `120`, `35`).
* **Conductor:** Conductor metal (`AL` for Aluminum, `CU` for Copper).
* **Target/day:** Standard planned production rate in km/day.
* **Shift 1 / 2 / 3:** Output per shift in km.
* **Production km/day:** Total aggregated daily output in **km/day**.
* **Cable Type:** Cable category (`LV`, `MV`, `HV`).

---

## 📁 Data Source & Drag & Drop Support
All dashboard data relies **exclusively** on the daily production sheet exported in `Cable_Production_Records` format.

### Updating via Drag & Drop:
1. Open [`index.html`](file:///C:/Users/mahmoud.mohamed/Desktop/METAL/index.html) in your browser.
2. Drag and drop any `Cable_Production_Records_*.csv` file onto the window.
3. The dashboard immediately processes the file and updates all views, persisting data locally.

### Updating via Script:
```bash
python update_daily_data.py Cable_Production_Records_YYYY-MM-DD.csv
```

Detailed instructions and column specifications are documented in [INSTRUCTIONS.md](file:///C:/Users/mahmoud.mohamed/Desktop/METAL/INSTRUCTIONS.md).
