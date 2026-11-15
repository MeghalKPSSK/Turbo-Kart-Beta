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
# Terrain of the scenic circuits: colour maps only, blended by slope and height in the game.
TERRAIN = {
    "rock": "rock_face_03",
    "meadow": "aerial_grass_rock",
    "snow": "snow_02",
}
# game name -> Poly Haven sky. "puresky" images have no ground, so they suit any landscape.
SKIES = {
    "dusk": "learner_park",
    "day": "kloofendal_48d_partly_cloudy_puresky",
}
TREES = ["island_tree_02", "island_tree_01", "jacaranda_tree"]


def fetch_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as response:
        return json.load(response)


FETCHED = []


def download(url, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        return
    FETCHED.append(target)
    print(f"  {url.rsplit('/', 1)[-1]} -> {target.relative_to(ROOT)}")
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=600) as response, open(target, "wb") as handle:
        while chunk := response.read(1 << 20):
            handle.write(chunk)


def shrink(path, size, quality=80):
    """Resizes a newly downloaded image in place. Uses macOS ``sips``; skipped elsewhere."""
    if path not in FETCHED:
        return                      # already processed on an earlier run
    if not shutil.which("sips"):
        print(f"  sips not found: leaving {path.name} at its downloaded size")
        return
    subprocess.run(["sips", "-Z", str(size), "-s", "format", "jpeg", "-s", "formatOptions", str(quality), str(path), "--out", str(path)],
                   check=True, stdout=subprocess.DEVNULL)


def main():
    textures = ROOT / "public" / "textures"
    for name, asset in TEXTURES.items():
        print(f"texture {asset}")
        files = fetch_json(API + asset)
        for short, key in TEXTURE_MAPS.items():
            target = textures / f"{name}_{short}.jpg"
            download(files[key]["1k"]["jpg"]["url"], target)
            # Normal and roughness maps are halved: the difference is not visible at racing speed.
            shrink(target, 1024 if short == "diff" else 512)

    for name, asset in TERRAIN.items():
        print(f"terrain {asset}")
        files = fetch_json(API + asset)
        target = textures / f"{name}_diff.jpg"
        download(files["Diffuse"]["1k"]["jpg"]["url"], target)
        shrink(target, 1024)

    for name, asset in SKIES.items():
        print(f"sky {asset}")
        files = fetch_json(API + asset)
        download(files["hdri"]["1k"]["hdr"]["url"], ROOT / "public" / "sky" / f"{name}_1k.hdr")
        # The visible backdrop: the tone-mapped photograph, reduced to 4096 x 2048.
        backdrop = ROOT / "public" / "sky" / f"{name}_4k.jpg"
        download(files["tonemapped"]["url"], backdrop)
        shrink(backdrop, 4096, 82)

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
