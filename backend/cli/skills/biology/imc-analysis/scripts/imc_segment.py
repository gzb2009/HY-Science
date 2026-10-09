#!/usr/bin/env python3
"""IMC cell segmentation — multiple methods, one image in, labeled mask out.

Classical methods always run with numpy/scipy/skimage.
Deep-learning methods (StarDist / Cellpose / Mesmer) run only when the
package actually loads; they do not silently pretend to succeed.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy import ndimage

try:
    import tifffile
except ImportError as exc:
    raise ImportError("需要 tifffile: pip install tifffile") from exc

try:
    from skimage import measure
    from skimage.feature import blob_log, peak_local_max
    from skimage.filters import threshold_li, threshold_local, threshold_otsu
    from skimage.morphology import disk, h_maxima, opening, remove_small_objects
    from skimage.segmentation import watershed
except ImportError as exc:
    raise ImportError("需要 scikit-image: pip install scikit-image") from exc


METHODS = {
    "otsu": {
        "name": "Otsu + watershed",
        "kind": "classical",
        "description": "全局 Otsu 阈值后距离变换分水岭，适合对比度均匀的核通道。",
    },
    "li": {
        "name": "Li + watershed",
        "kind": "classical",
        "description": "Li 最小交叉熵阈值 + 分水岭，弱染色核比 Otsu 更稳。",
    },
    "adaptive": {
        "name": "Adaptive + watershed",
        "kind": "classical",
        "description": "局部阈值 + 分水岭，适合光照/背景不均的 IMC 核通道。",
    },
    "log": {
        "name": "LoG blob + watershed",
        "kind": "classical",
        "description": "Laplacian-of-Gaussian 检测核中心再分水岭，适合类圆形核。",
    },
    "hmax": {
        "name": "H-maxima + watershed",
        "kind": "classical",
        "description": "h-maxima 压峰后取种子分水岭，减少过分割。",
    },
    "stardist": {
        "name": "StarDist",
        "kind": "deep",
        "description": "深度学习核分割，IMC/IF 类圆形核首选。pip install stardist",
    },
    "cellpose": {
        "name": "Cellpose",
        "kind": "deep",
        "description": "通用细胞/核分割，形态不规则时使用。pip install cellpose",
    },
    "mesmer": {
        "name": "DeepCell Mesmer",
        "kind": "deep",
        "description": "组织级核+膜分割。pip install deepcell",
    },
}


@dataclass
class SegmentResult:
    requested: str
    method: str
    available: bool
    n_cells: int
    error: str | None
    labels: np.ndarray

    def summary(self):
        return {
            "requested": self.requested,
            "method": self.method,
            "available": self.available,
            "n_cells": self.n_cells,
            "error": self.error,
        }


def normalize(dna: np.ndarray) -> np.ndarray:
    dna = np.asarray(dna, dtype=np.float32)
    low, high = np.percentile(dna, (1, 99.5))
    if high <= low:
        return np.zeros_like(dna)
    return np.clip((dna - low) / (high - low), 0, 1)


def _foreground(dna: np.ndarray, threshold: float, min_area: int) -> np.ndarray:
    mask = dna > threshold
    mask = opening(mask, disk(1))
    return remove_small_objects(mask, min_size=max(min_area, 8))


def _watershed(mask: np.ndarray, seeds: np.ndarray | None = None, min_distance: int = 6) -> np.ndarray:
    if not mask.any():
        return np.zeros(mask.shape, dtype=np.int32)
    dist = ndimage.distance_transform_edt(mask)
    if seeds is None:
        coords = peak_local_max(dist, min_distance=min_distance, labels=mask, exclude_border=False)
        seeds = np.zeros(mask.shape, dtype=np.int32)
        for index, (row, col) in enumerate(coords, 1):
            seeds[row, col] = index
    if seeds.max() == 0:
        seeds, _ = ndimage.label(mask)
    return watershed(-dist, seeds, mask=mask).astype(np.int32)


def segment_otsu(dna: np.ndarray, min_area: int = 20) -> np.ndarray:
    scaled = normalize(dna)
    positive = scaled[scaled > 0]
    threshold = float(threshold_otsu(positive)) if positive.size else 0.5
    return _watershed(_foreground(scaled, threshold, min_area))


def segment_li(dna: np.ndarray, min_area: int = 20) -> np.ndarray:
    scaled = normalize(dna)
    positive = scaled[scaled > 0]
    threshold = float(threshold_li(positive)) if positive.size else 0.4
    return _watershed(_foreground(scaled, threshold, min_area))


def segment_adaptive(dna: np.ndarray, min_area: int = 20, block: int = 31) -> np.ndarray:
    scaled = normalize(dna)
    size = max(3, block if block % 2 else block + 1)
    local = threshold_local(scaled, block_size=size, offset=0.02)
    return _watershed(_foreground(scaled, local, min_area))


def segment_log(dna: np.ndarray, min_area: int = 20, max_sigma: float = 8.0) -> np.ndarray:
    scaled = normalize(dna)
    blobs = blob_log(scaled, min_sigma=2.0, max_sigma=max_sigma, num_sigma=8, threshold=0.08)
    seeds = np.zeros(scaled.shape, dtype=np.int32)
    for index, (row, col, _) in enumerate(blobs, 1):
        seeds[int(row), int(col)] = index
    positive = scaled[scaled > 0]
    threshold = float(threshold_otsu(positive)) if positive.size else 0.4
    return _watershed(_foreground(scaled, threshold, min_area), seeds=seeds)


def segment_hmax(dna: np.ndarray, min_area: int = 20, h: float = 0.12) -> np.ndarray:
    scaled = normalize(dna)
    peaks = h_maxima(scaled, h)
    seeds, _ = ndimage.label(peaks)
    positive = scaled[scaled > 0]
    threshold = float(threshold_otsu(positive)) if positive.size else 0.4
    return _watershed(_foreground(scaled, threshold, min_area), seeds=seeds)


def segment_stardist(dna: np.ndarray) -> np.ndarray:
    from stardist.models import StarDist2D
    from csbdeep.utils import normalize as csb_normalize

    model = StarDist2D.from_pretrained("2D_versatile_fluo")
    labels, _ = model.predict_instances(csb_normalize(dna.astype(np.float32)), n_tiles=1)
    return np.asarray(labels, dtype=np.int32)


def _cellpose_predict(model, dna: np.ndarray, diameter: float | None):
    infer = getattr(model, "eval")
    return infer(dna.astype(np.float32), diameter=diameter, channels=[0, 0])


def segment_cellpose(dna: np.ndarray, diameter: float | None = None) -> np.ndarray:
    from cellpose import models

    if hasattr(models, "Cellpose"):
        model = models.Cellpose(gpu=False, model_type="nuclei")
        masks, *_ = _cellpose_predict(model, dna, diameter)
        return np.asarray(masks, dtype=np.int32)
    model = models.CellposeModel(gpu=False, model_type="nuclei")
    masks, *_ = _cellpose_predict(model, dna, diameter)
    return np.asarray(masks, dtype=np.int32)


def segment_mesmer(dna: np.ndarray, membrane: np.ndarray | None = None) -> np.ndarray:
    from deepcell.applications import Mesmer

    wall = membrane if membrane is not None and membrane.shape == dna.shape else dna
    stacked = np.stack([dna, wall], axis=-1)[None, ...]
    labels = np.asarray(Mesmer().predict(stacked, image_mpp=0.5))
    if labels.ndim == 4:
        return labels[0, :, :, 0].astype(np.int32)
    if labels.ndim == 3:
        return labels[0].astype(np.int32)
    raise ValueError(f"Mesmer 输出 shape 不是 (1,H,W[,C]): {labels.shape}")


RUNNERS = {
    "otsu": segment_otsu,
    "li": segment_li,
    "adaptive": segment_adaptive,
    "log": segment_log,
    "hmax": segment_hmax,
    "stardist": segment_stardist,
    "cellpose": segment_cellpose,
    "mesmer": segment_mesmer,
}


def probe(method: str) -> str | None:
    if method not in RUNNERS:
        return f"未知方法: {method}"
    if METHODS[method]["kind"] == "classical":
        return None
    try:
        if method == "stardist":
            import stardist  # noqa: F401
        elif method == "cellpose":
            from cellpose import models  # noqa: F401
        elif method == "mesmer":
            import deepcell  # noqa: F401
    except Exception as exc:
        return str(exc)
    return None


def available() -> dict[str, bool]:
    return {name: probe(name) is None for name in METHODS}


def run(
    dna: np.ndarray,
    method: str,
    fallback: str | None = None,
    min_area: int = 20,
    membrane: np.ndarray | None = None,
    diameter: float | None = None,
) -> SegmentResult:
    if method not in RUNNERS:
        raise ValueError(f"未知分割方法: {method}，可用: {', '.join(METHODS)}")
    reason = probe(method)
    if reason:
        if not fallback:
            empty = np.zeros(np.asarray(dna).shape, dtype=np.int32)
            return SegmentResult(method, method, False, 0, reason, empty)
        result = run(dna, fallback, fallback=None, min_area=min_area, membrane=membrane, diameter=diameter)
        result.requested = method
        result.error = f"{method} unavailable ({reason}); used {fallback}"
        return result

    kwargs = {}
    if method in {"otsu", "li", "adaptive", "log", "hmax"}:
        kwargs["min_area"] = min_area
    if method == "cellpose" and diameter is not None:
        kwargs["diameter"] = diameter
    if method == "mesmer" and membrane is not None:
        kwargs["membrane"] = membrane
    labels = RUNNERS[method](np.asarray(dna, dtype=np.float32), **kwargs)
    labels = labels.astype(np.int32)
    return SegmentResult(method, method, True, int(labels.max()), None, labels)


def read_image(path: Path) -> np.ndarray:
    img = tifffile.imread(path).astype(np.float32)
    if img.ndim == 2:
        return img[np.newaxis, ...]
    if img.ndim != 3:
        raise ValueError(f"{path.name}: 仅支持 2D 或 (C,H,W) TIFF，实际 {img.shape}")
    return img


def extract_cells(img: np.ndarray, labels: np.ndarray, markers: list[str], min_area: int = 20):
    def channel_means(regionmask, intensity_image):
        return np.mean(intensity_image[regionmask], axis=0)

    props = measure.regionprops_table(
        labels,
        intensity_image=np.moveaxis(img, 0, -1),
        properties=["label", "centroid", "area"],
        extra_properties=(channel_means,),
    )
    import pandas as pd

    cells = pd.DataFrame(props)
    rename = {"label": "cell_id", "centroid-0": "y", "centroid-1": "x", "area": "area"}
    for index in range(img.shape[0]):
        name = markers[index] if index < len(markers) else f"ch{index}"
        rename[f"channel_means-{index}"] = f"intensity_{name}"
    cells = cells.rename(columns=rename)
    return cells[cells["area"] >= min_area].reset_index(drop=True)


def write_panel(path: Path, markers: list[str]):
    import pandas as pd

    pd.DataFrame({"channel": range(len(markers)), "marker": markers}).to_csv(path, index=False)


def synthetic_imc(path: Path, size: int = 128, n_cells: int = 9):
    """Write a multi-channel IMC-like TIFF with round DNA nuclei."""
    yy, xx = np.mgrid[0:size, 0:size]
    dna = np.zeros((size, size), dtype=np.float32)
    membrane = np.zeros((size, size), dtype=np.float32)
    grid = int(round(n_cells ** 0.5))
    step = size // (grid + 1)
    centers = [(step * (row + 1), step * (col + 1)) for row in range(grid) for col in range(grid)]
    for cy, cx in centers[:n_cells]:
        radius2 = (yy - cy) ** 2 + (xx - cx) ** 2
        dna = np.maximum(dna, np.clip(220.0 - 3.2 * radius2, 0, 255))
        ring = np.exp(-((np.sqrt(radius2) - 7) ** 2) / 4.0)
        membrane = np.maximum(membrane, ring * 180.0)
    img = np.zeros((5, size, size), dtype=np.uint16)
    img[0] = dna.astype(np.uint16)
    img[1] = np.clip(membrane + dna * 0.05, 0, 65535).astype(np.uint16)
    img[2] = np.clip(40 + dna * 0.08, 0, 65535).astype(np.uint16)
    img[3] = np.clip(20 + membrane * 0.2, 0, 65535).astype(np.uint16)
    img[4] = np.clip(15 + dna * 0.04, 0, 65535).astype(np.uint16)
    tifffile.imwrite(path, img, photometric="minisblack")
    return path


def _save_result(out: Path, sample: str, method: str, labels: np.ndarray, cells, report: dict):
    mask_dir = out / "masks"
    mask_dir.mkdir(parents=True, exist_ok=True)
    tifffile.imwrite(mask_dir / f"{sample}_{method}_mask.tiff", labels.astype(np.uint32))
    cells.to_csv(out / f"cells_{method}.csv", index=False)
    (out / f"segment_{method}.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="IMC 细胞分割（多种方法）")
    parser.add_argument("--input", help="单张 TIFF，或配合 --synthetic 忽略")
    parser.add_argument("--input-dir", help="TIFF 目录")
    parser.add_argument("--output-dir")
    parser.add_argument("--panel", help="panel.csv，可选")
    parser.add_argument("--method", default="otsu", help="方法名，或 all")
    parser.add_argument("--nucleus-channel", type=int, default=0)
    parser.add_argument("--membrane-channel", type=int, default=None)
    parser.add_argument("--min-area", type=int, default=20)
    parser.add_argument("--fallback", default=None, help="深度学习不可用时回退的方法")
    parser.add_argument("--synthetic", action="store_true")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args(argv)

    if args.list:
        ready = available()
        for name, info in METHODS.items():
            flag = "ready" if ready[name] else "unavailable"
            print(f"  {name:10} {flag:12} {info['name']} — {info['description']}")
        return 0

    if not args.output_dir:
        print("需要 --output-dir", file=sys.stderr)
        return 2
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    if args.synthetic:
        sample_path = out / "synthetic.tiff"
        synthetic_imc(sample_path)
        files = [sample_path]
        markers = ["DNA", "CD3", "CD8", "FOXP3", "Ki67"]
        write_panel(out / "panel.csv", markers)
    else:
        if args.input:
            files = [Path(args.input)]
        elif args.input_dir:
            root = Path(args.input_dir)
            files = sorted(root.glob("*.tiff")) + sorted(root.glob("*.tif"))
        else:
            print("需要 --input、--input-dir 或 --synthetic", file=sys.stderr)
            return 2
        markers = []
        if args.panel:
            import pandas as pd

            panel = pd.read_csv(args.panel)
            markers = panel["marker"].tolist()

    names = list(METHODS) if args.method == "all" else [args.method]
    summaries = []
    for path in files:
        img = read_image(path)
        dna = img[args.nucleus_channel]
        membrane = img[args.membrane_channel] if args.membrane_channel is not None else None
        for name in names:
            result = run(
                dna,
                name,
                fallback=args.fallback,
                min_area=args.min_area,
                membrane=membrane,
            )
            cells = extract_cells(img, result.labels, markers, min_area=args.min_area)
            cells["sample_id"] = path.stem
            cells["cell_id"] = [f"{path.stem}_{i}" for i in range(len(cells))]
            report = {
                **result.summary(),
                "sample": path.stem,
                "kept": int(len(cells)),
                "shape": list(dna.shape),
            }
            _save_result(out, path.stem, result.method, result.labels, cells, report)
            summaries.append(report)
            state = "ok" if result.available else "skip"
            print(f"  [{state}] {path.stem} {name}: {report['kept']} cells")

    (out / "segment_compare.json").write_text(json.dumps(summaries, indent=2, ensure_ascii=False))
    print(f"✅ 分割完成: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
