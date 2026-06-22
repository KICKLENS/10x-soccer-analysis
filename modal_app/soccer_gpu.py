"""
Soccer GPU analysis service (Modal).

추가 분석 기능을 GPU(서버리스)에서 실행하는 별도 서비스입니다.
기존 Railway 파이프라인은 그대로 두고, 이 서비스가 "값을 더해주는" 역할만 합니다.

  A) 등록 선수 추적 + 이동거리/스프린트/활동 히트맵
  C) 하이라이트 구간 공 정밀 탐지(SAHI)

배포:
  pip install modal
  modal token new
  modal secret create soccer-gpu-auth GPU_AUTH_TOKEN=<랜덤문자열>
  modal deploy modal_app/soccer_gpu.py
배포 후 출력되는 analyze 엔드포인트 URL을 Railway 환경변수 MODAL_ANALYZE_URL 로,
GPU_AUTH_TOKEN 값을 Railway 환경변수 MODAL_AUTH_TOKEN 으로 설정하세요.
"""

import os
from typing import List, Optional

import modal

APP_NAME = "soccer-gpu"

# 기본 모델: 정확도/속도 균형을 위해 11s 사용 (n보다 추적 안정적)
DETECT_MODEL = os.environ.get("SOCCER_YOLO_MODEL", "yolo11s.pt")

PERSON_CLASS_ID = 0
SPORTS_BALL_CLASS_ID = 32


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "ffmpeg", "wget")
    .pip_install(
        "ultralytics==8.3.58",
        "opencv-python-headless==4.10.0.84",
        "numpy<2",
        "sahi==0.11.20",
        "requests==2.32.3",
        "lap==0.5.12",
        "fastapi[standard]",
    )
)


def _preload_models():
    """이미지 빌드 시점에 가중치를 받아 둬서 콜드스타트를 줄인다."""
    from ultralytics import YOLO

    YOLO(DETECT_MODEL)


image = image.run_function(_preload_models)

app = modal.App(APP_NAME)


# ---------------------------------------------------------------------------
# 요청/응답 스키마
# ---------------------------------------------------------------------------
with image.imports():
    from pydantic import BaseModel

    class ClipWindow(BaseModel):
        startSec: float
        endSec: float

    class PlayerInfo(BaseModel):
        name: str = ""
        position: str = ""
        jerseyNumber: str = ""
        uniformColor: str = ""
        traits: str = ""

    class AnalyzeRequest(BaseModel):
        videoUrl: str
        authToken: str = ""
        player: PlayerInfo = PlayerInfo()
        clips: List[ClipWindow] = []
        sampleFps: float = 4.0
        sahi: bool = True
        assumedPlayerHeightM: float = 1.5
        maxTrackSeconds: float = 0.0  # 0=전체
        centerSeed: bool = True  # 시작 구간 화면 중앙 선수를 타겟으로 잠그고 추적(등번호 불필요)
        seedSeconds: float = 3.0  # 중앙 지목 판단에 쓰는 시작 구간(초)
        detectCandidates: bool = False  # SAHI로 공-선수 하이라이트 후보 직접 탐지
        candidateFps: float = 2.0
        preRoll: float = 1.2
        postRoll: float = 2.2
        mergeGap: float = 1.8


# ---------------------------------------------------------------------------
# 유틸 (런타임에서만 import)
# ---------------------------------------------------------------------------
def _download_video(url: str, dest: str) -> None:
    import requests

    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)


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


def _color_ranges(text: str):
    text = (text or "").lower()
    out = []
    for k, rng in COLOR_HINTS.items():
        if k in text:
            out.append(rng)
    return out


def _color_score(crop_bgr, ranges) -> float:
    import cv2
    import numpy as np

    if not ranges or crop_bgr is None or crop_bgr.size == 0:
        return 0.0
    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    best = 0.0
    for lower, upper in ranges:
        mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
        ratio = float(cv2.countNonZero(mask)) / float(mask.size)
        best = max(best, ratio)
    return min(best * 2.2, 1.0)


def _position_zone_score(position: str, nx: float, ny: float) -> float:
    role = (position or "").strip().lower()
    role_map = {
        "gk": "goalkeeper", "골키퍼": "goalkeeper", "키퍼": "goalkeeper",
        "df": "defender", "수비": "defender", "수비수": "defender", "cb": "defender",
        "mf": "midfielder", "미드필더": "midfielder", "cm": "midfielder",
        "fw": "forward", "공격수": "forward", "st": "forward", "cf": "forward",
        "wing": "winger", "윙어": "winger",
    }
    role = role_map.get(role, role)
    if role == "goalkeeper":
        return max(1.0 - ny / 0.38, 1.0 - (1.0 - ny) / 0.38, 0.0)
    if role == "defender":
        return max(0.0, 1.0 - min(ny / 0.45, 1.0)) * 0.8 + 0.2
    if role == "midfielder":
        return max(0.0, 1.0 - min(abs(ny - 0.52) / 0.28, 1.0))
    if role in ("forward", "winger"):
        return min(ny / 0.55, 1.0) * 0.75 + 0.2
    return 0.35


def _estimate_camera_affine(prev_gray, cur_gray, orb, max_features: int = 500):
    """이전→현재 프레임 배경 affine 변환 추정 (카메라 패닝 보정용)."""
    import cv2
    import numpy as np

    kp1, des1 = orb.detectAndCompute(prev_gray, None)
    kp2, des2 = orb.detectAndCompute(cur_gray, None)
    if des1 is None or des2 is None or len(kp1) < 8 or len(kp2) < 8:
        return None
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = matcher.match(des1, des2)
    if len(matches) < 8:
        return None
    matches = sorted(matches, key=lambda m: m.distance)[:max_features]
    src = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    dst = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
    M, _ = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=5.0)
    return M  # maps prev coords -> cur coords


# ---------------------------------------------------------------------------
# A) 선수 추적 + 이동 지표
# ---------------------------------------------------------------------------
def _track_player(video_path: str, player: dict, sample_fps: float,
                  assumed_height_m: float, max_seconds: float,
                  center_seed: bool = True, seed_seconds: float = 3.0) -> dict:
    import cv2
    import numpy as np
    from ultralytics import YOLO

    model = YOLO(DETECT_MODEL)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"available": False, "reason": "cannot_open_video"}

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total / fps if fps > 0 and total > 0 else 0.0
    if max_seconds and max_seconds > 0:
        duration = min(duration, max_seconds)

    step = max(1, int(round(fps / max(0.5, sample_fps))))
    dt = step / fps  # 샘플 간 시간 간격(초)

    color_ranges = _color_ranges(f"{player.get('uniformColor','')} {player.get('traits','')}")
    position = player.get("position", "")

    orb = cv2.ORB_create(800)

    # track_id -> {points:[(t,x,y)], heights:[], scores:[]}
    tracks: dict = {}
    prev_gray = None
    accum = np.array([[1, 0, 0], [0, 1, 0]], dtype=np.float64)  # frame->frame0 누적 affine

    frame_idx = 0
    frame_w = frame_h = 0

    while True:
        ok = cap.grab()
        if not ok:
            break
        if frame_idx % step != 0:
            frame_idx += 1
            continue
        ok, frame = cap.retrieve()
        if not ok or frame is None:
            frame_idx += 1
            continue

        t = frame_idx / fps
        if duration and t > duration:
            break

        frame_h, frame_w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # 카메라 모션 보정: 이전→현재 affine을 구해 누적(현재→frame0) 갱신
        if prev_gray is not None:
            M = _estimate_camera_affine(prev_gray, gray, orb)
            if M is not None:
                # accum(prev->0), M(prev->cur). cur->0 = accum * inv(M)
                M3 = np.vstack([M, [0, 0, 1]])
                try:
                    inv = np.linalg.inv(M3)
                    a3 = np.vstack([accum, [0, 0, 1]])
                    accum = (a3 @ inv)[:2]
                except np.linalg.LinAlgError:
                    pass
        prev_gray = gray

        # BoT-SORT 추적
        res = model.track(
            source=frame, persist=True, tracker="botsort.yaml",
            classes=[PERSON_CLASS_ID], conf=0.25, imgsz=640, verbose=False,
        )[0]

        if res.boxes is None or res.boxes.id is None:
            frame_idx += 1
            continue

        xyxy = res.boxes.xyxy.cpu().numpy()
        ids = res.boxes.id.cpu().numpy().astype(int)

        for box, tid in zip(xyxy, ids):
            x1, y1, x2, y2 = box
            cx = (x1 + x2) / 2.0
            foot_y = y2  # 발끝(바닥 접점)
            box_h = max(1.0, y2 - y1)

            # 안정화 좌표(frame0 기준)
            pt = accum @ np.array([cx, foot_y, 1.0])
            sx, sy = float(pt[0]), float(pt[1])

            nx, ny = cx / frame_w, (y1 + y2) / 2.0 / frame_h
            crop = frame[max(0, int(y1)):int(y2), max(0, int(x1)):int(x2)]
            kit = _color_score(crop, color_ranges)
            zone = _position_zone_score(position, nx, ny)
            match = kit * 0.5 + zone * 0.5

            rec = tracks.setdefault(tid, {"pts": [], "heights": [], "scores": [], "seed": []})
            rec["pts"].append((t, sx, sy))
            rec["heights"].append(box_h)
            rec["scores"].append(match)

            # 중앙 지목 점수: 시작 구간에 화면 중앙 + 크게(앞쪽) 잡힌 선수일수록 높음
            if center_seed and t <= seed_seconds:
                dcx = abs(nx - 0.5)
                dcy = abs(ny - 0.5)
                radial = (dcx * dcx + dcy * dcy) ** 0.5
                closeness = max(0.0, 1.0 - radial / 0.5)  # 중앙=1, 가장자리=0
                size_norm = min(1.0, (box_h / frame_h) / 0.6)  # 화면 높이 60%면 만점
                rec["seed"].append(closeness * (0.6 + 0.4 * size_norm))

        frame_idx += 1

    cap.release()

    if not tracks:
        return {"available": False, "reason": "no_person_tracks"}

    # 대상 track 선정
    # 1순위: 중앙 지목(center-seed) — 시작 구간 화면 중앙에 크게 잡힌 선수(등번호 불필요)
    # 2순위(폴백): 유니폼색/포지션 매칭 점수
    def track_rank(item):
        _tid, r = item
        scores = r["scores"]
        avg = sum(scores) / len(scores) if scores else 0.0
        return (avg, len(r["pts"]))

    seed_select = "kit_zone"
    seeded = {
        tid: r for tid, r in tracks.items()
        if r.get("seed") and len(r["seed"]) >= 2
    }
    if center_seed and seeded:
        def seed_rank(item):
            _tid, r = item
            s = r["seed"]
            return (sum(s) / len(s), len(r["pts"]))

        target_id, target = max(seeded.items(), key=seed_rank)
        seed_select = "center_seed"
    else:
        target_id, target = max(tracks.items(), key=track_rank)
    pts = target["pts"]
    if len(pts) < 3:
        return {"available": False, "reason": "target_track_too_short", "trackId": int(target_id)}

    median_h = float(np.median(target["heights"]))
    meters_per_px = assumed_height_m / median_h if median_h > 0 else 0.0

    # 이동거리/속도: 안정화 좌표 변위 * 스케일, 비현실적 점프는 클램프
    dist_m = 0.0
    speeds = []  # (t, speed_m_s)
    max_step_m = 12.0 * dt  # 12 m/s 상한
    for i in range(1, len(pts)):
        t0, x0, y0 = pts[i - 1]
        t1, x1, y1 = pts[i]
        seg_dt = max(1e-3, t1 - t0)
        d_px = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        d_m = d_px * meters_per_px
        if d_m > max_step_m:
            d_m = max_step_m  # 추적 점프/보정 오류 억제
        dist_m += d_m
        speeds.append((t1, d_m / seg_dt))

    # 스프린트: 4.5 m/s 이상이 2스텝 이상 연속되는 구간 수
    sprint_thr = 4.5
    sprint_count = 0
    run = 0
    for _t, sp in speeds:
        if sp >= sprint_thr:
            run += 1
            if run == 2:
                sprint_count += 1
        else:
            run = 0

    avg_speed = float(np.mean([s for _t, s in speeds])) if speeds else 0.0
    top_speed = float(np.max([s for _t, s in speeds])) if speeds else 0.0
    # 활동 지수(0~100): 평균 속도를 youth 기준으로 정규화
    activity_index = int(max(0, min(100, round((avg_speed / 3.0) * 100))))

    # 히트맵: 안정화 좌표를 bounding box로 정규화 후 그리드 집계
    cols, rows = 24, 16
    xs = np.array([p[1] for p in pts])
    ys = np.array([p[2] for p in pts])
    xmin, xmax = float(xs.min()), float(xs.max())
    ymin, ymax = float(ys.min()), float(ys.max())
    span_x = max(1.0, xmax - xmin)
    span_y = max(1.0, ymax - ymin)
    grid = [[0 for _ in range(cols)] for _ in range(rows)]
    for _t, x, y in pts:
        gx = min(cols - 1, int((x - xmin) / span_x * cols))
        gy = min(rows - 1, int((y - ymin) / span_y * rows))
        grid[gy][gx] += 1

    return {
        "available": True,
        "trackId": int(target_id),
        "targetSelectedBy": seed_select,  # center_seed | kit_zone
        "matchConfidence": round(sum(target["scores"]) / len(target["scores"]), 3),
        "sampledPoints": len(pts),
        "scaleMetersPerPixel": round(meters_per_px, 5),
        "metrics": {
            "distanceM": round(dist_m, 1),
            "avgSpeedMS": round(avg_speed, 2),
            "topSpeedMS": round(top_speed, 2),
            "sprintCount": sprint_count,
            "activityIndex": activity_index,
        },
        "heatmap": {"cols": cols, "rows": rows, "grid": grid},
        "note": "거리/속도는 단안 추정치(선수 키 기준 스케일)로 ±오차가 있습니다.",
    }


# ---------------------------------------------------------------------------
# C) 공 정밀 탐지 (SAHI)
# ---------------------------------------------------------------------------
def _detect_ball_sahi(video_path: str, clips: list, sample_fps: float) -> dict:
    import cv2
    from sahi import AutoDetectionModel
    from sahi.predict import get_sliced_prediction

    det_model = AutoDetectionModel.from_pretrained(
        model_type="ultralytics",
        model_path=DETECT_MODEL,
        confidence_threshold=0.20,
        device="cuda:0",
    )

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"available": False, "reason": "cannot_open_video"}
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total / fps if fps > 0 and total > 0 else 0.0

    windows = clips if clips else [{"startSec": 0.0, "endSec": duration}]
    step_sec = 1.0 / max(0.5, sample_fps)

    results = []
    for w in windows:
        start = max(0.0, float(w["startSec"]))
        end = min(duration or float(w["endSec"]), float(w["endSec"]))
        frames = 0
        ball_frames = 0
        confs = []
        positions = []
        t = start
        while t <= end:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
            ok, frame = cap.read()
            if not ok or frame is None:
                t += step_sec
                continue
            frames += 1
            h, w_ = frame.shape[:2]
            pred = get_sliced_prediction(
                frame,
                det_model,
                slice_height=max(256, h // 2),
                slice_width=max(256, w_ // 2),
                overlap_height_ratio=0.2,
                overlap_width_ratio=0.2,
                verbose=0,
            )
            best = None
            for obj in pred.object_prediction_list:
                if obj.category.id == SPORTS_BALL_CLASS_ID:
                    if best is None or obj.score.value > best.score.value:
                        best = obj
            if best is not None:
                ball_frames += 1
                confs.append(float(best.score.value))
                bb = best.bbox
                positions.append([
                    round((bb.minx + bb.maxx) / 2.0 / w_, 4),
                    round((bb.miny + bb.maxy) / 2.0 / h, 4),
                ])
            t += step_sec

        results.append({
            "startSec": round(start, 2),
            "endSec": round(end, 2),
            "framesChecked": frames,
            "ballFrames": ball_frames,
            "ballDetectionRate": round(ball_frames / frames, 3) if frames else 0.0,
            "avgConfidence": round(sum(confs) / len(confs), 3) if confs else 0.0,
            "positions": positions[:60],
        })

    cap.release()
    return {"available": True, "windows": results}


# ---------------------------------------------------------------------------
# 하이라이트 후보 직접 탐지 (SAHI 공 + 선수 근접) — CPU 파이프라인 구제용
# ---------------------------------------------------------------------------
def _sec_to_mmss(sec: float) -> str:
    total = max(0, int(sec))
    return f"{total // 60:02d}:{total % 60:02d}"


def _detect_candidates(video_path: str, player: dict, sample_fps: float,
                       pre_roll: float, post_roll: float, merge_gap: float) -> dict:
    import cv2
    from sahi import AutoDetectionModel
    from sahi.predict import get_sliced_prediction

    det_model = AutoDetectionModel.from_pretrained(
        model_type="ultralytics",
        model_path=DETECT_MODEL,
        confidence_threshold=0.12,
        device="cuda:0",
    )

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"available": False, "reason": "cannot_open_video"}
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total / fps if fps > 0 and total > 0 else 0.0

    color_ranges = _color_ranges(f"{player.get('uniformColor','')} {player.get('traits','')}")
    position = player.get("position", "")
    step_sec = 1.0 / max(0.5, sample_fps)

    events = []  # {t, ballConf, interaction, targetMatch}
    ball_seen = 0
    t = 0.0
    while t <= duration:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if not ok or frame is None:
            t += step_sec
            continue
        h, w = frame.shape[:2]
        pred = get_sliced_prediction(
            frame, det_model,
            slice_height=max(256, h // 2), slice_width=max(256, w // 2),
            overlap_height_ratio=0.2, overlap_width_ratio=0.2, verbose=0,
        )
        balls = []
        persons = []
        for obj in pred.object_prediction_list:
            bb = obj.bbox
            if obj.category.id == SPORTS_BALL_CLASS_ID:
                balls.append(((bb.minx + bb.maxx) / 2.0, (bb.miny + bb.maxy) / 2.0, float(obj.score.value)))
            elif obj.category.id == PERSON_CLASS_ID:
                persons.append((bb.minx, bb.miny, bb.maxx, bb.maxy))

        if balls:
            ball_seen += 1
            bx, by, bconf = max(balls, key=lambda b: b[2])
            interaction = False
            target_match = 0.0
            for (x1, y1, x2, y2) in persons:
                ex = (x2 - x1) * 0.3
                ey = (y2 - y1) * 0.25
                if (x1 - ex) <= bx <= (x2 + ex) and (y1 - ey) <= by <= (y2 + ey):
                    interaction = True
                    crop = frame[max(0, int(y1)):int(y2), max(0, int(x1)):int(x2)]
                    kit = _color_score(crop, color_ranges)
                    zone = _position_zone_score(position, (x1 + x2) / 2.0 / w, (y1 + y2) / 2.0 / h)
                    target_match = max(target_match, kit * 0.5 + zone * 0.5)
            events.append({"t": round(t, 2), "ballConf": round(bconf, 3),
                           "interaction": interaction, "targetMatch": round(target_match, 3)})
        t += step_sec

    cap.release()

    focus = [e for e in events if e["interaction"]] or events
    if not focus:
        return {"available": True, "candidates": [], "ballSeenFrames": ball_seen, "sampledEvents": len(events)}

    groups = [[focus[0]]]
    for e in focus[1:]:
        if e["t"] - groups[-1][-1]["t"] <= merge_gap:
            groups[-1].append(e)
        else:
            groups.append([e])

    candidates = []
    for i, g in enumerate(groups):
        start = max(0.0, g[0]["t"] - pre_roll)
        end = min(duration, g[-1]["t"] + post_roll)
        ball_frames = len(g)
        inter_frames = sum(1 for x in g if x["interaction"])
        avg_conf = sum(x["ballConf"] for x in g) / ball_frames
        target_avg = sum(x["targetMatch"] for x in g) / ball_frames
        candidates.append({
            "id": f"gpu-{i:04d}",
            "startSec": round(start, 2),
            "endSec": round(end, 2),
            "startTime": _sec_to_mmss(start),
            "endTime": _sec_to_mmss(end),
            "ballFrames": ball_frames,
            "interactionFrames": inter_frames,
            "avgBallConfidence": round(avg_conf, 3),
            "targetMatchAvg": round(target_avg, 3),
            "durationSec": round(end - start, 2),
        })

    candidates.sort(key=lambda c: (c["interactionFrames"], c["targetMatchAvg"], c["avgBallConfidence"]), reverse=True)
    return {"available": True, "candidates": candidates[:15],
            "ballSeenFrames": ball_seen, "sampledEvents": len(events)}


# ---------------------------------------------------------------------------
# 엔드포인트
# ---------------------------------------------------------------------------
def _check_auth(token: str):
    from fastapi import HTTPException

    expected = os.environ.get("GPU_AUTH_TOKEN", "")
    if not expected:
        # 시크릿 미설정 시에는 인증 생략(개발 편의). 운영에선 반드시 설정 권장.
        return
    if token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


@app.function(
    image=image,
    gpu="T4",
    timeout=1500,
    secrets=[modal.Secret.from_name("soccer-gpu-auth")],
)
@modal.fastapi_endpoint(method="POST")
def analyze(req: "AnalyzeRequest"):
    import tempfile
    import time

    _check_auth(req.authToken)

    started = time.time()
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp_path = tmp.name
    tmp.close()

    out = {"success": True, "source": "modal-gpu"}
    try:
        _download_video(req.videoUrl, tmp_path)

        player = req.player.model_dump() if hasattr(req.player, "model_dump") else dict(req.player)

        if req.detectCandidates:
            out["candidates"] = _detect_candidates(
                tmp_path, player, req.candidateFps, req.preRoll, req.postRoll, req.mergeGap,
            )

        tracking = _track_player(
            tmp_path, player, req.sampleFps, req.assumedPlayerHeightM, req.maxTrackSeconds,
            center_seed=req.centerSeed, seed_seconds=req.seedSeconds,
        )
        out["tracking"] = tracking

        if req.sahi and req.clips:
            clips = [c.model_dump() for c in req.clips]
            out["ball"] = _detect_ball_sahi(tmp_path, clips, req.sampleFps)
    except Exception as e:  # noqa: BLE001
        out["success"] = False
        out["error"] = f"{type(e).__name__}: {e}"
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    out["elapsedSec"] = round(time.time() - started, 1)
    return out


@app.function(image=image)
@modal.fastapi_endpoint(method="GET")
def hello():
    """연결 확인용. 배포 후 브라우저로 열어 200 확인."""
    return {"ok": True, "service": APP_NAME, "model": DETECT_MODEL}
