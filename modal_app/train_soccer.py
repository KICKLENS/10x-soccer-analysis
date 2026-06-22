"""
Soccer detector fine-tuning on Modal (우리 전용 축구 검출 모델 학습).

공개 데이터셋(Adit-jain/Soccana_player_ball_detection_v1, 약 2.5만 장, 선수/심판/공,
노이즈·배경 등 다양한 증강 포함)으로 yolo11m을 파인튜닝한다.
결과 가중치는 Modal 볼륨 'soccer-models'의 /models/soccer_best.pt 로 저장되어,
분석 서비스(soccer_gpu.py)에서 SOCCER_FINETUNED_MODEL 로 불러 쓸 수 있다.

사용:
  # 스모크(소량·1에폭): 파이프라인 검증
  modal run modal_app/train_soccer.py::train --epochs 1 --fraction 0.03 --imgsz 640

  # 본 학습(백그라운드 권장):
  modal run --detach modal_app/train_soccer.py::train --epochs 40 --imgsz 768
"""

import modal

APP_NAME = "soccer-train"
DATASET_REPO = "Adit-jain/Soccana_player_ball_detection_v1"
BASE_MODEL = "yolo11m.pt"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        "ultralytics==8.3.58",
        "opencv-python-headless==4.10.0.84",
        "numpy<2",
        "huggingface_hub==0.26.2",
        "lap==0.5.12",
    )
)

volume = modal.Volume.from_name("soccer-models", create_if_missing=True)
app = modal.App(APP_NAME)


def _prepare_dataset() -> str:
    """HF 데이터셋을 받고 ultralytics용 data.yaml(절대경로) 경로를 반환."""
    import glob
    import os

    import yaml
    from huggingface_hub import snapshot_download

    root = snapshot_download(
        repo_id=DATASET_REPO, repo_type="dataset", local_dir="/tmp/soccer_ds"
    )

    # 데이터가 .zip 으로 묶여 있으면 압축 해제
    import zipfile

    extract_root = "/tmp/soccer_ds_x"
    for zp in glob.glob(os.path.join(root, "**", "*.zip"), recursive=True):
        marker = os.path.join(extract_root, os.path.basename(zp) + ".done")
        if os.path.exists(marker):
            continue
        print(f"[dataset] unzip {zp} ...")
        with zipfile.ZipFile(zp) as zf:
            zf.extractall(extract_root)
        os.makedirs(extract_root, exist_ok=True)
        open(marker, "w").close()

    search_roots = [root]
    if os.path.isdir(extract_root):
        search_roots.append(extract_root)

    # data.yaml 찾기 (하위 어딘가에 있음)
    candidates = []
    for sr in search_roots:
        candidates += glob.glob(os.path.join(sr, "**", "data.yaml"), recursive=True)
    if not candidates:
        raise RuntimeError(f"data.yaml을 찾지 못함 (root={root})")
    data_yaml = candidates[0]
    base_dir = os.path.dirname(data_yaml)

    with open(data_yaml, "r") as f:
        cfg = yaml.safe_load(f) or {}

    # 이미지 디렉터리 자동 탐색 (images/train, images/val, images/test)
    def _find_split(*names):
        for n in names:
            p = os.path.join(base_dir, "images", n)
            if os.path.isdir(p):
                return p
        return None

    train_dir = _find_split("train")
    val_dir = _find_split("val", "valid", "test")
    if not train_dir:
        raise RuntimeError(f"train 이미지 폴더를 찾지 못함 (base={base_dir})")
    if not val_dir:
        val_dir = train_dir  # val 없으면 train으로 대체(스모크용)

    names = cfg.get("names")
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]
    if not names:
        names = ["player", "referee", "ball"]

    fixed = {
        "path": base_dir,
        "train": train_dir,
        "val": val_dir,
        "names": names,
    }
    fixed_path = os.path.join(base_dir, "data_modal.yaml")
    with open(fixed_path, "w") as f:
        yaml.safe_dump(fixed, f, allow_unicode=True)

    print(f"[dataset] data.yaml={fixed_path}")
    print(f"[dataset] names={names}")
    print(f"[dataset] train={train_dir}")
    print(f"[dataset] val={val_dir}")
    return fixed_path


@app.function(
    image=image,
    gpu="A10G",
    timeout=24 * 3600,
    volumes={"/models": volume},
)
def train(
    epochs: int = 40,
    imgsz: int = 768,
    batch: int = 16,
    fraction: float = 1.0,
    base: str = BASE_MODEL,
    run_name: str = "soccer",
):
    import shutil

    from ultralytics import YOLO

    data_yaml = _prepare_dataset()

    model = YOLO(base)
    model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        fraction=fraction,
        device=0,
        project="/models/runs",
        name=run_name,
        exist_ok=True,
        patience=15,
        verbose=True,
    )

    best = f"/models/runs/{run_name}/weights/best.pt"
    dst = "/models/soccer_best.pt"
    try:
        shutil.copy(best, dst)
    except Exception as e:  # noqa: BLE001
        print(f"[warn] best.pt 복사 실패: {e}")
        dst = best

    # 검증 지표
    metrics = {}
    try:
        val = model.val(data=data_yaml, imgsz=imgsz, device=0, verbose=False)
        metrics = {
            "map50": round(float(val.box.map50), 4),
            "map50_95": round(float(val.box.map), 4),
        }
    except Exception as e:  # noqa: BLE001
        print(f"[warn] val 실패: {e}")

    volume.commit()

    result = {
        "weights": dst,
        "names": model.names,
        "metrics": metrics,
        "epochs": epochs,
        "imgsz": imgsz,
        "fraction": fraction,
    }
    print(f"[done] {result}")
    return result


@app.function(image=image, volumes={"/models": volume})
def list_models():
    """볼륨에 저장된 모델/런 확인용."""
    import os

    out = []
    for root, _dirs, files in os.walk("/models"):
        for fn in files:
            if fn.endswith(".pt"):
                p = os.path.join(root, fn)
                out.append({"path": p, "mb": round(os.path.getsize(p) / 1e6, 1)})
    return out
