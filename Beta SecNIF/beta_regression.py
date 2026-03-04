#!/usr/bin/env python3
"""
Regression beta (sector vs NIFTY): load benchmark and sector weekly CSVs,
align by Week_End_Date, compute β, α, R², SE(β), SE(α). Print table and write CSV.
"""
import csv
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BENCHMARK_CSV = SCRIPT_DIR / "../../Data/industry data/test data/Analytics data/NIFTY Total Returns Historical Data_weekly_change_pct.csv"
SECTOR_DIR = SCRIPT_DIR / "../../Data/sectoral indice beta calculation/3Y_weekly"
OUTPUT_CSV = SCRIPT_DIR / "beta_regression_results.csv"

SECTOR_FILES = [
    "BSE 250 Microcap3csv.csv", "BSE Auto3.csv", "BSE CAP&Goods3.csv", "BSE Consumer Discretionary3.csv",
    "BSE Consumer Durables3.csv", "BSE Energy3.csv", "BSE FMCG3.csv", "BSE Healthcare3.csv", "BSE IT3.csv",
    "BSE Metal3.csv", "BSE Midcap3.csv", "BSE OIL &GAS3.csv", "BSE Power&energy3.csv", "BSE Realty3.csv",
    "BSE Services3.csv", "BSE Smallcap3.csv", "BSE Utilities3.csv", "BSE bankex3.csv",
    "BSE cap markets & insurance3.csv", "BSE finserv3.csv", "BSE industreis3.csv", "BSE largecap3.csv",
]


def parse_weekly_csv(path: Path) -> tuple[list[str], list[float]]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    if len(rows) < 2:
        return [], []
    header = [ (h or "").strip().lower().replace("\ufeff", "") for h in rows[0] ]
    date_idx = header.index("week_end_date") if "week_end_date" in header else 0
    ret_idx = header.index("weekly_return") if "weekly_return" in header else 2
    dates, returns = [], []
    for r in rows[1:]:
        if len(r) <= max(date_idx, ret_idx):
            continue
        d = (r[date_idx] or "").strip()
        v = None
        try:
            v = float(str(r[ret_idx]).replace(",", "").replace("%", ""))
        except ValueError:
            continue
        if not d:
            continue
        dates.append(d)
        returns.append(v)
    return dates, returns


def regression_stats(y: list[float], x: list[float]) -> dict:
    n = len(y)
    if n < 3:
        return {"beta": float("nan"), "alpha": float("nan"), "r2": float("nan"), "se_beta": float("nan"), "se_alpha": float("nan"), "n": n}
    mean_y = sum(y) / n
    mean_x = sum(x) / n
    var_x = sum((xi - mean_x) ** 2 for xi in x) / n
    cov_xy = sum((y[i] - mean_y) * (x[i] - mean_x) for i in range(n)) / n
    if var_x == 0:
        return {"beta": float("nan"), "alpha": float("nan"), "r2": float("nan"), "se_beta": float("nan"), "se_alpha": float("nan"), "n": n}
    beta = cov_xy / var_x
    alpha = mean_y - beta * mean_x
    residuals = [y[i] - alpha - beta * x[i] for i in range(n)]
    ss_res = sum(e**2 for e in residuals)
    ss_tot = sum((yi - mean_y) ** 2 for yi in y)
    r2 = 1 - (ss_res / ss_tot) if ss_tot != 0 else float("nan")
    sigma2 = ss_res / (n - 2) if n > 2 else 0.0
    se_beta = (sigma2 / (n * var_x)) ** 0.5 if var_x else float("nan")
    se_alpha = (sigma2 * (1 / n + mean_x**2 / (n * var_x))) ** 0.5 if var_x else float("nan")
    return {"beta": beta, "alpha": alpha, "r2": r2, "se_beta": se_beta, "se_alpha": se_alpha, "n": n}


def main():
    benchmark_path = BENCHMARK_CSV.resolve()
    sector_dir = SECTOR_DIR.resolve()
    if not benchmark_path.exists():
        raise SystemExit(f"Benchmark not found: {benchmark_path}")
    if not sector_dir.exists():
        raise SystemExit(f"Sector dir not found: {sector_dir}")

    b_dates, b_returns = parse_weekly_csv(benchmark_path)
    bench_by_date = dict(zip(b_dates, b_returns))
    bench_set = set(b_dates)

    results = []
    for name in SECTOR_FILES:
        path = sector_dir / name
        if not path.exists():
            results.append({"sector": name, "beta": float("nan"), "alpha": float("nan"), "r2": float("nan"), "se_beta": float("nan"), "se_alpha": float("nan"), "n": 0})
            continue
        s_dates, s_returns = parse_weekly_csv(path)
        y, x = [], []
        for i, d in enumerate(s_dates):
            if d not in bench_set:
                continue
            y.append(s_returns[i])
            x.append(bench_by_date[d])
        stats = regression_stats(y, x)
        results.append({
            "sector": name,
            "beta": stats["beta"],
            "alpha": stats["alpha"],
            "r2": stats["r2"],
            "se_beta": stats["se_beta"],
            "se_alpha": stats["se_alpha"],
            "n": stats["n"],
        })

    # Print table
    print("Regression Beta (sector vs NIFTY Total Returns)")
    print("=" * 100)
    print(f"{'Sector':<40} {'Beta':>10} {'Alpha':>10} {'R²':>8} {'SE(β)':>10} {'SE(α)':>10} {'N':>6}")
    print("-" * 100)
    for r in results:
        beta_s = f"{r['beta']:.4f}" if not (r['beta'] != r['beta']) else "—"
        alpha_s = f"{r['alpha']:.6f}" if not (r['alpha'] != r['alpha']) else "—"
        r2_s = f"{r['r2']:.4f}" if not (r['r2'] != r['r2']) else "—"
        se_b_s = f"{r['se_beta']:.6f}" if not (r['se_beta'] != r['se_beta']) else "—"
        se_a_s = f"{r['se_alpha']:.6f}" if not (r['se_alpha'] != r['se_alpha']) else "—"
        print(f"{r['sector']:<40} {beta_s:>10} {alpha_s:>10} {r2_s:>8} {se_b_s:>10} {se_a_s:>10} {r['n']:>6}")
    print("=" * 100)

    # Write CSV
    out_path = OUTPUT_CSV.resolve()
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Sector", "Beta", "Alpha", "R_squared", "SE_beta", "SE_alpha", "N_weeks"])
        for r in results:
            w.writerow([
                r["sector"],
                r["beta"] if r["beta"] == r["beta"] else "",
                r["alpha"] if r["alpha"] == r["alpha"] else "",
                r["r2"] if r["r2"] == r["r2"] else "",
                r["se_beta"] if r["se_beta"] == r["se_beta"] else "",
                r["se_alpha"] if r["se_alpha"] == r["se_alpha"] else "",
                r["n"],
            ])
    print(f"Results written to {out_path}")


if __name__ == "__main__":
    main()
