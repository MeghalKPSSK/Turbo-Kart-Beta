"""Hand-authored circuit shapes for Turbo Road League (pure Python, no ``bpy``).

``build_assets.py`` (inside Blender) and ``track_layout.py`` (outside Blender)
both import this module so the planner reports exactly what the builder makes.
"""

from __future__ import annotations

import math
import random

TRACK_CENTERLINE = [
    [0, 120], [52, 118], [96, 101], [128, 69], [145, 28], [140, -14],
    [120, -53], [84, -81], [40, -94], [-8, -88], [-53, -101], [-98, -82],
    [-130, -46], [-143, 1], [-126, 50], [-91, 89], [-43, 113]
]

TRACK_CATALOG = [
    ("rovers_rift", "mountain_adventure", "long", 4),
    ("canyon_springs", "canyon", "medium", 2),
    ("jungle_falls", "jungle", "short", 1),
    ("sunset_shores", "coastal_sunset", "short", 1),
    ("frost_harbor", "ice", "medium", 2),
    ("rivet_factory", "industrial", "medium", 2),
    ("coral_bay", "island", "short", 1),
    ("ember_crater", "volcano", "long", 4),
]

# Hand-authored closed centerlines. Each course has its own corner sequence and
# proportions instead of reusing the same oval and only rotating/scaling it.
TRACK_ROUTE_SHAPES = {
    "rovers_rift": [
        (-142, -86), (-146, -28), (-125, 22), (-132, 72), (-97, 116),
        (-49, 145), (3, 133), (42, 98), (53, 55), (86, 42), (124, 68),
        (151, 34), (138, -12), (107, -43), (73, -48), (46, -88),
        (12, -126), (-38, -147), (-91, -132), (-128, -105),
    ],
    "canyon_springs": [
        (-180, -72), (-145, -112), (-80, -125), (-10, -119), (55, -130),
        (120, -115), (165, -82), (180, -35), (174, 23), (145, 68),
        (93, 100), (31, 114), (-34, 117), (-99, 106), (-151, 78),
        (-178, 43), (-178, 0), (-180, -36),
    ],
    "jungle_falls": [
        (-116, -122), (-65, -143), (-12, -127), (14, -91), (49, -82),
        (89, -111), (132, -99), (151, -59), (132, -19), (94, -5),
        (73, 27), (89, 67), (62, 105), (17, 127), (-27, 112),
        (-46, 73), (-82, 49), (-121, 58), (-152, 20), (-147, -30),
    ],
    "sunset_shores": [
        (-172, -88), (-130, -101), (-71, -103), (-8, -102), (58, -107),
        (119, -98), (157, -69), (169, -28), (166, 20), (145, 64),
        (108, 94), (57, 105), (-5, 103), (-69, 101), (-122, 82),
        (-155, 47), (-165, 5), (-168, -45), (-173, -65),
    ],
    "frost_harbor": [
        (-150, -55), (-125, -100), (-85, -132), (-35, -150), (20, -145),
        (70, -120), (110, -85), (140, -35), (153, 20), (125, 58),
        (85, 65), (55, 96), (30, 133), (-20, 145), (-68, 120),
        (-102, 82), (-130, 40), (-155, -5), (-162, -40),
    ],
    "rivet_factory": [
        (-151, -101), (-91, -105), (-24, -105), (43, -103), (111, -102),
        (148, -78), (151, -42), (130, -14), (149, 17), (146, 61),
        (111, 91), (55, 97), (-8, 96), (-74, 92), (-128, 80),
        (-153, 49), (-151, 12), (-124, -10), (-140, -38), (-151, -70),
    ],
    "coral_bay": [
        (-172, -20), (-145, -50), (-118, -95), (-76, -125), (-25, -139),
        (30, -140), (82, -125), (124, -96), (150, -58), (155, -20),
        (132, 3), (103, 10), (88, 33), (108, 57), (121, 84),
        (90, 109), (45, 123), (-5, 122), (-52, 105), (-97, 80),
        (-130, 48), (-151, 18),
    ],
    "ember_crater": [
        (-164, -100), (-111, -110), (-51, -118), (14, -120), (76, -112),
        (129, -91), (158, -56), (153, -16), (122, 12), (81, 17),
        (43, 37), (38, 77), (11, 118), (-25, 140), (-62, 124),
        (-75, 87), (-101, 65), (-139, 57), (-161, 23), (-167, -24),
        (-157, -69),
    ],
}
TRACK_ELEVATION_PROFILES = {
    # base, main rise, long-wave count, secondary rise, phase
    "rovers_rift": (17.0, 15.0, 1.1, 3.5, 0.4),
    "canyon_springs": (12.0, 9.0, 1.4, 2.0, 1.2),
    "jungle_falls": (9.0, 5.0, 2.8, 1.4, 0.1),
    "sunset_shores": (7.0, 2.2, 1.2, 0.7, 0.8),
    "frost_harbor": (11.0, 7.0, 2.1, 2.5, 1.8),
    "rivet_factory": (6.0, 2.4, 0.7, 0.5, 0.2),
    "coral_bay": (8.0, 1.8, 1.0, 0.5, 1.0),
    "ember_crater": (11.0, 13.5, 1.0, 4.2, 2.2),
}


def build_track_centerline(track_id, length, difficulty):
    rng = random.Random(track_id)
    length_scale = {"short": 0.80, "medium": 1.0, "long": 1.18, "extra_long": 1.31}[length]
    scale_x = length_scale * rng.uniform(0.96, 1.04)
    scale_z = length_scale * rng.uniform(0.96, 1.04)
    rotation = rng.uniform(-math.pi, math.pi)
    raw = [tuple(point) for point in TRACK_ROUTE_SHAPES.get(track_id, TRACK_CENTERLINE)]
    base_height, rise, wave_count, secondary_rise, phase = TRACK_ELEVATION_PROFILES.get(
        track_id, (14.0, 8.0 + difficulty * 1.65, 1.6, 2.0, 0.0)
    )

    out = []
    count = len(raw)
    for index, (base_x, base_z) in enumerate(raw):
        x = base_x * scale_x
        z = base_z * scale_z
        x, z = (x * math.cos(rotation) - z * math.sin(rotation),
                x * math.sin(rotation) + z * math.cos(rotation))
        progress = index / count
        elevation = base_height + rise * math.sin(progress * math.tau * wave_count + phase)
        elevation += secondary_rise * math.sin(progress * math.tau * (wave_count * 2.15) + phase * 1.7)
        out.append((x, z, elevation))
    return out
