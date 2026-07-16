"""
SoccerNet Action Spotting — Phase A POC (Modal).

T-DEED SoccerNet_small 로 Shot/Goal 등 이벤트 타임스탬프를 반환합니다.
1인 선수 분석 파이프라인에서 "슛·골 후보 시각" 힌트로만 사용 (확정 사실 아님).

배포:
  modal secret create soccer-gpu-auth GPU_AUTH_TOKEN=<랜덤>   # soccer_gpu 와 동일 secret 재사용 가능
  modal run modal_app/action_spotting.py::download_checkpoint  # 최초 1회 체크포인트 다운로드
  modal deploy modal_app/action_spotting.py

Railway:
  MODAL_ACTION_SPOT_URL=<spot 엔드포인트>
  MODAL_AUTH_TOKEN=<동일>
  ACTION_SPOTTING_ENABLED=1
"""

from __future__ import annotations

import os
import tempfile
import time
from typing import List, Optional

import modal

APP_NAME = "soccer-action-spot"
TDEED_ROOT = "/opt/tdeed"
CHECKPOINT_ROOT = "/models/tdeed"
DEFAULT_MODEL = os.environ.get("TDEED_MODEL", "SoccerNet_small")

models_volume = modal.Volume.from_name("action-spotting-models", create_if_missing=True)

# 1인 분석에서 우선 사용할 이벤트 (SoccerNet class.txt)
PLAYER_HINT_LABELS = [
    "Shots on target",
    "Shots off target",
    "Goal",
    "Clearance",
    "Direct free-kick",
    "Corner",
    "Penalty",
]

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libgl1", "libglib2.0-0", "wget")
    .run_commands(
        "git clone --depth 1 https://github.com/arturxe2/T-DEED.git /opt/tdeed",
    )
    .pip_install(
        "torch==2.3.1",
        "torchvision==0.18.1",
        "timm==1.0.3",
        "numpy==1.26.4",
        "opencv-python-headless==4.10.0.84",
        "tqdm==4.66.4",
        "tabulate==0.9.0",
        "PyYAML==6.0.1",
        "requests==2.32.3",
        "gdown==5.2.0",
        "fastapi[standard]",
    )
    .add_local_file(
        local_path=os.path.join(os.path.dirname(__file__), "tdeed_infer.py"),
        remote_path="/root/tdeed_infer.py",
    )
)

app = modal.App(APP_NAME)


with image.imports():
    from pydantic import BaseModel, Field

    class SpotRequest(BaseModel):
        videoUrl: str
        authToken: str = ""
        threshold: float = Field(default=0.25, ge=0.05, le=0.95)
        model: str = DEFAULT_MODEL
        classFilter: Optional[List[str]] = None
        playerHintsOnly: bool = True


def _check_auth(token: str) -> None:
    from fastapi import HTTPException

    expected = os.environ.get("GPU_AUTH_TOKEN", "")
    if not expected:
        return
    if token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


def _download_video(url: str, dest: str) -> None:
    import requests

    with requests.get(url, stream=True, timeout=600) as resp:
        resp.raise_for_status()
        with open(dest, "wb") as fp:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    fp.write(chunk)


@app.function(
    image=image,
    volumes={CHECKPOINT_ROOT: models_volume},
    timeout=3600,
    secrets=[modal.Secret.from_name("soccer-gpu-auth")],
)
def download_checkpoint(model_name: str = DEFAULT_MODEL) -> dict:
    """최초 1회: Google Drive T-DEED 체크포인트 → Modal Volume."""
    import gdown

    dataset = model_name.split("_")[0]
    dest_dir = os.path.join(CHECKPOINT_ROOT, dataset, model_name)
    dest_file = os.path.join(dest_dir, "checkpoint_best.pt")
    os.makedirs(dest_dir, exist_ok=True)

    if os.path.isfile(dest_file):
        models_volume.commit()
        return {"ok": True, "status": "already_exists", "path": dest_file}

    folder_url = "https://drive.google.com/drive/folders/1sxZalU_hCwL8ITZCU9VqSWE8dB94lJty"
    tmp = "/tmp/tdeed_ckpts"
    os.makedirs(tmp, exist_ok=True)
    gdown.download_folder(folder_url, output=tmp, quiet=False, remaining_ok=True)

    found = None
    for root, _dirs, files in os.walk(tmp):
        if model_name in root and "checkpoint_best.pt" in files:
            found = os.path.join(root, "checkpoint_best.pt")
            break
        for f in files:
            if f == "checkpoint_best.pt" and model_name.replace("_", "/") in root.replace("\\", "/"):
                found = os.path.join(root, f)
                break

    if not found:
        for root, _dirs, files in os.walk(tmp):
            if "checkpoint_best.pt" in files and dataset in root:
                found = os.path.join(root, "checkpoint_best.pt")
                break

    if not found:
        return {
            "ok": False,
            "error": "checkpoint_not_found_in_drive_folder",
            "hint": f"수동으로 {dest_file} 에 checkpoint_best.pt 를 업로드하세요.",
        }

    import shutil

    shutil.copy2(found, dest_file)
    models_volume.commit()
    return {"ok": True, "status": "downloaded", "path": dest_file, "source": found}


@app.function(
    image=image,
    gpu=["T4", "L4", "A10G"],
    timeout=1200,
    secrets=[modal.Secret.from_name("soccer-gpu-auth")],
    volumes={CHECKPOINT_ROOT: models_volume},
)
@modal.fastapi_endpoint(method="POST")
def spot(req: "SpotRequest"):
    """SoccerNet action spotting on uploaded video URL."""
    import sys

    _check_auth(req.authToken)
    started = time.time()

    sys.path.insert(0, "/root")
    import tdeed_infer  # noqa: E402

    out: dict = {
        "success": True,
        "source": "modal-action-spot",
        "phase": "A-poc",
        "engine": "t-deed-soccernet",
    }

    if not tdeed_infer.checkpoint_ready(req.model):
        out["success"] = False
        out["error"] = "checkpoint_missing"
        out["hint"] = (
            "modal run modal_app/action_spotting.py::download_checkpoint 실행 후 재시도"
        )
        out["checkpointPath"] = tdeed_infer.checkpoint_path(req.model)
        out["elapsedSec"] = round(time.time() - started, 1)
        return out

    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp_path = tmp.name
    tmp.close()

    try:
        _download_video(req.videoUrl, tmp_path)
        class_filter = req.classFilter
        if req.playerHintsOnly and not class_filter:
            class_filter = PLAYER_HINT_LABELS

        result = tdeed_infer.run_tdeed_inference(
            tmp_path,
            model_name=req.model,
            threshold=req.threshold,
            class_filter=class_filter,
        )
        out.update(result)
        if not result.get("available"):
            out["success"] = False
            out["error"] = result.get("error", "inference_failed")
    except Exception as exc:  # noqa: BLE001
        out["success"] = False
        out["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    out["elapsedSec"] = round(time.time() - started, 1)
    return out


@app.function(image=image, volumes={CHECKPOINT_ROOT: models_volume})
@modal.fastapi_endpoint(method="GET")
def hello():
    import sys

    sys.path.insert(0, "/root")
    import tdeed_infer  # noqa: E402

    return {
        "ok": True,
        "service": APP_NAME,
        "phase": "A-poc",
        "model": DEFAULT_MODEL,
        "checkpointReady": tdeed_infer.checkpoint_ready(),
        "playerHintLabels": PLAYER_HINT_LABELS,
    }
