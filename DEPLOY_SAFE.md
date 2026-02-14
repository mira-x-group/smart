# 🚀 GitHub 안전 배포 가이드

## ✅ 보안 확인 완료

- ✅ `.env` 파일이 `.gitignore`에 포함되어 있음
- ✅ `.env` 파일이 Git에 추적되지 않음
- ✅ API 키가 환경 변수로 관리됨
- ✅ 하드코딩된 API 키 없음

## 📋 배포 전 최종 확인

### 1. 스테이징된 파일 확인
```bash
git status
```

**확인사항:**
- ❌ `.env` 파일이 목록에 없어야 함
- ❌ `instance/db.sqlite3` 파일이 목록에 없어야 함
- ✅ `env.example` 파일은 있어야 함 (템플릿)
- ✅ 새로운 STT 파일들 (`stt_core.js`, `stt_parser.js`, `select_stt.js`, `result_stt.js`)

### 2. 민감한 정보 검색
```bash
# 하드코딩된 API 키 검색 (결과가 없어야 함)
git grep -i "fa-0obhFH8IfffG" || echo "✅ 안전함"
```

## 🚀 안전한 푸시 단계

### 방법 1: 단계별 실행

```bash
# 1. 현재 상태 확인
git status

# 2. 모든 변경사항 추가
git add .

# 3. 스테이징된 파일 확인 (민감한 파일 없는지)
git status --short

# 4. 커밋
git commit -m "STT 기능 추가 및 보안 강화

- STT 기본 라이브러리 추가 (stt_core.js, stt_parser.js)
- Select/Result 페이지 STT 핸들러 추가
- selectAPI 객체 추가 (STT 연동)
- 환경 변수 기반 API 키 관리 유지"

# 5. 푸시
git push origin and
```

### 방법 2: 한 번에 실행

```bash
git add . && git status --short && git commit -m "STT 기능 추가 및 보안 강화" && git push origin and
```

## 🔐 배포 후 환경 변수 설정

### Render 배포 시
Render 대시보드 → Environment Variables에서 설정:
- `GEMINI_API_KEY` = (실제 API 키)
- `FASHN_API_KEY` = (실제 API 키)
- `FLASK_DEBUG` = `false`
- `DATABASE_URL` = (자동 설정됨)

### 로컬 개발 시
`.env` 파일 생성:
```bash
GEMINI_API_KEY=실제_키_여기에
FASHN_API_KEY=실제_키_여기에
FLASK_DEBUG=true
PORT=5001
```

## ⚠️ 중요 주의사항

1. **절대 하드코딩 금지**
   - API 키를 코드에 직접 작성하지 마세요
   - 항상 환경 변수를 사용하세요

2. **.env 파일 확인**
   - `.env` 파일은 절대 Git에 커밋하지 마세요
   - `.gitignore`에 포함되어 있는지 확인하세요

3. **env.example 사용**
   - `env.example` 파일은 템플릿이므로 커밋해도 됩니다
   - 실제 API 키는 포함하지 마세요

## ✅ 현재 상태

- ✅ 모든 API 키가 환경 변수로 관리됨
- ✅ `.env` 파일이 Git 추적에서 제외됨
- ✅ `env.example` 템플릿 파일 존재
- ✅ 하드코딩된 민감한 정보 없음

**이제 안전하게 푸시할 수 있습니다!** 🎉

