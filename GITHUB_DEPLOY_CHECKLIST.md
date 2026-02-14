# 🔒 GitHub 배포 전 보안 체크리스트

## ✅ 필수 확인 사항

### 1. API 키 보안 확인
- [ ] `.env` 파일이 `.gitignore`에 포함되어 있는지 확인
- [ ] 코드에 하드코딩된 API 키가 없는지 확인
- [ ] `env.example` 파일이 커밋되었는지 확인 (템플릿용)

### 2. 민감한 파일 확인
- [ ] `instance/db.sqlite3` 파일이 커밋되지 않았는지 확인
- [ ] `__pycache__/` 폴더가 커밋되지 않았는지 확인
- [ ] `.env` 파일이 커밋되지 않았는지 확인

### 3. 환경 변수 설정
GitHub에 푸시하기 전에 다음 환경 변수들이 코드에 하드코딩되어 있지 않은지 확인:

**필수 환경 변수:**
- `GEMINI_API_KEY` - Google Gemini API 키
- `FASHN_API_KEY` - Fashn API 키
- `DATABASE_URL` - 데이터베이스 URL (선택, 로컬은 SQLite 사용)
- `FLASK_DEBUG` - 디버그 모드 (기본값: false)
- `PORT` - 포트 번호 (기본값: 5001)

## 📋 배포 전 최종 확인 명령어

```bash
# 1. .env 파일이 무시되는지 확인
git check-ignore .env

# 2. .env 파일이 Git에 추적되고 있는지 확인 (결과가 없어야 함)
git ls-files | findstr /i "\.env"

# 3. 하드코딩된 API 키 검색 (결과가 없어야 함)
git grep -i "fa-0obhFH8IfffG" || echo "✅ 하드코딩된 API 키 없음"

# 4. 스테이징된 파일 확인
git status

# 5. 민감한 파일이 스테이징 목록에 없는지 확인
git status --short | findstr /i "\.env instance"
```

## 🚀 GitHub 푸시 단계

### 1단계: 최종 확인
```bash
# 모든 변경사항 확인
git status

# .env 파일이 추적되지 않는지 확인
git check-ignore -v .env
```

### 2단계: 변경사항 추가
```bash
# 모든 변경사항 추가 (민감한 파일은 자동 제외됨)
git add .

# 스테이징된 파일 확인 (민감한 파일 없는지)
git status
```

**⚠️ 확인사항:**
- ❌ `.env` 파일이 목록에 있으면 안 됨
- ❌ `instance/db.sqlite3` 파일이 목록에 있으면 안 됨
- ✅ `env.example` 파일은 있어야 함

### 3단계: 커밋
```bash
git commit -m "STT 기능 추가 및 보안 강화

- STT 기본 라이브러리 추가 (stt_core.js, stt_parser.js)
- Select/Result 페이지 STT 핸들러 추가
- selectAPI 객체 추가 (STT 연동)
- 환경 변수 기반 API 키 관리 유지
- .env 파일 Git 추적 제거"
```

### 4단계: 푸시
```bash
# 현재 브랜치 확인
git branch

# 푸시
git push origin and
```

## 🔐 배포 후 환경 변수 설정

### GitHub Secrets (GitHub Actions 사용 시)
Repository → Settings → Secrets and variables → Actions에서:
- `GEMINI_API_KEY`
- `FASHN_API_KEY`
- `DATABASE_URL` (필요시)
- `FLASK_DEBUG`

### Render 배포 시
Render 대시보드 → Environment Variables에서:
- `GEMINI_API_KEY`
- `FASHN_API_KEY`
- `FLASK_DEBUG=false`
- `DATABASE_URL` (자동 설정됨)

## ⚠️ 주의사항

1. **절대 하드코딩하지 마세요**
   - API 키를 코드에 직접 작성하지 마세요
   - 환경 변수만 사용하세요

2. **.env 파일 확인**
   - `.env` 파일이 Git에 커밋되지 않았는지 확인
   - `.gitignore`에 포함되어 있는지 확인

3. **이미 커밋된 경우**
   - Git 히스토리에서 제거해야 합니다
   - `git filter-branch` 또는 `git filter-repo` 사용

## ✅ 안전한 푸시 명령어 (한 번에)

```bash
# 1. 상태 확인
git status

# 2. .env 무시 확인
git check-ignore .env && echo "✅ .env 무시됨" || echo "❌ .env 무시 안 됨"

# 3. 변경사항 추가
git add .

# 4. 스테이징 확인
git status --short

# 5. 커밋
git commit -m "STT 기능 추가 및 보안 강화"

# 6. 푸시
git push origin and
```

