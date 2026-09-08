#!/usr/bin/env python3
"""IMC cell QC — multiple filters, one cell table in, kept cells out.

combined 复现管道默认：面积门 + DNA 分位数门。
其余方法用于对照，不默默改写 combined 的判定。
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


METHODS = {
    "area": {
        "name": "Area gate",
        "description": "面积下限 + 中位数×factor 上限，去掉碎片和融合块。",
    },
    "dna": {
        "name": "DNA intensity gate",
        "description": "按核通道强度分位数去掉未染色/死细胞。",
    },
    "combined": {
        "name": "Area + DNA",
        "description": "面积门 + DNA 门，默认 IMC 质控。",
    },
    "iqr": {
        "name": "IQR outlier",
        "description": "面积和 DNA 的 Tukey 1.5×IQR 离群剔除。",
    },
    "mad": {
        "name": "MAD robust",
        "description": "中位数绝对偏差，面积偏态时比 IQR 更稳。",
    },
    "doublet": {
        "name": "Doublet + debris",
        "description": "去掉过小碎片，以及大面积且高 DNA 的疑似双细胞。",
    },
}


@dataclass
class QCResult:
    method: str
    before: int
    after: int
    error: str | None
    cells: pd.DataFrame
    dropped: dict[str, int]

    def summary(self):
        return {
            "method": self.method,
            "before": self.before,
            "after": self.after,
            "kept": self.after,
            "dropped": self.dropped,
            "error": self.error,
        }


def dna_column(cells: pd.DataFrame) -> str | None:
    cols = [name for name in cells.columns if str(name).startswith("intensity_DNA")]
    return cols[0] if cols else None


def _area_mask(cells: pd.DataFrame, min_area: float, max_area_factor: float) -> pd.Series:
    median = float(cells["area"].median())
    return (cells["area"] >= min_area) & (cells["area"] <= median * max_area_factor)


def _dna_mask(cells: pd.DataFrame, min_intensity_pct: float) -> pd.Series:
    name = dna_column(cells)
    if not name:
        return pd.Series(True, index=cells.index)
    return cells[name] > cells[name].quantile(min_intensity_pct)


def _iqr_mask(series: pd.Series, k: float = 1.5) -> pd.Series:
    q1 = series.quantile(0.25)
    q3 = series.quantile(0.75)
    span = q3 - q1
    if span == 0:
        return series == q1
    return (series >= q1 - k * span) & (series <= q3 + k * span)


def _mad_mask(series: pd.Series, z: float = 3.5) -> pd.Series:
    med = float(series.median())
    mad = float((series - med).abs().median())
    if mad == 0:
        return series == med
    score = 0.6745 * (series - med).abs() / mad
    return score <= z


def _doublet_mask(cells: pd.DataFrame, min_area: float) -> pd.Series:
    keep = cells["area"] >= min_area
    name = dna_column(cells)
    if not name:
        return keep
    large = cells["area"] > cells["area"].median() * 1.8
    bright = cells[name] > cells[name].median() * 1.5
    return keep & ~(large & bright)


def _tally(mask: pd.Series) -> dict[str, int]:
    return {"removed": int((~mask).sum()), "kept": int(mask.sum())}


def run(
    cells: pd.DataFrame,
    method: str = "combined",
    min_area: float = 20,
    max_area_factor: float = 3.0,
    min_intensity_pct: float = 0.01,
) -> QCResult:
    if method not in METHODS:
        raise ValueError(f"未知 QC 方法: {method}，可用: {', '.join(METHODS)}")
    table = cells.copy()
    before = int(len(table))
    if before == 0:
        return QCResult(method, 0, 0, "empty", table, {"removed": 0, "kept": 0})
    if method != "dna" and "area" not in table.columns:
        return QCResult(method, before, before, "missing area", table, {"removed": 0, "kept": before})

    if method == "area":
        mask = _area_mask(table, min_area, max_area_factor)
    elif method == "dna":
        mask = _dna_mask(table, min_intensity_pct)
    elif method == "combined":
        mask = _area_mask(table, min_area, max_area_factor) & _dna_mask(table, min_intensity_pct)
    elif method == "iqr":
        mask = _iqr_mask(table["area"])
        name = dna_column(table)
        if name:
            mask = mask & _iqr_mask(table[name])
    elif method == "mad":
        mask = _mad_mask(table["area"])
        name = dna_column(table)
        if name:
            mask = mask & _mad_mask(table[name])
    else:
        mask = _doublet_mask(table, min_area)

    kept = table.loc[mask].reset_index(drop=True)
    return QCResult(method, before, int(len(kept)), None, kept, _tally(mask))


def synthetic_cells() -> pd.DataFrame:
    ok = pd.DataFrame(
        {
            "cell_id": [f"ok_{i}" for i in range(20)],
            "sample_id": ["synthetic"] * 20,
            "area": np.full(20, 40.0),
            "intensity_DNA": np.full(20, 80.0),
            "intensity_CD3": np.linspace(10, 30, 20),
        }
    )
    extras = pd.DataFrame(
        {
            "cell_id": ["debris_1", "debris_2", "giant_1", "dim_1", "doublet_1"],
            "sample_id": ["synthetic"] * 5,
            "area": [5.0, 8.0, 400.0, 40.0, 120.0],
            "intensity_DNA": [70.0, 65.0, 90.0, 1.0, 200.0],
            "intensity_CD3": [5.0, 6.0, 12.0, 8.0, 18.0],
        }
    )
    return pd.concat([ok, extras], ignore_index=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="IMC 细胞质控（多种方法）")
    parser.add_argument("--input", help="cells_segment.csv")
    parser.add_argument("--output-dir")
    parser.add_argument("--method", default="combined", help="方法名，或 all")
    parser.add_argument("--min-area", type=float, default=20)
    parser.add_argument("--max-area-factor", type=float, default=3.0)
    parser.add_argument("--min-intensity-pct", type=float, default=0.01)
    parser.add_argument("--synthetic", action="store_true")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args(argv)

    if args.list:
        for name, info in METHODS.items():
            print(f"  {name:10} {info['name']} — {info['description']}")
        return 0

    if not args.output_dir:
        print("需要 --output-dir", file=sys.stderr)
        return 2
    if args.synthetic:
        cells = synthetic_cells()
    elif args.input:
        cells = pd.read_csv(args.input)
    else:
        print("需要 --input 或 --synthetic", file=sys.stderr)
        return 2

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    names = list(METHODS) if args.method == "all" else [args.method]
    summaries = []
    for name in names:
        result = run(
            cells,
            name,
            min_area=args.min_area,
            max_area_factor=args.max_area_factor,
            min_intensity_pct=args.min_intensity_pct,
        )
        result.cells.to_csv(out / f"cells_{name}.csv", index=False)
        report = result.summary()
        (out / f"qc_{name}.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
        summaries.append(report)
        print(f"  [{name}] {result.before} → {result.after} 细胞")

    (out / "qc_compare.json").write_text(json.dumps(summaries, indent=2, ensure_ascii=False))
    default = next(item for item in summaries if item["method"] == names[0])
    if "combined" in names:
        default = next(item for item in summaries if item["method"] == "combined")
        pd.read_csv(out / "cells_combined.csv").to_csv(out / "cells_qc.csv", index=False)
    print(f"✅ QC 完成: {out} (default kept={default['kept']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
