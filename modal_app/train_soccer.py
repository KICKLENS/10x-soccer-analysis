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

# Roboflow Universe에서 가져올 대용량 공개 데이터셋 목록
# (workspace, project, version) 형식
ROBOFLOW_UNIVERSE_DATASETS = [
    ("roboflow-100", "soccer-players-detection5", 1),
    ("sports-1ivbt", "football-players-detection", 1),
    ("nfl-players", "football-player-detection-by-team", 1),
]

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install(
        "ultralytics==8.3.58",
        "opencv-python-headless==4.10.0.84",
        "numpy<2",
        "huggingface_hub==0.26.2",
        "lap==0.5.12",
        "roboflow==1.1.48",
        "pyyaml",
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


@app.function(
    image=image,
    gpu="A10G",
    timeout=24 * 3600,
    volumes={"/models": volume},
)
def train_from_roboflow(
    zip_bytes: bytes,
    epochs: int = 40,
    imgsz: int = 768,
    batch: int = 16,
    base: str = BASE_MODEL,
    run_name: str = "soccer_roboflow",
):
    """Roboflow에서 export한 YOLOv8 zip을 받아 학습."""
    import os
    import shutil
    import zipfile

    import yaml
    from ultralytics import YOLO

    # zip 압축 해제
    zip_path = "/tmp/roboflow_ds.zip"
    extract_root = "/tmp/roboflow_ds"
    with open(zip_path, "wb") as f:
        f.write(zip_bytes)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract_root)

    # data.yaml 찾기
    import glob
    candidates = glob.glob(os.path.join(extract_root, "**", "data.yaml"), recursive=True)
    if not candidates:
        raise RuntimeError(f"data.yaml을 찾지 못함 (root={extract_root})")
    data_yaml_path = candidates[0]
    base_dir = os.path.dirname(data_yaml_path)

    with open(data_yaml_path, "r") as f:
        cfg = yaml.safe_load(f) or {}

    # 절대경로로 yaml 재작성
    def _find_split(*names):
        for n in names:
            p = os.path.join(base_dir, n)
            if os.path.isdir(p):
                return p
            p2 = os.path.join(base_dir, "images", n)
            if os.path.isdir(p2):
                return p2
        return None

    train_dir = _find_split("train")
    val_dir = _find_split("val", "valid", "test")
    if not train_dir:
        raise RuntimeError(f"train 폴더를 찾지 못함 (base={base_dir})")
    if not val_dir:
        val_dir = train_dir

    names = cfg.get("names")
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]
    if not names:
        names = ["player", "goalkeeper", "referee", "ball"]

    fixed = {"path": base_dir, "train": train_dir, "val": val_dir, "names": names}
    fixed_path = os.path.join(base_dir, "data_modal.yaml")
    with open(fixed_path, "w") as f:
        yaml.safe_dump(fixed, f, allow_unicode=True)

    print(f"[dataset] classes={names}, train={train_dir}, val={val_dir}")

    model = YOLO(base)
    model.train(
        data=fixed_path,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
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
        print(f"[done] 모델 저장: {dst}")
    except Exception as e:
        print(f"[warn] best.pt 복사 실패: {e}")
        dst = best

    metrics = {}
    try:
        val = model.val(data=fixed_path, imgsz=imgsz, device=0, verbose=False)
        metrics = {
            "map50": round(float(val.box.map50), 4),
            "map50_95": round(float(val.box.map), 4),
        }
    except Exception as e:
        print(f"[warn] val 실패: {e}")

    volume.commit()
    result = {"weights": dst, "names": names, "metrics": metrics, "epochs": epochs}
    print(f"[done] {result}")
    return result


@app.local_entrypoint()
def kickoff(epochs: int = 50, imgsz: int = 768, batch: int = 16, fraction: float = 1.0):
    """배포된 train 함수를 spawn(서버측 독립 실행)하고 즉시 종료. 클라이언트와 무관하게 끝까지 돈다."""
    fn = modal.Function.from_name(APP_NAME, "train")
    call = fn.spawn(epochs=epochs, imgsz=imgsz, batch=batch, fraction=fraction)
    print(f"[kickoff] spawned train: call_id={call.object_id}")
    print("진행 확인: modal app logs (soccer-train) / 완료확인: list_models")


@app.local_entrypoint()
def train_roboflow(
    zip_path: str = "/Users/taeyun-io/Downloads/football-players-detection.yolov8.zip",
    epochs: int = 40,
    imgsz: int = 768,
):
    """로컬 Roboflow zip 파일을 Modal GPU에 업로드해서 학습."""
    print(f"[local] zip 읽는 중: {zip_path}")
    with open(zip_path, "rb") as f:
        zip_bytes = f.read()
    print(f"[local] zip 크기: {len(zip_bytes) / 1e6:.1f} MB, Modal 업로드 중...")
    result = train_from_roboflow.remote(zip_bytes=zip_bytes, epochs=epochs, imgsz=imgsz)
    print(f"[완료] {result}")


@app.function(
    image=image,
    gpu="A10G",
    timeout=24 * 3600,
    volumes={"/models": volume},
)
def train_from_universe(
    epochs: int = 50,
    imgsz: int = 1280,
    batch: int = 8,
    base: str = BASE_MODEL,
    run_name: str = "soccer_universe",
    extra_zip_bytes: bytes = None,
):
    """HuggingFace 대용량 데이터(25,000장) + 로컬 zip 합쳐서 학습."""
    import glob
    import os
    import shutil
    import zipfile

    import yaml
    from huggingface_hub import snapshot_download
    from ultralytics import YOLO

    # 통합 데이터셋 루트
    merged_root = "/tmp/merged_ds"
    for split in ("train", "valid"):
        os.makedirs(os.path.join(merged_root, "images", split), exist_ok=True)
        os.makedirs(os.path.join(merged_root, "labels", split), exist_ok=True)

    UNIFIED_CLASSES = ["player", "goalkeeper", "referee", "ball"]

    def _class_map(names: list) -> dict:
        mapping = {}
        for i, n in enumerate(names):
            nl = n.lower().strip()
            if nl in ("player", "person", "field player", "outfield player", "players"):
                mapping[i] = 0
            elif nl in ("goalkeeper", "goalie", "gk", "goal keeper"):
                mapping[i] = 1
            elif nl in ("referee", "ref", "linesman"):
                mapping[i] = 2
            elif "ball" in nl:
                mapping[i] = 3
        return mapping

    def _copy_split(src_img_dir, src_lbl_dir, split, class_map, prefix):
        if not os.path.isdir(src_img_dir):
            return 0
        copied = 0
        for img_file in os.listdir(src_img_dir):
            if not img_file.lower().endswith((".jpg", ".jpeg", ".png")):
                continue
            stem = os.path.splitext(img_file)[0]
            src_lbl = os.path.join(src_lbl_dir, stem + ".txt")
            if not os.path.exists(src_lbl):
                continue
            new_lines = []
            with open(src_lbl) as f:
                for line in f:
                    parts = line.strip().split()
                    if not parts:
                        continue
                    new_cls = class_map.get(int(parts[0]))
                    if new_cls is None:
                        continue
                    new_lines.append(f"{new_cls} " + " ".join(parts[1:]))
            if not new_lines:
                continue
            new_stem = f"{prefix}_{stem}"
            shutil.copy(
                os.path.join(src_img_dir, img_file),
                os.path.join(merged_root, "images", split, new_stem + os.path.splitext(img_file)[1]),
            )
            with open(os.path.join(merged_root, "labels", split, new_stem + ".txt"), "w") as f:
                f.write("\n".join(new_lines))
            copied += 1
        return copied

    total_images = 0

    # 1. HuggingFace 대용량 데이터셋 (Soccana, ~25,000장)
    print("[hf] HuggingFace 데이터셋 다운로드 중 (약 25,000장)...")
    try:
        hf_root = snapshot_download(
            repo_id=DATASET_REPO, repo_type="dataset", local_dir="/tmp/hf_soccer"
        )
        # zip 압축 해제
        for zp in glob.glob(os.path.join(hf_root, "**", "*.zip"), recursive=True):
            with zipfile.ZipFile(zp) as zf:
                zf.extractall("/tmp/hf_soccer_x")

        search_roots = [hf_root, "/tmp/hf_soccer_x"]
        yaml_candidates = []
        for sr in search_roots:
            yaml_candidates += glob.glob(os.path.join(sr, "**", "data.yaml"), recursive=True)

        for yp in yaml_candidates:
            with open(yp) as f:
                cfg = yaml.safe_load(f) or {}
            names = cfg.get("names", [])
            if isinstance(names, dict):
                names = [names[k] for k in sorted(names)]
            cmap = _class_map(names)
            if not cmap:
                continue
            base_dir = os.path.dirname(yp)
            for split in ("train", "valid"):
                for img_sub in (split, "val"):
                    img_dir = os.path.join(base_dir, "images", img_sub)
                    lbl_dir = os.path.join(base_dir, "labels", img_sub)
                    n = _copy_split(img_dir, lbl_dir, split, cmap, f"hf_{split[:2]}")
                    if n:
                        total_images += n
                        print(f"[hf] {split}: {n}장 추가")
                        break
    except Exception as e:
        print(f"[hf] HuggingFace 다운로드 실패: {e}")

    # 2. 로컬 zip (Roboflow 422장)
    if extra_zip_bytes:
        print("[zip] 로컬 Roboflow zip 추가 중...")
        with open("/tmp/extra.zip", "wb") as f:
            f.write(extra_zip_bytes)
        with zipfile.ZipFile("/tmp/extra.zip") as zf:
            zf.extractall("/tmp/extra_ds")
        yaml_candidates = glob.glob("/tmp/extra_ds/**/data.yaml", recursive=True)
        for yp in yaml_candidates:
            with open(yp) as f:
                cfg = yaml.safe_load(f) or {}
            names = cfg.get("names", [])
            if isinstance(names, dict):
                names = [names[k] for k in sorted(names)]
            cmap = _class_map(names)
            if not cmap:
                print(f"[zip] 클래스 매핑 실패: {names}")
                continue
            base_dir = os.path.dirname(yp)
            for split in ("train", "valid"):
                for img_sub in (split, "val", "valid"):
                    img_dir = os.path.join(base_dir, "images", img_sub)
                    lbl_dir = os.path.join(base_dir, "labels", img_sub)
                    n = _copy_split(img_dir, lbl_dir, split, cmap, f"rf_{split[:2]}")
                    if n:
                        total_images += n
                        print(f"[zip] {split}: {n}장 추가")
                        break

    print(f"[merge] 총 {total_images}장 통합 완료")
    if total_images == 0:
        raise RuntimeError("데이터셋 통합 실패 — 이미지가 0장입니다.")

    # valid가 비어있으면 train에서 10% 분리
    valid_imgs = os.path.join(merged_root, "images", "valid")
    valid_lbls = os.path.join(merged_root, "labels", "valid")
    train_imgs = os.path.join(merged_root, "images", "train")
    train_lbls = os.path.join(merged_root, "labels", "train")
    valid_count = len([f for f in os.listdir(valid_imgs) if f.endswith((".jpg", ".jpeg", ".png"))])
    if valid_count == 0:
        print("[split] valid 비어있음 — train에서 10% 분리")
        all_train = sorted([f for f in os.listdir(train_imgs) if f.endswith((".jpg", ".jpeg", ".png"))])
        n_val = max(50, len(all_train) // 10)
        import random
        random.seed(42)
        val_files = random.sample(all_train, min(n_val, len(all_train)))
        for img_file in val_files:
            stem = os.path.splitext(img_file)[0]
            lbl_file = stem + ".txt"
            src_i = os.path.join(train_imgs, img_file)
            src_l = os.path.join(train_lbls, lbl_file)
            dst_i = os.path.join(valid_imgs, img_file)
            dst_l = os.path.join(valid_lbls, lbl_file)
            shutil.move(src_i, dst_i)
            if os.path.exists(src_l):
                shutil.move(src_l, dst_l)
        print(f"[split] valid {len(val_files)}장 분리 완료")

    # data.yaml 생성
    data_yaml_path = os.path.join(merged_root, "data.yaml")
    with open(data_yaml_path, "w") as f:
        yaml.safe_dump({
            "path": merged_root,
            "train": os.path.join(merged_root, "images", "train"),
            "val": os.path.join(merged_root, "images", "valid"),
            "names": UNIFIED_CLASSES,
        }, f, allow_unicode=True)

    # 학습
    print(f"[train] yolo11m 학습 시작: {total_images}장, {epochs}에폭, imgsz={imgsz}")
    model = YOLO(base)
    model.train(
        data=data_yaml_path,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=0,
        project="/models/runs",
        name=run_name,
        exist_ok=True,
        patience=10,
        verbose=True,
        augment=True,
        hsv_h=0.015, hsv_s=0.7, hsv_v=0.4,
        flipud=0.1, fliplr=0.5,
        mosaic=1.0,
    )

    best = f"/models/runs/{run_name}/weights/best.pt"
    dst = "/models/soccer_best.pt"
    try:
        shutil.copy(best, dst)
        print(f"[done] 모델 저장: {dst}")
    except Exception as e:
        print(f"[warn] best.pt 복사 실패: {e}")
        dst = best

    metrics = {}
    try:
        val = model.val(data=data_yaml_path, imgsz=imgsz, device=0, verbose=False)
        metrics = {
            "map50": round(float(val.box.map50), 4),
            "map50_95": round(float(val.box.map), 4),
        }
    except Exception as e:
        print(f"[warn] val 실패: {e}")

    volume.commit()
    result = {"weights": dst, "total_images": total_images, "metrics": metrics, "epochs": epochs}
    print(f"[done] {result}")
    return result


@app.local_entrypoint()
def train_universe(
    epochs: int = 50,
    imgsz: int = 1280,
    extra_zip: str = "/Users/taeyun-io/Downloads/football-players-detection.yolov8.zip",
):
    """Roboflow Universe 대용량 데이터셋으로 학습 (로컬 zip 병합 포함)."""
    extra_bytes = None
    if extra_zip:
        import os
        if os.path.exists(extra_zip):
            with open(extra_zip, "rb") as f:
                extra_bytes = f.read()
            print(f"[local] 로컬 zip 포함: {extra_zip} ({len(extra_bytes)/1e6:.1f} MB)")
        else:
            print(f"[local] zip 파일 없음, Universe 데이터만 사용: {extra_zip}")

    print("[local] Modal 학습 시작 (백그라운드)...")
    result = train_from_universe.remote(
        epochs=epochs, imgsz=imgsz, extra_zip_bytes=extra_bytes
    )
    print(f"[완료] {result}")


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
