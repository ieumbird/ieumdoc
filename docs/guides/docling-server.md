# Docling 서버 구성 안내

- Status: Implemented
- Last verified: 2026-10-30. Windows Docker Desktop, NVIDIA RTX 3070 Ti와 CUDA 이미지 1.32.0에서 NIST 11쪽 PDF를 앱으로 변환했다. CPU 실행·영구 볼륨 재시작·최소 자원은 확인 안 됨.
- Scope: Litzio 관리자·서버 운영자의 외부 Docling 서비스 구성. 제품 동작은 [Docling 변환 계약](../design/docling-conversion-v1.md), 실행 근거는 [공개 fixture 재현 절차](../../packages/docling/test/fixtures/README.md#reproduction)를 따른다.

## Litzio와 서버의 관계

Docling은 PDF를 읽는 **별도 서비스**다. Litzio가 서버를 설치하거나 모델을 내려받지는 않는다. 관리자가 서비스를 준비하고 앱의 **설정 → Docling → 서버 주소**에 주소를 넣는다. 기본값은 `http://127.0.0.1:8001`이다.

요청은 Desktop 앱의 Host, `ieumdoc serve`의 HTTP Host 또는 개발 Vite 서버에서 보낸다. 웹브라우저에서 Docling으로 직접 요청하지 않는다. HTTP Host에서 `127.0.0.1`은 접속자의 PC가 아니라 **Litzio Host 서버**다. 서버 주소도 그 Host OS 사용자 계정의 `~/.ieumdoc/docling.json`에 저장한다. 별도 구성 파일은 `LITZIO_DOCLING_SETTINGS_FILE` 환경변수로 지정할 수 있다.

탐색기의 PDF 메뉴나 Command Center의 **Docling으로 변환**에서 실행한다. PDF 옆의 새 `<이름>.docling` 폴더에 원본 묶음·Litzio 문서를 만들고 대조 탭을 연다. 같은 이름이 있으면 `-2`, `-3`을 붙인다. 원본 PDF·기존 결과는 덮어쓰지 않는다. HTTP Host에서는 PDF와 결과 폴더 모두 허용 Root 안에 있어야 한다.

## 요구 사항과 확인한 자원

- Docker Engine와 Compose v2 이상. Windows에서는 Docker Desktop의 Linux 컨테이너를 사용한다.
- GPU 실행: NVIDIA GPU와 컨테이너 CUDA 지원. 이번에는 RTX 3070 Ti(8 GiB VRAM), `docling-serve-cu128`을 사용했다. Linux GPU 구성에는 NVIDIA Container Toolkit 등 호스트 준비가 필요하다. Linux GPU 실기는 확인 안 됨.
- CPU 실행: 아래 CPU 이미지로 바꾸고 `gpus: all`을 제거하며 `DOCLING_DEVICE: cpu`를 쓴다. 이번 CPU 변환 성능·메모리는 확인 안 됨.
- 이번 CUDA 이미지의 로컬 크기는 약 **6.01 GB**, CodeFormulaV2 추가 후 컨테이너 모델 캐시는 약 **1.5 GB**였다. Docker 이미지 계층·다운로드 임시 파일·입력 PDF·결과 이미지 공간이 따로 필요하다. 이 값은 전체 디스크 최소 사양이 아니다.
- NIST 11쪽 처리 중 컨테이너 메모리 한 표본은 **3.47 GiB**, 처리 후 GPU 사용 한 표본은 **3,744 MiB**였다. 최고치나 최소 요구량은 확인 안 됨. 큰 문서는 결과 JSON·페이지 이미지와 Litzio Host의 메모리도 필요하다. 해당 문서로 별도 측정한다.

## docling-serve 1.32.0 시작

작업할 새 폴더에 다음을 `compose.yaml`로 저장한다. GPU 예시다. digest는 2026-10-30 확인값이며 태그와 함께 고정한다.

```yaml
services:
  docling:
    image: ghcr.io/docling-project/docling-serve-cu128:v1.32.0@sha256:63ced1b5500fa60750f431bbd0527436b7566b421569e44530d826cda8174979
    gpus: all
    ports:
      - "127.0.0.1:8001:5001"
    environment:
      DOCLING_DEVICE: cuda
      DOCLING_SERVE_ENABLE_UI: "false"
      DOCLING_SERVE_ENG_KIND: local
      DOCLING_SERVE_ENG_LOC_NUM_WORKERS: "1"
      UVICORN_WORKERS: "1"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5001/ready', timeout=5)"]
      interval: 30s
      timeout: 10s
      start_period: 180s
      retries: 5
```

CPU 이미지 선택 시 위 `image`를 다음으로 바꾼다. `gpus: all`을 삭제하고 `DOCLING_DEVICE`도 `cpu`로 바꾼다. 이 digest의 플랫폼 목록은 확인했으나 CPU 실행은 확인 안 됨.

```text
ghcr.io/docling-project/docling-serve-cpu:v1.32.0@sha256:576fc2074ac77bcfbf3fe27633aa0dd89b452a170b2cd31689c8751e94d60f7a
```

Windows PowerShell:

```powershell
docker compose config
docker compose up -d
docker compose ps
Invoke-RestMethod http://127.0.0.1:8001/version
Invoke-WebRequest http://127.0.0.1:8001/ready
```

Linux도 같은 Compose 명령을 사용한다. HTTP 확인만 다음으로 바꾼다.

```bash
curl --fail http://127.0.0.1:8001/version
curl --fail http://127.0.0.1:8001/ready
```

## 프로필 모델 준비

Litzio는 `litzio-pdf-en-v1` 프로필 하나를 고정해서 보낸다. 영어 RapidOCR, 기본 layout, accurate TableFormer, 코드·수식용 **`docling-project/CodeFormulaV2`**, 그림 분류용 **DocumentFigureClassifier-v2.5**가 필요하다. 프로필의 개별 옵션을 꺼서 누락 모델을 우회하지 않는다.

이번 공식 CUDA 이미지에는 기본 OCR/layout/table/그림 분류 모델이 있었지만 CodeFormulaV2는 없었다. `/ready`가 성공해도 그 모델을 요구하는 변환은 실패했다. **실행 중인 일회용 컨테이너에만** 추가하려면 다음을 쓴다. 이 명령은 PowerShell과 Linux에서 같다.

```powershell
docker compose exec -T docling docling-tools models download-hf-repo docling-project/CodeFormulaV2 --quiet
```

이 경우 컨테이너를 삭제하면 추가 모델도 없어진다. 반복 운영에서는 다음 named volume을 Compose에 추가할 수 있다.

```yaml
services:
  docling:
    # 위 서비스의 나머지 설정은 유지한다.
    environment:
      DOCLING_SERVE_ARTIFACTS_PATH: /opt/app-root/src/.cache/docling/models
      # 위 DOCLING_DEVICE, DOCLING_SERVE_*와 UVICORN_WORKERS도 유지한다.
    volumes:
      - docling-models:/opt/app-root/src/.cache/docling/models
volumes:
  docling-models:
```

기존 `environment`에 키를 합치며 중복 `environment` 블록을 만들지 않는다. 새 named volume은 Docker의 기본 초기 복사 동작으로 이미지 안의 기존 모델을 받아야 한다. 기존 빈 디렉터리를 bind mount하면 이미지 모델이 가려질 수 있으므로 같은 것으로 취급하지 않는다. 마운트한 뒤 위 CodeFormulaV2 명령을 실행하면 추가 모델도 같은 볼륨에 남는다. 이미지가 바뀌어도 이미 존재하는 볼륨이 자동 갱신되는 것은 아니므로 운영자가 전체 모델 세트를 관리해야 한다. 이 PR에서는 영구 볼륨 생성·재시작을 직접 검증하지 않았다.

그림 분류 모델이 없는 별도 구성이라면 공식 모델 도구의 `picture_classifier` 세트도 준비한다. 내려받는 위치와 서버의 `DOCLING_SERVE_ARTIFACTS_PATH`가 같아야 한다.

```powershell
docker compose exec -T docling docling-tools models download picture_classifier --output-dir /opt/app-root/src/.cache/docling/models
```

이 추가 명령은 이번 이미지에는 필요하지 않아 실행하지 않았다. 실제 배포에서는 사용하는 이미지와 모델 도구의 `--help`·공식 모델 문서를 함께 확인한다. 모델 다운로드는 외부 Hugging Face 접근·용량이 필요하며 실패나 제한이 있으면 운영자가 해결한다. 인증 토큰을 Compose 예시나 문서에 넣지 않는다.

## Litzio에서 준비 확인

`/version`의 `docling-serve`가 **1.32.0**이고 `/ready`가 200인지 확인한 뒤, Litzio **설정 → Docling → 연결 확인**을 누른다. 같은 서버에서 `/openapi.json`의 버전과 프로필 기준 SHA-256도 비교한다. 버전이 같고 명세 해시만 다르면 차이를 알리고 변환을 허용하며 변환 기록에 남긴다.

**연결 확인은 모든 변환 모델의 준비를 보장하지 않는다.** 공식 1.32.0 API에는 특정 프로필의 모델 캐시 준비를 검사하는 endpoint가 없다. 모델 준비는 서버 운영자의 책임이다. 준비 후 대표 PDF로 실제 변환을 확인한다. Litzio의 원본 묶음 무결성·문서 구조 검증도 OCR 정확성이나 원문 충실도를 보장하지 않으므로 대조 탭에서 사람이 검토한다.

## 원격 서버

변환 시 **PDF 내용이 Host에서 Docling 서버로 전송**된다. 인증 없는 API를 인터넷에 그대로 공개하지 않는다. loopback 바인딩을 유지한 reverse proxy, VPN/Tailnet 등 접근 통제된 경로로 제공하고 전송 구간도 보호한다. TLS·인증·방화벽은 운영자가 관리한다.

Litzio 서버 주소는 `http(s)`와 reverse-proxy 경로 접두사를 지원하지만 자격 증명·query·fragment가 들어간 URL은 거부한다. 앱에는 Docling 인증 헤더·로그인 입력이 없다. 브라우저의 로그인 쿠키도 Host의 서버 간 요청으로 전달되지 않는다. 따라서 URL에 암호나 토큰을 끼워 넣지 말고 Host가 접근 가능한 신뢰 네트워크나 운영자 관리 프록시를 구성한다.

## 문제 해결

| 증상 | 확인·다음 행동 |
| --- | --- |
| 연결 불가 | 주소·포트·서버 실행·Host 기준 네트워크를 확인한다. HTTP Host에서 접속자 PC의 localhost를 가리키지 않았는지 확인한다. |
| 버전 불일치 | 위 1.32.0 이미지와 `/version`, OpenAPI 버전을 확인한다. |
| 준비 안 됨 | 서버 시작·모델 초기화·worker 로그를 확인한다. 준비되기 전 반복 변환을 제출하지 않는다. |
| 필수 모델 누락 | 같은 artifacts 경로에 CodeFormulaV2·프로필의 그림 분류/OCR/layout/table 모델을 준비한다. |
| `Internal processing error.` | Litzio의 **작업 ID**로 `docker compose logs docling`에서 실제 원인을 찾는다. 이번 CodeFormulaV2 누락은 API가 이 일반 문장과 `failure: null`만 반환했고 상세 원인은 로그에 있었다. Litzio는 숨겨진 원인을 추측하지 않는다. |
| 시간 초과·대기 중단 | 서버 작업이 계속될 수 있다. 작업 ID로 먼저 상태·로그를 확인한 뒤 다시 제출한다. 앱 제한은 전체 30분이다. Litzio는 자동 재제출하지 않는다. |
| 큰 문서·메모리 부족 | `docker stats`, 서버 로그와 GPU 메모리를 확인하고 Docker/Host 자원을 확보한다. 이번 11쪽 수치로 138쪽 등 큰 문서의 요구량을 추정하지 않는다. |

```powershell
docker compose logs --tail 200 docling
docker stats --no-stream
```

## 종료와 정리

진행 중인 변환을 확인한 뒤 다음으로 컨테이너·네트워크를 정리한다. named volume을 구성했다면 기본 `down`으로는 모델 볼륨을 지우지 않는다. 유지하려는 캐시에 `down -v`를 사용하지 않는다.

```powershell
docker compose down
docker compose ps --all
```

Windows에서 이번 작업을 위해 Docker Desktop도 직접 켰다면 Docker Desktop의 Quit 또는 설치된 CLI의 `docker desktop stop`으로 종료하고 상태를 확인한다. 원래 사용 중이던 Docker·다른 컨테이너는 종료하지 않는다. Linux에서는 다른 작업이 사용할 수 있는 Docker daemon 전체를 종료할 필요가 없다. 변환 결과 폴더는 컨테이너와 별개로 Host에 남는다.

## 근거

확인 날짜: **2026-10-30**.

- [공식 docling-serve v1.32.0 모델 운영 안내](https://github.com/docling-project/docling-serve/blob/v1.32.0/docs/models.md): 추가 모델·artifacts 경로·사전 다운로드와 영구 저장 방법.
- [공식 v1.32.0 앱/API 구현](https://github.com/docling-project/docling-serve/blob/v1.32.0/docling_serve/app.py): readiness·version·변환 작업 경계. 이번 실행 서버의 OpenAPI 전체 경로도 대조했다.
- [Docker volume 초기 내용 복사](https://docs.docker.com/engine/storage/volumes/#populate-a-volume-using-a-container): 새 named volume과 기존 이미지 디렉터리의 관계.
- [저장소 공개 fixture 절차](../../packages/docling/test/fixtures/README.md#reproduction): 일회용 컨테이너의 CodeFormulaV2 준비·원본 자료·프로필 근거.
