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
from functools import lru_cache
from typing import List, Optional

import modal

APP_NAME = "soccer-gpu"

# 사람/추적용 검출 모델: 정확도 향상을 위해 11m 사용 (s보다 작은·먼 선수 검출 우수)
DETECT_MODEL = os.environ.get("SOCCER_YOLO_MODEL", "yolo11m.pt")

# 공 전용 모델: 축구공만 학습된 공개 모델(YOLO11n, 단일 클래스 "ball").
# 일반 COCO 모델보다 야간/원경 축구공 인식이 좋다. 빈 값이면 COCO 모델로 폴백.
BALL_MODEL = os.environ.get(
    "SOCCER_BALL_MODEL",
    "https://huggingface.co/martinjolif/yolo-football-ball-detection/resolve/main/yolo-football-ball-detection.pt",
)
BALL_CLASS_ID = int(os.environ.get("SOCCER_BALL_CLASS_ID", "0"))
BALL_MODEL_LOCAL = "/root/models/ball.pt"  # URL 모델을 빌드 시 받아두는 경로

PERSON_CLASS_ID = 0
SPORTS_BALL_CLASS_ID = 32


def _resolve_ball_model():
    """공 검출에 쓸 (모델경로, 공클래스ID) 반환. 우선순위: 파인튜닝 > 전용 > COCO."""
    ft = _finetuned()
    if ft and ft["ball"] is not None:
        return ft["path"], ft["ball"]
    if not BALL_MODEL:
        return DETECT_MODEL, SPORTS_BALL_CLASS_ID
    if BALL_MODEL.startswith("http"):
        return BALL_MODEL_LOCAL, BALL_CLASS_ID
    return BALL_MODEL, BALL_CLASS_ID


def _resolve_person_model():
    """선수 검출/추적에 쓸 (모델경로, 선수클래스ID) 반환. 파인튜닝 우선."""
    ft = _finetuned()
    if ft and ft["player"] is not None:
        return ft["path"], ft["player"]
    return DETECT_MODEL, PERSON_CLASS_ID


# 파인튜닝 모델(우리 전용)은 볼륨 /models 에 저장됨. 검증 후 SOCCER_USE_FINETUNED=1 로 활성화.
FINETUNED_PATH = os.environ.get("SOCCER_FINETUNED_MODEL", "/models/soccer_best.pt")
USE_FINETUNED = os.environ.get("SOCCER_USE_FINETUNED", "") == "1"


@lru_cache(maxsize=1)
def _finetuned():
    """파인튜닝 모델이 있으면 {path, player, ball, names} 반환, 없으면 None."""
    if not USE_FINETUNED or not FINETUNED_PATH or not os.path.exists(FINETUNED_PATH):
        return None
    from ultralytics import YOLO

    names = {int(k): str(v).lower() for k, v in YOLO(FINETUNED_PATH).names.items()}
    player_id = next(
        (i for i, n in names.items() if n in ("player", "person", "goalkeeper")), None
    )
    ball_id = next((i for i, n in names.items() if n == "ball" or "ball" in n), None)
    return {"path": FINETUNED_PATH, "player": player_id, "ball": ball_id, "names": names}


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
    import os as _os

    from ultralytics import YOLO

    YOLO(DETECT_MODEL)

    # 공 전용 모델(URL)이면 빌드 시점에 받아 이미지에 굽는다.
    if BALL_MODEL and BALL_MODEL.startswith("http"):
        import requests

        _os.makedirs(_os.path.dirname(BALL_MODEL_LOCAL), exist_ok=True)
        if not _os.path.exists(BALL_MODEL_LOCAL):
            resp = requests.get(BALL_MODEL, timeout=600)
            resp.raise_for_status()
            with open(BALL_MODEL_LOCAL, "wb") as f:
                f.write(resp.content)
        YOLO(BALL_MODEL_LOCAL)


image = image.run_function(_preload_models)

app = modal.App(APP_NAME)

# 파인튜닝 모델 저장 볼륨(train_soccer.py가 여기에 soccer_best.pt 저장)
models_volume = modal.Volume.from_name("soccer-models", create_if_missing=True)


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
        # 수동 시드(업로드 영상에서 사용자가 직접 탭한 위치). seedNx>=0 이면 활성.
        seedTimeSec: float = -1.0  # 사용자가 탭한 프레임의 시각(초)
        seedNx: float = -1.0  # 탭 위치 x (전체 프레임 기준 0~1)
        seedNy: float = -1.0  # 탭 위치 y (전체 프레임 기준 0~1)
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
def _write_reid_tracker() -> str:
    """BoT-SORT + ReID(외형모델) 트래커 설정 파일을 생성하고 경로를 반환.

    환경변수로 정확도/비용 튜닝:
      SOCCER_REID_MODEL  : ReID 특징용 YOLO 가중치 경로. 미지정 시 'auto'(탐지모델 특징 사용).
      SOCCER_TRACK_BUFFER: 끊긴 트랙 유지 프레임수(기본 90, 클수록 가림에 강함).
    """
    import os
    import tempfile

    reid_model = os.environ.get("SOCCER_REID_MODEL", "auto")
    track_buffer = os.environ.get("SOCCER_TRACK_BUFFER", "90")
    cfg = (
        "tracker_type: botsort\n"
        "track_high_thresh: 0.25\n"
        "track_low_thresh: 0.1\n"
        "new_track_thresh: 0.25\n"
        f"track_buffer: {track_buffer}\n"   # 끊긴 트랙을 더 오래 유지(가림/줌에 강함)
        "match_thresh: 0.8\n"
        "fuse_score: true\n"
        "gmc_method: sparseOptFlow\n"
        "proximity_thresh: 0.5\n"
        "appearance_thresh: 0.2\n"          # 외형 가중 ↑ → 같은 팀 교차 시 스위치 ↓
        "with_reid: true\n"                  # 외형 임베딩으로 ID 유지
        f"model: {reid_model}\n"
    )
    f = tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False)
    f.write(cfg)
    f.close()
    return f.name


def _track_player(video_path: str, player: dict, sample_fps: float,
                  assumed_height_m: float, max_seconds: float,
                  center_seed: bool = True, seed_seconds: float = 3.0,
                  seed_point: tuple = None) -> dict:
    import cv2
    import numpy as np
    from ultralytics import YOLO

    person_model_path, person_class = _resolve_person_model()
    model = YOLO(person_model_path)
    tracker_cfg = _write_reid_tracker()  # ReID 우선, 실패 시 기본 트래커로 폴백
    reid_active = True
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

    def _crop_hist(crop):
        """크롭의 HSV(H-S) 색 히스토그램 — 재포착용 외형 시그니처."""
        if crop is None or crop.size == 0:
            return None
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        h = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
        cv2.normalize(h, h, 0, 1, cv2.NORM_MINMAX)
        return h

    # track_id -> {pts:[(t,x,y,h)], scores:[], seed:[], hist, histw}
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

        # BoT-SORT(+ReID) 추적. ReID 미지원 환경이면 기본 트래커로 폴백.
        try:
            res = model.track(
                source=frame, persist=True, tracker=tracker_cfg,
                classes=[person_class], conf=0.25, imgsz=960, verbose=False,
            )[0]
        except Exception:
            if reid_active:
                reid_active = False
                tracker_cfg = "botsort.yaml"
                model = YOLO(person_model_path)  # 트래커 상태 초기화
                prev_gray = gray
                frame_idx += 1
                continue
            raise

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

            rec = tracks.setdefault(
                tid, {"pts": [], "scores": [], "seed": [], "mseed": [], "hist": None, "histw": 0.0}
            )
            rec["pts"].append((t, sx, sy, box_h))
            rec["scores"].append(match)

            # 외형 시그니처 누적(박스 면적 가중 → 클로즈업 프레임이 시그니처를 주도)
            hgram = _crop_hist(crop)
            if hgram is not None:
                area = float(max(1.0, (x2 - x1)) * box_h)
                rec["hist"] = hgram * area if rec["hist"] is None else rec["hist"] + hgram * area
                rec["histw"] += area

            # 중앙 지목 점수: 시작 구간에 화면 중앙 + 크게(앞쪽) 잡힌 선수일수록 높음
            if center_seed and t <= seed_seconds:
                dcx = abs(nx - 0.5)
                dcy = abs(ny - 0.5)
                radial = (dcx * dcx + dcy * dcy) ** 0.5
                closeness = max(0.0, 1.0 - radial / 0.5)  # 중앙=1, 가장자리=0
                size_norm = min(1.0, (box_h / frame_h) / 0.6)  # 화면 높이 60%면 만점
                rec["seed"].append(closeness * (0.6 + 0.4 * size_norm))

            # 수동 시드 점수: 사용자가 탭한 시각 근처에서, 탭 위치가 박스 안/근처면 높음
            if seed_point is not None:
                s_time, s_nx, s_ny = seed_point
                if abs(t - s_time) <= max(0.5, dt * 1.5):
                    bx1, by1 = x1 / frame_w, y1 / frame_h
                    bx2, by2 = x2 / frame_w, y2 / frame_h
                    inside = (bx1 <= s_nx <= bx2) and (by1 <= s_ny <= by2)
                    bcx, bcy = (bx1 + bx2) / 2.0, (by1 + by2) / 2.0
                    d = ((s_nx - bcx) ** 2 + (s_ny - bcy) ** 2) ** 0.5
                    prox = max(0.0, 1.0 - d / 0.25)  # 박스중심 가까울수록 1
                    # 박스 안이면 강한 보너스, 시각 일치도 가중
                    time_w = max(0.0, 1.0 - abs(t - s_time) / max(0.5, dt * 1.5))
                    rec["mseed"].append((1.0 if inside else prox * 0.6) * (0.5 + 0.5 * time_w))

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
    # 0순위: 수동 시드(사용자가 직접 탭한 선수) — 가장 신뢰도 높음
    mseeded = {
        tid: r for tid, r in tracks.items()
        if r.get("mseed") and sum(r["mseed"]) > 0
    }
    seeded = {
        tid: r for tid, r in tracks.items()
        if r.get("seed") and len(r["seed"]) >= 2
    }
    if seed_point is not None and mseeded:
        def mseed_rank(item):
            _tid, r = item
            return (sum(r["mseed"]), len(r["pts"]))

        target_id, target = max(mseeded.items(), key=mseed_rank)
        seed_select = "manual_seed"
    elif center_seed and seeded:
        def seed_rank(item):
            _tid, r = item
            s = r["seed"]
            return (sum(s) / len(s), len(r["pts"]))

        target_id, target = max(seeded.items(), key=seed_rank)
        seed_select = "center_seed"
    else:
        target_id, target = max(tracks.items(), key=track_rank)

    # ── 재포착(re-acquisition) ──────────────────────────────────────────────
    # 줌 아웃 등으로 대상 트랙 ID가 끊기면, 클로즈업에서 기억한 외형(색 히스토그램)과
    # 가장 비슷하고 끊긴 위치 근처/직후에 등장한 트랙을 같은 선수로 이어붙인다.
    def _sig(r):
        h = r.get("hist")
        if h is None or r.get("histw", 0) <= 0:
            return None
        s = h.copy()
        cv2.normalize(s, s, 0, 1, cv2.NORM_MINMAX)
        return s

    target_sig = _sig(target)
    used = {target_id}
    chain = list(target["pts"])  # (t,sx,sy,h), 시간순 적재됨
    reacquired = 0
    APPEAR_THR = 0.5   # 색 히스토그램 상관 임계(보수적)
    MAX_GAP = 3.0      # 끊긴 뒤 이만큼(초) 내에 다시 나타나야 이어붙임

    if target_sig is not None:
        while reacquired < 8:
            last_t, last_x, last_y = chain[-1][0], chain[-1][1], chain[-1][2]
            if duration and last_t >= duration - dt:
                break
            best = None
            best_sim = APPEAR_THR
            for tid, r in tracks.items():
                if tid in used or not r["pts"]:
                    continue
                start_t = r["pts"][0][0]
                gap = start_t - last_t
                if gap < -2 * dt or gap > MAX_GAP:
                    continue
                sig = _sig(r)
                if sig is None:
                    continue
                sim = float(cv2.compareHist(target_sig, sig, cv2.HISTCMP_CORREL))
                if sim < best_sim:
                    continue
                sx0, sy0 = r["pts"][0][1], r["pts"][0][2]
                if ((sx0 - last_x) ** 2 + (sy0 - last_y) ** 2) ** 0.5 > frame_w * 1.5:
                    continue  # 잃어버린 위치에서 너무 멀면 제외
                best_sim = sim
                best = (tid, r)
            if not best:
                break
            btid, br = best
            used.add(btid)
            chain.extend(br["pts"])
            reacquired += 1
        chain.sort(key=lambda p: p[0])

    pts = chain
    if len(pts) < 3:
        return {"available": False, "reason": "target_track_too_short", "trackId": int(target_id)}

    # 지표 계산에선 등록용 클로즈업 구간(시작 seed_seconds)은 제외 → 실제 플레이만 반영
    if seed_select == "center_seed":
        metric_pts = [p for p in pts if p[0] > seed_seconds]
        if len(metric_pts) < 3:
            metric_pts = pts
    else:
        metric_pts = pts

    median_h = float(np.median([p[3] for p in metric_pts]))
    meters_per_px = assumed_height_m / median_h if median_h > 0 else 0.0

    # 이동거리/속도: 안정화 좌표 변위 * 스케일, 비현실적 점프는 클램프
    dist_m = 0.0
    speeds = []  # (t, speed_m_s)
    max_step_m = 12.0 * dt  # 12 m/s 상한
    for i in range(1, len(metric_pts)):
        t0, x0, y0, _h0 = metric_pts[i - 1]
        t1, x1, y1, _h1 = metric_pts[i]
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
    xs = np.array([p[1] for p in metric_pts])
    ys = np.array([p[2] for p in metric_pts])
    xmin, xmax = float(xs.min()), float(xs.max())
    ymin, ymax = float(ys.min()), float(ys.max())
    span_x = max(1.0, xmax - xmin)
    span_y = max(1.0, ymax - ymin)
    grid = [[0 for _ in range(cols)] for _ in range(rows)]
    for p in metric_pts:
        x, y = p[1], p[2]
        gx = min(cols - 1, int((x - xmin) / span_x * cols))
        gy = min(rows - 1, int((y - ymin) / span_y * rows))
        grid[gy][gx] += 1

    return {
        "available": True,
        "trackId": int(target_id),
        "targetSelectedBy": seed_select,  # center_seed | kit_zone
        "reidActive": reid_active,        # BoT-SORT ReID(외형모델) 적용 여부
        "reacquireCount": reacquired,     # 줌 등으로 끊긴 뒤 외형으로 다시 이어붙인 횟수
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

    ball_model_path, ball_class = _resolve_ball_model()
    det_model = AutoDetectionModel.from_pretrained(
        model_type="ultralytics",
        model_path=ball_model_path,
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
                if obj.category.id == ball_class:
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


def _calc_hist(crop):
    """HSV(H,S) 색 히스토그램 — 선수 외형 시그니처(crop이 None이면 None)."""
    import cv2
    if crop is None or crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(h, h, 0, 1, cv2.NORM_MINMAX)
    return h


def _extract_target_hist(video_path: str, fps: float, seed_point: tuple,
                         person_model, person_class: int) -> "tuple | None":
    """seed_point(timeSec, nx, ny) 위치에서 가장 가까운 선수의 외형 히스토그램과 크기를 반환."""
    import cv2
    cap = cv2.VideoCapture(video_path)
    seed_t, seed_nx, seed_ny = seed_point
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(seed_t * fps))
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        return None
    H, W = frame.shape[:2]
    res = person_model.predict(source=frame, classes=[person_class], conf=0.2, imgsz=960, verbose=False)[0]
    if res.boxes is None or len(res.boxes) == 0:
        return None
    best_box, best_dist = None, 0.35  # 최대 35% 대각선 거리
    for b in res.boxes.xyxy.cpu().numpy():
        x1, y1, x2, y2 = b
        bcx, bcy = (x1 + x2) / 2.0 / W, (y1 + y2) / 2.0 / H
        d = ((bcx - seed_nx) ** 2 + (bcy - seed_ny) ** 2) ** 0.5
        if d < best_dist:
            best_dist, best_box = d, b
    if best_box is None:
        return None
    x1, y1, x2, y2 = best_box
    crop = frame[max(0, int(y1)):int(y2), max(0, int(x1)):int(x2)]
    hist = _calc_hist(crop)
    if hist is None:
        return None
    box_h = float(y2 - y1)
    return hist, box_h  # (히스토그램, 참조 박스 높이)


def _detect_candidates(video_path: str, player: dict, sample_fps: float,
                       pre_roll: float, post_roll: float, merge_gap: float,
                       seed_point=None) -> dict:
    """공-선수 상호작용 후보 탐지.
    seed_point(timeSec, nx, ny) 가 있으면 탭한 선수와 외형이 맞는 장면만 포함.
    없으면 색/포지션 매칭 점수 기반(기존 동작).
    """
    import cv2
    from sahi import AutoDetectionModel
    from sahi.predict import get_sliced_prediction
    from ultralytics import YOLO

    # 공: 전용 모델 + SAHI(작은 공 정밀). 선수: 큰 객체라 전체프레임 일반 검출로 충분(빠름).
    ball_model_path, ball_class = _resolve_ball_model()
    ball_det = AutoDetectionModel.from_pretrained(
        model_type="ultralytics",
        model_path=ball_model_path,
        confidence_threshold=0.12,
        device="cuda:0",
    )
    person_model_path, person_class = _resolve_person_model()
    person_model = YOLO(person_model_path)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"available": False, "reason": "cannot_open_video"}
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total / fps if fps > 0 and total > 0 else 0.0

    color_ranges = _color_ranges(f"{player.get('uniformColor','')} {player.get('traits','')}")
    position = player.get("position", "")
    step_sec = 1.0 / max(0.5, sample_fps)

    # 수동 시드가 있으면 탭 시점 외형 히스토그램을 추출해 타깃 식별에 활용
    seed_hist = None
    seed_ref_h = None
    if seed_point is not None:
        result = _extract_target_hist(video_path, fps, seed_point, person_model, person_class)
        if result is not None:
            seed_hist, seed_ref_h = result
            print(f"[cand] 타깃 히스토그램 추출 성공 (참조박스 높이={seed_ref_h:.1f}px)")
        else:
            print("[cand] 타깃 히스토그램 추출 실패 — 색/포지션 매칭으로 폴백")

    def _person_target_score(crop, x1, y1, x2, y2, frame_w, frame_h):
        """이 사람이 '탭한 선수'일 확률(0~1). seed_hist 있으면 히스토그램 우선."""
        import cv2 as _cv2
        if seed_hist is not None and crop is not None and crop.size > 0:
            h = _calc_hist(crop)
            if h is not None:
                sim = float(_cv2.compareHist(seed_hist, h, _cv2.HISTCMP_CORREL))
                # 히스토그램 매칭이 0.35 미만이면 다른 선수 가능성 높음
                if sim < 0.2:
                    return 0.0  # 명백히 다른 선수
                return min(1.0, (sim + 0.3) / 1.3)  # 0.2→0.38, 1.0→1.0
        # 시드 없음: 색+포지션 매칭(기존)
        kit = _color_score(crop, color_ranges) if color_ranges else 0.0
        zone = _position_zone_score(position, (x1 + x2) / 2.0 / frame_w, (y1 + y2) / 2.0 / frame_h)
        return kit * 0.5 + zone * 0.5

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
            frame, ball_det,
            slice_height=max(256, h // 2), slice_width=max(256, w // 2),
            overlap_height_ratio=0.2, overlap_width_ratio=0.2, verbose=0,
        )
        balls = []
        for obj in pred.object_prediction_list:
            if obj.category.id == ball_class:
                bb = obj.bbox
                balls.append(((bb.minx + bb.maxx) / 2.0, (bb.miny + bb.maxy) / 2.0, float(obj.score.value)))

        persons = []
        pres = person_model.predict(
            frame, classes=[person_class], conf=0.25, imgsz=960, verbose=False,
        )[0]
        if pres.boxes is not None:
            for b in pres.boxes.xyxy.cpu().numpy():
                persons.append((float(b[0]), float(b[1]), float(b[2]), float(b[3])))

        if balls:
            ball_seen += 1
            bx, by, bconf = max(balls, key=lambda b: b[2])
            interaction = False
            target_match = 0.0
            for (x1, y1, x2, y2) in persons:
                ex = (x2 - x1) * 0.3
                ey = (y2 - y1) * 0.25
                if (x1 - ex) <= bx <= (x2 + ex) and (y1 - ey) <= by <= (y2 + ey):
                    crop = frame[max(0, int(y1)):int(y2), max(0, int(x1)):int(x2)]
                    score = _person_target_score(crop, x1, y1, x2, y2, w, h)
                    if score > 0.0:  # seed_hist 있을 때 명백히 다른 선수(0.0)는 제외
                        interaction = True
                        target_match = max(target_match, score)
            events.append({"t": round(t, 2), "ballConf": round(bconf, 3),
                           "interaction": interaction, "targetMatch": round(target_match, 3)})
        t += step_sec

    cap.release()

    # seed가 있으면 타깃 매칭 이벤트만, 없으면 기존대로 상호작용 이벤트 우선
    if seed_hist is not None:
        focus = [e for e in events if e["interaction"] and e["targetMatch"] >= 0.25]
        if not focus:  # 타깃 매칭이 너무 엄격하면 임계 낮춰서 재시도
            focus = [e for e in events if e["interaction"]] or events
    else:
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
    gpu=["L4", "A10G", "T4"],  # L4 우선, 자리 없으면 A10G→T4로 자동 폴백(대기열 방지)
    timeout=1500,
    secrets=[modal.Secret.from_name("soccer-gpu-auth")],
    volumes={"/models": models_volume},  # 파인튜닝 모델(soccer_best.pt) 읽기용
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

    out = {"success": True, "source": "modal-gpu",
           "detector": "finetuned" if _finetuned() else "default"}
    try:
        _download_video(req.videoUrl, tmp_path)

        player = req.player.model_dump() if hasattr(req.player, "model_dump") else dict(req.player)

        seed_point = None
        if req.seedNx >= 0 and req.seedNy >= 0:
            seed_point = (max(0.0, req.seedTimeSec), req.seedNx, req.seedNy)

        if req.detectCandidates:
            out["candidates"] = _detect_candidates(
                tmp_path, player, req.candidateFps, req.preRoll, req.postRoll, req.mergeGap,
                seed_point=seed_point,  # 탭한 선수 위치 → 그 선수 외형으로 클립 필터링
            )

        tracking = _track_player(
            tmp_path, player, req.sampleFps, req.assumedPlayerHeightM, req.maxTrackSeconds,
            center_seed=req.centerSeed, seed_seconds=req.seedSeconds,
            seed_point=seed_point,
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
