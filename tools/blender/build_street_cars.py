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
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

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


def tinted_glass():
    """Glass you can see the cabin through: dark, glossy and mostly transparent."""
    mat = principled("Glass_Tinted", (0.02, 0.028, 0.035), metallic=0.85, roughness=0.04)
    mat.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.42
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    else:
        mat.blend_method = "BLEND"
    return mat


def car_materials(paint, interior=False):
    return {
        "cabin": principled("Cabin_Trim", (0.022, 0.022, 0.025), roughness=0.85),
        "seat": principled("Cabin_Seat", (0.07, 0.035, 0.028), roughness=0.6),
        "paint": principled("VehiclePaint", paint, metallic=0.55, roughness=0.28, coat=1.0),
        "glass": tinted_glass() if interior else principled("Glass", (0.015, 0.02, 0.025), metallic=0.9, roughness=0.05),
        "trim": principled("Trim_Black", (0.012, 0.012, 0.014), roughness=0.45),
        "rubber": principled("Tyre_Rubber", (0.02, 0.02, 0.022), roughness=0.82),
        "alloy": principled("Wheel_Alloy", (0.62, 0.64, 0.66), metallic=1.0, roughness=0.22),
        "disc": principled("Brake_Disc", (0.45, 0.45, 0.46), metallic=1.0, roughness=0.35),
        "caliper": principled("Brake_Caliper", (0.75, 0.05, 0.03), metallic=0.3, roughness=0.4),
        "carbon": principled("Aero_Carbon", (0.018, 0.024, 0.031), metallic=0.32, roughness=0.34),
        "lamp": principled("Lamp_Head", (0.9, 0.9, 0.85), roughness=0.1, emission=(1.0, 0.95, 0.85), strength=6.0),
        "tail": principled("Lamp_Tail", (0.35, 0.0, 0.0), roughness=0.2, emission=(1.0, 0.05, 0.02), strength=4.0),
        "chrome": principled("Chrome", (0.8, 0.8, 0.82), metallic=1.0, roughness=0.08),
        "plate": principled("Plate", (0.85, 0.85, 0.8), roughness=0.5),
        "stripe": principled("Paint_Stripe", (0.86, 0.85, 0.8), metallic=0.3, roughness=0.3, coat=1.0),
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
        "aero": {"splitter": True, "skirts": True, "hood_vents": True, "fender_vents": True, "wing": "low", "diffuser": 4}, "pipes": [0.3, 0.42], "interior": True, "scallop": 0.05, "spokes": 10, "twin": False, "spoke_curve": 0.5, "haunch_rear": 0.045,
        "face": {"lamp_sweep": 0.06, "tail": {"bar": False}},
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
        "aero": {"splitter": True, "skirts": True, "wing": "roof", "diffuser": 3}, "pipes": [0.12], "spokes": 6, "interior": True, "scallop": 0.03,
        "face": {"grille": 0.56, "lamp_height": 0.1, "tail": {"bar": True, "height": 0.08, "drop": 0.12}},
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
        "aero": {"splitter": True, "hood_scoop": True, "stripes": True, "wing": "lip", "fender_vents": True}, "pipes": [0.44, 0.56], "waist": 0.02, "interior": True, "scallop": 0.035, "twin": False, "haunch_rear": 0.045,
        "face": {"grille": 0.62, "lamp_inner": 0.5, "lamp_sweep": 0.01, "lamp_height": 0.1, "tail": {"bar": True, "height": 0.075}},
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
        "aero": {"splitter": True, "skirts": True, "side_intakes": True, "wing": "high", "diffuser": 6}, "pipes": [0.1], "waist": 0.05, "interior": True, "scallop": 0.085, "spokes": 7, "haunch_rear": 0.05, "haunch_front": 0.07,
        "face": {"lamp_sweep": 0.08, "lamp_height": 0.07, "grille": 0.4, "tail": {"bar": True, "height": 0.045, "drop": 0.08}},
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


def station_row(x, half, bottom, shoulder, roof, cabin):
    return (x, half, bottom, shoulder, roof, cabin)


def bus_stations():
    """A bus is a long box of windows: a pillar strip between each pair of window strips."""
    body = (1.25, 0.34, 1.25, 3.02, 1.21)
    rows = [(-5.25, 1.12, 0.50, 1.25, 2.90, 1.10), (-5.15, 1.24, 0.38, 1.25, 3.00, 1.20)]
    for x in (-4.6, -4.5, -2.6, -2.5, -0.6, -0.5, 1.4, 1.5, 3.4, 3.5, 4.9):
        rows.append((x, *body))
    rows += [(5.15, 1.22, 0.38, 1.25, 2.98, 1.18), (5.25, 1.10, 0.50, 1.25, 2.85, 1.06)]
    return rows


# Road traffic, built with the same lofter at a lower level of detail.
TRAFFIC = {
    "traffic_sedan": {
        "paint": (0.55, 0.57, 0.60), "wheel_radius": 0.33, "tyre_width": 0.22, "wheelbase": 2.80, "levels": 1, "spacing": 0.5, "spokes": 5, "twin": False, "sidewall": 0.11, "doors": 4,
        "stations": [
            (-2.35, 0.72, 0.44, 0.86, None, 0.0), (-2.27, 0.86, 0.34, 0.94, None, 0.0), (-1.95, 0.90, 0.26, 0.98, None, 0.0),
            (-1.55, 0.91, 0.22, 0.99, 1.03, 0.64), (-1.05, 0.915, 0.21, 0.98, 1.40, 0.70), (-0.97, 0.915, 0.21, 0.98, 1.42, 0.705),
            (-0.22, 0.915, 0.21, 0.96, 1.46, 0.72), (-0.16, 0.915, 0.21, 0.96, 1.46, 0.72), (0.50, 0.91, 0.21, 0.94, 1.38, 0.72),
            (0.58, 0.91, 0.21, 0.935, 1.35, 0.725), (1.00, 0.905, 0.22, 0.92, 0.96, 0.74), (1.40, 0.90, 0.23, 0.88, None, 0.0),
            (1.85, 0.88, 0.25, 0.82, None, 0.0), (2.15, 0.84, 0.30, 0.74, None, 0.0), (2.29, 0.76, 0.36, 0.66, None, 0.0),
            (2.34, 0.62, 0.42, 0.60, None, 0.0),
        ],
        "zones": COUPE_ZONES,
    },
    "traffic_hatch": {
        "paint": (0.70, 0.70, 0.66), "wheel_radius": 0.31, "tyre_width": 0.20, "wheelbase": 2.56, "levels": 1, "spacing": 0.5, "spokes": 5, "twin": False, "sidewall": 0.11, "doors": 4,
        "stations": [
            (-2.05, 0.72, 0.44, 0.86, None, 0.0), (-1.97, 0.85, 0.33, 0.94, None, 0.0), (-1.80, 0.89, 0.25, 0.98, 1.05, 0.66),
            (-1.40, 0.90, 0.22, 0.98, 1.44, 0.70), (-1.32, 0.90, 0.22, 0.98, 1.46, 0.705), (-0.42, 0.905, 0.21, 0.96, 1.50, 0.72),
            (-0.36, 0.905, 0.21, 0.96, 1.50, 0.72), (0.36, 0.90, 0.21, 0.94, 1.42, 0.72), (0.44, 0.90, 0.21, 0.935, 1.39, 0.725),
            (0.90, 0.895, 0.22, 0.92, 0.97, 0.74), (1.30, 0.89, 0.23, 0.88, None, 0.0), (1.70, 0.86, 0.26, 0.81, None, 0.0),
            (1.90, 0.82, 0.31, 0.73, None, 0.0), (2.02, 0.73, 0.37, 0.65, None, 0.0), (2.06, 0.60, 0.43, 0.60, None, 0.0),
        ],
        "zones": ["tail", "deck", "rearglass", "cpillar", "window", "bpillar", "window", "apillar", "windshield",
                  "hood", "hood", "hood", "lamp", "nose"],
    },
    "traffic_van": {
        "paint": (0.85, 0.85, 0.82), "wheel_radius": 0.36, "tyre_width": 0.24, "wheelbase": 3.10, "levels": 1, "spacing": 0.5, "spokes": 5, "twin": False, "sidewall": 0.11, "doors": 4,
        "stations": [
            (-2.50, 0.84, 0.42, 1.00, 1.86, 0.80), (-2.42, 0.94, 0.32, 1.02, 1.95, 0.86), (-1.20, 0.96, 0.26, 1.02, 1.97, 0.87),
            (0.20, 0.96, 0.26, 1.00, 1.97, 0.87), (0.28, 0.96, 0.26, 1.00, 1.97, 0.87), (1.05, 0.955, 0.26, 0.98, 1.92, 0.86),
            (1.13, 0.955, 0.26, 0.975, 1.88, 0.86), (1.75, 0.95, 0.27, 0.96, 1.05, 0.84), (2.20, 0.92, 0.30, 0.86, None, 0.0),
            (2.42, 0.84, 0.36, 0.74, None, 0.0), (2.50, 0.70, 0.42, 0.66, None, 0.0),
        ],
        "zones": ["tail", "panel", "panel", "bpillar", "window", "apillar", "windshield", "hood", "lamp", "nose"],
    },
    "traffic_truck": {
        "paint": (0.20, 0.30, 0.55), "wheel_radius": 0.46, "tyre_width": 0.30, "wheelbase": 4.40, "levels": 1, "spacing": 0.5, "spokes": 5, "twin": False, "sidewall": 0.11, "doors": 4,
        "stations": [
            (-3.50, 1.15, 0.60, 1.30, 3.00, 1.12), (-3.40, 1.20, 0.55, 1.30, 3.10, 1.18), (1.00, 1.20, 0.55, 1.30, 3.10, 1.18),
            (1.10, 1.15, 0.50, 1.30, 3.05, 1.12), (1.35, 1.10, 0.42, 1.25, 2.45, 1.00), (1.45, 1.10, 0.42, 1.25, 2.50, 1.02),
            (2.30, 1.10, 0.42, 1.22, 2.45, 1.02), (2.38, 1.10, 0.42, 1.22, 2.42, 1.02), (2.90, 1.08, 0.44, 1.20, 1.30, 1.00),
            (3.30, 1.04, 0.48, 1.05, None, 0.0), (3.48, 0.95, 0.54, 0.90, None, 0.0), (3.55, 0.80, 0.60, 0.82, None, 0.0),
        ],
        "zones": ["tail", "panel", "panel", "panel", "bpillar", "window", "apillar", "windshield", "hood", "lamp", "nose"],
    },
    "traffic_bus": {
        "paint": (0.80, 0.62, 0.10), "wheel_radius": 0.50, "tyre_width": 0.30, "wheelbase": 6.00, "levels": 1, "spacing": 0.5, "spokes": 5, "twin": False, "sidewall": 0.11, "doors": 0,
        "stations": bus_stations(),
        "zones": ["tail", "panel", "cpillar", "window", "bpillar", "window", "bpillar", "window", "bpillar", "window",
                  "bpillar", "window", "lamp", "nose"],
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
    # Where each named strip of the body lies along the car, for the details that follow it.
    marks = {}
    for index, zone in enumerate(spec["zones"]):
        marks.setdefault(zone, []).append((stations[index][0], stations[index + 1][0]))
    spec["marks"] = marks
    return spec


POINTS = 13   # points per half cross-section, underside centre to roof centre
PAINT, GLASS, TRIM = range(3)
CROWN = 0.05

# Bands round a cross-section, counted from the underside centre:
# 0 underside, 1 sill underside, 2 rocker, 3 lower door, 4 upper door, 5 under the shoulder,
# 6 shoulder roll, 7 door top or wing top, 8 window, 9 roof edge, 10 roof, 11 roof centre.
def zone_material(zone, band):
    if band == 0:
        return TRIM
    if band in (1, 2) and zone not in ("tail", "nose", "lamp"):
        return TRIM                                   # the dark rocker panel
    if zone == "window" and band == 8:
        return GLASS
    if zone in ("windshield", "rearglass") and band >= 8:
        return GLASS
    if zone == "bpillar" and band == 8:
        return TRIM
    return PAINT


def hermite(a, b, ta, tb, t):
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * ta + (-2 * t3 + 3 * t2) * b + (t3 - t2) * tb


def densify(spec):
    """The hand-placed stations become a finer cage: a smooth curve is run through them and
    sampled every ``spacing`` metres, so the wings can swell over the wheels and the smoothed
    surface stays close to the intended shape. Stations without a cabin get a low crowned top."""
    rows = []
    for x, width, bottom, shoulder, roof, cabin in spec["stations"]:
        if roof is None:
            roof, cabin = shoulder + CROWN, width * 0.5
        rows.append([x, width, bottom, shoulder, roof, cabin])
    last = len(rows) - 1

    def slope(i, c):
        a, b = rows[max(i - 1, 0)], rows[min(i + 1, last)]
        return (b[c] - a[c]) / (b[0] - a[0])

    spacing = spec.get("spacing", 0.3)
    out, zones = [rows[0]], []
    for i, zone in enumerate(spec["zones"]):
        a, b = rows[i], rows[i + 1]
        span = b[0] - a[0]
        pieces = max(1, round(span / spacing))
        for piece in range(1, pieces + 1):
            t = piece / pieces
            row = b if piece == pieces else [a[0] + span * t] + [
                hermite(a[c], b[c], slope(i, c) * span, slope(i + 1, c) * span, t) for c in range(1, 6)]
            row[4] = max(row[4], row[3] + 0.03)         # the top never dips under the shoulder
            out.append(row)
            zones.append(zone)
    return out, zones


def flare_at(spec, x):
    """How much of a wheel arch is at this point along the car: (front, rear), each 0 to 1."""
    reach = spec["wheel_radius"] * 1.2
    half = spec["wheelbase"] / 2
    return math.exp(-((x - half) / reach) ** 2), math.exp(-((x + half) / reach) ** 2)


def half_section(spec, x, width, bottom, shoulder, roof, cabin):
    """One side of a cross-section as (y, z) points, from the underside centre to the top centre.
    Between the wheels the body is drawn in at the waist; over them the wings swell and rise."""
    front, rear = flare_at(spec, x)
    flare = max(front, rear)
    waist = spec.get("waist", 0.035) * (1 - flare)
    lift = front * spec.get("haunch_front", 0.018) + rear * spec.get("haunch_rear", 0.03)
    w = width - waist
    # A scallop pressed into the doors, deepening toward the rear wheel.
    span = (spec["wheelbase"] / 2 - x) / spec["wheelbase"]
    ramp = min(1.0, max(0.0, (span - 0.12) / 0.6))
    scallop = spec.get("scallop", 0.0) * ramp * ramp * (3 - 2 * ramp) * (1 - flare) if 0 < span < 1 else 0.0
    side_height = shoulder - bottom
    rise = roof - shoulder
    belt = w * 0.93
    return [
        (0.0, bottom), (w * 0.72, bottom), (w * 0.93, bottom + 0.035),
        (w * 0.975 - waist * 0.6 - scallop * 0.45, bottom + 0.14),
        (w * 0.995 - waist * 0.3 - scallop, bottom + side_height * 0.42),
        (w + waist * 0.25 - scallop * 0.3, bottom + side_height * 0.64),
        (w * 0.985, shoulder - 0.07 + lift), (belt, shoulder + lift),
        (cabin + (belt - cabin) * 0.45, shoulder + rise * 0.1 + lift * 0.6),
        (cabin, shoulder + rise * 0.82), (cabin * 0.74, roof - 0.005), (cabin * 0.38, roof), (0.0, roof),
    ]


def build_body(spec, mats):
    rows, zones = densify(spec)
    mesh = bmesh.new()
    crease = mesh.edges.layers.float.new("crease_edge")
    rings = []
    for row in rows:
        half = half_section(spec, *row)
        left = [mesh.verts.new((row[0], y, z)) for y, z in half]
        right = [mesh.verts.new((row[0], -y, z)) for y, z in half[1:-1]]
        # Full ring: left side up to the top centre, then back down the right side.
        rings.append(left + right[::-1])
    count = len(rings[0])
    sharp = {3: 0.7, 7: 0.88, 9: 0.72}                # rocker top, shoulder line, roof edge
    for index, zone in enumerate(zones):
        a, b = rings[index], rings[index + 1]
        for k in range(count):
            n = (k + 1) % count
            face = mesh.faces.new((a[k], a[n], b[n], b[k]))
            band = k if k <= POINTS - 2 else count - 1 - k
            face.material_index = zone_material(zone, band)
            point = k if k <= POINTS - 1 else count - k
            if point in sharp:
                edge = mesh.edges.get((a[k], b[k]))
                if edge:
                    edge[crease] = sharp[point]
    tail = mesh.faces.new(rings[0][::-1])
    nose = mesh.faces.new(rings[-1])
    for face in (tail, nose):
        face.material_index = PAINT
        for edge in face.edges:
            edge[crease] = 0.45
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    volume = mesh.calc_volume(signed=True)
    if volume < 0:
        bmesh.ops.reverse_faces(mesh, faces=mesh.faces)
    data = bpy.data.meshes.new("Body")
    mesh.to_mesh(data)
    mesh.free()
    body = bpy.data.objects.new("Body", data)
    bpy.context.scene.collection.objects.link(body)
    for key in ("paint", "glass", "trim"):
        data.materials.append(mats[key])
    subsurf = body.modifiers.new("Smooth", "SUBSURF")
    subsurf.levels = spec.get("levels", 2)
    subsurf.render_levels = spec.get("levels", 2)
    apply_modifiers(body)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    if spec.get("interior"):
        # The inside of the shell, seen through the glass: the same surface without its
        # windows, drawn a little inside the paint and facing inward.
        inside = bmesh.new()
        inside.from_mesh(body.data)
        reach = arch_radius(spec) + 0.05
        axle_z = spec["wheel_radius"]

        def at_wheel(face):
            centre = face.calc_center_median()
            return abs(centre.y) > 0.3 and min(math.hypot(centre.x - x, centre.z - axle_z) for x in (spec["wheelbase"] / 2, -spec["wheelbase"] / 2)) < reach

        # Only the cabin is lined: nothing over the windows, across the wheel openings, or out in
        # the nose and tail where the shell is too thin to hide it.
        front = spec["marks"]["windshield"][0][1] + 0.25
        back = spec["marks"]["rearglass"][0][0] - 0.25
        bmesh.ops.delete(inside, geom=[face for face in inside.faces if face.material_index == GLASS or at_wheel(face)
                                       or not back < face.calc_center_median().x < front], context="FACES")
        inside.normal_update()
        for vertex in inside.verts:
            vertex.co -= vertex.normal * 0.014
        bmesh.ops.reverse_faces(inside, faces=inside.faces)
        for face in inside.faces:
            face.material_index = 0
        lining = bpy.data.meshes.new("CabinLining")
        inside.to_mesh(lining)
        inside.free()
        lining.materials.append(mats["cabin"])
        shell = bpy.data.objects.new("CabinLining", lining)
        bpy.context.scene.collection.objects.link(shell)
        thin = shell.modifiers.new("Reduce", "DECIMATE")       # it is only ever a dark backdrop
        thin.ratio = 0.3
        apply_modifiers(shell)
    return body


def apply_modifiers(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def arch_radius(spec):
    return spec["wheel_radius"] + 0.065


def cut_arches(body, spec, mats):
    """Wheel arches: a cylinder is cut out of the body at each wheel."""
    radius = arch_radius(spec)
    for x in (spec["wheelbase"] / 2, -spec["wheelbase"] / 2):
        bpy.ops.mesh.primitive_cylinder_add(vertices=56, radius=radius, depth=3.4, location=(x, 0, spec["wheel_radius"] - 0.01),
                                            rotation=(math.pi / 2, 0, 0))
        cutter = bpy.context.object
        boolean = body.modifiers.new("Arch", "BOOLEAN")
        boolean.operation = "DIFFERENCE"
        boolean.object = cutter
        boolean.solver = "EXACT"
        boolean.use_self = True          # the smoothed cage can fold on itself at the cowl
        apply_modifiers(body)
        bpy.data.objects.remove(cutter)


# --------------------------------------------------------------------------- #
# Mesh helpers
# --------------------------------------------------------------------------- #

def add(obj, material, smooth=True):
    obj.data.materials.append(material)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def finish(mesh, name, material, angle=0.6, recalc=True):
    """Turns a bmesh into an object: smooth shaded, with edges sharper than ``angle`` kept crisp."""
    if recalc:
        bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    for face in mesh.faces:
        face.smooth = True
    for edge in mesh.edges:
        if len(edge.link_faces) == 2 and edge.calc_face_angle(0.0) > angle:
            edge.smooth = False
    data = bpy.data.meshes.new(name)
    mesh.to_mesh(data)
    mesh.free()
    data.validate()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(material)
    return obj


def lathe(profile, segments, name, material, centre=(0, 0, 0), side=1, closed=False, angle=0.6):
    """Spins a profile of (radius, offset along the axle) points round the axle (the Y axis)."""
    mesh = bmesh.new()
    rings = []
    for i in range(segments):
        a = math.tau * i / segments
        rings.append([mesh.verts.new((centre[0] + r * math.cos(a), centre[1] + y * side, centre[2] + r * math.sin(a)))
                      for r, y in profile])
    count = len(profile)
    for i in range(segments):
        a, b = rings[i], rings[(i + 1) % segments]
        for k in range(count if closed else count - 1):
            n = (k + 1) % count
            mesh.faces.new((a[k], a[n], b[n], b[k]))
    return finish(mesh, name, material, angle)


def sweep(sections, name, material, angle=0.6, caps=True):
    """Skins a list of cross-sections (each a loop of points) into a solid bar."""
    mesh = bmesh.new()
    loops = [[mesh.verts.new(point) for point in section] for section in sections]
    count = len(loops[0])
    for a, b in zip(loops, loops[1:]):
        for k in range(count):
            n = (k + 1) % count
            mesh.faces.new((a[k], a[n], b[n], b[k]))
    if caps:
        mesh.faces.new(loops[0][::-1])
        mesh.faces.new(loops[-1])
    return finish(mesh, name, material, angle)


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


class Skin:
    """The finished body surface, for laying details onto it: shut lines, lamps, grilles and
    vents are thin pieces of mesh projected onto the paint, so they follow every curve."""

    def __init__(self, body):
        self.tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())

    def cast(self, through, direction, grazing=0.1, reach=None):
        direction = Vector(direction).normalized()
        origin = Vector(through) - direction * 6.0
        location, normal, _, _ = self.tree.ray_cast(origin, direction)
        if location is None:
            return None
        # ``reach``: ignore surface further than this from the point aimed at, so a detail
        # meant for the nose never lands on a wing far behind it.
        if reach is not None and (location - Vector(through)).length > reach:
            return None
        if normal.dot(direction) > 0:
            normal = -normal
        if -normal.dot(direction) < grazing:
            return None
        return location, normal

    def ribbon(self, points, direction, width, material, name, lift=0.005):
        """A strip of the given width laid along the surface under a line of points."""
        hits = [self.cast(point, direction) for point in points]
        runs, run = [], []
        for hit in hits:
            if hit:
                run.append(hit)
            else:
                if len(run) > 1:
                    runs.append(run)
                run = []
        if len(run) > 1:
            runs.append(run)
        if not runs:
            return None
        mesh = bmesh.new()
        for run in runs:
            previous = None
            for i, (location, normal) in enumerate(run):
                ahead = run[min(i + 1, len(run) - 1)][0] - run[max(i - 1, 0)][0]
                across = normal.cross(ahead)
                if across.length < 1e-6:
                    continue
                across = across.normalized() * (width / 2)
                base = location + normal * lift
                pair = (mesh.verts.new(base - across), mesh.verts.new(base + across))
                if previous:
                    mesh.faces.new((previous[0], previous[1], pair[1], pair[0]))
                previous = pair
        return finish(mesh, name, material, angle=1.2, recalc=False)

    def patch(self, corners, direction, material, name, lift=0.005, step=0.035, grazing=0.1, rounded=False, reach=None):
        """A four-cornered panel laid onto the surface. ``corners`` run round the outline."""
        a, b, c, d = (Vector(corner) for corner in corners)
        nu = max(2, round(max((b - a).length, (c - d).length) / step))
        nv = max(2, round(max((d - a).length, (c - b).length) / step))
        mesh = bmesh.new()
        grid = []
        for j in range(nv + 1):
            v = j / nv
            row = []
            for i in range(nu + 1):
                u = i / nu
                through = a.lerp(b, u).lerp(d.lerp(c, u), v)
                hit = self.cast(through, direction, grazing, reach)
                row.append((mesh.verts.new(hit[0] + hit[1] * lift), hit[1]) if hit else None)
            grid.append(row)
        for j in range(nv):
            for i in range(nu):
                quad = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                if any(corner is None for corner in quad):
                    continue
                if rounded and ((i + 0.5) / nu * 2 - 1) ** 2 + ((j + 0.5) / nv * 2 - 1) ** 2 > 1.0:
                    continue
                face = mesh.faces.new([corner[0] for corner in quad])
                face.normal_update()
                if face.normal.dot(quad[0][1]) < 0:
                    face.normal_flip()
        if not mesh.faces:
            mesh.free()
            return None
        return finish(mesh, name, material, angle=1.2, recalc=False)


def width_at(spec, x):
    stations = spec["stations"]
    for a, b in zip(stations, stations[1:]):
        if a[0] <= x <= b[0]:
            return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])
    return stations[0][1] if x < stations[0][0] else stations[-1][1]


def value_at(spec, x, column):
    stations = spec["stations"]
    for a, b in zip(stations, stations[1:]):
        if a[0] <= x <= b[0]:
            return a[column] + (b[column] - a[column]) * (x - a[0]) / (b[0] - a[0])
    return (stations[0] if x < stations[0][0] else stations[-1])[column]


# --------------------------------------------------------------------------- #
# Wheels
# --------------------------------------------------------------------------- #

def build_wheel(name, x, side, spec, mats):
    """A low-profile tyre with a grooved tread on a dished alloy with split spokes, wheel nuts,
    and a vented brake disc and caliper behind it. Everything is turned on a lathe or swept."""
    radius, width = spec["wheel_radius"], spec["tyre_width"]
    fine = spec.get("levels", 2) > 1
    segments = 56 if fine else 28
    centre = (x, side * spec["track"], radius)
    half = width / 2
    rim = radius - spec.get("sidewall", 0.088)
    parts = []

    # Tyre: bead, bulged sidewall, rounded shoulder and a flat tread with grooves cut into it.
    grooves = spec.get("grooves", 3 if fine else 0)
    tread = [(radius, -half * 0.74)]
    for groove in range(grooves):
        y = half * 1.2 * ((groove + 0.5) / grooves - 0.5)
        tread += [(radius, y - 0.011), (radius - 0.011, y - 0.007), (radius - 0.011, y + 0.007), (radius, y + 0.011)]
    tread.append((radius, half * 0.74))
    wall = [(rim - 0.004, half * 0.8), (rim + 0.02, half * 0.96), (rim + (radius - rim) * 0.55, half * 1.0),
            (radius - 0.03, half * 0.95), (radius - 0.008, half * 0.86)]
    profile = [(r, -y) for r, y in wall] + tread + wall[::-1]
    parts.append(lathe(profile, segments, name, mats["rubber"], centre, side, closed=True, angle=0.75))

    # Rim: a barrel with a polished outer lip, dished in toward the hub.
    face = half * 0.78                                # how far out the wheel face sits
    barrel = [(rim, -half * 0.82), (rim - 0.02, -half * 0.74), (rim - 0.032, 0.0), (rim - 0.022, face - 0.02),
              (rim + 0.004, face + 0.012), (rim + 0.006, face + 0.03), (rim - 0.012, face + 0.03), (rim - 0.03, face)]
    parts.append(lathe(barrel, segments, name, mats["alloy"], centre, side, angle=0.5))
    parts.append(lathe([(rim - 0.03, -half * 0.3), (0.02, -half * 0.3)], segments // 2, name, mats["trim"], centre, side))

    # Spokes: pairs of blades that split from the hub and curve in to the rim.
    count = spec.get("spokes", 5)
    pairs = spec.get("twin", fine)
    hub = 0.062
    for spoke in range(count):
        for lean in ((-1, 1) if pairs else (0,)):
            sections = []
            for step in range(7):
                s = step / 6
                r = hub * 0.7 + (rim - 0.024 - hub * 0.7) * s
                angle = math.tau * spoke / count + lean * (0.11 + 0.1 * s) * (0.8 if count > 5 else 1.0) + spec.get("spoke_curve", 0.0) * s * s * side
                y = (face - 0.012 - 0.028 * math.sin(math.pi * s) + 0.012 * s) * side
                across = (0.024 - 0.008 * s) * (1.0 if pairs else 1.7)
                depth = 0.036 - 0.012 * s
                ring = []
                for t, d in ((-across, depth / 2), (across, depth / 2), (across * 0.7, -depth / 2), (-across * 0.7, -depth / 2)):
                    ring.append((centre[0] + r * math.cos(angle) - t * math.sin(angle), centre[1] + y + d * side,
                                 centre[2] + r * math.sin(angle) + t * math.cos(angle)))
                sections.append(ring)
            parts.append(sweep(sections, name, mats["alloy"], angle=0.5))
    # Hub, centre cap and wheel nuts.
    parts.append(lathe([(hub + 0.022, face - 0.05), (hub + 0.02, face - 0.004), (hub * 0.62, face + 0.004), (0.004, face + 0.008)],
                       segments // 2, name, mats["alloy"], centre, side, angle=0.5))
    parts.append(lathe([(hub * 0.5, face + 0.004), (hub * 0.46, face + 0.014), (0.004, face + 0.016)],
                       16, name, mats["trim"], centre, side))
    if fine:
        for nut in range(5):
            a = math.tau * (nut + 0.5) / 5
            spot = (centre[0] + hub * 0.74 * math.cos(a), centre[1], centre[2] + hub * 0.74 * math.sin(a))
            parts.append(lathe([(0.011, face - 0.01), (0.011, face + 0.012), (0.003, face + 0.014)], 6, name, mats["chrome"], spot, side))

    # Brake: a disc with its hat, and a caliper gripping the top rear of it.
    disc_y = half * 0.2
    disc = rim * 0.8
    parts.append(lathe([(0.05, disc_y + 0.03), (disc * 0.42, disc_y + 0.03), (disc * 0.46, disc_y + 0.014), (disc, disc_y + 0.014),
                        (disc, disc_y - 0.014), (0.05, disc_y - 0.014)], segments, name, mats["disc"], centre, side, closed=True, angle=0.5))
    sections = []
    for step in range(7):
        a = math.radians(118 + 62 * step / 6)
        ring = []
        for r, y in ((disc * 0.56, disc_y - 0.04), (disc * 1.06, disc_y - 0.04), (disc * 1.06, disc_y + 0.055), (disc * 0.56, disc_y + 0.055)):
            ring.append((centre[0] + r * math.cos(a), centre[1] + y * side, centre[2] + r * math.sin(a)))
        sections.append(ring)
    parts.append(sweep(sections, name, mats["caliper"], angle=0.5))
    # Every part turns about the axle: put its origin there (the export reads it from the tyre).
    for part in parts:
        part.name = name
        part.data.transform(Matrix.Translation((-centre[0], -centre[1], -centre[2])))
        part.location = centre
    return parts


# --------------------------------------------------------------------------- #
# Details laid onto the body
# --------------------------------------------------------------------------- #

def line(start, end, step=0.03):
    start, end = Vector(start), Vector(end)
    count = max(2, round((end - start).length / step))
    return [start.lerp(end, i / count) for i in range(count + 1)]


def build_arches(skin, spec, mats):
    """A lip round every wheel opening that follows the wing, and a dark liner inside it."""
    radius = arch_radius(spec)
    axle_z = spec["wheel_radius"] - 0.01
    for x in (spec["wheelbase"] / 2, -spec["wheelbase"] / 2):
        for side in (1, -1):
            sections = []
            for step in range(41):
                a = math.radians(-18 + 216 * step / 40)
                ring = []
                hit = skin.cast((x + (radius + 0.03) * math.cos(a), 0, axle_z + (radius + 0.03) * math.sin(a)), (0, -side, 0), grazing=0.02)
                if not hit:
                    if len(sections) > 1:
                        sweep(sections, "ArchLip", mats["paint"], angle=0.7)
                    sections = []
                    continue
                y = hit[0].y
                for r, off in ((radius - 0.004, -0.06), (radius + 0.03, -0.012), (radius + 0.034, 0.012), (radius + 0.012, 0.02), (radius - 0.004, 0.012)):
                    ring.append((x + r * math.cos(a), y + off * side, axle_z + r * math.sin(a)))
                sections.append(ring)
            if len(sections) > 1:
                sweep(sections, "ArchLip", mats["paint"], angle=0.7)
            # The liner: the inside of a drum, seen through the opening.
            mesh = bmesh.new()
            outer = width_at(spec, x) - 0.03
            previous = None
            for step in range(33):
                a = math.radians(-25 + 230 * step / 32)
                pair = (mesh.verts.new((x + (radius + 0.004) * math.cos(a), side * 0.3, axle_z + (radius + 0.004) * math.sin(a))),
                        mesh.verts.new((x + (radius + 0.004) * math.cos(a), side * outer, axle_z + (radius + 0.004) * math.sin(a))))
                if previous:
                    face = mesh.faces.new((previous[0], previous[1], pair[1], pair[0]))
                    face.normal_update()
                    if face.normal.dot(Vector((math.cos(a), 0, math.sin(a)))) > 0:
                        face.normal_flip()
                previous = pair
            finish(mesh, "ArchLiner", mats["trim"], angle=1.5, recalc=False)
    # A dark floor inside the body, so nothing shows through the openings from below.
    floor = min(station[2] for station in spec["stations"])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, floor + 0.16))
    tub = bpy.context.object
    tub.name = "Underbody"
    tub.scale = (spec["wheelbase"] + 0.9, spec["half_width"] * 1.4, 0.22)
    tub.data.materials.append(mats["trim"])


def build_shut_lines(skin, spec, mats):
    """Door, bonnet and boot shut lines, door handles and a filler flap."""
    marks = spec["marks"]
    half = spec["wheelbase"] / 2
    clear = arch_radius(spec) + 0.1
    doors = []
    if "apillar" in marks and "bpillar" in marks:
        front = min(marks["apillar"][0][1] + 0.3, half - clear)
        posts = sorted(mark[0] + 0.03 for mark in marks["bpillar"])
        if spec.get("doors", 2) == 2:
            doors.append((max(posts[0] - 0.02, -half + clear), front))
        else:
            edges = [max(marks["cpillar"][0][1] - 0.1, -half + clear) if "cpillar" in marks else posts[0]] + posts[-1:] + [front]
            doors += list(zip(edges, edges[1:]))
    for side in (1, -1):
        cast = (0, -side, 0)
        for rear, front in doors:
            for x in {rear, front}:
                low = value_at(spec, x, 2) + 0.16
                high = value_at(spec, x, 3) - 0.005
                skin.ribbon(line((x, 0, low), (x - 0.03, 0, high)), cast, 0.012, mats["trim"], "ShutLine")
            skin.ribbon(line((rear, 0, value_at(spec, rear, 2) + 0.165), (front, 0, value_at(spec, front, 2) + 0.165)), cast, 0.012, mats["trim"], "ShutLine")
            handle_z = value_at(spec, rear, 3) - 0.11
            skin.patch([(rear + 0.1, 0, handle_z - 0.016), (rear + 0.27, 0, handle_z - 0.016), (rear + 0.27, 0, handle_z + 0.016), (rear + 0.1, 0, handle_z + 0.016)],
                       cast, mats["trim"], "DoorHandle", lift=0.012, step=0.03)
    # Bonnet: two lines running forward from the screen and one across the nose.
    if "hood" in marks:
        back, front = marks["hood"][0][0] + 0.06, marks["hood"][-1][1] - 0.04
        edge = spec.get("hood_line", 0.7)
        for side in (1, -1):
            points = [(x, side * width_at(spec, x) * edge, 0) for x in [back + (front - back) * i / 40 for i in range(41)]]
            skin.ribbon(points, (0, 0, -1), 0.011, mats["trim"], "ShutLine")
        skin.ribbon(line((front, -width_at(spec, front) * edge, 0), (front, width_at(spec, front) * edge, 0)), (0, 0, -1), 0.011, mats["trim"], "ShutLine")
    if "deck" in marks and marks["deck"][-1][1] - marks["deck"][0][0] > 0.5:
        back, front = marks["deck"][0][0] + 0.05, marks["deck"][-1][1] - 0.05
        for x in (back, front):
            skin.ribbon(line((x, -width_at(spec, x) * 0.66, 0), (x, width_at(spec, x) * 0.66, 0)), (0, 0, -1), 0.011, mats["trim"], "ShutLine")


def build_lamps(skin, spec, mats):
    """Headlamps, grille and intakes on the nose; tail lamps, light bar and number plate on the tail."""
    stations = spec["stations"]
    nose_x, tail_x = stations[-1][0], stations[0][0]
    nose_w, nose_low, nose_top = stations[-2][1], stations[-1][2], stations[-2][3]
    style = spec.get("face", {})
    # Headlamps: a dark housing swept back round the corner, a bright strip along its top edge
    # and two projector lenses inside.
    lamp_h = style.get("lamp_height", 0.085)
    lamp_z = stations[-3][3] - style.get("lamp_drop", 0.015)
    inner, outer = nose_w * style.get("lamp_inner", 0.42), nose_w * style.get("lamp_outer", 1.0)
    sweep_up = style.get("lamp_sweep", 0.05)
    for side in (1, -1):
        cast = (-1, -side * 0.55, -0.12)
        corner = lambda y, z: (nose_x, side * y, z)
        skin.patch([corner(inner, lamp_z - lamp_h), corner(outer, lamp_z - lamp_h * 0.7 + sweep_up),
                    corner(outer, lamp_z + sweep_up + lamp_h * 0.25), corner(inner, lamp_z)], cast, mats["trim"], "LampHousing", lift=0.004, grazing=0.16, reach=0.42, step=0.016)
        skin.patch([corner(inner + 0.02, lamp_z - 0.022), corner(outer - 0.02, lamp_z - 0.02 + sweep_up + lamp_h * 0.22),
                    corner(outer - 0.02, lamp_z - 0.006 + sweep_up + lamp_h * 0.22), corner(inner + 0.02, lamp_z - 0.006)],
                   cast, mats["lamp"], "LampStrip", lift=0.008, step=0.025)
        span = outer - inner
        for k in (0.3, 0.62):
            y = inner + span * k
            z = lamp_z - lamp_h * 0.52 + sweep_up * k
            r = lamp_h * 0.3
            skin.patch([corner(y - r, z - r), corner(y + r, z - r), corner(y + r, z + r), corner(y - r, z + r)],
                       cast, mats["chrome"], "LampBowl", lift=0.007, step=0.008, rounded=True)
            r *= 0.62
            skin.patch([corner(y - r, z - r), corner(y + r, z - r), corner(y + r, z + r), corner(y - r, z + r)],
                       cast, mats["lamp"], "LampLens", lift=0.01, step=0.006, rounded=True)
    # Grille and lower intakes.
    front = (-1, 0, -0.05)
    grille_w = nose_w * style.get("grille", 0.5)
    grille_top = lamp_z - lamp_h - 0.03
    grille_low = nose_low + 0.035
    if grille_top - grille_low > 0.05:
        skin.patch([(nose_x, -grille_w, grille_low), (nose_x, grille_w, grille_low), (nose_x, grille_w * 0.86, grille_top), (nose_x, -grille_w * 0.86, grille_top)],
                   front, mats["trim"], "Grille", lift=0.004)
        bars = max(2, round((grille_top - grille_low) / 0.035))
        for bar in range(1, bars):
            z = grille_low + (grille_top - grille_low) * bar / bars
            skin.ribbon(line((nose_x, -grille_w * 0.9, z), (nose_x, grille_w * 0.9, z)), front, 0.008, mats["carbon"], "GrilleBar", lift=0.009)
    for side in (1, -1):
        cast = (-1, 0, -0.05)
        a, b = grille_w + 0.06, nose_w * 0.9
        skin.patch([(nose_x, side * a, grille_low + 0.01), (nose_x, side * b, grille_low + 0.04), (nose_x, side * b, grille_low + 0.13), (nose_x, side * a, grille_low + 0.11)],
                   cast, mats["trim"], "SideIntake", lift=0.004, grazing=0.3, reach=0.22, step=0.016)
    # Tail lamps and the light bar that joins them.
    tail_w, tail_top, tail_low = stations[1][1], stations[1][3], stations[0][2]
    rear = style.get("tail", {})
    lamp_z = tail_top - rear.get("drop", 0.1)
    lamp_h = rear.get("height", 0.06)
    for side in (1, -1):
        cast = (1, -side * 0.4, -0.05)
        inner, outer = tail_w * rear.get("inner", 0.34), tail_w * 0.98
        corner = lambda y, z: (tail_x, side * y, z)
        skin.patch([corner(inner, lamp_z - lamp_h / 2), corner(outer, lamp_z - lamp_h / 2 + 0.01), corner(outer, lamp_z + lamp_h / 2 + 0.02), corner(inner, lamp_z + lamp_h / 2)],
                   cast, mats["trim"], "TailHousing", lift=0.004)
        skin.patch([corner(inner + 0.015, lamp_z - lamp_h / 2 + 0.012), corner(outer - 0.015, lamp_z - lamp_h / 2 + 0.022),
                    corner(outer - 0.015, lamp_z + lamp_h / 2 + 0.008), corner(inner + 0.015, lamp_z + lamp_h / 2 - 0.012)],
                   cast, mats["tail"], "TailLamp", lift=0.008, step=0.025)
    back = (1, 0, -0.03)
    if rear.get("bar", False):
        skin.ribbon(line((tail_x, -tail_w * 0.4, lamp_z), (tail_x, tail_w * 0.4, lamp_z)), back, 0.018, mats["tail"], "TailBar", lift=0.008)
    plate_z = (lamp_z - lamp_h + tail_low) / 2 + 0.03
    skin.patch([(tail_x, -0.27, plate_z - 0.07), (tail_x, 0.27, plate_z - 0.07), (tail_x, 0.27, plate_z + 0.07), (tail_x, -0.27, plate_z + 0.07)],
               back, mats["trim"], "PlateRecess", lift=0.004)
    skin.patch([(tail_x, -0.22, plate_z - 0.05), (tail_x, 0.22, plate_z - 0.05), (tail_x, 0.22, plate_z + 0.05), (tail_x, -0.22, plate_z + 0.05)],
               back, mats["plate"], "PlateRear", lift=0.009)
    # Lower valance in dark plastic.
    skin.patch([(tail_x, -tail_w * 0.8, tail_low + 0.01), (tail_x, tail_w * 0.8, tail_low + 0.01), (tail_x, tail_w * 0.7, tail_low + 0.1), (tail_x, -tail_w * 0.7, tail_low + 0.1)],
               back, mats["trim"], "Valance", lift=0.004)


def build_details(skin, spec, mats):
    stations = spec["stations"]
    tail_x = stations[0][0]
    marks = spec["marks"]
    # Mirrors on the doors, just behind the foot of the windscreen: a shaped shell on an arm.
    if "windshield" in marks:
        x = marks["windshield"][0][1] - 0.16
        for side in (1, -1):
            hit = skin.cast((x, 0, value_at(spec, x, 3) + 0.01), (0, -side, 0))
            if not hit:
                continue
            root = hit[0]
            head = Vector((x - 0.02, root.y + side * 0.15, root.z + 0.05))
            sweep([[(root.x + dx, root.y + (-0.01 if i == 0 else 0) * side + (head.y - root.y) * i / 2, root.z + (head.z - root.z) * i / 2 + dz)
                    for dx, dz in ((-0.03, -0.01), (0.03, -0.01), (0.03, 0.012), (-0.03, 0.012))] for i in range(3)], "MirrorArm", mats["trim"])
            shell = ellipsoid((head.x + 0.01, head.y + side * 0.03, head.z + 0.02), (0.07, 0.085, 0.052), mats["paint"], "Mirror")
            box((head.x - 0.045, head.y + side * 0.03, head.z + 0.02), (0.012, 0.13, 0.07), mats["glass"], "MirrorGlass", bevel=0.004)
    # Wipers parked along the foot of the screen, and a filler flap on the left rear wing.
    if "windshield" in marks:
        cowl = marks["windshield"][0][1]
        reach = value_at(spec, cowl - 0.1, 5)
        for start in (-reach * 0.78, -reach * 0.02):
            skin.ribbon(line((cowl - 0.035, start, 0), (cowl - 0.1, start + reach * 0.72, 0), 0.02), (0, 0, -1), 0.014, mats["trim"], "Wiper", lift=0.012)
            skin.ribbon(line((cowl - 0.01, start + 0.02, 0), (cowl - 0.06, start + reach * 0.36, 0), 0.02), (0, 0, -1), 0.02, mats["trim"], "WiperArm", lift=0.008)
    cap_x = -spec["wheelbase"] / 2 - 0.02
    cap_z = (spec["wheel_radius"] + arch_radius(spec) + value_at(spec, cap_x, 3)) / 2 + 0.035
    for radius, material, lift in ((0.062, mats["trim"], 0.004), (0.054, mats["paint"], 0.006)):
        skin.patch([(cap_x - radius, 0, cap_z - radius), (cap_x + radius, 0, cap_z - radius), (cap_x + radius, 0, cap_z + radius), (cap_x - radius, 0, cap_z + radius)],
                   (0, -1, 0), material, "FillerFlap", lift=lift, step=0.009, rounded=True, grazing=0.3)
    # Exhaust tips: polished pipes with dark throats.
    pipes = spec.get("pipes", [0.36])
    for side in (1, -1):
        for y in pipes:
            centre = (tail_x + 0.05, side * y, stations[0][2] - 0.02)
            mesh_profile = [(0.052, -0.14), (0.056, 0.0), (0.05, 0.004), (0.044, 0.0), (0.042, -0.12), (0.004, -0.12)]
            mesh = bmesh.new()
            rings = []
            for i in range(20):
                a = math.tau * i / 20
                rings.append([mesh.verts.new((centre[0] - off, centre[1] + r * math.cos(a), centre[2] + r * math.sin(a))) for r, off in mesh_profile])
            for i in range(20):
                a, b = rings[i], rings[(i + 1) % 20]
                for k in range(len(mesh_profile) - 1):
                    face = mesh.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
                    face.material_index = 0 if k < 3 else 1
            pipe = finish(mesh, "Exhaust", mats["chrome"], angle=0.5)
            pipe.data.materials.append(mats["trim"])


def build_cabin(spec, mats):
    """What you see through the glass: two bucket seats, a dashboard with a cowled instrument
    binnacle, a steering wheel, a centre tunnel and a shelf behind the seats."""
    marks = spec["marks"]
    cowl = marks["windshield"][0][1]
    rear = marks["rearglass"][0][0]
    floor = min(station[2] for station in spec["stations"]) + 0.27
    belt = value_at(spec, cowl - 0.6, 3)
    roof = value_at(spec, cowl - 0.9, 4)
    reach = value_at(spec, cowl - 0.6, 5)
    seat_x = cowl - 1.02
    top = min(roof - 0.2, floor + 0.62)
    for side in (1, -1):
        y = side * reach * 0.52
        box((seat_x + 0.1, y, floor + 0.07), (0.46, 0.44, 0.14), mats["seat"], "SeatCushion", bevel=0.05)
        box((seat_x - 0.2, y, (floor + top) / 2 + 0.06), (0.14, 0.44, top - floor), mats["seat"], "SeatBack", bevel=0.05, rotation=(0, math.radians(-14), 0))
        for wing in (-1, 1):
            box((seat_x - 0.13, y + wing * 0.2, floor + (top - floor) * 0.42), (0.16, 0.06, (top - floor) * 0.6), mats["cabin"], "SeatBolster", bevel=0.025, rotation=(0, math.radians(-14), 0))
        box((seat_x - 0.3, y, top + 0.1), (0.1, 0.24, 0.17), mats["seat"], "Headrest", bevel=0.04, rotation=(0, math.radians(-10), 0))
    box((cowl - 0.2, 0, belt - 0.07), (0.42, reach * 1.95, 0.2), mats["cabin"], "Dashboard", bevel=0.06)
    box((cowl - 0.32, reach * 0.52, belt + 0.04), (0.2, 0.34, 0.09), mats["cabin"], "Binnacle", bevel=0.035)
    box((cowl - 0.42, 0, belt - 0.06), (0.03, 0.26, 0.15), mats["glass"], "Screen", bevel=0.01, rotation=(0, math.radians(-20), 0))
    box((seat_x + 0.1, 0, floor + 0.1), (1.1, 0.2, 0.22), mats["cabin"], "Tunnel", bevel=0.04)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.165, minor_radius=0.016, major_segments=28, minor_segments=8,
                                     location=(cowl - 0.55, reach * 0.52, belt - 0.01), rotation=(0, math.radians(68), 0))
    add(bpy.context.object, mats["cabin"]).name = "SteeringWheel"
    for spoke in (0, 2.1, -2.1):
        box((cowl - 0.545, reach * 0.52 + 0.08 * math.sin(spoke), belt - 0.01 - 0.08 * math.cos(spoke)), (0.016, 0.035, 0.16), mats["chrome"], "WheelSpoke", bevel=0.006,
            rotation=(spoke, math.radians(-22), 0))
    box((cowl - 0.4, reach * 0.52, belt - 0.05), (0.32, 0.06, 0.06), mats["cabin"], "Column", bevel=0.02, rotation=(0, math.radians(-22), 0))
    if rear < seat_x - 0.45:
        shelf = value_at(spec, (rear + seat_x) / 2, 3) - 0.03
        box(((rear + seat_x - 0.4) / 2, 0, shelf), (seat_x - 0.4 - rear, reach * 1.8, 0.05), mats["cabin"], "ParcelShelf", bevel=0.015)
    # A hoop behind the seats, as in a track car.
    hoop_x = seat_x - 0.42
    hoop_top = min(value_at(spec, hoop_x, 4) - 0.07, top + 0.24)
    hoop_w = value_at(spec, hoop_x, 5) * 0.86
    sections = []
    for step in range(13):
        a = math.pi * step / 12
        centre = Vector((hoop_x, hoop_w * math.cos(a), floor + (hoop_top - floor) * math.sin(a) ** 0.6))
        sections.append([tuple(centre + Vector(offset)) for offset in ((0.02, 0, 0.02), (-0.02, 0, 0.02), (-0.02, 0, -0.02), (0.02, 0, -0.02))])
    sweep(sections, "RollHoop", mats["chrome"], angle=0.9)


def plan_strip(spec, x0, x1, inset, z, width, thick, material, name, taper=0.0):
    """A bar that follows the outline of the body seen from above, along one side: sills,
    splitter edges and the like. ``inset`` is how far inside the body edge it runs."""
    for side in (1, -1):
        sections = []
        steps = max(4, round((x1 - x0) / 0.12))
        for i in range(steps + 1):
            x = x0 + (x1 - x0) * i / steps
            y = (width_at(spec, x) - inset) * side
            w = width * (1 - taper * abs(i / steps - 0.5) * 2)
            sections.append([(x, y - w * side, z - thick / 2), (x, y, z - thick / 2), (x, y, z + thick / 2), (x, y - w * side * 0.8, z + thick / 2)])
        sweep(sections, name, material, angle=0.5)


def aerofoil(span, chord, thick, centre, material, name, sweep_back=0.0, dihedral=0.0, pitch=0.12):
    """A wing: an aerofoil section run across the car, optionally swept at the tips."""
    outline = [(0.0, 0.0), (0.12, 0.55), (0.4, 0.9), (0.75, 0.55), (1.0, 0.08), (0.75, -0.25), (0.35, -0.42), (0.08, -0.3)]
    sections = []
    for i in range(13):
        t = i / 12 * 2 - 1
        local = []
        for u, v in outline:
            dx, dz = (0.5 - u) * chord, v * thick
            local.append((centre[0] + dx * math.cos(pitch) + dz * math.sin(pitch) - abs(t) ** 2 * sweep_back,
                          centre[1] + t * span / 2,
                          centre[2] - dx * math.sin(pitch) + dz * math.cos(pitch) + abs(t) ** 2 * dihedral))
        sections.append(local)
    return sweep(sections, name, material, angle=0.9)


def build_aero_package(skin, spec, mats):
    """Splitter, sills, wing, vents and diffuser, shaped to each car and kept inside its footprint."""
    aero = spec.get("aero", {})
    stations = spec["stations"]
    nose, tail = stations[-1][0], stations[0][0]
    width = spec["half_width"]
    half = spec["wheelbase"] / 2
    clear = arch_radius(spec) + 0.04
    floor = min(station[2] for station in stations)
    if aero.get("splitter"):
        # A thin blade under the chin that follows the plan of the nose.
        mesh = bmesh.new()
        top, bottom = [], []
        xs = [nose - 0.55 + 0.585 * i / 10 for i in range(11)]
        outline = [(x, min(width_at(spec, min(x, nose)) + 0.015, width * 0.99) * (1.0 if x <= nose else 0.9)) for x in xs]
        ring = [(x, y) for x, y in outline] + [(x, -y) for x, y in outline[::-1]]
        z = stations[-1][2] - 0.045
        for x, y in ring:
            top.append(mesh.verts.new((x, y, z + 0.012)))
            bottom.append(mesh.verts.new((x, y, z - 0.012)))
        mesh.faces.new(top)
        mesh.faces.new(bottom[::-1])
        for k in range(len(ring)):
            n = (k + 1) % len(ring)
            mesh.faces.new((top[k], bottom[k], bottom[n], top[n]))
        finish(mesh, "FrontSplitter", mats["carbon"], angle=0.5)
        for side in (1, -1):
            box((nose - 0.3, side * 0.34, z + 0.05), (0.02, 0.02, 0.09), mats["chrome"], "SplitterStay", bevel=0.004)
    if aero.get("skirts"):
        plan_strip(spec, -half + clear, half - clear, spec.get("waist", 0.035) + 0.03, floor + 0.025, 0.06, 0.035, mats["carbon"], "SideSkirt", taper=0.2)
    if aero.get("canards"):
        for side in (1, -1):
            for level in (0.0, 0.1):
                hit = skin.cast((nose - 0.34, 0, stations[-1][2] + 0.09 + level), (0, -side, 0), grazing=0.02)
                if hit:
                    at = hit[0]
                    sweep([[(at.x - 0.13, at.y - side * 0.03, at.z - 0.02), (at.x + 0.13, at.y - side * 0.05, at.z + 0.01),
                            (at.x + 0.13, at.y - side * 0.05, at.z + 0.02), (at.x - 0.13, at.y - side * 0.03, at.z - 0.01)],
                           [(at.x - 0.15, at.y + side * 0.07, at.z + 0.0), (at.x + 0.04, at.y + side * 0.06, at.z + 0.02),
                            (at.x + 0.04, at.y + side * 0.06, at.z + 0.028), (at.x - 0.15, at.y + side * 0.07, at.z + 0.008)]], "Canard", mats["carbon"])
    if aero.get("hood_vents") and "hood" in spec["marks"]:
        back, front = spec["marks"]["hood"][0][0], spec["marks"]["hood"][-1][1]
        x = back + (front - back) * 0.42
        for side in (1, -1):
            y = side * width_at(spec, x) * 0.36
            skin.patch([(x - 0.17, y - 0.1, 0), (x + 0.17, y - 0.07, 0), (x + 0.17, y + 0.07, 0), (x - 0.17, y + 0.1, 0)], (0, 0, -1), mats["trim"], "HoodVent", lift=0.004)
            for slat in range(4):
                sx = x - 0.12 + slat * 0.08
                skin.ribbon(line((sx, y - 0.085, 0), (sx, y + 0.085, 0), 0.02), (0, 0, -1), 0.022, mats["carbon"], "HoodVentSlat", lift=0.009)
    if aero.get("hood_scoop") and "hood" in spec["marks"]:
        back, front = spec["marks"]["hood"][0][0], spec["marks"]["hood"][-1][1]
        sections = []
        for i in range(9):
            t = i / 8
            x = back + 0.1 + (front - back - 0.45) * t
            hit = skin.cast((x, 0, 0), (0, 0, -1))
            if not hit:
                continue
            base = hit[0].z - 0.01
            rise = 0.07 * math.sin(math.pi * min(1.0, t * 1.25 + 0.12)) ** 0.7 * (1 - 0.35 * t)
            w = 0.25 - 0.06 * t
            sections.append([(x, -w, base), (x, -w * 0.82, base + rise), (x, -w * 0.3, base + rise * 1.12), (x, w * 0.3, base + rise * 1.12),
                             (x, w * 0.82, base + rise), (x, w, base)])
        if len(sections) > 2:
            sweep(sections, "HoodScoop", mats["paint"], angle=0.9)
    if aero.get("fender_vents"):
        x = half - clear - 0.02
        for side in (1, -1):
            z = value_at(spec, x, 2) + (value_at(spec, x, 3) - value_at(spec, x, 2)) * 0.6
            skin.patch([(x - 0.2, 0, z - 0.06), (x, 0, z - 0.09), (x, 0, z + 0.07), (x - 0.24, 0, z + 0.03)], (0, -side, 0), mats["trim"], "FenderVent", lift=0.004, step=0.016, grazing=0.03)
            for slat in range(3):
                sx = x - 0.05 - slat * 0.06
                skin.ribbon(line((sx, 0, z - 0.07), (sx - 0.03, 0, z + 0.05), 0.02), (0, -side, 0), 0.014, mats["carbon"], "FenderVentSlat", lift=0.009)
    if aero.get("side_intakes"):
        # Mid-engined: a deep intake cut into the body ahead of each rear wheel.
        x = -half + clear + 0.02
        for side in (1, -1):
            low = value_at(spec, x, 2) + 0.2
            high = value_at(spec, x, 3) - 0.06
            skin.patch([(x, 0, low), (x + 0.42, 0, low + 0.1), (x + 0.5, 0, high - 0.04), (x, 0, high)], (0, -side, 0), mats["trim"], "SideIntake", lift=0.004)
            for slat in range(2):
                z = low + (high - low) * (slat + 1) / 3
                skin.ribbon(line((x + 0.02, 0, z), (x + 0.42, 0, z + 0.03), 0.02), (0, -side, 0), 0.016, mats["carbon"], "IntakeBlade", lift=0.012)
    if aero.get("stripes"):
        marks = spec["marks"]
        runs = []
        if "hood" in marks:
            runs.append((marks["hood"][0][0] + 0.03, marks["hood"][-1][1] + 0.3))
        if "windshield" in marks and "rearglass" in marks:
            runs.append((marks["rearglass"][-1][1] + 0.04, marks["windshield"][0][0] - 0.04))
        if "deck" in marks:
            runs.append((tail + 0.06, marks["deck"][-1][1] - 0.02))
        for start, end in runs:
            for y in (-0.13, 0.13):
                skin.ribbon(line((start, y, 0), (end, y, 0), 0.04), (0, 0, -1), 0.17, mats["stripe"], "Stripe", lift=0.0035)
    deck_x = tail + 0.3
    deck_z = value_at(spec, deck_x, 3) + CROWN
    wing = aero.get("wing")
    if wing == "lip":
        # A ducktail: the edge of the boot kicked up.
        sections = []
        for i in range(13):
            t = i / 12 * 2 - 1
            y = t * width_at(spec, tail + 0.12) * 0.9
            hit = skin.cast((tail + 0.16, y, 0), (0, 0, -1))
            if not hit:
                continue
            z = hit[0].z
            kick = 0.075 * (1 - 0.35 * t * t)
            sections.append([(tail + 0.34, y, z - 0.03), (tail + 0.02, y, z - 0.05), (tail - 0.01, y, z + kick), (tail + 0.03, y, z + kick + 0.006), (tail + 0.2, y, z + 0.012)])
        if len(sections) > 2:
            sweep(sections, "Ducktail", mats["paint"], angle=0.8)
    elif wing == "roof":
        # A hatchback's spoiler, carried straight off the back of the roof.
        marks = spec["marks"]
        x = marks["rearglass"][0][1] - 0.02
        z = value_at(spec, marks["rearglass"][0][1], 4)
        cab = value_at(spec, x, 5)
        sections = []
        for i in range(9):
            t = i / 8 * 2 - 1
            y = t * cab * 0.98
            drop = 0.03 * t * t
            sections.append([(x + 0.12, y, z - 0.035 - drop), (x - 0.24, y, z - 0.03 - drop), (x - 0.27, y, z - 0.012 - drop), (x - 0.2, y, z + 0.004 - drop), (x + 0.12, y, z - 0.012 - drop)])
        sweep(sections, "RoofSpoiler", mats["paint"], angle=0.8)
    elif wing in ("low", "high"):
        height = 0.16 if wing == "low" else 0.3
        span = width * (1.56 if wing == "low" else 1.8)
        centre = (deck_x - 0.02, 0, deck_z + height)
        aerofoil(span, 0.3 if wing == "low" else 0.36, 0.035, centre, mats["carbon"], "RearWing", sweep_back=0.05, pitch=0.16)
        for side in (1, -1):
            y = side * span / 2
            sweep([[(centre[0] - 0.2, y - 0.008, centre[2] - 0.07), (centre[0] + 0.2, y - 0.008, centre[2] - 0.05), (centre[0] + 0.17, y - 0.008, centre[2] + 0.07), (centre[0] - 0.24, y - 0.008, centre[2] + 0.09)],
                   [(centre[0] - 0.2, y + 0.008, centre[2] - 0.07), (centre[0] + 0.2, y + 0.008, centre[2] - 0.05), (centre[0] + 0.17, y + 0.008, centre[2] + 0.07), (centre[0] - 0.24, y + 0.008, centre[2] + 0.09)]],
                  "WingEndplate", mats["carbon"], angle=0.5)
            post = side * width * 0.42
            hit = skin.cast((deck_x + 0.1, post, 0), (0, 0, -1))
            base = hit[0].z - 0.02 if hit else deck_z - 0.05
            sweep([[(deck_x + 0.2, post - 0.012, base), (deck_x + 0.02, post - 0.012, base), (deck_x + 0.02, post + 0.012, base), (deck_x + 0.2, post + 0.012, base)],
                   [(deck_x + 0.1, post - 0.01, centre[2] - 0.012), (deck_x - 0.08, post - 0.01, centre[2] - 0.006), (deck_x - 0.08, post + 0.01, centre[2] - 0.006), (deck_x + 0.1, post + 0.01, centre[2] - 0.012)]],
                  "WingPost", mats["carbon"], angle=0.5)
    if aero.get("diffuser"):
        low = stations[0][2]
        for fin in range(aero["diffuser"]):
            y = (fin - (aero["diffuser"] - 1) / 2) * width * 1.1 / aero["diffuser"]
            sweep([[(tail + 0.45, y - 0.009, low - 0.2), (tail + 0.45, y + 0.009, low - 0.2), (tail + 0.45, y + 0.009, low - 0.17), (tail + 0.45, y - 0.009, low - 0.17)],
                   [(tail + 0.0, y - 0.009, low - 0.05), (tail + 0.0, y + 0.009, low - 0.05), (tail + 0.0, y + 0.009, low + 0.07), (tail + 0.0, y - 0.009, low + 0.07)]],
                  "DiffuserFin", mats["carbon"], angle=0.5)


def build_car(spec, race_car=False):
    measure(spec)
    mats = car_materials(spec["paint"], interior=spec.get("interior", False))
    body = build_body(spec, mats)
    cut_arches(body, spec, mats)
    skin = Skin(body)
    build_arches(skin, spec, mats)
    build_shut_lines(skin, spec, mats)
    build_lamps(skin, spec, mats)
    half = spec["wheelbase"] / 2
    wheels = {}
    for label, x in (("Front", half), ("Rear", -half)):
        for side_name, side in (("L", 1), ("R", -1)):
            key = f"Wheel_{label}_{side_name}"
            wheels[key] = build_wheel(key, x, side, spec, mats)
    build_details(skin, spec, mats)
    if spec.get("interior") and "windshield" in spec["marks"] and "rearglass" in spec["marks"]:
        build_cabin(spec, mats)
    if race_car:
        build_aero_package(skin, spec, mats)
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
    joined.data.validate()
    # Bake the first part's placement into the mesh, so the joined object has no transform.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
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
        wheel.location = centre
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

def render_preview(path, camera_location=(5.6, -5.2, 1.55), target=(0.0, 0, 0.55)):
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
    for suffix, location in (("front", camera_location), ("rear", (-camera_location[0], camera_location[1] * 0.9, camera_location[2] + 0.5))):
        camera.location = location
        direction = Vector(target) - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(path.with_name(f"{path.stem}_{suffix}.png"))
        bpy.ops.render.render(write_still=True)


def main():
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    everything = {**CARS, **TRAFFIC}
    wanted = [name for name in arguments if not name.startswith("--")] or list(everything)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    for asset_id in wanted:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        spec = everything[asset_id]
        wheels = build_car(spec, race_car=asset_id in CARS)
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
