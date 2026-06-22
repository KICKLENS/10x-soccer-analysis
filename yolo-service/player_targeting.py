from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

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


def box_iou(a: List[float], b: List[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter = max(0.0, inter_x2 - inter_x1) * max(0.0, inter_y2 - inter_y1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    if union <= 0:
        return 0.0
    return inter / union


class SimplePersonTracker:
    """ByteTrack 대신 predict 결과에 가벼운 IoU 추적을 붙입니다."""

    def __init__(self, iou_threshold: float = 0.22, max_missing: int = 3) -> None:
        self.iou_threshold = iou_threshold
        self.max_missing = max_missing
        self.tracks: Dict[int, Dict[str, Any]] = {}
        self.next_id = 1

    def assign_track_ids(self, person_entries: List[Dict[str, Any]]) -> None:
        if not person_entries:
            for track in self.tracks.values():
                track["miss"] += 1
            self._drop_stale_tracks()
            return

        unmatched_tracks = set(self.tracks.keys())
        for entry in person_entries:
            box = entry["box"]
            best_track_id = None
            best_iou = 0.0

            for track_id in list(unmatched_tracks):
                iou = box_iou(box, self.tracks[track_id]["box"])
                if iou >= self.iou_threshold and iou > best_iou:
                    best_iou = iou
                    best_track_id = track_id

            if best_track_id is None:
                best_track_id = self.next_id
                self.next_id += 1
                self.tracks[best_track_id] = {"box": box, "miss": 0}
            else:
                unmatched_tracks.remove(best_track_id)
                self.tracks[best_track_id]["box"] = box
                self.tracks[best_track_id]["miss"] = 0

            entry["trackId"] = best_track_id

        for track_id in unmatched_tracks:
            self.tracks[track_id]["miss"] += 1
        self._drop_stale_tracks()

    def _drop_stale_tracks(self) -> None:
        stale = [track_id for track_id, track in self.tracks.items() if track["miss"] > self.max_missing]
        for track_id in stale:
            del self.tracks[track_id]


def build_traits_text(profile: PlayerProfile) -> str:
    parts = []
    if profile.uniform_color.strip():
        parts.append(f"{profile.uniform_color.strip()} 유니폼")
    if profile.traits.strip():
        parts.append(profile.traits.strip())
    return " ".join(parts)


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


def normalize_position(position: str) -> str:
    value = (position or "").strip().lower()
    mapping = {
        "gk": "goalkeeper",
        "골키퍼": "goalkeeper",
        "키퍼": "goalkeeper",
        "goalkeeper": "goalkeeper",
        "df": "defender",
        "수비": "defender",
        "수비수": "defender",
        "defender": "defender",
        "cb": "defender",
        "mf": "midfielder",
        "미드필더": "midfielder",
        "midfielder": "midfielder",
        "cm": "midfielder",
        "fw": "forward",
        "공격수": "forward",
        "forward": "forward",
        "st": "forward",
        "cf": "forward",
        "wing": "winger",
        "윙어": "winger",
        "winger": "winger",
    }
    return mapping.get(value, value)


def parse_color_ranges(traits: str) -> List[Tuple[Tuple[int, int, int], Tuple[int, int, int]]]:
    text = (traits or "").lower()
    ranges: List[Tuple[Tuple[int, int, int], Tuple[int, int, int]]] = []
    for keyword, hsv_range in COLOR_HINTS.items():
        if keyword in text:
            ranges.append(hsv_range)
    return ranges


@lru_cache(maxsize=1)
def get_easyocr_reader():
    import easyocr

    return easyocr.Reader(["en"], gpu=False, verbose=False)


def extract_jersey_number(crop_bgr: np.ndarray) -> Tuple[Optional[str], float]:
    if crop_bgr is None or crop_bgr.size == 0:
        return None, 0.0

    h, w = crop_bgr.shape[:2]
    if h < 20 or w < 20:
        return None, 0.0

    region = crop_bgr[int(h * 0.12) : int(h * 0.62), int(w * 0.15) : int(w * 0.85)]
    if region.size == 0:
        return None, 0.0

    up = cv2.resize(region, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    best_digits = None
    best_conf = 0.0

    try:
        reader = get_easyocr_reader()
        for image in (up, cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)):
            results = reader.readtext(image, allowlist="0123456789", detail=1, paragraph=False)
            for _bbox, text, conf in results:
                digits = re.sub(r"\D", "", str(text))
                if not digits:
                    continue
                score = float(conf)
                if score > best_conf:
                    best_conf = score
                    best_digits = digits
    except Exception:
        return None, 0.0

    if not best_digits:
        return None, 0.0

    return best_digits, min(1.0, best_conf)


def jersey_match_score(detected: Optional[str], target: str) -> float:
    target_digits = re.sub(r"\D", "", target or "")
    if not target_digits:
        return 0.0
    if not detected:
        return 0.0
    if detected == target_digits:
        return 1.0
    if target_digits in detected or detected in target_digits:
        return 0.75
    return 0.0


def color_match_score(crop_bgr: np.ndarray, traits: str) -> float:
    ranges = parse_color_ranges(traits)
    if not ranges or crop_bgr is None or crop_bgr.size == 0:
        return 0.0

    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    total_ratio = 0.0

    for lower, upper in ranges:
        mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
        ratio = float(cv2.countNonZero(mask)) / float(mask.size)
        total_ratio = max(total_ratio, ratio)

    return clamp(total_ratio * 2.2, 0.0, 1.0)


def position_zone_score(position: str, norm_x: float, norm_y: float) -> float:
    role = normalize_position(position)

    if role == "goalkeeper":
        # 골키퍼: 화면 하단/상단 골대 근처 + 중앙 부근
        edge_score = max(1.0 - norm_y / 0.38, 1.0 - (1.0 - norm_y) / 0.38, 0.0)
        center_score = 1.0 - min(abs(norm_x - 0.5) / 0.35, 1.0)
        return clamp(edge_score * 0.65 + center_score * 0.35, 0.0, 1.0)

    if role == "defender":
        depth = 1.0 - min(norm_y / 0.45, 1.0)
        return clamp(depth * 0.8 + 0.2, 0.0, 1.0)

    if role == "midfielder":
        mid_band = 1.0 - min(abs(norm_y - 0.52) / 0.28, 1.0)
        return clamp(mid_band, 0.0, 1.0)

    if role in ("forward", "winger"):
        attack = min(norm_y / 0.55, 1.0)
        wing_bonus = min(abs(norm_x - 0.5) / 0.35, 1.0) * 0.25 if role == "winger" else 0.0
        return clamp(attack * 0.75 + wing_bonus, 0.0, 1.0)

    return 0.35


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(value, max_value))


def score_person_for_target(
    frame_bgr: np.ndarray,
    person_box: List[float],
    profile: PlayerProfile,
    frame_shape: Tuple[int, int],
    *,
    enable_ocr: bool = True,
) -> Dict[str, Any]:
    h, w = frame_shape
    x1, y1, x2, y2 = [int(v) for v in person_box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w - 1, x2), min(h - 1, y2)

    crop = frame_bgr[y1:y2, x1:x2]
    cx, cy = (x1 + x2) / 2.0 / w, (y1 + y2) / 2.0 / h

    detected_jersey, jersey_conf = (None, 0.0)
    if enable_ocr and profile.jersey_number.strip():
        detected_jersey, jersey_conf = extract_jersey_number(crop)
    jersey_score = jersey_match_score(detected_jersey, profile.jersey_number)
    if jersey_score == 0.0 and detected_jersey and jersey_conf > 0.45:
        jersey_score = jersey_conf * 0.15

    zone_score = position_zone_score(profile.position, cx, cy) if profile.position else 0.25
    kit_score = color_match_score(crop, build_traits_text(profile))

    traits_bonus = 0.0
    traits_lower = build_traits_text(profile).lower()
    if "왼쪽" in traits_lower and cx < 0.45:
        traits_bonus += 0.08
    if "오른쪽" in traits_lower and cx > 0.55:
        traits_bonus += 0.08
    if "키 큰" in traits_lower or "키가 큰" in traits_lower:
        box_h = (y2 - y1) / h
        if box_h > 0.22:
            traits_bonus += 0.06

    if profile.jersey_number:
        total = jersey_score * 0.55 + zone_score * 0.2 + kit_score * 0.15 + traits_bonus
    elif profile.position:
        total = zone_score * 0.45 + kit_score * 0.25 + jersey_score * 0.15 + traits_bonus + 0.1
    else:
        total = kit_score * 0.35 + zone_score * 0.25 + jersey_score * 0.2 + traits_bonus + 0.1

    return {
        "matchScore": round(clamp(total, 0.0, 1.0), 3),
        "jerseyDetected": detected_jersey,
        "jerseyScore": round(jersey_score, 3),
        "zoneScore": round(zone_score, 3),
        "kitScore": round(kit_score, 3),
    }


def pick_target_track(track_scores: Dict[int, List[float]], min_samples: int = 2) -> Tuple[Optional[int], float]:
    if not track_scores:
        return None, 0.0

    best_track = None
    best_avg = 0.0

    for track_id, scores in track_scores.items():
        if len(scores) < min_samples:
            continue
        avg = sum(scores) / len(scores)
        if avg > best_avg:
            best_avg = avg
            best_track = track_id

    if best_track is None:
        # 샘플이 적어도 최고 점수 track 선택
        for track_id, scores in track_scores.items():
            avg = sum(scores) / max(len(scores), 1)
            if avg > best_avg:
                best_avg = avg
                best_track = track_id

    return best_track, round(best_avg, 3)


def is_ball_near_box(
    ball_box: List[float],
    person_box: List[float],
    frame_diag: float,
    distance_factor: float = 0.11,
    expand_scale: float = 1.0,
) -> bool:
    bx1, by1, bx2, by2 = ball_box
    px1, py1, px2, py2 = person_box

    bcx = (bx1 + bx2) / 2.0
    bcy = (by1 + by2) / 2.0

    expand_x = (px2 - px1) * 0.22 * expand_scale
    expand_y = (py2 - py1) * 0.16 * expand_scale
    if (px1 - expand_x) <= bcx <= (px2 + expand_x) and (py1 - expand_y) <= bcy <= (py2 + expand_y):
        return True

    pcx = (px1 + px2) / 2.0
    pcy = (py1 + py2) / 2.0
    distance = ((bcx - pcx) ** 2 + (bcy - pcy) ** 2) ** 0.5
    return distance <= frame_diag * distance_factor
