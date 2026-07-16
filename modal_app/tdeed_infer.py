"""
T-DEED SoccerNet action spotting inference wrapper (Phase A POC).

Runs inside Modal container with T-DEED cloned to /opt/tdeed and checkpoint on volume.
Returns normalized events — no file writes.
"""

from __future__ import annotations

import copy
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

TDEED_ROOT = os.environ.get("TDEED_ROOT", "/opt/tdeed")
CHECKPOINT_ROOT = os.environ.get("TDEED_CHECKPOINT_ROOT", "/models/tdeed")
DEFAULT_MODEL = os.environ.get("TDEED_MODEL", "SoccerNet_small")
FPS_SN = 25
STRIDE_SN = 12
WINDOWS_SN = 6
FRAME_SIZE = (398, 224)  # width, height — T-DEED SoccerNet default


def _ensure_tdeed_path() -> None:
    if TDEED_ROOT not in sys.path:
        sys.path.insert(0, TDEED_ROOT)


def checkpoint_path(model_name: str = DEFAULT_MODEL) -> str:
    dataset = model_name.split("_")[0]
    return os.path.join(CHECKPOINT_ROOT, dataset, model_name, "checkpoint_best.pt")


def checkpoint_ready(model_name: str = DEFAULT_MODEL) -> bool:
    return os.path.isfile(checkpoint_path(model_name))


def _load_classes() -> Dict[str, int]:
    path = os.path.join(TDEED_ROOT, "data", "soccernet", "class.txt")
    classes: Dict[str, int] = {}
    with open(path, encoding="utf-8") as fp:
        for i, line in enumerate(fp, start=1):
            name = line.strip()
            if name:
                classes[name] = i
    return classes


def _update_args_from_config(args: Any, config: dict) -> Any:
    for key, val in config.items():
        setattr(args, key, val)
    if getattr(args, "crop_dim", 0) is not None and args.crop_dim <= 0:
        args.crop_dim = None
    if "pretrain" not in config:
        args.pretrain = None
    return args


def _process_frame_predictions_inference(
    classes: Dict[str, int],
    scores: np.ndarray,
    support: np.ndarray,
    threshold: float,
) -> Tuple[List[dict], List[dict]]:
    classes_inv = {v: k for k, v in classes.items()}
    if np.min(support) == 0:
        support = support.copy()
        support[support == 0] = 1
    scores = scores / support[:, None]
    pred = np.argmax(scores, axis=1)

    events: List[dict] = []
    events_high_recall: List[dict] = []
    for i in range(pred.shape[0]):
        if pred[i] != 0:
            events.append(
                {
                    "label": classes_inv[pred[i]],
                    "frame": i,
                    "score": float(scores[i, pred[i]].item()),
                }
            )
        for j in classes_inv:
            if scores[i, j] >= threshold:
                events_high_recall.append(
                    {
                        "label": classes_inv[j],
                        "frame": i,
                        "score": float(scores[i, j].item()),
                    }
                )
    return events, events_high_recall


def _soft_non_maximum_suppression(events: List[dict], window: int, threshold: float) -> List[dict]:
    preds = [{"events": copy.deepcopy(events)}]
    new_pred: List[dict] = []
    for video_pred in preds:
        events_by_label: dict = defaultdict(list)
        for e in video_pred["events"]:
            events_by_label[e["label"]].append(e)

        out_events: List[dict] = []
        for v in events_by_label.values():
            v = list(v)
            while v:
                e1 = max(v, key=lambda x: x["score"])
                if e1["score"] < threshold:
                    break
                pos1 = next(pos for pos, e in enumerate(v) if e["frame"] == e1["frame"])
                out_events.append(copy.deepcopy(e1))
                list_pos = [
                    pos
                    for pos, e in enumerate(v)
                    if (e["frame"] >= e1["frame"] - window) and (e["frame"] <= e1["frame"] + window)
                ]
                for pos in list_pos:
                    v[pos]["score"] = v[pos]["score"] * (abs(e1["frame"] - v[pos]["frame"])) ** 2 / (
                        (window + 0) ** 2
                    )
                v.pop(pos1)

        out_events.sort(key=lambda x: x["frame"])
        new_video_pred = copy.deepcopy(video_pred)
        new_video_pred["events"] = out_events
        new_pred.append(new_video_pred)
    return new_pred[0]["events"]


def _video_fps(video_path: str) -> float:
    import cv2

    cap = cv2.VideoCapture(video_path)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    cap.release()
    return fps if fps > 1 else FPS_SN


def run_tdeed_inference(
    video_path: str,
    *,
    model_name: str = DEFAULT_MODEL,
    threshold: float = 0.25,
    class_filter: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Run T-DEED SoccerNet action spotting on a local video file.
    Returns dict with events [{label, timeSec, confidence, frameIndex, stride}].
    """
    ckpt = checkpoint_path(model_name)
    if not os.path.isfile(ckpt):
        return {
            "available": False,
            "error": "checkpoint_missing",
            "checkpointPath": ckpt,
            "model": model_name,
        }

    _ensure_tdeed_path()
    prev_cwd = os.getcwd()
    os.chdir(TDEED_ROOT)

    try:
        import torch
        from torch.utils.data import DataLoader

        from model.model import TDEEDModel
        from util.io import load_json
        from dataset.frame import ActionSpotInferenceDataset

        dataset_key = model_name.split("_")[0]
        config_path = os.path.join("config", dataset_key, f"{model_name}.json")
        config = load_json(config_path)

        class _Args:
            pass

        args = _Args()
        args.model = model_name
        args = _update_args_from_config(args, config)

        classes = _load_classes()
        model = TDEEDModel(args=args)
        model.load(torch.load(ckpt, map_location="cpu"))

        stride = STRIDE_SN
        overlap_len = args.clip_len // 2
        inference_dataset = ActionSpotInferenceDataset(
            video_path,
            clip_len=args.clip_len,
            overlap_len=overlap_len,
            stride=stride,
            dataset=args.dataset,
            size=FRAME_SIZE,
        )

        inference_loader = DataLoader(
            inference_dataset,
            batch_size=args.batch_size,
            shuffle=False,
            num_workers=min(4, args.num_workers),
            pin_memory=torch.cuda.is_available(),
            drop_last=False,
        )

        video_len = inference_dataset._video_len
        predictions = np.zeros((video_len // stride, len(classes) + 1), np.float32)
        support = np.zeros((video_len // stride), np.int32)

        for frames, starts in inference_loader:
            _, batch_pred_scores = model.predict(frames)
            for i in range(frames.shape[0]):
                pred_scores = batch_pred_scores[i]
                start = starts[i].item()
                if start < 0:
                    pred_scores = pred_scores[-start:, :]
                    start = 0
                end = start + pred_scores.shape[0]
                if end >= predictions.shape[0]:
                    end = predictions.shape[0]
                    pred_scores = pred_scores[: end - start, :]
                predictions[start:end, :] += pred_scores
                support[start:end] += (pred_scores.sum(axis=1) != 0).astype(np.int32)

        _, events_hr, _ = _process_frame_predictions_inference(
            classes, predictions, support, threshold
        )
        events = _soft_non_maximum_suppression(events_hr, WINDOWS_SN, threshold)

        fps = _video_fps(video_path)
        normalized: List[dict] = []
        for e in events:
            frame_idx = int(e["frame"]) * stride
            time_sec = round(frame_idx / fps, 2)
            if class_filter and e["label"] not in class_filter:
                continue
            normalized.append(
                {
                    "label": e["label"],
                    "timeSec": time_sec,
                    "confidence": round(float(e["score"]), 4),
                    "frameIndex": frame_idx,
                    "stride": stride,
                }
            )

        normalized.sort(key=lambda x: (-x["confidence"], x["timeSec"]))
        return {
            "available": True,
            "model": model_name,
            "engine": "t-deed-soccernet",
            "threshold": threshold,
            "videoFps": round(fps, 2),
            "frameSize": {"width": FRAME_SIZE[0], "height": FRAME_SIZE[1]},
            "eventCount": len(normalized),
            "events": normalized,
            "disclaimer": (
                "SoccerNet/T-DEED는 방송 중계 영상 기준 학습. "
                "휴대폰 촬영 영상에서는 오탐·미탐 가능 — 코치 검토용 후보만 제공."
            ),
        }
    finally:
        os.chdir(prev_cwd)
