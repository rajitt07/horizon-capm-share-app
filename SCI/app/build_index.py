"""
Build Simple Composite Index from 35.csv macro indicators:
  - 1.2   Index of Industrial Production  (col 1)
  - 2.1.2 Credit                          (col 3)
  - 2.2.2 Broad Money (M3)               (col 7)
  - 4.14  10-Year G-Sec Par Yield (FBIL) (col 28)
Equal weights, z-score standardization, index scaled to mean 100.
Output: data/composite_index.json and data/data.js for the table view.
"""

import csv
import json
import os
import re
from datetime import datetime

# Paths: run from repo root or from Applications/SCI
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", ".."))
PATH_35 = os.path.join(REPO_ROOT, "Data", "Macro Indicators", "DBIE(macro)", "35.csv")
OUT_JSON = os.path.join(SCRIPT_DIR, "data", "composite_index.json")
OUT_JS = os.path.join(SCRIPT_DIR, "data", "data.js")


def safe_float(s):
    if s is None or (isinstance(s, str) and s.strip() in ("", ".", "..")):
        return None
    s = str(s).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def main():
    with open(PATH_35, "r", encoding="utf-8") as f:
        rows = list(csv.reader(f))

    # Data rows: first column is dd/mm/yy (end-of-month)
    date_pat = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}")
    data_rows = []
    for row in rows:
        if len(row) <= 28 or not row[0]:
            continue
        parts = str(row[0]).strip().split()
        if not parts or not date_pat.match(parts[0]):
            continue
        data_rows.append(row)

    # Col 0 = Date, 1 = IIP, 3 = Credit, 7 = M3, 28 = 10Y G-Sec
    dates = []
    iip = []
    credit = []
    m3 = []
    gsec = []
    for row in data_rows:
        d = safe_float(row[1])
        c = safe_float(row[3])
        m = safe_float(row[7])
        g = safe_float(row[28])
        if d is None and c is None and m is None and g is None:
            continue
        try:
            dt = datetime.strptime(str(row[0]).strip().split()[0], "%d/%m/%y")
            dates.append(dt.strftime("%Y-%m-%d"))
        except Exception:
            dates.append(str(row[0]).strip().split()[0])
        iip.append(d)
        credit.append(c)
        m3.append(m)
        gsec.append(g)

    # Drop rows where any of the four is missing
    clean = []
    for i in range(len(dates)):
        if iip[i] is not None and credit[i] is not None and m3[i] is not None and gsec[i] is not None:
            clean.append((dates[i], iip[i], credit[i], m3[i], gsec[i]))

    if not clean:
        raise SystemExit("No valid rows after filtering.")

    dates, iip, credit, m3, gsec = zip(*clean)
    iip = list(iip)
    credit = list(credit)
    m3 = list(m3)
    gsec = list(gsec)

    def zscore(x):
        mu = sum(x) / len(x)
        var = sum((v - mu) ** 2 for v in x) / len(x)
        std = var ** 0.5 if var else 1.0
        return [(v - mu) / std for v in x]

    ziip = zscore(iip)
    zcredit = zscore(credit)
    zm3 = zscore(m3)
    zgsec = zscore(gsec)

    w = 0.25
    raw_index = [w * (ziip[i] + zcredit[i] + zm3[i] + zgsec[i]) for i in range(len(dates))]
    mean_raw = sum(raw_index) / len(raw_index)
    composite = [100 + (r - mean_raw) for r in raw_index]

    # Build output
    headers = ["Date", "Index of Industrial Production (% yoy)", "Credit (% yoy)", "Broad Money M3 (% yoy)", "10-Year G-Sec (%)", "Simple Composite Index"]
    rows = []
    for i in range(len(dates)):
        rows.append({
            "date": dates[i],
            "iip": round(iip[i], 4),
            "credit": round(credit[i], 4),
            "m3": round(m3[i], 4),
            "gsec": round(gsec[i], 4),
            "index": round(composite[i], 4),
        })

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump({"headers": headers, "rows": rows}, f, indent=2)

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("window.SCI_DATA = ")
        json.dump({"headers": headers, "rows": rows}, f, indent=2)
        f.write(";\n")

    print(f"Written {len(rows)} rows to {OUT_JSON} and {OUT_JS}")
    return rows


if __name__ == "__main__":
    main()
