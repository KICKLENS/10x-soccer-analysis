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
# 정확도 우선 시 환경변수로 더 큰 모델 사용 가능(yolo11x.pt 등)
FX_DETECT_MODEL = None  # 런타임에 _fx_model_name()으로 결정


def _fx_model_name():
    import os
    return os.environ.get("FX_DETECT_MODEL", DETECT_MODEL)


# 유니폼 색상(한글/영문) → HSV 범위. 같은 팀(상대팀) 구분용 팀색 게이팅에 사용.
def _color_ranges(text: str):
    import numpy as np
    t = (text or "").lower()
    table = {
        ("빨", "red", "레드", "적"): [((0, 90, 70), (10, 255, 255)), ((170, 90, 70), (180, 255, 255))],
        ("주황", "오렌지", "orange"): [((11, 90, 80), (22, 255, 255))],
        ("노", "yellow", "옐로", "황"): [((23, 80, 90), (35, 255, 255))],
        ("초", "green", "그린", "녹"): [((36, 60, 50), (85, 255, 255))],
        ("하늘", "sky", "cyan", "청록"): [((86, 50, 70), (100, 255, 255))],
        ("파", "blue", "블루", "남"): [((101, 70, 50), (130, 255, 255))],
        ("보라", "purple", "퍼플", "자주"): [((131, 50, 50), (160, 255, 255))],
        ("분홍", "pink", "핑크"): [((161, 40, 120), (175, 255, 255))],
        ("검", "black", "블랙", "흑"): [((0, 0, 0), (180, 255, 60))],
        ("흰", "white", "화이트", "백"): [((0, 0, 190), (180, 45, 255))],
        ("회", "gray", "grey", "그레이"): [((0, 0, 70), (180, 40, 190))],
    }
    out = []
    for keys, ranges in table.items():
        if any(k in t for k in keys):
            for lo, hi in ranges:
                out.append((np.array(lo, np.uint8), np.array(hi, np.uint8)))
    return out


def _color_score(crop, ranges) -> float:
    import cv2
    if crop is None or crop.size == 0 or not ranges:
        return 0.0
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    total = crop.shape[0] * crop.shape[1]
    hit = 0
    for lo, hi in ranges:
        hit += int(cv2.inRange(hsv, lo, hi).sum() // 255)
    return min(1.0, hit / max(1, total))


def _hist(crop):
    import cv2
    if crop is None or crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(h, h, 0, 1, cv2.NORM_MINMAX)
    return h


def _track_target(video_path: str, seconds: float = 600.0, kit_text: str = "",
                  seed_hint=None):
    """외형-락(appearance lock) 단일 타깃 추적기.

    매 프레임 '잠가둔 외형 + 예측 위치 + 팀색'으로 같은 선수를 다시 고른다.
    → 옆 선수로 타깃이 튀는 ID 스위치를 크게 줄인다. 잠깐 놓치면(가림/프레임 이탈)
    외형 유사도로 재포착한다.
    """
    import cv2
    import numpy as np
    from ultralytics import YOLO

    model = YOLO(_fx_model_name())
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    diag = float(np.hypot(W, H)) or 1.0
    max_frames = int(fps * seconds)
    seed_frames = max(1, int(fps * 1.2))
    ranges = _color_ranges(kit_text)
    cx0 = (seed_hint[0] * W) if seed_hint else W / 2.0
    cy0 = (seed_hint[1] * H) if seed_hint else H / 2.0

    # 1) 탐지 패스: 프레임별 사람 박스 + 외형(hist)·팀색 점수 적재(짧은 클립이므로 메모리 OK)
    per_frame, idx = [], 0
    while idx < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        res = model.predict(source=frame, classes=[0], conf=0.25, imgsz=960, verbose=False)[0]
        dets = []
        if res.boxes is not None and len(res.boxes) > 0:
            xyxy = res.boxes.xyxy.cpu().numpy()
            for (x1, y1, x2, y2) in xyxy:
                x1i, y1i, x2i, y2i = int(max(0, x1)), int(max(0, y1)), int(x2), int(y2)
                crop = frame[y1i:y2i, x1i:x2i]
                dets.append({
                    "cx": (x1 + x2) / 2.0, "cy": (y1 + y2) / 2.0,
                    "w": x2 - x1, "h": y2 - y1,
                    "hist": _hist(crop), "color": _color_score(crop, ranges),
                })
        per_frame.append(dets)
        idx += 1
    cap.release()
    n = len(per_frame)
    if n == 0:
        return None, fps, W, H, 0

    # 2) 초기 락: seed 구간에서 (지정 위치/중앙) + 큰 + 팀색 맞는 선수 선택
    def _seed_pick():
        best, best_s = None, -1.0
        for f in per_frame[:seed_frames]:
            for d in f:
                dd = np.hypot((d["cx"] - cx0) / W, (d["cy"] - cy0) / H)
                s = (1.0 - min(dd, 1.0)) * (0.5 + 0.5 * d["h"] / H) + 0.4 * d["color"]
                if s > best_s:
                    best_s, best = s, d
        return best

    locked = _seed_pick()
    if locked is None or locked["hist"] is None:
        return None, fps, W, H, n

    lock_hist = locked["hist"].copy()
    last = (locked["cx"], locked["cy"], locked["w"], locked["h"])
    vel = (0.0, 0.0)
    gap = 0
    MAX_GAP = int(fps * 1.2)
    centers, ema = [], None

    for f in per_frame:
        pred_x = last[0] + vel[0]
        pred_y = last[1] + vel[1]
        best, best_score, best_app = None, -1.0, 0.0
        for d in f:
            app = 0.0
            if d["hist"] is not None:
                app = max(0.0, float(cv2.compareHist(lock_hist, d["hist"], cv2.HISTCMP_CORREL)))
            dist = np.hypot(d["cx"] - pred_x, d["cy"] - pred_y) / diag
            pos = max(0.0, 1.0 - dist / 0.35)
            size = max(0.0, 1.0 - abs(d["h"] - last[3]) / max(1.0, last[3]))
            score = 0.45 * app + 0.30 * pos + 0.15 * d["color"] + 0.10 * size
            if score > best_score:
                best_score, best, best_app = score, d, app

        chosen = None
        if gap <= MAX_GAP:
            # 추적 중: 위치+외형 점수가 일정 이상이어야 인정(아니면 잠깐 놓침 처리)
            if best is not None and best_score >= 0.32:
                chosen = best
        else:
            # 오래 놓침: 위치 무관, 외형이 매우 비슷할 때만 재포착(엉뚱한 선수 방지)
            if best is not None and best_app >= 0.55:
                chosen = best

        if chosen is not None:
            new = (chosen["cx"], chosen["cy"], chosen["w"], chosen["h"])
            vel = (0.5 * (new[0] - last[0]) + 0.5 * vel[0],
                   0.5 * (new[1] - last[1]) + 0.5 * vel[1])
            last = new
            gap = 0
            if chosen["hist"] is not None and best_app >= 0.4:
                lock_hist = 0.9 * lock_hist + 0.1 * chosen["hist"]  # 천천히 갱신(드리프트 억제)
        else:
            gap += 1
            last = (pred_x, pred_y, last[2], last[3])  # 예측 위치로 잠깐 유지

        if gap > MAX_GAP:
            centers.append(None)
            ema = None
            continue
        ema = last if ema is None else (
            0.35 * last[0] + 0.65 * ema[0],
            0.35 * last[1] + 0.65 * ema[1],
            0.35 * last[2] + 0.65 * ema[2],
            0.35 * last[3] + 0.65 * ema[3],
        )
        centers.append(ema)

    return centers, fps, W, H, n


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
            cx, cy, _w, h = c
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


def _make_label_sprite(name_text: str):
    """이름표(코너 박스 위에 붙는 작은 태그) 스프라이트를 1회 생성 → BGR + 알파 반환."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    try:
        font = ImageFont.truetype(FONT_BOLD, 28)
    except Exception:
        font = ImageFont.load_default()
    pad_x, pad_y = 14, 8
    dummy = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    bb = ImageDraw.Draw(dummy).textbbox((0, 0), name_text, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    w, h = tw + pad_x * 2, th + pad_y * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 주황 바탕 + 살짝 둥근 모서리
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=8, fill=(255, 159, 2, 235))
    d.text((pad_x - bb[0], pad_y - bb[1]), name_text, font=font, fill=(15, 15, 17, 255))
    arr = np.array(img)  # RGBA
    rgb = arr[:, :, :3][:, :, ::-1].copy()  # → BGR
    alpha = (arr[:, :, 3].astype(np.float32) / 255.0)[..., None]
    return rgb.astype(np.float32), alpha


def _render_bracket(video_path: str, out_path: str, boxes, fps, W, H, name_text: str):
    """대상 선수를 코너 브라켓(모서리 ㄱ자) 박스로 감싸 따라가며 표시 + 이름표."""
    import cv2
    import numpy as np

    cap = cv2.VideoCapture(video_path)
    raw = out_path + ".raw.mp4"
    vw = cv2.VideoWriter(raw, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
    accent = (2, 159, 255)  # #FF9F02 (BGR)
    sprite, salpha = _make_label_sprite(name_text)
    sh, sw = sprite.shape[:2]

    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok or idx >= len(boxes):
            break
        c = boxes[idx]
        if c is not None:
            cx, cy, w, h = c
            # 박스를 사람보다 약간 넉넉하게
            bw = max(40.0, w * 1.18)
            bh = max(60.0, h * 1.12)
            x1 = int(max(0, cx - bw / 2)); y1 = int(max(0, cy - bh / 2))
            x2 = int(min(W - 1, cx + bw / 2)); y2 = int(min(H - 1, cy + bh / 2))
            seg = int(max(14, min(bw, bh) * 0.28))  # 모서리 선 길이
            th = 3
            # 4개 모서리 ㄱ자
            for (px, py, dx, dy) in [
                (x1, y1, 1, 1), (x2, y1, -1, 1), (x1, y2, 1, -1), (x2, y2, -1, -1),
            ]:
                cv2.line(frame, (px, py), (px + dx * seg, py), accent, th, cv2.LINE_AA)
                cv2.line(frame, (px, py), (px, py + dy * seg), accent, th, cv2.LINE_AA)
            # 발끝 중심 작은 마커
            cv2.drawMarker(frame, (int(cx), y2), accent, cv2.MARKER_TRIANGLE_UP, 14, 2, cv2.LINE_AA)

            # 이름표(박스 좌상단 위)
            lx = int(max(0, min(W - sw, x1)))
            ly = int(y1 - sh - 6)
            if ly < 0:
                ly = min(H - sh, y2 + 6)
            if 0 <= ly <= H - sh and 0 <= lx <= W - sw:
                roi = frame[ly:ly + sh, lx:lx + sw].astype(np.float32)
                frame[ly:ly + sh, lx:lx + sw] = (sprite * salpha + roi * (1.0 - salpha)).astype(np.uint8)
        vw.write(frame)
        idx += 1
    cap.release()
    vw.release()

    _run(["ffmpeg", "-y", "-i", raw, "-vf",
          f"scale={TARGET_W}:{TARGET_H},setsar=1,fps={TARGET_FPS}",
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
          "-crf", "22", out_path])
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
    kit_text = f"{profile.get('uniformColor', '')} {profile.get('traits', '')}".strip()
    seed_hint = profile.get("_seed_hint")  # (nx, ny) 또는 None
    for i, cp in enumerate(clip_paths):
        fx = f"/tmp/fx_{i}.mp4"
        try:
            centers, fps, W, H, _ = _track_target(cp, kit_text=kit_text, seed_hint=seed_hint)
            if centers is None or style not in ("spotlight", "bracket"):
                _normalize(cp, fx)
            elif style == "bracket":
                _render_bracket(cp, fx, centers, fps, W, H, name_text)
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

    # 사용자가 탭한 위치(0~1) 힌트 → 첫 프레임 락 선택에 활용
    seed = req.get("seed") or {}
    try:
        if seed and seed.get("nx") is not None and seed.get("ny") is not None:
            profile["_seed_hint"] = (float(seed["nx"]), float(seed["ny"]))
    except Exception:
        pass

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
    _make_reel(paths, profile, out, style=style, with_card=False)
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
