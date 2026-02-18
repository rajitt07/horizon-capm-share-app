# MF analysis structure test

Standalone peer comparison package separated from `Jansens Alpha`.

## Structure

- `apps/peer/index.html` - Peer comparison app with:
  - NAV chart (daily, rebased)
  - compare button
  - max 3 selected funds
  - score metric (out of 6) with reason dropdown
- `data/matched_only_sorted.xlsx` - Fund master and metrics
- `data/matched_only_sorted_amfi_nav_curve_funds_only_2025-09-30_to_2025-12-25.csv` - NAV curve data
- `data/matched_only_sorted_amfi_match_report_funds_only_2025-09-30_to_2025-12-25.csv` - AMFI match report

## Run locally

From repository root:

```bash
python3 -m http.server 5500
```

Open:

`http://localhost:5500/MF%20analysis%20structure%20test/apps/peer/index.html`

