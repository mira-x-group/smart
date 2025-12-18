# Smart Mirror - 스마트 미러 패션 피팅 시스템

스마트폰 NFC 스캔과 미러를 연동한 가상 피팅 시스템입니다.

## 주요 기능

- 스마트폰으로 옷 NFC 태그 스캔
- 미러에서 실시간으로 스캔된 옷 확인
- 사진 촬영 및 가상 피팅
- 옷 선택 및 킵 기능
- 직원 호출 (KEEP) 기능

## 배포 환경 설정 (Render)

### 1. 환경 변수 설정

Render 대시보드에서 다음 환경 변수를 설정하세요:

- `GEMINI_API_KEY`: Google Gemini API 키
- `FASHN_API_KEY`: Fashn API 키
- `FLASK_DEBUG`: `false` (프로덕션 환경)
- `DATABASE_URL`: Render PostgreSQL 데이터베이스 URL (자동 설정됨)
- `PORT`: Render에서 자동으로 제공됨

### 2. 데이터베이스 초기화

Render 배포 후, 데이터베이스를 초기화하려면:

```bash
# Render Shell에서 실행
python db_init.py
```

### 3. 배포 방법

1. GitHub 저장소를 Render에 연결
2. `render.yaml` 파일이 자동으로 인식됨
3. 환경 변수 설정 (위 참조)
4. 배포 시작

## 로컬 개발 환경 설정

### 1. 가상 환경 생성 및 활성화

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
```

### 2. 의존성 설치

```bash
pip install -r requirements.txt
```

### 3. 환경 변수 설정

`env.example` 파일을 참고하여 `.env` 파일을 생성하고 API 키를 설정하세요:

```bash
# .env 파일 생성
GEMINI_API_KEY=your_gemini_api_key_here
FASHN_API_KEY=your_fashn_api_key_here
FLASK_DEBUG=true
PORT=5001
```

### 4. 데이터베이스 초기화

```bash
python db_init.py
```

### 5. 애플리케이션 실행

```bash
python app.py
```

애플리케이션이 `http://localhost:5001`에서 실행됩니다.

## 프로젝트 구조

```
smart-1/
├── app.py              # Flask 메인 애플리케이션
├── models.py           # 데이터베이스 모델
├── db_init.py          # 데이터베이스 초기화 스크립트
├── fashn_tryon.py      # Fashn API 연동
├── requirements.txt    # Python 의존성
├── render.yaml         # Render 배포 설정
├── env.example         # 환경 변수 템플릿
├── static/             # 정적 파일 (CSS, JS, 이미지)
│   ├── css/
│   ├── js/
│   ├── tops/
│   ├── bottoms/
│   └── results/
└── templates/          # HTML 템플릿
```

## 보안 주의사항

⚠️ **중요**: API 키는 절대 코드에 하드코딩하지 마세요. 항상 환경 변수를 사용하세요.

- `.env` 파일은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다.
- Render에서는 환경 변수를 대시보드에서 안전하게 설정할 수 있습니다.

## 문제 해결

### 데이터베이스 연결 오류

- Render에서 PostgreSQL 데이터베이스를 생성했는지 확인하세요.
- `DATABASE_URL` 환경 변수가 올바르게 설정되었는지 확인하세요.

### API 키 오류

- 환경 변수가 올바르게 설정되었는지 확인하세요.
- Render 대시보드에서 환경 변수를 다시 확인하세요.

## 라이선스

이 프로젝트는 개인/상업적 용도로 사용 가능합니다.

