#!/usr/bin/env python3
"""Geoform ↔ WorldEngine bridge.

Serves Mindwerks WorldEngine worlds as JSON for the Geoform UI.
Uses the vendored package at vendor/worldengine.
"""

from __future__ import annotations

import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "worldengine"
sys.path.insert(0, str(VENDOR))

from worldengine.generation import generate_world, initialize_ocean_and_thresholds  # noqa: E402
from worldengine.model.world import GenerationParameters, Size, World  # noqa: E402
from worldengine.plates import world_gen  # noqa: E402
from worldengine.step import Step  # noqa: E402

HOST = "127.0.0.1"
PORT = 8765


def _norm(arr: np.ndarray, ocean_mask: np.ndarray | None = None) -> list[float]:
    data = np.asarray(arr, dtype=np.float64)
    lo = float(np.min(data))
    hi = float(np.max(data))
    span = hi - lo if hi > lo else 1.0
    out = (data - lo) / span
    return out.astype(np.float32).reshape(-1).tolist()


def _norm_signed(arr: np.ndarray) -> list[float]:
    """Map roughly [-1,1] or arbitrary range into [0,1]."""
    data = np.asarray(arr, dtype=np.float64)
    lo = float(np.min(data))
    hi = float(np.max(data))
    span = hi - lo if hi > lo else 1.0
    out = (data - lo) / span
    return out.astype(np.float32).reshape(-1).tolist()


def serialize_world(w: World) -> dict[str, Any]:
    elev = w.layers["elevation"].data
    ocean = w.layers["ocean"].data.astype(bool)
    sea_th = float(w.layers["elevation"].thresholds[0][1])

    # Normalize elevation so sea threshold ≈ 0.42 for the frontend renderer
    elev_f = elev.astype(np.float64)
    land = elev_f[~ocean]
    if land.size:
        land_min = float(land.min())
        land_max = float(land.max())
    else:
        land_min, land_max = sea_th, sea_th + 1.0
    sea_target = 0.42
    out_elev = np.empty_like(elev_f, dtype=np.float32)
    # ocean cells below sea
    depth = np.clip((sea_th - elev_f) / max(sea_th - float(elev_f.min()), 1e-6), 0, 1)
    out_elev[ocean] = sea_target * (1.0 - depth[ocean] * 0.85)
    # land cells above sea
    land_span = max(land_max - sea_th, 1e-6)
    out_elev[~ocean] = sea_target + (1.0 - sea_target) * np.clip(
        (elev_f[~ocean] - sea_th) / land_span, 0, 1
    )

    plates = w.layers["plates"].data.astype(np.int16).reshape(-1).tolist()
    temp = _norm_signed(w.layers["temperature"].data)
    # Prefer humidity for moisture when present; else precipitation
    if "humidity" in w.layers:
        moist = _norm_signed(w.layers["humidity"].data)
    else:
        moist = _norm_signed(w.layers["precipitation"].data)

    flux = np.asarray(w.layers["watermap"].data, dtype=np.float64)
    # Scale flux into a frontend-friendly range (rivers draw above ~3.8)
    if flux.max() > 0:
        flux_scaled = (flux / flux.max()) * 18.0
    else:
        flux_scaled = flux
    flux_list = flux_scaled.astype(np.float32).reshape(-1).tolist()

    biomes = [str(b) for b in w.layers["biome"].data.reshape(-1).tolist()]
    # Force ocean label on ocean mask
    flat_ocean = ocean.reshape(-1)
    for i, is_o in enumerate(flat_ocean):
        if is_o:
            biomes[i] = "ocean"

    return {
        "engine": "worldengine",
        "width": int(w.width),
        "height": int(w.height),
        "seed": int(w.seed),
        "seaLevel": sea_target,
        "plateCount": int(w.layers["plates"].data.max()) + 1,
        "elev": out_elev.reshape(-1).tolist(),
        "plateId": plates,
        "temp": temp,
        "moist": moist,
        "flux": flux_list,
        "biome": biomes,
        "rawElevMin": float(elev_f.min()),
        "rawElevMax": float(elev_f.max()),
        "rawSeaThreshold": sea_th,
    }


def generate(seed: int, width: int, height: int, num_plates: int = 10) -> dict[str, Any]:
    width = int(np.clip(width, 64, 512))
    height = int(np.clip(height, 64, 512))
    num_plates = int(np.clip(num_plates, 4, 20))
    w = world_gen(
        name="geoform",
        width=width,
        height=height,
        seed=int(seed),
        num_plates=num_plates,
        step=Step.full(),
        verbose=False,
    )
    return serialize_world(w)


def recompute(
    seed: int,
    width: int,
    height: int,
    elev: list[float],
    plate_id: list[int],
    sea_level: float,
    raw_sea_threshold: float,
    raw_elev_min: float,
    raw_elev_max: float,
) -> dict[str, Any]:
    """Rebuild climate/hydrology/biomes from an edited normalized elevation map."""
    width, height = int(width), int(height)
    elev_n = np.asarray(elev, dtype=np.float64).reshape(height, width)
    plates = np.asarray(plate_id, dtype=np.uint16).reshape(height, width)

    # Invert frontend normalization back toward WorldEngine elevation scale
    sea_target = float(sea_level)
    raw = np.empty_like(elev_n)
    ocean_mask = elev_n < sea_target
    # ocean
    if ocean_mask.any():
        depth = 1.0 - np.clip(elev_n[ocean_mask] / max(sea_target, 1e-6), 0, 1)
        raw[ocean_mask] = raw_sea_threshold - depth * max(raw_sea_threshold - raw_elev_min, 0.2)
    # land
    land_mask = ~ocean_mask
    if land_mask.any():
        t = np.clip((elev_n[land_mask] - sea_target) / max(1.0 - sea_target, 1e-6), 0, 1)
        raw[land_mask] = raw_sea_threshold + t * max(raw_elev_max - raw_sea_threshold, 0.5)

    w = World(
        "geoform",
        Size(width, height),
        int(seed),
        GenerationParameters(int(plates.max()) + 1, 1.0, Step.full()),
    )
    w.elevation = (raw, None)
    w.plates = plates
    initialize_ocean_and_thresholds(w, ocean_level=raw_sea_threshold)
    # Climate/rivers only — skip erosion so painted ridges are not shaved flat.
    climate_step = Step("recompute")
    climate_step.include_precipitations = True
    climate_step.include_erosion = True
    climate_step.include_biome = True
    elev_keep = np.array(w.layers["elevation"].data, copy=True)
    generate_world(w, climate_step)
    w.layers["elevation"].data[:] = elev_keep
    payload = serialize_world(w)
    # Preserve calibration so further edits stay consistent
    payload["rawElevMin"] = float(raw.min())
    payload["rawElevMax"] = float(raw.max())
    payload["rawSeaThreshold"] = float(w.layers["elevation"].thresholds[0][1])
    # Prefer the painted/normalized elev the client sent (no re-stretch).
    payload["elev"] = elev_n.astype(np.float32).reshape(-1).tolist()
    payload["seaLevel"] = sea_target
    return payload


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[worldengine] " + (fmt % args) + "\n")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in ("/", "/health"):
            self._json(200, {"ok": True, "engine": "worldengine", "version": "0.20.0"})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        try:
            raw = self.rfile.read(length) if length else b"{}"
            data = json.loads(raw.decode("utf-8") or "{}")
        except Exception as exc:  # noqa: BLE001
            self._json(400, {"error": f"invalid json: {exc}"})
            return

        try:
            if path == "/api/generate":
                result = generate(
                    seed=int(data.get("seed", 1)),
                    width=int(data.get("width", 256)),
                    height=int(data.get("height", 128)),
                    num_plates=int(data.get("numPlates", 10)),
                )
                self._json(200, result)
                return
            if path == "/api/recompute":
                result = recompute(
                    seed=int(data["seed"]),
                    width=int(data["width"]),
                    height=int(data["height"]),
                    elev=data["elev"],
                    plate_id=data["plateId"],
                    sea_level=float(data.get("seaLevel", 0.42)),
                    raw_sea_threshold=float(data.get("rawSeaThreshold", 1.0)),
                    raw_elev_min=float(data.get("rawElevMin", 0.0)),
                    raw_elev_max=float(data.get("rawElevMax", 8.0)),
                )
                self._json(200, result)
                return
            self._json(404, {"error": "not found"})
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            self._json(500, {"error": str(exc)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"WorldEngine API on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
