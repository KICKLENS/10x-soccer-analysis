import argparse
import json
import math
import os
import sys
from typing import Any, Dict, List, Tuple

import cv2
from ultralytics import YOLO

from player_targeting import (
    PlayerProfile,
    SimplePersonTracker,
    is_ball_near_box,
    normalize_position,
    pick_target_track,
    score_person_for_target,
    build_traits_text,
)


PERSON_CLASS_ID = 0
SPORTS_BALL_CLASS_ID = 32


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(value, max_value))


def sec_to_mmss(seconds: float) -> str:
    total = max(0, int(seconds))
    mm = total // 60
    ss = total % 60
    return f"{mm:02d}:{ss:02d}"


def box_center(box: List[float]) -> Tuple[float, float]:
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def is_ball_interacting_with_person(
    ball_box: List[float],
    person_boxes: List[List[float]],
    frame_diag: float,
) -> bool:
    if not person_boxes:
        return False

    bx, by = box_center(ball_box)
    distance_threshold = frame_diag * 0.12

    for person_box in person_boxes:
        px1, py1, px2, py2 = person_box
        pw = px2 - px1
        ph = py2 - py1

        # 사람 박스를 조금 확장해서 공이 가까이 있으면 상호작용으로 간주
        expand_x = pw * 0.18
        expand_y = ph * 0.12
        ex1 = px1 - expand_x
        ey1 = py1 - expand_y
        ex2 = px2 + expand_x
        ey2 = py2 + expand_y

        if ex1 <= bx <= ex2 and ey1 <= by <= ey2:
            return True

        px, py = box_center(person_box)
        distance = math.sqrt((bx - px) ** 2 + (by - py) ** 2)
        if distance <= distance_threshold:
            return True

    return False


def overlap_ratio(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    inter = max(0.0, min(a_end, b_end) - max(a_start, b_start))
    union = max(a_end, b_end) - min(a_start, b_start)
    if union <= 0:
        return 0.0
    return inter / union


def build_candidates(
    events: List[Dict[str, Any]],
    duration_sec: float,
    sample_seconds: float,
    merge_gap: float,
    pre_roll: float,
    post_roll: float,
) -> List[Dict[str, Any]]:
    if not events:
        return []

    groups: List[List[Dict[str, Any]]] = []
    current_group = [events[0]]

    for event in events[1:]:
        if event["timeSec"] - current_group[-1]["timeSec"] <= merge_gap:
            current_group.append(event)
        else:
            groups.append(current_group)
            current_group = [event]

    groups.append(current_group)

    candidates: List[Dict[str, Any]] = []

    for group in groups:
        first_time = group[0]["timeSec"]
        last_time = group[-1]["timeSec"]

        start_sec = max(0.0, first_time - pre_roll)
        end_sec = min(duration_sec, last_time + post_roll)
        clip_duration = max(0.1, end_sec - start_sec)

        frames_matched = len(group)
        interaction_frames = sum(1 for item in group if item.get("interaction"))
        target_interaction_frames = sum(1 for item in group if item.get("targetPlayerInteraction"))
        target_frames = sum(1 for item in group if item.get("targetPlayerInteraction"))
        target_match_avg = (
            sum(float(item.get("targetPlayerMatch") or 0.0) for item in group) / frames_matched
            if frames_matched > 0
            else 0.0
        )
        ball_detections_count = sum(int(item["ballCount"]) for item in group)

        avg_ball_count = (
            ball_detections_count / frames_matched if frames_matched > 0 else 0.0
        )
        avg_ball_confidence = (
            sum(float(item["topBallConfidence"]) for item in group) / frames_matched
            if frames_matched > 0
            else 0.0
        )
        max_ball_confidence = (
            max(float(item["topBallConfidence"]) for item in group)
            if frames_matched > 0
            else 0.0
        )
        interaction_ratio = (
            interaction_frames / frames_matched if frames_matched > 0 else 0.0
        )
        target_ratio = target_frames / frames_matched if frames_matched > 0 else 0.0

        goal_zone_frames = sum(1 for item in group if item.get("inGoalZone"))
        goal_moment_score = min(1.0, goal_zone_frames * 0.12 + (0.25 if goal_zone_frames >= 2 else 0))
        is_goal_area = goal_moment_score >= 0.35

        # 점수: 대상 선수 추적 비율을 최우선 반영
        score = 0.12
        score += 0.28 * target_ratio
        score += 0.18 * target_match_avg
        score += 0.14 * min(frames_matched / 8.0, 1.0)
        score += 0.12 * interaction_ratio
        score += 0.08 * min(clip_duration / 8.0, 1.0)
        score += 0.10 * min(avg_ball_confidence / 0.70, 1.0)
        score += 0.06 * min(max_ball_confidence / 0.85, 1.0)
        score += 0.04 * min(avg_ball_count / 1.8, 1.0)
        score += goal_moment_score * 0.22

        if target_frames >= 3:
            score += 0.08
        if target_match_avg >= 0.55:
            score += 0.06
        if interaction_frames >= 3:
            score += 0.04
        if frames_matched >= 6:
            score += 0.03
        if frames_matched == 1 and avg_ball_confidence < 0.35:
            score -= 0.10
        if target_interaction_frames == 0 and interaction_frames == 0:
            score -= 0.22
        elif target_interaction_frames == 0 and target_frames == 0:
            score -= 0.20
        if interaction_frames == 0:
            score -= 0.08
        if target_interaction_frames >= 3:
            score += 0.10
        if clip_duration > 11:
            score -= min((clip_duration - 11) * 0.02, 0.10)
        if clip_duration < 3.0 and target_frames == 0:
            score -= 0.10

        score = clamp(score, 0.35, 0.98)

        if target_interaction_frames > 0:
            if is_goal_area:
                label = "골대 앞 결정적 순간"
                reason = "골대·딥존 근처에서 등록 선수와 공의 직접 상호작용"
            else:
                label = "대상 선수 공 관여 장면"
                reason = "등록한 선수와 공의 직접 상호작용이 확인된 구간"
        elif target_frames > 0:
            label = "대상 선수 활동 장면"
            reason = "등록한 선수의 움직임이 반복 확인된 구간(공 관여는 약함)"
        elif interaction_frames > 0:
            label = "공-선수 관여 장면"
            reason = "공과 선수의 근접 상호작용이 감지된 구간"
        else:
            label = "공 탐지 장면"
            reason = "공이 반복적으로 탐지된 구간"

        candidates.append(
            {
                "id": f"clip-{int(start_sec * 100):06d}",
                "startTime": sec_to_mmss(start_sec),
                "endTime": sec_to_mmss(end_sec),
                "startSec": round(start_sec, 2),
                "endSec": round(end_sec, 2),
                "label": label,
                "score": round(score, 2),
                "reason": reason,
                "framesMatched": frames_matched,
                "interactionFrames": interaction_frames,
                "ballDetectionsCount": ball_detections_count,
                "avgBallCount": round(avg_ball_count, 2),
                "avgBallConfidence": round(avg_ball_confidence, 3),
                "maxBallConfidence": round(max_ball_confidence, 3),
                "durationSec": round(clip_duration, 2),
                "sampleSeconds": sample_seconds,
                "targetPlayerFrames": target_frames,
                "targetPlayerInteractionFrames": target_interaction_frames,
                "targetPlayerMatchAvg": round(target_match_avg, 3),
                "goalMomentScore": round(goal_moment_score, 3),
                "isGoalAreaMoment": is_goal_area,
                "goalMomentType": "goal_zone_heuristic" if is_goal_area else None,
            }
        )

    return candidates


def filter_and_rank_candidates(
    candidates: List[Dict[str, Any]],
    top_k: int,
    min_score: float,
    min_frames: int,
    min_interaction_frames: int,
    min_center_gap: float,
    overlap_threshold: float,
) -> List[Dict[str, Any]]:
    if not candidates:
        return []

    # 1차 필터
    filtered = []
    for clip in candidates:
        frames_matched = clip.get("framesMatched", 0)
        interaction_frames = clip.get("interactionFrames", 0)
        score = clip.get("score", 0.0)
        avg_ball_conf = clip.get("avgBallConfidence", 0.0)

        if score < min_score:
            continue

        # interaction이 있거나, 충분히 여러 프레임에서 탐지된 경우만 통과
        if interaction_frames < min_interaction_frames and frames_matched < min_frames:
            continue

        # 한 프레임만 잡혔고 confidence도 낮으면 제외
        if frames_matched == 1 and avg_ball_conf < 0.40:
            continue

        filtered.append(clip)

    # 2차 정렬
    filtered.sort(
        key=lambda x: (
            x.get("score", 0.0),
            x.get("interactionFrames", 0),
            x.get("framesMatched", 0),
            x.get("avgBallConfidence", 0.0),
        ),
        reverse=True,
    )

    # 3차 시간 중복 제거 (temporal NMS 느낌)
    selected: List[Dict[str, Any]] = []

    for clip in filtered:
        clip_mid = (clip["startSec"] + clip["endSec"]) / 2.0
        keep = True

        for picked in selected:
            picked_mid = (picked["startSec"] + picked["endSec"]) / 2.0
            ov = overlap_ratio(
                clip["startSec"],
                clip["endSec"],
                picked["startSec"],
                picked["endSec"],
            )

            if ov >= overlap_threshold or abs(clip_mid - picked_mid) < min_center_gap:
                keep = False
                break

        if keep:
            selected.append(clip)

        if len(selected) >= top_k:
            break

    # 너무 적게 남았을 때만 완화해서 보충
    if len(selected) < 10:
        for clip in filtered:
            if clip in selected:
                continue
            selected.append(clip)
            if len(selected) >= min(top_k, 10):
                break

    return selected


def auto_sample_seconds(duration_sec: float, requested: float, max_samples: int = 900) -> float:
    if requested > 0:
        base = requested
    elif duration_sec <= 300:
        base = 0.75
    elif duration_sec <= 600:
        base = 1.0
    elif duration_sec <= 1200:
        base = 1.25
    else:
        base = 1.5

    if duration_sec <= 0:
        return base

    min_interval = duration_sec / max_samples
    return max(base, min_interval)


def analyze_video(args: argparse.Namespace) -> Dict[str, Any]:
    if not os.path.exists(args.video_path):
        return {
            "success": False,
            "source": "yolo",
            "message": "Video file not found.",
            "fileName": os.path.basename(args.video_path),
            "clips": [],
        }

    profile = PlayerProfile(
        name=args.player_name or "",
        position=args.player_position or "",
        team_name=args.team_name or "",
        jersey_number=args.jersey_number or "",
        uniform_color=args.uniform_color or "",
        traits=args.player_traits or "",
    )

    model = YOLO(args.model)
    person_tracker = SimplePersonTracker() if profile.has_target else None

    cap = cv2.VideoCapture(args.video_path)
    if not cap.isOpened():
        return {
            "success": False,
            "source": "yolo",
            "message": "Failed to open video file.",
            "fileName": os.path.basename(args.video_path),
            "clips": [],
        }

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_sec = frame_count / fps if fps > 0 and frame_count > 0 else 0.0
    sample_seconds = auto_sample_seconds(duration_sec, args.sample_seconds, args.max_samples)

    sampled_frames = 0
    ball_detected_frames = 0
    interaction_frames_total = 0
    target_interaction_frames_total = 0
    detections: List[Dict[str, Any]] = []

    track_scores: Dict[int, List[float]] = {}
    target_track_id = None
    target_track_confidence = 0.0
    probe_until = min(60.0, duration_sec * 0.35) if profile.has_target else 0.0

    next_time = 0.0

    while next_time <= duration_sec:
        frame_index = int(next_time * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)

        ok, frame = cap.read()
        if not ok or frame is None:
            next_time += sample_seconds
            continue

        sampled_frames += 1
        h, w = frame.shape[:2]
        frame_diag = math.sqrt(w * w + h * h)

        use_track = False
        result = model.predict(
            source=frame,
            conf=args.conf,
            imgsz=args.imgsz,
            verbose=False,
        )[0]

        person_entries: List[Dict[str, Any]] = []
        ball_boxes: List[List[float]] = []
        ball_confidences: List[float] = []
        raw_person_boxes: List[List[float]] = []

        if result.boxes is not None and len(result.boxes) > 0:
            boxes_xyxy = result.boxes.xyxy.cpu().tolist()
            boxes_cls = result.boxes.cls.cpu().tolist()
            boxes_conf = result.boxes.conf.cpu().tolist()

            for box, cls_id, conf in zip(boxes_xyxy, boxes_cls, boxes_conf):
                cls_id = int(cls_id)
                person_box = [float(v) for v in box]

                if cls_id == PERSON_CLASS_ID:
                    raw_person_boxes.append(person_box)
                elif cls_id == SPORTS_BALL_CLASS_ID:
                    ball_boxes.append(person_box)
                    ball_confidences.append(float(conf))

        if raw_person_boxes:
            raw_person_boxes.sort(
                key=lambda box: (box[2] - box[0]) * (box[3] - box[1]),
                reverse=True,
            )
            raw_person_boxes = raw_person_boxes[: args.max_persons]

        enable_ocr = profile.has_target and profile.jersey_number.strip() and next_time <= probe_until
        for person_box in raw_person_boxes:
            match_info = score_person_for_target(
                frame,
                person_box,
                profile,
                (h, w),
                enable_ocr=enable_ocr,
            )
            person_entries.append({
                "box": person_box,
                "trackId": None,
                **match_info,
            })

        if person_tracker is not None and person_entries:
            person_tracker.assign_track_ids(person_entries)

        if profile.has_target and next_time <= probe_until:
            for entry in person_entries:
                track_id = entry.get("trackId")
                if track_id is not None:
                    track_scores.setdefault(track_id, []).append(float(entry.get("matchScore") or 0.0))

        if profile.has_target and target_track_id is None and next_time > probe_until:
            target_track_id, target_track_confidence = pick_target_track(track_scores)
            if target_track_id is not None:
                print(
                    f"[YOLO] 대상 선수 track_id={target_track_id} 식별 (confidence={target_track_confidence})",
                    file=sys.stderr,
                    flush=True,
                )

        if ball_boxes:
            ball_detected_frames += 1

            target_person_box = None
            target_match = 0.0
            detected_jersey = None

            if profile.has_target:
                if target_track_id is not None:
                    for entry in person_entries:
                        if entry.get("trackId") == target_track_id:
                            target_person_box = entry["box"]
                            target_match = float(entry.get("matchScore") or 0.0)
                            detected_jersey = entry.get("jerseyDetected")
                            break

                if target_person_box is None and person_entries:
                    best_entry = max(person_entries, key=lambda item: float(item.get("matchScore") or 0.0))
                    if float(best_entry.get("matchScore") or 0.0) >= 0.18:
                        target_person_box = best_entry["box"]
                        target_match = float(best_entry.get("matchScore") or 0.0)
                        detected_jersey = best_entry.get("jerseyDetected")

                is_gk = normalize_position(profile.position) == "goalkeeper"
                near_factor = 0.16 if is_gk else 0.12
                expand_scale = 1.3 if is_gk else 1.0

                target_interaction = any(
                    is_ball_near_box(ball_box, target_person_box, frame_diag, near_factor, expand_scale)
                    for ball_box in ball_boxes
                ) if target_person_box is not None else False

                soft_target_interaction = False
                if not target_interaction and target_person_box is not None and target_match >= 0.22:
                    soft_target_interaction = any(
                        is_ball_interacting_with_person(ball_box, [target_person_box], frame_diag)
                        for ball_box in ball_boxes
                    )
            else:
                target_interaction = False
                soft_target_interaction = False

            generic_interaction = any(
                is_ball_interacting_with_person(ball_box, [entry["box"] for entry in person_entries], frame_diag)
                for ball_box in ball_boxes
            )

            if profile.has_target:
                interaction = target_interaction or soft_target_interaction
            else:
                interaction = generic_interaction

            if interaction:
                interaction_frames_total += 1
            if target_interaction or soft_target_interaction:
                target_interaction_frames_total += 1

            top_ball = ball_boxes[0]
            ball_cx = (top_ball[0] + top_ball[2]) / 2.0 / w
            ball_cy = (top_ball[1] + top_ball[3]) / 2.0 / h
            in_goal_zone = (
                ball_cx < 0.22 or ball_cx > 0.78 or ball_cy < 0.26 or ball_cy > 0.74
            ) and interaction

            detections.append(
                {
                    "timeSec": round(next_time, 2),
                    "time": sec_to_mmss(next_time),
                    "ballCount": len(ball_boxes),
                    "ballDetectionsCount": len(ball_boxes),
                    "personCount": len(person_entries),
                    "interaction": interaction,
                    "genericInteraction": generic_interaction,
                    "targetPlayerInteraction": target_interaction or soft_target_interaction,
                    "strictTargetInteraction": target_interaction,
                    "softTargetInteraction": soft_target_interaction,
                    "targetPlayerMatch": round(target_match, 3),
                    "targetJerseyDetected": detected_jersey,
                    "topBallConfidence": round(max(ball_confidences), 3)
                    if ball_confidences
                    else 0.0,
                    "ballNx": round(ball_cx, 3),
                    "ballNy": round(ball_cy, 3),
                    "inGoalZone": in_goal_zone,
                }
            )

        next_time += sample_seconds

    cap.release()

    if profile.has_target and target_track_id is None:
        target_track_id, target_track_confidence = pick_target_track(track_scores)

    candidates = build_candidates(
        events=detections,
        duration_sec=duration_sec,
        sample_seconds=sample_seconds,
        merge_gap=args.merge_gap,
        pre_roll=args.pre_roll,
        post_roll=args.post_roll,
    )

    selected_clips = filter_and_rank_candidates(
        candidates=candidates,
        top_k=args.top_k,
        min_score=args.min_score,
        min_frames=args.min_frames,
        min_interaction_frames=args.min_interaction_frames,
        min_center_gap=args.min_center_gap,
        overlap_threshold=args.overlap_threshold,
    )

    usedFallback = False
    if profile.has_target:
        strict = [
            clip for clip in selected_clips
            if (
                clip.get("targetPlayerInteractionFrames", 0) >= 2
                or (
                    clip.get("targetPlayerFrames", 0) >= 2
                    and clip.get("targetPlayerMatchAvg", 0) >= 0.32
                )
            )
            and clip.get("avgBallConfidence", 0) >= 0.38
            and clip.get("interactionFrames", 0) >= 1
        ]
        if len(strict) >= 1:
            selected_clips = strict
        elif selected_clips:
            relaxed = [
                clip for clip in selected_clips
                if clip.get("interactionFrames", 0) >= 1
                and clip.get("avgBallConfidence", 0) >= 0.36
            ]
            if relaxed:
                selected_clips = relaxed
                usedFallback = True
        if not selected_clips and candidates:
            usedFallback = True
            selected_clips = sorted(
                [
                    clip for clip in candidates
                    if clip.get("interactionFrames", 0) >= 1
                    and clip.get("avgBallConfidence", 0) >= 0.34
                ],
                key=lambda clip: (
                    clip.get("targetPlayerInteractionFrames", 0),
                    clip.get("targetPlayerMatchAvg", 0),
                    clip.get("score", 0),
                ),
                reverse=True,
            )[: max(args.top_k, 10)]

    message = "YOLO target-player analysis completed." if profile.has_target else "YOLO video analysis completed."
    if profile.has_target and usedFallback:
        message = "대상 선수 직접 매칭은 약했지만, 포지션/특징 기반 후보 장면으로 분석했습니다."

    return {
        "success": True,
        "source": "yolo",
        "message": message,
        "fileName": os.path.basename(args.video_path),
        "targetPlayer": {
            "name": profile.name,
            "position": profile.position,
            "teamName": profile.team_name,
            "jerseyNumber": profile.jersey_number,
            "uniformColor": profile.uniform_color,
            "traits": build_traits_text(profile),
            "trackId": target_track_id,
            "identificationConfidence": target_track_confidence,
            "targetInteractionFrames": target_interaction_frames_total,
        } if profile.has_target else None,
        "summary": {
            "durationSec": round(duration_sec, 2),
            "fps": round(fps, 2),
            "frameCount": frame_count,
            "sampleSeconds": sample_seconds,
            "requestedSampleSeconds": args.sample_seconds,
            "sampledFrames": sampled_frames,
            "ballDetectedFrames": ball_detected_frames,
            "interactionFrames": interaction_frames_total,
            "targetInteractionFrames": target_interaction_frames_total,
            "candidateClipsBeforeFilter": len(candidates),
            "returnedClips": len(selected_clips),
            "topK": args.top_k,
            "minScore": args.min_score,
        },
        "detections": detections if args.include_detections else [],
        "clips": selected_clips,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Detect soccer ball related highlight clips from video using YOLO."
    )
    parser.add_argument("video_path", help="Path to input video file")
    parser.add_argument("--model", default="yolo11n.pt", help="YOLO model path or name")
    parser.add_argument("--sample-seconds", type=float, default=0.0, help="Frame sampling interval (0=auto by duration)")
    parser.add_argument("--max-samples", type=int, default=900, help="Maximum sampled frames for long videos")
    parser.add_argument("--max-persons", type=int, default=8, help="Max persons to score per sampled frame")
    parser.add_argument("--conf", type=float, default=0.22, help="YOLO confidence threshold")
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size")
    parser.add_argument("--include-detections", action="store_true", help="Include full per-frame detections in JSON")
    parser.add_argument("--top-k", type=int, default=15, help="Maximum number of clips to return")
    parser.add_argument("--min-score", type=float, default=0.70, help="Minimum clip score to keep")
    parser.add_argument("--min-frames", type=int, default=3, help="Minimum matched frames for non-interaction clip")
    parser.add_argument("--min-interaction-frames", type=int, default=1, help="Minimum interaction frames for interaction clip")
    parser.add_argument("--merge-gap", type=float, default=1.8, help="Merge nearby detections within this many seconds")
    parser.add_argument("--pre-roll", type=float, default=1.2, help="Seconds to include before first detection in a clip")
    parser.add_argument("--post-roll", type=float, default=2.2, help="Seconds to include after last detection in a clip")
    parser.add_argument("--min-center-gap", type=float, default=5.0, help="Minimum mid-point gap between selected clips")
    parser.add_argument("--overlap-threshold", type=float, default=0.35, help="Temporal overlap threshold for suppressing duplicate clips")
    parser.add_argument("--player-name", default="", help="Target player name")
    parser.add_argument("--player-position", default="", help="Target player position")
    parser.add_argument("--team-name", default="", help="Target player team name")
    parser.add_argument("--jersey-number", default="", help="Target player jersey number")
    parser.add_argument("--uniform-color", default="", help="Target player uniform color")
    parser.add_argument("--player-traits", default="", help="Target player visual traits")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    result = analyze_video(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
