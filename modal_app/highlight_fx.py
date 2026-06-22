"""
하이라이트 강조 효과 렌더러 (스포트라이트 / 빛기둥콘 + 이름바).

타깃 선수를 추적해 영상 위에 강조 효과를 입힌다.
- demo(): 공개 샘플 축구 클립으로 spotlight/cone 두 버전을 렌더 + 미리보기 프레임 추출.
  결과는 Modal 볼륨 'soccer-models'의 /models/fx_demo/ 에 저장.

사용:
  modal run modal_app/highlight_fx.py::demo --seconds 8
  modal volume get soccer-models fx_demo ./fx_demo   # 로컬로 내려받기
"""

from __future__ import annotations

import modal

APP_NAME = "soccer-fx"
# 공개 축구 클립(roboflow/sports, DFL Bundesliga) — Google Drive
SAMPLE_GDRIVE_ID = "19PGw55V8aA6GZu5-Aac5_9mCy3fNxmEf"
DETECT_MODEL = "yolo11m.pt"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "ffmpeg")
    .pip_install(
        "ultralytics==8.3.58",
        "opencv-python-headless==4.10.0.84",
        "numpy<2",
        "lap==0.5.12",
        "gdown==5.2.0",
    )
)

volume = modal.Volume.from_name("soccer-models", create_if_missing=True)
app = modal.App(APP_NAME)


def _download(gdrive_id: str, path: str):
    import gdown

    gdown.download(id=gdrive_id, output=path, quiet=False)


def _track_target(video_path: str, seconds: float):
    """프레임별 타깃 선수 중심(cx,cy,h)을 반환. 처음 구간 중앙 선수를 타깃으로 잠금."""
    import cv2
    import numpy as np
    from ultralytics import YOLO

    model = YOLO(DETECT_MODEL)
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    max_frames = int(fps * seconds)
    seed_frames = int(fps * 2.0)
    cx0, cy0 = W / 2.0, H / 2.0

    per_frame = []   # list of {id: (cx,cy,h)}
    seed_score = {}  # id -> accumulated centrality*size
    idx = 0
    while idx < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        res = model.track(
            source=frame, persist=True, tracker="botsort.yaml",
            classes=[0], conf=0.25, imgsz=960, verbose=False,
        )[0]
        boxes = {}
        if res.boxes is not None and res.boxes.id is not None:
            xyxy = res.boxes.xyxy.cpu().numpy()
            ids = res.boxes.id.cpu().numpy().astype(int)
            for (x1, y1, x2, y2), tid in zip(xyxy, ids):
                cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
                h = y2 - y1
                boxes[int(tid)] = (cx, cy, h)
                if idx < seed_frames:
                    d = np.hypot((cx - cx0) / W, (cy - cy0) / H)
                    seed_score[int(tid)] = seed_score.get(int(tid), 0.0) + (
                        (1.0 - min(d, 1.0)) * (h / H)
                    )
        per_frame.append(boxes)
        idx += 1
    cap.release()

    if not seed_score:
        return None, fps, W, H, len(per_frame)
    target_id = max(seed_score, key=seed_score.get)

    # 프레임별 타깃 좌표(없으면 직전 유지) + EMA 스무딩
    centers = []
    last = None
    for boxes in per_frame:
        if target_id in boxes:
            last = boxes[target_id]
        centers.append(last)
    sm = []
    ema = None
    for c in centers:
        if c is None:
            sm.append(ema)
            continue
        if ema is None:
            ema = c
        else:
            a = 0.35
            ema = (a * c[0] + (1 - a) * ema[0],
                   a * c[1] + (1 - a) * ema[1],
                   a * c[2] + (1 - a) * ema[2])
        sm.append(ema)
    return sm, fps, W, H, len(per_frame)


def _draw_namebar(frame, text: str):
    import cv2

    H, W = frame.shape[:2]
    bar_h = max(48, int(H * 0.085))
    y0 = H - bar_h
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, y0), (int(W * 0.46), H), (12, 12, 12), -1)
    cv2.rectangle(overlay, (0, y0), (8, H), (2, 159, 255), -1)  # 주황 액센트 (BGR)
    cv2.addWeighted(overlay, 0.78, frame, 0.22, 0, frame)
    cv2.putText(frame, text, (24, y0 + int(bar_h * 0.62)),
                cv2.FONT_HERSHEY_DUPLEX, max(0.7, H / 900.0), (255, 255, 255), 2,
                cv2.LINE_AA)


def _render(video_path: str, out_path: str, centers, fps, W, H, style: str,
            name_text: str):
    import cv2
    import numpy as np

    cap = cv2.VideoCapture(video_path)
    tmp = out_path + ".raw.mp4"
    vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok or idx >= len(centers):
            break
        c = centers[idx]
        frame = frame.astype(np.float32)
        if c is not None:
            cx, cy, h = c
            radius = max(70.0, h * 1.5)
            if style == "spotlight":
                dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
                mask = np.clip(1.0 - (dist - radius) / (radius * 0.9), 0.0, 1.0)
                mask = mask[..., None]
                dark = frame * 0.32
                frame = frame * mask + dark * (1.0 - mask)
                cv2.circle(frame, (int(cx), int(cy)), int(radius),
                           (255, 255, 255), 2, cv2.LINE_AA)
            elif style == "cone":
                # 위에서 내려오는 빛기둥 + 발밑 글로우
                frame *= 0.5
                beam = np.zeros((H, W), np.float32)
                top_half = max(20, int(radius * 0.35))
                base_half = max(60, int(radius * 1.25))
                feet_y = int(min(H - 1, cy + h * 0.55))
                pts = np.array([
                    [int(cx - top_half), 0], [int(cx + top_half), 0],
                    [int(cx + base_half), feet_y], [int(cx - base_half), feet_y],
                ], np.int32)
                cv2.fillConvexPoly(beam, pts, 1.0)
                beam = cv2.GaussianBlur(beam, (0, 0), sigmaX=max(8, W / 90.0))
                grad = np.clip(1.0 - (yy / max(feet_y, 1)), 0.15, 1.0)
                beam = (beam * grad)[..., None]
                glow = np.zeros((H, W), np.float32)
                cv2.ellipse(glow, (int(cx), feet_y),
                            (int(base_half * 0.8), int(h * 0.22)), 0, 0, 360, 1.0, -1)
                glow = cv2.GaussianBlur(glow, (0, 0), sigmaX=max(6, W / 110.0))[..., None]
                light = np.clip(beam + glow * 0.9, 0.0, 1.0)
                white = np.full_like(frame, 255.0)
                frame = frame * (1.0 - light * 0.55) + white * (light * 0.55)
        frame = np.clip(frame, 0, 255).astype(np.uint8)
        _draw_namebar(frame, name_text)
        vw.write(frame)
        idx += 1
    cap.release()
    vw.release()

    import subprocess
    subprocess.run([
        "ffmpeg", "-y", "-i", tmp, "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", out_path,
    ], check=True, capture_output=True)
    import os
    os.remove(tmp)


@app.function(image=image, gpu="L4", timeout=1200, volumes={"/models": volume})
def demo(seconds: float = 8.0):
    import os

    import cv2

    os.makedirs("/models/fx_demo", exist_ok=True)
    src = "/tmp/soccer.mp4"
    _download(SAMPLE_GDRIVE_ID, src)

    centers, fps, W, H, n = _track_target(src, seconds)
    if centers is None:
        return {"ok": False, "error": "타깃을 찾지 못함"}

    name = "TARGET PLAYER  #7"
    outputs = {}
    for style in ("spotlight", "cone"):
        out = f"/models/fx_demo/{style}.mp4"
        _render(src, out, centers, fps, W, H, style, name)
        outputs[style] = out
        # 미리보기 프레임 3장 추출
        cap = cv2.VideoCapture(out)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        for j, frac in enumerate((0.3, 0.55, 0.8)):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * frac))
            ok, fr = cap.read()
            if ok:
                cv2.imwrite(f"/models/fx_demo/{style}_{j+1}.jpg", fr)
        cap.release()

    volume.commit()
    return {"ok": True, "fps": fps, "size": [W, H], "frames": n, "outputs": outputs}
