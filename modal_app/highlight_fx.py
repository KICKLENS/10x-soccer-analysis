"""
하이라이트 최종 렌더러 (소개 카드 인트로 + 클립별 스포트라이트 + 이어붙이기).

- render_highlights (web endpoint): {clips:[url...], profile:{...}, style} → 완성본 mp4 바이너리 반환.
  서버가 잘라둔 하이라이트 클립 URL들을 받아, 타깃 선수를 추적해 스포트라이트를 입히고,
  맨 앞에 선수 소개 카드(PLAYER REVIEW)를 붙여 하나의 완성본으로 만든다.
- demo_full(): 공개 축구 클립으로 완성본을 만들어 미리보기(프레임+영상)를 볼륨에 저장.

사용:
  modal run modal_app/highlight_fx.py::demo_full
  modal volume get soccer-models reel_demo ./reel_demo
  modal deploy modal_app/highlight_fx.py
"""

from __future__ import annotations

import modal

APP_NAME = "soccer-fx"
SAMPLE_GDRIVE_ID = "19PGw55V8aA6GZu5-Aac5_9mCy3fNxmEf"  # DFL Bundesliga 클립
DETECT_MODEL = "yolo11m.pt"
TARGET_W, TARGET_H, TARGET_FPS = 1280, 720, 30
FONT_BOLD = "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"
FONT_REG = "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "ffmpeg", "fonts-nanum")
    .pip_install(
        "ultralytics==8.3.58",
        "opencv-python-headless==4.10.0.84",
        "numpy<2",
        "lap==0.5.12",
        "gdown==5.2.0",
        "pillow==10.4.0",
        "fastapi[standard]==0.115.4",
    )
)

volume = modal.Volume.from_name("soccer-models", create_if_missing=True)
app = modal.App(APP_NAME)


# ────────────────────────────── 유틸 ──────────────────────────────
def _run(args):
    import subprocess

    p = subprocess.run(args, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.decode("utf-8", "ignore")[-800:])


def _download_url(url: str, path: str):
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
        f.write(r.read())


def _gdrive(gid: str, path: str):
    import gdown

    gdown.download(id=gid, output=path, quiet=True)


def _age_from_dob(dob: str) -> str:
    from datetime import date

    try:
        y, m, d = (int(x) for x in dob.split("-"))
        today = date.today()
        return str(today.year - y - ((today.month, today.day) < (m, d)))
    except Exception:
        return "-"


# ─────────────────────────── 소개 카드 ───────────────────────────
def _draw_card(profile: dict):
    from PIL import Image, ImageDraw, ImageFont, ImageFilter

    ORANGE = (255, 159, 2)
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), (10, 10, 13))
    glow = Image.new("RGB", (W, H), (10, 10, 13))
    ImageDraw.Draw(glow).ellipse([W - 700, -300, W + 200, 500], fill=(40, 28, 6))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(160)), 0.6)

    # ── 훈련일지 스타일 풀 피치(탑다운 전체 코트 + 옅은 그리드) ──
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    LINE = (205, 222, 245, 24)   # 쿨 화이트(저널 라인 톤)
    GRID = (150, 180, 220, 8)    # 옅은 블루 그리드
    lw = 3
    for gx in range(0, W, 40):   # 그리드(훈련일지와 동일 40px)
        od.line([gx, 0, gx, H], fill=GRID, width=1)
    for gy in range(0, H, 40):
        od.line([0, gy, W, gy], fill=GRID, width=1)

    m = 70
    cy = H // 2
    od.rectangle([m, m, W - m, H - m], outline=LINE, width=lw)          # 외곽선
    od.line([W // 2, m, W // 2, H - m], fill=LINE, width=lw)            # 하프라인
    od.ellipse([W // 2 - 150, cy - 150, W // 2 + 150, cy + 150],
               outline=LINE, width=lw)                                   # 센터서클
    od.ellipse([W // 2 - 7, cy - 7, W // 2 + 7, cy + 7], fill=LINE)     # 센터스폿

    pbw, pbh, gbw, gbh = 250, 470, 95, 230  # 페널티박스 / 골에어리어
    # 좌측
    od.rectangle([m, cy - pbh // 2, m + pbw, cy + pbh // 2], outline=LINE, width=lw)
    od.rectangle([m, cy - gbh // 2, m + gbw, cy + gbh // 2], outline=LINE, width=lw)
    od.ellipse([m + 165, cy - 5, m + 175, cy + 5], fill=LINE)          # 페널티 스폿
    od.arc([m + pbw - 130, cy - 130, m + pbw + 130, cy + 130], start=-62, end=62,
           fill=LINE, width=lw)
    # 우측(대칭)
    od.rectangle([W - m - pbw, cy - pbh // 2, W - m, cy + pbh // 2], outline=LINE, width=lw)
    od.rectangle([W - m - gbw, cy - gbh // 2, W - m, cy + gbh // 2], outline=LINE, width=lw)
    od.ellipse([W - m - 175, cy - 5, W - m - 165, cy + 5], fill=LINE)
    od.arc([W - m - pbw - 130, cy - 130, W - m - pbw + 130, cy + 130], start=118, end=242,
           fill=LINE, width=lw)
    # 코너 아크
    cr = 30
    od.arc([m - cr, m - cr, m + cr, m + cr], 0, 90, fill=LINE, width=lw)
    od.arc([W - m - cr, m - cr, W - m + cr, m + cr], 90, 180, fill=LINE, width=lw)
    od.arc([m - cr, H - m - cr, m + cr, H - m + cr], 270, 360, fill=LINE, width=lw)
    od.arc([W - m - cr, H - m - cr, W - m + cr, H - m + cr], 180, 270, fill=LINE, width=lw)

    img = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")

    d = ImageDraw.Draw(img)

    def font(bold, size):
        return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

    name = profile.get("name") or "선수"
    number = str(profile.get("jerseyNumber") or "").strip()
    position = (profile.get("position") or "").strip()
    team = (profile.get("teamName") or "").strip()
    dob = (profile.get("dob") or "").strip()
    height = (profile.get("heightCm") or "").strip()
    weight = (profile.get("weightKg") or "").strip()
    nat = (profile.get("nationality") or "").strip()
    LX = 130

    d.rectangle([LX, 110, LX + 250, 158], fill=(255, 255, 255))
    d.text((LX + 18, 118), "PLAYER REVIEW", font=font(True, 26), fill=(10, 10, 13))
    if position:
        d.rounded_rectangle([LX, 188, LX + 130, 240], radius=8, outline=ORANGE, width=2)
        d.text((LX + 18, 197), position.upper()[:4], font=font(True, 28), fill=ORANGE)
    d.text((LX, 270), name, font=font(True, 110), fill=(255, 255, 255))
    if number:
        d.text((LX, 410), f"#{number}", font=font(True, 70), fill=ORANGE)

    iy = 540
    d.text((LX, iy), "GENERAL INFO", font=font(True, 40), fill=(255, 255, 255))
    d.line([LX, iy + 56, LX + 520, iy + 56], fill=(60, 60, 66), width=2)
    rows = [
        ("나이", f"{_age_from_dob(dob)}세" if dob else "-"),
        ("생년월일", dob or "-"),
        ("포지션", position or "-"),
        ("키 / 몸무게", f"{height or '-'}cm / {weight or '-'}kg"),
        ("소속팀", team or "-"),
        ("국적", nat or "-"),
    ]
    ry = iy + 80
    for label, value in rows:
        d.ellipse([LX, ry + 12, LX + 12, ry + 24], fill=ORANGE)
        d.text((LX + 30, ry), label, font=font(False, 30), fill=(170, 170, 176))
        d.text((LX + 300, ry), value, font=font(True, 32), fill=(255, 255, 255))
        ry += 66

    cx, cy, R = 1420, 430, 280
    d.ellipse([cx - R - 10, cy - R - 10, cx + R + 10, cy + R + 10], outline=ORANGE, width=10)
    photo_path = profile.get("_photo_path")
    drew_photo = False
    if photo_path:
        try:
            ph = Image.open(photo_path).convert("RGB")
            s = min(ph.size)
            ph = ph.crop(((ph.width - s) // 2, (ph.height - s) // 2,
                          (ph.width - s) // 2 + s, (ph.height - s) // 2 + s)).resize((2 * R, 2 * R))
            mask = Image.new("L", (2 * R, 2 * R), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, 2 * R, 2 * R], fill=255)
            img.paste(ph, (cx - R, cy - R), mask)
            drew_photo = True
        except Exception:
            drew_photo = False
    if not drew_photo:
        d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(28, 28, 33))
        f = font(True, 220)
        bb = d.textbbox((0, 0), name[:1], font=f)
        d.text((cx - (bb[2] - bb[0]) / 2, cy - (bb[3] - bb[1]) / 2 - 30), name[:1],
               font=f, fill=ORANGE)

    d.text((LX, 1010), "10X · AI SOCCER ANALYSIS", font=font(True, 24), fill=(110, 110, 116))
    return img


def _card_clip(profile: dict, out_path: str, seconds: float = 3.5):
    png = "/tmp/card.png"
    _draw_card(profile).save(png)
    _run([
        "ffmpeg", "-y", "-loop", "1", "-i", png, "-t", str(seconds),
        "-vf",
        f"scale={TARGET_W}:{TARGET_H},setsar=1,"
        f"zoompan=z='min(zoom+0.0006,1.08)':d={int(TARGET_FPS*seconds)}:"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={TARGET_W}x{TARGET_H}:fps={TARGET_FPS}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        "-crf", "21", out_path,
    ])


# ─────────────────────────── 추적 + 효과 ───────────────────────────
def _track_target(video_path: str, seconds: float = 600.0):
    import cv2
    import numpy as np
    from ultralytics import YOLO

    model = YOLO(DETECT_MODEL)
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    max_frames = int(fps * seconds)
    seed_frames = max(1, int(fps * 1.5))
    cx0, cy0 = W / 2.0, H / 2.0

    per_frame, seed_score, idx = [], {}, 0
    while idx < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        res = model.track(source=frame, persist=True, tracker="botsort.yaml",
                          classes=[0], conf=0.25, imgsz=960, verbose=False)[0]
        boxes = {}
        if res.boxes is not None and res.boxes.id is not None:
            xyxy = res.boxes.xyxy.cpu().numpy()
            ids = res.boxes.id.cpu().numpy().astype(int)
            for (x1, y1, x2, y2), tid in zip(xyxy, ids):
                cx, cy, h = (x1 + x2) / 2.0, (y1 + y2) / 2.0, y2 - y1
                boxes[int(tid)] = (cx, cy, h)
                if idx < seed_frames:
                    dd = np.hypot((cx - cx0) / W, (cy - cy0) / H)
                    seed_score[int(tid)] = seed_score.get(int(tid), 0.0) + (1.0 - min(dd, 1.0)) * (h / H)
        per_frame.append(boxes)
        idx += 1
    cap.release()
    if not seed_score:
        return None, fps, W, H, len(per_frame)
    target = max(seed_score, key=seed_score.get)

    centers, last, ema = [], None, None
    for boxes in per_frame:
        if target in boxes:
            last = boxes[target]
        if last is None:
            centers.append(None)
            continue
        ema = last if ema is None else (
            0.35 * last[0] + 0.65 * ema[0],
            0.35 * last[1] + 0.65 * ema[1],
            0.35 * last[2] + 0.65 * ema[2],
        )
        centers.append(ema)
    return centers, fps, W, H, len(per_frame)


def _name_text(profile: dict) -> str:
    name = (profile.get("name") or "선수").strip()
    number = str(profile.get("jerseyNumber") or "").strip()
    return f"{name}  #{number}" if number else name


def _render_spotlight(video_path: str, out_path: str, centers, fps, W, H, name_text: str):
    import cv2
    import numpy as np

    cap = cv2.VideoCapture(video_path)
    raw = out_path + ".raw.mp4"
    vw = cv2.VideoWriter(raw, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
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
            dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
            mask = np.clip(1.0 - (dist - radius) / (radius * 0.9), 0.0, 1.0)[..., None]
            frame = frame * mask + (frame * 0.32) * (1.0 - mask)
            cv2.circle(frame, (int(cx), int(cy)), int(radius), (255, 255, 255), 2, cv2.LINE_AA)
        vw.write(np.clip(frame, 0, 255).astype(np.uint8))
        idx += 1
    cap.release()
    vw.release()

    with open("/tmp/name.txt", "w") as f:
        f.write(name_text)
    vf = (
        f"scale={TARGET_W}:{TARGET_H},setsar=1,fps={TARGET_FPS},"
        f"drawbox=x=0:y=ih-70:w=iw*0.5:h=70:color=black@0.72:t=fill,"
        f"drawbox=x=0:y=ih-70:w=8:h=70:color=0xFF9F02:t=fill,"
        f"drawtext=fontfile={FONT_BOLD}:textfile=/tmp/name.txt:fontcolor=white:"
        f"fontsize=34:x=30:y=H-52"
    )
    _run(["ffmpeg", "-y", "-i", raw, "-vf", vf, "-c:v", "libx264",
          "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22", out_path])
    import os
    os.remove(raw)


def _normalize(video_path: str, out_path: str):
    _run(["ffmpeg", "-y", "-i", video_path, "-vf",
          f"scale={TARGET_W}:{TARGET_H},setsar=1,fps={TARGET_FPS}",
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
          "-crf", "22", out_path])


def _concat_video(paths, out_path: str):
    args = ["ffmpeg", "-y"]
    for p in paths:
        args += ["-i", p]
    n = len(paths)
    streams = "".join(f"[{i}:v]" for i in range(n))
    args += ["-filter_complex", f"{streams}concat=n={n}:v=1:a=0[v]",
             "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
             "-preset", "veryfast", "-crf", "21", "-movflags", "+faststart", out_path]
    _run(args)


def _make_reel(clip_paths, profile, out_path, style="spotlight", with_card=True):
    parts = []
    if with_card:
        card = "/tmp/card.mp4"
        _card_clip(profile, card)
        parts.append(card)
    name_text = _name_text(profile)
    for i, cp in enumerate(clip_paths):
        fx = f"/tmp/fx_{i}.mp4"
        try:
            centers, fps, W, H, _ = _track_target(cp)
            if centers is None or style != "spotlight":
                _normalize(cp, fx)
            else:
                _render_spotlight(cp, fx, centers, fps, W, H, name_text)
        except Exception as e:  # noqa: BLE001
            print(f"[reel] clip {i} 효과 실패→원본: {e}")
            _normalize(cp, fx)
        parts.append(fx)
    _concat_video(parts, out_path)
    return parts


# ─────────────────────────── 엔드포인트 ───────────────────────────
@app.function(image=image, gpu="L4", timeout=1500, volumes={"/models": volume})
@modal.fastapi_endpoint(method="POST")
def render_highlights(req: dict):
    import base64
    import os

    from fastapi import Response

    clips = req.get("clips") or []
    profile = dict(req.get("profile") or {})
    style = req.get("style", "spotlight")
    if not clips:
        return {"ok": False, "error": "clips 가 비어 있습니다."}

    # 사진(dataURL/base64) 처리
    photo = profile.get("photo")
    if photo and isinstance(photo, str) and "," in photo:
        try:
            with open("/tmp/photo.jpg", "wb") as f:
                f.write(base64.b64decode(photo.split(",", 1)[1]))
            profile["_photo_path"] = "/tmp/photo.jpg"
        except Exception:
            pass

    paths = []
    for i, url in enumerate(clips):
        p = f"/tmp/in_{i}.mp4"
        _download_url(url, p)
        paths.append(p)

    out = "/tmp/reel.mp4"
    _make_reel(paths, profile, out, style=style)
    data = open(out, "rb").read()
    return Response(content=data, media_type="video/mp4",
                    headers={"X-Clip-Count": str(len(paths))})


@app.function(image=image, timeout=300, volumes={"/models": volume})
def card_preview():
    import os

    os.makedirs("/models/reel_demo", exist_ok=True)
    profile = {
        "name": "강도윤", "jerseyNumber": "1", "position": "GK",
        "teamName": "AAFC 충암 U-12", "dob": "2014-02-24",
        "heightCm": "173", "weightKg": "69", "nationality": "대한민국",
    }
    _draw_card(profile).save("/models/reel_demo/card_only.png")
    volume.commit()
    return {"ok": True, "out": "reel_demo/card_only.png"}


@app.function(image=image, gpu="L4", timeout=1200, volumes={"/models": volume})
def demo_full():
    import os

    import cv2

    os.makedirs("/models/reel_demo", exist_ok=True)
    src = "/tmp/soccer.mp4"
    _gdrive(SAMPLE_GDRIVE_ID, src)

    # 2개 구간을 잘라 하이라이트 클립처럼 사용
    seg_paths = []
    for i, (ss, dur) in enumerate([(0, 5), (6, 5)]):
        sp = f"/tmp/seg_{i}.mp4"
        _run(["ffmpeg", "-y", "-ss", str(ss), "-i", src, "-t", str(dur),
              "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", sp])
        seg_paths.append(sp)

    profile = {
        "name": "강도윤", "jerseyNumber": "1", "position": "GK",
        "teamName": "AAFC 충암 U-12", "dob": "2014-02-24",
        "heightCm": "173", "weightKg": "69", "nationality": "대한민국",
    }
    out = "/models/reel_demo/reel.mp4"
    _make_reel(seg_paths, profile, out, style="spotlight")

    cap = cv2.VideoCapture(out)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    for j, frac in enumerate((0.05, 0.4, 0.65, 0.9)):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * frac))
        ok, fr = cap.read()
        if ok:
            cv2.imwrite(f"/models/reel_demo/reel_{j+1}.jpg", fr)
    cap.release()
    volume.commit()
    return {"ok": True, "out": "reel_demo/reel.mp4", "frames": total}
