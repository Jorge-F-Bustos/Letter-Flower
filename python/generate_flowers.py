"""Export the original flower.py particle model for the Canvas renderer."""

import importlib.util
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "generated" / "flowers.json"


def load_reference():
    for folder in ("cositas python", "cositas pyhton"):
        path = ROOT.parent / folder / "flower.py"
        if path.is_file():
            spec = importlib.util.spec_from_file_location("original_flower", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    raise FileNotFoundError("Place the original flower.py in ../cositas python/ or ../cositas pyhton/")


def rows(*columns):
    return np.round(np.column_stack(columns), 5).tolist()


def main():
    plant = load_reference().Plant(1000, 1000)
    model = {
        "stem": rows(plant.stem["s"], plant.stem["lat"], *plant.stem["live"].T, plant.stem["rad"]),
        "leaves": rows(plant.leaf["lid"], plant.leaf["u"], plant.leaf["v"], *plant.leaf["live"].T, plant.leaf["rad"]),
        "head": rows(*[plant.head[key] for key in ("th", "aj", "pj", "wj", "u", "v", "ac", "ao", "kc", "ko", "L", "wc", "wo")],
                     *plant.head["live"].T, plant.head["rn"], plant.head["rad"], plant.head["sp"]),
        "stamens": rows(plant.st["th"], plant.st["beta"], plant.st["ell"], plant.st["t"], *plant.st["live"].T, plant.st["rad"]),
        "halo": rows(plant.halo["a"], plant.halo["r"], plant.halo["b"], plant.halo["fl"]),
        "ring": rows(plant.ring["cf"], plant.ring["cj"], plant.ring["rho"], plant.ring["a"], plant.ring["fl"]),
        "spark": rows(plant.spark["a"], plant.spark["rho"], plant.spark["ph"], plant.spark["sp"], plant.spark["rad"], plant.spark["hue"]),
    }
    assert len(model["head"]) == 20620 and len(model["stem"]) == 3600 and len(model["leaves"]) == 3600
    assert all(np.isfinite(value).all() for value in (plant.head["u"], plant.stem["s"], plant.leaf["u"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"version": 3, "bounds": [0, 0, 1000, 1000], "model": model}, separators=(",", ":")), encoding="utf-8")
    print(f"Exported original flower.py model: {len(model['head']):,} petals, {len(model['stem']):,} stem, {len(model['leaves']):,} leaf particles")


if __name__ == "__main__":
    main()
