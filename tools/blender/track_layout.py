"""Pure-Python race-route planning for the Blender track builder.

This module has no ``bpy`` dependency so it can be exercised outside Blender::

    python3 tools/blender/track_layout.py            # print a planning report

It owns everything that decides *where* things go on a circuit:

* ``relax_route``     - widens corners that are tighter than the road itself, so
                        the asphalt ribbon, kerbs and guardrails never fold over.
* ``Route``           - arc-length lookups, curvature, projection and a global
                        clearance query used to keep scenery off every stretch of
                        road (not just the stretch it was generated beside).
* ``plan_layout``     - jump ramps on genuine straights, solid hazards, nitro
                        cells and coin lines that never overlap each other.

All coordinates are game space ``(x, z, y)`` with ``y`` up. Lateral offsets are
positive to the *left* of the direction of travel, matching ``left = (tz, -tx)``.
"""

from __future__ import annotations

import json
import math
import sys
from bisect import bisect_right
from pathlib import Path

GAME_GRAVITY = 13.0
MIN_ROUTE_RADIUS = 21.0
GUARDRAIL_OFFSET = 3.0          # guardrail face sits this far beyond the road edge
SCENERY_MARGIN = 13.0           # trunk/boulder bases stay this far beyond the road edge

RAMP_LENGTH = 24.0
RAMP_RISE = 2.1
RAMP_EXPONENT = 1.5
RAMP_HALF_WIDTH_RATIO = 0.34
RAMP_AIR_REFERENCE_SPEED = 50.0
RAMP_APPROACH = 22.0            # straight run-up before the ramp
RAMP_LANDING = 85.0             # straight landing zone after the lip
RAMP_STRAIGHT_RADIUS = 175.0    # the whole jump window is at least this straight


# --------------------------------------------------------------------------- #
# Sampling helpers
# --------------------------------------------------------------------------- #

def catmull_rom_points(control, sample_count=480, tension=0.42):
    """Pure-Python twin of ``build_assets.catmull_rom_samples``.

    ``control`` is a list of ``(x, z, y)`` tuples; the result has the same shape.
    """
    result = []
    count = len(control)
    per_segment = sample_count // count
    for segment in range(count):
        p0 = control[(segment - 1) % count]
        p1 = control[segment]
        p2 = control[(segment + 1) % count]
        p3 = control[(segment + 2) % count]
        for step in range(per_segment):
            t = step / per_segment
            t2 = t * t
            t3 = t2 * t
            sample = []
            for axis in range(3):
                tangent1 = (p2[axis] - p0[axis]) * tension
                tangent2 = (p3[axis] - p1[axis]) * tension
                sample.append((2 * t3 - 3 * t2 + 1) * p1[axis]
                              + (t3 - 2 * t2 + t) * tangent1
                              + (-2 * t3 + 3 * t2) * p2[axis]
                              + (t3 - t2) * tangent2)
            result.append(tuple(sample))
    return result


def _menger_radius(a, b, c):
    ab = math.hypot(b[0] - a[0], b[1] - a[1])
    bc = math.hypot(c[0] - b[0], c[1] - b[1])
    ca = math.hypot(a[0] - c[0], a[1] - c[1])
    cross = abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
    if cross < 1e-9:
        return 1e9
    return ab * bc * ca / (2.0 * cross)


def sample_radii(points, stencil=3):
    """Local turn radius at each closed-loop sample (XZ plane)."""
    count = len(points)
    return [_menger_radius(points[(i - stencil) % count], points[i], points[(i + stencil) % count])
            for i in range(count)]


def relax_route(points, min_radius=MIN_ROUTE_RADIUS, stencil=3, max_iterations=2500, required=None):
    """Widen corners tighter than the required radius with a localized Laplacian pass.

    ``required`` optionally gives a per-sample minimum radius (for example a long
    straight for a jump window). Corrections diffuse outward, so transitions stay
    smooth. Elevation is untouched and samples outside affected corners do not move.
    """
    pts = [list(p) for p in points]
    count = len(pts)
    need = list(required) if required is not None else [min_radius] * count
    reach = 9
    window = 4
    for _ in range(max_iterations):
        flat = [(p[0], p[1]) for p in pts]
        radii = sample_radii(flat, stencil)
        wide = sample_radii(flat, stencil * 2)
        weight = [0.0] * count
        violated = False
        for index, radius in enumerate(radii):
            if radius < need[index] or wide[index] < need[index]:
                violated = True
                for offset in range(-reach, reach + 1):
                    falloff = 1.0 - abs(offset) / (reach + 1.0)
                    slot = (index + offset) % count
                    weight[slot] = max(weight[slot], falloff)
        if not violated:
            break
        updated = [p[:] for p in pts]
        for index in range(count):
            if weight[index] <= 0.0:
                continue
            ax = sum(pts[(index - k) % count][0] + pts[(index + k) % count][0] for k in range(1, window + 1))
            az = sum(pts[(index - k) % count][1] + pts[(index + k) % count][1] for k in range(1, window + 1))
            target_x = (ax + pts[index][0]) / (2 * window + 1)
            target_z = (az + pts[index][1]) / (2 * window + 1)
            blend = 0.35 * weight[index]
            updated[index][0] += (target_x - pts[index][0]) * blend
            updated[index][1] += (target_z - pts[index][1]) * blend
        pts = updated
    return [tuple(p) for p in pts]


def straighten_window(points, start_index, end_index, strength):
    """Blend a stretch of the loop toward its chord (XZ) and a straight grade (Y).

    ``strength`` 0..1 is the peak pull; the blend eases in and out so the road
    stays smooth on both sides of the straightened section.
    """
    count = len(points)
    span = (end_index - start_index) % count
    if span < 4:
        return list(points)
    first = points[start_index % count]
    last = points[end_index % count]
    result = [tuple(p) for p in points]
    for step in range(span + 1):
        index = (start_index + step) % count
        u = step / span
        ease = min(1.0, min(u, 1.0 - u) / 0.22)
        weight = strength * ease * ease * (3.0 - 2.0 * ease)
        chord_x = first[0] + (last[0] - first[0]) * u
        chord_z = first[1] + (last[1] - first[1]) * u
        chord_y = first[2] + (last[2] - first[2]) * u
        x, z, y = points[index]
        result[index] = (x + (chord_x - x) * weight, z + (chord_z - z) * weight,
                         y + (chord_y - y) * weight)
    return result


# --------------------------------------------------------------------------- #
# Route
# --------------------------------------------------------------------------- #

class Route:
    """Closed route made of ``(x, z, y)`` samples with arc-length queries."""

    def __init__(self, points):
        self.points = [tuple(p) for p in points]
        count = len(self.points)
        self.count = count
        self.s = [0.0]
        for index in range(count):
            a = self.points[index]
            b = self.points[(index + 1) % count]
            self.s.append(self.s[-1] + math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2))
        self.length = self.s[-1]

    def wrap(self, s):
        return s % self.length

    def _locate(self, s):
        s = self.wrap(s)
        lo, hi = 0, self.count
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if self.s[mid] <= s:
                lo = mid
            else:
                hi = mid
        segment = self.s[lo + 1] - self.s[lo]
        portion = 0.0 if segment <= 1e-9 else (s - self.s[lo]) / segment
        return lo, portion

    def at(self, s):
        """Return ``(x, z, y, tx, tz)`` at traveled distance ``s``."""
        index, portion = self._locate(s)
        a = self.points[index]
        b = self.points[(index + 1) % self.count]
        x = a[0] + (b[0] - a[0]) * portion
        z = a[1] + (b[1] - a[1]) * portion
        y = a[2] + (b[2] - a[2]) * portion
        # Central difference over 3 m keeps the heading smooth across samples.
        before = self._raw(s - 1.5)
        after = self._raw(s + 1.5)
        dx, dz = after[0] - before[0], after[1] - before[1]
        length = max(1e-9, math.hypot(dx, dz))
        return x, z, y, dx / length, dz / length

    def _raw(self, s):
        index, portion = self._locate(s)
        a = self.points[index]
        b = self.points[(index + 1) % self.count]
        return (a[0] + (b[0] - a[0]) * portion, a[1] + (b[1] - a[1]) * portion)

    def lateral(self, s, lane):
        """Point offset ``lane`` metres to the left of the route at ``s``."""
        x, z, y, tx, tz = self.at(s)
        return x + tz * lane, z - tx * lane, y, tx, tz

    def radius(self, s, baseline=14.0):
        return _menger_radius(self._raw(s - baseline), self._raw(s), self._raw(s + baseline))

    def min_radius(self, start, end, step=5.0, baseline=14.0):
        worst = 1e9
        s = start
        while s <= end:
            worst = min(worst, self.radius(s, baseline))
            s += step
        return worst

    def project(self, x, z):
        """Closest route position to ``(x, z)`` as ``(s, lane, distance)``."""
        best = (1e18, 0.0, 0.0)
        for index in range(self.count):
            a = self.points[index]
            b = self.points[(index + 1) % self.count]
            abx, abz = b[0] - a[0], b[1] - a[1]
            length2 = abx * abx + abz * abz
            if length2 < 1e-12:
                continue
            t = max(0.0, min(1.0, ((x - a[0]) * abx + (z - a[1]) * abz) / length2))
            px, pz = a[0] + abx * t, a[1] + abz * t
            d2 = (x - px) ** 2 + (z - pz) ** 2
            if d2 < best[0]:
                seg_len = math.sqrt(length2)
                tx, tz = abx / seg_len, abz / seg_len
                lane = (x - px) * tz + (z - pz) * -tx
                best = (d2, self.s[index] + (self.s[index + 1] - self.s[index]) * t, lane)
        return best[1], best[2], math.sqrt(best[0])

    def clearance(self, x, z):
        """Distance from ``(x, z)`` to the nearest piece of road *anywhere* on the loop."""
        return self.project(x, z)[2]


def circular_gap(a, b, length):
    gap = abs(a - b) % length
    return min(gap, length - gap)


# --------------------------------------------------------------------------- #
# Layout planning
# --------------------------------------------------------------------------- #

HAZARD_SPECS = {
    # style: (shape, half extents (lateral, up, along), centre height above the road)
    "rock": ("ellipsoid", (1.9, 1.3, 1.55), 0.72),
    "debris": ("ellipsoid", (1.9, 1.3, 1.55), 0.72),
    "log": ("capsule", (1.8, 0.43, 0.43), 0.42),
    "vines": ("capsule", (1.8, 0.43, 0.43), 0.42),
    "barrier": ("box", (1.55, 0.575, 0.525), 0.575),
    "crate": ("box", (1.55, 0.575, 0.525), 0.575),
    "barrel": ("cylinder", (1.05, 1.35, 1.05), 0.72),
    "ice": ("ellipsoid", (2.1, 0.78, 1.55), 0.46),
    "basalt": ("cylinder", (0.95, 0.95, 0.95), 1.02),
    "coral": ("box", (1.3, 0.8, 0.65), 0.80),
}

HAZARD_STYLES = {
    "rovers_rift": ["rock", "debris", "rock"],
    "canyon_springs": ["rock", "barrier", "debris"],
    "jungle_falls": ["log", "log", "vines"],
    "sunset_shores": ["barrier", "crate", "debris"],
    "frost_harbor": ["ice", "ice", "ice"],
    "rivet_factory": ["barrel", "crate", "barrel"],
    "coral_bay": ["coral", "barrier", "coral"],
    "ember_crater": ["basalt", "debris", "basalt"],
}

RAMP_COUNT = {"rovers_rift": 2}

# (minimum radius, half window in metres) tried in order until a slot is found.
STRAIGHTNESS_TIERS = ((95.0, 35.0), (65.0, 28.0), (48.0, 22.0), (34.0, 16.0), (26.0, 12.0))


def ramp_height(u, rise=RAMP_RISE, exponent=RAMP_EXPONENT):
    """Height above the road for ramp parameter ``u`` in [0, 1] (steepest at the lip)."""
    return rise * (max(0.0, min(1.0, u)) ** exponent)


def ramp_lip_slope(length=RAMP_LENGTH, rise=RAMP_RISE, exponent=RAMP_EXPONENT):
    return rise * exponent / length


def _index_at(route, s):
    return min(route.count - 1, max(0, bisect_right(route.s, route.wrap(s)) - 1))


def prepare_route(track_id, raw_points, width):
    """Relax tight corners, then carve one straight jump window per ramp.

    Returns ``(points, anchors)``; each anchor is the sample index at which a
    ramp starts (sample indices stay valid when later geometry shifts ``s``).
    """
    points = relax_route(raw_points)
    count = RAMP_COUNT.get(track_id, 1)
    anchors = []
    window = RAMP_APPROACH + RAMP_LENGTH + RAMP_LANDING
    for _ in range(count):
        route = Route(points)
        length = route.length
        best = None
        s = 120.0
        while s <= length - (RAMP_LANDING + 60.0):
            taken = any(circular_gap(s, route.s[a], length) < 300.0 for a in anchors)
            if not taken:
                radius = route.min_radius(s - RAMP_APPROACH, s - RAMP_APPROACH + window, step=8.0)
                if best is None or radius > best[0]:
                    best = (radius, s)
            s += 5.0
        if best is None:
            break
        s0 = best[1]
        anchor = _index_at(route, s0)
        first = _index_at(route, s0 - RAMP_APPROACH)
        last = _index_at(route, s0 - RAMP_APPROACH + window)
        span = (last - first) % route.count
        required = [MIN_ROUTE_RADIUS] * route.count
        for step in range(-12, span + 13):
            index = (first + step) % route.count
            if 0 <= step <= span:
                required[index] = RAMP_STRAIGHT_RADIUS
            else:
                required[index] = MIN_ROUTE_RADIUS + (RAMP_STRAIGHT_RADIUS - MIN_ROUTE_RADIUS) * 0.35
        points = relax_route(points, required=required)
        anchors.append(anchor)
    return points, sorted(anchors)


def _clear_of(s, lane, others, ds, dlane, length):
    return all(circular_gap(s, other["s"], length) >= ds or abs(lane - other["lane"]) >= dlane
               for other in others)


def _in_ramp_zone(s, ramps, length, before=70.0, after=RAMP_LANDING + 80.0):
    for ramp in ramps:
        offset = ((s - ramp["s0"] + length / 2.0) % length) - length / 2.0
        if -before <= offset <= (ramp["s1"] - ramp["s0"]) + after:
            return True
    return False


def _in_start_zone(s, length, ahead=75.0, behind=55.0):
    return s < ahead or s > length - behind


def _slots(route, count, offset, ok, *, tiers=STRAIGHTNESS_TIERS, min_gap=70.0, placed_s=None):
    """Find up to ``count`` evenly spread, valid positions along the route.

    ``ok(s, tier_index)`` supplies extra constraints; straightness is checked here.
    """
    length = route.length
    placed = list(placed_s or [])
    found = []
    for k in range(count):
        target = length * (k + offset) / count
        chosen = None
        for tier_index, (radius, half_window) in enumerate(tiers):
            for delta in range(0, int(length / (2 * count)), 5):
                for sign in ((1, -1) if delta else (1,)):
                    s = (target + sign * delta) % length
                    if any(circular_gap(s, other, length) < min_gap for other in placed):
                        continue
                    if route.min_radius(s - half_window, s + half_window, step=7.0) < radius:
                        continue
                    if not ok(s, tier_index):
                        continue
                    chosen = s
                    break
                if chosen is not None:
                    break
            if chosen is not None:
                break
        if chosen is not None:
            placed.append(chosen)
            found.append(chosen)
    return found


def plan_ramps(route, anchors, width):
    ramps = []
    for anchor in anchors:
        s0 = route.s[anchor]
        window = RAMP_APPROACH + RAMP_LENGTH + RAMP_LANDING
        radius = route.min_radius(s0 - 8.0, s0 + RAMP_LENGTH + 70.0, step=6.0)
        ramps.append({"s0": round(s0, 2), "s1": round(s0 + RAMP_LENGTH, 2),
                      "half_width": round(width * RAMP_HALF_WIDTH_RATIO, 2),
                      "rise": RAMP_RISE, "exponent": RAMP_EXPONENT,
                      "straight_radius": round(min(radius, 9999.0), 1)})
    return ramps


def plan_hazards(track_id, route, width, ramps, count=5):
    length = route.length
    styles = HAZARD_STYLES.get(track_id, ["rock", "barrier", "crate"])
    lanes = [-6.2, 5.6, -4.6, 6.2, -5.4]

    def ok(s, tier):
        return not _in_start_zone(s, length) and not _in_ramp_zone(s, ramps, length)

    placed = []
    for k, s in enumerate(_slots(route, count, 0.5, ok, min_gap=70.0)):
        style = styles[k % len(styles)]
        lane = lanes[k % len(lanes)] * (width / 26.0)
        x, z, y, tx, tz = route.lateral(s, lane)
        shape, half, centre = HAZARD_SPECS[style]
        placed.append({"id": f"{track_id}_hazard_{k + 1}", "style": style, "s": round(s, 2),
                       "lane": round(lane, 2), "x": x, "z": z, "y": y + 0.05, "tx": tx, "tz": tz,
                       "shape": shape, "half": list(half), "centre": centre})
    return placed


def plan_nitro(route, width, ramps, hazards, count=5):
    length = route.length
    lanes = [0.0, -4.8, 4.8, 0.0, -4.8, 4.8]
    placed = []
    # One cell sits on the approach to the first ramp: speed there pays off.
    if ramps:
        s = (ramps[0]["s0"] - 20.0) % length
        x, z, y, tx, tz = route.lateral(s, 0.0)
        placed.append({"s": round(s, 2), "lane": 0.0, "x": x, "z": z, "y": y + 0.05})

    def ok(s, tier):
        lane = lanes[(len(placed) + tier) % len(lanes)] * (width / 26.0)
        return (not _in_start_zone(s, length, 90.0, 60.0)
                and not _in_ramp_zone(s, ramps, length, 30.0, RAMP_LANDING + 80.0)
                and _clear_of(s, lane, hazards, 34.0, 12.0, length))

    taken = [n["s"] for n in placed]
    for s in _slots(route, count, 0.15, ok, min_gap=85.0, placed_s=taken):
        lane = lanes[len(placed) % len(lanes)] * (width / 26.0)
        if not _clear_of(s, lane, hazards, 34.0, 12.0, length):
            lane = 0.0
        x, z, y, tx, tz = route.lateral(s, lane)
        placed.append({"s": round(s, 2), "lane": round(lane, 2), "x": x, "z": z, "y": y + 0.05})
    return placed


def plan_coins(route, width, ramps, hazards, nitro, count=5, per_line=6, spacing=6.5):
    length = route.length
    lanes = [0.0, 4.6, -4.6, 0.0, 4.6, -4.6]
    keep_out = hazards + nitro
    line_span = spacing * (per_line - 1)
    coins = []
    tiers = ((55.0, 6.0), (40.0, 6.0), (30.0, 6.0), (22.0, 4.0))
    state = {"k": 0}

    def ok(s, tier):
        lane = lanes[state["k"] % len(lanes)] * (width / 26.0)
        if _in_start_zone(s, length, 80.0, 60.0 + line_span) or _in_ramp_zone(s, ramps, length, 20.0 + line_span, RAMP_LANDING + 15.0):
            return False
        if route.min_radius(s, s + line_span, step=6.0) < 22.0:
            return False
        return all(_clear_of(s + i * spacing, lane, keep_out, 20.0, 7.0, length) for i in range(per_line))

    placed = []
    for k in range(count):
        state["k"] = k
        found = _slots_one(route, k, count, 0.55, ok, tiers, 70.0, placed)
        if found is None:
            continue
        placed.append(found)
        lane = lanes[k % len(lanes)] * (width / 26.0)
        for i in range(per_line):
            x, z, y, _, _ = route.lateral(found + i * spacing, lane)
            coins.append({"s": round(found + i * spacing, 2), "lane": round(lane, 2),
                          "x": x, "z": z, "y": y + 1.35, "kind": "line"})
    # Coins follow each jump's flight path: the reward for actually launching.
    for ramp in ramps:
        speed = RAMP_AIR_REFERENCE_SPEED
        slope = ramp_lip_slope(ramp["s1"] - ramp["s0"], ramp["rise"], ramp["exponent"])
        vy = speed * slope
        for along in (10.0, 22.0, 34.0, 46.0):
            t = along / speed
            height = ramp["rise"] + vy * t - 0.5 * GAME_GRAVITY * t * t
            x, z, y, _, _ = route.lateral(ramp["s1"] + along, 0.0)
            coins.append({"s": round(ramp["s1"] + along, 2), "lane": 0.0, "x": x, "z": z,
                          "y": y + 0.05 + max(1.35, height + 1.0), "kind": "air"})
    return coins


def _slots_one(route, k, count, offset, ok, tiers, min_gap, placed):
    length = route.length
    target = length * (k + offset) / count
    for radius, half_window in tiers:
        for delta in range(0, int(length / (2 * count)), 5):
            for sign in ((1, -1) if delta else (1,)):
                s = (target + sign * delta) % length
                if any(circular_gap(s, other, length) < min_gap for other in placed):
                    continue
                if route.min_radius(s - half_window, s + half_window, step=7.0) < radius:
                    continue
                if ok(s, 0):
                    return s
    return None


def plan_layout(track_id, route, width, anchors):
    ramps = plan_ramps(route, anchors, width)
    hazards = plan_hazards(track_id, route, width, ramps)
    nitro = plan_nitro(route, width, ramps, hazards)
    coins = plan_coins(route, width, ramps, hazards, nitro)
    return {"ramps": ramps, "hazards": hazards, "nitro": nitro, "coins": coins}


# --------------------------------------------------------------------------- #
# Verification (used by the standalone report and by the Blender build)
# --------------------------------------------------------------------------- #

def verify_layout(track_id, route, width, layout):
    """Return a list of human-readable problems (empty when the layout is sound)."""
    problems = []
    length = route.length
    half = width / 2.0
    worst = min(route.radius(i * length / 400.0) for i in range(400))
    if worst < half + 1.4 + 3.0:
        problems.append(f"route radius {worst:.1f} m is tighter than the road edge ({half + 1.4:.1f} m)")
    items = ([("hazard", h) for h in layout["hazards"]] + [("nitro", n) for n in layout["nitro"]]
             + [("coin", c) for c in layout["coins"]])
    for kind, item in items:
        _, lane, distance = route.project(item["x"], item["z"])
        if abs(lane) > half - 1.0:
            problems.append(f"{kind} at s={item['s']} lies off the asphalt (lane {lane:.1f})")
    for nitro in layout["nitro"]:
        for hazard in layout["hazards"]:
            gap = math.hypot(nitro["x"] - hazard["x"], nitro["z"] - hazard["z"])
            if gap < 12.0:
                problems.append(f"nitro s={nitro['s']} is only {gap:.1f} m from hazard {hazard['id']}")
        for coin in layout["coins"]:
            if coin["kind"] == "line" and math.hypot(nitro["x"] - coin["x"], nitro["z"] - coin["z"]) < 6.0:
                problems.append(f"nitro s={nitro['s']} overlaps a coin")
    for hazard in layout["hazards"]:
        for coin in layout["coins"]:
            if coin["kind"] == "line" and math.hypot(hazard["x"] - coin["x"], hazard["z"] - coin["z"]) < 9.0:
                problems.append(f"coin overlaps hazard {hazard['id']}")
    for ramp in layout["ramps"]:
        if ramp["straight_radius"] < 85.0:
            problems.append(f"ramp at s={ramp['s0']} has only a {ramp['straight_radius']} m radius around it")
        for hazard in layout["hazards"]:
            if abs(((hazard["s"] - ramp["s0"] + length / 2) % length) - length / 2) < 60.0:
                problems.append(f"hazard {hazard['id']} sits next to the ramp at s={ramp['s0']}")
    return problems


def build_plan(track_id, control, tension, width):
    """Full pipeline used by both the report and the Blender build."""
    raw = catmull_rom_points(control, 480, tension)
    points, anchors = prepare_route(track_id, raw, width)
    route = Route(points)
    layout = plan_layout(track_id, route, width, anchors)
    return raw, points, route, layout


def _controls():
    """Control polygons exactly as the Blender builder derives them."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import track_shapes
    result = {}
    for track_id, _theme, length, difficulty in track_shapes.TRACK_CATALOG:
        control = track_shapes.build_track_centerline(track_id, length, difficulty)
        width = 26.0 if length in {"short", "medium"} else 24.0
        result[track_id] = (control, 0.42, width)
    return result


def _write_png(path, width, height, pixels):
    import struct
    import zlib
    raw = b"".join(b"\x00" + bytes(pixels[y * width * 3:(y + 1) * width * 3]) for y in range(height))

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))
    Path(path).write_bytes(png)


def plot_layouts(results, path, cell=520):
    """Draw every route (colored by corner radius) with its ramps, hazards, nitro and coins."""
    cols = 4
    rows = (len(results) + cols - 1) // cols
    width, height = cell * cols, cell * rows
    pixels = bytearray([14, 18, 24] * (width * height))

    def dot(px, py, radius, color):
        r2 = radius * radius
        for yy in range(int(py - radius), int(py + radius) + 1):
            if 0 <= yy < height:
                for xx in range(int(px - radius), int(px + radius) + 1):
                    if 0 <= xx < width and (xx - px) ** 2 + (yy - py) ** 2 <= r2:
                        offset = (yy * width + xx) * 3
                        pixels[offset:offset + 3] = bytes(color)

    for number, (name, route, layout, half_width) in enumerate(results):
        ox, oy = (number % cols) * cell, (number // cols) * cell
        xs = [p[0] for p in route.points]
        zs = [p[1] for p in route.points]
        scale = (cell - 60) / max(max(xs) - min(xs), max(zs) - min(zs))
        cx, cz = (max(xs) + min(xs)) / 2, (max(zs) + min(zs)) / 2

        def to_px(x, z):
            return ox + cell / 2 + (x - cx) * scale, oy + cell / 2 + (z - cz) * scale

        steps = int(route.length / 1.5)
        for i in range(steps):
            s = i * route.length / steps
            x, z, _y, _tx, _tz = route.at(s)
            dot(*to_px(x, z), max(1.5, half_width * scale * 0.55), (38, 46, 56))
        for i in range(steps):
            s = i * route.length / steps
            x, z, _y, _tx, _tz = route.at(s)
            radius = route.radius(s, 14.0)
            color = (232, 72, 60) if radius < 35 else (240, 190, 70) if radius < 80 else (110, 190, 120)
            dot(*to_px(x, z), 1.6, color)
        for ramp in layout["ramps"]:
            for s in range(int(ramp["s0"]), int(ramp["s1"]) + 1, 2):
                x, z, _y, _tx, _tz = route.at(s)
                px, py = to_px(x, z)
                dot(px, py, 4.5, (255, 255, 255))
        for hazard in layout["hazards"]:
            dot(*to_px(hazard["x"], hazard["z"]), 5, (255, 60, 220))
        for nitro in layout["nitro"]:
            dot(*to_px(nitro["x"], nitro["z"]), 5, (60, 200, 255))
        for coin in layout["coins"]:
            dot(*to_px(coin["x"], coin["z"]), 2.2, (255, 220, 40))
        x0, z0, _y, _tx, _tz = route.at(0.0)
        dot(*to_px(x0, z0), 6, (255, 255, 255))
    _write_png(path, width, height, pixels)


def _report(plot_path=None):
    exit_code = 0
    results = []
    for name, (control, tension, width) in _controls().items():
        raw, points, route, layout = build_plan(name, control, tension, width)
        problems = verify_layout(name, route, width, layout)
        before = min(sample_radii([(p[0], p[1]) for p in raw]))
        after = min(sample_radii([(p[0], p[1]) for p in points]))
        # Closest approach of non-adjacent road: walls must never overlap.
        closest = min(route.project(p[0], p[1])[2] for p in points[::40]) if False else None
        print(f"{name:15s} L={route.length:6.0f} m  min radius {before:5.1f} -> {after:5.1f} m  "
              f"ramps={[(r['s0'], r['straight_radius']) for r in layout['ramps']]}  "
              f"hazards={len(layout['hazards'])} nitro={len(layout['nitro'])} "
              f"coins={len(layout['coins'])}")
        for problem in problems:
            print("     PROBLEM:", problem)
            exit_code = 1
        results.append((name, route, layout, width / 2))
    if plot_path:
        plot_layouts(results, plot_path)
        print("wrote", plot_path)
    return exit_code


if __name__ == "__main__":
    sys.exit(_report(sys.argv[sys.argv.index("--plot") + 1] if "--plot" in sys.argv else None))
