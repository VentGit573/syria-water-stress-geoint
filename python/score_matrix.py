#!/usr/bin/env python3
# ---------------------------------------------------------------------
# AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
# claude-opus-5-5) in conversation with Sean Ventura, 14 Nov 2026.
# Tested only on synthetic data; not yet run on project data.
# 14 Nov 2026: added 2004 census indicators from the Mazur/Khaddour Syria Town Database.
# ---------------------------------------------------------------------
"""
Score districts with an environment-only baseline and with the institutional
module added, then test both against an outcome (e.g. 2011 protest onset).

Question it answers: does knowing how institutions managed water and the
drought improve on an environment-only (WPS-style) view of where unrest began?

INPUTS (CSV, joined on adm1 + adm2):
  district_baseline.csv  from district_baseline_matrix.js (GEE)
  matrix_inputs.csv      your hand-filled columns: institutional indicators and
                         outcomes. Blank cells are allowed. A template is written
                         on first run if the file is missing.

RUN:   python score_matrix.py district_baseline.csv matrix_inputs.csv
OUT:   matrix_scores.csv, matrix_tests.csv, matrix_chart.png (if matplotlib)

Edit INDICATORS and OUTCOMES below to change weights, directions or columns.
direction = +1 if a higher value means more strain, -1 if lower means more strain.
"""
import csv, math, os, sys

# ---------------- SETTINGS ----------------
INDICATORS = [
    # column        module           direction weight  note
    ("spi_drt",    "core",           -1, 25, "drought-year rainfall anomaly"),
    ("hlth_pct",   "core",           -1, 30, "% change in healthy cropland"),
    ("irr_crop",   "core",           -1, 15, "irrigated share of cropland (less = more exposed)"),
    ("crop_f",     "core",           +1, 15, "dependence on farming (cropland share)"),
    ("lit_pct",    "core",           -1, 15, "night-light change (origin decline)"),
    ("ag_work",    "core",           +1, 15, "% of workers in agriculture, 2004 census (Mazur town data)"),
    ("unemp",      "core",           +1, 10, "unemployment rate 15+, 2004 census"),
    ("state_share","institutional",  -1, 30, "share of irrigation on state networks"),
    ("diesel_exp", "institutional",  +1, 20, "diesel shock x well dependence"),
    ("relief_cov", "institutional",  -1, 20, "relief coverage of severely affected"),
    ("restrict",   "institutional",  +1, 10, "Decree 49 / stateless exposure (0-1)"),
    ("in_migr",    "institutional",  +1, 20, "drought in-migrants received per 1,000 HH"),
    ("gov_emp",    "institutional",  -1, 15, "% of workers in government sector, 2004 (state reach / patronage)"),
    ("water_net",  "institutional",  -1, 15, "% of housing with safe water, 2004 (state service reach)"),
]
OUTCOMES = [
    # column              kind       note
    ("protest_by_apr11",  "binary",  "1 = protest recorded by 30 Apr 2011"),
    ("onset_days",        "earlier", "days from 15 Mar 2011 to first protest (smaller = earlier)"),
    ("events_2011",       "count",   "protest events Mar-Dec 2011"),
]
MIN_COVERAGE = 0.2   # share of a module's weight a district needs for a score; raise to 0.5 once more columns are filled
# -------------------------------------------

def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))

def num(v):
    try:
        x = float(v)
        return None if (math.isnan(x) or x == -9999) else x
    except (TypeError, ValueError):
        return None

def key(r):
    return (str(r.get("adm1", "")).strip().lower(), str(r.get("adm2", "")).strip().lower())

def pct_rank(values):
    """Percentile rank 0-1 of each non-missing value (ties averaged)."""
    pts = sorted((v, i) for i, v in enumerate(values) if v is not None)
    out = [None] * len(values)
    n = len(pts)
    i = 0
    while i < n:
        j = i
        while j + 1 < n and pts[j + 1][0] == pts[i][0]:
            j += 1
        r = (i + j) / 2 / (n - 1) if n > 1 else 0.5
        for k in range(i, j + 1):
            out[pts[k][1]] = r
        i = j + 1
    return out

def spearman(x, y):
    pairs = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
    if len(pairs) < 5:
        return None, len(pairs)
    rx = pct_rank([p[0] for p in pairs]); ry = pct_rank([p[1] for p in pairs])
    mx = sum(rx) / len(rx); my = sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = sum((a - mx) ** 2 for a in rx); vy = sum((b - my) ** 2 for b in ry)
    return (cov / math.sqrt(vx * vy) if vx and vy else None), len(pairs)

def auc(score, label):
    """Probability a random positive district scores above a random negative one."""
    pos = [s for s, l in zip(score, label) if s is not None and l == 1]
    neg = [s for s, l in zip(score, label) if s is not None and l == 0]
    if not pos or not neg:
        return None, len(pos), len(neg)
    wins = sum(1.0 if p > q else 0.5 if p == q else 0.0 for p in pos for q in neg)
    return wins / (len(pos) * len(neg)), len(pos), len(neg)

def module_score(rows, cols, weights_equal=False):
    """Weighted mean of oriented percentile ranks, 0-10, with coverage check."""
    oriented = {}
    for col, mod, d, w, _ in cols:
        ranks = pct_rank([num(r.get(col)) for r in rows])
        oriented[col] = [None if v is None else (v if d > 0 else 1 - v) for v in ranks]
    scores = []
    for i in range(len(rows)):
        tot_w = sum((1 if weights_equal else w) for col, mod, d, w, _ in cols)
        got_w = s = 0.0
        for col, mod, d, w, _ in cols:
            ww = 1 if weights_equal else w
            v = oriented[col][i]
            if v is not None:
                s += ww * v; got_w += ww
        scores.append(10 * s / got_w if tot_w and got_w / tot_w >= MIN_COVERAGE else None)
    return scores

def write_template(path, base_rows):
    cols = ["adm1", "adm2"] + [c[0] for c in INDICATORS if c[1] != "core"] + [o[0] for o in OUTCOMES] + ["notes"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(cols)
        for r in base_rows:
            w.writerow([r.get("adm1"), r.get("adm2")] + [""] * (len(cols) - 2))
    print(f"Wrote template {path}: fill the institutional and outcome columns, then run again.")

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    base = read_csv(sys.argv[1])
    if not os.path.exists(sys.argv[2]):
        write_template(sys.argv[2], base); return
    extra = {key(r): r for r in read_csv(sys.argv[2])}
    rows = []
    for r in base:
        m = dict(r); m.update({k: v for k, v in extra.get(key(r), {}).items() if v not in ("", None)})
        rows.append(m)
    unmatched = len([r for r in base if key(r) not in extra])
    if unmatched:
        print(f"Note: {unmatched} districts have no row in {sys.argv[2]} (names must match GAUL exactly).")

    core = [c for c in INDICATORS if c[1] == "core"]
    inst = [c for c in INDICATORS if c[1] == "institutional"]
    variants = {}
    for label, eq in (("", False), ("_eqw", True)):
        c = module_score(rows, core, eq); i = module_score(rows, inst, eq)
        full_add = [None if a is None or b is None else (a + b) / 2 for a, b in zip(c, i)]
        full_geo = [None if a is None or b is None else math.sqrt(max(a, 0.1) * max(b, 0.1)) for a, b in zip(c, i)]
        variants["base" + label] = c
        variants["inst" + label] = i
        variants["full_add" + label] = full_add
        variants["full_geo" + label] = full_geo

    # scores table
    out_cols = ["adm1", "adm2"] + list(variants)
    with open("matrix_scores.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(out_cols + [o[0] for o in OUTCOMES])
        for idx, r in enumerate(rows):
            w.writerow([r.get("adm1"), r.get("adm2")] +
                       [None if variants[v][idx] is None else round(variants[v][idx], 2) for v in variants] +
                       [r.get(o[0], "") for o in OUTCOMES])

    # tests
    tests = []
    for ocol, kind, note in OUTCOMES:
        y = [num(r.get(ocol)) for r in rows]
        if sum(v is not None for v in y) < 5:
            print(f"Outcome '{ocol}': fewer than 5 values filled, skipped."); continue
        for vname, s in variants.items():
            if kind == "binary":
                a, npos, nneg = auc(s, [None if v is None else int(v) for v in y])
                tests.append([ocol, vname, "AUC", None if a is None else round(a, 3), f"{npos} pos / {nneg} neg"])
            else:
                yy = [None if v is None else (-v if kind == "earlier" else v) for v in y]
                rho, n = spearman(s, yy)
                tests.append([ocol, vname, "Spearman rho", None if rho is None else round(rho, 3), f"n={n}"])
    with open("matrix_tests.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["outcome", "score", "statistic", "value", "sample"]); w.writerows(tests)
    for t in tests:
        print(*t, sep="\t")
    print("AUC 0.5 = no better than chance; rho > 0 = higher strain goes with earlier / more protest.")

    # chart: base vs full (additive), coloured by binary outcome if present
    try:
        import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
        lab = [num(r.get("protest_by_apr11")) for r in rows]
        fig, ax = plt.subplots(figsize=(7, 6))
        for val, colr, name in ((1, "#b2182b", "Protest by 30 Apr 2011"), (0, "#4d4d4d", "No protest recorded"),
                                (None, "#bbbbbb", "Outcome not filled")):
            xs = [variants["base"][i] for i in range(len(rows)) if lab[i] == val and variants["base"][i] is not None and variants["full_add"][i] is not None]
            ys = [variants["full_add"][i] for i in range(len(rows)) if lab[i] == val and variants["base"][i] is not None and variants["full_add"][i] is not None]
            if xs: ax.scatter(xs, ys, s=28, c=colr, label=name)
        ax.plot([0, 10], [0, 10], ls=":", c="#999999", lw=1)
        ax.set_xlabel("Environment-only score (0-10)"); ax.set_ylabel("Environment + institutions score (0-10)")
        ax.set_title("District strain: does the institutional module change the picture?")
        ax.legend(frameon=False, fontsize=8); fig.tight_layout(); fig.savefig("matrix_chart.png", dpi=200)
        print("Wrote matrix_chart.png")
    except ImportError:
        print("matplotlib not installed; chart skipped.")
    print("Wrote matrix_scores.csv and matrix_tests.csv")

if __name__ == "__main__":
    main()
