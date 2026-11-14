"""Build the city street routes for Turbo Road League.

    /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_city_tracks.py

Each route is exported to ``public/models/blender/<id>.glb`` with matching
``<id>.track.json`` metadata, in the same format as the scenic circuits, so the
physics, AI and headless tests treat it like any other track.

The model carries geometry, UVs (in metres) and named materials only. The game
supplies the photographic textures, sky and trees at load time
(``src/game/effects/cityLook.js``), which keeps the download small and lets
every city route share one set of textures.
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import build_assets as builder  # noqa: E402  (hazards, coin template, export)
import track_layout as layout  # noqa: E402

EXPORT_DIR = ROOT / "public" / "models" / "blender"

WIDTH = 26.0
HALF = WIDTH / 2
WALL = HALF + layout.GUARDRAIL_OFFSET      # the physics barrier face
SAMPLE_STEP = 2.2
CORNER_RADIUS = 40.0
FACADE_TILE = (14.0, 13.2)                 # one facade texture tile: 4 window bays x 4 floors
FACADES = ("Brick", "Concrete", "Plaster", "Glass")

# id -> corner points of the street grid loop (x, z) and its park stretches.
# A park is (edge index, side): +1 is the left of the direction of travel.
#
# Optional district character:
#   radius    corner radius in metres (default CORNER_RADIUS)
#   hills     how strongly the ground rises and falls (1 = downtown)
#   floors    (share, lowest, highest) building height bands, in storeys
#   facades   wall types to pick from, repeated names are picked more often
#   lot       (narrowest, widest) building frontage in metres
#   tree_gap  metres between street trees (0 for none)
#   towers    number of far skyline towers
CITY_ROUTES = {
    "downtown_circuit": {
        "corners": [(-180, -120), (180, -120), (180, 20), (60, 20), (60, 130), (-180, 130)],
        "start_edge": 0,
        "parks": [(4, 1), (2, 1), (5, -1)],
        "seed": 11,
    },
    "harbour_docks": {
        "corners": [(-220, -60), (220, -60), (260, 40), (120, 110), (-40, 70), (-220, 110)],
        "start_edge": 0,
        "parks": [(0, -1)],
        "seed": 23, "hills": 0.25, "floors": [(0.7, 2, 4), (0.3, 5, 8)],
        "facades": ["Concrete", "Concrete", "Brick"], "lot": (30, 52), "tree_gap": 60, "towers": 18,
    },
    "hillside_suburbs": {
        "corners": [(-210, -90), (-40, -150), (120, -80), (230, -130), (250, 40), (90, 110), (-60, 60), (-200, 130)],
        "start_edge": 0,
        "parks": [(2, 1), (5, -1), (7, 1)],
        "seed": 37, "hills": 2.6, "floors": [(0.8, 2, 3), (0.2, 4, 5)],
        "facades": ["Plaster", "Plaster", "Brick"], "lot": (14, 22), "tree_gap": 13, "towers": 0,
    },
    "industrial_zone": {
        "corners": [(-200, -110), (200, -110), (200, 110), (40, 110), (40, 10), (-80, 10), (-80, 110), (-200, 110)],
        "start_edge": 0,
        "parks": [],
        "seed": 41, "hills": 0.4, "floors": [(0.75, 2, 4), (0.25, 5, 9)],
        "facades": ["Brick", "Concrete", "Brick"], "lot": (34, 60), "tree_gap": 0, "towers": 12,
    },
    "park_boulevard": {
        "corners": [(-240, -80), (0, -140), (240, -80), (240, 90), (0, 150), (-240, 90)],
        "start_edge": 0,
        "parks": [(0, 1), (1, 1), (3, 1), (4, 1), (2, -1), (5, -1)],
        "seed": 53, "radius": 70.0, "hills": 1.6, "floors": [(0.6, 4, 7), (0.4, 8, 12)],
        "facades": ["Plaster", "Brick", "Glass"], "tree_gap": 15, "towers": 20,
    },
    "highway_ring": {
        "corners": [(-380, -160), (380, -160), (460, 0), (380, 160), (-380, 160), (-460, 0)],
        "start_edge": 0,
        "parks": [(3, -1)],
        "seed": 67, "radius": 90.0, "hills": 0.8, "floors": [(0.35, 6, 10), (0.4, 12, 20), (0.25, 22, 38)],
        "facades": ["Glass", "Glass", "Concrete"], "lot": (26, 44), "tree_gap": 34, "towers": 60,
    },
    # Sprints: one long lap that crosses the city and never repeats a corner.
    "crosstown_sprint": {
        "corners": [(-520, -200), (-200, -260), (120, -180), (420, -260), (560, -60), (380, 120),
                    (480, 300), (160, 340), (-80, 220), (-340, 320), (-560, 140)],
        "start_edge": 0,
        "parks": [(2, 1), (5, -1), (8, 1), (10, -1)],
        "seed": 71, "radius": 55.0, "hills": 1.4, "towers": 40,
    },
    "riverside_sprint": {
        "corners": [(-420, -120), (-140, -220), (180, -140), (440, -200), (520, 40), (260, 160),
                    (-40, 100), (-300, 200), (-500, 60)],
        "start_edge": 0,
        "parks": [(0, 1), (1, 1), (2, 1), (4, 1), (6, 1), (7, 1), (3, -1), (8, -1)],
        "seed": 83, "radius": 80.0, "hills": 1.8, "floors": [(0.7, 3, 6), (0.3, 7, 11)],
        "facades": ["Plaster", "Brick", "Plaster", "Glass"], "tree_gap": 16, "towers": 24,
    },
}

HILLS = 1.0


def ground_height(x, z):
    """Gentle, smooth rise and fall so the streets are not dead flat."""
    return 3.0 + HILLS * (0.010 * x + 1.2 * math.sin(z / 70.0) + 0.8 * math.sin(x / 55.0))


# --------------------------------------------------------------------------- #
# Route
# --------------------------------------------------------------------------- #

def filleted_loop(corners, start_edge, radius=CORNER_RADIUS, step=SAMPLE_STEP):
    """Straight streets joined by round corners.

    Returns ``(points, edges)``: ``points`` are ``(x, z, y)`` samples starting at
    the middle of ``start_edge``; ``edges`` maps each straight's index to the
    sample-index range ``(first, last)`` it covers.
    """
    count = len(corners)
    pieces = []
    for index in range(count):
        a, b, c = corners[index - 1], corners[index], corners[(index + 1) % count]
        d1 = (b[0] - a[0], b[1] - a[1])
        d2 = (c[0] - b[0], c[1] - b[1])
        l1, l2 = math.hypot(*d1), math.hypot(*d2)
        d1 = (d1[0] / l1, d1[1] / l1)
        d2 = (d2[0] / l2, d2[1] / l2)
        turn = math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1])
        tangent = radius * math.tan(abs(turn) / 2)
        enter = (b[0] - d1[0] * tangent, b[1] - d1[1] * tangent)
        leave = (b[0] + d2[0] * tangent, b[1] + d2[1] * tangent)
        side = 1.0 if turn > 0 else -1.0
        centre = (enter[0] - d1[1] * radius * side, enter[1] + d1[0] * radius * side)
        pieces.append({"enter": enter, "leave": leave, "centre": centre, "turn": turn})

    def line(a, b):
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        steps = max(1, round(length / step))
        return [(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps) for i in range(steps)]

    def arc(piece):
        cx, cz = piece["centre"]
        start = math.atan2(piece["enter"][1] - cz, piece["enter"][0] - cx)
        steps = max(2, round(abs(piece["turn"]) * radius / step))
        return [(cx + radius * math.cos(start + piece["turn"] * i / steps),
                 cz + radius * math.sin(start + piece["turn"] * i / steps)) for i in range(steps)]

    flat = []
    edges = {}
    # Edge i runs from corner i to corner i + 1; begin halfway along the start edge.
    first = pieces[start_edge]["leave"]
    last = pieces[(start_edge + 1) % count]["enter"]
    middle = ((first[0] + last[0]) / 2, (first[1] + last[1]) / 2)
    begin = len(flat)
    flat.extend(line(middle, last))
    edges[start_edge] = [(begin, len(flat))]
    for offset in range(1, count + 1):
        index = (start_edge + offset) % count
        flat.extend(arc(pieces[index]))
        begin = len(flat)
        end_point = middle if offset == count else pieces[(index + 1) % count]["enter"]
        flat.extend(line(pieces[index]["leave"], end_point))
        edges.setdefault(index, []).append((begin, len(flat)))
    points = [(x, z, ground_height(x, z)) for x, z in flat]
    return points, edges


# --------------------------------------------------------------------------- #
# Mesh assembly: one mesh per route, with UVs in metres and one material slot per surface
# --------------------------------------------------------------------------- #

class CityMesh:
    def __init__(self, track_id):
        self.track_id = track_id
        self.vertices = []
        self.faces = []
        self.uvs = []
        self.slots = []
        self.materials = []
        self.index = {}

    def material(self, name, color=(0.5, 0.5, 0.5), roughness=0.8, metallic=0.0):
        if name not in self.index:
            self.index[name] = len(self.materials)
            self.materials.append(builder.make_material(f"{self.track_id}_{name}", color, metallic, roughness))
        return self.index[name]

    def quad(self, corners, uvs, material, facing):
        """``corners``: four game-space ``(x, z, y)`` points. ``facing``: a game-space
        ``(x, z, y)`` direction the visible side must face."""
        pts = [(p[0], -p[1], p[2]) for p in corners]
        ax, ay, az = (pts[1][i] - pts[0][i] for i in range(3))
        bx, by, bz = (pts[2][i] - pts[0][i] for i in range(3))
        normal = (ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)
        want = (facing[0], -facing[1], facing[2])
        order = [0, 1, 2, 3]
        if normal[0] * want[0] + normal[1] * want[1] + normal[2] * want[2] < 0:
            order = [0, 3, 2, 1]
        base = len(self.vertices)
        self.vertices.extend(pts[i] for i in order)
        self.faces.append((base, base + 1, base + 2, base + 3))
        self.uvs.extend(uvs[i] for i in order)
        self.slots.append(material)

    def box(self, centre, tangent, half_width, half_depth, base, top, wall, roof, tile=(4.0, 4.0)):
        """Upright box. ``centre``: ``(x, z)``; ``tangent``: unit ``(tx, tz)`` along its width."""
        tx, tz = tangent
        nx, nz = tz, -tx
        ring = [(centre[0] + tx * sx * half_width + nx * sz * half_depth,
                 centre[1] + tz * sx * half_width + nz * sz * half_depth)
                for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        run = 0.0
        height = top - base
        for index in range(4):
            a, b = ring[index], ring[(index + 1) % 4]
            length = math.hypot(b[0] - a[0], b[1] - a[1])
            middle = ((a[0] + b[0]) / 2 - centre[0], (a[1] + b[1]) / 2 - centre[1])
            u0, u1 = run / tile[0], (run + length) / tile[0]
            self.quad([(a[0], a[1], base), (b[0], b[1], base), (b[0], b[1], top), (a[0], a[1], top)],
                      [(u0, 0), (u1, 0), (u1, height / tile[1]), (u0, height / tile[1])],
                      wall, (middle[0], middle[1], 0))
            run += length
        self.quad([(p[0], p[1], top) for p in ring],
                  [(0, 0), (half_width / 4, 0), (half_width / 4, half_depth / 4), (0, half_depth / 4)],
                  roof, (0, 0, 1))

    def build(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        for material in self.materials:
            mesh.materials.append(material)
        layer = mesh.uv_layers.new(name="UVMap")
        for loop, uv in zip(layer.data, self.uvs):
            loop.uv = uv
        for polygon, slot in zip(mesh.polygons, self.slots):
            polygon.material_index = slot
            polygon.use_smooth = False
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


class Street:
    """Per-sample frames of the route: position, left vector and distance travelled."""

    def __init__(self, points):
        self.points = points
        self.count = len(points)
        self.left = []
        self.tangent = []
        self.s = [0.0]
        for index, point in enumerate(points):
            before, after = points[index - 1], points[(index + 1) % self.count]
            dx, dz = after[0] - before[0], after[1] - before[1]
            length = math.hypot(dx, dz) or 1.0
            self.tangent.append((dx / length, dz / length))
            self.left.append((dz / length, -dx / length))
            self.s.append(self.s[-1] + math.hypot(after[0] - point[0], after[1] - point[1]))

    def at(self, index, lane, lift=0.0):
        index %= self.count
        x, z, y = self.points[index]
        lx, lz = self.left[index]
        return (x + lx * lane, z + lz * lane, y + lift)

    def ribbon(self, mesh, lane_a, lane_b, lift, material, tile, keep=None, lift_b=None):
        """A strip between two lanes. ``tile``: metres per texture repeat (across, along)."""
        lift_b = lift if lift_b is None else lift_b
        facing = (0, 0, 1)
        vertical = abs(lane_a - lane_b) < 1e-6
        for index in range(self.count):
            if keep and not keep(index):
                continue
            a0, b0 = self.at(index, lane_a, lift), self.at(index, lane_b, lift_b)
            a1, b1 = self.at(index + 1, lane_a, lift), self.at(index + 1, lane_b, lift_b)
            v0, v1 = self.s[index] / tile[1], self.s[index + 1] / tile[1]
            if vertical:
                # A kerb or barrier face: it looks toward lane 0.
                lx, lz = self.left[index]
                side = -1.0 if lane_a > 0 else 1.0
                facing = (lx * side, lz * side, 0)
                u0, u1 = lift / tile[0], lift_b / tile[0]
            else:
                u0, u1 = lane_a / tile[0], lane_b / tile[0]
            mesh.quad([a0, b0, b1, a1], [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], material, facing)


# --------------------------------------------------------------------------- #
# City blocks
# --------------------------------------------------------------------------- #

def in_ranges(index, ranges):
    return any(first <= index < last for first, last in ranges)


def build_city(track_id, spec):
    global HILLS
    HILLS = spec.get("hills", 1.0)
    rng = random.Random(spec["seed"])
    points, edges = filleted_loop(spec["corners"], spec["start_edge"], spec.get("radius", CORNER_RADIUS))
    route = layout.Route(points)
    street = Street(points)
    mesh = CityMesh(track_id)
    count = street.count

    # Park stretches per side: sample ranges without buildings.
    parks = {1: [], -1: []}
    for edge, side in spec["parks"]:
        for first, last in edges[edge]:
            parks[side].append((first + 6, last - 6))

    asphalt = mesh.material("Track_Asphalt", (0.10, 0.11, 0.12), 0.86)
    marking = mesh.material("Road_Marking", (0.82, 0.83, 0.80), 0.62)
    kerb = mesh.material("Kerb_Stone", (0.55, 0.55, 0.53), 0.8)
    pavement = mesh.material("Ground_Pavement", (0.42, 0.42, 0.41), 0.85)
    block = mesh.material("Ground_Block", (0.30, 0.31, 0.32), 0.9)
    grass = mesh.material("Ground_Grass", (0.18, 0.32, 0.12), 0.95)
    barrier = mesh.material("Barrier_Concrete", (0.62, 0.62, 0.60), 0.82)
    roof = mesh.material("Roof", (0.16, 0.17, 0.18), 0.9)
    pole = mesh.material("Lamp_Pole", (0.10, 0.11, 0.12), 0.45, 0.7)
    glow = mesh.material("Lamp_Glow", (1.0, 0.82, 0.55), 0.4)
    pool = mesh.material("Lamp_Pool", (1.0, 0.80, 0.52), 0.9)
    gate = mesh.material("Start_Gate", (0.08, 0.09, 0.10), 0.4, 0.6)
    checker_dark = mesh.material("Start_Checker_Dark", (0.03, 0.03, 0.03), 0.7)
    checker_light = mesh.material("Start_Checker_Light", (0.9, 0.9, 0.88), 0.7)
    facades = {name: mesh.material(f"Facade_{name}", (0.5, 0.48, 0.45), 0.8) for name in FACADES}

    # ---- carriageway ------------------------------------------------------
    street.ribbon(mesh, -HALF, HALF, 0.05, asphalt, (8.0, 8.0))
    for lane in (-HALF + 0.55, HALF - 0.75):
        street.ribbon(mesh, lane, lane + 0.2, 0.062, marking, (1.0, 1.0))
    for lane in (-4.4, 4.2):
        street.ribbon(mesh, lane, lane + 0.2, 0.062, marking, (1.0, 1.0), keep=lambda i: (i // 3) % 3 == 0)

    # ---- kerb, inner pavement strip and the barrier the physics wall sits on ----
    for side in (1, -1):
        street.ribbon(mesh, side * HALF, side * HALF, 0.05, kerb, (1.0, 1.0), lift_b=0.11)
        street.ribbon(mesh, side * HALF, side * (WALL - 0.05), 0.11, pavement, (3.0, 3.0))
        inner, outer = side * (WALL - 0.05), side * (WALL + 0.45)
        street.ribbon(mesh, inner, inner, 0.11, barrier, (2.0, 2.0), lift_b=1.0)
        street.ribbon(mesh, inner, outer, 1.0, barrier, (2.0, 2.0))
        street.ribbon(mesh, outer, outer, 1.0, barrier, (2.0, 2.0), lift_b=0.11)

    # ---- pavement or park beyond the barrier ----------------------------
    for side in (1, -1):
        ranges = parks[side]
        street.ribbon(mesh, side * (WALL + 0.45), side * 26.0, 0.11, pavement, (3.0, 3.0),
                      keep=lambda i, r=ranges: not in_ranges(i, r))
        street.ribbon(mesh, side * (WALL + 0.45), side * 20.5, 0.11, pavement, (3.0, 3.0),
                      keep=lambda i, r=ranges: in_ranges(i, r))
        street.ribbon(mesh, side * 20.5, side * 78.0, 0.09, grass, (5.0, 5.0),
                      keep=lambda i, r=ranges: in_ranges(i, r))

    # ---- ground everywhere else -----------------------------------------
    xs = [p[0] for p in points]
    zs = [p[1] for p in points]
    cell = 20.0
    x0, x1 = min(xs) - 240, max(xs) + 240
    z0, z1 = min(zs) - 240, max(zs) + 240
    for ix in range(int((x1 - x0) / cell)):
        for iz in range(int((z1 - z0) / cell)):
            ax, az = x0 + ix * cell, z0 + iz * cell
            corners = [(ax, az), (ax + cell, az), (ax + cell, az + cell), (ax, az + cell)]
            mesh.quad([(x, z, ground_height(x, z) - 0.04) for x, z in corners],
                      [(x / 6.0, z / 6.0) for x, z in corners], block, (0, 0, 1))

    # ---- start line and gantry -------------------------------------------
    for cell_index in range(16):
        a = -HALF + WIDTH * cell_index / 16
        b = -HALF + WIDTH * (cell_index + 1) / 16
        quad = [street.at(0, a, 0.07), street.at(0, b, 0.07), street.at(1, b, 0.07), street.at(1, a, 0.07)]
        mesh.quad(quad, [(0, 0), (1, 0), (1, 1), (0, 1)], checker_light if cell_index % 2 else checker_dark, (0, 0, 1))
    origin = points[0]
    for side in (1, -1):
        post = street.at(0, side * (HALF + 1.2))
        mesh.box((post[0], post[1]), street.tangent[0], 0.25, 0.25, origin[2], origin[2] + 6.4, gate, gate)
    mesh.box((origin[0], origin[1]), street.left[0], HALF + 1.6, 0.3, origin[2] + 5.9, origin[2] + 6.9, gate, gate)

    # ---- street lamps -----------------------------------------------------
    lamps = []
    spacing = max(1, round(38.0 / SAMPLE_STEP))
    for index in range(spacing // 2, count, spacing):
        for side in (1, -1):
            if (index // spacing + (side > 0)) % 2:
                continue        # alternate sides down the street
            foot = street.at(index, side * (WALL + 1.3))
            head = street.at(index, side * (WALL - 2.2))
            base = foot[2] + 0.11
            lx, lz = street.left[index]
            mesh.box((foot[0], foot[1]), street.tangent[index], 0.11, 0.11, base, base + 8.2, pole, pole)
            arm = ((foot[0] + head[0]) / 2, (foot[1] + head[1]) / 2)
            mesh.box(arm, (lx, lz), 1.85, 0.07, base + 8.05, base + 8.2, pole, pole)
            mesh.box((head[0], head[1]), (lx, lz), 0.55, 0.22, base + 7.86, base + 8.02, glow, pole)
            spot = street.at(index, side * (WALL - 5.5))
            size = 11.0
            quad = [(spot[0] + sx * size, spot[1] + sz * size, ground_height(spot[0] + sx * size, spot[1] + sz * size) + 0.13)
                    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            mesh.quad(quad, [(0, 0), (1, 0), (1, 1), (0, 1)], pool, (0, 0, 1))
            lamps.append([round(head[0], 2), round(base + 7.9, 2), round(head[1], 2)])

    # ---- buildings ---------------------------------------------------------
    placed = []

    def try_building(centre, tangent, width, depth, height, facade):
        half_w, half_d = width / 2, depth / 2
        nx, nz = tangent[1], -tangent[0]
        probes = [(centre[0] + tangent[0] * sx * half_w + nx * sz * half_d,
                   centre[1] + tangent[1] * sx * half_w + nz * sz * half_d)
                  for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1), (0, 0), (0, -1), (0, 1), (-1, 0), (1, 0))]
        if any(route.clearance(x, z) < 25.5 for x, z in probes):
            return False
        reach = math.hypot(half_w, half_d)
        for other_centre, other_reach in placed:
            if math.hypot(centre[0] - other_centre[0], centre[1] - other_centre[1]) < (reach + other_reach) * 0.74:
                return False
        base = min(ground_height(x, z) for x, z in probes) - 0.3
        mesh.box(centre, tangent, half_w, half_d, base, base + height, facades[facade], roof, FACADE_TILE)
        # A stepped-back top storey or plant room breaks up the flat roofline.
        if height > 30 and rng.random() < 0.7:
            mesh.box(centre, tangent, half_w * 0.62, half_d * 0.62, base + height, base + height + rng.uniform(4, 11),
                     facades[facade], roof, FACADE_TILE)
        placed.append((centre, reach))
        return True

    bands = spec.get("floors", [(0.5, 4, 8), (0.35, 9, 16), (0.15, 18, 30)])
    wall_types = spec.get("facades", FACADES)
    lot_range = spec.get("lot", (20, 36))

    def lot_height():
        roll = rng.random()
        for share, lowest, highest in bands:
            if roll < share:
                return rng.randint(lowest, highest) * 3.3
            roll -= share
        return bands[-1][2] * 3.3

    for side in (1, -1):
        for row, setback in enumerate((26.0, 60.0)):
            index = rng.randint(0, 6)
            while index < count:
                width = rng.uniform(*lot_range)
                depth = rng.uniform(18, 28)
                span = max(2, round(width / SAMPLE_STEP))
                middle = index + span // 2
                if not in_ranges(middle % count, parks[side]) or row:
                    if not (row and in_ranges(middle % count, [(a - 8, b + 8) for a, b in parks[side]]) and setback < 80):
                        centre = street.at(middle, side * (setback + depth / 2))
                        try_building((centre[0], centre[1]), street.tangent[middle % count], width, depth,
                                     lot_height() * (1.25 if row else 1.0), rng.choice(wall_types))
                index += span + rng.randint(1, 3)

    # A far ring of towers gives the skyline depth beyond the blocks you race through.
    cx, cz = sum(xs) / len(xs), sum(zs) / len(zs)
    towers = spec.get("towers", 46)
    span = max(max(xs) - min(xs), max(zs) - min(zs)) / 2
    for step in range(towers):
        angle = math.tau * step / towers + rng.uniform(-0.05, 0.05)
        distance = span + rng.uniform(150, 290)
        centre = (cx + math.cos(angle) * distance, cz + math.sin(angle) * distance)
        if route.clearance(*centre) < 150:
            continue
        base = ground_height(*centre) - 0.5
        mesh.box(centre, (math.cos(angle * 3), math.sin(angle * 3)), rng.uniform(14, 26), rng.uniform(14, 24),
                 base, base + rng.uniform(55, 150), facades[rng.choice(("Glass", "Concrete", "Glass"))], roof, FACADE_TILE)

    # ---- trees: positions only; the game instances the scanned tree model ----
    trees = []

    def plant(x, z, scale):
        trees.append({"position": [round(x, 2), round(ground_height(x, z) + 0.05, 2), round(z, 2)],
                      "scale": round(scale, 2), "yaw": round(rng.uniform(0, math.tau), 3)})

    tree_metres = spec.get("tree_gap", 21.0)
    tree_gap = max(1, round(tree_metres / SAMPLE_STEP)) if tree_metres else count
    for index in range(4, count if tree_metres else 0, tree_gap):
        for side in (1, -1):
            if in_ranges(index, parks[side]):
                continue
            x, z, _ = street.at(index + rng.randint(-1, 1), side * rng.uniform(19.4, 21.0))
            plant(x, z, rng.uniform(2.0, 2.7))
    for side, ranges in parks.items():
        for first, last in ranges:
            for index in range(first, last, 3):
                for _ in range(2):
                    x, z, _ = street.at(index, side * rng.uniform(22.5, 72.0))
                    if route.clearance(x, z) > 21.5 and all(math.hypot(x - t["position"][0], z - t["position"][2]) > 6.5 for t in trees):
                        plant(x, z, rng.uniform(1.9, 3.3))

    city = mesh.build(f"{track_id} - City")

    # ---- pickups and hazards (shared planner and visuals) -----------------
    layout.HAZARD_STYLES[track_id] = ["barrier", "crate", "barrier"]
    plan = layout.plan_layout(track_id, route, WIDTH, [])
    for problem in layout.verify_layout(track_id, route, WIDTH, plan):
        print(f"WARNING [{track_id}] {problem}")
    builder.add_track_hazards(plan["hazards"], track_id, bpy.context.scene.collection)
    builder.add_coin_template(track_id, bpy.context.scene.collection)

    def three_position(item):
        return [round(item["x"], 3), round(item["y"], 3), round(item["z"], 3)]

    start_x, start_z, start_y, dx, dz = route.at(0.0)
    metadata = {
        "version": 2,
        "id": track_id,
        "theme": "city",
        "width": WIDTH,
        "length": round(route.length, 2),
        "gravity": layout.GAME_GRAVITY,
        "guardrailOffset": layout.GUARDRAIL_OFFSET,
        "forwardAxis": "+Z",
        "coordinateSystem": "Three.js Y-up, +Z forward; route lateral + is left",
        "terrain": "City street grid with gentle gradients",
        "route": [[round(x, 3), round(y, 3), round(z, 3)] for x, z, y in points],
        "start": {"position": [round(start_x, 3), round(start_y + 0.05, 3), round(start_z, 3)],
                  "tangent": [round(dx, 5), round(dz, 5)]},
        "ramps": [],
        "hazards": [{"id": h["id"], "style": h["style"], "shape": h["shape"], "half": h["half"],
                     "centre": h["centre"], "position": three_position(h),
                     "yaw": round(math.atan2(h["tx"], h["tz"]), 5), "s": h["s"], "lane": h["lane"]}
                    for h in plan["hazards"]],
        "nitro": [{"position": three_position(n), "s": n["s"], "lane": n["lane"]} for n in plan["nitro"]],
        "coins": [{"position": three_position(c), "s": c["s"], "kind": c["kind"]} for c in plan["coins"]],
        "trees": trees,
        "lamps": lamps,
    }
    (EXPORT_DIR / f"{track_id}.track.json").write_text(json.dumps(metadata) + "\n")
    print(f"{track_id}: {route.length:.0f} m, {len(placed)} buildings, {len(trees)} trees, {len(lamps)} lamps, "
          f"{len(city.data.polygons):,} faces")


def main():
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = [arg for arg in sys.argv[sys.argv.index("--") + 1:]] if "--" in sys.argv else list(CITY_ROUTES)
    for track_id in wanted:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        build_city(track_id, CITY_ROUTES[track_id])
        builder.export_collection(None, EXPORT_DIR / f"{track_id}.glb")


if __name__ == "__main__":
    main()
