"""Download the CC0 source assets the city routes use from Poly Haven (polyhaven.com).

    python3 tools/assets/fetch_polyhaven.py

Everything on Poly Haven is CC0: free for any use, no attribution required.

* Surface textures and the sky go straight into ``public/`` and are committed.
* The tree is a multi-million-polygon scan. Its raw files land in
  ``assets/polyhaven/`` (not committed); ``tools/blender/build_city_assets.py``
  reduces it to a game-ready model in ``public/models/nature/``.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = "https://api.polyhaven.com/files/"
HEADERS = {"User-Agent": "asset-fetch/1.0"}

# game name -> Poly Haven texture id
TEXTURES = {
    "asphalt": "asphalt_02",
    "pavement": "concrete_pavement",
    "brick": "brick_wall_001",
    "concrete": "concrete_wall_008",
    "plaster": "plaster_grey_04",
    "grass": "leafy_grass",
}
TEXTURE_MAPS = {"diff": "Diffuse", "nor_gl": "nor_gl", "rough": "Rough"}
SKY = "learner_park"
TREES = ["island_tree_02", "island_tree_01", "jacaranda_tree"]


def fetch_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as response:
        return json.load(response)


def download(url, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        return
    print(f"  {url.rsplit('/', 1)[-1]} -> {target.relative_to(ROOT)}")
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=600) as response, open(target, "wb") as handle:
        while chunk := response.read(1 << 20):
            handle.write(chunk)


def shrink_detail_maps(folder):
    """Normal and roughness maps are halved to 512 px: they cost download size and the
    difference is not visible at racing speed. Uses macOS ``sips``; skipped elsewhere."""
    if not shutil.which("sips"):
        print("  sips not found: leaving the detail maps at 1024 px")
        return
    for path in sorted(folder.glob("*.jpg")):
        size = "512" if path.stem.endswith(("_nor_gl", "_rough")) else "1024"
        subprocess.run(["sips", "-Z", size, "-s", "formatOptions", "80", str(path), "--out", str(path)],
                       check=True, stdout=subprocess.DEVNULL)


def main():
    textures = ROOT / "public" / "textures"
    for name, asset in TEXTURES.items():
        print(f"texture {asset}")
        files = fetch_json(API + asset)
        for short, key in TEXTURE_MAPS.items():
            entry = files[key]["1k"]["jpg"]
            download(entry["url"], textures / f"{name}_{short}.jpg")

    shrink_detail_maps(textures)

    print(f"sky {SKY}")
    files = fetch_json(API + SKY)
    download(files["hdri"]["1k"]["hdr"]["url"], ROOT / "public" / "sky" / "dusk_1k.hdr")
    download(files["tonemapped"]["url"], ROOT / "assets" / "polyhaven" / "sky" / "dusk_8k.jpg")

    for asset in TREES:
        print(f"model {asset}")
        files = fetch_json(API + asset)
        entry = files["gltf"]["1k"]["gltf"]
        folder = ROOT / "assets" / "polyhaven" / asset
        download(entry["url"], folder / f"{asset}.gltf")
        for relative, included in entry["include"].items():
            download(included["url"], folder / relative)
    return 0


if __name__ == "__main__":
    sys.exit(main())
