#!/usr/bin/env python3

import json
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import imc_qc
import imc_pipeline


class TestQC(unittest.TestCase):
    def test_six_methods_are_registered(self):
        self.assertEqual(set(imc_qc.METHODS), {"area", "dna", "combined", "iqr", "mad", "doublet"})

    def test_combined_matches_legacy_extreme_filter(self):
        cells = pd.DataFrame(
            {
                "area": [5, 20, 20, 1000],
                "intensity_DNA1": [0, 1, 2, 100],
            }
        )
        result = imc_qc.run(cells, "combined", min_intensity_pct=0.25, max_area_factor=2)
        self.assertEqual(result.cells["area"].tolist(), [20, 20])
        self.assertIsNone(result.error)

    def test_methods_diverge_on_synthetic_outliers(self):
        cells = imc_qc.synthetic_cells()
        kept = {name: set(imc_qc.run(cells, name).cells["cell_id"]) for name in imc_qc.METHODS}
        self.assertNotIn("debris_1", kept["area"])
        self.assertNotIn("giant_1", kept["area"])
        self.assertNotIn("dim_1", kept["dna"])
        self.assertIn("debris_1", kept["dna"])
        self.assertNotIn("doublet_1", kept["doublet"])
        self.assertIn("ok_0", kept["combined"])
        self.assertTrue(len(kept["iqr"]) < len(cells))
        self.assertTrue(len(kept["mad"]) < len(cells))

    def test_empty_and_missing_area(self):
        empty = imc_qc.run(pd.DataFrame(), "combined")
        self.assertEqual(empty.error, "empty")
        missing = imc_qc.run(pd.DataFrame({"intensity_DNA": [1.0]}), "combined")
        self.assertEqual(missing.error, "missing area")
        self.assertEqual(len(missing.cells), 1)

    def test_pipeline_qc_uses_combined(self):
        tmp = Path(tempfile.mkdtemp())
        panel = tmp / "panel.csv"
        panel.write_text("channel,marker\n0,DNA\n")
        (tmp / "in").mkdir()
        pipe = imc_pipeline.IMCPipeline(str(tmp / "in"), str(panel), str(tmp / "out"), segmenter="otsu")
        pipe.data.cells = pd.DataFrame({"area": [5, 20, 20, 1000], "intensity_DNA1": [0, 1, 2, 100]})
        pipe.qc_filter(min_intensity_pct=0.25, max_area_factor=2)
        self.assertEqual(pipe.data.cells["area"].tolist(), [20, 20])

    def test_compare_cli_writes_report(self):
        tmp = Path(tempfile.mkdtemp())
        self.assertEqual(imc_qc.main(["--list"]), 0)
        code = imc_qc.main(["--synthetic", "--output-dir", str(tmp), "--method", "all"])
        self.assertEqual(code, 0)
        report = json.loads((tmp / "qc_compare.json").read_text())
        self.assertEqual({row["method"] for row in report}, set(imc_qc.METHODS))
        self.assertTrue((tmp / "cells_qc.csv").exists())
        combined = next(row for row in report if row["method"] == "combined")
        self.assertLess(combined["after"], combined["before"])


if __name__ == "__main__":
    unittest.main()
