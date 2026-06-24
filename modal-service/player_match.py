"""Lightweight target-player matching helpers for the Modal CV service.

Self-contained (no cross-directory imports) so the Modal image only needs to
mount this folder. Identifies the registered player among many tracked persons
using uniform color, position zone and bounding-box traits. Jersey OCR is
intentionally omitted here to keep tracking fast — the highlight pipeline still
does OCR separately.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import cv2
import numpy as np

COLOR_HINTS = {
    "빨강": ((0, 80, 80), (10, 255, 255)),
    "red": ((0, 80, 80), (10, 255, 255)),
    "파랑": ((100, 80, 80), (130, 255, 255)),
    "blue": ((100, 80, 80), (130, 255, 255)),
    "흰색": ((0, 0, 180), (180, 40, 255)),
    "white": ((0, 0, 180), (180, 40, 255)),
    "검정": ((0, 0, 0), (180, 255, 60)),
    "black": ((0, 0, 0), (180, 255, 60)),
    "노랑": ((20, 80, 80), (35, 255, 255)),
    "yellow": ((20, 80, 80), (35, 255, 255)),
    "초록": ((40, 60, 60), (85, 255, 255)),
    "green": ((40, 60, 60), (85, 255, 255)),
    "주황": ((10, 80, 80), (25, 255, 255)),
    "orange": ((10, 80, 80), (25, 255, 255)),
}

POSITION_MAP = {
    "gk": "goalkeeper", "골키퍼": "goalkeeper", "키퍼": "goalkeeper", "goalkeeper": "goalkeeper",
    "df": "defender", "수비": "defender", "수비수": "defender", "defender": "defender", "cb": "defender",
    "mf": "midfielder", "미드필더": "midfielder", "midfielder": "midfielder", "cm": "midfielder",
    "fw": "forward", "공격수": "forward", "forward": "forward", "st": "forward", "cf": "forward",
    "wing": "winger", "윙어": "winger", "winger": "winger",
}


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(value, hi))


def normalize_position(position: str) -> str:
    value = (position or "").strip().lower()
    return POSITION_MAP.get(value, value)


@dataclass
class PlayerProfile:
    name: str = ""
    position: str = ""
    team_name: str = ""
    jersey_number: str = ""
    uniform_color: str = ""
    traits: str = ""

    @property
    def has_target(self) -> bool:
        return bool(
            self.name.strip()
            or self.jersey_number.strip()
            or self.position.strip()
            or self.uniform_color.strip()
            or self.traits.strip()
        )

    @property
    def traits_text(self) -> str:
        parts = []
        if self.uniform_color.strip():
            parts.append(f"{self.uniform_color.strip()} 유니폼")
        if self.traits.strip():
            parts.append(self.traits.strip())
        return " ".join(parts)


def parse_color_ranges(text: str) -> List[Tuple[Tuple[int, int, int], Tuple[int, int, int]]]:
    text = (text or "").lower()
    return [rng for keyword, rng in COLOR_HINTS.items() if keyword in text]


def color_match_score(crop_bgr: np.ndarray, traits: str) -> float:
    ranges = parse_color_ranges(traits)
    if not ranges or crop_bgr is None or crop_bgr.size == 0:
        return 0.0
    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    best = 0.0
    for lower, upper in ranges:
        mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
        ratio = float(cv2.countNonZero(mask)) / float(mask.size)
        best = max(best, ratio)
    return clamp(best * 2.2, 0.0, 1.0)


def position_zone_score(position: str, norm_x: float, norm_y: float) -> float:
    role = normalize_position(position)
    if role == "goalkeeper":
        edge = max(1.0 - norm_y / 0.38, 1.0 - (1.0 - norm_y) / 0.38, 0.0)
        center = 1.0 - min(abs(norm_x - 0.5) / 0.35, 1.0)
        return clamp(edge * 0.65 + center * 0.35, 0.0, 1.0)
    if role == "defender":
        depth = 1.0 - min(norm_y / 0.45, 1.0)
        return clamp(depth * 0.8 + 0.2, 0.0, 1.0)
    if role == "midfielder":
        return clamp(1.0 - min(abs(norm_y - 0.52) / 0.28, 1.0), 0.0, 1.0)
    if role in ("forward", "winger"):
        attack = min(norm_y / 0.55, 1.0)
        wing = min(abs(norm_x - 0.5) / 0.35, 1.0) * 0.25 if role == "winger" else 0.0
        return clamp(attack * 0.75 + wing, 0.0, 1.0)
    return 0.35


def score_person_for_target(
    frame_bgr: np.ndarray,
    box: List[float],
    profile: PlayerProfile,
    frame_shape: Tuple[int, int],
) -> float:
    """Return a 0..1 match score (color + zone + simple traits)."""
    h, w = frame_shape
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)
    if x2 <= x1 or y2 <= y1:
        return 0.0

    crop = frame_bgr[y1:y2, x1:x2]
    cx, cy = (x1 + x2) / 2.0 / w, (y1 + y2) / 2.0 / h

    zone = position_zone_score(profile.position, cx, cy) if profile.position else 0.25
    kit = color_match_score(crop, profile.traits_text)

    traits_bonus = 0.0
    t = profile.traits_text.lower()
    if "왼쪽" in t and cx < 0.45:
        traits_bonus += 0.08
    if "오른쪽" in t and cx > 0.55:
        traits_bonus += 0.08
    if ("키 큰" in t or "키가 큰" in t) and (y2 - y1) / h > 0.22:
        traits_bonus += 0.06

    if profile.position:
        total = zone * 0.45 + kit * 0.4 + traits_bonus + 0.1
    else:
        total = kit * 0.55 + zone * 0.25 + traits_bonus + 0.1
    return clamp(total, 0.0, 1.0)


def pick_best_track(track_scores: Dict[int, List[float]], min_samples: int = 2) -> Tuple[int | None, float]:
    if not track_scores:
        return None, 0.0
    best_track, best_avg = None, 0.0
    for tid, scores in track_scores.items():
        if len(scores) < min_samples:
            continue
        avg = sum(scores) / len(scores)
        if avg > best_avg:
            best_avg, best_track = avg, tid
    if best_track is None:
        for tid, scores in track_scores.items():
            avg = sum(scores) / max(len(scores), 1)
            if avg > best_avg:
                best_avg, best_track = avg, tid
    return best_track, round(best_avg, 3)
