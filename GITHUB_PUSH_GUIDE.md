# GitHub 푸시 가이드

## ⚠️ 중요: 환경 변수 보안 확인

푸시하기 전에 반드시 확인하세요:
- `.env` 파일이 `.gitignore`에 포함되어 있는지 확인
- API 키가 코드에 하드코딩되어 있지 않은지 확인

## 단계별 푸시 방법

### 1단계: 현재 상태 확인
```bash
git status
```

### 2단계: .gitignore 확인 (중요!)
```bash
# .env 파일이 무시되는지 확인
git check-ignore .env
# 결과가 나오면 OK (무시됨)
```

### 3단계: 변경사항 스테이징
```bash
# 모든 변경사항 추가 (민감한 파일은 자동으로 제외됨)
git add .

# 또는 개별 파일 추가
git add app.py
git add fashn_tryon.py
git add requirements.txt
git add render.yaml
git add README.md
git add env.example
git add .gitignore
git add static/
git add templates/
```

### 4단계: 커밋 전 최종 확인
```bash
# 스테이징된 파일 확인 (민감한 파일이 없는지 확인)
git status
```

**확인사항:**
- ❌ `.env` 파일이 목록에 있으면 안 됨
- ❌ `instance/db.sqlite3` 파일이 목록에 있으면 안 됨
- ❌ `__pycache__/` 폴더가 목록에 있으면 안 됨
- ✅ `env.example` 파일은 있어야 함 (템플릿)

### 5단계: 커밋
```bash
git commit -m "Render 배포 환경 설정 및 보안 강화

- API 키를 환경 변수로 변경
- PostgreSQL/SQLite 자동 전환 설정
- Render 배포 설정 파일 추가
- requirements.txt 추가
- README.md 추가"
```

### 6단계: 원격 저장소 확인
```bash
# 원격 저장소 확인
git remote -v

# 원격 저장소가 없으면 추가
git remote add origin https://github.com/사용자명/저장소명.git
```

### 7단계: 푸시
```bash
# 현재 브랜치 확인
git branch

# 푸시 (브랜치명에 맞게 수정)
git push origin and

# 또는 메인 브랜치인 경우
git push origin main
```

## 문제 해결

### .env 파일이 스테이징된 경우
```bash
# 스테이징에서 제거
git restore --staged .env

# .gitignore 확인
cat .gitignore
```

### 이미 커밋된 민감한 정보가 있는 경우
```bash
# Git 히스토리에서 .env 파일 제거 (주의: 히스토리 재작성)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# 강제 푸시 (팀원과 협의 필요)
git push origin --force --all
```

## Render 배포 전 체크리스트

- [ ] `.env` 파일이 커밋되지 않았는지 확인
- [ ] `env.example` 파일이 커밋되었는지 확인
- [ ] `requirements.txt`가 커밋되었는지 확인
- [ ] `render.yaml`이 커밋되었는지 확인
- [ ] `README.md`가 커밋되었는지 확인
- [ ] 모든 변경사항이 푸시되었는지 확인

## 안전한 푸시 명령어 (한 번에 실행)

```bash
# 1. 상태 확인
git status

# 2. .gitignore 확인
git check-ignore .env

# 3. 변경사항 추가
git add .

# 4. 스테이징된 파일 확인 (민감한 파일 없는지)
git status

# 5. 커밋
git commit -m "Render 배포 환경 설정"

# 6. 푸시
git push origin and
```


