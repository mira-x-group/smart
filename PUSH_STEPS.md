# 🚀 GitHub 푸시 단계별 가이드

## ✅ 1단계: 현재 상태 확인 (완료됨)
- `.env` 파일이 Git 추적에서 제거되었습니다 ✅
- 새로운 배포 파일들이 준비되었습니다 ✅

## 📋 2단계: 변경사항 추가

다음 명령어를 실행하세요:

```bash
# 모든 변경사항 추가 (민감한 파일은 자동 제외됨)
git add .

# 또는 개별적으로 추가하려면:
git add app.py fashn_tryon.py models.py
git add requirements.txt render.yaml README.md env.example
git add .gitignore
git add static/ templates/
```

## 🔍 3단계: 스테이징된 파일 확인 (중요!)

```bash
git status
```

**확인사항:**
- ✅ `.env` 파일이 목록에 없어야 함
- ✅ `instance/db.sqlite3` 파일이 목록에 없어야 함 (이미 추적 중이면 무시됨)
- ✅ `__pycache__/` 폴더가 목록에 없어야 함
- ✅ `env.example` 파일은 있어야 함 (템플릿)

## 💾 4단계: 커밋

```bash
git commit -m "Render 배포 환경 설정 및 보안 강화

- API 키를 환경 변수로 변경 (GEMINI_API_KEY, FASHN_API_KEY)
- PostgreSQL/SQLite 자동 전환 설정
- Render 배포 설정 파일 추가 (render.yaml)
- requirements.txt 추가
- README.md 및 배포 가이드 추가
- .env 파일 Git 추적 제거 (보안 강화)"
```

## 🌐 5단계: 원격 저장소 확인

```bash
# 현재 원격 저장소 확인
git remote -v
```

## 📤 6단계: 푸시

```bash
# 현재 브랜치 확인
git branch

# 푸시 (현재 브랜치: and)
git push origin and

# 또는 메인 브랜치인 경우
git push origin main
```

## ⚠️ 주의사항

1. **API 키 확인**: 코드에 하드코딩된 API 키가 없는지 확인하세요
2. **환경 변수**: Render 대시보드에서 환경 변수를 설정해야 합니다
3. **데이터베이스**: 배포 후 `python db_init.py`로 초기화하세요

## 🎯 한 번에 실행하는 명령어

```bash
# 1. 상태 확인
git status

# 2. 모든 변경사항 추가
git add .

# 3. 스테이징된 파일 확인 (민감한 파일 없는지)
git status

# 4. 커밋
git commit -m "Render 배포 환경 설정 및 보안 강화"

# 5. 푸시
git push origin and
```


