"""Turn the scanned Poly Haven trees into game-ready models.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_city_assets.py

Input:  assets/polyhaven/<scan>/ (fetched by tools/assets/fetch_polyhaven.py)
Output: public/models/nature/<name>.glb and <name>_far.glb for each species

The scans have one to four million triangles, most of them individual leaves and
twigs. The game draws dozens of trees at once, so the trunk is simplified, a
fraction of the leaves and twigs is kept, and the kept ones are enlarged so the
crown stays as full as the original. Add ``-- --preview`` to also render a
picture of each species into assets/polyhaven/.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "assets" / "polyhaven"
OUTPUT_DIR = ROOT / "public" / "models" / "nature"

# game name -> scan, the height (m) the model is brought to, and how its foliage is thinned
# for the near and far versions: (fraction of loose parts kept, enlargement, triangle budget).
# A tall tree has far more leaves than a small one, so it keeps a smaller share and enlarges
# them more. The game then scales every species by the same per-tree factor.
SPECIES = {
    "tree_island": {
        "scan": "island_tree_02", "height": None,
        "near": {"leaves": (0.10, 3.3, 11000), "branches": (0.18, 1.6, 4500), "trunk": 1500},
        "far": {"leaves": (0.05, 4.8, 5000), "branches": (0.07, 2.2, 1400), "trunk": 500},
    },
    "tree_round": {
        "scan": "island_tree_01", "height": 4.2,
        "near": {"leaves": (0.08, 3.4, 11000), "branches": (0.14, 1.7, 4500), "trunk": 1500},
        "far": {"leaves": (0.04, 5.0, 5000), "branches": (0.05, 2.4, 1400), "trunk": 500},
    },
    "tree_tall": {
        "scan": "jacaranda_tree", "height": 5.4,
        "near": {"leaves": (0.012, 9.0, 12000), "branches": (0.02, 3.2, 5000), "trunk": 2200},
        "far": {"leaves": (0.005, 14.0, 5000), "branches": (0.008, 4.5, 1500), "trunk": 600},
    },
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


def render_preview(path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = 500
    scene.render.resolution_y = 500
    camera_data = bpy.data.cameras.new("Preview")
    camera = bpy.data.objects.new("Preview", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (9.5, -9.5, 3.4)
    camera.rotation_euler = (1.45, 0, 0.785)
    scene.camera = camera
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera)


def build(name, species, level):
    variant = species[level]
    output = OUTPUT_DIR / (f"{name}.glb" if level == "near" else f"{name}_far.glb")
    source = SOURCES / species["scan"] / f"{species['scan']}.gltf"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scan = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    bpy.context.view_layer.objects.active = scan
    scan.select_set(True)
    print(f"{output.name}: source {triangles(scan):,} triangles")
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
    tree.name = name
    bpy.ops.object.shade_smooth()
    if species["height"]:
        # Bring the scan to a common size and stand it on the origin.
        bpy.context.view_layer.update()
        heights = [(tree.matrix_world @ vertex.co).z for vertex in tree.data.vertices]
        factor = species["height"] / (max(heights) - min(heights))
        tree.scale = (factor, factor, factor)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        trunk = [v.co for v in tree.data.vertices if v.co.z < min(v.co.z for v in tree.data.vertices) + 0.4]
        offset = sum(trunk, trunk[0] * 0) / len(trunk)
        for vertex in tree.data.vertices:
            vertex.co.x -= offset.x
            vertex.co.y -= offset.y
            vertex.co.z -= min(heights) * factor

    if "--preview" in sys.argv and level == "near":
        render_preview(SOURCES / f"{name}_preview.png")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_yup=True,
                              export_image_format="JPEG", export_jpeg_quality=80)
    print(f"  result {triangles(tree):,} triangles, {output.stat().st_size:,} bytes")


def main():
    wanted = [arg for arg in sys.argv[sys.argv.index("--") + 1:] if not arg.startswith("--")] if "--" in sys.argv else []
    for name, species in SPECIES.items():
        if wanted and name not in wanted:
            continue
        for level in ("near", "far"):
            build(name, species, level)


if __name__ == "__main__":
    main()
