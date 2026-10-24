"""Export course collections from an already-built Blender source file.

Run in Blender's Python Console after opening ``assets/blender/turbo_road_tracks.blend``.
This avoids rebuilding the heightfields when only the GLB export needs to be retried.
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
import build_assets as builder


TRACK_IDS = (
    "rovers_rift", "canyon_springs", "jungle_falls", "sunset_shores",
    "frost_harbor", "rivet_factory", "coral_bay", "ember_crater",
)


def main():
    export_dir = ROOT / "public" / "models" / "blender"
    export_dir.mkdir(parents=True, exist_ok=True)
    window = bpy.context.window
    original_scene = window.scene if window else bpy.context.scene
    for track_id in TRACK_IDS:
        collection = next((item for item in bpy.data.collections
                           if item.name.startswith(f"{track_id} - Blender Mountain Course")), None)
        if collection is None:
            raise RuntimeError(f"Missing saved Blender course collection: {track_id}")
        export_scene = bpy.data.scenes.new(f"Export - {track_id}")
        export_scene.collection.children.link(collection)
        try:
            if window:
                window.scene = export_scene
            with bpy.context.temp_override(scene=export_scene, view_layer=export_scene.view_layers[0]):
                builder.export_collection(collection, export_dir / f"{track_id}.glb")
        finally:
            if window and original_scene:
                window.scene = original_scene
            bpy.data.scenes.remove(export_scene)
    print(f"Exported {len(TRACK_IDS)} saved Blender race environments.")


if __name__ == "__main__":
    main()
