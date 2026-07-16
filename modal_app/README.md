# Soccer GPU 분석 서비스 (Modal)

기존 Railway 파이프라인은 그대로 두고, GPU에서 도는 **고급 분석**을 추가하는 서비스입니다.

- **A) 선수 추적 지표**: BoT-SORT 추적 + 카메라 흔들림 보정 → 이동거리 / 스프린트 / 평균·최고속도 / 활동 히트맵
- **C) 공 정밀 탐지**: 하이라이트 구간에 SAHI 슬라이싱 추론으로 공 검출률 향상

`MODAL_ANALYZE_URL` 환경변수가 백엔드에 설정되지 않으면 이 서비스는 **호출되지 않으며**, 기존 분석 동작은 100% 그대로 유지됩니다.

---

## 1) 사전 준비 (최초 1회)

```bash
pip install modal
modal token new          # 브라우저 인증
```

가입 시 무료 크레딧이 제공됩니다. 결제수단 등록 전까지는 크레딧 한도 내에서만 실행됩니다.

## 2) 인증 토큰용 Secret 생성

백엔드만 이 GPU 엔드포인트를 호출하도록 공유 비밀키를 만듭니다. `<RANDOM>` 은 길고 임의의 문자열로.

```bash
modal secret create soccer-gpu-auth GPU_AUTH_TOKEN=<RANDOM>
```

## 3) 배포

```bash
modal deploy modal_app/soccer_gpu.py
```

배포가 끝나면 두 개의 URL이 출력됩니다.

- `analyze` (POST) → 백엔드가 호출할 분석 엔드포인트
- `hello` (GET) → 브라우저로 열어 `{"ok": true}` 가 보이면 정상

## 4) 백엔드(Railway) 환경변수 설정

| 변수 | 값 |
| --- | --- |
| `MODAL_ANALYZE_URL` | 위 `analyze` 엔드포인트 URL |
| `MODAL_AUTH_TOKEN` | 2)에서 정한 `<RANDOM>` 과 동일하게 |
| `MODAL_SAMPLE_FPS` | (선택) 기본 4. 높이면 정확↑·비용↑ |

설정 후 Railway 재배포(Deploy)하면, 게임 분석 시 자동으로 GPU 분석이 함께 실행됩니다.

확인: `GET https://api.10x.ai.kr/api/health` 응답에 `"modalEnabled": true` 가 보이면 연결 완료.

---

## Phase A: SoccerNet Action Spotting (T-DEED POC)

1인 선수 분석에서 **슛·골 후보 시각** 힌트를 추가합니다. 방송 중계(SoccerNet) 기준 학습 모델이라 휴대폰 영상에서는 오탐 가능 — **확정 사실이 아니라 후보 순위 힌트만** 사용합니다.

### 배포 (최초 1회)

```bash
# soccer_gpu 와 동일 secret 재사용 가능
modal run modal_app/action_spotting.py::download_checkpoint
modal deploy modal_app/action_spotting.py
```

`hello` GET → `"checkpointReady": true` 확인.

### Railway 환경변수

| 변수 | 값 |
| --- | --- |
| `MODAL_ACTION_SPOT_URL` | `spot` POST 엔드포인트 URL |
| `MODAL_AUTH_TOKEN` | soccer_gpu 와 동일 |
| `ACTION_SPOTTING_ENABLED` | `1` (기본) |
| `ACTION_SPOT_THRESHOLD` | (선택) 기본 0.25 |

`/api/health` → `actionSpotting.enabled: true` 확인.

---

## 비용 메모

- T4 GPU, 20분 영상 기준 1회 약 $0.05~0.15 (사용한 시간만큼만 과금, 유휴 시 0원)
- `MODAL_SAMPLE_FPS` 와 모델 크기(`SOCCER_YOLO_MODEL`)로 비용/정확도 조절 가능

## 참고

- 거리/속도는 단안(모노큘러) 영상 기반 **추정치**입니다. 절대값보다 활동량·성향 비교에 활용하세요.
- 폰으로 촬영한 패닝 영상은 카메라 모션 보정을 적용하지만, 화면 밖으로 자주 벗어나는 선수는 추적이 끊길 수 있습니다.
