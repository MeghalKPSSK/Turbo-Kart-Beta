"""Road-course geometry library retained for the Turbo Road League builder.

The current entry point delegates to ``build_road_tracks.py``. Run that file
from Blender's Python Console to create editable sources and compact GLBs.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import colorsys
import random
import bisect
from array import array
from contextlib import ExitStack
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = PROJECT_ROOT / "assets" / "blender"
EXPORT_DIR = PROJECT_ROOT / "public" / "models" / "blender"
BLENDER_TOOLS = Path(__file__).resolve().parent
if str(BLENDER_TOOLS) not in sys.path:
    sys.path.insert(0, str(BLENDER_TOOLS))
from compact_glb_exports import compact_glb_file
SOURCE_FILE = SOURCE_DIR / "turbo_kart_assets.blend"
TRACK_ID = "emerald_loop"
TRACK_WIDTH = 26.0
TRACK_TENSION = 0.42

# Route shapes, ramps, hazards, nitro cells and coin lines come from pure-Python
# modules so they can be planned, verified and plotted outside Blender.
import track_layout as layout
import track_shapes
from track_shapes import (TRACK_CATALOG, TRACK_CENTERLINE, TRACK_ELEVATION_PROFILES,
                          TRACK_ROUTE_SHAPES, build_track_centerline)

ACTIVE_COLLECTION = None


def link_object(obj, collection=None):
    (collection or ACTIVE_COLLECTION or bpy.context.scene.collection).objects.link(obj)
    return obj


def make_material(name, color, metallic=0.0, roughness=0.45):
    rgba = tuple(color[:3]) + (1.0,)
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = rgba
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Roughness"].default_value = roughness
        coat = principled.inputs.get("Coat Weight") or principled.inputs.get("Clearcoat")
        if coat:
            coat.default_value = 0.25
    return material


def make_tiled_surface_maps(name, seed, size=256):
    """Create packed, tileable albedo and tangent-normal maps for GLB export."""
    phase = seed * 0.013
    height_values = [0.0] * (size * size)
    albedo_pixels = array("f")
    tau = math.tau
    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            broad = math.sin(tau * (2 * u + 3 * v) + phase)
            medium = math.sin(tau * (5 * u - 4 * v) + phase * 1.7)
            fine = math.sin(tau * (11 * u + 9 * v) - phase * 0.8)
            grain = math.sin(tau * (19 * u - 17 * v) + phase * 2.1)
            height = 0.5 + 0.14 * broad + 0.065 * medium + 0.022 * fine + 0.008 * grain
            index = y * size + x
            height_values[index] = height
            value = max(0.97, min(1.02, 0.99 + 0.008 * broad + 0.004 * medium
                                  + 0.002 * fine + 0.001 * grain))
            albedo_pixels.extend((value, value, value, 1.0))

    albedo = bpy.data.images.new(f"{name}_MicroAlbedo", width=size, height=size, alpha=True)
    albedo.colorspace_settings.name = "sRGB"
    albedo.pixels.foreach_set(albedo_pixels)
    albedo.pack()

    normal_pixels = array("f")
    for y in range(size):
        y0 = ((y - 1) % size) * size
        y1 = ((y + 1) % size) * size
        row = y * size
        for x in range(size):
            dx = (height_values[row + ((x + 1) % size)]
                  - height_values[row + ((x - 1) % size)]) * 2.0
            dy = (height_values[y1 + x] - height_values[y0 + x]) * 2.0
            nx, ny, nz = -dx, -dy, 1.0
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            normal_pixels.extend((nx / length * 0.5 + 0.5,
                                  ny / length * 0.5 + 0.5,
                                  nz / length * 0.5 + 0.5, 1.0))
    normal = bpy.data.images.new(f"{name}_MicroNormal", width=size, height=size, alpha=True)
    normal.colorspace_settings.name = "Non-Color"
    normal.pixels.foreach_set(normal_pixels)
    normal.pack()
    return albedo, normal


def add_tiled_surface_maps(material, maps):
    """Wire image textures into Blender materials using glTF-compatible nodes."""
    tree = material.node_tree
    nodes, links = tree.nodes, tree.links
    shader = nodes.get("Principled BSDF")
    if not shader:
        return
    source = maps[0]
    base_color = material.diffuse_color
    source_pixels = array("f", [0.0]) * (source.size[0] * source.size[1] * 4)
    source.pixels.foreach_get(source_pixels)
    tinted_pixels = array("f")
    for index in range(0, len(source_pixels), 4):
        tinted_pixels.extend((source_pixels[index] * base_color[0],
                              source_pixels[index + 1] * base_color[1],
                              source_pixels[index + 2] * base_color[2],
                              source_pixels[index + 3]))
    albedo_image = bpy.data.images.new(
        f"{material.name}_PackedAlbedo", width=source.size[0], height=source.size[1], alpha=True
    )
    albedo_image.colorspace_settings.name = "sRGB"
    albedo_image.pixels.foreach_set(tinted_pixels)
    albedo_image.pack()
    uv = nodes.new("ShaderNodeTexCoord")
    uv.label = "Packed tileable surface UVs"
    albedo = nodes.new("ShaderNodeTexImage")
    albedo.image = albedo_image
    albedo.extension = "REPEAT"
    albedo.label = "Packed tinted micro-surface colour"
    links.new(uv.outputs["UV"], albedo.inputs["Vector"])
    links.new(albedo.outputs["Color"], shader.inputs["Base Color"])

    # Keep this broad surface texture free of high-frequency normal detail;
    # it aliases across long roads and mountain slopes in real-time rendering.


def assign_planar_uv(obj, tile_size):
    """Map Blender X/Y ground geometry in world metres for stable texture scale."""
    layer = obj.data.uv_layers.new(name="UVMap")
    values = array("f")
    for loop in obj.data.loops:
        co = obj.data.vertices[loop.vertex_index].co
        values.extend((co.x / tile_size, -co.y / tile_size))
    layer.data.foreach_set("uv", values)


def recalculate_normals(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def make_mesh(name, vertices, faces, material, collection=None, materials=None, face_materials=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    for extra in materials or []:
        mesh.materials.append(extra)
    recalculate_normals(mesh)
    obj = bpy.data.objects.new(name, mesh)
    link_object(obj, collection)
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    if face_materials:
        for polygon, index in zip(mesh.polygons, face_materials):
            polygon.material_index = index
    return obj


def add_box(name, dimensions, location, material, bevel=0.06, rotation_z=0.0, collection=None):
    width, length, height = dimensions
    half = (width / 2, length / 2, height / 2)
    vertices = [
        (-half[0], -half[1], -half[2]), (half[0], -half[1], -half[2]),
        (half[0], half[1], -half[2]), (-half[0], half[1], -half[2]),
        (-half[0], -half[1], half[2]), (half[0], -half[1], half[2]),
        (half[0], half[1], half[2]), (-half[0], half[1], half[2])
    ]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
        (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)
    ]
    obj = make_mesh(name, vertices, faces, material, collection)
    obj.location = location
    obj.rotation_euler.z = rotation_z
    if bevel > 0:
        modifier = obj.modifiers.new("Soft edge highlights", "BEVEL")
        modifier.width = min(bevel, min(dimensions) * 0.35)
        modifier.segments = 2
        modifier.affect = "EDGES"
        obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    return obj


def add_loft(name, sections, material, collection=None, radial_steps=20):
    """Create an elliptical cross-section chassis; section is (y, half_x, z_bottom, z_top)."""
    vertices = []
    for y, half_x, bottom, top in sections:
        center_z = (bottom + top) * 0.5
        half_z = max(0.04, (top - bottom) * 0.5)
        for step in range(radial_steps):
            angle = 2 * math.pi * step / radial_steps
            vertices.append((half_x * math.cos(angle), y, center_z + half_z * math.sin(angle)))
    faces = []
    for ring in range(len(sections) - 1):
        for step in range(radial_steps):
            a = ring * radial_steps + step
            b = ring * radial_steps + (step + 1) % radial_steps
            c = (ring + 1) * radial_steps + (step + 1) % radial_steps
            d = (ring + 1) * radial_steps + step
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(radial_steps))))
    faces.append(tuple((len(sections) - 1) * radial_steps + step for step in range(radial_steps)))
    obj = make_mesh(name, vertices, faces, material, collection)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_beam(name, start, end, radius, material, collection=None, sides=8):
    start = Vector(start)
    end = Vector(end)
    direction = (end - start).normalized()
    reference = Vector((0, 0, 1)) if abs(direction.z) < 0.9 else Vector((0, 1, 0))
    axis_x = direction.cross(reference).normalized()
    axis_y = direction.cross(axis_x).normalized()
    vertices = []
    for point in (start, end):
        for step in range(sides):
            angle = 2 * math.pi * step / sides
            offset = radius * (math.cos(angle) * axis_x + math.sin(angle) * axis_y)
            vertices.append(tuple(point + offset))
    faces = [tuple(reversed(range(sides))), tuple(range(sides, 2 * sides))]
    for step in range(sides):
        faces.append((step, (step + 1) % sides, sides + (step + 1) % sides, sides + step))
    obj = make_mesh(name, vertices, faces, material, collection)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return obj


def make_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


MINI_F1_SOURCE = Path(__file__).resolve().with_name("mini_f1_kart_design.py")
MINI_F1_WHEEL_CENTERS = {
    "FL": (0.365, -0.325, 0.175),
    "FR": (0.365, 0.325, 0.175),
    "RL": (-0.375, -0.325, 0.175),
    "RR": (-0.375, 0.325, 0.175),
}
WHEEL_PART_PREFIXES = (
    "Slick tire", "Tire sidewall bead", "Rim lip", "Wheel barrel",
    "Wheel center", "Center lock", "Forged rim spoke", "Brake rotor ring",
    "Brake rotor hat", "Rotor perforation detail", "Tire branding", "Brake caliper"
)

BODY_FAMILY_IDS = {
    "formula": [
        "standard_kart", "turbo_vector", "apex_special", "tri_velocity",
        "slipstreamer", "sports_coupe", "aurum_prototype", "argent_arrow",
        "azure_raptor", "chroma_striker",
    ],
    "compact": [
        "pipe_frame", "lynx_cruiser", "stag_runner", "nano_buggy",
        "colorburst_buggy",
    ],
    "rally": ["iron_strider", "street_bruiser", "dune_freighter"],
    "bike": [
        "standard_bike", "comet", "sport_bike", "royal_duke", "flame_rider",
        "varmint", "metro_scoot", "jet_bike", "gecko_bike", "prime_cycle",
        "city_tripper",
    ],
    "atv": ["standard_atv", "wild_winder", "cuddle_buggy", "rattle_crusher", "colorburst_atv"],
}

WHEEL_STYLES = {
    "standard": (0.190, 0.052, (0.14, 0.16, 0.18, 1), 6, "road"),
    "monster": (0.218, 0.070, (0.12, 0.15, 0.19, 1), 6, "block"),
    "roller": (0.178, 0.045, (0.95, 0.68, 0.08, 1), 5, "smooth"),
    "slim": (0.188, 0.035, (0.28, 0.31, 0.34, 1), 6, "road"),
    "slick": (0.192, 0.058, (0.035, 0.04, 0.045, 1), 6, "slick"),
    "metal": (0.190, 0.054, (0.70, 0.74, 0.78, 1), 8, "road"),
    "button": (0.177, 0.050, (0.22, 0.24, 0.27, 1), 3, "smooth"),
    "off_road": (0.200, 0.063, (0.22, 0.16, 0.10, 1), 6, "block"),
    "sponge": (0.196, 0.060, (0.95, 0.77, 0.08, 1), 5, "sponge"),
    "wood": (0.192, 0.054, (0.38, 0.20, 0.075, 1), 6, "wood"),
    "cushion": (0.194, 0.068, (0.42, 0.52, 0.58, 1), 6, "cushion"),
    "blue_standard": (0.190, 0.052, (0.035, 0.30, 0.95, 1), 6, "road"),
    "hot_monster": (0.218, 0.070, (0.84, 0.045, 0.045, 1), 6, "block"),
    "azure_roller": (0.178, 0.045, (0.05, 0.48, 0.88, 1), 5, "smooth"),
    "gold_tires": (0.195, 0.058, (0.92, 0.62, 0.06, 1), 8, "road"),
    "tri_spoke_tires": (0.190, 0.052, (0.17, 0.20, 0.25, 1), 3, "road"),
}

GLIDER_STYLES = {
    "super_glider": ("wing", (0.85, 0.10, 0.035, 1), (0.98, 0.83, 0.08, 1)),
    "cloud_glider": ("cloud", (0.83, 0.90, 0.96, 1), (0.40, 0.70, 0.98, 1)),
    "goldcrest_wing": ("wing", (0.92, 0.62, 0.06, 1), (0.98, 0.85, 0.32, 1)),
    "penguin_wing": ("wing", (0.07, 0.20, 0.58, 1), (0.88, 0.94, 0.98, 1)),
    "rose_parasol": ("parasol", (0.89, 0.12, 0.38, 1), (0.98, 0.69, 0.78, 1)),
    "parachute": ("chute", (0.91, 0.10, 0.075, 1), (0.98, 0.83, 0.12, 1)),
    "parafoil": ("foil", (0.14, 0.56, 0.89, 1), (0.18, 0.88, 0.73, 1)),
    "bloom_glider": ("bloom", (0.82, 0.18, 0.55, 1), (0.99, 0.72, 0.14, 1)),
    "inferno_kite": ("kite", (0.78, 0.045, 0.02, 1), (1.0, 0.40, 0.04, 1)),
    "grid_parafoil": ("foil", (0.08, 0.16, 0.24, 1), (0.03, 0.76, 0.79, 1)),
    "gold_glider": ("wing", (0.91, 0.58, 0.03, 1), (1.0, 0.86, 0.30, 1)),
    "heroic_kite": ("kite", (0.08, 0.27, 0.80, 1), (0.92, 0.13, 0.08, 1)),
}


def add_wheel_pivots(objects, collection, style):
    wheel_roots = {}
    for tag, center in MINI_F1_WHEEL_CENTERS.items():
        pivot = bpy.data.objects.new(f"Wheel_{tag}_{style}", None)
        pivot.empty_display_type = "PLAIN_AXES"
        pivot.empty_display_size = 0.035
        collection.objects.link(pivot)
        pivot.location = center
        wheel_roots[tag] = pivot

    for obj in objects:
        if not obj.name.startswith(WHEEL_PART_PREFIXES):
            continue
        tag = next((tag for tag in wheel_roots if re.search(rf"\b{tag}(?:\.\d+)?$", obj.name)), None)
        if tag:
            pivot = wheel_roots[tag]
            obj.parent = pivot
            obj.matrix_parent_inverse = Matrix.Identity(4)
            obj.location = Vector(obj.location) - Vector(MINI_F1_WHEEL_CENTERS[tag])
    return list(wheel_roots.values())


def add_wheel_arch(x, y, z, radius, material, collection, name):
    points = []
    for step in range(9):
        angle = math.pi * step / 8
        points.append((x + math.cos(angle) * radius, y, z + math.sin(angle) * radius))
    for index in range(len(points) - 1):
        add_beam(f"{name}_{index}", points[index], points[index + 1], 0.023,
                 material, collection, sides=8)


def add_body_style_details(style, model_objects, collection):
    if style == "formula":
        return

    prefixes = ("Front wing", "Endplate gold", "Rear wing", "Rear endplate")
    for obj in list(model_objects):
        if obj.name.startswith(prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)
            model_objects.remove(obj)

    materials = [material for obj in model_objects if obj.type == "MESH"
                 for material in obj.data.materials if material]
    primary = next((material for material in materials if material.name.startswith("KartPrimary")), None)
    accent = next((material for material in materials if material.name.startswith("KartAccent")), primary)
    rubber = next((material for material in materials if material.name.startswith("Competition Slick Rubber")), accent)
    light = next((material for material in materials if material.name.startswith("LED White")), accent)

    # Short, blunt bumpers and wheel guards distinguish the compact chassis from the F1.
    for x, label in ((0.58, "Front"), (-0.56, "Rear")):
        add_beam(f"{style.title()} {label} bumper", (x, -0.53, 0.17), (x, 0.53, 0.17),
                 0.032, accent, collection, sides=10)
    for side in (-1, 1):
        add_beam(f"{style.title()} side safety rail {side}", (-0.45, side * 0.45, 0.22),
                 (0.42, side * 0.45, 0.22), 0.025, rubber, collection, sides=8)
        for x, label in ((0.365, "Front"), (-0.375, "Rear")):
            add_wheel_arch(x, side * 0.36, 0.175, 0.205, accent, collection,
                           f"{style.title()} {label} wheel guard {side}")

    if style == "compact":
        for side in (-1, 1):
            add_box(f"Compact side pod guard {side}", (0.36, 0.09, 0.13),
                    (-0.05, side * 0.405, 0.285), primary, bevel=0.035, collection=collection)
        return

    # The rally version gets a protective cage, wider bash bars, and roof lights.
    for side in (-1, 1):
        y = side * 0.255
        add_beam(f"Rally cage front post {side}", (0.13, y, 0.49), (0.10, y, 0.81),
                 0.025, accent, collection)
        add_beam(f"Rally cage rear post {side}", (-0.25, y, 0.48), (-0.20, y, 0.81),
                 0.025, accent, collection)
        add_beam(f"Rally brush guard {side}", (0.40, side * 0.39, 0.22),
                 (-0.42, side * 0.39, 0.22), 0.03, rubber, collection)
        add_box(f"Rally headlamp pod {side}", (0.12, 0.10, 0.075),
                (0.48, side * 0.22, 0.37), light, bevel=0.025, collection=collection)
        add_box(f"Rally roof lamp {side}", (0.075, 0.10, 0.055),
                (0.075, side * 0.15, 0.825), light, bevel=0.02, collection=collection)
    add_beam("Rally cage roof front", (0.10, -0.255, 0.81), (0.10, 0.255, 0.81),
             0.025, accent, collection)
    add_beam("Rally cage roof rear", (-0.20, -0.255, 0.81), (-0.20, 0.255, 0.81),
             0.025, accent, collection)
    add_beam("Rally cage roof spine", (0.10, 0, 0.81), (-0.20, 0, 0.81),
             0.022, accent, collection)


def build_mini_f1_kart(style, palette, number, class_mark):
    global ACTIVE_COLLECTION
    ACTIVE_COLLECTION = make_collection(f"Mini F1 Kart - {style.title()} Livery")
    before = set(bpy.context.scene.objects)
    source = MINI_F1_SOURCE.read_text(encoding="utf-8")
    namespace = {
        "__name__": "_turbo_kart_mini_f1_design",
        "TURBO_KART_ASSET_BUILD_MODE": True,
        "KART_BODY_COLOR": palette[0],
        "KART_ACCENT_COLOR": palette[1],
        "KART_NUMBER": number,
        "KART_CLASS": class_mark,
    }
    exec(compile(source, str(MINI_F1_SOURCE), "exec"), namespace)
    created = [obj for obj in bpy.context.scene.objects if obj not in before]
    model_objects = []
    for obj in created:
        if obj.type in {"CAMERA", "LIGHT"} or obj.name.startswith(("Display plinth", "Studio floor")):
            if obj.type == "CAMERA" and bpy.context.scene.camera == obj:
                bpy.context.scene.camera = None
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        ACTIVE_COLLECTION.objects.link(obj)
        model_objects.append(obj)

    add_body_style_details(style, model_objects, ACTIVE_COLLECTION)
    wheel_roots = add_wheel_pivots(model_objects, ACTIVE_COLLECTION, style)
    root = bpy.data.objects.new(f"KartRoot_{style}", None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.12
    ACTIVE_COLLECTION.objects.link(root)
    for obj in model_objects + wheel_roots:
        if obj.parent is None:
            obj.parent = root
            obj.matrix_parent_inverse = Matrix.Identity(4)

    # Convert the attached model's +X nose to the game's +Z forward direction.
    # Keep the source proportions; the old non-uniform scale made the kart look
    # stretched and forced the physics wheelbase to sit well ahead of its body.
    root.rotation_euler.z = -math.pi / 2
    root.scale = (3.0, 3.0, 3.0)
    root.location = (0.0, 0.0, 0.0)
    return ACTIVE_COLLECTION


def build_formula_kart():
    return build_mini_f1_kart(
        "formula", ((0.80, 0.015, 0.035, 1.0), (1.0, 0.62, 0.025, 1.0)), "07", "FORMULA"
    )


def build_compact_kart():
    return build_mini_f1_kart(
        "compact", ((0.035, 0.22, 0.82, 1.0), (0.80, 0.88, 0.95, 1.0)), "24", "SPRINT"
    )


def build_rally_kart():
    return build_mini_f1_kart(
        "rally", ((0.035, 0.38, 0.16, 1.0), (1.0, 0.30, 0.035, 1.0)), "88", "RALLY"
    )


def add_local_box(name, dimensions, location, material, parent, collection, bevel=0.0):
    obj = add_box(name, dimensions, location, material, bevel=bevel, collection=collection)
    bpy.context.view_layer.update()
    world_matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = parent.matrix_world.inverted() @ world_matrix
    return obj


def source_body_objects(collection):
    root = next((obj for obj in collection.objects if obj.name.startswith("KartRoot_")), None)
    if not root:
        raise RuntimeError(f"No kart root found in {collection.name}")
    result = []
    for obj in collection.objects:
        ancestor = obj.parent
        is_wheel = False
        while ancestor:
            if ancestor.name.startswith("Wheel_"):
                is_wheel = True
                break
            ancestor = ancestor.parent
        if not is_wheel:
            result.append(obj)
    return root, result


def build_body_catalog(family_collections):
    global ACTIVE_COLLECTION
    ACTIVE_COLLECTION = make_collection("Blender Vehicle Catalog - Bodies")
    body_ids = [body_id for family_ids in BODY_FAMILY_IDS.values() for body_id in family_ids]
    color_count = max(1, len(body_ids))
    family_roots = {}
    for family, body_ids_for_family in BODY_FAMILY_IDS.items():
        source_collection = family_collections[family]
        source_root, source_objects = source_body_objects(source_collection)
        copied = {}
        for source in source_objects:
            clone = source.copy()
            if source.data:
                clone.data = source.data
            ACTIVE_COLLECTION.objects.link(clone)
            copied[source] = clone
        for source, clone in copied.items():
            if source.parent in copied:
                clone.parent = copied[source.parent]
                clone.matrix_parent_inverse = source.matrix_parent_inverse.copy()
                clone.matrix_basis = source.matrix_basis.copy()
            else:
                clone.parent = None
                clone.matrix_world = source.matrix_world.copy()
            clone.name = f"{source.name}_{family}"
        family_root = copied[source_root]
        family_root.name = f"Family_{family}"
        family_roots[family] = family_root

    # Each named body gets a lightweight livery accent while sharing one of
    # the five detailed Blender chassis families above.
    body_index = 0
    for family, body_ids_for_family in BODY_FAMILY_IDS.items():
        for variant_index, body_id in enumerate(body_ids_for_family):
            root = bpy.data.objects.new(f"Body_{body_id}", None)
            ACTIVE_COLLECTION.objects.link(root)
            root.rotation_euler.z = -math.pi / 2
            root.scale = (3.0, 3.0, 3.0)
            hue = body_index / color_count
            red, green, blue = colorsys.hsv_to_rgb(hue % 1.0, 0.9, 0.98)
            stripe_material = make_material(f"VariantAccent_{body_id}",
                                            (red, green, blue), 0.32, 0.26)
            stripe_count = 1 + (variant_index % 3)
            for side in (-1, 1):
                for stripe_index in range(stripe_count):
                    x = -0.31 + stripe_index * 0.052
                    add_local_box(
                        f"Body signature stripe {body_id} {side} {stripe_index}",
                        (0.038, 0.012, 0.014), (x, side * 0.285, 0.455),
                        stripe_material, root, ACTIVE_COLLECTION, bevel=0.003
                    )
            body_index += 1
    print(f"Created {len(body_ids)} Blender body models")
    return ACTIVE_COLLECTION


def add_torus_mesh(name, major_radius, tube_radius, material, collection,
                   major_segments=36, tube_segments=10):
    vertices = []
    for major in range(major_segments):
        theta = 2 * math.pi * major / major_segments
        for tube in range(tube_segments):
            phi = 2 * math.pi * tube / tube_segments
            radial = major_radius + tube_radius * math.cos(phi)
            vertices.append((radial * math.cos(theta), tube_radius * math.sin(phi),
                             radial * math.sin(theta)))
    faces = []
    for major in range(major_segments):
        for tube in range(tube_segments):
            a = major * tube_segments + tube
            b = major * tube_segments + (tube + 1) % tube_segments
            c = ((major + 1) % major_segments) * tube_segments + (tube + 1) % tube_segments
            d = ((major + 1) % major_segments) * tube_segments + tube
            faces.append((a, b, c, d))
    obj = make_mesh(name, vertices, faces, material, collection)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_wheel_hub(name, radius, width, material, collection, segments=24):
    vertices = []
    for y in (-width / 2, width / 2):
        for step in range(segments):
            angle = 2 * math.pi * step / segments
            vertices.append((radius * math.cos(angle), y, radius * math.sin(angle)))
    faces = [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
    for step in range(segments):
        following = (step + 1) % segments
        faces.append((step, following, segments + following, segments + step))
    obj = make_mesh(name, vertices, faces, material, collection)
    for polygon in obj.data.polygons:
        if len(polygon.vertices) == 4:
            polygon.use_smooth = True
    return obj


def add_wheel_spokes(name, radius, axle_width, spoke_count, material, collection):
    vertices = []
    faces = []
    half_width = min(0.008, radius * 0.055)
    half_depth = max(0.004, axle_width * 0.08)
    for side in (-1, 1):
        y_center = side * axle_width * 0.34
        for spoke in range(spoke_count):
            angle = 2 * math.pi * spoke / spoke_count + (0.10 if side < 0 else 0)
            ux, uz = math.cos(angle), math.sin(angle)
            tx, tz = -uz, ux
            inner, outer = radius * 0.18, radius * 0.56
            points = []
            for radial, tangent in ((inner, -half_width), (outer, -half_width),
                                    (outer, half_width), (inner, half_width)):
                points.append((ux * radial + tx * tangent, y_center - half_depth,
                               uz * radial + tz * tangent))
            for radial, tangent in ((inner, -half_width), (outer, -half_width),
                                    (outer, half_width), (inner, half_width)):
                points.append((ux * radial + tx * tangent, y_center + half_depth,
                               uz * radial + tz * tangent))
            base = len(vertices)
            vertices.extend(points)
            faces.extend((
                (base, base + 1, base + 2, base + 3),
                (base + 4, base + 7, base + 6, base + 5),
                (base, base + 4, base + 5, base + 1),
                (base + 1, base + 5, base + 6, base + 2),
                (base + 2, base + 6, base + 7, base + 3),
                (base + 3, base + 7, base + 4, base),
            ))
    return make_mesh(name, vertices, faces, material, collection)


def parent_to_local(obj, parent):
    local_basis = obj.matrix_basis.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = local_basis


def build_wheel_catalog():
    global ACTIVE_COLLECTION
    ACTIVE_COLLECTION = make_collection("Blender Vehicle Catalog - Wheels")
    rubber = make_material("WheelRubber | Soft Black", (0.035, 0.04, 0.045, 1), 0.02, 0.72)
    dark = make_material("WheelHardware | Graphite", (0.08, 0.095, 0.12, 1), 0.58, 0.3)
    for wheel_id, (radius, tube, color, spoke_count, tread) in WHEEL_STYLES.items():
        rim = make_material(f"WheelRim_{wheel_id}", color, 0.72, 0.25)
        accent = make_material(f"WheelAccent_{wheel_id}", color, 0.42, 0.3)
        tire_material = rubber
        if tread == "sponge":
            tire_material = make_material(f"WheelSponge_{wheel_id}", color, 0.0, 0.88)
        elif tread == "cushion":
            tire_material = make_material(f"WheelCushion_{wheel_id}", (0.34, 0.40, 0.44, 1), 0.0, 0.86)
        elif tread == "wood":
            tire_material = make_material(f"WheelWood_{wheel_id}", (0.28, 0.13, 0.045, 1), 0.06, 0.66)
        root = bpy.data.objects.new(f"WheelSet_{wheel_id}", None)
        ACTIVE_COLLECTION.objects.link(root)
        root.rotation_euler.z = -math.pi / 2
        root.scale = (3.0, 3.0, 3.0)

        for tag, center in MINI_F1_WHEEL_CENTERS.items():
            pivot = bpy.data.objects.new(f"Wheel_{tag}_{wheel_id}", None)
            pivot.empty_display_type = "PLAIN_AXES"
            pivot.empty_display_size = 0.035
            ACTIVE_COLLECTION.objects.link(pivot)
            pivot.location = center
            parent_to_local(pivot, root)

            tire = add_torus_mesh(f"Tire_{tag}_{wheel_id}", radius - tube * 0.48,
                                  tube, tire_material, ACTIVE_COLLECTION)
            parent_to_local(tire, pivot)
            rim_ring = add_torus_mesh(f"Rim ring_{tag}_{wheel_id}", radius * 0.60,
                                      max(0.006, tube * 0.10), rim,
                                      ACTIVE_COLLECTION, major_segments=24, tube_segments=6)
            parent_to_local(rim_ring, pivot)
            spoke_obj = add_wheel_spokes(f"Spokes_{tag}_{wheel_id}", radius, tube,
                                         spoke_count, dark if wheel_id == "wood" else accent,
                                         ACTIVE_COLLECTION)
            parent_to_local(spoke_obj, pivot)
            hub = add_wheel_hub(f"Hub_{tag}_{wheel_id}", radius * 0.19,
                                tube * 0.34, accent, ACTIVE_COLLECTION)
            parent_to_local(hub, pivot)

    print(f"Created {len(WHEEL_STYLES)} Blender wheel sets")
    return ACTIVE_COLLECTION


def add_ellipsoid(name, location, scale, material, collection, segments=16, rings=8):
    vertices = []
    faces = []
    for ring in range(rings + 1):
        phi = math.pi * ring / rings
        for segment in range(segments):
            theta = 2 * math.pi * segment / segments
            vertices.append((
                location[0] + scale[0] * math.sin(phi) * math.cos(theta),
                location[1] + scale[1] * math.sin(phi) * math.sin(theta),
                location[2] + scale[2] * math.cos(phi),
            ))
    for ring in range(rings):
        for segment in range(segments):
            a = ring * segments + segment
            b = ring * segments + (segment + 1) % segments
            c = (ring + 1) * segments + (segment + 1) % segments
            d = (ring + 1) * segments + segment
            faces.append((a, b, c, d))
    obj = make_mesh(name, vertices, faces, material, collection)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_glider_sail(name, vertices, faces, material, collection):
    obj = make_mesh(name, vertices, faces, material, collection)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def build_glider_model(glider_id, style, primary_color, accent_color, collection):
    root = bpy.data.objects.new(f"Glider_{glider_id}", None)
    collection.objects.link(root)
    root.rotation_euler.z = -math.pi / 2
    root.scale = (3.0, 3.0, 3.0)
    primary = make_material(f"Glider_{glider_id}_Canopy", primary_color, 0.08, 0.5)
    accent = make_material(f"Glider_{glider_id}_Trim", accent_color, 0.22, 0.32)
    frame = make_material(f"Glider_{glider_id}_Frame", (0.07, 0.09, 0.12, 1), 0.58, 0.3)

    def beam_local(name, start, end, radius, material):
        obj = add_beam(name, start, end, radius, material, collection, sides=8)
        parent_to_local(obj, root)
        return obj

    # Raised struts hold every decorative glider clear of the driver helmet.
    beam_local(f"Glider {glider_id} center mast", (-0.22, 0, 0.54), (-0.24, 0, 0.90), 0.018, frame)
    for side in (-1, 1):
        beam_local(f"Glider {glider_id} support {side}", (-0.24, 0, 0.70),
                   (-0.29, side * 0.34, 0.91), 0.013, frame)

    if style == "wing":
        add_glider_sail(
            f"Glider {glider_id} wing fabric",
            [(-0.08, -0.46, 0.94), (-0.34, -0.46, 0.91), (-0.45, 0, 1.02),
             (-0.34, 0.46, 0.91), (-0.08, 0.46, 0.94), (-0.24, 0, 1.05)],
            [(0, 1, 5), (1, 2, 5), (2, 3, 5), (3, 4, 5)], primary, collection
        )
    elif style in {"foil", "kite"}:
        add_glider_sail(
            f"Glider {glider_id} left panel",
            [(-0.08, -0.48, 0.93), (-0.39, -0.42, 0.90), (-0.46, 0, 1.01),
             (-0.22, 0, 1.04)], [(0, 1, 2, 3)], primary, collection
        )
        add_glider_sail(
            f"Glider {glider_id} right panel",
            [(-0.08, 0, 1.04), (-0.46, 0, 1.01), (-0.39, 0.42, 0.90),
             (-0.08, 0.48, 0.93)], [(0, 1, 2, 3)], accent, collection
        )
        if style == "kite":
            for side in (-1, 1):
                beam_local(f"Glider {glider_id} kite spar {side}", (-0.12, 0, 0.98),
                           (-0.39, side * 0.42, 0.91), 0.008, frame)
    elif style in {"parasol", "chute"}:
        # A low dome keeps a parachute / parasol recognizable without opening
        # and closing it during jumps or changing vehicle physics.
        dome_vertices = []
        dome_faces = []
        segments, rings = 24, 6
        center = (-0.31, 0, 0.95)
        for ring in range(rings + 1):
            phi = (math.pi / 2) * ring / rings
            for segment in range(segments):
                theta = 2 * math.pi * segment / segments
                dome_vertices.append((center[0] + 0.31 * math.sin(phi) * math.cos(theta),
                                      center[1] + 0.43 * math.sin(phi) * math.sin(theta),
                                      center[2] + 0.19 * math.cos(phi)))
        for ring in range(rings):
            for segment in range(segments):
                a = ring * segments + segment
                b = ring * segments + (segment + 1) % segments
                c = (ring + 1) * segments + (segment + 1) % segments
                d = (ring + 1) * segments + segment
                dome_faces.append((a, b, c, d))
        add_glider_sail(f"Glider {glider_id} canopy dome", dome_vertices,
                        dome_faces, primary, collection)
        for spoke in range(8):
            theta = 2 * math.pi * spoke / 8
            beam_local(f"Glider {glider_id} canopy seam {spoke}", center,
                       (center[0] - 0.29 * math.cos(theta),
                        0.40 * math.sin(theta), 0.97), 0.005, accent)
    elif style == "bloom":
        for petal in range(6):
            theta = 2 * math.pi * petal / 6
            add_ellipsoid(f"Glider {glider_id} petal {petal}",
                          (-0.30, 0.20 * math.sin(theta), 0.97 + 0.13 * math.cos(theta)),
                          (0.10, 0.12, 0.08), primary if petal % 2 else accent,
                          collection, segments=12, rings=6)
        add_ellipsoid(f"Glider {glider_id} flower center", (-0.30, 0, 0.97),
                      (0.08, 0.08, 0.08), accent, collection, segments=12, rings=6)
    elif style == "cloud":
        for puff, (offset_y, offset_z, scale) in enumerate((
                (-0.19, 0.96, (0.17, 0.16, 0.11)),
                (0.0, 1.02, (0.21, 0.19, 0.14)),
                (0.19, 0.96, (0.17, 0.16, 0.11)))):
            add_ellipsoid(f"Glider {glider_id} cloud puff {puff}",
                          (-0.30, offset_y, offset_z), scale,
                          primary if puff != 1 else accent, collection)
    else:
        raise ValueError(f"Unknown Blender glider style: {style}")

    return root


def build_glider_catalog():
    global ACTIVE_COLLECTION
    ACTIVE_COLLECTION = make_collection("Blender Vehicle Catalog - Gliders")
    for glider_id, (style, primary, accent) in GLIDER_STYLES.items():
        root = build_glider_model(glider_id, style, primary, accent, ACTIVE_COLLECTION)
        bpy.context.view_layer.update()
        for obj in list(ACTIVE_COLLECTION.objects):
            if obj is root or obj.parent is not None:
                continue
            if obj.name.startswith(f"Glider {glider_id} "):
                world_matrix = obj.matrix_world.copy()
                obj.parent = root
                obj.matrix_parent_inverse = Matrix.Identity(4)
                obj.matrix_basis = root.matrix_world.inverted() @ world_matrix
    print(f"Created {len(GLIDER_STYLES)} Blender glider models")
    return ACTIVE_COLLECTION


def catmull_rom_samples(points, sample_count=512, tension=TRACK_TENSION):
    result = []
    count = len(points)
    for segment in range(count):
        p0 = Vector(points[(segment - 1) % count])
        p1 = Vector(points[segment])
        p2 = Vector(points[(segment + 1) % count])
        p3 = Vector(points[(segment + 2) % count])
        tangent1 = (p2 - p0) * tension
        tangent2 = (p3 - p1) * tension
        for step in range(sample_count // count):
            t = step / (sample_count // count)
            t2 = t * t
            t3 = t2 * t
            point = ((2 * t3 - 3 * t2 + 1) * p1
                     + (t3 - 2 * t2 + t) * tangent1
                     + (-2 * t3 + 3 * t2) * p2
                     + (t3 - t2) * tangent2)
            result.append(tuple(point))
    return result


def game_to_blender(point, height=0.0):
    return (float(point[0]), -float(point[1]), float(height))


def ribbon_geometry(points, offset_a, offset_b, height, name, material, collection,
                    alternate_material=None, alternate_every=1, tangent_samples=None):
    vertices = []
    for index, point in enumerate(points):
        previous = points[(index - 1) % len(points)]
        following = points[(index + 1) % len(points)]
        dx = following[0] - previous[0]
        dz = following[1] - previous[1]
        length = max(1e-6, math.hypot(dx, dz))
        right_x, right_z = -dz / length, dx / length
        point_height = point[2] if len(point) > 2 else 0.0
        a = (point[0] + right_x * offset_a, point[1] + right_z * offset_a)
        b = (point[0] + right_x * offset_b, point[1] + right_z * offset_b)
        vertices.extend((game_to_blender(a, point_height + height),
                         game_to_blender(b, point_height + height)))
    faces = []
    face_materials = []
    for index in range(len(points)):
        following = (index + 1) % len(points)
        faces.append((index * 2, index * 2 + 1, following * 2 + 1, following * 2))
        face_materials.append(1 if alternate_material and (index // alternate_every) % 2 else 0)
    return make_mesh(name, vertices, faces, material, collection,
                     materials=[alternate_material] if alternate_material else None,
                     face_materials=face_materials if alternate_material else None)


TRACK_PALETTES = {
    "grass": ((0.10, 0.27, 0.10), (0.25, 0.26, 0.22), (0.52, 0.54, 0.48)),
    "farm": ((0.23, 0.31, 0.12), (0.33, 0.29, 0.20), (0.58, 0.52, 0.38)),
    "mountain_adventure": ((0.12, 0.23, 0.14), (0.31, 0.31, 0.29), (0.73, 0.78, 0.82)),
    "canyon": ((0.42, 0.24, 0.12), (0.43, 0.30, 0.22), (0.68, 0.48, 0.30)),
    "industrial": ((0.16, 0.21, 0.22), (0.27, 0.29, 0.30), (0.40, 0.43, 0.43)),
    "classic": ((0.12, 0.27, 0.12), (0.29, 0.30, 0.27), (0.55, 0.57, 0.53)),
    "mall": ((0.24, 0.25, 0.28), (0.36, 0.37, 0.39), (0.54, 0.56, 0.58)),
    "snow": ((0.70, 0.79, 0.84), (0.38, 0.46, 0.52), (0.90, 0.94, 0.96)),
    "mine": ((0.19, 0.20, 0.18), (0.33, 0.31, 0.27), (0.50, 0.49, 0.45)),
    "coastal": ((0.19, 0.35, 0.23), (0.43, 0.40, 0.32), (0.64, 0.60, 0.49)),
    "tropical": ((0.08, 0.32, 0.19), (0.30, 0.34, 0.29), (0.55, 0.54, 0.47)),
    "forest": ((0.08, 0.24, 0.11), (0.27, 0.29, 0.23), (0.48, 0.46, 0.38)),
    "volcano": ((0.15, 0.14, 0.13), (0.32, 0.25, 0.22), (0.48, 0.39, 0.35)),
    "desert": ((0.56, 0.42, 0.23), (0.48, 0.38, 0.27), (0.76, 0.65, 0.46)),
    "highway": ((0.15, 0.19, 0.21), (0.27, 0.30, 0.31), (0.45, 0.47, 0.48)),
    "castle": ((0.18, 0.18, 0.19), (0.31, 0.31, 0.32), (0.48, 0.48, 0.49)),
    "space": ((0.14, 0.18, 0.28), (0.28, 0.32, 0.42), (0.50, 0.54, 0.64)),
    "beach": ((0.62, 0.52, 0.33), (0.43, 0.38, 0.29), (0.76, 0.67, 0.48)),
    "coastal_sunset": ((0.54, 0.37, 0.20), (0.38, 0.31, 0.25), (0.74, 0.57, 0.38)),
    "island": ((0.34, 0.42, 0.23), (0.38, 0.35, 0.28), (0.53, 0.67, 0.59)),
    "jungle": ((0.07, 0.25, 0.10), (0.26, 0.30, 0.22), (0.47, 0.47, 0.37)),
    "haunted": ((0.13, 0.19, 0.16), (0.27, 0.29, 0.28), (0.43, 0.46, 0.44)),
    "ice": ((0.57, 0.70, 0.77), (0.34, 0.43, 0.49), (0.88, 0.93, 0.96)),
    "town": ((0.23, 0.27, 0.24), (0.34, 0.34, 0.31), (0.54, 0.53, 0.48)),
    "stadium": ((0.10, 0.24, 0.12), (0.27, 0.29, 0.26), (0.48, 0.50, 0.48)),
}


def make_terrain(points, track_id, theme, collection, road_width=26.0):
    palette = TRACK_PALETTES.get(theme, TRACK_PALETTES["grass"])
    base_mat = make_material(f"{track_id}_Terrain_Base", palette[0], 0.0, 0.96)
    rock_mat = make_material(f"{track_id}_Terrain_Rock", palette[1], 0.0, 0.94)
    high_mat = make_material(f"{track_id}_Terrain_High", palette[2], 0.0, 0.90)
    light_color = tuple(min(1.0, component * 1.12) for component in palette[0])
    dark_color = tuple(component * 0.78 for component in palette[0])
    light_mat = make_material(f"{track_id}_Terrain_LightPatches", light_color, 0.0, 0.94)
    dark_mat = make_material(f"{track_id}_Terrain_ShadowPatches", dark_color, 0.0, 0.98)
    surface_maps = make_tiled_surface_maps(f"{track_id}_Terrain", sum(ord(char) for char in track_id))
    for surface in (base_mat, rock_mat, high_mat, light_mat, dark_mat):
        add_tiled_surface_maps(surface, surface_maps)

    # Keep the land below the asphalt at the road edge, then roll it into a
    # broad valley and distant ridges. The sampled road profile anchors terrain
    # height, so the Blender scenery matches the playable elevation changes.
    route = points[::4]
    route_radius = max(math.hypot(point[0], point[1]) for point in points)
    extent = route_radius + 225.0
    grid = 176
    terrain_seed = sum(ord(char) for char in track_id) * 0.013

    def terrain_height(x, z):
        nearest_d2 = float("inf")
        nearest_height = 14.0
        for px, pz, ph in route:
            d2 = (x - px) ** 2 + (z - pz) ** 2
            if d2 < nearest_d2:
                nearest_d2 = d2
                nearest_height = ph
        distance = math.sqrt(nearest_d2)
        near_road = nearest_height - 0.30 - max(0.0, distance - road_width / 2 - 2.0) * 0.22
        radial = math.hypot(x, z)
        bearing = math.atan2(z, x)
        ridge_front = route_radius + 62.0
        ridge_front += 23.0 * math.sin(bearing * 3.0 + terrain_seed)
        ridge_front += 11.0 * math.sin(bearing * 7.0 - terrain_seed * 1.3)
        ridge_strength = 0.84 if theme in {"mountain_adventure", "canyon", "jungle", "ice", "volcano"} else 0.48
        ridge = max(0.0, radial - ridge_front) * ridge_strength
        far_land = -27.0 + ridge + 4.8 * math.sin(x * 0.018 + terrain_seed)
        far_land += 3.9 * math.cos(z * 0.021 - terrain_seed * 1.7)
        far_land += 2.7 * math.sin((x + z) * 0.037 + terrain_seed * 0.7)
        far_land += 1.6 * math.sin(x * 0.083 + z * 0.047 + terrain_seed * 0.4)
        far_land += 0.62 * math.sin(x * 0.24 - z * 0.19 + terrain_seed * 2.4)
        if theme in {"beach", "coastal_sunset", "island"}:
            if theme == "island":
                far_land = -28.0 + 5.2 * math.sin(x * 0.018 + terrain_seed)
                far_land += 4.3 * math.cos(z * 0.023 - terrain_seed)
                far_land += 1.4 * math.sin(x * 0.08 + z * 0.065 + terrain_seed)
            else:
                far_land = -40.0 + 2.2 * math.sin(x * 0.012 + terrain_seed)
                far_land += 1.5 * math.cos(z * 0.015 - terrain_seed)
                far_land += 0.34 * math.sin(x * 0.09 + z * 0.07 + terrain_seed)
        blend_t = max(0.0, min(1.0, distance / 158.0))
        blend = blend_t * blend_t * (3.0 - 2.0 * blend_t)
        return near_road * (1.0 - blend) + far_land * blend

    vertices = []
    face_heights = []
    face_centers = []
    for row in range(grid):
        z = -extent + 2.0 * extent * row / (grid - 1)
        for col in range(grid):
            x = -extent + 2.0 * extent * col / (grid - 1)
            vertices.append(game_to_blender((x, z), terrain_height(x, z)))
    faces = []
    for row in range(grid - 1):
        for col in range(grid - 1):
            a = row * grid + col
            b, c, d = a + 1, a + grid + 1, a + grid
            faces.append((a, b, c, d))
            face_heights.append((vertices[a][2] + vertices[b][2] + vertices[c][2] + vertices[d][2]) / 4)
            face_centers.append(((vertices[a][0] + vertices[b][0] + vertices[c][0] + vertices[d][0]) / 4,
                                 (vertices[a][1] + vertices[b][1] + vertices[c][1] + vertices[d][1]) / 4))
    materials = [rock_mat, high_mat, light_mat, dark_mat]
    obj = make_mesh(f"{track_id}_Mountain_Terrain", vertices, faces, base_mat,
                    collection, materials=materials)
    assign_planar_uv(obj, 24.0)
    # Vertex tint gives the ground continuous, natural variation between the
    # broad elevation layers instead of the old checker-like patches.
    tint = obj.data.color_attributes.new(name="SurfaceTint", type="FLOAT_COLOR", domain="POINT")
    tint_values = array("f")
    for vertex in obj.data.vertices:
        x, z = vertex.co.x, -vertex.co.y
        variation = 0.93 + 0.035 * math.sin(x * 0.063 + terrain_seed)
        variation += 0.026 * math.cos(z * 0.074 - terrain_seed * 0.7)
        variation += 0.012 * math.sin((x - z) * 0.13 + terrain_seed * 1.1)
        tint_values.extend((variation, variation, variation, 1.0))
    tint.data.foreach_set("color", tint_values)
    obj.data.color_attributes.active_color = tint
    for polygon, height, (x, z) in zip(obj.data.polygons, face_heights, face_centers):
        patch_noise = (math.sin(x * 0.041 + terrain_seed)
                       + math.cos(z * 0.037 - terrain_seed * 0.6)
                       + math.sin((x + z) * 0.022))
        if height > 34:
            polygon.material_index = 2
        elif height > 9:
            polygon.material_index = 1
        elif patch_noise > 1.05:
            polygon.material_index = 3
        elif patch_noise < -1.05:
            polygon.material_index = 4
        else:
            polygon.material_index = 0
        polygon.use_smooth = True
    return terrain_height, route_radius


def add_cone(name, center, radius, height, material, collection, sides=8, smooth=False):
    x, y, z = center
    vertices = []
    for step in range(sides):
        angle = math.tau * step / sides
        vertices.append((x + radius * math.cos(angle), y + radius * math.sin(angle), z))
    vertices.append((x, y, z + height))
    faces = [tuple(reversed(range(sides)))]
    faces.extend((step, (step + 1) % sides, sides) for step in range(sides))
    obj = make_mesh(name, vertices, faces, material, collection)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def add_track_scenery(points, width, track_id, theme, terrain_height, collection, route):
    rng = random.Random(f"{track_id}:scenery")
    greens = theme in {"grass", "farm", "forest", "jungle", "tropical", "coastal", "stadium"}
    snow = theme in {"snow", "ice", "mountain_adventure"}
    palms = theme in {"coastal_sunset", "island"}
    mountain = theme == "mountain_adventure"
    tree_color = (0.10, 0.24, 0.14) if greens or mountain else (0.57, 0.68, 0.76) if snow else (0.18, 0.34, 0.20)
    tree_mat = make_material(f"{track_id}_Scenery_Canopy", tree_color, 0.0, 0.82)
    trunk_mat = make_material(f"{track_id}_Scenery_Trunk", (0.40, 0.25, 0.13) if palms else (0.22, 0.14, 0.09), 0.0, 0.95)
    rock_mat = make_material(f"{track_id}_Scenery_Boulder", (0.28, 0.29, 0.28), 0.0, 0.96)
    lava_mat = make_material(f"{track_id}_Scenery_Lava", (0.92, 0.22, 0.035), 0.0, 0.72)
    steel_mat = make_material(f"{track_id}_Scenery_Steel", (0.15, 0.20, 0.23), 0.42, 0.55)
    tree_light = make_material(f"{track_id}_Scenery_Canopy_Light",
                               (0.15, 0.31, 0.18) if greens or mountain else (0.27, 0.43, 0.25) if palms else tree_color, 0.0, 0.82)
    snow_tip_mat = make_material(f"{track_id}_Scenery_SnowTips", (0.72, 0.79, 0.82), 0.0, 0.92)
    stride = 12
    for index in range(9, len(points), stride):
        point = points[index]
        previous = points[(index - 1) % len(points)]
        following = points[(index + 1) % len(points)]
        dx, dz = following[0] - previous[0], following[1] - previous[1]
        tangent_length = max(1e-6, math.hypot(dx, dz))
        nx, nz = -dz / tangent_length, dx / tangent_length
        for side in (-1, 1):
            # Keep trunks and broad canopy meshes beyond the road barriers.
            # The old 9–18 m offset allowed foliage to overhang the asphalt on
            # tight bends, where neighboring roadside meshes also converge.
            distance = width / 2 + rng.uniform(20.0, 30.0)
            x = point[0] + nx * distance * side
            z = point[1] + nz * distance * side
            # The route folds back on itself, so "beside this sample" can be
            # right on top of a different stretch of road. Test every stretch.
            if route.clearance(x, z) < width / 2 + layout.SCENERY_MARGIN:
                continue
            ground = terrain_height(x, z)
            if greens or snow or palms:
                scale = rng.uniform(0.82, 1.28)
                base = game_to_blender((x, z), ground)
                lean_x, lean_z = (rng.uniform(-1.2, 1.2), rng.uniform(-1.2, 1.2)) if palms else (0.0, 0.0)
                crown_x, crown_z = x + lean_x * scale, z + lean_z * scale
                trunk_height = 7.2 if palms else 2.5
                add_beam(f"{track_id}_TreeTrunk_{index}_{side}", base,
                         game_to_blender((crown_x, crown_z), ground + trunk_height * scale),
                         (0.17 if palms else 0.22) * scale, trunk_mat, collection, sides=12)
                canopy = tree_mat if (index // stride + side) % 2 else tree_light
                if palms:
                    crown = game_to_blender((crown_x, crown_z), ground + 7.0 * scale)
                    add_ellipsoid(f"{track_id}_PalmCrown_{index}_{side}", crown,
                                  (0.72 * scale, 0.72 * scale, 0.58 * scale), trunk_mat,
                                  collection, segments=14, rings=8)
                    for frond in range(7):
                        angle = math.tau * frond / 7 + rng.uniform(-0.13, 0.13)
                        reach = rng.uniform(3.1, 4.2) * scale
                        start = game_to_blender((crown_x, crown_z), ground + 7.0 * scale)
                        end = game_to_blender((crown_x + math.cos(angle) * reach,
                                               crown_z + math.sin(angle) * reach),
                                              ground + rng.uniform(5.4, 6.2) * scale)
                        add_beam(f"{track_id}_PalmFrond_{index}_{side}_{frond}", start, end,
                                 0.11 * scale, canopy if frond % 2 else tree_light,
                                 collection, sides=8)
                elif theme in {"jungle", "tropical", "forest", "coastal", "farm", "grass", "stadium"}:
                    crown = game_to_blender((x, z), ground + 4.5 * scale)
                    add_ellipsoid(f"{track_id}_TreeCrown_{index}_{side}", crown,
                                  (4.1 * scale, 3.5 * scale, 4.1 * scale), canopy,
                                  collection, segments=18, rings=12)
                    for cluster, (dx, dz, height) in enumerate(((-1.25, -0.35, 3.8),
                                                                (1.15, 0.42, 4.2),
                                                                (0.05, 1.25, 3.5))):
                        offset = game_to_blender((x + dx * scale, z + dz * scale),
                                                 ground + height * scale)
                        add_ellipsoid(f"{track_id}_TreeFoliage_{index}_{side}_{cluster}", offset,
                                      (2.5 * scale, 2.2 * scale, 2.6 * scale),
                                      canopy if cluster != 1 else tree_mat,
                                      collection, segments=14, rings=10)
                else:
                    # Alpine firs use fuller, overlapping tiers with rounded
                    # silhouettes rather than a pair of low-poly cones.
                    for tier, (height, radius, crown_height) in enumerate(
                            ((1.8, 2.25, 3.5), (2.9, 1.95, 3.4), (4.0, 1.62, 3.0),
                             (5.0, 1.25, 2.7), (5.8, 0.82, 2.3))):
                        center = game_to_blender((x, z), ground + height * scale)
                        tier_material = snow_tip_mat if mountain and tier >= 3 else canopy
                        add_cone(f"{track_id}_TreeCrown_{index}_{side}_{tier}", center,
                                 radius * scale, crown_height * scale, tier_material,
                                 collection, sides=20, smooth=True)
            else:
                semi_x, semi_y, semi_up = (rng.uniform(2.0, 4.5), rng.uniform(2.2, 5.0), rng.uniform(1.3, 3.3))
                yaw = rng.uniform(-0.35, 0.35)
                # Rotate in place. The vertices carry world coordinates, so turning the
                # object would swing the rock around the world origin and onto the road.
                add_oriented_ellipsoid(f"{track_id}_RoadsideRock_{index}_{side}", (x, z), ground + 1.0,
                                       (math.cos(yaw), math.sin(yaw)), (semi_x, semi_up, semi_y),
                                       rock_mat, collection, segments=14, rings=10)
                if theme == "canyon" and index % 36 == 9:
                    add_cone(f"{track_id}_Canyon_Hoodoo_{index}_{side}",
                             game_to_blender((x + rng.uniform(-4, 4), z + rng.uniform(-4, 4)), ground),
                             rng.uniform(3.0, 5.0), rng.uniform(12.0, 20.0), rock_mat,
                             collection, sides=12, smooth=True)
                elif theme == "volcano" and index % 30 == 9:
                    add_cone(f"{track_id}_Basalt_Pillar_{index}_{side}",
                             game_to_blender((x, z), ground), rng.uniform(2.0, 3.4),
                             rng.uniform(7.0, 13.0), rock_mat, collection, sides=8)
                    add_ellipsoid(f"{track_id}_Lava_Vent_{index}_{side}",
                                  game_to_blender((x + 2.1, z - 1.6), ground + 0.18),
                                  (2.7, 3.3, 0.22), lava_mat, collection, segments=12, rings=6)
                elif theme == "industrial" and index % 48 == 9:
                    gantry_posts = ((point[0] + nx * (width / 2 + 5.0), point[1] + nz * (width / 2 + 5.0)),
                                    (point[0] - nx * (width / 2 + 5.0), point[1] - nz * (width / 2 + 5.0)))
                    if side == 1 and all(route.clearance(px, pz) >= width / 2 + 3.5 for px, pz in gantry_posts):
                        left_ground = terrain_height(point[0] + nx * (width / 2 + 5.0),
                                                     point[1] + nz * (width / 2 + 5.0))
                        right_ground = terrain_height(point[0] - nx * (width / 2 + 5.0),
                                                      point[1] - nz * (width / 2 + 5.0))
                        left_base = game_to_blender((point[0] + nx * (width / 2 + 5.0),
                                                    point[1] + nz * (width / 2 + 5.0)), left_ground)
                        right_base = game_to_blender((point[0] - nx * (width / 2 + 5.0),
                                                     point[1] - nz * (width / 2 + 5.0)), right_ground)
                        left_top = game_to_blender((point[0] + nx * (width / 2 + 5.0),
                                                   point[1] + nz * (width / 2 + 5.0)), left_ground + 9.0)
                        right_top = game_to_blender((point[0] - nx * (width / 2 + 5.0),
                                                    point[1] - nz * (width / 2 + 5.0)), right_ground + 9.0)
                        add_beam(f"{track_id}_RaceGantry_L_{index}", left_base, left_top,
                                 0.24, steel_mat, collection, sides=10)
                        add_beam(f"{track_id}_RaceGantry_R_{index}", right_base, right_top,
                                 0.24, steel_mat, collection, sides=10)
                        add_beam(f"{track_id}_RaceGantry_Cross_{index}", left_top, right_top,
                                 0.28, steel_mat, collection, sides=10)


def point_at_progress(points, progress):
    index = int(progress % 1.0 * len(points)) % len(points)
    return index, points[index]


def add_jump_ramps(ramps, route, track_id, collection, road_material):
    """Closed kicker ramps that are steepest at the lip, so cars launch for real.

    The runtime collides with this exact geometry (top surface plus sidewalls),
    so a car with only half its width on the ramp really does tilt and fall off
    the unsupported side.
    """
    ramp_side_mat = make_material(f"{track_id}_JumpRamp_Sidewall", (0.055, 0.065, 0.072), 0.22, 0.78)
    stripe_mat = make_material(f"{track_id}_JumpRamp_Signal", (0.96, 0.48, 0.10), 0.06, 0.48)
    steps = 24
    for ramp_number, ramp in enumerate(ramps, start=1):
        s0, s1, half_width = ramp["s0"], ramp["s1"], ramp["half_width"]
        vertices = []
        for step in range(steps + 1):
            u = step / steps
            s = s0 + (s1 - s0) * u
            top = layout.ramp_height(u, ramp["rise"], ramp["exponent"])
            for across in (-1, 1):
                x, z, y, _tx, _tz = route.lateral(s, half_width * across)
                vertices.append(game_to_blender((x, z), y + 0.07 + top))
            for across in (-1, 1):
                x, z, y, _tx, _tz = route.lateral(s, half_width * across)
                vertices.append(game_to_blender((x, z), y + 0.0))
        faces, face_materials = [], []
        for step in range(steps):
            current, following = step * 4, (step + 1) * 4
            faces.extend((
                (current, current + 1, following + 1, following),            # top surface
                (current, following, following + 2, current + 2),            # left wall
                (current + 1, current + 3, following + 3, following + 1),    # right wall
                (current + 2, current + 3, following + 3, following + 2),    # underside
            ))
            face_materials.extend((0, 1, 1, 1))
        last = steps * 4
        faces.append((last, last + 1, last + 3, last + 2))                   # lip face
        face_materials.append(1)
        faces.append((0, 2, 3, 1))                                           # entry face
        face_materials.append(1)
        mesh_obj = make_mesh(f"{track_id}_JumpRamp_{ramp_number}", vertices, faces,
                             road_material, collection, materials=[ramp_side_mat],
                             face_materials=face_materials)
        assign_planar_uv(mesh_obj, 9.0)

        # Hazard-orange chevron bars across the ramp make it readable from the run-up.
        for bar in (0.22, 0.42, 0.62, 0.82):
            bar_vertices, bar_faces = [], []
            for offset in (0.0, 0.035):
                u = bar + offset
                s = s0 + (s1 - s0) * u
                top = layout.ramp_height(u, ramp["rise"], ramp["exponent"]) + 0.095
                for across in (-1, 1):
                    x, z, y, _tx, _tz = route.lateral(s, (half_width - 0.7) * across)
                    bar_vertices.append(game_to_blender((x, z), y + 0.0 + top))
            bar_faces.append((0, 1, 3, 2))
            make_mesh(f"{track_id}_JumpChevron_{ramp_number}_{bar}", bar_vertices, bar_faces,
                      stripe_mat, collection)

        # Orange edge markers identify the jump from the approach without
        # placing objects in the driving line.
        for side in (-1, 1):
            for marker in (0.20, 0.48, 0.76):
                s = s0 + (s1 - s0) * marker
                x, z, y, _tx, _tz = route.lateral(s, (half_width + 1.1) * side)
                add_box(f"{track_id}_JumpMarker_{ramp_number}_{side}_{marker}",
                        (0.6, 0.45, 0.42), game_to_blender((x, z), y + 0.05 + 0.22),
                        stripe_mat, 0.08, collection=collection)


def add_oriented_ellipsoid(name, center_xz, base_height, tangent, semi_axes, material, collection,
                           segments=16, rings=10):
    """Ellipsoid centred at ``base_height``; semi-axes are (lateral, up, along) for the given tangent."""
    tx, tz = tangent
    left_x, left_z = tz, -tx
    lateral, up, along = semi_axes
    vertices, faces = [], []
    for ring in range(rings + 1):
        phi = math.pi * ring / rings
        for segment in range(segments):
            theta = 2 * math.pi * segment / segments
            across = lateral * math.sin(phi) * math.cos(theta)
            forward = along * math.sin(phi) * math.sin(theta)
            vertices.append(game_to_blender((center_xz[0] + left_x * across + tx * forward,
                                             center_xz[1] + left_z * across + tz * forward),
                                            base_height + up * math.cos(phi)))
    for ring in range(rings):
        for segment in range(segments):
            a = ring * segments + segment
            b = ring * segments + (segment + 1) % segments
            c = (ring + 1) * segments + (segment + 1) % segments
            d = (ring + 1) * segments + segment
            faces.append((a, b, c, d))
    obj = make_mesh(name, vertices, faces, material, collection)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_track_hazards(hazards, track_id, collection):
    """Build the visible hazards; the runtime builds a matching solid collider for each."""
    rock = make_material(f"{track_id}_Hazard_Rock", (0.29, 0.27, 0.24), 0.0, 0.96)
    bark = make_material(f"{track_id}_Hazard_Bark", (0.24, 0.13, 0.07), 0.0, 0.92)
    signal = make_material(f"{track_id}_Hazard_Signal", (0.96, 0.34, 0.08), 0.03, 0.68)
    steel = make_material(f"{track_id}_Hazard_Steel", (0.26, 0.31, 0.33), 0.30, 0.58)
    ice = make_material(f"{track_id}_Hazard_Ice", (0.32, 0.68, 0.80), 0.04, 0.40)
    lava = make_material(f"{track_id}_Hazard_Lava", (0.98, 0.25, 0.035), 0.0, 0.58)
    coral = make_material(f"{track_id}_Hazard_Coral", (0.82, 0.36, 0.24), 0.0, 0.86)
    for index, hazard in enumerate(hazards, start=1):
        style = hazard["style"]
        x, z, y = hazard["x"], hazard["z"], hazard["y"]
        tx, tz = hazard["tx"], hazard["tz"]
        left_x, left_z = tz, -tx
        route_angle = math.atan2(-tz, tx)
        prefix = f"{track_id}_Hazard_{index}_{style}"

        if style in {"rock", "debris"}:
            add_oriented_ellipsoid(f"{prefix}_Main", (x, z), y + 0.72, (tx, tz),
                                   (2.0, 1.35, 1.65), rock, collection, segments=16, rings=10)
            if style == "debris":
                add_oriented_ellipsoid(f"{prefix}_Fragment", (x - left_x * 1.0, z - left_z * 1.0),
                                       y + 0.34, (tx, tz), (0.95, 0.62, 0.78), steel,
                                       collection, segments=12, rings=8)
        elif style in {"log", "vines"}:
            start = game_to_blender((x - left_x * 1.8, z - left_z * 1.8), y + 0.42)
            end = game_to_blender((x + left_x * 1.8, z + left_z * 1.8), y + 0.42)
            add_beam(f"{prefix}_Trunk", start, end, 0.43, bark, collection, sides=12)
            if style == "vines":
                for side in (-1, 1):
                    vine_start = game_to_blender((x + left_x * side * 1.1, z + left_z * side * 1.1), y + 0.82)
                    vine_end = game_to_blender((x - left_x * side * 0.75, z - left_z * side * 0.75), y + 0.14)
                    add_beam(f"{prefix}_Vine_{side}", vine_start, vine_end, 0.07, rock, collection, sides=8)
        elif style in {"barrier", "crate"}:
            color = signal if style == "barrier" else bark
            add_box(f"{prefix}_Body", (3.1, 1.05, 1.15), game_to_blender((x, z), y + 0.575),
                    color, 0.14, route_angle + math.pi / 2, collection)
            if style == "barrier":
                for stripe in (-1, 1):
                    add_box(f"{prefix}_Reflector_{stripe}", (0.22, 0.06, 0.82),
                            game_to_blender((x + left_x * stripe * 0.86, z + left_z * stripe * 0.86), y + 0.62),
                            steel, 0.025, route_angle + math.pi / 2, collection)
        elif style == "barrel":
            add_ellipsoid(f"{prefix}_Drum", game_to_blender((x, z), y + 0.72),
                          (1.1, 1.1, 1.42), signal, collection, segments=16, rings=10)
            for band_height in (0.40, 0.98):
                add_box(f"{prefix}_Band_{band_height}", (1.12, 1.12, 0.10),
                        game_to_blender((x, z), y + band_height), steel, 0.025, collection=collection)
        elif style == "ice":
            add_oriented_ellipsoid(f"{prefix}_IceChunk", (x, z), y + 0.46, (tx, tz),
                                   (2.2, 0.82, 1.65), ice, collection, segments=14, rings=8)
        elif style == "basalt":
            add_cone(f"{prefix}_Spire", game_to_blender((x, z), y + 0.1), 1.25, 1.85, rock, collection, sides=8)
            add_ellipsoid(f"{prefix}_Glow", game_to_blender((x + left_x * 0.72, z + left_z * 0.72), y + 0.16),
                          (0.52, 0.52, 0.12), lava, collection, segments=12, rings=6)
        elif style == "coral":
            for branch in range(3):
                offset = (branch - 1) * 0.70
                add_cone(f"{prefix}_Branch_{branch}",
                         game_to_blender((x + left_x * offset, z + left_z * offset), y + 0.08),
                         0.65, 1.40 + 0.22 * branch, coral, collection, sides=8)


def add_coin_template(track_id, collection):
    """One embossed coin; the game instances it for every pickup in the track metadata."""
    edge = make_material(f"{track_id}_Coin_Edge", (0.48, 0.25, 0.055), 0.42, 0.38)
    face = make_material(f"{track_id}_Coin_Face", (1.0, 0.63, 0.12), 0.48, 0.31)
    emblem = make_material(f"{track_id}_Coin_Emblem", (0.98, 0.86, 0.43), 0.22, 0.42)
    sides = 32
    vertices = []
    outer_back, outer_front, inner_back, inner_front = [], [], [], []
    for step in range(sides):
        angle = math.tau * step / sides
        c, s = math.cos(angle), math.sin(angle)
        outer_back.append(len(vertices)); vertices.append((0.52 * c, 0.52 * s, -0.055))
        outer_front.append(len(vertices)); vertices.append((0.52 * c, 0.52 * s, 0.055))
        inner_back.append(len(vertices)); vertices.append((0.41 * c, 0.41 * s, -0.055))
        inner_front.append(len(vertices)); vertices.append((0.41 * c, 0.41 * s, 0.055))
    back_center = len(vertices); vertices.append((0.0, 0.0, -0.057))
    front_center = len(vertices); vertices.append((0.0, 0.0, 0.057))
    faces, face_materials = [], []
    for step in range(sides):
        nxt = (step + 1) % sides
        faces.append((outer_back[step], outer_back[nxt], outer_front[nxt], outer_front[step])); face_materials.append(0)
        faces.append((outer_front[step], outer_front[nxt], inner_front[nxt], inner_front[step])); face_materials.append(0)
        faces.append((inner_back[nxt], inner_back[step], inner_front[step], inner_front[nxt])); face_materials.append(0)
        faces.append((inner_front[step], inner_front[nxt], front_center)); face_materials.append(1)
        faces.append((inner_back[nxt], inner_back[step], back_center)); face_materials.append(1)
    star = []
    for point_id in range(10):
        angle = math.pi / 2 + math.tau * point_id / 10
        radius = 0.235 if point_id % 2 == 0 else 0.105
        star.append(len(vertices))
        vertices.append((radius * math.cos(angle), radius * math.sin(angle), 0.064))
    star_center = len(vertices); vertices.append((0.0, 0.0, 0.065))
    for step in range(len(star)):
        faces.append((star[step], star[(step + 1) % len(star)], star_center)); face_materials.append(2)
    mesh = bpy.data.meshes.new(f"{track_id}_RoadCoin_Template_Mesh")
    mesh.from_pydata(vertices, [], faces)
    for material in (edge, face, emblem):
        mesh.materials.append(material)
    mesh.update()
    for polygon, material_index in zip(mesh.polygons, face_materials):
        polygon.material_index = material_index
    root = bpy.data.objects.new("CoinPickup_Template", None)
    collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    # Parked far below the course; the game clones it and removes the original.
    root.location = (0.0, 0.0, -400.0)
    root.rotation_mode = "QUATERNION"
    # Local +Z (coin face) -> world forward after glTF conversion; the game re-orients per coin.
    coin = bpy.data.objects.new("CoinPickup_Template_Mesh", mesh)
    collection.objects.link(coin)
    coin.parent = root
    coin.matrix_parent_inverse = Matrix.Identity(4)


def add_track_landmarks(points, width, track_id, theme, terrain_height, route_radius, collection, route):
    """Add one large, readable Blender-authored landmark to each circuit."""
    index, point = point_at_progress(points, 0.44)
    previous = points[(index - 1) % len(points)]
    following = points[(index + 1) % len(points)]
    dx, dz = following[0] - previous[0], following[1] - previous[1]
    span = max(1e-6, math.hypot(dx, dz))
    tx, tz = dx / span, dz / span
    nx, nz = -tz, tx
    def landmark_site(base_offset):
        # Push the landmark outward until no stretch of road passes close to it.
        for extra in (0.0, 28.0, 60.0, 100.0, 150.0):
            lx = point[0] + nx * (width / 2 + base_offset + extra)
            lz = point[1] + nz * (width / 2 + base_offset + extra)
            if route.clearance(lx, lz) >= width / 2 + 38.0:
                return lx, lz
        return lx, lz

    landmark_x, landmark_z = landmark_site(72.0)
    ground = terrain_height(landmark_x, landmark_z)
    rock = make_material(f"{track_id}_Landmark_Rock", (0.28, 0.30, 0.29), 0.02, 0.96)
    accent = make_material(f"{track_id}_Landmark_Accent", (0.90, 0.40, 0.12), 0.18, 0.5)

    if theme == "jungle":
        landmark_x, landmark_z = landmark_site(46.0)
        ground = terrain_height(landmark_x, landmark_z)
        cliff = make_material(f"{track_id}_Falls_Cliff", (0.15, 0.23, 0.18), 0.0, 0.98)
        water = make_material(f"{track_id}_Falls_Water", (0.07, 0.48, 0.68), 0.18, 0.22)
        for piece, side_shift in enumerate((-15.0, 0.0, 15.0)):
            x = landmark_x + tx * side_shift
            z = landmark_z + tz * side_shift
            add_ellipsoid(f"{track_id}_Falls_Cliff_{piece}", game_to_blender((x, z), ground + 14.0),
                          (18.0, 17.0, 34.0), cliff, collection, segments=12, rings=8)
        top_left = game_to_blender((landmark_x - tx * 7.0, landmark_z - tz * 7.0), ground + 30.0)
        top_right = game_to_blender((landmark_x + tx * 7.0, landmark_z + tz * 7.0), ground + 30.0)
        bottom_left = game_to_blender((landmark_x - tx * 7.0, landmark_z - tz * 7.0), ground + 3.0)
        bottom_right = game_to_blender((landmark_x + tx * 7.0, landmark_z + tz * 7.0), ground + 3.0)
        make_mesh(f"{track_id}_Waterfall_Cascade",
                  [bottom_left, bottom_right, top_right, top_left], [(0, 1, 2, 3)], water, collection)
        add_ellipsoid(f"{track_id}_Waterfall_Pool",
                      game_to_blender((landmark_x, landmark_z), ground + 1.2),
                      (19.0, 15.0, 1.3), water, collection, segments=20, rings=8)
    elif theme == "industrial":
        steel = make_material(f"{track_id}_Landmark_Steel", (0.19, 0.27, 0.30), 0.78, 0.32)
        for gate_progress in (0.18, 0.62):
            gate_index, gate_point = point_at_progress(points, gate_progress)
            gate_previous = points[(gate_index - 1) % len(points)]
            gate_next = points[(gate_index + 1) % len(points)]
            gate_angle = math.atan2(-(gate_next[1] - gate_previous[1]), gate_next[0] - gate_previous[0])
            left = (gate_point[0] + nx * (width / 2 + 11.0), gate_point[1] + nz * (width / 2 + 11.0))
            right = (gate_point[0] - nx * (width / 2 + 11.0), gate_point[1] - nz * (width / 2 + 11.0))
            add_box(f"{track_id}_Steel_Gantry_Post_L_{gate_progress}", (0.8, 1.0, 9.0),
                    game_to_blender(left, gate_point[2] + 4.5), steel, 0.08, collection=collection)
            add_box(f"{track_id}_Steel_Gantry_Post_R_{gate_progress}", (0.8, 1.0, 9.0),
                    game_to_blender(right, gate_point[2] + 4.5), steel, 0.08, collection=collection)
            add_box(f"{track_id}_Steel_Gantry_Crossbeam_{gate_progress}",
                    (width + 24.0, 1.0, 0.8), game_to_blender((gate_point[0], gate_point[1]), gate_point[2] + 9.1),
                    accent, 0.08, gate_angle, collection)
    elif theme in {"beach", "coastal", "coastal_sunset", "island"}:
        water_color = (0.035, 0.32, 0.45) if theme != "coastal_sunset" else (0.055, 0.22, 0.34)
        if theme == "island":
            water_color = (0.025, 0.38, 0.44)
        sea = make_material(f"{track_id}_Coastal_Water", water_color, 0.10, 0.62)
        extent = route_radius + 225.0
        sea_height = -16.0
        vertices = [game_to_blender((-extent, -extent), sea_height),
                    game_to_blender((extent, -extent), sea_height),
                    game_to_blender((extent, extent), sea_height),
                    game_to_blender((-extent, extent), sea_height)]
        make_mesh(f"{track_id}_Ocean_Horizon", vertices, [(0, 1, 2, 3)], sea, collection)
        lighthouse_x = landmark_x + nx * 36.0
        lighthouse_z = landmark_z + nz * 36.0
        if theme == "island":
            coral = make_material(f"{track_id}_SeaStack_Coral", (0.44, 0.32, 0.23), 0.0, 0.94)
            for stack, offset in enumerate((-20.0, 0.0, 21.0)):
                stack_x = lighthouse_x + tx * offset
                stack_z = lighthouse_z + tz * offset
                add_ellipsoid(f"{track_id}_SeaStack_{stack}",
                              game_to_blender((stack_x, stack_z), ground + 10.0 + (stack % 2) * 4),
                              (10.0, 13.0, 26.0 + (stack % 2) * 7), coral, collection,
                              segments=16, rings=10)
            add_box(f"{track_id}_Island_Beacon_Base", (3.4, 3.4, 8.0),
                    game_to_blender((lighthouse_x, lighthouse_z), ground + 4.0),
                    make_material(f"{track_id}_Beacon_Stone", (0.78, 0.74, 0.61), 0.0, 0.82),
                    0.25, collection=collection)
        else:
            lamp = make_material(f"{track_id}_Lighthouse_Lamp", (1.0, 0.76, 0.37), 0.0, 0.46)
            lighthouse_mat = make_material(f"{track_id}_Lighthouse_Paint", (0.84, 0.78, 0.65), 0.02, 0.78)
            add_box(f"{track_id}_Coast_Lighthouse", (4.2, 4.2, 20.0),
                    game_to_blender((lighthouse_x, lighthouse_z), ground + 10.0),
                    lighthouse_mat, 0.5, collection=collection)
            add_ellipsoid(f"{track_id}_Lighthouse_Beacon",
                          game_to_blender((lighthouse_x, lighthouse_z), ground + 21.0),
                          (3.0, 3.0, 1.5), lamp, collection, segments=16, rings=8)
    elif theme in {"mountain_adventure", "canyon", "volcano", "ice"}:
        ridge_mat = make_material(f"{track_id}_Ridge_Silhouette", (0.31, 0.34, 0.34), 0.0, 0.95)
        if theme == "volcano":
            ridge_mat = make_material(f"{track_id}_Crater_Rock", (0.16, 0.12, 0.11), 0.0, 0.95)
        elif theme == "ice":
            ridge_mat = make_material(f"{track_id}_Ice_Ridge", (0.67, 0.78, 0.84), 0.0, 0.9)
        for peak, offset in enumerate((-34.0, -8.0, 22.0, 44.0)):
            x = landmark_x + tx * offset
            z = landmark_z + tz * offset
            peak_height = ground + (31.0 if peak % 2 else 23.0)
            add_cone(f"{track_id}_Ridge_Spire_{peak}", game_to_blender((x, z), ground),
                     15.0 if peak % 2 else 19.0, peak_height - ground, ridge_mat,
                     collection, sides=14, smooth=True)
    else:
        # A lit marshal tower gives otherwise open routes a useful sense of scale.
        tower = make_material(f"{track_id}_Marshal_Tower", (0.25, 0.29, 0.30), 0.38, 0.42)
        add_box(f"{track_id}_Marshal_Tower_Base", (5.0, 5.0, 14.0),
                game_to_blender((landmark_x, landmark_z), ground + 7.0), tower, 0.2, collection=collection)
        add_box(f"{track_id}_Marshal_Tower_Roof", (8.0, 7.0, 1.2),
                game_to_blender((landmark_x, landmark_z), ground + 14.4), accent, 0.16, collection=collection)


def build_track(track_id, theme, length, difficulty):
    global ACTIVE_COLLECTION
    ACTIVE_COLLECTION = make_collection(f"{track_id} - Blender Mountain Course")
    width = 26.0 if length in {"short", "medium"} else 24.0
    road = make_material(f"{track_id}_Track_Asphalt", (0.105, 0.112, 0.119), 0.02, 0.86)
    asphalt_maps = make_tiled_surface_maps(f"{track_id}_Asphalt", sum(ord(char) for char in track_id) + 41)
    add_tiled_surface_maps(road, asphalt_maps)
    red = make_material(f"{track_id}_Kerb_Red", (0.78, 0.055, 0.038), 0.03, 0.68)
    white = make_material(f"{track_id}_Kerb_White", (0.86, 0.88, 0.87), 0.0, 0.7)
    edge_line = make_material(f"{track_id}_Road_EdgeLine", (0.78, 0.81, 0.80), 0.0, 0.68)
    barrier_mat = make_material(f"{track_id}_Barrier_Guardrail", (0.16, 0.19, 0.21), 0.48, 0.36)
    support_mat = make_material(f"{track_id}_Barrier_Support", (0.28, 0.30, 0.31), 0.55, 0.34)
    gate_mat = make_material(f"{track_id}_Start_Gate", (0.03, 0.46, 0.50), 0.32, 0.32)
    dark = make_material(f"{track_id}_Start_Sign", (0.018, 0.027, 0.035), 0.34, 0.35)

    centerline = build_track_centerline(track_id, length, difficulty)
    raw_points = layout.catmull_rom_points(centerline, 480, TRACK_TENSION)
    # Widen corners tighter than the road, carve straights for the jumps, then
    # plan every pickup/hazard against the final route.
    points, ramp_anchors = layout.prepare_route(track_id, raw_points, width)
    route = layout.Route(points)
    plan = layout.plan_layout(track_id, route, width, ramp_anchors)
    for problem in layout.verify_layout(track_id, route, width, plan):
        print(f"WARNING [{track_id}] {problem}")
    terrain_height, route_radius = make_terrain(points, track_id, theme, ACTIVE_COLLECTION, width)
    if theme in {"beach", "coastal_sunset", "island"}:
        add_track_landmarks(points, width, track_id, theme, terrain_height, route_radius,
                            ACTIVE_COLLECTION, route)
    asphalt = ribbon_geometry(points, -width / 2, width / 2, 0.05,
                              f"{track_id}_Road_Asphalt", road, ACTIVE_COLLECTION)
    assign_planar_uv(asphalt, 9.0)
    ribbon_geometry(points, -width / 2 - 1.4, -width / 2,
                    0.08, f"{track_id}_Kerb_Left", red, ACTIVE_COLLECTION,
                    white, alternate_every=10)
    ribbon_geometry(points, width / 2, width / 2 + 1.4,
                    0.08, f"{track_id}_Kerb_Right", red, ACTIVE_COLLECTION,
                    white, alternate_every=10)
    # Thin painted edge lines leave a clean racing surface and give the road
    # believable scale without the old continuous yellow stripe down its middle.
    ribbon_geometry(points, -width / 2 + 0.46, -width / 2 + 0.74, 0.09,
                    f"{track_id}_RoadEdge_Left", edge_line, ACTIVE_COLLECTION)
    ribbon_geometry(points, width / 2 - 0.74, width / 2 - 0.46, 0.09,
                    f"{track_id}_RoadEdge_Right", edge_line, ACTIVE_COLLECTION)

    # Continuous guardrails with regularly spaced steel supports keep the
    # playable track legible above the sculpted mountain slopes.
    for side in (-1, 1):
        ribbon_geometry(points, side * (width / 2 + 3.0), side * (width / 2 + 3.45),
                        1.12, f"{track_id}_Guardrail_{side}", barrier_mat, ACTIVE_COLLECTION)
    for index in range(0, len(points), 18):
        point = points[index]
        previous = points[(index - 1) % len(points)]
        following = points[(index + 1) % len(points)]
        dx, dz = following[0] - previous[0], following[1] - previous[1]
        line_length = max(1e-6, math.hypot(dx, dz))
        nx, nz = -dz / line_length, dx / line_length
        for side in (-1, 1):
            x = point[0] + nx * (width / 2 + 3.2) * side
            z = point[1] + nz * (width / 2 + 3.2) * side
            add_box(f"{track_id}_GuardrailPost_{index}_{side}", (0.35, 0.48, 1.15),
                    game_to_blender((x, z), point[2] + 0.53), support_mat, 0.04,
                    collection=ACTIVE_COLLECTION)

    start_x, start_z, start_y, dx, dz = route.at(0.0)
    p0 = (start_x, start_z, start_y)
    length0 = 1.0
    rx, rz = -dz, dx
    start_vertices, start_faces, start_mats = [], [], []
    across = 16
    for cell in range(across):
        start = -width / 2 + width * cell / across
        end = -width / 2 + width * (cell + 1) / across
        verts = [
            game_to_blender((p0[0] + rx * start, p0[1] + rz * start), p0[2] + 0.11),
            game_to_blender((p0[0] + rx * end, p0[1] + rz * end), p0[2] + 0.11),
            game_to_blender((p0[0] + rx * end + dx / length0 * 2.0,
                             p0[1] + rz * end + dz / length0 * 2.0), p0[2] + 0.11),
            game_to_blender((p0[0] + rx * start + dx / length0 * 2.0,
                             p0[1] + rz * start + dz / length0 * 2.0), p0[2] + 0.11)
        ]
        base = len(start_vertices)
        start_vertices.extend(verts)
        start_faces.append((base, base + 1, base + 2, base + 3))
        start_mats.append(cell % 2)
    make_mesh(f"{track_id}_StartFinish_Checkers", start_vertices, start_faces,
              dark, ACTIVE_COLLECTION, materials=[white], face_materials=start_mats)

    center = (p0[0], p0[1])
    left = (center[0] + rx * (width / 2 + 1.2), center[1] + rz * (width / 2 + 1.2))
    right = (center[0] - rx * (width / 2 + 1.2), center[1] - rz * (width / 2 + 1.2))
    for name, point in (("Left", left), ("Right", right)):
        add_box(f"{track_id}_StartGate_{name}", (0.42, 0.5, 4.2),
                game_to_blender(point, p0[2] + 2.1), gate_mat, 0.08,
                collection=ACTIVE_COLLECTION)
    gate_angle = math.atan2(-rz, rx)
    add_box(f"{track_id}_StartGate_Top", (width + 2.8, 0.54, 0.4),
            game_to_blender(center, p0[2] + 4.22), gate_mat, 0.08,
            gate_angle, ACTIVE_COLLECTION)
    add_box(f"{track_id}_StartGate_Sign", (4.4, 0.58, 0.78),
            game_to_blender(center, p0[2] + 4.85), dark, 0.07,
            gate_angle, ACTIVE_COLLECTION)
    sign_text = bpy.data.curves.new(f"{track_id}_Start_Label_Type", type="FONT")
    sign_text.body = "START"
    sign_text.align_x = "CENTER"
    sign_text.align_y = "CENTER"
    sign_text.size = 0.48
    sign_text.extrude = 0.012
    sign = bpy.data.objects.new(f"{track_id}_Start_Label", sign_text)
    ACTIVE_COLLECTION.objects.link(sign)
    sign.data.materials.append(white)
    sign.location = game_to_blender((center[0] - dx / length0 * 0.32,
                                     center[1] - dz / length0 * 0.32), p0[2] + 4.85)
    sign.rotation_euler = (math.pi / 2, 0, gate_angle)

    add_track_scenery(points, width, track_id, theme, terrain_height, ACTIVE_COLLECTION, route)
    add_jump_ramps(plan["ramps"], route, track_id, ACTIVE_COLLECTION, road)
    add_track_hazards(plan["hazards"], track_id, ACTIVE_COLLECTION)
    add_coin_template(track_id, ACTIVE_COLLECTION)
    if theme not in {"beach", "coastal_sunset", "island"}:
        add_track_landmarks(points, width, track_id, theme, terrain_height, route_radius,
                            ACTIVE_COLLECTION, route)

    def three_position(item, height=None):
        # Game (x, z, y) -> Three.js (x, y, z); heights are already road level.
        return [round(item["x"], 3), round(item["y"] if height is None else height, 3), round(item["z"], 3)]

    metadata = {
        "version": 2,
        "id": track_id,
        "theme": theme,
        "width": width,
        "length": round(route.length, 2),
        "gravity": layout.GAME_GRAVITY,
        "guardrailOffset": layout.GUARDRAIL_OFFSET,
        "forwardAxis": "+Z",
        "coordinateSystem": "Three.js Y-up, +Z forward; route lateral + is left",
        "terrain": "Blender-generated 3D mountain heightfield",
        # The exact closed loop of samples the road ribbon was built from.
        "route": [[round(x, 3), round(y, 3), round(z, 3)] for x, z, y in points],
        "start": {"position": [round(start_x, 3), round(start_y + 0.05, 3), round(start_z, 3)],
                  "tangent": [round(dx, 5), round(dz, 5)]},
        "ramps": [{"s0": r["s0"], "s1": r["s1"], "halfWidth": r["half_width"], "rise": r["rise"],
                   "exponent": r["exponent"]} for r in plan["ramps"]],
        "hazards": [{"id": h["id"], "style": h["style"], "shape": h["shape"], "half": h["half"],
                     "centre": h["centre"], "position": three_position(h),
                     "yaw": round(math.atan2(h["tx"], h["tz"]), 5), "s": h["s"], "lane": h["lane"]}
                    for h in plan["hazards"]],
        "nitro": [{"position": three_position(n), "s": n["s"], "lane": n["lane"]} for n in plan["nitro"]],
        "coins": [{"position": three_position(c), "s": c["s"], "kind": c["kind"]} for c in plan["coins"]],
    }
    (EXPORT_DIR / f"{track_id}.track.json").write_text(json.dumps(metadata, indent=2) + "\n")
    return ACTIVE_COLLECTION


def make_selectable(collection):
    bpy.ops.object.select_all(action="DESELECT")
    view_layer = bpy.context.view_layer
    for obj in collection.objects:
        obj.select_set(True, view_layer=view_layer)
    view_layer.objects.active = next(iter(collection.objects), None)


def export_collection(collection, output_path):
    operator = bpy.ops.export_scene.gltf
    supported = set(operator.get_rna_type().properties.keys())
    # Export the active export scene directly. Selecting a large procedural
    # collection through the UI operator needlessly forces Blender to evaluate
    # every joined terrain/scenery datablock and can destabilize long builds.
    arguments = {"filepath": str(output_path), "export_format": "GLB", "use_selection": False}
    if "use_active_scene" in supported:
        arguments["use_active_scene"] = True
    if "export_apply" in supported:
        arguments["export_apply"] = True
    if "export_yup" in supported:
        arguments["export_yup"] = True
    operator(**arguments)
    before, after = compact_glb_file(output_path)
    print(f"Compacted active-scene course ({before:,} -> {after:,} bytes)")
    print(f"Exported {output_path.relative_to(PROJECT_ROOT)} ({output_path.stat().st_size:,} bytes)")


def main():
    """Compatibility entry point; rebuild the race environments only."""
    import importlib.util

    track_builder_path = Path(__file__).resolve().with_name("build_road_tracks.py")
    spec = importlib.util.spec_from_file_location("turbo_road_track_builder", track_builder_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load the road environment builder: {track_builder_path}")
    track_builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(track_builder)
    track_builder.main()


if __name__ == "__main__":
    main()
