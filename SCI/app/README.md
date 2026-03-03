# Simple Composite Index (SCI)

Macro indicator composite built from **35.csv** (DBIE):

- **1.2** Index of Industrial Production (% yoy)
- **2.1.2** Credit (% yoy)
- **2.2.2** Broad Money (M3) (% yoy)
- **4.14** 10-Year G-Sec Par Yield (FBIL) (%)

Equal weights, z-score standardization, index scaled to mean 100.

## Setup

1. **Generate data** (from repo root):

   ```bash
   python3 Applications/SCI/build_index.py
   ```

   This reads `Data/Macro Indicators/DBIE(macro)/35.csv` and writes `Applications/SCI/data/composite_index.json` and `data/data.js`.

2. **View the table**

   - **Option A:** Serve the app and open in a browser:
     ```bash
     cd Applications/SCI && python3 -m http.server 8080
     ```
     Then open http://localhost:8080

   - **Option B:** Open `Applications/SCI/index.html` directly in the browser (if your browser allows loading local `data/data.js`).

## Features

- Tabular view of Date, IIP, Credit, M3, 10Y G-Sec, and Simple Composite Index
- Sort by any column (click header)
- Filter by date (e.g. type `2024` to see that year)
- Index above/below mean highlighted in green/red
