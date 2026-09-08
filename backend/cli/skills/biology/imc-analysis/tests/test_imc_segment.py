#!/usr/bin/env python3

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import imc_segment


class TestMethods(unittest.TestCase):
    def test_list_cli_skips_output_dir(self):
        self.assertEqual(imc_segment.main(["--list"]), 0)

    def test_eight_methods_are_registered(self):
        self.assertEqual(
            set(imc_segment.METHODS),
            {"otsu", "li", "adaptive", "log", "hmax", "stardist", "cellpose", "mesmer"},
        )

    def test_classical_methods_find_synthetic_nuclei(self):
        tmp = Path(tempfile.mkdtemp())
        path = tmp / "sample.tiff"
        imc_segment.synthetic_imc(path, size=128, n_cells=9)
        img = imc_segment.read_image(path)
        dna = img[0]
        for name in ("otsu", "li", "adaptive", "log", "hmax"):
            result = imc_segment.run(dna, name, min_area=15)
            self.assertTrue(result.available, name)
            self.assertGreaterEqual(result.n_cells, 4, name)
            self.assertEqual(result.labels.shape, dna.shape)
            cells = imc_segment.extract_cells(img, result.labels, ["DNA", "CD3", "CD8", "FOXP3", "Ki67"], min_area=15)
            self.assertGreaterEqual(len(cells), 4, name)
            self.assertIn("intensity_DNA", cells.columns)

    def test_missing_deep_method_is_explicit(self):
        dna = np.zeros((32, 32), dtype=np.float32)
        result = imc_segment.run(dna, "stardist")
        if result.available:
            self.assertGreaterEqual(result.n_cells, 0)
            return
        self.assertFalse(result.available)
        self.assertIsNotNone(result.error)
        self.assertEqual(int(result.labels.max()), 0)

    def test_compare_cli_writes_report(self):
        tmp = Path(tempfile.mkdtemp())
        code = imc_segment.main(
            ["--synthetic", "--output-dir", str(tmp), "--method", "all", "--min-area", "15"]
        )
        self.assertEqual(code, 0)
        report = json.loads((tmp / "segment_compare.json").read_text())
        names = {row["requested"] for row in report}
        self.assertEqual(names, set(imc_segment.METHODS))
        classical = [row for row in report if row["requested"] in {"otsu", "li", "adaptive", "log", "hmax"}]
        self.assertTrue(all(row["available"] for row in classical))
        self.assertTrue(all(row["kept"] >= 4 for row in classical))


if __name__ == "__main__":
    unittest.main()
