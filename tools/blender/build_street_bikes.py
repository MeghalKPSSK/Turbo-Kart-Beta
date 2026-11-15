"""Build the realistic motorcycles (with rider) for Turbo Road League.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_street_bikes.py -- --preview

Each bike is assembled the way a real one is: wheels with brake discs, forks,
a twin-spar frame and swingarm, engine, exhaust, tank, seat and tail, then
either a full fairing with a screen or a naked front with a round lamp. The
rider is built from correctly proportioned limbs and sits in a tuck or upright
depending on the bike.

Model space while building: +X is the nose, +Y the left side, +Z up, origin on
the road under the middle of the wheelbase. The export step is shared with
``build_street_cars.py``.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import build_street_cars as cars  # noqa: E402  (materials, primitives, export, preview)

# The game draws bikes a little larger than life so they read beside the cars.
SCALE = 1.14

BIKES = {
    # Naked streetfighter: no fairing, round lamp, upright rider.
    "bike_nightjar": {"paint": (0.75, 0.10, 0.03), "fairing": False, "bars": 1.02, "posture": "upright", "exhaust": "low", "knobbly": False},
    # Track bike: full fairing, low clip-ons, rider in a full tuck.
    "bike_vector": {"paint": (0.02, 0.20, 0.62), "fairing": True, "bars": 0.90, "posture": "tuck", "exhaust": "low", "knobbly": False, "screen": 1.0},
    # Scrambler: wide high bars, high exhaust, block-tread tyres.
    "bike_driftwood": {"paint": (0.62, 0.36, 0.06), "fairing": False, "bars": 1.10, "posture": "upright", "exhaust": "high", "knobbly": True},
    # Endurance racer: full fairing with a tall screen, rider half tucked.
    "bike_solstice": {"paint": (0.78, 0.78, 0.74), "fairing": True, "bars": 0.94, "posture": "half", "exhaust": "low", "knobbly": False, "screen": 1.25},
}

FRONT_AXLE = 0.71
REAR_AXLE = -0.71
FRONT_RADIUS = 0.30
REAR_RADIUS = 0.315


def materials(paint):
    mats = cars.car_materials(paint)
    mats["frame"] = cars.principled("Frame_Alloy", (0.30, 0.31, 0.33), metallic=1.0, roughness=0.35)
    mats["engine"] = cars.principled("Engine_Cast", (0.08, 0.08, 0.09), metallic=0.8, roughness=0.5)
    mats["seat"] = cars.principled("Seat_Vinyl", (0.02, 0.02, 0.022), roughness=0.7)
    mats["leather"] = cars.principled("Rider_Leathers", (0.035, 0.035, 0.04), roughness=0.55)
    mats["boot"] = cars.principled("Rider_Boots", (0.015, 0.015, 0.017), roughness=0.45)
    mats["fork"] = cars.principled("Fork_Gold", (0.70, 0.52, 0.15), metallic=1.0, roughness=0.25)
    return mats

# --------------------------------------------------------------------------- #
# Shapes
# --------------------------------------------------------------------------- #

def tube(start, end, radius, material, name, vertices=16):
    """A straight round bar between two points."""
    a, b = Vector(start), Vector(end)
    axis = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=axis.length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    obj.name = name
    return cars.add(obj, material)


def catmull(points, per=5):
    """A smooth curve through the points."""
    pts = [Vector(point) for point in points]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        for k in range(per):
            t = k / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def keyed(keys, s):
    """Reads (position, across, deep) keys at position ``s`` along a hose."""
    if isinstance(keys, (int, float)):
        return keys, keys
    for a, b in zip(keys, keys[1:]):
        if s <= b[0]:
            t = 0.0 if b[0] == a[0] else max(0.0, (s - a[0]) / (b[0] - a[0]))
            t = t * t * (3 - 2 * t)
            return a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t
    return keys[-1][1], keys[-1][2]


def hose(points, keys, name, material, sides=14, smooth=5, hint=(0, 1, 0), box=False, caps=True):
    """A bar that follows a curve, its cross-section changing along the way: limbs, pipes, frame
    rails. ``keys`` is one radius or a list of (position 0..1, across, deep); ``box`` makes the
    section a rounded rectangle instead of an oval."""
    path = catmull(points, smooth) if smooth else [Vector(point) for point in points]
    run = [0.0]
    for a, b in zip(path, path[1:]):
        run.append(run[-1] + (b - a).length)
    sections = []
    for i, centre in enumerate(path):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        across = Vector(hint) - tangent * tangent.dot(Vector(hint))
        if across.length < 1e-3:
            across = Vector((0, 0, 1)) - tangent * tangent.z
        across.normalize()
        deep = tangent.cross(across)
        ra, rb = keyed(keys, run[i] / run[-1])
        if box:
            ring = [(1, 0.6), (0.6, 1), (-0.6, 1), (-1, 0.6), (-1, -0.6), (-0.6, -1), (0.6, -1), (1, -0.6)]
        else:
            ring = [(math.cos(math.tau * k / sides), math.sin(math.tau * k / sides)) for k in range(sides)]
        sections.append([tuple(centre + across * ra * u + deep * rb * v) for u, v in ring])
    return cars.sweep(sections, name, material, angle=0.5 if box else 0.9, caps=caps)


def oval(x, half, low, high, count=14, power=2.4, lean=0.0, centre=0.0):
    """A rounded cross-section in the plane across the bike, as a ring of points."""
    middle, tall = (low + high) / 2, (high - low) / 2
    ring = []
    for i in range(count):
        c, s = math.cos(math.tau * i / count), math.sin(math.tau * i / count)
        y = centre + half * math.copysign(abs(c) ** (2 / power), c)
        z = middle + tall * math.copysign(abs(s) ** (2 / power), s)
        ring.append((x + lean * (z - middle), y, z))
    return ring


def loft(rings, name, material, levels=2, crease=0.0, corners=(2, 5, 9, 12)):
    """Bodywork: a skin stretched over a row of cross-sections and smoothed, like a moulded panel."""
    mesh = bmesh.new()
    layer = mesh.edges.layers.float.new("crease_edge")
    loops = [[mesh.verts.new(point) for point in ring] for ring in rings]
    count = len(loops[0])
    for a, b in zip(loops, loops[1:]):
        for k in range(count):
            n = (k + 1) % count
            mesh.faces.new((a[k], a[n], b[n], b[k]))
            # ``crease`` keeps the corners of each section as hard lines along the panel, which
            # is what makes a fairing read as folded sheet rather than a pebble.
            if crease and k in corners:
                mesh.edges.get((a[k], b[k]))[layer] = crease
    mesh.faces.new(loops[0][::-1])
    mesh.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    data = bpy.data.meshes.new(name)
    mesh.to_mesh(data)
    mesh.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(material)
    modifier = obj.modifiers.new("Smooth", "SUBSURF")
    modifier.levels = levels
    modifier.render_levels = levels
    cars.apply_modifiers(obj)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def facet(x, half, low, high, chamfer=0.34, centre=0.0, lean=0.0, peak=0.0):
    """A folded-sheet cross-section: a rectangle with its corners cut, as a ring of eight points.
    ``peak`` lifts the middle of the top edge into a ridge."""
    middle, tall = (low + high) / 2, (high - low) / 2
    c = chamfer
    ring = [(1, -1 + c), (1, 1 - c), (1 - c, 1), (-1 + c, 1), (-1, 1 - c), (-1, -1 + c), (-1 + c, -1), (1 - c, -1)]
    return [(x + lean * v * tall, centre + half * u, middle + tall * v + (peak if v == 1 else 0.0)) for u, v in ring]


def panel(rings, name, material, per=4):
    """A fairing panel: flat faces meeting at hard edges, flowing smoothly along its length."""
    count = len(rings[0])
    tracks = [catmull([ring[k] for ring in rings], per) for k in range(count)]
    sections = [[tuple(track[i]) for track in tracks] for i in range(len(tracks[0]))]
    return cars.sweep(sections, name, material, angle=0.42)


def arc_guard(axle, radius, start, end, half, material, name, steps=14):
    """A mudguard: a shallow channel wrapped round part of a wheel."""
    sections = []
    for i in range(steps + 1):
        t = i / steps
        a = math.radians(start + (end - start) * t)
        narrow = 0.45 + 0.55 * math.sin(math.pi * min(1.0, 0.12 + t * 0.95)) ** 0.6
        ring = []
        for y, r in ((-1, -0.02), (-0.8, 0.012), (0, 0.022), (0.8, 0.012), (1, -0.02), (0.8, 0.0), (0, 0.01), (-0.8, 0.0)):
            ring.append((axle[0] + (radius + r) * math.cos(a), y * half * narrow, axle[2] + (radius + r) * math.sin(a)))
        sections.append(ring)
    return cars.sweep(sections, name, material, angle=0.8)


# --------------------------------------------------------------------------- #
# Bike
# --------------------------------------------------------------------------- #

def build_wheel(key, x, radius, width, mats, front, knobbly):
    """A round-section tyre on a cast wheel with swept spokes and floating brake discs."""
    centre = (x, 0, radius)
    half = width / 2
    crown = radius - half * 1.05
    rim = radius - half * 1.85
    parts = []
    profile = [(rim, -half * 0.55)]
    for i in range(15):
        a = math.radians(-112 + 224 * i / 14)
        profile.append((crown + half * 1.05 * math.cos(a), half * math.sin(a)))
    profile.append((rim, half * 0.55))
    parts.append(cars.lathe(profile, 56, key, mats["rubber"], centre, closed=True, angle=0.9))
    if knobbly:
        for block in range(26):
            angle = math.tau * block / 26
            for offset in (-0.032, 0.032):
                r0, r1 = radius - 0.012, radius + 0.008
                ring = lambda r: [(x + r * math.cos(angle + da), offset + dy, radius + r * math.sin(angle + da))
                                  for da, dy in ((-0.045, -0.022), (0.045, -0.022), (0.045, 0.022), (-0.045, 0.022))]
                parts.append(cars.sweep([ring(r0), ring(r1)], key, mats["rubber"], angle=0.4))
    parts.append(cars.lathe([(rim + 0.012, -half * 0.62), (rim + 0.012, half * 0.62), (rim - 0.01, half * 0.5), (rim - 0.02, 0.0), (rim - 0.01, -half * 0.5)],
                            56, key, mats["alloy"], centre, closed=True, angle=0.5))
    parts.append(cars.lathe([(0.028, -half - 0.02), (0.05, -half * 0.55), (0.044, 0.0), (0.05, half * 0.55), (0.028, half + 0.02)], 24, key, mats["alloy"], centre))
    for spoke in range(5):
        sections = []
        for step in range(7):
            s = step / 6
            r = 0.04 + (rim - 0.012 - 0.04) * s
            angle = math.tau * spoke / 5 + 0.38 * s * s
            across = 0.02 - 0.007 * s
            deep = half * 0.5 * (1 - s) + 0.014
            ring = []
            for t, d in ((-across, deep), (across, deep), (across, -deep), (-across, -deep)):
                ring.append((x + r * math.cos(angle) - t * math.sin(angle), d, radius + r * math.sin(angle) + t * math.cos(angle)))
            sections.append(ring)
        parts.append(cars.sweep(sections, key, mats["alloy"], angle=0.5))
    # Brake discs: two at the front, one at the rear; the rear wheel also carries the sprocket.
    for side in ((1, -1) if front else (-1,)):
        y = side * (half + 0.016)
        outer = rim * (0.8 if front else 0.6)
        parts.append(cars.lathe([(outer * 0.72, y - 0.003), (outer, y - 0.003), (outer, y + 0.003), (outer * 0.72, y + 0.003)], 40, key, mats["disc"], centre, closed=True, angle=0.5))
        parts.append(cars.lathe([(0.04, y - 0.002), (outer * 0.74, y - 0.002), (outer * 0.74, y + 0.002), (0.04, y + 0.002)], 10, key, mats["frame"], centre, closed=True, angle=0.5))
    if not front:
        y = half + 0.02
        teeth = [(0.035, y - 0.003), (0.105, y - 0.003), (0.105, y + 0.003), (0.035, y + 0.003)]
        parts.append(cars.lathe(teeth, 22, key, mats["chrome"], centre, closed=True, angle=0.5))
    for part in parts:
        part.name = key
        part.data.transform(Matrix.Translation((-centre[0], -centre[1], -centre[2])))
        part.location = centre
    return parts


def build_bike(spec, mats):
    bars_z = spec["bars"]
    faired = spec["fairing"]
    scrambler = spec["exhaust"] == "high"
    head = Vector((0.40, 0, 0.88))                 # steering head
    pivot = Vector((-0.13, 0, 0.42))               # swingarm pivot

    # Upside-down forks, yokes, brake calipers and front mudguard.
    for side in (1, -1):
        axle = Vector((FRONT_AXLE, side * 0.095, FRONT_RADIUS))
        top = Vector((head.x - 0.03, side * 0.095, head.z + 0.07))
        middle = axle + (top - axle) * 0.42
        tube(axle - (top - axle) * 0.04, middle + (top - axle) * 0.05, 0.02, mats["chrome"], "ForkSlider")
        tube(middle, top, 0.028, mats["fork"], "ForkTube")
        tube(top, top + (top - axle).normalized() * 0.02, 0.022, mats["frame"], "ForkCap")
        cars.box(tuple(axle + Vector((0.0, 0, 0.0))), (0.07, 0.04, 0.09), mats["frame"], "ForkFoot", bevel=0.012)
        sections = []
        for step in range(6):
            a = math.radians(158 + 36 * step / 5)
            sections.append([(FRONT_AXLE + r * math.cos(a), side * y, FRONT_RADIUS + r * math.sin(a))
                             for r, y in ((0.125, 0.064), (0.195, 0.064), (0.195, 0.092), (0.125, 0.092))])
        cars.sweep(sections, "Caliper", mats["caliper"], angle=0.5)
    cars.box((head.x - 0.03, 0, head.z + 0.06), (0.075, 0.27, 0.028), mats["frame"], "TopYoke", bevel=0.01)
    cars.box((head.x + 0.045, 0, head.z - 0.15), (0.075, 0.27, 0.035), mats["frame"], "BottomYoke", bevel=0.01)
    tube((head.x - 0.04, 0, head.z + 0.08), (head.x + 0.05, 0, head.z - 0.17), 0.03, mats["frame"], "SteeringHead")
    if scrambler:
        arc_guard((FRONT_AXLE, 0, FRONT_RADIUS + 0.09), FRONT_RADIUS + 0.03, 30, 160, 0.075, mats["paint"], "Mudguard")
    else:
        arc_guard((FRONT_AXLE, 0, FRONT_RADIUS), FRONT_RADIUS + 0.028, 28, 165, 0.078, mats["paint"], "Mudguard")
    arc_guard((REAR_AXLE, 0, REAR_RADIUS), REAR_RADIUS + 0.03, 35, 125, 0.105, mats["carbon"], "Hugger")

    # Frame: twin spars from the steering head to the pivot plates, a subframe, and a braced swingarm.
    for side in (1, -1):
        hose([(head.x + 0.01, side * 0.045, head.z - 0.03), (0.22, side * 0.15, 0.74), (0.0, side * 0.17, 0.6), (pivot.x + 0.02, side * 0.165, pivot.z + 0.1)],
             [(0, 0.018, 0.04), (0.5, 0.02, 0.05), (1, 0.02, 0.045)], "Spar", mats["frame"], box=True)
        hose([(pivot.x + 0.03, side * 0.165, pivot.z + 0.16), (pivot.x + 0.01, side * 0.165, pivot.z), (pivot.x - 0.01, side * 0.16, pivot.z - 0.1)],
             [(0, 0.016, 0.05), (0.5, 0.016, 0.06), (1, 0.014, 0.035)], "PivotPlate", mats["frame"], box=True)
        hose([(pivot.x + 0.02, side * 0.13, pivot.z + 0.24), (-0.4, side * 0.12, 0.76), (-0.7, side * 0.08, 0.86)], 0.013, "Subframe", mats["frame"], sides=8, smooth=3)
        hose([(pivot.x, side * 0.115, pivot.z), (-0.4, side * 0.125, 0.37), (REAR_AXLE - 0.02, side * 0.125, REAR_RADIUS)],
             [(0, 0.016, 0.03), (0.45, 0.018, 0.05), (1, 0.016, 0.03)], "Swingarm", mats["frame"], box=True)
        tube((REAR_AXLE, side * 0.14, REAR_RADIUS), (REAR_AXLE, side * 0.1, REAR_RADIUS), 0.022, mats["chrome"], "AxleNut", vertices=6)
        # Rearsets: a hanger plate, the peg and the heel guard.
        cars.box((-0.19, side * 0.19, 0.43), (0.11, 0.012, 0.16), mats["frame"], "RearsetPlate", bevel=0.01, rotation=(0, math.radians(20), 0))
        tube((-0.2, side * 0.19, 0.37), (-0.2, side * 0.27, 0.37), 0.011, mats["chrome"], "Footpeg", vertices=10)
    hose([(pivot.x - 0.1, 0, pivot.z + 0.3), (pivot.x - 0.16, 0, pivot.z + 0.05)], 0.022, "Shock", mats["chrome"], sides=10, smooth=0)
    hose([(pivot.x - 0.105, 0, pivot.z + 0.27), (pivot.x - 0.15, 0, pivot.z + 0.09)], 0.036, "ShockSpring", mats["fork"], sides=12, smooth=0)
    # Chain: top and bottom runs from the gearbox sprocket to the wheel.
    for drop in (0.085, -0.085):
        hose([(pivot.x + 0.07, 0.115, pivot.z + drop * 0.5), (REAR_AXLE, 0.115, REAR_RADIUS + drop * 1.15)], [(0, 0.006, 0.011), (1, 0.006, 0.011)], "Chain", mats["trim"], box=True, smooth=0)

    # Engine: crankcase, a canted block with fins, cam cover, side covers and radiator.
    cars.box((0.1, 0, 0.37), (0.42, 0.3, 0.22), mats["engine"], "Crankcase", bevel=0.035)
    cars.box((0.215, 0, 0.555), (0.2, 0.3, 0.24), mats["engine"], "Cylinders", bevel=0.02, rotation=(0, math.radians(-18), 0))
    for fin in range(5):
        lift = 0.47 + fin * 0.035
        cars.box((0.2 + (lift - 0.555) * -0.32, 0, lift), (0.225, 0.325, 0.008), mats["frame"], "CoolingFin", bevel=0.002, rotation=(0, math.radians(-18), 0))
    cars.box((0.262, 0, 0.69), (0.21, 0.31, 0.055), mats["frame"], "CamCover", bevel=0.02, rotation=(0, math.radians(-18), 0))
    cars.lathe([(0.115, 0.15), (0.11, 0.175), (0.07, 0.19), (0.004, 0.192)], 28, "ClutchCover", mats["frame"], (0.02, 0, 0.36), side=-1, angle=0.5)
    cars.lathe([(0.085, 0.15), (0.08, 0.172), (0.05, 0.184), (0.004, 0.186)], 24, "GeneratorCover", mats["frame"], (0.16, 0, 0.36), side=1, angle=0.5)
    cars.lathe([(0.065, 0.13), (0.06, 0.15), (0.004, 0.152)], 18, "SprocketCover", mats["engine"], (pivot.x + 0.07, 0, pivot.z), side=1, angle=0.5)
    cars.box((0.435, 0, 0.53), (0.03, 0.34, 0.27), mats["trim"], "Radiator", bevel=0.006, rotation=(0, math.radians(-14), 0))
    cars.box((0.452, 0, 0.53), (0.008, 0.3, 0.23), mats["disc"], "RadiatorCore", bevel=0.002, rotation=(0, math.radians(-14), 0))

    # Exhaust: headers sweeping under the engine into a collector, then the silencer.
    for y in (-0.09, -0.03, 0.03, 0.09):
        hose([(0.33, y, 0.58), (0.4, y, 0.42), (0.36, y * 0.8, 0.22), (0.16, y * 0.5 - 0.03, 0.165)], 0.019, "Header", mats["chrome"], sides=10)
    hose([(0.18, -0.03, 0.165), (0.0, -0.08, 0.16), (-0.14, -0.15, 0.18)], [(0, 0.04, 0.03), (1, 0.034, 0.034)], "Collector", mats["chrome"], sides=12)
    if scrambler:
        hose([(-0.12, -0.15, 0.18), (-0.2, -0.19, 0.4), (-0.3, -0.2, 0.62), (-0.4, -0.2, 0.68)], 0.03, "LinkPipe", mats["chrome"], sides=12)
        start, end = Vector((-0.38, -0.2, 0.675)), Vector((-0.84, -0.2, 0.76))
        cars.box(tuple((start + end) / 2 + Vector((0, -0.062, 0.0))), (0.34, 0.01, 0.09), mats["trim"], "HeatShield", bevel=0.004, rotation=(0, math.radians(-10.5), 0))
    else:
        hose([(-0.12, -0.15, 0.18), (-0.22, -0.185, 0.22), (-0.3, -0.2, 0.27)], 0.03, "LinkPipe", mats["chrome"], sides=12)
        start, end = Vector((-0.28, -0.2, 0.26)), Vector((-0.8, -0.215, 0.47))
    run = end - start
    hose([start, start + run * 0.12, start + run * 0.9, end], [(0, 0.032, 0.032), (0.14, 0.056, 0.064), (0.9, 0.056, 0.064), (1, 0.048, 0.054)], "Silencer", mats["frame"], sides=18, smooth=3)
    hose([end, end + run.normalized() * 0.03], 0.043, "SilencerTip", mats["chrome"], sides=18, smooth=0)
    hose([end + run.normalized() * 0.012, end + run.normalized() * 0.032], 0.034, "SilencerThroat", mats["trim"], sides=18, smooth=0)
    spec["exhaust_tip"] = tuple(end)

    # Tank: wide at the shoulders, cut in at the knees.
    tank = loft([oval(0.42, 0.07, 0.8, 0.9), oval(0.34, 0.17, 0.75, 0.99), oval(0.18, 0.2, 0.72, 1.03), oval(0.02, 0.185, 0.72, 0.995),
                 oval(-0.08, 0.13, 0.74, 0.93), oval(-0.14, 0.09, 0.76, 0.88)], "Tank", mats["paint"])
    skin = cars.Skin(tank)
    skin.patch([(0.14, -0.035, 0), (0.22, -0.035, 0), (0.22, 0.035, 0), (0.14, 0.035, 0)], (0, 0, -1), mats["chrome"], "FillerCap", lift=0.006, step=0.008, rounded=True)
    for side in (1, -1):
        skin.patch([(-0.07, 0, 0.77), (0.1, 0, 0.75), (0.13, 0, 0.9), (-0.06, 0, 0.9)], (0, -side, 0), mats["seat"], "TankGrip", lift=0.004, step=0.03, grazing=0.25)
    # Seat and tail unit.
    if scrambler:
        loft([oval(-0.1, 0.12, 0.8, 0.875, power=3.5), oval(-0.3, 0.145, 0.8, 0.885, power=3.5), oval(-0.6, 0.14, 0.81, 0.89, power=3.5), oval(-0.78, 0.1, 0.82, 0.885, power=3.5)],
             "Seat", mats["seat"])
        arc_guard((REAR_AXLE, 0, REAR_RADIUS + 0.16), REAR_RADIUS + 0.03, 40, 150, 0.1, mats["paint"], "RearGuard")
        tail_tip = Vector((-0.86, 0, 0.72))
    else:
        tail = panel([facet(-0.06, 0.12, 0.72, 0.84), facet(-0.3, 0.155, 0.74, 0.83), facet(-0.5, 0.15, 0.78, 0.91, peak=0.01), facet(-0.7, 0.11, 0.86, 0.975, peak=0.012),
                      facet(-0.92, 0.035, 0.965, 1.0)], "Tail", mats["paint"])
        loft([oval(-0.07, 0.1, 0.815, 0.862, power=3.2), oval(-0.28, 0.14, 0.812, 0.858, power=3.2), oval(-0.46, 0.13, 0.84, 0.905, power=3.2)], "Seat", mats["seat"])
        loft([oval(-0.5, 0.11, 0.88, 0.93, power=3.2), oval(-0.62, 0.1, 0.9, 0.965, power=3.2), oval(-0.76, 0.07, 0.945, 0.985, power=3.2)], "PillionPad", mats["seat"])
        tail_skin = cars.Skin(tail)
        tail_skin.patch([(0, -0.045, 0.94), (0, 0.045, 0.94), (0, 0.04, 0.975), (0, -0.04, 0.975)], (1, 0, 0), mats["tail"], "TailLamp", lift=0.004, step=0.012, grazing=0.02)
        for side in (1, -1):
            tail_skin.ribbon(cars.line((-0.82, 0, 0.9), (-0.42, 0, 0.84), 0.03), (0, -side, 0), 0.03, mats["stripe"], "TailStripe", lift=0.004)
        tail_tip = Vector((-0.82, 0, 0.84))
    if scrambler:
        cars.box((-0.87, 0, 0.83), (0.03, 0.1, 0.035), mats["tail"], "TailLamp", bevel=0.01)
    hose([tuple(tail_tip), (tail_tip.x - 0.1, 0, tail_tip.z - 0.14)], [(0, 0.03, 0.008), (1, 0.03, 0.008)], "PlateHanger", mats["trim"], box=True, smooth=0)
    cars.box((tail_tip.x - 0.115, 0, tail_tip.z - 0.2), (0.012, 0.2, 0.13), mats["plate"], "Plate", bevel=0.004, rotation=(0, math.radians(-18), 0))

    # Handlebars, grips, levers and mirrors.
    grips = []
    for side in (1, -1):
        clamp = Vector((head.x - 0.04, side * 0.085, head.z + 0.08))
        if faired:
            grip = Vector((head.x - 0.13, side * 0.3, bars_z - 0.02))
            hose([clamp, grip], 0.013, "Bar", mats["trim"], sides=10, smooth=0)
        else:
            grip = Vector((head.x - 0.15, side * 0.37, bars_z))
            hose([(clamp.x, side * 0.06, clamp.z), (clamp.x - 0.01, side * 0.1, bars_z - 0.03), (clamp.x - 0.04, side * 0.2, bars_z), grip], 0.013, "Bar", mats["chrome"], sides=10)
        outward = Vector((-0.12, side, 0.0)).normalized() if faired else Vector((-0.08, side, 0.0)).normalized()
        hose([grip - outward * 0.11, grip + outward * 0.012], 0.019, "Grip", mats["seat"], sides=12, smooth=0)
        hose([grip + outward * 0.012, grip + outward * 0.024], 0.022, "BarEnd", mats["chrome"], sides=12, smooth=0)
        cars.box(tuple(grip - outward * 0.135), (0.035, 0.03, 0.035), mats["trim"], "Switchgear", bevel=0.008)
        hose([grip - outward * 0.14 + Vector((0.03, 0, 0)), grip - outward * 0.09 + Vector((0.055, 0, -0.005)), grip + Vector((0.05, 0, -0.01))],
             [(0, 0.006, 0.006), (1, 0.004, 0.005)], "Lever", mats["frame"], sides=6, smooth=3)
        grips.append(grip)
        stem = grip - outward * 0.14 if not faired else Vector((0.62, side * 0.19, 0.94))
        mirror = stem + (Vector((0.03, side * 0.03, 0.17)) if not faired else Vector((0.03, side * 0.13, 0.07)))
        hose([stem, stem.lerp(mirror, 0.6) + Vector((0, 0, 0.02)), mirror], 0.006, "MirrorStem", mats["trim"], sides=6, smooth=3)
        cars.ellipsoid(tuple(mirror + Vector((0.008, side * 0.02, 0.01))), (0.014, 0.062, 0.034), mats["paint"] if faired else mats["trim"], "Mirror")
    cars.box((head.x + 0.03, 0, head.z + 0.13), (0.05, 0.16, 0.075), mats["trim"], "Clocks", bevel=0.014, rotation=(0, math.radians(-28), 0))

    if faired:
        screen = spec.get("screen", 1.0)
        # Upper cowl: a pointed nose opening out to the width of the bars.
        cowl = panel([facet(1.04, 0.02, 0.715, 0.74), facet(0.97, 0.09, 0.685, 0.8), facet(0.86, 0.16, 0.665, 0.875, peak=0.01), facet(0.7, 0.2, 0.655, 0.93, peak=0.02),
                      facet(0.55, 0.21, 0.655, 0.95, peak=0.02), facet(0.44, 0.185, 0.68, 0.92)], "Cowl", mats["paint"])
        loft([oval(0.88, 0.07, 0.865, 0.9), oval(0.77, 0.12, 0.91, 0.965 + 0.05 * screen), oval(0.63, 0.14, 0.93, 1.0 + 0.1 * screen),
              oval(0.53, 0.12, 0.94, 1.0 + 0.11 * screen)], "Screen", mats["glass"])
        nose = cars.Skin(cowl)
        for side in (1, -1):
            cast = (-1, -side * 0.35, -0.1)
            at = lambda y, z: (1.0, side * y, z)
            nose.patch([at(0.02, 0.735), at(0.165, 0.79), at(0.185, 0.875), at(0.03, 0.79)], cast, mats["trim"], "LampHousing", lift=0.004, step=0.02)
            nose.patch([at(0.035, 0.752), at(0.155, 0.798), at(0.17, 0.856), at(0.042, 0.787)], cast, mats["lamp"], "Headlamp", lift=0.008, step=0.012)
            # Side panel: a slab from behind the front wheel down to the belly, with gill vents.
            flank = panel([facet(0.64, 0.02, 0.56, 0.78, centre=side * 0.17), facet(0.46, 0.028, 0.27, 0.84, centre=side * 0.185),
                           facet(0.2, 0.03, 0.2, 0.72, centre=side * 0.2), facet(-0.04, 0.028, 0.19, 0.55, centre=side * 0.19),
                           facet(-0.26, 0.018, 0.22, 0.38, centre=side * 0.15)], "SidePanel", mats["paint"])
            side_skin = cars.Skin(flank)
            for gill in range(3):
                gx = 0.2 + gill * 0.075
                side_skin.ribbon(cars.line((gx, 0, 0.42), (gx + 0.06, 0, 0.6), 0.02), (0, -side, 0), 0.03, mats["trim"], "Gill", lift=0.004)
            side_skin.ribbon(cars.line((0.56, 0, 0.8), (-0.1, 0, 0.3), 0.03), (0, -side, 0), 0.045, mats["stripe"], "FairingStripe", lift=0.004)
            # Winglet on the cowl.
            cars.sweep([[(0.86, side * 0.14, 0.7), (0.72, side * 0.17, 0.69), (0.72, side * 0.17, 0.705), (0.84, side * 0.14, 0.712)],
                        [(0.8, side * 0.265, 0.715), (0.73, side * 0.265, 0.71), (0.73, side * 0.265, 0.722), (0.79, side * 0.265, 0.726)]], "Winglet", mats["carbon"], angle=0.4)
        nose.patch([(1.0, -0.022, 0.7), (1.0, 0.022, 0.7), (1.0, 0.018, 0.735), (1.0, -0.018, 0.735)], (-1, 0, -0.05), mats["trim"], "RamAir", lift=0.004, step=0.01)
        panel([facet(0.4, 0.1, 0.17, 0.3), facet(0.14, 0.165, 0.12, 0.3), facet(-0.14, 0.15, 0.13, 0.3), facet(-0.32, 0.07, 0.19, 0.3)], "BellyPan", mats["carbon"])
    else:
        # Round headlamp in a bowl, with a rim; the scrambler adds a number board, the naked a fly screen.
        lamp = Vector((head.x + 0.2, 0, head.z - 0.03))
        cars.ellipsoid(tuple(lamp), (0.1, 0.105, 0.105), mats["trim"], "LampBowl")
        cars.ellipsoid(tuple(lamp + Vector((0.055, 0, 0))), (0.05, 0.092, 0.092), mats["lamp"], "Headlamp")
        bpy.ops.mesh.primitive_torus_add(major_radius=0.097, minor_radius=0.01, major_segments=28, minor_segments=8, location=tuple(lamp + Vector((0.05, 0, 0))), rotation=(0, math.pi / 2, 0))
        cars.add(bpy.context.object, mats["chrome"]).name = "LampRim"
        for side in (1, -1):
            hose([tuple(lamp + Vector((-0.02, side * 0.1, 0))), (head.x - 0.02, side * 0.095, head.z)], [(0, 0.006, 0.02), (1, 0.006, 0.02)], "LampBracket", mats["frame"], box=True, smooth=0)
            # Radiator shrouds on the naked bikes.
            loft([oval(0.47, 0.02, 0.5, 0.74, power=4, centre=side * 0.19), oval(0.34, 0.03, 0.46, 0.8, power=4, centre=side * 0.2), oval(0.2, 0.02, 0.56, 0.76, power=4, centre=side * 0.19)],
                 "Shroud", mats["paint"] if not scrambler else mats["trim"])
        if scrambler:
            cars.box(tuple(lamp + Vector((0.02, 0, 0.19))), (0.02, 0.22, 0.17), mats["stripe"], "NumberBoard", bevel=0.03, rotation=(0, math.radians(-14), 0))
        else:
            loft([oval(lamp.x + 0.06, 0.09, lamp.z + 0.1, lamp.z + 0.13), oval(lamp.x - 0.0, 0.12, lamp.z + 0.12, lamp.z + 0.22, lean=-0.5),
                  oval(lamp.x - 0.08, 0.1, lamp.z + 0.14, lamp.z + 0.27, lean=-0.5)], "FlyScreen", mats["glass"])
    return grips


# --------------------------------------------------------------------------- #
# Rider
# --------------------------------------------------------------------------- #

def joint(a, b, c, near=0.22):
    """A limb path that runs straight, then turns through the joint in a short curve."""
    a, b, c = Vector(a), Vector(b), Vector(c)
    return [a, a.lerp(b, 0.5), b.lerp(a, near), b, b.lerp(c, near), b.lerp(c, 0.5), c]


def build_rider(spec, mats, grips):
    """An adult rider (about 1.78 m) in panelled race leathers with armour, boots, gloves and a
    full-face helmet. Every limb is one continuous surface from joint to joint."""
    posture = spec["posture"]
    hips = Vector((-0.30, 0, 0.93))
    lean = {"tuck": 62, "half": 46, "upright": 24}[posture]
    spine = Vector((math.sin(math.radians(lean)), 0, math.cos(math.radians(lean))))
    back = Vector((-spine.z, 0, spine.x))            # out of the rider's back
    shoulders = hips + spine * 0.52
    neck = shoulders + Vector((0.07, 0, 0.07))
    head = neck + Vector((0.09 if posture != "upright" else 0.04, 0, 0.12))

    # Torso: pelvis, waist, rib cage and shoulders as one shell, arched a little in the back.
    torso = hose([hips - spine * 0.1, hips, hips + spine * 0.26 + back * 0.03, shoulders + back * 0.015, shoulders + spine * 0.06],
                 [(0, 0.15, 0.1), (0.22, 0.17, 0.118), (0.5, 0.145, 0.105), (0.8, 0.19, 0.125), (0.93, 0.195, 0.1), (1, 0.1, 0.07)],
                 "Rider_Torso", mats["leather"], sides=18, smooth=5)
    body = cars.Skin(torso)
    for side in (1, -1):
        low, high = hips + spine * 0.12, hips + spine * 0.42
        body.patch([tuple(low - back * 0.08), tuple(low + back * 0.08), tuple(high + back * 0.09), tuple(high - back * 0.09)], (0, -side, 0),
                   mats["paint"], "SuitPanel", lift=0.004, step=0.03, grazing=0.3)
    if posture != "upright":
        hose([shoulders + back * 0.1 - spine * 0.3, shoulders + back * 0.135 - spine * 0.12, shoulders + back * 0.12 + spine * 0.03],
             [(0, 0.03, 0.01), (0.55, 0.075, 0.045), (1, 0.045, 0.02)], "SpeedHump", mats["paint"], sides=14, smooth=5)
    hose([neck - Vector((0.03, 0, 0.05)), head - Vector((0.02, 0, 0.07))], 0.062, "Rider_Neck", mats["leather"], sides=12, smooth=0)

    # Helmet: a shell drawn forward into a chin bar, with a wrap-round visor and a rear spoiler.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=36, ring_count=20, location=(0, 0, 0))
    helmet = bpy.context.object
    for vertex in helmet.data.vertices:
        x, y, z = vertex.co
        if z < 0 and x > 0:
            x *= 1 + 0.42 * min(1.0, -z * 1.6)       # chin bar
        if x < 0 and z > -0.2:
            x *= 1.1                                  # a longer back
        z = max(z, -0.82)                             # flat base
        vertex.co = (x * 0.143, y * 0.125, z * 0.14)
    helmet.data.transform(Matrix.Translation(head))
    helmet.name = "Rider_Helmet"
    cars.add(helmet, mats["paint"])
    bpy.context.view_layer.update()
    shell = cars.Skin(helmet)
    at = lambda y, z: (head.x + 0.2, y, head.z + z)
    shell.patch([at(-0.115, -0.03), at(0.115, -0.03), at(0.115, 0.055), at(-0.115, 0.055)], (-1, 0, 0), mats["glass"], "Visor", lift=0.004, step=0.012, grazing=0.06)
    shell.ribbon(cars.line(at(-0.11, -0.036), at(0.11, -0.036), 0.012), (-1, 0, 0), 0.012, mats["trim"], "VisorSeal", lift=0.006)
    for y in (-0.03, 0.03):
        shell.patch([at(y - 0.016, -0.085), at(y + 0.016, -0.085), at(y + 0.016, -0.06), at(y - 0.016, -0.06)], (-1, 0, 0), mats["trim"], "ChinVent", lift=0.004, step=0.01)
    shell.ribbon([(head.x + x, 0, head.z + 0.3) for x in [-0.11 + 0.13 * i / 14 for i in range(15)]], (0, 0, -1), 0.05, mats["stripe"], "HelmetStripe", lift=0.004)
    cars.sweep([[(head.x - 0.1, -0.06, head.z + 0.085), (head.x - 0.1, 0.06, head.z + 0.085), (head.x - 0.06, 0.05, head.z + 0.115), (head.x - 0.06, -0.05, head.z + 0.115)],
                [(head.x - 0.19, -0.04, head.z + 0.06), (head.x - 0.19, 0.04, head.z + 0.06), (head.x - 0.185, 0.035, head.z + 0.075), (head.x - 0.185, -0.035, head.z + 0.075)]],
               "HelmetSpoiler", mats["carbon"], angle=0.4)

    for index, side in enumerate((1, -1)):
        out = Vector((0, side, 0))
        # Arm: shoulder to elbow to wrist as one sleeve, the elbow dropped and out.
        shoulder = shoulders + out * 0.195 - spine * 0.02
        hand = grips[index] + Vector((-0.03, 0, 0.03))
        elbow = (shoulder + hand) / 2 + Vector((-0.05, side * 0.08, -0.09))
        sleeve = hose(joint(shoulder, elbow, hand),
                      [(0, 0.078, 0.076), (0.25, 0.068, 0.066), (0.46, 0.054, 0.054), (0.52, 0.055, 0.055), (0.7, 0.053, 0.05), (1, 0.038, 0.035)],
                      "Rider_Arm", mats["leather"], sides=14, smooth=4, hint=(0, 0, 1))
        arm = cars.Skin(sleeve)
        arm.ribbon(cars.line(tuple(shoulder + out * 0.0), tuple(elbow), 0.03) + cars.line(tuple(elbow), tuple(hand), 0.03)[1:], (0, -side, -0.25), 0.05, mats["paint"], "SleeveStripe", lift=0.004)
        cars.ellipsoid(tuple(shoulder + out * 0.028 + spine * 0.015 + back * 0.012), (0.07, 0.05, 0.062), mats["carbon"], "ShoulderCap")
        cars.ellipsoid(tuple(elbow + (elbow - (shoulder + hand) / 2).normalized() * 0.022), (0.04, 0.036, 0.042), mats["carbon"], "ElbowCap")
        # Glove: a gauntlet cuff over the sleeve and a closed fist on the grip.
        hose([hand.lerp(elbow, 0.22), hand.lerp(elbow, 0.02)], [(0, 0.047, 0.044), (1, 0.04, 0.036)], "Rider_Glove", mats["boot"], sides=12, smooth=0, hint=(0, 0, 1))
        fist = grips[index] + Vector((-0.005, -side * 0.03, 0.012))
        cars.ellipsoid(tuple(fist), (0.05, 0.055, 0.04), mats["boot"], "Rider_Glove")
        cars.ellipsoid(tuple(fist + Vector((0.012, 0, 0.022))), (0.03, 0.045, 0.02), mats["carbon"], "KnuckleGuard")

        # Leg: thigh gripping the tank, knee forward, calf down to the boot on the peg.
        hip = hips + out * 0.11 + Vector((0.02, 0, -0.03))
        knee = Vector((0.13, side * 0.215, 0.7))
        ankle = Vector((-0.2, side * 0.225, 0.47))
        trouser = hose(joint(hip, knee, ankle, near=0.16),
                       [(0, 0.1, 0.1), (0.2, 0.094, 0.098), (0.44, 0.066, 0.07), (0.52, 0.064, 0.066), (0.66, 0.062, 0.07), (0.85, 0.05, 0.052), (1, 0.046, 0.046)],
                       "Rider_Leg", mats["leather"], sides=16, smooth=4)
        leg = cars.Skin(trouser)
        leg.ribbon(cars.line(tuple(hip.lerp(knee, 0.15)), tuple(knee), 0.03) + cars.line(tuple(knee), tuple(ankle), 0.03)[1:], (0, -side, 0.15), 0.055, mats["paint"], "LegStripe", lift=0.004)
        cars.ellipsoid(tuple(knee + Vector((0.035, side * 0.012, 0.02))), (0.045, 0.042, 0.055), mats["carbon"], "KneeCap")
        cars.ellipsoid(tuple(knee + Vector((0.01, side * 0.062, -0.01))), (0.045, 0.014, 0.055), mats["trim"], "KneeSlider")
        # Boot: a tall shaft with a shin plate, and the foot on the peg, toe down.
        hose([ankle.lerp(knee, 0.42), ankle.lerp(knee, 0.2), ankle + Vector((0, 0, -0.02))], [(0, 0.062, 0.068), (0.5, 0.058, 0.064), (1, 0.05, 0.056)],
             "Rider_Boot", mats["boot"], sides=14, smooth=3)
        cars.ellipsoid(tuple(ankle.lerp(knee, 0.26) + Vector((0.045, 0, 0.03))), (0.03, 0.045, 0.085), mats["carbon"], "ShinPlate")
        heel = ankle + Vector((-0.07, 0, -0.07))
        toe = ankle + Vector((0.2, 0, -0.13))
        hose([heel, heel.lerp(toe, 0.3), heel.lerp(toe, 0.75), toe],
             [(0, 0.036, 0.04), (0.25, 0.048, 0.055), (0.7, 0.05, 0.04), (1, 0.034, 0.022)], "Rider_Boot", mats["boot"], sides=12, smooth=3)
        cars.ellipsoid(tuple(toe + Vector((-0.03, side * 0.045, 0.0))), (0.035, 0.012, 0.02), mats["trim"], "ToeSlider")


def build(asset_id):
    spec = BIKES[asset_id]
    mats = materials(spec["paint"])
    wheels = {
        "Wheel_Front": build_wheel("Wheel_Front", FRONT_AXLE, FRONT_RADIUS, 0.12, mats, True, spec["knobbly"]),
        "Wheel_Rear": build_wheel("Wheel_Rear", REAR_AXLE, REAR_RADIUS, 0.19, mats, False, spec["knobbly"]),
    }
    grips = build_bike(spec, mats)
    build_rider(spec, mats, grips)
    return wheels



def scale_up():
    """Scales the whole model about the origin and bakes it in."""
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.location = obj.location * SCALE
        obj.scale = obj.scale * SCALE
    bpy.ops.object.select_all(action="SELECT")


def main():
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    wanted = [name for name in arguments if not name.startswith("--")] or list(BIKES)
    for asset_id in wanted:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        wheels = build(asset_id)
        scale_up()
        if "--preview" in arguments:
            cars.PREVIEWS.mkdir(parents=True, exist_ok=True)
            cars.render_preview(cars.PREVIEWS / f"{asset_id}.png", camera_location=(3.5, -3.3, 1.6), target=(0.0, 0, 0.92))
            for obj in list(bpy.context.scene.objects):
                if obj.type in {"CAMERA", "LIGHT"} or obj.name.startswith("Plane"):
                    bpy.data.objects.remove(obj)
        cars.assemble(asset_id, wheels)
        cars.export(asset_id)
        tip = BIKES[asset_id]["exhaust_tip"]
        print(f"{asset_id}: wheel radii {FRONT_RADIUS * SCALE:.3f}/{REAR_RADIUS * SCALE:.3f}, axles {FRONT_AXLE * SCALE:.3f}/{REAR_AXLE * SCALE:.3f}, "
              f"exhaust tip game (x {-tip[1] * SCALE:.2f}, y {tip[2] * SCALE:.2f}, z {tip[0] * SCALE:.2f})")


if __name__ == "__main__":
    main()
