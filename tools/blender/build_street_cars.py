"""Build the realistic street cars for Turbo Road League.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_street_cars.py -- --preview

Each car is a smooth lofted body (cross-sections along its length, subdivided),
with cut wheel arches, a glazed cabin, alloy wheels with brake discs, lamps,
mirrors, grille and exhausts. ``--preview`` renders a picture of each into
``assets/previews/`` instead of only exporting.

Model space while building: +X is the nose, +Y the left side, +Z up, origin on
the road under the middle of the car.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
PREVIEWS = ROOT / "assets" / "previews"
EXPORT_DIR = ROOT / "public" / "models" / "blender"
SKY = ROOT / "public" / "sky" / "dusk_1k.hdr"


# --------------------------------------------------------------------------- #
# Materials
# --------------------------------------------------------------------------- #

def principled(name, color, metallic=0.0, roughness=0.5, coat=0.0, emission=None, strength=0.0, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes["Principled BSDF"]
    node.inputs["Base Color"].default_value = (*color, 1.0)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    coat_socket = node.inputs.get("Coat Weight")
    if coat_socket:
        coat_socket.default_value = coat
        node.inputs["Coat Roughness"].default_value = 0.06
    if emission:
        node.inputs["Emission Color"].default_value = (*emission, 1.0)
        node.inputs["Emission Strength"].default_value = strength
    if transmission:
        node.inputs["Transmission Weight"].default_value = transmission
    mat.diffuse_color = (*color, 1.0)
    return mat


def car_materials(paint):
    return {
        "paint": principled("VehiclePaint", paint, metallic=0.55, roughness=0.28, coat=1.0),
        "glass": principled("Glass", (0.015, 0.02, 0.025), metallic=0.9, roughness=0.05),
        "trim": principled("Trim_Black", (0.012, 0.012, 0.014), roughness=0.45),
        "rubber": principled("Tyre_Rubber", (0.02, 0.02, 0.022), roughness=0.82),
        "alloy": principled("Wheel_Alloy", (0.62, 0.64, 0.66), metallic=1.0, roughness=0.22),
        "disc": principled("Brake_Disc", (0.45, 0.45, 0.46), metallic=1.0, roughness=0.35),
        "caliper": principled("Brake_Caliper", (0.75, 0.05, 0.03), metallic=0.3, roughness=0.4),
        "lamp": principled("Lamp_Head", (0.9, 0.9, 0.85), roughness=0.1, emission=(1.0, 0.95, 0.85), strength=6.0),
        "tail": principled("Lamp_Tail", (0.35, 0.0, 0.0), roughness=0.2, emission=(1.0, 0.05, 0.02), strength=4.0),
        "chrome": principled("Chrome", (0.8, 0.8, 0.82), metallic=1.0, roughness=0.08),
        "plate": principled("Plate", (0.85, 0.85, 0.8), roughness=0.5),
    }


# --------------------------------------------------------------------------- #
# Body
# --------------------------------------------------------------------------- #

# Body styles. Stations run from tail to nose as
# (x, half width, underside z, shoulder z, roof z or None, cabin half width),
# and ``zones`` names what the strip of body between each pair of stations is.
# Narrow strips (the pillars) give the smoothed surface its crisp window edges.
COUPE_ZONES = ["tail", "deck", "deck", "rearglass", "cpillar", "window", "bpillar", "window", "apillar",
               "windshield", "hood", "hood", "hood", "lamp", "nose"]

CARS = {
    # Front-engined sports coupe.
    "car_apex_gp": {
        "paint": (0.55, 0.02, 0.02), "wheel_radius": 0.345, "tyre_width": 0.27, "wheelbase": 2.66,
        "stations": [
            (-2.25, 0.72, 0.42, 0.82, None, 0.0), (-2.17, 0.87, 0.32, 0.90, None, 0.0), (-1.85, 0.94, 0.22, 0.94, None, 0.0),
            (-1.45, 0.96, 0.19, 0.95, 0.99, 0.62), (-0.98, 0.965, 0.18, 0.93, 1.19, 0.66), (-0.90, 0.965, 0.18, 0.93, 1.21, 0.665),
            (-0.22, 0.965, 0.18, 0.905, 1.27, 0.69), (-0.16, 0.965, 0.18, 0.90, 1.27, 0.69), (0.46, 0.955, 0.18, 0.875, 1.15, 0.71),
            (0.54, 0.955, 0.18, 0.87, 1.12, 0.715), (0.94, 0.95, 0.19, 0.85, 0.89, 0.74), (1.35, 0.945, 0.20, 0.80, None, 0.0),
            (1.80, 0.92, 0.23, 0.72, None, 0.0), (2.08, 0.87, 0.28, 0.64, None, 0.0), (2.22, 0.77, 0.34, 0.56, None, 0.0),
            (2.27, 0.62, 0.40, 0.52, None, 0.0),
        ],
        "zones": COUPE_ZONES,
    },
    # Hot hatch: short, tall, with the roof carried back to a steep tailgate.
    "car_vector_gp": {
        "paint": (0.03, 0.30, 0.24), "wheel_radius": 0.33, "tyre_width": 0.25, "wheelbase": 2.56,
        "stations": [
            (-2.05, 0.74, 0.44, 0.84, None, 0.0), (-1.97, 0.88, 0.33, 0.92, None, 0.0), (-1.80, 0.93, 0.24, 0.96, 1.02, 0.66),
            (-1.40, 0.95, 0.20, 0.95, 1.36, 0.70), (-1.32, 0.95, 0.20, 0.95, 1.38, 0.705), (-0.42, 0.955, 0.19, 0.93, 1.42, 0.72),
            (-0.36, 0.955, 0.19, 0.93, 1.42, 0.72), (0.36, 0.95, 0.19, 0.91, 1.34, 0.73), (0.44, 0.95, 0.19, 0.905, 1.31, 0.735),
            (0.90, 0.945, 0.20, 0.89, 0.93, 0.76), (1.30, 0.94, 0.21, 0.85, None, 0.0), (1.70, 0.91, 0.24, 0.78, None, 0.0),
            (1.90, 0.86, 0.29, 0.70, None, 0.0), (2.02, 0.76, 0.35, 0.62, None, 0.0), (2.06, 0.62, 0.41, 0.57, None, 0.0),
        ],
        "zones": ["tail", "deck", "rearglass", "cpillar", "window", "bpillar", "window", "apillar", "windshield",
                  "hood", "hood", "hood", "lamp", "nose"],
    },
    # Muscle car: long bonnet, short deck, square shoulders.
    "car_emberline_gp": {
        "paint": (0.62, 0.18, 0.02), "wheel_radius": 0.355, "tyre_width": 0.29, "wheelbase": 2.84,
        "stations": [
            (-2.40, 0.76, 0.44, 0.84, None, 0.0), (-2.32, 0.90, 0.34, 0.92, None, 0.0), (-1.95, 0.96, 0.24, 0.95, None, 0.0),
            (-1.55, 0.975, 0.20, 0.96, 1.00, 0.68), (-1.10, 0.98, 0.19, 0.95, 1.26, 0.72), (-1.02, 0.98, 0.19, 0.95, 1.28, 0.725),
            (-0.42, 0.98, 0.19, 0.93, 1.33, 0.74), (-0.36, 0.98, 0.19, 0.93, 1.33, 0.74), (0.16, 0.975, 0.19, 0.91, 1.27, 0.75),
            (0.24, 0.975, 0.19, 0.905, 1.24, 0.755), (0.62, 0.97, 0.20, 0.89, 0.93, 0.78), (1.20, 0.965, 0.21, 0.86, None, 0.0),
            (1.85, 0.95, 0.23, 0.80, None, 0.0), (2.22, 0.91, 0.28, 0.74, None, 0.0), (2.37, 0.84, 0.34, 0.66, None, 0.0),
            (2.42, 0.72, 0.40, 0.60, None, 0.0),
        ],
        "zones": COUPE_ZONES,
    },
    # Mid-engined supercar: low, wide and cab-forward.
    "car_northstar_gp": {
        "paint": (0.02, 0.10, 0.36), "wheel_radius": 0.35, "tyre_width": 0.30, "wheelbase": 2.70,
        "stations": [
            (-2.27, 0.78, 0.40, 0.74, None, 0.0), (-2.19, 0.93, 0.30, 0.82, None, 0.0), (-1.85, 1.00, 0.20, 0.86, None, 0.0),
            (-1.25, 1.00, 0.17, 0.86, 0.90, 0.60), (-0.75, 1.00, 0.16, 0.85, 1.10, 0.64), (-0.67, 1.00, 0.16, 0.85, 1.12, 0.645),
            (-0.10, 1.00, 0.16, 0.83, 1.16, 0.67), (-0.04, 1.00, 0.16, 0.83, 1.16, 0.67), (0.55, 0.995, 0.16, 0.80, 1.06, 0.69),
            (0.63, 0.995, 0.16, 0.795, 1.03, 0.695), (1.12, 0.99, 0.17, 0.76, 0.80, 0.72), (1.50, 0.985, 0.18, 0.70, None, 0.0),
            (1.90, 0.95, 0.21, 0.62, None, 0.0), (2.14, 0.88, 0.26, 0.55, None, 0.0), (2.25, 0.78, 0.31, 0.49, None, 0.0),
            (2.29, 0.64, 0.36, 0.45, None, 0.0),
        ],
        "zones": COUPE_ZONES,
    },
}


def measure(spec):
    """Fills in the sizes the builders need from the stations."""
    stations = spec["stations"]
    spec["length"] = stations[-1][0] - stations[0][0]
    spec["centre"] = (stations[-1][0] + stations[0][0]) / 2
    spec["half_width"] = max(station[1] for station in stations)
    spec["height"] = max(station[4] or station[3] for station in stations)
    spec["track"] = spec["half_width"] - spec["tyre_width"] / 2 - 0.035
    return spec


RING = 10   # points per half cross-section, underside centre to roof centre
PAINT, GLASS, TRIM, LAMP, TAIL = range(5)

# Bands round a cross-section, counted from the underside centre:
# 0 underside, 1 sill, 2 lower side, 3 upper side, 4 shoulder, 5 door top, 6 window, 7 roof edge, 8 roof.
def zone_material(zone, band):
    if band == 0:
        return TRIM
    if band == 1 and zone not in ("tail", "nose", "lamp"):
        return TRIM                                   # the dark rocker panel
    if zone == "window" and band == 6:
        return GLASS
    if zone in ("windshield", "rearglass") and band >= 6:
        return GLASS
    if zone == "bpillar" and band in (6, 7):
        return TRIM
    if zone == "lamp" and band in (3, 4):
        return LAMP
    if zone == "tail" and band in (3, 4):
        return TAIL
    if zone == "nose" and band in (1, 2):
        return TRIM                                   # lower intake
    return PAINT


def half_section(width, bottom, shoulder, roof, cabin):
    """One side of a cross-section as (y, z) points, from the underside centre to the top centre."""
    side = [
        (0.0, bottom), (width * 0.74, bottom), (width * 0.97, bottom + 0.075),
        (width, bottom + (shoulder - bottom) * 0.52), (width * 0.985, shoulder - 0.075), (width * 0.925, shoulder),
    ]
    if roof is None:
        crown = shoulder + 0.05
        top = [(width * 0.72, shoulder + 0.022), (width * 0.46, crown - 0.008), (width * 0.2, crown), (0.0, crown)]
    else:
        rise = roof - shoulder
        top = [(cabin + (width * 0.925 - cabin) * 0.4, shoulder + rise * 0.14), (cabin, shoulder + rise * 0.84),
               (cabin * 0.72, roof), (0.0, roof)]
    return side + top


def build_body(spec, mats):
    mesh = bmesh.new()
    crease = mesh.edges.layers.float.new("crease_edge")
    rings = []
    for x, width, bottom, shoulder, roof, cabin in spec["stations"]:
        half = half_section(width, bottom, shoulder, roof, cabin)
        left = [mesh.verts.new((x, y, z)) for y, z in half]
        right = [mesh.verts.new((x, -y, z)) for y, z in half[1:-1]]
        # Full ring: left side up to the top centre, then back down the right side.
        rings.append(left + right[::-1])
    count = len(rings[0])
    for index, zone in enumerate(spec["zones"]):
        a, b = rings[index], rings[index + 1]
        for k in range(count):
            n = (k + 1) % count
            face = mesh.faces.new((a[k], a[n], b[n], b[k]))
            band = k if k <= RING - 2 else count - 1 - k
            face.material_index = zone_material(zone, band)
            # Keep the shoulder line, the sill and the roof edge defined after smoothing.
            point = k if k <= RING - 1 else count - k
            if point in (2, 5, 7):
                edge = mesh.edges.get((a[k], b[k]))
                if edge:
                    edge[crease] = 0.55 if point == 5 else 0.4
    tail = mesh.faces.new(rings[0][::-1])
    nose = mesh.faces.new(rings[-1])
    nose.material_index = TRIM                        # the grille
    tail.material_index = PAINT
    for face in (tail, nose):
        for edge in face.edges:
            edge[crease] = 0.5
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    data = bpy.data.meshes.new("Body")
    mesh.to_mesh(data)
    mesh.free()
    body = bpy.data.objects.new("Body", data)
    bpy.context.scene.collection.objects.link(body)
    for key in ("paint", "glass", "trim", "lamp", "tail"):
        data.materials.append(mats[key])
    subsurf = body.modifiers.new("Smooth", "SUBSURF")
    subsurf.levels = 3
    subsurf.render_levels = 3
    apply_modifiers(body)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    return body


def apply_modifiers(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def cut_arches(body, spec, mats):
    """Wheel arches: a cylinder is cut out of the body at each wheel. A dark tub inside the
    body is what shows through the openings."""
    radius = spec["wheel_radius"] + 0.07
    for x in (spec["wheelbase"] / 2, -spec["wheelbase"] / 2):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=3.0, location=(x, 0, spec["wheel_radius"] - 0.01),
                                            rotation=(math.pi / 2, 0, 0))
        cutter = bpy.context.object
        boolean = body.modifiers.new("Arch", "BOOLEAN")
        boolean.operation = "DIFFERENCE"
        boolean.object = cutter
        boolean.solver = "EXACT"
        apply_modifiers(body)
        bpy.data.objects.remove(cutter)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.3))
    tub = bpy.context.object
    tub.name = "Underbody"
    tub.location = (0, 0, 0.3)
    tub.scale = (spec["wheelbase"] + 0.9, spec["half_width"] * 1.4, 0.2)
    tub.data.materials.append(mats["trim"])


# --------------------------------------------------------------------------- #
# Wheels and details
# --------------------------------------------------------------------------- #

def add(obj, material, smooth=True):
    obj.data.materials.append(material)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def build_wheel(name, x, side, spec, mats):
    """A low-profile tyre on a ten-spoke alloy with a brake disc and caliper behind it."""
    radius, width = spec["wheel_radius"], spec["tyre_width"]
    y = side * spec["track"]
    z = radius
    parts = []
    # Tyre: a torus squashed to a flat tread with round shoulders.
    bpy.ops.mesh.primitive_torus_add(major_radius=radius - 0.075, minor_radius=0.075, major_segments=56, minor_segments=14,
                                     location=(x, y, z), rotation=(math.pi / 2, 0, 0))
    tyre = bpy.context.object
    tyre.scale = (1.0, 1.0, width / 0.15)
    parts.append(add(tyre, mats["rubber"]))
    rim_radius = radius - 0.1
    # Rim barrel and outer lip.
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=rim_radius, depth=width * 0.82, location=(x, y, z), rotation=(math.pi / 2, 0, 0))
    parts.append(add(bpy.context.object, mats["trim"]))
    bpy.ops.mesh.primitive_torus_add(major_radius=rim_radius, minor_radius=0.014, major_segments=56, minor_segments=8,
                                     location=(x, y + side * width * 0.4, z), rotation=(math.pi / 2, 0, 0))
    parts.append(add(bpy.context.object, mats["alloy"]))
    # Spokes: slim tapered blades from hub to rim.
    for spoke in range(10):
        angle = math.tau * spoke / 10
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x + math.cos(angle) * rim_radius * 0.54, y + side * width * 0.36,
                                                          z + math.sin(angle) * rim_radius * 0.54))
        blade = bpy.context.object
        blade.scale = (rim_radius * 0.92, 0.03, 0.036)
        blade.rotation_euler = (0, -angle, 0)
        bevel = blade.modifiers.new("Bevel", "BEVEL")
        bevel.width = 0.008
        bevel.segments = 2
        parts.append(add(blade, mats["alloy"], smooth=False))
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.065, depth=0.05, location=(x, y + side * width * 0.38, z), rotation=(math.pi / 2, 0, 0))
    parts.append(add(bpy.context.object, mats["alloy"]))
    # Brake disc and caliper, visible through the spokes.
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=rim_radius * 0.8, depth=0.024, location=(x, y + side * width * 0.12, z), rotation=(math.pi / 2, 0, 0))
    parts.append(add(bpy.context.object, mats["disc"]))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x - rim_radius * 0.58, y + side * width * 0.16, z + rim_radius * 0.32))
    caliper = bpy.context.object
    caliper.scale = (0.1, 0.07, 0.17)
    parts.append(add(caliper, mats["caliper"], smooth=False))
    for part in parts:
        part.name = name
    return parts


def ellipsoid(location, scale, material, name):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    obj = bpy.context.object
    obj.scale = scale
    obj.name = name
    return add(obj, material)


def box(location, scale, material, name, bevel=0.012, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.scale = scale
    obj.name = name
    modifier = obj.modifiers.new("Bevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = 3
    return add(obj, material, smooth=False)


def build_details(spec, mats):
    stations = spec["stations"]
    tail_x = stations[0][0]
    # The station at the foot of the windscreen: the mirrors sit just behind it.
    foot = stations[spec["zones"].index("windshield") + 1]
    for side in (1, -1):
        ellipsoid((foot[0] - 0.12, side * (foot[5] + 0.14), foot[3] + 0.09), (0.085, 0.055, 0.05), mats["paint"], "Mirror")
        box((foot[0] - 0.12, side * (foot[5] + 0.07), foot[3] + 0.065), (0.05, 0.12, 0.02), mats["trim"], "MirrorStalk")
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.05, depth=0.16, location=(tail_x + 0.1, side * 0.36, stations[0][2] - 0.08),
                                            rotation=(0, math.pi / 2, 0))
        add(bpy.context.object, mats["chrome"]).name = "Exhaust"
    box((tail_x + 0.035, 0, stations[0][2] + 0.19), (0.03, 0.44, 0.1), mats["plate"], "PlateRear", bevel=0.006)


def build_car(spec):
    measure(spec)
    mats = car_materials(spec["paint"])
    body = build_body(spec, mats)
    cut_arches(body, spec, mats)
    half = spec["wheelbase"] / 2
    wheels = {}
    for label, x in (("Front", half), ("Rear", -half)):
        for side_name, side in (("L", 1), ("R", -1)):
            key = f"Wheel_{label}_{side_name}"
            wheels[key] = build_wheel(key, x, side, spec, mats)
    build_details(spec, mats)
    return wheels


# --------------------------------------------------------------------------- #
# Export in the layout the game expects: a root with the body mesh and one
# "WheelPivot_*" empty per wheel, nose toward -Y (which exports as the game's +Z).
# --------------------------------------------------------------------------- #

def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target="MESH")
    if len(objects) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


def assemble(asset_id, wheels):
    scene = bpy.context.scene
    wheel_objects = {id(part) for parts in wheels.values() for part in parts}
    body_parts = [obj for obj in scene.objects if obj.type == "MESH" and id(obj) not in wheel_objects]
    body = join(body_parts, "Body")
    root = bpy.data.objects.new(f"Vehicle_{asset_id}", None)
    scene.collection.objects.link(root)
    meshes = [body]
    pivots = []
    for key, parts in wheels.items():
        centre = parts[0].location.copy()      # the tyre sits on the axle centre
        wheel = join(parts, f"WheelMesh_{key}")
        bpy.context.scene.cursor.location = centre
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        pivots.append((key, wheel, centre))
        meshes.append(wheel)
    # Turn the whole car so its nose points down -Y, then bake that into the meshes.
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
        mesh.rotation_euler = (0, 0, -math.pi / 2)
        x, y, z = mesh.location
        mesh.location = (y, -x, z)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    body.parent = root
    for key, wheel, _ in pivots:
        pivot = bpy.data.objects.new(f"WheelPivot_{key}", None)
        scene.collection.objects.link(pivot)
        pivot.location = wheel.location.copy()
        pivot.parent = root
        wheel.parent = pivot
        wheel.location = (0, 0, 0)
    return root


def export(asset_id):
    path = EXPORT_DIR / f"{asset_id}.glb"
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_yup=True, export_apply=True, use_selection=True)
    triangles = sum(len(obj.data.loop_triangles) if obj.data.loop_triangles else (obj.data.calc_loop_triangles() or len(obj.data.loop_triangles))
                    for obj in bpy.context.scene.objects if obj.type == "MESH")
    print(f"exported {path.relative_to(ROOT)}: {triangles:,} triangles, {path.stat().st_size:,} bytes")


# --------------------------------------------------------------------------- #
# Preview render
# --------------------------------------------------------------------------- #

def render_preview(path):
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 620
    world = bpy.data.worlds.new("Sky")
    world.use_nodes = True
    scene.world = world
    nodes = world.node_tree.nodes
    environment = nodes.new("ShaderNodeTexEnvironment")
    environment.image = bpy.data.images.load(str(SKY))
    world.node_tree.links.new(environment.outputs["Color"], nodes["Background"].inputs["Color"])
    nodes["Background"].inputs["Strength"].default_value = 2.2
    # A stretch of road to stand on and reflect.
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    bpy.context.object.data.materials.append(principled("Road", (0.045, 0.047, 0.05), roughness=0.55))
    bpy.ops.object.light_add(type="AREA", location=(3.5, -4.5, 4.5))
    key = bpy.context.object
    key.data.energy = 1400
    key.data.size = 5
    key.rotation_euler = (math.radians(52), 0, math.radians(38))
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    scene.collection.objects.link(camera)
    camera.data.lens = 58
    camera.name = "Camera"
    scene.camera = camera
    # Front and rear three-quarter views.
    for suffix, location in (("front", (5.6, -5.2, 1.55)),):
        camera.location = location
        direction = Vector((0.0, 0, 0.55)) - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(path.with_name(f"{path.stem}_{suffix}.png"))
        bpy.ops.render.render(write_still=True)


def main():
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    wanted = [name for name in arguments if not name.startswith("--")] or list(CARS)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    for asset_id in wanted:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        spec = CARS[asset_id]
        wheels = build_car(spec)
        print(f"{asset_id}: length {spec['length']:.2f} width {spec['half_width'] * 2:.2f} height {spec['height']:.2f} "
              f"wheelbase {spec['wheelbase']:.2f} track {spec['track']:.3f} radius {spec['wheel_radius']:.3f}")
        if "--preview" in arguments:
            PREVIEWS.mkdir(parents=True, exist_ok=True)
            render_preview(PREVIEWS / f"{asset_id}.png")
            # The preview adds a road, a light and a camera: drop them before exporting.
            for obj in list(bpy.context.scene.objects):
                if obj.type in {"CAMERA", "LIGHT"} or obj.name.startswith("Plane"):
                    bpy.data.objects.remove(obj)
        assemble(asset_id, wheels)
        export(asset_id)


if __name__ == "__main__":
    main()
