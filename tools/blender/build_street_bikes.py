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

import bpy
from mathutils import Vector

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
# Primitives
# --------------------------------------------------------------------------- #

def tube(start, end, radius, material, name, vertices=14):
    """A round bar between two points."""
    a, b = Vector(start), Vector(end)
    axis = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=axis.length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    obj.name = name
    return cars.add(obj, material)


def limb(start, end, radius, material, name, taper=1.0):
    """A limb segment: a bar with rounded ends, optionally thinner at the far end."""
    a, b = Vector(start), Vector(end)
    axis = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=radius, radius2=radius * taper, depth=axis.length, location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    obj.name = name
    cars.add(obj, material)
    for point, size in ((a, radius), (b, radius * taper)):
        cars.ellipsoid(tuple(point), (size, size, size), material, name)
    return obj


def shell(location, scale, material, name, rotation=(0, 0, 0), levels=2):
    """A rounded panel: a box smoothed into a pebble shape (tank, cowl, seat hump)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.scale = scale
    obj.name = name
    modifier = obj.modifiers.new("Smooth", "SUBSURF")
    modifier.levels = levels
    modifier.render_levels = levels
    return cars.add(obj, material)


# --------------------------------------------------------------------------- #
# Bike
# --------------------------------------------------------------------------- #

def build_wheel(key, x, radius, width, mats, front, knobbly):
    parts = []
    z = radius
    section = width / 2
    bpy.ops.mesh.primitive_torus_add(major_radius=radius - section, minor_radius=section, major_segments=48, minor_segments=14,
                                     location=(x, 0, z), rotation=(math.pi / 2, 0, 0))
    parts.append(cars.add(bpy.context.object, mats["rubber"]))
    if knobbly:
        for block in range(22):
            angle = math.tau * block / 22
            for offset in (-0.03, 0.03):
                bpy.ops.mesh.primitive_cube_add(size=1, location=(x + math.cos(angle) * (radius - 0.004), offset, z + math.sin(angle) * (radius - 0.004)))
                lug = bpy.context.object
                lug.scale = (0.03, 0.04, 0.028)
                lug.rotation_euler = (0, -angle + math.pi / 2, 0)
                parts.append(cars.add(lug, mats["rubber"], smooth=False))
    rim = radius - width - 0.012
    bpy.ops.mesh.primitive_torus_add(major_radius=rim, minor_radius=0.018, major_segments=48, minor_segments=8, location=(x, 0, z), rotation=(math.pi / 2, 0, 0))
    parts.append(cars.add(bpy.context.object, mats["alloy"]))
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.045, depth=width + 0.04, location=(x, 0, z), rotation=(math.pi / 2, 0, 0))
    parts.append(cars.add(bpy.context.object, mats["alloy"]))
    for spoke in range(5):
        angle = math.tau * spoke / 5
        for lean in (-0.16, 0.16):
            start = (x + math.cos(angle + lean) * 0.045, 0, z + math.sin(angle + lean) * 0.045)
            end = (x + math.cos(angle) * rim, 0, z + math.sin(angle) * rim)
            parts.append(tube(start, end, 0.011, mats["alloy"], key, vertices=8))
    # Brake discs: two at the front, one at the rear.
    for side in ((1, -1) if front else (-1,)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=rim * (0.72 if front else 0.55), depth=0.008,
                                            location=(x, side * (width / 2 + 0.012), z), rotation=(math.pi / 2, 0, 0))
        parts.append(cars.add(bpy.context.object, mats["disc"]))
    for part in parts:
        part.name = key
    # The tyre must be first: the exporter takes the wheel's centre from it.
    return parts


def build_bike(spec, mats):
    bars_z = spec["bars"]
    head = Vector((0.40, 0, 0.88))                 # steering head
    pivot = Vector((-0.13, 0, 0.42))               # swingarm pivot

    # Forks, yokes and front mudguard.
    for side in (1, -1):
        axle = Vector((FRONT_AXLE, side * 0.095, FRONT_RADIUS))
        top = Vector((head.x - 0.03, side * 0.095, head.z + 0.06))
        middle = axle + (top - axle) * 0.5
        tube(axle, middle, 0.027, mats["frame"], "ForkLower")
        tube(middle, top, 0.021, mats["fork"], "ForkUpper")
        bpy.ops.mesh.primitive_cube_add(size=1, location=(FRONT_AXLE - 0.09, side * 0.085, FRONT_RADIUS + 0.03))
        caliper = bpy.context.object
        caliper.scale = (0.07, 0.035, 0.1)
        cars.add(caliper, mats["caliper"], smooth=False).name = "Caliper"
    cars.box((head.x - 0.03, 0, head.z + 0.05), (0.07, 0.26, 0.03), mats["frame"], "TopYoke", bevel=0.008)
    cars.box((head.x + 0.05, 0, head.z - 0.16), (0.07, 0.26, 0.03), mats["frame"], "BottomYoke", bevel=0.008)
    shell((FRONT_AXLE - 0.02, 0, FRONT_RADIUS * 2 + 0.045), (0.36, 0.15, 0.05), mats["paint"], "Mudguard", rotation=(0, math.radians(8), 0))

    # Twin-spar frame, subframe and swingarm.
    for side in (1, -1):
        tube((head.x, side * 0.05, head.z - 0.04), (pivot.x + 0.03, side * 0.16, pivot.z + 0.13), 0.035, mats["frame"], "Spar")
        tube((pivot.x + 0.03, side * 0.16, pivot.z + 0.13), (pivot.x, side * 0.16, pivot.z - 0.06), 0.03, mats["frame"], "PivotPlate")
        tube((pivot.x, side * 0.12, pivot.z + 0.2), (-0.72, side * 0.1, 0.84), 0.016, mats["frame"], "Subframe")
        tube((pivot.x, side * 0.12, pivot.z), (REAR_AXLE, side * 0.12, REAR_RADIUS), 0.032, mats["frame"], "Swingarm")
        tube((-0.2, side * 0.19, 0.37), (-0.2, side * 0.25, 0.37), 0.012, mats["frame"], "Footpeg")
    tube((pivot.x - 0.12, 0, pivot.z + 0.22), (pivot.x - 0.3, 0, pivot.z + 0.02), 0.03, mats["fork"], "Shock")

    # Engine, radiator, chain and exhaust.
    shell((0.14, 0, 0.41), (0.46, 0.34, 0.34), mats["engine"], "Engine", levels=1)
    shell((0.2, 0, 0.6), (0.3, 0.3, 0.16), mats["engine"], "CylinderHead", levels=1)
    cars.box((0.42, 0, 0.52), (0.035, 0.34, 0.28), mats["trim"], "Radiator", bevel=0.006, rotation=(0, math.radians(-12), 0))
    tube((pivot.x, 0.13, pivot.z), (REAR_AXLE, 0.13, REAR_RADIUS), 0.012, mats["trim"], "Chain")
    tube((0.32, -0.1, 0.5), (0.3, -0.14, 0.2), 0.03, mats["chrome"], "Header")
    tube((0.3, -0.14, 0.2), (-0.15, -0.16, 0.2), 0.03, mats["chrome"], "Underpipe")
    if spec["exhaust"] == "high":
        tube((-0.15, -0.16, 0.2), (-0.3, -0.19, 0.62), 0.03, mats["chrome"], "Riser")
        tube((-0.3, -0.19, 0.64), (-0.82, -0.19, 0.72), 0.058, mats["chrome"], "Silencer", vertices=20)
        tail_pipe = (-0.82, -0.19, 0.72)
    else:
        tube((-0.15, -0.16, 0.2), (-0.78, -0.2, 0.4), 0.062, mats["chrome"], "Silencer", vertices=20)
        tail_pipe = (-0.78, -0.2, 0.4)
    spec["exhaust_tip"] = tail_pipe

    # Tank, seat, tail and tail lamp.
    shell((0.1, 0, 0.89), (0.56, 0.36, 0.3), mats["paint"], "Tank", rotation=(0, math.radians(-6), 0))
    shell((-0.3, 0, 0.83), (0.42, 0.26, 0.08), mats["seat"], "Seat")
    shell((-0.63, 0, 0.87), (0.4, 0.2, 0.13), mats["paint"], "Tail", rotation=(0, math.radians(-10), 0))
    cars.box((-0.84, 0, 0.87), (0.03, 0.14, 0.04), mats["tail"], "TailLamp", bevel=0.01)
    cars.box((-0.88, 0, 0.66), (0.02, 0.2, 0.12), mats["plate"], "Plate", bevel=0.005, rotation=(0, math.radians(-20), 0))
    tube((-0.74, 0, 0.82), (-0.88, 0, 0.68), 0.012, mats["trim"], "PlateStalk")

    # Handlebars and mirrors.
    grips = []
    for side in (1, -1):
        inner = Vector((head.x - 0.05, side * 0.07, bars_z))
        grip = Vector((head.x - 0.14, side * (0.30 if spec["fairing"] else 0.36), bars_z - (0.02 if spec["fairing"] else 0.0)))
        tube(inner, grip, 0.013, mats["trim"], "Bar")
        tube(grip - Vector((0.0, side * 0.1, 0)), grip, 0.019, mats["seat"], "Grip")
        tube((head.x - 0.03, side * 0.07, head.z + 0.05), tuple(inner), 0.014, mats["frame"], "Riser")
        grips.append(grip)
        if not spec["fairing"]:
            tube(tuple(grip - Vector((0.02, side * 0.06, 0))), (grip.x + 0.02, grip.y - side * 0.02, bars_z + 0.17), 0.006, mats["trim"], "MirrorStem")
            cars.ellipsoid((grip.x + 0.02, grip.y - side * 0.02, bars_z + 0.19), (0.012, 0.055, 0.035), mats["trim"], "Mirror")

    if spec["fairing"]:
        screen = spec.get("screen", 1.0)
        # Upper cowl, screen, side panels and belly pan.
        shell((0.6, 0, 0.84), (0.56, 0.42, 0.4), mats["paint"], "Cowl", rotation=(0, math.radians(18), 0))
        shell((0.52, 0, 1.04 + 0.05 * screen), (0.34, 0.3, 0.2 * screen), mats["glass"], "Screen", rotation=(0, math.radians(38), 0))
        for side in (1, -1):
            shell((0.24, side * 0.18, 0.5), (0.86, 0.08, 0.54), mats["paint"], "SidePanel", rotation=(0, math.radians(-8), side * math.radians(-4)))
            cars.ellipsoid((0.84, side * 0.1, 0.8), (0.05, 0.07, 0.035), mats["lamp"], "Headlamp")
            tube((0.6, side * 0.17, 0.95), (0.62, side * 0.27, 1.0), 0.006, mats["trim"], "MirrorStem")
            cars.ellipsoid((0.62, side * 0.29, 1.0), (0.012, 0.05, 0.03), mats["paint"], "Mirror")
        shell((0.12, 0, 0.2), (0.62, 0.26, 0.12), mats["paint"], "BellyPan")
    else:
        # Round headlamp in a shell, and a small instrument pod.
        cars.ellipsoid((head.x + 0.2, 0, head.z - 0.04), (0.09, 0.1, 0.1), mats["trim"], "LampShell")
        cars.ellipsoid((head.x + 0.26, 0, head.z - 0.04), (0.04, 0.085, 0.085), mats["lamp"], "Headlamp")
        cars.box((head.x + 0.06, 0, head.z + 0.12), (0.04, 0.14, 0.07), mats["trim"], "Clocks", bevel=0.012, rotation=(0, math.radians(-25), 0))
    return grips


# --------------------------------------------------------------------------- #
# Rider
# --------------------------------------------------------------------------- #

def build_rider(spec, mats, grips):
    """An adult rider (about 1.78 m) in leathers, boots, gloves and a full-face helmet."""
    posture = spec["posture"]
    hips = Vector((-0.30, 0, 0.93))
    # Where the shoulders are: forward and low in a tuck, back and high when upright.
    lean = {"tuck": 62, "half": 46, "upright": 24}[posture]
    torso = 0.52
    shoulders = hips + Vector((math.sin(math.radians(lean)) * torso, 0, math.cos(math.radians(lean)) * torso))
    neck = shoulders + Vector((0.07, 0, 0.07))
    head = neck + Vector((0.09 if posture != "upright" else 0.04, 0, 0.12))

    # Torso: hips, a broad chest and the back hump of a race suit.
    limb(hips, shoulders, 0.165, mats["leather"], "Rider_Torso", taper=1.1)
    cars.ellipsoid(tuple(hips), (0.17, 0.18, 0.14), mats["leather"], "Rider_Hips")
    cars.ellipsoid(tuple(shoulders + Vector((-0.02, 0, -0.02))), (0.15, 0.21, 0.14), mats["leather"], "Rider_Chest")
    if posture != "upright":
        cars.ellipsoid(tuple(shoulders + Vector((-0.1, 0, 0.07))), (0.13, 0.09, 0.06), mats["paint"], "Rider_Hump")

    # Helmet, visor and chin bar.
    cars.ellipsoid(tuple(head), (0.14, 0.125, 0.135), mats["paint"], "Rider_Helmet")
    cars.ellipsoid(tuple(head + Vector((0.075, 0, 0.005))), (0.075, 0.1, 0.06), mats["glass"], "Rider_Visor")
    cars.ellipsoid(tuple(head + Vector((0.07, 0, -0.07))), (0.075, 0.095, 0.05), mats["trim"], "Rider_ChinBar")
    limb(neck, head, 0.06, mats["leather"], "Rider_Neck")

    for index, side in enumerate((1, -1)):
        # Arms: shoulder, elbow dropped and out, glove on the grip.
        shoulder = shoulders + Vector((0, side * 0.2, 0))
        hand = grips[index] + Vector((0, 0, 0.02))
        elbow = (shoulder + hand) / 2 + Vector((-0.04, side * 0.07, -0.1))
        limb(shoulder, elbow, 0.065, mats["leather"], "Rider_UpperArm", taper=0.85)
        limb(elbow, hand, 0.055, mats["leather"], "Rider_Forearm", taper=0.8)
        cars.ellipsoid(tuple(hand), (0.055, 0.045, 0.04), mats["boot"], "Rider_Glove")
        # Legs: thigh gripping the tank, shin down to the footpeg, boot.
        hip = hips + Vector((0.02, side * 0.12, -0.02))
        knee = Vector((0.12, side * 0.22, 0.70))
        ankle = Vector((-0.2, side * 0.22, 0.42))
        limb(hip, knee, 0.085, mats["leather"], "Rider_Thigh", taper=0.78)
        limb(knee, ankle, 0.065, mats["leather"], "Rider_Shin", taper=0.8)
        cars.ellipsoid(tuple(knee + Vector((0.03, side * 0.02, 0))), (0.06, 0.05, 0.07), mats["trim"], "Rider_KneeSlider")
        shell(tuple(ankle + Vector((0.07, 0, -0.05))), (0.26, 0.09, 0.09), mats["boot"], "Rider_Boot", rotation=(0, math.radians(12), 0))


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
            cars.render_preview(cars.PREVIEWS / f"{asset_id}.png", camera_location=(4.6, -4.4, 1.7), target=(0.0, 0, 0.8))
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
