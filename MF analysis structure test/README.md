# MF analysis structure test

Standalone peer comparison package separated from `Jansens Alpha`.

## Structure

- `src/` - React/Vite dashboard (dark, high-density comparison table, category summary, alpha chart)
- `apps/peer/index.html` - Legacy vanilla peer comparison demo (separate from the React app)
- `data/matched_only_sorted.xlsx` - Fund master and metrics
- `data/matched_only_sorted_amfi_nav_curve_funds_only_2025-09-30_to_2025-12-25.csv` - Sample export (not used by the app UI)
- `data/matched_only_sorted_amfi_match_report_funds_only_2025-09-30_to_2025-12-25.csv` - Sample export (not used by the app UI)

## Process Analysis

Per bucket: upload **Performance** (CSV/XLSX) + **TER** (CSV), then **Process Analysis**. The app parses files in the browser, joins on scheme keys / names, computes alpha and category averages, and precomputes a **5-point** score per fund (return vs category, positive AUM change, TER below category average, alpha > 0, information ratio Direct > 1 at the selected horizon).

## Run locally

### React/Vite dashboard

From repository root:

```bash
npm --prefix "_horizon_capm_share_app/MF analysis structure test" install
npm --prefix "_horizon_capm_share_app/MF analysis structure test" run dev -- --host 0.0.0.0 --port 5180
```

Open:

`http://localhost:5180/`

### Legacy vanilla demo

From repository root:

```bash
python3 -m http.server 5500
```

Open:

`http://localhost:5500/MF%20analysis%20structure%20test/apps/peer/index.html`
