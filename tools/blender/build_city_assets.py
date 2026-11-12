"""Turn the scanned Poly Haven tree into a game-ready model.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_city_assets.py

Input:  assets/polyhaven/island_tree_02/ (fetched by tools/assets/fetch_polyhaven.py)
Output: public/models/nature/tree_island.glb and tree_island_far.glb

The scan has about a million triangles, most of them individual leaves and twigs.
The game draws dozens of trees at once, so the trunk is simplified, a fraction of
the leaves and twigs is kept, and the kept ones are enlarged so the crown stays
as full as the original.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "polyhaven" / "island_tree_02" / "island_tree_02.gltf"
OUTPUT_DIR = ROOT / "public" / "models" / "nature"
PREVIEW = ROOT / "assets" / "polyhaven" / "tree_island_preview.png"

# Two levels of detail: the full tree up close and a light one in the distance.
# material name suffix -> (fraction of loose parts kept, enlargement, triangle budget)
VARIANTS = {
    "tree_island.glb": {"leaves": (0.10, 3.3, 11000), "branches": (0.18, 1.6, 4500), "trunk": 1500},
    "tree_island_far.glb": {"leaves": (0.05, 4.8, 5000), "branches": (0.07, 2.2, 1400), "trunk": 500},
}
FOLIAGE = ("leaves", "branches")
TEXTURE_SIZE = 512


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def thin_and_enlarge(obj, keep, scale, seed):
    """Keep a random share of the mesh's loose parts and grow each about its centre."""
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.verts.ensure_lookup_table()
    rng = random.Random(seed)
    seen = set()
    doomed = []
    for start in mesh.verts:
        if start.index in seen:
            continue
        island = [start]
        seen.add(start.index)
        cursor = 0
        while cursor < len(island):
            for edge in island[cursor].link_edges:
                other = edge.other_vert(island[cursor])
                if other.index not in seen:
                    seen.add(other.index)
                    island.append(other)
            cursor += 1
        if rng.random() > keep:
            doomed.extend(island)
            continue
        centre = sum((v.co for v in island), start.co * 0) / len(island)
        for vert in island:
            vert.co = centre + (vert.co - centre) * scale
    bmesh.ops.delete(mesh, geom=doomed, context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()


def decimate(obj, budget):
    count = triangles(obj)
    if count <= budget:
        return
    modifier = obj.modifiers.new("Reduce", "DECIMATE")
    modifier.ratio = budget / count
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def shrink_textures():
    for image in bpy.data.images:
        if image.size[0] > TEXTURE_SIZE:
            image.scale(TEXTURE_SIZE, TEXTURE_SIZE)


def simplify_materials():
    """Colour only: normal and roughness maps cost download size for little gain on a tree."""
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        nodes = material.node_tree.nodes
        principled = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not principled:
            continue
        for name in ("Normal", "Roughness", "Metallic"):
            socket = principled.inputs.get(name)
            for link in list(socket.links) if socket else []:
                material.node_tree.links.remove(link)
        principled.inputs["Roughness"].default_value = 0.85
        principled.inputs["Metallic"].default_value = 0.0
        material.blend_method = "OPAQUE" if hasattr(material, "blend_method") else None
        # Game-facing names: Tree_Trunk, Tree_Leaves, Tree_Branches.
        part = material.name.rsplit("_", 1)[-1]
        material.name = f"Tree_{part.capitalize() if part in FOLIAGE else 'Trunk'}"


def render_preview():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.film_transparent = False
    camera_data = bpy.data.cameras.new("Preview")
    camera = bpy.data.objects.new("Preview", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (7.5, -7.5, 2.6)
    camera.rotation_euler = (1.45, 0, 0.785)
    scene.camera = camera
    scene.render.filepath = str(PREVIEW)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera)


def build(filename, variant):
    output = OUTPUT_DIR / filename
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    source = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bpy.context.view_layer.objects.active = source
    source.select_set(True)
    print(f"source: {triangles(source):,} triangles")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for index, obj in enumerate(parts):
        material = obj.data.materials[0].name
        kind = material.rsplit("_", 1)[-1]
        before = triangles(obj)
        if kind in FOLIAGE:
            keep, scale, budget = variant[kind]
            thin_and_enlarge(obj, keep, scale, seed=index + 7)
            decimate(obj, budget)
        else:
            decimate(obj, variant["trunk"])
        print(f"  {material}: {before:,} -> {triangles(obj):,} triangles")

    shrink_textures()
    simplify_materials()
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    tree = bpy.context.view_layer.objects.active
    tree.name = "Tree_Island"
    bpy.ops.object.shade_smooth()
    print(f"result: {triangles(tree):,} triangles")

    if "--preview" in sys.argv and filename == "tree_island.glb":
        render_preview()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_yup=True,
                              export_image_format="JPEG", export_jpeg_quality=80)
    print(f"exported {output.relative_to(ROOT)} ({output.stat().st_size:,} bytes)")


def main():
    for filename, variant in VARIANTS.items():
        build(filename, variant)


if __name__ == "__main__":
    main()
