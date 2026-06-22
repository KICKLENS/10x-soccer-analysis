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
    .apt_install("libgl1", "libglib2.0-0", "ffmpeg", "fonts-nanum", "fonts-dejavu")
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
DJV_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
DJV_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DJV_I = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"
DJV_BI = "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf"
POS_MAP = {"GK": "Goalkeeper (GK)", "DF": "Defender (DF)", "CB": "Centre-Back (CB)",
           "FB": "Full-Back (FB)", "MF": "Midfielder (MF)", "DM": "Defensive Mid (DM)",
           "AM": "Attacking Mid (AM)", "WG": "Winger (WG)", "FW": "Forward (FW)",
           "ST": "Striker (ST)", "CF": "Centre-Forward (CF)"}
NAT_MAP = {"대한민국": "Republic of Korea", "한국": "Republic of Korea", "korea": "Republic of Korea"}
_MONTHS = ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"]


def _draw_card(profile: dict):
    from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

    W, H = 1920, 1080
    FG = (236, 238, 242)
    SUB = (150, 152, 160)
    img = Image.new("RGB", (W, H), (9, 9, 11))
    d = ImageDraw.Draw(img)

    def f_en(size, style="b"):
        return ImageFont.truetype(
            {"b": DJV_B, "r": DJV_R, "i": DJV_I, "bi": DJV_BI}[style], size)

    def f_ko(size):
        return ImageFont.truetype(FONT_BOLD, size)

    # ── 데이터 ──
    name_ko = (profile.get("name") or "선수").strip()
    name_en = (profile.get("nameEn") or name_ko).strip()
    number = str(profile.get("jerseyNumber") or "").strip()
    pos = (profile.get("position") or "").strip().upper()
    pos_full = POS_MAP.get(pos, profile.get("position") or "-")
    team_en = (profile.get("teamName") or "-").strip()
    team_ko = (profile.get("teamNameKo") or profile.get("teamName") or "").strip()
    dob = (profile.get("dob") or "").strip()
    height = (profile.get("heightCm") or "").strip()
    weight = (profile.get("weightKg") or "").strip()
    nat_raw = (profile.get("nationality") or "").strip()
    nat_en = NAT_MAP.get(nat_raw, NAT_MAP.get(nat_raw.lower(), nat_raw or "-"))
    season = str(profile.get("season") or "2026").strip()
    try:
        yy, mm, dd = (int(x) for x in dob.split("-"))
        dob_disp = f"{dd:02d}/{mm:02d}/{yy} ({dd} {_MONTHS[mm - 1]}, {yy})"
    except Exception:
        dob_disp = dob or "-"

    # ── 배경 워터마크(국가명) ──
    wm = (nat_en.split()[-1] if nat_en and nat_en != "-" else "TEAM").upper()
    wmf = f_en(300, "b")
    bb = d.textbbox((0, 0), wm, font=wmf)
    d.text((W // 2 - (bb[2] - bb[0]) // 2 - 120, H // 2 - (bb[3] - bb[1]) // 2 - 70),
           wm, font=wmf, fill=(24, 24, 28))

    # ── 사진(센터-우측 원형) ──
    cx, cy, R = 1285, 372, 212
    d.ellipse([cx - R - 7, cy - R - 7, cx + R + 7, cy + R + 7], outline=(70, 70, 78), width=3)
    drew = False
    pp = profile.get("_photo_path")
    if pp:
        try:
            ph = Image.open(pp).convert("RGBA")
            s = min(ph.size)
            ph = ph.crop(((ph.width - s) // 2, (ph.height - s) // 2,
                          (ph.width - s) // 2 + s, (ph.height - s) // 2 + s)).resize((2 * R, 2 * R))
            cmask = Image.new("L", (2 * R, 2 * R), 0)
            ImageDraw.Draw(cmask).ellipse([0, 0, 2 * R, 2 * R], fill=255)
            fmask = ImageChops.multiply(cmask, ph.split()[3])
            img.paste(ph.convert("RGB"), (cx - R, cy - R), fmask)
            drew = True
        except Exception:
            drew = False
    if not drew:
        d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(26, 26, 30))
        ff = f_ko(210)
        b2 = d.textbbox((0, 0), name_ko[:1], font=ff)
        d.text((cx - (b2[2] - b2[0]) / 2, cy - (b2[3] - b2[1]) / 2 - 24), name_ko[:1],
               font=ff, fill=FG)

    # SEASON 라벨 + 사진으로 향하는 연결선
    d.text((876, cy - 26), f"SEASON {season}", font=f_en(17, "b"), fill=SUB)
    d.line([876, cy + 4, cx - R - 12, cy + 4], fill=(70, 70, 78), width=2)

    # 국기(사진 우하단)
    try:
        _download_url("https://flagcdn.com/w160/kr.png", "/tmp/flag.png")
        fl = Image.open("/tmp/flag.png").convert("RGB").resize((74, 49))
        fx, fy = cx + 96, cy + 120
        d.rectangle([fx - 2, fy - 2, fx + 76, fy + 51], fill=(255, 255, 255))
        img.paste(fl, (fx, fy))
    except Exception:
        pass

    # ── 좌측 텍스트 ──
    LX = 140
    _prf = f_en(26, "b")
    _prb = d.textbbox((0, 0), "PLAYER REVIEW", font=_prf)
    d.rectangle([LX, 58, LX + (_prb[2] - _prb[0]) + 34, 104], fill=(245, 245, 248))
    d.text((LX + 17, 67), "PLAYER REVIEW", font=_prf, fill=(12, 12, 14))
    if pos:
        d.rounded_rectangle([LX, 124, LX + 96, 172], radius=6, outline=(120, 120, 128), width=2)
        pb = d.textbbox((0, 0), pos[:3], font=f_en(26, "b"))
        d.text((LX + 48 - (pb[2] - pb[0]) / 2, 136), pos[:3], font=f_en(26, "b"), fill=FG)

    d.text((LX, 196), name_en, font=f_en(112, "b"), fill=FG)

    d.rectangle([LX, 352, LX + 6, 438], fill=(245, 245, 248))
    d.text((LX + 28, 360), "#", font=f_en(46, "bi"), fill=SUB)
    d.text((LX + 78, 348), number or "-", font=f_en(96, "bi"), fill=FG)

    d.text((LX, 470), "GENERAL INFO", font=f_en(46, "b"), fill=FG)

    rows = [
        ("age", "Age", f"{_age_from_dob(dob)}" if dob else "-"),
        ("dob", "Date of birth", dob_disp),
        ("pos", "Position", pos_full),
        ("hw", "Height / Weight", f"{height or '-'}cm / {weight or '-'}kg"),
        ("club", "Club", team_en),
        ("nat", "Nationality", nat_en),
    ]
    ry = 548
    for kind, label, value in rows:
        _row_icon(d, kind, LX + 2, ry + 4, 24, SUB)
        d.text((LX + 42, ry), label, font=f_en(26, "b"), fill=FG)
        lw_ = d.textbbox((0, 0), label, font=f_en(26, "b"))[2]
        d.text((LX + 42 + lw_ + 14, ry + 2), value, font=f_en(25, "i"), fill=SUB)
        ry += 58

    # ── 우측 세로 텍스트(팀·번호·한글이름) ──
    vtxt = f"{team_ko}  No.{number}  {name_ko}".strip()
    vimg = Image.new("RGBA", (560, 40), (0, 0, 0, 0))
    ImageDraw.Draw(vimg).text((0, 0), vtxt, font=f_ko(24), fill=(150, 150, 158))
    vimg = vimg.rotate(90, expand=True)
    img.paste(vimg, (W - 56, cy - 280), vimg)

    # ── 우하단 미니 피치(진행 방향 + GK 강조) ──
    _draw_mini_pitch(img, d, f_en, x0=1175, y0=792, x1=1838, y1=996,
                     direction_y=760, gk_label="GOALKEEPER (GK)", highlight="left")

    return img


def _row_icon(d, kind, x, y, s, col):
    w = 2
    if kind == "age":
        d.ellipse([x + s * 0.28, y, x + s * 0.72, y + s * 0.42], outline=col, width=w)
        d.arc([x + s * 0.12, y + s * 0.42, x + s * 0.88, y + s * 1.1], 180, 360, fill=col, width=w)
    elif kind == "dob":
        d.rounded_rectangle([x, y + s * 0.12, x + s, y + s], radius=3, outline=col, width=w)
        d.line([x, y + s * 0.36, x + s, y + s * 0.36], fill=col, width=w)
        d.line([x + s * 0.3, y, x + s * 0.3, y + s * 0.22], fill=col, width=w)
        d.line([x + s * 0.7, y, x + s * 0.7, y + s * 0.22], fill=col, width=w)
    elif kind == "pos":
        for ix in (0, 1):
            for iy in (0, 1):
                d.rectangle([x + ix * s * 0.56, y + iy * s * 0.56,
                             x + ix * s * 0.56 + s * 0.4, y + iy * s * 0.56 + s * 0.4],
                            outline=col, width=w)
    elif kind == "hw":
        d.line([x + s * 0.3, y, x + s * 0.3, y + s], fill=col, width=w)
        d.line([x + s * 0.3, y, x + s * 0.15, y + s * 0.2], fill=col, width=w)
        d.line([x + s * 0.3, y, x + s * 0.45, y + s * 0.2], fill=col, width=w)
        d.line([x + s * 0.7, y, x + s * 0.7, y + s], fill=col, width=w)
        d.line([x + s * 0.7, y + s, x + s * 0.55, y + s * 0.8], fill=col, width=w)
        d.line([x + s * 0.7, y + s, x + s * 0.85, y + s * 0.8], fill=col, width=w)
    elif kind == "club":
        d.polygon([(x + s * 0.5, y), (x + s, y + s * 0.22), (x + s * 0.5, y + s),
                   (x, y + s * 0.22)], outline=col, width=w)
    elif kind == "nat":
        d.ellipse([x, y, x + s, y + s], outline=col, width=w)
        d.ellipse([x + s * 0.32, y, x + s * 0.68, y + s], outline=col, width=w)
        d.line([x, y + s * 0.5, x + s, y + s * 0.5], fill=col, width=w)


def _draw_mini_pitch(img, d, f_en, x0, y0, x1, y1, direction_y, gk_label, highlight="left"):
    from PIL import Image, ImageDraw, ImageFilter

    LINE = (120, 120, 128)
    cy = (y0 + y1) // 2
    w, h = x1 - x0, y1 - y0

    # GK 강조 스포트라이트(좌측 페널티 지역)
    glow = Image.new("L", img.size, 0)
    gx = x0 + int(w * 0.12)
    ImageDraw.Draw(glow).ellipse([gx - 70, cy - 70, gx + 70, cy + 70], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    img.paste(Image.new("RGB", img.size, (245, 245, 250)), (0, 0), glow)

    # 진행 방향
    d.text(((x0 + x1) // 2 - 78, direction_y - 4), "DIRECTION OF PLAY", font=f_en(17, "b"),
           fill=(180, 180, 188))
    ay = direction_y + 26
    d.line([x0 + 40, ay, x1 - 40, ay], fill=(160, 160, 168), width=2)
    d.polygon([(x1 - 40, ay), (x1 - 58, ay - 8), (x1 - 58, ay + 8)], fill=(160, 160, 168))

    # 피치 라인
    d.rectangle([x0, y0, x1, y1], outline=LINE, width=2)
    d.line([(x0 + x1) // 2, y0, (x0 + x1) // 2, y1], fill=LINE, width=2)
    r = h // 6
    d.ellipse([(x0 + x1) // 2 - r, cy - r, (x0 + x1) // 2 + r, cy + r], outline=LINE, width=2)
    pbw, pbh = int(w * 0.13), int(h * 0.5)
    gbw, gbh = int(w * 0.05), int(h * 0.26)
    d.rectangle([x0, cy - pbh, x0 + pbw, cy + pbh], outline=LINE, width=2)
    d.rectangle([x0, cy - gbh, x0 + gbw, cy + gbh], outline=LINE, width=2)
    d.rectangle([x1 - pbw, cy - pbh, x1, cy + pbh], outline=LINE, width=2)
    d.rectangle([x1 - gbw, cy - gbh, x1, cy + gbh], outline=LINE, width=2)
    d.rectangle([x0 - 7, cy - gbh // 2, x0, cy + gbh // 2], outline=LINE, width=2)
    d.rectangle([x1, cy - gbh // 2, x1 + 7, cy + gbh // 2], outline=LINE, width=2)

    lb = d.textbbox((0, 0), gk_label, font=f_en(16, "b"))
    d.text((x1 - (lb[2] - lb[0]), y1 + 12), gk_label, font=f_en(16, "b"), fill=(180, 180, 188))


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
        "name": "강도윤", "nameEn": "Kang Do-Yun", "jerseyNumber": "1",
        "position": "GK", "teamName": "AAFC Choong-Am U-12",
        "teamNameKo": "AAFC 충암 U-12", "dob": "2014-02-24",
        "heightCm": "173", "weightKg": "69", "nationality": "대한민국",
        "season": "2026",
    }
    if os.path.exists("/models/demo_face.png"):
        profile["_photo_path"] = "/models/demo_face.png"
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
