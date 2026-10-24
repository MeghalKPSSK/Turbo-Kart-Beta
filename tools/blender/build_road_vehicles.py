"""Build the original Blender vehicle set for Turbo Road League.

Run this in Blender's Python Console (replace PROJECT with the project folder):
  path = 'PROJECT/tools/blender/build_road_vehicles.py'
  exec(compile(open(path).read(), path, 'exec'), {'__name__': '__main__', '__file__': path})
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "assets" / "blender"
EXPORT_DIR = ROOT / "public" / "models" / "blender"
BLENDER_TOOLS = Path(__file__).resolve().parent
if str(BLENDER_TOOLS) not in sys.path:
    sys.path.insert(0, str(BLENDER_TOOLS))
from compact_glb_exports import compact_glb_file


def material(name, color, metallic=0.0, roughness=0.4, emission=None, alpha=1.0):
    rgba = (*color, alpha)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    coat = shader.inputs.get("Coat Weight") or shader.inputs.get("Clearcoat")
    if coat:
        coat.default_value = 0.24 if metallic > 0.2 else 0.10
    coat_roughness = shader.inputs.get("Coat Roughness") or shader.inputs.get("Clearcoat Roughness")
    if coat_roughness:
        coat_roughness.default_value = 0.30
    if emission:
        socket = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        if socket:
            socket.default_value = (*emission, 1.0)
            shader.inputs["Emission Strength"].default_value = 1.4
    return mat


def move_to_collection(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def cube(name, center, size, mat, collection, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft manufactured edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
        obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
    obj.data.materials.append(mat)
    return move_to_collection(obj, collection)


def ellipsoid(name, center, size, mat, collection, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(mat)
    return move_to_collection(obj, collection)


def cylinder(name, center, radius, depth, mat, collection, axis="x", vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center)
    obj = bpy.context.object
    obj.name = name
    if axis == "x":
        obj.rotation_euler[1] = math.pi / 2
    elif axis == "y":
        obj.rotation_euler[0] = math.pi / 2
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return move_to_collection(obj, collection)


def beam(name, start, end, radius, mat, collection, vertices=12):
    start, end = Vector(start), Vector(end)
    axis = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=axis.length,
                                         location=(start + end) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = axis.to_track_quat("Z", "Y")
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return move_to_collection(obj, collection)


def tube_path(name, points, radius, mat, collection, resolution=3):
    """Create a rounded, continuous tube for frames, braces, and trim lines."""
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1.0)
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def smooth_tube_path(name, points, radius, mat, collection, resolution=4):
    """Create an auto-smoothed tube for curved safety and frame structures."""
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def oval_tube(name, center, radius_x, radius_y, z, tube_radius, mat, collection, steps=40):
    points = [(center[0] + math.cos(math.tau * i / steps) * radius_x,
               center[1] + math.sin(math.tau * i / steps) * radius_y, z)
              for i in range(steps + 1)]
    return tube_path(name, points, tube_radius, mat, collection)


def torus(name, center, major, minor, mat, collection):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=32, minor_segments=10,
                                     location=center, rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return move_to_collection(obj, collection)


def make_collection(name, parent):
    collection = bpy.data.collections.new(name)
    parent.children.link(collection)
    return collection


def parent_vehicle(collection, root_name):
    root = bpy.data.objects.new(root_name, None)
    collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    for obj in list(collection.objects):
        if obj is root:
            continue
        obj.parent = root
        obj.matrix_parent_inverse = root.matrix_world.inverted()
    return root


def wheel_pair(prefix, y, z, radius, tire_mat, rim_mat, brake_mat, collection, width=0.19):
    cylinder(f"{prefix}_Tire", (0, y, z), radius, width, tire_mat, collection, "x", 40)
    for side in (-1, 1):
        x = side * (width * 0.52)
        cylinder(f"{prefix}_Rim_{side}", (x, y, z), radius * 0.67, 0.045,
                 rim_mat, collection, "x", 32)
        cylinder(f"{prefix}_Hub_{side}", (x * 1.25, y, z), radius * 0.16, 0.06,
                 brake_mat, collection, "x", 20)
        torus(f"{prefix}_Bead_{side}", (x * 1.03, y, z), radius * 0.77,
              radius * 0.035, tire_mat, collection)
        face_x = side * (width * 0.66)
        torus(f"{prefix}_RimLip_{side}", (face_x, y, z), radius * 0.57,
              radius * 0.025, rim_mat, collection)
        # Five broad swept cast spokes read as a modern motorcycle alloy wheel.
        for spoke in range(5):
            angle = math.tau * spoke / 5 + (0.10 if side < 0 else 0.0)
            beam(f"{prefix}_Spoke_{side}_{spoke}",
                 (face_x, y + math.cos(angle) * radius * 0.14,
                  z + math.sin(angle) * radius * 0.14),
                 (face_x, y + math.cos(angle + 0.19) * radius * 0.53,
                  z + math.sin(angle + 0.19) * radius * 0.53),
                 radius * 0.045, rim_mat, collection, 10)
        for hole in range(8):
            angle = math.tau * hole / 8
            ellipsoid(f"{prefix}_RotorHole_{side}_{hole}",
                      (face_x - side * 0.055,
                       y + math.cos(angle) * radius * 0.38,
                       z + math.sin(angle) * radius * 0.38),
                      (0.018, 0.045, 0.045), brake_mat, collection, segments=10, rings=6)


def formula_wheel(prefix, x, y, radius, tire_mat, rim_mat, brake_mat, collection, width=0.34):
    cylinder(f"{prefix}_Tyre", (x, y, radius), radius, width, tire_mat, collection, "x", 48)
    for side in (-1, 1):
        face_x = x + side * (width * 0.52)
        cylinder(f"{prefix}_Rotor_{side}", (face_x, y, radius), radius * 0.76, 0.045,
                 brake_mat, collection, "x", 36)
        # F1 wheel faces are covered and close to planar; exposed five-spoke
        # kart-style rims made these cars read as toys.
        cover_x = face_x + side * 0.045
        cylinder(f"{prefix}_RimCover_{side}", (cover_x, y, radius), radius * 0.62, 0.055,
                 rim_mat, collection, "x", 32)
        torus(f"{prefix}_RimLip_{side}", (cover_x + side * 0.032, y, radius),
              radius * 0.61, radius * 0.018, rim_mat, collection)
        cylinder(f"{prefix}_Hub_{side}", (cover_x + side * 0.045, y, radius), radius * 0.14, 0.065,
                 brake_mat, collection, "x", 20)
        torus(f"{prefix}_Bead_{side}", (face_x, y, radius), radius * 0.84,
              radius * 0.028, tire_mat, collection)
        for vent in range(8):
            angle = math.tau * vent / 8
            slot = ellipsoid(f"{prefix}_CoolingSlot_{side}_{vent}",
                             (cover_x + side * 0.033,
                              y + math.cos(angle) * radius * 0.43,
                              radius + math.sin(angle) * radius * 0.43),
                             (0.012, radius * 0.10, radius * 0.035), brake_mat,
                             collection, segments=12, rings=8)
            slot.rotation_euler[0] = angle + math.pi / 2


def smooth_profile(sections, subdivisions=4):
    """Densify a longitudinal profile with clamped Catmull-Rom interpolation."""
    if len(sections) < 2:
        return list(sections)
    result = []
    for index in range(len(sections) - 1):
        p0 = sections[max(0, index - 1)]
        p1 = sections[index]
        p2 = sections[index + 1]
        p3 = sections[min(len(sections) - 1, index + 2)]
        for step in range(subdivisions):
            t = step / subdivisions
            row = []
            for column in range(len(p1)):
                value = 0.5 * ((2 * p1[column])
                               + (-p0[column] + p2[column]) * t
                               + (2 * p0[column] - 5 * p1[column] + 4 * p2[column] - p3[column]) * t * t
                               + (-p0[column] + 3 * p1[column] - 3 * p2[column] + p3[column]) * t * t * t)
                row.append(max(min(p1[column], p2[column]), min(max(p1[column], p2[column]), value)))
            result.append(tuple(row))
    result.append(tuple(sections[-1]))
    return result


def formula_body(name, sections, mat, collection, radial_steps=32):
    sections = smooth_profile(sections)
    vertices = []
    for y, half_width, bottom, top in sections:
        center_z = (bottom + top) * 0.5
        half_height = (top - bottom) * 0.5
        for step in range(radial_steps):
            angle = math.tau * step / radial_steps
            # A soft superellipse gives bodywork flatter top surfaces and
            # shoulders than a sphere while retaining smooth reflections.
            x = math.cos(angle)
            z = math.sin(angle)
            vertices.append((half_width * math.copysign(abs(x) ** 0.78, x), y,
                             center_z + half_height * math.copysign(abs(z) ** 0.78, z)))
    faces = []
    for ring in range(len(sections) - 1):
        for step in range(radial_steps):
            a = ring * radial_steps + step
            b = ring * radial_steps + (step + 1) % radial_steps
            c = (ring + 1) * radial_steps + (step + 1) % radial_steps
            d = (ring + 1) * radial_steps + step
            faces.append((a, b, c, d))
    faces.extend([tuple(reversed(range(radial_steps))),
                  tuple((len(sections) - 1) * radial_steps + step for step in range(radial_steps))])
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return obj


def vertical_body(name, sections, mat, collection, radial_steps=28):
    """Loft a seated torso from shaped horizontal rings instead of a sphere."""
    sections = smooth_profile(sections)
    vertices = []
    for z, center_y, half_width, half_depth in sections:
        for step in range(radial_steps):
            angle = math.tau * step / radial_steps
            x = math.cos(angle)
            y = math.sin(angle)
            vertices.append((half_width * math.copysign(abs(x) ** 0.82, x),
                             center_y + half_depth * math.copysign(abs(y) ** 0.82, y), z))
    faces = []
    for ring in range(len(sections) - 1):
        for step in range(radial_steps):
            a = ring * radial_steps + step
            b = ring * radial_steps + (step + 1) % radial_steps
            c = (ring + 1) * radial_steps + (step + 1) % radial_steps
            d = (ring + 1) * radial_steps + step
            faces.append((a, b, c, d))
    faces.extend([tuple(reversed(range(radial_steps))),
                  tuple((len(sections) - 1) * radial_steps + step for step in range(radial_steps))])
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return obj


def helmet_visor(name, center, radii, mat, collection, width_ratio=0.82,
                 height_ratio=0.30, z_offset=0.04, x_steps=20, z_steps=6):
    """Fit a thin tinted shield to the front ellipsoid surface of a helmet."""
    cx, cy, cz = center
    rx, ry, rz = radii
    vertices = []
    faces = []
    for z_step in range(z_steps + 1):
        v = z_step / z_steps * 2.0 - 1.0
        for x_step in range(x_steps + 1):
            u = x_step / x_steps * 2.0 - 1.0
            nx = u * width_ratio
            nz = z_offset / rz + v * height_ratio
            depth = math.sqrt(max(0.025, 1.0 - nx * nx - nz * nz))
            x = cx + rx * nx
            y = cy - ry * depth - 0.006
            z = cz + rz * nz
            vertices.append((x, y, z))
    stride = x_steps + 1
    for z_step in range(z_steps):
        for x_step in range(x_steps):
            a = z_step * stride + x_step
            b = a + 1
            d = (z_step + 1) * stride + x_step
            c = d + 1
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def airfoil_mesh(name, center, span, chord, thickness, mat, collection, steps=16):
    """Build a thin swept, cambered wing element instead of a beveled box."""
    vertices, faces = [], []
    span_steps = 12
    profile = []
    for step in range(steps + 1):
        u = step / steps
        yt = 5 * thickness * (0.2969 * math.sqrt(max(u, 0.0001)) - 0.1260 * u
                             - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4)
        camber = 0.045 * math.sin(math.pi * u)
        profile.append((u, camber + yt))
    for step in range(steps - 1, 0, -1):
        u = step / steps
        yt = 5 * thickness * (0.2969 * math.sqrt(max(u, 0.0001)) - 0.1260 * u
                             - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4)
        camber = 0.045 * math.sin(math.pi * u)
        profile.append((u, camber - yt))
    profile_count = len(profile)
    for span_step in range(span_steps + 1):
        v = span_step / span_steps
        across = (v - 0.5) * span
        taper = 1.0 - 0.10 * abs(v - 0.5) * 2
        sweep = abs(v - 0.5) * chord * 0.13
        for u, height in profile:
            y = center[1] - chord * taper / 2 + sweep + u * chord * taper
            z = center[2] + height * chord + abs(v - 0.5) * 0.025
            vertices.append((center[0] + across, y, z))
    for span_step in range(span_steps):
        for profile_step in range(profile_count):
            a = span_step * profile_count + profile_step
            b = span_step * profile_count + (profile_step + 1) % profile_count
            c = (span_step + 1) * profile_count + (profile_step + 1) % profile_count
            d = (span_step + 1) * profile_count + profile_step
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(profile_count))))
    faces.append(tuple(span_steps * profile_count + step for step in range(profile_count)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return obj


def aero_endplate(name, x, y_front, y_rear, z_bottom, z_top, thickness, mat, collection):
    """Tapered 3D wing endplate with a sculpted trailing edge."""
    height = z_top - z_bottom
    length = y_rear - y_front
    outline = [
        (y_front, z_bottom + height * 0.16),
        (y_front + length * 0.10, z_top - height * 0.25),
        (y_front + length * 0.27, z_top - height * 0.08),
        (y_rear - length * 0.20, z_top),
        (y_rear, z_top - height * 0.16),
        (y_rear - length * 0.02, z_bottom + height * 0.24),
        (y_rear - length * 0.20, z_bottom + height * 0.06),
        (y_front + length * 0.28, z_bottom),
    ]
    vertices = [(x - thickness / 2, y, z) for y, z in outline]
    vertices.extend((x + thickness / 2, y, z) for y, z in outline)
    count = len(outline)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces.extend((index, (index + 1) % count, (index + 1) % count + count, index + count)
                 for index in range(count))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    bevel = obj.modifiers.new("Endplate edge radius", "BEVEL")
    bevel.width = min(0.025, thickness * 0.18)
    bevel.segments = 2
    return obj


def build_bike(parent, asset_id, label, paint_color, trim_color, fairing=False, variant=0):
    collection = make_collection(f"Blender Vehicle - {label}", parent)
    paint = material(f"VehiclePaint_{asset_id}", paint_color, 0.18, 0.31)
    paint_shader = paint.node_tree.nodes.get("Principled BSDF")
    paint_coat = paint_shader.inputs.get("Coat Weight") or paint_shader.inputs.get("Clearcoat")
    if paint_coat:
        paint_coat.default_value = 0.38
    paint_coat_roughness = paint_shader.inputs.get("Coat Roughness") or paint_shader.inputs.get("Clearcoat Roughness")
    if paint_coat_roughness:
        paint_coat_roughness.default_value = 0.22
    trim = material(f"VehicleTrim_{asset_id}", trim_color, 0.24, 0.48)
    rubber = material(f"RoadRubber_{asset_id}", (0.025, 0.032, 0.041), 0.0, 0.86)
    metal = material(f"Titanium_{asset_id}", (0.25, 0.29, 0.32), 0.58, 0.38)
    dark = material(f"Carbon_{asset_id}", (0.025, 0.031, 0.038), 0.20, 0.48)
    glass = material(f"Lamp_{asset_id}", (0.78, 0.91, 1.0), 0.12, 0.12, (0.48, 0.76, 1.0))
    red = material(f"TailLamp_{asset_id}", (0.8, 0.025, 0.018), 0.04, 0.18, (1.0, 0.02, 0.01))
    brake = material(f"BrakeDisc_{asset_id}", (0.20, 0.22, 0.23), 0.52, 0.48)

    wheel_pair(f"BikeWheel_Front_{asset_id}", -1.08, 0.59, 0.58, rubber, metal, brake, collection, 0.18)
    wheel_pair(f"BikeWheel_Rear_{asset_id}", 1.05, 0.59, 0.58, rubber, metal, brake, collection, 0.24)
    # Trellis, swingarm, and power unit give the silhouette layered mechanical detail.
    beam(f"Bike_Frame_Lower_{asset_id}", (0, 0.72, 0.76), (0, -0.44, 0.83), 0.07, metal, collection)
    beam(f"Bike_Frame_Left_{asset_id}", (-0.20, 0.65, 0.73), (-0.18, -0.43, 0.88), 0.045, trim, collection)
    beam(f"Bike_Frame_Right_{asset_id}", (0.20, 0.65, 0.73), (0.18, -0.43, 0.88), 0.045, trim, collection)
    beam(f"Bike_Swingarm_L_{asset_id}", (-0.12, 0.88, 0.66), (-0.12, 0.15, 0.82), 0.055, metal, collection)
    beam(f"Bike_Swingarm_R_{asset_id}", (0.12, 0.88, 0.66), (0.12, 0.15, 0.82), 0.055, metal, collection)
    # A shaped crankcase and canted cylinder casting replace the toy-like
    # rectangular engine block, with mechanical covers kept as separate parts.
    formula_body(f"Bike_Crankcase_{asset_id}", [
        (-0.34, 0.16, 0.63, 0.87), (-0.18, 0.27, 0.57, 1.05),
        (0.08, 0.32, 0.55, 1.12), (0.34, 0.27, 0.59, 1.04),
        (0.49, 0.15, 0.65, 0.88),
    ], dark, collection)
    formula_body(f"Bike_CylinderBlock_{asset_id}", [
        (-0.19, 0.19, 0.90, 1.09), (-0.03, 0.24, 0.88, 1.28),
        (0.15, 0.22, 0.85, 1.27), (0.30, 0.15, 0.85, 1.10),
    ], metal, collection)
    formula_body(f"Bike_Sump_{asset_id}", [
        (0.00, 0.16, 0.51, 0.67), (0.16, 0.23, 0.48, 0.72),
        (0.35, 0.19, 0.50, 0.68), (0.45, 0.12, 0.56, 0.67),
    ], dark, collection)
    for side in (-1, 1):
        cylinder(f"Bike_ClutchCover_{asset_id}_{side}", (side * 0.335, 0.15, 0.79),
                 0.22, 0.075, metal, collection, "x", 32)
        cylinder(f"Bike_ClutchCore_{asset_id}_{side}", (side * 0.38, 0.15, 0.79),
                 0.105, 0.045, dark, collection, "x", 24)
    for fin in range(5):
        fin_y = -0.16 + fin * 0.09
        beam(f"Bike_EngineFin_{asset_id}_{fin}_L", (-0.20, fin_y, 1.13),
             (-0.13, fin_y + 0.01, 1.18), 0.018, metal, collection, 12)
        beam(f"Bike_EngineFin_{asset_id}_{fin}_R", (0.20, fin_y, 1.13),
             (0.13, fin_y + 0.01, 1.18), 0.018, metal, collection, 12)
    for side in (-1, 1):
        beam(f"Bike_Header_{asset_id}_{side}", (side * 0.16, -0.18, 0.98),
             (side * 0.26, 0.25, 0.63), 0.055, metal, collection, 16)
    formula_body(f"Bike_FuelTank_{asset_id}", [
        (-0.78, 0.16, 1.08, 1.26), (-0.55, 0.29, 1.04, 1.47),
        (-0.23, 0.39, 1.03, 1.54), (0.08, 0.36, 1.04, 1.48),
        (0.35, 0.25, 1.07, 1.34),
    ], paint, collection)
    cube(f"Bike_TankStripe_{asset_id}", (0, -0.25, 1.49), (0.055, 0.46, 0.014), trim, collection, 0.012)
    ellipsoid(f"Bike_Seat_{asset_id}", (0, 0.55, 1.19), (0.47, 0.72, 0.16), dark, collection)
    formula_body(f"Bike_TailBody_{asset_id}", [
        (0.60, 0.18, 1.18, 1.31), (0.79, 0.29, 1.17, 1.43),
        (1.02, 0.27, 1.18, 1.40), (1.20, 0.12, 1.20, 1.31),
    ], paint, collection)
    ellipsoid(f"Bike_TailLight_{asset_id}", (0, 1.18, 1.30), (0.36, 0.08, 0.13), red, collection)
    beam(f"Bike_Fork_L_{asset_id}", (-0.17, -0.96, 0.80), (-0.11, -0.26, 1.15), 0.043, metal, collection)
    beam(f"Bike_Fork_R_{asset_id}", (0.17, -0.96, 0.80), (0.11, -0.26, 1.15), 0.043, metal, collection)
    beam(f"Bike_Handlebar_{asset_id}", (-0.51, -0.36, 1.36), (0.51, -0.36, 1.36), 0.035, metal, collection)
    if not fairing:
        for side in (-1, 1):
            mirror_center = (side * 0.50, -0.53, 1.53)
            beam(f"Bike_MirrorStem_{asset_id}_{side}", (side * 0.43, -0.38, 1.39),
                 mirror_center, 0.018, metal, collection, 10)
            ellipsoid(f"Bike_Mirror_{asset_id}_{side}", mirror_center,
                      (0.16, 0.13, 0.075), dark, collection, 24, 14)
    if fairing:
        formula_body(f"Bike_FrontFairing_{asset_id}", [
            (-1.53, 0.04, 0.96, 1.06), (-1.37, 0.13, 0.93, 1.25),
            (-1.15, 0.21, 0.91, 1.41), (-0.92, 0.26, 0.94, 1.45),
            (-0.68, 0.24, 0.99, 1.37), (-0.43, 0.15, 1.04, 1.27),
        ], paint, collection)
        formula_body(f"Bike_Windscreen_{asset_id}", [
            (-1.33, 0.04, 1.25, 1.29), (-1.22, 0.085, 1.31, 1.47),
            (-1.05, 0.12, 1.37, 1.58), (-0.88, 0.10, 1.40, 1.55),
        ], material(f"BikeGlass_{asset_id}", (0.035, 0.10, 0.14), 0.18, 0.22), collection)
        for side in (-1, 1):
            ellipsoid(f"Bike_LED_{asset_id}_{side}", (side * 0.10, -1.46, 1.12),
                      (0.07, 0.035, 0.045), glass, collection)
        ellipsoid(f"Bike_Intake_{asset_id}", (0, -1.475, 1.24),
                  (0.105, 0.025, 0.045), dark, collection)
        for side in (-1, 1):
            ellipsoid(f"Bike_FairingDuct_{asset_id}_{side}", (side * 0.29, -0.70, 1.20),
                      (0.045, 0.22, 0.075), dark, collection)
            tube_path(f"Bike_FairingStripe_{asset_id}_{side}", [
                (side * 0.285, -1.00, 1.10), (side * 0.30, -0.78, 1.08),
                (side * 0.29, -0.56, 1.13)], 0.012, trim, collection)
    else:
        # A narrow, faceted projector cowl keeps the naked bike's front end
        # compact instead of reading as a spherical toy fairing.
        formula_body(f"Bike_HeadlightCowl_{asset_id}", [
            (-1.19, 0.07, 1.14, 1.27), (-1.07, 0.19, 1.07, 1.41),
            (-0.87, 0.23, 1.04, 1.43), (-0.66, 0.16, 1.06, 1.35),
        ], dark, collection)
    if not fairing:
        for side in (-1, 1):
            ellipsoid(f"Bike_Headlight_{asset_id}_{side}", (side * 0.105, -1.22, 1.26),
                      (0.12, 0.052, 0.065), glass, collection)
    if variant == 2:
        # A compact number plate, high mudguard, and raised stance distinguish the scrambler.
        formula_body(f"Bike_NumberPlate_{asset_id}", [
            (-1.12, 0.07, 1.50, 1.60), (-1.06, 0.25, 1.46, 1.72),
            (-0.91, 0.28, 1.45, 1.72), (-0.83, 0.16, 1.49, 1.65),
        ], paint, collection)
        ellipsoid(f"Bike_HighMudguard_{asset_id}", (0, -0.87, 1.04), (0.62, 0.68, 0.12), paint, collection)
        cube(f"Bike_RadiatorGuard_{asset_id}", (0, -0.05, 0.96), (0.68, 0.10, 0.39), metal, collection, 0.04)
        for tread_y, tread_z, tread_radius in ((-1.08, 0.59, 0.58), (1.05, 0.59, 0.58)):
            for lug in range(12):
                angle = math.tau * lug / 12
                lug_obj = cube(f"Bike_Tread_{asset_id}_{len(collection.objects)}",
                               (0, tread_y + math.cos(angle) * tread_radius,
                                tread_z + math.sin(angle) * tread_radius),
                               (0.21, 0.12, 0.10), rubber, collection, 0.025)
                lug_obj.rotation_euler[0] = -angle
    elif variant == 3:
        # Endurance fairing winglets and a tall tail fin form a separate race package.
        for side in (-1, 1):
            ellipsoid(f"Bike_Winglet_{asset_id}_{side}", (side * 0.45, -0.53, 1.12),
                      (0.23, 0.40, 0.045), trim, collection)
            beam(f"Bike_WingletSupport_{asset_id}_{side}", (side * 0.26, -0.46, 1.06),
                 (side * 0.51, -0.44, 1.14), 0.025, metal, collection)
        aero_endplate(f"Bike_TailFin_{asset_id}", 0, 0.54, 1.16, 1.35, 1.68,
                      0.045, trim, collection)
    beam(f"Bike_Exhaust_{asset_id}", (0.29, 0.52, 0.80), (0.37, 1.18, 0.76), 0.09, metal, collection)
    cylinder(f"Bike_ExhaustTip_{asset_id}", (0.37, 1.20, 0.76), 0.105, 0.06, dark, collection, "y", 20)
    cube(f"Bike_Footpeg_L_{asset_id}", (-0.35, 0.47, 0.80), (0.24, 0.09, 0.07), metal, collection, 0.03)
    cube(f"Bike_Footpeg_R_{asset_id}", (0.35, 0.47, 0.80), (0.24, 0.09, 0.07), metal, collection, 0.03)
    # Original clothed rider and helmet are part of the vehicle asset, not a UI sprite.
    suit = material(f"RiderSuit_{asset_id}", (0.025, 0.034, 0.043), 0.015, 0.80)
    suit_accent = material(f"RiderAccent_{asset_id}", (0.09, 0.105, 0.12), 0.08, 0.58)
    helmet = material(f"RiderHelmet_{asset_id}", (0.075, 0.09, 0.11), 0.34, 0.25)
    visor = material(f"RiderVisor_{asset_id}", (0.035, 0.09, 0.13), 0.6, 0.12)
    lean = -0.10 if fairing else 0.0
    torso = ellipsoid(f"Rider_Torso_{asset_id}", (0, 0.10 + lean, 1.40),
                      (0.44, 0.65, 0.55), suit, collection, 36, 24)
    torso.rotation_euler[0] = 0.30
    chest = ellipsoid(f"Rider_Chest_Protector_{asset_id}", (0, -0.16 + lean, 1.48),
                      (0.29, 0.075, 0.25), suit_accent, collection, 32, 20)
    chest.rotation_euler[0] = 0.30
    ellipsoid(f"Rider_NeckCollar_{asset_id}", (0, -0.075 + lean, 1.67),
              (0.25, 0.24, 0.17), dark, collection, 28, 16)
    for side in (-1, 1):
        ellipsoid(f"Rider_Shoulder_{asset_id}_{side}", (side * 0.19, -0.045, 1.56),
                  (0.21, 0.28, 0.24), suit, collection, 28, 18)
    helmet_center = (0, -0.045 + lean, 1.865)
    helmet_radii = (0.185, 0.22, 0.16)
    ellipsoid(f"Rider_HelmetShell_{asset_id}", helmet_center,
              (helmet_radii[0] * 2, helmet_radii[1] * 2, helmet_radii[2] * 2),
              helmet, collection, 40, 24)
    helmet_visor(f"Rider_Visor_{asset_id}", helmet_center, helmet_radii, visor,
                 collection, width_ratio=0.79, height_ratio=0.29, z_offset=0.035)
    glove = material(f"RiderGlove_{asset_id}", (0.025, 0.032, 0.038), 0.12, 0.52)
    boot = material(f"RiderBoot_{asset_id}", (0.035, 0.042, 0.048), 0.18, 0.48)
    for side in (-1, 1):
        shoulder = (side * 0.21, -0.055, 1.62)
        elbow = (side * 0.31, -0.28, 1.47)
        wrist = (side * 0.40, -0.39, 1.37)
        beam(f"Rider_UpperArm_{asset_id}_{side}", shoulder, elbow, 0.105, suit, collection)
        ellipsoid(f"Rider_Elbow_{asset_id}_{side}", elbow, (0.17, 0.18, 0.17), suit_accent, collection, 24, 16)
        beam(f"Rider_Forearm_{asset_id}_{side}", elbow, wrist, 0.082, suit, collection)
        ellipsoid(f"Rider_Glove_{asset_id}_{side}", (side * 0.42, -0.40, 1.36),
                  (0.12, 0.13, 0.095), glove, collection)
        knee = (side * 0.25, 0.43, 1.14)
        ankle = (side * 0.29, 0.66, 0.84)
        beam(f"Rider_Thigh_{asset_id}_{side}", (side * 0.14, 0.26, 1.36), knee,
             0.145, suit, collection)
        ellipsoid(f"Rider_KneePad_{asset_id}_{side}", knee, (0.20, 0.17, 0.19), suit_accent, collection, 24, 16)
        beam(f"Rider_Shin_{asset_id}_{side}", knee, ankle, 0.098, suit, collection)
        ellipsoid(f"Rider_Boot_{asset_id}_{side}", (side * 0.30, 0.67, 0.82),
                  (0.18, 0.31, 0.14), boot, collection)
    for side in (-1, 1):
        cylinder(f"Bike_HandleGrip_{asset_id}_{side}", (side * 0.42, -0.36, 1.36),
                 0.055, 0.18, glove, collection, "x", 20)
    parent_vehicle(collection, f"Vehicle_{asset_id}")
    return collection


def build_car(parent, asset_id, label, paint_color, trim_color, variant=0):
    collection = make_collection(f"Blender Vehicle - {label}", parent)
    paint = material(f"VehiclePaint_{asset_id}", paint_color, 0.18, 0.30)
    paint_shader = paint.node_tree.nodes.get("Principled BSDF")
    paint_coat = paint_shader.inputs.get("Coat Weight") or paint_shader.inputs.get("Clearcoat")
    if paint_coat:
        paint_coat.default_value = 0.38
    paint_coat_roughness = paint_shader.inputs.get("Coat Roughness") or paint_shader.inputs.get("Clearcoat Roughness")
    if paint_coat_roughness:
        paint_coat_roughness.default_value = 0.22
    trim = material(f"VehicleTrim_{asset_id}", trim_color, 0.24, 0.48)
    rubber = material(f"RoadRubber_{asset_id}", (0.018, 0.022, 0.027), 0.0, 0.9)
    metal = material(f"ForgedMetal_{asset_id}", (0.34, 0.37, 0.39), 0.62, 0.35)
    dark = material(f"Carbon_{asset_id}", (0.018, 0.025, 0.032), 0.25, 0.42)
    glass = material(f"Visor_{asset_id}", (0.035, 0.085, 0.12), 0.64, 0.11)
    lamp = material(f"Lamp_{asset_id}", (0.78, 0.9, 1.0), 0.08, 0.12, (0.52, 0.78, 1.0))
    # Current formula cars use near-equal tyre diameters; the rear axle uses
    # a wider tyre rather than a visibly oversized wheel.
    radius_front = 0.49 if variant in (0, 2) else 0.50
    radius_rear = 0.51 if variant in (0, 3) else 0.52
    front_y, rear_y = (-1.30, 1.34) if variant in (0, 1) else (-1.38, 1.42)
    for x_sign in (-1, 1):
        formula_wheel(f"F1Front_{asset_id}_{x_sign}", x_sign * 1.04, front_y, radius_front,
                      rubber, metal, dark, collection, 0.32)
        formula_wheel(f"F1Rear_{asset_id}_{x_sign}", x_sign * 1.12, rear_y, radius_rear,
                      rubber, metal, dark, collection, 0.42)
        # Thin double wishbones articulate from the monocoque to each hub.
        tube_path(f"SuspensionFrontUpper_{asset_id}_{x_sign}", [
            (x_sign * 0.28, -0.76, 0.90), (x_sign * 0.61, -1.00, 0.83),
            (x_sign * 1.04, front_y, radius_front + 0.18)], 0.022, metal, collection)
        tube_path(f"SuspensionFrontLower_{asset_id}_{x_sign}", [
            (x_sign * 0.30, -0.72, 0.55), (x_sign * 0.62, -1.02, 0.55),
            (x_sign * 1.04, front_y, radius_front - 0.13)], 0.024, metal, collection)
        tube_path(f"SuspensionRearUpper_{asset_id}_{x_sign}", [
            (x_sign * 0.32, 0.88, 0.98), (x_sign * 0.69, 1.08, 0.95),
            (x_sign * 1.12, rear_y, radius_rear + 0.15)], 0.024, metal, collection)
        tube_path(f"SuspensionRearLower_{asset_id}_{x_sign}", [
            (x_sign * 0.34, 0.78, 0.54), (x_sign * 0.70, 1.04, 0.55),
            (x_sign * 1.12, rear_y, radius_rear - 0.13)], 0.026, metal, collection)

    formula_body(f"F1Monocoque_{asset_id}", [
        (-2.48, 0.09, 0.42, 0.54), (-2.08, 0.17, 0.43, 0.67),
        (-1.57, 0.27, 0.43, 0.79), (-0.92, 0.44, 0.46, 0.94),
        (-0.40, 0.64, 0.46, 1.02), (0.45, 0.65, 0.48, 1.07),
        (0.95, 0.47, 0.48, 1.13), (1.48, 0.30, 0.48, 0.85),
        (1.78, 0.17, 0.48, 0.67)
    ], paint, collection)
    # Formula front wing, splitter and endplates.
    wing_span = 2.92 if variant == 2 else (2.58 if variant == 3 else 2.70)
    airfoil_mesh(f"FrontWing_Main_{asset_id}", (0, -2.12, 0.42), wing_span, 0.44, 0.15, dark, collection)
    airfoil_mesh(f"FrontWing_Flap_{asset_id}", (0, -1.86, 0.55), wing_span * 0.91, 0.19, 0.11, dark, collection)
    airfoil_mesh(f"FrontWing_LowerFlap_{asset_id}", (0, -2.20, 0.31), wing_span * 0.92, 0.22, 0.11, dark, collection)
    for side in (-1, 1):
        aero_endplate(f"FrontWing_Endplate_{asset_id}_{side}", side * 1.31,
                      -2.37, -1.82, 0.28, 0.68, 0.075, paint, collection)
        # A tapered cross-section creates the sidepod's down-swept waist and shoulder.
        sidepod = formula_body(f"Sidepod_{asset_id}_{side}", [
            (-0.39, 0.20, 0.50, 0.70), (-0.08, 0.30, 0.48, 0.82),
            (0.25, 0.35, 0.47, 0.86), (0.67, 0.36, 0.47, 0.84),
            (1.02, 0.28, 0.47, 0.72), (1.28, 0.15, 0.48, 0.62),
        ], paint, collection)
        sidepod.location.x = side * 0.72
        # The dark inlet sits on the outer skin; the former buried inset and
        # chunky gold sill read as flat stickers from the game camera.
        cube(f"Sidepod_Inlet_{asset_id}_{side}", (side * 1.055, -0.055, 0.86),
             (0.035, 0.34, 0.115), dark, collection, 0.05)
        tube_path(f"Sidepod_Accent_{asset_id}_{side}", [
            (side * 1.04, 0.36, 0.53), (side * 1.02, 0.62, 0.54),
            (side * 0.98, 0.93, 0.58)], 0.018, trim, collection)
        if variant == 2:
            aero_endplate(f"Sidepod_FlowGuide_{asset_id}_{side}", side * 1.015,
                          0.18, 0.88, 0.47, 0.78, 0.025, dark, collection)
            ellipsoid(f"DivePlane_{asset_id}_{side}", (side * 1.02, -1.45, 0.82),
                      (0.045, 0.27, 0.035), trim, collection)
        tube_path(f"RearWing_Pylon_{asset_id}_{side}", [
            (side * 0.24, 1.18, 1.10), (side * 0.24, 1.43, 1.42),
            (side * 0.24, 1.78, 1.78)], 0.028, metal, collection)

    # Thin airfoil profiles, sculpted endplates, and a shaped engine cover keep
    # the open-wheel silhouette without the tall rectangular toy-like details.
    airfoil_mesh(f"RearWing_Main_{asset_id}", (0, 1.86, 1.83), 2.02, 0.34, 0.14, dark, collection)
    airfoil_mesh(f"RearWing_Flap_{asset_id}", (0, 1.99, 2.02), 1.72, 0.17, 0.12, paint, collection)
    for side in (-1, 1):
        aero_endplate(f"RearWing_Endplate_{asset_id}_{side}", side * 0.95,
                      1.72, 2.08, 1.53, 2.04, 0.05, paint, collection)
    if variant == 2:
        airfoil_mesh(f"BeamWing_{asset_id}", (0, 1.56, 1.30), 1.48, 0.19, 0.12, trim, collection)
    elif variant == 3:
        aero_endplate(f"SharkFin_{asset_id}", 0, 0.72, 1.52, 1.18, 1.75, 0.055, trim, collection)
        for side in (-1, 1):
            ellipsoid(f"RearBrakeDuct_{asset_id}_{side}", (side * 0.90, 0.96, 0.76),
                      (0.055, 0.30, 0.12), dark, collection)
    formula_body(f"EngineCover_{asset_id}", [
        (0.34, 0.20, 0.76, 1.38), (0.58, 0.30, 0.70, 1.48),
        (0.88, 0.33, 0.63, 1.38), (1.18, 0.27, 0.59, 1.16),
        (1.48, 0.18, 0.58, 0.90), (1.66, 0.12, 0.62, 0.79),
    ], paint, collection)
    formula_body(f"AirIntake_{asset_id}", [
        (0.25, 0.10, 1.34, 1.44), (0.40, 0.19, 1.38, 1.60),
        (0.58, 0.16, 1.37, 1.57), (0.70, 0.09, 1.36, 1.47),
    ], dark, collection)
    formula_body(f"Floor_Diffuser_{asset_id}", [
        (0.88, 0.55, 0.40, 0.48), (1.20, 0.65, 0.39, 0.48),
        (1.55, 0.54, 0.40, 0.47), (1.75, 0.36, 0.43, 0.49),
    ], dark, collection)
    # A dark cockpit tub and thin oval rim make the seating position read as
    # built into the monocoque instead of a person placed on top of it.
    formula_body(f"CockpitTub_{asset_id}", [
        (-0.50, 0.18, 1.01, 1.18), (-0.27, 0.28, 1.00, 1.20),
        (0.08, 0.30, 0.99, 1.21), (0.38, 0.23, 1.00, 1.18),
        (0.52, 0.12, 1.02, 1.13),
    ], dark, collection)
    oval_tube(f"CockpitRim_{asset_id}", (0, 0.01), 0.34, 0.55, 1.16, 0.027, metal, collection)
    # A seated driver with a compact helmet, dark fire suit and subtle team
    # accents replaces the upright bright mannequin silhouette.
    suit = material(f"DriverSuit_{asset_id}", (0.045, 0.060, 0.075), 0.02, 0.74)
    suit_accent = material(f"DriverSuitAccent_{asset_id}", (0.09, 0.105, 0.12), 0.08, 0.58)
    helmet = material(f"DriverHelmet_{asset_id}", (0.075, 0.09, 0.11), 0.34, 0.25)
    driver_torso = ellipsoid(f"Driver_Torso_{asset_id}", (0, 0.15, 1.20),
                             (0.42, 0.62, 0.49), suit, collection, 36, 24)
    driver_torso.rotation_euler[0] = 0.24
    chest_panel = ellipsoid(f"Driver_ChestPanel_{asset_id}", (0, -0.08, 1.27),
                            (0.28, 0.07, 0.22), suit_accent, collection, 32, 20)
    chest_panel.rotation_euler[0] = 0.24
    for side in (-1, 1):
        ellipsoid(f"Driver_Shoulder_{asset_id}_{side}", (side * 0.19, 0.01, 1.35),
                  (0.20, 0.26, 0.22), suit, collection, 28, 18)
    ellipsoid(f"Driver_NeckCollar_{asset_id}", (0, -0.065, 1.49),
              (0.25, 0.24, 0.17), dark, collection, 28, 16)
    helmet_center = (0, -0.09, 1.68)
    helmet_radii = (0.165, 0.195, 0.14)
    ellipsoid(f"Driver_HelmetShell_{asset_id}", helmet_center,
              (helmet_radii[0] * 2, helmet_radii[1] * 2, helmet_radii[2] * 2),
              helmet, collection, 40, 24)
    helmet_visor(f"Driver_Visor_{asset_id}", helmet_center, helmet_radii, glass,
                 collection, width_ratio=0.78, height_ratio=0.28, z_offset=0.025)
    for side in (-1, 1):
        shoulder = (side * 0.19, 0.00, 1.34)
        elbow = (side * 0.31, -0.22, 1.25)
        wrist = (side * 0.24, -0.47, 1.20)
        beam(f"Driver_ArmUpper_{asset_id}_{side}", shoulder, elbow, 0.09, suit, collection)
        ellipsoid(f"Driver_Elbow_{asset_id}_{side}", elbow, (0.15, 0.16, 0.15), suit_accent, collection, 24, 16)
        beam(f"Driver_ArmLower_{asset_id}_{side}", elbow, wrist, 0.07, suit, collection)
        ellipsoid(f"Driver_Glove_{asset_id}_{side}", wrist, (0.095, 0.11, 0.075), dark, collection)
    # The halo is one continuous, softly bent titanium loop, plus its central
    # forward pillar; no isolated vertical bars.
    smooth_tube_path(f"Halo_Main_{asset_id}", [
        (-0.34, -0.38, 1.05), (-0.36, -0.30, 1.70), (-0.36, -0.22, 1.94),
        (-0.36, 0.20, 1.92), (-0.33, 0.38, 1.82), (0, 0.42, 1.82),
        (0.33, 0.38, 1.82), (0.36, 0.20, 1.92), (0.36, -0.22, 1.94),
        (0.36, -0.30, 1.70), (0.34, -0.38, 1.05),
    ], 0.028, metal, collection)
    smooth_tube_path(f"Halo_CenterPillar_{asset_id}", [
        (0, -0.57, 1.10), (0, -0.44, 1.68), (0, -0.34, 1.94),
    ], 0.026, metal, collection)
    oval_tube(f"Halo_Crossbar_{asset_id}", (0, -0.22), 0.36, 0.025, 1.94, 0.022, metal, collection)
    torus(f"SteeringWheel_{asset_id}", (0, -0.47, 1.18), 0.18, 0.025, dark, collection)
    tail_lamp = material(f"RearLamp_{asset_id}", (0.62, 0.012, 0.009), 0.06, 0.24, (0.8, 0.012, 0.008))
    ellipsoid(f"RearLight_{asset_id}", (0, 1.59, 0.80), (0.22, 0.07, 0.06),
              tail_lamp, collection, 28, 16)
    root = parent_vehicle(collection, f"Vehicle_{asset_id}")
    # Keep the race car planted and compact in third-person view.
    root.scale.y = 0.93
    tire_count = sum(obj.name.startswith((f"F1Front_{asset_id}", f"F1Rear_{asset_id}"))
                     and obj.name.endswith("_Tyre") for obj in collection.objects)
    if tire_count != 4:
        raise RuntimeError(f"{label} must have four separate wheel assemblies; found {tire_count}")
    return collection


def join_meshes(mesh_objects, active):
    """Join a related set of converted meshes while preserving its active origin."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    return active


def consolidate_vehicle_mesh(collection):
    """Merge the body and each wheel separately, retaining live wheel pivots."""
    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError(f"Vehicle {collection.name} did not create mesh geometry")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]
    bpy.ops.object.convert(target="MESH")
    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    bpy.context.view_layer.update()

    root = next((obj for obj in collection.objects
                 if obj.type == "EMPTY" and obj.name.startswith("Vehicle_")), None)
    if root is None:
        raise RuntimeError(f"Vehicle {collection.name} has no root object")

    # The source cylinders are created at their axle centers. Keep each whole
    # assembly together under an empty at that center so Three.js can spin it.
    def clean_object_name(obj):
        # Blender adds .001-style suffixes when the builder runs in an already
        # populated session; those suffixes must not break wheel recognition.
        return re.sub(r"\.\d{3,}$", "", obj.name)

    wheel_groups = {}
    for obj in mesh_objects:
        base_name = clean_object_name(obj)
        if base_name.endswith(("_Tyre", "_Tire")):
            key = base_name.rsplit("_", 1)[0]
            wheel_groups[key] = {"tire": obj, "parts": [part for part in mesh_objects
                                                         if clean_object_name(part).startswith(key + "_")]}

    # Scrambler tread blocks are independent Blender meshes; include them in
    # the nearest wheel assembly so the lugs roll with the tire as well.
    bike_groups = [group for key, group in wheel_groups.items() if key.startswith("BikeWheel_")]
    if bike_groups:
        for obj in mesh_objects:
            if not clean_object_name(obj).startswith("Bike_Tread_"):
                continue
            nearest = min(bike_groups,
                          key=lambda group: abs(obj.matrix_world.translation.y
                                                - group["tire"].matrix_world.translation.y))
            nearest["parts"].append(obj)

    wheel_object_ids = {id(part) for group in wheel_groups.values() for part in group["parts"]}
    body_meshes = [obj for obj in mesh_objects if id(obj) not in wheel_object_ids]
    for key, group in wheel_groups.items():
        tire = group["tire"]
        pivot = bpy.data.objects.new(f"WheelPivot_{key}", None)
        collection.objects.link(pivot)
        pivot.empty_display_type = "PLAIN_AXES"
        pivot.parent = root
        # Use the tire's root-local origin directly. The Blender exporter's
        # object parenting conversion is more reliable this way than assigning
        # a stale depsgraph matrix after changing parents.
        pivot.location = tire.location.copy()

        wheel_mesh = join_meshes(group["parts"], tire)
        wheel_mesh.name = f"WheelMesh_{key}"
        wheel_mesh.parent = pivot
        wheel_mesh.location = (0, 0, 0)

    if body_meshes:
        body = join_meshes(body_meshes, body_meshes[0])
        body.name = f"{collection.name} - Vehicle Body"
    bpy.context.view_layer.update()


def export(collection, path):
    window = bpy.context.window
    original_scene = window.scene if window else bpy.context.scene
    export_scene = bpy.data.scenes.new(f"Export - {collection.name}")
    export_scene.collection.children.link(collection)
    if window:
        window.scene = export_scene
    view_layer = export_scene.view_layers[0]
    available = {obj.name for obj in view_layer.objects}
    for obj in view_layer.objects:
        obj.select_set(False, view_layer=view_layer)
    export_objects = [obj for obj in collection.all_objects if obj.name in available]
    for obj in export_objects:
        obj.select_set(True, view_layer=view_layer)
    view_layer.objects.active = next((obj for obj in export_objects if obj.type == "MESH"), None)
    supported = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    args = {"filepath": str(path), "export_format": "GLB", "use_selection": True}
    if "use_active_scene" in supported:
        args["use_active_scene"] = True
    if "export_apply" in supported:
        args["export_apply"] = True
    if "export_yup" in supported:
        args["export_yup"] = True
    try:
        if window:
            with bpy.context.temp_override(scene=export_scene, view_layer=view_layer):
                bpy.ops.export_scene.gltf(**args)
        else:
            with bpy.context.temp_override(scene=export_scene, view_layer=view_layer):
                bpy.ops.export_scene.gltf(**args)
    finally:
        if window and original_scene:
            window.scene = original_scene
        bpy.data.scenes.remove(export_scene)
    before, after = compact_glb_file(path)
    print(f"Compacted active-scene asset ({before:,} -> {after:,} bytes)")
    print(f"Exported {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")


def main():
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    window = bpy.context.window
    original_scene = window.scene if window else bpy.context.scene
    scene = bpy.data.scenes.new("Turbo Road League - Vehicle Studio")
    if window:
        window.scene = scene
    root_collection = bpy.data.collections.new("Turbo Road League Vehicles")
    scene.collection.children.link(root_collection)
    assets = [
        ("bike_nightjar", "Nightjar Streetfighter", "bike", (0.94, 0.17, 0.035), (0.06, 0.11, 0.15), 0),
        ("bike_vector", "Vector Trackbike", "bike", (0.02, 0.37, 0.88), (0.94, 0.44, 0.06), 1),
        ("bike_driftwood", "Driftwood Scrambler", "bike", (0.82, 0.47, 0.10), (0.12, 0.16, 0.12), 2),
        ("bike_solstice", "Solstice Endurance", "bike", (0.82, 0.83, 0.79), (0.78, 0.12, 0.08), 3),
        ("car_apex_gp", "Apex Grand Prix", "car", (0.86, 0.055, 0.035), (0.91, 0.72, 0.16), 0),
        ("car_vector_gp", "Vector Grand Prix", "car", (0.045, 0.46, 0.36), (0.91, 0.91, 0.88), 1),
        ("car_emberline_gp", "Emberline Grand Prix", "car", (0.82, 0.32, 0.035), (0.12, 0.045, 0.02), 2),
        ("car_northstar_gp", "Northstar Grand Prix", "car", (0.06, 0.24, 0.61), (0.82, 0.90, 0.95), 3),
    ]
    collections = []
    try:
        for asset_id, label, kind, primary, accent, alt in assets:
            if kind == "bike":
                collection = build_bike(root_collection, asset_id, label, primary, accent,
                                        fairing=alt in (1, 3), variant=alt)
            else:
                collection = build_car(root_collection, asset_id, label, primary, accent, variant=alt)
            consolidate_vehicle_mesh(collection)
            collections.append((collection, asset_id))
        bpy.ops.object.select_all(action="DESELECT")
        bpy.data.libraries.write(str(ASSET_DIR / "turbo_road_vehicles.blend"), {scene}, fake_user=True,
                                 compress=True, path_remap="RELATIVE")
        for collection, asset_id in collections:
            export(collection, EXPORT_DIR / f"{asset_id}.glb")
        print(f"Built {len(collections)} original Blender road vehicles.")
    finally:
        if window and original_scene:
            window.scene = original_scene


if __name__ == "__main__":
    main()
