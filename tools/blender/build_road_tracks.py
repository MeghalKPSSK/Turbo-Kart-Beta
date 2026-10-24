"""Build the eight original Blender race environments used by Turbo Road League.

Run this from Blender's Python Console, or with Blender's Python runner:

    exec(compile(open('/path/to/build_road_tracks.py').read(), '/path/to/build_road_tracks.py', 'exec'), {'__name__': '__main__', '__file__': '/path/to/build_road_tracks.py'})

The script creates editable source at assets/blender/turbo_road_tracks.blend,
then exports the eight course GLBs and their matching route metadata.
"""

from __future__ import annotations

import sys
import importlib
from contextlib import ExitStack
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
BLENDER_TOOLS = Path(__file__).resolve().parent
if str(BLENDER_TOOLS) not in sys.path:
    sys.path.insert(0, str(BLENDER_TOOLS))

import build_assets as builder
builder = importlib.reload(builder)


TRACKS = [
    ("rovers_rift", "mountain_adventure", "long", 4),
    ("canyon_springs", "canyon", "medium", 2),
    ("jungle_falls", "jungle", "short", 1),
    ("sunset_shores", "coastal_sunset", "short", 1),
    ("frost_harbor", "ice", "medium", 2),
    ("rivet_factory", "industrial", "medium", 2),
    ("coral_bay", "island", "short", 1),
    ("ember_crater", "volcano", "long", 4),
]


def consolidate_track_mesh(collection):
    """Apply Blender modifiers and join each course into one efficient mesh."""
    mesh_objects = [obj for obj in collection.objects
                    if obj.type in {"MESH", "FONT"} and not obj.name.startswith("CoinPickup_")]
    if not mesh_objects:
        raise RuntimeError(f"Course {collection.name} did not create any geometry")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    bpy.ops.object.convert(target="MESH")
    mesh_objects = [obj for obj in collection.objects
                    if obj.type == "MESH" and not obj.name.startswith("CoinPickup_")]
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = f"{collection.name} - Combined Blender Geometry"
    bpy.context.view_layer.update()


def main():
    source_dir = ROOT / "assets" / "blender"
    export_dir = ROOT / "public" / "models" / "blender"
    source_dir.mkdir(parents=True, exist_ok=True)
    export_dir.mkdir(parents=True, exist_ok=True)
    builder.EXPORT_DIR = export_dir
    builder.TRACK_CATALOG = TRACKS

    window = bpy.context.window
    original_scene = window.scene if window else bpy.context.scene
    asset_scene = bpy.data.scenes.new("Turbo Road League - Race Environments")
    if window:
        window.scene = asset_scene

    try:
        with ExitStack() as stack:
            if not window:
                stack.enter_context(bpy.context.temp_override(
                    scene=asset_scene, view_layer=asset_scene.view_layers[0]
                ))

            collections = []
            for definition in TRACKS:
                track_id = definition[0]
                print(f"Building Blender environment: {track_id}")
                collection = builder.build_track(*definition)
                consolidate_track_mesh(collection)
                collections.append((collection, track_id))

            bpy.ops.object.select_all(action="DESELECT")
            source_file = source_dir / "turbo_road_tracks.blend"
            bpy.data.libraries.write(str(source_file), {asset_scene}, fake_user=True,
                                     compress=True, path_remap="RELATIVE")
            print(f"Saved editable Blender source: {source_file}")

            for collection, track_id in collections:
                window = bpy.context.window
                saved_scene = window.scene if window else None
                export_scene = bpy.data.scenes.new(f"Export - {track_id}")
                export_scene.collection.children.link(collection)
                if window:
                    window.scene = export_scene
                try:
                    with bpy.context.temp_override(
                        scene=export_scene, view_layer=export_scene.view_layers[0]
                    ):
                        builder.export_collection(collection, export_dir / f"{track_id}.glb")
                finally:
                    if window and saved_scene:
                        window.scene = saved_scene
                    bpy.data.scenes.remove(export_scene)
            print(f"Built {len(collections)} original Blender race environments.")
    finally:
        if window and original_scene:
            window.scene = original_scene


if __name__ == "__main__":
    main()
