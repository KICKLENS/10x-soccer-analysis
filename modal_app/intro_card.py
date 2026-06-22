"""
선수 소개 카드(PLAYER REVIEW) 렌더러.

선수 프로필(이름/번호/포지션/생년월일/키·몸무게/국적/팀/사진)로 1920x1080 인트로
카드를 그려 하이라이트 앞에 붙일 짧은 영상으로 만든다. 한글은 나눔폰트로 렌더.

사용:
  modal run modal_app/intro_card.py::card_demo
  modal volume get soccer-models card_demo ./card_demo
"""

from __future__ import annotations

import modal

APP_NAME = "soccer-card"
BRAND = (2, 159, 255)  # 주황 #FF9F02 (PIL은 RGB)
ORANGE = (255, 159, 2)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("fonts-nanum", "ffmpeg")
    .pip_install("pillow==10.4.0", "numpy<2")
)

volume = modal.Volume.from_name("soccer-models", create_if_missing=True)
app = modal.App(APP_NAME)

FONT_REG = "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"


def _age_from_dob(dob: str) -> str:
    from datetime import date

    try:
        y, m, d = (int(x) for x in dob.split("-"))
        today = date.today()
        age = today.year - y - ((today.month, today.day) < (m, d))
        return str(age)
    except Exception:
        return "-"


def _draw_card(profile: dict, photo_path: str | None):
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), (10, 10, 13))
    d = ImageDraw.Draw(img)

    # 배경 액센트(상단 우측 은은한 주황 글로우)
    glow = Image.new("RGB", (W, H), (10, 10, 13))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W - 700, -300, W + 200, 500], fill=(40, 28, 6))
    from PIL import ImageFilter

    glow = glow.filter(ImageFilter.GaussianBlur(160))
    img = Image.blend(img, glow, 0.6)
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

    LX = 130  # 좌측 기준선

    # PLAYER REVIEW 라벨
    d.rectangle([LX, 110, LX + 250, 158], fill=(255, 255, 255))
    d.text((LX + 18, 118), "PLAYER REVIEW", font=font(True, 26), fill=(10, 10, 13))

    # 포지션 배지
    if position:
        d.rounded_rectangle([LX, 188, LX + 120, 240], radius=8,
                            outline=ORANGE, width=2)
        d.text((LX + 22, 197), position.upper()[:4], font=font(True, 28), fill=ORANGE)

    # 이름 + 번호
    d.text((LX, 270), name, font=font(True, 110), fill=(255, 255, 255))
    if number:
        d.text((LX, 410), f"#{number}", font=font(True, 70), fill=ORANGE)

    # GENERAL INFO
    iy = 540
    d.text((LX, iy), "GENERAL INFO", font=font(True, 40), fill=(255, 255, 255))
    d.line([LX, iy + 56, LX + 520, iy + 56], fill=(60, 60, 66), width=2)

    rows = [
        ("나이", f"{_age_from_dob(dob)}세" if dob else "-"),
        ("생년월일", dob or "-"),
        ("포지션", position or "-"),
        ("키 / 몸무게",
         f"{height or '-'}cm / {weight or '-'}kg"),
        ("소속팀", team or "-"),
        ("국적", nat or "-"),
    ]
    ry = iy + 80
    for label, value in rows:
        d.ellipse([LX, ry + 12, LX + 12, ry + 24], fill=ORANGE)
        d.text((LX + 30, ry), label, font=font(False, 30), fill=(170, 170, 176))
        d.text((LX + 300, ry), value, font=font(True, 32), fill=(255, 255, 255))
        ry += 66

    # 우측 원형 사진
    cx, cy, R = 1420, 430, 280
    ring = 10
    d.ellipse([cx - R - ring, cy - R - ring, cx + R + ring, cy + R + ring],
              outline=ORANGE, width=ring)
    if photo_path:
        try:
            ph = Image.open(photo_path).convert("RGB")
            # center-crop to square
            s = min(ph.size)
            ph = ph.crop(((ph.width - s) // 2, (ph.height - s) // 2,
                          (ph.width - s) // 2 + s, (ph.height - s) // 2 + s))
            ph = ph.resize((2 * R, 2 * R))
            mask = Image.new("L", (2 * R, 2 * R), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, 2 * R, 2 * R], fill=255)
            img.paste(ph, (cx - R, cy - R), mask)
        except Exception:
            photo_path = None
    if not photo_path:
        d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(28, 28, 33))
        initial = name[:1]
        f = font(True, 220)
        bb = d.textbbox((0, 0), initial, font=f)
        d.text((cx - (bb[2] - bb[0]) / 2, cy - (bb[3] - bb[1]) / 2 - 30),
               initial, font=f, fill=ORANGE)

    # 하단 미니 피치 다이어그램
    py0, py1 = 820, 1000
    px0, px1 = 1180, 1660
    d.rectangle([px0, py0, px1, py1], outline=(90, 90, 96), width=3)
    d.line([(px0 + px1) // 2, py0, (px0 + px1) // 2, py1], fill=(90, 90, 96), width=2)
    d.ellipse([(px0 + px1) // 2 - 40, (py0 + py1) // 2 - 40,
               (px0 + px1) // 2 + 40, (py0 + py1) // 2 + 40], outline=(90, 90, 96), width=2)
    d.text((px0, py0 - 44), "DIRECTION OF PLAY →", font=font(False, 24), fill=(150, 150, 156))

    # 좌하단 브랜드
    d.text((LX, 1010), "10X · AI SOCCER ANALYSIS", font=font(True, 24), fill=(110, 110, 116))
    return img


def _card_to_video(img, out_path: str, seconds: float = 4.0):
    import subprocess

    png = out_path + ".png"
    img.save(png)
    # 은은한 줌인(zoompan)
    subprocess.run([
        "ffmpeg", "-y", "-loop", "1", "-i", png, "-t", str(seconds), "-r", "30",
        "-vf",
        "scale=1920:1080,zoompan=z='min(zoom+0.0006,1.08)':d=120:"
        "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080,fps=30",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        "-crf", "21", "-movflags", "+faststart", out_path,
    ], check=True, capture_output=True)


@app.function(image=image, timeout=600, volumes={"/models": volume})
def card_demo():
    import os

    os.makedirs("/models/card_demo", exist_ok=True)
    profile = {
        "name": "강도윤",
        "jerseyNumber": "1",
        "position": "GK",
        "teamName": "AAFC 충암 U-12",
        "dob": "2014-02-24",
        "heightCm": "173",
        "weightKg": "69",
        "nationality": "대한민국",
    }
    img = _draw_card(profile, None)
    img.save("/models/card_demo/card.jpg", quality=92)
    _card_to_video(img, "/models/card_demo/card.mp4", seconds=4.0)
    volume.commit()
    return {"ok": True, "outputs": ["card_demo/card.jpg", "card_demo/card.mp4"]}
